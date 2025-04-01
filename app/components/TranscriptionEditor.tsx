'use client';

import { useState, useEffect } from 'react';
import styles from './TranscriptionEditor.module.css';

interface TranscriptionEditorProps {
  assistantId: string | null;
}

export default function TranscriptionEditor({ assistantId }: TranscriptionEditorProps) {
  const [transcription, setTranscription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assistantId) {
      fetchTranscription(assistantId);
    } else {
      setTranscription('');
    }
  }, [assistantId]);

  const fetchTranscription = async (id: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/sunday-guide/assistants/${id}`);
      if (!response.ok) throw new Error('获取转录文本失败');
      const data = await response.json();
      setTranscription(data.transcription || '');
    } catch (error) {
      setError(error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!assistantId) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/sunday-guide/assistants/${assistantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcription }),
      });

      if (!response.ok) throw new Error('更新转录文本失败');
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  if (!assistantId) return null;

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}
      <textarea
        value={transcription}
        onChange={(e) => setTranscription(e.target.value)}
        className={styles.textarea}
        placeholder="转录文本..."
        disabled={isLoading}
      />
      <button
        onClick={handleUpdate}
        disabled={isLoading}
        className={styles.updateButton}
      >
        {isLoading ? '更新中...' : '更新转录文本'}
      </button>
    </div>
  );
} 