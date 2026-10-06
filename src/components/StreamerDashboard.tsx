import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Radio, 
  Flame, 
  Sparkles, 
  Users, 
  Sliders, 
  Award, 
  Copy, 
  ExternalLink, 
  Volume2, 
  VolumeX, 
  Grid3X3, 
  Zap, 
  MessageSquare, 
  Heart, 
  Gift as GiftIcon, 
  UserPlus, 
  ShieldAlert, 
  Check, 
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  BarChart3,
  Key,
  CheckCircle2,
  LogIn,
  LogOut,
  Search
} from 'lucide-react';
import { FabricOverlay } from '../overlay/FabricOverlay.tsx';
import { LiveStreamStatsPanel } from './LiveStreamStatsPanel.tsx';
import { 
  AspectRatio, 
  BossFightState, 
  ConnectorState, 
  IFTTTRule, 
  TikTokUser,
  BuddyType
} from '../../backend/types.ts';
import { soundFX } from '../audio/soundFX.ts';

export const StreamerDashboard: React.FC = () => {
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [showGuides, setShowGuides] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'simulator' | 'boss' | 'crm' | 'rules' | 'stats'>('simulator');
  const [copiedLink, setCopiedLink] = useState(false);

  // Live state from backend
  const [connector, setConnector] = useState<ConnectorState>({
    status: 'disconnected',
    username: 'babyboss.theshadow',
    viewerCount: 24,
    lastEventAt: Date.now()
  });
  const [usernameInput, setUsernameInput] = useState('babyboss.theshadow');
  const usernameInitializedRef = useRef(false);
  const isUserTypingRef = useRef(false);
  const [isAutoSimActive, setIsAutoSimActive] = useState(false);
  const [users, setUsers] = useState<TikTokUser[]>([]);
  const [triggers, setTriggers] = useState<IFTTTRule[]>([]);
  const [bossState, setBossState] = useState<BossFightState | null>(null);
  const [streamStats, setStreamStats] = useState({
    title: '🔥 Interactive TikTok Live Stream',
    viewers: 24,
    likes: 1250,
    gifts: 18,
    chats: 92
  });

  // Simulator Inputs
  const [simChatText, setSimChatText] = useState('Loving this overlay! Let’s crush the boss!');
  const [simChatUser, setSimChatUser] = useState('');
  const [simSelectedGift, setSimSelectedGift] = useState('Galaxy 🌌');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [customSessionId, setCustomSessionId] = useState('');

  // TikTok Session ID & Cookie Authentication State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [cookieScanStatus, setCookieScanStatus] = useState<string | null>(null);
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [maskedSession, setMaskedSession] = useState<string | null>(null);
  const [rawCookieInput, setRawCookieInput] = useState('');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Extract clean sessionid from any cookie string, key-value pair, or header
  const extractSessionId = (input: string): string => {
    if (!input) return '';
    const trimmed = input.trim();
    const match = trimmed.match(/(?:^|;\s*|\b)sessionid=([^;\s]+)/i);
    if (match) return match[1];
    return trimmed.replace(/^sessionid\s*[:=]\s*/i, '').replace(/^[;"']+|[;"']+$/g, '');
  };

  // Check stored session from backend & localStorage
  const checkStoredSession = async () => {
    try {
      const local = localStorage.getItem('tiktok_session_id');
      if (local && !customSessionId) {
        setCustomSessionId(local);
      }
      const res = await fetch('/api/connector/session');
      if (res.ok) {
        const data = await res.json();
        setHasStoredSession(data.hasSession);
        setMaskedSession(data.maskedSessionId);
      }
    } catch (_) {}
  };

  // Scan browser cookies and local storage
  const scanBrowserCookies = (): string | null => {
    try {
      // 1. Check document.cookie
      const docMatch = document.cookie.match(/(?:^|;\s*)(?:sessionid|session_id|sessionId|tt_session)\s*=\s*([^;]+)/i);
      if (docMatch && docMatch[1]) {
        const found = decodeURIComponent(docMatch[1]);
        setCustomSessionId(found);
        localStorage.setItem('tiktok_session_id', found);
        setCookieScanStatus('✅ Found sessionid in browser cookies! Session updated.');
        saveSessionToBackend(found);
        return found;
      }

      // 2. Check localStorage
      const local = localStorage.getItem('tiktok_session_id');
      if (local) {
        setCustomSessionId(local);
        setCookieScanStatus('✅ Found sessionid in local storage! Session updated.');
        saveSessionToBackend(local);
        return local;
      }
    } catch (_) {}

    setCookieScanStatus('ℹ️ No sessionid cookie found directly on this origin. Follow the 1-click guide below to import it from tiktok.com!');
    return null;
  };

  // Save session to backend & localStorage
  const saveSessionToBackend = async (sid: string) => {
    const clean = extractSessionId(sid);
    if (!clean) return;
    try {
      localStorage.setItem('tiktok_session_id', clean);
      setCustomSessionId(clean);
      const res = await fetch('/api/connector/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: clean })
      });
      if (res.ok) {
        const data = await res.json();
        setHasStoredSession(data.hasSession);
        setMaskedSession(data.maskedSessionId);
        setCookieScanStatus('✅ Session saved! You are now authenticated as yourself.');
      }
    } catch (_) {}
  };

  const clearSession = async () => {
    try {
      localStorage.removeItem('tiktok_session_id');
      setCustomSessionId('');
      setRawCookieInput('');
      await fetch('/api/connector/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: '' })
      });
      setHasStoredSession(false);
      setMaskedSession(null);
      setCookieScanStatus('Session cleared.');
    } catch (_) {}
  };

  // Rule Builder modal/form state
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleEventType, setNewRuleEventType] = useState('like_burst');
  const [newRuleCountThreshold, setNewRuleCountThreshold] = useState('50');
  const [newRuleJoinCondition, setNewRuleJoinCondition] = useState<'first_time' | 'returning_stream' | 'any'>('first_time');
  const [newRuleActionType, setNewRuleActionType] = useState('show_group');
  const [newRuleBannerTitle, setNewRuleBannerTitle] = useState('HYPE ALERT');
  const [newRuleBannerText, setNewRuleBannerText] = useState('{{user.username}} joined the hype train!');
  const [newRuleTweenType, setNewRuleTweenType] = useState<'bounce' | 'grow' | 'shake' | 'emote_popup'>('bounce');
  const [newRuleBuddyType, setNewRuleBuddyType] = useState<BuddyType>('circle');

  // Wipe Data confirmation modal state
  const [showWipeConfirmModal, setShowWipeConfirmModal] = useState(false);
  const [wipeResetRules, setWipeResetRules] = useState(false);

  // Fetch initial state
  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTriggers(data.triggers || []);
        if (data.bossState) setBossState(data.bossState);
        if (data.connectorState) {
          setConnector(data.connectorState);
          // Only initialize username from server on initial load so background polling NEVER wipes out user input!
          if (!usernameInitializedRef.current) {
            const serverUsername = data.settings?.streamerTiktokUsername || data.connectorState.username || 'babyboss.theshadow';
            setUsernameInput(serverUsername);
            usernameInitializedRef.current = true;
          }
        }
        setIsAutoSimActive(!!data.isAutoSimActive);
        if (data.currentStream) {
          setStreamStats({
            title: data.currentStream.title || 'TikTok Live Stream',
            viewers: data.currentStream.total_viewers || 0,
            likes: data.currentStream.total_likes || 0,
            gifts: data.currentStream.total_gifts || 0,
            chats: data.currentStream.total_chats || 0
          });
        }
      }
    } catch (e) {
      console.error('[Dashboard] Error fetching state:', e);
    }
  };

  useEffect(() => {
    fetchState();
    checkStoredSession();
    const interval = setInterval(fetchState, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/connector/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: usernameInput,
          sessionId: customSessionId.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.status) setConnector(data.status);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDisconnect = async () => {
    try {
      const res = await fetch('/api/connector/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.status) setConnector(data.status);
    } catch (e) {
      console.error(e);
    }
  };

  const runSimulation = async (action: string, payload: any = {}) => {
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
      const data = await res.json();
      if (action === 'toggle_auto') {
        setIsAutoSimActive(data.autoActive);
      }
      fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBossAction = async (endpoint: string, payload: any = {}) => {
    try {
      const res = await fetch(`/api/boss/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.bossState) setBossState(data.bossState);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleRule = async (id: string, currentEnabled: boolean) => {
    try {
      await fetch(`/api/triggers/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenNewRule = () => {
    setEditingRuleId(null);
    setNewRuleName('');
    setNewRuleEventType('like_burst');
    setNewRuleCountThreshold('50');
    setNewRuleJoinCondition('first_time');
    setNewRuleActionType('show_group');
    setNewRuleBannerTitle('HYPE STORM');
    setNewRuleBannerText('{{user.username}} sent mega hype!');
    setNewRuleTweenType('bounce');
    setNewRuleBuddyType('circle');
    setShowNewRuleModal(true);
  };

  const handleEditRule = (rule: IFTTTRule) => {
    setEditingRuleId(rule.id);
    setNewRuleName(rule.name);

    // Parse event type from condition
    const condList = rule.condition.all || rule.condition.any || [];
    const eventCond = condList.find(c => c.field === 'event.type');
    const evtType = eventCond ? String(eventCond.value) : 'like_burst';
    setNewRuleEventType(evtType);

    // Parse count threshold if like_burst
    const countCond = condList.find(c => c.field === 'event.count');
    if (countCond) {
      setNewRuleCountThreshold(String(countCond.value));
    } else {
      setNewRuleCountThreshold('50');
    }

    // Parse join condition
    const firstTimeCond = condList.find(c => c.field === 'user.firstTime');
    const breakCond = condList.find(c => c.field === 'user.returningFromBreak');
    if (breakCond) {
      setNewRuleJoinCondition('returning_stream');
    } else if (firstTimeCond && firstTimeCond.value === true) {
      setNewRuleJoinCondition('first_time');
    } else {
      setNewRuleJoinCondition('any');
    }

    // Parse action
    const mainAction = rule.actions[0] || { type: 'show_group' };
    setNewRuleActionType(mainAction.type);
    if (mainAction.textOverrides) {
      setNewRuleBannerTitle(mainAction.textOverrides.title || rule.name.toUpperCase());
      setNewRuleBannerText(mainAction.textOverrides.username || '');
    } else {
      setNewRuleBannerTitle(rule.name.toUpperCase());
      setNewRuleBannerText('');
    }

    const tweenAction = rule.actions.find(a => a.type === 'tween_buddy');
    setNewRuleTweenType(tweenAction?.tweenType || mainAction.tweenType || 'bounce');

    const buddyAction = rule.actions.find(a => a.type === 'spawn_buddy');
    setNewRuleBuddyType(buddyAction?.buddyType || 'circle');

    setShowNewRuleModal(true);
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this trigger rule?')) return;
    try {
      await fetch(`/api/triggers/${id}`, { method: 'DELETE' });
      fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const saveCustomRule = async () => {
    if (!newRuleName.trim()) return;

    // Build conditions based on selected event type
    const conditions: any[] = [{ field: 'event.type', op: 'equals', value: newRuleEventType }];

    if (newRuleEventType === 'like_burst') {
      conditions.push({
        field: 'event.count',
        op: 'greater_or_equal',
        value: Number(newRuleCountThreshold) || 50
      });
    } else if (newRuleEventType === 'join') {
      if (newRuleJoinCondition === 'first_time') {
        conditions.push({ field: 'user.firstTime', op: 'equals', value: true });
      } else if (newRuleJoinCondition === 'returning_stream') {
        conditions.push({ field: 'user.firstTime', op: 'equals', value: false });
        conditions.push({ field: 'user.firstTimeThisStream', op: 'equals', value: true });
      }
    }

    // Build actions based on action type
    const actions: any[] = [];
    if (newRuleActionType === 'show_group') {
      actions.push({
        type: 'show_group',
        durationMs: 5000,
        textOverrides: {
          title: newRuleBannerTitle || newRuleName.toUpperCase(),
          username: newRuleBannerText
        }
      });
      actions.push({
        type: 'tween_buddy',
        tweenType: newRuleTweenType
      });
    } else if (newRuleActionType === 'trigger_pachinko') {
      actions.push({
        type: 'trigger_pachinko',
        durationMs: 4000
      });
      actions.push({
        type: 'spawn_buddy',
        buddyType: newRuleBuddyType,
        entryAnimation: 'drop_from_top'
      });
    } else if (newRuleActionType === 'spawn_buddy') {
      actions.push({
        type: 'spawn_buddy',
        buddyType: newRuleBuddyType,
        entryAnimation: 'zoom_in'
      });
    } else if (newRuleActionType === 'tween_buddy') {
      actions.push({
        type: 'tween_buddy',
        tweenType: newRuleTweenType
      });
    }

    const existing = editingRuleId ? triggers.find(r => r.id === editingRuleId) : null;
    const rule: IFTTTRule = {
      id: editingRuleId || 'custom_rule_' + Date.now(),
      name: newRuleName,
      enabled: existing ? existing.enabled : true,
      condition: { all: conditions },
      actions
    };

    try {
      await fetch('/api/triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
      });
      setShowNewRuleModal(false);
      setEditingRuleId(null);
      setNewRuleName('');
      fetchState();
    } catch (e) {
      console.error(e);
    }
  };

  const handleWipeData = async () => {
    try {
      const res = await fetch('/api/data/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetRules: wipeResetRules })
      });
      if (res.ok) {
        setShowWipeConfirmModal(false);
        fetchState();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getLocalhostObsUrl = () => {
    return `http://localhost:3000/overlay?aspect=${aspect === '9:16' ? '9x16' : '16x9'}`;
  };

  const getObsUrl = () => {
    const origin = window.location.origin;
    return `${origin}/overlay?aspect=${aspect === '9:16' ? '9x16' : '16x9'}`;
  };

  const copyObsLink = (useLocalhost = true) => {
    const url = useLocalhost ? getLocalhostObsUrl() : getObsUrl();
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-pink-500/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                TikTok Stream Overlay Orchestrator
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Node.js + Fabric.js
              </span>
            </div>
            <p className="text-xs text-slate-400">
              OBS Browser Source • Pachinko Joins • Interactive Boss Battles • Stream CRM
            </p>
          </div>
        </div>

        {/* Quick Toolbar Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Aspect Ratio Switcher */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setAspect('9:16')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                aspect === '9:16'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📱 9:16 Vertical (1080x1920)
            </button>
            <button
              onClick={() => setAspect('16:9')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                aspect === '16:9'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🖥️ 16:9 Horizontal (1920x1080)
            </button>
          </div>

          {/* Sound Mute */}
          <button
            onClick={() => {
              const next = !isMuted;
              setIsMuted(next);
              soundFX.setMuted(next);
            }}
            title={isMuted ? 'Unmute Overlay Sound FX' : 'Mute Sound FX'}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>

          {/* Quadrant Grid Guide Toggle */}
          <button
            onClick={() => setShowGuides(!showGuides)}
            title="Toggle Quadrant Guides (3x3 Grid)"
            className={`p-2 rounded-lg border transition ${
              showGuides 
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' 
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>

          {/* Copy Localhost OBS Source URL */}
          <button
            onClick={() => copyObsLink(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-xs font-bold shadow-lg shadow-rose-500/20 transition-all active:scale-95"
            title="Copy http://localhost:3000/overlay URL for local OBS Studio"
          >
            {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedLink ? 'Copied Localhost URL!' : 'Copy Localhost OBS URL'}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-7xl mx-auto w-full">
        {/* Left Column: Live Canvas Preview */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-800 mb-3 text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                Live Overlay Viewport
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Offline Ready
                </span>
                <span className="text-slate-400 font-mono">
                  {aspect === '9:16' ? '1080 × 1920 (9:16)' : '1920 × 1080 (16:9)'}
                </span>
              </div>
            </div>

            {/* Embedded Fabric.js Overlay Preview */}
            <div className="w-full flex justify-center py-2 bg-slate-950/60 rounded-xl border border-slate-800/80 p-2">
              <FabricOverlay
                aspectRatio={aspect}
                scale={aspect === '9:16' ? 0.35 : 0.44}
                showGuides={showGuides}
              />
            </div>

            {/* OBS Guide Info Box (Offline & Localhost Emphasized) */}
            <div className="w-full mt-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs flex flex-col gap-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  OBS Browser Source (Localhost):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyObsLink(true)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold underline"
                  >
                    Copy Localhost URL
                  </button>
                  <span className="text-slate-600">•</span>
                  <a 
                    href={getObsUrl()} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-slate-400 hover:text-slate-200 flex items-center gap-0.5 text-[11px]"
                  >
                    Window <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>

              <div className="font-mono text-[11px] text-cyan-300 bg-slate-900 p-2 rounded-lg border border-slate-800 break-all select-all flex items-center justify-between">
                <span>{getLocalhostObsUrl()}</span>
              </div>

              <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60 text-[11px] text-slate-400 flex flex-col gap-1">
                <p>
                  ✅ <strong className="text-slate-200">100% Offline Compatible:</strong> In OBS, add a <strong>Browser Source</strong>, paste the localhost URL above, set resolution to <strong className="text-slate-200">{aspect === '9:16' ? '1080 × 1920' : '1920 × 1080'}</strong> @ 60 FPS.
                </p>
                <p className="text-slate-500">
                  Runs on port 3000 locally with zerodytrash/TikTok-Live-Connector and zero external server dependencies.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stream Session Stats */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-center">
              <div className="text-[11px] text-slate-400 font-medium">Viewers</div>
              <div className="text-lg font-black text-white">{connector.viewerCount}</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-center">
              <div className="text-[11px] text-slate-400 font-medium">Likes</div>
              <div className="text-lg font-black text-rose-400">{streamStats.likes}</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-center">
              <div className="text-[11px] text-slate-400 font-medium">Gifts</div>
              <div className="text-lg font-black text-amber-400">{streamStats.gifts}</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-center">
              <div className="text-[11px] text-slate-400 font-medium">Chats</div>
              <div className="text-lg font-black text-cyan-400">{streamStats.chats}</div>
            </div>
          </div>
        </div>

        {/* Right Column: Orchestrator Tabs */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Feature Tab Navigation */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'simulator'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              TikTok & Simulator
            </button>

            <button
              onClick={() => setActiveTab('boss')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'boss'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              Boss Fight Mode
            </button>

            <button
              onClick={() => setActiveTab('crm')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'crm'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              CRM & Buddies ({users.length})
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'rules'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              IFTTT Rules ({triggers.length})
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'stats'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Stream Stats (llamaXc)
            </button>
          </div>

          {/* TAB 1: TikTok Connector & Simulator */}
          {activeTab === 'simulator' && (
            <div className="flex flex-col gap-4">
              {/* Live TikTok Connector Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                      <Radio className="w-4 h-4 text-pink-500" />
                      TikTok Live Connector (zerodytrash/TikTok-Live-Connector)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Connect to any public live TikTok room using the open-source Webcast push connector. No API keys required.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        connector.status === 'connected'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : connector.status === 'connecting'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : connector.status === 'offline'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : connector.status === 'error'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        connector.status === 'connected' ? 'bg-emerald-400' :
                        connector.status === 'connecting' ? 'bg-amber-400 animate-ping' :
                        connector.status === 'offline' ? 'bg-amber-400' :
                        connector.status === 'error' ? 'bg-rose-400' : 'bg-slate-500'
                      }`} />
                      {connector.status === 'offline' ? 'ROOM OFFLINE' : connector.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">@</span>
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => {
                        setUsernameInput(e.target.value);
                        isUserTypingRef.current = true;
                      }}
                      onBlur={() => {
                        isUserTypingRef.current = false;
                      }}
                      placeholder="TikTok username (e.g. babyboss.theshadow)"
                      className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {connector.status === 'connected' ? (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connector.status === 'connecting'}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      Connect Live
                    </button>
                  )}
                </div>

                {/* Streamer Account Authentication & Cookie Status Bar */}
                <div className="mt-3 p-3 bg-slate-950/90 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-start sm:items-center gap-2.5">
                    <span className={`p-2 rounded-xl border ${
                      hasStoredSession || customSessionId
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-pink-500/10 border-pink-500/30 text-pink-400'
                    }`}>
                      <Key className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        {hasStoredSession || customSessionId ? (
                          <>
                            <span className="text-emerald-400 flex items-center gap-1 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Streamer Session Authenticated
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              {maskedSession || (customSessionId ? `${customSessionId.slice(0, 4)}...${customSessionId.slice(-4)}` : 'Active')}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-300 font-bold">
                            Login as Streamer (Optional Session Cookie)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {hasStoredSession || customSessionId
                          ? 'Requests authenticated as streamer. Bypasses age restrictions and pulls private stream data.'
                          : 'Authenticate with your TikTok sessionid cookie to allow the tool to pull restricted or age-gated stream data.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => scanBrowserCookies()}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-semibold transition flex items-center gap-1.5 border border-slate-700/60"
                      title="Scan document.cookie and localStorage for sessionid"
                    >
                      <Search className="w-3.5 h-3.5 text-cyan-400" />
                      Scan Cookies
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowLoginModal(true)}
                      className="px-3 py-1.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 shadow-md shadow-pink-600/20"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      {hasStoredSession || customSessionId ? 'Manage Session' : 'Login / Set Session'}
                    </button>

                    {(hasStoredSession || customSessionId) && (
                      <button
                        type="button"
                        onClick={clearSession}
                        className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-[11px] transition"
                        title="Clear stored session cookie"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {cookieScanStatus && (
                  <div className="mt-2 text-xs text-slate-200 bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span>{cookieScanStatus}</span>
                    <button
                      onClick={() => setCookieScanStatus(null)}
                      className="text-slate-400 hover:text-slate-200 text-xs px-1"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Optional Session ID Settings Toggle */}
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
                  >
                    <span>{showAdvancedSettings ? '▼ Hide' : '▶ Show'} Advanced Settings (Direct Session ID / Cookie Editor)</span>
                  </button>

                  {showAdvancedSettings && (
                    <div className="mt-2 p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-2.5 text-xs">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-slate-300 font-semibold block">
                            TikTok Session ID (sessionid cookie):
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowLoginModal(true)}
                            className="text-pink-400 hover:text-pink-300 text-[11px] font-medium"
                          >
                            How do I get my sessionid? ↗
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={customSessionId}
                            onChange={(e) => setCustomSessionId(e.target.value)}
                            placeholder="sessionid=... or raw 32-character hex key"
                            className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
                          />
                          <button
                            type="button"
                            onClick={() => saveSessionToBackend(customSessionId)}
                            disabled={!customSessionId}
                            className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-[11px] transition"
                          >
                            Save
                          </button>
                          {customSessionId && (
                            <button
                              type="button"
                              onClick={clearSession}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Powered by <strong className="text-slate-400">zerodytrash/TikTok-Live-Connector</strong>. Authenticates Webcast HTTP requests directly with TikTok servers.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {connector.errorMessage && (
                  <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-amber-300 mb-0.5">Connection Notice:</div>
                      <p className="text-amber-200/90 text-[11px] leading-relaxed">
                        {connector.errorMessage}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        runSimulation('toggle_auto', {});
                        setActiveTab('simulator');
                      }}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs whitespace-nowrap transition shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {isAutoSimActive ? 'Simulator Running' : 'Activate Offline Simulator'}
                    </button>
                  </div>
                )}
              </div>

              {/* Event Simulator Studio */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      Live Stream Event Simulator & Test Rig
                    </h3>
                    <p className="text-xs text-slate-400">
                      Simulate any live event instantly to test Pachinko drops, Boss fights, audio FX, and rules.
                    </p>
                  </div>

                  <button
                    onClick={() => runSimulation('toggle_auto')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                      isAutoSimActive
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAutoSimActive ? 'animate-spin' : ''}`} />
                    {isAutoSimActive ? 'Auto Traffic Active' : 'Start Auto Stream Traffic'}
                  </button>
                </div>

                {/* Instant Simulator Action Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    onClick={() => runSimulation('join', { isReturning: false })}
                    className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 rounded-xl text-left transition group"
                  >
                    <div className="flex items-center justify-between text-emerald-400 mb-1">
                      <UserPlus className="w-4 h-4" />
                      <span className="text-[10px] uppercase font-bold text-emerald-500/80">Pachinko Drop</span>
                    </div>
                    <div className="font-bold text-xs text-slate-200">New Viewer Join</div>
                    <div className="text-[11px] text-slate-500">First-time joiner</div>
                  </button>

                  <button
                    onClick={() => runSimulation('join', { isReturning: true })}
                    className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 rounded-xl text-left transition group"
                  >
                    <div className="flex items-center justify-between text-cyan-400 mb-1">
                      <Users className="w-4 h-4" />
                      <span className="text-[10px] uppercase font-bold text-cyan-500/80">Returning</span>
                    </div>
                    <div className="font-bold text-xs text-slate-200">Returning Join</div>
                    <div className="text-[11px] text-slate-500">Known loyalty viewer</div>
                  </button>

                  <button
                    onClick={() => runSimulation('like', { count: 75 })}
                    className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-rose-500/50 rounded-xl text-left transition group"
                  >
                    <div className="flex items-center justify-between text-rose-400 mb-1">
                      <Heart className="w-4 h-4" />
                      <span className="text-[10px] uppercase font-bold text-rose-500/80">Burst</span>
                    </div>
                    <div className="font-bold text-xs text-slate-200">Like Storm (+75)</div>
                    <div className="text-[11px] text-slate-500">Damages boss / milestone</div>
                  </button>

                  <button
                    onClick={() => runSimulation('pachinko')}
                    className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 rounded-xl text-left transition group"
                  >
                    <div className="flex items-center justify-between text-amber-400 mb-1">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-[10px] uppercase font-bold text-amber-500/80">Physics</span>
                    </div>
                    <div className="font-bold text-xs text-slate-200">Pachinko Test</div>
                    <div className="text-[11px] text-slate-500">Ball drop & rarity slot</div>
                  </button>
                </div>

                {/* Custom Chat Simulator */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                    Simulate Custom Chat Message
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={simChatText}
                      onChange={(e) => setSimChatText(e.target.value)}
                      placeholder="Comment text (spawns speech bubble above buddy)..."
                      className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={() => runSimulation('chat', { message: simChatText, username: simChatUser || undefined })}
                      className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 rounded-lg text-xs font-bold transition"
                    >
                      Send Chat
                    </button>
                  </div>
                </div>

                {/* Custom Gift Simulator */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <GiftIcon className="w-3.5 h-3.5 text-amber-400" />
                    Simulate Gift Shower
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Rose 🌹', 'TikTok Donut 🍩', 'Cap 🎩', 'Galaxy 🌌', 'Lion 🦁'].map((gift) => (
                      <button
                        key={gift}
                        onClick={() => runSimulation('gift', { giftName: gift, count: gift.includes('Rose') ? 10 : 1 })}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 transition"
                      >
                        Send {gift}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Boss Fight Mode Control */}
          {activeTab === 'boss' && (
            <div className="flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                      <Flame className="w-4 h-4 text-rose-500" />
                      Boss Fight Mode — Stream-Wide Event
                    </h3>
                    <p className="text-xs text-slate-400">
                      Chat collaborates to vanquish the boss. Taps and gifts shoot attack beams at the boss with a Final Strike mechanic!
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {bossState?.active ? (
                      <button
                        onClick={() => handleBossAction('stop')}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Square className="w-3.5 h-3.5" /> Stop Boss Fight
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBossAction('start', { bossTypeIndex: 0 })}
                        className="px-4 py-2 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-500/20"
                      >
                        <Play className="w-3.5 h-3.5" /> Summon Boss!
                      </button>
                    )}
                  </div>
                </div>

                {/* Boss Status Display */}
                {bossState && (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">
                          {bossState.boss.type === 'fire_dragon' ? '🐉' :
                           bossState.boss.type === 'cyber_mech' ? '🤖' :
                           bossState.boss.type === 'slime_king' ? '👑' : '👾'}
                        </span>
                        <div>
                          <div className="font-extrabold text-slate-100">{bossState.boss.name}</div>
                          <div className="text-xs text-slate-400">{bossState.boss.title}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                          bossState.phase === 'battle' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse' :
                          bossState.phase === 'prep' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                          bossState.phase === 'incoming' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {bossState.phase} Phase
                        </span>
                        <div className="text-xs text-slate-400 mt-1 font-mono">
                          ⏱️ {bossState.timeRemaining}s remaining
                        </div>
                      </div>
                    </div>

                    {/* HP Bar */}
                    <div>
                      <div className="flex justify-between text-xs mb-1 font-semibold">
                        <span className="text-slate-400">Boss Health</span>
                        <span className="text-rose-400 font-mono">
                          {bossState.boss.currentHp} / {bossState.boss.maxHp} HP
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-400 transition-all duration-300"
                          style={{ width: `${Math.max(0, (bossState.boss.currentHp / bossState.boss.maxHp) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Test Damage Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-900">
                      <span className="text-xs text-slate-400">Test Attacks:</span>
                      <button
                        onClick={() => handleBossAction('damage', { source: 'tap', multiplier: 15 })}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-cyan-300"
                      >
                        ⚡ Tap Strike (-15)
                      </button>
                      <button
                        onClick={() => handleBossAction('damage', { source: 'gift', multiplier: 4 })}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-amber-300"
                      >
                        🎁 Gift Strike (-40)
                      </button>
                      <button
                        onClick={() => handleBossAction('damage', { source: 'tap', multiplier: bossState.boss.currentHp })}
                        className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-xs text-rose-300"
                      >
                        👑 Trigger Final Strike!
                      </button>
                    </div>
                  </div>
                )}

                {/* Boss Configuration Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-300">Attack Trigger Input:</span>
                    <div className="flex gap-2">
                      {(['both', 'taps_only', 'gifts_only'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => handleBossAction('config', { triggerType: mode })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition capitalize ${
                            bossState?.triggerType === mode
                              ? 'bg-rose-500 text-white'
                              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          {mode.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-300">Attack Ordering Pattern:</span>
                    <div className="flex gap-2">
                      {(['lowest_first', 'random'] as const).map((pat) => (
                        <button
                          key={pat}
                          onClick={() => handleBossAction('config', { attackPattern: pat })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition capitalize ${
                            bossState?.attackPattern === pat
                              ? 'bg-cyan-500 text-slate-950'
                              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          {pat === 'lowest_first' ? 'Lowest First (Reward Lurkers)' : 'Random Chaos'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Select Boss Preset */}
                <div className="mt-4">
                  <span className="text-xs font-bold text-slate-400 mb-2 block">Choose Next Boss Monster:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { idx: 0, emoji: '🐉', name: 'Ignis Wyrm', color: 'text-rose-400' },
                      { idx: 1, emoji: '🤖', name: 'Titan-X', color: 'text-cyan-400' },
                      { idx: 2, emoji: '👑', name: 'Slime King', color: 'text-emerald-400' },
                      { idx: 3, emoji: '👾', name: 'Void Chronos', color: 'text-purple-400' }
                    ].map((b) => (
                      <button
                        key={b.idx}
                        onClick={() => handleBossAction('start', { bossTypeIndex: b.idx })}
                        className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition flex items-center gap-2"
                      >
                        <span className="text-xl">{b.emoji}</span>
                        <div>
                          <div className={`font-bold text-xs ${b.color}`}>{b.name}</div>
                          <div className="text-[10px] text-slate-500">Spawn Boss</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Stream CRM & Buddies */}
          {activeTab === 'crm' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    Stream CRM & Viewer History
                  </h3>
                  <p className="text-xs text-slate-400">
                    Local persistent history of TikTok users, watch time, loyalty tiers, and avatar Buddy types.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono text-slate-400">
                    {users.length} {users.length === 1 ? 'viewer' : 'viewers'} saved
                  </span>
                  <button
                    onClick={() => setShowWipeConfirmModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition shadow-sm"
                    title="Wipe sample data & start fresh"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Wipe Sample Data
                  </button>
                </div>
              </div>

              {users.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col items-center gap-2">
                  <Users className="w-8 h-8 text-slate-600 mb-1" />
                  <div className="font-bold text-sm text-slate-300">Clean Slate — No Viewers Recorded Yet</div>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Connect a live TikTok broadcast or trigger simulated viewer joins to populate viewer history, track loyalty, and seat buddy avatars!
                  </p>
                  <button
                    onClick={() => runSimulation('join', { isReturning: false })}
                    className="mt-2 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs transition"
                  >
                    Simulate First Viewer Join
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2 font-semibold">User</th>
                      <th className="pb-2 font-semibold">Rarity Tier</th>
                      <th className="pb-2 font-semibold">Buddy Shape</th>
                      <th className="pb-2 font-semibold">Watch Time</th>
                      <th className="pb-2 font-semibold">Likes</th>
                      <th className="pb-2 font-semibold">Gifts</th>
                      <th className="pb-2 font-semibold">Streams</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] text-slate-950"
                            style={{ backgroundColor: u.glow_color || '#10b981' }}
                          >
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-200">@{u.username}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{u.id}</div>
                          </div>
                        </td>

                        <td className="py-2.5">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                            style={{
                              backgroundColor: `${u.glow_color || '#10b981'}25`,
                              color: u.glow_color || '#10b981',
                              border: `1px solid ${u.glow_color || '#10b981'}50`
                            }}
                          >
                            {u.rarity_tier || 'common'}
                          </span>
                        </td>

                        <td className="py-2.5 font-mono capitalize text-slate-300">
                          {u.buddy_type || 'circle'}
                        </td>

                        <td className="py-2.5 text-slate-300">
                          {Math.round(u.total_watch_time_ms / 60000)} min
                        </td>

                        <td className="py-2.5 text-rose-400 font-semibold">
                          {u.total_likes}
                        </td>

                        <td className="py-2.5 text-amber-400 font-semibold">
                          {u.total_gifts}
                        </td>

                        <td className="py-2.5 text-slate-300">
                          {u.streams_attended}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}

          {/* TAB 4: IFTTT Rule Engine */}
          {activeTab === 'rules' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    IF-THIS-THEN-THAT Trigger Rule Engine
                  </h3>
                  <p className="text-xs text-slate-400">
                    Define condition logic on TikTok & CRM properties to trigger visual groups, pachinko, or buddy tweens.
                  </p>
                </div>

                <button
                  onClick={handleOpenNewRule}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-md shadow-purple-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Custom Rule
                </button>
              </div>

              {/* Rules List */}
              <div className="flex flex-col gap-2.5">
                {triggers.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-200">{rule.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          rule.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {rule.enabled ? 'ACTIVE' : 'MUTED'}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-2">
                        <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                          IF: {rule.condition.all?.map(c => `${c.field} ${c.op} ${c.value}`).join(' AND ') || 'Any event'}
                        </span>
                        <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-cyan-300">
                          THEN: {rule.actions.map(a => a.type).join(', ')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleEditRule(rule)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 transition flex items-center gap-1"
                        title="Edit this rule"
                      >
                        <Edit2 className="w-3 h-3 text-purple-400" />
                        Edit
                      </button>

                      <button
                        onClick={() => toggleRule(rule.id, rule.enabled)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          rule.enabled
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        {rule.enabled ? 'Mute' : 'Enable'}
                      </button>

                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add / Edit Rule Modal */}
              {showNewRuleModal && (
                <div className="p-5 bg-slate-950 border border-purple-500/40 rounded-2xl mt-2 flex flex-col gap-4 shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="font-bold text-sm text-purple-300 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-purple-400" />
                      {editingRuleId ? 'Edit IFTTT Trigger Rule' : 'Create New IFTTT Trigger Rule'}
                    </div>
                    {editingRuleId && (
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded">
                        ID: {editingRuleId}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">Rule Name</label>
                      <input
                        type="text"
                        value={newRuleName}
                        onChange={(e) => setNewRuleName(e.target.value)}
                        placeholder="e.g. Mega Like Milestone"
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">Trigger Event</label>
                      <select
                        value={newRuleEventType}
                        onChange={(e) => setNewRuleEventType(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                      >
                        <option value="like_burst">Like Burst</option>
                        <option value="join">Viewer Join</option>
                        <option value="gift">Gift Received</option>
                        <option value="chat">Chat Comment</option>
                        <option value="share">Stream Share</option>
                        <option value="follow">User Follow</option>
                      </select>
                    </div>

                    {newRuleEventType === 'like_burst' && (
                      <div>
                        <label className="text-slate-300 font-semibold block mb-1">Like Count Threshold</label>
                        <input
                          type="number"
                          value={newRuleCountThreshold}
                          onChange={(e) => setNewRuleCountThreshold(e.target.value)}
                          placeholder="e.g. 50"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    )}

                    {newRuleEventType === 'join' && (
                      <div>
                        <label className="text-slate-300 font-semibold block mb-1">Join Condition</label>
                        <select
                          value={newRuleJoinCondition}
                          onChange={(e) => setNewRuleJoinCondition(e.target.value as any)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                        >
                          <option value="first_time">First-Time Viewer Ever</option>
                          <option value="returning_stream">Returning Viewer (New Stream)</option>
                          <option value="any">Any Viewer Join</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">Primary Action Type</label>
                      <select
                        value={newRuleActionType}
                        onChange={(e) => setNewRuleActionType(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                      >
                        <option value="show_group">Show Announcement Banner</option>
                        <option value="trigger_pachinko">Trigger Pachinko Drop</option>
                        <option value="spawn_buddy">Spawn Little Buddy</option>
                        <option value="tween_buddy">Animate Buddy (Tween)</option>
                      </select>
                    </div>

                    {newRuleActionType === 'show_group' && (
                      <>
                        <div>
                          <label className="text-slate-300 font-semibold block mb-1">Banner Header Title</label>
                          <input
                            type="text"
                            value={newRuleBannerTitle}
                            onChange={(e) => setNewRuleBannerTitle(e.target.value)}
                            placeholder="e.g. WELCOME ABOARD!"
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-300 font-semibold block mb-1">
                            Banner Subtitle / Message Template:
                          </label>
                          <input
                            type="text"
                            value={newRuleBannerText}
                            onChange={(e) => setNewRuleBannerText(e.target.value)}
                            placeholder="e.g. Welcome {{user.username}} to the stream!"
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-[10px] text-slate-500 mt-0.5 block">
                            Supports variables: {'{{user.username}}'}, {'{{event.count}}'}
                          </span>
                        </div>
                      </>
                    )}

                    {(newRuleActionType === 'show_group' || newRuleActionType === 'tween_buddy') && (
                      <div>
                        <label className="text-slate-300 font-semibold block mb-1">Buddy Reaction Animation</label>
                        <select
                          value={newRuleTweenType}
                          onChange={(e) => setNewRuleTweenType(e.target.value as any)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                        >
                          <option value="bounce">Bounce (Up & Down)</option>
                          <option value="grow">Grow & Pulse</option>
                          <option value="shake">Shake (Left & Right)</option>
                          <option value="emote_popup">Emote Popup</option>
                        </select>
                      </div>
                    )}

                    {(newRuleActionType === 'spawn_buddy' || newRuleActionType === 'trigger_pachinko') && (
                      <div>
                        <label className="text-slate-300 font-semibold block mb-1">Buddy Avatar Shape</label>
                        <select
                          value={newRuleBuddyType}
                          onChange={(e) => setNewRuleBuddyType(e.target.value as any)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500 capitalize"
                        >
                          <option value="circle">Circle</option>
                          <option value="shield">Shield</option>
                          <option value="hexagon">Hexagon</option>
                          <option value="star">Star</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setShowNewRuleModal(false);
                        setEditingRuleId(null);
                      }}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveCustomRule}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs transition shadow-md shadow-purple-600/30"
                    >
                      {editingRuleId ? 'Update Rule' : 'Create Rule'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Live Stream Stats (llamaXc/tiktok-live-stream-stats) */}
          {activeTab === 'stats' && <LiveStreamStatsPanel />}
        </div>
      </div>

      {/* Wipe Sample & CRM Data Confirmation Modal */}
      {showWipeConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <AlertTriangle className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-100">Wipe Sample Data & Reset CRM?</h3>
                <p className="text-xs text-slate-400">Clear all demo viewers and simulated stats</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will remove all demo viewers (<strong className="text-slate-100">@NeonStreamer, @CyberKitten, @PixelNinja</strong>, and any simulated participants), clear total watch time and gift counters, and reset the on-screen Buddies.
            </p>

            <label className="flex items-center gap-2 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 cursor-pointer hover:bg-slate-850 transition">
              <input
                type="checkbox"
                checked={wipeResetRules}
                onChange={(e) => setWipeResetRules(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500"
              />
              <span>Also reset IFTTT rules to default presets</span>
            </label>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowWipeConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleWipeData}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Yes, Wipe All Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Streamer Login & Session Cookie Helper Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-pink-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-pink-500/10 rounded-xl border border-pink-500/20 text-pink-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-100">Login as Streamer (Session Cookie)</h3>
                  <p className="text-xs text-slate-400">Connect with your TikTok account to pull protected stream data</p>
                </div>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg px-2 py-1 rounded-lg hover:bg-slate-800"
              >
                ×
              </button>
            </div>

            {/* Quick Option 1: Auto-Detect Browser Cookies */}
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-cyan-400" />
                  Method 1: Scan Browser Cookies
                </span>
                <button
                  type="button"
                  onClick={() => scanBrowserCookies()}
                  className="px-3 py-1 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold rounded-lg text-xs transition"
                >
                  Scan Now
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Checks your current browser cookies and local storage for an active <code className="text-cyan-300">sessionid</code>.
              </p>
            </div>

            {/* Option 2: 1-Click Code Snippet for tiktok.com */}
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5 text-pink-400" />
                  Method 2: 1-Click DevTools Snippet (Recommended)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`copy(document.cookie.match(/sessionid=([^;]+)/)?.[1] || "Not logged in")`);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2500);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 border border-slate-700"
                >
                  {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-pink-400" />}
                  {copiedSnippet ? 'Copied Snippet!' : 'Copy Snippet'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                1. Open <a href="https://www.tiktok.com" target="_blank" rel="noreferrer" className="text-pink-400 hover:underline font-semibold">tiktok.com ↗</a> and make sure you are logged into your account.<br />
                2. Press <kbd className="px-1 py-0.5 bg-slate-900 rounded text-slate-300 border border-slate-800 font-mono text-[10px]">F12</kbd> (Console tab), paste the snippet above, and hit Enter.<br />
                3. Your <code className="text-pink-300">sessionid</code> will be automatically copied to your clipboard! Paste it below.
              </p>
            </div>

            {/* Option 3: Manual Input or Paste Raw Cookie */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-200">
                Paste Session ID or Full Cookie String:
              </label>
              <textarea
                rows={2}
                value={rawCookieInput}
                onChange={(e) => setRawCookieInput(e.target.value)}
                placeholder="Paste sessionid=... or full cookie header from DevTools"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-pink-500 placeholder-slate-600 resize-none"
              />
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  {rawCookieInput ? `Extracted Session: ${extractSessionId(rawCookieInput).slice(0, 8)}...` : 'Extracts sessionid automatically.'}
                </span>
                {rawCookieInput && (
                  <button
                    type="button"
                    onClick={() => {
                      const extracted = extractSessionId(rawCookieInput);
                      if (extracted) {
                        saveSessionToBackend(extracted);
                        setRawCookieInput('');
                        setShowLoginModal(false);
                      }
                    }}
                    className="px-3 py-1 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-lg text-xs transition"
                  >
                    Save & Authenticate
                  </button>
                )}
              </div>
            </div>

            {hasStoredSession && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Currently authenticated with session: {maskedSession || 'Active'}
                </span>
                <button
                  type="button"
                  onClick={() => clearSession()}
                  className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded text-[11px] font-semibold transition"
                >
                  Remove Cookie
                </button>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
