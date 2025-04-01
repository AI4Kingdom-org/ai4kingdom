import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createDynamoDBClient } from '../../../../utils/dynamodb';
import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: Request) {
  try {
    const { assistantId, transcription } = await request.json();
    
    // 1. 获取 Vector Store ID
    const docClient = await createDynamoDBClient();
    const getCommand = new GetCommand({
      TableName: 'SundayGuide',
      Key: { assistantId }
    });
    
    const getResult = await docClient.send(getCommand);
    const item = getResult.Item;
    
    if (!item?.vectorStoreId) {
      throw new Error('Vector Store ID not found');
    }
    
    console.log('[DEBUG] 获取到 Vector Store ID:', item.vectorStoreId);

    // 2. 创建新文件 - 统一使用 sermon.txt
    console.log('[DEBUG] 开始创建新文件');
    const transcriptionBlob = new Blob([transcription], { type: 'text/plain' });
    console.log('[DEBUG] 创建 Blob:', {
      size: transcriptionBlob.size,
      type: transcriptionBlob.type,
      content: transcription.substring(0, 100) + '...'
    });

    const formData = new FormData();
    formData.append('file', transcriptionBlob, 'sermon.txt');  // 统一使用 sermon.txt
    formData.append('purpose', 'assistants');

    const file = await openai.files.create({
      file: formData.get('file') as File,
      purpose: "assistants"
    });
    console.log('[DEBUG] 新文件创建成功:', {
      fileId: file.id,
      filename: file.filename,
      purpose: file.purpose,
      status: file.status
    });

    // 3. 删除旧文件
    console.log('[DEBUG] 开始删除旧文件');
    const files = await openai.beta.vectorStores.files.list(item.vectorStoreId);
    console.log('[DEBUG] Vector Store 中的文件:', {
      count: files.data.length,
      files: files.data.map(f => ({ id: f.id, created_at: f.created_at }))
    });

    // 从 Vector Store 中移除所有文件
    for (const oldFile of files.data) {
      try {
        await openai.beta.vectorStores.files.del(item.vectorStoreId, oldFile.id);
        console.log('[DEBUG] 从 Vector Store 移除文件:', oldFile.id);
      } catch (deleteError) {
        console.warn('[WARN] 从 Vector Store 移除文件失败:', {
          fileId: oldFile.id,
          error: deleteError
        });
      }
    }

    // 删除旧的 OpenAI 文件
    if (item.fileId) {
      try {
        await openai.files.del(item.fileId);
        console.log('[DEBUG] 删除 OpenAI 文件成功:', item.fileId);
      } catch (deleteError) {
        console.warn('[WARN] 删除 OpenAI 文件失败，可能已经不存在:', {
          fileId: item.fileId,
          error: deleteError
        });
      }
    }

    // 4. 添加新文件到 Vector Store
    console.log('[DEBUG] 开始添加文件到 Vector Store:', {
      vectorStoreId: item.vectorStoreId,
      fileId: file.id
    });
    
    await openai.beta.vectorStores.files.create(
      item.vectorStoreId,
      { file_id: file.id }
    );
    console.log('[DEBUG] 文件成功添加到 Vector Store');

    // 5. 更新 DynamoDB
    const updateCommand = new UpdateCommand({
      TableName: 'SundayGuide',
      Key: { assistantId },
      UpdateExpression: 'SET transcription = :transcription, fileId = :fileId',
      ExpressionAttributeValues: {
        ':transcription': transcription,
        ':fileId': file.id
      },
      ReturnValues: 'ALL_NEW'
    });

    const updateResult = await docClient.send(updateCommand);
    console.log('[DEBUG] DynamoDB 更新成功:', updateResult);

    return NextResponse.json({
      success: true,
      fileId: file.id,
      vectorStoreId: item.vectorStoreId
    });
  } catch (error) {
    console.error('[ERROR] 更新转录文本失败:', error);
    return NextResponse.json({
      error: '更新失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 