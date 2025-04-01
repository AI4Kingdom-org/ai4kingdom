'use client';

import { useState } from 'react';
import styles from './YouTubeUploader.module.css';

interface YouTubeUploaderProps {
  onVectorStoreCreated?: (vectorStoreId: string) => void;
}

export default function YouTubeUploader({ onVectorStoreCreated }: YouTubeUploaderProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!url.trim()) return;
    
    try {
      setIsLoading(true);
      setError('');
      
      console.log('[DEBUG] 开始处理YouTube链接:', { url });
      
      const response = await fetch('/api/sunday-guide/youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('[ERROR] 上传失败:', data);
        throw new Error(data.error || `上传失败 (${response.status})`);
      }

      console.log('[DEBUG] 上传成功:', data);
      
      // 添加更详细的错误检查
      if (!data.vectorStoreId) {
        throw new Error('未收到有效的vectorStoreId');
      }

      if (data.assistantId) {
        console.log('[DEBUG] 开始绑定Vector Store:', {
          assistantId: data.assistantId,
          vectorStoreId: data.vectorStoreId
        });
        
        const bindResponse = await fetch(`/api/sunday-guide/assistants/${data.assistantId}/bind-vector-store`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            vectorStoreId: data.vectorStoreId
          })
        });

        const bindData = await bindResponse.json();
        
        if (!bindResponse.ok) {
          console.error('[ERROR] 绑定失败:', bindData);
          throw new Error('绑定 Vector Store 失败');
        }
      }
      
      // 4. 通知父组件 Vector Store 创建成功
      onVectorStoreCreated?.(data.vectorStoreId);
      
      setUrl('');

      // 在文件上传后添加验证
      console.log('正在检查文件状态...');
      const filesResponse = await fetch(`/api/vector-store/files?vectorStoreId=${data.vectorStoreId}`);
      const filesData = await filesResponse.json();
      console.log('Vector Store 文件列表:', filesData);

      if (!filesData.files?.length) {
        console.warn('警告: Vector Store 中没有找到文件');
      }
    } catch (error) {
      console.error('[ERROR] 处理失败:', error);
      setError(error instanceof Error ? error.message : '处理失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="输入 YouTube 链接"
        className={styles.input}
        disabled={isLoading}
      />
      <button
        onClick={handleUpload}
        disabled={!url.trim() || isLoading}
        className={styles.button}
      >
        {isLoading ? '处理中...' : '上传'}
      </button>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
} 