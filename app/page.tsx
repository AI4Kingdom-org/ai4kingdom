"use client";

import { AuthProvider, useAuth } from './contexts/AuthContext';
import WithChat from './components/layouts/WithChat';
import Chat from './components/Chat/Chat';
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CHAT_TYPES } from './config/chatTypes';
import { ASSISTANT_IDS, VECTOR_STORE_IDS } from './config/constants';
import { ChatProvider } from './contexts/ChatContext';

export default function Home() {
  const { user, loading } = useAuth();
  
  console.log('[DEBUG] General页面初始化:', {
    userId: user?.user_id,
    loading,
    assistantId: ASSISTANT_IDS.GENERAL,
    vectorStoreId: VECTOR_STORE_IDS.GENERAL
  });
  
  if (loading) {
    return <div>加载中...</div>;
  }

  if (!user?.user_id) {
    return <div>请先登录</div>;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <WithChat>
          <main style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ flex: 1, display: 'flex' }}>
              <ChatProvider initialConfig={{
                type: CHAT_TYPES.GENERAL,
                assistantId: ASSISTANT_IDS.GENERAL,
                vectorStoreId: VECTOR_STORE_IDS.GENERAL,
                userId: user.user_id
              }}>
                <Chat 
                  type={CHAT_TYPES.GENERAL}
                  assistantId={ASSISTANT_IDS.GENERAL}
                  vectorStoreId={VECTOR_STORE_IDS.GENERAL}
                  userId={user.user_id}
                />
              </ChatProvider>
            </div>
          </main>
        </WithChat>
      </AuthProvider>
    </ErrorBoundary>
  );
}