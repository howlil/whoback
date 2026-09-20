import { browser } from 'wxt/browser';
import { detectCurrentAccount } from '../src/instagram/detect-account';
import type { InstagramAccount } from '../src/domain/types';
import type { WhoBackMessage } from '../src/lib/messages';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_idle',
  async main() {
    let lastUsername = '';

    const sendDetectedAccount = async (account: InstagramAccount | null) => {
      if (!account || account.username === lastUsername) return account;
      lastUsername = account.username;
      await browser.runtime.sendMessage({
        type: 'ACCOUNT_DETECTED',
        account,
      } satisfies WhoBackMessage);
      return account;
    };

    const reportAccountFromDom = async () => {
      return sendDetectedAccount(detectCurrentAccount());
    };

    await reportAccountFromDom();

    const observer = new MutationObserver(() => {
      void reportAccountFromDom();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true });
  },
});
