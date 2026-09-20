import type { InstagramUserRef, SyncErrorCode } from '../domain/types';

export type InstagramOperation =
  | {
      kind: 'counts';
      viewerId: string;
    }
  | {
      kind: 'list-page';
      viewerId: string;
      list: 'followers' | 'following';
      cursor?: string;
    }
  | {
      kind: 'relationship';
      viewerId: string;
      targetUserId: string;
    };

export type InstagramOperationSuccess =
  | {
      ok: true;
      kind: 'counts';
      durationMs: number;
      followingTotal: number | null;
      followersTotal: number | null;
    }
  | {
      ok: true;
      kind: 'list-page';
      durationMs: number;
      users: InstagramUserRef[];
      nextCursor?: string;
      done: boolean;
      rawCount: number;
    }
  | {
      ok: true;
      kind: 'relationship';
      durationMs: number;
      targetUserId: string;
      followedBy: boolean;
      following: boolean;
    };

export type InstagramOperationFailure = {
  ok: false;
  durationMs: number;
  error: {
    code: SyncErrorCode;
    message: string;
    status?: number;
    retryAfterMs?: number;
  };
};

export type InstagramOperationResult =
  | InstagramOperationSuccess
  | InstagramOperationFailure;

/**
 * IMPORTANT: Chrome serializes this function for MAIN-world execution.
 * Keep the implementation closure-free.
 */
export async function runInstagramOperation(
  operation: InstagramOperation,
): Promise<InstagramOperationResult> {
  const API_BASE = '/api/v1';
  const IG_APP_ID = '936619743392459';
  const startedAt = performance.now();

  const duration = () => Math.max(0, performance.now() - startedAt);

  const fail = (
    code: SyncErrorCode,
    message: string,
    status?: number,
    retryAfterMs?: number,
  ): InstagramOperationFailure => ({
    ok: false,
    durationMs: duration(),
    error: {
      code,
      message,
      ...(status ? { status } : {}),
      ...(retryAfterMs ? { retryAfterMs } : {}),
    },
  });

  const request = async (
    path: string,
  ): Promise<
    | { ok: true; data: Record<string, unknown> }
    | InstagramOperationFailure
  > => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'x-ig-app-id': IG_APP_ID,
          'x-requested-with': 'XMLHttpRequest',
          'x-asbd-id': '198387',
        },
      });
    } catch {
      return fail(
        'NETWORK_ERROR',
        'Instagram request failed inside the signed-in page. Reload Instagram and try again.',
      );
    }

    if (!response.ok) {
      if (response.status === 401) {
        return fail(
          'SESSION_EXPIRED',
          'Your Instagram session expired. Refresh Instagram and sign in again.',
          401,
        );
      }

      if (response.status === 403) {
        return fail(
          'REQUEST_BLOCKED',
          'Instagram temporarily blocked this scan. Progress was saved; wait before resuming.',
          403,
        );
      }

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const numericSeconds = Number(retryAfterHeader ?? 0);
        let retryAfterMs = Number.isFinite(numericSeconds) && numericSeconds > 0
          ? numericSeconds * 1000
          : 15 * 60 * 1000;

        if (retryAfterHeader && !Number.isFinite(numericSeconds)) {
          const retryDate = Date.parse(retryAfterHeader);
          if (Number.isFinite(retryDate)) {
            retryAfterMs = Math.max(1_000, retryDate - Date.now());
          }
        }

        return fail(
          'RATE_LIMITED',
          'Instagram rate-limited the scan. Progress was saved and WhoBack stopped immediately.',
          429,
          retryAfterMs,
        );
      }

      if (response.status >= 500) {
        return fail(
          'INSTAGRAM_UNAVAILABLE',
          `Instagram is temporarily unavailable (HTTP ${response.status}). Progress was saved.`,
          response.status,
        );
      }

      return fail(
        'RELATIONSHIP_REQUEST_FAILED',
        `Instagram rejected the request (HTTP ${response.status}). Progress was saved.`,
        response.status,
      );
    }

    const body = await response.text();
    if (!body.trim()) {
      return fail('INVALID_RESPONSE', 'Instagram returned an empty response.');
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return fail('INVALID_RESPONSE', 'Instagram returned an unexpected response.');
    }

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
      );
    }

    return { ok: true, data };
  };

  const normalize = (value: unknown) =>
    String(value ?? '').trim().replace(/^@/, '').toLowerCase();

  if (operation.kind === 'counts') {
    const response = await request(
      `/users/${encodeURIComponent(operation.viewerId)}/info/`,
    );
    if (!response.ok) return response;

    const user = response.data.user && typeof response.data.user === 'object'
      ? response.data.user as Record<string, unknown>
      : {};

    const followingRaw = Number(user.following_count);
    const followersRaw = Number(user.follower_count);

    return {
      ok: true,
      kind: 'counts',
      durationMs: duration(),
      followingTotal: Number.isFinite(followingRaw) ? Math.max(0, followingRaw) : null,
      followersTotal: Number.isFinite(followersRaw) ? Math.max(0, followersRaw) : null,
    };
  }

  if (operation.kind === 'list-page') {
    const params = new URLSearchParams({ count: '50' });
    if (operation.cursor) params.set('max_id', operation.cursor);

    const response = await request(
      `/friendships/${encodeURIComponent(operation.viewerId)}/${operation.list}/?${params.toString()}`,
    );
    if (!response.ok) return response;

    if (
      response.data.should_limit_list_of_followers === true
      || response.data.should_limit_list_of_followings === true
    ) {
      return fail(
        'REQUEST_BLOCKED',
        'Instagram returned an intentionally limited relationship list. Progress was saved.',
      );
    }

    const rawUsers = Array.isArray(response.data.users)
      ? response.data.users as Array<Record<string, unknown>>
      : [];

    const users: InstagramUserRef[] = [];
    for (const raw of rawUsers) {
      const idRaw = raw.pk ?? raw.id;
      const id = idRaw == null ? '' : String(idRaw);
      const username = normalize(raw.username);
      if (!id || !username) continue;
      users.push({ id, username });
    }

    const nextRaw = response.data.next_max_id;
    const nextCursor = nextRaw == null ? '' : String(nextRaw);
    const hasMore = response.data.has_more;
    const done = hasMore === false || !nextCursor;

    if (!done && users.length === 0) {
      return fail('PAGINATION_STALLED', 'Instagram returned an empty page with more pages remaining.');
    }

    return {
      ok: true,
      kind: 'list-page',
      durationMs: duration(),
      users,
      ...(nextCursor ? { nextCursor } : {}),
      done,
      rawCount: rawUsers.length,
    };
  }

  const response = await request(
    `/friendships/show/${encodeURIComponent(operation.targetUserId)}/`,
  );
  if (!response.ok) return response;

  if (
    typeof response.data.followed_by !== 'boolean'
    || typeof response.data.following !== 'boolean'
  ) {
    return fail(
      'INVALID_RESPONSE',
      'Instagram returned an incomplete relationship response.',
    );
  }

  return {
    ok: true,
    kind: 'relationship',
    durationMs: duration(),
    targetUserId: operation.targetUserId,
    followedBy: response.data.followed_by,
    following: response.data.following,
  };
}
