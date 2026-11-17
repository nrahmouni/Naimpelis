import { triggerHaptic } from '../../utils/haptics';

export type KidsSoundEffect = 'tap' | 'success' | 'error' | 'star' | 'levelUp' | 'chest';

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
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.012);
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
        playTone(ctx, 520, 680, 0, 0.075, 'sine', 0.12);
        break;
      case 'success':
        playTone(ctx, 523.25, 523.25, 0, 0.11, 'triangle', 0.14);
        playTone(ctx, 659.25, 659.25, 0.07, 0.13, 'triangle', 0.14);
        playTone(ctx, 783.99, 783.99, 0.14, 0.22, 'sine', 0.15);
        break;
      case 'error':
        // Gentle warm woodblock tone — never harsh or punitive for young kids
        playTone(ctx, 240, 185, 0, 0.16, 'sine', 0.12);
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
