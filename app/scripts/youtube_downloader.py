from yt_dlp import YoutubeDL
import sys
import json
import os

def download_audio(url, output_path):
    print(f"开始下载: {url}", file=sys.stderr)
    print(f"输出路径: {output_path}", file=sys.stderr)
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_path,
        'quiet': False,  # 显示下载进度
        'no_warnings': False  # 显示警告信息
    }
    
    try:
        print(f"当前工作目录: {os.getcwd()}", file=sys.stderr)
        with YoutubeDL(ydl_opts) as ydl:
            print("开始下载...", file=sys.stderr)
            ydl.download([url])
            print("下载完成", file=sys.stderr)
        return {'success': True, 'output_path': output_path}
    except Exception as e:
        print(f"下载失败: {str(e)}", file=sys.stderr)
        return {'success': False, 'error': str(e)}

def check_environment():
    """检查运行环境"""
    try:
        # 检查必要的命令是否存在
        import shutil
        python_path = shutil.which('python3') or shutil.which('python')
        ffmpeg_path = shutil.which('ffmpeg')
        
        print(f"Python路径: {python_path}", file=sys.stderr)
        print(f"FFmpeg路径: {ffmpeg_path}", file=sys.stderr)
        print(f"Python版本: {sys.version}", file=sys.stderr)
        print(f"系统环境变量PATH: {os.environ.get('PATH')}", file=sys.stderr)
        
        if not ffmpeg_path:
            raise RuntimeError("FFmpeg未安装或不在PATH中")
            
    except Exception as e:
        print(f"环境检查失败: {str(e)}", file=sys.stderr)
        return False
    return True

if __name__ == '__main__':
    if not check_environment():
        print(json.dumps({
            'success': False,
            'error': '环境检查失败'
        }))
        sys.exit(1)
    
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': f'参数不足. 需要 URL 和输出路径. 收到的参数: {sys.argv}'
        }))
        sys.exit(1)
        
    url = sys.argv[1]
    output_path = sys.argv[2]
    result = download_audio(url, output_path)
    print(json.dumps(result)) 