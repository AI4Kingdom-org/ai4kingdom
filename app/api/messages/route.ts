import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createDynamoDBClient } from '../../utils/dynamodb';
import { QueryCommand } from '@aws-sdk/client-dynamodb';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get('threadId');
    const userId = searchParams.get('userId');

    if (!threadId || !userId) {
      console.warn('[WARN] 缺少必要参数:', { threadId, userId });
      return NextResponse.json({ 
        success: false,
        error: 'ThreadId and UserId are required' 
      }, { status: 400 });
    }

    // 从 DynamoDB 获取线程配置
    try {
      const docClient = await createDynamoDBClient();
      const command = new QueryCommand({
        TableName: 'ChatHistory',
        IndexName: 'threadId-index',
        KeyConditionExpression: 'threadId = :threadId',
        ExpressionAttributeValues: {
          ':threadId': { S: threadId }
        }
      });
      
      const response = await docClient.send(command);
      console.log('[DEBUG] 获取线程配置成功:', response);
    } catch (error) {
      console.error('[ERROR] 获取 DynamoDB 配置失败:', error);
    }

    // 从 OpenAI 获取线程信息
    try {
      const thread = await openai.beta.threads.retrieve(threadId);
      console.log('[DEBUG] 获取线程信息成功:', { threadId: thread.id });

      const messages = await openai.beta.threads.messages.list(threadId);
      console.log('[DEBUG] 获取消息列表成功, 消息数量:', messages.data?.length || 0);

      if (!messages.data || messages.data.length === 0) {
        return NextResponse.json({
          success: true,
          messages: []
        });
      }

      // 格式化消息并反转顺序
      const formattedMessages = messages.data
        .reverse()
        .map(message => {
          const content = message.content
            .filter(c => c.type === 'text')
            .map(c => (c.type === 'text' ? c.text.value : ''))
            .join('\n');

          return {
            id: message.id,
            role: message.role,
            content,
            createdAt: message.created_at
          };
        });

      return NextResponse.json({
        success: true,
        messages: formattedMessages,
        debug: {
          threadInfo: {
            id: thread.id,
            created: thread.created_at
          },
          messageCount: messages.data.length
        }
      });

    } catch (error) {
      console.error('[ERROR] OpenAI 获取消息失败:', {
        error,
        threadId,
        errorMessage: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // 如果 OpenAI API 调用失败，尝试从 DynamoDB 获取消息
      try {
        const docClient = await createDynamoDBClient();
        const command = new QueryCommand({
          TableName: 'Messages',
          IndexName: 'threadId-index',
          KeyConditionExpression: 'threadId = :threadId',
          ExpressionAttributeValues: {
            ':threadId': { S: threadId }
          }
        });
        
        const response = await docClient.send(command);
        console.log('[DEBUG] 从 DynamoDB 获取消息成功:', response);
        
        if (response.Items && response.Items.length > 0) {
          const formattedMessages = response.Items.map(item => ({
            id: item.id?.S || '',
            role: item.role?.S || (item.isUserMessage?.BOOL ? 'user' : 'assistant'),
            content: item.content?.S || item.Message?.S || '',
            createdAt: item.createdAt?.S || item.Timestamp?.S || new Date().toISOString()
          }));
          
          return NextResponse.json({
            success: true,
            messages: formattedMessages,
            source: 'dynamodb'
          });
        }
      } catch (dbError) {
        console.error('[ERROR] DynamoDB 获取消息失败:', dbError);
      }
      
      return NextResponse.json({
        success: false,
        error: '获取 OpenAI 消息失败',
        details: error instanceof Error ? error.message : '未知错误'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[ERROR] 获取消息记录失败:', {
      error,
      errorMessage: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json({
      success: false,
      error: '获取消息记录失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}