'use client';

import { useState, useEffect } from 'react';
import styles from './ConversationList.module.css';
import { CHAT_CONFIGS, ChatType } from '../config/chatTypes';

interface Conversation {
  threadId: string;
  title?: string;
  createdAt: string;
  type: string;
  UserId: string;
}

interface ConversationListProps {
  userId: string;
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  type: ChatType;
  isCreating: boolean;
  onCreateNewThread: (e: React.MouseEvent) => void;
}

export default function ConversationList({
  userId,
  currentThreadId,
  onSelectThread,
  type,
  isCreating,
  onCreateNewThread
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const config = CHAT_CONFIGS[type];

  // 获取对话列表
  const fetchConversations = async () => {
    console.log('[DEBUG] 获取对话列表:', { userId, type });
    
    try {
        const response = await fetch(`/api/threads?userId=${userId}&type=${type}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`获取对话列表失败: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[DEBUG] 获取到对话列表:', data);

        // 添加数据验证日志
        const validConversations = data.filter((conv: any) => {
            const convType = conv.Type || conv.type;
            const isValid = conv.threadId && convType === type;
            
            if (!isValid) {
                console.warn('[WARN] 过滤掉无效对话:', {
                    threadId: conv.threadId,
                    type: convType,
                    expectedType: type
                });
            }
            
            return isValid;
        });

        const formattedConversations = validConversations.map((conv: any) => ({
            threadId: conv.threadId,
            createdAt: conv.Timestamp || conv.timestamp || conv.createdAt || new Date().toISOString(),
            UserId: conv.UserId,
            type: conv.Type || conv.type,
            title: conv.title || '新对话'
        }));

        setConversations(formattedConversations);
        console.log('[DEBUG] 格式化后的对话列表:', formattedConversations);
        
        setError(null);
    } catch (err) {
      console.error('[ERROR] 获取对话列表失败:', err);
      setError(err instanceof Error ? err.message : '加载失败');
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  // 删除对话
  const handleDelete = async (threadId: string) => {
    try {
      const response = await fetch(`/api/threads/${threadId}`, {
        method: 'DELETE',
        headers: {
          'user-id': userId // 添加用户ID到请求头
        }
      });

      if (!response.ok) {
        throw new Error('删除对话失败');
      }

      console.log('[DEBUG] 对话删除成功:', threadId);
      
      // 刷新对话列表
      await fetchConversations();
      
      // 如果删除的是当前选中的对话，清空选择
      if (currentThreadId === threadId) {
        onSelectThread('');
      }
      
    } catch (error) {
      console.error('[ERROR] 删除对话失败:', error);
      setError(error instanceof Error ? error.message : '删除失败');
    }
  };

  // 创建新对话并刷新列表
  const handleCreateNewThread = async (e: React.MouseEvent) => {
    e.preventDefault();
    console.log('[DEBUG] 触发创建新对话');
    
    if (isCreating || !onCreateNewThread) {
      console.log('[DEBUG] 创建被跳过:', { isCreating, hasCallback: !!onCreateNewThread });
      return;
    }
    
    await onCreateNewThread(e);
    await fetchConversations();
  };

  // 添加监听器来处理刷新事件
  useEffect(() => {
    const handleRefresh = () => {
      console.log('[DEBUG] 接收到刷新对话列表事件');
      fetchConversations();
    };

    window.addEventListener('refreshConversations', handleRefresh);
    return () => window.removeEventListener('refreshConversations', handleRefresh);
  }, [type]);

  // 初始加载和依赖变化时获取对话列表
  useEffect(() => {
    if (userId && type) {
      console.log('[DEBUG] 初始加载对话列表:', { userId, type });
      fetchConversations();
    }
  }, [userId, type]);

  const handleThreadSelect = (threadId: string) => {
    console.log('[DEBUG] 选择对话:', threadId);
    onSelectThread(threadId);
  };

  // 添加日期格式化函数
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // 如果是今天的日期，只显示时间
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      
      if (isToday) {
        return date.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      // 其他日期显示完整日期
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('[ERROR] 日期格式化失败:', {
        输入: dateString,
        错误: error instanceof Error ? error.message : String(error)
      });
      return '时间未知';
    }
  };

  const renderConversationList = () => (
    <div className={styles.list}>
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : conversations.length === 0 ? (
        <div className={styles.emptyState}>
          <p>还没有对话，开始创建一个吧！</p>
        </div>
      ) : (
        conversations.map((conv) => (
          <div 
            key={conv.threadId}
            className={`${styles.item} ${currentThreadId === conv.threadId ? styles.active : ''}`}
            onClick={() => {
              handleThreadSelect(conv.threadId);
              setIsDropdownOpen(false); // 选择后关闭下拉菜单
            }}
          >
            <div className={styles.itemContent}>
              <div className={styles.itemTitle} style={{ whiteSpace: 'nowrap' }}>
                {conv.title || '新对话'}
              </div>
              <div className={styles.itemTime}>
                {formatDate(conv.createdAt)}
              </div>
            </div>
            <button
              className={styles.deleteButton}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(conv.threadId);
              }}
            >
              <svg 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                className={styles.deleteIcon}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <>
      {/* 桌面版视图 */}
      <div className={styles.container}>
        <div className={styles.header}>
          <button
            className={styles.newButton}
            onClick={handleCreateNewThread}
            disabled={isCreating}
          >
            {isCreating ? '创建中...' : `+ 新建${config.title}`}
          </button>
        </div>
        {renderConversationList()}
      </div>

      {/* 移动端下拉菜单 */}
      <div className={styles.mobileDropdown}>
        <button 
          className={styles.dropdownButton}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <span>
            {currentThreadId 
              ? (conversations.find(c => c.threadId === currentThreadId)?.title || '当前对话')
              : '选择或创建对话'}
          </span>
          <svg 
            viewBox="0 0 24 24" 
            width="20" 
            height="20" 
            stroke="currentColor" 
            strokeWidth="2" 
            fill="none"
          >
            <path d={isDropdownOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
          </svg>
        </button>
        <div className={`${styles.dropdownContent} ${isDropdownOpen ? styles.open : ''}`}>
          <button
            className={styles.newButton}
            onClick={(e) => {
              handleCreateNewThread(e);
              setIsDropdownOpen(false);
            }}
            disabled={isCreating}
          >
            {isCreating ? '创建中...' : `+ 新建${config.title}`}
          </button>
          {renderConversationList()}
        </div>
      </div>
    </>
  );
}