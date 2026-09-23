import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import '../../src/styles.css';
import { analyzeSnapshot, diffSnapshots } from '../../src/domain/relationship';
import type { InstagramAccount } from '../../src/domain/types';
import type { AccountProbeMessage, WhoBackMessage } from '../../src/lib/messages';
import { isSyncBusyPhase } from '../../src/lib/state';
import { ArrowIcon, RefreshIcon, SettingsIcon } from '../../src/ui/icons';
import { Avatar } from '../../src/ui/Avatar';
import { Logo } from '../../src/ui/Logo';
import { MetricCard } from '../../src/ui/MetricCard';
import { useExtensionState } from '../../src/ui/use-state';

async function probeOpenInstagramTabs(): Promise<boolean> {
  const tabs = await browser.tabs.query({ url: ['https://www.instagram.com/*'] });
  const ordered = [...tabs].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));

  for (const tab of ordered) {
    if (!tab.id) continue;

    try {
      const result = await browser.tabs.sendMessage(
        tab.id,
        { type: 'REQUEST_ACCOUNT' } satisfies AccountProbeMessage,
      ) as InstagramAccount | null | undefined;
      if (!result?.username) continue;

      await browser.runtime.sendMessage({
        type: 'ACCOUNT_DETECTED',
        account: result,
      } satisfies WhoBackMessage);
      return true;
    } catch {
      // Try another Instagram tab. The current tab may be navigating or restricted.
    }
  }

  return false;
}

