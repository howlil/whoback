import { browser } from 'wxt/browser';
import { diffSnapshots } from '../src/domain/relationship';
import type {
  ExtensionState,
  InstagramUserRef,
  ScanCheckpoint,
  ScanStrategy,
  SyncErrorCode,
} from '../src/domain/types';
import { isInstagramUsername } from '../src/instagram/profile-identity';
import { resolveInstagramViewerId } from '../src/instagram/session-identity';
import { planRelationshipScan } from '../src/instagram/scan-planner';
import {
  runInstagramOperation,
  type InstagramOperation,
  type InstagramOperationFailure,
  type InstagramOperationResult,
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
const MAX_LIST_PAGES = 10_000;
const CHECKPOINT_EVERY_REQUESTS = 5;

let activeRunId: string | null = null;

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
      state.scanCheckpoint.version === 2
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
  if (!canAutoSync(state) || isBusy(state) || activeRunId) return;
  await startSync(state.account?.username);
}

function isBusy(state: ExtensionState) {
  return ['starting', 'planning', 'followers', 'following', 'verifying', 'processing'].includes(state.sync.phase);
}

async function resolveViewerId(state: ExtensionState): Promise<string | null> {
  const identity = await resolveInstagramViewerId(
    (details) => browser.cookies.get(details),
    state.account?.platformUserId,
    state.scanCheckpoint?.accountId,
  );

  return identity?.id ?? null;
}

function newCheckpoint(
  viewerId: string,
  username?: string,
): ScanCheckpoint {
  const now = Date.now();
  return {
    version: 2,
    accountId: viewerId,
    username,
    phase: 'following',
    followingTotal: null,
    followersTotal: null,
    following: { users: [], done: false, pages: 0 },
    followers: { users: [], done: false, pages: 0 },
    verified: {},
    requestCount: 0,
    telemetry: {
      requests: 0,
      networkMs: 0,
      plannedWaitMs: 0,
      actualWaitMs: 0,
      storageWriteMs: 0,
      followingPages: 0,
      followerPages: 0,
      relationshipChecks: 0,
    },
    startedAt: now,
    updatedAt: now,
  };
}

async function startSync(username?: string) {
  let state = await getState();
  const expectedUsername = username ?? state.account?.username;

  if (isBusy(state) || activeRunId) return;

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
    : newCheckpoint(viewerId, expectedUsername);

  const runId = crypto.randomUUID();
  activeRunId = runId;

  await patchState({
    scanCheckpoint: checkpoint,
    sync: {
      phase: 'starting',
      progress: checkpointProgress(checkpoint),
      message: checkpoint.requestCount > 0
        ? `Resuming saved scan · ${checkpoint.following.users.length.toLocaleString()} following · ${checkpoint.followers.users.length.toLocaleString()} followers`
        : 'Starting adaptive Instagram scan…',
      startedAt: Date.now(),
      tabId: tab.id,
      cooldownUntil: undefined,
    },
  });

  void runAdaptiveSync(
    runId,
    tab.id,
    viewerId,
    expectedUsername,
    checkpoint,
  );
}

