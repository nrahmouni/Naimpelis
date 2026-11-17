import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Music,
  PaintBucket,
  Palette,
  Puzzle,
  RefreshCw,
  Rocket,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { AppLanguage, KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { getKidsDir, getKidsUiCopy, type KidsUiCopy } from './kidsI18n';
import {
  KidsAnimatedCategoryIcon,
  type KidsAnimatedIconId,
} from './KidsSvgArt';

interface KidsFunGamesProps {
  shellLang?: AppLanguage;
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  unlockedRewards?: string[];
  resetSeq?: number;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
  onBackToPortal?: () => void;
}

type FunGameId = 'catcher' | 'bubbles' | 'puzzle' | 'simon' | 'draw' | 'piano';

// Shared lightweight WebAudio tone helper for instant musical feedback
let funAudioCtx: AudioContext | null = null;
function playKidTone(
  freq: number,
  durSec = 0.18,
  type: OscillatorType = 'sine',
  vol = 0.14,
  soundEnabled = true
) {
  if (!soundEnabled || typeof window === 'undefined') return;
  try {
    if (!funAudioCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) funAudioCtx = new AC();
    }
    if (!funAudioCtx) return;
    if (funAudioCtx.state === 'suspended') {
      void funAudioCtx.resume();
    }
    const now = funAudioCtx.currentTime;
    const osc = funAudioCtx.createOscillator();
    const gain = funAudioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + durSec);
    osc.connect(gain);
    gain.connect(funAudioCtx.destination);
    osc.start(now);
    osc.stop(now + durSec + 0.02);
  } catch {
    // ignore WebAudio restrictions
  }
}

/* ============================================================================
 * 1. ATRAPA ESTRELLAS (HTML5 CANVAS ARCADE - ZERO SCROLL)
 * ============================================================================ */
interface FallingSprite {
  x: number;
  y: number;
  vy: number;
  kind: 'star' | 'gem' | 'fruit' | 'meteor';
  emoji: string;
  radius: number;
}

