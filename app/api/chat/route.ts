import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import OpenAI from 'openai';
import { NextResponse } from 'next/server';

// 统一环境变量配置
const CONFIG = {
  region: process.env.NEXT_PUBLIC_AWS_REGION || process.env.NEXT_PUBLIC_REGION || "us-east-2",
  identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID!,
  userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
  userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
  tableName: process.env.NEXT_PUBLIC_DYNAMODB_TABLE_NAME || "ChatHistory",
  isDev: process.env.NODE_ENV === 'development'
};

async function getDynamoDBConfig() {
  if (CONFIG.isDev) {
    return {
      region: CONFIG.region,
      credentials: {
        accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY!,
        secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_KEY!
      }
    };
  }

  try {
    const credentials = await fromCognitoIdentityPool({
      clientConfig: { region: CONFIG.region },
      identityPoolId: CONFIG.identityPoolId
    })();

    return {
      region: CONFIG.region,
      credentials
    };
  } catch (error) {
    console.error('[ERROR] Cognito 凭证获取失败:', error);
    throw error;
  }
}

// 创建 DynamoDB 客户端
async function createDynamoDBClient() {
  try {
    const config = await getDynamoDBConfig();
    
    const client = new DynamoDBClient(config);
    return DynamoDBDocumentClient.from(client);
  } catch (error) {
    console.error('[ERROR] DynamoDB 客户端创建失败:', error);
    throw error;
  }
}

// CORS 配置
const ALLOWED_ORIGINS = [
  'https://main.d3ts7h8kta7yzt.amplifyapp.com',
  'https://ai4kingdom.com',
  'http://localhost:3000'
];

function setCORSHeaders(origin: string | null) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WP-Nonce, X-Requested-With, Accept',
  });

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    // 添加 Vary 头以支持多源
    headers.set('Vary', 'Origin');
  }

  return headers;
}

// 修改现有的 getUserActiveThread 函数
async function getUserActiveThread(
  userId: string, 
  openai: OpenAI,
  assistantId: string  // 新增参数
): Promise<string> {
  try {
    const docClient = await createDynamoDBClient();
    const command = new QueryCommand({
      TableName: CONFIG.tableName,
      IndexName: 'UserTypeIndex',
      KeyConditionExpression: 'UserId = :userId AND #type = :type',
      ExpressionAttributeNames: {
        '#type': 'Type'
      },
      ExpressionAttributeValues: {
        ':userId': String(userId),
        ':type': 'thread'
      }
    });

    const response = await docClient.send(command);
    const latestThread = response.Items?.[0];
    const threadId = latestThread?.threadId;
    
    if (!threadId) {
      // 创建新线程时关联 assistantId
      const newThread = await openai.beta.threads.create();
      
      // 创建 run 来关联 assistant
      await openai.beta.threads.runs.create(newThread.id, {
        assistant_id: assistantId
      });
      
      await docClient.send(new PutCommand({
        TableName: CONFIG.tableName,
        Item: {
          UserId: String(userId),
          Type: 'thread',
          threadId: newThread.id,
          assistantId: assistantId,  // 保存 assistantId
          Timestamp: new Date().toISOString()
        }
      }));
      return newThread.id;
    }

    return threadId;
  } catch (error) {
    console.error('[ERROR] 获取用户线程失败:', error);
    throw error;
  }
}