async function runAdaptiveSync(
  runId: string,
  tabId: number,
  viewerId: string,
  expectedUsername: string | undefined,
  checkpoint: ScanCheckpoint,
) {
  try {
    const following = new Map(
      checkpoint.following.users.map((user) => [user.id, user] as const),
    );
    const followers = new Map(
      checkpoint.followers.users.map((user) => [user.id, user] as const),
    );

    if (checkpoint.followingTotal == null || checkpoint.followersTotal == null) {
      await patchSync('planning', 6, 'Planning the lowest-request scan…');
      const counts = await executeOperation(tabId, {
        kind: 'counts',
        viewerId,
      });

      recordOperation(checkpoint, counts);

      if (!counts.ok) {
        if (isHardStop(counts)) {
          await finishFailure(counts, checkpoint);
          return;
        }
      } else if (counts.kind === 'counts') {
        checkpoint.followingTotal = counts.followingTotal;
        checkpoint.followersTotal = counts.followersTotal;
        await persistCheckpoint(checkpoint);
        await pace(checkpoint);
      }
    }

    if (!checkpoint.following.done) {
      checkpoint.phase = 'following';
      for (let page = checkpoint.following.pages + 1; page <= MAX_LIST_PAGES; page += 1) {
        if (!isCurrentRun(runId)) return;

        const result = await executeOperation(tabId, {
          kind: 'list-page',
          viewerId,
          list: 'following',
          cursor: checkpoint.following.cursor,
        });
        recordOperation(checkpoint, result);

        if (!result.ok) {
          await finishFailure(result, checkpoint);
          return;
        }
        if (result.kind !== 'list-page') {
          await setSyncError('INVALID_RESPONSE', 'Instagram returned an unexpected following response.');
          return;
        }

        mergeInto(following, result.users);
        checkpoint.following.pages = page;
        checkpoint.telemetry.followingPages = page;

        if (result.nextCursor && result.nextCursor === checkpoint.following.cursor) {
          await persistMaps(checkpoint, following, followers);
          await setSyncError(
            'PAGINATION_STALLED',
            'Instagram repeated the following cursor. Progress was saved.',
          );
          return;
        }

        checkpoint.following.cursor = result.nextCursor;
        checkpoint.following.done = result.done;
        checkpoint.following.users = [...following.values()];

        await patchSync(
          'following',
          listProgress(10, 45, following.size, checkpoint.followingTotal, page),
          `Following: ${following.size.toLocaleString()}${checkpoint.followingTotal != null ? ` / ${checkpoint.followingTotal.toLocaleString()}` : ''} · page ${page}`,
        );

        if (shouldPersist(checkpoint) || result.done) {
          await persistCheckpoint(checkpoint);
        }

        if (result.done) break;
        await pace(checkpoint);
      }
    }

    if (!checkpoint.following.done) {
      await persistMaps(checkpoint, following, followers);
      await setSyncError(
        'PAGINATION_STALLED',
        'Following pagination exceeded the safety limit. Progress was saved.',
      );
      return;
    }

    const mutualIds = new Set(followers.keys());
    let unresolvedFollowing = 0;
    for (const user of following.values()) {
      if (
        !mutualIds.has(user.id)
        && typeof checkpoint.verified[user.id] !== 'boolean'
      ) {
        unresolvedFollowing += 1;
      }
    }

    const plan = planRelationshipScan({
      followersTotal: checkpoint.followersTotal,
      loadedFollowers: followers.size,
      unresolvedFollowing,
    });
    checkpoint.strategy = checkpoint.strategy ?? plan.strategy;
    checkpoint.telemetry.strategy = checkpoint.strategy;
    await persistCheckpoint(checkpoint);

    if (checkpoint.strategy === 'verify-following') {
      const ok = await verifyFollowing(
        runId,
        tabId,
        viewerId,
        checkpoint,
        following,
        followers,
      );
      if (!ok) return;
    } else {
      const ok = await fetchFollowers(
        runId,
        tabId,
        viewerId,
        checkpoint,
        following,
        followers,
      );
      if (!ok) return;
    }

    if (!isCurrentRun(runId)) return;

    await patchSync('processing', 97, 'Building relationship results…');

    const followingUsers = [...following.values()];
    const coverage = checkpoint.strategy === 'verify-following'
      ? 'following-only' as const
      : 'full' as const;

    const followBack: Record<string, boolean> = {};
    if (coverage === 'following-only') {
      for (const user of followingUsers) {
        const known = checkpoint.verified[user.id];
        if (typeof known === 'boolean') {
          followBack[user.username] = known;
        }
      }
    }

    const snapshot = {
      capturedAt: Date.now(),
      coverage,
      followingTotal: checkpoint.followingTotal ?? followingUsers.length,
      followersTotal: checkpoint.followersTotal
        ?? (coverage === 'full' ? followers.size : undefined),
      following: uniqueUsernames(followingUsers),
      followers: coverage === 'full'
        ? uniqueUsernames([...followers.values()])
        : [],
      ...(coverage === 'following-only' ? { followBack } : {}),
    };

    const state = await getState();
    const snapshots = [...state.snapshots, snapshot].slice(-30);
    const previous = snapshots.at(-2);
    const changes = diffSnapshots(previous, snapshot);
    const badgeCount = changes.followersComplete
      ? changes.newFollowers.length + changes.unfollowers.length
      : 0;

    await setState({
      ...state,
      account: {
        ...(state.account ?? { username: expectedUsername ?? checkpoint.username ?? 'instagram-user' }),
        username: expectedUsername ?? checkpoint.username ?? state.account?.username ?? 'instagram-user',
        platformUserId: viewerId,
        detectedAt: Date.now(),
      },
      scanCheckpoint: undefined,
      snapshots,
      sync: {
        phase: 'complete',
        progress: 100,
        message: coverage === 'following-only'
          ? 'Fast scan complete'
          : 'Full scan complete',
        finishedAt: Date.now(),
      },
    });

    await updateBadge(badgeCount, state.settings.showBadge);
  } catch {
    const latest = await getState();
    if (latest.scanCheckpoint) {
      await setSyncError(
        'UNKNOWN',
        'WhoBack stopped unexpectedly. Your last saved scan progress is safe.',
      );
    }
  } finally {
    if (activeRunId === runId) activeRunId = null;
  }
}

