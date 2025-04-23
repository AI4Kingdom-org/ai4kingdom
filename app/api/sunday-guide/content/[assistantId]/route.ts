import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../../../utils/dynamodb';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

const SUNDAY_GUIDE_TABLE = process.env.NEXT_PUBLIC_SUNDAY_GUIDE_TABLE || 'SundayGuide';

export async function GET(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    const { assistantId } = params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');  // 獲取內容類型

    const docClient = await createDynamoDBClient();
    
    const command = new ScanCommand({
      TableName: SUNDAY_GUIDE_TABLE,
      FilterExpression: 'assistantId = :assistantId',
      ExpressionAttributeValues: {
        ':assistantId': assistantId
      }
    });

    const response = await docClient.send(command);
    const items = response.Items;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: '未找到內容' }, { status: 404 });
    }

    // 獲取最新的文件內容
    const latestItem = items.sort((a, b) => 
      new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()
    )[0];

    // 根據類型返回對應內容
    let content: string | null = null;
    switch (type) {
      case 'summary':
        content = latestItem.summary;
        break;
      case 'text':
        content = latestItem.fullText;
        break;
      case 'devotional':
        content = latestItem.devotional;
        break;
      case 'bible':
        content = latestItem.bibleStudy;
        break;
      default:
        return NextResponse.json({ error: '無效的內容類型' }, { status: 400 });
    }

    if (!content) {
      return NextResponse.json({ error: '未找到請求的內容類型' }, { status: 404 });
    }

    return NextResponse.json({ content });

  } catch (error) {
    console.error('獲取內容失敗:', error);
    return NextResponse.json(
      { error: '獲取內容失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    );
  }
}