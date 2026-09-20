import { browser } from 'wxt/browser';
import { diffSnapshots } from '../src/domain/relationship';
import type {
  ExtensionState,
  ScanCheckpoint,
  SyncErrorCode,
} from '../src/domain/types';
import { isInstagramUsername } from '../src/instagram/profile-identity';
import { resolveInstagramViewerId } from '../src/instagram/session-identity';
import {
  runInstagramMainWorldSync,
  type MainWorldSyncInput,
  type MainWorldSyncResult,
} from '../src/instagram/main-world-sync';
import type { WhoBackMessage } from '../src/lib/messages';
import {
  canAutoSync,
  getState,
  isRateLimitCooldownActive,
  patchState,
  setState,
} from '../src/lib/state';

const ALARM = 'whoback-auto-sync';
const INSTAGRAM_URL = 'https://www.instagram.com/';

export default defineBackground({
  type: 'module',
  main() {
    browser.runtime.onInstalled.addListener(() => {
      void ensureAlarm();
      void sanitizePersistedState();
    });
    browser.runtime.onStartup.addListener(() => {
      void ensureAlarm();
      void sanitizePersistedState();
      void maybeAutoSync();
    });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM) void maybeAutoSync();
    });

    browser.runtime.onMessage.addListener((message: WhoBackMessage, sender) => {
      return handleMessage(message, sender.tab?.id);
    });

    void ensureAlarm();
    void sanitizePersistedState();
  },
});

async function ensureAlarm() {
  await browser.alarms.create(ALARM, { periodInMinutes: 60 });
}

async function sanitizePersistedState() {
  const state = await getState();
  const accountValid = !state.account || isInstagramUsername(state.account.username);
  const checkpointValid = !state.scanCheckpoint
    || (
      state.scanCheckpoint.version === 1
      && Boolean(state.scanCheckpoint.accountId)
    );

  if (accountValid && checkpointValid) return;

  await setState({
    ...state,
    account: accountValid ? state.account : null,
    scanCheckpoint: checkpointValid ? state.scanCheckpoint : undefined,
    sync: { phase: 'idle', progress: 0 },
  });
}

async function maybeAutoSync() {
  const state = await getState();
  if (!canAutoSync(state) || isBusy(state)) return;
  await startSync(state.account?.username);
}

function isBusy(state: ExtensionState) {
  return ['starting', 'followers', 'following', 'processing'].includes(state.sync.phase);
}

async function resolveViewerId(state: ExtensionState): Promise<string | null> {
  const identity = await resolveInstagramViewerId(
    (details) => browser.cookies.get(details),
    state.account?.platformUserId,
    state.scanCheckpoint?.accountId,
  );

  return identity?.id ?? null;
}

