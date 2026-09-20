import type { SyncErrorCode } from '../domain/types';

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
  };
};

export type MainWorldSyncResult = MainWorldSyncSuccess | MainWorldSyncFailure;

/**
 * IMPORTANT: This function is passed to chrome.scripting.executeScript.
 * Chrome serializes only the function body, so it must remain closure-free:
 * no imports, module constants, or helpers referenced from outside the function.
 */
export async function runInstagramMainWorldSync(
  expectedUsername?: string | null,
): Promise<MainWorldSyncResult> {
  const API_BASE = '/api/v1';
  const IG_APP_ID = '936619743392459';
  const MAX_PAGES = 500;

  const normalize = (value: unknown) =>
    String(value ?? '').trim().replace(/^@/, '').toLowerCase();

  const firstString = (...values: unknown[]) => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return '';
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

  const fail = (
    code: SyncErrorCode,
    message: string,
    status?: number,
  ): MainWorldSyncFailure => ({
    ok: false,
    error: { code, message, ...(status ? { status } : {}) },
  });

  const request = async (path: string): Promise<
    | { ok: true; data: Record<string, unknown> }
    | MainWorldSyncFailure
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
          'Instagram temporarily blocked this request. Wait a few minutes and try again.',
          403,
        );
      }

      if (response.status === 429) {
        return fail(
          'RATE_LIMITED',
          'Instagram rate-limited the scan. Your previous data is safe; try again in a few minutes.',
          429,
        );
      }

      if (response.status >= 500) {
        return fail(
          'INSTAGRAM_UNAVAILABLE',
          `Instagram is temporarily unavailable (HTTP ${response.status}). Try again later.`,
          response.status,
        );
      }

      return fail(
        'RELATIONSHIP_REQUEST_FAILED',
        `Instagram rejected the request (HTTP ${response.status}).`,
        response.status,
      );
    }

    const text = await response.text();
    if (!text.trim()) {
      return fail('INVALID_RESPONSE', 'Instagram returned an empty response.');
    }

    try {
      return { ok: true, data: JSON.parse(text) as Record<string, unknown> };
    } catch {
      return fail(
        'INVALID_RESPONSE',
        'Instagram returned an unexpected response. Reload Instagram and try again.',
      );
    }
  };

  const sessionResponse = await request('/accounts/edit/web_form_data/');
  if (!sessionResponse.ok) return sessionResponse;

  const formData = (sessionResponse.data.form_data ?? {}) as Record<string, unknown>;
  const username = normalize(formData.username);
  let userId = firstString(
    formData.user_id,
    formData.username_id,
    formData.pk,
    formData.id,
  );

  if (!username) {
    return fail(
      'ACCOUNT_RESOLVE_FAILED',
      'WhoBack could not identify the signed-in Instagram account.',
    );
  }

  if (expectedUsername && normalize(expectedUsername) !== username) {
    // Session data is authoritative. Keep scanning the actual signed-in account.
  }

  if (!userId) {
    const profileResponse = await request(
      `/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    );
    if (!profileResponse.ok) return profileResponse;

    const profileData = profileResponse.data.data as Record<string, unknown> | undefined;
    const user = profileData?.user as Record<string, unknown> | undefined;
    userId = firstString(user?.id, user?.pk);
  }

  if (!userId) {
    return fail(
      'ACCOUNT_RESOLVE_FAILED',
      `WhoBack could not resolve the Instagram user ID for @${username}.`,
    );
  }

  const fetchRelationship = async (
    type: 'followers' | 'following',
  ): Promise<{ ok: true; usernames: string[] } | MainWorldSyncFailure> => {
    const usernames = new Set<string>();
    const seenCursors = new Set<string>();
    let maxId = '';

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const params = new URLSearchParams({ count: '50' });
      if (maxId) params.set('max_id', maxId);

      const response = await request(
        `/friendships/${encodeURIComponent(userId)}/${type}/?${params.toString()}`,
      );
      if (!response.ok) return response;

      const status = response.data.status;
      if (status === 'fail') {
        return fail(
          'RELATIONSHIP_REQUEST_FAILED',
          String(response.data.message ?? `Instagram rejected the ${type} request.`),
        );
      }

      const users = Array.isArray(response.data.users)
        ? response.data.users as Array<Record<string, unknown>>
        : [];

      for (const user of users) {
        const candidate = normalize(user.username);
        if (candidate) usernames.add(candidate);
      }

      const nextRaw = response.data.next_max_id;
      const next = nextRaw == null ? '' : String(nextRaw);
      if (!next) {
        return { ok: true, usernames: [...usernames].sort() };
      }

      if (seenCursors.has(next)) {
        return fail(
          'PAGINATION_STALLED',
          `Instagram repeated the ${type} pagination cursor. Try again later.`,
        );
      }

      seenCursors.add(next);
      maxId = next;

      // Keep request cadence conservative to reduce rate-limit risk.
      await sleep(500 + Math.floor(Math.random() * 250));
    }

    return fail(
      'PAGINATION_STALLED',
      `Instagram returned too many ${type} pages without completing.`,
    );
  };

  const followers = await fetchRelationship('followers');
  if (!followers.ok) return followers;

  const following = await fetchRelationship('following');
  if (!following.ok) return following;

  return {
    ok: true,
    account: {
      username,
      platformUserId: userId,
      detectedAt: Date.now(),
    },
    snapshot: {
      capturedAt: Date.now(),
      followers: followers.usernames,
      following: following.usernames,
    },
  };
}
