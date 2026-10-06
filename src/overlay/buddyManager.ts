import type { BuddyExitAnimation, BuddySettings, BuddySpawnInfo, TikTokUser } from '../../backend/types.ts';

export interface BuddyRequest {
  user: Partial<TikTokUser>;
  spawn: BuddySpawnInfo;
  buddyType?: string;
}

export interface BuddyInstance {
  instanceId: string;
  userId: string;
  username: string;
  buddyType: string;
  glowColor: string;
  // Provenance: which rule fired and which event caused it
  ruleId: string;
  ruleName: string;
  eventType: string;
  phase: 'entering' | 'alive' | 'exiting';
  slot: number;
  spawnedAt: number;
  expiresAt: number;
  phaseStartedAt: number;
  exitAnimation: BuddyExitAnimation;
  lifetimeMs: number;
  x: number;
  y: number;
  alpha: number;
  scale: number;
  bounceOffset: number;
  speechText?: string;
  speechTimer?: number;
  isFinalStriker?: boolean;
}

export interface BuddyLayout {
  width: number;
  height: number;
  baselineY: number; // resting y of a buddy's center
  slotWidth: number; // minimum lane width
  margin: number;
}

const ENTER_MS = 600;
const EXIT_MS = 600;
const FAST_EXIT_MS = 250;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Lane-based buddy layout. Every buddy owns exactly one slot along the bottom of the canvas,
 * so two buddies can never share a position. Extra spawns are queued (or replace the oldest).
 * Drift is limited to a fraction of the lane width so neighbours never touch.
 */
export class BuddyManager {
  private active: BuddyInstance[] = [];
  private queue: BuddyRequest[] = [];
  private layout: BuddyLayout;
  private maxOnScreen = 8;
  private settings: BuddySettings = {
    defaultLifetimeMs: 10000,
    defaultExitAnimation: 'fade',
    overflowBehavior: 'queue',
    maxQueue: 8
  };

  constructor(layout: BuddyLayout) {
    this.layout = layout;
  }

  setLayout(layout: BuddyLayout) {
    this.layout = layout;
  }

  configure(settings: Partial<BuddySettings> | undefined, maxOnScreen?: number) {
    if (settings) this.settings = { ...this.settings, ...settings };
    if (maxOnScreen && maxOnScreen > 0) this.maxOnScreen = maxOnScreen;
  }

  clear() {
    this.active = [];
    this.queue = [];
  }

  getActive(): BuddyInstance[] {
    return this.active;
  }

  getQueueLength() {
    return this.queue.length;
  }

  findByUser(userId: string): BuddyInstance | undefined {
    return this.active.find(b => b.userId === userId && b.phase !== 'exiting');
  }

  get slotCount(): number {
    const { width, margin, slotWidth } = this.layout;
    const fit = Math.max(1, Math.floor((width - margin * 2) / slotWidth));
    return Math.max(1, Math.min(fit, this.maxOnScreen));
  }

  private get laneWidth(): number {
    return (this.layout.width - this.layout.margin * 2) / this.slotCount;
  }

  // Slots fill center-outward so a lone buddy sits mid-screen
  private slotOrder(): number[] {
    const n = this.slotCount;
    const mid = (n - 1) / 2;
    return Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  }

  slotX(slot: number): number {
    return this.layout.margin + this.laneWidth * (slot + 0.5);
  }

  spawn(req: BuddyRequest, now = Date.now()) {
    // Same viewer re-triggered: extend the existing buddy instead of stacking a duplicate
    const uid = req.user.id;
    const existing = uid ? this.findByUser(uid) : undefined;
    if (existing) {
      existing.expiresAt = now + req.spawn.lifetimeMs;
      existing.lifetimeMs = req.spawn.lifetimeMs;
      existing.ruleId = req.spawn.ruleId;
      existing.ruleName = req.spawn.ruleName;
      existing.eventType = req.spawn.eventType;
      existing.bounceOffset = 20;
      return;
    }
    if (uid && this.queue.some(q => q.user.id === uid)) return;

    const slot = this.freeSlot();
    if (slot !== -1) {
      this.place(req, slot, now);
      return;
    }

    if (this.settings.overflowBehavior === 'replace_oldest') {
      const oldest = this.active
        .filter(b => b.phase !== 'exiting')
        .sort((a, b) => a.spawnedAt - b.spawnedAt)[0];
      if (oldest) this.beginExit(oldest, now, FAST_EXIT_MS);
    }
    if (this.queue.length >= this.settings.maxQueue) this.queue.shift();
    this.queue.push(req);
  }

