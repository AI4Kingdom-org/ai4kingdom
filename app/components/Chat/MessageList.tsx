"use client";

import { useEffect, useRef, useState } from "react";
import styles from './MessageList.module.css';

interface Message {
  sender: string;
  text: string;
  timestamp?: string;
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export default function MessageList({ messages, isLoading }: MessageListProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMessages, streamingMessage]);

  useEffect(() => {
    if (messages.length === 0) {
      setDisplayedMessages([]);
      setStreamingMessage("");
      return;
    }

    const lastMessage = messages[messages.length - 1];

    // Always display all messages except the last bot message
    const messagesToDisplay = messages.slice(0, -1);
    setDisplayedMessages(messagesToDisplay);

    // Stream bot response if it's the last message
    if (lastMessage.sender === "bot") {
      let words = lastMessage.text.split(" ");
      let index = 0;

      const interval = setInterval(() => {
        if (index < words.length) {
          setStreamingMessage((prev) => prev + (index === 0 ? "" : " ") + words[index]);
          index++;
        } else {
          clearInterval(interval);
          setDisplayedMessages([...messages]); // Final message displayed
          setStreamingMessage("");
        }
      }, 50);

      return () => clearInterval(interval);
    } else {
      // If the last message is from user, display it immediately
      setDisplayedMessages([...messages]);
    }
  }, [messages]);

  return (
    <div className={styles.messageList}>
      {displayedMessages.map((message, index) => (
        <div
          key={index}
          className={`${styles.message} ${
            message.sender === 'user' ? styles.userMessage : styles.botMessage
          }`}
        >
          {message.sender === 'bot' && (
            <div className={styles.avatar}>AI</div>
          )}
          <div className={styles.messageContent}>{message.text}</div>
          {message.sender === 'user' && (
            <div className={styles.avatar}>U</div>
          )}
        </div>
      ))}
      {streamingMessage && (
        <div className={`${styles.message} ${styles.botMessage}`}>
          <div className={styles.avatar}>AI</div>
          <div className={styles.messageContent}>{streamingMessage}</div>
        </div>
      )}
      <div ref={chatEndRef} />
    </div>
  );
}
