'use client';

import WithChat from '../components/layouts/WithChat';
import Chat from '../components/Chat/Chat';
import { ASSISTANT_IDS, VECTOR_STORE_IDS } from '../config/constants';
import styles from './page.module.css';  // 导入样式

export default function NewChatPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.chatContainer}>
          <WithChat chatType="children-mental">
            <Chat
              type="children-mental"
              assistantId={ASSISTANT_IDS.CHILDREN_MENTAL}
              vectorStoreId={VECTOR_STORE_IDS.CHILDREN_MENTAL}
            />
          </WithChat>
        </div>
      </div>
    </div>
  );
}