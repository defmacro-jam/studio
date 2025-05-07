

import type { Timestamp } from 'firebase/firestore'; // Import Timestamp

export type Category = 'well' | 'improve' | 'discuss' | 'action';

// Team Roles - Specific to a team context
export const TEAM_ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager', // Role with team management permissions (invite/remove members, assign scrum master)
  MEMBER: 'member',   // Standard member
} as const;

export type TeamRole = typeof TEAM_ROLES[keyof typeof TEAM_ROLES];

// App-wide Roles - Stored on the user document in the 'users' collection
export const APP_ROLES = {
    ADMIN: 'admin',     // Can manage users, potentially system-wide settings
    MEMBER: 'member',   // Standard user (default app-wide role)
} as const;

export type AppRole = typeof APP_ROLES[keyof typeof APP_ROLES];


// Updated User type to better align with Firebase Auth and app needs
export interface User {
  id: string; // Corresponds to Firebase UID
  name: string; // Corresponds to Firebase displayName or a fallback
  email: string; // Email is required for Gravatar
  avatarUrl: string; // Gravatar URL or a fallback URL
  role: AppRole; // App-wide role ('admin' or 'member')
  teamIds?: string[]; // Array of team IDs the user belongs to
}

export interface RetroItem {
  id: string;
  author: User; // Use the updated User type
  content: string;
  timestamp: Date | Timestamp | string; // Allow Firestore Timestamp, Date, or string for replies
  replies?: RetroItem[]; // Optional for replies
  category: Category; // Category is required
  isFromPoll?: boolean; // Optional flag
  pollResponseId?: string; // Optional ID
  editing?: boolean; // Optional flag to control UI edit state
  teamId?: string; // Added teamId for scoping
}

export interface PollResponse {
  id: string;
  author: User; // Use the updated User type
  rating: number;
  justification: string;
  timestamp: Date | Timestamp | string; // Allow Firestore Timestamp, Date or string
  teamId?: string; // Added teamId for scoping
}

// Updated Team type for team management features - represents Firestore data structure
export interface Team {
    id: string; // ID is added after fetching
    name: string;
    owner: string; // UID of the owner (implicitly has owner role)
    members: string[]; // Array of member UIDs. Will be deprecated in favor of memberRoles.
    memberRoles: { [uid: string]: TeamRole }; // Map UID to team-specific role (Owner, Manager, Member)
    scrumMasterUid?: string | null; // UID of the current scrum master (optional)
    pendingMemberEmails?: string[]; // Emails of users invited but not yet joined
    createdAt: Timestamp; // Firestore Timestamp
    createdBy: string; // UID of the creator
}


// Type for displaying members on the team page, including their team-specific role
export interface TeamMemberDisplay extends User {
    teamRole: TeamRole; // The user's role *within this specific team*
}

// Type for displaying users on the admin page, including their app-wide role
// This user type does NOT have teamRole, because it's for app-level admin views.
export interface AdminUserDisplay extends User {
    // Inherits id, name, email, avatarUrl, role (which is AppRole from users collection)
    // No teamRole needed here as it's app-wide management
}

// Global application configuration
export interface GlobalConfig {
  id: 'global'; // Document ID, always 'global'
  // isDemoModeEnabled: boolean; // Removed as per request
}

// Plain types for AI flow input, ensuring serializable timestamps
export interface PlainPollResponse {
  id: string;
  author: User;
  rating: number;
  justification: string;
  timestamp: string; // ISO 8601 date string
  teamId?: string;
}

export interface PlainRetroItem {
  id: string;
  author: User;
  content: string;
  timestamp: string; // ISO 8601 date string
  replies?: PlainRetroItem[]; // Recursive with plain timestamps
  category: Category;
  isFromPoll?: boolean;
  pollResponseId?: string;
  teamId?: string;
}

export interface GenerateRetroReportInput {
    teamId: string;
    teamName: string;
    pollResponses: PlainPollResponse[]; // Use PlainPollResponse
    retroItems: PlainRetroItem[];       // Use PlainRetroItem
    currentScrumMaster?: User | null;
    nextScrumMaster?: User | null;
}

export interface GenerateRetroReportOutput {
    reportSummaryHtml: string; // HTML content for the email body
    nextScrumMaster?: User | null; // The suggested next scrum master (generic User type)
}

// Type for active team context
export interface ActiveTeamContextType {
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
  teamName: string | null;
  setTeamName: (name: string | null) => void;
}

