'use client';

import { ReactNode, useEffect, useState, useMemo } from 'react';
import { AuthProvider } from '../../contexts/AuthContext';
import { ChatProvider } from '../../contexts/ChatContext';
import { ASSISTANT_IDS, VECTOR_STORE_IDS } from '../../config/constants';
import { useAuth } from '../../contexts/AuthContext';
import { ChatType, CHAT_TYPE_CONFIGS } from '../../config/chatTypes';

interface WithChatProps {
  children: ReactNode;
  chatType?: ChatType;
}

function ChatWrapper({ children, chatType = 'general' }: { children: ReactNode, chatType?: ChatType }) {
  const { user } = useAuth();
  const [isReady, setIsReady] = useState(false);
  
  const config = useMemo(() => {
    if (!user) return null;
    
    // 根据聊天类型获取对应的配置
    const typeConfig = CHAT_TYPE_CONFIGS[chatType];
    
    return {
      type: chatType,
      assistantId: typeConfig.assistantId || ASSISTANT_IDS.GENERAL,
      vectorStoreId: typeConfig.vectorStoreId || VECTOR_STORE_IDS.GENERAL,
      userId: user.user_id
    };
  }, [user, chatType]);

  useEffect(() => {
    if (user) {
      setIsReady(true);
    }
  }, [user]);
  
  // 等待用户加载完成
  if (!isReady || !config) {
    return null;
  }

  return (
    <ChatProvider 
      initialConfig={config}
    >
      {children}
    </ChatProvider>
  );
}

export default function WithChat({ children, chatType = 'general' }: WithChatProps) {
  return (
    <AuthProvider>
      <ChatWrapper chatType={chatType}>
        {children}
      </ChatWrapper>
    </AuthProvider>
  );
} 