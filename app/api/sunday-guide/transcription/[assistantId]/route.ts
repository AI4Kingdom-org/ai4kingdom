import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../../../utils/dynamodb';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export async function GET(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    const { assistantId } = params;
    const docClient = await createDynamoDBClient();
    
    const command = new ScanCommand({
      TableName: 'SundayGuide',
      FilterExpression: 'assistantId = :assistantId',
      ExpressionAttributeValues: {
        ':assistantId': assistantId
      }
    });

    const response = await docClient.send(command);
    const item = response.Items?.[0];

    if (!item?.transcription) {
      return NextResponse.json({ error: '未找到转录文本' }, { status: 404 });
    }

    return NextResponse.json({ transcription: item.transcription });
  } catch (error) {
    return NextResponse.json(
      { error: '获取转录文本失败' },
      { status: 500 }
    );
  }
} 