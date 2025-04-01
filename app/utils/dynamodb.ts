import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";

// 配置常量
export const getDynamoDBConfig = () => ({
  region: process.env.NEXT_PUBLIC_REGION || 'us-east-2',
  identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID!,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY!
  },
  tables: {
    sundayGuide: process.env.NEXT_PUBLIC_SUNDAY_GUIDE_TABLE || 'SundayGuide',
    chatHistory: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME || 'ChatHistory'
  }
});

export async function createDynamoDBClient() {
  try {
    const config = getDynamoDBConfig();
    console.log('[DEBUG] DynamoDB初始化配置:', {
      region: config.region,
      hasAccessKey: !!config.credentials.accessKeyId,
      hasSecretKey: !!config.credentials.secretAccessKey
    });

    const client = new DynamoDBClient({
      region: config.region,
      credentials: config.credentials
    });

    return DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  } catch (error) {
    console.error('[ERROR] DynamoDB客户端创建失败:', error);
    throw error;
  }
}

// 添加更新用户活动线程的函数
export async function updateUserActiveThread(userId: string, threadId: string, type: string = 'general') {
  try {
    console.log('[DEBUG] 开始创建线程记录:', { userId, threadId, type });
    const docClient = await createDynamoDBClient();
    await docClient.send(new PutCommand({
      TableName: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME,
      Item: {
        UserId: String(userId),
        Type: type,
        threadId: threadId,
        Timestamp: new Date().toISOString()
      }
    }));
    console.log('[DEBUG] 线程记录创建成功:', { threadId, type });
  } catch (error) {
    console.error('[ERROR] 更新用户活动线程失败:', error);
    throw error;
  }
}

// 添加环境检查日志
console.log('[DEBUG] 部署环境检查:', {
  NODE_ENV: process.env.NODE_ENV,
  REGION: process.env.NEXT_PUBLIC_REGION,
  TABLE_NAME: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME,
  hasAccessKey: !!process.env.NEXT_PUBLIC_ACCESS_KEY_ID,
  hasSecretKey: !!process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY
});