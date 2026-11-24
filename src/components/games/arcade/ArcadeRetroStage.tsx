import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Crosshair,
  Flame,
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

const BRICK_SPRITES = [
  'assets/games/puzzle/element_red_rectangle_glossy.png',
  'assets/games/puzzle/element_yellow_rectangle_glossy.png',
  'assets/games/puzzle/element_green_rectangle_glossy.png',
  'assets/games/puzzle/element_blue_rectangle_glossy.png',
  'assets/games/puzzle/element_purple_rectangle_glossy.png',
  'assets/games/puzzle/element_grey_rectangle_glossy.png',
] as const;

const RETRO_SPRITE_LIST = [
  ...BRICK_SPRITES,
  ...EXPLOSION_FRAMES,
  'assets/games/puzzle/paddleBlu.png',
  'assets/games/puzzle/paddleRed.png',
  'assets/games/puzzle/ballBlue.png',
  'assets/games/space/pill_blue.png',
  'assets/games/space/pill_green.png',
  'assets/games/space/pill_red.png',
  'assets/games/space/darkPurple.png',
  'assets/games/space/blue.png',
  'assets/games/space/playerShip1_blue.png',
  'assets/games/space/playerShip3_red.png',
  'assets/games/space/enemyRed3.png',
  'assets/games/space/enemyGreen2.png',
  'assets/games/space/enemyBlue1.png',
  'assets/games/space/ufoRed.png',
  'assets/games/space/laserBlue01.png',
  'assets/games/space/laserRed01.png',
  'assets/games/space/meteorGrey_big1.png',
  'assets/games/space/fire00.png',
  'assets/games/space/fire01.png',
  'assets/games/space/powerupBlue_bolt.png',
  'assets/games/space/powerupBlue_shield.png',
] as const;

export type RetroArcadeId = 'arkanoid' | 'invaders' | 'hexgl';

interface ArcadeRetroStageProps {
  gameId: RetroArcadeId;
  lang: AppLanguage;
  roomId?: string;
  userName?: string;
  mutedOverride?: boolean;
}

