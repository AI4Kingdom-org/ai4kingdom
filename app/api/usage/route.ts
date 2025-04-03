import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { NextResponse } from "next/server";
import type { Subscription } from '../../types/auth';
import { getDynamoDBConfig } from "@/app/utils/dynamodb";

// 定义每周 Token 限制
interface UsageLimit {
  [key: string]: number;
  free: number;
  pro: number;
  ultimate: number;
}

// 示例：10K / 100K / ∞ tokens/week （可根据需要调整）
const WEEKLY_LIMITS: UsageLimit = {
  free: 10,
  pro: 100,
  ultimate: Infinity
};

// 获取用户订阅信息
async function getUserSubscription(userId: string): Promise<Subscription | null> {
  try {
    const response = await fetch(
      `https://ai4kingdom.com/wp-json/custom/v1/validate_session`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch subscription info');
    }

    const data = await response.json();
    return data.subscription || null;
  } catch (error) {
    console.error('[ERROR] 获取订阅信息失败:', error);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "UserId is required" }, { status: 400 });
  }

  try {
    console.log('[DEBUG] Starting usage check for userId:', userId);

    // 获取用户订阅信息
    const subscription = await getUserSubscription(userId);
    console.log('[DEBUG] User subscription:', subscription);

    if (!subscription || subscription.status !== 'active') {
      return NextResponse.json({
        error: "Inactive subscription",
        subscription,
        weeklyLimit: WEEKLY_LIMITS.free,
        weeklyCount: 0
      }, { status: 403 });
    }

    // 获取本周使用 Token 数
    const dbConfig = await getDynamoDBConfig();
    const client = new DynamoDBClient(dbConfig);
    const docClient = DynamoDBDocumentClient.from(client);

    // 获取本周开始时间 (假设周日 00:00)
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);

    // 计算下次重置时间（下周日 00:00）
    const nextResetDateObj = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextResetDate = nextResetDateObj.toISOString().split('T')[0]; 
    // e.g. "2025-03-18"

    // 查询本周的 ChatHistory
    const command = new QueryCommand({
      TableName: "ChatHistory",
      KeyConditionExpression: "UserId = :userId AND Timestamp >= :startTime",
      ExpressionAttributeValues: {
        ":userId": String(userId),
        ":startTime": startOfWeek.toISOString()
      }
    });

    const response = await docClient.send(command);

    // Sum up 'TokensUsed'
    let weeklyCount = 0;
    if (response.Items && response.Items.length > 0) {
      weeklyCount = response.Items.reduce((sum, item) => {
        const tokens = item.TokensUsed ? Number(item.TokensUsed) : 0;
        return sum + tokens;
      }, 0);
    }

    // 获取用户订阅类型对应的使用限制
    const subscriptionType = subscription?.type?.toLowerCase() || 'free';
    const weeklyLimit = WEEKLY_LIMITS[subscriptionType as keyof UsageLimit] || WEEKLY_LIMITS.free;

    // 角色检查
    const hasRequiredRole = subscription?.roles?.some(role => 
      ['free_member', 'pro_member', 'ultimate_member'].includes(role)
    );

    if (!hasRequiredRole) {
      return NextResponse.json({
        error: "Insufficient permissions",
        subscription,
        weeklyLimit: WEEKLY_LIMITS.free,
        weeklyCount: 0
      }, { status: 403 });
    }

    console.log('[DEBUG] Usage stats:', {
      weeklyCount,
      weeklyLimit,
      subscriptionType,
      remaining: weeklyLimit - weeklyCount,
      nextResetDate
    });

    // 返回信息包含 nextResetDate
    return NextResponse.json({
      weeklyCount,
      weeklyLimit,
      subscription,
      remaining: weeklyLimit - weeklyCount,
      nextResetDate,
      debug: {
        timestamp: new Date().toISOString(),
        startOfWeek: startOfWeek.toISOString()
      }
    });

  } catch (error) {
    console.error('[ERROR] Usage check failed:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      userId
    });

    return NextResponse.json({
      error: "Failed to fetch usage count",
      details: error instanceof Error ? error.message : '未知错误',
      debug: {
        timestamp: new Date().toISOString(),
        errorType: error instanceof Error ? error.name : 'Unknown'
      }
    }, { status: 500 });
  }
}

