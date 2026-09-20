import type { ScanCheckpoint, SyncErrorCode } from '../domain/types';

export type MainWorldSyncInput = {
  viewerId: string;
  expectedUsername?: string | null;
  checkpoint?: ScanCheckpoint | null;
};

export type MainWorldSyncSuccess = {
  ok: true;
  account: {
    username: string;
    platformUserId: string;
    detectedAt: number;
  };
  snapshot: {
    capturedAt: number;
    followers: string[];
    following: string[];
  };
};

export type MainWorldSyncFailure = {
  ok: false;
  error: {
    code: SyncErrorCode;
    message: string;
    status?: number;
    retryAfterMs?: number;
  };
  checkpoint?: ScanCheckpoint;
};

export type MainWorldSyncResult = MainWorldSyncSuccess | MainWorldSyncFailure;

/**
 * IMPORTANT: This function is passed to chrome.scripting.executeScript.
 * Chrome serializes only the function body, so it must remain closure-free:
 * no runtime imports, module constants, or helpers referenced from outside.
 */
export async function runInstagramMainWorldSync(
  input: MainWorldSyncInput,
): Promise<MainWorldSyncResult> {
  const API_BASE = '/api/v1';
  const IG_APP_ID = '936619743392459';
  const MAX_PAGES_PER_LIST = 500;
  const CHECKPOINT_VERSION = 1 as const;

  const runtimeScope = globalThis as typeof globalThis & {
    __WHOBACK_RUNTIME__?: {
      scanId: string;
      controller: AbortController;
    };
  };

  runtimeScope.__WHOBACK_RUNTIME__?.controller.abort();

  const controller = new AbortController();
  const scanId = globalThis.crypto?.randomUUID?.() ?? `whoback-${Date.now()}-${Math.random()}`;
  runtimeScope.__WHOBACK_RUNTIME__ = { scanId, controller };

  const normalize = (value: unknown) =>
    String(value ?? '').trim().replace(/^@/, '').toLowerCase();

  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (controller.signal.aborted) {
        reject(new DOMException('Scan aborted', 'AbortError'));
        return;
      }

      const timer = globalThis.setTimeout(resolve, ms);
      controller.signal.addEventListener('abort', () => {
        globalThis.clearTimeout(timer);
        reject(new DOMException('Scan aborted', 'AbortError'));
      }, { once: true });
    });

  const fail = (
    code: SyncErrorCode,
    message: string,
    checkpoint?: ScanCheckpoint,
    status?: number,
    retryAfterMs?: number,
  ): MainWorldSyncFailure => ({
    ok: false,
    error: {
      code,
      message,
      ...(status ? { status } : {}),
      ...(retryAfterMs ? { retryAfterMs } : {}),
    },
    ...(checkpoint ? { checkpoint } : {}),
  });

  const postBridge = (payload: Record<string, unknown>) => {
    if (
      typeof window !== 'undefined'
      && typeof window.postMessage === 'function'
    ) {
      window.postMessage({ source: 'whoback-main', ...payload }, '*');
    }
  };

  const cloneCheckpoint = (source?: ScanCheckpoint | null): ScanCheckpoint => {
    const valid = source
      && source.version === CHECKPOINT_VERSION
      && source.accountId === input.viewerId;

    if (valid) {
      return {
        ...source,
        username: normalize(input.expectedUsername) || source.username,
        following: {
          ...source.following,
          users: source.following.users.map((user) => ({ ...user })),
        },
        followers: {
          ...source.followers,
          users: source.followers.users.map((user) => ({ ...user })),
        },
        updatedAt: Date.now(),
      };
    }

    const now = Date.now();
    return {
      version: CHECKPOINT_VERSION,
      accountId: input.viewerId,
      username: normalize(input.expectedUsername) || undefined,
      phase: 'following',
      following: {
        users: [],
        done: false,
        pages: 0,
      },
      followers: {
        users: [],
        done: false,
        pages: 0,
      },
      requestCount: 0,
      startedAt: now,
      updatedAt: now,
    };
  };

  const uniqueUsernames = (
    users: Array<{ id: string; username: string }>,
  ) => [...new Set(users.map((user) => normalize(user.username)).filter(Boolean))].sort();

  const mergeUsers = (
    current: Array<{ id: string; username: string }>,
    incoming: Array<Record<string, unknown>>,
  ) => {
    const users = new Map(current.map((user) => [user.id, user]));

    for (const raw of incoming) {
      const idRaw = raw.pk ?? raw.id;
      const id = idRaw == null ? '' : String(idRaw);
      const username = normalize(raw.username);
      if (!id || !username) continue;
      users.set(id, { id, username });
    }

    return [...users.values()];
  };

  const checkpoint = cloneCheckpoint(input.checkpoint);

  const emitCheckpoint = () => {
    checkpoint.updatedAt = Date.now();
    postBridge({
      type: 'checkpoint',
      checkpoint,
    });
  };

  const emitProgress = (
    phase: 'following' | 'followers',
    count: number,
    pages: number,
  ) => {
    const progress = phase === 'following'
      ? Math.min(48, 12 + pages * 3)
      : Math.min(94, 54 + pages * 3);

    postBridge({
      type: 'progress',
      phase,
      progress,
      message: `${phase === 'following' ? 'Following' : 'Followers'}: ${count.toLocaleString()} loaded · page ${pages}`,
    });
  };

  const request = async (
    path: string,
  ): Promise<
    | { ok: true; data: Record<string, unknown> }
    | MainWorldSyncFailure
  > => {
    if (controller.signal.aborted) {
      return fail('SYNC_ABORTED', 'The previous WhoBack scan was replaced by a newer scan.', checkpoint);
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'x-ig-app-id': IG_APP_ID,
          'x-requested-with': 'XMLHttpRequest',
          'x-asbd-id': '198387',
        },
      });
      checkpoint.requestCount += 1;
      checkpoint.updatedAt = Date.now();
    } catch {
      if (controller.signal.aborted) {
        return fail('SYNC_ABORTED', 'The previous WhoBack scan was replaced by a newer scan.', checkpoint);
      }

      return fail(
        'NETWORK_ERROR',
        'Instagram request failed inside the signed-in page. Reload Instagram and try again.',
        checkpoint,
      );
    }

    if (!response.ok) {
      if (response.status === 401) {
        return fail(
          'SESSION_EXPIRED',
          'Your Instagram session expired. Refresh Instagram and sign in again.',
          checkpoint,
          401,
        );
      }

      if (response.status === 403) {
        return fail(
          'REQUEST_BLOCKED',
          'Instagram temporarily blocked this scan. Progress was saved; wait before resuming.',
          checkpoint,
          403,
        );
      }

      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get('retry-after') ?? 0);
        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 15 * 60 * 1000;

        return fail(
          'RATE_LIMITED',
          'Instagram rate-limited the scan. Progress was saved and WhoBack stopped immediately.',
          checkpoint,
          429,
          retryAfterMs,
        );
      }

      if (response.status >= 500) {
        return fail(
          'INSTAGRAM_UNAVAILABLE',
          `Instagram is temporarily unavailable (HTTP ${response.status}). Progress was saved.`,
          checkpoint,
          response.status,
        );
      }

      return fail(
        'RELATIONSHIP_REQUEST_FAILED',
        `Instagram rejected the relationship request (HTTP ${response.status}). Progress was saved.`,
        checkpoint,
        response.status,
      );
    }

    const text = await response.text();
    if (!text.trim()) {
      return fail('INVALID_RESPONSE', 'Instagram returned an empty response. Progress was saved.', checkpoint);
    }

    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      const status = data.status;
      const message = String(data.message ?? '').toLowerCase();

      if (
        status === 'fail'
        || data.spam === true
        || data.checkpoint_url
        || message.includes('please wait')
        || message.includes('feedback_required')
        || message.includes('checkpoint')
      ) {
        return fail(
          message.includes('please wait') ? 'RATE_LIMITED' : 'REQUEST_BLOCKED',
          'Instagram interrupted this scan. Progress was saved; wait before resuming.',
          checkpoint,
        );
      }

      return { ok: true, data };
    } catch {
      return fail(
        'INVALID_RESPONSE',
        'Instagram returned an unexpected response. Progress was saved.',
        checkpoint,
      );
    }
  };

  const pace = async (completedPages: number) => {
    if (completedPages > 0 && completedPages % 5 === 0) {
      await sleep(20_000 + Math.floor(Math.random() * 3_000));
      return;
    }

    await sleep(1_500 + Math.floor(Math.random() * 1_500));
  };

  const fetchRelationship = async (
    type: 'followers' | 'following',
  ): Promise<MainWorldSyncFailure | null> => {
    const target = checkpoint[type];
    if (target.done) return null;

    checkpoint.phase = type;

    for (
      let page = target.pages + 1;
      page <= MAX_PAGES_PER_LIST;
      page += 1
    ) {
      if (controller.signal.aborted) {
        return fail('SYNC_ABORTED', 'The previous WhoBack scan was replaced by a newer scan.', checkpoint);
      }

      const currentCursor = target.cursor ?? '';
      const params = new URLSearchParams({ count: '50' });
      if (currentCursor) params.set('max_id', currentCursor);

      const response = await request(
        `/friendships/${encodeURIComponent(input.viewerId)}/${type}/?${params.toString()}`,
      );
      if (!response.ok) return response;

      const users = Array.isArray(response.data.users)
        ? response.data.users as Array<Record<string, unknown>>
        : [];

      target.users = mergeUsers(target.users, users);
      target.pages = page;

      const nextRaw = response.data.next_max_id;
      const next = nextRaw == null ? '' : String(nextRaw);

      if (next && next === currentCursor) {
        emitCheckpoint();
        return fail(
          'PAGINATION_STALLED',
          `Instagram repeated the ${type} pagination cursor. Progress was saved.`,
          checkpoint,
        );
      }

      target.cursor = next || undefined;
      target.done = !next;

      emitCheckpoint();
      emitProgress(type, target.users.length, target.pages);

      if (target.done) return null;
      await pace(target.pages);
    }

    return fail(
      'PAGINATION_STALLED',
      `Instagram returned too many ${type} pages without completing. Progress was saved.`,
      checkpoint,
    );
  };

  try {
    if (!input.viewerId) {
      return fail(
        'SESSION_ID_MISSING',
        'WhoBack could not read your Instagram session ID. Refresh Instagram and sign in again.',
      );
    }

    const followingError = await fetchRelationship('following');
    if (followingError) return followingError;

    const followersError = await fetchRelationship('followers');
    if (followersError) return followersError;

    const username = normalize(input.expectedUsername)
      || checkpoint.username
      || 'instagram-user';

    return {
      ok: true,
      account: {
        username,
        platformUserId: input.viewerId,
        detectedAt: Date.now(),
      },
      snapshot: {
        capturedAt: Date.now(),
        followers: uniqueUsernames(checkpoint.followers.users),
        following: uniqueUsernames(checkpoint.following.users),
      },
    };
  } finally {
    if (runtimeScope.__WHOBACK_RUNTIME__?.scanId === scanId) {
      delete runtimeScope.__WHOBACK_RUNTIME__;
    }
  }
}
