import { ASSISTANT_IDS, VECTOR_STORE_IDS } from './constants';

export const CHAT_TYPES: Record<string, ChatType> = {
  GENERAL: 'general',
  HOMESCHOOL: 'homeschool',
  SUNDAY_GUIDE: 'sunday-guide',
  BIBLE_STUDY: 'bible-study',
  SPIRITUAL_PARTNER: 'spiritual-partner',
  CHILDREN_MENTAL: 'children-mental',
  JOHNSUNG: 'johnsung'
} as const;


export type ChatType = 'general' | 'sunday-guide' | 'bible-study' | 'homeschool' | 'spiritual-partner' | 'children-mental' | 'johnsung';


export interface ChatTypeConfig {
  type: ChatType;
  title: string;
  description: string;
  assistantId?: string;
  vectorStoreId?: string;
}

export const CHAT_TYPE_CONFIGS: Record<ChatType, ChatTypeConfig> = {
  'general': {
    type: 'general',
    title: '通用对话',
    description: '可以和AI进行任何话题的交谈',
    assistantId: ASSISTANT_IDS.GENERAL,
    vectorStoreId: VECTOR_STORE_IDS.GENERAL
  },
  'homeschool': {
    type: 'homeschool',
    title: '家庭教育',
    description: '专注于家庭教育相关的咨询和建议',
    assistantId: ASSISTANT_IDS.HOMESCHOOL,
    vectorStoreId: VECTOR_STORE_IDS.HOMESCHOOL
  },
  'sunday-guide': {
    type: 'sunday-guide',
    title: '主日导读',
    description: '主日经文导读助手'
  },
  'bible-study': {
    type: 'bible-study',
    title: '查经',
    description: '圣经学习助手'
  },
  'spiritual-partner': {
    type: 'spiritual-partner',
    title: '灵修伙伴',
    description: '灵修伙伴',
    assistantId: ASSISTANT_IDS.SPIRITUAL_PARTNER,
    vectorStoreId: VECTOR_STORE_IDS.SPIRITUAL_PARTNER
  },
  'children-mental': {
    type: 'children-mental',
    title: '对话',
    description: '儿童心理咨询',
    assistantId: ASSISTANT_IDS.CHILDREN_MENTAL,
    vectorStoreId: VECTOR_STORE_IDS.CHILDREN_MENTAL
  },
  'johnsung': {
    type: 'johnsung',
    title: '宋尚节牧师解答属灵问题',
    description: '宋尚节牧师解答属灵问题',
    assistantId: ASSISTANT_IDS.JOHNSUNG,
    vectorStoreId: VECTOR_STORE_IDS.JOHNSUNG
  }



};

interface ChatConfig {
  title: string;
  description: string;
  icon?: string;
}

export const CHAT_CONFIGS: Record<ChatType, ChatConfig> = {
  'general': {
    title: '通用对话',
    description: '可以和AI进行任何话题的交谈'
  },
  'sunday-guide': {
    title: '主日导读',
    description: '主日经文导读助手'
  },
  'bible-study': {
    title: '查经',
    description: '圣经学习助手'
  },
  'homeschool': {
    title: '家庭教育',
    description: '专注于家庭教育相关的咨询和建议'
  },
  'spiritual-partner': {
    title: '灵修伙伴',
    description: '灵修伙伴'
  },
  'children-mental': {
    title: '对话',
    description: '儿童心理咨询'
  },
  'johnsung': {
    title: '與宋尚节牧师对话',
    description: '宋尚节牧师解答属灵问题'
  }

}; 