import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Eraser,
  Flame,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Timer,
  Undo2,
  Users,
} from 'lucide-react';
import type { AppLanguage, Participant, PinturilloGameState, PinturilloStroke } from '../types';
import {
  PINTURILLO_SWATCHES,
  addPinturilloStroke,
  advancePinturilloRound,
  buildBotSketchStrokes,
  clearPinturilloCanvas,
  createInitialPinturilloState,
  endPinturilloRound,
  pickBotPinturilloGuess,
  revealPinturilloHintIfDue,
  selectPinturilloWord,
  submitPinturilloGuess,
  undoPinturilloStroke,
} from '../shared/pinturillo';
import { socketService } from '../services/socket';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { VoiceSpeakerIndicator } from './games/GameVoiceBar';
import {
  VictoryCelebrationOverlay,
  playGameSfx,
  useGameSoundMute,
} from './games/GameEffects';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface PinturilloStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  pinturilloState: PinturilloGameState | null;
  isOffline?: boolean;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  mutedOverride?: boolean;
  onStartOnline?: () => void;
  onStartMatchOnline?: () => void;
  onPickWordOnline?: (wordId: string) => void;
  onSendStrokeOnline?: (stroke: PinturilloStroke) => void;
  onUndoOnline?: () => void;
  onClearOnline?: () => void;
  onSendGuessOnline?: (text: string) => void;
  onRematchOnline?: () => void;
}

const BRUSH_SIZES = [4, 9, 16];

