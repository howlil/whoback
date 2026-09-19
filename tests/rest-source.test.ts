import { describe, expect, it } from 'vitest';
import { InstagramRestSource, InstagramSyncError } from '../src/instagram/rest-source';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('InstagramRestSource', () => {
  it('resolves the current session and paginates followers/following', async () => {
    const calls: string[] = [];

    const fetchImpl = (async (input: RequestInfo | URL) => {
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

      if (url.includes('/users/123/info/')) {
        return jsonResponse({
          user: {
            follower_count: 3,
            following_count: 2,
          },
        });
      }

      if (url.includes('/friendships/123/followers/')) {
        const parsed = new URL(url);
        if (!parsed.searchParams.get('max_id')) {
          return jsonResponse({
            status: 'ok',
            users: [
              { pk: '1', username: 'Alice' },
              { pk: '2', username: 'bob' },
            ],
            next_max_id: 'cursor-2',
          });
        }

        return jsonResponse({
          status: 'ok',
          users: [
            { pk: '2', username: 'BOB' },
            { pk: '3', username: 'carol' },
          ],
        });
      }

      if (url.includes('/friendships/123/following/')) {
        return jsonResponse({
          status: 'ok',
          users: [
            { pk: '1', username: 'alice' },
            { pk: '4', username: 'dave' },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const source = new InstagramRestSource(
      fetchImpl,
      async () => undefined,
      () => 0,
    );

    const progress: Array<{ phase: string; count: number; total: number; page: number }> = [];
    const result = await source.sync((event) => progress.push(event));

    expect(result.account).toMatchObject({
      username: 'mraulabsr',
      platformUserId: '123',
    });
    expect(result.snapshot.followers).toEqual(['alice', 'bob', 'carol']);
    expect(result.snapshot.following).toEqual(['alice', 'dave']);
    expect(progress).toEqual([
      { phase: 'followers', count: 2, total: 3, page: 1 },
      { phase: 'followers', count: 3, total: 3, page: 2 },
      { phase: 'following', count: 2, total: 2, page: 1 },
    ]);
    expect(calls.some((url) => url.includes('max_id=cursor-2'))).toBe(true);
  });

  it('maps HTTP 429 to a rate-limit domain error', async () => {
    const fetchImpl = (async () => new Response('', {
      status: 429,
      headers: { 'retry-after': '60' },
    })) as typeof fetch;

    const source = new InstagramRestSource(fetchImpl);

    await expect(source.resolveSession()).rejects.toMatchObject({
      name: 'InstagramSyncError',
      code: 'RATE_LIMITED',
      status: 429,
      retryAfterMs: 60_000,
    } satisfies Partial<InstagramSyncError>);
  });
});
