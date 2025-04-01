export interface Subscription {
  status: 'active' | 'inactive';
  type: 'free' | 'pro' | 'ultimate';
  expiry: string | null;
  plan_id: string | null;
  roles: MemberRole[];
}

export interface UserData {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  subscription: Subscription;
  nonce?: string;
  success: boolean;
}

export interface AuthState {
  user: UserData | null;
  loading: boolean;
  error: string | null;
}

export type MemberRole = 'free_member' | 'pro_member' | 'ultimate_member';
export type FeatureKey = 'chat' | 'history' | 'advanced_prompts' | 'custom_models';

export const FEATURE_ACCESS: Record<FeatureKey, MemberRole[]> = {
  chat: ['free_member', 'pro_member', 'ultimate_member'],
  history: ['free_member', 'pro_member', 'ultimate_member'],
  advanced_prompts: ['pro_member', 'ultimate_member'],
  custom_models: ['ultimate_member']
};

export interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  getSubscriptionStatus: () => 'active' | 'inactive';
  getSubscriptionType: () => 'free' | 'pro' | 'ultimate';
  isSubscriptionValid: () => boolean;
  hasRole: (role: MemberRole) => boolean;
  canAccessFeature: (feature: FeatureKey) => boolean;
}

// ... 其他类型定义保持不变 ... 