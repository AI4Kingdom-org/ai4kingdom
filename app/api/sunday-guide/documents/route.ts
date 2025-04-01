import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createDynamoDBClient } from '../../../utils/dynamodb';
import { PutCommand } from "@aws-sdk/lib-dynamodb";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
    
    // 创建 vector store
    const openaiFile = await openai.files.create({
      file: new File([blob], file.name, { type: file.type }),
      purpose: "assistants"
    });

    // 2. 更新 DynamoDB 记录
    const docClient = await createDynamoDBClient();
    const command = new PutCommand({
      TableName: 'SundayGuide',
      Item: {
        assistantId,
        vectorStoreId: openaiFile.id,
        updatedAt: new Date().toISOString()
      }
    });

    await docClient.send(command);

    return NextResponse.json({
      success: true,
      vectorStoreId: openaiFile.id
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