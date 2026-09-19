export type RelationshipView = 'not-back' | 'fans' | 'mutual';

export interface InstagramAccount {
  username: string;
  avatarUrl?: string;
  detectedAt: number;
}

export interface RelationshipSnapshot {
  capturedAt: number;
  followers: string[];
  following: string[];
}

export interface RelationshipAnalysis {
  followersCount: number;
  followingCount: number;
  mutual: string[];
  notFollowingBack: string[];
  youDontFollowBack: string[];
}

export interface RelationshipChanges {
  newFollowers: string[];
  unfollowers: string[];
  newFollowing: string[];
  youUnfollowed: string[];
}

export type SyncPhase = 'idle' | 'starting' | 'followers' | 'following' | 'processing' | 'complete' | 'error';

export interface SyncState {
  phase: SyncPhase;
  progress: number;
  message?: string;
  startedAt?: number;
  finishedAt?: number;
  tabId?: number;
}

export interface Settings {
  autoSync: boolean;
  syncIntervalHours: 24 | 48 | 168;
  showBadge: boolean;
}

export interface ExtensionState {
  account: InstagramAccount | null;
  snapshots: RelationshipSnapshot[];
  sync: SyncState;
  settings: Settings;
}
