import { browser } from 'wxt/browser';
import { buildSyncCompletion } from '../src/domain/sync-completion';
import type {
  ExtensionState,
  InstagramAccount,
  InstagramUserRef,
  RelationshipSnapshot,
  ScanCheckpoint,
  ScanTelemetry,
  SyncErrorCode,
} from '../src/domain/types';
import { isInstagramUsername } from '../src/instagram/profile-identity';
import { resolveInstagramViewerId } from '../src/instagram/session-identity';
import { planRelationshipScan } from '../src/instagram/scan-planner';
import { planFollowingCountRecovery } from '../src/instagram/scan-recovery';
import {
  createScanPacer,
  type ScanPacer,
} from '../src/instagram/scan-pacing';
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
  isSyncBusyPhase,
  patchState,
  setState,
} from '../src/lib/state';

const ALARM = 'whoback-auto-sync';
const INSTAGRAM_URL = 'https://www.instagram.com/';
const MAX_LIST_PAGES = 10_000;
const CHECKPOINT_EVERY_REQUESTS = 5;
const DEFAULT_LIST_PAGE_SIZE = 100;
const FALLBACK_LIST_PAGE_SIZE = 50;
const MAX_RELATIONSHIP_CONCURRENCY = 2;
const PROGRESS_COMMIT_INTERVAL_MS = 1_000;

let activeRunId: string | null = null;
let lastProgressCommitAt = 0;
let pendingSyncPatch: Partial<ExtensionState['sync']> | null = null;

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
  if (!canAutoSync(state) || isSyncBusyPhase(state.sync.phase) || activeRunId) return;
  await startSync(state.account?.username);
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
      requestedPageSize: DEFAULT_LIST_PAGE_SIZE,
    },
    startedAt: now,
    listPageSize: DEFAULT_LIST_PAGE_SIZE,
    updatedAt: now,
  };
}

