'use client';

import { useState } from 'react';
import AssistantManager from '../components/AssistantManager';
import WithChat from '../components/layouts/WithChat';
import styles from './SundayGuide.module.css';
import { ASSISTANT_IDS, VECTOR_STORE_IDS } from '../config/constants';

interface ProcessedContent {
  summary: string;
  fullText: string;
  devotional: string;
  bibleStudy: string;
}

export default function SundayGuide() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedContent, setProcessedContent] = useState<ProcessedContent | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadTime, setUploadTime] = useState<string>('');

  const handleFileProcessed = (content: ProcessedContent) => {
    setProcessedContent(content);
    setIsProcessing(false);
  };

  return (
    <WithChat>
      <div className={styles.container}>
        <h1 className={styles.title}>主日信息管理</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>文件上傳與處理</h2>
          <AssistantManager 
            onFileProcessed={handleFileProcessed} 
            setIsProcessing={setIsProcessing} 
            setUploadProgress={setUploadProgress}
            setUploadTime={setUploadTime}
          />
          {uploadTime && (
            <div className={styles.uploadTimeContainer}>
              <p>處理完成時間: {uploadTime}</p>
            </div>
          )}
        </section>

        {processedContent && !isProcessing && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>處理結果預覽</h2>
            <div className={styles.previewContainer}>
              <div className={styles.previewSection}>
                <h3>信息總結</h3>
                <div className={styles.previewContent}>{processedContent.summary}</div>
              </div>
              <div className={styles.previewSection}>
                <h3>信息文字</h3>
                <div className={styles.previewContent}>{processedContent.fullText}</div>
              </div>
              <div className={styles.previewSection}>
                <h3>每日靈修</h3>
                <div className={styles.previewContent}>{processedContent.devotional}</div>
              </div>
              <div className={styles.previewSection}>
                <h3>查經指引</h3>
                <div className={styles.previewContent}>{processedContent.bibleStudy}</div>
              </div>
            </div>
          </section>
        )}
      </div>
    </WithChat>
  );
}