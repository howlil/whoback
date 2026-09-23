import { browser } from 'wxt/browser';
import { detectCurrentAccount } from '../src/instagram/detect-account';
import type { InstagramAccount, ScanCheckpoint, SyncPhase } from '../src/domain/types';
import type { AccountProbeMessage, WhoBackMessage } from '../src/lib/messages';

type MainWorldBridgeMessage =
  | {
      source: 'whoback-main';
      type: 'checkpoint';
      checkpoint: ScanCheckpoint;
    }
  | {
      source: 'whoback-main';
      type: 'progress';
      phase: Extract<SyncPhase, 'followers' | 'following'>;
      progress: number;
      message: string;
    };

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_start',
  async main() {
    let lastUsername = '';

    browser.runtime.onMessage.addListener((
      message: AccountProbeMessage,
      _sender,
      sendResponse,
    ) => {
      if (message.type !== 'REQUEST_ACCOUNT') return undefined;
      sendResponse(detectCurrentAccount());
      return true;
    });

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

    window.addEventListener('message', (event: MessageEvent<MainWorldBridgeMessage>) => {
      if (event.source !== window || event.data?.source !== 'whoback-main') return;

      if (event.data.type === 'checkpoint') {
        void browser.runtime.sendMessage({
          type: 'SCAN_CHECKPOINT',
          checkpoint: event.data.checkpoint,
        } satisfies WhoBackMessage);
        return;
      }

      if (event.data.type === 'progress') {
        void browser.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          phase: event.data.phase,
          progress: event.data.progress,
          message: event.data.message,
        } satisfies WhoBackMessage);
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => void reportAccountFromDom(), { once: true });
    } else {
      await reportAccountFromDom();
    }

    const observer = new MutationObserver(() => {
      void reportAccountFromDom();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true });
  },
});
