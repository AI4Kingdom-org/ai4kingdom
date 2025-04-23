'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import { ASSISTANT_IDS } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';

// 助手選擇器選項
const assistantOptions = [
  { id: '', label: '所有助手' },
  { id: ASSISTANT_IDS.SUNDAY_GUIDE, label: '牧者助手' },
  { id: ASSISTANT_IDS.JOHNSUNG, label: '宋尚節牧師' },
  { id: ASSISTANT_IDS.SPIRITUAL_PARTNER, label: '靈修伙伴' },
  { id: ASSISTANT_IDS.CHILDREN_MENTAL, label: '兒童心理' },
  { id: ASSISTANT_IDS.HOMESCHOOL, label: '家庭教育' },
  { id: ASSISTANT_IDS.GENERAL, label: '通用助手' }
];

// 文件記錄類型定義
interface FileRecord {
  assistantId: string;
  vectorStoreId: string;
  fileId: string;
  fileName: string;
  updatedAt: string;
  summary: string;
  fullText: string;
  devotional: string;
  bibleStudy: string;
}

export default function FileRecordsPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssistant, setSelectedAssistant] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // 分頁狀態
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;

  // 獲取文件記錄
  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = `/api/sunday-guide/documents${selectedAssistant ? `?assistantId=${selectedAssistant}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('獲取文件記錄失敗');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setRecords(data.records || []);
      } else {
        throw new Error(data.error || '獲取記錄時發生錯誤');
      }
    } catch (err) {
      console.error('獲取文件記錄錯誤:', err);
      setError(err instanceof Error ? err.message : '未知錯誤');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };
  
  // 初始載入及助手選擇變更時載入記錄
  useEffect(() => {
    if (user) {
      fetchRecords();
    }
  }, [user, selectedAssistant]);

  // 過濾記錄
  const filteredRecords = records.filter(record => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      record.fileName.toLowerCase().includes(searchLower) ||
      record.updatedAt.toLowerCase().includes(searchLower)
    );
  });
  
  // 計算分頁
  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = filteredRecords.slice(indexOfFirstRecord, indexOfLastRecord);

  // 格式化時間
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  // 獲取助手名稱
  const getAssistantName = (assistantId: string) => {
    const assistant = assistantOptions.find(opt => opt.id === assistantId);
    return assistant ? assistant.label : assistantId;
  };

  // 分頁控制
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  if (!user) {
    return <div className={styles.container}>請先登入以查看文件記錄</div>;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>文件上傳記錄</h1>

      <div className={styles.section}>
        <div className={styles.headerActions}>
          <div className={styles.filterSection}>
            <select 
              className={styles.selectInput}
              value={selectedAssistant}
              onChange={(e) => setSelectedAssistant(e.target.value)}
            >
              {assistantOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            
            <button 
              className={styles.button} 
              onClick={fetchRecords}
            >
              刷新記錄
            </button>
          </div>
          
          <div>
            <input
              type="text"
              placeholder="搜尋文件名稱或日期..."
              className={styles.searchInput}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        {loading ? (
          <div className={styles.loading}>載入中...</div>
        ) : currentRecords.length > 0 ? (
          <>
            <table className={styles.recordsTable}>
              <thead>
                <tr>
                  <th>文件名稱</th>
                  <th>助手類型</th>
                  <th>上傳時間</th>
                  <th>處理狀態</th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.map((record, index) => (
                  <tr key={index}>
                    <td>{record.fileName}</td>
                    <td>{getAssistantName(record.assistantId)}</td>
                    <td>{formatDate(record.updatedAt)}</td>
                    <td>
                      <div>摘要: <span className={record.summary === '已生成' ? styles.statusSuccess : styles.statusPending}>{record.summary}</span></div>
                      <div>全文: <span className={record.fullText === '已生成' ? styles.statusSuccess : styles.statusPending}>{record.fullText}</span></div>
                      <div>靈修: <span className={record.devotional === '已生成' ? styles.statusSuccess : styles.statusPending}>{record.devotional}</span></div>
                      <div>查經: <span className={record.bibleStudy === '已生成' ? styles.statusSuccess : styles.statusPending}>{record.bibleStudy}</span></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {totalPages > 1 && (
              <div className={styles.paginationControls}>
                <button 
                  className={styles.pageButton}
                  onClick={() => paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  上一頁
                </button>
                
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => paginate(i + 1)}
                    className={`${styles.pageButton} ${currentPage === i + 1 ? styles.active : ''}`}
                  >
                    {i + 1}
                  </button>
                ))}
                
                <button 
                  className={styles.pageButton}
                  onClick={() => paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  下一頁
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.noRecords}>
            找不到文件記錄
          </div>
        )}
      </div>
    </div>
  );
}