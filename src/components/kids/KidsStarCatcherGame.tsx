import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Magnet,
  Play,
  Rocket,
  RotateCcw,
  Shield,
  Star,
  Trophy,
  Volume2,
} from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { KIDS_LANGUAGES } from './kidsData';
import { EXTENDED_VOCAB_ITEMS, type ExtendedVocabItem } from './kidsCurriculumData';
import {
  playKidsComboNote,
  playKidsPowerupSound,
  playKidsShieldHit,
  playKidsSound,
} from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';

interface FallingObject {
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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface SpaceMissionChallenge {
  vocabId: string;
  promptDisplay: string;
  spokenPrompt: string;
  targetLabel: string;
  decoys: string[];
}

interface KidsStarCatcherGameProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  unlockedRewards: string[];
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}

const BEST_SCORE_KEY = 'riffan_kids_stars_best_v1';

function cleanWord(raw: string): string {
  const idx = raw.indexOf('(');
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim() || raw.trim();
}

function readBestScore(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // ignore
  }
}

function buildWaveChallenge(
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

function drawStarShape(
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

function drawWordCapsule(
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

function drawMeteorShape(ctx: CanvasRenderingContext2D, r: number) {
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

function drawRocketSprite(
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

export const KidsStarCatcherGame: React.FC<KidsStarCatcherGameProps> = ({
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
  const hasGoldenRocket = unlockedRewards.includes('rocket_golden_skin');

  const [practiceLang, setPracticeLang] = useState<KidsLanguageCode>(() =>
    kidsLang === 'es' ? 'en' : 'es'
  );
  const [challenge, setChallenge] = useState<SpaceMissionChallenge>(() =>
    buildWaveChallenge(kidsLang, kidsLang === 'es' ? 'en' : 'es')
  );
  const challengeRef = useRef(challenge);
  challengeRef.current = challenge;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rocketXRef = useRef(0.5);
  const targetRocketXRef = useRef<number | null>(null);
  const rocketVelRef = useRef(0);
  const keysHeldRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });

  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const comboRef = useRef(0);
  const wordsCaughtRef = useRef(0);
  const magnetSecRef = useRef(0);
  const shieldActiveRef = useRef(false);
  const invulnSecRef = useRef(0);
  const shakeSecRef = useRef(0);

  const playingRef = useRef(false);
  const objectsRef = useRef<FallingObject[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const nextIdRef = useRef(1);

  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [score, setScore] = useState(0);
  const [wordsCaught, setWordsCaught] = useState(0);
  const [bestScore, setBestScore] = useState<number>(() => readBestScore());
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(50);
  const [magnetActive, setMagnetActive] = useState(false);
  const [shieldActive, setShieldActive] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);

  const practiceLangMeta =
    KIDS_LANGUAGES.find((l) => l.code === practiceLang) || KIDS_LANGUAGES[2];

  const advanceWave = useCallback(() => {
    const next = buildWaveChallenge(kidsLang, practiceLang);
    setChallenge(next);
    if (ux.soundEnabled) {
      void speakKidsText(next.spokenPrompt, practiceLang, {
        ageGroup,
        rate: ux.tortoiseSpeech ? 0.68 : undefined,
      });
    }
  }, [ageGroup, kidsLang, practiceLang, ux.soundEnabled, ux.tortoiseSpeech]);

  const finishRun = () => {
    if (!playingRef.current) return;
    playingRef.current = false;
    setGameState('gameover');
    const finalScore = scoreRef.current;
    if (finalScore > bestScore) {
      setBestScore(finalScore);
      saveBestScore(finalScore);
    }
    const starsEarned = Math.max(1, Math.min(8, Math.floor(finalScore / 50) + wordsCaughtRef.current));
    onEarnStar(starsEarned, 'arcade_estrella');
    playKidsSound('levelUp', ux.soundEnabled, true);
    setConfettiActive(true);
  };

  const startGame = () => {
    triggerHaptic('medium');
    playKidsSound('tap', ux.soundEnabled, true);
    scoreRef.current = 0;
    livesRef.current = 3;
    comboRef.current = 0;
    wordsCaughtRef.current = 0;
    magnetSecRef.current = 0;
    shieldActiveRef.current = false;
    invulnSecRef.current = 0;
    shakeSecRef.current = 0;
    rocketXRef.current = 0.5;
    targetRocketXRef.current = null;
    rocketVelRef.current = 0;
    objectsRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];

    const firstChal = buildWaveChallenge(kidsLang, practiceLang);
    setChallenge(firstChal);
    setScore(0);
    setWordsCaught(0);
    setLives(3);
    setCombo(0);
    setTimeLeft(50);
    setMagnetActive(false);
    setShieldActive(false);
    setConfettiActive(false);
    playingRef.current = true;
    setGameState('playing');
    onMissionPlay?.();
    if (ux.soundEnabled) {
      void speakKidsText(firstChal.spokenPrompt, practiceLang, {
        ageGroup,
        rate: ux.tortoiseSpeech ? 0.68 : undefined,
      });
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!playingRef.current) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        targetRocketXRef.current = null;
        keysHeldRef.current.left = true;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        targetRocketXRef.current = null;
        keysHeldRef.current.right = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysHeldRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysHeldRef.current.right = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          finishRun();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();
    let spawnCooldown = 0.25;
    let exhaustCooldown = 0;
    let thrusterPhase = 0;
    let spawnCycle = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(280, Math.floor(rect.width * dpr));
      canvas.height = Math.max(170, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnBurst = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 45 + Math.random() * 145;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          life: 0.45 + Math.random() * 0.25,
          maxLife: 0.7,
          radius: 2 + Math.random() * 3.5,
          color,
        });
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      thrusterPhase += dt * 18;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;

      const prevX = rocketXRef.current;
      if (playingRef.current) {
        if (keysHeldRef.current.left) rocketXRef.current -= dt * 0.88;
        if (keysHeldRef.current.right) rocketXRef.current += dt * 0.88;
        if (targetRocketXRef.current !== null) {
          const diff = targetRocketXRef.current - rocketXRef.current;
          rocketXRef.current += diff * Math.min(1, dt * 16);
        }
        rocketXRef.current = Math.max(0.08, Math.min(0.92, rocketXRef.current));
      }
      const dx = rocketXRef.current - prevX;
      const targetTilt = Math.max(-0.36, Math.min(0.36, (dx / Math.max(0.008, dt)) * 0.28));
      rocketVelRef.current += (targetTilt - rocketVelRef.current) * Math.min(1, dt * 14);

      if (invulnSecRef.current > 0) invulnSecRef.current = Math.max(0, invulnSecRef.current - dt);
      if (shakeSecRef.current > 0) shakeSecRef.current = Math.max(0, shakeSecRef.current - dt);
      if (magnetSecRef.current > 0) {
        magnetSecRef.current = Math.max(0, magnetSecRef.current - dt);
        if (magnetSecRef.current === 0) setMagnetActive(false);
      }

      const rx = rocketXRef.current * cssW;
      const ry = cssH - 42;
      exhaustCooldown -= dt;
      if (exhaustCooldown <= 0) {
        exhaustCooldown = playingRef.current ? 0.035 : 0.07;
        particlesRef.current.push({
          x: rx + (Math.random() - 0.5) * 7,
          y: ry + 26,
          vx: (Math.random() - 0.5) * 24,
          vy: 55 + Math.random() * 55,
          life: 0.35,
          maxLife: 0.35,
          radius: 2.5 + Math.random() * 2.5,
          color: hasGoldenRocket ? '#FDE047' : '#FB923C',
        });
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      if (shakeSecRef.current > 0) {
        const mag = (shakeSecRef.current / 0.28) * 6;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }

      const bg = ctx.createLinearGradient(0, 0, 0, cssH);
      bg.addColorStop(0, '#05081A');
      bg.addColorStop(0.6, '#0E173B');
      bg.addColorStop(1, '#1A1B4B');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cssW, cssH);

      for (let i = 0; i < 32; i++) {
        const layer = (i % 3) + 1;
        const speedMul = layer * 0.015;
        const sx = ((i * 89 + 17) % 100) * 0.01 * cssW;
        const sy = (((i * 47 + now * speedMul) % 100) * 0.01) * cssH;
        ctx.fillStyle =
          layer === 3 ? 'rgba(255,255,255,0.65)' : 'rgba(186,230,253,0.35)';
        ctx.beginPath();
        ctx.arc(sx, sy, layer * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }

      if (playingRef.current) {
        spawnCooldown -= dt;
        if (spawnCooldown <= 0) {
          spawnCooldown = ageGroup === '3-5' ? 0.78 : ageGroup === '6-8' ? 0.62 : 0.5;
          spawnCycle += 1;
          const activeChal = challengeRef.current;

          let kind: FallingObject['kind'] = 'star';
          let label: string | undefined;

          if (spawnCycle % 4 === 1) {
            kind = 'word_target';
            label = activeChal.targetLabel;
          } else if (spawnCycle % 4 === 3 && activeChal.decoys.length > 0) {
            kind = 'word_decoy';
            label = activeChal.decoys[spawnCycle % activeChal.decoys.length];
          } else {
            const r = Math.random();
            kind =
              r < 0.52 ? 'star' : r < 0.68 ? 'meteor' : r < 0.84 ? 'magnet' : 'shield';
          }

          objectsRef.current.push({
            id: nextIdRef.current++,
            xFrac: 0.12 + Math.random() * 0.76,
            yFrac: -0.07,
            vxFrac:
              kind === 'word_target' || kind === 'word_decoy'
                ? 0
                : (Math.random() - 0.5) * 0.08,
            speed:
              (ageGroup === '3-5' ? 0.21 : ageGroup === '6-8' ? 0.27 : 0.34) +
              (kind === 'meteor' ? 0.08 : 0),
            radius: kind === 'meteor' ? 18 : 22,
            kind,
            label,
            angle: 0,
            rotSpeed: kind === 'meteor' || kind === 'star' ? (Math.random() - 0.5) * 2.5 : 0,
          });
        }

        const survivors: FallingObject[] = [];
        for (const obj of objectsRef.current) {
          if (magnetSecRef.current > 0 && (obj.kind === 'star' || obj.kind === 'word_target')) {
            const dxFrac = rocketXRef.current - obj.xFrac;
            if (0.88 - obj.yFrac > -0.15) {
              obj.xFrac += dxFrac * Math.min(1, dt * 4);
            }
          }

          obj.xFrac = Math.max(0.08, Math.min(0.92, obj.xFrac + obj.vxFrac * dt));
          obj.yFrac += obj.speed * dt;
          obj.angle += obj.rotSpeed * dt;

          const ox = obj.xFrac * cssW;
          const oy = obj.yFrac * cssH;
          const dist = Math.hypot(ox - rx, oy - ry);

          if (dist < obj.radius + 26) {
            if (obj.kind === 'word_target') {
              const nextCombo = Math.min(20, comboRef.current + 1);
              comboRef.current = nextCombo;
              wordsCaughtRef.current += 1;
              setWordsCaught(wordsCaughtRef.current);
              setCombo(nextCombo);
              const pts = 35 * Math.min(4, 1 + Math.floor(nextCombo / 2));
              scoreRef.current += pts;
              setScore(scoreRef.current);
              recordDomainResult('lang', true, challengeRef.current.vocabId);
              triggerHaptic('success');
              playKidsComboNote(nextCombo - 1, ux.soundEnabled);
              spawnBurst(ox, oy, '#34D399', 18);
              floatingTextsRef.current.push({
                x: ox,
                y: oy - 12,
                text: `${obj.label} +${pts}`,
                color: '#6EE7B7',
                life: 1.0,
              });
              // Remove other floating word capsules from previous wave and advance mission
              objectsRef.current = objectsRef.current.filter(
                (other) => other.id !== obj.id && other.kind !== 'word_decoy' && other.kind !== 'word_target'
              );
              advanceWave();
              continue;
            } else if (obj.kind === 'word_decoy') {
              comboRef.current = 0;
              setCombo(0);
              recordDomainResult('lang', false, challengeRef.current.vocabId);
              triggerHaptic('warning');
              playKidsSound('error', ux.soundEnabled, true);
              spawnBurst(ox, oy, '#F59E0B', 10);
              floatingTextsRef.current.push({
                x: ox,
                y: oy - 10,
                text: 'Ups',
                color: '#FBBF24',
                life: 0.75,
              });
              continue;
            } else if (obj.kind === 'meteor') {
              if (shieldActiveRef.current) {
                shieldActiveRef.current = false;
                setShieldActive(false);
                invulnSecRef.current = 1.2;
                shakeSecRef.current = 0.2;
                playKidsShieldHit(ux.soundEnabled);
                spawnBurst(ox, oy, '#38BDF8', 16);
              } else if (invulnSecRef.current <= 0) {
                invulnSecRef.current = 1.35;
                shakeSecRef.current = 0.28;
                comboRef.current = 0;
                setCombo(0);
                livesRef.current = Math.max(0, livesRef.current - 1);
                setLives(livesRef.current);
                triggerHaptic('warning');
                playKidsSound('error', ux.soundEnabled, true);
                spawnBurst(ox, oy, '#EF4444', 18);
                if (livesRef.current <= 0) {
                  finishRun();
                }
              }
            } else if (obj.kind === 'magnet') {
              magnetSecRef.current = 5.5;
              setMagnetActive(true);
              playKidsPowerupSound(ux.soundEnabled);
              spawnBurst(ox, oy, '#34D399', 14);
            } else if (obj.kind === 'shield') {
              shieldActiveRef.current = true;
              setShieldActive(true);
              playKidsPowerupSound(ux.soundEnabled);
              spawnBurst(ox, oy, '#38BDF8', 14);
            } else {
              const pts = 10;
              scoreRef.current += pts;
              setScore(scoreRef.current);
              playKidsSound('star', ux.soundEnabled, false);
              spawnBurst(ox, oy, '#FACC15', 10);
              floatingTextsRef.current.push({
                x: ox,
                y: oy - 10,
                text: '+10',
                color: '#FDE047',
                life: 0.7,
              });
            }
            continue;
          }

          if (obj.yFrac < 1.1) survivors.push(obj);
        }
        objectsRef.current = survivors;
      }

      for (const obj of objectsRef.current) {
        const ox = obj.xFrac * cssW;
        const oy = obj.yFrac * cssH;
        ctx.save();
        ctx.translate(ox, oy);
        if (obj.kind === 'word_target' || obj.kind === 'word_decoy') {
          drawWordCapsule(ctx, obj.label || '', obj.kind === 'word_target');
        } else {
          ctx.rotate(obj.angle);
          if (obj.kind === 'star') {
            drawStarShape(ctx, 0, 0, 14, '#FACC15', '#B45309');
          } else if (obj.kind === 'magnet') {
            ctx.beginPath();
            ctx.arc(0, 0, 13, 0, Math.PI * 2);
            ctx.fillStyle = '#10B981';
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '900 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('M', 0, 1);
          } else if (obj.kind === 'shield') {
            ctx.beginPath();
            ctx.arc(0, 0, 13, 0, Math.PI * 2);
            ctx.fillStyle = '#0EA5E9';
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '900 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', 0, 1);
          } else {
            drawMeteorShape(ctx, obj.radius);
          }
        }
        ctx.restore();
      }

      const aliveParticles: Particle[] = [];
      for (const p of particlesRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life > 0) {
          aliveParticles.push(p);
          ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      particlesRef.current = aliveParticles;

      drawRocketSprite(
        ctx,
        rx,
        ry,
        rocketVelRef.current,
        hasGoldenRocket,
        shieldActiveRef.current,
        magnetSecRef.current > 0,
        invulnSecRef.current,
        thrusterPhase
      );

      const aliveTexts: FloatingText[] = [];
      for (const ft of floatingTextsRef.current) {
        ft.y -= 36 * dt;
        ft.life -= dt;
        if (ft.life > 0) {
          aliveTexts.push(ft);
          ctx.globalAlpha = Math.min(1, ft.life * 1.6);
          ctx.font = '900 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = ft.color;
          ctx.fillText(ft.text, ft.x, ft.y);
        }
      }
      ctx.globalAlpha = 1;
      floatingTextsRef.current = aliveTexts;

      ctx.restore();
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroup, hasGoldenRocket, ux.soundEnabled, advanceWave]);

  const handlePointerCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    targetRocketXRef.current = Math.max(0.08, Math.min(0.92, (e.clientX - rect.left) / rect.width));
  };

  const nudgeRocket = (delta: number) => {
    targetRocketXRef.current = null;
    rocketXRef.current = Math.max(0.08, Math.min(0.92, rocketXRef.current + delta));
  };

  return (
    <div dir={dir} className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden relative">
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* TOP HUD + LIVE VOCABULARY RADIO MISSION */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-2xl bg-[#101836] border border-white/15 text-xs font-black">
        <div className="flex items-center gap-2 min-w-0">
          <FlagBadgeSvg code={practiceLangMeta.flagCode} className="w-4 h-3 shrink-0" />
          <select
            aria-label={t.chooseLanguageTitle}
            value={practiceLang}
            onChange={(e) => {
              const nl = e.target.value as KidsLanguageCode;
              setPracticeLang(nl);
              setChallenge(buildWaveChallenge(kidsLang, nl));
            }}
            className="h-8 px-2 rounded-lg bg-[#1A244D] border border-white/15 text-xs font-black text-white outline-none cursor-pointer"
          >
            {KIDS_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              void speakKidsText(challenge.spokenPrompt, practiceLang, {
                ageGroup,
                rate: ux.tortoiseSpeech ? 0.68 : undefined,
              })
            }
            className="h-8 px-2.5 rounded-lg bg-amber-400 text-slate-950 font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[140px]">Atrapa: {challenge.promptDisplay}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-amber-300 tabular-nums">
            <Star className="w-3.5 h-3.5 fill-amber-300" />
            {score}
          </span>
          {combo > 1 && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-300 tabular-nums">
              x{combo}
            </span>
          )}
          <div className="flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
              <Heart
                key={i}
                className={`w-3.5 h-3.5 ${
                  i < lives ? 'fill-rose-500 text-rose-500' : 'text-white/20'
                }`}
              />
            ))}
          </div>
          {shieldActive && <Shield className="w-3.5 h-3.5 text-sky-300" />}
          {magnetActive && <Magnet className="w-3.5 h-3.5 text-emerald-300" />}
          <span className="px-2 py-0.5 rounded-lg bg-white/10 text-white tabular-nums">
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* CANVAS STAGE */}
      <div className="relative flex-1 min-h-0 rounded-2xl border-2 border-amber-300/35 overflow-hidden bg-[#05081A]">
        <canvas
          ref={canvasRef}
          onPointerMove={handlePointerCanvas}
          onPointerDown={handlePointerCanvas}
          className="w-full h-full block touch-none cursor-crosshair"
        />

        {gameState !== 'playing' && (
          <div className="absolute inset-0 bg-[#070C24]/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-300/45 flex items-center justify-center shadow-lg">
              {gameState === 'gameover' ? (
                <Trophy className="w-9 h-9 text-amber-300" />
              ) : (
                <Rocket className="w-9 h-9 text-amber-300" />
              )}
            </div>

            <div>
              <h3 className="font-display font-black text-2xl sm:text-3xl text-white">
                {gameState === 'gameover'
                  ? `${t.mathScore}: ${score} (${wordsCaught} palabras)`
                  : 'Misión Lingüística Espacial'}
              </h3>
              {gameState === 'gameover' && (
                <p className="text-xs font-extrabold text-amber-300 mt-1 tabular-nums">
                  Record: {bestScore}
                </p>
              )}
              <p className="text-xs sm:text-sm font-semibold text-sky-200/85 max-w-md mt-1">
                Escucha la radio y pilota el cohete para atrapar la cápsula en {practiceLangMeta.nativeLabel} mientras esquivas meteoros.
              </p>
            </div>

            <KidsSquishButton
              onClick={startGame}
              className="px-7 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 font-black text-base flex items-center gap-2 shadow-xl"
            >
              {gameState === 'gameover' ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{gameState === 'gameover' ? t.funPlayAgain : t.funPlayNow}</span>
            </KidsSquishButton>
          </div>
        )}
      </div>

      {/* TOUCH / D-PAD ARCADE BUMPERS */}
      <div className="shrink-0 grid grid-cols-2 gap-2">
        <KidsSquishButton
          onClick={() => nudgeRocket(-0.14)}
          ariaLabel="Mover izquierda"
          className="landscape:h-11 rounded-2xl bg-[#1A2552] hover:bg-[#253470] border-2 border-b-4 border-sky-400/40 text-white font-black flex items-center justify-center"
        >
          <ChevronLeft className="w-6 h-6" />
        </KidsSquishButton>
        <KidsSquishButton
          onClick={() => nudgeRocket(0.14)}
          ariaLabel="Mover derecha"
          className="landscape:h-11 rounded-2xl bg-[#1A2552] hover:bg-[#253470] border-2 border-b-4 border-sky-400/40 text-white font-black flex items-center justify-center"
        >
          <ChevronRight className="w-6 h-6" />
        </KidsSquishButton>
      </div>
    </div>
  );
};
