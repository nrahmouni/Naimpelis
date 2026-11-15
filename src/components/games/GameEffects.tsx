import React, { useCallback, useEffect, useState } from 'react';
import {
  Crown,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { pickLang } from '../../utils/i18n';
import type { AppLanguage } from '../../types';

export type GameSfxKind =
  | 'card_play'
  | 'card_draw'
  | 'uno_shout'
  | 'wild_wave'
  | 'dice_roll'
  | 'parchis_hop'
  | 'parchis_capture'
  | 'parchis_goal'
  | 'board_move'
  | 'board_capture'
  | 'board_drop'
  | 'board_check'
  | 'board_checkmate'
  | 'crown_drop'
  | 'draw_start'
  | 'guess_close'
  | 'guess_correct'
  | 'streak_up'
  | 'round_end'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'countdown_tick'
  | 'chapas_kick'
  | 'chapas_bounce'
  | 'chapas_goal'
  | 'pinturillo_pop'
  | 'error';

const MUTE_STORAGE_KEY = 'naim_games_sfx_muted';

let sharedGameAudioCtx: AudioContext | null = null;

export function playGameSfx(kind: GameSfxKind, muted = false): void {
  if (muted) return;
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedGameAudioCtx) sharedGameAudioCtx = new AudioCtx();
    if (sharedGameAudioCtx.state === 'suspended') {
      void sharedGameAudioCtx.resume();
    }
    const ctx = sharedGameAudioCtx;
    const now = ctx.currentTime;

    const tone = (
      freq: number,
      dur: number,
      type: OscillatorType,
      gainVal: number,
      delay = 0,
      endFreq?: number
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delay);
      if (endFreq && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + delay + dur);
      }
      gain.gain.setValueAtTime(gainVal, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + delay + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur);
    };

    switch (kind) {
      case 'card_play':
        tone(340, 0.06, 'triangle', 0.085, 0, 560);
        break;
      case 'card_draw':
        tone(220, 0.05, 'sine', 0.065, 0, 310);
        break;
      case 'uno_shout':
        tone(587.33, 0.09, 'triangle', 0.1, 0);
        tone(880, 0.18, 'triangle', 0.11, 0.07);
        break;
      case 'wild_wave':
        tone(392, 0.09, 'sine', 0.08, 0);
        tone(523.25, 0.09, 'sine', 0.08, 0.05);
        tone(659.25, 0.14, 'triangle', 0.09, 0.1);
        tone(783.99, 0.2, 'triangle', 0.08, 0.15);
        break;
      case 'dice_roll':
        tone(170, 0.035, 'square', 0.045, 0);
        tone(215, 0.035, 'square', 0.04, 0.045);
        tone(190, 0.04, 'triangle', 0.055, 0.09);
        tone(260, 0.05, 'triangle', 0.065, 0.14);
        break;
      case 'parchis_hop':
        tone(420, 0.04, 'sine', 0.05, 0, 520);
        break;
      case 'parchis_capture':
        tone(190, 0.08, 'sawtooth', 0.08, 0, 95);
        tone(360, 0.08, 'triangle', 0.09, 0.03, 520);
        break;
      case 'parchis_goal':
        tone(523.25, 0.09, 'triangle', 0.09, 0);
        tone(659.25, 0.11, 'triangle', 0.09, 0.07);
        tone(1046.5, 0.22, 'sine', 0.1, 0.14);
        break;
      case 'board_move':
        tone(235, 0.055, 'triangle', 0.09, 0, 170);
        break;
      case 'board_drop':
        // Connect 4 hollow resonant impact + secondary bounce click
        tone(290, 0.065, 'sine', 0.09, 0, 145);
        tone(210, 0.04, 'sine', 0.05, 0.075, 165);
        tone(330, 0.03, 'sine', 0.035, 0.14, 260);
        break;
      case 'board_capture':
        tone(155, 0.07, 'sawtooth', 0.075, 0);
        tone(320, 0.065, 'triangle', 0.085, 0.02);
        break;
      case 'board_check':
        tone(587.33, 0.1, 'sine', 0.085, 0);
        tone(880, 0.15, 'sine', 0.075, 0.07);
        break;
      case 'board_checkmate':
        tone(523.25, 0.12, 'sawtooth', 0.08, 0, 392);
        tone(392, 0.16, 'sawtooth', 0.09, 0.1, 261.63);
        tone(261.63, 0.35, 'triangle', 0.11, 0.22, 130.81);
        break;
      case 'crown_drop':
        tone(659.25, 0.08, 'triangle', 0.09, 0);
        tone(783.99, 0.1, 'triangle', 0.09, 0.06);
        tone(987.77, 0.18, 'triangle', 0.1, 0.12);
        break;
      case 'draw_start':
        tone(440, 0.07, 'sine', 0.07, 0);
        tone(554.37, 0.1, 'triangle', 0.075, 0.06);
        break;
      case 'guess_close':
        tone(493.88, 0.08, 'triangle', 0.08, 0);
        tone(523.25, 0.11, 'sine', 0.07, 0.06);
        break;
      case 'guess_correct':
        tone(587.33, 0.08, 'triangle', 0.09, 0);
        tone(783.99, 0.1, 'triangle', 0.095, 0.06);
        tone(1174.66, 0.18, 'sine', 0.1, 0.12);
        break;
      case 'streak_up':
        tone(659.25, 0.07, 'triangle', 0.085, 0);
        tone(880, 0.09, 'triangle', 0.09, 0.06);
        tone(1318.51, 0.16, 'sine', 0.095, 0.12);
        break;
      case 'round_end':
        tone(392, 0.1, 'triangle', 0.08, 0);
        tone(329.63, 0.14, 'sine', 0.075, 0.08);
        break;
      case 'victory':
        tone(523.25, 0.12, 'triangle', 0.095, 0);
        tone(659.25, 0.12, 'triangle', 0.095, 0.09);
        tone(783.99, 0.14, 'triangle', 0.1, 0.18);
        tone(1046.5, 0.28, 'triangle', 0.11, 0.27);
        break;
      case 'defeat':
        tone(392, 0.14, 'triangle', 0.07, 0);
        tone(349.23, 0.16, 'sine', 0.07, 0.11);
        tone(261.63, 0.28, 'sine', 0.08, 0.24);
        break;
      case 'draw':
        tone(440, 0.12, 'sine', 0.07, 0);
        tone(440, 0.2, 'triangle', 0.08, 0.12);
        break;
      case 'countdown_tick':
        tone(880, 0.03, 'sine', 0.04, 0, 720);
        break;
      case 'chapas_kick':
        tone(120, 0.08, 'triangle', 0.12, 0, 55);
        tone(220, 0.04, 'square', 0.05, 0.01, 140);
        break;
      case 'chapas_bounce':
        tone(480, 0.035, 'sine', 0.06, 0, 680);
        break;
      case 'chapas_goal':
        tone(261.63, 0.12, 'triangle', 0.11, 0);
        tone(329.63, 0.12, 'triangle', 0.11, 0.08);
        tone(392, 0.15, 'triangle', 0.12, 0.16);
        tone(523.25, 0.35, 'sine', 0.14, 0.26);
        break;
      case 'pinturillo_pop':
        tone(600, 0.04, 'sine', 0.08, 0, 320);
        break;
      case 'error':
        tone(150, 0.11, 'sawtooth', 0.06, 0);
        break;
    }
  } catch {
    // Ignore Web Audio errors safely
  }
}