export const ArcadeRetroStage: React.FC<ArcadeRetroStageProps> = ({
  gameId,
  lang,
  roomId = '',
  userName = 'Jugador',
  mutedOverride = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const ctrlRef = useRef<{
    dir: number;
    boost: boolean;
    fire: () => void;
    pointerX: (nx: number) => void;
    reset: () => void;
  }>({
    dir: 0,
    boost: false,
    fire: () => {},
    pointerX: () => {},
    reset: () => {},
  });

  const directGyro = useDirectDeviceGyro({
    maxDeg: 26,
    pitchMaxDeg: 22,
    onSwing: () => {
      if (gameId !== 'hexgl') ctrlRef.current.fire();
    },
  });

  useEffect(() => {
    const alreadyConnected = socketService.isConnected() && socketService.getActiveRoomId();
    if (!alreadyConnected) {
      socketService.connect(
        effectiveRoomId,
        {
          id: `tv-retro-${effectiveRoomId}`,
          name: `${userName || 'Jugador'} (${gameId})`,
          avatar: '🕹️',
          color: '#38bdf8',
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
    preloadArcadeSprites(RETRO_SPRITE_LIST);
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
    const booms: Array<{ x: number; y: number; size: number; t: number }> = [];
    const spawnBoom = (x: number, y: number, size = 56) => booms.push({ x, y, size, t: 0 });
    const stepAndDrawBooms = (dt: number) => {
      for (let i = booms.length - 1; i >= 0; i -= 1) {
        const bm = booms[i];
        bm.t += dt * 22;
        const idx = Math.floor(bm.t);
        if (idx >= EXPLOSION_FRAMES.length) {
          booms.splice(i, 1);
          continue;
        }
        drawArcadeSprite(ctx, EXPLOSION_FRAMES[idx], bm.x, bm.y, bm.size * 1.4, bm.size * 0.72);
      }
    };

    // ---------------------------------------------------------------
    // ENGINE 1: ARKANOID NEON (BRICKIT)
    // ---------------------------------------------------------------
    if (gameId === 'arkanoid') {
      const COLS = ['#F43F5E', '#FACC15', '#22C55E', '#38BDF8', '#A855F7', '#94A3B8'];
      let padX = 480;
      let padW = 132;
      let laserTimer = 0;
      let balls: Array<{ x: number; y: number; vx: number; vy: number }> = [];
      let bricks: Array<{ x: number; y: number; w: number; h: number; hp: number; col: string; spriteIdx: number }> = [];
      let caps: Array<{ x: number; y: number; kind: 'W' | 'M' | 'L' }> = [];
      let lasers: Array<{ x: number; y: number }> = [];
      let curScore = 0;
      let lives = 3;
      let level = 1;
      let dead = false;

      const buildLevel = (lv: number) => {
        bricks = [];
        const rows = Math.min(7, 4 + lv);
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < 11; c += 1) {
            if (lv % 2 === 0 && (r + c) % 4 === 0) continue;
            const spriteIdx = r === 0 && lv >= 2 ? 5 : r % 5;
            bricks.push({ x: 78 + c * 74, y: 58 + r * 28, w: 68, h: 24, hp: r === 0 && lv >= 2 ? 2 : 1, col: COLS[spriteIdx], spriteIdx });
          }
        }
        balls = [{ x: padX, y: 472, vx: 220 * (Math.random() < 0.5 ? 1 : -1), vy: -320 }];
        caps = [];
        lasers = [];
      };
      const reset = () => {
        curScore = 0; lives = 3; level = 1; padW = 132; laserTimer = 0; dead = false;
        setGameOver(false);
        buildLevel(1);
        commitScore(0);
        setSubLabel('Vidas 3 · Nivel 1');
      };

      ctrlRef.current = {
        dir: 0,
        boost: false,
        fire: () => {
          if (laserTimer > 0 && !dead) {
            lasers.push({ x: padX - padW / 2 + 12, y: 482 }, { x: padX + padW / 2 - 12, y: 482 });
            playArcadeSfx(860, 0.04, 'square', 0.04, mutedRef.current);
          }
        },
        pointerX: (nx: number) => { padX = Math.max(padW / 2 + 12, Math.min(948 - padW / 2, nx)); },
        reset,
      };
      reset();

      let last = performance.now();
      let prevFire = false;
      let prevReset = false;
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const ws = wsGyroRef.current;
        const wsActive = Date.now() < ws.expiresAt;
        const dg = directGyro.gyroRef.current;
        const gyroDir = wsActive && Math.abs(ws.steer) > 0.06
          ? ws.steer * 1.45
          : dg.active && Math.abs(dg.steer) > 0.06
          ? dg.steer * 1.55
          : 0;
        const wsFire = wsActive && (ws.nitro || ws.throttle > 0.5);
        if (wsFire && !prevFire) ctrlRef.current.fire();
        prevFire = wsFire;
        const wsReset = wsActive && ws.brake > 0.5;
        if (wsReset && !prevReset && dead) reset();
        prevReset = wsReset;
        const effectiveDir = Math.abs(ctrlRef.current.dir) > 0 ? ctrlRef.current.dir : gyroDir;
        if (!dead) {
          padX = Math.max(padW / 2 + 12, Math.min(948 - padW / 2, padX + effectiveDir * 560 * dt));
          if (laserTimer > 0) laserTimer = Math.max(0, laserTimer - dt);
          for (let li = lasers.length - 1; li >= 0; li -= 1) {
            lasers[li].y -= 620 * dt;
            if (lasers[li].y < 0) { lasers.splice(li, 1); continue; }
            for (let bi = bricks.length - 1; bi >= 0; bi -= 1) {
              const br = bricks[bi];
              if (lasers[li].x >= br.x && lasers[li].x <= br.x + br.w && lasers[li].y <= br.y + br.h && lasers[li].y >= br.y) {
                br.hp -= 1;
                curScore += 30;
                if (br.hp <= 0) {
                  spawnBoom(br.x + br.w / 2, br.y + br.h / 2, 46);
                  bricks.splice(bi, 1);
                }
                lasers.splice(li, 1);
                commitScore(curScore);
                break;
              }
            }
          }
          for (let ci = caps.length - 1; ci >= 0; ci -= 1) {
            caps[ci].y += 170 * dt;
            if (caps[ci].y >= 486 && caps[ci].y <= 512 && Math.abs(caps[ci].x - padX) < padW / 2 + 14) {
              const kind = caps[ci].kind;
              if (kind === 'W') padW = Math.min(208, padW + 46);
              else if (kind === 'M' && balls.length < 4) {
                const b0 = balls[0] || { x: padX, y: 470, vx: 180, vy: -320 };
                balls.push({ x: b0.x, y: b0.y, vx: -b0.vx, vy: b0.vy }, { x: b0.x, y: b0.y, vx: b0.vx * 0.6, vy: -Math.abs(b0.vy) });
              } else if (kind === 'L') laserTimer = 10;
              caps.splice(ci, 1);
            } else if (caps[ci].y > 540) caps.splice(ci, 1);
          }
          for (let k = balls.length - 1; k >= 0; k -= 1) {
            const bl = balls[k];
            bl.x += bl.vx * dt;
            bl.y += bl.vy * dt;
            if (bl.x < 12) { bl.x = 12; bl.vx = Math.abs(bl.vx); }
            if (bl.x > 948) { bl.x = 948; bl.vx = -Math.abs(bl.vx); }
            if (bl.y < 14) { bl.y = 14; bl.vy = Math.abs(bl.vy); }
            if (bl.vy > 0 && bl.y >= 484 && bl.y <= 504 && Math.abs(bl.x - padX) <= padW / 2 + 8) {
              const hit = (bl.x - padX) / (padW / 2);
              const spd = Math.min(540, Math.hypot(bl.vx, bl.vy) * 1.015);
              bl.vx = hit * spd * 0.85;
              bl.vy = -Math.sqrt(Math.max(14000, spd * spd - bl.vx * bl.vx));
              bl.y = 483;
              playArcadeSfx(440, 0.04, 'triangle', 0.05, mutedRef.current);
            }
            for (let j = bricks.length - 1; j >= 0; j -= 1) {
              const bk = bricks[j];
              if (bl.x + 8 >= bk.x && bl.x - 8 <= bk.x + bk.w && bl.y + 8 >= bk.y && bl.y - 8 <= bk.y + bk.h) {
                bl.vy = -bl.vy;
                bk.hp -= 1;
                curScore += 50;
                if (bk.hp <= 0) {
                  spawnBoom(bk.x + bk.w / 2, bk.y + bk.h / 2, 46);
                  bricks.splice(j, 1);
                  if (Math.random() < 0.22) caps.push({ x: bk.x + bk.w / 2, y: bk.y + 10, kind: (['W', 'M', 'L'] as const)[Math.floor(Math.random() * 3)] });
                }
                commitScore(curScore);
                playArcadeSfx(580, 0.04, 'square', 0.04, mutedRef.current);
                break;
              }
            }
            if (bl.y > 550) balls.splice(k, 1);
          }
          if (balls.length === 0) {
            lives -= 1;
            padW = 132;
            laserTimer = 0;
            setSubLabel(`Vidas ${lives} · Nivel ${level}`);
            if (lives <= 0) {
              dead = true;
              setGameOver(true);
              setGameOverMsg(`${curScore} puntos · Nivel ${level}`);
            } else {
              balls = [{ x: padX, y: 470, vx: 210, vy: -320 }];
            }
          } else if (bricks.length === 0) {
            level += 1;
            curScore += 500;
            commitScore(curScore);
            setSubLabel(`Vidas ${lives} · Nivel ${level}`);
            buildLevel(level);
          }
        }
        ctx.fillStyle = '#060914';
        ctx.fillRect(0, 0, 960, 540);
        ctx.save();
        ctx.globalAlpha = 0.25;
        drawArcadeTiledBg(ctx, 'assets/games/space/blue.png', 960, 540, 0, now * 0.015);
        ctx.restore();

        bricks.forEach((b) => {
          if (!drawArcadeSpriteRect(ctx, BRICK_SPRITES[b.spriteIdx] || BRICK_SPRITES[0], b.x, b.y, b.w, b.h)) {
            ctx.fillStyle = b.col;
            ctx.fillRect(b.x, b.y, b.w, b.h);
          }
          if (b.hp > 1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth = 2;
            ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
          }
        });
        caps.forEach((cp) => {
          const pill = cp.kind === 'M' ? 'assets/games/space/pill_green.png' : cp.kind === 'L' ? 'assets/games/space/pill_red.png' : 'assets/games/space/pill_blue.png';
          if (!drawArcadeSprite(ctx, pill, cp.x, cp.y, 28, 22)) {
            ctx.fillStyle = cp.kind === 'M' ? '#22C55E' : cp.kind === 'L' ? '#F43F5E' : '#38BDF8';
            ctx.fillRect(cp.x - 16, cp.y - 9, 32, 18);
          }
          ctx.fillStyle = '#FFF';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(cp.kind, cp.x, cp.y + 4);
        });
        lasers.forEach((l) => {
          if (!drawArcadeSprite(ctx, 'assets/games/space/laserRed01.png', l.x, l.y, 8, 24)) {
            ctx.fillStyle = '#F43F5E';
            ctx.fillRect(l.x - 2, l.y - 12, 4, 16);
          }
        });
        const padSprite = laserTimer > 0 ? 'assets/games/puzzle/paddleRed.png' : 'assets/games/puzzle/paddleBlu.png';
        if (!drawArcadeSpriteRect(ctx, padSprite, padX - padW / 2, 486, padW, 22)) {
          ctx.fillStyle = laserTimer > 0 ? '#F43F5E' : '#7C3AED';
          ctx.fillRect(padX - padW / 2, 490, padW, 16);
        }
        balls.forEach((b) => {
          if (!drawArcadeSprite(ctx, 'assets/games/puzzle/ballBlue.png', b.x, b.y, 18, 18)) {
            ctx.fillStyle = '#FDE047';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        stepAndDrawBooms(dt);
        rafId = window.requestAnimationFrame(loop);
      };
      rafId = window.requestAnimationFrame(loop);
    }

    // ---------------------------------------------------------------
    // ENGINE 2: SPACE INVADERS RETRO
    // ---------------------------------------------------------------
    else if (gameId === 'invaders') {
      let px = 480;
      let pBullets: Array<{ x: number; y: number }> = [];
      let aBullets: Array<{ x: number; y: number }> = [];
      let aliens: Array<{ x: number; y: number; alive: boolean; col: string; pts: number; row: number }> = [];
      let bunkers: Array<{ x: number; y: number; alive: boolean }> = [];
      let ufo = { active: false, x: 0, vx: 180, timer: 9 };
      let aDir = 1;
      let aCd = 0;
      let shootCd = 0;
      let wave = 1;
      let curScore = 0;
      let lives = 3;
      let dead = false;

      const buildWave = () => {
        const cols = ['#F43F5E', '#A855F7', '#A855F7', '#22D3EE', '#22D3EE'];
        const pts = [30, 20, 20, 10, 10];
        aliens = [];
        for (let r = 0; r < 5; r += 1) {
          for (let c = 0; c < 11; c += 1) {
            aliens.push({ x: 150 + c * 58, y: 74 + r * 42, alive: true, col: cols[r], pts: pts[r], row: r });
          }
        }
        bunkers = [];
        for (let b = 0; b < 4; b += 1) {
          for (let br = 0; br < 4; br += 1) {
            for (let bc = 0; bc < 6; bc += 1) bunkers.push({ x: 155 + b * 200 + bc * 12, y: 400 + br * 10, alive: true });
          }
        }
        aDir = 1; pBullets = []; aBullets = [];
      };
      const reset = () => {
        curScore = 0; lives = 3; wave = 1; px = 480; dead = false;
        ufo = { active: false, x: 0, vx: 180, timer: 8 };
        setGameOver(false);
        buildWave();
        commitScore(0);
        setSubLabel('Vidas 3 · Oleada 1');
      };

      ctrlRef.current = {
        dir: 0,
        boost: false,
        fire: () => {
          if (dead || shootCd > 0) return;
          pBullets.push({ x: px, y: 472 });
          shootCd = 0.24;
          playArcadeSfx(680, 0.05, 'square', 0.04, mutedRef.current);
        },
        pointerX: (nx: number) => { px = Math.max(46, Math.min(914, nx)); },
        reset,
      };
      reset();

      let last = performance.now();
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (shootCd > 0) shootCd -= dt;
        const ws = wsGyroRef.current;
        const wsActive = Date.now() < ws.expiresAt;
        const dg = directGyro.gyroRef.current;
        const gyroDir = wsActive && Math.abs(ws.steer) > 0.06
          ? ws.steer * 1.35
          : dg.active && Math.abs(dg.steer) > 0.06
          ? dg.steer * 1.45
          : 0;
        const effectiveDir = Math.abs(ctrlRef.current.dir) > 0 ? ctrlRef.current.dir : gyroDir;
        if (wsActive && (ws.nitro || ws.throttle > 0.5) && !dead) {
          ctrlRef.current.fire();
        }
        if (!dead) {
          px = Math.max(46, Math.min(914, px + effectiveDir * 440 * dt));
          if (!ufo.active) {
            ufo.timer -= dt;
            if (ufo.timer <= 0) { ufo.active = true; ufo.x = Math.random() < 0.5 ? -40 : 1000; ufo.vx = ufo.x < 0 ? 190 : -190; }
          } else {
            ufo.x += ufo.vx * dt;
            if (ufo.x < -80 || ufo.x > 1040) { ufo.active = false; ufo.timer = 11; }
          }
          for (let i = pBullets.length - 1; i >= 0; i -= 1) {
            const pb = pBullets[i]; pb.y -= 580 * dt;
            if (pb.y < 0) { pBullets.splice(i, 1); continue; }
            if (ufo.active && Math.abs(pb.x - ufo.x) < 28 && pb.y < 54) {
              spawnBoom(ufo.x, 34, 72);
              ufo.active = false; ufo.timer = 12; curScore += 150; commitScore(curScore);
              pBullets.splice(i, 1); playArcadeSfx(880, 0.12, 'triangle', 0.08, mutedRef.current); continue;
            }
            let hit = false;
            for (const bk of bunkers) {
              if (bk.alive && pb.x >= bk.x && pb.x <= bk.x + 12 && pb.y >= bk.y && pb.y <= bk.y + 10) {
                bk.alive = false; hit = true; break;
              }
            }
            if (!hit) {
              for (const al of aliens) {
                if (al.alive && Math.abs(pb.x - al.x) < 20 && Math.abs(pb.y - al.y) < 16) {
                  al.alive = false; curScore += al.pts; commitScore(curScore); hit = true;
                  spawnBoom(al.x, al.y, 44);
                  break;
                }
              }
            }
            if (hit) pBullets.splice(i, 1);
          }
          const aliveAl = aliens.filter((a) => a.alive);
          if (!aliveAl.length) {
            wave += 1; curScore += 300; commitScore(curScore);
            setSubLabel(`Vidas ${lives} · Oleada ${wave}`);
            buildWave();
          } else {
            aCd -= dt;
            if (aCd <= 0) {
              aCd = Math.max(0.08, 0.55 * (aliveAl.length / 55) - (wave - 1) * 0.03);
              const edge = aliveAl.some((a) => a.x + aDir * 14 < 46 || a.x + aDir * 14 > 914);
              if (edge) {
                aDir = -aDir;
                aliveAl.forEach((a) => {
                  a.y += 20;
                  if (a.y >= 460) { dead = true; setGameOver(true); setGameOverMsg(`${curScore} puntos`); }
                });
              } else {
                aliveAl.forEach((a) => { a.x += aDir * 14; });
              }
              if (Math.random() < 0.42 && aBullets.length < 4 + wave) {
                const s = aliveAl[Math.floor(Math.random() * aliveAl.length)];
                aBullets.push({ x: s.x, y: s.y + 14 });
              }
            }
          }
          for (let j = aBullets.length - 1; j >= 0; j -= 1) {
            const ab = aBullets[j]; ab.y += 280 * dt;
            if (ab.y > 530) { aBullets.splice(j, 1); continue; }
            const bh = bunkers.find((bk) => bk.alive && ab.x >= bk.x && ab.x <= bk.x + 12 && ab.y >= bk.y && ab.y <= bk.y + 10);
            if (bh) { bh.alive = false; aBullets.splice(j, 1); continue; }
            if (Math.abs(ab.x - px) < 24 && Math.abs(ab.y - 492) < 16) {
              aBullets.splice(j, 1); lives -= 1;
              spawnBoom(px, 490, 68);
              setSubLabel(`Vidas ${lives} · Oleada ${wave}`);
              playArcadeSfx(120, 0.2, 'sawtooth', 0.09, mutedRef.current);
              if (lives <= 0) { dead = true; setGameOver(true); setGameOverMsg(`${curScore} puntos · Oleada ${wave}`); }
            }
          }
        }
        ctx.fillStyle = '#04060d';
        ctx.fillRect(0, 0, 960, 540);
        drawArcadeTiledBg(ctx, 'assets/games/space/darkPurple.png', 960, 540, 0, now * 0.025);

        if (ufo.active && !drawArcadeSprite(ctx, 'assets/games/space/ufoRed.png', ufo.x, 34, 46, 46, Math.sin(now * 0.005) * 0.15)) {
          ctx.fillStyle = '#EF4444'; ctx.fillRect(ufo.x - 24, 24, 48, 16);
        }
        const bob = Math.sin(now * 0.006) * 2.5;
        aliens.forEach((al) => {
          if (!al.alive) return;
          const spr = al.row === 0 ? 'assets/games/space/enemyRed3.png' : al.row <= 2 ? 'assets/games/space/enemyGreen2.png' : 'assets/games/space/enemyBlue1.png';
          if (!drawArcadeSprite(ctx, spr, al.x, al.y + (al.row % 2 ? bob : -bob), 34, 28)) {
            ctx.fillStyle = al.col;
            ctx.fillRect(al.x - 15, al.y - 10, 30, 18);
          }
        });
        ctx.fillStyle = '#22C55E';
        bunkers.forEach((bk) => { if (bk.alive) ctx.fillRect(bk.x, bk.y, 11, 9); });
        drawArcadeSprite(ctx, 'assets/games/space/fire00.png', px, 514, 12, 18 + Math.random() * 6);
        if (!drawArcadeSprite(ctx, 'assets/games/space/playerShip1_blue.png', px, 492, 52, 40)) {
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(px - 24, 488, 48, 16); ctx.fillRect(px - 6, 476, 12, 14);
        }
        pBullets.forEach((b) => {
          if (!drawArcadeSprite(ctx, 'assets/games/space/laserBlue01.png', b.x, b.y, 7, 22)) {
            ctx.fillStyle = '#FACC15'; ctx.fillRect(b.x - 2, b.y - 10, 4, 14);
          }
        });
        aBullets.forEach((b) => {
          if (!drawArcadeSprite(ctx, 'assets/games/space/laserRed01.png', b.x, b.y, 7, 22)) {
            ctx.fillStyle = '#FB7185'; ctx.fillRect(b.x - 2, b.y, 5, 13);
          }
        });
        stepAndDrawBooms(dt);
        rafId = window.requestAnimationFrame(loop);
      };
      rafId = window.requestAnimationFrame(loop);
    }

    // ---------------------------------------------------------------
    // ENGINE 3: HEXGL HOVER 3D
    // ---------------------------------------------------------------
    else {
      let shipX = 0;
      let speed = 540;
      let shield = 100;
      let dist = 0;
      let trackZ = 0;
      let spawnZ = 0;
      let entities: Array<{ lane: number; z: number; kind: 'pad' | 'heal' | 'wall'; hit: boolean }> = [];
      let dead = false;

      const reset = () => {
        shipX = 0; speed = 540; shield = 100; dist = 0; trackZ = 0; spawnZ = 0; entities = []; dead = false;
        setGameOver(false);
        commitScore(0);
        setSubLabel('Escudo 100% · 540 km/h');
      };

      ctrlRef.current = {
        dir: 0,
        boost: false,
        fire: () => { ctrlRef.current.boost = !ctrlRef.current.boost; },
        pointerX: (nx: number) => { shipX = Math.max(-1.05, Math.min(1.05, (nx - 480) / 260)); },
        reset,
      };
      reset();

      let last = performance.now();
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const ws = wsGyroRef.current;
        const wsActive = Date.now() < ws.expiresAt;
        const dg = directGyro.gyroRef.current;
        const gyroDir = wsActive && Math.abs(ws.steer) > 0.05
          ? ws.steer * 1.35
          : dg.active && Math.abs(dg.steer) > 0.05
          ? dg.steer * 1.45
          : 0;
        const effectiveDir = Math.abs(ctrlRef.current.dir) > 0 ? ctrlRef.current.dir : gyroDir;
        const isBoost =
          ctrlRef.current.boost ||
          (wsActive && (ws.nitro || ws.throttle > 0.5)) ||
          (dg.active && dg.pitch > 0.35);
        const isBrake = (wsActive && ws.brake > 0.5) || (dg.active && dg.pitch < -0.38);
        if (!dead) {
          const targetSpd = isBoost ? 980 : isBrake ? 380 : 640 + Math.min(260, dist * 0.04);
          speed += (targetSpd - speed) * Math.min(1, dt * 4);
          shipX = Math.max(-1.05, Math.min(1.05, shipX + effectiveDir * dt * 1.95));
          const dz = speed * dt;
          trackZ += dz;
          dist += Math.round(dz * 0.14);
          spawnZ += dz;
          if (spawnZ > 240) {
            spawnZ = 0;
            const r = Math.random();
            entities.push({ lane: (Math.random() - 0.5) * 1.65, z: 1000, kind: r < 0.28 ? 'pad' : r < 0.42 ? 'heal' : 'wall', hit: false });
          }
          for (let i = entities.length - 1; i >= 0; i -= 1) {
            const ent = entities[i];
            ent.z -= dz * 1.35;
            if (ent.z <= 85 && ent.z >= 10 && !ent.hit && Math.abs(ent.lane - shipX) < 0.34) {
              ent.hit = true;
              if (ent.kind === 'pad') { speed = 1120; dist += 50; playArcadeSfx(820, 0.1, 'triangle', 0.07, mutedRef.current); }
              else if (ent.kind === 'heal') { shield = Math.min(100, shield + 25); playArcadeSfx(640, 0.1, 'sine', 0.07, mutedRef.current); }
              else {
                shield = Math.max(0, shield - 34);
                speed = 340;
                spawnBoom(480 + shipX * 260, 448, 86);
                playArcadeSfx(120, 0.2, 'sawtooth', 0.09, mutedRef.current);
                if (shield <= 0) {
                  dead = true;
                  setGameOver(true);
                  setGameOverMsg(`${dist} metros`);
                }
              }
            }
            if (ent.z < -20) entities.splice(i, 1);
          }
          commitScore(dist);
          setSubLabel(`Escudo ${Math.round(shield)}% · ${Math.round(speed)} km/h`);
        }

        const sky = ctx.createLinearGradient(0, 0, 0, 260);
        sky.addColorStop(0, '#040212');
        sky.addColorStop(1, '#26104E');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, 960, 260);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, 960, 260); ctx.clip();
        drawArcadeTiledBg(ctx, 'assets/games/space/darkPurple.png', 960, 260, -shipX * 60, now * 0.02);
        ctx.restore();

        ctx.fillStyle = '#070918';
        ctx.fillRect(0, 260, 960, 280);
        const hx = 480 - shipX * 90;
        ctx.fillStyle = '#131632';
        ctx.beginPath();
        ctx.moveTo(hx - 44, 260); ctx.lineTo(hx + 44, 260); ctx.lineTo(940, 540); ctx.lineTo(20, 540);
        ctx.closePath(); ctx.fill();
        for (let g = 0; g < 12; g += 1) {
          const pz = ((g * 85 - (trackZ % 85) + 85) % 1020) / 1020;
          const pY = 260 + Math.pow(pz, 1.7) * 280;
          const hw = 44 + (pY - 260) * 1.48;
          ctx.strokeStyle = `rgba(56,189,248,${0.14 + pz * 0.4})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(hx - hw, pY); ctx.lineTo(hx + hw, pY); ctx.stroke();
        }
        entities.sort((a, b) => b.z - a.z).forEach((e2) => {
          if (e2.z <= 0) return;
          const frac = 1 - e2.z / 1000;
          const ey = 260 + Math.pow(frac, 1.7) * 280;
          const hw = 44 + (ey - 260) * 1.48;
          const ex = hx + e2.lane * hw * 0.78;
          const sc = 0.18 + frac * 1.05;
          if (e2.kind === 'pad') {
            if (!drawArcadeSprite(ctx, 'assets/games/space/powerupBlue_bolt.png', ex, ey - 16 * sc, 34 * sc, 34 * sc)) {
              ctx.fillStyle = '#22D3EE'; ctx.fillRect(ex - 28 * sc, ey - 8 * sc, 56 * sc, 12 * sc);
            }
          } else if (e2.kind === 'heal') {
            if (!drawArcadeSprite(ctx, 'assets/games/space/powerupBlue_shield.png', ex, ey - 18 * sc, 34 * sc, 34 * sc)) {
              ctx.fillStyle = '#22C55E'; ctx.beginPath(); ctx.arc(ex, ey - 18 * sc, 16 * sc, 0, Math.PI * 2); ctx.fill();
            }
          } else if (!drawArcadeSprite(ctx, 'assets/games/space/meteorGrey_big1.png', ex, ey - 24 * sc, 60 * sc, 50 * sc, now * 0.003)) {
            ctx.fillStyle = '#F43F5E'; ctx.fillRect(ex - 26 * sc, ey - 46 * sc, 52 * sc, 46 * sc);
          }
        });
        ctx.save();
        ctx.translate(480 + shipX * 260, 468);
        ctx.rotate(ctrlRef.current.dir * 0.24);
        drawArcadeSprite(ctx, ctrlRef.current.boost ? 'assets/games/space/fire01.png' : 'assets/games/space/fire00.png', -14, 28, 12, ctrlRef.current.boost ? 28 : 18, Math.PI);
        drawArcadeSprite(ctx, ctrlRef.current.boost ? 'assets/games/space/fire01.png' : 'assets/games/space/fire00.png', 14, 28, 12, ctrlRef.current.boost ? 28 : 18, Math.PI);
        if (!drawArcadeSprite(ctx, 'assets/games/space/playerShip3_red.png', 0, 0, 82, 62)) {
          ctx.fillStyle = '#22D3EE';
          ctx.beginPath();
          ctx.moveTo(0, -34); ctx.lineTo(42, 22); ctx.lineTo(14, 14); ctx.lineTo(0, 26); ctx.lineTo(-14, 14); ctx.lineTo(-42, 22);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        stepAndDrawBooms(dt);
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
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') ctrlRef.current.dir = -1;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') ctrlRef.current.dir = 1;
      else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (gameOver) ctrlRef.current.reset();
        else if (gameId === 'hexgl') ctrlRef.current.boost = true;
        else ctrlRef.current.fire();
      } else if (e.code === 'KeyR') {
        ctrlRef.current.reset();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && ctrlRef.current.dir < 0) ctrlRef.current.dir = 0;
      if ((e.code === 'ArrowRight' || e.code === 'KeyD') && ctrlRef.current.dir > 0) ctrlRef.current.dir = 0;
      if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space' || e.code === 'Enter') {
        if (gameId === 'hexgl') ctrlRef.current.boost = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gameId, gameOver]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    ctrlRef.current.pointerX(((e.clientX - rect.left) / rect.width) * 960);
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="game-touch-surface w-full max-w-4xl mx-auto space-y-3 select-none"
    >
      <div className="rounded-2xl bg-[#0d1220] border border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs font-bold text-zinc-300 tabular-nums">
          <span className="text-sm font-black text-white">
            {gameId === 'hexgl' ? `${score} m` : `${score} pts`}
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
            <Trophy className="w-3.5 h-3.5" /> {bestScore}{gameId === 'hexgl' ? ' m' : ''}
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
            onClick={() => setLocalMuted((m) => !m)}
            aria-label={pickLang(lang, { es: 'Silenciar', ca: 'Silenciar', en: 'Mute' })}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center cursor-pointer"
          >
            {localMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); ctrlRef.current.reset(); }}
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
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerMove}
          className="game-touch-btn w-full h-auto block touch-none cursor-crosshair"
        />
        {gameOver && (
          <div className="absolute inset-0 bg-[#050812]/90 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Trophy className="w-11 h-11 text-amber-400" />
            <h3 className="text-2xl font-black text-white">
              {pickLang(lang, { es: 'Partida terminada', ca: 'Partida acabada', en: 'Game Over' })}
            </h3>
            <p className="text-sm text-zinc-300 tabular-nums">{gameOverMsg}</p>
            <button
              type="button"
              onClick={() => { triggerHaptic('medium'); ctrlRef.current.reset(); }}
              className="min-h-11 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white whitespace-nowrap cursor-pointer"
            >
              {pickLang(lang, { es: 'Jugar otra vez', ca: 'Jugar altra vegada', en: 'Play Again' })}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            ctrlRef.current.dir = -1;
          }}
          onPointerUp={() => { if (ctrlRef.current.dir < 0) ctrlRef.current.dir = 0; }}
          onPointerCancel={() => { if (ctrlRef.current.dir < 0) ctrlRef.current.dir = 0; }}
          onLostPointerCapture={() => { if (ctrlRef.current.dir < 0) ctrlRef.current.dir = 0; }}
          className="game-touch-btn min-h-11 px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Izquierda
        </button>
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            triggerHaptic('light');
            if (gameId === 'hexgl') ctrlRef.current.boost = true;
            else ctrlRef.current.fire();
          }}
          onPointerUp={() => { if (gameId === 'hexgl') ctrlRef.current.boost = false; }}
          onPointerCancel={() => { if (gameId === 'hexgl') ctrlRef.current.boost = false; }}
          onLostPointerCapture={() => { if (gameId === 'hexgl') ctrlRef.current.boost = false; }}
          className="game-touch-btn min-h-11 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          {gameId === 'hexgl' ? <><Flame className="w-4 h-4" /> Turbo</> : <><Crosshair className="w-4 h-4" /> Disparar</>}
        </button>
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            ctrlRef.current.dir = 1;
          }}
          onPointerUp={() => { if (ctrlRef.current.dir > 0) ctrlRef.current.dir = 0; }}
          onPointerCancel={() => { if (ctrlRef.current.dir > 0) ctrlRef.current.dir = 0; }}
          onLostPointerCapture={() => { if (ctrlRef.current.dir > 0) ctrlRef.current.dir = 0; }}
          className="game-touch-btn min-h-11 px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer"
        >
          Derecha <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {showQrModal && (
        <DualGyroQrPanel
          roomId={effectiveRoomId}
          gameId={gameId}
          title={
            gameId === 'hexgl'
              ? 'HexGL Hover 3D · Volante Gyro'
              : gameId === 'arkanoid'
              ? 'BrickIt Arkanoid · Control Gyro'
              : 'Space Invaders · Control Gyro'
          }
          controllers={controllers}
          onClose={() => setShowQrModal(false)}
        />
      )}
    </div>
  );
};
