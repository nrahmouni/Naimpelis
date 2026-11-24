import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Monitor,
  RotateCcw,
  RotateCw,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AppLanguage } from '../../../types';
import { pickLang } from '../../../utils/i18n';
import { triggerHaptic } from '../../../utils/haptics';
import { loadArcadeBest, playArcadeSfx, saveArcadeBest } from './arcadeAudio';
import {
  drawArcadeSprite,
  drawArcadeSpriteRect,
  drawArcadeTiledBg,
  preloadArcadeSprites,
} from './arcadeSprites';
import { PixiGameFxLayer, type PixiGameFxHandle } from './PixiGameFxLayer';
import {
  CrtOverlayLayer,
  drawDynamicPointLight,
  drawProceduralNebulaBackdrop,
} from './canvas2dFxHelpers';

export type PuzzleArcadeId = 'tetris' | 'hextris' | 'game2048';

interface ArcadePuzzleStageProps {
  gameId: PuzzleArcadeId;
  lang: AppLanguage;
  mutedOverride?: boolean;
}

const TET_SHAPES: number[][][] = [
  [],
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  [[2, 0, 0], [2, 2, 2], [0, 0, 0]],
  [[0, 0, 3], [3, 3, 3], [0, 0, 0]],
  [[4, 4], [4, 4]],
  [[0, 5, 5], [5, 5, 0], [0, 0, 0]],
  [[0, 6, 0], [6, 6, 6], [0, 0, 0]],
  [[7, 7, 0], [0, 7, 7], [0, 0, 0]],
];
const TET_COLS = ['#0f172a', '#22D3EE', '#3B82F6', '#F97316', '#FACC15', '#22C55E', '#A855F7', '#F43F5E'];
const TET_SPRITES = [
  '',
  'assets/games/puzzle/element_blue_square_glossy.png',
  'assets/games/puzzle/element_grey_square_glossy.png',
  'assets/games/puzzle/element_grey_square_glossy.png',
  'assets/games/puzzle/element_yellow_square_glossy.png',
  'assets/games/puzzle/element_green_square_glossy.png',
  'assets/games/puzzle/element_purple_square.png',
  'assets/games/puzzle/element_red_square_glossy.png',
];
const HEX_PALETTE = ['#F43F5E', '#38BDF8', '#22C55E', '#FACC15', '#A855F7'];
const TILE_STYLE: Record<number, [string, string]> = {
  0: ['#182034', '#475569'],
  2: ['#EEE4DA', '#1E293B'],
  4: ['#EDE0C8', '#1E293B'],
  8: ['#F2B179', '#FFFFFF'],
  16: ['#F59563', '#FFFFFF'],
  32: ['#F67C5F', '#FFFFFF'],
  64: ['#F65E3B', '#FFFFFF'],
  128: ['#EDCF72', '#FFFFFF'],
  256: ['#EDCC61', '#FFFFFF'],
  512: ['#EDC850', '#FFFFFF'],
  1024: ['#8B5CF6', '#FFFFFF'],
  2048: ['#22C55E', '#FFFFFF'],
};

