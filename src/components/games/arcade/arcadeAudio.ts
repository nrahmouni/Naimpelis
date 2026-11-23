let sharedAudioCtx: AudioContext | null = null;

export function playArcadeSfx(
  freq: number,
  durSec = 0.08,
  type: OscillatorType = 'triangle',
  gainVal = 0.07,
  muted = false
): void {
  if (muted || typeof window === 'undefined') return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AC();
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume().catch(() => {});
    }
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainVal;
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    const now = sharedAudioCtx.currentTime;
    osc.start(now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durSec);
    osc.stop(now + durSec + 0.01);
  } catch {
    // ignore audio block errors
  }
}

export function playZzfxPreset(
  preset: 'explosion' | 'laser' | 'powerup' | 'brick' | 'jump',
  muted = false
): void {
  if (muted || typeof window === 'undefined') return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AC();
    if (sharedAudioCtx.state === 'suspended') void sharedAudioCtx.resume().catch(() => {});
    const R = sharedAudioCtx.sampleRate || 44100;
    const cfg =
      preset === 'explosion'
        ? { dur: 0.34, f0: 140, f1: 38, noise: 0.75, vol: 0.14 }
        : preset === 'laser'
          ? { dur: 0.09, f0: 980, f1: 240, noise: 0.05, vol: 0.08 }
          : preset === 'powerup'
            ? { dur: 0.22, f0: 420, f1: 1120, noise: 0, vol: 0.11 }
            : preset === 'jump'
              ? { dur: 0.11, f0: 290, f1: 680, noise: 0, vol: 0.09 }
              : { dur: 0.07, f0: 660, f1: 420, noise: 0.1, vol: 0.08 };
    const len = Math.max(128, Math.floor(R * cfg.dur));
    const buf = sharedAudioCtx.createBuffer(1, len, R);
    const ch = buf.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < len; i += 1) {
      const t = i / len;
      const env = Math.pow(1 - t, 1.4);
      const freq = cfg.f0 + (cfg.f1 - cfg.f0) * t;
      phase += (Math.PI * 2 * freq) / R;
      const tone = Math.sin(phase) * (1 - cfg.noise);
      const nz = (Math.random() * 2 - 1) * cfg.noise;
      ch[i] = (tone + nz) * env * cfg.vol;
    }
    const src = sharedAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(sharedAudioCtx.destination);
    src.start();
  } catch {
    // ignore audio block errors
  }
}

export function loadArcadeBest(key: string): number {
  try {
    return Number(localStorage.getItem(key) || '0') || 0;
  } catch {
    return 0;
  }
}

export function saveArcadeBest(key: string, val: number): void {
  try {
    localStorage.setItem(key, String(val));
  } catch {
    // ignore quota errors
  }
}
