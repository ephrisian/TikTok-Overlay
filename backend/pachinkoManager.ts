import { PachinkoDropEvent, PachinkoSlot, RarityTier } from './types.ts';
import { db } from './db.ts';

export const PACHINKO_SLOTS: PachinkoSlot[] = [
  { index: 0, label: 'COMMON', tier: 'common', color: '#10b981', glow: 'rgba(16, 185, 129, 0.6)', probability: 0.40 },
  { index: 1, label: 'RARE', tier: 'rare', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.7)', probability: 0.30 },
  { index: 2, label: 'EPIC', tier: 'epic', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.8)', probability: 0.20 },
  { index: 3, label: 'LEGENDARY', tier: 'legendary', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.95)', probability: 0.10 }
];

export class PachinkoManager {
  private lastGlobalDropTime = 0;
  private userDropTimes: Record<string, number> = {};
  public readonly globalCooldownMs = 300;   // 300ms debounce to prevent same-tick duplicates while allowing rapid consecutive drops
  public readonly userCooldownMs = 1500;   // 1.5s per-user debounce

  public canDrop(userId: string): { allowed: boolean; reason?: string; remainingMs?: number } {
    const now = Date.now();
    const globalElapsed = now - this.lastGlobalDropTime;
    if (globalElapsed < this.globalCooldownMs) {
      return { 
        allowed: false, 
        reason: 'global_cooldown', 
        remainingMs: this.globalCooldownMs - globalElapsed 
      };
    }

    const userLastDrop = this.userDropTimes[userId] || 0;
    const userElapsed = now - userLastDrop;
    if (userElapsed < this.userCooldownMs) {
      return { 
        allowed: false, 
        reason: 'user_cooldown', 
        remainingMs: this.userCooldownMs - userElapsed 
      };
    }

    return { allowed: true };
  }

  public triggerDropIfAllowed(
    userId: string,
    username: string,
    pfpUrl: string,
    forcedTier?: RarityTier,
    sourceRule?: string
  ): PachinkoDropEvent | null {
    const check = this.canDrop(userId);
    if (!check.allowed) {
      const remainingSec = Math.ceil((check.remainingMs || 0) / 1000);
      console.log(`[Pachinko] Suppressed drop for @${username} (${check.reason}: ${remainingSec}s remaining)${sourceRule ? ` from Rule "${sourceRule}"` : ''}`);
      return null;
    }

    console.log(`[Pachinko] Triggered drop for @${username}${sourceRule ? ` from Rule "${sourceRule}"` : ''}`);
    const drop = this.generateDrop(userId, username, pfpUrl, forcedTier);
    
    // Update cooldown timestamps
    const now = Date.now();
    this.lastGlobalDropTime = now;
    this.userDropTimes[userId] = now;

    return drop;
  }

  // Generate a pachinko drop simulation with initial physical launch parameters
  public generateDrop(userId: string, username: string, pfpUrl: string, forcedTier?: RarityTier): PachinkoDropEvent {
    // Initial drop entry point within top hopper
    const initialXRatio = 0.5 + (Math.random() - 0.5) * 0.14;
    // Initial release impulse
    const initialVx = (Math.random() - 0.5) * 1.2;

    const defaultSlot = PACHINKO_SLOTS[0];
    return {
      userId,
      username,
      pfpUrl,
      initialXRatio,
      initialVx,
      tier: forcedTier || defaultSlot.tier,
      glowColor: defaultSlot.color,
      slotIndex: defaultSlot.index
    };
  }
}

export const pachinkoManager = new PachinkoManager();
