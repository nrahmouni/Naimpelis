import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bomb,
  Compass,
  Monitor,
  QrCode,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AppLanguage } from '../../../types';
import { socketService } from '../../../services/socket';
import { useDirectDeviceGyro } from '../../../hooks/useDirectDeviceGyro';
import { pickLang } from '../../../utils/i18n';
import { triggerHaptic } from '../../../utils/haptics';
import { DualGyroQrPanel, type DualGyroControllerPeer } from '../racing/DualGyroQrPanel';
import { loadArcadeBest, playArcadeSfx, saveArcadeBest } from './arcadeAudio';
import {
  EXPLOSION_FRAMES,
  drawArcadeSprite,
  drawArcadeSpriteRect,
  drawArcadeTiledBg,
  preloadArcadeSprites,
} from './arcadeSprites';
import { PixiGameFxLayer, type PixiGameFxHandle } from './PixiGameFxLayer';
import {
  CrtOverlayLayer,
  computeSquashStretch,
  drawDynamicPointLight,
  drawMotionSmearTrail,
  drawProceduralNebulaBackdrop,
} from './canvas2dFxHelpers';

const ACTION_SPRITE_LIST = [
  ...EXPLOSION_FRAMES,
  'assets/games/puzzle/particleStar.png',
  'assets/games/space/powerupBlue_bolt.png',
  'assets/games/space/pill_red.png',
  'assets/games/bomberman/ground_06.png',
  'assets/games/bomberman/block_01.png',
  'assets/games/bomberman/crate_01.png',
  'assets/games/bomberman/player_05.png',
  'assets/games/bomberman/player_01.png',
  'assets/games/bomberman/player_11.png',
  'assets/games/bomberman/player_17.png',
  'assets/games/puzzle/element_blue_square_glossy.png',
  'assets/games/space/darkPurple.png',
  'assets/games/tappy/background.png',
  'assets/games/tappy/groundGrass.png',
  'assets/games/tappy/rockGrass.png',
  'assets/games/tappy/rockGrassDown.png',
  'assets/games/tappy/planeYellow1.png',
  'assets/games/tappy/planeYellow2.png',
  'assets/games/tappy/planeYellow3.png',
  'assets/games/tappy/puffLarge.png',
] as const;

export type ActionArcadeId = 'pacman' | 'bomberman' | 'flappy';

interface ArcadeActionStageProps {
  gameId: ActionArcadeId;
  lang: AppLanguage;
  roomId?: string;
  userName?: string;
  mutedOverride?: boolean;
}

const PAC_MAP = [
  '###################',
  '#O.......#.......O#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  '   #.#       #.#   ',
  '####.# ##-## #.####',
  '#........ ........#',
  '#.##.###.#.###.##.#',
  '#O.#...........#.O#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '###################',
];

