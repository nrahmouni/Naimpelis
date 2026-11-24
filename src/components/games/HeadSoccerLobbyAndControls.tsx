import React from 'react';
import { Play } from 'lucide-react';
import type { AppLanguage, Participant } from '../../types';
import {
  HS_SKINS,
  createInitialHeadSoccerOnlineState,
  getHeadSoccerSkin,
  type HeadSoccerInput,
  type HeadSoccerOnlineState,
  type HeadSoccerSkinId,
} from '../../shared/headSoccer';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';

interface HeadSoccerWaitingLobbyProps {
  lang: AppLanguage;
  currentUser: Participant;
  effectiveState: HeadSoccerOnlineState | null;
  isHost: boolean;
  onStartOnline?: () => void;
  onJoinSeatOnline?: (seatIndex: 0 | 1 | 'spectate') => void;
  onSelectSkinOnline?: (skinId: HeadSoccerSkinId) => void;
  onStartMatchOnline?: () => void;
}

export const HeadSoccerWaitingLobby: React.FC<HeadSoccerWaitingLobbyProps> = ({
  lang,
  currentUser,
  effectiveState,
  isHost,
  onStartOnline,
  onJoinSeatOnline,
  onSelectSkinOnline,
  onStartMatchOnline,
}) => {
  const state =
    effectiveState ||
    createInitialHeadSoccerOnlineState({
      id: currentUser.id,
      name: currentUser.name,
      avatar: currentUser.avatar || '⚽',
      color: currentUser.color || '#9146FF',
    });
  const mySeat = state.players.find((p) => p?.userId === currentUser.id) || null;
  const canStart = isHost || state.players[0]?.userId === currentUser.id;

  return (
    <div className="w-full max-w-3xl mx-auto rounded-2xl bg-[#0e1120] border border-white/10 p-4 space-y-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-black text-lg text-white flex items-center gap-2">
            <span>⚽</span>
            <span>{pickLang(lang, { es: 'Fútbol Cabezones 1v1', ca: 'Futbol Capgrossos 1v1', en: 'Head Soccer 1v1' })}</span>
          </h3>
          <p className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Elige portería, selecciona tu cabezón y salta al estadio.',
              ca: 'Tria porteria, selecciona el teu jugador i salta a l’estadi.',
              en: 'Pick a side, choose your caricature head and kick off.',
            })}
          </p>
        </div>
        {!effectiveState && onStartOnline && (
          <button
            type="button"
            onClick={() => onStartOnline()}
            className="min-h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-xs font-bold cursor-pointer"
          >
            {pickLang(lang, { es: 'Abrir estadio', ca: 'Obrir estadi', en: 'Open stadium' })}
          </button>
        )}
      </div>

      {/* 2 Player Seats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([0, 1] as const).map((idx) => {
          const seat = state.players[idx];
          const isMine = seat?.userId === currentUser.id;
          const skin = getHeadSoccerSkin(seat?.skinId || (idx === 0 ? 'striker' : 'furia'));
          return (
            <div
              key={idx}
              className={`rounded-2xl p-3.5 border transition-all ${
                isMine ? 'bg-[#9146FF]/15 border-[#9146FF]/50' : 'bg-white/[0.03] border-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black border border-white/15 shrink-0"
                    style={{ backgroundColor: skin.primary }}
                  >
                    {seat ? seat.avatar : idx === 0 ? '🥅' : '🤖'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {seat ? seat.name : idx === 1 ? 'Libre (o Bot IA)' : 'Portería Izquierda'}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {seat ? skin.name : idx === 0 ? 'Local' : 'Visitante'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    if (!effectiveState) onStartOnline?.();
                    onJoinSeatOnline?.(isMine ? 'spectate' : idx);
                  }}
                  className={`min-h-9 px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                    isMine
                      ? 'bg-white/10 hover:bg-white/20 text-zinc-200'
                      : 'bg-[#9146FF] hover:bg-[#7C2AE8] text-white'
                  }`}
                >
                  {isMine ? 'Salir' : 'Unirme'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Skin Picker */}
      {mySeat && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            {pickLang(lang, { es: 'Tu Cabezón', ca: 'El teu jugador', en: 'Your Character' })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {HS_SKINS.map((sk) => {
              const selected = mySeat.skinId === sk.id;
              return (
                <button
                  key={sk.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectSkinOnline?.(sk.id);
                  }}
                  className={`min-h-11 px-3 py-2 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all ${
                    selected
                      ? 'bg-white/10 border-[#BF94FF] text-white'
                      : 'bg-white/[0.03] border-white/[0.07] text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-white/25 shrink-0"
                    style={{ backgroundColor: sk.primary }}
                  />
                  <span className="text-xs font-bold truncate">{sk.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-zinc-400">
          {pickLang(lang, {
            es: 'Partido de 60 segundos · Gol de Oro si hay empate.',
            ca: 'Partit de 60 segons · Gol d’Or si hi ha empat.',
            en: '60s match · Golden Goal overtime on ties.',
          })}
        </span>
        {canStart && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              if (!effectiveState) onStartOnline?.();
              onStartMatchOnline?.();
            }}
            className="min-h-11 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 text-white text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{pickLang(lang, { es: '¡Empezar Partido!', ca: 'Començar Partit!', en: 'Kick Off!' })}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const HeadSoccerTouchControls: React.FC<{
  updateTouchPointer: (pointerId: number, action: keyof HeadSoccerInput | null) => void;
  superReady?: boolean;
}> = ({ updateTouchPointer, superReady = false }) => (
  <div
    onContextMenu={(e) => e.preventDefault()}
    className="game-touch-surface flex items-center justify-between gap-2 pt-1 px-1 touch-none"
  >
    <div className="flex items-center gap-2">
      {([
        { action: 'left' as const, label: '◀', aria: 'Mover izquierda' },
        { action: 'right' as const, label: '▶', aria: 'Mover derecha' },
      ]).map((btn) => (
        <button
          key={btn.action}
          type="button"
          aria-label={btn.aria}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            updateTouchPointer(e.pointerId, btn.action);
          }}
          onPointerUp={(e) => updateTouchPointer(e.pointerId, null)}
          onPointerCancel={(e) => updateTouchPointer(e.pointerId, null)}
          onLostPointerCapture={(e) => updateTouchPointer(e.pointerId, null)}
          className="game-touch-btn min-w-14 min-h-14 sm:min-w-20 sm:min-h-14 rounded-2xl bg-white/[0.08] active:bg-[#9146FF] border border-white/15 text-xl font-black text-white flex items-center justify-center shadow-lg touch-none cursor-pointer transition-colors"
        >
          {btn.label}
        </button>
      ))}
    </div>

    <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-400">
      <span className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 font-mono">
        A / D · ◀ ▶
      </span>
      <span className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 font-mono">
        W / ▲ Saltar
      </span>
      <span className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 font-mono">
        Espacio Chutar · E Súper
      </span>
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Saltar"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          updateTouchPointer(e.pointerId, 'jump');
        }}
        onPointerUp={(e) => updateTouchPointer(e.pointerId, null)}
        onPointerCancel={(e) => updateTouchPointer(e.pointerId, null)}
        onLostPointerCapture={(e) => updateTouchPointer(e.pointerId, null)}
        className="game-touch-btn min-w-14 min-h-14 sm:min-w-20 sm:min-h-14 px-2.5 rounded-2xl bg-sky-500/25 active:bg-sky-500 border border-sky-400/40 text-xs sm:text-sm font-black text-sky-100 flex items-center justify-center shadow-lg touch-none cursor-pointer transition-colors"
      >
        ⬆ Saltar
      </button>
      <button
        type="button"
        aria-label="Chutar"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          updateTouchPointer(e.pointerId, 'kick');
        }}
        onPointerUp={(e) => updateTouchPointer(e.pointerId, null)}
        onPointerCancel={(e) => updateTouchPointer(e.pointerId, null)}
        onLostPointerCapture={(e) => updateTouchPointer(e.pointerId, null)}
        className="game-touch-btn min-w-16 min-h-14 sm:min-w-22 sm:min-h-14 px-3 rounded-2xl bg-amber-500/25 active:bg-amber-500 border border-amber-400/45 text-xs sm:text-sm font-black text-amber-100 flex items-center justify-center shadow-lg touch-none cursor-pointer transition-colors"
      >
        ⚽ Chut
      </button>
      <button
        type="button"
        aria-label="Super Tiro"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          updateTouchPointer(e.pointerId, 'superKick');
        }}
        onPointerUp={(e) => updateTouchPointer(e.pointerId, null)}
        onPointerCancel={(e) => updateTouchPointer(e.pointerId, null)}
        onLostPointerCapture={(e) => updateTouchPointer(e.pointerId, null)}
        className={`game-touch-btn min-w-16 min-h-14 sm:min-w-22 sm:min-h-14 px-3 rounded-2xl border text-xs sm:text-sm font-black flex items-center justify-center shadow-lg touch-none cursor-pointer transition-colors ${
          superReady
            ? 'bg-gradient-to-br from-amber-400 to-orange-500 border-amber-200 text-slate-950'
            : 'bg-white/[0.04] border-white/10 text-zinc-500'
        }`}
      >
        🔥 Súper
      </button>
    </div>
  </div>
);
