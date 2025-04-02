import { NextResponse } from 'next/server';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDBConfig } from "@/app/utils/dynamodb";

interface MonthlyUsageLimit {
  [key: string]: number;
  free: number;
  pro: number;
  ultimate: number;
}

// 设置月度 Token 限制
const MONTHLY_LIMITS: MonthlyUsageLimit = {
  free: 100000,      
  pro: 1000000,      
  ultimate: Infinity 
};

// 从 WordPress 会员系统获取用户订阅信息
async function getUserSubscription(userId: string) {
  try {
    // 向自定义 WP 接口发送请求，获取订阅数据
    const response = await fetch(
      `https://ai4kingdom.com/wp-json/custom/v1/validate_session`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      }
    );
    // 如果响应状态非 200
    if (!response.ok) {
      throw new Error('Failed to fetch subscription info');
    }
    // 解析 JSON
    const data = await response.json();
    return data.subscription || null;
  } catch (error) {
    console.error('[ERROR] 获取订阅信息失败:', error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    // 从 URL 中获取查询参数
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // 如果前端没有提供 year 或 month，取当前年份、月份
    const year = searchParams.get("year") || new Date().getFullYear().toString();
    const month = searchParams.get("month") 
                  || String(new Date().getMonth() + 1).padStart(2, '0');

    // 返回 400
    if (!userId) {
      return NextResponse.json({ error: "UserId is required" }, { status: 400 });
    }

    // 1）获取用户订阅信息，判断是否有效
    const subscription = await getUserSubscription(userId);
    if (!subscription || subscription.status !== 'active') {
      return NextResponse.json(
        { error: 'User subscription inactive or missing', subscription }, 
        { status: 403 }
      );
    }

    // 2）根据 subscription.type 来确定用户是 free、pro 还是 ultimate
    const subscriptionType = subscription.type?.toLowerCase() || 'free';

    // 3）获取对应的月度限制
    const monthlyLimit = MONTHLY_LIMITS[subscriptionType as keyof MonthlyUsageLimit] 
                         ?? MONTHLY_LIMITS.free;

    // 初始化 DynamoDB 客户端
    const config = await getDynamoDBConfig();
    const client = new DynamoDBClient(config);
    const docClient = DynamoDBDocumentClient.from(client);

    // yearMonth 形如 "2025-03"
    const yearMonth = `${year}-${month.padStart(2, '0')}`;

    // 假设我们在 "MonthlyTokenUsage" 表里用 (UserId + YearMonth) 作为 key
    const command = new QueryCommand({
      TableName: "MonthlyTokenUsage",
      KeyConditionExpression: "UserId = :userId AND YearMonth = :ym",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":ym": yearMonth
      }
    });

    // 发送查询
    const response = await docClient.send(command);

    // 累加本月已使用的 Token 数量
    let monthlyCount = 0;
    if (response.Items && response.Items.length > 0) {
      monthlyCount = response.Items.reduce((sum, item) => {
        const tokens = item.TokensUsed ? Number(item.TokensUsed) : 0;
        return sum + tokens;
      }, 0);
    }

    // 如果需要强制执行月度限制，可以在此处比较 monthlyCount 和 monthlyLimit
    const remaining = monthlyLimit === Infinity
      ? Infinity
      : (monthlyLimit - monthlyCount);

    // 计算下一次重置日期（示例：下个月的 1 号）
    // 可更改为订阅周期的续费日
    const yearInt = parseInt(year, 10);
    const monthInt = parseInt(month, 10);
    let nextMonth = monthInt + 1;
    let nextYear = yearInt;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const nextResetDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // 返回给前端的 JSON
    return NextResponse.json({
      success: true,
      usage: {
        subscriptionType,
        monthlyLimit,
        monthlyCount,
        remaining,
        nextResetDate,
        yearMonth
      }
    });

  } catch (error) {
    console.error('[ERROR] 获取月度使用统计失败:', error);
    return NextResponse.json({
      error: '获取使用统计失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

// import { NextResponse } from 'next/server';
// import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
// import { getDynamoDBConfig } from "@/app/utils/dynamodb";

// export async function GET(request: Request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const userId = searchParams.get("userId");
//     const year = searchParams.get("year") || new Date().getFullYear();
    
//     if (!userId) {
//       return NextResponse.json({ error: "UserId is required" }, { status: 400 });
//     }

//     const config = await getDynamoDBConfig();
//     const client = new DynamoDBClient(config);
//     const docClient = DynamoDBDocumentClient.from(client);

//     // 查询指定年份的所有月份数据
//     const command = new QueryCommand({
//       TableName: "MonthlyTokenUsage",
//       KeyConditionExpression: "UserId = :userId AND begins_with(YearMonth, :year)",
//       ExpressionAttributeValues: {
//         ":userId": userId,
//         ":year": `${year}`
//       }
//     });

//     const response = await docClient.send(command);
    
//     return NextResponse.json({
//       success: true,
//       usage: response.Items || []
//     });

//   } catch (error) {
//     console.error('[ERROR] 获取月度使用统计失败:', error);
//     return NextResponse.json({
//       error: '获取使用统计失败',
//       details: error instanceof Error ? error.message : '未知错误'
//     }, { status: 500 });
//   }
// } 
