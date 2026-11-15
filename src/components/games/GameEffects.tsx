import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, Trophy, Volume2, VolumeX } from 'lucide-react';
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
  | 'crown_drop'
  | 'victory'
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
        tone(290, 0.065, 'sine', 0.09, 0, 145);
        tone(210, 0.04, 'sine', 0.05, 0.075, 165);
        break;
      case 'board_capture':
        tone(155, 0.07, 'sawtooth', 0.075, 0);
        tone(320, 0.065, 'triangle', 0.085, 0.02);
        break;
      case 'board_check':
        tone(587.33, 0.1, 'sine', 0.085, 0);
        tone(880, 0.15, 'sine', 0.075, 0.07);
        break;
      case 'crown_drop':
        tone(659.25, 0.08, 'triangle', 0.09, 0);
        tone(783.99, 0.1, 'triangle', 0.09, 0.06);
        tone(987.77, 0.18, 'triangle', 0.1, 0.12);
        break;
      case 'victory':
        tone(523.25, 0.12, 'triangle', 0.095, 0);
        tone(659.25, 0.12, 'triangle', 0.095, 0.09);
        tone(783.99, 0.14, 'triangle', 0.1, 0.18);
        tone(1046.5, 0.28, 'triangle', 0.11, 0.27);
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
    className="min-h-9 min-w-9 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-200 cursor-pointer shrink-0 transition-colors"
  >
    {muted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-emerald-300" />}
  </button>
);

const CONFETTI_PIECES = Array.from({ length: 28 }, (_, i) => {
  const colors = ['#FACC15', '#E11D48', '#9146FF', '#22C55E', '#38BDF8', '#FB923C'];
  return {
    id: i,
    left: `${4 + ((i * 37) % 92)}%`,
    delay: `${(i % 7) * 0.08}s`,
    duration: `${1.8 + (i % 5) * 0.25}s`,
    color: colors[i % colors.length],
    rotate: (i * 47) % 360,
    size: i % 3 === 0 ? 9 : 7,
  };
});

export const VictoryCelebrationOverlay: React.FC<{
  lang: AppLanguage;
  title: string;
  subtitle?: string;
  primaryLabel?: string;
  onPrimaryAction: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
}> = ({
  lang,
  title,
  subtitle,
  primaryLabel,
  onPrimaryAction,
  secondaryLabel,
  onSecondaryAction,
}) => (
  <div className="absolute inset-0 z-30 rounded-2xl bg-black/82 backdrop-blur-md flex flex-col items-center justify-center gap-3.5 p-4 text-center overflow-hidden">
    {/* Celebratory Confetti Burst */}
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {CONFETTI_PIECES.map((c) => (
        <span
          key={c.id}
          className="nc-confetti-bit absolute top-[-12px] rounded-xs"
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

    {/* Metallic Victory Banner */}
    <div className="relative z-10 w-full max-w-[320px] rounded-2xl p-[1px] bg-gradient-to-br from-amber-200 via-yellow-500 to-amber-700 shadow-[0_18px_50px_rgba(250,204,21,0.28)]">
      <div className="rounded-[15px] bg-gradient-to-b from-[#23202b] via-[#17161e] to-[#0d0d13] px-5 py-5 flex flex-col items-center gap-2.5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-300 via-amber-500 to-amber-700 p-[1px] shadow-lg">
          <div className="w-full h-full rounded-[15px] bg-[#181620] flex items-center justify-center text-amber-300">
            <Trophy className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-100 via-yellow-300 to-amber-100 bg-clip-text text-transparent font-display text-lg font-extrabold tracking-tight text-balance">
          {title}
        </div>

        {subtitle && (
          <p className="text-xs text-zinc-300 leading-snug">{subtitle}</p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1.5">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="min-h-10 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 hover:brightness-110 text-xs font-extrabold text-zinc-950 flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-md active:scale-95 transition-transform"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>
              {primaryLabel ||
                pickLang(lang, { es: 'Jugar otra vez', ca: 'Tornar a jugar', en: 'Play Again' })}
            </span>
          </button>

          {onSecondaryAction && secondaryLabel && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 transition-transform"
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
