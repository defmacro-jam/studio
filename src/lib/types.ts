
export type Category = 'well' | 'improve' | 'discuss' | 'action';

// Updated User type to better align with Firebase Auth and app needs
export interface User {
  id: string; // Corresponds to Firebase UID
  name: string; // Corresponds to Firebase displayName or a fallback
  email?: string | null; // Optional: Corresponds to Firebase email
  avatarUrl?: string | null; // Optional: Corresponds to Firebase photoURL or custom avatar URL
  // Add other relevant fields if needed, e.g., from Firestore user document
  // teamIds?: string[];
}

export interface RetroItem {
  id: string;
  author: User; // Use the updated User type
  content: string;
  timestamp: Date; // Consider using Firestore Timestamp type if fetching directly
  replies?: RetroItem[]; // Optional for replies
  category: Category; // Category is required
  isFromPoll?: boolean; // Optional flag
  pollResponseId?: string; // Optional ID
}

export interface PollResponse {
  id: string;
  author: User; // Use the updated User type
  rating: number;
  justification: string;
  timestamp: Date; // Consider using Firestore Timestamp type
}

// Optional: Define Team type if needed elsewhere
export interface Team {
    id: string;
    name: string;
    owner: string; // UID of the owner
    members: string[]; // Array of member UIDs
    createdAt: any; // Firestore Timestamp
    // Add other team-related fields
}
