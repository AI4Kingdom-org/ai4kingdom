import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createDynamoDBClient } from '@/app/utils/dynamodb';
import { PutCommand } from "@aws-sdk/lib-dynamodb";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 處理文件內容的輔助函數
async function processDocumentContent(assistantId: string, threadId: string) {
  try {
    const message = await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: '請幫我分析這份文件並產生以下內容：1. 講道摘要 2. 每日靈修指引 3. 查經指南'
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });

    // 等待處理完成
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    if (runStatus.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(threadId);
      const lastMessage = messages.data[0];
      const content = lastMessage.content[0];
      
      if (content.type === 'text') {
        const text = content.text.value;
        const sections = text.split('\n\n');
        
        return {
          sermon_summary: sections[0] || '',
          daily_devotion: sections[1] || '',
          bible_study_guide: sections[2] || ''
        };
      }
    }
    
    throw new Error(`處理失敗：${runStatus.status}`);
  } catch (error) {
    console.error('[ERROR] 處理文件內容失敗:', error);
    return {
      sermon_summary: '',
      daily_devotion: '',
      bible_study_guide: ''
    };
  }
}

// 添加文件狀態檢查函數
async function waitForFileProcessing(vectorStoreId: string, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const files = await openai.beta.vectorStores.files.list(vectorStoreId);
    console.log(`[DEBUG] 檢查文件狀態 (嘗試 ${i + 1}/${maxAttempts}):`, 
      files.data.map(f => ({ id: f.id, status: f.status }))
    );

    // 檢查所有文件是否都處理完成
    const allProcessed = files.data.every(f => f.status === 'completed');
    if (allProcessed) {
      console.log('[DEBUG] 所有文件處理完成');
      return true;
    }

    // 等待5秒後重試
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error('文件處理超時');
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const vectorStoreId = url.searchParams.get('vectorStoreId');
    const assistantId = url.searchParams.get('assistantId');

    console.log('[DEBUG] 收到上傳請求:', {
      vectorStoreId,
      assistantId,
      url: request.url,
      method: request.method
    });

    if (!vectorStoreId || !assistantId) {
      console.error('[ERROR] 缺少必要參數:', { vectorStoreId, assistantId });
      return NextResponse.json(
        { error: '缺少必要參數', details: { vectorStoreId, assistantId } },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      console.error('[ERROR] 沒有找到文件');
      return NextResponse.json(
        { error: '沒有找到文件' },
        { status: 400 }
      );
    }

    console.log('[DEBUG] 開始處理文件:', {
      名稱: file.name,
      類型: file.type,
      大小: file.size,
    });

    try {
      // 1. 上傳文件到 OpenAI
      console.log(`[DEBUG] 上傳文件到 OpenAI: ${file.name}`);
      const uploadedFile = await openai.files.create({
        file,
        purpose: 'assistants'
      });
      console.log(`[DEBUG] 文件上傳成功: ${uploadedFile.id}`);

      // 2. 添加到 Vector Store
      console.log(`[DEBUG] 添加文件到 Vector Store: ${vectorStoreId}`);
      await openai.beta.vectorStores.files.create(
        vectorStoreId,
        { file_id: uploadedFile.id }
      );
      console.log(`[DEBUG] 文件成功添加到 Vector Store`);

      // 3. 等待文件處理完成
      console.log('[DEBUG] 等待文件處理完成...');
      await waitForFileProcessing(vectorStoreId);
      console.log('[DEBUG] 文件處理完成');

      // 4. 創建線程並處理內容
      const thread = await openai.beta.threads.create();
      console.log('[DEBUG] 線程創建成功:', thread.id);
      
      const content = await processDocumentContent(assistantId, thread.id);
      console.log('[DEBUG] 內容處理完成');

      // 5. 更新 DynamoDB
      const timestamp = new Date().toISOString();
      const docClient = await createDynamoDBClient();
      await docClient.send(new PutCommand({
        TableName: 'SundayGuide',
        Item: {
          assistantId,
          Timestamp: timestamp,
          sermon_summary: content.sermon_summary,
          daily_devotion: content.daily_devotion,
          bible_study_guide: content.bible_study_guide,
          vectorStoreId,
          fileId: uploadedFile.id,
          status: 'active'
        }
      }));
      console.log('[DEBUG] DynamoDB 更新成功');

      return NextResponse.json({ 
        success: true,
        fileId: uploadedFile.id,
        message: '文件上傳成功'
      });

    } catch (err) {
      console.error('[ERROR] 文件處理失敗:', {
        文件名: file.name,
        錯誤: err instanceof Error ? {
          message: err.message,
          stack: err.stack
        } : err
      });
      return NextResponse.json(
        { 
          error: '文件上傳失敗',
          details: err instanceof Error ? err.message : '未知錯誤'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[ERROR] 請求處理失敗:', {
      錯誤: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error
    });
    return NextResponse.json(
      { 
        error: '請求處理失敗', 
        details: error instanceof Error ? error.message : '未知錯誤'
      },
      { status: 500 }
    );
  }
}