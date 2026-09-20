import { describe, expect, it, vi } from 'vitest';
import { resolveInstagramViewerId } from '../src/instagram/session-identity';

describe('resolveInstagramViewerId', () => {
  it('prefers ds_user_id from the existing Instagram browser session', async () => {
    const getCookie = vi.fn(async () => ({ value: ' 123456 ' }));

    await expect(
      resolveInstagramViewerId(getCookie, 'cached', 'checkpoint'),
    ).resolves.toEqual({
      id: '123456',
      source: 'cookie',
    });

    expect(getCookie).toHaveBeenCalledWith({
      url: 'https://www.instagram.com/',
      name: 'ds_user_id',
    });
  });

  it('falls back locally without making any Instagram network request', async () => {
    const getCookie = vi.fn(async () => null);

    await expect(
      resolveInstagramViewerId(getCookie, 'cached-id', 'checkpoint-id'),
    ).resolves.toEqual({
      id: 'cached-id',
      source: 'cached-account',
    });
  });

  it('returns null when no session identity is available', async () => {
    const getCookie = vi.fn(async () => null);

    await expect(
      resolveInstagramViewerId(getCookie),
    ).resolves.toBeNull();
  });
});
