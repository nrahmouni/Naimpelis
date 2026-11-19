import type { KidsAgeGroup } from '../../types';

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

export type MathSubMode = 'bubbles' | 'scale' | 'fractions' | 'clock_coins' | 'duel';

export interface FloatingMathBubble {
  id: number;
  value: number;
  xFrac: number;
  yPx: number;
  radiusPx: number;
  color: string;
  wobblePhase: number;
}

export interface PopParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  r: number;
}

export interface SonarPulse {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
}

export const BUBBLE_PALETTES_STANDARD = ['#38BDF8', '#F59E0B', '#10B981', '#EC4899'];
export const BUBBLE_PALETTES_GALAXY = ['#8B5CF6', '#06B6D4', '#F43F5E', '#FBBF24'];
export const ROUND_GOAL = 8;

export function drawSubmarine(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number) {
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
