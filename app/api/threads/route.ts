import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../utils/dynamodb';
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

// 获取用户的所有对话
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const type = searchParams.get('type') || 'general';

  if (!userId) {
    return NextResponse.json({ error: 'UserId is required' }, { status: 400 });
  }

  try {
    const docClient = await createDynamoDBClient();
    
    // 使用 Query 而不是 Scan 来提高效率
    const command = new QueryCommand({
      TableName: "ChatHistory",
      KeyConditionExpression: "UserId = :userId",
      FilterExpression: "#type = :type",
      ExpressionAttributeNames: {
        "#type": "Type"
      },
      ExpressionAttributeValues: {
        ":userId": userId,
        ":type": type
      }
    });

    const response = await docClient.send(command);

    // 确保返回的数据格式正确，并处理时间戳
    const threads = (response.Items || []).map(item => {

      // 确保时间戳是有效的ISO格式
      let timestamp = item.Timestamp;
      let formattedTimestamp;

      try {
        if (!timestamp) {
          formattedTimestamp = new Date().toISOString();
        } else if (typeof timestamp === 'number') {
          formattedTimestamp = new Date(timestamp).toISOString();
        } else if (typeof timestamp === 'string') {
          if (timestamp.includes('T')) {
            formattedTimestamp = timestamp;
          } else {
            formattedTimestamp = new Date(timestamp).toISOString();
          }
        } else {
          formattedTimestamp = new Date().toISOString();
        }

      } catch (e) {
        console.error('[ERROR] 时间戳处理失败:', {
          输入: timestamp,
          错误: e instanceof Error ? e.message : String(e)
        });
        formattedTimestamp = new Date().toISOString();
      }

      const thread = {
        id: item.threadId,
        userId: item.UserId,
        type: item.Type,
        timestamp: formattedTimestamp,
        threadId: item.threadId,
        title: item.title || '新对话',
        lastUpdated: formattedTimestamp
      };


      return thread;
    });
    
    // 按时间戳降序排序
    threads.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    

    return NextResponse.json(threads);

  } catch (error) {
    
    return NextResponse.json(
      { 
        error: '获取线程列表失败',
        details: error instanceof Error ? error.message : '未知错误',
        env: {
          hasRegion: !!process.env.NEXT_PUBLIC_AWS_REGION,
          hasIdentityPool: !!process.env.NEXT_PUBLIC_IDENTITY_POOL_ID,
          hasUserPool: !!process.env.NEXT_PUBLIC_USER_POOL_ID
        }
      },
      { status: 500 }
    );
  }
} 