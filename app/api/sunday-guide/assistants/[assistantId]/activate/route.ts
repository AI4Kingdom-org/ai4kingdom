import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../../../../utils/dynamodb';
import { UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export async function POST(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    const { assistantId } = params;
    console.log('[DEBUG] 开始激活助手:', assistantId);
    
    const docClient = await createDynamoDBClient();

    // 获取助手记录
    const getCommand = new ScanCommand({
      TableName: 'SundayGuide',
      FilterExpression: 'assistantId = :assistantId',
      ExpressionAttributeValues: {
        ':assistantId': assistantId
      }
    });

    const { Items } = await docClient.send(getCommand);
    console.log('[DEBUG] 找到助手记录:', {
      assistantId,
      found: !!Items?.length,
      record: Items?.[0]
    });

    if (!Items || Items.length === 0) {
      return NextResponse.json(
        { error: '助手不存在' },
        { status: 404 }
      );
    }

    // 更新助手状态为活跃
    const updateCommand = new UpdateCommand({
      TableName: 'SundayGuide',
      Key: {
        assistantId: assistantId,
        Timestamp: Items[0].Timestamp
      },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'active'
      }
    });

    await docClient.send(updateCommand);
    console.log('[DEBUG] 助手状态更新成功:', {
      assistantId,
      status: 'active'
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ERROR] 激活助手失败:', error);
    return NextResponse.json(
      { error: '激活助手失败' },
      { status: 500 }
    );
  }
} 