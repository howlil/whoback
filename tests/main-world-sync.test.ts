import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInstagramOperation } from '../src/instagram/main-world-sync';

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

describe('runInstagramOperation', () => {
  it('reads profile counts with one request', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({
        status: 'ok',
        user: {
          following_count: 123,
          follower_count: 1_000_000,
        },
      });
    }) as typeof fetch;

    const result = await runInstagramOperation({
      kind: 'counts',
      viewerId: '42',
    });

    expect(result).toMatchObject({
      ok: true,
      kind: 'counts',
      followingTotal: 123,
      followersTotal: 1_000_000,
    });
    expect(calls).toEqual(['/api/v1/users/42/info/']);
  });

  it('fetches exactly one relationship-list page', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({
        status: 'ok',
        users: [
          { pk: '1', username: 'ALICE' },
          { pk: '2', username: 'Bob' },
        ],
        next_max_id: 'page-two',
        has_more: true,
      });
    }) as typeof fetch;

    const result = await runInstagramOperation({
      kind: 'list-page',
      viewerId: '42',
      list: 'following',
    });

    expect(result).toMatchObject({
      ok: true,
      kind: 'list-page',
      users: [
        { id: '1', username: 'alice' },
        { id: '2', username: 'bob' },
      ],
      nextCursor: 'page-two',
      done: false,
      rawCount: 2,
    });
    expect(calls).toEqual([
      '/api/v1/friendships/42/following/?count=50',
    ]);
  });

  it('reads relationship pages through Instagram GraphQL', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({
        data: {
          user: {
            edge_follow: {
              count: 2,
              edges: [
                { node: { id: '1', username: 'ALICE' } },
                { node: { id: '2', username: 'Bob' } },
              ],
              page_info: {
                has_next_page: true,
                end_cursor: 'graph-page-two',
              },
            },
          },
        },
      });
    }) as typeof fetch;

    const result = await runInstagramOperation({
      kind: 'list-page',
      viewerId: '42',
      list: 'following',
      pageSize: 24,
      transport: 'graphql',
    });

    expect(result).toMatchObject({
      ok: true,
      kind: 'list-page',
      users: [
        { id: '1', username: 'alice' },
        { id: '2', username: 'bob' },
      ],
      nextCursor: 'graph-page-two',
      done: false,
      rawCount: 2,
      reportedTotal: 2,
      transport: 'graphql',
    });

    const url = new URL(calls[0]!, 'https://www.instagram.com');
    expect(url.pathname).toBe('/graphql/query/');
    expect(url.searchParams.get('query_hash')).toBe('58712303d941c6855d4e888c5f0cd22f');
    expect(JSON.parse(url.searchParams.get('variables') ?? '{}')).toEqual({
      id: '42',
      first: 24,
    });
  });

  it('uses the requested larger page size when the endpoint accepts it', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ status: 'ok', users: [], has_more: false });
    }) as typeof fetch;

    await runInstagramOperation({
      kind: 'list-page',
      viewerId: '42',
      list: 'followers',
      pageSize: 100,
    });

    expect(calls).toEqual([
      '/api/v1/friendships/42/followers/?count=100',
    ]);
  });

  it('checks one follow-back relationship', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      status: 'ok',
      followed_by: false,
      following: true,
    })) as typeof fetch;

    const result = await runInstagramOperation({
      kind: 'relationship',
      viewerId: '42',
      targetUserId: '99',
    });

    expect(result).toMatchObject({
      ok: true,
      kind: 'relationship',
      targetUserId: '99',
      followedBy: false,
      following: true,
    });
  });

  it('hard-stops on 429 and honors Retry-After seconds', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', {
      status: 429,
      headers: { 'retry-after': '120' },
    })) as typeof fetch;

    const result = await runInstagramOperation({
      kind: 'list-page',
      viewerId: '42',
      list: 'following',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Instagram rate-limited the scan. Progress was saved and WhoBack stopped immediately.',
      status: 429,
      retryAfterMs: 120_000,
    });
  });

  it('does not invent a cooldown when 429 has no Retry-After header', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(
      { status: 'fail', message: 'Please wait a few minutes before you try again.' },
      { status: 429 },
    )) as typeof fetch;

    const result = await runInstagramOperation({
      kind: 'list-page',
      viewerId: '42',
      list: 'following',
      transport: 'graphql',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      signal: 'please_wait',
      transport: 'graphql',
    });
    expect(result.error.retryAfterMs).toBeUndefined();
    expect(result.error.message).toContain('without a retry time');
  });

  it('maps a browser-level fetch failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const result = await runInstagramOperation({
      kind: 'counts',
      viewerId: '42',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('NETWORK_ERROR');
  });
});
