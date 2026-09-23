export type RelationshipView = 'not-back' | 'fans' | 'mutual';
export type SnapshotCoverage = 'full' | 'following-only';
export type ScanStrategy = 'full-lists' | 'verify-following';

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
  coverage?: SnapshotCoverage;
  followersTotal?: number;
  followingTotal?: number;
  followBack?: Record<string, boolean>;
}

export interface RelationshipAnalysis {
  followersCount: number;
  followingCount: number;
  mutual: string[];
  notFollowingBack: string[];
  youDontFollowBack: string[];
  followersComplete: boolean;
}

export interface RelationshipChanges {
  newFollowers: string[];
  unfollowers: string[];
  newFollowing: string[];
  youUnfollowed: string[];
  followersComplete: boolean;
}

export type ScanCheckpointPhase = 'following' | 'followers' | 'verifying';

export interface ScanCheckpointList {
  users: InstagramUserRef[];
  cursor?: string;
  done: boolean;
  pages: number;
}

export interface ScanTelemetry {
  requests: number;
  networkMs: number;
  plannedWaitMs: number;
  actualWaitMs: number;
  storageWriteMs: number;
  followingPages: number;
  followerPages: number;
  relationshipChecks: number;
  followingCountGap?: number;
  followersCountGap?: number;
  totalMs?: number;
  strategy?: ScanStrategy;
  requestedPageSize?: number;
  observedFollowerPageSize?: number;
}

export interface ScanCheckpoint {
  version: 2;
  accountId: string;
  username?: string;
  phase: ScanCheckpointPhase;
  strategy?: ScanStrategy;
  followingTotal?: number | null;
  followersTotal?: number | null;
  following: ScanCheckpointList;
  followers: ScanCheckpointList;
  verified: Record<string, boolean>;
  requestCount: number;
  telemetry: ScanTelemetry;
  startedAt: number;
  followingRetryCount?: number;
  listPageSize?: number;
  observedFollowerPageSize?: number;
  updatedAt: number;
}

export type SyncPhase =
  | 'idle'
  | 'starting'
  | 'planning'
  | 'followers'
  | 'following'
  | 'verifying'
  | 'processing'
  | 'complete'
  | 'paused'
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
  lastScanTelemetry?: ScanTelemetry;
  sync: SyncState;
  settings: Settings;
}
