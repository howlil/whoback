import type { InstagramAccount, RelationshipSnapshot, SyncPhase } from '../domain/types';

export type WhoBackMessage =
  | { type: 'ACCOUNT_DETECTED'; account: InstagramAccount }
  | { type: 'START_SYNC' }
  | { type: 'SYNC_PROGRESS'; phase: SyncPhase; progress: number; message?: string }
  | { type: 'SYNC_COMPLETE'; snapshot: RelationshipSnapshot }
  | { type: 'SYNC_ERROR'; message: string }
  | { type: 'OPEN_PANEL' };
