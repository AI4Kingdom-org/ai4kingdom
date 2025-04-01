import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface FileDetail {
  fileName: string;
  fileId: string;
  uploadDate: number;
}

type VectorStoreFilesResponse = Awaited<ReturnType<typeof openai.beta.vectorStores.files.list>>;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const vectorStoreId = searchParams.get('vectorStoreId');
    
    console.log('接收到文件列表请求:', {
      url: request.url,
      vectorStoreId
    });

    if (!vectorStoreId) {
      console.log('缺少 vectorStoreId 参数');
      return NextResponse.json(
        { error: '缺少 vectorStoreId 参数' },
        { status: 400 }
      );
    }

    // 直接获取 vector store 关联的文件
    const vectorStoreFiles = await openai.beta.vectorStores.files.list(vectorStoreId);
    
    console.log('获取到 vector store 文件:', {
      数量: vectorStoreFiles.data.length,
      文件IDs: vectorStoreFiles.data.map(f => f.id)
    });

    // 获取文件详细信息
    const fileDetails = await Promise.all(
      vectorStoreFiles.data.map(async (file) => {
        try {
          const fileInfo = await openai.files.retrieve(file.id);
          return {
            fileName: fileInfo.filename,
            fileId: file.id,
            uploadDate: fileInfo.created_at
          };
        } catch (err) {
          console.error(`获取文件信息失败: ${file.id}`, err);
          return null;
        }
      })
    );

    // 过滤掉获取失败的文件
    const validFiles = fileDetails.filter((file): file is FileDetail => file !== null);

    // 按上传日期降序排序
    validFiles.sort((a, b) => 
      new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
    );

    console.log('返回文件列表:', {
      总数: validFiles.length,
      文件列表: validFiles.map(f => ({
        名称: f.fileName,
        ID: f.fileId,
        上传时间: new Date(f.uploadDate).toLocaleString()
      }))
    });

    return NextResponse.json(validFiles);
  } catch (error) {
    console.error('获取文件列表失败:', error);
    return NextResponse.json(
      { error: '获取文件列表失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
} 