import React, { useEffect, useState } from 'react';
import type {
  BuddySettings,
  TopSupportersConfig,
  SupporterCriteria,
  SupporterWindow,
  BuddyExitAnimation
} from '../../backend/types.ts';

interface SettingsShape {
  maxBuddiesOnScreen: number;
  buddies: BuddySettings;
  topSupporters: TopSupportersConfig;
}

const CRITERIA: Array<{ value: SupporterCriteria; label: string }> = [
  { value: 'tips', label: 'Tips / gifts (diamonds)' },
  { value: 'gifted_subs', label: 'Gifted subs / memberships' },
  { value: 'bits', label: 'Bits / cheers (like taps)' },
  { value: 'support_score', label: 'Cumulative support score (weighted)' }
];

const WINDOWS: Array<{ value: SupporterWindow; label: string }> = [
  { value: 'last_stream', label: 'Current / last stream' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'all_time', label: 'All time' }
];

const inputCls = 'bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 w-full';
const labelCls = 'text-slate-300 font-semibold block mb-1 text-xs';

export const OverlaySettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(d => setSettings(d.settings))
      .catch(() => setStatus('Failed to load settings'));
  }, []);

  if (!settings) return <div className="text-xs text-slate-400 p-4">{status || 'Loading settings...'}</div>;

  const ts = settings.topSupporters;
  const bd = settings.buddies;
  const setTs = (patch: Partial<TopSupportersConfig>) => setSettings({ ...settings, topSupporters: { ...ts, ...patch } });
  const setBd = (patch: Partial<BuddySettings>) => setSettings({ ...settings, buddies: { ...bd, ...patch } });

  const save = async () => {
    setStatus('Saving...');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxBuddiesOnScreen: settings.maxBuddiesOnScreen,
          buddies: settings.buddies,
          topSupporters: settings.topSupporters
        })
      });
      setStatus(res.ok ? 'Saved' : 'Save failed');
    } catch {
      setStatus('Save failed');
    }
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-100 text-sm">🏆 Top Stream Supporters box</h3>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={ts.enabled} onChange={e => setTs({ enabled: e.target.checked })} />
            {ts.enabled ? 'ON' : 'OFF'}
          </label>
        </div>
        <p className="text-slate-400">Shown only when ON and at least one viewer meets the criteria below.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Criteria</label>
            <select className={inputCls} value={ts.criteria} onChange={e => setTs({ criteria: e.target.value as SupporterCriteria })}>
              {CRITERIA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Time window</label>
            <select className={inputCls} value={ts.window} onChange={e => setTs({ window: e.target.value as SupporterWindow })}>
              {WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Minimum value to qualify</label>
            <input type="number" min={0} className={inputCls} value={ts.minValue} onChange={e => setTs({ minValue: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>Max entries shown</label>
            <input type="number" min={1} max={8} className={inputCls} value={ts.maxEntries} onChange={e => setTs({ maxEntries: Number(e.target.value) })} />
          </div>
        </div>
        {ts.criteria === 'support_score' && (
          <div className="grid grid-cols-4 gap-3">
            {(['tip', 'sub', 'bit', 'chat'] as const).map(k => (
              <div key={k}>
                <label className={labelCls}>{k} weight</label>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={ts.weights[k]}
                  onChange={e => setTs({ weights: { ...ts.weights, [k]: Number(e.target.value) } })}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <h3 className="font-bold text-slate-100 text-sm">🫧 Buddies (spawned only by IFTTT rules)</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Default lifetime (seconds)</label>
            <input
              type="number" min={2} max={60} className={inputCls}
              value={Math.round(bd.defaultLifetimeMs / 1000)}
              onChange={e => setBd({ defaultLifetimeMs: Math.max(2, Number(e.target.value)) * 1000 })}
            />
          </div>
          <div>
            <label className={labelCls}>Exit animation</label>
            <select className={inputCls} value={bd.defaultExitAnimation} onChange={e => setBd({ defaultExitAnimation: e.target.value as BuddyExitAnimation })}>
              <option value="fade">Fade out</option>
              <option value="slide">Slide off screen</option>
              <option value="shrink">Shrink away</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Max buddies on screen</label>
            <input
              type="number" min={1} max={20} className={inputCls}
              value={settings.maxBuddiesOnScreen}
              onChange={e => setSettings({ ...settings, maxBuddiesOnScreen: Math.max(1, Number(e.target.value)) })}
            />
          </div>
          <div>
            <label className={labelCls}>When all slots are full</label>
            <select className={inputCls} value={bd.overflowBehavior} onChange={e => setBd({ overflowBehavior: e.target.value as BuddySettings['overflowBehavior'] })}>
              <option value="queue">Queue until a slot opens</option>
              <option value="replace_oldest">Replace the oldest buddy</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} className="bg-cyan-500 text-slate-950 font-bold px-4 py-2 rounded-lg">Save settings</button>
        <span className="text-slate-400">{status}</span>
      </div>
    </div>
  );
};
