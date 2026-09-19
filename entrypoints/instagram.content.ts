import { browser } from 'wxt/browser';
import { collectRelationshipList } from '../src/instagram/collector';
import { detectCurrentAccount } from '../src/instagram/detect-account';
import { isInstagramUsername } from '../src/instagram/profile-identity';
import type { InstagramAccount } from '../src/domain/types';
import type { WhoBackMessage } from '../src/lib/messages';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_idle',
  async main() {
    let lastUsername = '';
    let collecting = false;

    const reportAccount = async () => {
      const account = detectCurrentAccount();
      if (!account || account.username === lastUsername) return account;
      lastUsername = account.username;
      await browser.runtime.sendMessage({ type: 'ACCOUNT_DETECTED', account } satisfies WhoBackMessage);
      return account;
    };

    const syncIfRequested = async () => {
      const url = new URL(location.href);
      if (collecting || url.searchParams.get('whoback_sync') !== '1') return;

      collecting = true;
      try {
        const requestedOwner = url.searchParams.get('whoback_account');
        const owner = requestedOwner && isInstagramUsername(requestedOwner)
          ? requestedOwner
          : (await waitForAccount(reportAccount)).username;

        await browser.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          phase: 'followers',
          progress: 8,
          message: 'Loading followers…',
        } satisfies WhoBackMessage);

        const followers = await collectRelationshipList(owner, 'followers', (count) => {
          void browser.runtime.sendMessage({
            type: 'SYNC_PROGRESS',
            phase: 'followers',
            progress: 30,
            message: `Found ${count.toLocaleString()} followers`,
          } satisfies WhoBackMessage);
        });

        await browser.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          phase: 'following',
          progress: 55,
          message: 'Loading following…',
        } satisfies WhoBackMessage);

        const following = await collectRelationshipList(owner, 'following', (count) => {
          void browser.runtime.sendMessage({
            type: 'SYNC_PROGRESS',
            phase: 'following',
            progress: 78,
            message: `Found ${count.toLocaleString()} following`,
          } satisfies WhoBackMessage);
        });

        await browser.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          phase: 'processing',
          progress: 92,
          message: 'Comparing relationships…',
        } satisfies WhoBackMessage);

        await browser.runtime.sendMessage({
          type: 'SYNC_COMPLETE',
          snapshot: { capturedAt: Date.now(), followers, following },
        } satisfies WhoBackMessage);
      } catch (error) {
        await browser.runtime.sendMessage({
          type: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Could not sync Instagram.',
        } satisfies WhoBackMessage);
      } finally {
        collecting = false;
      }
    };

    const observer = new MutationObserver(() => {
      void reportAccount();
      void syncIfRequested();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true });

    await reportAccount();
    await syncIfRequested();
  },
});

async function waitForAccount(
  report: () => Promise<InstagramAccount | null>,
  timeout = 12_000,
): Promise<InstagramAccount> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const account = await report();
    if (account) return account;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Could not detect your Instagram account. Refresh instagram.com and try again.');
}
