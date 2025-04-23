"use client";

import { useEffect, useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Chat.module.css';
import { Rnd } from 'react-rnd';
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

  // Log props for debugging
  useEffect(() => {
    console.log('[DEBUG] Chat组件初始化:', {
      type,
      assistantId,
      vectorStoreId,
      userId: userId || (user?.user_id || '未登录'),
      threadId: threadId || '无',
      currentThreadId: currentThreadId || '无',
      configStatus: config ? '已配置' : '未配置',
      errorStatus: error || '无错误',
      时间戳: new Date().toISOString()
    });
  }, [type, assistantId, vectorStoreId, userId, user, threadId, currentThreadId, config, error]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  useEffect(() => {
    if (!authLoading && (userId || user?.user_id)) {
      // 验证assistantId是否有效
      if (!assistantId || typeof assistantId !== 'string') {
        console.error('[ERROR] Chat组件收到无效的assistantId:', {
          assistantId,
          type: typeof assistantId,
          时间戳: new Date().toISOString()
        });
        setError('无效的助手ID');
        return;
      }
      
      console.log('[DEBUG] 设置Chat配置:', {
        type,
        assistantId,
        vectorStoreId: vectorStoreId || '未提供',
        userId: userId || user?.user_id,
        时间戳: new Date().toISOString()
      });
      
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
    // 验证助手ID是否有效
    if (!config?.assistantId) {
      console.error('[ERROR] 发送消息前缺少assistantId:', {
        config,
        userId: userId || user?.user_id,
        时间戳: new Date().toISOString()
      });
      setError('缺少助手ID配置');
      return;
    }

    // 验证vectorStoreId是否存在
    if (!config?.vectorStoreId) {
      console.warn('[WARN] 发送消息前缺少vectorStoreId', {
        assistantId: config.assistantId,
        时间戳: new Date().toISOString()
      });
      // 仍然可以继续，只是没有知识库
    }

    try {
      console.log('[DEBUG] 开始发送消息:', {
        message: message.substring(0, 20) + (message.length > 20 ? '...' : ''),
        assistantId: config.assistantId,
        threadId: currentThreadId || '新对话',
        时间戳: new Date().toISOString()
      });
      
      await sendMessage(message);
      
      console.log('[DEBUG] 消息发送成功');
    } catch (error) {
      console.error('[ERROR] 发送消息失败:', {
        error,
        message: error instanceof Error ? error.message : '未知错误',
        assistantId: config.assistantId,
        时间戳: new Date().toISOString()
      });
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

  return (
    <Rnd
      default={{
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      }}
      minWidth={400}
      minHeight={300}
      bounds="window"
      className={styles.container}
    >
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

        <div className={styles.chatWindow}>
          {!assistantId || typeof assistantId !== 'string' ? (
            <div className={styles.error}>
              <p>错误: 无效的助手ID</p>
              <p>请尝试刷新页面或联系管理员</p>
            </div>
          ) : (
            <>
              <MessageList messages={messages} isLoading={isLoading} />
              {error && <div className={styles.error}>{error}</div>}
              <ChatInput onSend={handleSendMessage} isLoading={isLoading} />
            </>
          )}
        </div>
      </div>
    </Rnd>
  );
}
