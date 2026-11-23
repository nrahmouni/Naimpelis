/**
 * Procedural Web Audio synthesizer for Nitro GP 3D.
 * Generates RPM-modulated F1/V8 engine note, turbo nitro rush, tire drift screech,
 * impact thud, race countdown tones, and dual-tone horn with zero external audio assets.
 */
export class RacingSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;
  private driftSource: AudioBufferSourceNode | null = null;
  private muted = false;
  private started = false;
  private disposed = false;

  unlock(): void {
    if (this.disposed || typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (!this.started && this.ctx) {
      this.setupGraph(this.ctx);
      this.started = true;
    }
  }

  private setupGraph(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.28;
    master.connect(ctx.destination);
    this.masterGain = master;

    // Engine dual sawtooth + triangle filtered roar
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 260;
    engineFilter.Q.value = 3.2;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.08;

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 65;

    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = 130;

    oscA.connect(engineFilter);
    oscB.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);

    oscA.start();
    oscB.start();

    this.engineFilter = engineFilter;
    this.engineGain = engineGain;
    this.engineOscA = oscA;
    this.engineOscB = oscB;

    // Continuous white-noise buffer for tire drift screech & nitro air hiss
    const sampleRate = ctx.sampleRate;
    const len = Math.floor(sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    noiseSrc.loop = true;

    const driftFilter = ctx.createBiquadFilter();
    driftFilter.type = 'bandpass';
    driftFilter.frequency.value = 1450;
    driftFilter.Q.value = 2.8;

    const driftGain = ctx.createGain();
    driftGain.gain.value = 0.0;

    noiseSrc.connect(driftFilter);
    driftFilter.connect(driftGain);
    driftGain.connect(master);
    noiseSrc.start();

    this.driftSource = noiseSrc;
    this.driftFilter = driftFilter;
    this.driftGain = driftGain;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.28, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateFrame(rpmPct: number, throttle: number, driftIntensity: number, nitroActive: boolean): void {
    if (!this.ctx || !this.started || this.disposed) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const normRpm = Math.max(0, Math.min(1, rpmPct / 100));
    const baseFreq = 52 + normRpm * 145 + (nitroActive ? 28 : 0);

    if (this.engineOscA && this.engineOscB && this.engineFilter && this.engineGain) {
      this.engineOscA.frequency.setTargetAtTime(baseFreq, now, 0.04);
      this.engineOscB.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.04);
      this.engineFilter.frequency.setTargetAtTime(
        220 + normRpm * 1150 + (nitroActive ? 450 : 0),
        now,
        0.05
      );
      this.engineGain.gain.setTargetAtTime(
        0.08 + throttle * 0.14 + (nitroActive ? 0.08 : 0),
        now,
        0.05
      );
    }

    if (this.driftGain && this.driftFilter) {
      const targetScreech = nitroActive
        ? Math.max(driftIntensity * 0.12, 0.08)
        : Math.min(0.18, driftIntensity * 0.16);
      this.driftFilter.frequency.setTargetAtTime(
        nitroActive ? 880 : 1400 + driftIntensity * 650,
        now,
        0.05
      );
      this.driftGain.gain.setTargetAtTime(targetScreech, now, 0.04);
    }
  }

  playCountdownBeep(go: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted || this.disposed) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(go ? 987.77 : 523.25, now);
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + (go ? 0.42 : 0.2));
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (go ? 0.44 : 0.22));
  }

  playImpact(strength: number): void {
    if (!this.ctx || !this.masterGain || this.muted || this.disposed) return;
    if (this.ctx.state !== 'running' || strength < 0.08) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    g.gain.setValueAtTime(Math.min(0.42, 0.15 + strength * 0.28), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playLapChime(isFinish = false): void {
    if (!this.ctx || !this.masterGain || this.muted || this.disposed) return;
    if (this.ctx.state !== 'running') return;
    const notes = isFinish ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 880, 1174.66];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const start = this.ctx.currentTime + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  }

  playHorn(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted || this.disposed) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [392, 493.88].forEach((freq) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.24);
    });
  }

  destroy(): void {
    this.disposed = true;
    try {
      this.engineOscA?.stop();
      this.engineOscB?.stop();
      this.driftSource?.stop();
    } catch {
      // ignore
    }
    try {
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.started = false;
  }
}
