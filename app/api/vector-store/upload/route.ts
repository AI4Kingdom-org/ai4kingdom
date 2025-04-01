import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { VECTOR_STORE_IDS } from '@/app/config/constants';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files.length) {
      return NextResponse.json(
        { error: '没有找到文件' },
        { status: 400 }
      );
    }

    const results = await Promise.all(
      files.map(async (file) => {
        try {
          // 将文件转换为Buffer并上传
          const buffer = await file.arrayBuffer();
          const blob = new Blob([buffer]);
          
          // 上传文件到OpenAI
          const uploadedFile = await openai.files.create({
            file: new File([blob], file.name, { type: file.type }),
            purpose: 'assistants'
          });

          // 将文件添加到Vector Store
          await openai.beta.vectorStores.files.create(
            VECTOR_STORE_IDS.GENERAL,
            { file_id: uploadedFile.id }
          );

          return {
            success: true,
            fileName: file.name,
            fileId: uploadedFile.id,
            uploadDate: new Date().toISOString()
          };
        } catch (err) {
          return {
            success: false,
            fileName: file.name,
            error: err instanceof Error ? err.message : '上传失败'
          };
        }
      })
    );

    const failedUploads = results.filter(result => !result.success);
    
    if (failedUploads.length) {
      return NextResponse.json({
        message: '部分文件上传失败',
        results,
        failedCount: failedUploads.length
      }, { status: 207 }); // 使用207状态码表示部分成功
    }

    return NextResponse.json({ 
      message: '所有文件上传成功',
      results
    });
  } catch (error) {
    console.error('文件上传失败:', error);
    return NextResponse.json(
      { error: '文件上传失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
} 