import React from 'react';
import {
  Bot,
  Eraser,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import type { AppLanguage, PinturilloGameState, PinturilloStroke } from '../../types';
import { PINTURILLO_SWATCHES, type PinturilloPlayer } from '../../shared/pinturillo';
import { VictoryCelebrationOverlay, playGameSfx } from './GameEffects';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';

export const BRUSH_SIZES = [4, 9, 16];

export function drawStrokeOnCtx(
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

interface PinturilloCanvasOverlaysProps {
  lang: AppLanguage;
  activeState: PinturilloGameState;
  amDrawer: boolean;
  drawer: PinturilloPlayer | null;
  winner: PinturilloPlayer | null;
  isHost: boolean;
  onStartMatchOnline?: () => void;
  onPickWord: (wordId: string) => void;
  onRematch: () => void;
}

export const PinturilloCanvasOverlays: React.FC<PinturilloCanvasOverlaysProps> = ({
  lang,
  activeState,
  amDrawer,
  drawer,
  winner,
  isHost,
  onStartMatchOnline,
  onPickWord,
  onRematch,
}) => (
  <>
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
                  onClick={() => onPickWord(w.id)}
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
        onPrimaryAction={onRematch}
      />
    )}
  </>
);

interface PinturilloBottomBarProps {
  lang: AppLanguage;
  activeState: PinturilloGameState;
  amDrawer: boolean;
  myPlayer: PinturilloPlayer | null;
  muted: boolean;
  brushColor: string;
  setBrushColor: (c: string) => void;
  brushSize: number;
  setBrushSize: (s: number) => void;
  isEraser: boolean;
  setIsEraser: React.Dispatch<React.SetStateAction<boolean>>;
  guessText: string;
  setGuessText: (v: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onSubmitGuess: (e: React.FormEvent) => void;
  onRematch: () => void;
}

export const PinturilloBottomBar: React.FC<PinturilloBottomBarProps> = ({
  lang,
  activeState,
  amDrawer,
  myPlayer,
  muted,
  brushColor,
  setBrushColor,
  brushSize,
  setBrushSize,
  isEraser,
  setIsEraser,
  guessText,
  setGuessText,
  onUndo,
  onClear,
  onSubmitGuess,
  onRematch,
}) => {
  if (amDrawer && activeState.status === 'drawing') {
    return (
      <div className="p-1.5 rounded-xl nc-tabletop-slate border border-white/[0.1] flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <div className="flex items-center gap-1.5 shrink-0 px-1">
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
                  playGameSfx('pinturillo_pop', muted);
                }}
                style={{ backgroundColor: hex }}
                className={`w-6 h-6 rounded-full shrink-0 cursor-pointer transition-all ${
                  active
                    ? 'scale-120 ring-2 ring-white shadow-[0_0_12px_rgba(255,255,255,0.7),inset_0_2px_3px_rgba(255,255,255,0.85)] z-10'
                    : 'border border-white/40 shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.6)] hover:scale-110'
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
            onClick={onUndo}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 flex items-center justify-center cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Clear"
            onClick={onClear}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 text-zinc-200 hover:text-rose-200 flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmitGuess} className="flex items-center gap-1.5 shrink-0">
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
        onClick={onRematch}
        aria-label="Nueva"
        className="h-10 w-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-zinc-200 cursor-pointer shrink-0"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </form>
  );
};