// import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
// import { NextResponse } from "next/server";
// import type { Subscription } from '../../types/auth';
// import { getDynamoDBConfig } from "@/app/utils/dynamodb";

// // 定义使用限制
// interface UsageLimit {
//   [key: string]: number;
//   free: number;
//   pro: number;
//   ultimate: number;
// }

// const WEEKLY_LIMITS: UsageLimit = {
//   free: 10,
//   pro: 100,
//   ultimate: Infinity
// };

// // 获取用户订阅信息
// async function getUserSubscription(userId: string): Promise<Subscription | null> {
//   try {
//     const response = await fetch(
//       `https://ai4kingdom.com/wp-json/custom/v1/validate_session`,
//       {
//         method: 'POST',
//         credentials: 'include',
//         headers: {
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({ userId })
//       }
//     );

//     if (!response.ok) {
//       throw new Error('Failed to fetch subscription info');
//     }

//     const data = await response.json();
//     return data.subscription || null;
//   } catch (error) {
//     console.error('[ERROR] 获取订阅信息失败:', error);
//     return null;
//   }
// }

// export async function GET(request: Request) {
//   const { searchParams } = new URL(request.url);
//   const userId = searchParams.get("userId");

//   if (!userId) {
//     return NextResponse.json({ error: "UserId is required" }, { status: 400 });
//   }

//   try {
//     console.log('[DEBUG] Starting usage check for userId:', userId);

//     // 获取用户订阅信息
//     const subscription = await getUserSubscription(userId);
//     console.log('[DEBUG] User subscription:', subscription);

//     if (!subscription || subscription.status !== 'active') {
//       return NextResponse.json({
//         error: "Inactive subscription",
//         subscription,
//         weeklyLimit: WEEKLY_LIMITS.free,
//         weeklyCount: 0
//       }, { status: 403 });
//     }

//     // 获取本周使用次数
//     const dbConfig = await getDynamoDBConfig();
//     const client = new DynamoDBClient(dbConfig);
//     const docClient = DynamoDBDocumentClient.from(client);

//     // 获取本周开始时间
//     const now = new Date();
//     const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
//     startOfWeek.setHours(0, 0, 0, 0);

//     const command = new QueryCommand({
//       TableName: "ChatHistory",
//       KeyConditionExpression: "UserId = :userId AND Timestamp >= :startTime",
//       ExpressionAttributeValues: {
//         ":userId": String(userId),
//         ":startTime": startOfWeek.toISOString()
//       }
//     });

//     const response = await docClient.send(command);
//     const weeklyCount = response.Items?.length || 0;

//     // 获取用户类型对应的使用限制
//     const subscriptionType = subscription?.type?.toLowerCase() || 'free';
//     const weeklyLimit = WEEKLY_LIMITS[subscriptionType as keyof UsageLimit] || WEEKLY_LIMITS.free;

//     // 添加角色检查
//     const hasRequiredRole = subscription?.roles?.some(role => 
//       ['free_member', 'pro_member', 'ultimate_member'].includes(role)
//     );

//     if (!hasRequiredRole) {
//       return NextResponse.json({
//         error: "Insufficient permissions",
//         subscription,
//         weeklyLimit: WEEKLY_LIMITS.free,
//         weeklyCount: 0
//       }, { status: 403 });
//     }

//     console.log('[DEBUG] Usage stats:', {
//       weeklyCount,
//       weeklyLimit,
//       subscriptionType,
//       remaining: weeklyLimit - weeklyCount
//     });

//     return NextResponse.json({
//       weeklyCount,
//       weeklyLimit,
//       subscription,
//       remaining: weeklyLimit - weeklyCount,
//       debug: {
//         timestamp: new Date().toISOString(),
//         startOfWeek: startOfWeek.toISOString()
//       }
//     });

//   } catch (error) {
//     console.error('[ERROR] Usage check failed:', {
//       message: error instanceof Error ? error.message : 'Unknown error',
//       userId
//     });

//     return NextResponse.json({
//       error: "Failed to fetch usage count",
//       details: error instanceof Error ? error.message : '未知错误',
//       debug: {
//         timestamp: new Date().toISOString(),
//         errorType: error instanceof Error ? error.name : 'Unknown'
//       }
//     }, { status: 500 });
//   }
// } 
