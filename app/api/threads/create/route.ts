import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from '../../../utils/dynamodb';
import { ASSISTANT_IDS } from '../../../config/constants';
import { ChatType } from '../../../config/chatTypes';  // 导入类型

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, type } = body;
    
    console.log('[DEBUG] 开始创建对话:', { userId, type });

    // 创建新的 thread
    const thread = await openai.beta.threads.create();
    const timestamp = new Date().toISOString();

    const docClient = DynamoDBDocumentClient.from(await createDynamoDBClient());

    // 如果是 homeschool 类型，获取基本信息并发送初始消息
    if (type.toLowerCase() === 'homeschool') {
      console.log('[DEBUG] 处理 homeschool 类型对话');
      
      const getCommand = new GetCommand({
        TableName: 'HomeschoolPrompts',
        Key: {
          UserId: String(userId)  // 确保 UserId 是字符串类型
        }
      });

      const response = await docClient.send(getCommand);
      console.log('[DEBUG] 获取到的基本信息:', response.Item);

      if (response.Item) {
        const { childName, basicInfo, recentChanges } = response.Item;
        const initialMessage = `我的孩子是${childName}，基本状况是${basicInfo}，最新变化是${recentChanges}`;
        
        console.log('[DEBUG] 发送初始消息:', initialMessage);

        // 发送初始消息
        await openai.beta.threads.messages.create(
          thread.id,
          {
            role: "user",
            content: initialMessage
          }
        );

        // 运行 assistant
        const run = await openai.beta.threads.runs.create(
          thread.id,
          { 
            assistant_id: ASSISTANT_IDS.HOMESCHOOL,
            max_completion_tokens: 1000
          }
        );

        console.log('[DEBUG] Assistant 开始运行:', run.id);

        // 等待运行完成
        let runStatus = await openai.beta.threads.runs.retrieve(
          thread.id,
          run.id
        );

        while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
          await new Promise(resolve => setTimeout(resolve, 1000));
          runStatus = await openai.beta.threads.runs.retrieve(
            thread.id,
            run.id
          );
        }

        console.log('[DEBUG] Assistant 运行完成:', runStatus.status);
      }
    }

    // 保存 thread 信息到 DynamoDB
    const putCommand = new PutCommand({
      TableName: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME,
      Item: {
        UserId: String(userId),  // 确保 UserId 是字符串类型
        Timestamp: timestamp,
        threadId: thread.id,
        Type: type.toUpperCase()
      }
    });

    await docClient.send(putCommand);

    return NextResponse.json({ 
      success: true, 
      threadId: thread.id 
    });
  } catch (error) {
    console.error('[ERROR] 创建对话失败:', error);
    return NextResponse.json(
      { error: '创建对话失败' },
      { status: 500 }
    );
  }
} 