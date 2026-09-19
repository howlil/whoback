import { browser } from 'wxt/browser';
import { diffSnapshots } from '../src/domain/relationship';
import type { ExtensionState, SyncErrorCode } from '../src/domain/types';
import { isInstagramUsername } from '../src/instagram/profile-identity';
import type { WhoBackMessage } from '../src/lib/messages';
import { getState, isSnapshotStale, patchState, setState } from '../src/lib/state';

const ALARM = 'whoback-auto-sync';

export default defineBackground({
  type: 'module',
  main() {
    browser.runtime.onInstalled.addListener(() => {
      void ensureAlarm();
      void sanitizePersistedAccount();
    });
    browser.runtime.onStartup.addListener(() => {
      void ensureAlarm();
      void sanitizePersistedAccount();
      void maybeAutoSync();
    });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM) void maybeAutoSync();
    });

    browser.runtime.onMessage.addListener((message: WhoBackMessage, sender) => {
      return handleMessage(message, sender.tab?.id);
    });

    void ensureAlarm();
    void sanitizePersistedAccount();
  },
});

async function ensureAlarm() {
  await browser.alarms.create(ALARM, { periodInMinutes: 60 });
}

async function sanitizePersistedAccount() {
  const state = await getState();
  if (!state.account || isInstagramUsername(state.account.username)) return;

  await setState({
    ...state,
    account: null,
    sync: { phase: 'idle', progress: 0 },
  });
}

async function maybeAutoSync() {
  const state = await getState();
  if (!state.settings.autoSync || !state.account || !isSnapshotStale(state) || isBusy(state)) {
    return;
  }
  await startSync(state.account.username);
}

function isBusy(state: ExtensionState) {
  return ['starting', 'followers', 'following', 'processing'].includes(state.sync.phase);
}

async function startSync(username?: string) {
  const state = await getState();
  const expectedUsername = username ?? state.account?.username;

  if (isBusy(state)) return;

  const tab = await findInstagramTab();
  if (!tab?.id) {
    await setSyncError(
      'NO_INSTAGRAM_TAB',
      'Open instagram.com in this browser, then run WhoBack again.',
    );
    return;
  }

  await patchState({
    sync: {
      phase: 'starting',
      progress: 2,
      message: 'Connecting to your Instagram session…',
      startedAt: Date.now(),
      tabId: tab.id,
    },
  });

  void dispatchSync(tab.id, expectedUsername);
}

async function findInstagramTab() {
  const tabs = await browser.tabs.query({ url: ['https://www.instagram.com/*'] });
  return [...tabs].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))[0];
}

async function dispatchSync(tabId: number, expectedUsername?: string) {
  const message = {
    type: 'RUN_SYNC',
    expectedUsername,
  } satisfies WhoBackMessage;

  try {
    await browser.tabs.sendMessage(tabId, message);
    return;
  } catch {
    // A tab kept open across an extension reload can retain an invalidated content-script context.
  }

  try {
    await browser.tabs.reload(tabId);
    await waitForTabComplete(tabId, 15_000);
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    await setSyncError(
      'CONTENT_SCRIPT_UNAVAILABLE',
      'WhoBack could not attach to the Instagram tab. Refresh instagram.com and try again.',
    );
  }
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

      const state = await patchState({ account: message.account });
      if (state.settings.autoSync && isSnapshotStale(state) && !isBusy(state)) {
        void startSync(message.account.username);
      }
      return { ok: true };
    }

    case 'START_SYNC': {
      await startSync();
      return { ok: true };
    }

    case 'RUN_SYNC':
      return { ok: false };

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

async function setSyncError(code: SyncErrorCode, message: string) {
  const state = await getState();
  await patchState({
    sync: {
      ...state.sync,
      phase: 'error',
      progress: 0,
      errorCode: code,
      message,
      finishedAt: Date.now(),
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
