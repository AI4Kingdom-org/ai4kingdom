import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../../../../utils/dynamodb';
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    const { assistantId } = params;
    const { type, fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json({ error: '未提供文件 ID' }, { status: 400 });
    }

    // 1. 創建新的 thread
    const thread = await openai.beta.threads.create();

    // 2. 創建一個用戶消息
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `請用中文總結這個文件的內容。如果內容包含多個部分，請確保每個部分都被涵蓋。`
    });

    // 3. 創建並等待 run 完成
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
    });

    // 4. 等待 run 完成
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    if (runStatus.status !== 'completed') {
      throw new Error(`運行失敗: ${runStatus.status}`);
    }

    // 5. 獲取總結內容
    const messages = await openai.beta.threads.messages.list(thread.id, {
      order: 'desc',
      limit: 1
    });

    const summary = messages.data[0]?.content[0]?.type === 'text' 
      ? messages.data[0].content[0].text.value 
      : '';

    // 6. 將總結保存到數據庫
    const docClient = await createDynamoDBClient();
    const getCommand = new ScanCommand({
      TableName: 'SundayGuide',
      FilterExpression: 'assistantId = :assistantId',
      ExpressionAttributeValues: {
        ':assistantId': assistantId
      }
    });

    const response = await docClient.send(getCommand);
    if (!response.Items?.length) {
      return NextResponse.json({ error: '未找到助手記錄' }, { status: 404 });
    }

    const updateCommand = new UpdateCommand({
      TableName: 'SundayGuide',
      Key: {
        assistantId: assistantId,
        Timestamp: response.Items[0].Timestamp
      },
      UpdateExpression: 'SET sermon_summary = :summary',
      ExpressionAttributeValues: {
        ':summary': summary
      }
    });

    await docClient.send(updateCommand);

    return NextResponse.json({ 
      success: true,
      summary
    });
  } catch (error) {
    console.error('生成總結失敗:', error);
    return NextResponse.json(
      { error: '生成總結失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    );
  }
}