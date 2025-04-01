import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { VECTOR_STORE_IDS } from '@/app/config/constants';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function DELETE(
  request: Request,
  { params }: { params: { fileName: string } }
) {
  try {
    // 获取所有文件列表
    const files = await openai.files.list();
    
    // 找到匹配的文件
    const targetFile = files.data.find(file => 
      file.filename === params.fileName && file.purpose === 'assistants'
    );

    if (!targetFile) {
      return NextResponse.json(
        { error: '文件不存在' },
        { status: 404 }
      );
    }

    // 直接删除底层文件对象
    await openai.files.del(targetFile.id);
    
    return NextResponse.json({ 
      message: '文件删除成功',
      fileId: targetFile.id
    });
  } catch (error) {
    console.error('文件删除失败:', error);
    return NextResponse.json(
      { error: '文件删除失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
} 