'use client';

import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';
import styles from './Chat.module.css';
import ConversationList from '../components/ConversationList';
import OpenAI from 'openai';
import { CHAT_TYPES, ChatType } from '../config/chatTypes';
import { useChat } from '../contexts/ChatContext';

export interface ChatMessage {
  Message: string;
  Timestamp: string;
  UserId: string;
}

export interface ParsedMessage {
  userMessage: string;
  botReply: string;
}

interface UsageLimit {
    [key: string]: number;
    free: number;
    pro: number;
    ultimate: number;
}

const WEEKLY_LIMITS: UsageLimit = {
    free: 10,
    pro: 100,
    ultimate: Infinity
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

interface ChatProps {
  type: ChatType;
  assistantId: string;
  vectorStoreId: string;
}

export default function Chat({ type, assistantId, vectorStoreId }: ChatProps) {
  const { user, loading, error: authError } = useAuth();
  const { 
    messages,
    currentThreadId,
    setCurrentThreadId,
    sendMessage,
    isLoading,
    error,
    setMessages,
    setError,
    setIsLoading
  } = useChat();
  const [input, setInput] = useState('');
  const [weeklyUsage, setWeeklyUsage] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [isCreatingThread, setIsCreatingThread] = useState(false);


  useEffect(() => {
    if (user && !currentThreadId) {
      console.log('[DEBUG] 初始化加载');
      setMessages([]);
    }
  }, [user]);

  // 滾動到最新訊息
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 當 currentThreadId 變化時加載聊天歷史
  useEffect(() => {
    if (currentThreadId && user) {
      fetchMessageHistory(currentThreadId);
    }
  }, [currentThreadId]);

  // 加載聊天歷史的函數
  const fetchMessageHistory = async (threadId: string) => {
    if (!threadId || !user) return;
    
    try {
      setIsFetchingHistory(true);
      setIsLoading(true);
      
      const response = await fetch(`/api/messages?threadId=${threadId}&userId=${user.user_id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('获取聊天历史失败');
      }

      const data = await response.json();
      console.log('[DEBUG] 获取聊天历史成功:', data);
      
      // 格式化消息
      if (data.success && Array.isArray(data.messages)) {
        const formattedMessages = data.messages.map((msg: any) => ({
          text: msg.content,
          sender: msg.role === 'user' ? 'user' : 'bot'
        }));
        
        setMessages(formattedMessages);
      } else {
        // 如果返回的不是期望的格式，则设置为空数组
        setMessages([]);
      }
      
    } catch (err) {
      console.error('[ERROR] 获取聊天历史失败:', err);
      setError(err instanceof Error ? err.message : '获取聊天历史失败');
    } finally {
      setIsFetchingHistory(false);
      setIsLoading(false);
    }
  };

  const handleSelectThread = async (threadId: string) => {
    try {
      if (threadId === currentThreadId) {
        return;
      }

      console.log('[DEBUG] 切换对话:', {
        from: currentThreadId || 'none',
        to: threadId
      });

      setIsLoading(true);
      setMessages([]);
      setError('');
      
      setCurrentThreadId(threadId);

    } catch (err) {
      console.error('[ERROR] 切换对话失败:', err);
      setError(err instanceof Error ? err.message : '切换对话失败');
      setCurrentThreadId(currentThreadId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewThread = async () => {
    if (isCreatingThread || !user) return;
    
    try {
      setIsCreatingThread(true);
      setIsLoading(true);
      setError('');
      
      const response = await fetch('/api/threads/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: String(user.user_id),
          type: type
        })
      });

      if (!response.ok) {
        throw new Error('创建新对话失败');
      }

      const data = await response.json();
      console.log('[DEBUG] 创建新线程:', { threadId: data.threadId });
      
      setCurrentThreadId(data.threadId);
      setMessages([]);
      
      // 觸發會話列表更新
      window.dispatchEvent(new CustomEvent('refreshConversations'));
      
    } catch (err) {
      console.error('[ERROR] 创建新对话失败:', err);
      setError(err instanceof Error ? err.message : '创建新对话失败');
    } finally {
      setIsCreatingThread(false);
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!isLoading && input.trim()) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  if (loading) return <div>加载中...</div>;
  if (error) return <div>认证错误: {error}</div>;
  if (!user) return (
    <div className={styles.loginPrompt}>
      <p>请先登录后使用</p>
      <button 
        className={styles.loginButton}
        onClick={() => window.open('https://ai4kingdom.com/login', '_blank')}
      >
        去登录
      </button>
    </div>
  );

  return (
    <div className={styles.container}>
      {user && (
        <div className={styles.conversationListContainer}>
          <ConversationList
            userId={String(user.user_id)}
            currentThreadId={currentThreadId}
            onSelectThread={handleSelectThread}
            type={type}
            isCreating={isCreatingThread}
            onCreateNewThread={handleCreateNewThread}
          />
        </div>
      )}
      <div className={styles.chatWindow}>
        {isFetchingHistory ? (
          <div className={styles.loading}>加载历史记录中...</div>
        ) : (
          <div className={styles.messagesWrapper}>
            <div className={styles.messageContainer}>
              {messages.length === 0 && !isLoading && (
                <div className={styles.emptyChat}>
                  <p>开始一个新的对话吧！</p>
                  <button 
                    className={styles.newChatButton}
                    onClick={handleCreateNewThread}
                    disabled={isCreatingThread}
                  >
                    {isCreatingThread ? '创建中...' : '+ 新对话'}
                  </button>
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`${styles.message} ${
                    message.sender === 'user' ? styles.userMessage : styles.botMessage
                  }`}
                >
                  {message.sender === 'bot' && (
                    <div className={`${styles.avatar} ${styles.botAvatar}`}>
                      AI
                    </div>
                  )}
                  <div className={styles.messageContent}>
                    {message.text}
                  </div>
                  {message.sender === 'user' && (
                    <div className={`${styles.avatar} ${styles.userAvatar}`}>
                      U
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className={`${styles.message} ${styles.botMessage}`}>
                  <div className={`${styles.avatar} ${styles.botAvatar}`}>
                    AI
                  </div>
                  <div className={styles.messageContent}>
                    <span className={styles.typing}>AI正在思考...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} /> {/* 用於自動滾動到最新訊息 */}
            </div>
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.inputContainer}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={isLoading ? "发送中..." : "输入消息..."}
            className={styles.input}
            disabled={isLoading || isFetchingHistory}
            rows={2}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || isFetchingHistory}
            className={styles.sendButton}
          >
            {isLoading ? "发送中..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}