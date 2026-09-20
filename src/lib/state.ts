import { browser } from 'wxt/browser';
import type { ExtensionState, Settings } from '../domain/types';

export const STATE_KEY = 'whoback-state';

export const DEFAULT_SETTINGS: Settings = {
  autoSync: true,
  syncIntervalHours: 24,
  showBadge: true,
};

export const DEFAULT_STATE: ExtensionState = {
  account: null,
  snapshots: [],
  sync: { phase: 'idle', progress: 0 },
  settings: DEFAULT_SETTINGS,
};

export async function getState(): Promise<ExtensionState> {
  const stored = await browser.storage.local.get(STATE_KEY);
  const value = stored[STATE_KEY] as Partial<ExtensionState> | undefined;
  if (!value) return DEFAULT_STATE;

  return {
    ...DEFAULT_STATE,
    ...value,
    settings: { ...DEFAULT_SETTINGS, ...value.settings },
    sync: { ...DEFAULT_STATE.sync, ...value.sync },
    snapshots: value.snapshots ?? [],
  };
}

export async function setState(state: ExtensionState): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: state });
}

export async function patchState(patch: Partial<ExtensionState>): Promise<ExtensionState> {
  const current = await getState();
  const next: ExtensionState = {
    ...current,
    ...patch,
    settings: patch.settings ? { ...current.settings, ...patch.settings } : current.settings,
    sync: patch.sync ? { ...current.sync, ...patch.sync } : current.sync,
  };
  await setState(next);
  return next;
}

export function isSnapshotStale(state: ExtensionState, now = Date.now()): boolean {
  const latest = state.snapshots.at(-1);
  if (!latest) return true;
  return now - latest.capturedAt >= state.settings.syncIntervalHours * 60 * 60 * 1000;
}

export function isRateLimitCooldownActive(state: ExtensionState, now = Date.now()): boolean {
  return Boolean(state.sync.cooldownUntil && state.sync.cooldownUntil > now);
}

export function canAutoSync(state: ExtensionState, now = Date.now()): boolean {
  return Boolean(
    state.settings.autoSync
    && state.account
    && state.snapshots.length > 0
    && isSnapshotStale(state, now)
    && !isRateLimitCooldownActive(state, now),
  );
}
