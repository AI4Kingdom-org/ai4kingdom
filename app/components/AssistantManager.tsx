import { useState, useEffect, useRef } from 'react';
import styles from './AssistantManager.module.css';
import { ASSISTANT_IDS, VECTOR_STORE_IDS } from '../config/constants';
import stylesGuide from '../sunday-guide/SundayGuide.module.css';

interface AssistantManagerProps {
  onFileProcessed: (content: {
    summary: string;
    fullText: string;
    devotional: string;
    bibleStudy: string;
  }) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setUploadTime: (time: string) => void;
}

interface TaskStatus {
  upload: 'idle' | 'processing' | 'completed';
  summary: 'idle' | 'processing' | 'completed';
  fullText: 'idle' | 'processing' | 'completed';
  devotional: 'idle' | 'processing' | 'completed';
  bibleStudy: 'idle' | 'processing' | 'completed';
}

export default function AssistantManager({ 
  onFileProcessed, 
  setIsProcessing, 
  setUploadProgress,
  setUploadTime
}: AssistantManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>({
    upload: 'idle',
    summary: 'idle',
    fullText: 'idle',
    devotional: 'idle',
    bibleStudy: 'idle'
  });
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [timeSpent, setTimeSpent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [processingFileId, setProcessingFileId] = useState<string | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 獲取PDT時間的輔助函數
  const getPDTTime = () => {
    const now = new Date();
    return now.toLocaleString('zh-TW', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' PDT';
  };

  // 計算處理時間
  const calculateTimeSpent = (startDate: Date) => {
    const endDate = new Date();
    const diffInMs = endDate.getTime() - startDate.getTime();
    const diffInSec = Math.floor(diffInMs / 1000);
    
    if (diffInSec < 60) {
      return `${diffInSec} 秒`;
    } else if (diffInSec < 3600) {
      const minutes = Math.floor(diffInSec / 60);
      const seconds = diffInSec % 60;
      return `${minutes} 分 ${seconds} 秒`;
    } else {
      const hours = Math.floor(diffInSec / 3600);
      const minutes = Math.floor((diffInSec % 3600) / 60);
      const seconds = diffInSec % 60;
      return `${hours} 小時 ${minutes} 分 ${seconds} 秒`;
    }
  };

  const handleFileUpload = async (file: File) => {
    // 重置所有狀態
    setIsProcessing(true);
    setUploadProgress(0);
    setCurrentProgress(0);
    setTaskStatus({
      upload: 'processing',
      summary: 'idle',
      fullText: 'idle',
      devotional: 'idle',
      bibleStudy: 'idle'
    });
    
    // 記錄開始時間和文件名
    const start = new Date();
    setStartTime(start);
    setFileName(file.name);
    
    try {
      setError(null);

      // 建立 FormData
      const formData = new FormData();
      formData.append('file', file);
      
      // 初始階段完成 - 10%
      setCurrentProgress(10);
      setUploadProgress(10);

      // 開始進度模擬
      startProgressSimulation(10);

      // 上傳文件到 vector store
      const uploadResponse = await fetch(`/api/vector-store/upload?vectorStoreId=${VECTOR_STORE_IDS.JOHNSUNG}&assistantId=${ASSISTANT_IDS.SUNDAY_GUIDE}`, {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('文件上傳失敗');
      }
      
      // 標記上傳完成
      setTaskStatus(prev => ({ ...prev, upload: 'completed', summary: 'processing' }));
      
      // 開始處理文件
      const processResponse = await fetch('/api/sunday-guide/process-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assistantId: ASSISTANT_IDS.SUNDAY_GUIDE,
          vectorStoreId: VECTOR_STORE_IDS.JOHNSUNG,
          fileName: file.name
        })
      });

      if (!processResponse.ok) {
        throw new Error('文件處理失敗');
      }
      
      // 停止進度模擬
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      // 讀取處理結果
      const result = await processResponse.json();
      
      // 查看結果中包含哪些部分，並相應更新任務狀態
      if (result.summary) {
        setTaskStatus(prev => ({ ...prev, summary: 'completed', fullText: 'processing' }));
      }
      
      if (result.fullText) {
        setTaskStatus(prev => ({ ...prev, fullText: 'completed', devotional: 'processing' }));
      }
      
      if (result.devotional) {
        setTaskStatus(prev => ({ ...prev, devotional: 'completed', bibleStudy: 'processing' }));
      }
      
      if (result.bibleStudy) {
        setTaskStatus(prev => ({ ...prev, bibleStudy: 'completed' }));
      }
      
      // 設置PDT時間
      const pdtTime = getPDTTime();
      setUploadTime(pdtTime);
      
      // 計算並設置處理時間
      if (startTime) {
        const timeSpentStr = calculateTimeSpent(startTime);
        setTimeSpent(timeSpentStr);
      }
      
      // 全部完成 - 100%
      setCurrentProgress(100);
      setUploadProgress(100);
      
      // 回傳處理結果
      if (onFileProcessed) {
        onFileProcessed(result);
      }

    } catch (err) {
      // 停止進度模擬
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      console.error('文件處理錯誤:', err);
      setError(err instanceof Error ? err.message : '未知錯誤');
      setUploadProgress(0);
      setCurrentProgress(0);
      setTaskStatus({
        upload: 'idle',
        summary: 'idle',
        fullText: 'idle',
        devotional: 'idle',
        bibleStudy: 'idle'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 漸進式更新進度條
  const startProgressSimulation = (initialProgress: number) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    // 設定初始進度
    setCurrentProgress(initialProgress);
    setUploadProgress(initialProgress);

    // 定義每個階段的目標進度
    const stages = [
      { target: 20, increment: 0.1, delay: 200 },  // 上傳階段 10-20%
      { target: 45, increment: 0.05, delay: 500 }, // 處理總結階段 20-45%
      { target: 65, increment: 0.04, delay: 600 }, // 處理全文階段 45-65%
      { target: 85, increment: 0.05, delay: 400 }, // 處理靈修階段 65-85%
      { target: 95, increment: 0.03, delay: 500 }  // 處理查經階段 85-95%
    ];

    let currentStage = 0;

    progressIntervalRef.current = setInterval(() => {
      setCurrentProgress(prevProgress => {
        // 如果已經達到當前階段的目標，進入下一階段
        if (prevProgress >= stages[currentStage].target) {
          currentStage++;
          
          // 如果所有階段都完成了，停止模擬
          if (currentStage >= stages.length) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            return prevProgress;
          }
        }

        // 計算新的進度
        const newProgress = prevProgress + stages[currentStage].increment;
        const stageTarget = stages[currentStage].target;

        // 確保不超過當前階段的目標進度
        const progress = Math.min(newProgress, stageTarget);
        setUploadProgress(progress);
        return progress;
      });
    }, stages[currentStage].delay);
  };

  // 清理定時器
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // 任務列表渲染
  const renderTaskList = () => {
    return (
      <div className={stylesGuide.taskList}>
        <div className={`${stylesGuide.taskItem} ${stylesGuide[taskStatus.upload]}`}>
          <div className={stylesGuide.taskIcon}>
            {taskStatus.upload === 'completed' ? (
              <span className={stylesGuide.checkIcon}>✓</span>
            ) : taskStatus.upload === 'processing' ? (
              <span className={stylesGuide.spinnerIcon}>⟳</span>
            ) : null}
          </div>
          <div className={stylesGuide.taskName}>上傳文件</div>
        </div>
        
        <div className={`${stylesGuide.taskItem} ${stylesGuide[taskStatus.summary]}`}>
          <div className={stylesGuide.taskIcon}>
            {taskStatus.summary === 'completed' ? (
              <span className={stylesGuide.checkIcon}>✓</span>
            ) : taskStatus.summary === 'processing' ? (
              <span className={stylesGuide.spinnerIcon}>⟳</span>
            ) : null}
          </div>
          <div className={stylesGuide.taskName}>生成信息總結</div>
        </div>
        
        <div className={`${stylesGuide.taskItem} ${stylesGuide[taskStatus.fullText]}`}>
          <div className={stylesGuide.taskIcon}>
            {taskStatus.fullText === 'completed' ? (
              <span className={stylesGuide.checkIcon}>✓</span>
            ) : taskStatus.fullText === 'processing' ? (
              <span className={stylesGuide.spinnerIcon}>⟳</span>
            ) : null}
          </div>
          <div className={stylesGuide.taskName}>整理信息文字</div>
        </div>
        
        <div className={`${stylesGuide.taskItem} ${stylesGuide[taskStatus.devotional]}`}>
          <div className={stylesGuide.taskIcon}>
            {taskStatus.devotional === 'completed' ? (
              <span className={stylesGuide.checkIcon}>✓</span>
            ) : taskStatus.devotional === 'processing' ? (
              <span className={stylesGuide.spinnerIcon}>⟳</span>
            ) : null}
          </div>
          <div className={stylesGuide.taskName}>生成每日靈修</div>
        </div>
        
        <div className={`${stylesGuide.taskItem} ${stylesGuide[taskStatus.bibleStudy]}`}>
          <div className={stylesGuide.taskIcon}>
            {taskStatus.bibleStudy === 'completed' ? (
              <span className={stylesGuide.checkIcon}>✓</span>
            ) : taskStatus.bibleStudy === 'processing' ? (
              <span className={stylesGuide.spinnerIcon}>⟳</span>
            ) : null}
          </div>
          <div className={stylesGuide.taskName}>生成查經指引</div>
        </div>
        
        {timeSpent && (
          <div className={stylesGuide.timeSpent}>
            <span><span className={stylesGuide.timeIcon}>⏱</span> 處理時間：{timeSpent}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.uploadSection}>
        <h3>上傳文件 <span className={styles.fileTypes}>.pdf,.txt,.doc,.docx</span></h3>
        <div className={styles.uploadForm}>
          <input
            type="file"
            accept=".pdf,.txt,.doc,.docx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file);
              }
            }}
          />
        </div>
      </div>
      
      {currentProgress > 0 && currentProgress < 100 && (
        <div className={stylesGuide.progressContainer}>
          <div className={stylesGuide.progressLabel}>處理進度: {Math.round(currentProgress)}%</div>
          <div className={stylesGuide.progressBar}>
            <div 
              className={stylesGuide.progressBarFill} 
              style={{ width: `${currentProgress}%` }}
            />
          </div>
        </div>
      )}
      
      {fileName && timeSpent && (
        <div className={stylesGuide.timeSpent}>
          <span>
            <span className={stylesGuide.timeIcon}>⏱</span> 
            文件：{fileName} | 處理完成，耗時：{timeSpent}
          </span>
        </div>
      )}
    </div>
  );
}