async function fetchFollowers(
  runId: string,
  tabId: number,
  viewerId: string,
  checkpoint: ScanCheckpoint,
  following: Map<string, InstagramUserRef>,
  followers: Map<string, InstagramUserRef>,
): Promise<boolean> {
  if (checkpoint.followers.done) return true;
  checkpoint.phase = 'followers';

  for (let page = checkpoint.followers.pages + 1; page <= MAX_LIST_PAGES; page += 1) {
    if (!isCurrentRun(runId)) return false;

    const result = await executeOperation(tabId, {
      kind: 'list-page',
      viewerId,
      list: 'followers',
      cursor: checkpoint.followers.cursor,
    });
    recordOperation(checkpoint, result);

    if (!result.ok) {
      await finishFailure(result, checkpoint);
      return false;
    }
    if (result.kind !== 'list-page') {
      await setSyncError('INVALID_RESPONSE', 'Instagram returned an unexpected followers response.');
      return false;
    }

    mergeInto(followers, result.users);
    checkpoint.followers.pages = page;
    checkpoint.telemetry.followerPages = page;

    if (result.nextCursor && result.nextCursor === checkpoint.followers.cursor) {
      await persistMaps(checkpoint, following, followers);
      await setSyncError(
        'PAGINATION_STALLED',
        'Instagram repeated the followers cursor. Progress was saved.',
      );
      return false;
    }

    checkpoint.followers.cursor = result.nextCursor;
    checkpoint.followers.done = result.done;
    checkpoint.followers.users = [...followers.values()];

    await patchSync(
      'followers',
      listProgress(50, 95, followers.size, checkpoint.followersTotal, page),
      `Followers: ${followers.size.toLocaleString()}${checkpoint.followersTotal != null ? ` / ${checkpoint.followersTotal.toLocaleString()}` : ''} · page ${page}`,
    );

    if (shouldPersist(checkpoint) || result.done) {
      await persistCheckpoint(checkpoint);
    }

    if (result.done) return true;
    await pace(checkpoint);
  }

  await persistMaps(checkpoint, following, followers);
  await setSyncError(
    'PAGINATION_STALLED',
    'Follower pagination exceeded the safety limit. Progress was saved.',
  );
  return false;
}

async function verifyFollowing(
  runId: string,
  tabId: number,
  viewerId: string,
  checkpoint: ScanCheckpoint,
  following: Map<string, InstagramUserRef>,
  followers: Map<string, InstagramUserRef>,
): Promise<boolean> {
  checkpoint.phase = 'verifying';

  for (const id of followers.keys()) {
    if (following.has(id)) checkpoint.verified[id] = true;
  }

  const pending = [...following.values()].filter(
    (user) => typeof checkpoint.verified[user.id] !== 'boolean',
  );

  for (let index = 0; index < pending.length; index += 1) {
    if (!isCurrentRun(runId)) return false;

    const user = pending[index];
    if (!user) continue;

    const result = await executeOperation(tabId, {
      kind: 'relationship',
      viewerId,
      targetUserId: user.id,
    });
    recordOperation(checkpoint, result);

    if (!result.ok) {
      await persistMaps(checkpoint, following, followers);
      await finishFailure(result, checkpoint);
      return false;
    }
    if (result.kind !== 'relationship') {
      await setSyncError('INVALID_RESPONSE', 'Instagram returned an unexpected relationship response.');
      return false;
    }

    checkpoint.telemetry.relationshipChecks += 1;

    if (!result.following) {
      following.delete(user.id);
      checkpoint.verified[user.id] = true;
    } else {
      checkpoint.verified[user.id] = result.followedBy;
    }

    const completed = Object.keys(checkpoint.verified).length;
    const total = Math.max(1, following.size);

    await patchSync(
      'verifying',
      Math.min(95, 50 + Math.round((completed / total) * 45)),
      `Checking follow-back: ${Math.min(completed, total).toLocaleString()} / ${total.toLocaleString()}`,
    );

    if (shouldPersist(checkpoint) || index === pending.length - 1) {
      checkpoint.following.users = [...following.values()];
      await persistCheckpoint(checkpoint);
    }

    if (index < pending.length - 1) {
      await pace(checkpoint);
    }
  }

  checkpoint.following.users = [...following.values()];
  await persistCheckpoint(checkpoint);
  return true;
}

function recordOperation(
  checkpoint: ScanCheckpoint,
  result: InstagramOperationResult,
) {
  checkpoint.requestCount += 1;
  checkpoint.telemetry.requests += 1;
  checkpoint.telemetry.networkMs += Math.round(result.durationMs);
  checkpoint.updatedAt = Date.now();
}

