import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface FileDetail {
  fileName: string;
  fileId: string;
  uploadDate: string;  // 改為 string 類型
}

export async function GET(request: Request) {
  console.log('[DEBUG] 接收到文件列表請求');
  
  const url = new URL(request.url);
  const vectorStoreId = url.searchParams.get('vectorStoreId');

  if (!vectorStoreId) {
    console.error('[ERROR] 缺少必要的 vectorStoreId 參數');
    return NextResponse.json(
      { error: '缺少必要的 vectorStoreId 參數' },
      { status: 400 }
    );
  }

  console.log('[DEBUG] 開始處理文件列表請求:', {
    vectorStoreId,
    時間戳: new Date().toISOString()
  });

  try {
    // 檢查 API Key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('未配置 OpenAI API Key');
    }

    // 獲取 vector store 的文件
    console.log('[DEBUG] 請求 OpenAI Vector Store 文件列表');
    const vectorStoreFiles = await openai.files.list({
      purpose: 'assistants'
    });

    console.log('[DEBUG] 獲取到文件列表:', {
      總數: vectorStoreFiles.data.length,
      文件IDs: vectorStoreFiles.data.map(f => f.id)
    });

    // 獲取文件詳細信息
    const fileDetails = await Promise.all(
      vectorStoreFiles.data.map(async (file) => {
        try {
          const fileInfo = await openai.files.retrieve(file.id);
          // 將 Unix timestamp 轉換為 ISO 字符串
          const uploadDate = new Date(fileInfo.created_at * 1000).toISOString();
          
          return {
            fileName: fileInfo.filename,
            fileId: file.id,
            uploadDate: uploadDate
          };
        } catch (err) {
          console.error(`[ERROR] 獲取文件信息失敗: ${file.id}`, err);
          return null;
        }
      })
    );

    // 過濾掉獲取失敗的文件
    const validFiles = fileDetails.filter((file): file is FileDetail => file !== null);

    // 按上傳日期降序排序
    validFiles.sort((a, b) => 
      new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
    );

    console.log('[DEBUG] 返回文件列表:', {
      總數: validFiles.length,
      文件列表: validFiles.map(f => ({
        名稱: f.fileName,
        ID: f.fileId,
        上傳時間: new Date(f.uploadDate).toLocaleString('zh-TW', {
          timeZone: 'America/Los_Angeles'
        })
      }))
    });

    if (validFiles.length === 0) {
      console.log('[DEBUG] 沒有找到有效的文件');
    }

    return NextResponse.json(validFiles);
    
  } catch (error) {
    console.error('[ERROR] 獲取文件列表失敗:', {
      錯誤: error,
      消息: error instanceof Error ? error.message : '未知錯誤',
      堆棧: error instanceof Error ? error.stack : undefined,
      vectorStoreId,
      時間戳: new Date().toISOString()
    });
    
    if (error instanceof Error) {
      const openaiError = error as any;
      console.error('[ERROR] OpenAI 錯誤詳情:', {
        狀態: openaiError.status,
        類型: openaiError.type,
        代碼: openaiError.code,
        參數: openaiError.param,
        錯誤: openaiError.error,
        時間戳: new Date().toISOString()
      });
    }
    
    return NextResponse.json(
      { 
        error: '獲取文件列表失敗',
        details: error instanceof Error ? error.message : '未知錯誤',
        vectorStoreId
      },
      { status: 500 }
    );
  }
}