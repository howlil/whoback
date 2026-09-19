import type {
  InstagramAccount,
  RelationshipSnapshot,
  SyncErrorCode,
  SyncPhase,
} from '../domain/types';

export type WhoBackMessage =
  | { type: 'ACCOUNT_DETECTED'; account: InstagramAccount }
  | { type: 'START_SYNC' }
  | { type: 'RUN_SYNC'; expectedUsername?: string }
  | { type: 'SYNC_PROGRESS'; phase: SyncPhase; progress: number; message?: string }
  | { type: 'SYNC_COMPLETE'; snapshot: RelationshipSnapshot; account?: InstagramAccount }
  | { type: 'SYNC_ERROR'; code: SyncErrorCode; message: string }
  | { type: 'OPEN_PANEL' };
