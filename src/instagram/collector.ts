import { normalizeUsername } from '../domain/relationship';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(factory: () => T | null | undefined, timeout = 12_000, interval = 150): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = factory();
    if (value) return value;
    await sleep(interval);
  }
  throw new Error('Instagram took too long to load.');
}

function findRelationshipLink(username: string, type: 'followers' | 'following'): HTMLAnchorElement | null {
  const exact = `/${username}/${type}/`;
  return document.querySelector<HTMLAnchorElement>(`a[href="${exact}"]`)
    ?? [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find((anchor) => anchor.href.includes(`/${username}/${type}/`))
    ?? null;
}

function dialogScrollContainer(dialog: HTMLElement): HTMLElement {
  const candidates = [...dialog.querySelectorAll<HTMLElement>('div')]
    .filter((node) => node.scrollHeight > node.clientHeight + 40)
    .sort((a, b) => b.scrollHeight - a.scrollHeight);
  return candidates[0] ?? dialog;
}

function collectUsernames(dialog: HTMLElement, owner: string): string[] {
  const usernames = new Set<string>();
  for (const anchor of dialog.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
    const match = anchor.getAttribute('href')?.match(/^\/([^/?#]+)\/?$/);
    if (!match?.[1]) continue;
    const username = normalizeUsername(match[1]);
    if (username && username !== normalizeUsername(owner)) usernames.add(username);
  }
  return [...usernames];
}

function closeDialog(dialog: HTMLElement): void {
  const button = dialog.querySelector<HTMLButtonElement>('button[aria-label*="close" i]')
    ?? [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.trim() === '×');
  if (button) button.click();
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

export async function collectRelationshipList(
  owner: string,
  type: 'followers' | 'following',
  onProgress: (count: number) => void,
): Promise<string[]> {
  const link = await waitFor(() => findRelationshipLink(owner, type));
  link.click();
  const dialog = await waitFor(() => document.querySelector<HTMLElement>('div[role="dialog"]'));
  const scroll = dialogScrollContainer(dialog);

  let stableRounds = 0;
  let previousCount = -1;
  let previousHeight = -1;
  let result: string[] = [];

  for (let round = 0; round < 300 && stableRounds < 4; round += 1) {
    result = collectUsernames(dialog, owner);
    onProgress(result.length);

    const height = scroll.scrollHeight;
    if (result.length === previousCount && height === previousHeight) stableRounds += 1;
    else stableRounds = 0;

    previousCount = result.length;
    previousHeight = height;
    scroll.scrollTop = scroll.scrollHeight;
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
    await sleep(450);
  }

  closeDialog(dialog);
  await sleep(300);
  return result.sort();
}
