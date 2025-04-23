'use client';

import { useState, useEffect } from 'react';
import AssistantManager from '../components/AssistantManager';
import TranscriptionEditor from '../components/TranscriptionEditor';
import YouTubeUploader from '../components/YouTubeUploader';
import DocumentUploader from '../components/DocumentUploader';
import Chat from '../components/Chat/Chat';
import WithChat from '../components/layouts/WithChat';
import styles from './SundayGuide.module.css';

export default function SundayGuide() {
  const [selectedAssistant, setSelectedAssistant] = useState<{
    assistantId: string;
    vectorStoreId?: string;
  } | null>(null);

  // 添加初始化日志
  useEffect(() => {
    console.log('[DEBUG] SundayGuide 页面初始化:', {
      selectedAssistant,
      环境: process.env.NODE_ENV,
      hasAssistant: !!selectedAssistant,
      时间戳: new Date().toISOString()
    });
  }, [selectedAssistant]);

  const handleAssistantSelect = async (assistantId: string, vectorStoreId?: string) => {
    try {
      console.log('[DEBUG] 开始选择助手:', { 
        assistantId, 
        vectorStoreId,
        当前状态: selectedAssistant,
        时间戳: new Date().toISOString()
      });
      
      // 更新所有其他助手状态为非活跃
      const response = await fetch('/api/sunday-guide/assistants/deactivate-all', {
        method: 'POST'
      });

      console.log('[DEBUG] 停用其他助手响应:', {
        状态: response.status,
        ok: response.ok,
        时间戳: new Date().toISOString()
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[ERROR] 停用助手失败:', {
          状态码: response.status,
          错误信息: errorData,
          时间戳: new Date().toISOString()
        });
        throw new Error('更新助手状态失败');
      }
      console.log('[DEBUG] 所有助手已设置为非活跃');

      // 设置选中的助手为活跃状态
      const activateResponse = await fetch(`/api/sunday-guide/assistants/${assistantId}/activate`, {
        method: 'POST'
      });

      console.log('[DEBUG] 激活助手响应:', {
        状态: activateResponse.status,
        ok: activateResponse.ok,
        时间戳: new Date().toISOString()
      });

      if (!activateResponse.ok) {
        const errorData = await activateResponse.json();
        console.error('[ERROR] 激活助手失败:', {
          状态码: activateResponse.status,
          错误信息: errorData,
          时间戳: new Date().toISOString()
        });
        throw new Error('激活助手失败');
      }
      console.log('[DEBUG] 助手激活成功:', { assistantId, vectorStoreId });

      setSelectedAssistant({ assistantId, vectorStoreId });
      
    } catch (error) {
      console.error('[ERROR] 选择助手失败:', {
        错误: error,
        消息: error instanceof Error ? error.message : '未知错误',
        堆栈: error instanceof Error ? error.stack : undefined,
        时间戳: new Date().toISOString()
      });
    }
  };

  const handleVectorStoreCreated = async (vectorStoreId: string) => {
    console.log('[DEBUG] Vector Store 创建事件:', {
      vectorStoreId,
      当前助手: selectedAssistant,
      时间戳: new Date().toISOString()
    });
    
    if (selectedAssistant?.assistantId) {
      try {
        console.log('[DEBUG] 开始更新助手 Vector Store:', {
          assistantId: selectedAssistant.assistantId,
          vectorStoreId,
          时间戳: new Date().toISOString()
        });

        const response = await fetch(`/api/sunday-guide/assistants/${selectedAssistant.assistantId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            vectorStoreId
          })
        });

        console.log('[DEBUG] 更新助手响应:', {
          状态: response.status,
          ok: response.ok,
          时间戳: new Date().toISOString()
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('[ERROR] 更新助手失败:', {
            状态码: response.status,
            错误信息: errorData,
            时间戳: new Date().toISOString()
          });
          throw new Error('更新助手失败');
        }

        setSelectedAssistant(prev => prev ? {
          ...prev,
          vectorStoreId
        } : null);

        console.log('[DEBUG] 助手 vectorStoreId 更新成功:', {
          assistantId: selectedAssistant.assistantId,
          vectorStoreId,
          时间戳: new Date().toISOString()
        });
      } catch (error) {
        console.error('[ERROR] 更新助手 vectorStoreId 失败:', {
          错误: error,
          消息: error instanceof Error ? error.message : '未知错误',
          堆栈: error instanceof Error ? error.stack : undefined,
          时间戳: new Date().toISOString()
        });
      }
    }
  };

  return (
    <WithChat>
      <div className={styles.container}>
        <h1 className={styles.title}>Sunday Guide</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>YouTube 上传</h2>
          <YouTubeUploader onVectorStoreCreated={handleVectorStoreCreated} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>助手管理</h2>
          <AssistantManager onAssistantSelect={handleAssistantSelect} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>转录文本编辑</h2>
          <TranscriptionEditor assistantId={selectedAssistant?.assistantId || null} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>文档上传</h2>
          <DocumentUploader
            assistantId={selectedAssistant?.assistantId}
            vectorStoreId={selectedAssistant?.vectorStoreId}
          />
        </section>
      </div>
    </WithChat>
  );
} 