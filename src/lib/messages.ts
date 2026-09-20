import type {
  InstagramAccount,
  RelationshipSnapshot,
  ScanCheckpoint,
  SyncErrorCode,
  SyncPhase,
} from '../domain/types';

export type WhoBackMessage =
  | { type: 'ACCOUNT_DETECTED'; account: InstagramAccount }
  | { type: 'START_SYNC' }
  | { type: 'SCAN_CHECKPOINT'; checkpoint: ScanCheckpoint }
  | { type: 'SYNC_PROGRESS'; phase: SyncPhase; progress: number; message?: string }
  | { type: 'SYNC_COMPLETE'; snapshot: RelationshipSnapshot; account?: InstagramAccount }
  | { type: 'SYNC_ERROR'; code: SyncErrorCode; message: string }
  | { type: 'OPEN_PANEL' };
