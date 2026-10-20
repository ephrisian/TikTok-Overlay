import React, { useEffect, useState } from 'react';
import type {
  BuddySettings,
  TopSupportersConfig,
  SupporterCriteria,
  SupporterWindow,
  BuddyExitAnimation,
  PachinkoPhysicsSettings
} from '../../backend/types.ts';

interface SettingsShape {
  pachinkoEnabled: boolean;
  pachinkoPhysics?: PachinkoPhysicsSettings;
  maxBuddiesOnScreen: number;
  buddies: BuddySettings;
  topSupporters: TopSupportersConfig;
}

const DEFAULT_PHYSICS: PachinkoPhysicsSettings = {
  gravity: 0.38,
  bounciness: 0.65,
  friction: 0.985,
  ballRadius: 18,
  stayDurationSeconds: 8,
  pegJitter: 0.15,
  fallSpeedCap: 15
};

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
  const [dropStatus, setDropStatus] = useState('');

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
  const pp = settings.pachinkoPhysics || DEFAULT_PHYSICS;
  const setPp = (patch: Partial<PachinkoPhysicsSettings>) => setSettings({
    ...settings,
    pachinkoPhysics: { ...pp, ...patch }
  });

  const dropTestBall = async () => {
    setDropStatus('Saving & dropping test ball...');
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pachinkoEnabled: true,
          pachinkoPhysics: settings.pachinkoPhysics || DEFAULT_PHYSICS,
          maxBuddiesOnScreen: settings.maxBuddiesOnScreen,
          buddies: settings.buddies,
          topSupporters: settings.topSupporters
        })
      });
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pachinko', username: 'PhysicsTester' })
      });
      const d = await res.json();
      if (d.success) {
        setDropStatus('🎯 Ball dropped! Watch overlay preview.');
      } else {
        setDropStatus('Drop failed');
      }
    } catch {
      setDropStatus('Drop failed');
    }
    setTimeout(() => setDropStatus(''), 4500);
  };

  const save = async () => {
    setStatus('Saving...');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pachinkoEnabled: settings.pachinkoEnabled,
          pachinkoPhysics: settings.pachinkoPhysics || DEFAULT_PHYSICS,
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

      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-100 text-sm">🎰 Pachinko Interactive Board & Real Physics</h3>
            <p className="text-slate-400 text-[11px]">Real 2D rigid-body peg collisions, true Galton bounces, and tunable fall dynamics.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={dropTestBall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs transition active:scale-95 shadow-md shadow-cyan-500/20"
            >
              <span>⚡ Drop Test Ball</span>
            </button>
            <label className="flex items-center gap-2 text-slate-300 font-bold">
              <input
                type="checkbox"
                checked={settings.pachinkoEnabled}
                onChange={e => setSettings({ ...settings, pachinkoEnabled: e.target.checked })}
              />
              {settings.pachinkoEnabled ? 'ENABLED' : 'DISABLED'}
            </label>
          </div>
        </div>

        {dropStatus && (
          <div className="p-2 rounded bg-cyan-950/60 border border-cyan-800 text-cyan-300 text-xs font-semibold">
            {dropStatus}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {/* Stay Duration */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300 font-semibold text-xs">Screen Display Duration (After Last Drop)</label>
              <span className="font-mono text-cyan-400 font-bold text-xs">
                {pp.stayDurationSeconds === 0 ? 'Always On' : `${pp.stayDurationSeconds}s`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={pp.stayDurationSeconds}
              onChange={e => setPp({ stayDurationSeconds: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">
              {pp.stayDurationSeconds === 0
                ? '0 = Permanently visible on stream (never hides).'
                : `Board automatically hides ${pp.stayDurationSeconds}s after the last active ball resolves.`}
            </p>
          </div>

          {/* Gravity */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300 font-semibold text-xs">Gravity (Downward Acceleration)</label>
              <span className="font-mono text-cyan-400 font-bold text-xs">{pp.gravity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.15}
              max={0.85}
              step={0.01}
              value={pp.gravity}
              onChange={e => setPp({ gravity: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">
              Low = floaty slow-motion fall; High = heavy, fast drop through pins.
            </p>
          </div>

          {/* Bounciness */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300 font-semibold text-xs">Bounciness (Peg Restitution)</label>
              <span className="font-mono text-cyan-400 font-bold text-xs">{pp.bounciness.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.20}
              max={0.95}
              step={0.01}
              value={pp.bounciness}
              onChange={e => setPp({ bounciness: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">
              Elastic bounce coefficient on peg contact (0.2 = deadened, 0.9 = high rebounds).
            </p>
          </div>

          {/* Air Drag / Lateral Friction */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300 font-semibold text-xs">Air Drag / Lateral Friction</label>
              <span className="font-mono text-cyan-400 font-bold text-xs">{pp.friction.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min={0.940}
              max={0.999}
              step={0.001}
              value={pp.friction}
              onChange={e => setPp({ friction: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">
              Velocity damping per frame (controls lateral glide and organic deceleration).
            </p>
          </div>

          {/* Ball Radius */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300 font-semibold text-xs">Ball Radius (Size)</label>
              <span className="font-mono text-cyan-400 font-bold text-xs">{pp.ballRadius}px</span>
            </div>
            <input
              type="range"
              min={12}
              max={26}
              step={1}
              value={pp.ballRadius}
              onChange={e => setPp({ ballRadius: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">
              Physical rigid-body collision and visual radius of each falling ball.
            </p>
          </div>

          {/* Peg Jitter / Pin Chaos */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300 font-semibold text-xs">Peg Jitter (Surface Variation)</label>
              <span className="font-mono text-cyan-400 font-bold text-xs">{(pp.pegJitter ?? 0.15).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.00}
              max={0.40}
              step={0.01}
              value={pp.pegJitter ?? 0.15}
              onChange={e => setPp({ pegJitter: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">
              Micro-surface irregularity for organic, non-deterministic Galton bounces.
            </p>
          </div>

          {/* Terminal Velocity / Speed Cap */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300 font-semibold text-xs">Terminal Velocity (Speed Cap)</label>
              <span className="font-mono text-cyan-400 font-bold text-xs">{pp.fallSpeedCap ?? 15} px/frame</span>
            </div>
            <input
              type="range"
              min={8}
              max={22}
              step={1}
              value={pp.fallSpeedCap ?? 15}
              onChange={e => setPp({ fallSpeedCap: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">
              Maximum physical speed to ensure zero tunneling through pins.
            </p>
          </div>

          {/* Reset Physics Action */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-slate-300 font-semibold text-xs mb-0.5">Restore Physics Presets</div>
              <p className="text-[10px] text-slate-500">Reset all sliders to balanced arcade defaults (8s hold, 0.38 gravity, 0.65 bounce).</p>
            </div>
            <button
              type="button"
              onClick={() => setPp(DEFAULT_PHYSICS)}
              className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold transition"
            >
              Reset to Arcade Defaults
            </button>
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
