"use client";

import { useEffect, useState } from 'react';
import { Rnd } from 'react-rnd'; // <-- 引入react-rnd套件
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Chat.module.css';
import ConversationList from '../ConversationList';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { ChatType } from '../../config/chatTypes';

interface ChatProps {
  type: ChatType;
  assistantId: string;
  vectorStoreId: string;
  userId?: string;
  threadId?: string | null;
}

export default function Chat({ type, assistantId, vectorStoreId, userId, threadId }: ChatProps) {
  const { user, loading: authLoading } = useAuth();
  const {
    setConfig,
    messages,
    currentThreadId,
    setCurrentThreadId,
    sendMessage,
    isLoading,
    error,
    setError,
    loadChatHistory,
    config,
    setMessages,
  } = useChat();

  const [isCreatingThread, setIsCreatingThread] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  useEffect(() => {
    if (!authLoading && (userId || user?.user_id)) {
      setConfig({ type, assistantId, vectorStoreId, userId: userId || user?.user_id });
    }
  }, [authLoading, user, userId, type, assistantId, vectorStoreId, setConfig]);

  useEffect(() => {
    if (currentThreadId && config?.userId) {
      loadChatHistory(config.userId as string);
    }
  }, [currentThreadId, loadChatHistory, config]);

  // 自動創建新對話
  useEffect(() => {
    if (!currentThreadId && !isCreatingThread && user) {
      handleCreateNewThread();
    }
  }, [currentThreadId, isCreatingThread, user]);

  const handleCreateNewThread = async () => {
    if (isCreatingThread || !user) return;

    try {
      setIsCreatingThread(true);
      const response = await fetch('/api/threads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id, type }),
      });

      if (!response.ok) throw new Error('创建对话失败');
      const data = await response.json();

      if (data.success) {
        setCurrentThreadId(data.threadId);
        setMessages([]); // 清空訊息
        window.dispatchEvent(new CustomEvent('refreshConversations'));
      }
    } catch (err) {
      console.error('[ERROR]', err);
    } finally {
      setIsCreatingThread(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!config?.assistantId) {
      setError('缺少助手ID配置');
      return;
    }

    try {
      await sendMessage(message);
    } catch (error) {
      console.error('[ERROR]', error);
      setError('发送消息失败');
    }
  };

  if (authLoading) {
    return <div className={styles.loadingContainer}>认证中...</div>;
  }

  if (!userId && !user?.user_id) {
    return (
      <div className={styles.loginPrompt}>
        <button className={styles.loginButton} onClick={() => (window.location.href = '/login')}>
          去登录
        </button>
      </div>
    );
  }

  // 主程式修改 (新增Rnd)
  return (
    <div className={styles.container}>
      <ConversationList
        userId={userId || user?.user_id || ''}
        currentThreadId={currentThreadId}
        onSelectThread={(threadId) => {
          setCurrentThreadId(threadId);
          setMessages([]); // 清空訊息
        }}
        type={type}
        isCreating={isCreatingThread}
        onCreateNewThread={handleCreateNewThread}
      />

      <Rnd
        default={{ x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300, width: 800, height: 600 }}
        minWidth={400}
        minHeight={400}
        bounds="window"
        className={styles.chatWindowResizable}
      >
        <div className={styles.chatWindow}>
          <MessageList messages={messages} isLoading={isLoading} />
          {error && <div className={styles.error}>{error}</div>}
          <ChatInput onSend={handleSendMessage} isLoading={isLoading} />
        </div>
      </Rnd>
    </div>
  );
}