// 修改等待完成函数的超时策略
async function waitForCompletion(openai: OpenAI, threadId: string, runId: string, maxAttempts = 30) {
  let attempts = 0;
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
  
  console.log('[DEBUG] OpenAI Run 配置详情:', {
    threadId,
    runId,
    assistant: {
      id: runStatus.assistant_id,
      model: runStatus.model,
      instructions: runStatus.instructions,
      tools: runStatus.tools?.map(t => t.type)
    },
    metadata: {
      status: runStatus.status,
      startTime: new Date(runStatus.created_at * 1000).toISOString(),
      completionTime: runStatus.completed_at ? new Date(runStatus.completed_at * 1000).toISOString() : null
    }
  });

  while (runStatus.status !== 'completed' && attempts < maxAttempts) {
    if (runStatus.status === 'failed') {
      throw new Error('Assistant run failed');
    }
    
    // 使用渐进式延迟策略
    const delay = Math.min(1000 * Math.pow(1.2, attempts), 3000);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    attempts++;
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.log(`[DEBUG] Run status: ${runStatus.status}, attempt: ${attempts}`);
  }
  
  if (runStatus.status === 'completed') {

    // 获取运行步骤以检查检索操作
    const steps = await openai.beta.threads.runs.steps.list(threadId, runId);
    const retrievalSteps = steps.data.filter(step => 
      (step.step_details as any).type === 'retrieval'
    );
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('请求处理超时，请稍后重试');
  }
  
  return runStatus;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: Request) {
  try {
    const { message, threadId, userId, config } = await request.json();

    // 1) 首先检查月度用量，防止用户已达上限
    const usageCheckUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/usage/monthly?userId=${userId}`;

    const usageCheckResponse = await fetch(usageCheckUrl);
    const usageData = await usageCheckResponse.json();

    // 如果 usage 接口返回非 200，说明检查失败或权限问题
    if (!usageCheckResponse.ok) {
      // usageData 中可能包含 error 或其他信息
      return NextResponse.json({
        error: usageData.error || 'Failed to check monthly usage',
        details: usageData.details || 'Unknown error'
      }, { status: usageCheckResponse.status });
    }

    // 解析 usageData，查看 remaining 是否小于等于 0
    // usageData.usage: { monthlyCount, monthlyLimit, remaining, nextResetDate, ... }
    if (usageData?.usage?.remaining !== undefined && usageData.usage.remaining <= 0) {
      // 若剩余可用量 <= 0，则返回 403 并提示
      const resetDate = usageData.usage.nextResetDate || '下个月某日';
      return NextResponse.json({
        error: "Monthly usage limit reached",
        message: `你本月的 Token 已经用完，预计在 ${resetDate} 重置。`
      }, { status: 403 });
    }

    // 2) 如果没有超额，继续原有逻辑，比如验证助手 ID
    try {
      // 调用 openai.beta.assistants.retrieve 检查该 assistant 是否存在
      await openai.beta.assistants.retrieve(config.assistantId);
    } catch (error) {
      console.error('[ERROR] 助手验证失败:', { error });
      return NextResponse.json({ 
        error: '助手ID无效',
        details: {
          message: error instanceof Error ? error.message : '未知错误',
          assistantId: config?.assistantId
        }
      }, { status: 400 });
    }

    // 3) 创建或获取现有的对话线程 (thread)
    let activeThreadId = threadId;
    let thread;
    if (threadId) {
      try {
        thread = await openai.beta.threads.retrieve(threadId);
        activeThreadId = threadId; // 如果能正常获取，沿用原线程
      } catch (error) {
        // 若获取失败，则新建
        console.warn('[WARN] 获取现有线程失败，将创建新线程:', error);
      }
    }
    // 如果前面没有拿到 thread，则新建
    if (!thread) {
      thread = await openai.beta.threads.create({
        metadata: {
          userId,
          type: config.type,
          assistantId: config.assistantId,
          vectorStoreId: config.vectorStoreId
        }
      });
      activeThreadId = thread.id;
    }

    // 4) 在该线程中添加一条用户消息
    await openai.beta.threads.messages.create(activeThreadId, {
      role: 'user',
      content: message
    });

    // 5) 创建一个 run，触发 AI 回复
    const run = await openai.beta.threads.runs.create(activeThreadId, {
      assistant_id: config.assistantId,
      max_completion_tokens: 1000
    });

    // 6) 轮询检查 run 的状态，直到完成或失败
    let runStatus = await openai.beta.threads.runs.retrieve(activeThreadId, run.id);
    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 暂停 1 秒后再次检查
      runStatus = await openai.beta.threads.runs.retrieve(activeThreadId, run.id);
    }

    if (runStatus.status !== 'completed') {
      console.error('[ERROR] 助手运行失败:', runStatus);
      return NextResponse.json({
        error: `Assistant run failed with status: ${runStatus.status}`
      }, { status: 500 });
    }

    // 7) 获取助手的回复文本
    const messages = await openai.beta.threads.messages.list(activeThreadId);
    const lastMessage = messages.data[0];
    // 下面的逻辑把所有 type === 'text' 的片段组合起来
    const assistantReply = lastMessage.content
      .filter(content => content.type === 'text')
      .map(content => (content.type === 'text' ? content.text.value : ''))
      .join('\n');

    // 8) 记录本次消息消耗的 Token 数量
    // runStatus 里通常有 usage 信息，如 runStatus.usage.total_tokens
    const tokensUsedThisTurn = runStatus.usage?.total_tokens ?? 0;

    try {
      // 将本次使用记录到 DynamoDB，以便 /api/usage/... 可以统计
      const dbConfig = await getDynamoDBConfig();
      const client = new DynamoDBClient(dbConfig);
      const docClient = DynamoDBDocumentClient.from(client);

      // 写入 ChatHistory 或其他表，以存储本次消息和消耗的 Token
      await docClient.send(new PutCommand({
        TableName: "ChatHistory",
        Item: {
          UserId: String(userId),
          ThreadId: activeThreadId,
          Type: 'message',         // 自定义类型，可标记是对话消息
          Message: message,        // 记录用户输入内容
          TokensUsed: tokensUsedThisTurn,
          Timestamp: new Date().toISOString()
        }
      }));
    } catch (dbError) {
      console.error('[ERROR] 保存 Token Usage 失败:', dbError);
      // 此处不抛错，以免影响正常返回
    }

    // 9) 返回给前端成功响应，其中包含 AI 回复
    return NextResponse.json({
      success: true,
      reply: assistantReply,
      threadId: activeThreadId,
      debug: {
        runStatus: runStatus.status,
        tokensUsedThisTurn
      }
    });

  } catch (error) {
    console.error('[ERROR] 聊天API错误:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

// 保留 OPTIONS 方法用于 CORS（如果你需要跨域支持）
export async function OPTIONS(request: Request) {
  // 视具体需求而定，此处只做示例
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',      // 或者限制指定域名
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// export async function POST(request: Request) {
//   try {
//     const { message, threadId, userId, config } = await request.json();

//     // 验证助手
//     try {
//       const assistant = await openai.beta.assistants.retrieve(config.assistantId);
//     } catch (error) {
//       console.error('[ERROR] 助手验证失败:', {
//         error,
//         assistantId: config?.assistantId,
//         errorType: error instanceof Error ? error.name : typeof error,
//         errorMessage: error instanceof Error ? error.message : String(error),
//         statusCode: (error as any)?.status || 'unknown'
//       });
//       return NextResponse.json({ 
//         error: '助手ID无效',
//         details: {
//           message: error instanceof Error ? error.message : '未知错误',
//           assistantId: config?.assistantId,
//           type: error instanceof Error ? error.name : typeof error
//         }
//       }, { status: 400 });
//     }

//     let activeThreadId = threadId;
//     let thread;

//     // 如果提供了现有线程ID，先尝试获取
//     if (threadId) {
//       try {
//         thread = await openai.beta.threads.retrieve(threadId);
//         activeThreadId = threadId;
//       } catch (error) {
//         console.warn('[WARN] 获取现有线程失败，将创建新线程:', error);
//       }
//     }

//     // 如果没有现有线程或获取失败，创建新线程
//     if (!thread) {
//       thread = await openai.beta.threads.create({
//         metadata: {
//           userId,
//           type: config.type,
//           assistantId: config.assistantId,
//           vectorStoreId: config.vectorStoreId
//         }
//       });
//       activeThreadId = thread.id;
//     }

//     await openai.beta.threads.messages.create(activeThreadId, {
//       role: 'user',
//       content: message
//     });

//     const run = await openai.beta.threads.runs.create(activeThreadId, {
//       assistant_id: config.assistantId,
//       max_completion_tokens: 1000
//     });

//     // 等待运行完成
//     let runStatus = await openai.beta.threads.runs.retrieve(
//       activeThreadId,
//       run.id
//     );

//     while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
//       await new Promise(resolve => setTimeout(resolve, 1000));
//       runStatus = await openai.beta.threads.runs.retrieve(
//         activeThreadId,
//         run.id
//       );
//     }

//     if (runStatus.status !== 'completed') {
//       console.error('[ERROR] 助手运行失败:', runStatus);
//       throw new Error(`Assistant run failed with status: ${runStatus.status}`);
//     }

//     // 获取助手的回复
//     const messages = await openai.beta.threads.messages.list(activeThreadId);
//     const lastMessage = messages.data[0];
//     const assistantReply = lastMessage.content
//       .filter(content => content.type === 'text')
//       .map(content => (content.type === 'text' ? content.text.value : ''))
//       .join('\n');
    
//     return NextResponse.json({
//       success: true,
//       reply: assistantReply,
//       threadId: activeThreadId,
//       debug: {
//         runStatus: runStatus.status,
//         messageCount: messages.data.length
//       }
//     });

//   } catch (error) {
//     console.error('[ERROR] 聊天API错误:', {
//       error,
//       type: error instanceof Error ? error.name : typeof error,
//       message: error instanceof Error ? error.message : String(error),
//       stack: error instanceof Error ? error.stack : undefined
//     });
//     return NextResponse.json({ 
//       error: error instanceof Error ? error.message : '未知错误',
//       details: error instanceof Error ? error.stack : undefined
//     }, { status: 500 });
//   }
// }

// // 保留 OPTIONS 方法用于 CORS
// export async function OPTIONS(request: Request) {
//   const origin = request.headers.get('origin');
//   const headers = setCORSHeaders(origin);
  
//   return new Response(null, {
//     status: 204,
//     headers
//   });
// }
