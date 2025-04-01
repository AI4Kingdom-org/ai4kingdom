'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { FEATURE_ACCESS } from '../types/auth';
import type { UserData, AuthState, AuthContextType, FeatureKey, MemberRole } from '../types/auth';

interface User {
  user_id: string;
  nonce?: string;
  username: string;
  email: string;
  display_name: string;
  success: boolean;
  subscription: {
    status: 'active' | 'inactive';
    type: 'free' | 'pro' | 'ultimate';
    roles: MemberRole[];
    expiry: string | null;
    plan_id: string;
  };
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = 'https://ai4kingdom.com';

  const makeRequest = async (endpoint: string, options: RequestInit) => {
    try {
      const response = await fetch(`${API_BASE}/wp-json/custom/v1/${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {})
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[ERROR] API请求失败:', err);
      throw err;
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/wp-json/custom/v1/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        await checkAuth();
        return true;
      }
      
      throw new Error(data.message || '登录失败');
    } catch (err) {
      console.error('[ERROR] 登录失败:', err);
      setError(err instanceof Error ? err.message : '登录失败');
      setLoading(false);
      return false;
    }
  };

  const checkAuth = async () => {
    try {
      const data = await makeRequest('validate_session', {
        method: 'POST'
      });

      if (data.success) {
        setUser({
          user_id: data.user_id,
          nonce: data.nonce,
          username: data.username,
          email: data.email,
          display_name: data.display_name,
          success: data.success,
          subscription: {
            status: data.subscription?.status || 'inactive',
            type: data.subscription?.type || 'free',
            roles: data.subscription?.roles || [],
            expiry: data.subscription?.expiry || null,
            plan_id: data.subscription?.plan_id || ''
          }
        });
      } else {
        throw new Error(data.message || '验证失败');
      }
    } catch (err) {
      console.error('[ERROR] 会话验证失败:', err);
      setError(err instanceof Error ? err.message : '认证失败');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await makeRequest('logout', {
        method: 'POST'
      });
    } catch (err) {
      console.error('[ERROR] 登出失败:', err);
    } finally {
      setUser(null);
      setLoading(false);
      setError(null);
    }
  };

  // 订阅相关的工具方法
  const getSubscriptionStatus = (): 'active' | 'inactive' => {
    return user?.subscription?.status || 'inactive';
  };

  const getSubscriptionType = (): 'free' | 'pro' | 'ultimate' => {
    return user?.subscription?.type || 'free';
  };

  const isSubscriptionValid = () => {
    const subscription = user?.subscription;
    if (!subscription) return false;

    if (subscription.status !== 'active') return false;
    
    if (subscription.expiry) {
      const expiryDate = new Date(subscription.expiry);
      if (expiryDate < new Date()) return false;
    }

    return true;
  };

  // 新增：角色检查方法
  const hasRole = (role: MemberRole) => {
    return user?.subscription?.roles?.includes(role) || false;
  };

  // 新增：功能访问检查方法
  const canAccessFeature = (feature: FeatureKey) => {
    const userRoles = user?.subscription?.roles || [];
    const requiredRoles = FEATURE_ACCESS[feature];
    return userRoles.some(role => requiredRoles.includes(role));
  };

  // 初始化时检查认证状态
  useEffect(() => {
    checkAuth();
  }, []);

  // 定期检查会话状态
  useEffect(() => {
    const sessionCheckInterval = setInterval(() => {
      checkAuth();
    }, 30 * 60 * 1000); // 每30分钟检查一次

    return () => {
      clearInterval(sessionCheckInterval);
    };
  }, []);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    checkAuth,
    getSubscriptionStatus,
    getSubscriptionType,
    isSubscriptionValid,
    hasRole,
    canAccessFeature
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 