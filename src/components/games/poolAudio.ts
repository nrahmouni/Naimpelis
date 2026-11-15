/**
 * Dedicated Web Audio API Synthesizer for 8-Ball Pool
 * Lightweight, zero external audio files, velocity-scaled ball clacks,
 * cushion thuds, cue strikes, and pocket drops. Never ducks or interrupts WebRTC Voice Call audio.
 */

let poolAudioCtx: AudioContext | null = null;
let lastClackAt = 0;
let lastCushionAt = 0;

function getPoolAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!poolAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      poolAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (poolAudioCtx.state === 'suspended') {
    poolAudioCtx.resume().catch(() => {});
  }
  return poolAudioCtx;
}

export function unlockPoolAudio(): void {
  getPoolAudioContext();
}

export function playPoolCueStrike(power: number, muted: boolean): void {
  if (muted) return;
  try {
    const ctx = getPoolAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const p = Math.max(0.1, Math.min(1, power));
    const vol = 0.08 + p * 0.16;

    // Crisp leather tip impact transient
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 + p * 380, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.045);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);

    // Subtle wooden shaft body resonance
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(160 + p * 40, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(95, now + 0.07);
    bodyGain.gain.setValueAtTime(vol * 0.55, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.08);
  } catch {
    // Ignore audio context restrictions safely
  }
}

export function playPoolClack(impactSpeed: number, muted: boolean): void {
  if (muted) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowMs - lastClackAt < 18) return; // Prevent burst clipping on dense rack break
  lastClackAt = nowMs;

  try {
    const ctx = getPoolAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const norm = Math.max(0.05, Math.min(1, impactSpeed / 1100));
    const vol = 0.025 + Math.pow(norm, 0.72) * 0.18;

    // Phenolic resin click: twin high-Q resonant modes
    const baseFreq = 1650 + norm * 950;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.68, now + 0.028);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * 1.92, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, now + 0.02);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * 1.2, now);
    filter.Q.setValueAtTime(2.2, now);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.032);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.035);
    osc2.stop(now + 0.035);
  } catch {
    // ignore
  }
}

export function playPoolCushion(impactSpeed: number, muted: boolean): void {
  if (muted) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowMs - lastCushionAt < 28) return;
  lastCushionAt = nowMs;

  try {
    const ctx = getPoolAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const norm = Math.max(0.06, Math.min(1, impactSpeed / 900));
    const vol = 0.025 + norm * 0.12;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125 + norm * 45, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.065);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  } catch {
    // ignore
  }
}

export function playPoolPocketDrop(muted: boolean): void {
  if (muted) return;
  try {
    const ctx = getPoolAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Soft leather pocket thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(175, now);
    thud.frequency.exponentialRampToValueAtTime(62, now + 0.11);
    thudGain.gain.setValueAtTime(0.11, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.13);

    // Subtle pocket chime
    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(587.33, now + 0.025);
    chime.frequency.exponentialRampToValueAtTime(880, now + 0.14);
    chimeGain.gain.setValueAtTime(0.055, now + 0.025);
    chimeGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(now + 0.025);
    chime.stop(now + 0.19);
  } catch {
    // ignore
  }
}

export function playPoolFoul(muted: boolean): void {
  if (muted) return;
  try {
    const ctx = getPoolAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [220, 175].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      g.gain.setValueAtTime(0.045, now + idx * 0.1);
      g.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.1 + 0.11);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.12);
    });
  } catch {
    // ignore
  }
}
