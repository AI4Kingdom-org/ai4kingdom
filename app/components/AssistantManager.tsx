'use client';

import { useEffect, useState } from 'react';
import styles from './AssistantManager.module.css';

interface AssistantInfo {
  assistantId: string;    // OpenAI Assistant ID
  timestamp: string;
  youtubeUrl?: string;
  type: string;
  status: string;
  vectorStoreId: string;  // 确保这个字段存在
  transcription?: string;
  Timestamp: string;      // DynamoDB 的时间戳字段
}

interface AssistantManagerProps {
  onAssistantSelect?: (assistantId: string, vectorStoreId?: string) => void;
}

export default function AssistantManager({ onAssistantSelect }: AssistantManagerProps) {
  const [assistants, setAssistants] = useState<AssistantInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssistants = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/sunday-guide/assistants');
      if (!response.ok) {
        throw new Error('获取助手列表失败');
      }
      const data = await response.json();
      
      // 确保返回的数据是数组
      const assistantList = Array.isArray(data.assistants) ? data.assistants : [];
      
      setAssistants(assistantList);
    } catch (error) {
      console.error('[ERROR] 获取助手列表失败:', error);
      setError(error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssistants();
  }, []);

  const handleAssistantSelect = async (assistantId: string) => {
    try {
      const assistant = assistants.find(a => a.assistantId === assistantId);
      if (!assistant) {
        console.error('[ERROR] 找不到助手:', assistantId);
        return false;
      }

      // 如果已经有 vectorStoreId，直接返回成功
      if (assistant.vectorStoreId) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('[ERROR] 选择助手失败:', error);
      return false;
    }
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedId(value);
  };

  const handleSelect = async () => {
    if (!selectedId || !onAssistantSelect) return;

    const success = await handleAssistantSelect(selectedId);
    if (success) {
      const assistant = assistants.find(a => a.assistantId === selectedId);
      if (assistant) {
        onAssistantSelect(selectedId, assistant.vectorStoreId);
      }
    }
  };

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  const handleDelete = async () => {
    if (!selectedId) return;
    
    try {
      setIsLoading(true);
      
      // 1. 删除 OpenAI Assistant
      await fetch(`/api/sunday-guide/assistants/${selectedId}`, {
        method: 'DELETE'
      });
      
      // 2. 更新本地状态
      await fetchAssistants();
      setSelectedId('');
    } catch (error) {
      console.error('删除失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}
      <select 
        value={selectedId}
        onChange={handleSelectChange}
        className={styles.select}
      >
        <option value="">选择助手</option>
        {assistants.map((assistant) => (
          <option key={assistant.assistantId} value={assistant.assistantId}>
            {assistant.type === 'youtube' ? '视频助手' : '普通助手'} 
            ({new Date(assistant.Timestamp).toLocaleString()})
          </option>
        ))}
      </select>
      <div className={styles.buttonGroup}>
        <button
          onClick={handleSelect}
          disabled={!selectedId || isLoading}
          className={styles.button}
        >
          {isLoading ? '加载中...' : '选择助手'}
        </button>
        <button
          onClick={handleDelete}
          disabled={!selectedId || isLoading}
          className={`${styles.button} ${styles.deleteButton}`}
        >
          {isLoading ? '删除中...' : '删除助手'}
        </button>
      </div>
    </div>
  );
} 