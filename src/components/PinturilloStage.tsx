import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Flame,
  Pencil,
  Timer,
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
  playGameSfx,
  useGameSoundMute,
} from './games/GameEffects';
import {
  BRUSH_SIZES,
  PinturilloBottomBar,
  PinturilloCanvasOverlays,
  drawStrokeOnCtx,
} from './games/PinturilloOverlaysAndControls';
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
      setRemoteLiveStrokes((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setRemoteLiveStrokes((prev) => {
      if (prev.length === 0) return prev;
      if (activeState.strokes.length === 0) return [];
      const existingIds = new Set(activeState.strokes.map((s) => s.id));
      const next = prev.filter((s) => !existingIds.has(s.id));
      return next.length === prev.length ? prev : next;
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

          <div className="flex items-center justify-center gap-1.5 flex-wrap px-2 min-h-7">
            {activeState.status === 'waiting' ? (
              <span className="text-xs sm:text-sm font-black tracking-widest text-zinc-300">
                {pickLang(lang, { es: 'SALA DE ESPERA', ca: "SALA D'ESPERA", en: 'WAITING LOBBY' })}
              </span>
            ) : activeState.status === 'choosing' ? (
              <span className="text-xs sm:text-sm font-black tracking-widest text-amber-300 animate-pulse">
                {pickLang(lang, { es: '🎨 ELIGIENDO PALABRA…', ca: '🎨 TRIANT PARAULA…', en: '🎨 PICKING WORD…' })}
              </span>
            ) : amDrawer && activeState.secretWord ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-0.5 rounded-lg bg-amber-400/20 border border-amber-300/50 text-amber-200 font-black text-xs sm:text-sm tracking-wider shadow">
                  {activeState.secretWord.es.toUpperCase()}
                </span>
                <span className="text-[11px] text-zinc-400 font-semibold hidden sm:inline">
                  ({activeState.secretWord.en})
                </span>
              </div>
            ) : activeState.maskedWord ? (
              <div className="flex items-center gap-1.5">
                {activeState.maskedWord.split(' ').map((char, cIdx) => (
                  <span
                    key={`tile-${cIdx}-${char}`}
                    className={`w-6 h-7 rounded-md flex items-center justify-center text-xs font-black shadow-md select-none transition-all ${
                      char === '_'
                        ? 'bg-[#1F1713] border-b-2 border-amber-950/80 text-zinc-600 shadow-inner'
                        : 'bg-gradient-to-b from-[#FFFDF8] via-[#F4EBD7] to-[#D5C6A0] border-b-2 border-[#8E7E5A] text-[#241711] nc-pop-spring'
                    }`}
                  >
                    {char === '_' ? '•' : char}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-zinc-400">_ _ _</span>
            )}
          </div>

          <span
            className={`text-[11px] font-mono font-bold tabular-nums flex items-center gap-1 whitespace-nowrap ${
              remainingSec <= 10 && activeState.status === 'drawing' ? 'text-rose-400 animate-pulse' : 'text-zinc-200'
            }`}
          >
            <Timer className="w-3.5 h-3.5" />
            {activeState.status === 'waiting' ? '--' : `${remainingSec}s`}
          </span>
        </div>

        <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className={`h-full transition-[width] duration-200 ${
              remainingSec <= 10 && activeState.status === 'drawing'
                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                : 'bg-gradient-to-r from-amber-400 to-emerald-400'
            }`}
            style={{ width: `${timerRatio}%` }}
          />
        </div>
      </div>

      {/* Warm Artist Paper Easel Canvas Viewport */}
      <div className="relative flex-1 min-h-0 rounded-2xl p-1.5 sm:p-2 bg-gradient-to-b from-[#2E241D] to-[#18120E] border-2 border-[#544131] shadow-[0_12px_32px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.18)] flex flex-col overflow-hidden">
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 rounded-xl overflow-hidden bg-[#FAF6EE] shadow-[inset_0_2px_8px_rgba(0,0,0,0.18),inset_0_-2px_6px_rgba(0,0,0,0.09)] select-none"
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

        <PinturilloCanvasOverlays
          lang={lang}
          activeState={activeState}
          amDrawer={amDrawer}
          drawer={drawer}
          winner={winner}
          isHost={isHost}
          onStartMatchOnline={onStartMatchOnline}
          onPickWord={handlePickWord}
          onRematch={handleRematch}
        />
      </div>
    </div>

      <PinturilloBottomBar
        lang={lang}
        activeState={activeState}
        amDrawer={amDrawer}
        myPlayer={myPlayer}
        muted={muted}
        brushColor={brushColor}
        setBrushColor={setBrushColor}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        isEraser={isEraser}
        setIsEraser={setIsEraser}
        guessText={guessText}
        setGuessText={setGuessText}
        onUndo={handleUndo}
        onClear={handleClear}
        onSubmitGuess={handleSubmitGuess}
        onRematch={handleRematch}
      />
    </div>
  );
};
