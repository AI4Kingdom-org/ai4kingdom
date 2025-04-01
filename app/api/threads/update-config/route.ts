import { NextResponse } from 'next/server';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from '../../../utils/dynamodb';

export async function POST(request: Request) {
  try {
    const { userId, type, assistantId, vectorStoreId } = await request.json();

    const docClient = DynamoDBDocumentClient.from(await createDynamoDBClient());
    
    const command = new UpdateCommand({
      TableName: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME,
      Key: {
        UserId: String(userId),
        Type: type
      },
      UpdateExpression: 'SET AssistantId = :aid, VectorStoreId = :vid',
      ExpressionAttributeValues: {
        ':aid': assistantId,
        ':vid': vectorStoreId
      }
    });

    await docClient.send(command);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ERROR] 更新线程配置失败:', error);
    return NextResponse.json({ error: '更新配置失败' }, { status: 500 });
  }
} 