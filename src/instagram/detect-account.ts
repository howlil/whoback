import type { InstagramAccount } from '../domain/types';

const RESERVED = new Set([
  'accounts', 'direct', 'explore', 'reels', 'stories', 'about', 'developer', 'legal', 'privacy', 'web',
]);

function usernameFromHref(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, location.origin);
    const [segment] = url.pathname.split('/').filter(Boolean);
    if (!segment || RESERVED.has(segment.toLowerCase())) return null;
    return segment;
  } catch {
    return null;
  }
}

export function detectCurrentAccount(): InstagramAccount | null {
  const imageCandidates = [...document.querySelectorAll<HTMLImageElement>('nav img[alt*="profile" i], header img[alt*="profile" i]')];
  for (const image of imageCandidates) {
    const anchor = image.closest<HTMLAnchorElement>('a[href]');
    const username = usernameFromHref(anchor?.getAttribute('href') ?? null);
    if (username) {
      return { username, avatarUrl: image.currentSrc || image.src || undefined, detectedAt: Date.now() };
    }
  }

  const profileLinks = [...document.querySelectorAll<HTMLAnchorElement>('nav a[href^="/"][href$="/"]')];
  for (const anchor of profileLinks.reverse()) {
    const username = usernameFromHref(anchor.getAttribute('href'));
    if (username) return { username, detectedAt: Date.now() };
  }

  return null;
}
