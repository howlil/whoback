import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import '../../src/styles.css';
import { analyzeSnapshot, diffSnapshots } from '../../src/domain/relationship';
import type { RelationshipView } from '../../src/domain/types';
import { Avatar } from '../../src/ui/Avatar';
import { Logo } from '../../src/ui/Logo';
import { ExternalIcon, RefreshIcon, SearchIcon, SettingsIcon } from '../../src/ui/icons';
import { useExtensionState } from '../../src/ui/use-state';
import { isSyncBusyPhase } from '../../src/lib/state';

const views: { id: RelationshipView; label: string }[] = [
  { id: 'not-back', label: "Don't follow back" },
  { id: 'fans', label: "You don't follow" },
  { id: 'mutual', label: 'Mutual' },
];

function SidePanel() {
  const { state } = useExtensionState();
  const [view, setView] = useState<RelationshipView>('not-back');
  const [query, setQuery] = useState('');
  const latest = state.snapshots.at(-1);
  const previous = state.snapshots.at(-2);
  const analysis = latest ? analyzeSnapshot(latest) : null;
  const changes = latest ? diffSnapshots(previous, latest) : null;
  const busy = isSyncBusyPhase(state.sync.phase);

  const rows = useMemo(() => {
    if (!analysis) return [];
    const source = view === 'not-back' ? analysis.notFollowingBack : view === 'fans' ? (analysis.followersComplete ? analysis.youDontFollowBack : []) : analysis.mutual;
    const q = query.trim().toLowerCase();
    return q ? source.filter((username) => username.includes(q)) : source;
  }, [analysis, query, view]);

  return <main className="min-h-screen bg-canvas text-ink">
    <header className="sticky top-0 z-10 border-b border-line bg-white/95 px-4 py-3 backdrop-blur"><div className="flex items-center justify-between"><Logo/><div className="flex gap-1"><button className="focus-ring rounded-lg p-2 text-muted hover:bg-canvas" disabled={busy} onClick={() => browser.runtime.sendMessage({ type: 'START_SYNC' })}><RefreshIcon className={`size-4 ${busy ? 'animate-spin' : ''}`}/></button><button className="focus-ring rounded-lg p-2 text-muted hover:bg-canvas" onClick={() => browser.runtime.openOptionsPage()}><SettingsIcon className="size-4"/></button></div></div>
      {state.account && <div className="mt-4 flex items-center gap-3"><Avatar username={state.account.username} src={state.account.avatarUrl}/><div><div className="text-sm font-semibold">@{state.account.username}</div><div className="text-[11px] text-muted">{busy ? state.sync.message : latest ? `Updated ${new Date(latest.capturedAt).toLocaleString()}` : 'Connected'}</div></div></div>}
    </header>

    {!analysis ? <div className="p-5"><div className="rounded-2xl border border-dashed border-line bg-white p-5 text-center"><p className="text-sm font-semibold">No relationship snapshot yet</p><p className="mt-1 text-xs leading-5 text-muted">Open Instagram and run the first sync from the WhoBack popup.</p></div></div> : <>
      {changes && previous && changes.followersComplete && <section className="grid grid-cols-2 gap-2 p-4 pb-0"><div className="rounded-xl bg-positive-soft p-3"><div className="text-lg font-semibold text-positive">+{changes.newFollowers.length}</div><div className="text-[11px] text-positive/80">New followers</div></div><div className="rounded-xl bg-danger-soft p-3"><div className="text-lg font-semibold text-danger">−{changes.unfollowers.length}</div><div className="text-[11px] text-danger/80">Unfollowed you</div></div></section>}

      <nav className="mt-4 flex border-b border-line bg-white px-2">{views.map((item) => { const unavailable = item.id === 'fans' && !analysis.followersComplete; return <button key={item.id} disabled={unavailable} onClick={() => setView(item.id)} className={`focus-ring flex-1 border-b-2 px-2 py-3 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${view === item.id ? 'border-brand text-brand' : 'border-transparent text-muted'}`}>{item.label}<span className="ml-1 opacity-60">({item.id === 'not-back' ? analysis.notFollowingBack.length : item.id === 'fans' ? (analysis.followersComplete ? analysis.youDontFollowBack.length : '—') : analysis.mutual.length})</span></button>; })}</nav>

      {!analysis.followersComplete && <div className="mx-3 mt-3 rounded-xl bg-brand-soft p-3 text-xs leading-5 text-brand">Fast scan skipped the full follower list because checking the people you follow required fewer Instagram requests. “You don’t follow” and follower-history changes require a full follower scan.</div>}<section className="p-3">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5"><SearchIcon className="size-4 text-muted"/><input className="w-full bg-transparent text-sm outline-none placeholder:text-muted" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search username…"/></label>
        <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white">{rows.length === 0 ? <div className="p-5 text-center text-xs text-muted">No accounts found.</div> : rows.map((username) => <div key={username} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0"><Avatar username={username} size="sm"/><div className="min-w-0 flex-1 truncate text-sm font-medium">@{username}</div><button className="focus-ring flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold hover:bg-canvas" onClick={() => browser.tabs.create({ url: `https://www.instagram.com/${encodeURIComponent(username)}/` })}>Profile <ExternalIcon className="size-3"/></button></div>)}</div>
      </section>
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><SidePanel/></React.StrictMode>);
