import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import OpenAI from 'openai';
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { ASSISTANT_IDS } from '../../config/constants';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 添加调试日志
console.log('[DEBUG] AWS 环境变量:', {
  region: process.env.AWS_REGION,
  hasAccessKey: !!process.env.NEXT_PUBLIC_ACCESS_KEY_ID,
  hasSecretKey: !!process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY,
  availableEnvVars: Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_'))
});

// 检查环境变量
const validateEnvVars = () => {
  const credentials = {
    region: process.env.NEXT_PUBLIC_REGION
  };

  console.log('[DEBUG] 验证环境变量:', {
    region: credentials.region,
    isAmplifyEnv: process.env.AWS_EXECUTION_ENV?.includes('AWS_Amplify')
  });

  if (!credentials.region) {
    throw new Error('AWS region not found');
  }

  return credentials;
};

// 创建 DynamoDB 客户端
const createDynamoDBClient = async () => {
  try {
    const { region } = validateEnvVars();
    const isDev = process.env.NODE_ENV === 'development';
    
    console.log('[DEBUG] 创建 DynamoDB 客户端:', {
      region,
      isDev,
      identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID,
      hasAccessKey: !!process.env.NEXT_PUBLIC_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY
    });

    // 本地开发环境使用访问密钥
    if (isDev) {
      return new DynamoDBClient({
        region,
        credentials: {
          accessKeyId: process.env.NEXT_PUBLIC_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY || ''
        }
      });
    }
    
    // 生产环境使用 Cognito Identity Pool
    try {
      const credentials = await fromCognitoIdentityPool({
        clientConfig: { region },
        identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID!
      })();

      return new DynamoDBClient({
        region,
        credentials
      });
    } catch (error) {
      console.error('[ERROR] Cognito 凭证获取失败:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('[ERROR] DynamoDB 客户端创建失败:', error);
    throw error;
  }
};

// 由于 createDynamoDBClient 现在是异步的，需要修改其他使用它的地方
const getDocClient = async () => {
  const client = await createDynamoDBClient();
  return DynamoDBDocumentClient.from(client);
};

// 获取用户的家校信息
export async function GET(request: Request) {
  try {
    console.log('[DEBUG] 开始获取家校信息');
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    console.log('[DEBUG] 请求参数:', { userId });

    if (!userId) {
      console.log('[DEBUG] 缺少 userId');
      return NextResponse.json({ error: 'UserId is required' }, { status: 400 });
    }

    const docClient = await getDocClient();
    const command = new GetCommand({
      TableName: 'HomeschoolPrompts',
      Key: { UserId: userId }
    });

    console.log('[DEBUG] DynamoDB 命令:', {
      TableName: command.input.TableName,
      Key: command.input.Key
    });

    const response = await docClient.send(command);
    console.log('[DEBUG] DynamoDB 响应:', response);
    
    return NextResponse.json(response.Item || {
      childName: '',
      basicInfo: '',
      recentChanges: ''
    });
  } catch (error) {
    console.error('[ERROR] 获取数据失败:', {
      error,
      type: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      envCheck: {
        hasRegion: !!process.env.AWS_REGION,
        hasAccessKey: !!process.env.NEXT_PUBLIC_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY,
        availableEnvVars: Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_'))
      }
    });
    return NextResponse.json({ error: '获取数据失败' }, { status: 500 });
  }
}

// 修改 POST 处理函数
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, childName, basicInfo, recentChanges } = body;

    if (!userId) {
      return NextResponse.json({ error: 'UserId is required' }, { status: 400 });
    }

    const docClient = await getDocClient();
    
    const command = new PutCommand({
      TableName: 'HomeschoolPrompts',
      Item: {
        UserId: String(userId),
        childName,
        basicInfo,
        recentChanges,
        assistantId: ASSISTANT_IDS.HOMESCHOOL,
        updatedAt: new Date().toISOString()
      }
    });

    await docClient.send(command);

    return NextResponse.json({ 
      success: true,
      assistantId: ASSISTANT_IDS.HOMESCHOOL
    });
  } catch (error) {
    console.error('[ERROR] 保存数据失败:', {
      error,
      type: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      envCheck: {
        hasRegion: !!process.env.AWS_REGION,
        hasAccessKey: !!process.env.NEXT_PUBLIC_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY,
        availableEnvVars: Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_'))
      }
    });
    return NextResponse.json({ error: '保存数据失败' }, { status: 500 });
  }
}

console.log('[DEBUG] 凭证检查:', {
  identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID,
  region: process.env.NEXT_PUBLIC_REGION,
  roleArn: process.env.AWS_LAMBDA_ROLE,
  // 其他相关配置
}); 