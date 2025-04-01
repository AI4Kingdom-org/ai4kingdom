import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST() {
  try {
    console.log('开始创建 Vector Store');
    
    // 只使用 name 参数创建 Vector Store
    const params = {
      name: `Vector Store ${new Date().toISOString()}`
    };
    
    console.log('创建参数:', params);
    
    try {
      const vectorStore = await openai.beta.vectorStores.create(params);
      
      console.log('Vector Store 创建成功:', {
        id: vectorStore.id,
        name: vectorStore.name,
        created_at: vectorStore.created_at
      });

      return NextResponse.json({
        success: true,
        vectorStoreId: vectorStore.id,
        details: {
          name: vectorStore.name,
          created_at: vectorStore.created_at
        }
      });
    } catch (apiError) {
      console.error('OpenAI API 错误:', {
        error: apiError,
        message: apiError instanceof Error ? apiError.message : '未知错误',
        params: params,
        response: apiError instanceof Error ? (apiError as any).response?.data : undefined
      });
      
      if (apiError instanceof Error) {
        const openaiError = apiError as any;
        console.error('OpenAI 错误详情:', {
          status: openaiError.status,
          type: openaiError.type,
          code: openaiError.code,
          param: openaiError.param,
          error: openaiError.error
        });
      }
      
      throw apiError;
    }
  } catch (error) {
    console.error('创建 Vector Store 失败:', {
      error,
      message: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { 
        error: '创建 Vector Store 失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
} 