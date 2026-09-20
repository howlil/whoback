export type RelationshipView = 'not-back' | 'fans' | 'mutual';

export interface InstagramAccount {
  username: string;
  platformUserId?: string;
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

export type SyncPhase =
  | 'idle'
  | 'starting'
  | 'followers'
  | 'following'
  | 'processing'
  | 'complete'
  | 'error';

export type SyncErrorCode =
  | 'NO_INSTAGRAM_TAB'
  | 'CONTENT_SCRIPT_UNAVAILABLE'
  | 'INJECTION_FAILED'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_RESOLVE_FAILED'
  | 'REQUEST_BLOCKED'
  | 'RATE_LIMITED'
  | 'INSTAGRAM_UNAVAILABLE'
  | 'RELATIONSHIP_REQUEST_FAILED'
  | 'PAGINATION_STALLED'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'SYNC_ABORTED'
  | 'UNKNOWN';

export interface SyncState {
  phase: SyncPhase;
  progress: number;
  message?: string;
  errorCode?: SyncErrorCode;
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
