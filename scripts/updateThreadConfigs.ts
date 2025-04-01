import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ChatType, CHAT_TYPE_CONFIGS } from '../app/config/chatTypes';

async function updateThreadConfigs() {
    const client = new DynamoDBClient({/* your config */});
    const docClient = DynamoDBDocumentClient.from(client);

    const { Items = [] } = await docClient.send(new ScanCommand({
        TableName: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME
    }));

    for (const item of Items) {
        const type = item.Type as ChatType;
        const typeConfig = CHAT_TYPE_CONFIGS[type];
        if (!typeConfig) continue;

        await docClient.send(new UpdateCommand({
            TableName: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME,
            Key: {
                UserId: item.UserId,
                Timestamp: item.Timestamp
            },
            UpdateExpression: 'SET assistantId = :aid, vectorStoreId = :vid',
            ExpressionAttributeValues: {
                ':aid': typeConfig.assistantId,
                ':vid': typeConfig.vectorStoreId
            }
        }));

        console.log(`Updated thread ${item.threadId} with type ${item.Type}`);
    }
}

updateThreadConfigs().catch(console.error); 