  private freeSlot(): number {
    const used = new Set(this.active.map(b => b.slot));
    return this.slotOrder().find(s => !used.has(s)) ?? -1;
  }

  private place(req: BuddyRequest, slot: number, now: number) {
    const { user, spawn } = req;
    this.active.push({
      instanceId: spawn.instanceId,
      userId: user.id || spawn.instanceId,
      username: user.username || 'viewer',
      buddyType: req.buddyType || user.buddy_type || 'circle',
      glowColor: user.glow_color || '#10b981',
      ruleId: spawn.ruleId,
      ruleName: spawn.ruleName,
      eventType: spawn.eventType,
      phase: 'entering',
      slot,
      spawnedAt: now,
      expiresAt: now + spawn.lifetimeMs,
      phaseStartedAt: now,
      exitAnimation: spawn.exitAnimation,
      lifetimeMs: spawn.lifetimeMs,
      x: this.slotX(slot),
      y: this.layout.height + 80,
      alpha: 0,
      scale: 1,
      bounceOffset: 0
    });
  }

  private beginExit(b: BuddyInstance, now: number, durationMs = EXIT_MS) {
    if (b.phase === 'exiting') return;
    b.phase = 'exiting';
    b.phaseStartedAt = now;
    b.expiresAt = now + durationMs;
  }

  /** Advance state + positions. Call once per frame. */
  update(now = Date.now()) {
    const { height, baselineY } = this.layout;
    const n = this.slotCount;
    const driftAmp = Math.min(14, this.laneWidth * 0.12);

    for (const b of this.active) {
      if (b.slot >= n && b.phase !== 'exiting') this.beginExit(b, now, FAST_EXIT_MS);

      const age = now - b.phaseStartedAt;
      const laneX = this.slotX(Math.min(b.slot, n - 1));
      const t = (now - b.spawnedAt) / 1000;
      const bobY = Math.sin(t * 2.2 + b.slot) * 6;
      const driftX = Math.sin(t * 0.9 + b.slot * 1.7) * driftAmp;

      if (b.bounceOffset > 0) b.bounceOffset = Math.max(0, b.bounceOffset - 1.2);

      if (b.phase === 'entering') {
        const p = Math.min(1, age / ENTER_MS);
        const startY = height + 80;
        b.x = laneX;
        b.y = startY + (baselineY - startY) * easeOutBack(p);
        b.alpha = easeOutCubic(p);
        b.scale = 1;
        if (p >= 1) {
          b.phase = 'alive';
          b.phaseStartedAt = now;
        }
        if (now >= b.expiresAt) this.beginExit(b, now);
      } else if (b.phase === 'alive') {
        b.x = laneX + driftX;
        b.y = baselineY + bobY;
        b.alpha = 1;
        b.scale = 1;
        if (now >= b.expiresAt) this.beginExit(b, now);
      } else {
        const total = Math.max(1, b.expiresAt - b.phaseStartedAt);
        const p = Math.min(1, age / total);
        const baseY = baselineY + bobY;
        b.x = laneX + driftX;
        if (b.exitAnimation === 'slide') {
          b.y = baseY + (height + 100 - baseY) * p * p;
          b.alpha = 1;
          b.scale = 1;
        } else if (b.exitAnimation === 'shrink') {
          b.y = baseY;
          b.alpha = 1 - p;
          b.scale = Math.max(0.01, 1 - p);
        } else {
          b.y = baseY - 20 * p;
          b.alpha = 1 - p;
          b.scale = 1;
        }
      }
    }

    this.active = this.active.filter(b => !(b.phase === 'exiting' && now >= b.expiresAt));

    while (this.queue.length > 0) {
      const slot = this.freeSlot();
      if (slot === -1) break;
      this.place(this.queue.shift()!, slot, now);
    }
  }
}
