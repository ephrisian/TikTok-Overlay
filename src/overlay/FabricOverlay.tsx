import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
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
  SupportersPayload
} from '../../backend/types.ts';
import { soundFX } from '../audio/soundFX.ts';
import { BuddyManager, BuddyInstance } from './buddyManager.ts';

interface FabricOverlayProps {
  aspectRatio?: AspectRatio;
  scale?: number;
  isObsSource?: boolean;
  onStatsUpdate?: (stats: any) => void;
  showGuides?: boolean;
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
  currentX: number;
  currentY: number;
  pathIndex: number;
  dropPathX: number[];
  vy: number;
  completed: boolean;
}

export const FabricOverlay: React.FC<FabricOverlayProps> = ({
  aspectRatio = '9:16',
  scale = 1,
  isObsSource = false,
  onStatsUpdate,
  showGuides = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

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
  const pachinkoBallsRef = useRef<ActivePachinkoBall[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const showChatRef = useRef(false);
  const chatLinesRef = useRef<Array<{ id: string; username: string; message: string; at: number }>>([]);

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
        if (payload.settings) showChatRef.current = !!payload.settings.showChat;
        if (payload.settings) buddyManagerRef.current.configure(payload.settings.buddies, payload.settings.maxBuddiesOnScreen);
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
        // Limit on-screen pachinko balls to prevent flooding or collision loops
        if (pachinkoBallsRef.current.length >= 2) {
          console.warn('[Overlay] Pachinko ball ignored: maximum on-screen capacity reached (2)');
          break;
        }
        pachinkoBallsRef.current.push({
          id: 'pach_' + Math.random(),
          userId: drop.userId,
          username: drop.username,
          pfpUrl: drop.pfpUrl,
          tier: drop.tier,
          glowColor: drop.glowColor,
          currentX: width * drop.dropPathX[0],
          currentY: 40,
          pathIndex: 0,
          dropPathX: drop.dropPathX,
          vy: 4,
          completed: false
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

  // Initialize Fabric Canvas & Render Loop
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      selection: false,
      renderOnAddRemove: false,
      backgroundColor: 'transparent'
    });
    fabricCanvasRef.current = canvas;

    let animationFrameId: number;
    let tick = 0;

    const renderLoop = () => {
      tick++;
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Aspect Ratio Quadrant Guides if enabled
      if (showGuides) {
        drawQuadrantGuides(ctx);
      }

      // 2. Draw Pachinko Board Pegs and Falling Drops
      drawPachinkoLayer(ctx, tick);

      // 3. Draw Boss Fight Overlay Layer
      if (bossState && bossState.active) {
        drawBossLayer(ctx, bossState, tick);
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
      if (bannerAlert) {
        drawBannerAlert(ctx, bannerAlert);
      }

      // 8. Draw Leaderboard Widget (pinned to TOP_RIGHT or MIDDLE_RIGHT)
      drawSupportersWidget(ctx);

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.dispose();
    };
  }, [width, height, showGuides, bossState, bannerAlert, supporters]);

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

  const drawPachinkoLayer = (ctx: CanvasRenderingContext2D, tick: number) => {
    // Only show board if active drops exist or briefly on join
    const hasActiveBalls = pachinkoBallsRef.current.length > 0;
    if (!hasActiveBalls) return;

    const boardTop = height * (isPortrait ? 0.08 : 0.05);
    const boardBottom = height * (isPortrait ? 0.42 : 0.45);
    const boardLeft = width * 0.12;
    const boardRight = width * 0.88;
    const boardW = boardRight - boardLeft;

    // Draw pegs
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = boardTop + (r + 1) * ((boardBottom - boardTop) / (rows + 1));
      const cols = r % 2 === 0 ? 7 : 8;
      for (let c = 0; c < cols; c++) {
        const x = boardLeft + (c + 0.5) * (boardW / cols);
        ctx.fillStyle = '#94a3b8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Draw bottom Pachinko Slots (Common, Rare, Epic, Legendary)
    const slotNames = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    const slotColors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b'];
    const slotW = boardW / 4;

    for (let i = 0; i < 4; i++) {
      const sx = boardLeft + i * slotW;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = slotColors[i];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(sx + 4, boardBottom - 30, slotW - 8, 48, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = slotColors[i];
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(slotNames[i], sx + slotW / 2, boardBottom);
    }

    // Animate falling balls
    pachinkoBallsRef.current.forEach((ball, idx) => {
      if (ball.completed) return;

      ball.vy += 0.35; // gravity
      ball.currentY += ball.vy;

      // Follow predetermined deflection path
      const targetPathIndex = Math.min(
        ball.dropPathX.length - 1,
        Math.floor(((ball.currentY - boardTop) / (boardBottom - boardTop)) * ball.dropPathX.length)
      );

      if (targetPathIndex > ball.pathIndex) {
        ball.pathIndex = targetPathIndex;
        soundFX.playPegBounce();
      }

      const targetX = width * ball.dropPathX[targetPathIndex];
      ball.currentX += (targetX - ball.currentX) * 0.22;

      // Draw Pachinko Ball Avatar
      ctx.save();
      ctx.shadowColor = ball.glowColor;
      ctx.shadowBlur = 18;
      ctx.fillStyle = ball.glowColor;
      ctx.beginPath();
      ctx.arc(ball.currentX, ball.currentY, 26, 0, Math.PI * 2);
      ctx.fill();

      // Inner avatar placeholder
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ball.currentX, ball.currentY, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Username tag
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ball.username, ball.currentX, ball.currentY - 32);

      // Check slot landing
      if (ball.currentY >= boardBottom - 10) {
        ball.completed = true;
        soundFX.playSlotLanding(ball.tier as any);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { x: ball.currentX / width, y: ball.currentY / height }
        });
      }
    });

    // Cleanup finished balls
    pachinkoBallsRef.current = pachinkoBallsRef.current.filter(b => !b.completed);
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
