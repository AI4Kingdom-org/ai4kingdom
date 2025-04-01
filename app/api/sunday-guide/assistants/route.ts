import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../../utils/dynamodb';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import OpenAI from 'openai';

const openai = new OpenAI();
const SUNDAY_GUIDE_TABLE = process.env.NEXT_PUBLIC_SUNDAY_GUIDE_TABLE || 'SundayGuide';
const CHAT_HISTORY_TABLE = process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME || 'ChatHistory';

console.log('[DEBUG] 表名配置:', {
  sundayGuideTable: SUNDAY_GUIDE_TABLE,
  chatHistoryTable: CHAT_HISTORY_TABLE
});

export async function GET(request: Request) {
  try {
    console.log('[ENV CHECK] 环境变量:', {
      sundayGuideTable: process.env.SUNDAY_GUIDE_TABLE_NAME,
      nodeEnv: process.env.NODE_ENV,
      region: process.env.NEXT_PUBLIC_AWS_REGION
    });

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // 'active' 或 undefined
    
    console.log('[DEBUG] GET 请求开始:', {
      mode,
      环境: process.env.NODE_ENV,
      region: process.env.NEXT_PUBLIC_REGION,
      tableName: SUNDAY_GUIDE_TABLE,
      hasIdentityPool: !!process.env.NEXT_PUBLIC_IDENTITY_POOL_ID,
      hasUserPool: !!process.env.NEXT_PUBLIC_USER_POOL_ID
    });

    const docClient = await createDynamoDBClient();
    console.log('[DEBUG] DynamoDB 客户端创建成功');

    // 使用 Scan 操作，只过滤 status
    const command = new ScanCommand({
      TableName: SUNDAY_GUIDE_TABLE,
      ...(mode === 'active' ? {
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'active'
        }
      } : {})
    });

    console.log('[DEBUG] 执行 DynamoDB 查询:', {
      tableName: command.input.TableName,
      filterExpression: command.input.FilterExpression,
      attributeValues: command.input.ExpressionAttributeValues
    });

    const response = await docClient.send(command);
    console.log('[DEBUG] DynamoDB 响应:', {
      itemCount: response.Items?.length,
      metadata: response.$metadata,
      hasItems: !!response.Items
    });

    if (!response.Items) {
      return NextResponse.json({ 
        error: '未找到助手数据',
        tableName: SUNDAY_GUIDE_TABLE 
      }, { status: 404 });
    }

    // 按时间戳排序
    const sortedItems = response.Items.sort((a, b) => 
      b.Timestamp.localeCompare(a.Timestamp)
    );

    if (mode === 'active') {
      // 用户页面模式：只返回活跃助手
      const activeAssistant = sortedItems[0]; // 获取最新的活跃助手
      if (!activeAssistant) {
        console.log('[DEBUG] 未找到活跃助手');
        return NextResponse.json({ error: '未找到活跃助手' }, { status: 404 });
      }
      return NextResponse.json({
        assistant: {
          assistantId: activeAssistant.assistantId,
          vectorStoreId: activeAssistant.vectorStoreId
        }
      });
    } else {
      // 管理页面模式：返回所有助手
      return NextResponse.json({
        assistants: sortedItems,
        total: sortedItems.length
      });
    }
  } catch (error) {
    console.error('[ERROR] 获取助手列表失败:', {
      error,
      tableName: SUNDAY_GUIDE_TABLE,
      message: error instanceof Error ? error.message : '未知错误'
    });
    
    return NextResponse.json(
      { 
        error: '获取助手列表失败',
        details: error instanceof Error ? error.message : '未知错误',
        tableName: SUNDAY_GUIDE_TABLE
      },
      { status: 500 }
    );
  }
} 