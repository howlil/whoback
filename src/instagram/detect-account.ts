import type { InstagramAccount } from '../domain/types';
import { usernameFromProfileHref } from './profile-identity';

const PROFILE_LABEL = /\b(profile|profil)\b/i;

function isVisible(anchor: HTMLAnchorElement): boolean {
  const rect = anchor.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function scoreProfileAnchor(anchor: HTMLAnchorElement): number {
  if (!isVisible(anchor)) return -1;

  let score = 0;
  const label = [
    anchor.getAttribute('aria-label'),
    anchor.getAttribute('title'),
    anchor.textContent?.trim(),
    anchor.querySelector<SVGElement>('svg[aria-label]')?.getAttribute('aria-label'),
    anchor.querySelector<HTMLImageElement>('img[alt]')?.getAttribute('alt'),
  ].filter(Boolean).join(' ');

  if (PROFILE_LABEL.test(label)) score += 10;
  if (anchor.querySelector('img')) score += 4;
  if (anchor.closest('nav, header, aside, [role="navigation"]')) score += 2;

  const rect = anchor.getBoundingClientRect();
  const desktopRailLimit = Math.min(180, window.innerWidth * 0.14);
  if (rect.left <= desktopRailLimit && rect.width <= 100 && rect.height <= 100) score += 8;

  return score;
}

export function detectCurrentAccount(): InstagramAccount | null {
  const candidates = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
    .map((anchor) => {
      const username = usernameFromProfileHref(anchor.getAttribute('href'), location.origin);
      return username ? { anchor, username, score: scoreProfileAnchor(anchor) } : null;
    })
    .filter((candidate): candidate is { anchor: HTMLAnchorElement; username: string; score: number } =>
      Boolean(candidate && candidate.score >= 0),
    )
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < 8) return null;

  const image = best.anchor.querySelector<HTMLImageElement>('img');
  return {
    username: best.username,
    avatarUrl: image?.currentSrc || image?.src || undefined,
    detectedAt: Date.now(),
  };
}
