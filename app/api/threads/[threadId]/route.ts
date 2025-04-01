import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { createDynamoDBClient } from '../../../utils/dynamodb';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function DELETE(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const userId = request.headers.get('user-id');
    const threadId = params.threadId;
    
    console.log('[DEBUG] 开始删除对话:', { userId, threadId });

    if (!userId) {
      throw new Error('未提供用户ID');
    }

    const docClient = await createDynamoDBClient();

    // 1. 查询获取对应的 Timestamp
    const { Items } = await docClient.send(new QueryCommand({
      TableName: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME,
      KeyConditionExpression: 'UserId = :userId',
      FilterExpression: 'threadId = :threadId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':threadId': threadId
      }
    }));

    if (!Items || Items.length === 0) {
      throw new Error('找不到对应的对话记录');
    }

    // 2. 删除 OpenAI thread
    try {
      await openai.beta.threads.del(threadId);
    } catch (error) {
      console.error('[ERROR] OpenAI thread 删除失败:', error);
    }

    // 3. 使用正确的主键组合删除 DynamoDB 记录
    for (const item of Items) {
      await docClient.send(new DeleteCommand({
        TableName: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME,
        Key: {
          UserId: userId,        // Partition key
          Timestamp: item.Timestamp  // Sort key
        }
      }));
    }
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[ERROR] 删除对话失败:', error);
    return NextResponse.json(
      { error: '删除对话失败' },
      { status: 500 }
    );
  }
} 