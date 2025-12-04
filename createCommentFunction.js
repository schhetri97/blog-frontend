import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new DynamoDBClient({}); 
const ddbDocClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});
const cognitoClient = new CognitoIdentityProviderClient({});

const TABLE_NAME = 'Comments'; 
const USER_POOL_ID = "us-east-1_H0an9OqvV"; 

export const handler = async (event) => {
    const postId = event.pathParameters ? event.pathParameters.id : null;

    let body;
    
    // Check for authenticated user claims (required by API Gateway Authorizer)
    const userClaims = event.requestContext.authorizer?.claims;
    if (!userClaims) {
        return { 
            statusCode: 401, 
            body: JSON.stringify({ message: "Unauthorized - Missing Cognito Claims" }), 
            headers: { "Access-Control-Allow-Origin": "*" } 
        };
    }

    const userId = userClaims.sub; // The unique ID (UUID) from Cognito
    const username = userClaims['cognito:username'] || userClaims.username || userClaims.email;

    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ message: "Invalid JSON format" }), 
            headers: { "Access-Control-Allow-Origin": "*" } 
        };
    }

    // Fetch author info from Cognito to get preferred_username and profile_picture_key
    let authorInfo = null;
    try {
        const cognitoParams = {
            UserPoolId: USER_POOL_ID,
            Username: username || userId // Try username first, fallback to userId (sub)
        };
        
        const cognitoResult = await cognitoClient.send(new AdminGetUserCommand(cognitoParams));
        
        // Extract attributes
        const attributes = {};
        if (cognitoResult.UserAttributes && Array.isArray(cognitoResult.UserAttributes)) {
            cognitoResult.UserAttributes.forEach(attr => {
                if (attr.Name && attr.Value !== undefined) {
                    const key = attr.Name.startsWith('custom:') 
                        ? attr.Name.replace('custom:', '') 
                        : attr.Name;
                    attributes[key] = attr.Value;
                }
            });
        }
        
        authorInfo = {
            preferred_username: attributes.preferred_username || cognitoResult.Username,
            profile_picture_key: attributes.profile_picture_key,
            username: cognitoResult.Username
        };
    } catch (cognitoError) {
        console.warn("Failed to fetch author info from Cognito for comment, continuing without it:", cognitoError.message);
        // Continue without author info - comments will still work
    }

    const commentId = `comment-${Date.now()}`; // Simple unique identifier

    const params = {
        TableName: TABLE_NAME,
        Item: {
            postId: postId,
            commentId: commentId,
            userId: userId, // The unique ID (sub) of the user from Cognito
            username: username || userId, // Store username for easier lookup
            text: body.text,
            timestamp: new Date().toISOString(),
            
            // Store author info if we fetched it (optional, but helps with performance)
            ...(authorInfo && {
                author: {
                    preferred_username: authorInfo.preferred_username,
                    username: authorInfo.username,
                    profile_picture_key: authorInfo.profile_picture_key
                },
                authorUsername: authorInfo.preferred_username || authorInfo.username,
                authorProfilePictureKey: authorInfo.profile_picture_key
            })
        }
    };

    try {
        await ddbDocClient.send(new PutCommand(params));
        
        return {
            statusCode: 201, 
            body: JSON.stringify({ message: "Comment created", commentId: commentId }),
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            }
        };
    } catch (error) {
        console.error("DynamoDB Error:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ message: "Internal Server Error", error: error.message }), 
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization"
            } 
        };
    }
};

