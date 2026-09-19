import type { InstagramAccount } from '../domain/types';
import { usernameFromProfileHref } from './profile-identity';

const PROFILE_LABEL = /^(profile|profil)$/i;

function scoreProfileAnchor(anchor: HTMLAnchorElement): number {
  let score = 0;
  const label = [
    anchor.getAttribute('aria-label'),
    anchor.getAttribute('title'),
    anchor.textContent?.trim(),
    anchor.querySelector<SVGElement>('svg[aria-label]')?.getAttribute('aria-label'),
  ].filter(Boolean).join(' ');

  if (PROFILE_LABEL.test(label.trim())) score += 8;
  else if (/\b(profile|profil)\b/i.test(label)) score += 4;

  if (anchor.querySelector('img')) score += 6;
  if (anchor.closest('nav, header, aside')) score += 2;

  return score;
}

export function detectCurrentAccount(): InstagramAccount | null {
  const anchors = [...document.querySelectorAll<HTMLAnchorElement>('nav a[href], header a[href], aside a[href]')]
    .map((anchor) => {
      const username = usernameFromProfileHref(anchor.getAttribute('href'), location.origin);
      return username ? { anchor, username, score: scoreProfileAnchor(anchor) } : null;
    })
    .filter((candidate): candidate is { anchor: HTMLAnchorElement; username: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  const best = anchors[0];
  if (!best || best.score < 4) return null;

  const image = best.anchor.querySelector<HTMLImageElement>('img');
  return {
    username: best.username,
    avatarUrl: image?.currentSrc || image?.src || undefined,
    detectedAt: Date.now(),
  };
}
