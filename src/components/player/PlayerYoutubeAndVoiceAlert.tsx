import React from 'react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanVolumeIcon, RiffanWarningIcon } from '../ui/RiffanIcons';
import type { NativeCinemaPlayerProps } from './playerTypes';

interface PlayerVoiceBannerProps {
  lang: AppLanguage;
  voiceChat: NonNullable<NativeCinemaPlayerProps['voiceChat']>;
}

export const PlayerVoiceBanner: React.FC<PlayerVoiceBannerProps> = ({ lang, voiceChat }) => {
  if (voiceChat.audioPlaybackBlocked && voiceChat.isJoined) {
    return (
      <div className="bg-[#161224] border-t border-[#9146FF]/35 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs text-[#DFCCFF]">
        <div className="flex items-center gap-1.5 min-w-0">
          <RiffanVolumeIcon size={15} />
          <span className="truncate">
            {pickLang(lang, {
              es: 'Toca para escuchar la llamada de voz en este dispositivo.',
              ca: 'Toca per escoltar la trucada de veu en aquest dispositiu.',
              en: 'Tap to enable incoming voice call audio on this device.',
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            voiceChat.resumeRemoteAudio();
          }}
          className="px-3 py-1 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-[11px] font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          {pickLang(lang, { es: 'Activar audio', ca: 'Activar àudio', en: 'Enable Audio' })}
        </button>
      </div>
    );
  }

  if (voiceChat.errorMessage) {
    return (
      <div className="bg-amber-500/10 border-t border-amber-400/35 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs text-amber-200">
        <div className="flex items-center gap-1.5 min-w-0">
          <RiffanWarningIcon size={15} animate="always" className="text-amber-300" />
          <span className="truncate">{voiceChat.errorMessage}</span>
        </div>
        <button
          type="button"
          onClick={() => void voiceChat.joinVoice()}
          className="px-3 py-1 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-[11px] font-bold text-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
        </button>
      </div>
    );
  }

  return null;
};

interface PlayerYoutubeStageProps {
  containerId: string;
  isMinimized: boolean;
  isMuted: boolean;
  lang: AppLanguage;
  onToggleMute: (e: React.MouseEvent) => void;
}

export const PlayerYoutubeStage: React.FC<PlayerYoutubeStageProps> = ({
  containerId,
  isMinimized,
  isMuted,
  lang,
  onToggleMute,
}) => (
  <div className="relative w-full h-full bg-black">
    <div id={containerId} className="w-full h-full" />
    {!isMinimized && (
      <div className="absolute bottom-12 left-3 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMute}
          className={`min-h-[38px] px-3.5 rounded-2xl border text-xs font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer active:scale-95 transition-all shadow-lg ${
            isMuted
              ? 'bg-[#9146FF] border-[#9146FF] text-white'
              : 'bg-black/75 hover:bg-black border-white/20 text-white'
          }`}
        >
          {isMuted ? (
            <>
              <RiffanVolumeIcon size={16} muted tone="current" />
              <span>{pickLang(lang, { es: 'Activar Sonido', ca: 'Activar So', en: 'Unmute' })}</span>
            </>
          ) : (
            <>
              <RiffanVolumeIcon size={16} muted={false} className="text-[#00F593]" />
              <span>{pickLang(lang, { es: 'Sonido Activo', ca: 'So Actiu', en: 'Sound On' })}</span>
            </>
          )}
        </button>
      </div>
    )}
  </div>
);
