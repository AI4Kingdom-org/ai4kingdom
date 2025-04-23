from pydub import AudioSegment
import soundfile as sf
import tempfile
import json
import os
import sys
import urllib.parse  # 添加URL解析模块
# 修改whisper导入，确保使用正确的包
import torch
# 设置Torch和Whisper的缓存目录到/tmp
os.environ["TORCH_HOME"] = "/tmp"
os.environ["XDG_CACHE_HOME"] = "/tmp"
os.environ["HF_HOME"] = "/tmp/huggingface"
os.environ["TRANSFORMERS_CACHE"] = "/tmp/huggingface"

# 改进Whisper导入逻辑
whisper = None
try:
    # 直接尝试导入whisper包
    import whisper
    print("[INFO] 使用标准whisper模块")
except ImportError:
    try:
        # 如果导入失败，尝试安装并导入
        print("[INFO] 尝试安装whisper包...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--no-cache-dir", "openai-whisper"])
        import whisper
        print("[INFO] 成功安装并导入whisper模块")
    except Exception as e:
        print(f"[ERROR] 无法导入whisper模块: {str(e)}")
        # 设置一个标志，表示whisper不可用
        whisper_available = False
    else:
        whisper_available = True
else:
    whisper_available = True

# 检查whisper是否可用
if not whisper_available:
    print("[ERROR] Whisper模块不可用，语音转文字功能将无法使用")

from pydub.utils import which
import subprocess
import boto3
from datetime import datetime

# 初始化 S3 客户端
s3_client = boto3.client('s3', region_name='us-east-2')

# 设置 ffmpeg 路径（适用于 AWS Lambda）
# 尝试动态查找ffmpeg路径
def find_ffmpeg():
    # 方法1：使用which查找
    ffmpeg_path = which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path
    
    # 方法2：尝试常见路径
    common_paths = [
        "/usr/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/opt/bin/ffmpeg",
        "/var/task/ffmpeg"  # Lambda层可能安装的位置
    ]
    
    for path in common_paths:
        if os.path.exists(path):
            return path
            
    # 方法3：使用subprocess查找
    try:
        result = subprocess.run(["find", "/", "-name", "ffmpeg", "-type", "f"], 
                               capture_output=True, text=True, timeout=5)
        paths = result.stdout.strip().split('\n')
        for path in paths:
            if path and os.path.exists(path):
                return path
    except Exception:
        pass
        
    return None

# 找到ffmpeg路径
ffmpeg_path = find_ffmpeg()
if ffmpeg_path:
    print(f"[INFO] 找到ffmpeg路径: {ffmpeg_path}")
    AudioSegment.converter = ffmpeg_path
    # 尝试在同目录找到ffprobe
    ffprobe_dir = os.path.dirname(ffmpeg_path)
    ffprobe_path = os.path.join(ffprobe_dir, "ffprobe")
    if os.path.exists(ffprobe_path):
        AudioSegment.ffprobe = ffprobe_path
    else:
        # 否则继续使用which查找
        AudioSegment.ffprobe = which("ffprobe")
else:
    # 记录错误但不立即退出，让Lambda记录更多信息
    print("[ERROR] 未找到ffmpeg路径，音频处理将失败")

# 加载 Whisper 模型
def load_whisper_model(model_size="base"):
    """加载 Whisper 模型"""
    if not whisper_available:
        raise Exception("Whisper模块不可用，无法加载模型")
        
    print(f"[DEBUG] 加载 Whisper {model_size} 模型...")
    
    # 确保下载路径是可写的
    download_root = "/tmp/whisper"
    os.makedirs(download_root, exist_ok=True)
    print(f"[INFO] 使用模型缓存目录: {download_root}")
    
    # 指定下载模型的位置
    return whisper.load_model(model_size, download_root=download_root)

