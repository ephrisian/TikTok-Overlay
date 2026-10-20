import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  AspectRatio, 
  AnchorQuadrant, 
  TikTokUser, 
  BossFightState, 
  WsMessage, 
  PachinkoDropEvent, 
  TriggerAction,
  NormalizedStreamEvent,
  BuddySpawnInfo,
  SupportersPayload,
  PachinkoPhysicsSettings
} from '../../backend/types.ts';
import { soundFX } from '../audio/soundFX.ts';
import { BuddyManager, BuddyInstance } from './buddyManager.ts';

interface FabricOverlayProps {
  aspectRatio?: AspectRatio;
  scale?: number;
  isObsSource?: boolean;
  onStatsUpdate?: (stats: any) => void;
  showGuides?: boolean;
  showDevHud?: boolean;
}

const CHAT_MAX_LINES = 6;
const CHAT_LINE_TTL_MS = 15000;

interface Projectile {
  id: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  progress: number;
  color: string;
  isGift: boolean;
  damage: number;
}

interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  opacity: number;
  size: number;
}

interface ActivePachinkoBall {
  id: string;
  userId: string;
  username: string;
  pfpUrl: string;
  tier: string;
  glowColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  completed: boolean;
  landed?: boolean;
  landedAt?: number;
  slotIndex?: number;
  trail?: Array<{ x: number; y: number; alpha: number }>;
  createdAt: number;
}

interface PegFlash {
  x: number;
  y: number;
  intensity: number;
}

