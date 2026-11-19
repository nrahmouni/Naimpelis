import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Unlink,
  Subtitles,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { IconButton, PrimaryButton, SecondaryButton } from './DesignSystem';

export interface HapticTvRemoteProps {
  pairedTvCode: string;
  isPlaying?: boolean;
  lang?: AppLanguage;
  onCommand: (
    action:
      | 'toggle_play'
      | 'seek_delta'
      | 'toggle_mute'
      | 'volume_delta'
      | 'set_volume'
      | 'force_sync'
      | 'toggle_fullscreen'
      | 'cycle_aspect'
      | 'toggle_ambilight'
      | 'cycle_subtitles'
      | 'cycle_audio',
    value?: number
  ) => void;
  onDisconnect: () => void;
}

export const HapticTvRemote: React.FC<HapticTvRemoteProps> = ({
  pairedTvCode,
  isPlaying = false,
  lang = 'es',
  onCommand,
  onDisconnect,
}) => {
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [touchFeedback, setTouchFeedback] = useState<string | null>(null);

  const triggerHaptic = (label: string, ms = 18) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch {
      // ignore
    }
    setTouchFeedback(label);
    window.setTimeout(() => {
      setTouchFeedback((prev) => (prev === label ? null : prev));
    }, 900);
  };

  const handleVolumeSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    const delta = (next - volume) / 100;
    setVolume(next);
    setIsMuted(next === 0);
    if (Math.abs(delta) >= 0.02) {
      onCommand('volume_delta', delta);
    }
  };

  return (
    <div className="space-y-2.5 select-none">
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_#34d399]" />
          <span className="text-xs font-bold text-emerald-300 tabular-nums truncate">
            {touchFeedback ||
              pickLang(lang, {
                es: `TV Conectada · #${pairedTvCode}`,
                ca: `TV Connectada · #${pairedTvCode}`,
                en: `TV Connected · #${pairedTvCode}`,
              })}
          </span>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="min-h-[32px] px-2 rounded-lg text-[11px] font-semibold text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <Unlink className="w-3.5 h-3.5" />
          {pickLang(lang, { es: 'Desconectar', ca: 'Desconnectar', en: 'Disconnect' })}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SecondaryButton
          onClick={() => {
            onCommand('seek_delta', -15);
            triggerHaptic('⏪ -15s');
          }}
          className="min-h-[50px]"
        >
          <RotateCcw className="w-4 h-4" />
          <span>-15s</span>
        </SecondaryButton>

        <PrimaryButton
          onClick={() => {
            onCommand('toggle_play');
            triggerHaptic(
              pickLang(lang, {
                es: '⏯ Play / Pausa',
                ca: '⏯ Reproduir / Pausa',
                en: '⏯ Play / Pause',
              })
            );
          }}
          className="min-h-[50px] text-xs sm:text-sm"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          <span>{pickLang(lang, { es: 'Play / Pausa', ca: 'Play / Pausa', en: 'Play / Pause' })}</span>
        </PrimaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('seek_delta', 15);
            triggerHaptic('⏩ +15s');
          }}
          className="min-h-[50px]"
        >
          <RotateCw className="w-4 h-4" />
          <span>+15s</span>
        </SecondaryButton>
      </div>

      <div className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-2.5">
        <IconButton
          onClick={() => {
            setIsMuted((prev) => !prev);
            onCommand('toggle_mute');
            triggerHaptic(
              isMuted
                ? pickLang(lang, { es: '🔊 Sonido activo', ca: '🔊 So activat', en: '🔊 Sound on' })
                : pickLang(lang, { es: '🔇 Silenciado', ca: '🔇 Silenciat', en: '🔇 Muted' })
            );
          }}
          active={isMuted}
          aria-label={pickLang(lang, { es: 'Silenciar TV', ca: 'Silenciar TV', en: 'Mute TV' })}
          className="!min-h-9 !min-w-9"
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4 text-rose-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-zinc-200" />
          )}
        </IconButton>

        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
            <span>{pickLang(lang, { es: 'Volumen', ca: 'Volum', en: 'Volume' })}</span>
            <span className="font-mono text-zinc-400 tabular-nums">
              {isMuted ? 'MUTE' : `${volume}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeSlider}
            aria-label={pickLang(lang, {
              es: 'Control de volumen TV',
              ca: 'Control de volum TV',
              en: 'TV volume slider',
            })}
            className="cinema-range w-full h-2 cursor-pointer"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <SecondaryButton
          onClick={() => {
            onCommand('toggle_fullscreen');
            triggerHaptic(
              pickLang(lang, {
                es: '⛶ Pantalla Completa',
                ca: '⛶ Pantalla Completa',
                en: '⛶ Fullscreen',
              })
            );
          }}
          className="!min-h-[42px] !px-1.5 text-[11px]"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
          <span className="truncate">{pickLang(lang, { es: 'Pantalla', ca: 'Pantalla', en: 'Full' })}</span>
        </SecondaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('cycle_subtitles');
            triggerHaptic(
              pickLang(lang, { es: '💬 Subtítulos', ca: '💬 Subtítols', en: '💬 Subtitles' })
            );
          }}
          className="!min-h-[42px] !px-1.5 text-[11px]"
        >
          <Subtitles className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
          <span className="truncate">{pickLang(lang, { es: 'Subs', ca: 'Subs', en: 'Subs' })}</span>
        </SecondaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('cycle_audio');
            triggerHaptic(pickLang(lang, { es: '🔊 Audio TV', ca: '🔊 Àudio TV', en: '🔊 TV Audio' }));
          }}
          className="!min-h-[42px] !px-1.5 text-[11px]"
        >
          <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Audio</span>
        </SecondaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('cycle_aspect');
            triggerHaptic(pickLang(lang, { es: '📐 Formato', ca: '📐 Format', en: '📐 Aspect' }));
          }}
          className="!min-h-[42px] !px-1.5 text-[11px]"
        >
          <span className="truncate">{pickLang(lang, { es: 'Zoom', ca: 'Zoom', en: 'Fill' })}</span>
        </SecondaryButton>
      </div>
    </div>
  );
};
