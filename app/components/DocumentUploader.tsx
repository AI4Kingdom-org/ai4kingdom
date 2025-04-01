'use client';

import { useState, useEffect } from 'react';
import styles from './DocumentUploader.module.css';

interface VectorFile {
  fileName: string;
  uploadDate: string;
  fileId: string;
}

interface DocumentUploaderProps {
  assistantId?: string;
  vectorStoreId?: string;
}

export default function DocumentUploader({ assistantId, vectorStoreId }: DocumentUploaderProps) {
  const [files, setFiles] = useState<VectorFile[]>([]);
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isAllSelected, setIsAllSelected] = useState(false);

  // 获取文件列表
  const fetchFiles = async () => {
    console.log('开始获取文件列表:', { vectorStoreId });
    
    if (!vectorStoreId) {
      console.log('没有 vectorStoreId，清空文件列表');
      setFiles([]);
      return;
    }

    try {
      console.log('发起获取文件请求');
      const response = await fetch(`/api/vector-store/files?vectorStoreId=${vectorStoreId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('获取文件列表失败:', errorData);
        throw new Error('获取文件列表失败');
      }
      
      const data = await response.json();
      console.log('获取到的文件列表:', data);
      setFiles(data);
    } catch (err) {
      console.error('获取文件列表错误:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 当 vectorStoreId 变化时重新获取文件列表
  useEffect(() => {
    console.log('vectorStoreId 变化:', { vectorStoreId });
    fetchFiles();
  }, [vectorStoreId]);

  const handleUpload = async () => {
    if (!newFiles?.length || !vectorStoreId) return;
    setIsUploading(true);
    setError('');

    const formData = new FormData();
    Array.from(newFiles).forEach(file => {
      formData.append('files', file);
    });
    formData.append('vectorStoreId', vectorStoreId);

    try {
      const response = await fetch('/api/vector-store/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '上传失败');
      }

      const data = await response.json();
      console.log('上传成功:', data);
      setNewFiles(null);
      await fetchFiles();
    } catch (error) {
      setError(error instanceof Error ? error.message : '上传失败');
    } finally {
      setIsUploading(false);
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
    setIsAllSelected(selectedFiles.size === files.length);
  };

  // 处理删除
  const handleDelete = async () => {
    if (selectedFiles.size === 0) return;
    setIsUploading(true);
    setError('');
    
    try {
      let failedFiles = [];
      
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

      await fetchFiles(); // 刷新文件列表
      setSelectedFiles(new Set());
      setIsAllSelected(false);

      if (failedFiles.length > 0) {
        setError(`以下文件删除失败: ${failedFiles.join(', ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={styles.container}>
      {!vectorStoreId ? (
        <div className={styles.notice}>请先选择一个助手</div>
      ) : (
        <>
          {error && <div className={styles.error}>{error}</div>}
          
          <div className={styles.fileUpload}>
            <input
              type="file"
              onChange={(e) => setNewFiles(e.target.files)}
              accept=".pdf,.txt"
              multiple
              className={styles.fileInput}
              disabled={isUploading}
            />
            <button
              onClick={handleUpload}
              disabled={!newFiles?.length || isUploading}
              className={styles.button}
            >
              {isUploading ? '上传中...' : '上传文档'}
            </button>
            <button
              onClick={handleDelete}
              disabled={isUploading || selectedFiles.size === 0}
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
            
            {files.length === 0 ? (
              <div className={styles.emptyState}>暂无文档</div>
            ) : (
              files.map((file) => (
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
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
} 