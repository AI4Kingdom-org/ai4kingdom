'use client';

import { useState } from 'react';
import styles from './DocumentUploader.module.css';

interface DocumentUploaderProps {
  onUpload: (file: File) => Promise<void>;
  isProcessing: boolean;
}

export default function DocumentUploader({ onUpload, isProcessing }: DocumentUploaderProps) {
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files?.length) {
      await handleFiles(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleFiles(file);
      // 清除輸入，這樣同一個文件可以再次上傳
      event.target.value = '';
    }
  };

  const handleFiles = async (file: File) => {
    setError('');
    setSummary('');

    try {
      // 檢查文件大小（限制為 20MB）
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (file.size > maxSize) {
        throw new Error('文件大小不能超過 20MB');
      }

      await onUpload(file);
      setSummary(`文件 ${file.name} 上傳成功！`);
    } catch (error) {
      setError(error instanceof Error ? error.message : '上傳失敗');
    }
  };

  return (
    <div className={styles.uploadContainer}>
      <div 
        className={`${styles.uploadArea} ${dragActive ? styles.dragActive : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="document-upload"
          className={styles.fileInput}
          onChange={handleFileChange}
          disabled={isProcessing}
          accept=".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.json,.xml,.html,.md,.markdown,.tex"
        />
        <label htmlFor="document-upload" className={styles.uploadLabel}>
          {isProcessing ? (
            <span>處理中...</span>
          ) : (
            <div>
              <p>點擊或拖拽文件到此處上傳</p>
              <p className={styles.supportedFormats}>
                支援格式：PDF、Word、TXT、Markdown、RTF、CSV、JSON、XML、HTML 等
              </p>
            </div>
          )}
        </label>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {summary && <div className={styles.success}>{summary}</div>}
    </div>
  );
}