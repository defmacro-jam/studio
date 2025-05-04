export interface User {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface RetroItem {
  id: string;
  author: User;
  content: string;
  timestamp: Date;
  replies?: RetroItem[]; // Optional for replies
  category?: 'well' | 'improve' | 'discuss' | 'action'; // Added category
  isFromPoll?: boolean; // Optional flag to indicate if item originated from a poll submission
}

export interface PollResponse {
  id: string;
  author: User;
  rating: number;
  justification: string;
  timestamp: Date;
}
