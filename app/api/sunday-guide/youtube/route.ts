import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createDynamoDBClient } from '../../../utils/dynamodb';
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { PythonShell } from 'python-shell';
import { join } from 'path';
import { unlink, writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Python 脚本内容
const PYTHON_SCRIPT = `
from yt_dlp import YoutubeDL
from pydub import AudioSegment
import tempfile
import sys
import json
import os

def progress_hook(d):
    if d['status'] == 'downloading':
        try:
            percent = d['_percent_str']
            print(f"[DEBUG] 下载进度: {percent}", file=sys.stderr)
        except:
            pass
    elif d['status'] == 'finished':
        print(f"[DEBUG] 下载完成，开始处理...", file=sys.stderr)

def transcribe_chunks(audio_path, client):
    try:
        # 加载音频文件
        audio = AudioSegment.from_file(audio_path)
        chunk_size = 10 * 60 * 1000  # 10分钟
        chunks = [audio[i:i + chunk_size] for i in range(0, len(audio), chunk_size)]
        
        print(f"[DEBUG] 音频分割为 {len(chunks)} 个片段", file=sys.stderr)
        full_transcription = ""
        
        # 逐段转录
        with tempfile.TemporaryDirectory() as tmpdir:
            for idx, chunk in enumerate(chunks):
                chunk_path = f"{tmpdir}/chunk_{idx + 1}.mp3"
                chunk.export(chunk_path, format="mp3")
                print(f"[DEBUG] 转录片段 {idx + 1}/{len(chunks)}...", file=sys.stderr)
                
                with open(chunk_path, "rb") as audio_file:
                    transcription = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                    )
                    full_transcription += transcription.text + "\\n"
        
        return {
            'success': True,
            'transcription': full_transcription
        }
    except Exception as e:
        print(f"[ERROR] 转录失败: {str(e)}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e)
        }

def download_audio(url, output_path):
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': f'{tmpdir}/audio.%(ext)s',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'progress_hooks': [progress_hook],
                'quiet': False,  # 启用输出以便调试
                'verbose': True  # 显示详细信息
            }
            
            print("[DEBUG] 开始下载音频...", file=sys.stderr)
            try:
                with YoutubeDL(ydl_opts) as ydl:
                    print("[DEBUG] 提取视频信息...", file=sys.stderr)
                    info = ydl.extract_info(url, download=True)
                    print("[DEBUG] 视频信息提取完成", file=sys.stderr)
                    audio_file_path = ydl.prepare_filename(info).replace('.webm', '.mp3')
                    
                    if os.path.exists(audio_file_path):
                        print("[DEBUG] 音频下载完成", file=sys.stderr)
                        print(f"[DEBUG] 音频文件大小: {os.path.getsize(audio_file_path)} bytes", file=sys.stderr)
                        # 转录音频
                        from openai import OpenAI
                        client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))
                        return transcribe_chunks(audio_file_path, client)
                    else:
                        print(f"[ERROR] 音频文件未生成: {audio_file_path}", file=sys.stderr)
                        return {
                            'success': False,
                            'error': 'Audio file not generated'
                        }
            except Exception as e:
                print(f"[ERROR] YoutubeDL 错误: {str(e)}", file=sys.stderr)
                raise
    except Exception as e:
        print(f"[ERROR] 下载失败: {str(e)}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) < 4:
        result = {
            'success': False,
            'error': 'Missing arguments'
        }
    else:
        url = sys.argv[1]
        output_path = sys.argv[2]
        json_path = sys.argv[3]
        result = download_audio(url, output_path)
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)
`;

interface TranscriptionResult {
  success: boolean;
  transcription?: string;
  error?: string;
}

async function transcribeYouTube(url: string): Promise<string> {
  const tempDir = '/tmp/youtube-temp';
  const outputPath = join(tempDir, `${Date.now()}.mp3`);
  const scriptPath = join(tempDir, 'youtube_downloader.py');
  const jsonPath = join(tempDir, `${Date.now()}.json`);
  
  try {
    // 创建临时目录
    await mkdir(tempDir, { recursive: true });
    
    // 写入Python脚本
    await writeFile(scriptPath, PYTHON_SCRIPT);
    
    // 设置 Python 环境
    const pythonPath = process.env.LAMBDA_TASK_ROOT 
      ? join(process.env.LAMBDA_TASK_ROOT, 'opt/python/python3')
      : '/opt/python/python3';
    
    const pythonLibPath = process.env.LAMBDA_TASK_ROOT 
      ? join(process.env.LAMBDA_TASK_ROOT, 'opt/python')
      : '/opt/python';

    console.log('[DEBUG] Python路径:', pythonPath);
    console.log('[DEBUG] Python库路径:', pythonLibPath);

    // 下载并转录 YouTube 音频
    const result = await new Promise<TranscriptionResult>((resolve, reject) => {
      const pyshell = new PythonShell(scriptPath, {
        args: [url, outputPath, jsonPath],
        pythonPath: pythonPath,
        pythonOptions: ['-u'],
        mode: 'text',
        env: {
          ...process.env,
          PYTHONPATH: pythonLibPath,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          PATH: `${pythonLibPath}/bin:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
        }
      });

      // 增加超时时间到 15 分钟
      const timeout = setTimeout(() => {
        console.log('[DEBUG] Python 脚本执行超时');
        pyshell.terminate();
        reject(new Error('Python 脚本执行超时'));
      }, 900000);

      pyshell.on('stderr', (stderr) => {
        console.log('[Python stderr]:', Buffer.from(stderr).toString('utf8'));
      });

      pyshell.on('stdout', (stdout) => {
        console.log('[Python stdout]:', Buffer.from(stdout).toString('utf8'));
      });

      pyshell.on('error', (err) => {
        console.error('[Python error]:', err);
        reject(err);
      });

      pyshell.end(async (err) => {
        clearTimeout(timeout);
        if (err) {
          console.error('[ERROR] Python 执行错误:', err);
          reject(err);
          return;
        }
        
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          if (!existsSync(jsonPath)) {
            console.error('[ERROR] JSON 文件不存在:', jsonPath);
            reject(new Error('JSON 文件不存在'));
            return;
          }
          
          const jsonContent = await readFile(jsonPath, 'utf-8');
          console.log('[DEBUG] JSON 文件内容:', jsonContent);
          
          const result = JSON.parse(jsonContent);
          
          if (!result.success) {
            reject(new Error(result.error || '转录失败'));
            return;
          }
          
          resolve(result);
        } catch (e) {
          console.error('[ERROR] 处理 Python 输出失败:', e);
          reject(e);
        } finally {
          await cleanupFiles([scriptPath]);
        }
      });
    });
    
    console.log('[DEBUG] 处理完成:', result);
    if (!result.transcription) {
      throw new Error('转录结果为空');
    }
    return result.transcription;
  } catch (error) {
    console.error('[ERROR] 处理失败:', error);
    await cleanupFiles([jsonPath, outputPath, scriptPath]);
    throw error;
  }
}

async function cleanupFiles(files: string[]) {
  for (const file of files) {
    try {
      if (existsSync(file)) {
        await unlink(file);
        console.log('[DEBUG] 成功删除文件:', file);
      }
    } catch (e) {
      console.error(`[ERROR] 清理文件失败 ${file}:`, e);
    }
  }
}

// 在文件顶部添加新的接口
interface AssistantResponse {
  id: string;
  object: string;
  created_at: number;
  name: string;
  description: string | null;
  model: string;
  instructions: string;
  tools: Array<{ type: string }>;
  file_id?: string;  // 改为可选
}

// 添加新的函数来处理对话
async function processSermonContent(assistantId: string, threadId: string) {
  // 1. 获取信息总结
  const summaryMessage = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: `请用中文总结讲道的内容。如果讲道包含多个部分，请确保每个部分都被覆盖。
列出牧师强调的要点。
提取讲道中提到的所有经文。如果任何经文引用不清楚，请在圣经中找到正确的段落。
如果讲道是中文，请使用"和合本圣经"版本。
如果讲道是英文，请使用NIV版本。
复制并粘贴圣经经文以确保准确性。`
  });
  const summaryResult = await waitForRunCompletion(threadId, summaryMessage.id, assistantId);

  // 2. 获取每日灵修
  const devotionMessage = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: `请用中文创造讲道的每日灵修。为了帮助教会成员在一周内学习和反思讲道，将讲道分为五个部分进行每日学习（周一到周五）。对于每一天：
提供该部分讲道的总结。
从该部分提取最多三节圣经经文。
根据讲道的信息提供祷告指导。`
  });
  const devotionResult = await waitForRunCompletion(threadId, devotionMessage.id, assistantId);

  // 3. 获取查经指引
  const bibleStudyMessage = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: `请用中文创造讲道的小组查经指引。为了促进基于讲道的小组查经，请提供：
背景：讲道的总结及其与基督教生活的相关性。
讲道中强调的三个重要点。
讲道中提到的三到五节圣经经文。
三个讨论问题，帮助成员反思信息及其圣经基础。
一到两个个人应用问题，挑战成员将讲道的信息付诸实践。
祷告指导，鼓励成员为应用信息的力量祈祷。`
  });
  const bibleStudyResult = await waitForRunCompletion(threadId, bibleStudyMessage.id, assistantId);

  // 打印日志以验证结果
  console.log('[DEBUG] 处理结果:', {
    summaryLength: summaryResult.length,
    devotionLength: devotionResult.length,
    bibleStudyLength: bibleStudyResult.length
  });

  return {
    sermon_summary: summaryResult,
    daily_devotion: devotionResult,
    bible_study_guide: bibleStudyResult
  };
}

// 等待运行完成的辅助函数
async function waitForRunCompletion(threadId: string, runId: string, assistantId: string) {
  // 创建 run
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId
  });

  // 等待 run 完成
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
  while (runStatus.status !== 'completed') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
  }

  // 获取该 run 对应的消息
  const messages = await openai.beta.threads.messages.list(threadId, {
    order: 'desc',  // 最新的消息在前
    limit: 1,       // 只获取一条
    before: runId   // 获取这个 run 之前的消息
  });

  const message = messages.data[0]?.content[0];
  return message?.type === 'text' ? message.text.value : '';
}

// 添加文件状态检查函数
async function waitForFileProcessing(vectorStoreId: string, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const files = await openai.beta.vectorStores.files.list(vectorStoreId);
    console.log(`[DEBUG] 检查文件状态 (尝试 ${i + 1}/${maxAttempts}):`, 
      files.data.map(f => ({ id: f.id, status: f.status }))
    );

    // 检查所有文件是否都处理完成
    const allProcessed = files.data.every(f => f.status === 'completed');
    if (allProcessed) {
      console.log('[DEBUG] 所有文件处理完成');
      return true;
    }

    // 等待5秒后重试
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error('文件处理超时');
}

const executePythonScript = (url: string, outputPath: string) => {
  return new Promise((resolve, reject) => {
    // 使用python3而不是python
    const pythonProcess = spawn('/usr/bin/python3', [
      '-u',  // 使用无缓冲输出
      join(process.cwd(), 'app/scripts/youtube_downloader.py'),
      url,
      outputPath
    ]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('[Python stdout]:', data.toString());
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('[Python stderr]:', data.toString());
    });

    pythonProcess.on('error', (error) => {
      console.error('[Python process error]:', error);
      reject(error);
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python进程退出，代码: ${code}`);
        reject(new Error(`Python进程失败: ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`解析Python输出失败: ${stdout}`));
      }
    });
  });
};

// 修改环境检查函数
async function checkPythonEnvironment() {
  const pythonPath = process.env.LAMBDA_TASK_ROOT 
    ? join(process.env.LAMBDA_TASK_ROOT, 'opt/python/python3')
    : '/opt/python/python3';

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(pythonPath, ['--version']);
    
    pythonProcess.stdout.on('data', (data) => {
      console.log('[DEBUG] Python 版本:', data.toString());
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('[ERROR] Python 检查错误:', data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`Python 检查失败，退出代码: ${code}`));
      }
    });
  });
}

export async function POST(request: Request) {
  try {
    // 检查 Python 环境
    try {
      await checkPythonEnvironment();
      console.log('[DEBUG] Python 环境检查通过');
    } catch (error) {
      console.error('[ERROR] Python 环境检查失败:', error);
      return NextResponse.json({
        error: 'Python 环境检查失败',
        details: error instanceof Error ? error.message : '未知错误'
      }, { status: 500 });
    }

    const { url, userId } = await request.json();
    const timestamp = new Date().toISOString();
    
    console.log('[DEBUG] 开始处理视频:', { url, userId });
    
    // 1. 转录视频
    try {
      const transcription = await transcribeYouTube(url);
      console.log('[DEBUG] 转录完成, 长度:', transcription.length);
      
      // 2. 创建文件
      const formData = new FormData();
      formData.append('file', new Blob([transcription], { type: 'text/plain' }), 'sermon.txt');
      const file = await openai.files.create({
        file: formData.get('file') as File,
        purpose: "assistants"
      });
      console.log('[DEBUG] 文件创建成功:', file.id);

      // 3. 创建 Vector Store
      const vectorStore = await openai.beta.vectorStores.create({
        name: `Vector Store ${timestamp}`,
      });
      console.log('[DEBUG] Vector Store 创建成功:', vectorStore.id);

      // 4. 将文件添加到 Vector Store
      await openai.beta.vectorStores.files.create(
        vectorStore.id,
        { file_id: file.id }
      );
      console.log('[DEBUG] 文件已添加到 Vector Store');

      // 等待文件处理完成
      await waitForFileProcessing(vectorStore.id);

      // 5. 创建 Assistant
      const assistant = await openai.beta.assistants.create({
        name: `YouTube Assistant ${timestamp}`,
        instructions: "我是教会的牧师，在主日进行了讲道。现在，我希望让教会成员在回家后能够轻松复习和学习这篇讲道内容。讲道内容已存储在 OpenAI 的文件搜索向量存储中。请检索最相关的讲道，并按照以下要求进行处理。",
        model: "gpt-4-1106-preview",
        tools: [{ type: "file_search" }]
      });
      console.log('[DEBUG] Assistant 创建成功:', assistant.id);

      // 6. 绑定 Vector Store
      await openai.beta.assistants.update(
        assistant.id,
        {
          tools: [{ type: "file_search" }],
          tool_resources: {
            file_search: {
              vector_store_ids: [vectorStore.id]
            }
          },
          metadata: {
            vector_store_id: vectorStore.id
          }
        }
      );
      console.log('[DEBUG] Vector Store 绑定成功');

      // 7. 创建线程并处理内容
      const thread = await openai.beta.threads.create();
      console.log('[DEBUG] 线程创建成功:', thread.id);
      
      const sermonContent = await processSermonContent(assistant.id, thread.id);
      console.log('[DEBUG] 内容处理完成');

      // 8. 保存到 DynamoDB
      const item = {
        assistantId: assistant.id,
        vectorStoreId: vectorStore.id,
        fileId: file.id,
        UserId: userId,
        Timestamp: timestamp,
        youtubeUrl: url,
        status: 'active',
        type: 'youtube',
        transcription,
        instructions: assistant.instructions,
        model: assistant.model,
        sermon_summary: sermonContent.sermon_summary,
        daily_devotion: sermonContent.daily_devotion,
        bible_study_guide: sermonContent.bible_study_guide
      };

      const docClient = await createDynamoDBClient();
      await docClient.send(new PutCommand({
        TableName: 'SundayGuide',
        Item: item
      }));
      console.log('[DEBUG] 数据保存到 DynamoDB 成功');

      return NextResponse.json({ 
        success: true,
        assistantId: assistant.id,
        vectorStoreId: vectorStore.id,
        fileId: file.id,
        timestamp,
        transcriptionLength: transcription.length
      });

    } catch (error) {
      console.error('[ERROR] 详细错误:', {
        error,
        message: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;  // 重新抛出错误以便外层捕获
    }
  } catch (error) {
    console.error('[ERROR] 处理失败:', error);
    return NextResponse.json({ 
      error: '处理失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
} 