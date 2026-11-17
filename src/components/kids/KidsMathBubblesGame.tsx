import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Flame,
  HelpCircle,
  Loader2,
  PieChart,
  RefreshCw,
  Scale,
  Star,
  Trophy,
  Users,
} from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { playKidsBubblePop, playKidsComboNote, playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';

export interface AdaptiveMathState {
  level: number;
  streak: number;
  fallSpeedPxPerSec: number;
}

/**
 * Adaptive engine for Arrecife Mates:
 * - Every 3 consecutive correct answers levels up & increases pace.
 * - On miss, resets streak and gently lowers speed.
 */
export function computeAdaptiveMathStep(
  prev: AdaptiveMathState,
  isCorrect: boolean,
  ageGroup: KidsAgeGroup
): AdaptiveMathState {
  const baseSpeed = ageGroup === '3-5' ? 30 : ageGroup === '6-8' ? 44 : 56;
  if (isCorrect) {
    const nextStreak = prev.streak + 1;
    const leveledUp = nextStreak > 0 && nextStreak % 3 === 0;
    const nextLevel = leveledUp ? Math.min(6, prev.level + 1) : prev.level;
    const nextSpeed = Math.min(125, baseSpeed + (nextLevel - 1) * 14);
    return {
      level: nextLevel,
      streak: nextStreak,
      fallSpeedPxPerSec: nextSpeed,
    };
  }
  return {
    level: Math.max(1, prev.level),
    streak: 0,
    fallSpeedPxPerSec: Math.max(24, prev.fallSpeedPxPerSec - 12),
  };
}

export type MathVisualShape = 'star' | 'gem' | 'circle' | 'leaf';

export interface MathQuestion {
  prompt: string;
  visualCountA?: number;
  visualCountB?: number;
  visualShape?: MathVisualShape;
  answer: number;
  choices: number[];
}

export function generateAdaptiveMathQuestion(
  ageGroup: KidsAgeGroup,
  adaptiveLevel: number
): MathQuestion {
  const rand = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  let prompt = '';
  let visualCountA: number | undefined;
  let visualCountB: number | undefined;
  let visualShape: MathVisualShape | undefined;
  let answer = 0;

  if (ageGroup === '3-5') {
    const cap = Math.min(8, 4 + adaptiveLevel);
    const a = rand(1, cap);
    const b = rand(1, Math.max(2, Math.min(4, cap)));
    answer = a + b;
    const shapes: MathVisualShape[] = ['star', 'gem', 'circle', 'leaf'];
    visualShape = shapes[rand(0, shapes.length - 1)];
    if (a + b <= 10) {
      visualCountA = a;
      visualCountB = b;
    }
    prompt = `${a} + ${b} = ?`;
  } else if (ageGroup === '6-8') {
    const maxNum = 10 + adaptiveLevel * 5;
    const isAdd = Math.random() > 0.42;
    if (isAdd) {
      const a = rand(3, maxNum);
      const b = rand(2, Math.max(5, Math.floor(maxNum * 0.7)));
      answer = a + b;
      prompt = `${a} + ${b} = ?`;
    } else {
      const b = rand(2, Math.max(5, Math.floor(maxNum * 0.6)));
      const res = rand(2, Math.max(6, Math.floor(maxNum * 0.7)));
      const a = b + res;
      answer = res;
      prompt = `${a} − ${b} = ?`;
    }
  } else {
    const multMax = Math.min(12, 6 + adaptiveLevel);
    const mode = rand(0, 2);
    if (mode === 0) {
      const a = rand(3, multMax);
      const b = rand(3, multMax);
      answer = a * b;
      prompt = `${a} × ${b} = ?`;
    } else if (mode === 1) {
      const divisor = rand(2, 9);
      const q = rand(3, multMax);
      answer = q;
      prompt = `${divisor * q} ÷ ${divisor} = ?`;
    } else {
      const a = rand(8, 22 + adaptiveLevel * 4);
      const b = rand(5, 18 + adaptiveLevel * 3);
      answer = a + b;
      prompt = `${a} + ${b} = ?`;
    }
  }

  const wrongSet = new Set<number>([answer]);
  while (wrongSet.size < 4) {
    const delta = rand(-5, 6);
    const cand = Math.max(1, answer + (delta === 0 ? 2 : delta));
    wrongSet.add(cand);
  }
  const choices = Array.from(wrongSet).sort(() => Math.random() - 0.5);
  return { prompt, visualCountA, visualCountB, visualShape, answer, choices };
}

type MathSubMode = 'bubbles' | 'scale' | 'fractions' | 'clock_coins' | 'duel';

const CountingShapeRow: React.FC<{ count: number; shape: MathVisualShape; tint: string }> = ({
  count,
  shape,
  tint,
}) => (
  <div className="inline-flex items-center gap-1 flex-wrap justify-center">
    {Array.from({ length: count }).map((_, idx) => (
      <svg key={idx} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        {shape === 'star' ? (
          <polygon
            points="12,2 15,9 22,9.5 16.5,14 18.2,21 12,17.2 5.8,21 7.5,14 2,9.5 9,9"
            fill={tint}
          />
        ) : shape === 'gem' ? (
          <polygon points="12,2 21,9 12,22 3,9" fill={tint} />
        ) : shape === 'leaf' ? (
          <path d="M5 19 C5 9 12 4 20 4 C20 13 15 19 5 19 Z" fill={tint} />
        ) : (
          <circle cx="12" cy="12" r="9" fill={tint} />
        )}
      </svg>
    ))}
  </div>
);

interface FloatingMathBubble {
  id: number;
  value: number;
  xFrac: number;
  yPx: number;
  radiusPx: number;
  color: string;
  wobblePhase: number;
}

interface PopParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  r: number;
}

