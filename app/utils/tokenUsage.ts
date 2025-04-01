import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createDynamoDBClient } from "./dynamodb";

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  retrieval_tokens: number;
}

export async function saveTokenUsage(userId: string | undefined, threadId: string, usage: TokenUsage) {
  try {
    // 如果没有 userId，生成一个匿名ID
    const effectiveUserId = userId || `ANON_${new Date().getTime()}`;
    
    const docClient = await createDynamoDBClient();
    
    const timestamp = new Date().toISOString();
    const item = {
      UserId: String(effectiveUserId),  // 确保 UserId 是字符串类型
      Timestamp: timestamp,     // 排序键
      ThreadId: threadId,
      PromptTokens: usage.prompt_tokens,
      CompletionTokens: usage.completion_tokens,
      TotalTokens: usage.total_tokens,
      RetrievalTokens: usage.retrieval_tokens,
      Type: 'token_usage'
    };

    console.log('[DEBUG] 准备保存Token使用记录:', item);

    await docClient.send(new PutCommand({
      TableName: 'TokenUsage',
      Item: item
    }));

    console.log('[DEBUG] Token使用记录已保存:', {
      userId: effectiveUserId,
      threadId,
      timestamp,
      usage
    });
  } catch (error) {
    // 记录错误但不抛出，避免影响主流程
    console.error('[ERROR] 保存Token使用记录失败:', {
      error,
      userId,
      threadId
    });
  }
} 