const StarCatcherCanvas: React.FC<{
  ageGroup: KidsAgeGroup;
  t: KidsUiCopy;
  soundEnabled: boolean;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}> = ({ ageGroup, t, soundEnabled, onEarnStar, onMissionPlay }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);

  const playerXRef = useRef(0.5);
  const moveDirRef = useRef<-1 | 0 | 1>(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const itemsRef = useRef<FallingSprite[]>([]);
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; color: string; life: number }>>([]);
  const runningRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const speedFactor = ageGroup === '3-5' ? 0.72 : ageGroup === '6-8' ? 1 : 1.28;

  const startRound = () => {
    triggerHaptic('medium');
    onMissionPlay?.();
    scoreRef.current = 0;
    livesRef.current = 3;
    itemsRef.current = [];
    particlesRef.current = [];
    playerXRef.current = 0.5;
    setScore(0);
    setLives(3);
    setGameOver(false);
    runningRef.current = true;
    setRunning(true);
    playKidTone(523.25, 0.14, 'triangle', 0.14, soundEnabledRef.current);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let spawnAcc = 0;

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
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0C1024');
      grad.addColorStop(1, '#181434');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let i = 0; i < 18; i++) {
        const sx = ((i * 197) % 100) * 0.01 * w;
        const sy = ((i * 113 + 23) % 85) * 0.01 * h;
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (runningRef.current) {
        if (moveDirRef.current !== 0) {
          playerXRef.current = Math.max(0.08, Math.min(0.92, playerXRef.current + moveDirRef.current * dt * 0.95));
        }

        spawnAcc += dt;
        const spawnEvery = Math.max(0.4, 0.85 / speedFactor);
        if (spawnAcc >= spawnEvery) {
          spawnAcc = 0;
          const roll = Math.random();
          const meteorChance = ageGroup === '3-5' ? 0.12 : 0.22;
          const kind: FallingSprite['kind'] =
            roll < meteorChance
              ? 'meteor'
              : roll < 0.55
              ? 'star'
              : roll < 0.8
              ? 'fruit'
              : 'gem';
          const emoji =
            kind === 'meteor' ? '☄️' : kind === 'star' ? '⭐' : kind === 'fruit' ? '🍓' : '💎';
          itemsRef.current.push({
            x: 0.08 + Math.random() * 0.84,
            y: -0.05,
            vy: (0.28 + Math.random() * 0.16) * speedFactor,
            kind,
            emoji,
            radius: Math.max(20, w * 0.036),
          });
        }

        const basketX = playerXRef.current * w;
        const basketY = h - Math.max(46, h * 0.12);
        const catchRadius = Math.max(40, w * 0.075);

        const nextItems: FallingSprite[] = [];
        for (const item of itemsRef.current) {
          item.y += item.vy * dt;
          const ix = item.x * w;
          const iy = item.y * h;

          const dist = Math.hypot(ix - basketX, iy - basketY);
          if (dist < catchRadius) {
            if (item.kind === 'meteor') {
              livesRef.current -= 1;
              setLives(livesRef.current);
              playKidTone(170, 0.25, 'sawtooth', 0.16, soundEnabledRef.current);
              triggerHaptic('warning');
              if (livesRef.current <= 0) {
                runningRef.current = false;
                setRunning(false);
                setGameOver(true);
                setBestScore((prev) => Math.max(prev, scoreRef.current));
                if (scoreRef.current >= 5) {
                  onEarnStar(Math.min(5, Math.ceil(scoreRef.current / 5)), 'arcade_estrella');
                }
              }
            } else {
              const pts = item.kind === 'gem' ? 3 : 1;
              scoreRef.current += pts;
              setScore(scoreRef.current);
              playKidTone(item.kind === 'gem' ? 880 : 659.25, 0.12, 'triangle', 0.14, soundEnabledRef.current);
              triggerHaptic('light');
              if (scoreRef.current % 10 === 0) {
                onEarnStar(2, 'arcade_estrella');
              }
              for (let p = 0; p < 7; p++) {
                particlesRef.current.push({
                  x: ix,
                  y: iy,
                  vx: (Math.random() - 0.5) * 260,
                  vy: (Math.random() - 0.5) * 240,
                  color: item.kind === 'gem' ? '#38BDF8' : '#FBBF24',
                  life: 0.45,
                });
              }
            }
            continue;
          }
          if (item.y < 1.08) nextItems.push(item);
        }
        itemsRef.current = nextItems;
      }

      for (const item of itemsRef.current) {
        ctx.font = `${Math.round(Math.max(28, w * 0.055))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.emoji, item.x * w, item.y * h);
      }

      const px = playerXRef.current * w;
      const py = h - Math.max(42, h * 0.11);
      ctx.save();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.roundRect(px - 44, py - 14, 88, 28, 14);
      ctx.fill();
      ctx.strokeStyle = '#FDE68A';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚀', px, py - 24);
      ctx.restore();

      const nextParticles = [];
      for (const pt of particlesRef.current) {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life > 0) {
          ctx.fillStyle = pt.color;
          ctx.globalAlpha = Math.max(0, pt.life * 2);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          nextParticles.push(pt);
        }
      }
      particlesRef.current = nextParticles;

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [ageGroup, onEarnStar, speedFactor]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!runningRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    playerXRef.current = Math.max(0.08, Math.min(0.92, relX));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#111526] border border-white/10 text-xs font-bold">
        <div className="flex items-center gap-3">
          <span className="text-amber-300 tabular-nums">⭐ {score}</span>
          <span className="text-rose-400">{'❤️'.repeat(Math.max(0, lives))}</span>
          {bestScore > 0 && <span className="text-zinc-400 tabular-nums">🏆 {bestScore}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onPointerDown={() => { moveDirRef.current = -1; }}
            onPointerUp={() => { moveDirRef.current = 0; }}
            onPointerLeave={() => { moveDirRef.current = 0; }}
            aria-label="Izquierda"
            className="w-9 h-8 rounded-lg bg-white/10 active:bg-amber-400 active:text-black text-white flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={() => { moveDirRef.current = 1; }}
            onPointerUp={() => { moveDirRef.current = 0; }}
            onPointerLeave={() => { moveDirRef.current = 0; }}
            aria-label="Derecha"
            className="w-9 h-8 rounded-lg bg-white/10 active:bg-amber-400 active:text-black text-white flex items-center justify-center cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border border-amber-400/25 bg-[#0C1024]">
        <canvas
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerMove}
          className="w-full h-full block touch-none cursor-pointer"
        />
        {!running && (
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="text-4xl">{gameOver ? '🏆' : '🚀'}</div>
            <h3 className="font-display font-extrabold text-xl text-white">
              {gameOver ? `${t.funStars} · ⭐ ${score}` : t.funStars}
            </h3>
            <p className="text-xs text-zinc-300 max-w-xs">{t.funStarsDesc}</p>
            <button
              type="button"
              onClick={startRound}
              className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-black font-display font-black text-sm shadow-lg cursor-pointer active:scale-95 transition-transform"
            >
              {gameOver ? t.funPlayAgain : t.funPlayNow}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. EXPLOTA BURBUJAS ARCOÍRIS (BUBBLE POP FRENZY - ZERO SCROLL)
 * ============================================================================ */
interface BubbleItem {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  freq: number;
  emoji: string;
}

const BUBBLE_COLORS = ['#F43F5E', '#F59E0B', '#10B981', '#38BDF8', '#A855F7', '#EC4899'];
const BUBBLE_NOTES = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];

const BubblePopGame: React.FC<{
  t: KidsUiCopy;
  soundEnabled: boolean;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}> = ({ t, soundEnabled, onEarnStar, onMissionPlay }) => {
  const [bubbles, setBubbles] = useState<BubbleItem[]>([]);
  const [poppedCount, setPoppedCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [playing, setPlaying] = useState(false);

  const makeBubble = useCallback((idSeed: number): BubbleItem => ({
    id: idSeed,
    x: 10 + Math.random() * 76,
    y: 12 + Math.random() * 72,
    size: 58 + Math.floor(Math.random() * 24),
    color: BUBBLE_COLORS[idSeed % BUBBLE_COLORS.length],
    freq: BUBBLE_NOTES[idSeed % BUBBLE_NOTES.length],
    emoji: ['🫧', '⭐', '🦋', '🎈', '🍓', '🐳'][idSeed % 6],
  }), []);

  const startBubbles = () => {
    triggerHaptic('medium');
    onMissionPlay?.();
    setPoppedCount(0);
    setTimeLeft(30);
    setPlaying(true);
    setBubbles(Array.from({ length: 8 }, (_, idx) => makeBubble(Date.now() + idx)));
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setPlaying(false);
          onEarnStar(3, 'burbujas_pro');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, onEarnStar]);

  const popBubble = (b: BubbleItem) => {
    triggerHaptic('light');
    playKidTone(b.freq, 0.16, 'sine', 0.18, soundEnabled);
    setPoppedCount((c) => c + 1);
    setBubbles((prev) => [
      ...prev.filter((item) => item.id !== b.id),
      makeBubble(Date.now() + Math.floor(Math.random() * 10000)),
    ]);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#111526] border border-white/10 text-xs font-bold">
        <span className="text-sky-300 tabular-nums">🫧 {poppedCount}</span>
        <span className="text-amber-300 tabular-nums">⏱ {timeLeft}s</span>
      </div>

      <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-gradient-to-b from-[#0E172E] to-[#1A1230] border border-sky-400/25">
        {playing ? (
          bubbles.map((b) => (
            <button
              key={b.id}
              type="button"
              onPointerDown={() => popBubble(b)}
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: `${b.size}px`,
                height: `${b.size}px`,
                background: `radial-gradient(circle at 30% 30%, #FFFFFFAA, ${b.color})`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60 shadow-[0_8px_22px_rgba(0,0,0,0.4)] flex items-center justify-center text-2xl cursor-pointer active:scale-125 transition-transform"
            >
              {b.emoji}
            </button>
          ))
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="text-4xl">🫧</div>
            <h3 className="font-display font-extrabold text-xl text-white">
              {poppedCount > 0 ? `${t.funBubbles} · 🫧 ${poppedCount}` : t.funBubbles}
            </h3>
            <button
              type="button"
              onClick={startBubbles}
              className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-500 text-black font-display font-black text-sm shadow-lg cursor-pointer active:scale-95"
            >
              {poppedCount > 0 ? t.funPlayAgain : t.gameStartBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. PUZLES TÁCTILES (2x2 PARA 3-5, 3x3 PARA 6-12 — SVG EN ALTA DEFINICIÓN)
 * ============================================================================ */
type PuzzleSceneId = 'space' | 'ocean' | 'dino' | 'jungle';

const PUZZLE_SCENES: Array<{ id: PuzzleSceneId; emoji: string; label: string }> = [
  { id: 'space', emoji: '🚀', label: 'Espacio' },
  { id: 'ocean', emoji: '🐳', label: 'Océano' },
  { id: 'dino', emoji: '🦕', label: 'Dinos' },
  { id: 'jungle', emoji: '🦁', label: 'Selva' },
];

const PuzzleSceneArt: React.FC<{ sceneId: PuzzleSceneId }> = ({ sceneId }) => {
  if (sceneId === 'space') {
    return (
      <>
        <rect width="300" height="300" fill="#13193B" />
        <circle cx="52" cy="56" r="26" fill="#FBBF24" />
        <circle cx="242" cy="70" r="34" fill="#A855F7" />
        <ellipse cx="242" cy="70" rx="52" ry="11" fill="none" stroke="#38BDF8" strokeWidth="7" transform="rotate(-18 242 70)" />
        <path d="M150 55 C178 100 184 162 172 208 L128 208 C116 162 122 100 150 55 Z" fill="#F8FAFC" stroke="#0F172A" strokeWidth="5" />
        <path d="M150 55 C164 78 172 98 174 115 L126 115 C128 98 136 78 150 55 Z" fill="#F43F5E" />
        <circle cx="150" cy="148" r="18" fill="#38BDF8" stroke="#0F172A" strokeWidth="4" />
        <polygon points="128,175 102,216 128,205" fill="#F43F5E" stroke="#0F172A" strokeWidth="4" />
        <polygon points="172,175 198,216 172,205" fill="#F43F5E" stroke="#0F172A" strokeWidth="4" />
        <polygon points="138,210 150,262 162,210" fill="#F59E0B" />
        <circle cx="48" cy="238" r="5" fill="#FFFFFF" />
        <circle cx="258" cy="240" r="6" fill="#FDE047" />
      </>
    );
  }
  if (sceneId === 'ocean') {
    return (
      <>
        <rect width="300" height="300" fill="#0369A1" />
        <rect y="0" width="300" height="86" fill="#7DD3FC" />
        <circle cx="244" cy="44" r="24" fill="#FDE047" />
        <path d="M0 86 Q75 68 150 86 T300 86 L300 300 L0 300 Z" fill="#0284C7" />
        <ellipse cx="145" cy="182" rx="76" ry="50" fill="#38BDF8" stroke="#0F172A" strokeWidth="5" />
        <path d="M214 182 L262 152 L254 182 L262 212 Z" fill="#0EA5E9" stroke="#0F172A" strokeWidth="4" />
        <circle cx="106" cy="172" r="9" fill="#0F172A" />
        <circle cx="103" cy="169" r="3" fill="#FFFFFF" />
        <path d="M132 132 Q122 104 102 104 M134 132 Q144 104 164 104" fill="none" stroke="#E0F2FE" strokeWidth="7" strokeLinecap="round" />
        <circle cx="54" cy="246" r="18" fill="#F43F5E" />
        <circle cx="222" cy="256" r="16" fill="#FBBF24" />
      </>
    );
  }
  if (sceneId === 'dino') {
    return (
      <>
        <rect width="300" height="300" fill="#BAE6FD" />
        <circle cx="62" cy="58" r="26" fill="#FACC15" />
        <rect y="218" width="300" height="82" fill="#22C55E" />
        <polygon points="212,218 248,124 282,218" fill="#78350F" />
        <path d="M74 220 C70 165 110 150 156 156 C188 160 202 184 226 218 L74 220 Z" fill="#10B981" stroke="#0F172A" strokeWidth="5" />
        <path d="M126 164 C118 112 104 78 86 72 C70 68 58 84 68 98 C78 110 92 106 102 165" fill="#10B981" stroke="#0F172A" strokeWidth="5" />
        <circle cx="80" cy="84" r="5" fill="#0F172A" />
        <rect x="92" y="210" width="22" height="34" rx="8" fill="#059669" stroke="#0F172A" strokeWidth="4" />
        <rect x="148" y="210" width="22" height="34" rx="8" fill="#059669" stroke="#0F172A" strokeWidth="4" />
      </>
    );
  }
  return (
    <>
      <rect width="300" height="300" fill="#FEF3C7" />
      <rect y="205" width="300" height="95" fill="#16A34A" />
      <circle cx="150" cy="148" r="76" fill="#EA580C" stroke="#0F172A" strokeWidth="5" />
      <circle cx="150" cy="148" r="54" fill="#FACC15" stroke="#0F172A" strokeWidth="4" />
      <circle cx="110" cy="100" r="16" fill="#FACC15" stroke="#0F172A" strokeWidth="4" />
      <circle cx="190" cy="100" r="16" fill="#FACC15" stroke="#0F172A" strokeWidth="4" />
      <circle cx="132" cy="140" r="8" fill="#0F172A" />
      <circle cx="168" cy="140" r="8" fill="#0F172A" />
      <polygon points="150,152 140,164 160,164" fill="#9A3412" />
      <path d="M136 174 Q150 186 164 174" fill="none" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />
    </>
  );
};

function createShuffledTiles(total: number): number[] {
  const arr = Array.from({ length: total }, (_, idx) => idx);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  if (arr.every((v, idx) => v === idx)) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}

const KidsPuzzleGame: React.FC<{
  ageGroup: KidsAgeGroup;
  t: KidsUiCopy;
  soundEnabled: boolean;
  lowStimulation: boolean;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}> = ({ ageGroup, t, soundEnabled, lowStimulation, onEarnStar, onMissionPlay }) => {
  const gridDim = ageGroup === '3-5' ? 2 : 3;
  const totalTiles = gridDim * gridDim;

  const [sceneId, setSceneId] = useState<PuzzleSceneId>('space');
  const [tiles, setTiles] = useState<number[]>(() => createShuffledTiles(totalTiles));
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);

  const sceneLabels: Record<PuzzleSceneId, string> = {
    space: t.steamSpace,
    ocean: t.steamOcean,
    dino: t.catDinos,
    jungle: t.steamForest,
  };

  const resetPuzzle = useCallback((dim = gridDim) => {
    triggerHaptic('light');
    setTiles(createShuffledTiles(dim * dim));
    setSelectedSlot(null);
    setMoves(0);
    setSolved(false);
  }, [gridDim]);

  useEffect(() => {
    resetPuzzle(gridDim);
  }, [gridDim, sceneId, resetPuzzle]);

  const handleTileTap = (slotIdx: number) => {
    if (solved) return;
    triggerHaptic('light');
    if (selectedSlot === null) {
      setSelectedSlot(slotIdx);
      playKidTone(440, 0.08, 'triangle', 0.12, soundEnabled);
      return;
    }
    if (selectedSlot === slotIdx) {
      setSelectedSlot(null);
      return;
    }
    const next = [...tiles];
    [next[selectedSlot], next[slotIdx]] = [next[slotIdx], next[selectedSlot]];
    setTiles(next);
    setSelectedSlot(null);
    setMoves((m) => m + 1);
    playKidTone(587.33, 0.1, 'triangle', 0.14, soundEnabled);

    if (next.every((val, idx) => val === idx)) {
      setSolved(true);
      triggerHaptic('success');
      playKidTone(784, 0.25, 'triangle', 0.18, soundEnabled);
      window.setTimeout(() => playKidTone(1046.5, 0.35, 'triangle', 0.18, soundEnabled), 140);
      onMissionPlay?.();
      onEarnStar(3, 'puzzle_maestro');
    }
  };

  const pieceSize = 300 / gridDim;
  const correctCount = tiles.filter((val, idx) => val === idx).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden relative">
      <KidsConfettiCanvas active={solved} lowStimulation={lowStimulation} />
      <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#161E3B] border border-white/10">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {PUZZLE_SCENES.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setSceneId(sc.id)}
              className={`h-8 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border whitespace-nowrap ${
                sceneId === sc.id
                  ? 'bg-amber-400 text-black border-amber-200'
                  : 'bg-white/10 text-zinc-200 border-white/10'
              }`}
            >
              <span>{sc.emoji}</span>
              <span>{sceneLabels[sc.id]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0 text-xs font-bold">
          <span className="text-emerald-300 tabular-nums">
            {correctCount}/{totalTiles}
          </span>
          <span className="text-zinc-300 tabular-nums hidden sm:inline">{moves}</span>
          <button
            type="button"
            onClick={() => resetPuzzle(gridDim)}
            className="h-8 px-2.5 rounded-lg bg-white/10 text-white text-[11px] flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{t.funShuffle}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-2xl bg-[#0E1428] border border-white/10 p-3 flex flex-col sm:flex-row items-center justify-center gap-4 overflow-hidden">
        <div
          className={`w-full max-w-[280px] sm:max-w-[330px] aspect-square grid gap-1.5 p-2 rounded-2xl bg-[#161F40] border-2 border-amber-400/35 ${
            gridDim === 2 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-3 grid-rows-3'
          }`}
        >
          {tiles.map((pieceIdx, slotIdx) => {
            const pRow = Math.floor(pieceIdx / gridDim);
            const pCol = pieceIdx % gridDim;
            const isCorrect = pieceIdx === slotIdx;
            const isPicked = selectedSlot === slotIdx;
            return (
              <button
                key={slotIdx}
                type="button"
                onClick={() => handleTileTap(slotIdx)}
                className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition-transform active:scale-95 ${
                  isPicked
                    ? 'border-amber-300 scale-95 ring-2 ring-amber-400'
                    : isCorrect
                    ? 'border-emerald-400/75'
                    : 'border-white/20 hover:border-white/50'
                }`}
              >
                <svg
                  viewBox={`${pCol * pieceSize} ${pRow * pieceSize} ${pieceSize} ${pieceSize}`}
                  className="w-full h-full block"
                >
                  <PuzzleSceneArt sceneId={sceneId} />
                </svg>
              </button>
            );
          })}
        </div>

        <div className="shrink-0 flex sm:flex-col items-center gap-3 text-center">
          <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg">
            <svg viewBox="0 0 300 300" className="w-full h-full block">
              <PuzzleSceneArt sceneId={sceneId} />
            </svg>
          </div>
          <div className="space-y-1.5">
            {solved ? (
              <>
                <p className="font-display font-black text-base text-emerald-300">
                  {t.funPuzzleSolved}
                </p>
                <button
                  type="button"
                  onClick={() => resetPuzzle(gridDim)}
                  className="h-10 px-4 rounded-xl bg-amber-400 text-black font-display font-extrabold text-xs cursor-pointer"
                >
                  {t.funOtherPuzzle}
                </button>
              </>
            ) : (
              <p className="text-xs text-sky-200 max-w-[160px]">{t.funPuzzleHint}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. SIMÓN DICE MUSICAL (MEMORIA AUDITIVA CON COLORES GIGANTES)
 * ============================================================================ */
const SIMON_PADS = [
  { id: 0, label: 'Do', freq: 329.63, bg: '#EF4444', ring: '#FCA5A5', emoji: '🍓' },
  { id: 1, label: 'Re', freq: 440.0, bg: '#F59E0B', ring: '#FDE047', emoji: '⭐' },
  { id: 2, label: 'Mi', freq: 523.25, bg: '#10B981', ring: '#6EE7B7', emoji: '🐸' },
  { id: 3, label: 'Sol', freq: 659.25, bg: '#3B82F6', ring: '#93C5FD', emoji: '🐳' },
];

const SimonSaysKidsGame: React.FC<{
  t: KidsUiCopy;
  soundEnabled: boolean;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}> = ({ t, soundEnabled, onEarnStar, onMissionPlay }) => {
  const [sequence, setSequence] = useState<number[]>([]);
  const [userPos, setUserPos] = useState(0);
  const [litPad, setLitPad] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'watching' | 'playing' | 'lost'>('idle');
  const [bestRound, setBestRound] = useState(0);
  const timersRef = useRef<number[]>([]);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const playSequence = useCallback((seq: number[]) => {
    clearTimers();
    setPhase('watching');
    seq.forEach((padId, idx) => {
      const startAt = idx * 620 + 260;
      const t1 = window.setTimeout(() => {
        setLitPad(padId);
        playKidTone(SIMON_PADS[padId].freq, 0.32, 'triangle', 0.2, soundEnabledRef.current);
      }, startAt);
      const t2 = window.setTimeout(() => {
        setLitPad((curr) => (curr === padId ? null : curr));
      }, startAt + 360);
      timersRef.current.push(t1, t2);
    });
    const tDone = window.setTimeout(() => {
      setPhase('playing');
      setUserPos(0);
    }, seq.length * 620 + 360);
    timersRef.current.push(tDone);
  }, []);

  const startSimon = () => {
    triggerHaptic('medium');
    onMissionPlay?.();
    const first = [Math.floor(Math.random() * 4)];
    setSequence(first);
    setUserPos(0);
    playSequence(first);
  };

  const handlePadPress = (padId: number) => {
    if (phase !== 'playing') return;
    triggerHaptic('light');
    setLitPad(padId);
    playKidTone(SIMON_PADS[padId].freq, 0.24, 'triangle', 0.2, soundEnabledRef.current);
    const clearT = window.setTimeout(() => setLitPad((c) => (c === padId ? null : c)), 220);
    timersRef.current.push(clearT);

    if (sequence[userPos] === padId) {
      const nextPos = userPos + 1;
      if (nextPos === sequence.length) {
        const roundCleared = sequence.length;
        setBestRound((b) => Math.max(b, roundCleared));
        if (roundCleared % 2 === 0) {
          onEarnStar(3, 'simon_musical');
        }
        const extended = [...sequence, Math.floor(Math.random() * 4)];
        setSequence(extended);
        const nextTimer = window.setTimeout(() => playSequence(extended), 650);
        timersRef.current.push(nextTimer);
      } else {
        setUserPos(nextPos);
      }
    } else {
      triggerHaptic('warning');
      playKidTone(185, 0.35, 'sawtooth', 0.16, soundEnabledRef.current);
      setPhase('lost');
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#111526] border border-white/10 text-xs font-bold">
        <span className="text-amber-300 tabular-nums">
          🔔 {sequence.length} · 🏆 {bestRound}
        </span>
        <span className="text-sky-200">
          {phase === 'watching'
            ? t.funSimonWatch
            : phase === 'playing'
            ? t.funSimonTurn
            : phase === 'lost'
            ? t.funSimonAlmost
            : t.funSimonTitle}
        </span>
      </div>

      <div className="relative flex-1 min-h-0 rounded-2xl bg-[#0E1428] border border-white/10 p-3 flex items-center justify-center">
        <div className="w-full max-w-md h-full max-h-[320px] grid grid-cols-2 grid-rows-2 gap-3">
          {SIMON_PADS.map((pad) => {
            const lit = litPad === pad.id;
            return (
              <button
                key={pad.id}
                type="button"
                disabled={phase !== 'playing'}
                onPointerDown={() => handlePadPress(pad.id)}
                style={{
                  backgroundColor: pad.bg,
                  boxShadow: lit ? `0 0 28px ${pad.ring}` : undefined,
                }}
                className={`rounded-3xl border-4 border-b-8 flex flex-col items-center justify-center gap-1 text-white font-display font-black transition-all select-none ${
                  lit
                    ? 'scale-95 brightness-125 border-white'
                    : 'border-black/30 opacity-90 hover:brightness-110'
                } ${phase === 'playing' ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="text-3xl sm:text-4xl">{pad.emoji}</span>
                <span className="text-sm sm:text-base">{pad.label}</span>
              </button>
            );
          })}
        </div>

        {(phase === 'idle' || phase === 'lost') && (
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="text-4xl">🔔</div>
            <h3 className="font-display font-extrabold text-xl text-white">
              {phase === 'lost' ? `${t.funSimonTitle} · 🔔 ${Math.max(1, sequence.length)}` : t.funSimonTitle}
            </h3>
            <button
              type="button"
              onClick={startSimon}
              className="min-h-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-400 to-sky-400 text-black font-display font-black text-sm shadow-lg cursor-pointer active:scale-95"
            >
              {phase === 'lost' ? t.funPlayAgain : t.gameStartBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 5. PIZARRA MÁGICA + LIBRO DE COLOREAR (TAP-TO-FILL) + SELLOS
 * ============================================================================ */
const DRAW_COLORS = ['#F43F5E', '#F59E0B', '#FDE047', '#22C55E', '#38BDF8', '#A855F7', '#FFFFFF'];
const BASE_STAMPS = ['🦕', '🚀', '🦋', '⭐', '❤️', '👑'];
const BONUS_STAMPS = ['🦄', '🛸', '🐉', '🌈'];

type ColoringTemplateId = 'dino' | 'rocket' | 'castle' | 'butterfly';

const COLORING_TEMPLATES: Array<{ id: ColoringTemplateId; label: string }> = [
  { id: 'dino', label: '🦕 Dino' },
  { id: 'rocket', label: '🚀 Cohete' },
  { id: 'castle', label: '🏰 Castillo' },
  { id: 'butterfly', label: '🦋 Mariposa' },
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function floodFillCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillHex: string
): boolean {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return false;

  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  const idx0 = (sy * width + sx) * 4;
  const sr = data[idx0];
  const sg = data[idx0 + 1];
  const sb = data[idx0 + 2];

  // Do not flood-fill dark outlines
  if (sr < 65 && sg < 65 && sb < 65) return false;

  const [fr, fg, fb] = hexToRgb(fillHex);
  if (Math.abs(sr - fr) < 12 && Math.abs(sg - fg) < 12 && Math.abs(sb - fb) < 12) {
    return false;
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];
  const tolerance = 52;

  const matchesStart = (pIdx: number) => {
    const i = pIdx * 4;
    return (
      Math.abs(data[i] - sr) <= tolerance &&
      Math.abs(data[i + 1] - sg) <= tolerance &&
      Math.abs(data[i + 2] - sb) <= tolerance
    );
  };

  let filledPixels = 0;
  while (stack.length > 0 && filledPixels < width * height) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const p = y * width + x;
    if (x < 0 || y < 0 || x >= width || y >= height || visited[p] || !matchesStart(p)) {
      continue;
    }
    visited[p] = 1;
    const i = p * 4;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = 255;
    filledPixels += 1;

    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  ctx.putImageData(img, 0, 0);
  return filledPixels > 0;
}

function drawColoringTemplate(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tpl: ColoringTemplateId
) {
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFDF7';
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.34;

  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#FFFDF7';
  ctx.lineWidth = Math.max(4, Math.round(scale * 0.045));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (tpl === 'dino') {
    ctx.beginPath();
    ctx.ellipse(cx - scale * 0.05, cy + scale * 0.25, scale * 0.65, scale * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx + scale * 0.55, cy - scale * 0.48, scale * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(cx + scale * 0.25, cy - scale * 0.35, scale * 0.26, scale * 0.55, 12);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(cx - scale * 0.36, cy + scale * 0.55, scale * 0.2, scale * 0.34, 8);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(cx + scale * 0.14, cy + scale * 0.55, scale * 0.2, scale * 0.34, 8);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx - scale * 0.72, cy - scale * 0.58, scale * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  } else if (tpl === 'rocket') {
    ctx.beginPath();
    ctx.ellipse(cx, cy - scale * 0.05, scale * 0.34, scale * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy - scale * 0.16, scale * 0.17, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - scale * 0.28, cy + scale * 0.28);
    ctx.lineTo(cx - scale * 0.62, cy + scale * 0.65);
    ctx.lineTo(cx - scale * 0.22, cy + scale * 0.54);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + scale * 0.28, cy + scale * 0.28);
    ctx.lineTo(cx + scale * 0.62, cy + scale * 0.65);
    ctx.lineTo(cx + scale * 0.22, cy + scale * 0.54);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx - scale * 0.85, cy - scale * 0.45, scale * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (tpl === 'castle') {
    ctx.beginPath();
    ctx.rect(cx - scale * 0.55, cy - scale * 0.15, scale * 1.1, scale * 0.85);
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(cx - scale * 0.78, cy - scale * 0.35, scale * 0.26, scale * 1.05);
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(cx + scale * 0.52, cy - scale * 0.35, scale * 0.26, scale * 1.05);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - scale * 0.84, cy - scale * 0.35);
    ctx.lineTo(cx - scale * 0.65, cy - scale * 0.76);
    ctx.lineTo(cx - scale * 0.46, cy - scale * 0.35);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + scale * 0.46, cy - scale * 0.35);
    ctx.lineTo(cx + scale * 0.65, cy - scale * 0.76);
    ctx.lineTo(cx + scale * 0.84, cy - scale * 0.35);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy + scale * 0.7, scale * 0.24, Math.PI, 0);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx - scale * 0.48, cy - scale * 0.22, scale * 0.44, scale * 0.34, -0.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx + scale * 0.48, cy - scale * 0.22, scale * 0.44, scale * 0.34, 0.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx - scale * 0.38, cy + scale * 0.32, scale * 0.34, scale * 0.28, 0.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx + scale * 0.38, cy + scale * 0.32, scale * 0.34, scale * 0.28, -0.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy + scale * 0.05, scale * 0.12, scale * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

const MagicDoodlePad: React.FC<{
  t: KidsUiCopy;
  soundEnabled: boolean;
  unlockedRewards: string[];
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}> = ({ t, soundEnabled, unlockedRewards, onEarnStar, onMissionPlay }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState<string>('#38BDF8');
  const [rainbowMode, setRainbowMode] = useState<boolean>(true);
  const [neonMode, setNeonMode] = useState<boolean>(false);
  const [eraserMode, setEraserMode] = useState<boolean>(false);
  const [fillMode, setFillMode] = useState<boolean>(false);
  const [templateId, setTemplateId] = useState<ColoringTemplateId>('dino');
  const [activeStamp, setActiveStamp] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState<number>(10);
  const drawingRef = useRef(false);
  const hueRef = useRef(0);
  const strokesRef = useRef(0);

  const hasNeon = unlockedRewards.includes('draw_neon');
  const hasBonusStamps = unlockedRewards.includes('draw_space_stamps');
  const availableStamps = hasBonusStamps ? [...BASE_STAMPS, ...BONUS_STAMPS] : BASE_STAMPS;

  const paintFreshBackground = useCallback((isFill: boolean, tpl: ColoringTemplateId) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (isFill) {
      drawColoringTemplate(ctx, canvas.width, canvas.height, tpl);
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0E1428';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    canvas.width = Math.max(300, Math.floor(rect.width));
    canvas.height = Math.max(200, Math.floor(rect.height));
    paintFreshBackground(false, 'dino');
  }, [paintFreshBackground]);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = getCoords(e);

    if (fillMode) {
      triggerHaptic('light');
      const fillCol = rainbowMode ? DRAW_COLORS[strokesRef.current % (DRAW_COLORS.length - 1)] : color;
      const didFill = floodFillCanvas(ctx, canvas.width, canvas.height, x, y, fillCol);
      if (didFill) {
        playKidTone(587.33, 0.12, 'sine', 0.14, soundEnabled);
        strokesRef.current += 1;
        if (strokesRef.current === 4) {
          onMissionPlay?.();
          onEarnStar(2, 'artista_kids');
        }
      }
      return;
    }

    if (activeStamp) {
      triggerHaptic('light');
      playKidTone(784, 0.12, 'triangle', 0.12, soundEnabled);
      ctx.shadowBlur = 0;
      ctx.font = '38px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(activeStamp, x, y);
      strokesRef.current += 1;
      if (strokesRef.current === 5) {
        onMissionPlay?.();
        onEarnStar(2, 'artista_kids');
      }
      return;
    }

    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || activeStamp || fillMode) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = getCoords(e);

    if (eraserMode) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#0E1428';
      ctx.lineWidth = brushSize * 2.2;
    } else if (neonMode && hasNeon) {
      hueRef.current = (hueRef.current + 6) % 360;
      const neonCol = `hsl(${hueRef.current}, 100%, 66%)`;
      ctx.shadowColor = neonCol;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(4, brushSize * 0.85);
    } else if (rainbowMode) {
      ctx.shadowBlur = 0;
      hueRef.current = (hueRef.current + 5) % 360;
      ctx.strokeStyle = `hsl(${hueRef.current}, 95%, 62%)`;
      ctx.lineWidth = brushSize;
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
    }
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerUp = () => {
    if (drawingRef.current) {
      drawingRef.current = false;
      strokesRef.current += 1;
      if (strokesRef.current === 4) {
        onMissionPlay?.();
        onEarnStar(2, 'artista_kids');
      }
    }
  };

  const toggleColoringMode = () => {
    triggerHaptic('light');
    const nextFill = !fillMode;
    setFillMode(nextFill);
    setActiveStamp(null);
    setEraserMode(false);
    if (nextFill && rainbowMode) {
      setRainbowMode(false);
      setColor('#F43F5E');
    }
    paintFreshBackground(nextFill, templateId);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#161E3B] border border-white/10 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleColoringMode}
            className={`h-8 px-2.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer border ${
              fillMode
                ? 'bg-emerald-400 text-black border-emerald-200'
                : 'bg-white/10 text-white border-white/15'
            }`}
          >
            <PaintBucket className="w-3.5 h-3.5" />
            <span>{t.funDrawFill}</span>
          </button>

          {fillMode &&
            COLORING_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setTemplateId(tpl.id);
                  paintFreshBackground(true, tpl.id);
                }}
                className={`h-8 px-2 rounded-lg text-[11px] font-bold cursor-pointer border ${
                  templateId === tpl.id
                    ? 'bg-amber-400 text-black border-amber-200'
                    : 'bg-white/10 text-zinc-200 border-white/15'
                }`}
              >
                {tpl.label.split(' ')[0]}
              </button>
            ))}

          {!fillMode && (
            <button
              type="button"
              onClick={() => {
                setRainbowMode(true);
                setNeonMode(false);
                setEraserMode(false);
                setActiveStamp(null);
              }}
              className={`h-8 px-2 rounded-lg text-[11px] font-bold cursor-pointer border ${
                rainbowMode && !neonMode && !eraserMode && !activeStamp
                  ? 'bg-gradient-to-r from-rose-400 via-amber-300 to-sky-400 text-black border-white'
                  : 'bg-white/10 text-white border-white/15'
              }`}
            >
              🌈 {t.funDrawBrush}
            </button>
          )}

          {!fillMode && hasNeon && (
            <button
              type="button"
              onClick={() => {
                setNeonMode(true);
                setRainbowMode(false);
                setEraserMode(false);
                setActiveStamp(null);
              }}
              className={`h-7 px-2 rounded-lg text-[11px] font-bold cursor-pointer border ${
                neonMode && !eraserMode && !activeStamp
                  ? 'bg-cyan-400 text-black border-white shadow-[0_0_12px_rgba(34,211,238,0.65)]'
                  : 'bg-cyan-500/15 text-cyan-200 border-cyan-400/35'
              }`}
            >
              ✨ Neón
            </button>
          )}

          {DRAW_COLORS.filter((c) => !fillMode || c !== '#FFFFFF').map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setRainbowMode(false);
                setNeonMode(false);
                setEraserMode(false);
                setActiveStamp(null);
              }}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
              className={`w-6 h-6 rounded-full cursor-pointer border-2 transition-transform ${
                !rainbowMode && !neonMode && !eraserMode && !activeStamp && color === c
                  ? 'border-white scale-110 ring-2 ring-amber-300'
                  : 'border-white/25'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!fillMode &&
            availableStamps.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setActiveStamp((prev) => (prev === st ? null : st));
                  setEraserMode(false);
                }}
                className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center cursor-pointer border ${
                  activeStamp === st
                    ? 'bg-amber-400/30 border-amber-300'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                {st}
              </button>
            ))}
          {!fillMode && (
            <>
              <button
                type="button"
                onClick={() => setBrushSize((s) => (s === 6 ? 12 : s === 12 ? 20 : 6))}
                className="h-8 px-2 rounded-lg bg-white/10 text-[11px] font-bold text-white cursor-pointer"
              >
                {brushSize === 6 ? 'S' : brushSize === 12 ? 'M' : 'L'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEraserMode((v) => !v);
                  setActiveStamp(null);
                }}
                aria-label={t.funDrawClear}
                className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer border ${
                  eraserMode ? 'bg-rose-500 text-white border-rose-300' : 'bg-white/10 text-zinc-200 border-white/10'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              paintFreshBackground(fillMode, templateId);
            }}
            aria-label={t.funDrawClear}
            title={t.funDrawClear}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/30 text-zinc-200 flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border-2 border-violet-400/30 bg-[#0E1428]">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`w-full h-full block touch-none ${fillMode ? 'cursor-pointer' : 'cursor-crosshair'}`}
        />
      </div>
    </div>
  );
};

/* ============================================================================
 * 6. PIANO ARCOÍRIS MUSICAL (GUIDED MELODIES + SOUND PACKS)
 * ============================================================================ */
const PIANO_KEYS = [
  { note: 'Do', freq: 261.63, color: '#EF4444' },
  { note: 'Re', freq: 293.66, color: '#F97316' },
  { note: 'Mi', freq: 329.63, color: '#FACC15' },
  { note: 'Fa', freq: 349.23, color: '#22C55E' },
  { note: 'Sol', freq: 392.0, color: '#06B6D4' },
  { note: 'La', freq: 440.0, color: '#3B82F6' },
  { note: 'Si', freq: 493.88, color: '#8B5CF6' },
  { note: "Do'", freq: 523.25, color: '#EC4899' },
];

const GUIDED_SONGS: Array<{ id: string; title: string; seq: number[] }> = [
  { id: 'free', title: 'Libre', seq: [] },
  { id: 'twinkle', title: '⭐ Estrellita', seq: [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0] },
  { id: 'happy', title: '🎂 Cumpleaños', seq: [0, 0, 1, 0, 3, 2, 0, 0, 1, 0, 4, 3] },
];

type PianoInstrument = 'piano' | 'marimba' | 'cat' | 'space';

const RainbowPianoGame: React.FC<{
  t: KidsUiCopy;
  soundEnabled: boolean;
  unlockedRewards: string[];
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}> = ({ t, soundEnabled, unlockedRewards, onEarnStar, onMissionPlay }) => {
  const [activeKey, setActiveKey] = useState<number | null>(null);
  const [songIdx, setSongIdx] = useState(1);
  const [step, setStep] = useState(0);
  const [instrument, setInstrument] = useState<PianoInstrument>('piano');

  const song = GUIDED_SONGS[songIdx];
  const expectedIdx = song.seq.length > 0 ? song.seq[step % song.seq.length] : null;

  const instruments: Array<{ id: PianoInstrument; label: string; unlocked: boolean }> = [
    { id: 'piano', label: `🎹 ${t.funPiano}`, unlocked: true },
    { id: 'marimba', label: '🪵 Xil', unlocked: true },
    { id: 'cat', label: '🐱 Miau', unlocked: unlockedRewards.includes('piano_cat') },
    { id: 'space', label: '🛸 Sinte', unlocked: unlockedRewards.includes('piano_space') },
  ];

  const pressKey = (idx: number) => {
    const key = PIANO_KEYS[idx];
    triggerHaptic('light');
    if (instrument === 'cat') {
      playKidTone(key.freq * 1.45, 0.25, 'sine', 0.18, soundEnabled);
      window.setTimeout(() => playKidTone(key.freq * 1.25, 0.18, 'triangle', 0.12, soundEnabled), 70);
    } else if (instrument === 'space') {
      playKidTone(key.freq, 0.42, 'sawtooth', 0.12, soundEnabled);
    } else if (instrument === 'marimba') {
      playKidTone(key.freq * 2, 0.2, 'sine', 0.2, soundEnabled);
    } else {
      playKidTone(key.freq, 0.35, 'triangle', 0.22, soundEnabled);
    }
    setActiveKey(idx);
    window.setTimeout(() => setActiveKey((curr) => (curr === idx ? null : curr)), 160);

    if (expectedIdx !== null && idx === expectedIdx) {
      const nextStep = step + 1;
      setStep(nextStep);
      if (nextStep % song.seq.length === 0) {
        onMissionPlay?.();
        onEarnStar(3, 'musico_kids');
      }
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#161E3B] border border-white/10">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {GUIDED_SONGS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSongIdx(idx);
                setStep(0);
              }}
              className={`h-8 px-2.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap border ${
                songIdx === idx
                  ? 'bg-amber-400 text-black border-amber-200'
                  : 'bg-white/10 text-zinc-200 border-white/10'
              }`}
            >
              {s.id === 'free' ? '🎵' : s.title}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {instruments
            .filter((ins) => ins.unlocked)
            .map((ins) => (
              <button
                key={ins.id}
                type="button"
                onClick={() => setInstrument(ins.id)}
                className={`h-8 px-2 rounded-lg text-[11px] font-bold cursor-pointer border ${
                  instrument === ins.id
                    ? 'bg-pink-500 text-white border-pink-300'
                    : 'bg-white/10 text-zinc-200 border-white/10'
                }`}
              >
                {ins.label}
              </button>
            ))}
          {song.seq.length > 0 && (
            <span className="text-xs font-bold text-amber-300 shrink-0 ms-1">
              {t.funPianoPlayHint} {PIANO_KEYS[expectedIdx!]?.note}
            </span>
          )}
        </div>
      </div>

      <div
        dir="ltr"
        className="flex-1 min-h-0 grid grid-cols-4 sm:grid-cols-8 gap-2 p-2 rounded-2xl bg-[#0E1428] border border-white/10"
      >
        {PIANO_KEYS.map((k, idx) => {
          const isNext = expectedIdx === idx;
          const isLit = activeKey === idx;
          return (
            <button
              key={k.note}
              type="button"
              onPointerDown={() => pressKey(idx)}
              style={{ backgroundColor: k.color }}
              className={`rounded-2xl flex flex-col items-center justify-end pb-4 font-display font-black text-white shadow-lg cursor-pointer transition-all select-none border-4 border-b-8 ${
                isLit
                  ? 'scale-95 brightness-125 border-white'
                  : isNext
                  ? 'border-white shadow-[0_0_24px_rgba(255,255,255,0.75)]'
                  : 'border-black/25 hover:brightness-110'
              }`}
            >
              {isNext && <span className="text-xl mb-auto mt-3">👇</span>}
              <span className="text-base sm:text-lg drop-shadow">{k.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ============================================================================
 * EXPORTED ZERO-SCROLL FUN ARCADE WRAPPER (VISUAL CARD HUB -> FULLSCREEN GAME)
 * ============================================================================ */
export const KidsFunGames: React.FC<KidsFunGamesProps & { resetSeq?: number }> = ({
  kidsLang,
  ageGroup,
  unlockedRewards = [],
  resetSeq = 0,
  onEarnStar,
  onMissionPlay,
  onBackToPortal,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);
  const [activeFun, setActiveFun] = useState<FunGameId | null>(null);

  useEffect(() => {
    if (resetSeq > 0) {
      setActiveFun(null);
    }
  }, [resetSeq]);

  const cards: Array<{
    id: FunGameId;
    iconName: KidsAnimatedIconId;
    label: string;
    tone: string;
  }> = [
    {
      id: 'catcher',
      iconName: 'space',
      label: t.funStars,
      tone: 'from-amber-400/25 to-orange-500/20 border-amber-400/55',
    },
    {
      id: 'bubbles',
      iconName: 'fun',
      label: t.funBubbles,
      tone: 'from-pink-500/25 to-rose-500/20 border-pink-400/55',
    },
    {
      id: 'puzzle',
      iconName: 'puzzle',
      label: t.funPuzzle,
      tone: 'from-sky-400/25 to-indigo-500/20 border-sky-400/55',
    },
    {
      id: 'simon',
      iconName: 'simon',
      label: t.funSimon,
      tone: 'from-emerald-400/25 to-teal-500/20 border-emerald-400/55',
    },
    {
      id: 'draw',
      iconName: 'draw',
      label: t.funDraw,
      tone: 'from-violet-400/25 to-fuchsia-500/20 border-violet-400/55',
    },
    {
      id: 'piano',
      iconName: 'piano',
      label: t.funPiano,
      tone: 'from-cyan-400/25 to-blue-500/20 border-cyan-400/55',
    },
  ];

  const activeMeta = cards.find((c) => c.id === activeFun) || null;

  if (!activeFun) {
    return (
      <div dir={dir} className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {onBackToPortal && (
              <button
                type="button"
                onClick={onBackToPortal}
                data-tv-focusable="true"
                className="min-h-[46px] px-3.5 sm:px-4 rounded-2xl bg-[#1A244D] hover:bg-[#25336B] border-b-4 border-[#0D132B] text-white text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                <span>{t.backToHome}</span>
              </button>
            )}
            <h2 className="font-display font-black text-lg sm:text-2xl text-white">
              {t.chooseGamePrompt}
            </h2>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-3 grid-rows-3 sm:grid-rows-2 gap-3">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setActiveFun(card.id);
              }}
              className={`rounded-3xl bg-gradient-to-br ${card.tone} border-2 border-b-4 p-4 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-transform hover:scale-[1.02] active:scale-95 shadow-lg`}
            >
              <KidsAnimatedCategoryIcon name={card.iconName} size={56} />
              <span className="font-display font-black text-base sm:text-xl text-white leading-tight">
                {card.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveFun(null);
          }}
          className="min-h-[46px] px-4 rounded-2xl bg-[#1A244D] hover:bg-[#25336B] border-b-4 border-[#0D132B] text-white text-sm font-black flex items-center gap-2 cursor-pointer active:scale-95"
        >
          <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
          <span>{t.wizBack}</span>
        </button>

        {activeMeta && (
          <div className="flex items-center gap-2">
            <KidsAnimatedCategoryIcon name={activeMeta.iconName} size={24} />
            <h2 className="font-display font-black text-base sm:text-lg text-white">
              {activeMeta.label}
            </h2>
          </div>
        )}
      </div>

      {activeFun === 'catcher' && (
        <StarCatcherCanvas
          ageGroup={ageGroup}
          t={t}
          soundEnabled={ux.soundEnabled}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
      {activeFun === 'bubbles' && (
        <BubblePopGame
          t={t}
          soundEnabled={ux.soundEnabled}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
      {activeFun === 'puzzle' && (
        <KidsPuzzleGame
          ageGroup={ageGroup}
          t={t}
          soundEnabled={ux.soundEnabled}
          lowStimulation={ux.lowStimulation}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
      {activeFun === 'simon' && (
        <SimonSaysKidsGame
          t={t}
          soundEnabled={ux.soundEnabled}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
      {activeFun === 'draw' && (
        <MagicDoodlePad
          t={t}
          soundEnabled={ux.soundEnabled}
          unlockedRewards={unlockedRewards}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
      {activeFun === 'piano' && (
        <RainbowPianoGame
          t={t}
          soundEnabled={ux.soundEnabled}
          unlockedRewards={unlockedRewards}
          onEarnStar={onEarnStar}
          onMissionPlay={onMissionPlay}
        />
      )}
    </div>
  );
};
