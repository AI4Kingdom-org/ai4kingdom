"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ASSISTANT_IDS, VECTOR_STORE_IDS } from '../config/constants';
import { ChatType } from '../config/chatTypes';
import { useAuth } from '../contexts/AuthContext';

interface ChatConfig {
  type: ChatType;
  assistantId: string;
  vectorStoreId: string;
  userId?: string;
  systemPrompt?: string;
  threadId?: string;
}

interface ChatContextType {
  config: {
    type: ChatType;
    assistantId?: string;
    vectorStoreId?: string;
    userId?: string;
    threadId?: string;
  } | null;
  setConfig: (config: ChatContextType['config']) => void;
  messages: Array<{ sender: string; text: string }>;
  setMessages: React.Dispatch<React.SetStateAction<Array<{ sender: string; text: string }>>>;
  currentThreadId: string | null;
  setCurrentThreadId: (threadId: string | null) => void;
  sendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  loadChatHistory: (userId: string) => Promise<void>;
  setIsLoading: (loading: boolean) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ 
  children,
  initialConfig = {
    assistantId: ASSISTANT_IDS.GENERAL,
    vectorStoreId: VECTOR_STORE_IDS.GENERAL,
    type: 'general'
  },
  user
}: {
  children: React.ReactNode;
  initialConfig?: ChatConfig;
  user?: any;
}) {
  const { user: authUser } = useAuth();  // 获取认证用户
  const [config, setConfigState] = useState<ChatContextType['config']>(initialConfig || null);
  const [messages, setMessages] = useState<Array<{ sender: string; text: string }>>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setConfig = useCallback((newConfig: ChatContextType['config']) => {
    setConfigState(newConfig);
  }, []);

  useEffect(() => {
    if (!config || config.type !== initialConfig?.type) {
      console.log('[DEBUG] ChatProvider 初始化配置:', {
        user,
        initialConfig,
        type: initialConfig?.type
      });
      
      setConfig({
        ...config,
        type: initialConfig?.type,
        assistantId: ASSISTANT_IDS[initialConfig?.type.toUpperCase() as keyof typeof ASSISTANT_IDS],
        vectorStoreId: VECTOR_STORE_IDS[initialConfig?.type.toUpperCase() as keyof typeof VECTOR_STORE_IDS],
        userId: user?.user_id || authUser?.user_id
      });
    }
  }, [initialConfig?.type, user, authUser]);

  useEffect(() => {
    setMessages([]);
    setCurrentThreadId(null);
    setError(null);
  }, [config?.assistantId, config?.vectorStoreId, config?.type]);

  const sendMessage = useCallback(async (message: string) => {
    setIsLoading(true);
    setError(null);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                threadId: currentThreadId,
                userId: config?.userId,
                config: {
                    type: config?.type,
                    assistantId: config?.assistantId,
                    vectorStoreId: config?.vectorStoreId
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[ERROR] 发送消息失败:', {
                status: response.status,
                error: errorData
            });
            throw new Error(errorData.error || '发送失败');
        }

        const data = await response.json();

        if (data.success) {
            setMessages(prev => [
                ...prev,
                { sender: 'user', text: message },
                { sender: 'bot', text: data.reply }
            ]);
            setCurrentThreadId(data.threadId);
        }

        return data;
    } catch (error) {
        console.error('[ERROR] 发送消息失败:', error);
        setError(error instanceof Error ? error.message : '发送消息失败');
        throw error;
    } finally {
        setIsLoading(false);
    }
}, [currentThreadId, config]);

  const loadChatHistory = useCallback(async (userId: string) => {

    try {
        const response = await fetch(`/api/messages?threadId=${currentThreadId}&userId=${userId}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[ERROR] 加载历史消息失败:', {
                status: response.status,
                error: errorData
            });
            throw new Error(errorData.error || '加载失败');
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.messages)) {
            const formattedMessages = data.messages.map((msg: any) => ({
                sender: msg.role === 'user' ? 'user' : 'bot',
                text: msg.content
            }));
            
            setMessages(formattedMessages);
        }
    } catch (error) {
        console.error('[ERROR] 加载历史消息失败:', {
            error,
            threadId: currentThreadId,
            errorMessage: error instanceof Error ? error.message : '未知错误'
        });
        setError(error instanceof Error ? error.message : '加载历史消息失败');
    }
}, [currentThreadId, config]);

  const value: ChatContextType = {
    config,
    setConfig,
    messages,
    setMessages,
    currentThreadId,
    setCurrentThreadId,
    sendMessage,
    isLoading,
    error,
    setError,
    loadChatHistory,
    setIsLoading
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
} 