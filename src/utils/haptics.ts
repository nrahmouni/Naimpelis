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
    // ACT 1: Optical Anamorphic Ignition Whoosh (Filtered Noise)
    // -------------------------------------------------------------------------
    const noiseLen = Math.floor(ctx.sampleRate * 0.75);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.65;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.Q.setValueAtTime(2.6, now);
    whooshFilter.frequency.setValueAtTime(190, now);
    whooshFilter.frequency.exponentialRampToValueAtTime(2600, now + 0.36);
    whooshFilter.frequency.exponentialRampToValueAtTime(480, now + 0.72);

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.linearRampToValueAtTime(0.11, now + 0.24);
    whooshGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.72);

    noiseSrc.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(masterGain);
    whooshGain.connect(hallDelayL);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.74);

    // -------------------------------------------------------------------------
    // ACT 2: Hit 1 ("TA" at +0.20s) + Hit 2 ("DUMMMM" IMAX Sub Impact at +0.46s)
    // -------------------------------------------------------------------------
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeWarmSaturationCurve(14);

    // Strike 1: Tight Theatrical Timpani ("TA")
    const taOsc = ctx.createOscillator();
    const taGain = ctx.createGain();
    taOsc.type = 'triangle';
    taOsc.frequency.setValueAtTime(138, now + 0.2);
    taOsc.frequency.exponentialRampToValueAtTime(49, now + 0.41);
    taGain.gain.setValueAtTime(0.0001, now + 0.195);
    taGain.gain.linearRampToValueAtTime(0.32, now + 0.212);
    taGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
    taOsc.connect(shaper);
    shaper.connect(taGain);
    taGain.connect(masterGain);
    taOsc.start(now + 0.195);
    taOsc.stop(now + 0.45);

    // Strike 2: Deep Sub-Bass Drop ("DUMMMM" 73.4Hz -> 36.7Hz D1)
    const dumSub = ctx.createOscillator();
    const dumGain = ctx.createGain();
    dumSub.type = 'sine';
    dumSub.frequency.setValueAtTime(92, now + 0.46);
    dumSub.frequency.exponentialRampToValueAtTime(36.71, now + 0.72);
    dumGain.gain.setValueAtTime(0.0001, now + 0.455);
    dumGain.gain.linearRampToValueAtTime(0.42, now + 0.485);
    dumGain.gain.exponentialRampToValueAtTime(0.0008, now + 2.85);
    dumSub.connect(dumGain);
    dumGain.connect(masterGain);
    dumSub.start(now + 0.455);
    dumSub.stop(now + 2.9);

    // -------------------------------------------------------------------------
    // ACT 3: Dolby-Style Lush Orchestral Fifths & Prism Bloom (+0.46s - 3.30s)
    // -------------------------------------------------------------------------
    const chordPadFilter = ctx.createBiquadFilter();
    chordPadFilter.type = 'lowpass';
    chordPadFilter.frequency.setValueAtTime(340, now + 0.46);
    chordPadFilter.frequency.exponentialRampToValueAtTime(3900, now + 1.15);
    chordPadFilter.frequency.exponentialRampToValueAtTime(1250, now + 3.15);
    chordPadFilter.connect(masterGain);
    chordPadFilter.connect(hallDelayL);

    // D2, A2, D3, F#3, A3, E4 (Cinematic Dadd9 wide theatrical voicing)
    const voices = [
      { freq: 73.42, detune: -5, peak: 0.14, type: 'sawtooth' as OscillatorType },
      { freq: 110.0, detune: 5, peak: 0.11, type: 'sawtooth' as OscillatorType },
      { freq: 146.83, detune: -7, peak: 0.09, type: 'triangle' as OscillatorType },
      { freq: 185.0, detune: 6, peak: 0.075, type: 'sawtooth' as OscillatorType },
      { freq: 220.0, detune: -4, peak: 0.065, type: 'triangle' as OscillatorType },
      { freq: 329.63, detune: 8, peak: 0.045, type: 'sine' as OscillatorType },
    ];

    voices.forEach((v) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq * 0.992, now + 0.46);
      osc.frequency.exponentialRampToValueAtTime(v.freq, now + 0.68);
      osc.detune.setValueAtTime(v.detune, now + 0.46);

      g.gain.setValueAtTime(0.0001, now + 0.46);
      g.gain.linearRampToValueAtTime(v.peak, now + 0.66);
      g.gain.exponentialRampToValueAtTime(0.0006, now + 3.15);

      osc.connect(g);
      g.connect(chordPadFilter);
      osc.start(now + 0.46);
      osc.stop(now + 3.2);
    });

    // Crystalline Ruby-Prism High Shimmer Overtones (D5 + A5)
    [587.33, 880.0].forEach((hiFreq, idx) => {
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = 'sine';
      const startAt = now + 0.72 + idx * 0.12;
      bell.frequency.setValueAtTime(hiFreq, startAt);
      bellGain.gain.setValueAtTime(0.0001, startAt);
      bellGain.gain.linearRampToValueAtTime(0.028 / (idx + 1), startAt + 0.12);
      bellGain.gain.exponentialRampToValueAtTime(0.0004, startAt + 2.1);
      bell.connect(bellGain);
      bellGain.connect(hallDelayL);
      bellGain.connect(masterGain);
      bell.start(startAt);
      bell.stop(startAt + 2.15);
    });

    return ctx.state === 'running';
  } catch {
    return false;
  }
}
