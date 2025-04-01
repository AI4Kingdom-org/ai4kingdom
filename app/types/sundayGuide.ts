export interface SundayGuideItem {
  UserId: string;
  Timestamp: string;
  assistantId?: string;
  vectorStoreId?: string;
  youtubeUrl?: string;
  transcription?: string;
  documents?: string[];
} 