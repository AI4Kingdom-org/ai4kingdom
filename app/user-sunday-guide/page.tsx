'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import Chat from '../components/Chat/Chat';
import WithChat from '../components/layouts/WithChat';
import styles from './page.module.css';
import { ChatType, CHAT_TYPES } from '../config/chatTypes';
import ReactMarkdown from 'react-markdown';

type GuideMode = 'summary' | 'text' | 'devotional' | 'bible' | null;

type SermonContent = string;  // 简化为单个字符串

function SundayGuideContent() {
  const { user } = useAuth();
  const { setConfig } = useChat();
  const [selectedMode, setSelectedMode] = useState<GuideMode>(null);
  const [assistantData, setAssistantData] = useState<{
    assistantId: string;
    vectorStoreId: string;
  } | null>(null);
  const [sermonContent, setSermonContent] = useState<SermonContent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLatestAssistant = async () => {
      try {
        const response = await fetch('/api/sunday-guide/assistants?mode=active');
        if (!response.ok) throw new Error('获取助手信息失败');
        const data = await response.json();
        
        if (data.assistant && user?.user_id) {
          setAssistantData(data.assistant);
          
          // 设置 Chat 配置
          setConfig({
            type: CHAT_TYPES.SUNDAY_GUIDE,
            assistantId: data.assistant.assistantId,
            vectorStoreId: data.assistant.vectorStoreId,
            userId: user.user_id
          });
        }
      } catch (error) {
        console.error('获取助手数据失败:', error);
      }
    };

    if (user?.user_id) {
      fetchLatestAssistant();
    }
  }, [user, setConfig]);

  const handleModeSelect = async (mode: GuideMode) => {
    setSelectedMode(mode);
    if (!assistantData?.assistantId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/sunday-guide/content/${assistantData.assistantId}?type=${mode}`
      );
      if (!response.ok) throw new Error('获取内容失败');
      const data = await response.json();
      setSermonContent(data.content);
    } catch (error) {
      console.error('获取内容失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (loading) return <div className={styles.loading}>加载中...</div>;
    if (!sermonContent) return null;

    const titles = {
      summary: '讲道总结',
      text: '信息文字',
      devotional: '每日灵修',
      bible: '查经指引'
    };

    return (
      <div className={styles.contentBox}>
        <h2>{titles[selectedMode!]}</h2>
        <div className={styles.markdownContent}>
          <ReactMarkdown>{sermonContent}</ReactMarkdown>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>主日信息导览</h1>
      
      <div className={styles.buttonGroup}>
        <button 
          className={`${styles.modeButton} ${selectedMode === 'summary' ? styles.active : ''}`}
          onClick={() => handleModeSelect('summary')}
        >
          信息总结
        </button>
        <button 
          className={`${styles.modeButton} ${selectedMode === 'text' ? styles.active : ''}`}
          onClick={() => handleModeSelect('text')}
        >
          信息文字
        </button>
        <button 
          className={`${styles.modeButton} ${selectedMode === 'devotional' ? styles.active : ''}`}
          onClick={() => handleModeSelect('devotional')}
        >
          每日灵修
        </button>
        <button 
          className={`${styles.modeButton} ${selectedMode === 'bible' ? styles.active : ''}`}
          onClick={() => handleModeSelect('bible')}
        >
          查经指引
        </button>
      </div>

      <div className={styles.content}>
        {renderContent()}
        <div className={styles.chatContainer}>
          {assistantData && user && (
            <Chat 
              type={CHAT_TYPES.SUNDAY_GUIDE}
              assistantId={assistantData.assistantId}
              vectorStoreId={assistantData.vectorStoreId}
              userId={user.user_id}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function UserSundayGuide() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>加载中...</div>;
  }

  if (!user) {
    return <div>请先登录</div>;
  }

  return (
    <WithChat chatType={CHAT_TYPES.SUNDAY_GUIDE}>
      <SundayGuideContent />
    </WithChat>
  );
} 