import { PachinkoDropEvent, PachinkoSlot, RarityTier } from './types.ts';
import { db } from './db.ts';

export const PACHINKO_SLOTS: PachinkoSlot[] = [
  { index: 0, label: 'COMMON', tier: 'common', color: '#10b981', glow: 'rgba(16, 185, 129, 0.6)', probability: 0.40 },
  { index: 1, label: 'RARE', tier: 'rare', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.7)', probability: 0.30 },
  { index: 2, label: 'EPIC', tier: 'epic', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.8)', probability: 0.20 },
  { index: 3, label: 'LEGENDARY', tier: 'legendary', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.95)', probability: 0.10 }
];

export class PachinkoManager {
  // Generate a pachinko drop simulation with slot outcome
  public generateDrop(userId: string, username: string, pfpUrl: string, forcedTier?: RarityTier): PachinkoDropEvent {
    let chosenSlot: PachinkoSlot;

    if (forcedTier) {
      chosenSlot = PACHINKO_SLOTS.find(s => s.tier === forcedTier) || PACHINKO_SLOTS[0];
    } else {
      const rand = Math.random();
      let accum = 0;
      chosenSlot = PACHINKO_SLOTS[0];
      for (const slot of PACHINKO_SLOTS) {
        accum += slot.probability;
        if (rand <= accum) {
          chosenSlot = slot;
          break;
        }
      }
    }

    // Generate bounce path coordinates for 5 peg rows
    // normalized between 0.15 and 0.85 of width
    const rows = 6;
    const dropPathX: number[] = [];
    let curX = 0.5 + (Math.random() - 0.5) * 0.15; // start near top center
    dropPathX.push(curX);

    for (let r = 0; r < rows; r++) {
      const deflection = (Math.random() - 0.5) * 0.18;
      curX = Math.max(0.12, Math.min(0.88, curX + deflection));
      dropPathX.push(curX);
    }

    // Final target slot position based on index (0, 1, 2, 3)
    const slotXPositions = [0.22, 0.41, 0.59, 0.78];
    dropPathX.push(slotXPositions[chosenSlot.index]);

    // Update user in DB with their won rarity tier and glow color
    db.updateUserRarity(userId, chosenSlot.tier, chosenSlot.color);

    return {
      userId,
      username,
      pfpUrl,
      slotIndex: chosenSlot.index,
      tier: chosenSlot.tier,
      glowColor: chosenSlot.color,
      dropPathX
    };
  }
}

export const pachinkoManager = new PachinkoManager();
