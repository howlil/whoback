import { describe, expect, it } from 'vitest';
import type { ExtensionState, ScanCheckpoint } from '../src/domain/types';
import { canAutoSync, isRateLimitCooldownActive } from '../src/lib/state';

function makeState(overrides: Partial<ExtensionState> = {}): ExtensionState {
  return {
    account: { username: 'mraulabsr', detectedAt: 1 },
    snapshots: [],
    sync: { phase: 'idle', progress: 0 },
    settings: {
      autoSync: true,
      syncIntervalHours: 24,
      showBadge: true,
    },
    ...overrides,
  };
}

function checkpoint(): ScanCheckpoint {
  return {
    version: 1,
    accountId: '123',
    username: 'mraulabsr',
    phase: 'following',
    following: {
      users: [{ id: '1', username: 'alice' }],
      cursor: 'next',
      done: false,
      pages: 1,
    },
    followers: {
      users: [],
      done: false,
      pages: 0,
    },
    requestCount: 1,
    startedAt: 1,
    updatedAt: 2,
  };
}

describe('sync guards', () => {
  it('never auto-syncs before the first successful manual snapshot', () => {
    expect(canAutoSync(makeState(), 10_000)).toBe(false);
  });

  it('auto-syncs a stale existing snapshot', () => {
    const day = 24 * 60 * 60 * 1000;
    const state = makeState({
      snapshots: [{ capturedAt: 1, followers: [], following: [] }],
    });

    expect(canAutoSync(state, day + 2)).toBe(true);
  });

  it('requires manual resume while a checkpoint exists', () => {
    const day = 24 * 60 * 60 * 1000;
    const state = makeState({
      snapshots: [{ capturedAt: 1, followers: [], following: [] }],
      scanCheckpoint: checkpoint(),
    });

    expect(canAutoSync(state, day + 2)).toBe(false);
  });

  it('blocks automatic sync during a rate-limit cooldown', () => {
    const day = 24 * 60 * 60 * 1000;
    const now = day + 2;
    const state = makeState({
      snapshots: [{ capturedAt: 1, followers: [], following: [] }],
      sync: {
        phase: 'error',
        progress: 0,
        errorCode: 'RATE_LIMITED',
        cooldownUntil: now + 60_000,
      },
    });

    expect(isRateLimitCooldownActive(state, now)).toBe(true);
    expect(canAutoSync(state, now)).toBe(false);
  });
});
