import React from 'react';
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Volume2,
} from 'lucide-react';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';

interface GameVoiceBarProps {
  lang: AppLanguage;
  voice: GameVoiceChatState;
  compact?: boolean;
}

export const GameVoiceBar: React.FC<GameVoiceBarProps> = ({
  lang,
  voice,
  compact = false,
}) => {
  const peerCount = voice.voicePeers.length;
  const activeSpeakersCount = voice.speakingUserIds.length;

  return (
    <div className="space-y-1.5">
      <div
        className={`rounded-xl border px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 transition-colors ${
          voice.isJoined
            ? 'bg-emerald-500/[0.08] border-emerald-400/35'
            : 'bg-white/[0.03] border-white/[0.08]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
              voice.isJoined
                ? voice.isMuted
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-300'
                  : 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300'
                : 'bg-[#9146FF]/15 border-[#9146FF]/35 text-[#DFCCFF]'
            }`}
          >
            {voice.status === 'requesting' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : voice.isJoined && voice.isMuted ? (
              <MicOff className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
              <span>
                {voice.isJoined
                  ? pickLang(lang, {
                      es: 'Chat de Voz Activo',
                      ca: 'Xat de Veu Actiu',
                      en: 'Live Voice Active',
                    })
                  : pickLang(lang, {
                      es: 'Llamada de Voz',
                      ca: 'Trucada de Veu',
                      en: 'Voice Call',
                    })}
              </span>
              {peerCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[10px] font-mono tabular-nums text-zinc-200 shrink-0">
                  {peerCount}{' '}
                  {pickLang(lang, {
                    es: peerCount === 1 ? 'jugador' : 'en voz',
                    ca: peerCount === 1 ? 'jugador' : 'en veu',
                    en: peerCount === 1 ? 'in call' : 'in voice',
                  })}
                </span>
              )}
            </div>
            {!compact && (
              <p className="text-[10px] text-zinc-400 truncate">
                {voice.isJoined
                  ? activeSpeakersCount > 0
                    ? pickLang(lang, {
                        es: 'Audio en directo conectado · Hablando ahora',
                        ca: 'Àudio en directe connectat · Parlant ara',
                        en: 'Live peer audio connected · Speaking now',
                      })
                    : voice.isMuted
                    ? pickLang(lang, {
                        es: 'Micrófono silenciado · Escuchando a la mesa',
                        ca: 'Micròfon silenciat · Escoltant la taula',
                        en: 'Microphone muted · Listening to table',
                      })
                    : pickLang(lang, {
                        es: 'Micrófono abierto · Habla con tu sala mientras juegas',
                        ca: 'Micròfon obert · Parla amb la sala mentre jugues',
                        en: 'Microphone live · Talk with players while playing',
                      })
                  : pickLang(lang, {
                      es: 'Habla en directo con los jugadores de la sala',
                      ca: 'Parla en directe amb els jugadors de la sala',
                      en: 'Talk live with room players during the match',
                    })}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {voice.isJoined ? (
            <>
              <button
                type="button"
                aria-pressed={voice.isMuted}
                onClick={() => {
                  triggerHaptic('light');
                  voice.toggleMute();
                }}
                className={`min-h-8 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                  voice.isMuted
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/50 text-rose-200'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50 text-emerald-200'
                }`}
              >
                {voice.isMuted ? (
                  <>
                    <MicOff className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {pickLang(lang, {
                        es: 'Silenciado',
                        ca: 'Silenciat',
                        en: 'Muted',
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {pickLang(lang, {
                        es: 'Micro vivo',
                        ca: 'Micro actiu',
                        en: 'Mic On',
                      })}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  voice.leaveVoice();
                }}
                title={pickLang(lang, {
                  es: 'Salir de llamada',
                  ca: 'Sortir de la trucada',
                  en: 'Leave voice call',
                })}
                aria-label={pickLang(lang, {
                  es: 'Salir de llamada',
                  ca: 'Sortir de la trucada',
                  en: 'Leave voice call',
                })}
                className="min-h-8 px-2 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.1] text-[11px] font-semibold text-zinc-200 hover:text-rose-200 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <PhoneOff className="w-3.5 h-3.5 shrink-0" />
                {!compact && (
                  <span>
                    {pickLang(lang, { es: 'Colgar', ca: 'Penjar', en: 'Leave' })}
                  </span>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={voice.status === 'requesting'}
              onClick={() => {
                triggerHaptic('medium');
                void voice.joinVoice();
              }}
              className="min-h-8 px-3 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] disabled:opacity-60 text-[11px] font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
            >
              <PhoneCall className="w-3.5 h-3.5 shrink-0" />
              <span>
                {voice.status === 'requesting'
                  ? pickLang(lang, {
                      es: 'Conectando...',
                      ca: 'Connectant...',
                      en: 'Connecting...',
                    })
                  : pickLang(lang, {
                      es: 'Unirse a Voz',
                      ca: 'Unir-se a Veu',
                      en: 'Join Voice',
                    })}
              </span>
            </button>
          )}
        </div>
      </div>

      {voice.errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-amber-200"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="leading-snug">{voice.errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void voice.joinVoice()}
            className="px-2.5 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-[10px] font-bold text-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
          </button>
        </div>
      )}
    </div>
  );
};

interface VoiceSpeakerIndicatorProps {
  inVoice: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

export const VoiceSpeakerIndicator: React.FC<VoiceSpeakerIndicatorProps> = ({
  inVoice,
  isSpeaking,
  isMuted,
}) => {
  if (!inVoice) return null;

  if (isMuted) {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500/20 border border-rose-400/45 text-rose-300 shrink-0"
        title="Mic muted"
      >
        <MicOff className="w-2.5 h-2.5" />
      </span>
    );
  }

  if (isSpeaking) {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/60 text-emerald-200 shrink-0"
        title="Speaking"
      >
        <Volume2 className="w-2.5 h-2.5 animate-pulse" />
        <span className="flex items-end gap-[1.5px] h-2.5" aria-hidden="true">
          <span className="w-[2px] h-1.5 bg-emerald-300 rounded-full animate-bounce" />
          <span className="w-[2px] h-2.5 bg-emerald-200 rounded-full animate-pulse" />
          <span className="w-[2px] h-1 bg-emerald-300 rounded-full animate-bounce" />
        </span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 shrink-0"
      title="Voice connected"
    >
      <Mic className="w-2.5 h-2.5" />
    </span>
  );
};