export const ArcadePuzzleStage: React.FC<ArcadePuzzleStageProps> = ({
  gameId,
  lang,
  mutedOverride = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixiFxRef = useRef<PixiGameFxHandle | null>(null);
  const [localMuted, setLocalMuted] = useState(mutedOverride);
  const mutedRef = useRef(localMuted || mutedOverride);
  mutedRef.current = localMuted || mutedOverride;

  const bestKey = `riffan_arcade_${gameId}_best_v1`;
  const [score, setScore] = useState(0);
  const [subLabel, setSubLabel] = useState('');
  const [bestScore, setBestScore] = useState(() => loadArcadeBest(bestKey));
  const [gameOver, setGameOver] = useState(false);
  const [gameOverMsg, setGameOverMsg] = useState('');
  const [crtEnabled, setCrtEnabled] = useState(true);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const actionsRef = useRef<{
    left: () => void;
    right: () => void;
    up: () => void;
    down: () => void;
    primary: () => void;
    reset: () => void;
    setFastDrop?: (on: boolean) => void;
  }>({
    left: () => {},
    right: () => {},
    up: () => {},
    down: () => {},
    primary: () => {},
    reset: () => {},
  });

  const commitScore = useCallback(
    (nextScore: number) => {
      setScore(nextScore);
      setBestScore((prev) => {
        if (nextScore > prev) {
          saveArcadeBest(bestKey, nextScore);
          return nextScore;
        }
        return prev;
      });
    },
    [bestKey]
  );

  useEffect(() => {
    setBestScore(loadArcadeBest(bestKey));
    setScore(0);
    setGameOver(false);
    setGameOverMsg('');

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let alive = true;

    preloadArcadeSprites([
      'assets/games/space/blue.png',
      'assets/games/space/darkPurple.png',
      'assets/games/puzzle/element_blue_square_glossy.png',
      'assets/games/puzzle/element_grey_square_glossy.png',
      'assets/games/puzzle/element_yellow_square_glossy.png',
      'assets/games/puzzle/element_green_square_glossy.png',
      'assets/games/puzzle/element_purple_square.png',
      'assets/games/puzzle/element_red_square_glossy.png',
      'assets/games/puzzle/particleStar.png',
      'assets/games/medals/medalBronze.png',
      'assets/games/medals/medalSilver.png',
      'assets/games/medals/medalGold.png',
    ]);

    // ---------------------------------------------------------------
    // ENGINE 1: TETRIS SPRINT
    // ---------------------------------------------------------------
    if (gameId === 'tetris') {
      const COLS = 10;
      const ROWS = 20;
      const CELL = 24;
      const BX = 360;
      const BY = 30;
      let board: number[][] = [];
      let bag: number[] = [];
      let piece: { m: number[][]; x: number; y: number; type: number } | null = null;
      let nextType = 1;
      let curScore = 0;
      let lines = 0;
      let level = 1;
      let dead = false;
      let dropAcc = 0;
      let clearFlash = 0;

      const refillBag = () => {
        const list = [1, 2, 3, 4, 5, 6, 7];
        for (let i = list.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        bag = bag.concat(list);
      };
      const popBag = () => {
        if (bag.length < 3) refillBag();
        return bag.shift() || 1;
      };
      const collides = (mat: number[][], px: number, py: number) => {
        for (let r = 0; r < mat.length; r += 1) {
          for (let c = 0; c < mat[r].length; c += 1) {
            if (!mat[r][c]) continue;
            const nx = px + c;
            const ny = py + r;
            if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
            if (ny >= 0 && board[ny][nx]) return true;
          }
        }
        return false;
      };
      const spawn = () => {
        const type = nextType;
        nextType = popBag();
        const m = TET_SHAPES[type].map((row) => [...row]);
        piece = { m, x: Math.floor((COLS - m[0].length) / 2), y: -1, type };
        if (collides(piece.m, piece.x, piece.y + 1)) {
          dead = true;
          setGameOver(true);
          setGameOverMsg(`${curScore} pts · ${lines} líneas · Nivel ${level}`);
          playArcadeSfx(140, 0.24, 'sawtooth', 0.09, mutedRef.current);
        }
      };
      const lock = () => {
        if (!piece) return;
        for (let r = 0; r < piece.m.length; r += 1) {
          for (let c = 0; c < piece.m[r].length; c += 1) {
            if (piece.m[r][c] && piece.y + r >= 0) {
              board[piece.y + r][piece.x + c] = piece.type;
            }
          }
        }
        let cleared = 0;
        for (let y = ROWS - 1; y >= 0; y -= 1) {
          if (board[y].every((v) => v > 0)) {
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(0));
            cleared += 1;
            y += 1;
          }
        }
        if (cleared > 0) {
          clearFlash = 1;
          curScore += ([0, 100, 300, 500, 800][cleared] || 800) * level;
          lines += cleared;
          level = 1 + Math.floor(lines / 10);
          pixiFxRef.current?.emitBurst(0.5, 0.55, 'lineClear', cleared >= 3 ? 28 : 16);
          playArcadeSfx(cleared >= 4 ? 880 : 620, 0.14, 'triangle', 0.08, mutedRef.current);
        } else {
          playArcadeSfx(210, 0.04, 'square', 0.04, mutedRef.current);
        }
        commitScore(curScore);
        setSubLabel(`Nivel ${level} · ${lines} líneas`);
        spawn();
      };
      const rotate = () => {
        if (!piece || dead) return;
        const n = piece.m.length;
        const rot = piece.m.map((_, r) => piece!.m.map((__, c) => piece!.m[n - 1 - c][r]));
        for (const kick of [0, -1, 1, -2, 2]) {
          if (!collides(rot, piece.x + kick, piece.y)) {
            piece.m = rot;
            piece.x += kick;
            playArcadeSfx(520, 0.04, 'triangle', 0.05, mutedRef.current);
            return;
          }
        }
      };
      const reset = () => {
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        bag = [];
        curScore = 0;
        lines = 0;
        level = 1;
        dropAcc = 0;
        dead = false;
        nextType = popBag();
        setGameOver(false);
        commitScore(0);
        setSubLabel('Nivel 1 · 0 líneas');
        spawn();
      };

      actionsRef.current = {
        left: () => { if (piece && !dead && !collides(piece.m, piece.x - 1, piece.y)) piece.x -= 1; },
        right: () => { if (piece && !dead && !collides(piece.m, piece.x + 1, piece.y)) piece.x += 1; },
        up: rotate,
        down: () => {
          if (!piece || dead) return;
          if (!collides(piece.m, piece.x, piece.y + 1)) {
            piece.y += 1;
            curScore += 1;
            commitScore(curScore);
          } else {
            lock();
          }
          dropAcc = 0;
        },
        primary: () => {
          if (!piece || dead) return;
          let d = 0;
          while (!collides(piece.m, piece.x, piece.y + 1)) {
            piece.y += 1;
            d += 1;
          }
          curScore += d * 2;
          lock();
        },
        reset,
      };

      reset();
      let last = performance.now();
      const drawCell = (x: number, y: number, type: number, alpha = 1, size = CELL - 2, isGhost = false) => {
        if (isGhost) {
          ctx.save();
          ctx.strokeStyle = TET_COLS[type];
          ctx.globalAlpha = 0.72;
          ctx.lineWidth = 1.8;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x + 2, y + 2, size - 2, size - 2);
          ctx.setLineDash([]);
          ctx.fillStyle = TET_COLS[type];
          ctx.globalAlpha = 0.14;
          ctx.fillRect(x + 2, y + 2, size - 2, size - 2);
          ctx.restore();
          return;
        }
        const spr = TET_SPRITES[type];
        if (type === 3) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = TET_COLS[3];
          ctx.fillRect(x + 1, y + 1, size, size);
          drawArcadeSpriteRect(ctx, spr, x + 1, y + 1, size, size, alpha * 0.45);
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillRect(x + 2, y + 2, size - 2, 4);
          ctx.globalAlpha = 1;
          return;
        }
        if (spr && drawArcadeSpriteRect(ctx, spr, x + 1, y + 1, size, size, alpha)) {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(x + 2, y + 2, size - 2, 3);
          ctx.restore();
          return;
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = TET_COLS[type];
        ctx.fillRect(x + 1, y + 1, size, size);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(x + 2, y + 2, size - 2, 4);
        ctx.globalAlpha = 1;
      };
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (clearFlash > 0) clearFlash = Math.max(0, clearFlash - dt * 2.8);
        if (!dead) {
          dropAcc += dt;
          const interval = Math.max(0.11, 0.72 - (level - 1) * 0.065);
          if (dropAcc >= interval) {
            dropAcc = 0;
            if (piece && !collides(piece.m, piece.x, piece.y + 1)) piece.y += 1;
            else lock();
          }
        }
        ctx.fillStyle = '#060913';
        ctx.fillRect(0, 0, 960, 540);
        if (drawArcadeTiledBg(ctx, 'assets/games/space/blue.png', 960, 540, now * 0.006, now * 0.01)) {
          ctx.fillStyle = 'rgba(6, 9, 19, 0.72)';
          ctx.fillRect(0, 0, 960, 540);
        }
        if (clearFlash > 0.01) {
          drawDynamicPointLight(ctx, BX + 120, BY + 240, 260, '56, 189, 248', clearFlash * 0.45);
        }
        ctx.save();
        ctx.fillStyle = '#0b1124';
        ctx.shadowColor = 'rgba(124, 58, 237, 0.45)';
        ctx.shadowBlur = 22;
        ctx.fillRect(BX - 4, BY - 4, COLS * CELL + 8, ROWS * CELL + 8);
        ctx.restore();
        ctx.strokeStyle = level >= 4 ? '#22D3EE' : '#7C3AED';
        ctx.lineWidth = 3;
        ctx.strokeRect(BX - 4, BY - 4, COLS * CELL + 8, ROWS * CELL + 8);
        for (let r = 0; r < ROWS; r += 1) {
          for (let c = 0; c < COLS; c += 1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.045)';
            ctx.lineWidth = 1;
            ctx.strokeRect(BX + c * CELL, BY + r * CELL, CELL, CELL);
            if (board[r][c]) drawCell(BX + c * CELL, BY + r * CELL, board[r][c]);
          }
        }
        if (piece && !dead) {
          let gy = piece.y;
          while (!collides(piece.m, piece.x, gy + 1)) gy += 1;
          for (let r = 0; r < piece.m.length; r += 1) {
            for (let c = 0; c < piece.m[r].length; c += 1) {
              if (!piece.m[r][c]) continue;
              if (gy + r >= 0) drawCell(BX + (piece.x + c) * CELL, BY + (gy + r) * CELL, piece.type, 1, CELL - 2, true);
              if (piece.y + r >= 0) drawCell(BX + (piece.x + c) * CELL, BY + (piece.y + r) * CELL, piece.type, 1);
            }
          }
        }
        ctx.fillStyle = '#0d1326';
        ctx.fillRect(640, 30, 190, 150);
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 2;
        ctx.strokeRect(640, 30, 190, 150);
        ctx.fillStyle = '#94A3B8';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SIGUIENTE', 735, 56);
        const nm = TET_SHAPES[nextType];
        const ox = 735 - (nm[0].length * 22) / 2;
        nm.forEach((row, nr) =>
          row.forEach((v, nc) => {
            if (v) drawCell(ox + nc * 22, 82 + nr * 22, nextType, 1, 20);
          })
        );
        rafId = window.requestAnimationFrame(loop);
      };
      rafId = window.requestAnimationFrame(loop);
    }

    // ---------------------------------------------------------------
    // ENGINE 2: HEXTRIS NEON
    // ---------------------------------------------------------------
    else if (gameId === 'hextris') {
      const MAX_STACK = 7;
      const HEX_R = 56;
      const LAYER_H = 22;
      let stacks: number[][] = [[], [], [], [], [], []];
      let falling: Array<{ lane: number; r: number; col: number }> = [];
      let rotStep = 0;
      let visualAngle = 0;
      let curScore = 0;
      let combo = 1;
      let speedMul = 1;
      let spawnTimer = 0.5;
      let fastDrop = false;
      let dead = false;
      let sparks: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];

      const clearMatches = () => {
        let removed = 0;
        for (let s = 0; s < 6; s += 1) {
          const st = stacks[s];
          let i = 0;
          while (i < st.length) {
            let j = i + 1;
            while (j < st.length && st[j] === st[i]) j += 1;
            if (j - i >= 3) {
              st.splice(i, j - i);
              removed += j - i;
            } else i = j;
          }
        }
        for (let h = 0; h < MAX_STACK; h += 1) {
          for (let l = 0; l < 6; l += 1) {
            const c0 = stacks[l][h];
            const l1 = (l + 1) % 6;
            const l2 = (l + 2) % 6;
            if (c0 !== undefined && stacks[l1][h] === c0 && stacks[l2][h] === c0) {
              stacks[l].splice(h, 1);
              stacks[l1].splice(h, 1);
              stacks[l2].splice(h, 1);
              removed += 3;
              h = Math.max(-1, h - 1);
              break;
            }
          }
        }
        if (removed > 0) {
          curScore += removed * 30 * combo;
          combo = Math.min(8, combo + 1);
          speedMul = 1 + Math.min(1.4, curScore / 4000);
          for (let k = 0; k < 10; k += 1) {
            const ang = (k / 10) * Math.PI * 2;
            const spd = 90 + Math.random() * 140;
            sparks.push({ x: 480, y: 270, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.55 });
          }
          playArcadeSfx(540 + combo * 55, 0.12, 'triangle', 0.08, mutedRef.current);
          pixiFxRef.current?.emitBurst(0.5, 0.5, 'spark', 18);
          commitScore(curScore);
        } else {
          combo = 1;
        }
        setSubLabel(`Combo x${combo}`);
      };

      const reset = () => {
        stacks = [[], [], [], [], [], []];
        falling = [];
        rotStep = 0;
        visualAngle = 0;
        curScore = 0;
        combo = 1;
        speedMul = 1;
        spawnTimer = 0.4;
        dead = false;
        setGameOver(false);
        commitScore(0);
        setSubLabel('Combo x1');
      };

      actionsRef.current = {
        left: () => { if (!dead) { rotStep -= 1; playArcadeSfx(320, 0.04, 'sine', 0.04, mutedRef.current); } },
        right: () => { if (!dead) { rotStep += 1; playArcadeSfx(360, 0.04, 'sine', 0.04, mutedRef.current); } },
        up: () => {},
        down: () => { fastDrop = true; window.setTimeout(() => { fastDrop = false; }, 220); },
        primary: () => { fastDrop = true; window.setTimeout(() => { fastDrop = false; }, 220); },
        reset,
        setFastDrop: (on: boolean) => { fastDrop = on; },
      };

      reset();
      let last = performance.now();
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        visualAngle += (rotStep * (Math.PI / 3) - visualAngle) * Math.min(1, dt * 16);

        if (!dead) {
          spawnTimer -= dt * (fastDrop ? 1.8 : 1);
          if (spawnTimer <= 0) {
            falling.push({
              lane: Math.floor(Math.random() * 6),
              r: 290,
              col: Math.floor(Math.random() * HEX_PALETTE.length),
            });
            spawnTimer = Math.max(0.55, 1.38 / speedMul);
          }
          for (let fi = falling.length - 1; fi >= 0; fi -= 1) {
            const blk = falling[fi];
            blk.r -= dt * (fastDrop ? 260 : 105 * speedMul);
            const destLane = ((blk.lane - rotStep) % 6 + 6) % 6;
            const stackH = HEX_R + stacks[destLane].length * LAYER_H + LAYER_H * 0.5;
            if (blk.r <= stackH) {
              falling.splice(fi, 1);
              stacks[destLane].push(blk.col);
              curScore += 10;
              commitScore(curScore);
              if (stacks[destLane].length > MAX_STACK) {
                dead = true;
                setGameOver(true);
                setGameOverMsg(`${curScore} puntos`);
                playArcadeSfx(130, 0.24, 'sawtooth', 0.09, mutedRef.current);
              } else {
                clearMatches();
              }
            }
          }
        }

        ctx.fillStyle = '#070a15';
        ctx.fillRect(0, 0, 960, 540);
        if (drawArcadeTiledBg(ctx, 'assets/games/space/darkPurple.png', 960, 540, now * 0.008, now * 0.005)) {
          ctx.fillStyle = 'rgba(7, 10, 21, 0.72)';
          ctx.fillRect(0, 0, 960, 540);
        }
        drawProceduralNebulaBackdrop(ctx, 960, 540, now * 0.001, 'cyber');
        for (let si = sparks.length - 1; si >= 0; si -= 1) {
          const sp = sparks[si];
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
          sp.life -= dt;
          if (sp.life <= 0) {
            sparks.splice(si, 1);
            continue;
          }
          drawArcadeSprite(ctx, 'assets/games/puzzle/particleStar.png', sp.x, sp.y, 18, 18, sp.life * 6, Math.min(1, sp.life * 2));
        }
        const cx = 480;
        const cy = 270;
        // Atmospheric radial pulse backdrop reacting to combo
        const auraR = 235 + Math.sin(now * 0.004) * 14 + combo * 6;
        drawDynamicPointLight(ctx, cx, cy, auraR, combo >= 3 ? '168, 85, 247' : '56, 189, 248', Math.min(0.45, 0.14 + combo * 0.04));

        const maxLen = Math.max(...stacks.map((s) => s.length));
        ctx.strokeStyle = maxLen >= MAX_STACK - 1 ? `rgba(244,63,94,${0.45 + 0.35 * Math.sin(now * 0.015)})` : 'rgba(244,63,94,0.32)';
        ctx.lineWidth = maxLen >= MAX_STACK - 1 ? 4 : 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const oa = visualAngle + i * (Math.PI / 3);
          const ox = cx + Math.cos(oa) * (HEX_R + MAX_STACK * LAYER_H + 8);
          const oy = cy + Math.sin(oa) * (HEX_R + MAX_STACK * LAYER_H + 8);
          if (i === 0) ctx.moveTo(ox, oy);
          else ctx.lineTo(ox, oy);
        }
        ctx.closePath();
        ctx.stroke();

        const drawTrap = (angC: number, rIn: number, rOut: number, color: string) => {
          const a0 = angC - Math.PI / 6 + 0.03;
          const a1 = angC + Math.PI / 6 - 0.03;
          ctx.fillStyle = color;
          ctx.strokeStyle = '#070a15';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a0) * rIn, cy + Math.sin(a0) * rIn);
          ctx.lineTo(cx + Math.cos(a1) * rIn, cy + Math.sin(a1) * rIn);
          ctx.lineTo(cx + Math.cos(a1) * rOut, cy + Math.sin(a1) * rOut);
          ctx.lineTo(cx + Math.cos(a0) * rOut, cy + Math.sin(a0) * rOut);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Glossy outer bevel highlight
          ctx.strokeStyle = 'rgba(255,255,255,0.32)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a0) * (rOut - 1.5), cy + Math.sin(a0) * (rOut - 1.5));
          ctx.lineTo(cx + Math.cos(a1) * (rOut - 1.5), cy + Math.sin(a1) * (rOut - 1.5));
          ctx.stroke();
        };

        for (let s = 0; s < 6; s += 1) {
          const ang = visualAngle + s * (Math.PI / 3);
          for (let h = 0; h < stacks[s].length; h += 1) {
            drawTrap(ang, HEX_R + h * LAYER_H, HEX_R + (h + 1) * LAYER_H - 2, HEX_PALETTE[stacks[s][h]]);
          }
        }
        for (const fb of falling) {
          drawTrap(fb.lane * (Math.PI / 3), fb.r - 10, fb.r + 10, HEX_PALETTE[fb.col]);
        }
        ctx.save();
        ctx.shadowColor = 'rgba(167, 139, 250, 0.5)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#141b33';
        ctx.strokeStyle = '#A78BFA';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const ka = visualAngle + k * (Math.PI / 3) - Math.PI / 6;
          const kx = cx + Math.cos(ka) * HEX_R;
          const ky = cy + Math.sin(ka) * HEX_R;
          if (k === 0) ctx.moveTo(kx, ky);
          else ctx.lineTo(kx, ky);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#FFF';
        ctx.font = '900 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(curScore), cx, cy + 6);

        rafId = window.requestAnimationFrame(loop);
      };
      rafId = window.requestAnimationFrame(loop);
    }

    // ---------------------------------------------------------------
    // ENGINE 3: 2048 EDITION
    // ---------------------------------------------------------------
    else {
      let grid: number[][] = [];
      let prevGrid: number[][] | null = null;
      let prevScore = 0;
      let curScore = 0;
      let dead = false;

      const spawn = () => {
        const empties: Array<[number, number]> = [];
        for (let r = 0; r < 4; r += 1) {
          for (let c = 0; c < 4; c += 1) if (grid[r][c] === 0) empties.push([r, c]);
        }
        if (!empties.length) return;
        const [rr, cc] = empties[Math.floor(Math.random() * empties.length)];
        grid[rr][cc] = Math.random() < 0.9 ? 2 : 4;
      };
      const hasMoves = () => {
        for (let r = 0; r < 4; r += 1) {
          for (let c = 0; c < 4; c += 1) {
            if (grid[r][c] === 0) return true;
            if (r < 3 && grid[r][c] === grid[r + 1][c]) return true;
            if (c < 3 && grid[r][c] === grid[r][c + 1]) return true;
          }
        }
        return false;
      };
      const syncStats = () => {
        let maxV = 2;
        grid.forEach((row) => row.forEach((v) => { if (v > maxV) maxV = v; }));
        commitScore(curScore);
        setSubLabel(`Ficha máxima: ${maxV}`);
      };
      const slideLine = (arr: number[]) => {
        const nz = arr.filter((v) => v !== 0);
        const out: number[] = [];
        for (let i = 0; i < nz.length; i += 1) {
          if (i + 1 < nz.length && nz[i] === nz[i + 1]) {
            const v = nz[i] * 2;
            out.push(v);
            curScore += v;
            if (v >= 64) {
              pixiFxRef.current?.emitBurst(0.5, 0.5, 'merge', v >= 256 ? 24 : 16);
            }
            i += 1;
          } else {
            out.push(nz[i]);
          }
        }
        while (out.length < 4) out.push(0);
        return out;
      };
      const move = (dir: 'left' | 'right' | 'up' | 'down') => {
        if (dead) return;
        const snap = grid.map((r) => [...r]);
        const snapScore = curScore;
        let changed = false;
        for (let idx = 0; idx < 4; idx += 1) {
          const line: number[] = [];
          for (let k = 0; k < 4; k += 1) {
            line.push(
              dir === 'left' ? grid[idx][k] : dir === 'right' ? grid[idx][3 - k] : dir === 'up' ? grid[k][idx] : grid[3 - k][idx]
            );
          }
          const next = slideLine(line);
          for (let m = 0; m < 4; m += 1) {
            const r = dir === 'left' || dir === 'right' ? idx : dir === 'up' ? m : 3 - m;
            const c = dir === 'up' || dir === 'down' ? idx : dir === 'left' ? m : 3 - m;
            if (grid[r][c] !== next[m]) changed = true;
            grid[r][c] = next[m];
          }
        }
        if (!changed) return;
        prevGrid = snap;
        prevScore = snapScore;
        spawn();
        syncStats();
        playArcadeSfx(360, 0.05, 'triangle', 0.05, mutedRef.current);
        if (!hasMoves()) {
          dead = true;
          setGameOver(true);
          setGameOverMsg(`${curScore} puntos`);
        }
      };
      const reset = () => {
        grid = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
        prevGrid = null;
        curScore = 0;
        prevScore = 0;
        dead = false;
        spawn();
        spawn();
        setGameOver(false);
        syncStats();
      };

      actionsRef.current = {
        left: () => move('left'),
        right: () => move('right'),
        up: () => move('up'),
        down: () => move('down'),
        primary: () => {
          if (prevGrid) {
            grid = prevGrid;
            curScore = prevScore;
            prevGrid = null;
            syncStats();
            playArcadeSfx(240, 0.06, 'sine', 0.05, mutedRef.current);
          }
        },
        reset,
      };
      reset();

      const drawRR = (x: number, y: number, w: number, h: number, rad: number, fill: string) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
        ctx.lineTo(x + w, y + h - rad);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        ctx.lineTo(x + rad, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.closePath();
        ctx.fill();
      };
      const loop = (now: number) => {
        if (!alive) return;
        ctx.fillStyle = '#070b14';
        ctx.fillRect(0, 0, 960, 540);
        if (drawArcadeTiledBg(ctx, 'assets/games/space/blue.png', 960, 540, now * 0.004, now * 0.006)) {
          ctx.fillStyle = 'rgba(7, 11, 20, 0.76)';
          ctx.fillRect(0, 0, 960, 540);
        }
        const bx = 250;
        const by = 40;
        const bsize = 460;
        const pad = 14;
        const tsize = (bsize - pad * 5) / 4;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 24;
        drawRR(bx - 6, by - 6, bsize + 12, bsize + 12, 26, '#1a243d');
        ctx.restore();
        drawRR(bx, by, bsize, bsize, 22, '#0e1629');
        let bestTile = 2;
        for (let r = 0; r < 4; r += 1) {
          for (let c = 0; c < 4; c += 1) {
            const v = grid[r][c];
            if (v > bestTile) bestTile = v;
            const pair = TILE_STYLE[v] || ['#38BDF8', '#FFFFFF'];
            const tx = bx + pad + c * (tsize + pad);
            const ty = by + pad + r * (tsize + pad);
            if (v > 0) {
              if (v >= 128) {
                drawDynamicPointLight(ctx, tx + tsize * 0.5, ty + tsize * 0.5, tsize * 0.85, v >= 1024 ? '168, 85, 247' : '250, 204, 21', 0.28);
              }
              ctx.save();
              ctx.shadowColor = v >= 128 ? pair[0] : 'rgba(0,0,0,0.45)';
              ctx.shadowBlur = v >= 128 ? 14 : 8;
              ctx.shadowOffsetY = 3;
              drawRR(tx, ty, tsize, tsize, 14, pair[0]);
              ctx.restore();
              drawRR(tx + 3, ty + 3, tsize - 6, tsize * 0.42, 10, 'rgba(255,255,255,0.22)');
              ctx.fillStyle = pair[1];
              ctx.font = `900 ${v >= 1024 ? 30 : v >= 100 ? 36 : 42}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillText(String(v), tx + tsize / 2, ty + tsize / 2 + 13);
            } else {
              drawRR(tx, ty, tsize, tsize, 14, pair[0]);
            }
          }
        }
        const medal =
          bestTile >= 2048
            ? 'assets/games/medals/medalGold.png'
            : bestTile >= 1024
              ? 'assets/games/medals/medalSilver.png'
              : bestTile >= 512
                ? 'assets/games/medals/medalBronze.png'
                : '';
        if (medal) drawArcadeSprite(ctx, medal, 800, 120, 68, 71);
        rafId = window.requestAnimationFrame(loop);
      };
      rafId = window.requestAnimationFrame(loop);
    }

    return () => {
      alive = false;
      window.cancelAnimationFrame(rafId);
    };
  }, [gameId, commitScore]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); actionsRef.current.left(); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); actionsRef.current.right(); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); actionsRef.current.up(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); actionsRef.current.down(); }
      else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (gameOver) actionsRef.current.reset();
        else actionsRef.current.primary();
      } else if (e.code === 'KeyR') {
        actionsRef.current.reset();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'Space') actionsRef.current.setFastDrop?.(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gameOver]);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const start = touchStartRef.current;
    const t = e.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) actionsRef.current.right();
      else actionsRef.current.left();
    } else if (dy > 0) {
      actionsRef.current.down();
    } else {
      actionsRef.current.up();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 select-none">
      <div className="rounded-2xl bg-[#0d1220] border border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs font-bold text-zinc-300 tabular-nums">
          <span className="text-sm font-black text-white">{score} pts</span>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <span className="text-cyan-300">{subLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-300 flex items-center gap-1 tabular-nums">
            <Trophy className="w-3.5 h-3.5" /> {bestScore}
          </span>
          <button
            type="button"
            onClick={() => setCrtEnabled((v) => !v)}
            aria-label="CRT"
            title="Filtro CRT retro"
            className={`min-h-9 px-2.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1 cursor-pointer ${
              crtEnabled
                ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                : 'bg-white/[0.06] hover:bg-white/[0.14] border-white/10 text-zinc-300'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>CRT</span>
          </button>
          <button
            type="button"
            onClick={() => setLocalMuted((m) => !m)}
            aria-label={pickLang(lang, { es: 'Silenciar sonido', ca: 'Silenciar so', en: 'Mute sound' })}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            {localMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); actionsRef.current.reset(); }}
            aria-label={pickLang(lang, { es: 'Reiniciar partida', ca: 'Reiniciar partida', en: 'Restart game' })}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        onContextMenu={(e) => e.preventDefault()}
        className="game-touch-surface relative rounded-3xl overflow-hidden border border-white/10 bg-[#070b14] shadow-2xl"
      >
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="game-touch-btn w-full h-auto block touch-none"
        />
        <CrtOverlayLayer enabled={crtEnabled} />
        <PixiGameFxLayer ref={pixiFxRef} />
        {gameOver && (
          <div className="absolute inset-0 bg-[#050812]/90 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Trophy className="w-11 h-11 text-amber-400" />
            <h3 className="text-2xl font-black text-white">
              {pickLang(lang, { es: 'Fin de partida', ca: 'Fi de partida', en: 'Game Over' })}
            </h3>
            <p className="text-sm text-zinc-300 tabular-nums">{gameOverMsg}</p>
            <button
              type="button"
              onClick={() => { triggerHaptic('medium'); actionsRef.current.reset(); }}
              className="game-touch-btn min-h-11 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white whitespace-nowrap cursor-pointer"
            >
              {pickLang(lang, { es: 'Jugar otra vez', ca: 'Jugar altra vegada', en: 'Play Again' })}
            </button>
          </div>
        )}
      </div>

      <div
        onContextMenu={(e) => e.preventDefault()}
        className="game-touch-surface flex flex-wrap items-center justify-center gap-2"
      >
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => { e.preventDefault(); triggerHaptic('light'); actionsRef.current.left(); }}
          className="game-touch-btn min-h-11 min-w-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer"
          aria-label="Izquierda"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {gameId !== 'hextris' && (
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => { e.preventDefault(); triggerHaptic('light'); actionsRef.current.up(); }}
            className="game-touch-btn min-h-11 min-w-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer"
            aria-label={gameId === 'tetris' ? 'Rotar' : 'Arriba'}
          >
            {gameId === 'tetris' ? <RotateCw className="w-5 h-5" /> : <ArrowUp className="w-5 h-5" />}
          </button>
        )}
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => { e.preventDefault(); triggerHaptic('light'); actionsRef.current.down(); }}
          className="game-touch-btn min-h-11 min-w-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer"
          aria-label="Abajo"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => { e.preventDefault(); triggerHaptic('light'); actionsRef.current.right(); }}
          className="game-touch-btn min-h-11 min-w-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer"
          aria-label="Derecha"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        {gameId !== 'hextris' && (
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => { e.preventDefault(); triggerHaptic('medium'); actionsRef.current.primary(); }}
            className="game-touch-btn min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {gameId === 'tetris' ? 'Caída rápida' : <><Undo2 className="w-4 h-4" /> Deshacer</>}
          </button>
        )}
      </div>
    </div>
  );
};
