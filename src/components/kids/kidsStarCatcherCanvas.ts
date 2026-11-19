import type { KidsLanguageCode } from '../../types';
import { EXTENDED_VOCAB_ITEMS, type ExtendedVocabItem } from './kidsCurriculumData';

export interface FallingObject {
  id: number;
  xFrac: number;
  yFrac: number;
  vxFrac: number;
  speed: number;
  radius: number;
  kind: 'word_target' | 'word_decoy' | 'star' | 'magnet' | 'shield' | 'meteor';
  label?: string;
  angle: number;
  rotSpeed: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export interface SpaceMissionChallenge {
  vocabId: string;
  promptDisplay: string;
  spokenPrompt: string;
  targetLabel: string;
  decoys: string[];
}

const BEST_SCORE_KEY = 'riffan_kids_stars_best_v1';

export function cleanWord(raw: string): string {
  const idx = raw.indexOf('(');
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim() || raw.trim();
}

export function readBestScore(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // ignore
  }
}

export function buildWaveChallenge(
  nativeLang: KidsLanguageCode,
  practiceLang: KidsLanguageCode
): SpaceMissionChallenge {
  const pool = EXTENDED_VOCAB_ITEMS;
  const pickIdx = Math.floor(Math.random() * pool.length);
  const item: ExtendedVocabItem = pool[pickIdx];
  const natWord = cleanWord((item.translations[nativeLang] || item.translations.es).word);
  const tgtWord = cleanWord((item.translations[practiceLang] || item.translations.en).word);

  const decoyWords: string[] = [];
  for (let i = 1; decoyWords.length < 2 && i < pool.length; i++) {
    const d = pool[(pickIdx + i * 7) % pool.length];
    const dw = cleanWord((d.translations[practiceLang] || d.translations.en).word);
    if (d.id !== item.id && dw !== tgtWord && !decoyWords.includes(dw)) {
      decoyWords.push(dw);
    }
  }

  return {
    vocabId: item.id,
    promptDisplay: natWord,
    spokenPrompt: tgtWord,
    targetLabel: tgtWord,
    decoys: decoyWords,
  };
}

export function drawStarShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  fill: string,
  stroke: string
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : outerR * 0.46;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export function drawWordCapsule(
  ctx: CanvasRenderingContext2D,
  label: string,
  isTargetHint: boolean
) {
  ctx.font = '900 13px Outfit, system-ui, sans-serif';
  const metrics = ctx.measureText(label);
  const pillW = Math.max(66, Math.min(138, metrics.width + 24));
  const pillH = 30;

  ctx.beginPath();
  ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 14);
  const grad = ctx.createLinearGradient(0, -pillH / 2, 0, pillH / 2);
  grad.addColorStop(0, isTargetHint ? '#1D4ED8' : '#1E293B');
  grad.addColorStop(1, isTargetHint ? '#0F172A' : '#0F172A');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#38BDF8';
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1, pillW - 12);
}

export function drawMeteorShape(ctx: CanvasRenderingContext2D, r: number) {
  const pts = [1.0, 0.78, 0.96, 0.72, 0.92, 0.8, 0.98, 0.74];
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = (i / pts.length) * Math.PI * 2;
    const rr = r * pts[i];
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
  g.addColorStop(0, '#94A3B8');
  g.addColorStop(0.65, '#475569');
  g.addColorStop(1, '#1E293B');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#F97316';
  ctx.stroke();
}

export function drawRocketSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tiltRad: number,
  isGolden: boolean,
  hasShield: boolean,
  hasMagnet: boolean,
  invulnSec: number,
  phase: number
) {
  if (invulnSec > 0 && Math.floor(invulnSec * 16) % 2 === 1) {
    ctx.globalAlpha = 0.45;
  }

  ctx.save();
  ctx.translate(x, y);

  if (hasMagnet) {
    ctx.save();
    ctx.rotate(phase * 0.25);
    ctx.beginPath();
    ctx.setLineDash([7, 6]);
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.78)';
    ctx.stroke();
    ctx.restore();
  }

  if (hasShield) {
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
    ctx.stroke();
  }

  ctx.rotate(tiltRad);

  const flameH = 14 + Math.sin(phase) * 5;
  ctx.beginPath();
  ctx.moveTo(-8, 19);
  ctx.lineTo(0, 19 + flameH);
  ctx.lineTo(8, 19);
  ctx.closePath();
  ctx.fillStyle = isGolden ? '#FDE047' : '#F97316';
  ctx.fill();

  ctx.fillStyle = isGolden ? '#D97706' : '#F43F5E';
  ctx.beginPath();
  ctx.moveTo(-13, 4);
  ctx.lineTo(-27, 21);
  ctx.lineTo(-10, 18);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(13, 4);
  ctx.lineTo(27, 21);
  ctx.lineTo(10, 18);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.quadraticCurveTo(18, -6, 13, 19);
  ctx.lineTo(-13, 19);
  ctx.quadraticCurveTo(-18, -6, 0, -30);
  ctx.closePath();
  ctx.fillStyle = isGolden ? '#FBBF24' : '#F8FAFC';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#0F172A';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.quadraticCurveTo(10, -18, 11, -8);
  ctx.lineTo(-11, -8);
  ctx.quadraticCurveTo(-10, -18, 0, -30);
  ctx.closePath();
  ctx.fillStyle = isGolden ? '#B45309' : '#EF4444';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 2, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = '#38BDF8';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0F172A';
  ctx.stroke();

  ctx.restore();
  ctx.globalAlpha = 1;
}
