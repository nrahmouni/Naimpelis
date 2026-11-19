import React from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanSpinner, RiffanVoiceCallIcon } from '../ui/RiffanIcons';
import type { NativeCinemaPlayerProps } from './playerTypes';

interface PlayerStripVoiceControlsProps {
  lang: AppLanguage;
  voiceChat: NonNullable<NativeCinemaPlayerProps['voiceChat']>;
  waveSlot: React.ReactNode;
}

export const PlayerStripVoiceControls: React.FC<PlayerStripVoiceControlsProps> = ({
  lang,
  voiceChat,
  waveSlot,
}) => {
  if (voiceChat.isJoined) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          aria-pressed={voiceChat.isMuted}
          onClick={() => {
            triggerHaptic('light');
            voiceChat.toggleMute();
          }}
          className={`min-h-[38px] px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
            voiceChat.isMuted
              ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/50 text-rose-200'
              : voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0
              ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-300 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.28)]'
              : 'bg-emerald-500/18 hover:bg-emerald-500/28 border-emerald-400/45 text-emerald-200'
          }`}
        >
          {voiceChat.isMuted ? (
            <>
              <MicOff className="w-3.5 h-3.5 shrink-0" />
              <span>{pickLang(lang, { es: 'Silenciado', ca: 'Silenciat', en: 'Muted' })}</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 shrink-0" />
              {waveSlot}
              <span>
                {voiceChat.localAudioLevel > 0.08
                  ? pickLang(lang, { es: 'Hablando', ca: 'Parlant', en: 'Speaking' })
                  : pickLang(lang, { es: 'Voz', ca: 'Veu', en: 'Voice' })}
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            voiceChat.leaveVoice();
          }}
          title={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'Leave voice call' })}
          aria-label={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'Leave voice call' })}
          className="min-h-[38px] px-2.5 rounded-2xl bg-[#26262C] hover:bg-rose-500/25 border border-white/[0.09] hover:border-rose-400/50 text-xs font-bold text-zinc-200 hover:text-rose-200 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
        >
          <PhoneOff className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={voiceChat.status === 'requesting'}
      onClick={() => {
        triggerHaptic('medium');
        void voiceChat.joinVoice();
      }}
      className="min-h-[38px] px-3.5 rounded-2xl bg-[#9146FF]/18 hover:bg-[#9146FF]/30 border border-[#9146FF]/45 text-xs font-bold text-[#DFCCFF] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
      title={pickLang(lang, {
        es: 'Abrir llamada de voz mientras ves la película',
        ca: 'Obrir trucada de veu mentre veus la pel·lícula',
        en: 'Open live voice call while watching',
      })}
    >
      {voiceChat.status === 'requesting' ? (
        <RiffanSpinner size={14} tone="current" />
      ) : (
        <RiffanVoiceCallIcon size={15} tone="current" />
      )}
      <span>
        {voiceChat.status === 'requesting'
          ? pickLang(lang, { es: 'Conectando...', ca: 'Connectant...', en: 'Connecting...' })
          : pickLang(lang, { es: 'Voz', ca: 'Veu', en: 'Voice' })}
      </span>
      {voiceChat.voicePeers.length > 0 && (
        <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/25 text-emerald-200 text-[10px] font-mono tabular-nums">
          {voiceChat.voicePeers.length}
        </span>
      )}
    </button>
  );
};
