'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat, ChatProvider } from '../contexts/ChatContext';
import { ASSISTANT_IDS, VECTOR_STORE_IDS } from '../config/constants';
import { CHAT_TYPES } from '../config/chatTypes';
import styles from './HomeschoolPrompt.module.css';

interface PromptData {
  childName: string;
  basicInfo: string;
  recentChanges: string;
}

function HomeschoolPromptContent() {
  const { user } = useAuth();
  const { setConfig } = useChat();
  const [promptData, setPromptData] = useState<PromptData>({
    childName: '',
    basicInfo: '',
    recentChanges: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.user_id) return;
      
      try {
        setIsLoading(true);
        const response = await fetch(`/api/homeschool-prompt?userId=${user.user_id}`);
        if (response.ok) {
          const data = await response.json();
          setPromptData(data);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
        setMessage('加载数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.user_id]);

  // 保存数据
  const handleSave = async () => {
    if (!user?.user_id) {
      setMessage('请先登录');
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/homeschool-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.user_id,
          ...promptData
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // 更新 Chat Context 中的配置，现在包含 threadId
        setConfig({ 
          type: CHAT_TYPES.HOMESCHOOL,
          assistantId: ASSISTANT_IDS.HOMESCHOOL,
          threadId: data.threadId,
          vectorStoreId: VECTOR_STORE_IDS.HOMESCHOOL
        });
        setMessage('保存成功');
      } else {
        throw new Error('保存失败');
      }
    } catch (error) {
      console.error('保存失败:', error);
      setMessage('保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return <div className={styles.container}>请先登录</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.formGroup}>
        <label htmlFor="childName">孩童姓名</label>
        <input
          id="childName"
          type="text"
          value={promptData.childName}
          onChange={(e) => setPromptData(prev => ({
            ...prev,
            childName: e.target.value
          }))}
          disabled={isLoading}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="basicInfo">基本状况</label>
        <textarea
          id="basicInfo"
          value={promptData.basicInfo}
          onChange={(e) => setPromptData(prev => ({
            ...prev,
            basicInfo: e.target.value
          }))}
          disabled={isLoading}
          rows={4}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="recentChanges">最新变化</label>
        <textarea
          id="recentChanges"
          value={promptData.recentChanges}
          onChange={(e) => setPromptData(prev => ({
            ...prev,
            recentChanges: e.target.value
          }))}
          disabled={isLoading}
          rows={4}
        />
      </div>

      {message && (
        <div className={`${styles.message} ${message.includes('失败') ? styles.error : styles.success}`}>
          {message}
        </div>
      )}

      <button
        className={styles.saveButton}
        onClick={handleSave}
        disabled={isLoading}
      >
        {isLoading ? '保存中...' : '保存'}
      </button>
    </div>
  );
}

export default function HomeschoolPrompt() {
  return (
    <ChatProvider initialConfig={{
      type: 'homeschool',
      assistantId: ASSISTANT_IDS.HOMESCHOOL,
      vectorStoreId: VECTOR_STORE_IDS.HOMESCHOOL
    }}>
      <HomeschoolPromptContent />
    </ChatProvider>
  );
}
