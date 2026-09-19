import { normalizeUsername } from '../domain/relationship';
import type { InstagramAccount, RelationshipSnapshot, SyncErrorCode } from '../domain/types';

const API_BASE = 'https://www.instagram.com/api/v1';
const INSTAGRAM_WEB_APP_ID = '936619743392459';
const MAX_PAGES = 500;

type FetchLike = typeof fetch;
type SleepLike = (ms: number) => Promise<void>;

type SessionIdentity = InstagramAccount & {
  platformUserId: string;
};

type FriendshipUser = {
  pk?: string | number;
  id?: string | number;
  username?: string;
};

type FriendshipsResponse = {
  users?: FriendshipUser[];
  next_max_id?: string | number | null;
  status?: string;
  message?: string;
};

export type RelationshipProgress = {
  phase: 'followers' | 'following';
  count: number;
  total: number;
  page: number;
};

export class InstagramSyncError extends Error {
  readonly code: SyncErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: SyncErrorCode,
    message: string,
    options: { status?: number; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'InstagramSyncError';
    this.code = code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class InstagramRestSource {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleepImpl: SleepLike = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly random: () => number = Math.random,
  ) {}

  async resolveSession(signal?: AbortSignal): Promise<SessionIdentity> {
    const data = await this.request<Record<string, unknown>>(
      '/accounts/edit/web_form_data/',
      signal,
    );
    const formData = (data.form_data ?? {}) as Record<string, unknown>;
    const username = normalizeUsername(String(formData.username ?? ''));
    let userId = firstString(
      formData.user_id,
      formData.username_id,
      formData.pk,
      formData.id,
    );

    if (!username) {
      throw new InstagramSyncError(
        'ACCOUNT_RESOLVE_FAILED',
        'WhoBack could not identify the Instagram account for this session.',
      );
    }

    if (!userId) {
      const profile = await this.request<Record<string, unknown>>(
        `/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        signal,
      );
      const profileData = profile.data as Record<string, unknown> | undefined;
      const user = profileData?.user as Record<string, unknown> | undefined;
      userId = firstString(user?.id, user?.pk);
    }

    if (!userId) {
      throw new InstagramSyncError(
        'ACCOUNT_RESOLVE_FAILED',
        `WhoBack could not resolve the Instagram user ID for @${username}.`,
      );
    }

    return {
      username,
      platformUserId: userId,
      detectedAt: Date.now(),
    };
  }

  async fetchCounts(
    userId: string,
    signal?: AbortSignal,
  ): Promise<{ followers: number; following: number }> {
    try {
      const data = await this.request<Record<string, unknown>>(
        `/users/${encodeURIComponent(userId)}/info/`,
        signal,
      );
      const user = data.user as Record<string, unknown> | undefined;
      return {
        followers: toCount(user?.follower_count),
        following: toCount(user?.following_count),
      };
    } catch {
      return { followers: 0, following: 0 };
    }
  }

  async fetchRelationshipList(
    userId: string,
    type: 'followers' | 'following',
    total: number,
    onProgress: (progress: RelationshipProgress) => void,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const usernames = new Set<string>();
    const seenCursors = new Set<string>();
    let maxId = '';

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (signal?.aborted) {
        throw new InstagramSyncError('SYNC_ABORTED', 'Instagram sync was canceled.');
      }

      const params = new URLSearchParams({ count: '50' });
      if (maxId) params.set('max_id', maxId);

      const data = await this.request<FriendshipsResponse>(
        `/friendships/${encodeURIComponent(userId)}/${type}/?${params.toString()}`,
        signal,
      );

      if (data.status === 'fail') {
        throw new InstagramSyncError(
          'RELATIONSHIP_REQUEST_FAILED',
          data.message || `Instagram rejected the ${type} request.`,
        );
      }

      for (const user of data.users ?? []) {
        const username = normalizeUsername(String(user.username ?? ''));
        if (username) usernames.add(username);
      }

      onProgress({
        phase: type,
        count: usernames.size,
        total,
        page,
      });

      const next = data.next_max_id == null ? '' : String(data.next_max_id);
      if (!next) return [...usernames].sort();

      if (seenCursors.has(next)) {
        throw new InstagramSyncError(
          'PAGINATION_STALLED',
          `Instagram repeated the ${type} pagination cursor. Try again later.`,
        );
      }

      seenCursors.add(next);
      maxId = next;

      const delay = 450 + Math.round(this.random() * 300);
      await this.sleepImpl(delay);
    }

    throw new InstagramSyncError(
      'PAGINATION_STALLED',
      `Instagram returned too many ${type} pages without completing.`,
    );
  }

  async sync(
    onProgress: (progress: RelationshipProgress) => void,
    signal?: AbortSignal,
  ): Promise<{ account: SessionIdentity; snapshot: RelationshipSnapshot }> {
    const account = await this.resolveSession(signal);
    const counts = await this.fetchCounts(account.platformUserId, signal);

    const followers = await this.fetchRelationshipList(
      account.platformUserId,
      'followers',
      counts.followers,
      onProgress,
      signal,
    );

    const following = await this.fetchRelationshipList(
      account.platformUserId,
      'following',
      counts.following,
      onProgress,
      signal,
    );

    return {
      account,
      snapshot: {
        capturedAt: Date.now(),
        followers,
        following,
      },
    };
  }

  private async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        credentials: 'include',
        signal,
        headers: {
          accept: 'application/json',
          'x-ig-app-id': INSTAGRAM_WEB_APP_ID,
          'x-requested-with': 'XMLHttpRequest',
          'x-asbd-id': '198387',
        },
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new InstagramSyncError('SYNC_ABORTED', 'Instagram sync was canceled.', {
          cause: error,
        });
      }
      throw new InstagramSyncError(
        'NETWORK_ERROR',
        'WhoBack could not reach Instagram. Check your connection and try again.',
        { cause: error },
      );
    }

    if (!response.ok) {
      throw errorForStatus(response);
    }

    const text = await response.text();
    if (!text.trim()) {
      throw new InstagramSyncError(
        'INVALID_RESPONSE',
        'Instagram returned an empty response.',
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new InstagramSyncError(
        'INVALID_RESPONSE',
        'Instagram returned an unexpected response. Refresh Instagram and try again.',
        { cause: error },
      );
    }
  }
}

function errorForStatus(response: Response): InstagramSyncError {
  const status = response.status;

  if (status === 401) {
    return new InstagramSyncError(
      'SESSION_EXPIRED',
      'Your Instagram session expired. Refresh Instagram and sign in again.',
      { status },
    );
  }

  if (status === 403) {
    return new InstagramSyncError(
      'REQUEST_BLOCKED',
      'Instagram temporarily blocked this request. Wait a few minutes and try again.',
      { status },
    );
  }

  if (status === 429) {
    const retryAfterSeconds = Number(response.headers.get('retry-after') ?? 0);
    return new InstagramSyncError(
      'RATE_LIMITED',
      'Instagram rate-limited the scan. Your previous data is safe; try again in a few minutes.',
      {
        status,
        retryAfterMs: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : undefined,
      },
    );
  }

  if (status >= 500) {
    return new InstagramSyncError(
      'INSTAGRAM_UNAVAILABLE',
      `Instagram is temporarily unavailable (HTTP ${status}). Try again later.`,
      { status },
    );
  }

  return new InstagramSyncError(
    'RELATIONSHIP_REQUEST_FAILED',
    `Instagram rejected the request (HTTP ${status}).`,
    { status },
  );
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function toCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}
