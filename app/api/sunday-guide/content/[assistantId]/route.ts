import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../../../utils/dynamodb';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

const SUNDAY_GUIDE_TABLE = process.env.SUNDAY_GUIDE_TABLE_NAME || 'SundayGuide';

export async function GET(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    console.log('[DEBUG] 使用表名:', SUNDAY_GUIDE_TABLE);
    
    const { assistantId } = params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');  // 获取内容类型

    const docClient = await createDynamoDBClient();
    
    const command = new ScanCommand({
      TableName: SUNDAY_GUIDE_TABLE,
      FilterExpression: 'assistantId = :assistantId',
      ExpressionAttributeValues: {
        ':assistantId': assistantId
      }
    });

    const response = await docClient.send(command);
    const item = response.Items?.[0];

    if (!item) {
      return NextResponse.json({ error: '未找到内容' }, { status: 404 });
    }

    // 根据类型返回对应内容
    switch (type) {
      case 'summary':
        return NextResponse.json({ content: item.sermon_summary });
      case 'text':
        return NextResponse.json({ content: item.transcription });
      case 'devotional':
        return NextResponse.json({ content: item.daily_devotion });
      case 'bible':
        return NextResponse.json({ content: item.bible_study_guide });
      default:
        return NextResponse.json({ error: '无效的内容类型' }, { status: 400 });
    }
  } catch (error) {
    console.error('获取内容失败:', error);
    return NextResponse.json(
      { error: '获取内容失败' },
      { status: 500 }
    );
  }
} 