export const FabricOverlay: React.FC<FabricOverlayProps> = ({
  aspectRatio = '9:16',
  scale = 1,
  isObsSource = false,
  onStatsUpdate,
  showGuides = false,
  showDevHud = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Logical canvas dimensions
  const isPortrait = aspectRatio === '9:16';
  const width = isPortrait ? 1080 : 1920;
  const height = isPortrait ? 1920 : 1080;

  // Real-time state
  const [bossState, setBossState] = useState<BossFightState | null>(null);
  const buddyManagerRef = useRef<BuddyManager>(new BuddyManager({
    width, height, baselineY: height * (isPortrait ? 0.92 : 0.88), slotWidth: 120, margin: width * 0.08
  }));
  const [bannerAlert, setBannerAlert] = useState<{ title: string; subtitle: string; color: string } | null>(null);
  const [supporters, setSupporters] = useState<SupportersPayload | null>(null);

  const projectilesRef = useRef<Projectile[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const [pachinkoEnabled, setPachinkoEnabled] = useState<boolean>(true);
  const pachinkoEnabledRef = useRef<boolean>(true);
  pachinkoEnabledRef.current = pachinkoEnabled;

  const defaultPhysics: PachinkoPhysicsSettings = {
    gravity: 0.38,
    bounciness: 0.65,
    friction: 0.985,
    ballRadius: 18,
    stayDurationSeconds: 8,
    pegJitter: 0.15,
    fallSpeedCap: 15
  };
  const pachinkoPhysicsRef = useRef<PachinkoPhysicsSettings>(defaultPhysics);
  const hasHadDropRef = useRef<boolean>(false);
  const lastPachinkoEventResolvedAtRef = useRef<number | null>(null);
  const pachinkoBoardOpacityRef = useRef<number>(0);
  const pachinkoBallsRef = useRef<ActivePachinkoBall[]>([]);
  const pegFlashesRef = useRef<PegFlash[]>([]);
  const recentPachinkoWinnerRef = useRef<{
    username: string;
    tier: string;
    glowColor: string;
    slotIndex: number;
    time: number;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const showChatRef = useRef(false);
  const chatLinesRef = useRef<Array<{ id: string; username: string; message: string; at: number }>>([]);

  // Dev & FPS Performance HUD State
  const [devHudActive, setDevHudActive] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.has('debug') || p.has('dev') || p.has('fps');
    }
    return false;
  });
  const devHudActiveRef = useRef<boolean>(devHudActive);
  devHudActiveRef.current = devHudActive;
  const showDevHudRef = useRef<boolean>(showDevHud);
  showDevHudRef.current = showDevHud;

  const fpsHistoryRef = useRef<number[]>([]);
  const lastFrameTimestampRef = useRef<number>(performance.now());
  const currentFpsRef = useRef<number>(60);
  const avgFpsRef = useRef<number>(60);
  const minFpsRef = useRef<number>(60);
  const frameDurationMsRef = useRef<number>(1.0);

  // Keyboard shortcut listener for Dev HUD toggle (Press 'D' key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          setDevHudActive(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reactive state refs to eliminate canvas disposal on state changes
  const bossStateRef = useRef<BossFightState | null>(null);
  bossStateRef.current = bossState;
  const bannerAlertRef = useRef<{ title: string; subtitle: string; color: string } | null>(null);
  bannerAlertRef.current = bannerAlert;
  const supportersRef = useRef<SupportersPayload | null>(null);
  supportersRef.current = supporters;
  const showGuidesRef = useRef<boolean>(showGuides);
  showGuidesRef.current = showGuides;

  // Keep the buddy lane layout in sync with the canvas size (overlay layout from the Maya Fix)
  buddyManagerRef.current.setLayout({
    width, height, baselineY: height * (isPortrait ? 0.92 : 0.88), slotWidth: 120, margin: width * 0.08
  });

  // Quadrant anchor positioning calculator
  const getQuadrantCoords = (anchor: AnchorQuadrant, offsetX = 0, offsetY = 0) => {
    const thirdW = width / 3;
    const thirdH = height / 3;
    let baseX = 0;
    let baseY = 0;

    switch (anchor) {
      case 'TOP_LEFT': baseX = 0; baseY = 0; break;
      case 'TOP_CENTER': baseX = thirdW; baseY = 0; break;
      case 'TOP_RIGHT': baseX = 2 * thirdW; baseY = 0; break;
      case 'MIDDLE_LEFT': baseX = 0; baseY = thirdH; break;
      case 'MIDDLE_CENTER': baseX = thirdW; baseY = thirdH; break;
      case 'MIDDLE_RIGHT': baseX = 2 * thirdW; baseY = thirdH; break;
      case 'BOTTOM_LEFT': baseX = 0; baseY = 2 * thirdH; break;
      case 'BOTTOM_CENTER': baseX = thirdW; baseY = 2 * thirdH; break;
      case 'BOTTOM_RIGHT': baseX = 2 * thirdW; baseY = 2 * thirdH; break;
    }
    return { x: baseX + offsetX, y: baseY + offsetY, cellW: thirdW, cellH: thirdH };
  };

  // Connect WebSocket for live events
  useEffect(() => {
    let isDestroyed = false;
    let reconnectTimer: NodeJS.Timeout | null = null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      if (isDestroyed) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isDestroyed) {
          ws.close();
          return;
        }
        console.log('[Overlay WS] Connected to orchestrator');
      };

      ws.onmessage = (msgEvent) => {
        if (isDestroyed) return;
        try {
          const msg: WsMessage = JSON.parse(msgEvent.data);
          handleWsMessage(msg);
        } catch (e) {
          console.error('[Overlay WS] parse error:', e);
        }
      };

      ws.onclose = () => {
        if (!isDestroyed) {
          console.warn('[Overlay WS] Disconnected, reconnecting in 2s...');
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      isDestroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleWsMessage = (msg: WsMessage) => {
    switch (msg.type) {
      case 'init': {
        const payload = msg.payload;
        if (payload.bossState) setBossState(payload.bossState);
        if (payload.supporters) setSupporters(payload.supporters);
        if (payload.settings) {
          showChatRef.current = !!payload.settings.showChat;
          if (payload.settings.pachinkoEnabled !== undefined) {
            setPachinkoEnabled(!!payload.settings.pachinkoEnabled);
          }
          if (payload.settings.pachinkoPhysics) {
            pachinkoPhysicsRef.current = { ...defaultPhysics, ...payload.settings.pachinkoPhysics };
          }
          buddyManagerRef.current.configure(payload.settings.buddies, payload.settings.maxBuddiesOnScreen);
        }
        // Buddies are never seeded from the CRM; a full-state reset just clears them
        if (payload.users && payload.users.length === 0) buddyManagerRef.current.clear();
        if (onStatsUpdate) onStatsUpdate(payload);
        break;
      }

      case 'boss_update': {
        const newBoss = msg.payload as BossFightState;
        setBossState(newBoss);
        if (newBoss.phase === 'incoming') {
          soundFX.playBossIncoming();
        } else if (newBoss.outcome === 'victory') {
          soundFX.playFinalStrike();
          confetti({ particleCount: 120, spread: 100, origin: { y: 0.6 } });
        }
        break;
      }

      case 'boss_attack_vfx': {
        const vfx = msg.payload;
        soundFX.playAttackHit(vfx.source === 'gift');

        // Locate buddy avatar position or fallback to bottom
        const attacker = buddyManagerRef.current.findByUser(vfx.userId);
        const startX = attacker ? attacker.x : width * (0.2 + Math.random() * 0.6);
        const startY = attacker ? attacker.y : height * 0.88;

        const bossX = width * 0.5;
        const bossY = height * (isPortrait ? 0.35 : 0.28);

        projectilesRef.current.push({
          id: 'proj_' + Math.random(),
          startX,
          startY,
          currentX: startX,
          currentY: startY,
          targetX: bossX + (Math.random() - 0.5) * 80,
          targetY: bossY + (Math.random() - 0.5) * 60,
          progress: 0,
          color: vfx.source === 'gift' ? '#f59e0b' : '#38bdf8',
          isGift: vfx.source === 'gift',
          damage: vfx.damage
        });

        // Add damage text
        floatingTextsRef.current.push({
          id: 'txt_' + Math.random(),
          text: vfx.isFinalStrike ? `💥 FINAL STRIKE -${vfx.damage}!` : `-${vfx.damage}`,
          x: bossX + (Math.random() - 0.5) * 120,
          y: bossY - 40,
          color: vfx.isFinalStrike ? '#facc15' : vfx.source === 'gift' ? '#fb923c' : '#38bdf8',
          opacity: 1,
          size: vfx.isFinalStrike ? 38 : vfx.source === 'gift' ? 26 : 20
        });

        if (vfx.isFinalStrike && attacker) {
          attacker.isFinalStriker = true;
        }
        break;
      }

      case 'pachinko_drop': {
        const drop = msg.payload as PachinkoDropEvent;
        // Ensure board is loaded & active on overlay
        setPachinkoEnabled(true);
        hasHadDropRef.current = true;
        lastPachinkoEventResolvedAtRef.current = null;

        // Allow up to 8 simultaneous balls in flight
        if (pachinkoBallsRef.current.length >= 8) {
          console.warn('[Overlay] Pachinko ball ignored: maximum on-screen capacity reached (8)');
          break;
        }

        const boardTop = height * 0.08;
        const boardLeft = isPortrait ? width * 0.08 : width * 0.28;
        const boardRight = isPortrait ? width * 0.92 : width * 0.72;
        const boardW = boardRight - boardLeft;

        const phys = pachinkoPhysicsRef.current;
        const radius = phys.ballRadius || 18;

        // Initial drop position inside top hopper
        const startXRatio = drop.initialXRatio ?? (0.5 + (Math.random() - 0.5) * 0.12);
        const startX = boardLeft + boardW * startXRatio;
        const startY = boardTop - radius + 6;
        const startVx = drop.initialVx ?? ((Math.random() - 0.5) * 1.0);

        pachinkoBallsRef.current.push({
          id: 'pach_' + Date.now() + '_' + Math.random(),
          userId: drop.userId,
          username: drop.username,
          pfpUrl: drop.pfpUrl,
          tier: drop.tier || 'common',
          glowColor: drop.glowColor || '#10b981',
          x: startX,
          y: startY,
          vx: startVx,
          vy: 1.2,
          radius,
          completed: false,
          landed: false,
          landedAt: 0,
          trail: [],
          createdAt: Date.now()
        });
        break;
      }

      case 'action': {
        const action = msg.payload as TriggerAction & { targetUser?: Partial<TikTokUser> };
        if (action.type === 'show_group' && action.textOverrides) {
          setBannerAlert({
            title: action.textOverrides.title || 'ALERT',
            subtitle: action.textOverrides.username || '',
            color: '#8b5cf6'
          });
          setTimeout(() => setBannerAlert(null), action.durationMs || 5000);
        } else if (action.type === 'spawn_buddy' && action.targetUser?.id && (action as any).spawn) {
          buddyManagerRef.current.spawn({
            user: action.targetUser,
            spawn: (action as any).spawn as BuddySpawnInfo,
            buddyType: action.targetUser.buddy_type
          });
        } else if (action.type === 'tween_buddy' && action.targetUser?.id) {
          const uid = action.targetUser.id;
          triggerBuddyReaction(uid, action.tweenType || 'bounce');
        }
        break;
      }

      case 'event': {
        const evt = msg.payload as NormalizedStreamEvent;
        if (evt.type === 'chat') {
          if (showChatRef.current) {
            chatLinesRef.current = [
              ...chatLinesRef.current.slice(-(CHAT_MAX_LINES - 1)),
              { id: 'chat_' + Math.random(), username: evt.username, message: evt.message, at: Date.now() }
            ];
          }
          // Speech bubbles only show on buddies a rule has already spawned
          const b = buddyManagerRef.current.findByUser(evt.userId);
          if (b) {
            b.speechText = evt.message.slice(0, 36);
            b.speechTimer = Date.now() + 4500;
            b.bounceOffset = 25;
          }
        } else if (evt.type === 'like_burst') {
          soundFX.playLikePop();
        }
        break;
      }

      case 'supporters_update': {
        setSupporters(msg.payload as SupportersPayload);
        break;
      }

      case 'settings_update': {
        showChatRef.current = !!msg.payload?.showChat;
        if (!showChatRef.current) chatLinesRef.current = [];
        if (msg.payload?.pachinkoEnabled !== undefined) {
          setPachinkoEnabled(!!msg.payload.pachinkoEnabled);
        }
        if (msg.payload?.pachinkoPhysics) {
          pachinkoPhysicsRef.current = { ...defaultPhysics, ...msg.payload.pachinkoPhysics };
        }
        buddyManagerRef.current.configure(msg.payload?.buddies, msg.payload?.maxBuddiesOnScreen);
        break;
      }

      case 'leaderboard_update':
        break;
    }
  };

  const triggerBuddyReaction = (userId: string, tweenType: 'bounce' | 'grow' | 'shake' | 'emote_popup') => {
    const b = buddyManagerRef.current.findByUser(userId);
    if (!b) return;
    b.bounceOffset = tweenType === 'bounce' ? 30 : 15;
    if (tweenType === 'grow') {
      b.scale = 1.35;
      setTimeout(() => { b.scale = 1; }, 450);
    }
  };

  // Initialize Canvas & Render Loop (Hardware Accelerated 60+ FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let tick = 0;

    const renderLoop = () => {
      tick++;
      const frameStart = performance.now();
      const delta = frameStart - lastFrameTimestampRef.current;
      lastFrameTimestampRef.current = frameStart;

      if (delta > 0 && delta < 500) {
        const instantFps = 1000 / delta;
        currentFpsRef.current = instantFps;
        fpsHistoryRef.current.push(instantFps);
        if (fpsHistoryRef.current.length > 60) fpsHistoryRef.current.shift();

        let sum = 0;
        let min = 999;
        for (let i = 0; i < fpsHistoryRef.current.length; i++) {
          const f = fpsHistoryRef.current[i];
          sum += f;
          if (f < min) min = f;
        }
        avgFpsRef.current = sum / fpsHistoryRef.current.length;
        minFpsRef.current = min;
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Aspect Ratio Quadrant Guides if enabled
      if (showGuidesRef.current) {
        drawQuadrantGuides(ctx);
      }

      // 2. Draw Pachinko Board Pegs and Falling Drops
      drawPachinkoLayer(ctx, tick);

      // 3. Draw Boss Fight Overlay Layer
      const currentBoss = bossStateRef.current;
      if (currentBoss && currentBoss.active) {
        drawBossLayer(ctx, currentBoss, tick);
      }

      // 4. Draw Projectiles & Attacks
      drawProjectilesLayer(ctx);

      // 5. Draw Floating Damage Numbers
      drawFloatingTextsLayer(ctx);

      // 6. Rule-spawned buddies (lane layout, lifetimes, exit animations)
      buddyManagerRef.current.update();
      drawBuddiesLayer(ctx);

      drawChatLayer(ctx);

      // 7. Draw Dynamic Announcement Banner
      const currentBanner = bannerAlertRef.current;
      if (currentBanner) {
        drawBannerAlert(ctx, currentBanner);
      }

      // 8. Draw Leaderboard Widget (pinned to TOP_RIGHT or MIDDLE_RIGHT)
      drawSupportersWidget(ctx);

      // 9. Draw Dev / FPS Performance HUD if active
      if (showDevHudRef.current || devHudActiveRef.current) {
        drawDevHud(ctx);
      }

      frameDurationMsRef.current = performance.now() - frameStart;
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [width, height]);

  // Canvas Drawing Helpers
  const drawQuadrantGuides = (ctx: CanvasRenderingContext2D) => {
    const thirdW = width / 3;
    const thirdH = height / 3;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);

    for (let c = 1; c < 3; c++) {
      ctx.beginPath();
      ctx.moveTo(c * thirdW, 0);
      ctx.lineTo(c * thirdW, height);
      ctx.stroke();
    }
    for (let r = 1; r < 3; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * thirdH);
      ctx.lineTo(width, r * thirdH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  // 0. Development & FPS Performance Diagnostic HUD
  const drawDevHud = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    const hudW = isPortrait ? 380 : 430;
    const hudH = 195;
    const hudX = 20;
    const hudY = 20;

    // Background panel with dark cyber blur style
    ctx.fillStyle = 'rgba(10, 15, 30, 0.94)';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudW, hudH, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Header: DEV / PERFORMANCE DIAGNOSTICS
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('⚡ DEV PERFORMANCE & ENGINE HUD', hudX + 14, hudY + 14);

    // Live FPS badge
    const curFps = Math.round(currentFpsRef.current);
    const avgFps = avgFpsRef.current.toFixed(1);
    const minFps = minFpsRef.current.toFixed(1);
    const frameMs = frameDurationMsRef.current.toFixed(2);

    let fpsColor = '#10b981'; // emerald >= 55
    if (curFps < 30) fpsColor = '#ef4444'; // rose < 30
    else if (curFps < 55) fpsColor = '#f59e0b'; // amber 30-54

    ctx.fillStyle = fpsColor;
    ctx.font = '900 24px monospace';
    ctx.fillText(`${curFps} FPS`, hudX + 14, hudY + 36);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText(`(avg: ${avgFps} | min: ${minFps} | frame: ${frameMs}ms)`, hudX + 125, hudY + 44);

    // Divider
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hudX + 12, hudY + 70);
    ctx.lineTo(hudX + hudW - 12, hudY + 70);
    ctx.stroke();

    // Pachinko Engine Status line
    const phys = pachinkoPhysicsRef.current;
    const activeBalls = pachinkoBallsRef.current.filter(b => !b.landed).length;
    const landedBalls = pachinkoBallsRef.current.filter(b => b.landed).length;
    let pachinkoStatus = 'Standby (Hidden)';
    if (pachinkoBoardOpacityRef.current > 0.05) {
      if (activeBalls > 0 || landedBalls > 0) {
        pachinkoStatus = `Drop Active (${activeBalls} falling, ${landedBalls} in slot)`;
      } else if (lastPachinkoEventResolvedAtRef.current !== null && phys.stayDurationSeconds > 0) {
        const remaining = Math.max(0, phys.stayDurationSeconds - (Date.now() - lastPachinkoEventResolvedAtRef.current) / 1000);
        pachinkoStatus = `Hold On Screen (${remaining.toFixed(1)}s left)`;
      } else {
        pachinkoStatus = phys.stayDurationSeconds === 0 ? 'Pinned (Always Visible)' : 'Fading out';
      }
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px monospace';
    ctx.fillText('🎰 PACHINKO:', hudX + 14, hudY + 82);
    ctx.fillStyle = pachinkoBoardOpacityRef.current > 0.05 ? '#06b6d4' : '#64748b';
    ctx.fillText(`${pachinkoStatus} [${Math.round(pachinkoBoardOpacityRef.current * 100)}% opac]`, hudX + 104, hudY + 82);

    // Physics parameters line
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`   Physics: G:${phys.gravity} B:${phys.bounciness} F:${phys.friction} R:${phys.ballRadius}px Hold:${phys.stayDurationSeconds}s Jitter:${phys.pegJitter || 0}`, hudX + 14, hudY + 104);

    // Active Entities line
    const buddyCount = buddyManagerRef.current.getActive().length;
    const projCount = projectilesRef.current.length;
    const textCount = floatingTextsRef.current.length;
    const chatCount = chatLinesRef.current.length;
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px monospace';
    ctx.fillText(`👥 ENTITIES: Buddies:${buddyCount} | FX Proj:${projCount} | Texts:${textCount} | Chat:${chatCount}`, hudX + 14, hudY + 128);

    // Canvas & Viewport line
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`🖥️ VIEWPORT: ${width}x${height} (${aspectRatio}) | Boss: ${bossStateRef.current?.active ? bossStateRef.current.phase.toUpperCase() : 'INACTIVE'}`, hudX + 14, hudY + 148);

    // Hotkey toggle hint
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`💡 Toggle: Press 'D' on keyboard or toggle in dashboard`, hudX + 14, hudY + 172);

    ctx.restore();
  };

  const drawPachinkoLayer = (ctx: CanvasRenderingContext2D, tick: number) => {
    const phys = pachinkoPhysicsRef.current;
    const isEnabled = pachinkoEnabledRef.current;
    const hasBalls = pachinkoBallsRef.current.length > 0;

    // Check display timer after last resolved drop
    let targetOpacity = 0;
    if (isEnabled) {
      if (phys.stayDurationSeconds === 0) {
        // 0 = permanently visible on stream
        targetOpacity = 1;
      } else if (!hasHadDropRef.current) {
        // No drop has occurred yet in this session -> remain hidden
        targetOpacity = 0;
      } else if (hasBalls) {
        lastPachinkoEventResolvedAtRef.current = null;
        targetOpacity = 1;
      } else {
        if (lastPachinkoEventResolvedAtRef.current === null) {
          lastPachinkoEventResolvedAtRef.current = Date.now();
        }
        const elapsedSec = (Date.now() - lastPachinkoEventResolvedAtRef.current) / 1000;
        if (elapsedSec < phys.stayDurationSeconds) {
          targetOpacity = 1;
        } else {
          targetOpacity = 0; // auto-hide timeout expired after last drop resolved
        }
      }
    }

    // Smoothly interpolate opacity for graceful fade in / out
    pachinkoBoardOpacityRef.current += (targetOpacity - pachinkoBoardOpacityRef.current) * 0.08;
    if (pachinkoBoardOpacityRef.current < 0.005) {
      pachinkoBoardOpacityRef.current = 0;
      return;
    }

    ctx.save();
    ctx.globalAlpha = pachinkoBoardOpacityRef.current;

    const boardTop = height * 0.08;
    const boardBottom = height * (isPortrait ? 0.44 : 0.58);
    const boardLeft = isPortrait ? width * 0.08 : width * 0.28;
    const boardRight = isPortrait ? width * 0.92 : width * 0.72;
    const boardW = boardRight - boardLeft;
    const boardH = boardBottom - boardTop;

    // 1. Board Outer Cabinet & Glowing Cyber Frame
    ctx.save();
    ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(10, 15, 30, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(boardLeft - 8, boardTop - 46, boardW + 16, boardH + 82, 20);
    ctx.fill();
    ctx.stroke();

    // Subtle inner pinstripe background texture
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    for (let lx = boardLeft + 20; lx < boardRight - 10; lx += 45) {
      ctx.beginPath();
      ctx.moveTo(lx, boardTop - 36);
      ctx.lineTo(lx, boardBottom + 26);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Marquee Top Banner
    ctx.save();
    const marqueeY = boardTop - 42;
    const marqueeH = 34;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boardLeft + 12, marqueeY, boardW - 24, marqueeH, 10);
    ctx.fill();
    ctx.stroke();

    // Animated Neon Marquee Title
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 15px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.fillText('🎰 PACHINKO LUCKY DROP 🎰', boardLeft + boardW / 2, marqueeY + 22);
    ctx.shadowBlur = 0;

    // Top Drop Funnel/Hopper indicator
    const hopperW = 84;
    const hopperH = 14;
    const hopperX = boardLeft + boardW / 2 - hopperW / 2;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(hopperX, boardTop - 4, hopperW, hopperH, [0, 0, 8, 8]);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Pegs Grid Coordinates
    const rows = 6;
    const pegStartY = boardTop + 32;
    const pegEndY = boardBottom - 64;
    const rowH = (pegEndY - pegStartY) / (rows + 1);
    const pegRadius = 6.5;

    const pegs: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < rows; r++) {
      const py = pegStartY + (r + 1) * rowH;
      const cols = r % 2 === 0 ? 8 : 9;
      for (let c = 0; c < cols; c++) {
        const px = boardLeft + (c + 0.5) * (boardW / cols);
        pegs.push({ x: px, y: py });
      }
    }

    // Render Pegs
    for (let i = 0; i < pegs.length; i++) {
      const p = pegs[i];
      ctx.save();
      ctx.fillStyle = '#cbd5e1';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pegRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw active peg flash pulses
    if (pegFlashesRef.current.length > 0) {
      ctx.save();
      for (let f = 0; f < pegFlashesRef.current.length; f++) {
        const flash = pegFlashesRef.current[f];
        ctx.strokeStyle = `rgba(250, 204, 21, ${flash.intensity})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, 8 + (1 - flash.intensity) * 16, 0, Math.PI * 2);
        ctx.stroke();
        flash.intensity -= 0.08;
      }
      pegFlashesRef.current = pegFlashesRef.current.filter(f => f.intensity > 0);
      ctx.restore();
    }

    // 4. Bottom Prize Slots (Common, Rare, Epic, Legendary)
    const slotNames = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    const slotMults = ['1x MULTI', '2x MULTI', '5x MULTI', '10x JACKPOT'];
    const slotColors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b'];
    const slotGlows = [
      'rgba(16, 185, 129, 0.4)',
      'rgba(6, 182, 212, 0.4)',
      'rgba(139, 92, 246, 0.4)',
      'rgba(245, 158, 11, 0.45)'
    ];
    const slotW = boardW / 4;
    const slotBoxY = boardBottom - 44;
    const slotBoxH = 64;

    const recent = recentPachinkoWinnerRef.current;
    const isRecentWinnerActive = recent && (Date.now() - recent.time < 6000);

    for (let i = 0; i < 4; i++) {
      const sx = boardLeft + i * slotW;
      const isWinningSlot = isRecentWinnerActive && recent?.slotIndex === i;

      ctx.save();
      ctx.fillStyle = isWinningSlot ? slotGlows[i] : 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = slotColors[i];
      ctx.lineWidth = isWinningSlot ? 3.5 : 2;
      if (isWinningSlot) {
        ctx.shadowColor = slotColors[i];
        ctx.shadowBlur = 18;
      }
      ctx.beginPath();
      ctx.roundRect(sx + 4, slotBoxY, slotW - 8, slotBoxH, 10);
      ctx.fill();
      ctx.stroke();

      // Tier Name
      ctx.fillStyle = slotColors[i];
      ctx.font = '900 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(slotNames[i], sx + slotW / 2, slotBoxY + 26);

      // Multiplier Tag
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(slotMults[i], sx + slotW / 2, slotBoxY + 48);
      ctx.restore();
    }

    // Slot Divider Posts & Top Deflector Chevrons
    for (let i = 1; i < 4; i++) {
      const divX = boardLeft + i * slotW;
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = '#0284c7';
      ctx.lineWidth = 2.5;

      // Post stem
      ctx.beginPath();
      ctx.moveTo(divX, boardBottom - 48);
      ctx.lineTo(divX, boardBottom + 16);
      ctx.stroke();

      // Top Wedge / Chevron (deflects incoming balls naturally into slots)
      ctx.beginPath();
      ctx.moveTo(divX, boardBottom - 64); // sharp peak
      ctx.lineTo(divX + 8, boardBottom - 48);
      ctx.lineTo(divX - 8, boardBottom - 48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 5. Recent Winner Marquee Tag
    if (isRecentWinnerActive && recent) {
      ctx.save();
      const bannerW = boardW - 20;
      const bannerX = boardLeft + 10;
      const bannerY = boardBottom + 26;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = recent.glowColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = recent.glowColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(bannerX, bannerY, bannerW, 28, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`✨ @${recent.username} landed in ${recent.tier.toUpperCase()}! ✨`, bannerX + bannerW / 2, bannerY + 19);
      ctx.restore();
    }

    // 6. Real 2D Rigid-Body Physics Simulation (4 Substeps for Rock-Solid Stability)
    const subSteps = 4;
    const dt = 1 / subSteps;
    const maxSpeed = phys.fallSpeedCap || 15;
    const balls = pachinkoBallsRef.current;

    for (let bIdx = 0; bIdx < balls.length; bIdx++) {
      const ball = balls[bIdx];
      if (ball.completed) continue;

      if (!ball.landed) {
        for (let s = 0; s < subSteps; s++) {
          // Gravity acceleration
          ball.vy += phys.gravity * dt;

          // Air drag / lateral damping
          const damping = Math.pow(phys.friction, dt);
          ball.vx *= damping;
          ball.vy *= damping;

          // Velocity cap to avoid tunneling
          const speed = Math.hypot(ball.vx, ball.vy);
          if (speed > maxSpeed) {
            ball.vx = (ball.vx / speed) * maxSpeed;
            ball.vy = (ball.vy / speed) * maxSpeed;
          }

          // Position integration
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;

          // Cabinet Side Walls Collision
          const minX = boardLeft + ball.radius + 6;
          const maxX = boardRight - ball.radius - 6;
          if (ball.x < minX) {
            ball.x = minX;
            ball.vx = Math.abs(ball.vx) * phys.bounciness;
            soundFX.playPegBounce();
          } else if (ball.x > maxX) {
            ball.x = maxX;
            ball.vx = -Math.abs(ball.vx) * phys.bounciness;
            soundFX.playPegBounce();
          }

          // Peg Collisions (Galton Board restitution & tangential deflection)
          for (let p = 0; p < pegs.length; p++) {
            const peg = pegs[p];
            const dx = ball.x - peg.x;
            const dy = ball.y - peg.y;
            const distSq = dx * dx + dy * dy;
            const minDist = ball.radius + pegRadius;

            if (distSq < minDist * minDist && distSq > 0.0001) {
              const dist = Math.sqrt(distSq);
              const nx = dx / dist;
              const ny = dy / dist;
              const tx = -ny;
              const ty = nx;

              // Separate overlapping surfaces
              ball.x = peg.x + nx * (minDist + 0.1);
              ball.y = peg.y + ny * (minDist + 0.1);

              // Normal and tangential velocities
              const vn = ball.vx * nx + ball.vy * ny;
              const vt = ball.vx * tx + ball.vy * ty;

              if (vn < 0) {
                const bounce = phys.bounciness;
                let newVn = -vn * bounce;
                let newVt = vt * 0.94;

                // Subtle organic peg jitter
                if (phys.pegJitter > 0) {
                  newVt += (Math.random() - 0.5) * phys.pegJitter * 2.2;
                }

                // Micro deflection when hitting near top apex so ball never rests statically on pin
                if (Math.abs(nx) < 0.08 && ny < -0.85) {
                  newVt += (nx >= 0 ? 1 : -1) * (1.2 + Math.random() * 0.8);
                }

                ball.vx = newVn * nx + newVt * tx;
                ball.vy = newVn * ny + newVt * ty;

                soundFX.playPegBounce();
                pegFlashesRef.current.push({ x: peg.x, y: peg.y, intensity: 1.0 });
              }
            }
          }

          // Divider Post Top Chevrons Collision (Angled wedges deflect ball into slots)
          if (ball.y > boardBottom - 66 && ball.y <= boardBottom - 48) {
            for (let i = 1; i < 4; i++) {
              const divX = boardLeft + i * slotW;
              if (Math.abs(ball.x - divX) < ball.radius + 8) {
                // Deflect outward from divider peak into left or right slot
                if (ball.x < divX) {
                  ball.x = divX - (ball.radius + 8.2);
                  ball.vx = -Math.abs(ball.vx) * phys.bounciness - 0.8;
                } else {
                  ball.x = divX + (ball.radius + 8.2);
                  ball.vx = Math.abs(ball.vx) * phys.bounciness + 0.8;
                }
              }
            }
          }

          // Slot Channel Boundaries (Lateral confinement inside slots)
          if (ball.y > boardBottom - 48) {
            const slotIdx = Math.max(0, Math.min(3, Math.floor((ball.x - boardLeft) / slotW)));
            const minSlotX = boardLeft + slotIdx * slotW + ball.radius + 3;
            const maxSlotX = boardLeft + (slotIdx + 1) * slotW - ball.radius - 3;
            if (ball.x < minSlotX) {
              ball.x = minSlotX;
              ball.vx = Math.abs(ball.vx) * 0.35;
            } else if (ball.x > maxSlotX) {
              ball.x = maxSlotX;
              ball.vx = -Math.abs(ball.vx) * 0.35;
            }
          }

          // Bottom Slot Basket Floor Landing & Settling
          if (ball.y >= boardBottom - 24) {
            ball.y = boardBottom - 24;
            const slotIndex = Math.max(0, Math.min(3, Math.floor((ball.x - boardLeft) / slotW)));

            if (!ball.landed) {
              ball.landed = true;
              ball.landedAt = Date.now();
              ball.slotIndex = slotIndex;
              ball.tier = slotNames[slotIndex].toLowerCase();
              ball.glowColor = slotColors[slotIndex];

              // Realistic gentle cushion bounce
              ball.vy = -Math.abs(ball.vy) * 0.25;
              ball.vx *= 0.6;

              soundFX.playSlotLanding(ball.tier as any);
              confetti({
                particleCount: 50,
                spread: 60,
                origin: { x: ball.x / width, y: ball.y / height }
              });

              recentPachinkoWinnerRef.current = {
                username: ball.username,
                tier: ball.tier,
                glowColor: ball.glowColor,
                slotIndex,
                time: Date.now()
              };

              fetch('/api/user/' + encodeURIComponent(ball.userId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rarity: ball.tier, glowColor: ball.glowColor })
              }).catch(() => {});
            } else {
              // Settle resting ball in the slot basket
              ball.vy = -Math.abs(ball.vy) * 0.2;
              ball.vx *= 0.7;
              if (Math.abs(ball.vy) < 0.2 && Math.abs(ball.vx) < 0.2) {
                ball.vx = 0;
                ball.vy = 0;
              }
            }
            break;
          }
        }

        // Ball-to-Ball Collision with other falling balls
        for (let otherIdx = bIdx + 1; otherIdx < balls.length; otherIdx++) {
          const other = balls[otherIdx];
          if (other.completed || other.landed) continue;
          const bdx = other.x - ball.x;
          const bdy = other.y - ball.y;
          const bdistSq = bdx * bdx + bdy * bdy;
          const bMinDist = ball.radius + other.radius;
          if (bdistSq < bMinDist * bMinDist && bdistSq > 0.001) {
            const bdist = Math.sqrt(bdistSq);
            const bnx = bdx / bdist;
            const bny = bdy / bdist;
            // Push apart
            const overlap = (bMinDist - bdist) * 0.5;
            ball.x -= bnx * overlap;
            ball.y -= bny * overlap;
            other.x += bnx * overlap;
            other.y += bny * overlap;
            // Exchange velocity along collision normal
            const kx = ball.vx - other.vx;
            const ky = ball.vy - other.vy;
            const p = 2 * (bnx * kx + bny * ky) / 2;
            ball.vx -= p * bnx * 0.8;
            ball.vy -= p * bny * 0.8;
            other.vx += p * bnx * 0.8;
            other.vy += p * bny * 0.8;
          }
        }

        // Watchdog timeout: if ball takes > 10s to drop, gently push downward into slot
        if (Date.now() - (ball.createdAt || Date.now()) > 10000 && !ball.landed) {
          ball.vy = Math.max(ball.vy, 4.5);
        }

        // Trail recording
        if (!ball.trail) ball.trail = [];
        ball.trail.push({ x: ball.x, y: ball.y, alpha: 0.8 });
        if (ball.trail.length > 7) ball.trail.shift();
      } else {
        // Ball has landed: hold it resting in the slot basket for 1600ms before removing
        if (Date.now() - (ball.landedAt || 0) > 1600) {
          ball.completed = true;
        }
      }

      // Draw Trail
      if (ball.trail && ball.trail.length > 1) {
        ctx.save();
        for (let t = 0; t < ball.trail.length; t++) {
          const pt = ball.trail[t];
          const a = (t / ball.trail.length) * 0.4;
          ctx.fillStyle = ball.glowColor;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, ball.radius * 0.6 * (t / ball.trail.length), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Draw Ball Avatar & Aura
      ctx.save();
      ctx.shadowColor = ball.glowColor;
      ctx.shadowBlur = 18;
      ctx.fillStyle = ball.glowColor;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner disc
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, Math.max(8, ball.radius - 4), 0, Math.PI * 2);
      ctx.fill();

      // Letter initial for viewer
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(ball.radius * 0.8)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initial = (ball.username || 'V').slice(0, 1).toUpperCase();
      ctx.fillText(initial, ball.x, ball.y);
      ctx.restore();

      // Username Tag above ball
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = ball.glowColor;
      ctx.lineWidth = 1.5;
      const tagText = '@' + ball.username;
      ctx.font = 'bold 12px Inter, sans-serif';
      const textW = ctx.measureText(tagText).width;
      ctx.beginPath();
      ctx.roundRect(ball.x - textW / 2 - 8, ball.y - ball.radius - 22, textW + 16, 20, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(tagText, ball.x, ball.y - ball.radius - 8);
      ctx.restore();
    }

    // Cleanup completed balls
    pachinkoBallsRef.current = pachinkoBallsRef.current.filter(b => !b.completed);

    ctx.restore(); // restore globalAlpha
  };

  const drawBossLayer = (ctx: CanvasRenderingContext2D, boss: BossFightState, tick: number) => {
    const bossCenterX = width * 0.5;
    const bossCenterY = height * (isPortrait ? 0.34 : 0.28);

    // Screen Danger Glow Tint
    ctx.save();
    const glowGradient = ctx.createRadialGradient(
      bossCenterX, bossCenterY, 50,
      bossCenterX, bossCenterY, width * 0.7
    );
    glowGradient.addColorStop(0, `${boss.glowColor}25`);
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // Incoming Phase Banner
    if (boss.phase === 'incoming') {
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      ctx.fillRect(0, bossCenterY - 60, width, 120);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 36px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 10;
      ctx.fillText(boss.incomingText, bossCenterX, bossCenterY + 12);
      ctx.restore();
      return;
    }

    // Prep Phase Announcement
    if (boss.phase === 'prep') {
      ctx.save();
      ctx.fillStyle = 'rgba(14, 165, 233, 0.92)';
      ctx.fillRect(0, bossCenterY - 50, width, 100);

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 28px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(boss.prepText, bossCenterX, bossCenterY + 10);
      ctx.restore();
    }

    // Boss Sprite Graphic
    ctx.save();
    const floatOffset = Math.sin(tick * 0.05) * 12;
    const bY = bossCenterY + floatOffset;

    // Boss Aura
    ctx.shadowColor = boss.glowColor;
    ctx.shadowBlur = 35;
    ctx.fillStyle = boss.glowColor;
    ctx.beginPath();
    ctx.arc(bossCenterX, bY, 78, 0, Math.PI * 2);
    ctx.fill();

    // Boss Body Core
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(bossCenterX, bY, 68, 0, Math.PI * 2);
    ctx.fill();

    // Boss Icon Emoji / Graphic representation
    ctx.font = '64px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bossEmoji = boss.boss.type === 'fire_dragon' ? '🐉' :
                      boss.boss.type === 'cyber_mech' ? '🤖' :
                      boss.boss.type === 'slime_king' ? '👑' : '👾';
    ctx.fillText(bossEmoji, bossCenterX, bY);
    ctx.restore();

    // Boss Name & Title
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 26px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 8;
    ctx.fillText(boss.boss.name, bossCenterX, bY - 95);

    ctx.fillStyle = boss.glowColor;
    ctx.font = '600 16px Inter, sans-serif';
    ctx.fillText(boss.boss.title, bossCenterX, bY - 72);

    // HP Bar
    const hpBarW = Math.min(width * 0.65, 500);
    const hpBarH = 22;
    const hpBarX = bossCenterX - hpBarW / 2;
    const hpBarY = bY + 95;

    // Background bar
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(hpBarX, hpBarY, hpBarW, hpBarH, 10);
    ctx.fill();
    ctx.stroke();

    // Current HP Fill
    const hpRatio = Math.max(0, boss.boss.currentHp / boss.boss.maxHp);
    ctx.fillStyle = hpRatio > 0.5 ? '#10b981' : hpRatio > 0.2 ? '#f59e0b' : '#ef4444';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(hpBarX + 2, hpBarY + 2, (hpBarW - 4) * hpRatio, hpBarH - 4, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // HP Text & Timer
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText(`${boss.boss.currentHp} / ${boss.boss.maxHp} HP  •  ⏱️ ${boss.timeRemaining}s`, bossCenterX, hpBarY + 16);
    ctx.restore();

    // Victory or Defeat Banner in End Phase
    if (boss.phase === 'ended' && boss.outcome) {
      ctx.save();
      const isVic = boss.outcome === 'victory';
      ctx.fillStyle = isVic ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)';
      ctx.fillRect(0, bossCenterY - 70, width, 140);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 36px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isVic ? boss.victoryText : boss.defeatText, bossCenterX, bossCenterY - 10);

      if (boss.finalStriker) {
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.fillText(`👑 FINAL STRIKE DELIVERED BY @${boss.finalStriker.username}!`, bossCenterX, bossCenterY + 35);
      }
      ctx.restore();
    }
  };

  const drawProjectilesLayer = (ctx: CanvasRenderingContext2D) => {
    projectilesRef.current.forEach((p) => {
      p.progress += 0.08;
      p.currentX = p.startX + (p.targetX - p.startX) * p.progress;
      p.currentY = p.startY + (p.targetY - p.startY) * p.progress;

      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.currentX, p.currentY, p.isGift ? 10 : 6, 0, Math.PI * 2);
      ctx.fill();

      // Trail
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.isGift ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(p.startX + (p.targetX - p.startX) * Math.max(0, p.progress - 0.2), p.startY + (p.targetY - p.startY) * Math.max(0, p.progress - 0.2));
      ctx.lineTo(p.currentX, p.currentY);
      ctx.stroke();
      ctx.restore();
    });

    // Remove completed projectiles
    projectilesRef.current = projectilesRef.current.filter(p => p.progress < 1);
  };

  const drawFloatingTextsLayer = (ctx: CanvasRenderingContext2D) => {
    floatingTextsRef.current.forEach(t => {
      t.y -= 1.8;
      t.opacity -= 0.025;

      ctx.save();
      ctx.fillStyle = t.color;
      ctx.globalAlpha = Math.max(0, t.opacity);
      ctx.font = `bold ${t.size}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });

    floatingTextsRef.current = floatingTextsRef.current.filter(t => t.opacity > 0);
  };

  const drawBuddiesLayer = (ctx: CanvasRenderingContext2D) => {
    const buddyList: BuddyInstance[] = buddyManagerRef.current.getActive();

    buddyList.forEach(b => {
      const curY = b.y - b.bounceOffset;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, b.alpha));
      ctx.translate(b.x, curY);
      ctx.scale(b.scale, b.scale);

      // Final Striker Crown / Aura
      if (b.isFinalStriker) {
        ctx.font = '28px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', 0, -42);

        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 24;
      } else {
        ctx.shadowColor = b.glowColor;
        ctx.shadowBlur = 12;
      }

      // Outer Rarity Glow Ring
      ctx.strokeStyle = b.glowColor;
      ctx.lineWidth = 3;
      ctx.fillStyle = '#0f172a';

      // Shape: circle / shield / hexagon
      if (b.buddyType === 'shield') {
        ctx.beginPath();
        ctx.moveTo(0, -28);
        ctx.lineTo(24, -14);
        ctx.lineTo(24, 12);
        ctx.lineTo(0, 28);
        ctx.lineTo(-24, 12);
        ctx.lineTo(-24, -14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (b.buddyType === 'hexagon') {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const px = 26 * Math.cos(angle);
          const py = 26 * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Circle base
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Initial letter in center
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.username.slice(0, 2).toUpperCase(), 0, 0);

      // Name Tag
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-42, 34, 84, 18, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillText(b.username.slice(0, 10), 0, 43);

      // Speech bubble if active
      if (b.speechText && b.speechTimer && b.speechTimer > Date.now()) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        const bubbleW = Math.min(220, Math.max(90, b.speechText.length * 9));
        ctx.beginPath();
        ctx.roundRect(-bubbleW / 2, -75, bubbleW, 30, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText(b.speechText, 0, -60);
      }

      ctx.restore();
    });
  };

  // Recent chat, stacked bottom-left above the buddy lanes
  const drawChatLayer = (ctx: CanvasRenderingContext2D) => {
    if (!showChatRef.current) return;
    const now = Date.now();
    chatLinesRef.current = chatLinesRef.current.filter(l => now - l.at < CHAT_LINE_TTL_MS);
    const lines = chatLinesRef.current;
    if (lines.length === 0) return;

    const boxW = Math.min(width * 0.6, 520);
    const lineH = 34;
    const x = 24;
    const bottom = height * (isPortrait ? 0.80 : 0.74);

    ctx.save();
    ctx.font = '600 16px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const y = bottom - (lines.length - 1 - i) * lineH;
      const age = now - l.at;
      ctx.globalAlpha = Math.max(0, Math.min(1, (CHAT_LINE_TTL_MS - age) / 1500));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.beginPath();
      ctx.roundRect(x, y - lineH / 2 + 2, boxW, lineH - 4, 8);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      const name = l.username.slice(0, 14) + ': ';
      ctx.fillText(name, x + 10, y);
      const nameW = ctx.measureText(name).width;
      ctx.fillStyle = '#f8fafc';
      let msg = l.message;
      while (msg.length > 1 && ctx.measureText(msg).width > boxW - nameW - 24) msg = msg.slice(0, -1);
      ctx.fillText(msg === l.message ? msg : msg + '…', x + 10 + nameW, y);
    });
    ctx.restore();
  };

  const drawBannerAlert = (ctx: CanvasRenderingContext2D, alert: { title: string; subtitle: string; color: string }) => {
    const q = getQuadrantCoords('TOP_CENTER', 0, 30);
    const bannerW = Math.min(width * 0.75, 540);
    const bannerH = 75;
    const bannerX = q.x + (q.cellW - bannerW) / 2;
    const bannerY = q.y;

    ctx.save();
    ctx.shadowColor = alert.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = alert.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = alert.color;
    ctx.font = '900 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(alert.title, bannerX + bannerW / 2, bannerY + 28);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText(alert.subtitle, bannerX + bannerW / 2, bannerY + 54);
    ctx.restore();
  };

  const drawSupportersWidget = (ctx: CanvasRenderingContext2D) => {
    // Shown only when the admin toggle is ON and at least one viewer meets the criteria
    if (!supporters || !supporters.enabled || supporters.entries.length === 0) return;
    const leaderboard = supporters.entries;

    // Anchor: TOP_RIGHT
    const pad = 24;
    const cardW = isPortrait ? 240 : 280;
    const cardH = 34 + leaderboard.slice(0, 8).length * 28;
    const cardX = width - cardW - pad;
    const cardY = pad;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 10);
    ctx.fill();
    ctx.stroke();

    // Header
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🏆 TOP STREAM SUPPORTERS', cardX + 14, cardY + 22);

    // Rows
    leaderboard.slice(0, 8).forEach((entry, idx) => {
      const rowY = cardY + 48 + idx * 28;
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '✨';

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText(`${medal} ${entry.username.slice(0, 11)}`, cardX + 14, rowY);

      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${entry.value}`, cardX + cardW - 14, rowY);
      ctx.textAlign = 'left';
    });
    ctx.restore();
  };

  return (
    <div 
      ref={containerRef}
      className={`fabric-overlay-container relative select-none overflow-hidden ${isObsSource ? 'bg-transparent w-full h-full' : 'shadow-2xl rounded-xl border border-slate-700/60'}`}
      style={{
        width: isObsSource ? '100%' : `${width * scale}px`,
        height: isObsSource ? '100%' : `${height * scale}px`,
        maxWidth: isObsSource ? 'none' : '100%',
        aspectRatio: isPortrait ? '9/16' : '16/9'
      }}
    >
      <canvas 
        ref={canvasRef} 
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  );
};
