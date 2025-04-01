import { NextResponse } from 'next/server';
import { createDynamoDBClient } from '../../../../utils/dynamodb';
import { ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

interface Assistant {
  assistantId: string;
  Timestamp: string;
  instructions?: string;
  model?: string;
  status?: string;
  transcription?: string;
}

export async function GET(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    const { assistantId } = params;
    console.log('获取助手信息:', assistantId);

    const docClient = await createDynamoDBClient();
    const command = new ScanCommand({
      TableName: 'SundayGuide',
      FilterExpression: 'assistantId = :assistantId',
      ExpressionAttributeValues: {
        ':assistantId': assistantId
      }
    });

    const response = await docClient.send(command);
    console.log('DynamoDB 响应:', {
      metadata: response.$metadata,
      count: response.Count,
      scannedCount: response.ScannedCount,
      items: response.Items
    });
    
    if (!response.Items || response.Items.length === 0) {
      return NextResponse.json(
        { error: '助手不存在' },
        { status: 404 }
      );
    }

    const assistant = response.Items[0];
    return NextResponse.json(assistant);
  } catch (error) {
    console.error('获取助手信息失败:', error);
    return NextResponse.json(
      { error: '获取助手信息失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    const { assistantId } = params;
    const { transcription } = await request.json();

    if (!transcription) {
      return NextResponse.json(
        { error: '缺少转录文本' },
        { status: 400 }
      );
    }

    const docClient = await createDynamoDBClient();
    const getCommand = new ScanCommand({
      TableName: 'SundayGuide',
      FilterExpression: 'assistantId = :assistantId',
      ExpressionAttributeValues: {
        ':assistantId': assistantId
      }
    });

    const getResponse = await docClient.send(getCommand);
    if (!getResponse.Items || getResponse.Items.length === 0) {
      return NextResponse.json(
        { error: '助手不存在' },
        { status: 404 }
      );
    }

    const existingItem = getResponse.Items[0];
    
    const command = new UpdateCommand({
      TableName: 'SundayGuide',
      Key: {
        assistantId: assistantId,
        Timestamp: existingItem.Timestamp
      },
      UpdateExpression: 'SET transcription = :transcription',
      ExpressionAttributeValues: {
        ':transcription': transcription
      },
      ReturnValues: 'ALL_NEW'
    });

    const result = await docClient.send(command);
    console.log('更新结果:', result);

    return NextResponse.json({
      success: true,
      message: '转录文本更新成功',
      data: result.Attributes
    });
  } catch (error) {
    console.error('更新转录文本失败:', error);
    return NextResponse.json(
      { error: '更新转录文本失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { assistantId: string } }
) {
  try {
    const { assistantId } = params;
    console.log('删除助手:', assistantId);

    const docClient = await createDynamoDBClient();
    // 先获取记录以获取 Timestamp
    const getCommand = new ScanCommand({
      TableName: 'SundayGuide',
      FilterExpression: 'assistantId = :assistantId',
      ExpressionAttributeValues: {
        ':assistantId': assistantId
      }
    });

    const getResponse = await docClient.send(getCommand);
    if (!getResponse.Items || getResponse.Items.length === 0) {
      return NextResponse.json(
        { error: '助手不存在' },
        { status: 404 }
      );
    }

    const item = getResponse.Items[0];
    
    // 删除记录
    const command = new DeleteCommand({
      TableName: 'SundayGuide',
      Key: {
        assistantId: assistantId,
        Timestamp: item.Timestamp
      }
    });

    await docClient.send(command);

    return NextResponse.json({
      success: true,
      message: '助手删除成功'
    });
  } catch (error) {
    console.error('删除助手失败:', error);
    return NextResponse.json(
      { error: '删除助手失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
} 