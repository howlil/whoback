import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScanCheckpoint } from '../src/domain/types';
import { runInstagramMainWorldSync } from '../src/instagram/main-world-sync';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('runInstagramMainWorldSync', () => {
  it('starts directly from the known viewer id without identity network calls', async () => {
    const calls: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url.includes('/friendships/123/following/')) {
        return jsonResponse({
          status: 'ok',
          users: [
            { pk: '1', username: 'ALICE' },
            { pk: '4', username: 'Dave' },
          ],
        });
      }

      if (url.includes('/friendships/123/followers/')) {
        return jsonResponse({
          status: 'ok',
          users: [
            { pk: '1', username: 'Alice' },
            { pk: '2', username: 'BOB' },
            { pk: '3', username: 'alice' },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await runInstagramMainWorldSync({
      viewerId: '123',
      expectedUsername: 'mraulabsr',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.account).toMatchObject({
      username: 'mraulabsr',
      platformUserId: '123',
    });
    expect(result.snapshot.followers).toEqual(['alice', 'bob']);
    expect(result.snapshot.following).toEqual(['alice', 'dave']);
    expect(calls).toEqual([
      '/api/v1/friendships/123/following/?count=50',
      '/api/v1/friendships/123/followers/?count=50',
    ]);
    expect(calls.some((url) => url.includes('web_profile_info'))).toBe(false);
    expect(calls.some((url) => url.includes('web_form_data'))).toBe(false);
  });

  it('resumes from the saved cursor instead of restarting completed pages', async () => {
    const calls: string[] = [];
    const checkpoint: ScanCheckpoint = {
      version: 1,
      accountId: '123',
      username: 'mraulabsr',
      phase: 'following',
      following: {
        users: [{ id: '1', username: 'alice' }],
        cursor: 'page-two',
        done: false,
        pages: 1,
      },
      followers: {
        users: [],
        done: false,
        pages: 0,
      },
      requestCount: 1,
      startedAt: 100,
      updatedAt: 200,
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url.includes('/following/')) {
        return jsonResponse({
          status: 'ok',
          users: [{ pk: '2', username: 'bob' }],
        });
      }

      if (url.includes('/followers/')) {
        return jsonResponse({
          status: 'ok',
          users: [{ pk: '1', username: 'alice' }],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await runInstagramMainWorldSync({
      viewerId: '123',
      expectedUsername: 'mraulabsr',
      checkpoint,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.following).toEqual(['alice', 'bob']);
    expect(calls[0]).toContain('/following/?count=50&max_id=page-two');
    expect(calls.filter((url) => url.includes('/following/'))).toHaveLength(1);
  });

  it('hard-stops on 429 and returns a resumable checkpoint', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    globalThis.fetch = vi.fn(async () => new Response('', {
      status: 429,
      headers: { 'retry-after': '120' },
    })) as typeof fetch;

    const result = await runInstagramMainWorldSync({
      viewerId: '123',
      expectedUsername: 'mraulabsr',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Instagram rate-limited the scan. Progress was saved and WhoBack stopped immediately.',
      status: 429,
      retryAfterMs: 120_000,
    });
    expect(result.checkpoint).toMatchObject({
      version: 1,
      accountId: '123',
      phase: 'following',
      requestCount: 1,
      following: {
        users: [],
        done: false,
        pages: 0,
      },
    });
  });

  it('maps a browser-level fetch failure and keeps the checkpoint', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const result = await runInstagramMainWorldSync({
      viewerId: '123',
      expectedUsername: 'mraulabsr',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toEqual({
      code: 'NETWORK_ERROR',
      message: 'Instagram request failed inside the signed-in page. Reload Instagram and try again.',
    });
    expect(result.checkpoint?.accountId).toBe('123');
  });
});
