import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new DynamoDBClient({}); 
const ddbDocClient = DynamoDBDocumentClient.from(client); 
const cognitoClient = new CognitoIdentityProviderClient({});

const TABLE_NAME = 'Posts'; 
const USER_POOL_ID = "us-east-1_H0an9OqvV"; // Your Cognito User Pool ID

// Helper function to fetch author info from Cognito
async function fetchAuthorInfo(authorId) {
    if (!authorId) return null;
    
    try {
        const params = {
            UserPoolId: USER_POOL_ID,
            Username: authorId
        };
        
        const result = await cognitoClient.send(new AdminGetUserCommand(params));
        
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
        
        return {
            preferred_username: attributes.preferred_username || result.Username,
            profile_picture_key: attributes.profile_picture_key,
            username: result.Username
        };
    } catch (error) {
        console.error(`Error fetching author info for ${authorId}:`, error);
        // Return null if user not found or other error - don't fail the whole request
        return null;
    }
}

export const handler = async (event) => {
    // API Gateway places path parameters (e.g., /posts/{id}) into event.pathParameters
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
        Key: {
            postId: postId // Look up by the Partition Key
        }
    };

    try {
        const data = await ddbDocClient.send(new GetCommand(params));
        
        if (!data.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Post not found" }),
                headers: { 
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization"
                }
            };
        }
        
        // Fetch author information if authorId exists
        let authorInfo = null;
        if (data.Item.authorId) {
            authorInfo = await fetchAuthorInfo(data.Item.authorId);
        }
        
        // Add author information to the post object
        const postWithAuthor = {
            ...data.Item,
            author: authorInfo ? {
                preferred_username: authorInfo.preferred_username,
                username: authorInfo.username,
                profile_picture_key: authorInfo.profile_picture_key
            } : null,
            // Also add flat fields for backward compatibility
            authorUsername: authorInfo?.preferred_username || authorInfo?.username,
            authorProfilePictureKey: authorInfo?.profile_picture_key
        };
        
        return {
            statusCode: 200, 
            body: JSON.stringify(postWithAuthor),
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            }
        };
    } catch (error) {
        console.error("DynamoDB Get Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error", error: error.message }),
            headers: { 
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            }
        };
    }
};

