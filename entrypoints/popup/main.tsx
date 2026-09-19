import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import '../../src/styles.css';
import { analyzeSnapshot, diffSnapshots } from '../../src/domain/relationship';
import type { WhoBackMessage } from '../../src/lib/messages';
import { ArrowIcon, RefreshIcon, SettingsIcon } from '../../src/ui/icons';
import { Avatar } from '../../src/ui/Avatar';
import { Logo } from '../../src/ui/Logo';
import { MetricCard } from '../../src/ui/MetricCard';
import { useExtensionState } from '../../src/ui/use-state';

function Popup() {
  const { state, loaded } = useExtensionState();
  const latest = state.snapshots.at(-1);
  const previous = state.snapshots.at(-2);
  const analysis = latest ? analyzeSnapshot(latest) : null;
  const changes = latest ? diffSnapshots(previous, latest) : null;
  const busy = ['starting', 'followers', 'following', 'processing'].includes(state.sync.phase);

  const openSidePanel = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && browser.sidePanel?.open) await browser.sidePanel.open({ tabId: tab.id });
  };

  const startSync = () => browser.runtime.sendMessage({ type: 'START_SYNC' } satisfies WhoBackMessage);

  return <main className="w-[360px] bg-canvas p-3 text-ink">
    <section className="surface overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <Logo />
        <button aria-label="Settings" className="focus-ring rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink" onClick={() => browser.runtime.openOptionsPage()}><SettingsIcon className="size-4.5" /></button>
      </header>

      {!loaded ? <div className="p-5 text-sm text-muted">Loading…</div> : !state.account ? (
        <div className="p-5">
          <div className="rounded-xl bg-brand-soft p-4">
            <p className="text-sm font-semibold">Open Instagram to connect</p>
            <p className="mt-1 text-xs leading-5 text-muted">WhoBack detects the account already signed in to instagram.com. Your password never enters this extension.</p>
          </div>
          <button className="focus-ring mt-4 w-full rounded-xl bg-[#17143f] px-4 py-3 text-sm font-semibold text-white" onClick={() => browser.tabs.create({ url: 'https://www.instagram.com/' })}>Open Instagram</button>
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Avatar username={state.account.username} src={state.account.avatarUrl} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">@{state.account.username}</div><div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted"><span className="size-1.5 rounded-full bg-emerald-500"/>Connected</div></div>
            <button aria-label="Sync now" disabled={busy} className="focus-ring rounded-lg border border-line p-2 text-muted hover:bg-canvas disabled:opacity-40" onClick={startSync}><RefreshIcon className={`size-4 ${busy ? 'animate-spin' : ''}`} /></button>
          </div>

          {busy && <div className="mt-4 rounded-xl bg-brand-soft p-3">
            <div className="flex items-center justify-between text-xs"><span className="font-medium text-brand">{state.sync.message ?? 'Syncing…'}</span><span className="tabular-nums text-muted">{state.sync.progress}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${state.sync.progress}%` }} /></div>
          </div>}

          {state.sync.phase === 'error' && <div className="mt-4 rounded-xl bg-danger-soft p-3 text-xs leading-5 text-danger">{state.sync.message}</div>}

          {analysis ? <>
            <div className="mt-4 grid grid-cols-2 gap-2"><MetricCard value={analysis.followersCount} label="Followers"/><MetricCard value={analysis.followingCount} label="Following"/><MetricCard value={analysis.mutual.length} label="Mutual" tone="positive"/><MetricCard value={analysis.notFollowingBack.length} label="Don't follow you back" tone="danger"/><MetricCard value={analysis.youDontFollowBack.length} label="You don't follow back" tone="warn"/></div>
            {changes && previous && <div className="mt-3 flex gap-2 text-[11px]"><span className="rounded-full bg-positive-soft px-2 py-1 font-medium text-positive">+{changes.newFollowers.length} new</span><span className="rounded-full bg-danger-soft px-2 py-1 font-medium text-danger">−{changes.unfollowers.length} unfollowed</span></div>}
            <button className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#17143f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#211d55]" onClick={openSidePanel}>View details <ArrowIcon className="size-4" /></button>
          </> : !busy && <div className="mt-4 rounded-xl border border-dashed border-line p-4 text-center"><p className="text-sm font-medium">Ready for your first check</p><p className="mt-1 text-xs leading-5 text-muted">WhoBack will scan followers and following in a background Instagram tab.</p><button className="focus-ring mt-3 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white" onClick={startSync}>Check now</button></div>}

          {latest && <p className="mt-3 text-center text-[10px] text-muted">Last checked {new Date(latest.capturedAt).toLocaleString()}</p>}
        </div>
      )}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup /></React.StrictMode>);
