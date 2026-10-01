import type { InstagramUserRef, SyncErrorCode } from '../domain/types';

export type InstagramListTransport = 'graphql' | 'rest';

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
      pageSize?: number;
      transport?: InstagramListTransport;
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
      reportedTotal?: number | null;
      transport: InstagramListTransport;
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
    signal?: string;
    transport?: InstagramListTransport;
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
  const GRAPHQL_BASE = '/graphql/query/';
  const FOLLOWING_QUERY_HASH = '58712303d941c6855d4e888c5f0cd22f';
  const FOLLOWERS_QUERY_HASH = '37479f2b8209594dde7facb0d904896a';
  const IG_APP_ID = '936619743392459';
  const startedAt = performance.now();

  const duration = () => Math.max(0, performance.now() - startedAt);

  const fail = (
    code: SyncErrorCode,
    message: string,
    status?: number,
    retryAfterMs?: number,
    signal?: string,
    transport?: InstagramListTransport,
  ): InstagramOperationFailure => ({
    ok: false,
    durationMs: duration(),
    error: {
      code,
      message,
      ...(status ? { status } : {}),
      ...(retryAfterMs ? { retryAfterMs } : {}),
      ...(signal ? { signal } : {}),
      ...(transport ? { transport } : {}),
    },
  });

  const retryAfterMs = (value: string | null): number | undefined => {
    if (!value) return undefined;

    const numericSeconds = Number(value);
    if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
      return numericSeconds * 1000;
    }

    const retryDate = Date.parse(value);
    if (!Number.isFinite(retryDate)) return undefined;
    return Math.max(1_000, retryDate - Date.now());
  };

  const classifySignal = (data: Record<string, unknown>): string | undefined => {
    const message = String(data.message ?? '').toLowerCase();
    if (data.require_login === true || message.includes('login_required')) return 'login_required';
    if (data.checkpoint_url || message.includes('checkpoint')) return 'checkpoint';
    if (data.spam === true || message.includes('feedback_required')) return 'feedback_required';
    if (message.includes('please wait')) return 'please_wait';
    return undefined;
  };

  const request = async (
    url: string,
    transport?: InstagramListTransport,
  ): Promise<
    | { ok: true; data: Record<string, unknown> }
    | InstagramOperationFailure
  > => {
    let response: Response;
    try {
      response = await fetch(url, {
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
        undefined,
        undefined,
        undefined,
        transport,
      );
    }

    const body = await response.text();
    let data: Record<string, unknown> = {};
    if (body.trim()) {
      try {
        data = JSON.parse(body) as Record<string, unknown>;
      } catch {
        if (response.ok) {
          return fail(
            'INVALID_RESPONSE',
            'Instagram returned an unexpected response.',
            response.status,
            undefined,
            undefined,
            transport,
          );
        }
      }
    }

    const signal = classifySignal(data);

    if (!response.ok) {
      if (response.status === 401 || signal === 'login_required') {
        return fail(
          'SESSION_EXPIRED',
          'Your Instagram session expired. Refresh Instagram and sign in again.',
          response.status,
          undefined,
          signal,
          transport,
        );
      }

      if (response.status === 403) {
        return fail(
          'REQUEST_BLOCKED',
          'Instagram blocked this scan request. Progress was saved; wait before trying again.',
          403,
          retryAfterMs(response.headers.get('retry-after')),
          signal,
          transport,
        );
      }

      if (response.status === 429) {
        const retryMs = retryAfterMs(response.headers.get('retry-after'));
        return fail(
          'RATE_LIMITED',
          retryMs
            ? 'Instagram rate-limited the scan. Progress was saved and WhoBack stopped immediately.'
            : 'Instagram returned HTTP 429 without a retry time. Progress was saved; wait before trying again.',
          429,
          retryMs,
          signal,
          transport,
        );
      }

      if (response.status >= 500) {
        return fail(
          'INSTAGRAM_UNAVAILABLE',
          `Instagram is temporarily unavailable (HTTP ${response.status}). Progress was saved.`,
          response.status,
          undefined,
          signal,
          transport,
        );
      }

      return fail(
        'RELATIONSHIP_REQUEST_FAILED',
        `Instagram rejected the request (HTTP ${response.status}). Progress was saved.`,
        response.status,
        undefined,
        signal,
        transport,
      );
    }

    if (!body.trim()) {
      return fail(
        'INVALID_RESPONSE',
        'Instagram returned an empty response.',
        response.status,
        undefined,
        signal,
        transport,
      );
    }

    const status = data.status;
    if (
      status === 'fail'
      || signal === 'checkpoint'
      || signal === 'feedback_required'
      || signal === 'please_wait'
      || signal === 'login_required'
    ) {
      if (signal === 'login_required') {
        return fail(
          'SESSION_EXPIRED',
          'Instagram requires a fresh signed-in session. Refresh Instagram and sign in again.',
          response.status,
          undefined,
          signal,
          transport,
        );
      }

      return fail(
        signal === 'please_wait' ? 'RATE_LIMITED' : 'REQUEST_BLOCKED',
        'Instagram interrupted this scan. Progress was saved; wait before resuming.',
        response.status,
        undefined,
        signal,
        transport,
      );
    }

    return { ok: true, data };
  };

  const normalize = (value: unknown) =>
    String(value ?? '').trim().replace(/^@/, '').toLowerCase();

  if (operation.kind === 'counts') {
    const response = await request(
      `${API_BASE}/users/${encodeURIComponent(operation.viewerId)}/info/`,
      'rest',
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
    const transport = operation.transport ?? 'rest';
    const pageSize = Math.min(100, Math.max(1, Math.floor(operation.pageSize ?? 50)));

    if (transport === 'graphql') {
      const queryHash = operation.list === 'following'
        ? FOLLOWING_QUERY_HASH
        : FOLLOWERS_QUERY_HASH;
      const variables: Record<string, unknown> = {
        id: String(operation.viewerId),
        first: pageSize,
      };
      if (operation.cursor) variables.after = operation.cursor;

      const params = new URLSearchParams({
        query_hash: queryHash,
        variables: JSON.stringify(variables),
      });
      const response = await request(
        `${GRAPHQL_BASE}?${params.toString()}`,
        'graphql',
      );
      if (!response.ok) return response;

      const root = response.data.data && typeof response.data.data === 'object'
        ? response.data.data as Record<string, unknown>
        : {};
      const user = root.user && typeof root.user === 'object'
        ? root.user as Record<string, unknown>
        : {};
      const edgeKey = operation.list === 'following' ? 'edge_follow' : 'edge_followed_by';
      const edge = user[edgeKey] && typeof user[edgeKey] === 'object'
        ? user[edgeKey] as Record<string, unknown>
        : null;

      if (!edge) {
        return fail(
          'INVALID_RESPONSE',
          'Instagram GraphQL did not return a relationship list.',
          200,
          undefined,
          undefined,
          'graphql',
        );
      }

      const rawEdges = Array.isArray(edge.edges)
        ? edge.edges as Array<Record<string, unknown>>
        : [];
      const users: InstagramUserRef[] = [];

      for (const rawEdge of rawEdges) {
        const node = rawEdge.node && typeof rawEdge.node === 'object'
          ? rawEdge.node as Record<string, unknown>
          : {};
        const idRaw = node.id ?? node.pk;
        const id = idRaw == null ? '' : String(idRaw);
        const username = normalize(node.username);
        if (!id || !username) continue;
        users.push({ id, username });
      }

      const pageInfo = edge.page_info && typeof edge.page_info === 'object'
        ? edge.page_info as Record<string, unknown>
        : {};
      const hasNextPage = pageInfo.has_next_page === true;
      const cursorRaw = pageInfo.end_cursor;
      const nextCursor = cursorRaw == null ? '' : String(cursorRaw);
      const done = !hasNextPage || !nextCursor;
      const totalRaw = Number(edge.count);
      const reportedTotal = Number.isFinite(totalRaw)
        ? Math.max(0, totalRaw)
        : null;

      if (!done && users.length === 0) {
        return fail(
          'PAGINATION_STALLED',
          'Instagram GraphQL returned an empty page with more pages remaining.',
          200,
          undefined,
          undefined,
          'graphql',
        );
      }

      return {
        ok: true,
        kind: 'list-page',
        durationMs: duration(),
        users,
        ...(nextCursor ? { nextCursor } : {}),
        done,
        rawCount: rawEdges.length,
        reportedTotal,
        transport: 'graphql',
      };
    }

    const params = new URLSearchParams({ count: String(pageSize) });
    if (operation.cursor) params.set('max_id', operation.cursor);

    const response = await request(
      `${API_BASE}/friendships/${encodeURIComponent(operation.viewerId)}/${operation.list}/?${params.toString()}`,
      'rest',
    );
    if (!response.ok) return response;

    if (
      response.data.should_limit_list_of_followers === true
      || response.data.should_limit_list_of_followings === true
    ) {
      return fail(
        'REQUEST_BLOCKED',
        'Instagram returned an intentionally limited relationship list. Progress was saved.',
        200,
        undefined,
        'limited_relationship_list',
        'rest',
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
      return fail(
        'PAGINATION_STALLED',
        'Instagram returned an empty page with more pages remaining.',
        200,
        undefined,
        undefined,
        'rest',
      );
    }

    return {
      ok: true,
      kind: 'list-page',
      durationMs: duration(),
      users,
      ...(nextCursor ? { nextCursor } : {}),
      done,
      rawCount: rawUsers.length,
      transport: 'rest',
    };
  }

  const response = await request(
    `${API_BASE}/friendships/show/${encodeURIComponent(operation.targetUserId)}/`,
    'rest',
  );
  if (!response.ok) return response;

  if (
    typeof response.data.followed_by !== 'boolean'
    || typeof response.data.following !== 'boolean'
  ) {
    return fail(
      'INVALID_RESPONSE',
      'Instagram returned an incomplete relationship response.',
      200,
      undefined,
      undefined,
      'rest',
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
