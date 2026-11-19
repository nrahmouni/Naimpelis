import React from 'react';
import { Crosshair, Flag, RotateCcw } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { POOL_MIN_SHOT_POWER } from '../../shared/pool8Ball';
import { pickLang } from '../../utils/i18n';
import { unlockPoolAudio } from './poolAudio';

export interface PoolShotDockProps {
  lang: AppLanguage;
  spinPadRef: React.RefObject<HTMLDivElement | null>;
  powerSliderRef: React.RefObject<HTMLDivElement | null>;
  powerFillRef: React.RefObject<HTMLDivElement | null>;
  powerHandleRef: React.RefObject<HTMLDivElement | null>;
  powerPctRef: React.RefObject<HTMLSpanElement | null>;
  spinDragActiveRef: React.MutableRefObject<boolean>;
  spinX: number;
  spinY: number;
  setSpinX: (v: number) => void;
  setSpinY: (v: number) => void;
  updateSpinFromPointer: (clientX: number, clientY: number) => void;
  pullPower: number;
  isMyTurn: boolean;
  isSimulatingUI: boolean;
  isOffline: boolean;
  mySeatIndex: 0 | 1 | null;
  isPlayingStatus: boolean;
  onPowerPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPowerPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPowerPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPowerPointerCancel: () => void;
  onRematch: () => void;
  onForfeitOnline?: () => void;
}

export const PoolShotDock: React.FC<PoolShotDockProps> = ({
  lang,
  spinPadRef,
  powerSliderRef,
  powerFillRef,
  powerHandleRef,
  powerPctRef,
  spinDragActiveRef,
  spinX,
  spinY,
  setSpinX,
  setSpinY,
  updateSpinFromPointer,
  pullPower,
  isMyTurn,
  isSimulatingUI,
  isOffline,
  mySeatIndex,
  isPlayingStatus,
  onPowerPointerDown,
  onPowerPointerMove,
  onPowerPointerUp,
  onPowerPointerCancel,
  onRematch,
  onForfeitOnline,
}) => {
  return (
    <div className="px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center justify-between gap-2 shrink-0">
      {/* 1. Compact Cue-Ball Spin Contact Selector */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          ref={spinPadRef}
          onPointerDown={(e) => {
            unlockPoolAudio();
            spinDragActiveRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateSpinFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (spinDragActiveRef.current) updateSpinFromPointer(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            spinDragActiveRef.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onDoubleClick={() => {
            setSpinX(0);
            setSpinY(0);
          }}
          title={pickLang(lang, {
            es: 'Efecto de bola blanca (doble clic para centrar)',
            ca: 'Efecte de bola blanca',
            en: 'Cue ball spin (double-click to center)',
          })}
          className="relative w-11 h-11 rounded-full bg-gradient-to-br from-[#FFFDF7] to-[#D4CFC3] border border-white/60 shadow-inner touch-none cursor-pointer shrink-0"
        >
          <span className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-zinc-400/50" />
          <span className="pointer-events-none absolute inset-y-2 left-1/2 w-px bg-zinc-400/50" />
          <span
            className="pointer-events-none absolute w-3 h-3 rounded-full bg-[#E11D48] border border-white shadow-sm -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${50 + spinX * 38}%`,
              top: `${50 - spinY * 38}%`,
            }}
          />
        </div>
        {(Math.abs(spinX) > 0.05 || Math.abs(spinY) > 0.05) && (
          <button
            type="button"
            onClick={() => {
              setSpinX(0);
              setSpinY(0);
            }}
            aria-label="Centrar efecto"
            className="w-6 h-6 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-bold text-zinc-300 flex items-center justify-center cursor-pointer"
          >
            <Crosshair className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 2. Dedicated Pull-Back Power Slider */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-zinc-300 px-0.5">
          <span>
            {!isMyTurn
              ? isSimulatingUI
                ? pickLang(lang, { es: 'Bolas en movimiento…', ca: 'Boles en moviment…', en: 'Balls in motion…' })
                : pickLang(lang, { es: 'Turno del rival', ca: 'Torn del rival', en: "Opponent's turn" })
              : pullPower > 0 && pullPower < POOL_MIN_SHOT_POWER
              ? pickLang(lang, { es: 'Suelta para cancelar', ca: 'Deixa anar per cancel·lar', en: 'Release to cancel' })
              : pickLang(lang, { es: 'Desliza y suelta para tirar', ca: 'Llisca i deixa anar', en: 'Slide & release to shoot' })}
          </span>
          <span ref={powerPctRef} className="font-mono tabular-nums text-amber-300">
            {Math.round(pullPower * 100)}%
          </span>
        </div>

        <div
          ref={powerSliderRef}
          onPointerDown={onPowerPointerDown}
          onPointerMove={onPowerPointerMove}
          onPointerUp={onPowerPointerUp}
          onPointerCancel={onPowerPointerCancel}
          role="slider"
          aria-label={pickLang(lang, { es: 'Potencia de tiro', ca: 'Potència de tir', en: 'Shot power' })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pullPower * 100)}
          className={`relative h-9 rounded-xl border overflow-hidden touch-none flex items-center ${
            isMyTurn && !isSimulatingUI
              ? 'bg-[#0B0D14] border-white/15 cursor-ew-resize'
              : 'bg-[#090A10]/60 border-white/[0.06] opacity-50 cursor-not-allowed'
          }`}
        >
          <div
            className="absolute inset-y-0 w-px bg-white/25 z-10 pointer-events-none"
            style={{ left: `${POOL_MIN_SHOT_POWER * 100}%` }}
          />
          <div
            ref={powerFillRef}
            className="h-full"
            style={{
              width: `${pullPower * 100}%`,
              background:
                pullPower < POOL_MIN_SHOT_POWER
                  ? 'rgba(244,63,94,0.45)'
                  : 'linear-gradient(90deg, #10B981 0%, #FACC15 65%, #E11D48 100%)',
            }}
          />
          <div
            ref={powerHandleRef}
            className="pointer-events-none absolute top-1 bottom-1 w-3 rounded-md bg-white shadow-md border border-zinc-300 -translate-x-1/2"
            style={{ left: `${Math.max(4, Math.min(96, pullPower * 100))}%` }}
          />
        </div>
      </div>

      {/* 3. Quick Reset (Offline) or Forfeit (Online) */}
      <div className="flex items-center gap-1 shrink-0">
        {isOffline ? (
          <button
            type="button"
            onClick={onRematch}
            title={pickLang(lang, { es: 'Reiniciar mesa', ca: 'Reiniciar taula', en: 'Reset rack' })}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-zinc-200 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        ) : (
          mySeatIndex !== null &&
          isPlayingStatus && (
            <button
              type="button"
              onClick={() => onForfeitOnline?.()}
              title={pickLang(lang, { es: 'Abandonar partida', ca: 'Abandonar partida', en: 'Forfeit match' })}
              className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-rose-500/20 border border-white/[0.1] flex items-center justify-center text-zinc-200 hover:text-rose-200 cursor-pointer"
            >
              <Flag className="w-4 h-4" />
            </button>
          )
        )}
      </div>
    </div>
  );
};