function readGameSoundMuted(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useGameSoundMute(): [boolean, () => void] {
  const [muted, setMuted] = useState<boolean>(() => readGameSoundMuted());

  useEffect(() => {
    const syncHandler = () => {
      setMuted(readGameSoundMuted());
    };
    window.addEventListener('naim-games-mute-change', syncHandler);
    return () => window.removeEventListener('naim-games-mute-change', syncHandler);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !readGameSoundMuted();
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
      window.dispatchEvent(new CustomEvent('naim-games-mute-change'));
    } catch {
      // ignore
    }
    setMuted(next);
  }, []);

  return [muted, toggleMute];
}

export const GameMuteButton: React.FC<{
  muted: boolean;
  onToggle: () => void;
  lang: AppLanguage;
}> = ({ muted, onToggle, lang }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={
      muted
        ? pickLang(lang, { es: 'Activar sonido', ca: 'Activar so', en: 'Unmute sound' })
        : pickLang(lang, { es: 'Silenciar sonido', ca: 'Silenciar so', en: 'Mute sound' })
    }
    className="min-h-8 min-w-8 px-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-200 cursor-pointer shrink-0 transition-colors active:scale-95"
  >
    {muted ? <VolumeX className="w-3.5 h-3.5 text-zinc-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-300" />}
  </button>
);

