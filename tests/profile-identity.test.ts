import { describe, expect, it } from 'vitest';
import { isInstagramUsername, usernameFromProfileHref } from '../src/instagram/profile-identity';

describe('Instagram profile identity', () => {
  it('accepts valid Instagram usernames', () => {
    expect(isInstagramUsername('howlil')).toBe(true);
    expect(isInstagramUsername('howlil.dev')).toBe(true);
    expect(isInstagramUsername('_howlil_')).toBe(true);
  });

  it('rejects Instagram application routes that look like usernames', () => {
    expect(isInstagramUsername('language')).toBe(false);
    expect(isInstagramUsername('explore')).toBe(false);
    expect(isInstagramUsername('accounts')).toBe(false);
  });

  it('only extracts a username from a single-segment Instagram profile URL', () => {
    expect(usernameFromProfileHref('/howlil/')).toBe('howlil');
    expect(usernameFromProfileHref('https://www.instagram.com/howlil/')).toBe('howlil');
    expect(usernameFromProfileHref('/language/')).toBeNull();
    expect(usernameFromProfileHref('/howlil/followers/')).toBeNull();
    expect(usernameFromProfileHref('https://example.com/howlil/')).toBeNull();
  });
});