async function pace(checkpoint: ScanCheckpoint) {
  const longPause = checkpoint.requestCount > 0
    && checkpoint.requestCount % 5 === 0;
  const plannedMs = longPause
    ? 20_000 + Math.floor(Math.random() * 3_000)
    : 1_500 + Math.floor(Math.random() * 1_500);

  checkpoint.telemetry.plannedWaitMs += plannedMs;
  const startedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, plannedMs));
  checkpoint.telemetry.actualWaitMs += Date.now() - startedAt;
}

function mergeInto(
  target: Map<string, InstagramUserRef>,
  incoming: InstagramUserRef[],
) {
  for (const user of incoming) {
    target.set(user.id, user);
  }
}

function uniqueUsernames(users: InstagramUserRef[]) {
  return [...new Set(users.map((user) => user.username).filter(Boolean))].sort();
}

function shouldPersist(checkpoint: ScanCheckpoint) {
  return checkpoint.requestCount % CHECKPOINT_EVERY_REQUESTS === 0;
}

async function persistMaps(
  checkpoint: ScanCheckpoint,
  following: Map<string, InstagramUserRef>,
  followers: Map<string, InstagramUserRef>,
) {
  checkpoint.following.users = [...following.values()];
  checkpoint.followers.users = [...followers.values()];
  await persistCheckpoint(checkpoint);
}

async function persistCheckpoint(checkpoint: ScanCheckpoint) {
  checkpoint.updatedAt = Date.now();
  const startedAt = performance.now();
  await patchState({ scanCheckpoint: checkpoint });
  checkpoint.telemetry.storageWriteMs += Math.max(
    0,
    Math.round(performance.now() - startedAt),
  );
}

function isHardStop(result: InstagramOperationFailure) {
  return [
    'SESSION_EXPIRED',
    'REQUEST_BLOCKED',
    'RATE_LIMITED',
  ].includes(result.error.code);
}

async function finishFailure(
  result: InstagramOperationFailure,
  checkpoint: ScanCheckpoint,
) {
  await persistCheckpoint(checkpoint);

  const shouldCoolDown = result.error.code === 'RATE_LIMITED'
    || result.error.code === 'REQUEST_BLOCKED';

  const cooldownUntil = shouldCoolDown
    ? Date.now() + (result.error.retryAfterMs ?? 15 * 60 * 1000)
    : undefined;

  await setSyncError(result.error.code, result.error.message, cooldownUntil);
}

function isCurrentRun(runId: string) {
  return activeRunId === runId;
}

function listProgress(
  start: number,
  end: number,
  current: number,
  total: number | null | undefined,
  page: number,
) {
  if (total && total > 0) {
    return Math.min(
      end,
      start + Math.round((current / total) * (end - start)),
    );
  }

  return Math.min(end, start + page);
}

function checkpointProgress(checkpoint: ScanCheckpoint): number {
  if (checkpoint.phase === 'verifying') return 50;
  if (checkpoint.followers.pages > 0 || checkpoint.following.done) {
    return Math.min(94, 50 + checkpoint.followers.pages);
  }
  return Math.min(45, 10 + checkpoint.following.pages);
}

async function patchSync(
  phase: ExtensionState['sync']['phase'],
  progress: number,
  message: string,
) {
  const state = await getState();
  await patchState({
    sync: {
      ...state.sync,
      phase,
      progress,
      message,
      errorCode: undefined,
    },
  });
}

async function findInstagramTab() {
  const tabs = await browser.tabs.query({ url: ['https://www.instagram.com/*'] });
  return [...tabs].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))[0];
}

async function executeOperation(
  tabId: number,
  operation: InstagramOperation,
): Promise<InstagramOperationResult> {
  try {
    return await injectOperation(tabId, operation);
  } catch {
    await browser.tabs.reload(tabId);
    await waitForTabComplete(tabId, 15_000);
    return injectOperation(tabId, operation);
  }
}

async function injectOperation(
  tabId: number,
  operation: InstagramOperation,
): Promise<InstagramOperationResult> {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: runInstagramOperation,
    args: [operation],
  });

  const result = results[0]?.result as InstagramOperationResult | undefined;
  if (!result) {
    throw new Error('Instagram operation returned no result.');
  }
  return result;
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

      if (canAutoSync(state) && !isBusy(state) && !activeRunId) {
        void startSync(message.account.username);
      }
      return { ok: true };
    }

    case 'START_SYNC': {
      await startSync();
      return { ok: true };
    }

    case 'SCAN_CHECKPOINT': {
      // Backward-compatible with older content scripts. The v1.1 coordinator
      // owns checkpoints directly, so stale v1 payloads are ignored.
      if (message.checkpoint.version === 2) {
        await persistCheckpoint(message.checkpoint);
      }
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
      const badgeCount = changes.followersComplete
        ? changes.newFollowers.length + changes.unfollowers.length
        : 0;

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
