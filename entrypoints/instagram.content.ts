import { browser } from 'wxt/browser';
import { detectCurrentAccount } from '../src/instagram/detect-account';
import {
  InstagramRestSource,
  InstagramSyncError,
  type RelationshipProgress,
} from '../src/instagram/rest-source';
import type { InstagramAccount, SyncErrorCode } from '../src/domain/types';
import type { WhoBackMessage } from '../src/lib/messages';

export default defineContentScript({
  matches: ['https://www.instagram.com/*'],
  runAt: 'document_idle',
  async main() {
    let lastUsername = '';
    let collecting = false;
    const source = new InstagramRestSource();

    const sendDetectedAccount = async (account: InstagramAccount | null) => {
      if (!account || account.username === lastUsername) return account;
      lastUsername = account.username;
      await browser.runtime.sendMessage({
        type: 'ACCOUNT_DETECTED',
        account,
      } satisfies WhoBackMessage);
      return account;
    };

    const reportAccountFromSession = async () => {
      try {
        const account = await source.resolveSession();
        return await sendDetectedAccount(account);
      } catch {
        return null;
      }
    };

    const reportAccountFromDom = async () => {
      return sendDetectedAccount(detectCurrentAccount());
    };

    const runSync = async () => {
      if (collecting) return { ok: false, reason: 'busy' };
      collecting = true;

      try {
        await browser.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          phase: 'starting',
          progress: 4,
          message: 'Using your Instagram session…',
        } satisfies WhoBackMessage);

        const result = await source.sync((progress) => {
          void sendProgress(progress);
        });

        await sendDetectedAccount(result.account);

        await browser.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          phase: 'processing',
          progress: 96,
          message: 'Comparing relationships…',
        } satisfies WhoBackMessage);

        await browser.runtime.sendMessage({
          type: 'SYNC_COMPLETE',
          account: result.account,
          snapshot: result.snapshot,
        } satisfies WhoBackMessage);

        return { ok: true };
      } catch (error) {
        const normalized = normalizeSyncError(error);
        await browser.runtime.sendMessage({
          type: 'SYNC_ERROR',
          code: normalized.code,
          message: normalized.message,
        } satisfies WhoBackMessage);
        return { ok: false, reason: normalized.code };
      } finally {
        collecting = false;
      }
    };

    browser.runtime.onMessage.addListener((message: WhoBackMessage) => {
      if (message.type !== 'RUN_SYNC') return;
      return runSync();
    });

    await reportAccountFromSession();
    await reportAccountFromDom();

    const observer = new MutationObserver(() => {
      void reportAccountFromDom();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true });
  },
});

async function sendProgress(progress: RelationshipProgress) {
  const { phase, count, total, page } = progress;
  const base = phase === 'followers' ? 8 : 52;
  const span = 40;
  const ratio = total > 0 ? Math.min(1, count / total) : Math.min(0.9, page / 20);
  const percent = Math.min(94, Math.round(base + span * ratio));
  const totalLabel = total > 0 ? ` / ${total.toLocaleString()}` : '';

  await browser.runtime.sendMessage({
    type: 'SYNC_PROGRESS',
    phase,
    progress: percent,
    message: `${phase === 'followers' ? 'Followers' : 'Following'}: ${count.toLocaleString()}${totalLabel}`,
  } satisfies WhoBackMessage);
}

function normalizeSyncError(error: unknown): { code: SyncErrorCode; message: string } {
  if (error instanceof InstagramSyncError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Could not sync Instagram.',
  };
}
