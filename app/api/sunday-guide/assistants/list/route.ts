import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../../../utils/dynamodb';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

const SUNDAY_GUIDE_TABLE = process.env.NEXT_PUBLIC_SUNDAY_GUIDE_TABLE || 'SundayGuide';

interface AssistantListItem {
  assistantId: string;
  type: string;
  status: string;
  Timestamp: string;
  youtubeUrl?: string;
  vectorStoreId?: string;
}

export async function GET() {
  try {
    console.log('[DEBUG] 開始檢索助手列表');
    
    const docClient = await createDynamoDBClient();
    const command = new ScanCommand({
      TableName: SUNDAY_GUIDE_TABLE,
      ProjectionExpression: 'assistantId, #type, #status, #ts, youtubeUrl, vectorStoreId',
      ExpressionAttributeNames: {
        '#type': 'type',
        '#status': 'status',
        '#ts': 'Timestamp'
      }
    });

    const response = await docClient.send(command);

    if (!response.Items) {
      console.log('[DEBUG] 未找到任何助手資料');
      return NextResponse.json({ 
        assistants: [],
        total: 0
      });
    }

    // 按時間戳排序並格式化輸出
    const sortedAssistants = response.Items
      .sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime())
      .map((item) => ({
        assistantId: item.assistantId,
        type: item.type || '未知',
        status: item.status || '未知',
        createTime: new Date(item.Timestamp).toLocaleString(),
        youtubeUrl: item.youtubeUrl,
        vectorStoreId: item.vectorStoreId
      }));

    console.log('[DEBUG] 檢索到的助手數量:', sortedAssistants.length);

    return NextResponse.json({
      assistants: sortedAssistants,
      total: sortedAssistants.length,
      _debug: {
        tableName: SUNDAY_GUIDE_TABLE,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[ERROR] 檢索助手列表失敗:', error);
    return NextResponse.json(
      { 
        error: '檢索助手列表失敗',
        details: error instanceof Error ? error.message : '未知錯誤',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}