export const ArcadeActionStage: React.FC<ArcadeActionStageProps> = ({
  gameId,
  lang,
  roomId = '',
  userName = 'Jugador',
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
  const [showQrModal, setShowQrModal] = useState(false);
  const [controllers, setControllers] = useState<DualGyroControllerPeer[]>([]);
  const [crtEnabled, setCrtEnabled] = useState(() => gameId !== 'flappy');

  const effectiveRoomId = useMemo(
    () => (roomId || socketService.getActiveRoomId() || `${gameId}-local`).trim().toLowerCase(),
    [gameId, roomId]
  );

  const wsGyroRef = useRef({
    steer: 0,
    pitch: 0,
    throttle: 0,
    brake: 0,
    nitro: false,
    handbrake: false,
    swing: 0,
    expiresAt: 0,
  });

  const actionsRef = useRef<{
    left: () => void;
    right: () => void;
    up: () => void;
    down: () => void;
    primary: () => void;
    reset: () => void;
  }>({
    left: () => {},
    right: () => {},
    up: () => {},
    down: () => {},
    primary: () => {},
    reset: () => {},
  });

  const directGyro = useDirectDeviceGyro({
    maxDeg: 24,
    pitchMaxDeg: 22,
    onSwing: (strength) => {
      if (gameId === 'flappy' && strength > 0.8) actionsRef.current.primary();
      else if (gameId === 'bomberman' && strength > 1.35) actionsRef.current.primary();
    },
  });

  useEffect(() => {
    const alreadyConnected = socketService.isConnected() && socketService.getActiveRoomId();
    if (!alreadyConnected) {
      socketService.connect(
        effectiveRoomId,
        {
          id: `tv-act-${effectiveRoomId}`,
          name: `${userName || 'Jugador'} (${gameId})`,
          avatar: '🎮',
          color: '#facc15',
          role: 'host',
          isHost: true,
          joinedAt: Date.now(),
        },
        `Sala ${effectiveRoomId.toUpperCase()}`
      );
    } else {
      socketService.joinGyroChannel('display', `${userName || 'Jugador'} (${gameId})`, effectiveRoomId, {
        gameId,
      });
    }

    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'GYRO_PEER_STATUS') {
        const list = Array.isArray(ev.payload.controllers)
          ? (ev.payload.controllers as DualGyroControllerPeer[])
          : [];
        setControllers(list);
      } else if (ev.type === 'GYRO_INPUT_RELAY') {
        wsGyroRef.current = {
          steer: Number(ev.payload.steer || 0),
          pitch: Number(ev.payload.pitch || 0),
          throttle: Number(ev.payload.throttle || 0),
          brake: Number(ev.payload.brake || 0),
          nitro: Boolean(ev.payload.nitro),
          handbrake: Boolean(ev.payload.handbrake),
          swing: Number(ev.payload.swing || 0),
          expiresAt: Date.now() + 1400,
        };
      } else if (ev.type === 'ROOM_STATE') {
        socketService.joinGyroChannel('display', `${userName || 'Jugador'} (${gameId})`, effectiveRoomId, {
          gameId,
        });
      }
    });

    return () => unsub();
  }, [effectiveRoomId, gameId, userName]);

  // Translate continuous 2-axis tilt & shake/button gyro into discrete arcade actions
  useEffect(() => {
    let lastDir = '';
    let lastStepAt = 0;
    let prevFlapTrig = false;
    let prevBombTrig = false;
    const id = window.setInterval(() => {
      const ws = wsGyroRef.current;
      const wsOn = Date.now() < ws.expiresAt;
      const dg = directGyro.gyroRef.current;
      if (!wsOn && !dg.active) return;

      const steer = wsOn ? ws.steer : dg.steer;
      const pitch = wsOn ? ws.pitch : dg.pitch;
      const swing = wsOn ? ws.swing : dg.swing;
      const now = Date.now();

      if (gameId === 'flappy') {
        const trig = (wsOn && (ws.nitro || ws.throttle > 0.5 || ws.handbrake)) || swing > 0.85 || (dg.active && pitch > 0.45);
        if (trig && !prevFlapTrig) actionsRef.current.primary();
        prevFlapTrig = trig;
        if (wsOn && ws.brake > 0.5 && gameOver) actionsRef.current.reset();
        return;
      }

      if (gameId === 'bomberman') {
        const bombTrig = wsOn && (ws.nitro || ws.throttle > 0.5);
        if (bombTrig && !prevBombTrig) actionsRef.current.primary();
        prevBombTrig = bombTrig;
        if (wsOn && ws.brake > 0.5 && gameOver) actionsRef.current.reset();
      }

      let nextDir = '';
      if (Math.abs(steer) > 0.34 || Math.abs(pitch) > 0.34) {
        if (Math.abs(steer) >= Math.abs(pitch)) nextDir = steer > 0 ? 'R' : 'L';
        else nextDir = pitch > 0 ? 'U' : 'D';
      }
      if (nextDir && (nextDir !== lastDir || (gameId === 'bomberman' && now - lastStepAt > 190))) {
        lastDir = nextDir;
        lastStepAt = now;
        if (nextDir === 'L') actionsRef.current.left();
        else if (nextDir === 'R') actionsRef.current.right();
        else if (nextDir === 'U') actionsRef.current.up();
        else if (nextDir === 'D') actionsRef.current.down();
      } else if (!nextDir) {
        lastDir = '';
      }
    }, 55);
    return () => window.clearInterval(id);
  }, [gameId, gameOver, directGyro.gyroRef]);

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
    preloadArcadeSprites(ACTION_SPRITE_LIST);
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

    // ---------------------------------------------------------------
    // ENGINE 1: PAC-MAN ARCADE HD
    // ---------------------------------------------------------------
    if (gameId === 'pacman') {
      const ROWS = PAC_MAP.length;
      const COLS = PAC_MAP[0].length;
      const CELL = 32;
      const OX = Math.floor((960 - COLS * CELL) / 2);
      const OY = Math.floor((540 - ROWS * CELL) / 2);
      let grid: string[][] = [];
      let dotsLeft = 0;
      let curScore = 0;
      let lives = 3;
      let level = 1;
      let frightTimer = 0;
      let dead = false;
      let pac = { x: 9, y: 9, dx: -1, dy: 0, ndx: -1, ndy: 0, mouth: 0 };
      let ghosts: Array<{ x: number; y: number; dx: number; dy: number; col: string }> = [];

      const resetPos = () => {
        pac = { x: 9, y: 9, dx: -1, dy: 0, ndx: -1, ndy: 0, mouth: 0 };
        frightTimer = 0;
        ghosts = [
          { x: 9, y: 7, dx: 1, dy: 0, col: '#EF4444' },
          { x: 8, y: 7, dx: -1, dy: 0, col: '#EC4899' },
          { x: 10, y: 7, dx: 1, dy: 0, col: '#22D3EE' },
          { x: 9, y: 6, dx: 0, dy: -1, col: '#F97316' },
        ];
      };
      const initMap = (keep: boolean) => {
        grid = PAC_MAP.map((row) => row.split(''));
        dotsLeft = 0;
        grid.forEach((r) => r.forEach((ch) => { if (ch === '.' || ch === 'O') dotsLeft += 1; }));
        if (!keep) { curScore = 0; lives = 3; level = 1; }
        dead = false;
        setGameOver(false);
        resetPos();
        commitScore(curScore);
        setSubLabel(`Vidas ${lives} · Nivel ${level}`);
      };
      const isWall = (gx: number, gy: number, allowGate = false) => {
        const tx = ((Math.round(gx) % COLS) + COLS) % COLS;
        const ty = Math.round(gy);
        if (ty < 0 || ty >= ROWS) return true;
        const ch = grid[ty][tx];
        return ch === '#' || (!allowGate && ch === '-');
      };

      actionsRef.current = {
        left: () => { pac.ndx = -1; pac.ndy = 0; },
        right: () => { pac.ndx = 1; pac.ndy = 0; },
        up: () => { pac.ndx = 0; pac.ndy = -1; },
        down: () => { pac.ndx = 0; pac.ndy = 1; },
        primary: () => {},
        reset: () => initMap(false),
      };
      initMap(false);

      let last = performance.now();
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.04, (now - last) / 1000);
        last = now;
        pac.mouth += dt * 12;

        if (!dead) {
          if (frightTimer > 0) frightTimer = Math.max(0, frightTimer - dt);
          const speed = 5.6 + Math.min(2.0, (level - 1) * 0.35);
          const step = dt * speed;

          // Instant 180 reversal on the current corridor
          if ((pac.ndx !== 0 && pac.ndx === -pac.dx) || (pac.ndy !== 0 && pac.ndy === -pac.dy)) {
            pac.dx = pac.ndx;
            pac.dy = pac.ndy;
          }

          const rx = Math.round(pac.x);
          const ry = Math.round(pac.y);
          const nx = pac.x + pac.dx * step;
          const ny = pac.y + pac.dy * step;
          const crossedX = (pac.x <= rx && nx >= rx) || (pac.x >= rx && nx <= rx);
          const crossedY = (pac.y <= ry && ny >= ry) || (pac.y >= ry && ny <= ry);
          const nearCenter = Math.abs(pac.x - rx) <= Math.max(0.22, step) && Math.abs(pac.y - ry) <= Math.max(0.22, step);

          if ((pac.dx === 0 && pac.dy === 0) || nearCenter || (pac.dx !== 0 && crossedX) || (pac.dy !== 0 && crossedY)) {
            if ((pac.ndx !== pac.dx || pac.ndy !== pac.dy) && !isWall(rx + pac.ndx, ry + pac.ndy)) {
              pac.x = rx;
              pac.y = ry;
              pac.dx = pac.ndx;
              pac.dy = pac.ndy;
            } else if (isWall(rx + pac.dx, ry + pac.dy)) {
              pac.x = rx;
              pac.y = ry;
              pac.dx = 0;
              pac.dy = 0;
            }
          }

          const tryNextX = pac.x + pac.dx * step;
          const tryNextY = pac.y + pac.dy * step;
          if (!isWall(Math.round(tryNextX + pac.dx * 0.45), Math.round(tryNextY + pac.dy * 0.45))) {
            pac.x = tryNextX;
            pac.y = tryNextY;
          } else {
            pac.x = Math.round(pac.x);
            pac.y = Math.round(pac.y);
            pac.dx = 0;
            pac.dy = 0;
          }
          if (pac.x < -0.45) pac.x = COLS - 0.55;
          if (pac.x > COLS - 0.45) pac.x = -0.45;

          const cx = ((Math.round(pac.x) % COLS) + COLS) % COLS;
          const cy = Math.round(pac.y);
          if (cy >= 0 && cy < ROWS && (grid[cy][cx] === '.' || grid[cy][cx] === 'O')) {
            const pwr = grid[cy][cx] === 'O';
            grid[cy][cx] = ' ';
            dotsLeft -= 1;
            curScore += pwr ? 50 : 10;
            if (pwr) {
              frightTimer = 7;
              pixiFxRef.current?.emitBurst(
                Math.max(0.05, Math.min(0.95, (OX + (cx + 0.5) * CELL) / 960)),
                Math.max(0.05, Math.min(0.95, (OY + (cy + 0.5) * CELL) / 540)),
                'coin',
                16
              );
              playArcadeSfx(740, 0.14, 'triangle', 0.08, mutedRef.current);
            } else {
              playArcadeSfx(420, 0.03, 'sine', 0.03, mutedRef.current);
            }
            commitScore(curScore);
            if (dotsLeft <= 0) { level += 1; curScore += 500; initMap(true); }
          }

          const gStep = frightTimer > 0 ? step * 0.62 : step * 0.82;
          for (const g of ghosts) {
            const grx = Math.round(g.x);
            const gry = Math.round(g.y);
            if (Math.abs(g.x - grx) <= Math.max(0.22, gStep) && Math.abs(g.y - gry) <= Math.max(0.22, gStep)) {
              g.x = grx; g.y = gry;
              const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
              const valid = dirs.filter(([dx, dy]) => !(dx === -g.dx && dy === -g.dy) && !isWall(grx + dx, gry + dy, true));
              if (!valid.length) valid.push([-g.dx, -g.dy]);
              valid.sort((a, b) => {
                const da = (grx + a[0] - pac.x) ** 2 + (gry + a[1] - pac.y) ** 2;
                const db = (grx + b[0] - pac.x) ** 2 + (gry + b[1] - pac.y) ** 2;
                return frightTimer > 0 ? db - da : da - db;
              });
              const pick = Math.random() < 0.72 ? valid[0] : valid[Math.floor(Math.random() * valid.length)];
              g.dx = pick[0]; g.dy = pick[1];
            }
            g.x += g.dx * gStep;
            g.y += g.dy * gStep;
            if (g.x < -0.45) g.x = COLS - 0.55;
            if (g.x > COLS - 0.45) g.x = -0.45;
            if (Math.hypot(g.x - pac.x, g.y - pac.y) < 0.65) {
              if (frightTimer > 0) {
                pixiFxRef.current?.emitBurst(
                  Math.max(0.05, Math.min(0.95, (OX + (g.x + 0.5) * CELL) / 960)),
                  Math.max(0.05, Math.min(0.95, (OY + (g.y + 0.5) * CELL) / 540)),
                  'spark',
                  18
                );
                curScore += 200; commitScore(curScore); g.x = 9; g.y = 7;
                playArcadeSfx(860, 0.12, 'square', 0.08, mutedRef.current);
              } else {
                pixiFxRef.current?.emitBurst(
                  Math.max(0.05, Math.min(0.95, (OX + (pac.x + 0.5) * CELL) / 960)),
                  Math.max(0.05, Math.min(0.95, (OY + (pac.y + 0.5) * CELL) / 540)),
                  'explosion',
                  18
                );
                lives -= 1; setSubLabel(`Vidas ${lives} · Nivel ${level}`);
                playArcadeSfx(140, 0.22, 'sawtooth', 0.09, mutedRef.current);
                if (lives <= 0) { dead = true; setGameOver(true); setGameOverMsg(`${curScore} puntos · Nivel ${level}`); }
                else resetPos();
                break;
              }
            }
          }
        }

        if (!drawArcadeTiledBg(ctx, 'assets/games/space/darkPurple.png', 960, 540, 0, 0)) {
          ctx.fillStyle = '#050812';
          ctx.fillRect(0, 0, 960, 540);
        } else {
          ctx.fillStyle = 'rgba(4, 7, 18, 0.72)';
          ctx.fillRect(0, 0, 960, 540);
        }
        // Subtle neon maze arena frame
        ctx.save();
        ctx.strokeStyle = frightTimer > 0 ? 'rgba(56, 189, 248, 0.55)' : 'rgba(59, 130, 246, 0.45)';
        ctx.lineWidth = 4;
        ctx.shadowColor = frightTimer > 0 ? '#38BDF8' : '#2563EB';
        ctx.shadowBlur = 16;
        ctx.strokeRect(OX - 6, OY - 6, COLS * CELL + 12, ROWS * CELL + 12);
        ctx.restore();

        for (let r = 0; r < ROWS; r += 1) {
          for (let c = 0; c < COLS; c += 1) {
            const x = OX + c * CELL;
            const y = OY + r * CELL;
            if (grid[r][c] === '#') {
              if (!drawArcadeSpriteRect(ctx, 'assets/games/puzzle/element_blue_square_glossy.png', x + 1, y + 1, CELL - 2, CELL - 2)) {
                ctx.fillStyle = '#1D4ED8';
                ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
              }
              ctx.strokeStyle = 'rgba(147, 197, 253, 0.25)';
              ctx.lineWidth = 1;
              ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
            } else if (grid[r][c] === '-') {
              ctx.fillStyle = '#F472B6';
              ctx.fillRect(x + 2, y + CELL / 2 - 2.5, CELL - 4, 5);
            } else if (grid[r][c] === '.') {
              ctx.fillStyle = 'rgba(253, 224, 71, 0.2)';
              ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 6, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = '#FEF08A';
              ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 3.4, 0, Math.PI * 2); ctx.fill();
            } else if (grid[r][c] === 'O') {
              const pr = 19 + Math.sin(pac.mouth * 0.7) * 3.5;
              drawDynamicPointLight(ctx, x + CELL / 2, y + CELL / 2, 24, '253, 224, 71', 0.55);
              if (!drawArcadeSprite(ctx, 'assets/games/puzzle/particleStar.png', x + CELL / 2, y + CELL / 2, pr, pr, now * 0.004)) {
                ctx.fillStyle = '#FACC15';
                ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 7.5, 0, Math.PI * 2); ctx.fill();
              }
            }
          }
        }
        const px = OX + (pac.x + 0.5) * CELL;
        const py = OY + (pac.y + 0.5) * CELL;
        drawDynamicPointLight(ctx, px, py, 36, '250, 204, 21', 0.35);
        const ang = pac.dx < 0 ? Math.PI : pac.dy > 0 ? Math.PI / 2 : pac.dy < 0 ? -Math.PI / 2 : 0;
        const jaw = 0.15 + Math.abs(Math.sin(pac.mouth)) * 0.45;
        ctx.save();
        ctx.shadowColor = 'rgba(250, 204, 21, 0.55)';
        ctx.shadowBlur = 12;
        const pacGrad = ctx.createRadialGradient(px - 4, py - 5, 2, px, py, CELL * 0.48);
        pacGrad.addColorStop(0, '#FEF08A');
        pacGrad.addColorStop(0.65, '#FACC15');
        pacGrad.addColorStop(1, '#CA8A04');
        ctx.fillStyle = pacGrad;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, CELL * 0.44, ang + jaw, ang + Math.PI * 2 - jaw); ctx.closePath(); ctx.fill();
        ctx.restore();
        for (const gh of ghosts) {
          const gx = OX + (gh.x + 0.5) * CELL;
          const gy = OY + (gh.y + 0.5) * CELL;
          const r = CELL * 0.4;
          const flashWhite = frightTimer > 0 && frightTimer < 2 && Math.floor(now / 150) % 2 === 0;
          const bodyCol = frightTimer > 0 ? (flashWhite ? '#E2E8F0' : '#2563EB') : gh.col;
          if (frightTimer > 0) drawDynamicPointLight(ctx, gx, gy, 28, '56, 189, 248', 0.34);
          ctx.save();
          ctx.shadowColor = bodyCol;
          ctx.shadowBlur = 12;
          ctx.fillStyle = bodyCol;
          ctx.beginPath();
          ctx.arc(gx, gy - 2, r, Math.PI, 0);
          ctx.lineTo(gx + r, gy + r);
          const wave = Math.sin(now * 0.015) * 2.2;
          ctx.lineTo(gx + r * 0.55, gy + r - 3.5 + wave);
          ctx.lineTo(gx + r * 0.18, gy + r);
          ctx.lineTo(gx - r * 0.18, gy + r - 3.5 - wave);
          ctx.lineTo(gx - r * 0.55, gy + r);
          ctx.lineTo(gx - r, gy + r - 2.5 + wave);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#FFF';
          ctx.beginPath(); ctx.arc(gx - 4, gy - 3, 3.3, 0, Math.PI * 2); ctx.arc(gx + 4, gy - 3, 3.3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#0F172A';
          ctx.beginPath(); ctx.arc(gx - 4 + gh.dx * 1.4, gy - 3 + gh.dy * 1.4, 1.7, 0, Math.PI * 2); ctx.arc(gx + 4 + gh.dx * 1.4, gy - 3 + gh.dy * 1.4, 1.7, 0, Math.PI * 2); ctx.fill();
        }
        rafId = window.requestAnimationFrame(loop);
      };
      rafId = window.requestAnimationFrame(loop);
    }

    // ---------------------------------------------------------------
    // ENGINE 2: BOMBERMAN PARTY ARENA
    // ---------------------------------------------------------------
    else if (gameId === 'bomberman') {
      const COLS = 13;
      const ROWS = 11;
      const CELL = 44;
      const OX = Math.floor((960 - COLS * CELL) / 2);
      const OY = Math.floor((540 - ROWS * CELL) / 2);
      const ACTOR_SPRITES = [
        'assets/games/bomberman/player_05.png',
        'assets/games/bomberman/player_01.png',
        'assets/games/bomberman/player_11.png',
        'assets/games/bomberman/player_17.png',
      ] as const;
      interface Actor { id: number; isBot: boolean; x: number; y: number; range: number; maxBombs: number; active: number; alive: boolean; col: string; cd: number; }
      let board: number[][] = [];
      let bombs: Array<{ x: number; y: number; range: number; timer: number; owner: Actor }> = [];
      let flames: Array<{ x: number; y: number; timer: number }> = [];
      let items: Array<{ x: number; y: number; kind: 'flame' | 'bomb' }> = [];
      let actors: Actor[] = [];
      let wins = 0;
      let dead = false;

      const hasBomb = (x: number, y: number) => bombs.some((b) => b.x === x && b.y === y);
      const isDanger = (tx: number, ty: number) =>
        bombs.some((b) => (b.x === tx && Math.abs(b.y - ty) <= b.range) || (b.y === ty && Math.abs(b.x - tx) <= b.range)) ||
        flames.some((f) => f.x === tx && f.y === ty);

      const syncStatus = () => {
        const p = actors[0];
        const botsLeft = actors.slice(1).filter((b) => b.alive).length;
        setSubLabel(`Llama ${p?.range || 2} · Bombas ${p?.maxBombs || 1} · Rivales ${botsLeft}/3`);
        commitScore(wins);
      };
      const tryMove = (ac: Actor, dx: number, dy: number) => {
        if (!ac.alive || dead) return false;
        const nx = ac.x + dx;
        const ny = ac.y + dy;
        if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) return false;
        if (board[ny][nx] !== 0 || hasBomb(nx, ny)) return false;
        ac.x = nx; ac.y = ny;
        for (let i = items.length - 1; i >= 0; i -= 1) {
          if (items[i].x === nx && items[i].y === ny) {
            if (items[i].kind === 'flame') ac.range = Math.min(6, ac.range + 1);
            else ac.maxBombs = Math.min(4, ac.maxBombs + 1);
            items.splice(i, 1);
            pixiFxRef.current?.emitBurst(
              Math.max(0.05, Math.min(0.95, (OX + (nx + 0.5) * CELL) / 960)),
              Math.max(0.05, Math.min(0.95, (OY + (ny + 0.5) * CELL) / 540)),
              'coin',
              12
            );
            playArcadeSfx(720, 0.08, 'triangle', 0.07, mutedRef.current);
            syncStatus();
          }
        }
        return true;
      };
      const dropBomb = (ac: Actor) => {
        if (!ac.alive || dead || ac.active >= ac.maxBombs || hasBomb(ac.x, ac.y)) return;
        ac.active += 1;
        bombs.push({ x: ac.x, y: ac.y, range: ac.range, timer: 2.3, owner: ac });
        playArcadeSfx(180, 0.07, 'triangle', 0.05, mutedRef.current);
      };
      const detonate = (b: { x: number; y: number; range: number; owner: Actor }) => {
        b.owner.active = Math.max(0, b.owner.active - 1);
        pixiFxRef.current?.emitBurst(
          Math.max(0.05, Math.min(0.95, (OX + (b.x + 0.5) * CELL) / 960)),
          Math.max(0.05, Math.min(0.95, (OY + (b.y + 0.5) * CELL) / 540)),
          'explosion',
          22
        );
        playArcadeSfx(110, 0.2, 'sawtooth', 0.09, mutedRef.current);
        flames.push({ x: b.x, y: b.y, timer: 0.48 });
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (let s = 1; s <= b.range; s += 1) {
            const fx = b.x + dx * s;
            const fy = b.y + dy * s;
            if (board[fy][fx] === 1) break;
            flames.push({ x: fx, y: fy, timer: 0.48 });
            if (board[fy][fx] === 2) {
              board[fy][fx] = 0;
              if (Math.random() < 0.35) items.push({ x: fx, y: fy, kind: Math.random() < 0.55 ? 'flame' : 'bomb' });
              break;
            }
            bombs.forEach((other) => {
              if (other.x === fx && other.y === fy && other.timer > 0.05) other.timer = 0.04;
            });
          }
        }
      };
      const reset = () => {
        board = Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (__, c) => {
            if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) return 1;
            const safe = (r <= 2 && c <= 2) || (r <= 2 && c >= COLS - 3) || (r >= ROWS - 3 && c <= 2) || (r >= ROWS - 3 && c >= COLS - 3);
            return !safe && Math.random() < 0.62 ? 2 : 0;
          })
        );
        bombs = []; flames = []; items = [];
        actors = [
          { id: 0, isBot: false, x: 1, y: 1, range: 2, maxBombs: 1, active: 0, alive: true, col: '#22D3EE', cd: 0 },
          { id: 1, isBot: true, x: COLS - 2, y: 1, range: 2, maxBombs: 1, active: 0, alive: true, col: '#F43F5E', cd: 0 },
          { id: 2, isBot: true, x: 1, y: ROWS - 2, range: 2, maxBombs: 1, active: 0, alive: true, col: '#FACC15', cd: 0 },
          { id: 3, isBot: true, x: COLS - 2, y: ROWS - 2, range: 2, maxBombs: 1, active: 0, alive: true, col: '#22C55E', cd: 0 },
        ];
        dead = false; setGameOver(false); syncStatus();
      };

      actionsRef.current = {
        left: () => tryMove(actors[0], -1, 0),
        right: () => tryMove(actors[0], 1, 0),
        up: () => tryMove(actors[0], 0, -1),
        down: () => tryMove(actors[0], 0, 1),
        primary: () => dropBomb(actors[0]),
        reset,
      };
      reset();

      let last = performance.now();
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (!dead) {
          for (let i = bombs.length - 1; i >= 0; i -= 1) {
            bombs[i].timer -= dt;
            if (bombs[i].timer <= 0) detonate(bombs.splice(i, 1)[0]);
          }
          for (let i = flames.length - 1; i >= 0; i -= 1) {
            flames[i].timer -= dt;
            actors.forEach((a) => {
              if (a.alive && a.x === flames[i].x && a.y === flames[i].y) { a.alive = false; syncStatus(); }
            });
            if (flames[i].timer <= 0) flames.splice(i, 1);
          }
          for (const bot of actors.slice(1)) {
            if (!bot.alive) continue;
            bot.cd -= dt;
            if (bot.cd <= 0) {
              bot.cd = 0.3 + Math.random() * 0.14;
              const open = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>).filter(
                ([dx, dy]) => board[bot.y + dy][bot.x + dx] === 0 && !hasBomb(bot.x + dx, bot.y + dy)
              );
              const safe = open.filter(([dx, dy]) => !isDanger(bot.x + dx, bot.y + dy));
              if (isDanger(bot.x, bot.y) && safe.length) {
                const p = safe[Math.floor(Math.random() * safe.length)];
                tryMove(bot, p[0], p[1]);
              } else {
                const nearCrate = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => board[bot.y + dy][bot.x + dx] === 2);
                if (nearCrate && Math.random() < 0.34) dropBomb(bot);
                const pool = safe.length ? safe : open;
                if (pool.length) { const mv = pool[Math.floor(Math.random() * pool.length)]; tryMove(bot, mv[0], mv[1]); }
              }
            }
          }
          const botsAlive = actors.slice(1).filter((b) => b.alive).length;
          if (!actors[0].alive || botsAlive === 0) {
            dead = true;
            if (actors[0].alive) wins += 1;
            syncStatus();
            setGameOver(true);
            setGameOverMsg(actors[0].alive ? '¡Victoria en la Arena!' : 'Te alcanzó una explosión');
          }
        }

        ctx.fillStyle = '#070b15';
        ctx.fillRect(0, 0, 960, 540);
        // Subtle arena outer frame glow
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 4;
        ctx.strokeRect(OX - 4, OY - 4, COLS * CELL + 8, ROWS * CELL + 8);
        ctx.restore();

        for (let r = 0; r < ROWS; r += 1) {
          for (let c = 0; c < COLS; c += 1) {
            const tx = OX + c * CELL;
            const ty = OY + r * CELL;
            if (!drawArcadeSpriteRect(ctx, 'assets/games/bomberman/ground_06.png', tx, ty, CELL, CELL)) {
              ctx.fillStyle = (r + c) % 2 === 0 ? '#14532D' : '#166534';
              ctx.fillRect(tx, ty, CELL, CELL);
            }
            if (board[r][c] === 1) {
              ctx.fillStyle = 'rgba(0,0,0,0.34)';
              ctx.fillRect(tx + 3, ty + 4, CELL - 2, CELL - 2);
              if (!drawArcadeSpriteRect(ctx, 'assets/games/bomberman/block_01.png', tx, ty, CELL, CELL)) {
                ctx.fillStyle = '#334155'; ctx.fillRect(tx + 2, ty + 2, CELL - 4, CELL - 4);
              }
            } else if (board[r][c] === 2) {
              ctx.fillStyle = 'rgba(0,0,0,0.32)';
              ctx.fillRect(tx + 3, ty + 4, CELL - 3, CELL - 3);
              if (!drawArcadeSpriteRect(ctx, 'assets/games/bomberman/crate_01.png', tx + 1, ty + 1, CELL - 2, CELL - 2)) {
                ctx.fillStyle = '#B45309'; ctx.fillRect(tx + 3, ty + 3, CELL - 6, CELL - 6);
              }
            }
          }
        }
        items.forEach((it) => {
          const ix = OX + (it.x + 0.5) * CELL;
          const iy = OY + (it.y + 0.5) * CELL + Math.sin(now * 0.007) * 2.2;
          const glow = ctx.createRadialGradient(ix, iy, 2, ix, iy, 20);
          glow.addColorStop(0, it.kind === 'flame' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(244, 63, 94, 0.45)');
          glow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(ix, iy, 20, 0, Math.PI * 2); ctx.fill();
          const pUrl = it.kind === 'flame' ? 'assets/games/space/powerupBlue_bolt.png' : 'assets/games/space/pill_red.png';
          if (!drawArcadeSprite(ctx, pUrl, ix, iy, 28, 28)) {
            ctx.fillStyle = it.kind === 'flame' ? '#F97316' : '#38BDF8';
            ctx.beginPath(); ctx.arc(ix, iy, 13, 0, Math.PI * 2); ctx.fill();
          }
        });
        bombs.forEach((b) => {
          const bpx = OX + (b.x + 0.5) * CELL;
          const bpy = OY + (b.y + 0.5) * CELL;
          const pulse = 13 + Math.sin(b.timer * 15) * 2.6;
          const urgent = b.timer < 0.8;
          drawDynamicPointLight(ctx, bpx, bpy, urgent ? 38 : 28, urgent ? '244, 63, 94' : '250, 204, 21', urgent ? 0.52 : 0.34);
          // Bomb shadow & danger pulse
          ctx.fillStyle = urgent ? 'rgba(244, 63, 94, 0.25)' : 'rgba(0,0,0,0.42)';
          ctx.beginPath(); ctx.arc(bpx, bpy + 4, pulse + 2, 0, Math.PI * 2); ctx.fill();
          const bGrad = ctx.createRadialGradient(bpx - 4, bpy - 4, 2, bpx, bpy, pulse);
          bGrad.addColorStop(0, '#475569');
          bGrad.addColorStop(0.65, '#0F172A');
          bGrad.addColorStop(1, '#020617');
          ctx.fillStyle = bGrad;
          ctx.beginPath(); ctx.arc(bpx, bpy, pulse, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = urgent ? '#F43F5E' : '#38BDF8';
          ctx.lineWidth = 2; ctx.stroke();
          // Fuse ember spark
          const sparkR = 4 + Math.sin(now * 0.04) * 1.8;
          ctx.fillStyle = '#FACC15';
          ctx.beginPath(); ctx.arc(bpx + 5, bpy - 8, sparkR, 0, Math.PI * 2); ctx.fill();
        });
        flames.forEach((f) => {
          const fx = OX + (f.x + 0.5) * CELL;
          const fy = OY + (f.y + 0.5) * CELL;
          drawDynamicPointLight(ctx, fx, fy, 38, '249, 115, 22', Math.min(0.6, f.timer * 1.1));
          const frameIdx = Math.min(EXPLOSION_FRAMES.length - 1, Math.max(0, Math.floor((1 - f.timer / 0.48) * EXPLOSION_FRAMES.length)));
          if (!drawArcadeSprite(ctx, EXPLOSION_FRAMES[frameIdx], fx, fy, CELL * 1.15, CELL * 0.95)) {
            ctx.fillStyle = 'rgba(249,115,22,0.88)';
            ctx.fillRect(OX + f.x * CELL + 2, OY + f.y * CELL + 2, CELL - 4, CELL - 4);
          }
        });
        actors.forEach((a, idx) => {
          if (!a.alive) return;
          const ax = OX + (a.x + 0.5) * CELL;
          const ay = OY + (a.y + 0.5) * CELL;
          // Ground shadow + player halo ring
          ctx.fillStyle = 'rgba(0,0,0,0.42)';
          ctx.beginPath(); ctx.ellipse(ax, ay + 12, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = a.col;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(ax, ay + 8, 16, 0, Math.PI * 2); ctx.stroke();
          if (!drawArcadeSprite(ctx, ACTOR_SPRITES[idx % ACTOR_SPRITES.length], ax, ay - 2, CELL * 0.95, CELL * 0.95)) {
            ctx.fillStyle = a.col; ctx.beginPath(); ctx.arc(ax, ay, 15, 0, Math.PI * 2); ctx.fill();
          }
        });
        rafId = window.requestAnimationFrame(loop);
      };
      rafId = window.requestAnimationFrame(loop);
    }

    // ---------------------------------------------------------------
    // ENGINE 3: CLUMSY BIRD (TAPPY PLANE HD)
    // ---------------------------------------------------------------
    else {
      let bird = { y: 240, vy: 0 };
      let flapImpulse = 0;
      let planeTrail: Array<{ x: number; y: number }> = [];
      let pipes: Array<{ x: number; gapY: number; gapH: number; passed: boolean }> = [];
      let coins: Array<{ x: number; y: number; collected: boolean }> = [];
      let puffs: Array<{ x: number; y: number; life: number }> = [];
      let curScore = 0;
      let started = false;
      let dead = false;
      let spawnX = 0;
      let scroll = 0;

      const reset = () => {
        bird = { y: 240, vy: 0 }; flapImpulse = 0; planeTrail = []; pipes = []; coins = []; puffs = []; curScore = 0;
        started = false; dead = false; spawnX = 0; scroll = 0;
        setGameOver(false); commitScore(0); setSubLabel('Pulsa para volar');
      };
      const flap = () => {
        if (dead) return;
        started = true;
        bird.vy = -345;
        flapImpulse = 1;
        puffs.push({ x: 215, y: bird.y + 4, life: 0.45 });
        setSubLabel('En vuelo');
        playArcadeSfx(520, 0.05, 'triangle', 0.06, mutedRef.current);
      };

      actionsRef.current = { left: flap, right: flap, up: flap, down: flap, primary: flap, reset };
      reset();

      let last = performance.now();
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (flapImpulse > 0) flapImpulse = Math.max(0, flapImpulse - dt * 5);
        for (let pi = puffs.length - 1; pi >= 0; pi -= 1) {
          puffs[pi].x -= 140 * dt; puffs[pi].life -= dt;
          if (puffs[pi].life <= 0) puffs.splice(pi, 1);
        }
        if (started && !dead) {
          scroll += 235 * dt;
          bird.vy += 980 * dt;
          bird.y += bird.vy * dt;
          planeTrail.forEach((pt) => { pt.x -= 235 * dt; });
          planeTrail.push({ x: 224, y: bird.y });
          if (planeTrail.length > 7) planeTrail.shift();
          spawnX += 235 * dt;
          if (spawnX >= 270) {
            spawnX = 0;
            const gapY = 130 + Math.random() * 200;
            pipes.push({ x: 980, gapY, gapH: 156, passed: false });
            if (Math.random() < 0.72) {
              coins.push({ x: 1014, y: gapY + (Math.random() - 0.5) * 44, collected: false });
            }
          }
          for (let ci = coins.length - 1; ci >= 0; ci -= 1) {
            const cn = coins[ci];
            cn.x -= 235 * dt;
            if (!cn.collected && Math.hypot(cn.x - 240, cn.y - bird.y) < 30) {
              cn.collected = true;
              curScore += 3;
              commitScore(curScore);
              pixiFxRef.current?.emitBurst(240 / 960, Math.max(0.1, Math.min(0.9, bird.y / 540)), 'coin', 14);
              playArcadeSfx(960, 0.07, 'triangle', 0.06, mutedRef.current);
            }
            if (cn.collected || cn.x < -50) coins.splice(ci, 1);
          }
          for (let i = pipes.length - 1; i >= 0; i -= 1) {
            const p = pipes[i];
            p.x -= 235 * dt;
            if (!p.passed && p.x + 68 < 240) {
              p.passed = true; curScore += 1; commitScore(curScore);
              pixiFxRef.current?.emitBurst(240 / 960, Math.max(0.1, Math.min(0.9, bird.y / 540)), 'coin', 10);
              playArcadeSfx(740, 0.06, 'sine', 0.06, mutedRef.current);
            }
            if (p.x + 64 > 224 && p.x + 6 < 258) {
              if (bird.y - 14 < p.gapY - p.gapH / 2 || bird.y + 14 > p.gapY + p.gapH / 2) dead = true;
            }
            if (p.x < -100) pipes.splice(i, 1);
          }
          if (bird.y > 474 || bird.y < 14) dead = true;
          if (dead) {
            setGameOver(true);
            pixiFxRef.current?.emitBurst(240 / 960, Math.max(0.1, Math.min(0.9, bird.y / 540)), 'explosion', 24);
            const medal = curScore >= 30 ? 'Platino' : curScore >= 15 ? 'Oro' : curScore >= 7 ? 'Plata' : 'Bronce';
            setGameOverMsg(`${curScore} puntos · Medalla ${medal}`);
            playArcadeSfx(135, 0.24, 'sawtooth', 0.09, mutedRef.current);
          }
        } else if (!started) {
          scroll += 90 * dt;
          bird.y = 240 + Math.sin(now * 0.005) * 14;
        }

        const sky = ctx.createLinearGradient(0, 0, 0, 490);
        sky.addColorStop(0, '#0284C7'); sky.addColorStop(0.55, '#38BDF8'); sky.addColorStop(1, '#BAE6FD');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 490);
        drawArcadeTiledBg(ctx, 'assets/games/tappy/background.png', 960, 480, -scroll * 0.35, 0);
        drawProceduralNebulaBackdrop(ctx, 960, 490, now * 0.001, 'sky');

        // Distant parallax scenic hills silhouette
        ctx.save();
        ctx.fillStyle = 'rgba(14, 116, 144, 0.26)';
        ctx.beginPath();
        ctx.moveTo(0, 490);
        for (let hx = 0; hx <= 960; hx += 48) {
          const hy = 380 + Math.sin((hx + scroll * 0.22) * 0.008) * 34 + Math.cos((hx + scroll * 0.22) * 0.015) * 18;
          ctx.lineTo(hx, hy);
        }
        ctx.lineTo(960, 490);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        for (let ci = 0; ci < 3; ci += 1) {
          const cxCloud = ((960 - ((scroll * (0.18 + ci * 0.06) + ci * 340) % 1120)) + 1120) % 1120 - 80;
          const cyCloud = 68 + ci * 52;
          drawArcadeSprite(ctx, 'assets/games/tappy/puffLarge.png', cxCloud, cyCloud, 92 - ci * 10, 56 - ci * 6, 0, 0.55);
        }

        pipes.forEach((pp) => {
          const topH = pp.gapY - pp.gapH / 2;
          const botY = pp.gapY + pp.gapH / 2;
          if (topH > 0) {
            const hTop = Math.max(239, topH);
            if (!drawArcadeSpriteRect(ctx, 'assets/games/tappy/rockGrassDown.png', pp.x - 10, topH - hTop, 88, hTop)) {
              ctx.fillStyle = '#22C55E'; ctx.fillRect(pp.x, 0, 68, topH);
            }
          }
          const hBot = Math.max(239, 495 - botY);
          if (!drawArcadeSpriteRect(ctx, 'assets/games/tappy/rockGrass.png', pp.x - 10, botY, 88, hBot)) {
            ctx.fillStyle = '#22C55E'; ctx.fillRect(pp.x, botY, 68, 490 - botY);
          }
        });

        // Spinning collectible bonus coins
        coins.forEach((cn) => {
          const spinW = Math.max(4, Math.abs(Math.cos(now * 0.006)) * 14);
          drawDynamicPointLight(ctx, cn.x, cn.y, 26, '250, 204, 21', 0.45);
          ctx.fillStyle = '#FACC15';
          ctx.strokeStyle = '#92400E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(cn.x, cn.y, spinW, 14, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        puffs.forEach((pf) => {
          drawArcadeSprite(ctx, 'assets/games/tappy/puffLarge.png', pf.x, pf.y, 26, 22, 0, pf.life * 1.6);
        });

        ctx.save();
        ctx.beginPath(); ctx.rect(0, 470, 960, 70); ctx.clip();
        if (!drawArcadeTiledBg(ctx, 'assets/games/tappy/groundGrass.png', 960, 540, -scroll, 470)) {
          ctx.restore();
          ctx.fillStyle = '#15803D'; ctx.fillRect(0, 490, 960, 10);
          ctx.fillStyle = '#D97706'; ctx.fillRect(0, 500, 960, 40);
        } else {
          ctx.restore();
        }

        if (planeTrail.length >= 2) {
          drawMotionSmearTrail(ctx, planeTrail, 5, '255, 255, 255', 0.35);
        }
        const planeFrames = ['assets/games/tappy/planeYellow1.png', 'assets/games/tappy/planeYellow2.png', 'assets/games/tappy/planeYellow3.png'] as const;
        const frameIdx = Math.floor(now / 75) % 3;
        const rot = Math.max(-0.45, Math.min(0.95, bird.vy * 0.0018));
        const planeSq = computeSquashStretch(flapImpulse, bird.vy, 0.28);
        ctx.save();
        ctx.translate(240, bird.y);
        ctx.rotate(rot);
        ctx.scale(planeSq.scaleX, planeSq.scaleY);
        if (!drawArcadeSprite(ctx, planeFrames[frameIdx], 0, 0, 52, 43, 0)) {
          ctx.fillStyle = '#FACC15';
          ctx.beginPath(); ctx.ellipse(0, 0, 19, 15, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameOver]);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="game-touch-surface w-full max-w-4xl mx-auto space-y-3 select-none"
    >
      <div className="rounded-2xl bg-[#0d1220] border border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs font-bold text-zinc-300 tabular-nums">
          <span className="text-sm font-black text-white">
            {gameId === 'bomberman' ? `${score} victorias` : `${score} pts`}
          </span>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <span className="text-cyan-300">{subLabel}</span>
          {controllers.length > 0 && (
            <>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="text-emerald-300">Móvil QR activo</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-amber-300 flex items-center gap-1 tabular-nums">
            <Trophy className="w-3.5 h-3.5" /> {bestScore}
          </span>
          {directGyro.supported && (
            <button
              type="button"
              onClick={() => void directGyro.toggle()}
              className={`min-h-9 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                directGyro.active
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                  : 'bg-white/[0.06] hover:bg-white/[0.14] border-white/10 text-zinc-200'
              }`}
              title={pickLang(lang, { es: 'Activar giroscopio del móvil', ca: 'Activar giroscopi del mòbil', en: 'Toggle phone gyroscope' })}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{directGyro.active ? 'Gyro ON' : 'Giroscopio'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); setShowQrModal(true); }}
            className="min-h-9 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-xs font-bold text-cyan-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Mando QR</span>
          </button>
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
            aria-label={pickLang(lang, { es: 'Silenciar', ca: 'Silenciar', en: 'Mute' })}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            {localMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); actionsRef.current.reset(); }}
            aria-label={pickLang(lang, { es: 'Reiniciar', ca: 'Reiniciar', en: 'Restart' })}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#050812] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if (gameId === 'flappy') {
              e.preventDefault();
              actionsRef.current.primary();
            }
          }}
          className="game-touch-btn w-full h-auto block cursor-pointer"
        />
        <CrtOverlayLayer enabled={crtEnabled} />
        <PixiGameFxLayer ref={pixiFxRef} />
        {gameOver && (
          <div className="absolute inset-0 bg-[#050812]/90 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Trophy className="w-11 h-11 text-amber-400" />
            <h3 className="text-2xl font-black text-white">
              {pickLang(lang, { es: 'Partida finalizada', ca: 'Partida finalitzada', en: 'Match Ended' })}
            </h3>
            <p className="text-sm text-zinc-300 tabular-nums">{gameOverMsg}</p>
            <button
              type="button"
              onClick={() => { triggerHaptic('medium'); actionsRef.current.reset(); }}
              className="min-h-11 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white whitespace-nowrap cursor-pointer"
            >
              {pickLang(lang, { es: 'Jugar otra vez', ca: 'Jugar altra vegada', en: 'Play Again' })}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {gameId === 'flappy' ? (
          <button
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              triggerHaptic('light');
              actionsRef.current.primary();
            }}
            className="game-touch-btn min-h-11 px-8 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white whitespace-nowrap cursor-pointer"
          >
            {pickLang(lang, { es: 'Aletear (Toca, Agita o Espacio)', ca: 'Aletejar (Toca, Agita o Espai)', en: 'Flap (Tap, Shake or Space)' })}
          </button>
        ) : (
          <>
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                triggerHaptic('light');
                actionsRef.current.left();
              }}
              className="game-touch-btn min-h-11 min-w-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer"
              aria-label="Izquierda"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                triggerHaptic('light');
                actionsRef.current.up();
              }}
              className="game-touch-btn min-h-11 min-w-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer"
              aria-label="Arriba"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                triggerHaptic('light');
                actionsRef.current.down();
              }}
              className="game-touch-btn min-h-11 min-w-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer"
              aria-label="Abajo"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
            <button
              type="button"
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                triggerHaptic('light');
                actionsRef.current.right();
              }}
              className="game-touch-btn min-h-11 min-w-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white flex items-center justify-center cursor-pointer"
              aria-label="Derecha"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            {gameId === 'bomberman' && (
              <button
                type="button"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.preventDefault();
                  triggerHaptic('medium');
                  actionsRef.current.primary();
                }}
                className="game-touch-btn min-h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Bomb className="w-4 h-4" /> Poner Bomba
              </button>
            )}
          </>
        )}
      </div>

      {showQrModal && (
        <DualGyroQrPanel
          roomId={effectiveRoomId}
          gameId={gameId}
          title={
            gameId === 'pacman'
              ? 'Pac-Man Arcade HD · Control Gyro'
              : gameId === 'bomberman'
              ? 'Bomberman Party · Control Gyro'
              : 'Clumsy Bird · Control Gyro'
          }
          controllers={controllers}
          onClose={() => setShowQrModal(false)}
        />
      )}
    </div>
  );
};
