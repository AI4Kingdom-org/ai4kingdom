import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createDynamoDBClient } from '../../../utils/dynamodb';
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 獲取文件記錄列表的API端點
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const assistantId = searchParams.get('assistantId');
    
    // 獲取數據庫連接
    const docClient = await createDynamoDBClient();
    
    // 構建查詢參數
    const params: any = {
      TableName: process.env.NEXT_PUBLIC_SUNDAY_GUIDE_TABLE || 'SundayGuide',
    };
    
    // 如果提供了assistantId，則按助手ID過濾
    if (assistantId) {
      params.FilterExpression = "assistantId = :assistantId";
      params.ExpressionAttributeValues = {
        ":assistantId": assistantId
      };
    }
    
    // 查詢文件記錄
    const result = await docClient.send(new ScanCommand(params));
    
    // 返回結果
    return NextResponse.json({
      success: true,
      records: result.Items?.map(item => ({
        assistantId: item.assistantId,
        vectorStoreId: item.vectorStoreId,
        fileId: item.fileId,
        fileName: item.fileName || '未命名文件',
        updatedAt: item.updatedAt || item.Timestamp,
        summary: item.summary ? '已生成' : '未生成',
        fullText: item.fullText ? '已生成' : '未生成',
        devotional: item.devotional ? '已生成' : '未生成', 
        bibleStudy: item.bibleStudy ? '已生成' : '未生成'
      })) || []
    });
    
  } catch (error) {
    console.error('獲取文件記錄錯誤:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知錯誤'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    console.log('接收到文档上传请求');
    console.log('原始请求信息:', {
      方法: request.method,
      内容类型: request.headers.get('content-type'),
      请求体大小: request.headers.get('content-length'),
    });

    // 尝试获取原始请求体
    const clone = request.clone();
    const rawText = await clone.text();
    console.log('原始请求体预览:', rawText.substring(0, 500) + '...');

    const formData = await request.formData();
    
    // 详细检查 FormData 内容
    console.log('FormData 原始内容:');
    for (const [key, value] of formData.entries()) {
      console.log(`字段 ${key}:`, {
        类型: typeof value,
        是否为文件: value instanceof File,
        值: value instanceof File ? 
          `文件名: ${value.name}, 类型: ${value.type}, 大小: ${value.size}字节` : 
          value
      });
    }
    
    const file = formData.get('files') as File;
    const assistantId = formData.get('assistantId') as string;

    console.log('请求参数详情:', {
      文件信息: file ? {
        名称: file.name,
        类型: file.type,
        大小: file.size,
        最后修改时间: file.lastModified
      } : '无文件',
      助手ID: assistantId || '未提供',
      表单字段列表: Array.from(formData.keys())
    });

    if (!file || !assistantId) {
      console.error('缺少必要参数:', {
        接收到的数据: {
          文件: file ? '存在' : '不存在',
          助手ID: assistantId || '不存在',
          所有字段: Array.from(formData.keys()),
          请求头: request.headers
        }
      });
      
      return NextResponse.json({
        success: false,
        error: '缺少必要参数',
        详细信息: {
          是否有文件: !!file,
          是否有助手ID: !!assistantId,
          表单字段: Array.from(formData.keys())
        }
      }, { status: 400 });
    }

    // 转换文件格式
    const buffer = await file.arrayBuffer();
    const blob = new Blob([buffer]);
    
    // 1. 创建 vector store
    const vectorStore = await openai.beta.vectorStores.create({
      name: `Vector Store ${new Date().toISOString()}`
    });
    
    // 2. 创建文件
    const openaiFile = await openai.files.create({
      file: new File([blob], file.name, { type: file.type }),
      purpose: "assistants"
    });

    // 3. 添加文件到 vector store
    await openai.beta.vectorStores.files.create(
      vectorStore.id,
      { file_id: openaiFile.id }
    );

    // 4. 更新 DynamoDB 记录
    const docClient = await createDynamoDBClient();
    const command = new PutCommand({
      TableName: 'SundayGuide',
      Item: {
        assistantId,
        vectorStoreId: vectorStore.id, // 使用 vector store ID 而不是文件 ID
        fileId: openaiFile.id, // 保存文件 ID 以便后续管理
        updatedAt: new Date().toISOString()
      }
    });

    await docClient.send(command);

    return NextResponse.json({
      success: true,
      vectorStoreId: vectorStore.id,
      fileId: openaiFile.id
    });
  } catch (error) {
    console.error('详细错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}