def transcribe_audio(audio_path, model):
    """音频转录"""
    try:
        # 使用 soundfile 获取音频信息
        data, samplerate = sf.read(audio_path)
        duration = len(data) / samplerate
        
        print(f"[DEBUG] 音频时长: {duration:.2f} 秒")
        
        # 使用 Whisper 进行转录
        result = model.transcribe(audio_path)
        
        return {
            'success': True,
            'transcription': result["text"]
        }

    except Exception as e:
        print(f"[ERROR] 转录失败: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

def convert_to_mp3(input_path, output_path):
    """将音频/视频文件转换为 MP3 格式"""
    try:
        audio = AudioSegment.from_file(input_path)
        audio.export(output_path, format="mp3")
        return True
    except Exception as e:
        print(f"[ERROR] 音频转换失败: {str(e)}")
        return False

def lambda_handler(event, context):
    """AWS Lambda 入口点"""
    try:
        print("[INFO] 开始处理Lambda事件:", event)
        
        # 检查whisper是否可用
        if not whisper_available:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'success': False,
                    'error': "Whisper模块不可用，无法处理音频"
                }, ensure_ascii=False)
            }
        
        # 从事件中获取必要信息
        source_bucket = event['Records'][0]['s3']['bucket']['name']
        source_key = event['Records'][0]['s3']['object']['key']
        
        # URL解码S3对象键，处理如 %28, %29 等编码字符
        decoded_source_key = urllib.parse.unquote_plus(source_key)
        print(f"[INFO] 原始文件路径: {source_key}")
        print(f"[INFO] 解码后文件路径: {decoded_source_key}")
        
        file_name = os.path.basename(decoded_source_key)
        
        print(f"[INFO] 处理文件: {source_bucket}/{decoded_source_key}")
        
        # 从文件名中提取用户指定的名称（假设格式为：customName_timestamp.ext）
        custom_name = file_name.split('_')[0]
        
        # 设置临时工作目录
        with tempfile.TemporaryDirectory() as tmpdir:
            # 下载源文件
            input_path = os.path.join(tmpdir, file_name)
            print(f"[INFO] 下载文件到: {input_path}")
            
            # 使用解码后的路径下载
            try:
                s3_client.download_file(source_bucket, decoded_source_key, input_path)
                print(f"[INFO] 文件下载成功: {os.path.getsize(input_path)} 字节")
            except Exception as e:
                print(f"[ERROR] 下载文件失败，尝试使用原始路径: {str(e)}")
                # 如果解码路径不工作，尝试原始路径
                s3_client.download_file(source_bucket, source_key, input_path)
                print(f"[INFO] 使用原始路径下载成功: {os.path.getsize(input_path)} 字节")
            
            # 转换为 MP3（如果不是 MP3 格式）
            if not input_path.lower().endswith('.mp3'):
                print(f"[INFO] 文件不是MP3格式，进行转换")
                mp3_path = os.path.join(tmpdir, f"{os.path.splitext(file_name)[0]}.mp3")
                if not convert_to_mp3(input_path, mp3_path):
                    raise Exception("音频转换失败")
                audio_path = mp3_path
                print(f"[INFO] 转换为MP3成功: {os.path.getsize(audio_path)} 字节")
            else:
                audio_path = input_path
                print(f"[INFO] 文件已经是MP3格式")
            
            # 加载模型并转录
            print(f"[INFO] 开始加载转录模型")
            model = load_whisper_model()
            print(f"[INFO] 开始转录音频")
            result = transcribe_audio(audio_path, model)
            
            if not result['success']:
                raise Exception(result['error'])
            
            print(f"[INFO] 转录成功，转录文本长度: {len(result['transcription'])}")
            
            # 生成转录文本文件名
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            transcription_key = f"transcriptions/{custom_name}_{timestamp}.txt"
            
            # 将转录结果上传到 S3
            print(f"[INFO] 上传转录结果到: {source_bucket}/{transcription_key}")
            s3_client.put_object(
                Bucket=source_bucket,
                Key=transcription_key,
                Body=result['transcription'].encode('utf-8')
            )
            print(f"[INFO] 转录结果上传成功")
            
            # 删除源文件 (使用相同的路径删除)
            try:
                print(f"[INFO] 删除源文件: {source_bucket}/{decoded_source_key}")
                s3_client.delete_object(
                    Bucket=source_bucket,
                    Key=decoded_source_key
                )
                print(f"[INFO] 源文件删除成功")
            except Exception as e:
                print(f"[ERROR] 删除文件失败，尝试使用原始路径: {str(e)}")
                # 如果删除失败，尝试使用原始路径
                s3_client.delete_object(
                    Bucket=source_bucket,
                    Key=source_key
                )
                print(f"[INFO] 使用原始路径删除成功")
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'success': True,
                    'message': '文件处理成功',
                    'transcription_file': transcription_key
                }, ensure_ascii=False)
            }

    except Exception as e:
        print(f"[ERROR] 处理失败: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'error': str(e)
            }, ensure_ascii=False)
        }

# 用于本地测试
if __name__ == "__main__":
    # 假设环境变量中设置了测试URL
    test_url = os.environ.get('TEST_URL')
    if test_url:
        result = lambda_handler(test_url, None)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print("请设置 TEST_URL 环境变量以进行测试")