async function startSync(username?: string) {
  let state = await getState();
  const expectedUsername = username ?? state.account?.username;

  if (isBusy(state)) return;

  if (isRateLimitCooldownActive(state)) {
    const remainingMs = Math.max(0, (state.sync.cooldownUntil ?? 0) - Date.now());
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    await setSyncError(
      'RATE_LIMITED',
      `Instagram is still cooling down. Resume in about ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
      state.sync.cooldownUntil,
    );
    return;
  }

  const viewerId = await resolveViewerId(state);
  if (!viewerId) {
    await setSyncError(
      'SESSION_ID_MISSING',
      'WhoBack could not read the Instagram session ID. Refresh instagram.com and make sure you are signed in.',
    );
    return;
  }

  if (state.scanCheckpoint && state.scanCheckpoint.accountId !== viewerId) {
    state = await patchState({ scanCheckpoint: undefined });
  }

  if (state.account?.platformUserId !== viewerId) {
    state = await patchState({
      account: state.account
        ? { ...state.account, platformUserId: viewerId }
        : state.account,
    });
  }

  const tab = await findInstagramTab();
  if (!tab?.id) {
    await setSyncError(
      'NO_INSTAGRAM_TAB',
      'Open instagram.com in this browser, then run WhoBack again.',
    );
    return;
  }

  const checkpoint = state.scanCheckpoint?.accountId === viewerId
    ? state.scanCheckpoint
    : undefined;

  await patchState({
    sync: {
      phase: 'starting',
      progress: checkpoint ? checkpointProgress(checkpoint) : 8,
      message: checkpoint
        ? `Resuming saved scan · ${checkpoint.following.users.length.toLocaleString()} following · ${checkpoint.followers.users.length.toLocaleString()} followers`
        : 'Starting Instagram relationship scan…',
      startedAt: Date.now(),
      tabId: tab.id,
      cooldownUntil: undefined,
    },
  });

  void dispatchMainWorldSync(tab.id, {
    viewerId,
    expectedUsername: expectedUsername ?? null,
    checkpoint: checkpoint ?? null,
  });
}

function checkpointProgress(checkpoint: ScanCheckpoint): number {
  if (checkpoint.followers.pages > 0 || checkpoint.following.done) {
    return Math.min(94, 54 + checkpoint.followers.pages * 3);
  }
  return Math.min(48, 12 + checkpoint.following.pages * 3);
}

async function findInstagramTab() {
  const tabs = await browser.tabs.query({ url: ['https://www.instagram.com/*'] });
  return [...tabs].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))[0];
}

async function dispatchMainWorldSync(tabId: number, input: MainWorldSyncInput) {
  try {
    const result = await executeMainWorldSync(tabId, input);
    await applyMainWorldResult(result);
    return;
  } catch {
    // Page navigation can invalidate an injection. Reload once, then resume from
    // the latest checkpoint already persisted by the content-script bridge.
  }

  try {
    await browser.tabs.reload(tabId);
    await waitForTabComplete(tabId, 15_000);
    const latest = await getState();
    const resumedInput: MainWorldSyncInput = {
      ...input,
      checkpoint: latest.scanCheckpoint?.accountId === input.viewerId
        ? latest.scanCheckpoint
        : input.checkpoint,
    };
    const result = await executeMainWorldSync(tabId, resumedInput);
    await applyMainWorldResult(result);
  } catch {
    await setSyncError(
      'INJECTION_FAILED',
      'WhoBack could not run inside the Instagram page. Your saved scan progress is safe.',
    );
  }
}

async function executeMainWorldSync(
  tabId: number,
  input: MainWorldSyncInput,
): Promise<MainWorldSyncResult> {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: runInstagramMainWorldSync,
    args: [input],
  });

  const result = results[0]?.result as MainWorldSyncResult | undefined;
  if (!result) {
    throw new Error('Instagram scanner returned no result.');
  }
  return result;
}

async function applyMainWorldResult(result: MainWorldSyncResult) {
  if (!result.ok) {
    if (result.checkpoint) {
      await persistCheckpoint(result.checkpoint);
    }

    if (result.error.code === 'SYNC_ABORTED') {
      return;
    }

    const shouldCoolDown = result.error.code === 'RATE_LIMITED'
      || result.error.code === 'REQUEST_BLOCKED';

    const cooldownUntil = shouldCoolDown
      ? Date.now() + (result.error.retryAfterMs ?? 15 * 60 * 1000)
      : undefined;

    await setSyncError(result.error.code, result.error.message, cooldownUntil);
    return;
  }

  await patchState({
    sync: {
      phase: 'processing',
      progress: 96,
      message: 'Comparing relationships…',
      cooldownUntil: undefined,
    },
  });

  const state = await getState();
  const snapshots = [...state.snapshots, result.snapshot].slice(-30);
  const previous = snapshots.at(-2);
  const changes = diffSnapshots(previous, result.snapshot);
  const badgeCount = changes.newFollowers.length + changes.unfollowers.length;

  await setState({
    ...state,
    account: {
      ...(state.account ?? { username: result.account.username }),
      username: result.account.username,
      platformUserId: result.account.platformUserId,
      detectedAt: result.account.detectedAt,
    },
    scanCheckpoint: undefined,
    snapshots,
    sync: {
      phase: 'complete',
      progress: 100,
      message: 'Up to date',
      finishedAt: Date.now(),
    },
  });

  await updateBadge(badgeCount, state.settings.showBadge);
}

async function persistCheckpoint(checkpoint: ScanCheckpoint) {
  const state = await getState();
  if (
    state.scanCheckpoint
    && state.scanCheckpoint.accountId === checkpoint.accountId
    && state.scanCheckpoint.updatedAt > checkpoint.updatedAt
  ) {
    return;
  }

  await patchState({ scanCheckpoint: checkpoint });
}

async function waitForTabComplete(tabId: number, timeoutMs: number) {
  const current = await browser.tabs.get(tabId);
  if (current.status === 'complete') return;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('Instagram tab reload timed out.'));
    }, timeoutMs);

    const listener = (updatedTabId: number, info: { status?: string }) => {
      if (updatedTabId !== tabId || info.status !== 'complete') return;
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    browser.tabs.onUpdated.addListener(listener);
  });
}

async function handleMessage(message: WhoBackMessage, senderTabId?: number) {
  switch (message.type) {
    case 'ACCOUNT_DETECTED': {
      if (!isInstagramUsername(message.account.username)) return { ok: false };

      const current = await getState();
      const state = await patchState({
        account: {
          ...message.account,
          platformUserId: current.account?.platformUserId,
        },
      });

      if (canAutoSync(state) && !isBusy(state)) {
        void startSync(message.account.username);
      }
      return { ok: true };
    }

    case 'START_SYNC': {
      await startSync();
      return { ok: true };
    }

    case 'SCAN_CHECKPOINT': {
      await persistCheckpoint(message.checkpoint);
      return { ok: true };
    }

    case 'SYNC_PROGRESS': {
      const state = await getState();
      await patchState({
        sync: {
          ...state.sync,
          phase: message.phase,
          progress: message.progress,
          message: message.message,
          errorCode: undefined,
        },
      });
      return { ok: true };
    }

    case 'SYNC_COMPLETE': {
      const state = await getState();
      const snapshots = [...state.snapshots, message.snapshot].slice(-30);
      const previous = snapshots.at(-2);
      const changes = diffSnapshots(previous, message.snapshot);
      const badgeCount = changes.newFollowers.length + changes.unfollowers.length;

      await setState({
        ...state,
        account: message.account ?? state.account,
        scanCheckpoint: undefined,
        snapshots,
        sync: {
          phase: 'complete',
          progress: 100,
          message: 'Up to date',
          finishedAt: Date.now(),
        },
      });

      await updateBadge(badgeCount, state.settings.showBadge);
      return { ok: true };
    }

    case 'SYNC_ERROR': {
      await setSyncError(message.code, message.message);
      return { ok: false };
    }

    case 'OPEN_PANEL': {
      if (senderTabId && browser.sidePanel?.open) {
        await browser.sidePanel.open({ tabId: senderTabId });
      }
      return { ok: true };
    }
  }
}

async function setSyncError(
  code: SyncErrorCode,
  message: string,
  cooldownUntil?: number,
) {
  const state = await getState();
  await patchState({
    sync: {
      ...state.sync,
      phase: 'error',
      progress: 0,
      errorCode: code,
      message,
      finishedAt: Date.now(),
      cooldownUntil,
    },
  });
}

async function updateBadge(count: number, enabled: boolean) {
  await browser.action.setBadgeText({
    text: enabled && count > 0 ? String(Math.min(count, 99)) : '',
  });

  if (enabled && count > 0) {
    await browser.action.setBadgeBackgroundColor({ color: '#e23943' });
  }
}
