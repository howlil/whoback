const RESERVED_PATHS = new Set([
  'about',
  'accounts',
  'api',
  'challenge',
  'create',
  'developer',
  'direct',
  'emails',
  'explore',
  'language',
  'legal',
  'nametag',
  'notifications',
  'oauth',
  'p',
  'privacy',
  'reels',
  'settings',
  'static',
  'stories',
  'web',
]);

const USERNAME_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;

export function isInstagramUsername(value: string): boolean {
  const username = value.trim().replace(/^@/, '');
  return USERNAME_PATTERN.test(username) && !RESERVED_PATHS.has(username.toLowerCase());
}

export function usernameFromProfileHref(
  href: string | null,
  base = 'https://www.instagram.com/',
): string | null {
  if (!href) return null;

  try {
    const url = new URL(href, base);
    const host = url.hostname.replace(/^www\./, '');
    if (host !== 'instagram.com') return null;

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;

    const username = segments[0];
    return username && isInstagramUsername(username) ? username : null;
  } catch {
    return null;
  }
}
