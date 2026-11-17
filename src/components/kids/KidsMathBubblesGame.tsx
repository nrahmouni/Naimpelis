import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle, Loader2, RefreshCw } from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { playKidsSound } from './kidsAudioEngine';
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
 * Motor adaptativo para Mates:
 * - Cada 3 aciertos seguidos sube el nivel y la velocidad de caída.
 * - Al fallar, se reinicia la racha y baja la velocidad suavemente.
 */
export function computeAdaptiveMathStep(
  prev: AdaptiveMathState,
  isCorrect: boolean,
  ageGroup: KidsAgeGroup
): AdaptiveMathState {
  const baseSpeed = ageGroup === '3-5' ? 32 : ageGroup === '6-8' ? 46 : 58;
  if (isCorrect) {
    const nextStreak = prev.streak + 1;
    const leveledUp = nextStreak > 0 && nextStreak % 3 === 0;
    const nextLevel = leveledUp ? Math.min(6, prev.level + 1) : prev.level;
    const nextSpeed = Math.min(130, baseSpeed + (nextLevel - 1) * 14);
    return {
      level: nextLevel,
      streak: nextStreak,
      fallSpeedPxPerSec: nextSpeed,
    };
  }
  return {
    level: Math.max(1, prev.level),
    streak: 0,
    fallSpeedPxPerSec: Math.max(26, prev.fallSpeedPxPerSec - 12),
  };
}

export interface MathQuestion {
  prompt: string;
  visualEmojis?: string;
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
  let visualEmojis: string | undefined;
  let answer = 0;

