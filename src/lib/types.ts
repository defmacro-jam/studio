
import type { Timestamp } from 'firebase/firestore'; // Import Timestamp

export type Category = 'well' | 'improve' | 'discuss' | 'action';

// Team Roles
export const TEAM_ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  MEMBER: 'member',
} as const;

export type TeamRole = typeof TEAM_ROLES[keyof typeof TEAM_ROLES];

// Updated User type to better align with Firebase Auth and app needs
export interface User {
  id: string; // Corresponds to Firebase UID
  name: string; // Corresponds to Firebase displayName or a fallback
  email: string; // Email is required for Gravatar
  avatarUrl: string; // Gravatar URL or a fallback URL
  // Add other relevant fields if needed, e.g., from Firestore user document
  // teamIds?: string[];
  role?: 'admin' | 'member'; // App-level role (optional)
}

export interface RetroItem {
  id: string;
  author: User; // Use the updated User type
  content: string;
  timestamp: Date | Timestamp; // Allow Firestore Timestamp
  replies?: RetroItem[]; // Optional for replies
  category: Category; // Category is required
  isFromPoll?: boolean; // Optional flag
  pollResponseId?: string; // Optional ID
  editing?: boolean; // Optional flag to control UI edit state
}

export interface PollResponse {
  id: string;
  author: User; // Use the updated User type
  rating: number;
  justification: string;
  timestamp: Date | Timestamp; // Allow Firestore Timestamp
}

// Updated Team type for team management features - represents Firestore data structure
export interface Team {
    id: string; // ID is added after fetching
    name: string;
    owner: string; // UID of the owner
    members: string[]; // Array of member UIDs
    memberRoles: { [uid: string]: TeamRole }; // Map UID to team-specific role
    scrumMasterUid?: string | null; // UID of the current scrum master (optional)
    createdAt: Timestamp; // Firestore Timestamp
    createdBy: string; // UID of the creator
}


// Type for displaying members on the team page, including their role
export interface TeamMemberDisplay extends User {
    teamRole: TeamRole;
}


