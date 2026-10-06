// High-fidelity Web Audio sound effects synthesizer for OBS Overlay and Streamer Studio

class SoundFXEngine {
  private ctx: AudioContext | null = null;
  private isMuted = false;

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  // Pachinko Peg deflection bounce (crisp metallic click)
  public playPegBounce() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freq = 600 + Math.random() * 800;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  // Pachinko Slot Landing (Chime / Arpeggio)
  public playSlotLanding(tier: 'common' | 'rare' | 'epic' | 'legendary') {
    const ctx = this.getContext();
    if (!ctx) return;

    const baseFreqs = tier === 'legendary' 
      ? [523.25, 659.25, 783.99, 1046.5] // C Major fanfare
      : tier === 'epic'
      ? [440, 554.37, 659.25] // A Major
      : tier === 'rare'
      ? [392, 493.88, 587.33] // G Major
      : [329.63, 392]; // E Minor/neutral

    baseFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = tier === 'legendary' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      const startTime = ctx.currentTime + idx * 0.08;
      const duration = 0.35;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  }

  // Boss Incoming warning siren / foghorn
  public playBossIncoming() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    // Deep siren foghorn glide
    osc1.frequency.setValueAtTime(140, ctx.currentTime);
    osc1.frequency.linearRampToValueAtTime(190, ctx.currentTime + 0.6);
    osc1.frequency.linearRampToValueAtTime(120, ctx.currentTime + 1.2);

    osc2.frequency.setValueAtTime(70, ctx.currentTime);
    osc2.frequency.linearRampToValueAtTime(95, ctx.currentTime + 0.6);
    osc2.frequency.linearRampToValueAtTime(60, ctx.currentTime + 1.2);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 1.4);
    osc2.stop(ctx.currentTime + 1.4);
  }

  // Boss Battle Attack Hit
  public playAttackHit(isGift = false) {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isGift ? 'sawtooth' : 'square';
    const startFreq = isGift ? 900 : 450;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(isGift ? 0.15 : 0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  }

  // Final Strike Dramatic Explosion & Victory Fanfare
  public playFinalStrike() {
    const ctx = this.getContext();
    if (!ctx) return;

    // Dramatic thunder boom
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.8);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.85);

    // Triumphant Fanfare Arpeggio
    const chords = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    chords.forEach((freq, idx) => {
      const fOsc = ctx.createOscillator();
      const fGain = ctx.createGain();

      fOsc.type = 'sine';
      fOsc.frequency.setValueAtTime(freq, ctx.currentTime + 0.3 + idx * 0.12);

      const sTime = ctx.currentTime + 0.3 + idx * 0.12;
      fGain.gain.setValueAtTime(0, sTime);
      fGain.gain.linearRampToValueAtTime(0.15, sTime + 0.05);
      fGain.gain.exponentialRampToValueAtTime(0.001, sTime + 0.6);

      fOsc.connect(fGain);
      fGain.connect(ctx.destination);

      fOsc.start(sTime);
      fOsc.stop(sTime + 0.65);
    });
  }

  // Like Burst Pop
  public playLikePop() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(350 + Math.random() * 200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }
}

export const soundFX = new SoundFXEngine();
