import { describe, expect, it } from 'vitest';
import type { ExtensionState, RelationshipSnapshot } from '../src/domain/types';
import { buildSyncCompletion } from '../src/domain/sync-completion';

function makeState(snapshots: RelationshipSnapshot[] = []): ExtensionState {
  return {
    account: { username: 'howlil', detectedAt: 1 },
    snapshots,
    scanCheckpoint: {
      version: 2,
      accountId: '42',
      phase: 'following',
      following: { users: [], done: true, pages: 1 },
      followers: { users: [], done: true, pages: 1 },
      verified: {},
      requestCount: 1,
      telemetry: {
        requests: 1,
        networkMs: 1,
        plannedWaitMs: 0,
        actualWaitMs: 0,
        storageWriteMs: 0,
        followingPages: 1,
        followerPages: 1,
        relationshipChecks: 0,
      },
      startedAt: 1,
      updatedAt: 1,
    },
    sync: { phase: 'processing', progress: 97 },
    settings: {
      autoSync: true,
      syncIntervalHours: 24,
      showBadge: true,
    },
  };
}

describe('sync completion', () => {
  it('keeps the latest 30 snapshots and clears the checkpoint', () => {
    const previous = Array.from({ length: 30 }, (_, capturedAt) => ({
      capturedAt,
      followers: [],
      following: [],
    }));
    const current = { capturedAt: 31, followers: [], following: [] };

    const completion = buildSyncCompletion(
      makeState(previous),
      current,
      { message: 'Full scan complete' },
    );

    expect(completion.state.snapshots).toHaveLength(30);
    expect(completion.state.snapshots[0]?.capturedAt).toBe(1);
    expect(completion.state.snapshots.at(-1)).toEqual(current);
    expect(completion.state.scanCheckpoint).toBeUndefined();
    expect(completion.state.sync).toMatchObject({
      phase: 'complete',
      progress: 100,
      message: 'Full scan complete',
    });
  });

  it('counts follower changes for a complete snapshot', () => {
    const previous = {
      capturedAt: 1,
      followers: ['alice'],
      following: ['alice'],
    };
    const current = {
      capturedAt: 2,
      followers: ['bob'],
      following: ['alice'],
    };

    const completion = buildSyncCompletion(
      makeState([previous]),
      current,
      { message: 'Up to date' },
    );

    expect(completion.badgeCount).toBe(2);
  });

  it('does not create follower-change badge counts for partial snapshots', () => {
    const previous = {
      capturedAt: 1,
      followers: ['alice'],
      following: ['alice'],
    };
    const current = {
      capturedAt: 2,
      coverage: 'following-only' as const,
      followers: [],
      following: ['alice'],
      followBack: { alice: true },
    };

    const completion = buildSyncCompletion(
      makeState([previous]),
      current,
      { message: 'Fast scan complete' },
    );

    expect(completion.badgeCount).toBe(0);
  });

  it('uses the same snapshot and badge result for adaptive and legacy callers', () => {
    const current = {
      capturedAt: 2,
      followers: ['bob'],
      following: ['alice'],
    };
    const state = makeState([{
      capturedAt: 1,
      followers: ['alice'],
      following: ['alice'],
    }]);

    const adaptive = buildSyncCompletion(state, current, {
      telemetry: state.scanCheckpoint?.telemetry,
      message: 'Full scan complete',
    });
    const legacy = buildSyncCompletion(state, current, {
      message: 'Up to date',
    });

    expect(adaptive.state.snapshots).toEqual(legacy.state.snapshots);
    expect(adaptive.badgeCount).toBe(legacy.badgeCount);
    expect(adaptive.state.scanCheckpoint).toBeUndefined();
    expect(legacy.state.scanCheckpoint).toBeUndefined();
  });
});
