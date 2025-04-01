export async function getOpenAIResponse(prompt: string) {
  const response = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error('API 请求失败');
  }

  return await response.json();
} 