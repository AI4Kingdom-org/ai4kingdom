import { NextResponse } from 'next/server';
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { createDynamoDBClient } from '../../utils/dynamodb';
import { PutCommand } from "@aws-sdk/lib-dynamodb";

export async function GET() {
  try {
    const docClient = await createDynamoDBClient();
    
    // 使用 Scan 而不是 Query，因为我们要按非主键字段过滤
    const command = new ScanCommand({
      TableName: 'SundayGuide',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'  // status 是保留字，需要使用表达式属性名
      },
      ExpressionAttributeValues: {
        ':status': 'active'
      }
    });

    const response = await docClient.send(command);
    
    // 按时间戳排序
    const items = response.Items || [];
    items.sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
    
    return NextResponse.json(items);
  } catch (error) {
    console.error('获取数据失败:', error);
    return NextResponse.json({ 
      error: '获取失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

// POST 方法用于创建新记录
export async function POST(request: Request) {
  try {
    const docClient = await createDynamoDBClient();
    const data = await request.json();
    
    const timestamp = new Date().toISOString();
    const item = {
      assistantId: data.assistantId,  // 必需字段
      Timestamp: timestamp,
      status: 'active',
      ...data
    };

    const command = new PutCommand({
      TableName: 'SundayGuide',
      Item: item
    });

    await docClient.send(command);
    
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('创建失败:', error);
    return NextResponse.json({ 
      error: '创建失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 