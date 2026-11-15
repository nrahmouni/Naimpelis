import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Flag,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';
import type {
  AppLanguage,
  KartInputState,
  KartTrackId,
  Participant,
  TurboKartState,
} from '../types';
import {
  KART_ITEM_META,
  KART_TRACKS,
  KART_TRACK_LIST,
  KART_WORLD_H,
  KART_WORLD_W,
  createInitialTurboKartState,
  setTurboKartTrack,
  startTurboKartRace,
  stepTurboKartSimulation,
  useTurboKartItem,
} from '../shared/turboKart';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import {
  VictoryCelebrationOverlay,
  playGameSfx,
  useGameSoundMute,
} from './games/GameEffects';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface TurboKartStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  kartGameState: TurboKartState | null;
  isOffline?: boolean;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  mutedOverride?: boolean;
  onSelectTrackOnline?: (trackId: KartTrackId) => void;
  onBeginRaceOnline?: () => void;
  onSendInputOnline?: (input: KartInputState) => void;
  onUseItemOnline?: () => void;
  onRematchOnline?: (trackId?: KartTrackId) => void;
}

export const TurboKartStage: React.FC<TurboKartStageProps> = ({
  lang,
  currentUser,
  kartGameState,
  isOffline = false,
  isHost = false,
  mutedOverride,
  onSelectTrackOnline,
  onBeginRaceOnline,
  onSendInputOnline,
  onUseItemOnline,
  onRematchOnline,
}) => {
  const [localState, setLocalState] = useState<TurboKartState>(() =>
    createInitialTurboKartState(
      [
        {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          color: currentUser.color,
        },
      ],
      { trackId: 'neon_sun', waitForHost: true }
    )
  );
  const [localMuted] = useGameSoundMute();
  const muted = mutedOverride !== undefined ? mutedOverride : localMuted;
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  // Input flags ref for lag-free 60fps loop + mobile multi-button hold
  const inputRef = useRef<{
    left: boolean;
    right: boolean;
    brake: boolean;
    drift: boolean;
  }>({ left: false, right: false, brake: false, drift: false });

  const [touchState, setTouchState] = useState({
    left: false,
    right: false,
    drift: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<TurboKartState | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const prevCountdownSecRef = useRef<number>(9);
  const prevEventIdRef = useRef<string | null>(null);
  const prevItemRef = useRef<string | null>(null);
  const prevLapRef = useRef<number>(1);
  const camRef = useRef<{ x: number; y: number; zoom: number }>({
    x: KART_WORLD_W / 2,
    y: KART_WORLD_H / 2,
    zoom: 1.55,
  });

  const activeState = isOffline ? localState : kartGameState;
  stateRef.current = activeState;

  // Initialize local offline state on user/mode change
  useEffect(() => {
    if (!isOffline) return;
    setLocalState(
      createInitialTurboKartState(
        [
          {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
            color: currentUser.color,
          },
        ],
        { trackId: 'neon_sun', waitForHost: true }
      )
    );
  }, [isOffline, currentUser.id, currentUser.name, currentUser.avatar, currentUser.color]);

  // Helper: read normalized current control vector
  const readNormalizedInput = (): KartInputState => {
    const inp = inputRef.current;
    const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    return {
      steer,
      throttle: inp.brake ? -0.35 : 1,
      drift: inp.drift,
    };
  };

  // Keyboard Controls (Arrows / WASD / Shift Drift / Space Use Item)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
      }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = true;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') inputRef.current.brake = true;
      if (e.key === 'Shift') inputRef.current.drift = true;
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        triggerUseItem();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = false;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') inputRef.current.brake = false;
      if (e.key === 'Shift') inputRef.current.drift = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  // Offline 60fps simulation loop
  useEffect(() => {
    if (!isOffline) return;
    if (localState.status !== 'countdown' && localState.status !== 'racing') return;

    let rafId = 0;
    let lastTs = performance.now();
    const tick = (nowPerf: number) => {
      const dt = Math.max(0.014, Math.min(0.055, (nowPerf - lastTs) / 1000));
      lastTs = nowPerf;
      const ctrl = readNormalizedInput();
      setLocalState((curr) => {
        if (curr.status !== 'countdown' && curr.status !== 'racing') return curr;
        return stepTurboKartSimulation(curr, { [currentUser.id]: ctrl }, dt, Date.now());
      });
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isOffline, localState.status, currentUser.id]);

  // Online mode: push steering/drift inputs cleanly at ~18Hz
  useEffect(() => {
    if (isOffline || !activeState || activeState.status !== 'racing') return;
    const iv = window.setInterval(() => {
      onSendInputOnline?.(readNormalizedInput());
    }, 55);
    return () => window.clearInterval(iv);
  }, [isOffline, activeState?.status, onSendInputOnline]);

  // Countdown + Event SFX + Haptic Feedback
  useEffect(() => {
    if (!activeState) return;
    setNowTs(Date.now());
    if (activeState.status === 'countdown') {
      const iv = window.setInterval(() => setNowTs(Date.now()), 120);
      return () => window.clearInterval(iv);
    }
  }, [activeState?.status]);

  useEffect(() => {
    if (!activeState) return;

    if (activeState.status === 'countdown') {
      const secLeft = Math.max(1, Math.ceil((activeState.countdownEndsAt - nowTs) / 1000));
      if (secLeft !== prevCountdownSecRef.current) {
        prevCountdownSecRef.current = secLeft;
        playGameSfx('kart_countdown', muted);
      }
    }

    if (activeState.status !== prevStatusRef.current) {
      if (activeState.status === 'racing' && prevStatusRef.current === 'countdown') {
        playGameSfx('kart_go', muted);
        triggerHaptic('medium');
      } else if (activeState.status === 'finished') {
        playGameSfx('victory', muted);
        triggerHaptic('success');
      }
      prevStatusRef.current = activeState.status;
    }

    const me = activeState.racers.find((r) => !r.isBot && r.userId === currentUser.id);
    if (me) {
      if (me.item && me.item !== prevItemRef.current) {
        playGameSfx('kart_item', muted);
        triggerHaptic('light');
      }
      prevItemRef.current = me.item;
      if (me.lap > prevLapRef.current) {
        playGameSfx('kart_lap', muted);
        triggerHaptic('medium');
      }
      prevLapRef.current = me.lap;
    }

    const lastEv = activeState.events[activeState.events.length - 1];
    if (lastEv && lastEv.id !== prevEventIdRef.current) {
      prevEventIdRef.current = lastEv.id;
      if (lastEv.kind === 'hit' || lastEv.kind === 'shock') {
        playGameSfx('kart_hit', muted);
        triggerHaptic('warning');
      } else if (lastEv.kind === 'bump') {
        playGameSfx('kart_bump', muted);
        triggerHaptic('light');
      } else if (lastEv.kind === 'turbo') {
        playGameSfx('kart_boost', muted);
      }
    }
  }, [activeState, nowTs, muted, currentUser.id]);

  const triggerUseItem = () => {
    const st = stateRef.current;
    if (!st || st.status !== 'racing') return;
    const me = st.racers.find((r) => !r.isBot && r.userId === currentUser.id);
    if (!me?.item) return;

    playGameSfx(
      me.item === 'turbo' || me.item === 'star' ? 'kart_boost' : 'kart_throw',
      muted
    );
    triggerHaptic('medium');

    if (isOffline) {
      setLocalState((curr) => {
        const res = useTurboKartItem(curr, currentUser.id, Date.now());
        return res.ok ? res.state : curr;
      });
    } else {
      onUseItemOnline?.();
    }
  };

  // High-FPS Canvas Track & Kart Renderer
  useEffect(() => {
    let rafId = 0;

    const renderFrame = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const st = stateRef.current;
      if (canvas && container && st) {
        const rect = container.getBoundingClientRect();
        const cw = Math.max(240, Math.floor(rect.width));
        const ch = Math.max(180, Math.floor(rect.height));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
          canvas.width = Math.floor(cw * dpr);
          canvas.height = Math.floor(ch * dpr);
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const track = KART_TRACKS[st.trackId];
          const me =
            st.racers.find((r) => !r.isBot && r.userId === currentUser.id) || st.racers[0];
          const now = Date.now();

          // Smooth follow camera centered on player's kart
          const targetCamX = me.x + Math.cos(me.angle) * 34;
          const targetCamY = me.y + Math.sin(me.angle) * 34;
          const targetZoom =
            (cw < 520 ? 1.15 : 1.55) * (me.boostUntil > now || me.starUntil > now ? 0.91 : 1);

          camRef.current.x += (targetCamX - camRef.current.x) * 0.14;
          camRef.current.y += (targetCamY - camRef.current.y) * 0.14;
          camRef.current.zoom += (targetZoom - camRef.current.zoom) * 0.1;

          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          // 1. Background Scenery
          ctx.fillStyle = track.themeBg;
          ctx.fillRect(0, 0, cw, ch);

          ctx.save();
          ctx.translate(cw / 2, ch / 2);
          ctx.scale(camRef.current.zoom, camRef.current.zoom);
          ctx.translate(-camRef.current.x, -camRef.current.y);

          // Decorative background arena grid
          ctx.strokeStyle = 'rgba(255,255,255,0.035)';
          ctx.lineWidth = 1;
          for (let gx = 0; gx <= KART_WORLD_W; gx += 60) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, KART_WORLD_H);
            ctx.stroke();
          }
          for (let gy = 0; gy <= KART_WORLD_H; gy += 60) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(KART_WORLD_W, gy);
            ctx.stroke();
          }

          // 2. Closed Circuit Path (Outer Curb + Inner Asphalt + Center Line)
          const pts = track.waypoints;
          const traceRoad = () => {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i += 1) {
              ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.closePath();
          };

          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Dark Shadow Base
          traceRoad();
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = track.roadWidth + 24;
          ctx.stroke();

          // Alternating Curb Rim
          traceRoad();
          ctx.strokeStyle = track.curbColorB;
          ctx.lineWidth = track.roadWidth + 14;
          ctx.stroke();

          ctx.save();
          ctx.setLineDash([16, 16]);
          traceRoad();
          ctx.strokeStyle = track.curbColorA;
          ctx.lineWidth = track.roadWidth + 14;
          ctx.stroke();
          ctx.restore();

          // Asphalt Surface
          traceRoad();
          ctx.strokeStyle = track.roadColor;
          ctx.lineWidth = track.roadWidth;
          ctx.stroke();

          // Center Racing Guide Line
          ctx.save();
          ctx.setLineDash([12, 18]);
          traceRoad();
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();

          // Checkered Start / Finish Line at Waypoint 0
          const s0 = pts[0];
          const s1 = pts[1];
          const startAng = Math.atan2(s1.y - s0.y, s1.x - s0.x);
          ctx.save();
          ctx.translate(s0.x, s0.y);
          ctx.rotate(startAng);
          const halfW = track.roadWidth * 0.48;
          const sq = 8;
          for (let row = 0; row < 2; row += 1) {
            for (let col = -Math.floor(halfW / sq); col < Math.floor(halfW / sq); col += 1) {
              ctx.fillStyle = (row + col) % 2 === 0 ? '#FFFFFF' : '#111827';
              ctx.fillRect(row * sq - sq, col * sq, sq, sq);
            }
          }
          ctx.restore();

          // 3. Boost Pads (Animated Neon Chevrons >>>)
          const pulse = (Math.sin(now / 120) + 1) * 0.5;
          for (const padIdx of track.boostPadIndices) {
            const p = pts[padIdx % pts.length];
            const pn = pts[(padIdx + 1) % pts.length];
            const ang = Math.atan2(pn.y - p.y, pn.x - p.x);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(ang);
            ctx.fillStyle = `rgba(6, 182, 212, ${0.42 + pulse * 0.3})`;
            ctx.strokeStyle = '#67E8F9';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-16, -15, 32, 30, 6);
            ctx.fill();
            ctx.stroke();

            // 2 Chevrons
            ctx.strokeStyle = '#FEF08A';
            ctx.lineWidth = 3;
            for (const cx of [-6, 5]) {
              ctx.beginPath();
              ctx.moveTo(cx - 4, -8);
              ctx.lineTo(cx + 4, 0);
              ctx.lineTo(cx - 4, 8);
              ctx.stroke();
            }
            ctx.restore();
          }

          // 4. Rainbow Item Boxes (?)
          for (const box of st.itemBoxes) {
            if (box.respawnAt > 0) continue;
            const rot = (now / 450) % (Math.PI * 2);
            const hue = (now / 8) % 360;
            ctx.save();
            ctx.translate(box.x, box.y);
            ctx.rotate(rot);
            ctx.fillStyle = `hsla(${hue}, 92%, 62%, 0.92)`;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-9, -9, 18, 18, 4);
            ctx.fill();
            ctx.stroke();
            ctx.rotate(-rot);
            ctx.fillStyle = '#09090B';
            ctx.font = 'bold 12px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 0, 0.5);
            ctx.restore();
          }

          // 5. Banana Hazards
          for (const h of st.hazards) {
            ctx.save();
            ctx.translate(h.x, h.y);
            ctx.fillStyle = '#FACC15';
            ctx.strokeStyle = '#713F12';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0.15 * Math.PI, 0.95 * Math.PI);
            ctx.quadraticCurveTo(-2, -6, 7, 1);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }

          // 6. Flying Shells (Projectiles)
          for (const pr of st.projectiles) {
            ctx.save();
            ctx.translate(pr.x, pr.y);
            ctx.fillStyle = pr.kind === 'red_shell' ? '#EF4444' : '#22C55E';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath();
            ctx.arc(-2, -2, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // 7. Karts (Tires + Painted Body + Flame Exhaust + Drift Sparks + Star Shield)
          for (const r of st.racers) {
            const isStar = r.starUntil > now;
            const isBoost = r.boostUntil > now;
            const isSpun = r.spinUntil > now;
            const drawColor = isStar ? `hsl(${(now / 3) % 360}, 95%, 60%)` : r.color;

            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.rotate(r.angle);

            // Rainbow Invincible Aura
            if (isStar) {
              ctx.strokeStyle = `hsla(${(now / 2) % 360}, 95%, 65%, 0.85)`;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(0, 0, 21, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Nitro Flame Jet
            if (isBoost || isStar) {
              const flameLen = 14 + Math.sin(now / 25) * 6;
              ctx.fillStyle = '#F97316';
              ctx.beginPath();
              ctx.moveTo(-14, -5);
              ctx.lineTo(-14 - flameLen, 0);
              ctx.lineTo(-14, 5);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = '#FEF08A';
              ctx.beginPath();
              ctx.moveTo(-14, -2.5);
              ctx.lineTo(-14 - flameLen * 0.6, 0);
              ctx.lineTo(-14, 2.5);
              ctx.closePath();
              ctx.fill();
            }

            // Drift Sparks
            if (r.driftCharge > 18) {
              ctx.fillStyle = r.driftCharge >= 68 ? '#F97316' : '#38BDF8';
              ctx.beginPath();
              ctx.arc(-13, -10, 3.2, 0, Math.PI * 2);
              ctx.arc(-13, 10, 3.2, 0, Math.PI * 2);
              ctx.fill();
            }

            // Soft Ground Drop Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath();
            ctx.ellipse(2, 3, 16, 11, 0, 0, Math.PI * 2);
            ctx.fill();

            // 4 Wheels
            ctx.fillStyle = '#09090B';
            ctx.fillRect(-13, -11, 7, 4);
            ctx.fillRect(-13, 7, 7, 4);
            ctx.save();
            ctx.translate(9, -9);
            ctx.rotate(r.steer * 0.35);
            ctx.fillRect(-3.5, -2, 7, 4);
            ctx.restore();
            ctx.save();
            ctx.translate(9, 9);
            ctx.rotate(r.steer * 0.35);
            ctx.fillRect(-3.5, -2, 7, 4);
            ctx.restore();

            // Glossy Kart Chassis
            ctx.fillStyle = drawColor;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = r.userId === currentUser.id ? 2 : 1.2;
            ctx.beginPath();
            ctx.roundRect(-14, -8.5, 28, 17, 6);
            ctx.fill();
            ctx.stroke();

            // Front Nose Cone Accent
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.fillRect(5, -5.5, 6, 11);

            // Driver Helmet
            ctx.fillStyle = isSpun ? '#FACC15' : '#FFFFFF';
            ctx.beginPath();
            ctx.arc(-2, 0, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0F172A';
            ctx.fillRect(0.5, -3.2, 3, 6.4);

            ctx.restore();

            // Tiny Driver Label Above Kart
            ctx.save();
            ctx.font = 'bold 9px Plus Jakarta Sans, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = r.userId === currentUser.id ? '#FEF08A' : 'rgba(255,255,255,0.78)';
            ctx.fillText(
              r.userId === currentUser.id ? 'TÚ' : r.name.split(' ')[0].slice(0, 8),
              r.x,
              r.y - 18
            );
            ctx.restore();
          }

          ctx.restore();

          // 8. Top-Right Minimap Radar
          const mmW = cw < 420 ? 84 : 112;
          const mmH = Math.round(mmW * (KART_WORLD_H / KART_WORLD_W));
          const mmX = cw - mmW - 10;
          const mmY = 10;
          ctx.save();
          ctx.fillStyle = 'rgba(9, 10, 16, 0.76)';
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(mmX, mmY, mmW, mmH, 8);
          ctx.fill();
          ctx.stroke();

          const sx = mmW / KART_WORLD_W;
          const sy = mmH / KART_WORLD_H;
          ctx.beginPath();
          const ptsMm = track.waypoints;
          ctx.moveTo(mmX + ptsMm[0].x * sx, mmY + ptsMm[0].y * sy);
          for (let i = 1; i < ptsMm.length; i += 2) {
            ctx.lineTo(mmX + ptsMm[i].x * sx, mmY + ptsMm[i].y * sy);
          }
          ctx.closePath();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 4;
          ctx.stroke();

          for (const r of st.racers) {
            ctx.fillStyle = r.userId === currentUser.id ? '#FFFFFF' : r.color;
            ctx.beginPath();
            ctx.arc(
              mmX + r.x * sx,
              mmY + r.y * sy,
              r.userId === currentUser.id ? 3.5 : 2.5,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
          ctx.restore();
        }
      }
      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [currentUser.id]);

  const myRacer = useMemo(
    () =>
      activeState?.racers.find((r) => !r.isBot && r.userId === currentUser.id) ||
      activeState?.racers[0] ||
      null,
    [activeState, currentUser.id]
  );

  const handleSelectTrack = (tid: KartTrackId) => {
    triggerHaptic('light');
    if (isOffline) {
      setLocalState((curr) => setTurboKartTrack(curr, tid));
    } else {
      onSelectTrackOnline?.(tid);
    }
  };

  const handleBeginRace = () => {
    triggerHaptic('medium');
    if (isOffline) {
      setLocalState((curr) => startTurboKartRace(curr));
    } else {
      onBeginRaceOnline?.();
    }
  };

  const handleRematch = () => {
    triggerHaptic('medium');
    if (isOffline) {
      setLocalState((curr) =>
        createInitialTurboKartState(
          [
            {
              id: currentUser.id,
              name: currentUser.name,
              avatar: currentUser.avatar,
              color: currentUser.color,
            },
          ],
          { trackId: curr.trackId, waitForHost: true }
        )
      );
    } else {
      onRematchOnline?.(activeState?.trackId);
    }
  };

  if (!activeState) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-zinc-400">
        {pickLang(lang, { es: 'Cargando pista…', ca: 'Carregant circuit…', en: 'Loading circuit…' })}
      </div>
    );
  }

  // ============================================================================
  // 1. PRE-RACE CIRCUIT PICKER & GRID LOBBY
  // ============================================================================
  if (activeState.status === 'waiting') {
    const canStart = isOffline || isHost;
    return (
      <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden p-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0">
          {KART_TRACK_LIST.map((trk) => {
            const selected = activeState.trackId === trk.id;
            const ptsStr = trk.waypoints
              .filter((_, i) => i % 2 === 0)
              .map((p) => `${(p.x / KART_WORLD_W) * 120},${(p.y / KART_WORLD_H) * 76}`)
              .join(' ');
            return (
              <button
                key={trk.id}
                type="button"
                onClick={() => handleSelectTrack(trk.id)}
                className={`p-2.5 rounded-2xl border-2 text-left flex sm:flex-col items-center sm:items-stretch gap-3 sm:gap-2 transition-all cursor-pointer active:scale-[0.98] ${
                  selected
                    ? 'border-[#9146FF] bg-[#9146FF]/15 shadow-lg'
                    : 'border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div
                  className="w-24 sm:w-full h-16 sm:h-20 rounded-xl border border-white/10 shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: trk.themeBg }}
                >
                  <svg viewBox="0 0 120 76" className="w-full h-full">
                    <polygon
                      points={ptsStr}
                      fill="none"
                      stroke={trk.themeAccent}
                      strokeWidth="6"
                      strokeLinejoin="round"
                    />
                    <polygon
                      points={ptsStr}
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-extrabold text-white truncate">
                    {pickLang(lang, { es: trk.nameEs, ca: trk.nameCa, en: trk.nameEn })}
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                    {pickLang(lang, { es: trk.subtitleEs, ca: trk.subtitleEs, en: trk.subtitleEn })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 6-Kart Starting Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 shrink-0">
          {activeState.racers.map((r) => (
            <div
              key={r.seatIndex}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center gap-1.5 min-w-0"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-white/70"
                style={{ backgroundColor: r.color }}
              />
              <span className="text-[10px] font-bold text-white truncate">{r.name}</span>
            </div>
          ))}
        </div>

        {/* Quick Legend + Play Button */}
        <div className="p-3 rounded-2xl nc-tabletop-slate border border-white/[0.1] flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <div className="text-[11px] text-zinc-300 text-center sm:text-left">
            🐢 Caparazón Rojo · 🟢 Verde · 🍌 Plátano · ⚡ Turbo · ⭐ Estrella · 💥 Choque
          </div>
          {canStart ? (
            <button
              type="button"
              onClick={handleBeginRace}
              className="min-h-10 px-6 rounded-xl bg-gradient-to-r from-[#9146FF] to-emerald-500 hover:brightness-110 text-xs font-extrabold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-lg active:scale-95 shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{pickLang(lang, { es: '¡A Correr!', ca: 'A Córrer!', en: 'Start Race!' })}</span>
            </button>
          ) : (
            <span className="text-xs font-semibold text-amber-300">
              {pickLang(lang, {
                es: 'Esperando al anfitrión…',
                ca: 'Esperant l’amfitrió…',
                en: 'Waiting for host…',
              })}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. ACTIVE RACE VIEWPORT (HUD + CANVAS + ARCADE TOUCH CONTROLS)
  // ============================================================================
  const itemMeta = myRacer?.item ? KART_ITEM_META[myRacer.item] : null;
  const countdownSec = Math.max(1, Math.ceil((activeState.countdownEndsAt - nowTs) / 1000));
  const latestEvent = activeState.events[activeState.events.length - 1];
  const winner =
    activeState.winnerSeat !== null ? activeState.racers[activeState.winnerSeat] : activeState.racers[0];
  const activeTrack = KART_TRACKS[activeState.trackId];

  const updateTouchControl = (key: 'left' | 'right' | 'drift', pressed: boolean) => {
    inputRef.current[key] = pressed;
    setTouchState((prev) => (prev[key] === pressed ? prev : { ...prev, [key]: pressed }));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden select-none">
      {/* Compact Racing Telemetry HUD */}
      <div className="px-2.5 py-1.5 rounded-xl nc-tabletop-slate border border-white/[0.1] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="px-2.5 py-0.5 rounded-lg bg-[#9146FF]/25 border border-[#9146FF]/60 font-display font-black text-sm text-white tabular-nums">
            {myRacer?.rank || 1}º<span className="text-[10px] opacity-70">/6</span>
          </div>
          <div className="text-xs font-bold text-zinc-200 font-mono tabular-nums flex items-center gap-1 whitespace-nowrap">
            <Flag className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {myRacer?.lap || 1}/{activeState.totalLaps}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-zinc-400 truncate hidden sm:inline">
            {pickLang(lang, { es: activeTrack.nameEs, ca: activeTrack.nameCa, en: activeTrack.nameEn })}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!itemMeta}
            onClick={triggerUseItem}
            className={`h-8 px-3 rounded-lg border text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              itemMeta
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 border-white/80 text-white cursor-pointer shadow-[0_0_16px_rgba(245,158,11,0.6)] animate-pulse'
                : 'bg-white/[0.04] border-white/[0.08] text-zinc-500 cursor-default'
            }`}
          >
            <span>{itemMeta ? itemMeta.emoji : '📦'}</span>
            <span className="whitespace-nowrap">
              {itemMeta ? itemMeta.labelEs : pickLang(lang, { es: 'Sin objeto', ca: 'Sense objecte', en: 'No item' })}
            </span>
          </button>

          <button
            type="button"
            onClick={handleRematch}
            aria-label="Reiniciar"
            className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] flex items-center justify-center text-zinc-200 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Racing Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 rounded-2xl border border-white/[0.14] overflow-hidden bg-[#090b12]"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Live Action Event Toast */}
        {latestEvent && activeState.status === 'racing' && (
          <div className="pointer-events-none absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/75 border border-white/15 text-[11px] font-bold text-white backdrop-blur-md max-w-[65%] truncate">
            {latestEvent.text}
          </div>
        )}

        {/* Starting Lights Countdown */}
        {activeState.status === 'countdown' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
            <div className="w-24 h-24 rounded-full bg-zinc-950/90 border-4 border-amber-400 flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.65)]">
              <span className="font-display font-black text-4xl text-amber-300 tabular-nums">
                {countdownSec}
              </span>
            </div>
          </div>
        )}

        {/* Finish Podium + Victory Celebration */}
        {activeState.status === 'finished' && winner && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={pickLang(lang, {
              es: `🏁 ¡${winner.name} gana Turbo Kart!`,
              ca: `🏁 ${winner.name} guanya Turbo Kart!`,
              en: `🏁 ${winner.name} wins Turbo Kart!`,
            })}
            subtitle={activeState.racers
              .slice()
              .sort((a, b) => (a.finishPlace || 9) - (b.finishPlace || 9))
              .slice(0, 3)
              .map((r, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${r.name}`)
              .join('  ·  ')}
            primaryLabel={pickLang(lang, { es: 'Otra Carrera', ca: 'Altra Cursa', en: 'Race Again' })}
            onPrimaryAction={handleRematch}
          />
        )}
      </div>

      {/* Ergonomic Mobile & Desktop Arcade Controls */}
      <div className="flex items-center justify-between gap-2 shrink-0 pt-0.5">
        {/* Steering Pair */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              updateTouchControl('left', true);
            }}
            onPointerUp={() => updateTouchControl('left', false)}
            onPointerCancel={() => updateTouchControl('left', false)}
            style={{ touchAction: 'none' }}
            className={`w-16 sm:w-20 h-12 rounded-2xl border-2 flex items-center justify-center transition-transform cursor-pointer ${
              touchState.left
                ? 'bg-[#9146FF] border-white text-white scale-95'
                : 'bg-white/[0.08] border-white/[0.16] text-white'
            }`}
            aria-label="Izquierda"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              updateTouchControl('right', true);
            }}
            onPointerUp={() => updateTouchControl('right', false)}
            onPointerCancel={() => updateTouchControl('right', false)}
            style={{ touchAction: 'none' }}
            className={`w-16 sm:w-20 h-12 rounded-2xl border-2 flex items-center justify-center transition-transform cursor-pointer ${
              touchState.right
                ? 'bg-[#9146FF] border-white text-white scale-95'
                : 'bg-white/[0.08] border-white/[0.16] text-white'
            }`}
            aria-label="Derecha"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
        </div>

        <span className="hidden md:inline text-[10px] font-mono text-zinc-400">
          ← → Girar · Shift Derrape · Espacio Objeto
        </span>

        {/* Drift + Throw Item */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              updateTouchControl('drift', true);
            }}
            onPointerUp={() => updateTouchControl('drift', false)}
            onPointerCancel={() => updateTouchControl('drift', false)}
            style={{ touchAction: 'none' }}
            className={`h-12 px-3.5 sm:px-4 rounded-2xl border-2 text-xs font-extrabold flex items-center gap-1.5 transition-transform cursor-pointer ${
              touchState.drift
                ? 'bg-cyan-500 border-white text-zinc-950 scale-95'
                : 'bg-white/[0.08] border-white/[0.16] text-zinc-200'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>DRIFT</span>
          </button>

          <button
            type="button"
            disabled={!itemMeta}
            onClick={triggerUseItem}
            className={`h-12 px-4 sm:px-5 rounded-2xl border-2 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
              itemMeta
                ? 'bg-gradient-to-r from-amber-500 to-rose-600 border-white text-white shadow-[0_0_20px_rgba(245,158,11,0.55)]'
                : 'bg-white/[0.04] border-white/[0.1] text-zinc-500 cursor-default'
            }`}
          >
            {itemMeta ? (
              <>
                <span className="text-base leading-none">{itemMeta.emoji}</span>
                <span>{pickLang(lang, { es: 'LANZAR', ca: 'LLANÇAR', en: 'FIRE' })}</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 opacity-50" />
                <span>OBJETO</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
