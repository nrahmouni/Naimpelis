import React from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanVoiceCallIcon } from '../ui/RiffanIcons';
import { VoiceWaveBars } from '../games/GameVoiceBar';
import type { NativeCinemaPlayerProps } from './playerTypes';

interface PlayerFullscreenVoiceControlsProps {
  lang: AppLanguage;
  voiceChat: NonNullable<NativeCinemaPlayerProps['voiceChat']>;
}

export const PlayerFullscreenVoiceControls: React.FC<PlayerFullscreenVoiceControlsProps> = ({
  lang,
  voiceChat,
}) => {
  return (
    <div className="flex items-center gap-1.5">
      {voiceChat.isJoined ? (
        <>
          <button
            type="button"
            aria-pressed={voiceChat.isMuted}
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('light');
              voiceChat.toggleMute();
            }}
            title={
              voiceChat.isMuted
                ? pickLang(lang, { es: 'Activar micrófono', ca: 'Activar micròfon', en: 'Unmute mic' })
                : pickLang(lang, { es: 'Silenciar micrófono', ca: 'Silenciar micròfon', en: 'Mute mic' })
            }
            className={`min-h-[44px] px-3 rounded-2xl backdrop-blur-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
              voiceChat.isMuted
                ? 'bg-rose-500/25 border-rose-400/60 text-rose-100'
                : voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0
                ? 'bg-emerald-500/30 border-emerald-300 text-emerald-100 shadow-[0_8px_20px_rgba(16,185,129,0.3)]'
                : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
            }`}
          >
            {voiceChat.isMuted ? (
              <MicOff className="w-4 h-4 shrink-0" />
            ) : (
              <>
                <Mic className="w-4 h-4 shrink-0" />
                <VoiceWaveBars
                  active={
                    !voiceChat.isMuted &&
                    (voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0)
                  }
                  level={voiceChat.localAudioLevel}
                  size="sm"
                />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('medium');
              voiceChat.leaveVoice();
            }}
            title={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'Leave voice call' })}
            aria-label={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'Leave voice call' })}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#141418]/80 hover:bg-rose-500/30 border border-white/15 hover:border-rose-400/60 text-zinc-100 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
          >
            <PhoneOff className="w-4 h-4 shrink-0" />
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={voiceChat.status === 'requesting'}
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic('medium');
            void voiceChat.joinVoice();
          }}
          title={pickLang(lang, { es: 'Abrir llamada de voz', ca: 'Obrir trucada de veu', en: 'Open voice call' })}
          aria-label={pickLang(lang, { es: 'Abrir llamada de voz', ca: 'Obrir trucada de veu', en: 'Open voice call' })}
          className="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-[#9146FF]/85 hover:bg-[#772CE8] border border-white/20 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
        >
          <RiffanVoiceCallIcon size={16} tone="current" />
          <span className="hidden sm:inline">
            {pickLang(lang, { es: 'Voz', ca: 'Veu', en: 'Voice' })}
          </span>
        </button>
      )}
    </div>
  );
};