function Popup() {
  const { state, loaded } = useExtensionState();
  const [probing, setProbing] = useState(false);
  const probedOnce = useRef(false);
  const latest = state.snapshots.at(-1);
  const previous = state.snapshots.at(-2);
  const analysis = latest ? analyzeSnapshot(latest) : null;
  const changes = latest ? diffSnapshots(previous, latest) : null;
  const checkpoint = state.scanCheckpoint;
  const resumable = Boolean(checkpoint);
  const paused = state.sync.phase === 'paused';
  const busy = isSyncBusyPhase(state.sync.phase);
  const cooldownActive = Boolean(state.sync.cooldownUntil && state.sync.cooldownUntil > Date.now());
  const cooldownMinutes = cooldownActive
    ? Math.max(1, Math.ceil(((state.sync.cooldownUntil ?? 0) - Date.now()) / 60_000))
    : 0;
  const metricCards = analysis ? [
    { value: analysis.followersCount, label: 'Followers', tone: 'neutral' as const },
    { value: analysis.followingCount, label: 'Following', tone: 'neutral' as const },
    { value: analysis.mutual.length, label: 'Mutual', tone: 'positive' as const },
    { value: analysis.notFollowingBack.length, label: "Don't follow you back", tone: 'danger' as const },
    { value: analysis.youDontFollowBack.length, label: "You don't follow back", tone: 'warn' as const },
  ] : [];

  const detectAccount = async () => {
    setProbing(true);
    try {
      await probeOpenInstagramTabs();
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    if (!loaded || state.account || probedOnce.current) return;
    probedOnce.current = true;
    void detectAccount();
  }, [loaded, state.account]);

  const openSidePanel = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && browser.sidePanel?.open) await browser.sidePanel.open({ tabId: tab.id });
  };

  const startSync = () => browser.runtime.sendMessage({ type: 'START_SYNC' } satisfies WhoBackMessage);
  const restartSync = () => browser.runtime.sendMessage({ type: 'RESTART_SYNC' } satisfies WhoBackMessage);

  return <main className="w-[360px] bg-canvas p-3 text-ink">
    <section className="surface overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <Logo />
        <button aria-label="Settings" className="focus-ring rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink" onClick={() => browser.runtime.openOptionsPage()}><SettingsIcon className="size-4.5" /></button>
      </header>

      {!loaded ? <div className="p-5 text-sm text-muted">Loading…</div> : !state.account ? (
        <div className="p-5">
          <div className="rounded-xl bg-brand-soft p-4">
            <p className="text-sm font-semibold">{probing ? 'Detecting Instagram session…' : 'Instagram account not detected'}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {probing
                ? 'Checking the Instagram tabs already open in this browser.'
                : 'Keep instagram.com open while signed in. WhoBack never reads your Instagram password.'}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              disabled={probing}
              className="focus-ring rounded-xl border border-line bg-white px-3 py-3 text-sm font-semibold disabled:opacity-50"
              onClick={detectAccount}
            >
              Retry
            </button>
            <button
              className="focus-ring rounded-xl bg-cta px-3 py-3 text-sm font-semibold text-white"
              onClick={() => browser.tabs.create({ url: 'https://www.instagram.com/' })}
            >
              Open Instagram
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Avatar username={state.account.username} src={state.account.avatarUrl} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">@{state.account.username}</div><div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted"><span className={`size-1.5 rounded-full ${paused ? 'bg-amber-500' : 'bg-emerald-500'}`}/>{paused ? 'Scan paused' : 'Connected'}</div></div>
            <button aria-label={resumable ? 'Resume scan' : 'Sync now'} disabled={busy || cooldownActive} className="focus-ring rounded-lg border border-line p-2 text-muted hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40" onClick={startSync}><RefreshIcon className={`size-4 ${busy ? 'animate-spin' : ''}`} /></button>
          </div>

          {busy && <div className="mt-4 rounded-xl bg-brand-soft p-3" role="status" aria-live="polite" aria-atomic="true">
            <div className="flex items-center justify-between text-xs"><span className="font-medium text-brand">{state.sync.message ?? 'Syncing…'}</span><span className="tabular-nums text-muted">{state.sync.progress}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.sync.progress}>
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${state.sync.progress}%` }} />
            </div>
          </div>}

          {paused && <div className="mt-4 rounded-xl bg-warn-soft p-3 text-xs leading-5 text-warn">
            <div className="font-semibold">Scan paused — your progress is safe.</div>
            <div className="mt-1">{state.sync.message}</div>
            {checkpoint && <div className="mt-1 opacity-80">Saved: {checkpoint.following.users.length.toLocaleString()} following · {checkpoint.followers.users.length.toLocaleString()} followers.</div>}
            {latest && <div className="mt-1 opacity-80">Your last successful results are still available below.</div>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="focus-ring rounded-lg bg-cta px-3 py-2 font-semibold text-white" onClick={startSync}>Resume scan</button>
              <button className="focus-ring rounded-lg border border-current/20 bg-white/60 px-3 py-2 font-semibold" onClick={restartSync}>Start over</button>
            </div>
          </div>}

          {state.sync.phase === 'error' && <div className="mt-4 rounded-xl bg-danger-soft p-3 text-xs leading-5 text-danger">
            <div className="font-semibold">Scan needs attention.</div>
            <div className="mt-1">{state.sync.message}</div>
            {checkpoint && <div className="mt-1 text-danger/80">Saved: {checkpoint.following.users.length.toLocaleString()} following · {checkpoint.followers.users.length.toLocaleString()} followers.</div>}
            {cooldownActive && <div className="mt-1 font-semibold">Resume available in ~{cooldownMinutes} min.</div>}
            {checkpoint && !cooldownActive && <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="focus-ring rounded-lg bg-cta px-3 py-2 font-semibold text-white" onClick={startSync}>Resume scan</button>
              <button className="focus-ring rounded-lg border border-danger/20 bg-white/60 px-3 py-2 font-semibold" onClick={restartSync}>Start over</button>
            </div>}
          </div>}

          {checkpoint && !busy && state.sync.phase !== 'error' && state.sync.phase !== 'paused' && <div className="mt-4 rounded-xl bg-brand-soft p-3 text-xs leading-5 text-brand">
            Saved scan progress: {checkpoint.following.users.length.toLocaleString()} following · {checkpoint.followers.users.length.toLocaleString()} followers.
          </div>}

          {analysis ? <>
            <div className="mt-4 grid grid-cols-2 gap-2">{metricCards.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
            {changes && previous && changes.followersComplete && <div className="mt-3 flex gap-2 text-[11px]"><span className="rounded-full bg-positive-soft px-2 py-1 font-medium text-positive">+{changes.newFollowers.length} new</span><span className="rounded-full bg-danger-soft px-2 py-1 font-medium text-danger">−{changes.unfollowers.length} unfollowed</span></div>}
            <button className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cta px-4 py-3 text-sm font-semibold text-white hover:bg-cta-hover" onClick={openSidePanel}>View details <ArrowIcon className="size-4" /></button>
          </> : !busy && !paused && state.sync.phase !== 'error' && <div className="mt-4 rounded-xl border border-dashed border-line p-4 text-center"><p className="text-sm font-medium">Ready for your first check</p><p className="mt-1 text-xs leading-5 text-muted">WhoBack reads followers and following through your existing Instagram session.</p><button disabled={cooldownActive} className="focus-ring mt-3 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" onClick={startSync}>{cooldownActive ? `Resume in ~${cooldownMinutes} min` : resumable ? 'Resume scan' : 'Check now'}</button></div>}

          {latest && <p className="mt-3 text-center text-[10px] text-muted">Last successful check {new Date(latest.capturedAt).toLocaleString()}</p>}
        </div>
      )}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup /></React.StrictMode>);
