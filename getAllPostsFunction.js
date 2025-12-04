import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminGetUserCommand, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new DynamoDBClient({}); 
const ddbDocClient = DynamoDBDocumentClient.from(client); 
const cognitoClient = new CognitoIdentityProviderClient({});

const TABLE_NAME = 'Posts'; 
const USER_POOL_ID = "us-east-1_H0an9OqvV"; // Your Cognito User Pool ID

// Helper function to fetch author info from Cognito
// authorId is the Cognito sub (UUID), username is the Cognito username (optional)
async function fetchAuthorInfo(authorId, username = null) {
    if (!authorId) {
        console.log('fetchAuthorInfo: No authorId provided');
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
    // The authorId is the Cognito sub (UUID), which is different from the username
    try {
        console.log(`fetchAuthorInfo: Attempting to find user by sub (authorId): ${authorId}`);
        const listParams = {
            UserPoolId: USER_POOL_ID,
            Filter: `sub = "${authorId}"`,
            Limit: 1
        };
        
        const listResult = await cognitoClient.send(new ListUsersCommand(listParams));
        
        if (listResult.Users && listResult.Users.length > 0) {
            const user = listResult.Users[0];
            console.log(`fetchAuthorInfo: Found user by sub ${authorId}, username: ${user.Username}`);
            
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
            
            console.log(`fetchAuthorInfo: Extracted author info for sub ${authorId}:`, authorInfo);
            return authorInfo;
        } else {
            console.log(`fetchAuthorInfo: No user found with sub ${authorId}`);
        }
    } catch (error) {
        console.error(`fetchAuthorInfo: Error finding user by sub ${authorId}:`, error.message);
    }
    
    // If all attempts failed
    console.error(`Error fetching author info for authorId ${authorId} (username: ${username}): All attempts failed`);
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

    const params = {
        TableName: TABLE_NAME
    };

    try {
        // Scan the entire table
        const data = await ddbDocClient.send(new ScanCommand(params));
        
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
        
        // Collect unique author info to fetch (authorId and username pairs)
        const authorMap = new Map();
        data.Items.forEach(post => {
            if (post.authorId) {
                // Use authorId as key, store both authorId and username
                // Check multiple possible fields for username
                const username = post.authorUsername || post.username || null;
                if (!authorMap.has(post.authorId)) {
                    authorMap.set(post.authorId, {
                        authorId: post.authorId,
                        username: username
                    });
                    console.log(`Collecting author info for post ${post.postId}: authorId=${post.authorId}, username=${username}`);
                }
            }
        });
        
        const authorsToFetch = Array.from(authorMap.values());
        console.log(`Found ${authorsToFetch.length} unique authors to fetch:`, authorsToFetch);
        
        // Fetch all author info in parallel
        const authorInfoPromises = authorsToFetch.map(({ authorId, username }) => 
            fetchAuthorInfo(authorId, username).then(info => ({ authorId, info }))
        );
        const authorInfoResults = await Promise.all(authorInfoPromises);
        
        console.log('Author info results:', authorInfoResults);
        
        // Create a map for quick lookup: authorId -> authorInfo
        const authorInfoMap = new Map();
        authorInfoResults.forEach(({ authorId, info }) => {
            if (info) {
                authorInfoMap.set(authorId, info);
                console.log(`Mapped authorId ${authorId} to author info:`, info);
            } else {
                console.log(`No author info found for authorId: ${authorId}`);
            }
        });
        
        // Enrich each post with author information
        const postsWithAuthors = data.Items.map(post => {
            // If post already has author info stored, use that first
            if (post.author && post.authorUsername) {
                console.log(`Post ${post.postId} already has author info stored`);
                return post;
            }
            
            // Otherwise, fetch from the map
            const authorInfo = post.authorId ? authorInfoMap.get(post.authorId) : null;
            
            // Fallback: if we can't fetch author info but have a stored username, use that
            const fallbackUsername = post.username || post.authorUsername;
            
            const enrichedPost = {
                ...post,
                author: authorInfo ? {
                    preferred_username: authorInfo.preferred_username,
                    username: authorInfo.username,
                    profile_picture_key: authorInfo.profile_picture_key
                } : (post.author || (fallbackUsername ? {
                    preferred_username: fallbackUsername,
                    username: fallbackUsername,
                    profile_picture_key: null
                } : null)),
                // Also add flat fields for backward compatibility
                // Prioritize preferred_username over username
                authorUsername: authorInfo?.preferred_username || post.authorUsername || authorInfo?.username || fallbackUsername,
                authorProfilePictureKey: authorInfo?.profile_picture_key || post.authorProfilePictureKey
            };
            
            console.log(`Enriched post ${post.postId} with author info:`, {
                authorId: post.authorId,
                storedUsername: fallbackUsername,
                authorInfoFound: !!authorInfo,
                authorUsername: enrichedPost.authorUsername,
                authorProfilePictureKey: enrichedPost.authorProfilePictureKey,
                author: enrichedPost.author
            });
            
            return enrichedPost;
        });
        
        return {
            statusCode: 200, 
            body: JSON.stringify(postsWithAuthors),
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            }
        };
    } catch (error) {
        console.error("DynamoDB Scan Error:", error);
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