interface SonarPulse {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
}

const BUBBLE_PALETTES_STANDARD = ['#38BDF8', '#F59E0B', '#10B981', '#EC4899'];
const BUBBLE_PALETTES_GALAXY = ['#8B5CF6', '#06B6D4', '#F43F5E', '#FBBF24'];
const ROUND_GOAL = 8;

interface KidsMathBubblesGameProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  unlockedRewards: string[];
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}

function drawSubmarine(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(phase * 1.4) * 3);
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(4, -12);
  ctx.lineTo(4, -23);
  ctx.lineTo(11, -23);
  ctx.stroke();

  const spin = Math.sin(phase * 8) * 6;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-30, -spin - 2, 5, Math.abs(spin) * 2 + 4);

  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 13, 0, 0, Math.PI * 2);
  const hullGrad = ctx.createLinearGradient(0, -13, 0, 13);
  hullGrad.addColorStop(0, '#FDE047');
  hullGrad.addColorStop(1, '#D97706');
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0F172A';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(8, -1, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#38BDF8';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const KidsMathBubblesGame: React.FC<KidsMathBubblesGameProps> = ({
  kidsLang,
  ageGroup,
  unlockedRewards,
  onEarnStar,
  onMissionPlay,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const recordDomainResult = useKidsStore((s) => s.recordDomainResult);
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const hasGalaxyTheme = unlockedRewards.includes('math_galaxy_theme');
  const palette = hasGalaxyTheme ? BUBBLE_PALETTES_GALAXY : BUBBLE_PALETTES_STANDARD;

  const [subMode, setSubMode] = useState<MathSubMode>('bubbles');

  // Mode 1: Bubbles State
  const [adaptive, setAdaptive] = useState<AdaptiveMathState>(() =>
    computeAdaptiveMathStep({ level: 1, streak: 0, fallSpeedPxPerSec: 40 }, false, ageGroup)
  );
  const [question, setQuestion] = useState<MathQuestion>(() =>
    generateAdaptiveMathQuestion(ageGroup, 1)
  );
  const [score, setScore] = useState(0);
  const [caughtCount, setCaughtCount] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [victory, setVictory] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  // Mode 2: Balance Scale (leftBase + addedWeight = targetTotal)
  const [scaleBase, setScaleBase] = useState(3);
  const [scaleTarget, setScaleTarget] = useState(7);
  const [scaleAdded, setScaleAdded] = useState(0);
  const [scaleStatus, setScaleStatus] = useState<'playing' | 'ok' | 'high'>('playing');

  // Mode 3: Pizza Fractions (numerator / denominator)
  const [fracDenom, setFracDenom] = useState(4);
  const [fracTargetNum, setFracTargetNum] = useState(3);
  const [selectedSlices, setSelectedSlices] = useState<number[]>([]);
  const [fracStatus, setFracStatus] = useState<'playing' | 'ok'>('playing');

  // Mode 4: Clock + Coins alternating challenge
  const [clockTargetHour, setClockTargetHour] = useState(3);
  const [coinTargetEur, setCoinTargetEur] = useState(7);
  const [coinsTray, setCoinsTray] = useState<number[]>([]);
  const [clockAnswerFeedback, setClockAnswerFeedback] = useState<'ok' | 'retry' | null>(null);

  // Mode 5: 2-Player Local Sibling Duel
  const [duelQuestion, setDuelQuestion] = useState<MathQuestion>(() =>
    generateAdaptiveMathQuestion(ageGroup, 1)
  );
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [duelWinner, setDuelWinner] = useState<1 | 2 | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubblesRef = useRef<FloatingMathBubble[]>([]);
  const particlesRef = useRef<PopParticle[]>([]);
  const pulsesRef = useRef<SonarPulse[]>([]);
  const adaptiveRef = useRef(adaptive);
  adaptiveRef.current = adaptive;
  const victoryRef = useRef(victory);
  victoryRef.current = victory;

  const spawnBubblesForQuestion = useCallback(
    (q: MathQuestion) => {
      const canvas = canvasRef.current;
      const height = canvas ? canvas.clientHeight || 220 : 220;
      const slots = [0.16, 0.39, 0.62, 0.84];
      bubblesRef.current = q.choices.map((val, idx) => ({
        id: Date.now() + idx,
        value: val,
        xFrac: slots[idx % slots.length],
        yPx: -26 - idx * Math.min(34, height * 0.12),
        radiusPx: ageGroup === '3-5' ? 35 : 31,
        color: palette[idx % palette.length],
        wobblePhase: idx * 1.4,
      }));
    },
    [ageGroup, palette]
  );

  const loadNextQuestion = useCallback(
    (levelToUse: number) => {
      const nextQ = generateAdaptiveMathQuestion(ageGroup, levelToUse);
      setQuestion(nextQ);
      setFeedback(null);
      setHintText(null);
      spawnBubblesForQuestion(nextQ);
    },
    [ageGroup, spawnBubblesForQuestion]
  );

  const restartRound = useCallback(() => {
    const initialAdaptive: AdaptiveMathState = {
      level: 1,
      streak: 0,
      fallSpeedPxPerSec: ageGroup === '3-5' ? 30 : ageGroup === '6-8' ? 44 : 56,
    };
    setAdaptive(initialAdaptive);
    setScore(0);
    setCaughtCount(0);
    setVictory(false);
    setConfettiActive(false);
    particlesRef.current = [];
    pulsesRef.current = [];
    loadNextQuestion(1);
  }, [ageGroup, loadNextQuestion]);

  useEffect(() => {
    restartRound();
  }, [ageGroup, restartRound]);

  // Canvas Reef Animation Loop (only when subMode === 'bubbles')
  useEffect(() => {
    if (subMode !== 'bubbles') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(260, Math.floor(rect.width * dpr));
      canvas.height = Math.max(145, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const phase = now * 0.0018;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);

      const grad = ctx.createLinearGradient(0, 0, 0, cssH);
      if (hasGalaxyTheme) {
        grad.addColorStop(0, '#0D0B2E');
        grad.addColorStop(1, '#261354');
      } else {
        grad.addColorStop(0, '#062447');
        grad.addColorStop(0.65, '#0B3A63');
        grad.addColorStop(1, '#08253E');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.fillStyle = 'rgba(186, 230, 253, 0.24)';
      for (let i = 0; i < 14; i++) {
        const bx = ((i * 157 + 29) % 100) * 0.01 * cssW;
        const by = (1 - (((i * 47 + now * 0.025) % 100) * 0.01)) * cssH;
        ctx.beginPath();
        ctx.arc(bx, by, (i % 3) + 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const subX = cssW * (0.5 + Math.sin(phase * 0.42) * 0.36);
      drawSubmarine(ctx, subX, cssH - 28, phase);

      const alivePulses: SonarPulse[] = [];
      for (const s of pulsesRef.current) {
        s.radius += 190 * dt;
        s.life -= dt * 1.8;
        if (s.life > 0) {
          alivePulses.push(s);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = s.color;
          ctx.globalAlpha = Math.max(0, s.life);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      pulsesRef.current = alivePulses;

      if (!victoryRef.current) {
        const speed = adaptiveRef.current.fallSpeedPxPerSec;
        for (const b of bubblesRef.current) {
          b.yPx += speed * dt;
          b.wobblePhase += dt * 2.4;
          if (b.yPx - b.radiusPx > cssH - 22) {
            b.yPx = -b.radiusPx - 14;
          }
          const bx = b.xFrac * cssW + Math.sin(b.wobblePhase) * 8;
          const by = b.yPx;
          const radial = ctx.createRadialGradient(
            bx - b.radiusPx * 0.3,
            by - b.radiusPx * 0.3,
            b.radiusPx * 0.12,
            bx,
            by,
            b.radiusPx
          );
          radial.addColorStop(0, '#FFFFFF');
          radial.addColorStop(0.28, b.color);
          radial.addColorStop(1, '#0C4A6E');

          ctx.beginPath();
          ctx.arc(bx, by, b.radiusPx, 0, Math.PI * 2);
          ctx.fillStyle = radial;
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.82)';
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = `900 ${Math.round(b.radiusPx * 0.85)}px Outfit, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(b.value), bx, by + 1);
        }
      }

      const aliveParts: PopParticle[] = [];
      for (const p of particlesRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.9;
        if (p.life > 0) {
          aliveParts.push(p);
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      particlesRef.current = aliveParts;

      ctx.restore();
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [hasGalaxyTheme, subMode]);

  const spawnPopEffect = (val: number, color: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.clientWidth || 320;
    const bubble = bubblesRef.current.find((b) => b.value === val);
    const bx = bubble ? bubble.xFrac * cssW : cssW * 0.5;
    const by = bubble ? Math.max(30, bubble.yPx) : 100;

    pulsesRef.current.push({ x: bx, y: by, radius: 14, color, life: 1 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 120;
      particlesRef.current.push({
        x: bx,
        y: by,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 1,
        color,
        r: 2.5 + Math.random() * 3,
      });
    }
  };

  const handleSelectNumber = useCallback(
    (val: number) => {
      if (victory) return;
      const isCorrect = val === question.answer;
      const nextAdaptive = computeAdaptiveMathStep(adaptive, isCorrect, ageGroup);
      setAdaptive(nextAdaptive);
      recordDomainResult('math', isCorrect);

      if (isCorrect) {
        triggerHaptic('success');
        playKidsBubblePop(ux.soundEnabled);
        playKidsComboNote(nextAdaptive.streak - 1, ux.soundEnabled);
        spawnPopEffect(val, '#34D399');

        const nextCaught = caughtCount + 1;
        setCaughtCount(nextCaught);
        setScore((s) => s + 10 * adaptive.level);
        setFeedback('correct');
        onMissionPlay?.();
        onEarnStar(2, nextAdaptive.streak >= 3 ? 'math_wizard' : undefined);

        if (nextCaught >= ROUND_GOAL) {
          setVictory(true);
          setConfettiActive(true);
          playKidsSound('levelUp', ux.soundEnabled, true);
          onEarnStar(3, 'math_wizard');
        } else {
          window.setTimeout(() => {
            loadNextQuestion(nextAdaptive.level);
          }, 520);
        }
      } else {
        triggerHaptic('warning');
        playKidsSound('error', ux.soundEnabled, true);
        spawnPopEffect(val, '#FB7185');
        setFeedback('wrong');
      }
    },
    [
      adaptive,
      ageGroup,
      caughtCount,
      loadNextQuestion,
      onEarnStar,
      onMissionPlay,
      question.answer,
      recordDomainResult,
      ux.soundEnabled,
      victory,
    ]
  );

  // Balance scale next challenge
  const nextScaleChallenge = () => {
    const cap = ageGroup === '3-5' ? 6 : ageGroup === '6-8' ? 12 : 20;
    const base = Math.floor(Math.random() * Math.max(2, Math.floor(cap / 2))) + 1;
    const missing = Math.floor(Math.random() * Math.max(2, Math.floor(cap / 2))) + 1;
    setScaleBase(base);
    setScaleTarget(base + missing);
    setScaleAdded(0);
    setScaleStatus('playing');
  };

  const handleAddScaleWeight = (delta: number) => {
    if (scaleStatus === 'ok') return;
    const nextVal = Math.max(0, scaleAdded + delta);
    setScaleAdded(nextVal);
    const leftTotal = scaleBase + nextVal;
    if (leftTotal === scaleTarget) {
      setScaleStatus('ok');
      setConfettiActive(true);
      playKidsSound('levelUp', ux.soundEnabled, true);
      recordDomainResult('math', true);
      onEarnStar(3, 'math_wizard');
      onMissionPlay?.();
    } else if (leftTotal > scaleTarget) {
      setScaleStatus('high');
      playKidsSound('error', ux.soundEnabled, true);
    } else {
      setScaleStatus('playing');
      playKidsSound('tap', ux.soundEnabled, true);
    }
  };

  // Pizza Fractions next challenge
  const nextFractionChallenge = () => {
    const denoms = ageGroup === '3-5' ? [2, 4] : [3, 4, 5, 6];
    const d = denoms[Math.floor(Math.random() * denoms.length)];
    const n = Math.floor(Math.random() * (d - 1)) + 1;
    setFracDenom(d);
    setFracTargetNum(n);
    setSelectedSlices([]);
    setFracStatus('playing');
  };

  const toggleSlice = (sliceIdx: number) => {
    if (fracStatus === 'ok') return;
    playKidsSound('tap', ux.soundEnabled, true);
    const next = selectedSlices.includes(sliceIdx)
      ? selectedSlices.filter((s) => s !== sliceIdx)
      : [...selectedSlices, sliceIdx];
    setSelectedSlices(next);
    if (next.length === fracTargetNum) {
      setFracStatus('ok');
      setConfettiActive(true);
      playKidsSound('levelUp', ux.soundEnabled, true);
      recordDomainResult('math', true);
      onEarnStar(3, 'math_wizard');
      onMissionPlay?.();
    }
  };

  const handleAskHint = async () => {
    setHintLoading(true);
    try {
      const res = await fetch('/api/kids/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: kidsLang,
          ageGroup,
          mode: 'math_hint',
          question: question.prompt,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && data?.tutor?.explanation) {
        setHintText(String(data.tutor.explanation));
        if (ux.soundEnabled) {
          void speakKidsText(String(data.tutor.explanation), kidsLang, { ageGroup });
        }
      } else {
        setHintText(t.aiUnavailable);
      }
    } catch {
      setHintText(t.aiConnError);
    } finally {
      setHintLoading(false);
    }
  };

  const coinTotal = coinsTray.reduce((acc, v) => acc + v, 0);

  return (
    <div
      dir={dir}
      className="flex-1 min-h-0 rounded-2xl bg-[#0D1A36] border-2 border-sky-400/25 p-2 sm:p-3 flex flex-col gap-2 overflow-hidden relative"
    >
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* MONTESSORI LAB SUB-MODES */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-[#081329] p-1 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'bubbles', label: 'Burbujas', icon: Star },
              { id: 'scale', label: 'Báscula', icon: Scale },
              { id: 'fractions', label: 'Fracciones', icon: PieChart },
              { id: 'clock_coins', label: 'Reloj y Monedas', icon: Clock },
              { id: 'duel', label: '2 Hermanos', icon: Users },
            ] as const
          ).map((m) => {
            const Icon = m.icon;
            const act = subMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  playKidsSound('tap', ux.soundEnabled, true);
                  setSubMode(m.id);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  act ? 'bg-sky-400 text-slate-950 shadow' : 'text-sky-100/80 hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        <span className="text-xs font-black text-amber-300 tabular-nums px-2">
          Lv.{adaptive.level} · {score} pts
        </span>
      </div>

      {/* MODE 1: REEF BUBBLES */}
      {subMode === 'bubbles' && (
        <>
          <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-1 rounded-xl bg-[#081329] border border-white/10 text-xs font-black">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1 text-emerald-300 tabular-nums">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                {adaptive.streak}
              </span>
              <span className="inline-flex items-center gap-1 text-amber-300 tabular-nums">
                <Star className="w-3.5 h-3.5 fill-amber-300" />
                {caughtCount}/{ROUND_GOAL}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <KidsSpeakButton text={question.prompt} lang={kidsLang} size="md" />
              <button
                type="button"
                disabled={hintLoading}
                onClick={() => void handleAskHint()}
                className="h-9 px-2.5 rounded-xl bg-amber-400/20 border border-amber-300/40 text-xs font-black text-amber-200 flex items-center gap-1 cursor-pointer"
              >
                {hintLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HelpCircle className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{t.mathHintBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => loadNextQuestion(adaptive.level)}
                className="h-9 px-2.5 rounded-xl bg-white/10 text-white flex items-center cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center text-center">
            {question.visualCountA !== undefined && question.visualCountB !== undefined && question.visualShape && (
              <div className="flex items-center justify-center gap-2 mb-0.5">
                <CountingShapeRow count={question.visualCountA} shape={question.visualShape} tint="#FBBF24" />
                <span className="font-black text-base text-sky-300">+</span>
                <CountingShapeRow count={question.visualCountB} shape={question.visualShape} tint="#38BDF8" />
              </div>
            )}
            <div className="font-display font-black text-2xl sm:text-4xl text-white tabular-nums leading-none">
              {question.prompt}
            </div>
            <div className="text-[11px] font-bold mt-0.5 min-h-[16px]">
              {feedback === 'correct' ? (
                <span className="text-emerald-300">+{10 * adaptive.level}</span>
              ) : feedback === 'wrong' ? (
                <span className="text-amber-300">{t.mathTryAnother}</span>
              ) : hintText ? (
                <span className="text-sky-200">{hintText}</span>
              ) : null}
            </div>
          </div>

          <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border-2 border-sky-400/30 bg-[#062447]">
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                const canvas = canvasRef.current;
                if (!canvas || victory) return;
                const rect = canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                for (const b of bubblesRef.current) {
                  const bx = b.xFrac * rect.width + Math.sin(b.wobblePhase) * 8;
                  const by = b.yPx;
                  if (Math.hypot(clickX - bx, clickY - by) <= b.radiusPx + 14) {
                    handleSelectNumber(b.value);
                    return;
                  }
                }
              }}
              className="w-full h-full block touch-none cursor-pointer"
            />
            {victory && (
              <div className="absolute inset-0 bg-[#07152E]/92 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-4 text-center">
                <Trophy className="w-10 h-10 text-amber-300" />
                <h3 className="font-display font-black text-2xl text-amber-300">{t.mathVictoryTitle}</h3>
                <KidsSquishButton
                  onClick={restartRound}
                  className="px-6 rounded-2xl bg-emerald-400 text-slate-950 font-black text-base"
                >
                  {t.gameRetryBtn}
                </KidsSquishButton>
              </div>
            )}
          </div>

          {!victory && (
            <div className="shrink-0 grid grid-cols-4 gap-2">
              {question.choices.map((opt) => (
                <KidsSquishButton
                  key={opt}
                  onClick={() => handleSelectNumber(opt)}
                  className="landscape:h-11 rounded-2xl bg-[#162C5B] hover:bg-[#214184] border-2 border-b-4 border-sky-400/45 text-white font-display font-black text-lg sm:text-2xl flex items-center justify-center tabular-nums"
                >
                  {opt}
                </KidsSquishButton>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODE 2: MONTESSORI VISUAL BALANCE SCALE */}
      {subMode === 'scale' && (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-between gap-3 p-3 rounded-2xl bg-[#09132B] border border-white/10 overflow-y-auto">
          <div className="text-center space-y-1">
            <h3 className="font-display font-black text-lg sm:text-2xl text-white">
              Equilibra la Báscula: {scaleBase} + <span className="text-amber-300">{scaleAdded}</span> = {scaleTarget}
            </h3>
            <p className="text-xs font-bold text-sky-200/80">
              Pulsa las pesas para igualar ambos lados de la balanza.
            </p>
          </div>

          {/* Visual Tilt Beam */}
          {(() => {
            const left = scaleBase + scaleAdded;
            const tiltDeg = Math.max(-12, Math.min(12, (scaleTarget - left) * 3));
            return (
              <div className="w-full max-w-md py-4 flex flex-col items-center gap-2">
                <div
                  className="w-full flex items-end justify-between gap-4 transition-transform duration-300"
                  style={{ transform: `rotate(${tiltDeg}deg)` }}
                >
                  <div className="flex-1 p-3 rounded-2xl bg-[#182756] border-2 border-amber-400/60 text-center">
                    <div className="text-[11px] font-bold text-amber-300">IZQUIERDA</div>
                    <div className="font-display font-black text-3xl text-white tabular-nums">
                      {left}
                    </div>
                  </div>
                  <div className="flex-1 p-3 rounded-2xl bg-[#182756] border-2 border-sky-400/60 text-center">
                    <div className="text-[11px] font-bold text-sky-300">OBJETIVO</div>
                    <div className="font-display font-black text-3xl text-white tabular-nums">
                      {scaleTarget}
                    </div>
                  </div>
                </div>
                <div className="w-4/5 h-2 rounded-full bg-slate-600" />
                <div className="w-8 h-8 bg-slate-700 rounded-t-xl border border-white/20" />
              </div>
            );
          })()}

          {scaleStatus === 'ok' ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-emerald-300 font-black text-base">
                <CheckCircle2 className="w-5 h-5" /> ¡Equilibrado! +3 estrellas
              </span>
              <KidsSquishButton
                onClick={nextScaleChallenge}
                className="px-5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs"
              >
                Siguiente reto
              </KidsSquishButton>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[-1, 1, 2, 5].map((delta) => (
                <KidsSquishButton
                  key={delta}
                  onClick={() => handleAddScaleWeight(delta)}
                  className="px-5 rounded-2xl bg-[#1E2E68] border-b-4 border-[#0E1638] text-white font-black text-lg tabular-nums"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </KidsSquishButton>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODE 3: INTERACTIVE PIZZA FRACTIONS */}
      {subMode === 'fractions' && (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-between gap-3 p-3 rounded-2xl bg-[#09132B] border border-white/10 overflow-y-auto">
          <div className="text-center">
            <h3 className="font-display font-black text-xl sm:text-2xl text-white">
              Toca exactamente <span className="text-amber-300">{fracTargetNum}/{fracDenom}</span> de la pizza
            </h3>
            <p className="text-xs font-bold text-sky-200/80">
              Seleccionadas: {selectedSlices.length} de {fracDenom} porciones
            </p>
          </div>

          <svg width="210" height="210" viewBox="0 0 200 200" className="drop-shadow-xl">
            {Array.from({ length: fracDenom }).map((_, i) => {
              const startA = (i / fracDenom) * Math.PI * 2 - Math.PI / 2;
              const endA = ((i + 1) / fracDenom) * Math.PI * 2 - Math.PI / 2;
              const x1 = 100 + Math.cos(startA) * 86;
              const y1 = 100 + Math.sin(startA) * 86;
              const x2 = 100 + Math.cos(endA) * 86;
              const y2 = 100 + Math.sin(endA) * 86;
              const largeArc = endA - startA > Math.PI ? 1 : 0;
              const active = selectedSlices.includes(i);
              return (
                <path
                  key={i}
                  d={`M 100 100 L ${x1} ${y1} A 86 86 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  fill={active ? '#F59E0B' : '#1E293B'}
                  stroke="#0F172A"
                  strokeWidth="4"
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleSlice(i)}
                />
              );
            })}
            <circle cx="100" cy="100" r="88" fill="none" stroke="#FBBF24" strokeWidth="3" pointerEvents="none" />
          </svg>

          {fracStatus === 'ok' ? (
            <div className="flex items-center gap-3">
              <span className="text-emerald-300 font-black text-base">
                ¡Fracción {fracTargetNum}/{fracDenom} perfecta! +3 estrellas
              </span>
              <KidsSquishButton
                onClick={nextFractionChallenge}
                className="px-5 rounded-xl bg-emerald-400 text-slate-950 font-black text-xs"
              >
                Otra pizza
              </KidsSquishButton>
            </div>
          ) : (
            <KidsSquishButton
              onClick={nextFractionChallenge}
              className="px-4 rounded-xl bg-white/10 text-white text-xs font-black"
            >
              Cambiar fracción
            </KidsSquishButton>
          )}
        </div>
      )}

      {/* MODE 4: ANALOG CLOCK + COINS WORKSHOP */}
      {subMode === 'clock_coins' && (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto p-1">
          {/* Analog Clock Card */}
          <div className="rounded-2xl bg-[#09132B] border border-white/15 p-3.5 flex flex-col items-center justify-between gap-2.5">
            <div className="text-center">
              <div className="text-xs font-black text-sky-300 uppercase">Reloj Analógico</div>
              <div className="font-display font-black text-lg text-white">
                ¿Qué hora marca? {clockAnswerFeedback === 'ok' ? '(¡Correcto!)' : ''}
              </div>
            </div>
            <svg width="136" height="136" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="#17234B" stroke="#38BDF8" strokeWidth="4" />
              {[12, 3, 6, 9].map((n) => {
                const ang = (n / 12) * Math.PI * 2 - Math.PI / 2;
                return (
                  <text
                    key={n}
                    x={60 + Math.cos(ang) * 40}
                    y={60 + Math.sin(ang) * 40 + 4}
                    textAnchor="middle"
                    fill="#E2E8F0"
                    fontSize="11"
                    fontWeight="900"
                  >
                    {n}
                  </text>
                );
              })}
              {/* Minute hand at 12 */}
              <line x1="60" y1="60" x2="60" y2="22" stroke="#94A3B8" strokeWidth="3.5" strokeLinecap="round" />
              {/* Hour hand */}
              {(() => {
                const hAng = (clockTargetHour / 12) * Math.PI * 2 - Math.PI / 2;
                return (
                  <line
                    x1="60"
                    y1="60"
                    x2={60 + Math.cos(hAng) * 28}
                    y2={60 + Math.sin(hAng) * 28}
                    stroke="#FBBF24"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                );
              })()}
              <circle cx="60" cy="60" r="4" fill="#FBBF24" />
            </svg>
            <div className="grid grid-cols-4 gap-1.5 w-full">
              {[clockTargetHour, ((clockTargetHour + 2) % 12) || 12, ((clockTargetHour + 5) % 12) || 12, ((clockTargetHour + 8) % 12) || 12]
                .sort((a, b) => a - b)
                .map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      const ok = h === clockTargetHour;
                      recordDomainResult('math', ok);
                      if (ok) {
                        setClockAnswerFeedback('ok');
                        playKidsSound('success', ux.soundEnabled, true);
                        onEarnStar(2);
                        window.setTimeout(() => {
                          setClockAnswerFeedback(null);
                          setClockTargetHour((prev) => ((prev + 3) % 12) || 12);
                        }, 800);
                      } else {
                        setClockAnswerFeedback('retry');
                        playKidsSound('error', ux.soundEnabled, true);
                      }
                    }}
                    className="h-9 rounded-xl bg-[#1C2A5E] hover:bg-sky-400 hover:text-slate-950 text-white font-black text-xs cursor-pointer"
                  >
                    {h}:00
                  </button>
                ))}
            </div>
          </div>

          {/* Coins Lab Card */}
          <div className="rounded-2xl bg-[#09132B] border border-white/15 p-3.5 flex flex-col items-center justify-between gap-2.5">
            <div className="text-center">
              <div className="text-xs font-black text-amber-300 uppercase">Tienda de Monedas</div>
              <div className="font-display font-black text-lg text-white">
                Paga <span className="text-amber-300">{coinTargetEur}€</span> · Llevas{' '}
                <span className={coinTotal === coinTargetEur ? 'text-emerald-300' : 'text-sky-300'}>
                  {coinTotal}€
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 min-h-[60px] flex-wrap">
              {coinsTray.length === 0 ? (
                <span className="text-xs text-sky-200/60">Toca monedas para sumar</span>
              ) : (
                coinsTray.map((val, idx) => (
                  <span
                    key={idx}
                    className="w-11 h-11 rounded-full bg-amber-400 border-2 border-amber-200 text-slate-950 font-black text-sm flex items-center justify-center shadow"
                  >
                    {val}€
                  </span>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 w-full">
              {[1, 2, 5].map((cVal) => (
                <KidsSquishButton
                  key={cVal}
                  onClick={() => {
                    const nextTray = [...coinsTray, cVal];
                    const nextSum = coinTotal + cVal;
                    setCoinsTray(nextTray);
                    if (nextSum === coinTargetEur) {
                      setConfettiActive(true);
                      playKidsSound('levelUp', ux.soundEnabled, true);
                      recordDomainResult('math', true);
                      onEarnStar(3);
                      window.setTimeout(() => {
                        setCoinsTray([]);
                        setCoinTargetEur(Math.floor(Math.random() * 9) + 3);
                      }, 850);
                    } else if (nextSum > coinTargetEur) {
                      playKidsSound('error', ux.soundEnabled, true);
                      window.setTimeout(() => setCoinsTray([]), 500);
                    } else {
                      playKidsSound('tap', ux.soundEnabled, true);
                    }
                  }}
                  className="flex-1 rounded-xl bg-amber-400 text-slate-950 font-black text-sm"
                >
                  +{cVal}€
                </KidsSquishButton>
              ))}
              <button
                type="button"
                onClick={() => setCoinsTray([])}
                className="h-11 px-3 rounded-xl bg-white/10 text-white text-xs font-black cursor-pointer"
              >
                0
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE 5: 2-PLAYER LOCAL SIBLING MATH DUEL */}
      {subMode === 'duel' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5">
          <div className="shrink-0 p-3 rounded-2xl bg-[#081329] border border-amber-400/35 text-center">
            <div className="text-[11px] font-black uppercase text-amber-300">
              Duelo Rápido (primero en 5 puntos)
            </div>
            <div className="font-display font-black text-2xl sm:text-4xl text-white">
              {duelQuestion.prompt}
            </div>
          </div>

          {duelWinner ? (
            <div className="flex-1 rounded-2xl bg-[#0B1533] border border-emerald-400/40 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <Trophy className="w-12 h-12 text-amber-300" />
              <h3 className="font-display font-black text-2xl text-white">
                ¡Gana Jugador {duelWinner}!
              </h3>
              <KidsSquishButton
                onClick={() => {
                  setP1Score(0);
                  setP2Score(0);
                  setDuelWinner(null);
                  setDuelQuestion(generateAdaptiveMathQuestion(ageGroup, 1));
                }}
                className="px-6 rounded-2xl bg-emerald-400 text-slate-950 font-black text-sm"
              >
                Revancha
              </KidsSquishButton>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-2 gap-3">
              {[1, 2].map((playerNum) => {
                const pScore = playerNum === 1 ? p1Score : p2Score;
                const tint =
                  playerNum === 1
                    ? 'border-sky-400/50 bg-[#122048]'
                    : 'border-pink-400/50 bg-[#24163D]';
                return (
                  <div
                    key={playerNum}
                    className={`rounded-2xl border-2 p-3 flex flex-col justify-between gap-2 ${tint}`}
                  >
                    <div className="flex items-center justify-between font-black text-xs sm:text-sm text-white">
                      <span>Jugador {playerNum}</span>
                      <span className="text-amber-300 tabular-nums">{pScore}/5</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      {duelQuestion.choices.map((val) => (
                        <KidsSquishButton
                          key={val}
                          onClick={() => {
                            if (val === duelQuestion.answer) {
                              playKidsSound('success', ux.soundEnabled, true);
                              recordDomainResult('math', true);
                              const nextScore = pScore + 1;
                              if (playerNum === 1) setP1Score(nextScore);
                              else setP2Score(nextScore);
                              if (nextScore >= 5) {
                                setDuelWinner(playerNum as 1 | 2);
                                setConfettiActive(true);
                                onEarnStar(4, 'math_wizard');
                                onMissionPlay?.();
                              } else {
                                setDuelQuestion(generateAdaptiveMathQuestion(ageGroup, 2));
                              }
                            } else {
                              playKidsSound('error', ux.soundEnabled, true);
                            }
                          }}
                          className="rounded-xl bg-[#0A1128] hover:bg-amber-400 hover:text-slate-950 text-white font-display font-black text-xl tabular-nums"
                        >
                          {val}
                        </KidsSquishButton>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
