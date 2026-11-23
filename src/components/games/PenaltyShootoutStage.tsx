import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Shield, Trophy, Volume2, VolumeX } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';

interface PenaltyShootoutStageProps {
  lang: AppLanguage;
  onClose?: () => void;
}

type KickOutcome = 'goal' | 'saved' | 'post' | 'miss';
type TurnRole = 'striker' | 'keeper';

interface BallFlight {
  active: boolean;
  t: number;
  duration: number;
  startX: number;
  startY: number;
  ctrlX: number;
  ctrlY: number;
  endX: number;
  endY: number;
  outcome: KickOutcome;
  resolved: boolean;
}

const BEST_SCORE_KEY = 'riffan_penalty_best_streak_v1';

function playPenaltySound(kind: 'kick' | 'goal' | 'save' | 'post' | 'whistle', muted: boolean) {
  if (muted || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);

    if (kind === 'kick') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);
      g.gain.setValueAtTime(0.32, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (kind === 'post') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(720, now);
      osc.frequency.exponentialRampToValueAtTime(410, now + 0.35);
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.start(now);
      osc.stop(now + 0.37);
    } else if (kind === 'goal') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.46);
    } else if (kind === 'save') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2650, now);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
    }
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 600);
  } catch {
    // ignore audio unlock errors
  }
}

