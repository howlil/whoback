import { diffSnapshots } from './relationship';
import type {
  ExtensionState,
  InstagramAccount,
  RelationshipSnapshot,
  ScanTelemetry,
} from './types';

export interface SyncCompletionOptions {
  account?: InstagramAccount;
  telemetry?: ScanTelemetry;
  message: string;
}

export interface SyncCompletion {
  state: ExtensionState;
  badgeCount: number;
}

export function buildSyncCompletion(
  state: ExtensionState,
  snapshot: RelationshipSnapshot,
  options: SyncCompletionOptions,
): SyncCompletion {
  const snapshots = [...state.snapshots, snapshot].slice(-30);
  const previous = snapshots.at(-2);
  const changes = diffSnapshots(previous, snapshot);
  const badgeCount = changes.followersComplete
    ? changes.newFollowers.length + changes.unfollowers.length
    : 0;

  return {
    state: {
      ...state,
      account: options.account ?? state.account,
      scanCheckpoint: undefined,
      lastScanTelemetry: options.telemetry ?? state.lastScanTelemetry,
      snapshots,
      sync: {
        phase: 'complete',
        progress: 100,
        message: options.message,
        finishedAt: Date.now(),
      },
    },
    badgeCount,
  };
}
