import { browser } from 'wxt/browser';
import { diffSnapshots } from '../src/domain/relationship';
import type { ExtensionState } from '../src/domain/types';
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
  if (!state.settings.autoSync || !state.account || !isSnapshotStale(state) || isBusy(state)) return;
  await startSync(state.account.username);
}

function isBusy(state: ExtensionState) {
  return ['starting', 'followers', 'following', 'processing'].includes(state.sync.phase);
}

async function startSync(username?: string) {
  const state = await getState();
  const owner = username ?? state.account?.username;

  if (!owner || !isInstagramUsername(owner)) {
    await setState({
      ...state,
      account: null,
      sync: {
        phase: 'error',
        progress: 0,
        message: 'Open or refresh instagram.com once so WhoBack can detect your account.',
        finishedAt: Date.now(),
      },
    });
    return;
  }

  if (isBusy(state)) return;

  const tab = await browser.tabs.create({
    url: `https://www.instagram.com/${encodeURIComponent(owner)}/?whoback_sync=1&whoback_account=${encodeURIComponent(owner)}`,
    active: false,
  });

  await patchState({
    sync: {
      phase: 'starting',
      progress: 3,
      message: 'Connecting to Instagram…',
      startedAt: Date.now(),
      tabId: tab.id,
    },
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
    case 'SYNC_PROGRESS': {
      const state = await getState();
      await patchState({
        sync: {
          ...state.sync,
          phase: message.phase,
          progress: message.progress,
          message: message.message,
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
        snapshots,
        sync: {
          phase: 'complete',
          progress: 100,
          message: 'Up to date',
          finishedAt: Date.now(),
        },
      });

      await updateBadge(badgeCount, state.settings.showBadge);
      await closeSyncTab(state.sync.tabId ?? senderTabId);
      return { ok: true };
    }
    case 'SYNC_ERROR': {
      const state = await getState();
      await patchState({
        sync: {
          phase: 'error',
          progress: 0,
          message: message.message,
          finishedAt: Date.now(),
        },
      });
      await closeSyncTab(state.sync.tabId ?? senderTabId);
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

async function updateBadge(count: number, enabled: boolean) {
  await browser.action.setBadgeText({
    text: enabled && count > 0 ? String(Math.min(count, 99)) : '',
  });

  if (enabled && count > 0) {
    await browser.action.setBadgeBackgroundColor({ color: '#e23943' });
  }
}

async function closeSyncTab(tabId?: number) {
  if (!tabId) return;
  try {
    await browser.tabs.remove(tabId);
  } catch {
    // The sync tab may already be closed by the user.
  }
}
