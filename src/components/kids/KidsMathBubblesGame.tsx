import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import {
  BUBBLE_PALETTES_GALAXY,
  BUBBLE_PALETTES_STANDARD,
  computeAdaptiveMathStep,
  drawSubmarine,
  generateAdaptiveMathQuestion,
  ROUND_GOAL,
  type AdaptiveMathState,
  type FloatingMathBubble,
  type MathQuestion,
  type MathSubMode,
  type MathVisualShape,
  type PopParticle,
  type SonarPulse,
} from './kidsMathEngine';
import { KidsMathMontessoriLabs } from './KidsMathMontessoriLabs';

export {
  computeAdaptiveMathStep,
  generateAdaptiveMathQuestion,
  type AdaptiveMathState,
  type MathQuestion,
  type MathVisualShape,
};

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

interface KidsMathBubblesGameProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  unlockedRewards: string[];
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
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

  const [scaleBase, setScaleBase] = useState(3);
  const [scaleTarget, setScaleTarget] = useState(7);
  const [scaleAdded, setScaleAdded] = useState(0);
  const [scaleStatus, setScaleStatus] = useState<'playing' | 'ok' | 'high'>('playing');

  const [fracDenom, setFracDenom] = useState(4);
  const [fracTargetNum, setFracTargetNum] = useState(3);
  const [selectedSlices, setSelectedSlices] = useState<number[]>([]);
  const [fracStatus, setFracStatus] = useState<'playing' | 'ok'>('playing');

  const [clockTargetHour, setClockTargetHour] = useState(3);
  const [coinTargetEur, setCoinTargetEur] = useState(7);
  const [coinsTray, setCoinsTray] = useState<number[]>([]);
  const [clockAnswerFeedback, setClockAnswerFeedback] = useState<'ok' | 'retry' | null>(null);

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
      {subMode === 'bubbles' ? (
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
      ) : (
        <KidsMathMontessoriLabs
          subMode={subMode}
          ageGroup={ageGroup}
          soundEnabled={ux.soundEnabled}
          recordDomainResult={recordDomainResult}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
          setConfettiActive={setConfettiActive}
          scaleBase={scaleBase}
          scaleTarget={scaleTarget}
          scaleAdded={scaleAdded}
          scaleStatus={scaleStatus}
          nextScaleChallenge={nextScaleChallenge}
          handleAddScaleWeight={handleAddScaleWeight}
          fracDenom={fracDenom}
          fracTargetNum={fracTargetNum}
          selectedSlices={selectedSlices}
          fracStatus={fracStatus}
          nextFractionChallenge={nextFractionChallenge}
          toggleSlice={toggleSlice}
          clockTargetHour={clockTargetHour}
          setClockTargetHour={setClockTargetHour}
          coinTargetEur={coinTargetEur}
          setCoinTargetEur={setCoinTargetEur}
          coinsTray={coinsTray}
          setCoinsTray={setCoinsTray}
          clockAnswerFeedback={clockAnswerFeedback}
          setClockAnswerFeedback={setClockAnswerFeedback}
          duelQuestion={duelQuestion}
          setDuelQuestion={setDuelQuestion}
          p1Score={p1Score}
          setP1Score={setP1Score}
          p2Score={p2Score}
          setP2Score={setP2Score}
          duelWinner={duelWinner}
          setDuelWinner={setDuelWinner}
        />
      )}
    </div>
  );
};