export const PenaltyShootoutStage: React.FC<PenaltyShootoutStageProps> = ({ lang }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  const [role, setRole] = useState<TurnRole>('striker');
  const [round, setRound] = useState(1);
  const [playerScore, setPlayerScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [playerHistory, setPlayerHistory] = useState<Array<'goal' | 'miss'>>([]);
  const [cpuHistory, setCpuHistory] = useState<Array<'goal' | 'miss'>>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);
  const [bestStreak, setBestStreak] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_SCORE_KEY) || 0) || 0;
    } catch {
      return 0;
    }
  });

  const stateRef = useRef({
    aimX: 0, // -1 .. +1 across goal width
    aimY: 0.45, // 0 (bottom) .. 1 (top corners)
    powerPct: 68,
    powerDir: 1,
    keeperDive: 0, // -1 left, 0 center, +1 right
    keeperX: 0,
    keeperTargetX: 0,
    netRipple: 0,
    role: 'striker' as TurnRole,
    round: 1,
    playerScore: 0,
    cpuScore: 0,
    pHist: [] as Array<'goal' | 'miss'>,
    cHist: [] as Array<'goal' | 'miss'>,
    winner: null as 'player' | 'cpu' | null,
    waitingNext: false,
    ball: {
      active: false,
      t: 0,
      duration: 0.56,
      startX: 0,
      startY: 0,
      ctrlX: 0,
      ctrlY: 0,
      endX: 0,
      endY: 0,
      outcome: 'goal' as KickOutcome,
      resolved: false,
    } as BallFlight,
  });

  const resetMatch = useCallback(() => {
    triggerHaptic('medium');
    const st = stateRef.current;
    st.aimX = 0;
    st.aimY = 0.45;
    st.powerPct = 68;
    st.keeperDive = 0;
    st.keeperX = 0;
    st.keeperTargetX = 0;
    st.netRipple = 0;
    st.role = 'striker';
    st.round = 1;
    st.playerScore = 0;
    st.cpuScore = 0;
    st.pHist = [];
    st.cHist = [];
    st.winner = null;
    st.waitingNext = false;
    st.ball.active = false;
    setRole('striker');
    setRound(1);
    setPlayerScore(0);
    setCpuScore(0);
    setPlayerHistory([]);
    setCpuHistory([]);
    setBanner(null);
    setWinner(null);
    playPenaltySound('whistle', mutedRef.current);
  }, []);

  const launchShot = useCallback((customAimX?: number, customAimY?: number) => {
    const st = stateRef.current;
    if (st.winner || st.ball.active || st.waitingNext) return;

    const shotAimX = typeof customAimX === 'number' ? customAimX : st.aimX;
    const shotAimY = typeof customAimY === 'number' ? customAimY : st.aimY;

    playPenaltySound('kick', mutedRef.current);
    triggerHaptic('medium');

    if (st.role === 'striker') {
      const cpuDivePick = [-0.82, 0, 0.82][Math.floor(Math.random() * 3)];
      st.keeperTargetX = cpuDivePick;

      const overPower = st.powerPct > 94;
      const hitPost = Math.abs(shotAimX) > 0.91 && Math.abs(shotAimX) < 1.03;
      const savedByCpu =
        !overPower &&
        !hitPost &&
        Math.abs(shotAimX - cpuDivePick) < 0.38 &&
        shotAimY < 0.86;

      let outcome: KickOutcome = 'goal';
      if (overPower) outcome = 'miss';
      else if (hitPost) outcome = 'post';
      else if (savedByCpu) outcome = 'saved';

      st.ball = {
        active: true,
        t: 0,
        duration: 0.52,
        startX: 0,
        startY: 0,
        ctrlX: shotAimX * 0.45 + (Math.random() - 0.5) * 0.25,
        ctrlY: shotAimY * 1.18 + 0.12,
        endX: overPower ? shotAimX * 1.15 : shotAimX,
        endY: overPower ? 1.28 : shotAimY,
        outcome,
        resolved: false,
      };
    } else {
      // Goalkeeper round: CPU shoots at random corner, player chose keeperDive
      const cpuTargetX = [-0.82, -0.42, 0.05, 0.48, 0.84][Math.floor(Math.random() * 5)];
      const cpuTargetY = 0.22 + Math.random() * 0.68;
      st.keeperTargetX = st.keeperDive * 0.82;

      const saved =
        Math.abs(cpuTargetX - st.keeperTargetX) < 0.42 &&
        (Math.abs(st.keeperDive) > 0 || cpuTargetY < 0.72);
      const outcome: KickOutcome = saved ? 'saved' : 'goal';

      st.ball = {
        active: true,
        t: 0,
        duration: 0.52,
        startX: 0,
        startY: 0,
        ctrlX: cpuTargetX * 0.5,
        ctrlY: cpuTargetY * 1.15,
        endX: cpuTargetX,
        endY: cpuTargetY,
        outcome,
        resolved: false,
      };
    }
  }, []);

  const chooseKeeperDive = useCallback(
    (dir: -1 | 0 | 1) => {
      const st = stateRef.current;
      if (st.role !== 'keeper' || st.winner || st.ball.active || st.waitingNext) return;
      st.keeperDive = dir;
      launchShot();
    },
    [launchShot]
  );

  // Keyboard & TV remote controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (e.code === 'KeyR') {
        resetMatch();
        return;
      }
      if (st.winner || st.ball.active || st.waitingNext) return;

      if (st.role === 'striker') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          st.aimX = Math.max(-0.96, st.aimX - 0.16);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          st.aimX = Math.min(0.96, st.aimX + 0.16);
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          st.aimY = Math.min(0.95, st.aimY + 0.14);
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          st.aimY = Math.max(0.12, st.aimY - 0.14);
        } else if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          launchShot();
        }
      } else {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          chooseKeeperDive(-1);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          chooseKeeperDive(1);
        } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          chooseKeeperDive(0);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chooseKeeperDive, launchShot, resetMatch]);

  // 60fps Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let prevTs = performance.now();

    const frame = (ts: number) => {
      rafId = window.requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - prevTs) / 1000);
      prevTs = ts;
      const st = stateRef.current;

      // Oscillate power meter gently during aiming
      if (st.role === 'striker' && !st.ball.active && !st.waitingNext && !st.winner) {
        st.powerPct += st.powerDir * 68 * dt;
        if (st.powerPct >= 99) {
          st.powerPct = 99;
          st.powerDir = -1;
        } else if (st.powerPct <= 42) {
          st.powerPct = 42;
          st.powerDir = 1;
        }
      }

      // Smooth keeper dive interpolation
      st.keeperX += (st.keeperTargetX - st.keeperX) * Math.min(1, dt * 11);
      st.netRipple = Math.max(0, st.netRipple - dt * 2.4);

      // Update ball flight
      if (st.ball.active) {
        st.ball.t += dt / st.ball.duration;
        if (st.ball.t >= 1 && !st.ball.resolved) {
          st.ball.t = 1;
          st.ball.resolved = true;
          st.waitingNext = true;

          if (st.ball.outcome === 'goal') {
            st.netRipple = 1;
            playPenaltySound('goal', mutedRef.current);
          } else if (st.ball.outcome === 'post') {
            playPenaltySound('post', mutedRef.current);
          } else {
            playPenaltySound('save', mutedRef.current);
          }

          if (st.role === 'striker') {
            const scored = st.ball.outcome === 'goal';
            if (scored) st.playerScore += 1;
            st.pHist.push(scored ? 'goal' : 'miss');
            setPlayerScore(st.playerScore);
            setPlayerHistory([...st.pHist]);
            setBanner(
              scored
                ? '¡GOOOLAZO!'
                : st.ball.outcome === 'post'
                ? '¡AL PALO!'
                : st.ball.outcome === 'saved'
                ? '¡PARADÓN DEL PORTERO!'
                : '¡FUERA POR ARRIBA!'
            );
          } else {
            const cpuScored = st.ball.outcome === 'goal';
            if (cpuScored) st.cpuScore += 1;
            st.cHist.push(cpuScored ? 'goal' : 'miss');
            setCpuScore(st.cpuScore);
            setCpuHistory([...st.cHist]);
            setBanner(cpuScored ? 'GOL RIVAL' : '¡PARADÓN TUYO!');
          }

          window.setTimeout(() => {
            const cur = stateRef.current;
            cur.ball.active = false;
            cur.keeperTargetX = 0;
            cur.waitingNext = false;
            setBanner(null);

            // Check shootout win conditions
            const pKicks = cur.pHist.length;
            const cKicks = cur.cHist.length;
            const bothKicked = pKicks === cKicks;

            if (pKicks <= 5 && cKicks <= 5) {
              const pRem = 5 - pKicks;
              const cRem = 5 - cKicks;
              if (cur.playerScore > cur.cpuScore + cRem) cur.winner = 'player';
              else if (cur.cpuScore > cur.playerScore + pRem) cur.winner = 'cpu';
              else if (bothKicked && pKicks === 5 && cur.playerScore !== cur.cpuScore) {
                cur.winner = cur.playerScore > cur.cpuScore ? 'player' : 'cpu';
              }
            } else if (bothKicked && cur.playerScore !== cur.cpuScore) {
              cur.winner = cur.playerScore > cur.cpuScore ? 'player' : 'cpu';
            }

            if (cur.winner) {
              setWinner(cur.winner);
              if (cur.winner === 'player') {
                setBestStreak((prev) => {
                  const next = Math.max(prev, cur.playerScore);
                  try {
                    localStorage.setItem(BEST_SCORE_KEY, String(next));
                  } catch {
                    // ignore
                  }
                  return next;
                });
              }
              return;
            }

            if (cur.role === 'striker') {
              cur.role = 'keeper';
              setRole('keeper');
            } else {
              cur.role = 'striker';
              cur.round += 1;
              setRole('striker');
              setRound(cur.round);
            }
          }, 1250);
        }
      }

      // Draw stadium pitch + goal + net + keeper + aiming reticle + ball
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Night stadium sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.56);
      sky.addColorStop(0, '#060a16');
      sky.addColorStop(1, '#12203f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h * 0.56);

      // Floodlights glow
      ctx.fillStyle = 'rgba(186, 230, 253, 0.08)';
      ctx.beginPath();
      ctx.arc(w * 0.16, h * 0.1, 70, 0, Math.PI * 2);
      ctx.arc(w * 0.84, h * 0.1, 70, 0, Math.PI * 2);
      ctx.fill();

      // Stadium turf stripes
      const turfY = h * 0.54;
      const turfGrad = ctx.createLinearGradient(0, turfY, 0, h);
      turfGrad.addColorStop(0, '#14532d');
      turfGrad.addColorStop(1, '#0b3b1e');
      ctx.fillStyle = turfGrad;
      ctx.fillRect(0, turfY, w, h - turfY);

      // Penalty box lines in perspective
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.72);
      ctx.lineTo(w * 0.88, h * 0.72);
      ctx.lineTo(w * 0.96, h);
      ctx.moveTo(w * 0.12, h * 0.72);
      ctx.lineTo(w * 0.04, h);
      ctx.stroke();

      // Penalty spot
      const spotX = w * 0.5;
      const spotY = h * 0.86;
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(spotX, spotY + 14, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Goal frame dimensions
      const gLeft = w * 0.22;
      const gRight = w * 0.78;
      const gTop = h * 0.22;
      const gBottom = turfY + 8;
      const gW = gRight - gLeft;
      const gH = gBottom - gTop;

      // Net mesh with ripple displacement
      const rippleShift = Math.sin(ts * 0.03) * 8 * st.netRipple;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(gLeft + 4, gTop + 4, gW - 8, gH - 6);
      ctx.strokeStyle = 'rgba(226,232,240,0.28)';
      ctx.lineWidth = 1.4;
      for (let i = 1; i < 12; i += 1) {
        const x = gLeft + (gW * i) / 12;
        ctx.beginPath();
        ctx.moveTo(x, gTop);
        ctx.quadraticCurveTo(x + rippleShift, gTop + gH * 0.5, x, gBottom);
        ctx.stroke();
      }
      for (let j = 1; j < 6; j += 1) {
        const y = gTop + (gH * j) / 6;
        ctx.beginPath();
        ctx.moveTo(gLeft, y);
        ctx.lineTo(gRight, y + rippleShift * 0.3);
        ctx.stroke();
      }

      // White Goalposts + Crossbar
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(gLeft, gBottom);
      ctx.lineTo(gLeft, gTop);
      ctx.lineTo(gRight, gTop);
      ctx.lineTo(gRight, gBottom);
      ctx.stroke();

      // Goalkeeper Silhouette
      const gkCenterX = gLeft + gW * 0.5 + st.keeperX * (gW * 0.42);
      const gkTilt = st.keeperX * 0.55;
      const gkY = gBottom - 44 + Math.abs(st.keeperX) * 10;
      ctx.save();
      ctx.translate(gkCenterX, gkY);
      ctx.rotate(gkTilt);
      // Jersey
      ctx.fillStyle = st.role === 'keeper' ? '#7c3aed' : '#ef4444';
      ctx.fillRect(-16, -18, 32, 42);
      // Head
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(0, -28, 12, 0, Math.PI * 2);
      ctx.fill();
      // Gloves outstretched
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(-34, -14, 14, 12);
      ctx.fillRect(20, -14, 14, 12);
      ctx.restore();

      // Aim Reticle (when user is Striker)
      if (st.role === 'striker' && !st.ball.active && !st.winner) {
        const rx = gLeft + gW * 0.5 + st.aimX * (gW * 0.48);
        const ry = gBottom - st.aimY * gH;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(rx, ry, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx - 24, ry);
        ctx.lineTo(rx + 24, ry);
        ctx.moveTo(rx, ry - 24);
        ctx.lineTo(rx, ry + 24);
        ctx.stroke();
      }

      // Soccer Ball (resting at spot or flying along quadratic Bézier)
      let bx = spotX;
      let by = spotY;
      let bRadius = 21;
      if (st.ball.active) {
        const t = Math.min(1, st.ball.t);
        const inv = 1 - t;
        const p0x = spotX;
        const p0y = spotY;
        const p1x = gLeft + gW * 0.5 + st.ball.ctrlX * (gW * 0.48);
        const p1y = gBottom - st.ball.ctrlY * gH;
        const p2x = gLeft + gW * 0.5 + st.ball.endX * (gW * 0.48);
        const p2y = gBottom - st.ball.endY * gH;
        bx = inv * inv * p0x + 2 * inv * t * p1x + t * t * p2x;
        by = inv * inv * p0y + 2 * inv * t * p1y + t * t * p2y;
        bRadius = 21 - t * 9.5;
      }

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, by, bRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(bx, by, bRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const st = stateRef.current;
    if (!canvas || st.role !== 'striker' || st.ball.active || st.winner) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const aimX = Math.max(-0.96, Math.min(0.96, (nx - 0.5) / 0.28));
    const aimY = Math.max(0.1, Math.min(0.95, (0.56 - ny) / 0.34));
    st.aimX = aimX;
    st.aimY = aimY;
    launchShot(aimX, aimY);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 select-none">
      {/* Scoreboard Bar */}
      <div className="rounded-2xl bg-[#0d1220] border border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-xl bg-[#7C3AED]/25 border border-[#7C3AED]/50 text-xs font-black text-white">
            TÚ {playerScore} — {cpuScore} CPU
          </div>
          <span className="text-xs font-bold text-zinc-300">
            Ronda {round}/5 ·{' '}
            <span className="text-cyan-300">
              {role === 'striker'
                ? pickLang(lang, { es: 'Tu turno: Chuta', ca: 'El teu torn: Xuta', en: 'Your Kick' })
                : pickLang(lang, { es: 'Tu turno: Para el penalti', ca: 'El teu torn: Atura el penal', en: 'Defend Goal' })}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" /> Récord: {bestStreak}
          </span>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={resetMatch}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Kick Markers */}
      <div className="flex items-center justify-between px-2 text-xs font-bold">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-400">Tú:</span>
          {Array.from({ length: Math.max(5, playerHistory.length) }, (_, idx) => {
            const res = playerHistory[idx];
            return (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border ${
                  res === 'goal'
                    ? 'bg-emerald-400 border-emerald-200'
                    : res === 'miss'
                    ? 'bg-rose-500 border-rose-300'
                    : 'bg-white/10 border-white/20'
                }`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-400">CPU:</span>
          {Array.from({ length: Math.max(5, cpuHistory.length) }, (_, idx) => {
            const res = cpuHistory[idx];
            return (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border ${
                  res === 'goal'
                    ? 'bg-emerald-400 border-emerald-200'
                    : res === 'miss'
                    ? 'bg-rose-500 border-rose-300'
                    : 'bg-white/10 border-white/20'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Canvas Arena */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#070b16] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          onClick={handleCanvasClick}
          className="w-full h-auto block cursor-crosshair"
        />

        {banner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="px-7 py-3 rounded-2xl bg-[#090d1a]/92 border-2 border-cyan-400/70 text-2xl sm:text-4xl font-black text-white shadow-2xl">
              {banner}
            </div>
          </div>
        )}

        {winner && (
          <div className="absolute inset-0 bg-[#050812]/90 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <Trophy className="w-12 h-12 text-amber-400" />
            <h3 className="text-2xl font-black text-white">
              {winner === 'player' ? '¡CAMPEÓN DE PENALTIS!' : 'El rival ganó la tanda'}
            </h3>
            <p className="text-sm text-zinc-300">
              Marcador final: {playerScore} — {cpuScore}
            </p>
            <button
              type="button"
              onClick={resetMatch}
              className="min-h-11 px-6 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-sm font-black text-white cursor-pointer"
            >
              Jugar otra tanda
            </button>
          </div>
        )}
      </div>

      {/* Quick Action Buttons (works on touch, keyboard & TV remote!) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {role === 'striker' ? (
          <>
            <button
              type="button"
              onClick={() => launchShot()}
              className="min-h-11 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer"
            >
              CHUTAR (Enter / Espacio)
            </button>
            <span className="text-xs text-zinc-400">
              Flechas o clic en la portería para apuntar a la escuadra
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => chooseKeeperDive(-1)}
              className="min-h-11 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-4 h-4" /> Tirarse Izquierda (◀)
            </button>
            <button
              type="button"
              onClick={() => chooseKeeperDive(0)}
              className="min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white cursor-pointer"
            >
              Quedarse Centro (▲)
            </button>
            <button
              type="button"
              onClick={() => chooseKeeperDive(1)}
              className="min-h-11 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
            >
              Tirarse Derecha (▶) <Shield className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