async function startSync(username?: string) {
  let state = await getState();
  const expectedUsername = username ?? state.account?.username;

  if (isSyncBusyPhase(state.sync.phase) || activeRunId) return;

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

  const tab = await getOrOpenInstagramTab();
  if (!tab?.id) {
    await setSyncPaused(
      'NO_INSTAGRAM_TAB',
      'Instagram needs to be open to continue. Your scan progress is safe.',
    );
    return;
  }

  const checkpoint = state.scanCheckpoint?.accountId === viewerId
    ? state.scanCheckpoint
    : newCheckpoint(viewerId, expectedUsername);

  const runId = crypto.randomUUID();
  activeRunId = runId;
  lastProgressCommitAt = 0;
  pendingSyncPatch = null;

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
    const pacer = createScanPacer(checkpoint.requestCount);
    const following = new Map(
      checkpoint.following.users.map((user) => [user.id, user] as const),
    );
    const followers = new Map(
      checkpoint.followers.users.map((user) => [user.id, user] as const),
    );

    if (checkpoint.followingTotal == null || checkpoint.followersTotal == null) {
      await patchSync('planning', 6, 'Planning the lowest-request scan…');
      const counts = await executePacedOperation(pacer, checkpoint, tabId, {
        kind: 'counts',
        viewerId,
      });

      if (!counts.ok) {
        if (isHardStop(counts) || isRecoverablePause(counts)) {
          await finishFailure(counts, checkpoint);
          return;
        }
      } else if (counts.kind === 'counts') {
        checkpoint.followingTotal = counts.followingTotal;
        checkpoint.followersTotal = counts.followersTotal;
        await persistCheckpoint(checkpoint);
      }
    }

    if (!checkpoint.following.done) {
      checkpoint.phase = 'following';
      for (let page = checkpoint.following.pages + 1; page <= MAX_LIST_PAGES; page += 1) {
        if (!isCurrentRun(runId)) return;

        const result = await fetchListPage(
          pacer,
          checkpoint,
          tabId,
          viewerId,
          'following',
          checkpoint.following.cursor,
        );

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

    const followingRecovery = planFollowingCountRecovery(
      following.size,
      checkpoint.followingTotal,
      checkpoint.followingRetryCount ?? 0,
    );

    checkpoint.telemetry.followingCountGap = followingRecovery.gap;

    if (followingRecovery.action === 'retry') {
      checkpoint.followingRetryCount = (checkpoint.followingRetryCount ?? 0) + 1;
      checkpoint.following.done = false;
      checkpoint.following.cursor = undefined;
      checkpoint.following.pages = 0;
      await persistMaps(checkpoint, following, followers);
      await setSyncPaused(
        'PAGINATION_STALLED',
        `Instagram returned ${following.size.toLocaleString()} of ${checkpoint.followingTotal?.toLocaleString() ?? 'the expected'} following accounts. Progress is safe; Resume will reconcile this section once.`,
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
      observedFollowerPageSize: checkpoint.observedFollowerPageSize,
    });
    checkpoint.strategy = checkpoint.strategy ?? plan.strategy;
    checkpoint.telemetry.strategy = checkpoint.strategy;
    await persistCheckpoint(checkpoint);

    if (checkpoint.strategy === 'verify-following') {
      const ok = await verifyFollowing(
        runId,
        pacer,
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
        pacer,
        tabId,
        viewerId,
        checkpoint,
        following,
        followers,
      );
      if (!ok) return;

      if (
        checkpoint.followersTotal != null
        && followers.size < checkpoint.followersTotal
      ) {
        checkpoint.telemetry.followersCountGap = checkpoint.followersTotal - followers.size;
        checkpoint.strategy = 'verify-following';
        checkpoint.telemetry.strategy = 'verify-following';
        const verified = await verifyFollowing(
          runId,
          pacer,
          tabId,
          viewerId,
          checkpoint,
          following,
          followers,
        );
        if (!verified) return;
      }
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

    checkpoint.telemetry.totalMs = Date.now() - checkpoint.startedAt;

    const state = await getState();
    await completeSync(snapshot, {
      account: {
        ...(state.account ?? { username: expectedUsername ?? checkpoint.username ?? 'instagram-user' }),
        username: expectedUsername ?? checkpoint.username ?? state.account?.username ?? 'instagram-user',
        platformUserId: viewerId,
        detectedAt: Date.now(),
      },
      telemetry: checkpoint.telemetry,
      message: coverage === 'following-only'
        ? 'Fast scan complete'
        : 'Full scan complete',
    });
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

async function completeSync(
  snapshot: RelationshipSnapshot,
  options: {
    account?: InstagramAccount;
    telemetry?: ScanTelemetry;
    message: string;
  },
): Promise<void> {
  const current = await getState();
  const completion = buildSyncCompletion(current, snapshot, options);

  await setState(completion.state);
  pendingSyncPatch = null;
  lastProgressCommitAt = Date.now();
  await updateBadge(completion.badgeCount, current.settings.showBadge);
}

async function fetchFollowers(
  runId: string,
  pacer: ScanPacer,
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

    const result = await fetchListPage(
      pacer,
      checkpoint,
      tabId,
      viewerId,
      'followers',
      checkpoint.followers.cursor,
    );

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
  pacer: ScanPacer,
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

  let nextIndex = 0;
  let processed = 0;
  let completed = Object.keys(checkpoint.verified).length;
  let stopError: InstagramOperationFailure | null = null;
  let resultQueue = Promise.resolve();

  const applyResult = (user: InstagramUserRef, result: Extract<InstagramOperationResult, { ok: true }>) => {
    const previous = resultQueue;
    resultQueue = previous.then(async () => {
      if (result.kind !== 'relationship') {
        stopError ??= {
          ok: false,
          durationMs: 0,
          error: {
            code: 'INVALID_RESPONSE',
            message: 'Instagram returned an unexpected relationship response.',
          },
        };
        return;
      }

      checkpoint.telemetry.relationshipChecks += 1;

      if (!result.following) {
        following.delete(user.id);
        checkpoint.verified[user.id] = true;
      } else {
        checkpoint.verified[user.id] = result.followedBy;
      }

      processed += 1;
      completed = Object.keys(checkpoint.verified).length;
      const total = Math.max(1, following.size);

      await patchSync(
        'verifying',
        Math.min(95, 50 + Math.round((completed / total) * 45)),
        `Checking follow-back: ${Math.min(completed, total).toLocaleString()} / ${total.toLocaleString()}`,
      );

      if (shouldPersist(checkpoint) || processed === pending.length) {
        checkpoint.following.users = [...following.values()];
        await persistCheckpoint(checkpoint);
      }
    });

    return resultQueue;
  };

  const worker = async () => {
    while (isCurrentRun(runId) && !stopError) {
      const user = pending[nextIndex];
      nextIndex += 1;
      if (!user) return;

      const result = await executePacedOperationIfActive(
        pacer,
        checkpoint,
        tabId,
        {
          kind: 'relationship',
          viewerId,
          targetUserId: user.id,
        },
        () => !stopError && isCurrentRun(runId),
      );

      if (!result) return;
      if (!result.ok) {
        stopError ??= result;
        return;
      }

      await applyResult(user, result);
    }
  };

  const workerCount = Math.min(MAX_RELATIONSHIP_CONCURRENCY, pending.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  await resultQueue;

  if (stopError) {
    await persistMaps(checkpoint, following, followers);
    await finishFailure(stopError, checkpoint);
    return false;
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

async function executePacedOperation(
  pacer: ScanPacer,
  checkpoint: ScanCheckpoint,
  tabId: number,
  operation: InstagramOperation,
): Promise<InstagramOperationResult> {
  const result = await executePacedOperationIfActive(
    pacer,
    checkpoint,
    tabId,
    operation,
    () => true,
  );

  if (!result) throw new Error('Paced operation was unexpectedly cancelled.');
  return result;
}

async function executePacedOperationIfActive(
  pacer: ScanPacer,
  checkpoint: ScanCheckpoint,
  tabId: number,
  operation: InstagramOperation,
  canExecute: () => boolean,
): Promise<InstagramOperationResult | undefined> {
  const wait = await pacer.waitForRequest();
  if (!canExecute()) return undefined;

  checkpoint.telemetry.plannedWaitMs += wait.plannedMs;
  checkpoint.telemetry.actualWaitMs += wait.actualMs;

  const result = await executeOperation(tabId, operation);
  recordOperation(checkpoint, result);
  return result;
}

function shouldFallbackListPageSize(result: InstagramOperationResult): boolean {
  return !result.ok
    && result.error.code === 'RELATIONSHIP_REQUEST_FAILED'
    && (result.error.status === 400 || result.error.status === 422);
}

async function fetchListPage(
  pacer: ScanPacer,
  checkpoint: ScanCheckpoint,
  tabId: number,
  viewerId: string,
  list: 'followers' | 'following',
  cursor?: string,
): Promise<InstagramOperationResult> {
  const requestedPageSize = checkpoint.listPageSize ?? DEFAULT_LIST_PAGE_SIZE;
  checkpoint.telemetry.requestedPageSize = requestedPageSize;

  let result = await executePacedOperation(pacer, checkpoint, tabId, {
    kind: 'list-page',
    viewerId,
    list,
    cursor,
    pageSize: requestedPageSize,
  });

  if (shouldFallbackListPageSize(result) && requestedPageSize > FALLBACK_LIST_PAGE_SIZE) {
    checkpoint.listPageSize = FALLBACK_LIST_PAGE_SIZE;
    checkpoint.telemetry.requestedPageSize = FALLBACK_LIST_PAGE_SIZE;
    await persistCheckpoint(checkpoint);

    result = await executePacedOperation(pacer, checkpoint, tabId, {
      kind: 'list-page',
      viewerId,
      list,
      cursor,
      pageSize: FALLBACK_LIST_PAGE_SIZE,
    });
  }

  if (result.ok && result.kind === 'list-page' && list === 'followers' && result.rawCount > 0) {
    checkpoint.observedFollowerPageSize = Math.max(
      checkpoint.observedFollowerPageSize ?? 0,
      result.rawCount,
    );
    checkpoint.telemetry.observedFollowerPageSize = checkpoint.observedFollowerPageSize;
  }

  return result;
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
  await commitScanState({ checkpoint, force: true });
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

function isRecoverablePause(result: InstagramOperationFailure) {
  return [
    'NO_INSTAGRAM_TAB',
    'INJECTION_FAILED',
    'NETWORK_ERROR',
  ].includes(result.error.code);
}

async function finishFailure(
  result: InstagramOperationFailure,
  checkpoint: ScanCheckpoint,
) {
  await persistCheckpoint(checkpoint);

  if (isRecoverablePause(result)) {
    await setSyncPaused(result.error.code, result.error.message);
    return;
  }

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

async function commitScanState({
  checkpoint,
  sync,
  force = false,
}: {
  checkpoint?: ScanCheckpoint;
  sync?: Partial<ExtensionState['sync']>;
  force?: boolean;
}): Promise<void> {
  if (sync) {
    pendingSyncPatch = {
      ...pendingSyncPatch,
      ...sync,
    };
  }

  const now = Date.now();
  if (!force && now - lastProgressCommitAt < PROGRESS_COMMIT_INTERVAL_MS) return;

  const current = await getState();
  await setState({
    ...current,
    ...(checkpoint ? { scanCheckpoint: checkpoint } : {}),
    sync: {
      ...current.sync,
      ...(pendingSyncPatch ?? {}),
    },
  });

  pendingSyncPatch = null;
  lastProgressCommitAt = Date.now();
}

async function patchSync(
  phase: ExtensionState['sync']['phase'],
  progress: number,
  message: string,
) {
  await commitScanState({
    sync: {
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

async function getOrOpenInstagramTab() {
  const existing = await findInstagramTab();
  if (existing?.id) return existing;

  try {
    const created = await browser.tabs.create({ url: INSTAGRAM_URL, active: true });
    if (!created.id) return created;
    await waitForTabComplete(created.id, 15_000);
    return browser.tabs.get(created.id);
  } catch {
    return undefined;
  }
}

async function executeOperation(
  tabId: number,
  operation: InstagramOperation,
): Promise<InstagramOperationResult> {
  try {
    return await injectOperation(tabId, operation);
  } catch {
    try {
      await browser.tabs.get(tabId);
    } catch {
      return {
        ok: false,
        durationMs: 0,
        error: {
          code: 'NO_INSTAGRAM_TAB',
          message: 'Instagram was closed. Your scan progress is safe — resume when you are ready.',
        },
      };
    }

    try {
      await browser.tabs.reload(tabId);
      await waitForTabComplete(tabId, 15_000);
      return await injectOperation(tabId, operation);
    } catch {
      return {
        ok: false,
        durationMs: 0,
        error: {
          code: 'INJECTION_FAILED',
          message: 'Instagram changed or reloaded while WhoBack was scanning. Your progress is safe — resume to continue.',
        },
      };
    }
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

      if (canAutoSync(state) && !isSyncBusyPhase(state.sync.phase) && !activeRunId) {
        void startSync(message.account.username);
      }
      return { ok: true };
    }

    case 'START_SYNC': {
      await startSync();
      return { ok: true };
    }

    case 'RESTART_SYNC': {
      if (activeRunId) return { ok: false };

      const state = await getState();
      await patchState({
        scanCheckpoint: undefined,
        sync: {
          phase: 'idle',
          progress: 0,
        },
      });
      await startSync(state.account?.username);
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
      await completeSync(message.snapshot, {
        account: message.account,
        message: 'Up to date',
      });
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

async function setSyncPaused(
  code: SyncErrorCode,
  message: string,
) {
  const state = await getState();
  await patchState({
    sync: {
      ...state.sync,
      phase: 'paused',
      progress: state.scanCheckpoint
        ? checkpointProgress(state.scanCheckpoint)
        : state.sync.progress,
      errorCode: code,
      message,
      finishedAt: Date.now(),
      cooldownUntil: undefined,
    },
  });
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
