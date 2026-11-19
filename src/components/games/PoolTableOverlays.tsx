import React from 'react';
import { Play, Target } from 'lucide-react';
import type {
  AppLanguage,
  Pool8BallState,
  PoolBallGroup,
  PoolBallState,
  PoolDifficulty,
  PoolPocketId,
} from '../../types';
import { POOL_POCKETS, isOnEightBall } from '../../shared/pool8Ball';
import { BALL_COLORS } from './poolCanvasRenderer';
import { VictoryCelebrationOverlay } from './GameEffects';
import { pickLang } from '../../utils/i18n';

export function poolGroupLabel(
  lang: AppLanguage,
  grp: PoolBallGroup | null,
  balls: PoolBallState[]
): string {
  if (!grp) return pickLang(lang, { es: 'Abierta', ca: 'Oberta', en: 'Open' });
  if (isOnEightBall(balls, grp)) return pickLang(lang, { es: 'Bola 8', ca: 'Bola 8', en: '8-Ball' });
  return grp === 'solids'
    ? pickLang(lang, { es: 'Lisas', ca: 'Llises', en: 'Solids' })
    : pickLang(lang, { es: 'Rayadas', ca: 'Ratllades', en: 'Stripes' });
}

export const PoolPocketedChips: React.FC<{
  balls: PoolBallState[];
  group: PoolBallGroup | null;
}> = ({ balls, group }) => {
  if (!group) return null;
  const ids = group === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
  return (
    <div className="flex items-center gap-0.5">
      {ids.map((id) => {
        const b = balls.find((item) => item.id === id);
        const remaining = b && !b.pocketed;
        const color = BALL_COLORS[id]?.main || '#fff';
        return (
          <span
            key={id}
            title={String(id)}
            className={`w-3 h-3 rounded-full border text-[7px] font-black flex items-center justify-center tabular-nums transition-opacity ${
              remaining ? 'opacity-95 border-white/60' : 'opacity-25 border-white/20'
            }`}
            style={{
              background: BALL_COLORS[id]?.stripe
                ? `linear-gradient(180deg, #fff 25%, ${color} 25%, ${color} 75%, #fff 75%)`
                : color,
              color: id === 1 || id === 9 ? '#111' : '#fff',
            }}
          >
            {id}
          </span>
        );
      })}
    </div>
  );
};

export const PoolEmptySetupCard: React.FC<{
  lang: AppLanguage;
  isOffline: boolean;
  difficulty: PoolDifficulty;
  onStartOnline?: (difficulty?: PoolDifficulty) => void;
}> = ({ lang, isOffline, difficulty, onStartOnline }) => (
  <div className="flex-1 min-h-0 rounded-2xl nc-tabletop-slate border border-white/[0.1] flex flex-col items-center justify-center gap-3 p-4 text-center">
    <span className="text-3xl" aria-hidden="true">🎱</span>
    <p className="text-sm font-bold text-white">
      {pickLang(lang, {
        es: 'Preparando mesa de Billar Bola 8…',
        ca: 'Preparant taula de Billar Bola 8…',
        en: 'Setting up 8-Ball Pool table…',
      })}
    </p>
    {!isOffline && (
      <button
        type="button"
        onClick={() => onStartOnline?.(difficulty)}
        className="min-h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
      >
        {pickLang(lang, { es: 'Abrir mesa', ca: 'Obrir taula', en: 'Open Table' })}
      </button>
    )}
  </div>
);

export const PoolTableCanvasOverlays: React.FC<{
  lang: AppLanguage;
  activeState: Pool8BallState;
  isMyTurn: boolean;
  amIOnEightBall: boolean;
  effectiveCalledPocket: PoolPocketId | null;
  mySeatIndex: 0 | 1 | null;
  isHost: boolean;
  onJoinSeatOnline?: (seatIndex: 0 | 1 | 'spectate') => void;
  onStartMatchOnline?: () => void;
  onRematch: () => void;
}> = ({
  lang,
  activeState,
  isMyTurn,
  amIOnEightBall,
  effectiveCalledPocket,
  mySeatIndex,
  isHost,
  onJoinSeatOnline,
  onStartMatchOnline,
  onRematch,
}) => (
  <>
    {activeState.status === 'waiting' && (
      <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl bg-black/85 backdrop-blur-md border border-white/15 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-zinc-200">
          {pickLang(lang, {
            es: 'Esperando respuestas o rival en la mesa…',
            ca: 'Esperant respostes o rival a la taula…',
            en: 'Waiting for responses or opponent…',
          })}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          {mySeatIndex === null && (
            <button
              type="button"
              onClick={() => onJoinSeatOnline?.(1)}
              className="min-h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white whitespace-nowrap cursor-pointer"
            >
              {pickLang(lang, { es: 'Jugar aquí', ca: 'Jugar aquí', en: 'Join Seat 2' })}
            </button>
          )}
          {isHost && onStartMatchOnline && (
            <button
              type="button"
              onClick={() => onStartMatchOnline()}
              className="min-h-8 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-black text-zinc-950 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{pickLang(lang, { es: 'Play · Empezar', ca: 'Play · Començar', en: 'Play · Start' })}</span>
            </button>
          )}
        </div>
      </div>
    )}

    {activeState.status === 'playing' && isMyTurn && activeState.phase === 'BALL_IN_HAND' && (
      <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-emerald-500/90 text-zinc-950 text-[11px] font-extrabold whitespace-nowrap shadow-md">
        {pickLang(lang, {
          es: '✋ Bola en mano: arrastra la blanca',
          ca: '✋ Bola en mà: arrossega la blanca',
          en: '✋ Ball in hand: drag cue ball',
        })}
      </div>
    )}

    {activeState.status === 'playing' && isMyTurn && amIOnEightBall && (
      <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-amber-400/95 text-zinc-950 text-[11px] font-extrabold whitespace-nowrap shadow-md flex items-center gap-1">
        <Target className="w-3.5 h-3.5" />
        <span>
          {effectiveCalledPocket
            ? pickLang(lang, {
                es: `Bola 8 cantada: ${POOL_POCKETS.find((p) => p.id === effectiveCalledPocket)?.label || effectiveCalledPocket}`,
                ca: `Bola 8 cantada: ${effectiveCalledPocket}`,
                en: `8-Ball called: ${effectiveCalledPocket}`,
              })
            : pickLang(lang, {
                es: 'Toca una tronera para cantar la Bola 8',
                ca: 'Toca una tronera per cantar la Bola 8',
                en: 'Tap a pocket to call the 8-Ball',
              })}
        </span>
      </div>
    )}

    {activeState.status === 'finished' && (
      <VictoryCelebrationOverlay
        lang={lang}
        title={
          activeState.winnerSeat !== null
            ? `🎱 ${activeState.players[activeState.winnerSeat]?.name || 'Ganador'} gana`
            : pickLang(lang, { es: 'Partida terminada', ca: 'Partida acabada', en: 'Match Over' })
        }
        subtitle={activeState.statusMessage}
        primaryLabel={pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
        onPrimaryAction={onRematch}
      />
    )}
  </>
);
