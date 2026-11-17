import { triggerHaptic } from '../../utils/haptics';

export type KidsSoundEffect = 'tap' | 'success' | 'error' | 'star' | 'levelUp' | 'chest';
export type KidsSynthPreset = 'marimba' | 'space' | 'crystal';

let kidsAudioCtx: AudioContext | null = null;

function ensureKidsAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!kidsAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      kidsAudioCtx = new AudioCtx();
    }
  }
  if (kidsAudioCtx && kidsAudioCtx.state === 'suspended') {
    kidsAudioCtx.resume().catch(() => {});
  }
  return kidsAudioCtx;
}

function playTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  startOffsetSec: number,
  durationSec: number,
  type: OscillatorType,
  peakGain: number
) {
  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/**
 * Zero-latency synthesized Web Audio sound effects for Riffan Kids.
 * Never fails due to missing audio assets or restricted network WebViews.
 */
export function playKidsSound(
  effect: KidsSoundEffect,
  soundEnabled = true,
  withHaptic = true
): void {
  if (withHaptic) {
    if (effect === 'tap') triggerHaptic('light');
    else if (effect === 'error') triggerHaptic('warning');
    else triggerHaptic('success');
  }

  if (!soundEnabled) return;

  try {
    const ctx = ensureKidsAudioCtx();
    if (!ctx) return;

    switch (effect) {
      case 'tap':
        playTone(ctx, 520, 680, 0, 0.075, 'sine', 0.11);
        break;
      case 'success':
        playTone(ctx, 523.25, 523.25, 0, 0.11, 'triangle', 0.14);
        playTone(ctx, 659.25, 659.25, 0.07, 0.13, 'triangle', 0.14);
        playTone(ctx, 783.99, 783.99, 0.14, 0.22, 'sine', 0.15);
        break;
      case 'error':
        playTone(ctx, 230, 170, 0, 0.16, 'sine', 0.12);
        break;
      case 'star':
        playTone(ctx, 880, 1174.66, 0, 0.14, 'sine', 0.13);
        playTone(ctx, 1318.51, 1567.98, 0.06, 0.2, 'sine', 0.11);
        break;
      case 'chest':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          playTone(ctx, freq, freq, i * 0.06, 0.24, 'triangle', 0.13);
        });
        break;
      case 'levelUp':
        [587.33, 739.99, 880, 1174.66].forEach((freq, i) => {
          playTone(ctx, freq, freq * 1.01, i * 0.075, 0.26, 'sine', 0.14);
        });
        break;
    }
  } catch {
    // ignore WebAudio restrictions in headless browsers
  }
}

const PENTATONIC_HZ = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

/**
 * Ascending pentatonic chime scaled by current combo streak.
 */
export function playKidsComboNote(comboIndex: number, soundEnabled = true): void {
  if (!soundEnabled) return;
  try {
    const ctx = ensureKidsAudioCtx();
    if (!ctx) return;
    const hz = PENTATONIC_HZ[Math.min(PENTATONIC_HZ.length - 1, Math.max(0, comboIndex))];
    playTone(ctx, hz, hz * 1.01, 0, 0.16, 'triangle', 0.14);
    playTone(ctx, hz * 2, hz * 2, 0.02, 0.12, 'sine', 0.05);
  } catch {
    // ignore
  }
}

/**
 * Crisp upward bubble-pop sound for underwater math & pop effects.
 */
export function playKidsBubblePop(soundEnabled = true): void {
  if (!soundEnabled) return;
  try {
    const ctx = ensureKidsAudioCtx();
    if (!ctx) return;
    playTone(ctx, 320, 960, 0, 0.09, 'sine', 0.16);
    playTone(ctx, 760, 1280, 0.04, 0.08, 'sine', 0.09);
  } catch {
    // ignore
  }
}

/**
 * Bright power-up pickup arpeggio (Magnet, Shield, Fever).
 */
export function playKidsPowerupSound(soundEnabled = true): void {
  if (!soundEnabled) return;
  try {
    const ctx = ensureKidsAudioCtx();
    if (!ctx) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((hz, idx) => {
      playTone(ctx, hz, hz * 1.02, idx * 0.045, 0.18, 'sine', 0.12);
    });
  } catch {
    // ignore
  }
}

/**
 * Soft tactile card flip sound.
 */
export function playKidsCardFlip(soundEnabled = true): void {
  if (!soundEnabled) return;
  try {
    const ctx = ensureKidsAudioCtx();
    if (!ctx) return;
    playTone(ctx, 380, 560, 0, 0.065, 'triangle', 0.09);
  } catch {
    // ignore
  }
}

/**
 * Shield deflect thump when absorbing an asteroid hit.
 */
export function playKidsShieldHit(soundEnabled = true): void {
  if (!soundEnabled) return;
  try {
    const ctx = ensureKidsAudioCtx();
    if (!ctx) return;
    playTone(ctx, 210, 95, 0, 0.22, 'sawtooth', 0.1);
  } catch {
    // ignore
  }
}

/**
 * Dual-oscillator musical instrument voice for the Simon / DJ Synth game.
 */
export function playKidsSynthNote(
  hz: number,
  soundEnabled = true,
  durationSec = 0.34,
  preset: KidsSynthPreset = 'marimba'
): void {
  if (!soundEnabled) return;
  try {
    const ctx = ensureKidsAudioCtx();
    if (!ctx) return;
    if (preset === 'marimba') {
      playTone(ctx, hz, hz, 0, durationSec, 'triangle', 0.18);
      playTone(ctx, hz * 4, hz * 4, 0, durationSec * 0.35, 'sine', 0.05);
    } else if (preset === 'space') {
      playTone(ctx, hz * 0.99, hz * 1.01, 0, durationSec * 1.15, 'sawtooth', 0.08);
      playTone(ctx, hz * 0.5, hz * 0.5, 0, durationSec, 'sine', 0.12);
    } else {
      playTone(ctx, hz, hz, 0, durationSec * 1.2, 'sine', 0.16);
      playTone(ctx, hz * 2, hz * 2, 0.01, durationSec * 0.85, 'triangle', 0.07);
    }
  } catch {
    // ignore
  }
}

export function playKidsNoteHz(
  hz: number,
  soundEnabled = true,
  durationSec = 0.28
): void {
  playKidsSynthNote(hz, soundEnabled, durationSec, 'marimba');
}
