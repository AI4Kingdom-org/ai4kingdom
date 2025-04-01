"use client";

import { useState, useEffect } from 'react';
import styles from './ChatInput.module.css';
import { useChat } from '../../contexts/ChatContext';

interface ChatInputProps {
  onSend: (message: string) => Promise<void>;
  isLoading: boolean;
}

export default function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const { currentThreadId } = useChat();

  // Clear input when thread changes
  useEffect(() => {
    setInput('');
  }, [currentThreadId]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    await onSend(input);
    setInput('');
  };

  return (
    <div className={styles.inputContainer}>
      <textarea
        className={styles.textArea}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder={
          !currentThreadId 
            ? "请点击左上角创建新对话" 
            : isLoading 
              ? "发送中..." 
              : "输入消息..."
        }
        disabled={isLoading || !currentThreadId}
        rows={2}
      />
      <button
        className={styles.button}
        onClick={handleSend}
        disabled={!input.trim() || isLoading || !currentThreadId}
      >
        {isLoading ? "发送中..." : "发送"}
      </button>
    </div>
  );
} 