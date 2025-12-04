import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminGetUserCommand, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new DynamoDBClient({}); 
const ddbDocClient = DynamoDBDocumentClient.from(client); 
const cognitoClient = new CognitoIdentityProviderClient({});

const TABLE_NAME = 'Comments'; 
const USER_POOL_ID = "us-east-1_H0an9OqvV"; // Your Cognito User Pool ID

// Helper function to fetch author info from Cognito
// userId is the Cognito sub (UUID), username is the Cognito username (optional)
async function fetchAuthorInfo(userId, username = null) {
    if (!userId) {
        console.log('fetchAuthorInfo: No userId provided');
        return null;
    }
    
    // Try username first if available (more reliable)
    if (username) {
        try {
            console.log(`fetchAuthorInfo: Attempting to fetch user by username: ${username}`);
            const params = {
                UserPoolId: USER_POOL_ID,
                Username: username
            };
            
            const result = await cognitoClient.send(new AdminGetUserCommand(params));
            console.log(`fetchAuthorInfo: Successfully fetched user by username ${username}`, {
                username: result.Username,
                userStatus: result.UserStatus,
                attributesCount: result.UserAttributes?.length || 0
            });
            
            // Extract preferred_username and profile_picture_key from user attributes
            const attributes = {};
            if (result.UserAttributes && Array.isArray(result.UserAttributes)) {
                result.UserAttributes.forEach(attr => {
                    if (attr.Name && attr.Value !== undefined) {
                        const key = attr.Name.startsWith('custom:') 
                            ? attr.Name.replace('custom:', '') 
                            : attr.Name;
                        attributes[key] = attr.Value;
                    }
                });
            }
            
            const authorInfo = {
                preferred_username: attributes.preferred_username || result.Username,
                profile_picture_key: attributes.profile_picture_key,
                username: result.Username
            };
            
            console.log(`fetchAuthorInfo: Extracted author info for username ${username}:`, authorInfo);
            return authorInfo;
        } catch (error) {
            console.log(`fetchAuthorInfo: Failed to fetch by username ${username}:`, error.message);
        }
    }
    
    // If username didn't work, try to find user by sub attribute using ListUsersCommand
    // The userId is the Cognito sub (UUID), which is different from the username
    try {
        console.log(`fetchAuthorInfo: Attempting to find user by sub (userId): ${userId}`);
        const listParams = {
            UserPoolId: USER_POOL_ID,
            Filter: `sub = "${userId}"`,
            Limit: 1
        };
        
        const listResult = await cognitoClient.send(new ListUsersCommand(listParams));
        
        if (listResult.Users && listResult.Users.length > 0) {
            const user = listResult.Users[0];
            console.log(`fetchAuthorInfo: Found user by sub ${userId}, username: ${user.Username}`);
            
            // Now get full user details using the username
            const getUserParams = {
                UserPoolId: USER_POOL_ID,
                Username: user.Username
            };
            
            const result = await cognitoClient.send(new AdminGetUserCommand(getUserParams));
            
            // Extract preferred_username and profile_picture_key from user attributes
            const attributes = {};
            if (result.UserAttributes && Array.isArray(result.UserAttributes)) {
                result.UserAttributes.forEach(attr => {
                    if (attr.Name && attr.Value !== undefined) {
                        const key = attr.Name.startsWith('custom:') 
                            ? attr.Name.replace('custom:', '') 
                            : attr.Name;
                        attributes[key] = attr.Value;
                    }
                });
            }
            
            const authorInfo = {
                preferred_username: attributes.preferred_username || result.Username,
                profile_picture_key: attributes.profile_picture_key,
                username: result.Username
            };
            
            console.log(`fetchAuthorInfo: Extracted author info for sub ${userId}:`, authorInfo);
            return authorInfo;
        } else {
            console.log(`fetchAuthorInfo: No user found with sub ${userId}`);
        }
    } catch (error) {
        console.error(`fetchAuthorInfo: Error finding user by sub ${userId}:`, error.message);
    }
    
    // If all attempts failed
    console.error(`Error fetching author info for userId ${userId} (username: ${username}): All attempts failed`);
    return null;
}

