export function triggerHaptic(type: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return;
  try {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(25);
        break;
      case 'success':
        navigator.vibrate([15, 40, 20]);
        break;
      case 'warning':
        navigator.vibrate([30, 60, 30]);
        break;
    }
  } catch {}
}

let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playCinemaSound(type: 'popcorn' | 'reaction' | 'join' | 'sync' | 'play') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'reaction' || type === 'popcorn') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'join') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.2);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'sync' || type === 'play') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch {}
}

/**
 * Synthesizes a Netflix-inspired kinematic "TA-DUM" theater bass impact + crystalline fifth bloom
 */
export function playNaimcineIntroSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Hit 1: Deep punchy theater timpani ("TA")
    const sub1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    sub1.type = 'triangle';
    sub1.frequency.setValueAtTime(110, now);
    sub1.frequency.exponentialRampToValueAtTime(55, now + 0.18);
    g1.gain.setValueAtTime(0.22, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    sub1.connect(g1);
    g1.connect(ctx.destination);
    sub1.start(now);
    sub1.stop(now + 0.23);

    // Hit 2: Resonant chord bloom ("DUMMMM") at +0.22s (D2 + A2 + F#3 + D4)
    const freqs = [73.42, 110.0, 185.0, 293.66];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f * 0.99, now + 0.22);
      osc.frequency.exponentialRampToValueAtTime(f, now + 0.34);
      const peak = idx === 0 ? 0.24 : 0.09 / idx;
      g.gain.setValueAtTime(0.0001, now + 0.21);
      g.gain.linearRampToValueAtTime(peak, now + 0.27);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 1.85);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + 0.21);
      osc.stop(now + 1.9);
    });
  } catch {}
}

