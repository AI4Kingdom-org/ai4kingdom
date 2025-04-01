import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    console.log('接收到通用文档上传请求');
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    console.log('上传文件信息:', {
      文件数量: files.length,
      文件列表: files.map(file => ({
        名称: file.name,
        类型: file.type,
        大小: file.size
      }))
    });

    // TODO: 这里添加实际的文件处理逻辑
    // 例如：保存到 S3、处理文件内容等
    
    return NextResponse.json({ 
      success: true,
      message: '文件上传成功',
      filesCount: files.length
    });
  } catch (error) {
    console.error('文件上传失败:', error);
    return NextResponse.json(
      { 
        error: '上传失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}