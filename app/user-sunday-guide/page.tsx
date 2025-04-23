'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import Chat from '../components/Chat/Chat';
import WithChat from '../components/layouts/WithChat';
import styles from './page.module.css';
import { CHAT_TYPES } from '../config/chatTypes';
import { ASSISTANT_IDS, VECTOR_STORE_IDS } from '../config/constants';
import ReactMarkdown from 'react-markdown';

type GuideMode = 'summary' | 'text' | 'devotional' | 'bible' | null;

function SundayGuideContent() {
  const { user } = useAuth();
  const { setConfig } = useChat();
  const [selectedMode, setSelectedMode] = useState<GuideMode>(null);
  const [sermonContent, setSermonContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.user_id) {
      // 設定固定的助手配置
      setConfig({
        type: CHAT_TYPES.SUNDAY_GUIDE,
        assistantId: ASSISTANT_IDS.SUNDAY_GUIDE,
        vectorStoreId: VECTOR_STORE_IDS.JOHNSUNG,
        userId: user.user_id
      });
    }
  }, [user, setConfig]);

  const handleModeSelect = async (mode: GuideMode) => {
    setSelectedMode(mode);
    setLoading(true);
    try {
      const response = await fetch(
        `/api/sunday-guide/content/${ASSISTANT_IDS.SUNDAY_GUIDE}?type=${mode}`
      );
      if (!response.ok) throw new Error('獲取內容失敗');
      const data = await response.json();
      setSermonContent(data.content);
    } catch (error) {
      console.error('獲取內容失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (loading) return <div className={styles.loading}>加載中...</div>;
    if (!sermonContent) return null;

    const titles = {
      summary: '講道總結',
      text: '信息文字',
      devotional: '每日靈修',
      bible: '查經指引'
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
      <h1 className={styles.title}>主日信息導覽</h1>
      <div className={styles.buttonGroup}>
        <button 
          className={`${styles.modeButton} ${selectedMode === 'summary' ? styles.active : ''}`}
          onClick={() => handleModeSelect('summary')}
        >
          信息總結
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
          每日靈修
        </button>
        <button 
          className={`${styles.modeButton} ${selectedMode === 'bible' ? styles.active : ''}`}
          onClick={() => handleModeSelect('bible')}
        >
          查經指引
        </button>
      </div>

      {sermonContent ? (
        <>
          <div className={styles.contentWrapper}>
            <div className={`${styles.contentArea} ${styles.hasContent}`}>
              {renderContent()}
            </div>
            <div className={styles.chatSection}>
              {user && (
                <Chat 
                  type={CHAT_TYPES.SUNDAY_GUIDE}
                  assistantId={ASSISTANT_IDS.SUNDAY_GUIDE}
                  vectorStoreId={VECTOR_STORE_IDS.JOHNSUNG}
                  userId={user.user_id}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <div className={styles.emptyState}>
          <p>請選擇要查看的內容類型</p>
        </div>
      )}
    </div>
  );
}

export default function UserSundayGuide() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>加載中...</div>;
  }

  if (!user) {
    return <div>請先登錄</div>;
  }

  return (
    <WithChat chatType={CHAT_TYPES.SUNDAY_GUIDE}>
      <SundayGuideContent />
    </WithChat>
  );
}