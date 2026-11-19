import React from 'react';
import { Loader2, Mic, MicOff, PhoneCall, PhoneOff, UserPlus } from 'lucide-react';
import type { AppLanguage, Participant } from '../../types';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { VoiceWaveBars } from '../games/GameVoiceBar';

export function getParticipantInitials(name: string): string {
  const clean = (name || 'U').trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

interface PartyChatVoiceStripProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  voiceChat?: GameVoiceChatState;
  onOpenInviteAction: () => void;
}

export const PartyChatVoiceStrip: React.FC<PartyChatVoiceStripProps> = ({
  lang,
  currentUser,
  participants,
  voiceChat,
  onOpenInviteAction,
}) => {
  const t = UI_COPY[lang];
  return (
    <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 shrink-0">
          {pickLang(lang, { es: 'En sala', ca: 'A la sala', en: 'In room' })}:
        </span>
        <div className="flex items-center -space-x-1.5 shrink-0">
          {participants.slice(0, 5).map((p) => {
            const inVoice = Boolean(voiceChat?.voicePeers.some((vp) => vp.userId === p.id));
            const isSpeaking = Boolean(
              voiceChat?.speakingUserIds.includes(p.id) || (voiceChat?.audioLevels?.[p.id] ?? 0) > 0.06
            );
            return (
              <div
                key={p.id}
                title={`${p.name} · ${
                  p.id === currentUser.id
                    ? t.you
                    : pickLang(lang, { es: 'En sala', ca: 'A la sala', en: 'In room' })
                }`}
                className={`relative w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${
                  isSpeaking
                    ? 'border-emerald-400 ring-2 ring-emerald-400/50'
                    : inVoice
                    ? 'border-emerald-400/80'
                    : 'border-[#12131C]'
                }`}
                style={{ backgroundColor: p.color || '#9146FF' }}
              >
                {p.avatar === '📺' ? '📺' : getParticipantInitials(p.name)}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#12131C] ${
                    inVoice ? 'bg-emerald-400 animate-pulse' : 'bg-[#00F593]'
                  }`}
                />
              </div>
            );
          })}
        </div>
        {participants.length > 5 && (
          <span className="text-[10px] text-zinc-400 font-bold tabular-nums shrink-0">
            +{participants.length - 5}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {voiceChat &&
          (voiceChat.isJoined ? (
            <>
              <button
                type="button"
                aria-pressed={voiceChat.isMuted}
                onClick={() => {
                  triggerHaptic('light');
                  voiceChat.toggleMute();
                }}
                title={
                  voiceChat.isMuted
                    ? pickLang(lang, { es: 'Activar micrófono', ca: 'Activar micròfon', en: 'Unmute microphone' })
                    : pickLang(lang, { es: 'Silenciar micrófono', ca: 'Silenciar micròfon', en: 'Mute microphone' })
                }
                aria-label={
                  voiceChat.isMuted
                    ? pickLang(lang, { es: 'Activar micrófono', ca: 'Activar micròfon', en: 'Unmute microphone' })
                    : pickLang(lang, { es: 'Silenciar micrófono', ca: 'Silenciar micròfon', en: 'Mute microphone' })
                }
                className={`min-h-[26px] px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all shrink-0 ${
                  voiceChat.isMuted
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/45 text-rose-200'
                    : voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0
                    ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-400/60 text-emerald-100 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                    : 'bg-emerald-500/18 hover:bg-emerald-500/28 border-emerald-400/40 text-emerald-200'
                }`}
              >
                {voiceChat.isMuted ? (
                  <>
                    <MicOff className="w-3 h-3 shrink-0" />
                    <span>{pickLang(lang, { es: 'Silenc.', ca: 'Silenc.', en: 'Muted' })}</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3 h-3 shrink-0" />
                    <VoiceWaveBars
                      active={voiceChat.localAudioLevel > 0.06 || voiceChat.speakingUserIds.length > 0}
                      level={voiceChat.localAudioLevel}
                      size="sm"
                    />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  voiceChat.leaveVoice();
                }}
                title={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'End call' })}
                aria-label={pickLang(lang, { es: 'Colgar llamada', ca: 'Penjar trucada', en: 'End call' })}
                className="min-h-[26px] px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/45 text-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all shrink-0"
              >
                <PhoneOff className="w-3 h-3 shrink-0" />
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={voiceChat.status === 'requesting'}
              onClick={() => {
                triggerHaptic('medium');
                void voiceChat.joinVoice();
              }}
              title={
                voiceChat.voicePeers.length > 0
                  ? pickLang(lang, {
                      es: 'Unirse a la llamada de voz de la sala',
                      ca: 'Unir-se a la trucada de veu de la sala',
                      en: 'Join room voice call',
                    })
                  : pickLang(lang, {
                      es: 'Iniciar llamada de voz con la sala',
                      ca: 'Iniciar trucada de veu amb la sala',
                      en: 'Start room voice call',
                    })
              }
              aria-label={pickLang(lang, { es: 'Llamar', ca: 'Trucar', en: 'Call' })}
              className={`min-h-[26px] px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all shrink-0 disabled:opacity-60 ${
                voiceChat.voicePeers.length > 0
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/45 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/35 text-emerald-200'
              }`}
            >
              {voiceChat.status === 'requesting' ? (
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              ) : (
                <PhoneCall
                  className={`w-3 h-3 shrink-0 ${
                    voiceChat.voicePeers.length > 0 ? 'animate-pulse text-emerald-300' : ''
                  }`}
                />
              )}
              <span>
                {voiceChat.status === 'requesting'
                  ? pickLang(lang, { es: 'Conectando...', ca: 'Connectant...', en: 'Joining...' })
                  : voiceChat.voicePeers.length > 0
                  ? pickLang(lang, {
                      es: `Unirse (${voiceChat.voicePeers.length})`,
                      ca: `Unir-se (${voiceChat.voicePeers.length})`,
                      en: `Join (${voiceChat.voicePeers.length})`,
                    })
                  : pickLang(lang, { es: 'Llamar', ca: 'Trucar', en: 'Call' })}
              </span>
            </button>
          ))}

        <button
          type="button"
          onClick={onOpenInviteAction}
          aria-label={pickLang(lang, {
            es: 'Invitar a la sala',
            ca: 'Convidar a la sala',
            en: 'Invite to room',
          })}
          className="min-h-[26px] px-2 rounded-lg bg-[#9146FF]/20 hover:bg-[#9146FF]/35 border border-[#9146FF]/40 text-[#D8B4FE] text-[11px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all shrink-0"
        >
          <UserPlus className="w-3 h-3 shrink-0" />
          <span>{pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}</span>
        </button>
      </div>
    </div>
  );
};
