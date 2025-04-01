'use client';

import React, { useEffect, useState } from "react";
import styles from './TestModule.module.css';
import { useAuth } from '../contexts/AuthContext';

interface VectorFile {
  fileName: string;
  uploadDate: string;
  fileId: string;
}

interface Prompt {
  id: string;
  content: string;
  lastUpdated: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

const TestModule = () => {
  const { user, loading: authLoading } = useAuth();
  const [files, setFiles] = useState<VectorFile[]>([]);
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [prompt, setPrompt] = useState<string>('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const VECTOR_STORE_ID = 'vs_AMJIJ1zfGnzHpI1msv4T8Ww3'; // 您的 vector store ID
  const [isInitialized, setIsInitialized] = useState(false);
  const [wpNonce, setWpNonce] = useState<string>('');

  // 获取文件列表
  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/vector-store/files');
      if (!response.ok) throw new Error('获取文件列表失败');
      const data = await response.json();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 获取 Prompt
  const fetchPrompt = async () => {
    try {
      setPromptLoading(true);
      const response = await fetch(`${API_BASE_URL}/prompt?vectorStoreId=${VECTOR_STORE_ID}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': wpNonce,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || '获取Prompt失败');
      }
      
      const data: Prompt = await response.json();
      setPrompt(data.content);
    } catch (err) {
      console.error('Prompt获取错误:', err);
      setPromptError(err instanceof Error ? err.message : '获取Prompt失败');
    } finally {
      setPromptLoading(false);
    }
  };

  // 更新 Prompt
  const updatePrompt = async () => {
    try {
      setPromptLoading(true);
      const response = await fetch('/api/prompt', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': wpNonce,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ 
          content: prompt,
          vectorStoreId: VECTOR_STORE_ID,
          format: 'json'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || '更新Prompt失败');
      }
      
      await fetchPrompt(); // 刷新显示
      setPromptError(null);
    } catch (err) {
      console.error('更新Prompt错误:', err);
      setPromptError(err instanceof Error ? err.message : '更新Prompt失败');
    } finally {
      setPromptLoading(false);
    }
  };

  useEffect(() => {
    console.log('TestModule mounted');
    
    const initializeModule = async () => {
      try {
        console.log('开始初始化 TestModule');
        await Promise.all([fetchFiles(), fetchPrompt()]);
        console.log('TestModule 初始化完成');
      } catch (err) {
        console.error('TestModule 初始化失败:', err);
      }
    };

    if (!isInitialized) {
      initializeModule();
      setIsInitialized(true);
    }
  }, [isInitialized]);

  useEffect(() => {
    if (!authLoading && !user) {
      setPromptError('请先登录');
      return;
    }
    if (user?.nonce) {
      setWpNonce(user.nonce);
    }
  }, [user, authLoading]);

  // 处理文件上传
  const handleUpload = async () => {
    if (!newFiles?.length) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    Array.from(newFiles).forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/vector-store/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '上传失败');
      }
      
      if (response.status === 207) {
        setError(`部分文件上传失败: ${data.failedCount} 个文件未能上传`);
      }
      
      await fetchFiles();
      setNewFiles(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理全选
  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedFiles(new Set());
    } else {
      const allFileNames = new Set(files.map(file => file.fileName));
      setSelectedFiles(allFileNames);
    }
    setIsAllSelected(!isAllSelected);
  };

  // 处理单个文件选择
  const handleFileSelect = (fileName: string) => {
    setSelectedFiles(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(fileName)) {
        newSelection.delete(fileName);
      } else {
        newSelection.add(fileName);
      }
      return newSelection;
    });
    // 更新全选状态
    setIsAllSelected(selectedFiles.size === files.length);
  };

  // 处理批量删除
  const handleDelete = async () => {
    if (selectedFiles.size === 0) return;
    setLoading(true);
    setError(null);
    
    try {
      let failedFiles = [];
      
      // 串行处理删除请求，以避免可能的速率限制问题
      for (const fileName of selectedFiles) {
        try {
          const response = await fetch(`/api/vector-store/delete/${fileName}`, {
            method: 'DELETE',
          });
          
          if (!response.ok) {
            failedFiles.push(fileName);
          }
        } catch (err) {
          failedFiles.push(fileName);
        }
      }

      // 刷新文件列表
      await fetchFiles();
      // 清除选择
      setSelectedFiles(new Set());
      setIsAllSelected(false);

      // 如果有失败的文件，显示错误信息
      if (failedFiles.length > 0) {
        setError(`以下文件删除失败: ${failedFiles.join(', ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.splitLayout}>
        {/* 左侧文件管理部分 */}
        <section className={styles.section}>
          <h2>Vector Store 文件管理</h2>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.fileUpload}>
            <input
              type="file"
              multiple
              onChange={(e) => setNewFiles(e.target.files)}
              className={styles.fileInput}
            />
            <button 
              onClick={handleUpload}
              disabled={loading || !newFiles?.length}
              className={styles.button}
            >
              {loading ? '上传中...' : '上传文件'}
            </button>
            <button
              onClick={handleDelete}
              disabled={loading || selectedFiles.size === 0}
              className={`${styles.button} ${styles.deleteButton}`}
            >
              删除所选 ({selectedFiles.size})
            </button>
          </div>

          <div className={styles.fileList}>
            <div className={styles.fileListHeader}>
              <label className={styles.selectAllLabel}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className={styles.checkbox}
                />
                全选
              </label>
            </div>
            
            {files.map((file) => (
              <div 
                key={file.fileId}
                className={`${styles.fileItem} ${selectedFiles.has(file.fileName) ? styles.selected : ''}`}
              >
                <label className={styles.fileLabel}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.fileName)}
                    onChange={() => handleFileSelect(file.fileName)}
                    className={styles.checkbox}
                  />
                  <span className={styles.fileName}>{file.fileName}</span>
                  <span className={styles.uploadDate}>
                    {new Date(file.uploadDate).toLocaleString()}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* 右侧 Prompt 管理部分 */}
        <section className={styles.section}>
          <h2>Prompt 管理</h2>
          {promptError && <div className={styles.error}>{promptError}</div>}
          <div className={styles.promptContainer}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className={styles.promptTextarea}
              placeholder="输入 Prompt..."
              disabled={promptLoading}
            />
            <button
              onClick={updatePrompt}
              disabled={promptLoading}
              className={styles.button}
            >
              {promptLoading ? '更新中...' : '更新 Prompt'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default TestModule; 