export const handler = async (event) => {
    // Handle OPTIONS preflight request
    if (event.requestContext?.httpMethod === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            },
            body: ''
        };
    }

    // Extracts postId from the /posts/{id}/comments path parameter
    const postId = event.pathParameters ? event.pathParameters.id : null;

    if (!postId) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ message: "Missing postId parameter" }), 
            headers: { 
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            } 
        };
    }

    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "#pid = :postIdValue", // Query uses KeyConditionExpression
        ExpressionAttributeNames: {
            "#pid": "postId"
        },
        ExpressionAttributeValues: {
            ":postIdValue": postId
        },
        ScanIndexForward: false // Optional: Display newest comments first
    };

    try {
        const data = await ddbDocClient.send(new QueryCommand(params));
        
        if (!data.Items || data.Items.length === 0) {
            return {
                statusCode: 200, 
                body: JSON.stringify([]), 
                headers: { 
                    "Content-Type": "application/json", 
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization"
                }
            };
        }
        
        // Collect unique user info to fetch (userId and username pairs)
        const userMap = new Map();
        data.Items.forEach(comment => {
            if (comment.userId) {
                // Use userId as key, store both userId and username
                if (!userMap.has(comment.userId)) {
                    userMap.set(comment.userId, {
                        userId: comment.userId,
                        username: comment.username || null
                    });
                }
            }
        });
        
        const usersToFetch = Array.from(userMap.values());
        console.log(`Found ${usersToFetch.length} unique users to fetch for comments:`, usersToFetch);
        
        // Fetch all author info in parallel
        const authorInfoPromises = usersToFetch.map(({ userId, username }) => 
            fetchAuthorInfo(userId, username).then(info => ({ userId, info }))
        );
        const authorInfoResults = await Promise.all(authorInfoPromises);
        
        console.log('Author info results for comments:', authorInfoResults);
        
        // Create a map for quick lookup: userId -> authorInfo
        const authorInfoMap = new Map();
        authorInfoResults.forEach(({ userId, info }) => {
            if (info) {
                authorInfoMap.set(userId, info);
                console.log(`Mapped userId ${userId} to author info:`, info);
            } else {
                console.log(`No author info found for userId: ${userId}`);
            }
        });
        
        // Enrich each comment with author information
        const commentsWithAuthors = data.Items.map(comment => {
            // If comment already has author info stored, use that first
            if (comment.author && comment.authorUsername) {
                console.log(`Comment ${comment.commentId} already has author info stored`);
                return comment;
            }
            
            // Otherwise, fetch from the map
            const authorInfo = comment.userId ? authorInfoMap.get(comment.userId) : null;
            
            const enrichedComment = {
                ...comment,
                author: authorInfo ? {
                    preferred_username: authorInfo.preferred_username,
                    username: authorInfo.username,
                    profile_picture_key: authorInfo.profile_picture_key
                } : (comment.author || null),
                // Also add flat fields for backward compatibility
                // Prioritize preferred_username over username
                authorUsername: authorInfo?.preferred_username || comment.authorUsername || authorInfo?.username || comment.username,
                authorProfilePictureKey: authorInfo?.profile_picture_key || comment.authorProfilePictureKey
            };
            
            console.log(`Enriched comment ${comment.commentId} with author info:`, {
                userId: comment.userId,
                authorUsername: enrichedComment.authorUsername,
                authorProfilePictureKey: enrichedComment.authorProfilePictureKey,
                author: enrichedComment.author
            });
            
            return enrichedComment;
        });
        
        return {
            statusCode: 200, 
            body: JSON.stringify(commentsWithAuthors), 
            headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            }
        };
    } catch (error) {
        console.error("DynamoDB Query Error:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ message: "Internal Server Error", error: error.message }), 
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            } 
        };
    }
};

