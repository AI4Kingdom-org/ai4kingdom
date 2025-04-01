import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    const { assistantId } = params;
    const { vectorStoreId } = await request.json();

    // 更新 Assistant
    const assistant = await openai.beta.assistants.update(
      assistantId,
      {
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStoreId]
          }
        },
        metadata: {
          vector_store_id: vectorStoreId
        }
      }
    );

    // 验证更新是否成功
    if (
      (assistant.metadata as any)?.vector_store_id !== vectorStoreId ||
      !assistant.tool_resources?.file_search?.vector_store_ids?.includes(vectorStoreId)
    ) {
      throw new Error('Vector Store 绑定验证失败');
    }

    return NextResponse.json({ 
      success: true,
      message: 'Vector Store 绑定成功',
      assistant: {
        id: assistant.id,
        vectorStoreId,
        metadata: assistant.metadata,
        toolResources: assistant.tool_resources
      }
    });
  } catch (error) {
    console.error('绑定失败:', error);
    return NextResponse.json(
      { 
        error: '绑定失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
} 