const CONFETTI_PIECES = Array.from({ length: 32 }, (_, i) => {
  const colors = ['#FACC15', '#E11D48', '#9146FF', '#22C55E', '#38BDF8', '#FB923C', '#F43F5E'];
  return {
    id: i,
    left: `${2 + ((i * 31) % 96)}%`,
    delay: `${(i % 8) * 0.07}s`,
    duration: `${1.7 + (i % 6) * 0.22}s`,
    color: colors[i % colors.length],
    rotate: (i * 43) % 360,
    size: i % 4 === 0 ? 10 : i % 2 === 0 ? 8 : 6,
  };
});

export const VictoryCelebrationOverlay: React.FC<{
  lang: AppLanguage;
  title: string;
  subtitle?: string;
  outcome?: 'win' | 'defeat' | 'draw';
  scoreBadge?: string;
  primaryLabel?: string;
  onPrimaryAction: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
}> = ({
  lang,
  title,
  subtitle,
  outcome = 'win',
  scoreBadge,
  primaryLabel,
  onPrimaryAction,
  secondaryLabel,
  onSecondaryAction,
}) => {
  const isDefeat = outcome === 'defeat';
  const isDraw = outcome === 'draw';

  return (
    <div className="absolute inset-0 z-30 rounded-2xl bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-3.5 p-4 text-center overflow-hidden">
      {/* Celebratory Physics Confetti Burst for Winners */}
      {!isDefeat && !isDraw && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {CONFETTI_PIECES.map((c) => (
            <span
              key={c.id}
              className="nc-confetti-bit absolute top-[-14px] rounded-xs"
              style={{
                left: c.left,
                width: `${c.size}px`,
                height: `${c.size * 1.4}px`,
                backgroundColor: c.color,
                animationDelay: c.delay,
                animationDuration: c.duration,
                transform: `rotate(${c.rotate}deg)`,
              }}
            />
          ))}
        </div>
      )}

      {/* Rotating Ambient Rayburst Behind Trophy */}
      {!isDefeat && (
        <div
          className="pointer-events-none absolute w-80 h-80 rounded-full opacity-20 nc-ray-spin"
          style={{
            background: isDraw
              ? 'conic-gradient(from 0deg, transparent 0deg 20deg, rgba(226,232,240,0.6) 20deg 40deg, transparent 40deg 60deg, rgba(226,232,240,0.6) 60deg 80deg, transparent 80deg 100deg, rgba(226,232,240,0.6) 100deg 120deg, transparent 120deg 140deg, rgba(226,232,240,0.6) 140deg 160deg, transparent 160deg 180deg, rgba(226,232,240,0.6) 180deg 200deg, transparent 200deg 220deg, rgba(226,232,240,0.6) 220deg 240deg, transparent 240deg 260deg, rgba(226,232,240,0.6) 260deg 280deg, transparent 280deg 300deg, rgba(226,232,240,0.6) 300deg 320deg, transparent 320deg 340deg, rgba(226,232,240,0.6) 340deg 360deg)'
              : 'conic-gradient(from 0deg, transparent 0deg 20deg, rgba(250,204,21,0.7) 20deg 40deg, transparent 40deg 60deg, rgba(250,204,21,0.7) 60deg 80deg, transparent 80deg 100deg, rgba(250,204,21,0.7) 100deg 120deg, transparent 120deg 140deg, rgba(250,204,21,0.7) 140deg 160deg, transparent 160deg 180deg, rgba(250,204,21,0.7) 180deg 200deg, transparent 200deg 220deg, rgba(250,204,21,0.7) 220deg 240deg, transparent 240deg 260deg, rgba(250,204,21,0.7) 260deg 280deg, transparent 280deg 300deg, rgba(250,204,21,0.7) 300deg 320deg, transparent 320deg 340deg, rgba(250,204,21,0.7) 340deg 360deg)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Luxury Metallic Card Frame */}
      <div
        className={`relative z-10 w-full max-w-[330px] rounded-2xl p-[1px] ${
          isDefeat
            ? 'bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-950 shadow-[0_18px_50px_rgba(0,0,0,0.85)]'
            : isDraw
            ? 'bg-gradient-to-br from-slate-300 via-slate-500 to-slate-700 shadow-[0_18px_50px_rgba(148,163,184,0.3)]'
            : 'bg-gradient-to-br from-amber-200 via-yellow-500 to-amber-700 shadow-[0_20px_60px_rgba(250,204,21,0.35)]'
        }`}
      >
        <div className="rounded-[15px] bg-gradient-to-b from-[#181622] via-[#0f1118] to-[#070b14] px-5 py-5 flex flex-col items-center gap-2.5">
          {/* Centered 3D Badge with Glint */}
          <div
            className={`w-14 h-14 rounded-2xl p-[1px] shadow-xl relative ${
              isDefeat
                ? 'bg-gradient-to-br from-zinc-500 to-zinc-800'
                : isDraw
                ? 'bg-gradient-to-br from-slate-200 to-slate-600'
                : 'bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700'
            }`}
          >
            <div className="w-full h-full rounded-[15px] bg-[#12141e] flex items-center justify-center relative overflow-hidden">
              {isDefeat ? (
                <Shield className="w-7 h-7 text-zinc-400" />
              ) : isDraw ? (
                <Crown className="w-7 h-7 text-slate-300" />
              ) : (
                <>
                  <Trophy className="w-7 h-7 text-amber-300 drop-shadow-[0_2px_8px_rgba(250,204,21,0.6)]" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 text-amber-200 nc-crown-sparkle">
                    <Sparkles className="w-2.5 h-2.5" />
                  </span>
                </>
              )}
            </div>
          </div>

          <div
            className={`font-display text-lg font-black tracking-tight text-balance ${
              isDefeat
                ? 'text-zinc-200'
                : isDraw
                ? 'text-slate-100'
                : 'bg-gradient-to-r from-amber-100 via-yellow-300 to-amber-100 bg-clip-text text-transparent'
            }`}
          >
            {title}
          </div>

          {subtitle && (
            <p className="text-xs text-zinc-300 leading-snug font-medium max-w-[260px]">
              {subtitle}
            </p>
          )}

          {scoreBadge && (
            <div className="px-3 py-1 rounded-full bg-white/[0.08] border border-white/15 font-mono text-xs font-bold text-amber-300 tabular-nums">
              {scoreBadge}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1.5 w-full">
            <button
              type="button"
              onClick={onPrimaryAction}
              className={`min-h-10 px-5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shadow-lg active:scale-95 transition-all nc-btn-shine ${
                isDefeat
                  ? 'bg-gradient-to-r from-zinc-700 to-zinc-800 hover:brightness-115 text-white border border-white/20'
                  : 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 hover:brightness-110 text-zinc-950 shadow-[0_4px_16px_rgba(250,204,21,0.4)]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {primaryLabel ||
                  pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
              </span>
            </button>

            {onSecondaryAction && secondaryLabel && (
              <button
                type="button"
                onClick={onSecondaryAction}
                className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all border border-white/10"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{secondaryLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

