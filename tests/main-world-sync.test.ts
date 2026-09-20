import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('uses the signed-in session and returns normalized relationship lists', async () => {
    const calls: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url.includes('/accounts/edit/web_form_data/')) {
        return jsonResponse({
          form_data: {
            username: 'MraulaBsr',
            user_id: '123',
          },
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

      if (url.includes('/friendships/123/following/')) {
        return jsonResponse({
          status: 'ok',
          users: [
            { pk: '1', username: 'ALICE' },
            { pk: '4', username: 'Dave' },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await runInstagramMainWorldSync('mraulabsr');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.account).toMatchObject({
      username: 'mraulabsr',
      platformUserId: '123',
    });
    expect(result.snapshot.followers).toEqual(['alice', 'bob']);
    expect(result.snapshot.following).toEqual(['alice', 'dave']);
    expect(calls).toEqual([
      '/api/v1/accounts/edit/web_form_data/',
      '/api/v1/friendships/123/followers/?count=50',
      '/api/v1/friendships/123/following/?count=50',
    ]);
  });

  it('maps Instagram rate limiting without throwing across the injection boundary', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 429 })) as typeof fetch;

    const result = await runInstagramMainWorldSync(null);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Instagram rate-limited the scan. Your previous data is safe; try again in a few minutes.',
        status: 429,
      },
    });
  });

  it('maps a browser-level fetch failure to NETWORK_ERROR', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const result = await runInstagramMainWorldSync(null);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Instagram request failed inside the signed-in page. Reload Instagram and try again.',
      },
    });
  });
});
