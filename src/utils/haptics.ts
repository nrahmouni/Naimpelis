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
let lastIntroSoundAt = 0;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function makeWarmSaturationCurve(amount = 18): Float32Array<ArrayBuffer> {
  const n = 512;
  const buffer = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buffer);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
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
 * Synthesizes an IMAX / Dolby Cinema / Netflix-grade theatrical studio score:
 * 1) Optical projector air & brushed-metal ignition whoosh (0.00s - 0.55s)
 * 2) Dual theatrical timpani & warm-saturated 36Hz sub-bass drop ("TA - DUMMMM")
 * 3) Lush Cinema D-Major9 orchestral pad + stereo hall delay + diamond prism overtones
 */
export function playNaimcineIntroSound(): boolean {
  try {
    const nowMs = Date.now();
    if (nowMs - lastIntroSoundAt < 450) return true;

    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    lastIntroSoundAt = nowMs;
    const now = ctx.currentTime + 0.02;

    // Master Compressor + Warm Analog Bus
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.82, now);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, now);
    compressor.knee.setValueAtTime(18, now);
    compressor.ratio.setValueAtTime(4, now);
    compressor.attack.setValueAtTime(0.005, now);
    compressor.release.setValueAtTime(0.22, now);

    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    // Stereo Cinema Hall Delay Bus
    const hallDelayL = ctx.createDelay(0.5);
    const hallDelayR = ctx.createDelay(0.5);
    hallDelayL.delayTime.setValueAtTime(0.13, now);
    hallDelayR.delayTime.setValueAtTime(0.19, now);

    const hallFeedback = ctx.createGain();
    hallFeedback.gain.setValueAtTime(0.28, now);
    const hallFilter = ctx.createBiquadFilter();
    hallFilter.type = 'lowpass';
    hallFilter.frequency.setValueAtTime(2200, now);

    const hallWet = ctx.createGain();
    hallWet.gain.setValueAtTime(0.24, now);

    hallDelayL.connect(hallDelayR);
    hallDelayR.connect(hallFilter);
    hallFilter.connect(hallFeedback);
    hallFeedback.connect(hallDelayL);
    hallFilter.connect(hallWet);
    hallWet.connect(masterGain);

    // -------------------------------------------------------------------------
    // ACT 1: Crisp 14° Optical Sweep Ignition (Filtered Air Transient, 0 -> 0.42s)
    // -------------------------------------------------------------------------
    const noiseLen = Math.floor(ctx.sampleRate * 0.48);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.55;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.Q.setValueAtTime(3.2, now);
    whooshFilter.frequency.setValueAtTime(240, now);
    whooshFilter.frequency.exponentialRampToValueAtTime(3200, now + 0.24);
    whooshFilter.frequency.exponentialRampToValueAtTime(620, now + 0.46);

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.linearRampToValueAtTime(0.095, now + 0.14);
    whooshGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.46);

    noiseSrc.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(masterGain);
    whooshGain.connect(hallDelayL);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.47);

    // -------------------------------------------------------------------------
    // ACT 2: 3-Pulse "Rif - fan - TV" Rhythmic Studio Cadence (+0.16s, +0.34s, +0.54s)
    // -------------------------------------------------------------------------
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeWarmSaturationCurve(12);

    // Pulse 1 ("Rif" +0.16s) & Pulse 2 ("fan" +0.34s): Tight percussive low-mid plucks
    [
      { at: 0.16, fStart: 146.83, fEnd: 73.42, gain: 0.26, dur: 0.16 },
      { at: 0.34, fStart: 164.81, fEnd: 82.41, gain: 0.29, dur: 0.18 },
    ].forEach((p) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(p.fStart, now + p.at);
      osc.frequency.exponentialRampToValueAtTime(p.fEnd, now + p.at + p.dur);
      g.gain.setValueAtTime(0.0001, now + p.at - 0.005);
      g.gain.linearRampToValueAtTime(p.gain, now + p.at + 0.014);
      g.gain.exponentialRampToValueAtTime(0.001, now + p.at + p.dur);
      osc.connect(shaper);
      shaper.connect(g);
      g.connect(masterGain);
      osc.start(now + p.at - 0.005);
      osc.stop(now + p.at + p.dur + 0.02);
    });

    // Pulse 3 ("TV" +0.54s): Authoritative Sub-Bass Drop (110Hz -> 41.2Hz E1)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, now + 0.54);
    subOsc.frequency.exponentialRampToValueAtTime(41.2, now + 0.78);
    subGain.gain.setValueAtTime(0.0001, now + 0.535);
    subGain.gain.linearRampToValueAtTime(0.42, now + 0.56);
    subGain.gain.exponentialRampToValueAtTime(0.0008, now + 2.15);
    subOsc.connect(subGain);
    subGain.connect(masterGain);
    subOsc.start(now + 0.535);
    subOsc.stop(now + 2.2);

    // -------------------------------------------------------------------------
    // ACT 3: Wide Studio Fifth/Ninth Harmonic Bloom (+0.54s -> +2.25s)
    // -------------------------------------------------------------------------
    const chordPadFilter = ctx.createBiquadFilter();
    chordPadFilter.type = 'lowpass';
    chordPadFilter.frequency.setValueAtTime(420, now + 0.54);
    chordPadFilter.frequency.exponentialRampToValueAtTime(4400, now + 0.98);
    chordPadFilter.frequency.exponentialRampToValueAtTime(1400, now + 2.2);
    chordPadFilter.connect(masterGain);
    chordPadFilter.connect(hallDelayL);

    // E2, B2, E3, G#3, B3, F#4 (Eadd9 crisp studio signature)
    const voices = [
      { freq: 82.41, detune: -4, peak: 0.13, type: 'sawtooth' as OscillatorType },
      { freq: 123.47, detune: 5, peak: 0.105, type: 'sawtooth' as OscillatorType },
      { freq: 164.81, detune: -6, peak: 0.085, type: 'triangle' as OscillatorType },
      { freq: 207.65, detune: 5, peak: 0.07, type: 'sawtooth' as OscillatorType },
      { freq: 246.94, detune: -3, peak: 0.06, type: 'triangle' as OscillatorType },
      { freq: 369.99, detune: 6, peak: 0.045, type: 'sine' as OscillatorType },
    ];

    voices.forEach((v) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq * 0.994, now + 0.54);
      osc.frequency.exponentialRampToValueAtTime(v.freq, now + 0.72);
      osc.detune.setValueAtTime(v.detune, now + 0.54);

      g.gain.setValueAtTime(0.0001, now + 0.54);
      g.gain.linearRampToValueAtTime(v.peak, now + 0.68);
      g.gain.exponentialRampToValueAtTime(0.0006, now + 2.2);

      osc.connect(g);
      g.connect(chordPadFilter);
      osc.start(now + 0.54);
      osc.stop(now + 2.25);
    });

    // Optical Prism High Bell Shimmer (E5 -> B5)
    [659.25, 987.77].forEach((hiFreq, idx) => {
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = 'sine';
      const startAt = now + 0.64 + idx * 0.11;
      bell.frequency.setValueAtTime(hiFreq, startAt);
      bellGain.gain.setValueAtTime(0.0001, startAt);
      bellGain.gain.linearRampToValueAtTime(0.03 / (idx + 1), startAt + 0.09);
      bellGain.gain.exponentialRampToValueAtTime(0.0004, startAt + 1.45);
      bell.connect(bellGain);
      bellGain.connect(hallDelayL);
      bellGain.connect(masterGain);
      bell.start(startAt);
      bell.stop(startAt + 1.5);
    });

    return ctx.state === 'running';
  } catch {
    return false;
  }
}

export const playRiffanIntroSound = playNaimcineIntroSound;