  if (ageGroup === '3-5') {
    const cap = Math.min(9, 4 + adaptiveLevel);
    const a = rand(1, cap);
    const b = rand(1, Math.max(2, Math.min(5, cap)));
    answer = a + b;
    const icons = ['🍎', '⭐', '🐣', '🍓', '🎈'];
    const icon = icons[rand(0, icons.length - 1)];
    if (a + b <= 10) {
      visualEmojis = `${icon.repeat(a)} + ${icon.repeat(b)}`;
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
  return { prompt, visualEmojis, answer, choices };
}

interface FloatingMathBubble {
  id: number;
  value: number;
  xFrac: number;
  yPx: number;
  radiusPx: number;
  color: string;
  wobblePhase: number;
}

const BUBBLE_PALETTES_STANDARD = ['#38BDF8', '#F59E0B', '#10B981', '#EC4899'];
const BUBBLE_PALETTES_GALAXY = ['#8B5CF6', '#06B6D4', '#F43F5E', '#FBBF24'];
const ROUND_GOAL = 8;

interface KidsMathBubblesGameProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  unlockedRewards: string[];
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionLearn?: () => void;
}

export const KidsMathBubblesGame: React.FC<KidsMathBubblesGameProps> = ({
  kidsLang,
  ageGroup,
  unlockedRewards,
  onEarnStar,
  onMissionLearn,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const hasGalaxyTheme = unlockedRewards.includes('math_galaxy_theme');
  const palette = hasGalaxyTheme ? BUBBLE_PALETTES_GALAXY : BUBBLE_PALETTES_STANDARD;

  const [adaptive, setAdaptive] = useState<AdaptiveMathState>(() =>
    computeAdaptiveMathStep({ level: 1, streak: 0, fallSpeedPxPerSec: 42 }, false, ageGroup)
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubblesRef = useRef<FloatingMathBubble[]>([]);
  const adaptiveRef = useRef(adaptive);
  adaptiveRef.current = adaptive;
  const questionRef = useRef(question);
  questionRef.current = question;
  const victoryRef = useRef(victory);
  victoryRef.current = victory;

  const spawnBubblesForQuestion = useCallback(
    (q: MathQuestion) => {
      const canvas = canvasRef.current;
      const height = canvas ? canvas.clientHeight || 260 : 260;
      const slots = [0.16, 0.39, 0.62, 0.84];
      bubblesRef.current = q.choices.map((val, idx) => ({
        id: Date.now() + idx,
        value: val,
        xFrac: slots[idx % slots.length],
        yPx: -38 - idx * Math.min(44, height * 0.14),
        radiusPx: ageGroup === '3-5' ? 38 : 34,
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
      fallSpeedPxPerSec: ageGroup === '3-5' ? 32 : ageGroup === '6-8' ? 46 : 58,
    };
    setAdaptive(initialAdaptive);
    setScore(0);
    setCaughtCount(0);
    setVictory(false);
    setConfettiActive(false);
    loadNextQuestion(1);
  }, [ageGroup, loadNextQuestion]);

  useEffect(() => {
    restartRound();
  }, [ageGroup, restartRound]);

  // Canvas animation loop
  useEffect(() => {
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
      canvas.width = Math.max(280, Math.floor(rect.width * dpr));
      canvas.height = Math.max(200, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.width;
      const ch = canvas.height;
      const cssW = cw / dpr;
      const cssH = ch / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);

      // Soft gradient sky
      const grad = ctx.createLinearGradient(0, 0, 0, cssH);
      if (hasGalaxyTheme) {
        grad.addColorStop(0, '#0D0B26');
        grad.addColorStop(1, '#1E1548');
      } else {
        grad.addColorStop(0, '#101A3B');
        grad.addColorStop(1, '#1A2B5E');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssW, cssH);

      // Decorative subtle background stars
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 14; i++) {
        const sx = ((i * 157 + 29) % 100) * 0.01 * cssW;
        const sy = ((i * 97 + 19) % 90) * 0.01 * cssH;
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!victoryRef.current) {
        const speed = adaptiveRef.current.fallSpeedPxPerSec;
        for (const b of bubblesRef.current) {
          b.yPx += speed * dt;
          b.wobblePhase += dt * 2.2;
          if (b.yPx - b.radiusPx > cssH + 12) {
            b.yPx = -b.radiusPx - 14;
          }

          const bx = b.xFrac * cssW + Math.sin(b.wobblePhase) * 6;
          const by = b.yPx;

          // Bubble glow & sphere
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
          radial.addColorStop(1, '#0F172A');

          ctx.beginPath();
          ctx.arc(bx, by, b.radiusPx, 0, Math.PI * 2);
          ctx.fillStyle = radial;
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(255,255,255,0.72)';
          ctx.stroke();

          // Gloss highlight
          ctx.beginPath();
          ctx.arc(bx - b.radiusPx * 0.32, by - b.radiusPx * 0.32, b.radiusPx * 0.18, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fill();

          // Number label
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `900 ${Math.round(b.radiusPx * 0.85)}px Fredoka, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.45)';
          ctx.shadowBlur = 4;
          ctx.fillText(String(b.value), bx, by + 2);
          ctx.shadowBlur = 0;
        }
      }

      ctx.restore();
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [hasGalaxyTheme]);

  const handleSelectNumber = (val: number) => {
    if (victory) return;
    const isCorrect = val === question.answer;
    const nextAdaptive = computeAdaptiveMathStep(adaptive, isCorrect, ageGroup);
    setAdaptive(nextAdaptive);

    if (isCorrect) {
      triggerHaptic('success');
      playKidsSound('success', ux.soundEnabled, true);
      const nextCaught = caughtCount + 1;
      setCaughtCount(nextCaught);
      setScore((s) => s + 10 * adaptive.level);
      setFeedback('correct');
      onMissionLearn?.();
      onEarnStar(2, nextAdaptive.streak >= 3 ? 'math_wizard' : undefined);

      if (nextCaught >= ROUND_GOAL) {
        setVictory(true);
        setConfettiActive(true);
        playKidsSound('levelUp', ux.soundEnabled, true);
        onEarnStar(3, 'math_wizard');
        if (ux.soundEnabled) {
          void speakKidsText(t.mathVictoryTitle, kidsLang, { ageGroup });
        }
      } else {
        window.setTimeout(() => {
          loadNextQuestion(nextAdaptive.level);
        }, 550);
      }
    } else {
      triggerHaptic('warning');
      playKidsSound('error', ux.soundEnabled, true);
      setFeedback('wrong');
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || victory) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    for (const b of bubblesRef.current) {
      const bx = b.xFrac * rect.width + Math.sin(b.wobblePhase) * 6;
      const by = b.yPx;
      const dist = Math.hypot(clickX - bx, clickY - by);
      if (dist <= b.radiusPx + 14) {
        handleSelectNumber(b.value);
        return;
      }
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
      className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-[#24305C] p-2.5 sm:p-3 flex flex-col gap-2 overflow-hidden relative"
    >
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* Top adaptive telemetry bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#0F152B] border border-white/10 text-xs sm:text-sm font-black">
        <div className="flex items-center gap-2.5">
          <span className="text-sky-300">
            {t.mathAdaptiveLevel} {adaptive.level}
          </span>
          <span className="text-emerald-300">
            🔥 {t.mathStreak}: {adaptive.streak}
          </span>
          <span className="text-amber-300 tabular-nums">
            ⭐ {caughtCount}/{ROUND_GOAL} · {t.mathScore}: {score}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <KidsSpeakButton text={question.prompt} lang={kidsLang} size="md" />
          <button
            type="button"
            disabled={hintLoading}
            onClick={() => void handleAskHint()}
            className="min-h-11 px-3 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-xs font-black text-amber-200 flex items-center gap-1 cursor-pointer"
          >
            {hintLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HelpCircle className="w-3.5 h-3.5" />}
            <span>{t.mathHintBtn}</span>
          </button>
          <button
            type="button"
            onClick={() => loadNextQuestion(adaptive.level)}
            className="min-h-11 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.mathNewRound}</span>
          </button>
        </div>
      </div>

      {/* Equation Banner */}
      <div className="shrink-0 flex flex-col items-center justify-center py-1 text-center">
        {question.visualEmojis && (
          <div className="text-xl sm:text-2xl tracking-wide mb-0.5">{question.visualEmojis}</div>
        )}
        <div className="font-display font-black text-3xl sm:text-5xl text-white tabular-nums leading-none">
          {question.prompt}
        </div>
        <div className="text-xs font-bold mt-1 min-h-[18px]">
          {feedback === 'correct' ? (
            <span className="text-emerald-300">✅ +2 ⭐</span>
          ) : feedback === 'wrong' ? (
            <span className="text-amber-300">{t.mathTryAnother}</span>
          ) : hintText ? (
            <span className="text-sky-200">{hintText}</span>
          ) : (
            <span className="text-sky-200/80">{t.mathBubblesRule}</span>
          )}
        </div>
      </div>

      {/* Falling Bubbles Canvas */}
      <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border-2 border-sky-400/30 bg-[#0D132B]">
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          className="w-full h-full block touch-none cursor-pointer"
        />

        {victory && (
          <div className="absolute inset-0 bg-[#0B1026]/90 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="text-5xl">🏆</div>
            <h3 className="font-display font-black text-2xl sm:text-3xl text-amber-300">
              {t.mathVictoryTitle}
            </h3>
            <p className="text-sm sm:text-base font-bold text-white max-w-sm">
              {t.mathVictoryBody} ({t.mathScore}: {score})
            </p>
            <KidsSquishButton
              onClick={restartRound}
              className="px-6 rounded-2xl bg-gradient-to-b from-emerald-400 to-teal-500 text-slate-950 border-b-4 border-teal-700 font-black text-base"
            >
              {t.gameRetryBtn}
            </KidsSquishButton>
          </div>
        )}
      </div>

      {/* Accessible Giant Fallback Number Bar (>= 64px target height) */}
      {!victory && (
        <div className="shrink-0 grid grid-cols-4 gap-2">
          {question.choices.map((opt) => (
            <KidsSquishButton
              key={opt}
              onClick={() => handleSelectNumber(opt)}
              className="rounded-2xl bg-[#1D2859] hover:bg-[#293879] border-2 border-b-4 border-sky-400/40 text-white font-display font-black text-2xl flex items-center justify-center"
            >
              {opt}
            </KidsSquishButton>
          ))}
        </div>
      )}
    </div>
  );
};
