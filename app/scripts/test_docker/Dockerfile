# 使用AWS Lambda官方Python镜像
FROM public.ecr.aws/lambda/python:3.9

# 安装系统依赖
RUN yum update -y && \
    yum install -y \
    wget \
    tar \
    xz \
    gcc \
    make \
    git \
    && yum clean all

# 下载并安装静态编译的ffmpeg，并确保正确设置权限和位置
RUN mkdir -p /tmp/ffmpeg && \
    cd /tmp/ffmpeg && \
    wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    tar xf ffmpeg-release-amd64-static.tar.xz && \
    find . -name "ffmpeg" -type f -exec cp {} /usr/local/bin/ \; && \
    find . -name "ffprobe" -type f -exec cp {} /usr/local/bin/ \; && \
    chmod 755 /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    # 创建符号链接到/usr/bin目录以确保兼容性
    ln -sf /usr/local/bin/ffmpeg /usr/bin/ffmpeg && \
    ln -sf /usr/local/bin/ffprobe /usr/bin/ffprobe && \
    # 验证安装
    /usr/bin/ffmpeg -version && \
    /usr/bin/ffprobe -version && \
    cd / && \
    rm -rf /tmp/ffmpeg

# 设置环境变量
ENV PATH="/usr/local/bin:/usr/bin:${PATH}"
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV FFPROBE_PATH=/usr/local/bin/ffprobe

# 安装libsndfile
RUN yum install -y libsndfile

# 设置Torch和Whisper的缓存目录环境变量
ENV TORCH_HOME=/tmp
ENV XDG_CACHE_HOME=/tmp
ENV HF_HOME=/tmp/huggingface
ENV TRANSFORMERS_CACHE=/tmp/huggingface
ENV WHISPER_CACHE=/tmp/whisper

# 提高Lambda超时时间和内存设置
ENV AWS_LAMBDA_FUNCTION_TIMEOUT=900
ENV AWS_LAMBDA_FUNCTION_MEMORY_SIZE=3072
ENV APP_AWS_REGION=us-east-2
ENV AWS_LAMBDA_INITIALIZATION_TIMEOUT=300

# 复制依赖文件并安装
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# 创建Whisper缓存目录并预下载模型
RUN mkdir -p /tmp/whisper

# 复制Lambda函数代码
COPY lambda_function.py ${LAMBDA_TASK_ROOT}/

# Lambda处理程序
CMD ["lambda_function.lambda_handler"]
