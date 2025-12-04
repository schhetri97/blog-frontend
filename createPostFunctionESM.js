import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

// 1. Initialize the clients globally outside the handler for performance
const client = new DynamoDBClient({}); 
const ddbDocClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        // Removes undefined values from the item before writing to DynamoDB, 
        // which prevents DynamoDB from throwing an error.
        removeUndefinedValues: true,
    },
});
const cognitoClient = new CognitoIdentityProviderClient({});

// IMPORTANT: Replace with your actual DynamoDB table name
const TABLE_NAME = process.env.TABLE_NAME || 'Posts'; 
const USER_POOL_ID = "us-east-1_H0an9OqvV"; // Your Cognito User Pool ID

export const handler = async (event) => {
    
    // 1. Extract Author ID from the Cognito Authorizer claims
    // This assumes the API Gateway method is secured with a Cognito User Pool Authorizer.
    const authorId = event.requestContext?.authorizer?.claims?.sub;
    const username = event.requestContext?.authorizer?.claims?.['cognito:username'] || event.requestContext?.authorizer?.claims?.username;

    if (!authorId) {
        // This indicates the request did not pass through the Cognito Authorizer,
        // or the Authorizer failed to inject claims.
        return {
            statusCode: 403,
            body: JSON.stringify({ message: "Forbidden: Author ID not found in context (Authorization check failed)." }),
            headers: { "Access-Control-Allow-Origin": "*" }
        };
    }

    // Fetch author info from Cognito to get preferred_username and profile_picture_key
    let authorInfo = null;
    try {
        const cognitoParams = {
            UserPoolId: USER_POOL_ID,
            Username: username || authorId // Try username first, fallback to authorId (sub)
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
        console.warn("Failed to fetch author info from Cognito, continuing without it:", cognitoError.message);
        // Continue without author info - the getAllPostsFunction will try to fetch it later
    }
    
    const bodyString = event.body;
    let body;

    // --- 2. Parse and Validate Body ---
    try {
        // Handle API Gateway passing the body as a JSON string
        body = typeof bodyString === 'string' ? JSON.parse(bodyString) : bodyString;

        // Basic validation for essential fields
        if (!body || !body.title || !body.content) {
             return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing required fields: title or content." }),
                headers: { "Access-Control-Allow-Origin": "*" }
            };
        }

    } catch (e) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Invalid JSON format in request body." }),
            headers: { "Access-Control-Allow-Origin": "*" }
        };
    }
    
    const postId = `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const postType = body.postType || 'text';
    
    // --- 3. Determine Media Data Structure ---
    // Extract mediaData as a whole, defaulting to an empty object if not provided
    let mediaData = body.mediaData || {}; 

    // Specific validation for rich media types
    if (postType === 'image') {
        if (!mediaData.imageUrl) {
            return { statusCode: 400, body: JSON.stringify({ message: "Image post requires imageUrl in mediaData." }), headers: { "Access-Control-Allow-Origin": "*" } };
        }
    } else if (postType === 'video') {
        if (!mediaData.youtubeId) {
            return { statusCode: 400, body: JSON.stringify({ message: "Video post requires youtubeId in mediaData." }), headers: { "Access-Control-Allow-Origin": "*" } };
        }
    }
    
    // --- 4. Final DynamoDB Parameters ---
    const params = {
        TableName: TABLE_NAME,
        Item: {
            postId: postId,
            title: body.title,
            content: body.content, 
            
            // RICH MEDIA FIELDS
            postType: postType,
            mediaData: mediaData, 
            
            // ESSENTIAL FIELDS (Now dynamically sourced)
            authorId: authorId, // The Cognito sub (UUID)
            authorUsername: username || authorId, // Store the username for easier lookup
            timestamp: new Date().toISOString(),
            
            // Store author info if we fetched it (optional, but helps with performance)
            ...(authorInfo && {
                author: {
                    preferred_username: authorInfo.preferred_username,
                    username: authorInfo.username,
                    profile_picture_key: authorInfo.profile_picture_key
                },
                authorProfilePictureKey: authorInfo.profile_picture_key
            })
        }
    };

    // --- 5. Send PutCommand ---
    try {
        await ddbDocClient.send(new PutCommand(params));
        
        return {
            statusCode: 201, 
            body: JSON.stringify({ 
                message: "Post created successfully", 
                postId: postId 
            }),
            headers: {
                "Content-Type": "application/json",
                // Required for CORS setup: replace '*' with specific domain if possible
                "Access-Control-Allow-Origin": "*" 
            }
        };
    } catch (error) {
        console.error("DynamoDB Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error", error: error.message }),
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        };
    }
};

