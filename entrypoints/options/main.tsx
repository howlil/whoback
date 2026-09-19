import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import '../../src/styles.css';
import { DEFAULT_STATE, setState } from '../../src/lib/state';
import { Logo } from '../../src/ui/Logo';
import { useExtensionState } from '../../src/ui/use-state';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`focus-ring relative h-6 w-11 rounded-full transition ${checked ? 'bg-brand' : 'bg-[#d8dae3]'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}/></button>;
}

function Options() {
  const { state, refresh } = useExtensionState();
  const updateSettings = async (patch: Partial<typeof state.settings>) => { await setState({ ...state, settings: { ...state.settings, ...patch } }); await refresh(); };
  const clearData = async () => { await browser.storage.local.clear(); await setState({ ...DEFAULT_STATE, settings: state.settings }); await browser.action.setBadgeText({ text: '' }); await refresh(); };

  return <main className="min-h-screen bg-canvas px-5 py-8 text-ink"><div className="mx-auto max-w-2xl"><Logo/><div className="mt-8"><h1 className="text-2xl font-semibold tracking-[-0.03em]">Settings</h1><p className="mt-1 text-sm text-muted">Control syncing and local data. WhoBack does not need your Instagram password.</p></div>
    <section className="surface mt-6 overflow-hidden rounded-2xl"><div className="border-b border-line px-5 py-4"><h2 className="text-sm font-semibold">Sync</h2></div><div className="divide-y divide-line">
      <div className="flex items-center justify-between gap-6 px-5 py-4"><div><div className="text-sm font-medium">Auto-sync</div><div className="mt-0.5 text-xs text-muted">Check automatically when your snapshot is stale.</div></div><Toggle checked={state.settings.autoSync} onChange={(autoSync) => updateSettings({ autoSync })}/></div>
      <div className="flex items-center justify-between gap-6 px-5 py-4"><div><div className="text-sm font-medium">Sync interval</div><div className="mt-0.5 text-xs text-muted">How often WhoBack should refresh.</div></div><select className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-sm" value={state.settings.syncIntervalHours} onChange={(e) => updateSettings({ syncIntervalHours: Number(e.target.value) as 24 | 48 | 168 })}><option value={24}>Once a day</option><option value={48}>Every 2 days</option><option value={168}>Once a week</option></select></div>
    </div></section>
    <section className="surface mt-4 overflow-hidden rounded-2xl"><div className="border-b border-line px-5 py-4"><h2 className="text-sm font-semibold">Display</h2></div><div className="flex items-center justify-between gap-6 px-5 py-4"><div><div className="text-sm font-medium">Extension badge</div><div className="mt-0.5 text-xs text-muted">Show how many follower changes were detected.</div></div><Toggle checked={state.settings.showBadge} onChange={(showBadge) => updateSettings({ showBadge })}/></div></section>
    <section className="surface mt-4 overflow-hidden rounded-2xl"><div className="border-b border-line px-5 py-4"><h2 className="text-sm font-semibold">Data</h2></div><div className="flex items-center justify-between gap-6 px-5 py-4"><div><div className="text-sm font-medium">Clear stored data</div><div className="mt-0.5 text-xs text-muted">Remove account detection and all relationship snapshots from this browser.</div></div><button className="focus-ring rounded-lg border border-danger/30 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger-soft" onClick={clearData}>Clear</button></div></section>
  </div></main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Options/></React.StrictMode>);
