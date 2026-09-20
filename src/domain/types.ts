export type RelationshipView = 'not-back' | 'fans' | 'mutual';

export interface InstagramAccount {
  username: string;
  platformUserId?: string;
  avatarUrl?: string;
  detectedAt: number;
}

export interface InstagramUserRef {
  id: string;
  username: string;
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

export type ScanCheckpointPhase = 'following' | 'followers';

export interface ScanCheckpointList {
  users: InstagramUserRef[];
  cursor?: string;
  done: boolean;
  pages: number;
}

export interface ScanCheckpoint {
  version: 1;
  accountId: string;
  username?: string;
  phase: ScanCheckpointPhase;
  following: ScanCheckpointList;
  followers: ScanCheckpointList;
  requestCount: number;
  startedAt: number;
  updatedAt: number;
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
  | 'SESSION_ID_MISSING'
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
  cooldownUntil?: number;
}

export interface Settings {
  autoSync: boolean;
  syncIntervalHours: 24 | 48 | 168;
  showBadge: boolean;
}

export interface ExtensionState {
  account: InstagramAccount | null;
  snapshots: RelationshipSnapshot[];
  scanCheckpoint?: ScanCheckpoint;
  sync: SyncState;
  settings: Settings;
}
