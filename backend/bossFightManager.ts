import { 
  BossFightState, 
  BossModel, 
  BossPhase, 
  BossAttackTriggerType, 
  BossAttackPattern 
} from './types.ts';

const BOSS_PRESETS: Omit<BossModel, 'currentHp'>[] = [
  {
    id: 'boss_inferno_dragon',
    name: 'IGNIS THE INFERNO WYRM',
    title: 'Cataclysmic Fire Elemental',
    type: 'fire_dragon',
    maxHp: 250,
    glowColor: '#ef4444',
    durationSeconds: 60
  },
  {
    id: 'boss_cyber_mech',
    name: 'TITAN-X PRIME',
    title: 'Neon Armored Battlemech',
    type: 'cyber_mech',
    maxHp: 400,
    glowColor: '#06b6d4',
    durationSeconds: 75
  },
  {
    id: 'boss_slime_king',
    name: 'KING JELLIOUS IV',
    title: 'Bouncing Toxic Sovereign',
    type: 'slime_king',
    maxHp: 300,
    glowColor: '#10b981',
    durationSeconds: 60
  },
  {
    id: 'boss_void_titan',
    name: 'NULL-VOID CHRONOS',
    title: 'Interdimensional Celestial Ruler',
    type: 'void_titan',
    maxHp: 500,
    glowColor: '#8b5cf6',
    durationSeconds: 90
  }
];

export class BossFightManager {
  private state: BossFightState;
  private timerInterval: NodeJS.Timeout | null = null;
  private onStateChange: ((state: BossFightState) => void) | null = null;
  private onAttackVfx: ((vfx: any) => void) | null = null;

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): BossFightState {
    const bossPreset = BOSS_PRESETS[0];
    return {
      active: false,
      phase: 'ended',
      outcome: null,
      boss: {
        ...bossPreset,
        currentHp: bossPreset.maxHp
      },
      timeRemaining: bossPreset.durationSeconds,
      triggerType: 'both',
      attackPattern: 'lowest_first',
      incomingText: '⚠️ BOSS INCOMING! PREPARE FOR BATTLE!',
      prepText: '⚡ TAP TO CHARGE ATTACKS! GIFTS POWER UP STRIKES!',
      battleHypeText: '🔥 BOSS ATTACK PHASE! UNLEASH YOUR FURY!',
      victoryText: '🏆 VICTORY! BOSS VANQUISHED BY CHAT!',
      defeatText: '💀 BOSS SURVIVED & RETREATED... NEXT TIME!',
      glowColor: bossPreset.glowColor,
      participants: {},
      scalingCount: 0
    };
  }

  public setCallbacks(
    onStateChange: (state: BossFightState) => void,
    onAttackVfx: (vfx: any) => void
  ) {
    this.onStateChange = onStateChange;
    this.onAttackVfx = onAttackVfx;
  }

  public getState(): BossFightState {
    return this.state;
  }

  public startBoss(bossTypeIndex = 0, customSettings?: Partial<BossFightState>) {
    this.stopTimer();

    const selectedPreset = BOSS_PRESETS[bossTypeIndex % BOSS_PRESETS.length];
    const scaledMaxHp = Math.round(selectedPreset.maxHp * (1 + this.state.scalingCount * 0.25));
    
    this.state = {
      ...this.state,
      ...customSettings,
      active: true,
      phase: 'incoming',
      outcome: null,
      boss: {
        ...selectedPreset,
        maxHp: scaledMaxHp,
        currentHp: scaledMaxHp
      },
      timeRemaining: selectedPreset.durationSeconds,
      glowColor: selectedPreset.glowColor,
      participants: {},
      finalStriker: undefined
    };

    this.broadcast();

    // Transition to Prep phase after 4 seconds of Incoming alert
    setTimeout(() => {
      if (this.state.active && this.state.phase === 'incoming') {
        this.state.phase = 'prep';
        this.broadcast();

        // Transition to Battle phase after 6 seconds of Prep
        setTimeout(() => {
          if (this.state.active && this.state.phase === 'prep') {
            this.state.phase = 'battle';
            this.startTimer();
            this.broadcast();
          }
        }, 6000);
      }
    }, 4500);
  }

  private startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.state.phase !== 'battle') {
        this.stopTimer();
        return;
      }
      this.state.timeRemaining -= 1;
      if (this.state.timeRemaining <= 0) {
        this.endBoss('defeat');
      } else {
        this.broadcast();
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  public registerAttack(
    userId: string, 
    username: string, 
    pfpUrl: string, 
    source: 'tap' | 'gift', 
    multiplier = 1
  ): boolean {
    if (!this.state.active || this.state.phase !== 'battle') {
      return false;
    }

    // Check trigger compatibility
    if (this.state.triggerType === 'taps_only' && source !== 'tap') return false;
    if (this.state.triggerType === 'gifts_only' && source !== 'gift') return false;

    // Calculate base damage
    let damage = source === 'gift' ? Math.max(15, multiplier * 10) : Math.max(1, multiplier);

    // Track participant
    if (!this.state.participants[userId]) {
      this.state.participants[userId] = {
        username,
        pfpUrl,
        damage: 0,
        lastAttackAt: Date.now()
      };
    }
    this.state.participants[userId].damage += damage;
    this.state.participants[userId].lastAttackAt = Date.now();

    const previousHp = this.state.boss.currentHp;
    this.state.boss.currentHp = Math.max(0, previousHp - damage);

    // Check if Final Strike
    const isFinalStrike = previousHp > 0 && this.state.boss.currentHp === 0;
    if (isFinalStrike) {
      this.state.finalStriker = { userId, username, pfpUrl };
    }

    // Emit projectile attack VFX event for the canvas overlay
    if (this.onAttackVfx) {
      this.onAttackVfx({
        userId,
        username,
        pfpUrl,
        damage,
        source,
        isFinalStrike,
        timestamp: Date.now()
      });
    }

    if (isFinalStrike) {
      this.endBoss('victory');
    } else {
      this.broadcast();
    }

    return true;
  }

  public endBoss(outcome: 'victory' | 'defeat') {
    this.stopTimer();
    this.state.phase = 'ended';
    this.state.outcome = outcome;
    if (outcome === 'victory') {
      this.state.scalingCount += 1;
    }
    this.broadcast();

    // Auto cleanup after victory/defeat animation has played (8 seconds)
    setTimeout(() => {
      if (this.state.phase === 'ended') {
        this.state.active = false;
        this.broadcast();
      }
    }, 8000);
  }

  public stopBossManually() {
    this.stopTimer();
    this.state.active = false;
    this.state.phase = 'ended';
    this.state.outcome = null;
    this.broadcast();
  }

  public setTriggerType(type: BossAttackTriggerType) {
    this.state.triggerType = type;
    this.broadcast();
  }

  public setAttackPattern(pattern: BossAttackPattern) {
    this.state.attackPattern = pattern;
    this.broadcast();
  }

  private broadcast() {
    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }
}

export const bossManager = new BossFightManager();
