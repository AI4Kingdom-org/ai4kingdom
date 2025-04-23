import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createDynamoDBClient } from '@/app/utils/dynamodb';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const SUNDAY_GUIDE_TABLE = process.env.NEXT_PUBLIC_SUNDAY_GUIDE_TABLE || 'SundayGuide';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: Request) {
  try {
    const { assistantId, vectorStoreId, fileName } = await request.json();
    
    console.log('[DEBUG] 處理文件請求:', { assistantId, vectorStoreId, fileName });

    // 獲取助手信息
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    console.log(`[DEBUG] 助手信息:`, {
      名稱: assistant.name,
      模型: assistant.model,
      工具: assistant.tools?.map(t => t.type)
    });

    // 查看当前助手的 vector store 绑定情况
    if (assistant.tool_resources?.file_search?.vector_store_ids) {
      console.log(`[DEBUG] 助手已绑定的 Vector Store:`, 
        assistant.tool_resources.file_search.vector_store_ids);
      
      // 检查是否需要更新绑定
      if (!assistant.tool_resources.file_search.vector_store_ids.includes(vectorStoreId)) {
        console.log(`[DEBUG] 更新助手的 Vector Store 绑定`);
        await openai.beta.assistants.update(
          assistantId,
          {
            tools: [{ type: "file_search" }],
            tool_resources: {
              file_search: {
                vector_store_ids: [vectorStoreId]
              }
            }
          }
        );
        console.log(`[DEBUG] Vector Store 绑定更新成功`);
      }
    } else {
      console.log(`[DEBUG] 助手未绑定 Vector Store，进行绑定`);
      await openai.beta.assistants.update(
        assistantId,
        {
          tools: [{ type: "file_search" }],
          tool_resources: {
            file_search: {
              vector_store_ids: [vectorStoreId]
            }
          }
        }
      );
      console.log(`[DEBUG] Vector Store 绑定成功`);
    }

    // 獲取文件ID - 從數據庫獲取
    const docClient = await createDynamoDBClient();
    const queryParams = {
      TableName: SUNDAY_GUIDE_TABLE,
      FilterExpression: "vectorStoreId = :vectorStoreId",
      ExpressionAttributeValues: {
        ":vectorStoreId": vectorStoreId
      }
    };
    
    console.log('[DEBUG] 查詢數據庫獲取fileId');
    let fileId = null;
    try {
      const result = await docClient.send(new ScanCommand(queryParams));
      if (result.Items && result.Items.length > 0) {
        // 找到最新的記錄
        const latestItem = result.Items.sort((a, b) => 
          new Date(b.Timestamp || "").getTime() - new Date(a.Timestamp || "").getTime()
        )[0];
        fileId = latestItem.fileId;
        console.log(`[DEBUG] 從數據庫找到文件 ID: ${fileId}`);
      }
    } catch (dbError) {
      console.error('[ERROR] 數據庫查詢失敗:', dbError);
    }

    // 检查 Vector Store 中的文件
    try {
      const filesInVectorStore = await openai.beta.vectorStores.files.list(vectorStoreId);
      console.log(`[DEBUG] Vector Store 中的文件:`, 
        filesInVectorStore.data.map(f => ({ id: f.id, status: f.status })));
      
      // 如果数据库中没有找到fileId，但Vector Store中有文件，使用第一个文件
      if (!fileId && filesInVectorStore.data.length > 0) {
        fileId = filesInVectorStore.data[0].id;
        console.log(`[DEBUG] 从 Vector Store 获取文件 ID: ${fileId}`);
      }
    } catch (vectorStoreError) {
      console.error('[ERROR] 获取 Vector Store 文件失败:', vectorStoreError);
    }

    if (!fileId) {
      console.warn('[WARN] 無法獲取文件ID，將使用vectorStoreId作為標識，但文件處理可能不準確');
    }
    
    // 創建一個新的線程
    const thread = await openai.beta.threads.create();
    console.log(`[DEBUG] 創建線程 ID: ${thread.id}`);
    
    // 發送一個初始消息，提供文件名信息
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `請幫我分析文件 "${fileName}"。我需要獲取文件內容的摘要、全文、靈修指引和查經指引。`
    });
    console.log('[DEBUG] 初始消息已發送到線程');

    // 執行助手，使用明確的指示
    const initialRun = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
      instructions: `請使用文件搜索工具查詢並分析文件 "${fileName}"。你可以從vector store中獲取文件內容。請基於文件內容進行分析。如果找不到任何文件，請明確告知。`
    });
    
    // 等待初始處理完成
    let initialRunStatus = await openai.beta.threads.runs.retrieve(thread.id, initialRun.id);
    console.log(`[DEBUG] 初始處理狀態: ${initialRunStatus.status}`);
    
    while (initialRunStatus.status === 'queued' || initialRunStatus.status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      initialRunStatus = await openai.beta.threads.runs.retrieve(thread.id, initialRun.id);
      console.log(`[DEBUG] 初始處理狀態更新: ${initialRunStatus.status}`);
    }
    
    if (initialRunStatus.status !== 'completed') {
      throw new Error(`初始處理失敗: ${initialRunStatus.status}`);
    }
    
    // 获取初步回应，检查是否能访问文件
    const initialMessages = await openai.beta.threads.messages.list(thread.id);
    const initialResponse = initialMessages.data[0].content
      .filter(content => content.type === 'text')
      .map(content => (content.type === 'text' ? content.text.value : ''))
      .join('\n');
    
    console.log(`[DEBUG] 初始回應: ${initialResponse.substring(0, 200)}...`);
    
    // 检查响应中是否包含无法找到文件的信息
    if (initialResponse.includes('找不到文件') || 
        initialResponse.includes('无法访问') || 
        initialResponse.includes('没有找到') ||
        initialResponse.includes('不存在')) {
      console.error('[ERROR] 助手无法访问文件');
      throw new Error('助手无法访问上传的文件，请确保文件已正确上传并与助手关联');
    }
    
    console.log('[DEBUG] 初始處理完成，助手可以访问文件，开始处理不同內容類型');

    // 發送處理請求，生成不同類型的內容
    const contentTypes = [
      { type: 'summary', prompt: '請總結這篇文章的主要內容，以簡潔的方式呈現重點。請確保包含所有關鍵信息。' },
      { type: 'fullText', prompt: '請完整保留原文內容，並加入適當的段落分隔。不要省略任何內容。' },
      { type: 'devotional', prompt: '請基於這篇文章的內容，提供每日靈修指引，包含經文應用和禱告建議。' },
      { type: 'bibleStudy', prompt: '請為這篇文章設計查經指引，包含相關經文、討論問題和應用建議。' }
    ];

    const results: Record<string, string> = {};

    for (const { type, prompt } of contentTypes) {
      console.log(`[DEBUG] 處理 ${type} 內容...`);
      
      // 發送用戶消息
      await openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: prompt
      });

      // 執行助手
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId,
        instructions: `請基於文件 "${fileName}" 的內容回應用戶的請求。使用文件搜索工具確保你能訪問到文件的完整內容。${prompt}`
      });

      // 等待處理完成
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log(`[DEBUG] ${type} 處理狀態: ${runStatus.status}`);
      
      let attempts = 0;
      const maxAttempts = 60; // 最多等待60次(大约10分钟)
      
      while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒再查询
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        console.log(`[DEBUG] ${type} 處理狀態更新: ${runStatus.status} (尝试 ${++attempts}/${maxAttempts})`);
      }

      if (runStatus.status !== 'completed') {
        throw new Error(`處理 ${type} 內容失敗: ${runStatus.status}`);
      }

      // 獲取助手回覆
      const messages = await openai.beta.threads.messages.list(thread.id);
      const lastMessage = messages.data[0];
      const content = lastMessage.content
        .filter(content => content.type === 'text')
        .map(content => (content.type === 'text' ? content.text.value : ''))
        .join('\n');

      results[type] = content;
      console.log(`[DEBUG] ${type} 內容處理完成, 長度: ${content.length} 字元`);
    }

    // 保存處理結果到數據庫
    console.log('[DEBUG] 保存處理結果到數據庫');
    await docClient.send(new PutCommand({
      TableName: SUNDAY_GUIDE_TABLE,
      Item: {
        assistantId,
        vectorStoreId,
        fileName,
        fileId: fileId || vectorStoreId,
        summary: results.summary,
        fullText: results.fullText,
        devotional: results.devotional,
        bibleStudy: results.bibleStudy,
        Timestamp: new Date().toISOString()
      }
    }));

    console.log('[DEBUG] 處理完成，返回結果');
    return NextResponse.json(results);

  } catch (error) {
    console.error('[ERROR] 文件處理失敗:', error);
    return NextResponse.json(
      { error: '文件處理失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    );
  }
}