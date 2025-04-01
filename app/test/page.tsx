'use client';

import TestModule from '../components/TestModule';
import styles from './test.module.css';

export default function TestPage() {
  // 直接渲染 TestModule，移除所有认证和超时检查
  return <TestModule />;
} 