function drawStrokeOnCtx(
  ctx: CanvasRenderingContext2D,
  stroke: PinturilloStroke,
  w: number,
  h: number
) {
  if (!stroke.points || stroke.points.length === 0) return;
  const pts = stroke.points;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.isEraser ? '#FAF9F6' : stroke.color || '#18181B';
  ctx.lineWidth = stroke.size * Math.max(0.75, w / 440);

  if (pts.length === 1) {
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(pts[0].x * w, pts[0].y * h, ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const midX = ((pts[i].x + pts[i + 1].x) * 0.5) * w;
    const midY = ((pts[i].y + pts[i + 1].y) * 0.5) * h;
    ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x * w, last.y * h);
  ctx.stroke();
  ctx.restore();
}

export const PinturilloStage: React.FC<PinturilloStageProps> = ({
  lang,
  currentUser,
  pinturilloState,
  isOffline = false,
  isHost = false,
  voiceChat,
  mutedOverride,
  onStartMatchOnline,
  onPickWordOnline,
  onSendStrokeOnline,
  onUndoOnline,
  onClearOnline,
  onSendGuessOnline,
  onRematchOnline,
}) => {
  const [localState, setLocalState] = useState<PinturilloGameState>(() =>
    createInitialPinturilloState([
      {
        id: currentUser.id,
        name: currentUser.name,
        avatar: currentUser.avatar,
        color: currentUser.color,
      },
    ])
  );
  const [remoteLiveStrokes, setRemoteLiveStrokes] = useState<PinturilloStroke[]>([]);
  const [brushColor, setBrushColor] = useState<string>(PINTURILLO_SWATCHES[0]);
  const [brushSize, setBrushSize] = useState<number>(BRUSH_SIZES[1]);
  const [isEraser, setIsEraser] = useState(false);
  const [guessText, setGuessText] = useState('');
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [localMuted] = useGameSoundMute();
  const muted = mutedOverride !== undefined ? mutedOverride : localMuted;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeStrokeRef = useRef<PinturilloStroke | null>(null);
  const isDrawingPtrRef = useRef(false);
  const prevGuessLenRef = useRef(0);
  const prevStatusRef = useRef<string | null>(null);

  const activeState = isOffline ? localState : pinturilloState;

  // Listen for streamed single strokes over WebSocket in Online mode
  useEffect(() => {
    if (isOffline) return;
    const unsub = socketService.subscribe((ev) => {
      if (ev.type === 'PINTURILLO_STROKE_ADDED' && ev.payload?.stroke) {
        const incoming = ev.payload.stroke;
        setRemoteLiveStrokes((prev) =>
          prev.some((s) => s.id === incoming.id) ? prev : [...prev.slice(-140), incoming]
        );
      }
    });
    return unsub;
  }, [isOffline]);

  // Reset optimistic live strokes whenever authoritative state strokes reset/change round
  useEffect(() => {
    if (!activeState) {
      setRemoteLiveStrokes([]);
      return;
    }
    setRemoteLiveStrokes((prev) => {
      if (activeState.strokes.length === 0) return [];
      const existingIds = new Set(activeState.strokes.map((s) => s.id));
      return prev.filter((s) => !existingIds.has(s.id));
    });
  }, [activeState?.round, activeState?.status, activeState?.strokes.length]);

  // Reset local state when switching to offline cleanly
  useEffect(() => {
    if (!isOffline) return;
    setLocalState(
      createInitialPinturilloState([
        {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          color: currentUser.color,
        },
      ])
    );
  }, [isOffline, currentUser.id, currentUser.name, currentUser.avatar, currentUser.color]);

  // Countdown tick
  useEffect(() => {
    if (!activeState || activeState.status === 'finished' || activeState.status === 'waiting') return;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [activeState?.status, activeState?.phaseDeadlineAt]);

  // Offline AI Bot Lifecycle (choose word, draw progressive strokes, guess, hints, round advance)
  useEffect(() => {
    if (!isOffline || localState.status === 'finished') return;
    const drawer = localState.players[localState.drawerSeat];
    let delayMs = 950;
    if (localState.status === 'choosing') {
      delayMs = drawer?.isBot
        ? 950
        : Math.max(250, localState.phaseDeadlineAt - Date.now());
    } else if (localState.status === 'round_end') {
      delayMs = Math.max(250, localState.phaseDeadlineAt - Date.now());
    } else if (localState.status === 'drawing') {
      delayMs = drawer?.isBot ? 820 : 1150;
    }

    const timer = window.setTimeout(() => {
      setLocalState((curr) => {
        if (curr.status === 'finished') return curr;
        const tickNow = Date.now();

        if (curr.status === 'choosing') {
          const curDrawer = curr.players[curr.drawerSeat];
          if ((curDrawer?.isBot || tickNow >= curr.phaseDeadlineAt) && curr.wordChoices.length > 0) {
            const pick = curr.wordChoices[Math.floor(Math.random() * curr.wordChoices.length)];
            const res = selectPinturilloWord(curr, curDrawer?.userId || '', pick.id);
            return res.ok ? res.state : curr;
          }
          return curr;
        }

        if (curr.status === 'round_end') {
          return tickNow >= curr.phaseDeadlineAt ? advancePinturilloRound(curr) : curr;
        }

        if (curr.status === 'drawing') {
          if (tickNow >= curr.phaseDeadlineAt) {
            return endPinturilloRound(curr, tickNow);
          }
          let next = revealPinturilloHintIfDue(curr, tickNow);
          const curDrawer = next.players[next.drawerSeat];
          if (curDrawer?.isBot && next.secretWord) {
            const template = buildBotSketchStrokes(next.secretWord.id);
            if (next.strokes.length < template.length) {
              const res = addPinturilloStroke(next, curDrawer.userId, template[next.strokes.length]);
              if (res.ok) next = res.state;
            }
          }
          if (next.status === 'drawing' && Math.random() < 0.36) {
            const botG = pickBotPinturilloGuess(next);
            if (botG) {
              const gRes = submitPinturilloGuess(next, botG.botUserId, botG.guessText);
              if (gRes.ok) next = gRes.state;
            }
          }
          return next;
        }
        return curr;
      });
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isOffline, localState]);

  // Sound FX + Haptic detector
  useEffect(() => {
    if (!activeState) {
      prevGuessLenRef.current = 0;
      prevStatusRef.current = null;
      return;
    }
    if (activeState.status !== prevStatusRef.current) {
      if (activeState.status === 'drawing') playGameSfx('draw_start', muted);
      else if (activeState.status === 'round_end') playGameSfx('round_end', muted);
      else if (activeState.status === 'finished') playGameSfx('victory', muted);
      prevStatusRef.current = activeState.status;
    }

    const gLen = activeState.guesses.length;
    if (gLen > prevGuessLenRef.current && prevGuessLenRef.current > 0) {
      const latest = activeState.guesses[gLen - 1];
      if (latest?.kind === 'correct') {
        const hasStreak = latest.text.includes('🔥');
        playGameSfx(hasStreak ? 'streak_up' : 'guess_correct', muted);
        triggerHaptic('success');
      } else if (latest?.kind === 'close') {
        playGameSfx('guess_close', muted);
        triggerHaptic('light');
      }
    }
    prevGuessLenRef.current = gLen;
  }, [activeState, muted]);

  const allStrokes = useMemo(() => {
    if (!activeState) return [];
    const seen = new Set(activeState.strokes.map((s) => s.id));
    const merged = [...activeState.strokes];
    for (const s of remoteLiveStrokes) {
      if (!seen.has(s.id)) merged.push(s);
    }
    return merged;
  }, [activeState, remoteLiveStrokes]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.max(200, Math.floor(rect.width));
    const h = Math.max(160, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Warm studio paper surface
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, w, h);

    for (const s of allStrokes) {
      drawStrokeOnCtx(ctx, s, w, h);
    }
    if (activeStrokeRef.current) {
      drawStrokeOnCtx(ctx, activeStrokeRef.current, w, h);
    }
  }, [allStrokes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => redrawCanvas());
    ro.observe(el);
    return () => ro.disconnect();
  }, [redrawCanvas]);

  const drawer = activeState ? activeState.players[activeState.drawerSeat] : null;
  const amDrawer = Boolean(drawer && !drawer.isBot && drawer.userId === currentUser.id);
  const myPlayer = activeState?.players.find((p) => !p.isBot && p.userId === currentUser.id) || null;

  const voicePeerMap = useMemo(() => {
    const m = new Map<string, { isMuted: boolean }>();
    if (voiceChat) {
      for (const peer of voiceChat.voicePeers) {
        m.set(peer.userId, { isMuted: peer.isMuted });
      }
    }
    return m;
  }, [voiceChat]);

  const toNormalizedPt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width))),
      y: Math.max(0, Math.min(1, (clientY - r.top) / Math.max(1, r.height))),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeState || activeState.status !== 'drawing' || !amDrawer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toNormalizedPt(e.clientX, e.clientY);
    isDrawingPtrRef.current = true;
    activeStrokeRef.current = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      color: brushColor,
      size: brushSize,
      isEraser,
      points: [pt],
    };
    redrawCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingPtrRef.current || !activeStrokeRef.current) return;
    const pt = toNormalizedPt(e.clientX, e.clientY);
    const pts = activeStrokeRef.current.points;
    const last = pts[pts.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.004) return;
    pts.push(pt);
    redrawCanvas();
  };

  const finishStroke = () => {
    if (!isDrawingPtrRef.current || !activeStrokeRef.current) return;
    const finished = activeStrokeRef.current;
    isDrawingPtrRef.current = false;
    activeStrokeRef.current = null;

    if (isOffline) {
      setLocalState((curr) => {
        const res = addPinturilloStroke(curr, currentUser.id, finished);
        return res.ok ? res.state : curr;
      });
    } else {
      setRemoteLiveStrokes((prev) => [...prev.slice(-140), finished]);
      onSendStrokeOnline?.(finished);
    }
  };

  const handlePickWord = (wordId: string) => {
    triggerHaptic('medium');
    if (isOffline) {
      setLocalState((curr) => {
        const res = selectPinturilloWord(curr, currentUser.id, wordId);
        return res.ok ? res.state : curr;
      });
    } else {
      onPickWordOnline?.(wordId);
    }
  };

  const handleUndo = () => {
    triggerHaptic('light');
    if (isOffline) {
      setLocalState((curr) => {
        const res = undoPinturilloStroke(curr, currentUser.id);
        return res.ok ? res.state : curr;
      });
    } else {
      setRemoteLiveStrokes((prev) => prev.slice(0, -1));
      onUndoOnline?.();
    }
  };

  const handleClear = () => {
    triggerHaptic('medium');
    if (isOffline) {
      setLocalState((curr) => {
        const res = clearPinturilloCanvas(curr, currentUser.id);
        return res.ok ? res.state : curr;
      });
    } else {
      setRemoteLiveStrokes([]);
      onClearOnline?.();
    }
  };

  const handleSubmitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = guessText.trim();
    if (!clean) return;
    setGuessText('');
    if (isOffline) {
      setLocalState((curr) => {
        const res = submitPinturilloGuess(curr, currentUser.id, clean);
        return res.ok ? res.state : curr;
      });
    } else {
      onSendGuessOnline?.(clean);
    }
  };

  const handleRematch = () => {
    triggerHaptic('medium');
    if (isOffline) {
      setLocalState(
        createInitialPinturilloState([
          {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
            color: currentUser.color,
          },
        ])
      );
    } else {
      onRematchOnline?.();
    }
  };

  if (!activeState) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-zinc-400">
        {pickLang(lang, { es: 'Iniciando Pinturillo…', ca: 'Iniciant Pinturillo…', en: 'Starting Pinturillo…' })}
      </div>
    );
  }

  const remainingSec = Math.max(0, Math.ceil((activeState.phaseDeadlineAt - nowTs) / 1000));
  const timerRatio =
    activeState.status === 'drawing'
      ? Math.max(0, Math.min(100, ((activeState.phaseDeadlineAt - nowTs) / 60_000) * 100))
      : 100;
  const winner =
    activeState.winnerSeat !== null ? activeState.players[activeState.winnerSeat] : null;
  const latestGuesses = activeState.guesses.slice(-3);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
      {/* Compact Players Score Strip */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 shrink-0">
        {activeState.players.map((pl) => {
          const isDraw = activeState.drawerSeat === pl.seatIndex && activeState.status !== 'finished';
          const voiceInfo = !pl.isBot ? voicePeerMap.get(pl.userId) : undefined;
          const voiceLevel = !pl.isBot ? voiceChat?.audioLevels?.[pl.userId] ?? 0 : 0;
          const isSpeaking =
            !pl.isBot &&
            !voiceInfo?.isMuted &&
            (voiceLevel > 0.06 || Boolean(voiceChat?.speakingUserIds.includes(pl.userId)));
          return (
            <div
              key={pl.seatIndex}
              className={`px-2 py-1 rounded-xl border min-w-0 flex flex-col justify-between transition-all ${
                isSpeaking
                  ? 'border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/60'
                  : pl.hasGuessedThisRound
                  ? 'border-emerald-400/55 bg-emerald-500/15'
                  : isDraw
                  ? 'border-amber-400/75 bg-amber-500/15'
                  : 'border-white/[0.08] bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="text-[10px] font-bold text-white truncate">{pl.name}</span>
                {isDraw ? (
                  <Pencil className="w-2.5 h-2.5 text-amber-300 shrink-0" />
                ) : pl.hasGuessedThisRound ? (
                  <Check className="w-2.5 h-2.5 text-emerald-300 shrink-0" />
                ) : pl.isBot ? (
                  <Bot className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                ) : voiceInfo ? (
                  <VoiceSpeakerIndicator
                    inVoice
                    isSpeaking={isSpeaking}
                    isMuted={voiceInfo.isMuted}
                    audioLevel={voiceLevel}
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono tabular-nums text-zinc-300">
                <span>{pl.score} pts</span>
                {pl.streak >= 2 && (
                  <span className="text-amber-300 flex items-center gap-0.5 font-bold">
                    <Flame className="w-2.5 h-2.5" />
                    {pl.streak}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Round + Masked/Secret Word + Countdown Bar */}
      <div className="px-2.5 py-1.5 rounded-xl nc-tabletop-slate border border-white/[0.09] shrink-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-zinc-300 font-mono tabular-nums whitespace-nowrap">
            R{activeState.round}/{activeState.totalRounds}
          </span>

          <div className="text-xs sm:text-sm font-black tracking-[0.22em] text-white text-center truncate px-2">
            {activeState.status === 'waiting'
              ? pickLang(lang, { es: 'SALA DE ESPERA', ca: "SALA D'ESPERA", en: 'WAITING LOBBY' })
              : activeState.status === 'choosing'
              ? pickLang(lang, { es: 'ELIGIENDO…', ca: 'TRIANT…', en: 'PICKING…' })
              : amDrawer && activeState.secretWord
              ? `${activeState.secretWord.es.toUpperCase()} · ${activeState.secretWord.en}`
              : activeState.maskedWord || '_ _ _'}
          </div>

          <span
            className={`text-[11px] font-mono font-bold tabular-nums flex items-center gap-1 whitespace-nowrap ${
              remainingSec <= 10 && activeState.status === 'drawing' ? 'text-rose-400' : 'text-zinc-200'
            }`}
          >
            <Timer className="w-3.5 h-3.5" />
            {activeState.status === 'waiting' ? '--' : `${remainingSec}s`}
          </span>
        </div>

        <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className={`h-full transition-[width] duration-200 ${
              remainingSec <= 10 && activeState.status === 'drawing' ? 'bg-rose-500' : 'bg-amber-400'
            }`}
            style={{ width: `${timerRatio}%` }}
          />
        </div>
      </div>

      {/* Sketch Canvas Viewport */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 rounded-2xl border border-white/[0.14] overflow-hidden bg-[#FAF9F6] shadow-inner select-none"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          style={{ touchAction: 'none' }}
          className={`w-full h-full block ${amDrawer && activeState.status === 'drawing' ? 'cursor-crosshair' : 'cursor-default'}`}
        />

        {/* Floating Guess Feed Pills on top-left corner of canvas */}
        {latestGuesses.length > 0 && activeState.status === 'drawing' && (
          <div className="pointer-events-none absolute top-2 left-2 flex flex-col gap-1 max-w-[78%] z-10">
            {latestGuesses.map((g) => (
              <div
                key={g.id}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold backdrop-blur-md shadow-sm truncate ${
                  g.kind === 'correct'
                    ? 'bg-emerald-600/90 text-white'
                    : g.kind === 'close'
                    ? 'bg-amber-500/90 text-zinc-950 font-bold'
                    : g.kind === 'system'
                    ? 'bg-zinc-900/80 text-zinc-200'
                    : 'bg-zinc-900/75 text-white'
                }`}
              >
                {g.kind === 'system' ? g.text : `${g.userName}: ${g.text}`}
              </div>
            ))}
          </div>
        )}

        {/* Waiting Lobby Overlay */}
        {activeState.status === 'waiting' && (
          <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500/25 to-purple-500/25 border border-pink-400/40 flex items-center justify-center text-2xl">
              🎨
            </div>
            <div className="space-y-1 max-w-xs">
              <div className="text-sm sm:text-base font-extrabold text-white">
                {pickLang(lang, {
                  es: 'Esperando a los jugadores de la sala',
                  ca: 'Esperant els jugadors de la sala',
                  en: 'Waiting for room players',
                })}
              </div>
              <p className="text-xs text-zinc-300">
                {pickLang(lang, {
                  es: 'La partida empezará cuando acepten la invitación o el anfitrión pulse Play.',
                  ca: "La partida començarà quan acceptin la invitació o l'amfitrió premi Play.",
                  en: 'Match starts once invitees respond or the host presses Play.',
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {activeState.players.map((pl) => (
                <span
                  key={pl.seatIndex}
                  className="px-2.5 py-1 rounded-xl bg-white/[0.08] border border-white/15 text-xs font-bold text-white flex items-center gap-1.5"
                >
                  {pl.isBot ? <Bot className="w-3.5 h-3.5 text-emerald-300" /> : <Users className="w-3.5 h-3.5 text-purple-300" />}
                  <span>{pl.name}</span>
                </span>
              ))}
            </div>
            {isHost && onStartMatchOnline ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onStartMatchOnline();
                }}
                className="min-h-11 px-5 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:brightness-110 text-xs sm:text-sm font-black text-zinc-950 flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-lg active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{pickLang(lang, { es: 'Play · Empezar ahora', ca: 'Play · Començar ara', en: 'Play · Start Now' })}</span>
              </button>
            ) : (
              <span className="text-xs font-semibold text-amber-200/90">
                {pickLang(lang, {
                  es: 'Esperando a que el anfitrión inicie…',
                  ca: "Esperant que l'amfitrió iniciï…",
                  en: 'Waiting for host to start…',
                })}
              </span>
            )}
          </div>
        )}

        {/* Word Chooser Overlay */}
        {activeState.status === 'choosing' && (
          <div className="absolute inset-0 z-20 bg-black/78 backdrop-blur-sm flex flex-col items-center justify-center p-4 gap-3 text-center">
            {amDrawer ? (
              <>
                <div className="text-sm font-extrabold text-white">
                  {pickLang(lang, {
                    es: '🎨 Elige una palabra para dibujar',
                    ca: '🎨 Tria una paraula per dibuixar',
                    en: '🎨 Pick a word to draw',
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {activeState.wordChoices.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => handlePickWord(w.id)}
                      className="min-h-11 px-4 py-2 rounded-xl bg-gradient-to-br from-[#9146FF] to-indigo-600 hover:brightness-115 border border-white/25 text-white font-extrabold text-xs sm:text-sm cursor-pointer shadow-lg active:scale-95 transition-transform"
                    >
                      <span>{w.es}</span>
                      <span className="text-[10px] opacity-80 ml-1.5">({w.en})</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs sm:text-sm font-bold text-zinc-200">
                🎨 {drawer?.name || 'Jugador'}{' '}
                {pickLang(lang, {
                  es: 'está eligiendo palabra…',
                  ca: 'està triant paraula…',
                  en: 'is choosing a word…',
                })}
              </div>
            )}
          </div>
        )}

        {/* Round End Reveal Overlay */}
        {activeState.status === 'round_end' && activeState.secretWord && (
          <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-amber-300 font-bold">
              {pickLang(lang, { es: 'La palabra era', ca: 'La paraula era', en: 'The word was' })}
            </span>
            <div className="text-xl sm:text-2xl font-display font-black text-white">
              {activeState.secretWord.es.toUpperCase()}{' '}
              <span className="text-sm font-semibold text-zinc-400">({activeState.secretWord.en})</span>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {activeState.players
                .filter((p) => p.roundPoints > 0)
                .map((p) => (
                  <span
                    key={p.seatIndex}
                    className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-bold text-emerald-200"
                  >
                    {p.name} +{p.roundPoints}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Match Finished Victory Celebration */}
        {activeState.status === 'finished' && winner && (
          <VictoryCelebrationOverlay
            lang={lang}
            title={pickLang(lang, {
              es: `¡${winner.name} gana Pinturillo!`,
              ca: `${winner.name} guanya Pinturillo!`,
              en: `${winner.name} wins Pinturillo!`,
            })}
            subtitle={`${winner.score} pts`}
            primaryLabel={pickLang(lang, { es: 'Nueva partida', ca: 'Nova partida', en: 'Play Again' })}
            onPrimaryAction={handleRematch}
          />
        )}
      </div>

      {/* Bottom Controls: Drawer Toolbar OR Guesser Fast Input */}
      {amDrawer && activeState.status === 'drawing' ? (
        <div className="p-1.5 rounded-xl nc-tabletop-slate border border-white/[0.1] flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-1 shrink-0">
            {PINTURILLO_SWATCHES.map((hex) => {
              const active = !isEraser && brushColor === hex;
              return (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  onClick={() => {
                    setIsEraser(false);
                    setBrushColor(hex);
                  }}
                  style={{ backgroundColor: hex }}
                  className={`w-6 h-6 rounded-full border shrink-0 cursor-pointer transition-transform ${
                    active ? 'border-white scale-115 ring-2 ring-[#9146FF]' : 'border-white/30'
                  }`}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0 border-l border-white/10 pl-1.5">
            {BRUSH_SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                aria-label={`Size ${sz}`}
                onClick={() => setBrushSize(sz)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${
                  brushSize === sz ? 'bg-[#9146FF] text-white' : 'bg-white/[0.06] text-zinc-300'
                }`}
              >
                <span
                  className="rounded-full bg-current"
                  style={{ width: `${Math.min(14, sz + 2)}px`, height: `${Math.min(14, sz + 2)}px` }}
                />
              </button>
            ))}

            <button
              type="button"
              aria-label="Eraser"
              onClick={() => setIsEraser((v) => !v)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${
                isEraser ? 'bg-rose-500 text-white' : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Undo"
              onClick={handleUndo}
              className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 flex items-center justify-center cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Clear"
              onClick={handleClear}
              className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 text-zinc-200 hover:text-rose-200 flex items-center justify-center cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitGuess} className="flex items-center gap-1.5 shrink-0">
          <input
            type="text"
            value={guessText}
            onChange={(e) => setGuessText(e.target.value)}
            disabled={
              activeState.status !== 'drawing' ||
              amDrawer ||
              Boolean(myPlayer?.hasGuessedThisRound)
            }
            placeholder={
              myPlayer?.hasGuessedThisRound
                ? pickLang(lang, {
                    es: '✓ ¡Ya adivinaste! Esperando ronda…',
                    ca: '✓ Ja ho has endevinat!',
                    en: '✓ Solved! Waiting for next round…',
                  })
                : pickLang(lang, {
                    es: 'Escribe tu respuesta aquí…',
                    ca: 'Escriu la teva resposta…',
                    en: 'Type your guess here…',
                  })
            }
            className="flex-1 h-10 px-3.5 rounded-xl bg-white/[0.07] border border-white/[0.14] text-xs sm:text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:border-[#9146FF] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              activeState.status !== 'drawing' ||
              amDrawer ||
              Boolean(myPlayer?.hasGuessedThisRound) ||
              !guessText.trim()
            }
            className="h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] disabled:opacity-45 text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {pickLang(lang, { es: 'Enviar', ca: 'Enviar', en: 'Send' })}
            </span>
          </button>
          <button
            type="button"
            onClick={handleRematch}
            aria-label="Nueva"
            className="h-10 w-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-zinc-200 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
};
