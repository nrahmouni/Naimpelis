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

interface VoiceWaveBarsProps {
  active: boolean;
  level?: number;
  muted?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const WAVE_WEIGHTS = [0.68, 1.0, 0.84, 0.56];
const WAVE_FALLBACK_CLASSES = ['nc-eq-bar-1', 'nc-eq-bar-2', 'nc-eq-bar-3', 'nc-eq-bar-2'];

export const VoiceWaveBars: React.FC<VoiceWaveBarsProps> = ({
  active,
  level = 0,
  muted = false,
  size = 'sm',
  className = '',
}) => {
  const heightCls = size === 'md' ? 'h-3.5' : 'h-2.5';
  const barWidthCls = size === 'md' ? 'w-[2.5px]' : 'w-[2px]';
  const normalized = Math.max(0, Math.min(1, level));

  return (
    <span
      className={`inline-flex items-end gap-[2px] ${heightCls} shrink-0 ${className}`}
      aria-hidden="true"
    >
      {WAVE_WEIGHTS.map((weight, idx) => {
        if (muted) {
          return (
            <span
              key={idx}
              className={`${barWidthCls} h-full rounded-full bg-rose-300/65 origin-bottom transition-transform duration-150`}
              style={{ transform: 'scaleY(0.22)' }}
            />
          );
        }

        if (active && normalized > 0.04) {
          const scale = Math.max(0.26, Math.min(1, 0.24 + normalized * weight * 0.92));
          return (
            <span
              key={idx}
              className={`${barWidthCls} h-full rounded-full bg-emerald-200 origin-bottom transition-transform duration-75`}
              style={{ transform: `scaleY(${scale.toFixed(2)})` }}
            />
          );
        }

        if (active) {
          return (
            <span
              key={idx}
              className={`${barWidthCls} h-full rounded-full bg-emerald-200 origin-bottom ${WAVE_FALLBACK_CLASSES[idx]}`}
            />
          );
        }

        return (
          <span
            key={idx}
            className={`${barWidthCls} h-full rounded-full bg-emerald-300/55 origin-bottom transition-transform duration-150`}
            style={{ transform: `scaleY(${(0.24 + (idx % 2) * 0.1).toFixed(2)})` }}
          />
        );
      })}
    </span>
  );
};

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
  const isLocalSpeaking =
    voice.isJoined &&
    !voice.isMuted &&
    (voice.localAudioLevel > 0.06 || voice.speakingUserIds.length > 0);

  return (
    <div className="space-y-1.5">
      <div
        className={`rounded-xl border px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 transition-all ${
          voice.isJoined
            ? isLocalSpeaking
              ? 'bg-emerald-500/[0.14] border-emerald-400/65 shadow-[0_0_16px_rgba(16,185,129,0.22)]'
              : 'bg-emerald-500/[0.08] border-emerald-400/35'
            : 'bg-white/[0.03] border-white/[0.08]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
              voice.isJoined
                ? voice.isMuted
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-300'
                  : isLocalSpeaking
                  ? 'bg-emerald-500/30 border-emerald-300 text-emerald-100 ring-2 ring-emerald-400/60'
                  : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-300'
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
                      es: 'Llamada de Voz Activa',
                      ca: 'Trucada de Veu Activa',
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
                    es: peerCount === 1 ? 'en voz' : 'en voz',
                    ca: peerCount === 1 ? 'en veu' : 'en veu',
                    en: peerCount === 1 ? 'in call' : 'in voice',
                  })}
                </span>
              )}
            </div>
            {!compact && (
              <p className="text-[10px] text-zinc-400 truncate">
                {voice.isJoined
                  ? isLocalSpeaking
                    ? pickLang(lang, {
                        es: 'Audio en directo conectado · Detectando voz',
                        ca: 'Àudio en directe connectat · Detectant veu',
                        en: 'Live peer audio connected · Voice detected',
                      })
                    : voice.isMuted
                    ? pickLang(lang, {
                        es: 'Micrófono silenciado · Escuchando a la sala',
                        ca: 'Micròfon silenciat · Escoltant la sala',
                        en: 'Microphone muted · Listening to room',
                      })
                    : pickLang(lang, {
                        es: 'Micrófono abierto · Habla con tu sala mientras ves contenido',
                        ca: 'Micròfon obert · Parla amb la sala mentre veus contingut',
                        en: 'Microphone live · Talk with room members',
                      })
                  : pickLang(lang, {
                      es: 'Habla en directo con los miembros de la sala',
                      ca: 'Parla en directe amb els membres de la sala',
                      en: 'Talk live with room members',
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
                className={`min-h-8 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all border ${
                  voice.isMuted
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/50 text-rose-200'
                    : isLocalSpeaking
                    ? 'bg-emerald-500/30 hover:bg-emerald-500/40 border-emerald-300 text-emerald-100 ring-1 ring-emerald-400/70'
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
                    <VoiceWaveBars active={isLocalSpeaking} level={voice.localAudioLevel} size="md" />
                    <span>
                      {voice.localAudioLevel > 0.08
                        ? pickLang(lang, {
                            es: 'Hablando',
                            ca: 'Parlant',
                            en: 'Speaking',
                          })
                        : pickLang(lang, {
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
                  es: 'Colgar llamada',
                  ca: 'Penjar trucada',
                  en: 'Leave voice call',
                })}
                aria-label={pickLang(lang, {
                  es: 'Colgar llamada',
                  ca: 'Penjar trucada',
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
              {voice.status === 'requesting' ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              ) : (
                <PhoneCall className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {voice.status === 'requesting'
                  ? pickLang(lang, {
                      es: 'Conectando...',
                      ca: 'Connectant...',
                      en: 'Connecting...',
                    })
                  : pickLang(lang, {
                      es: 'Abrir voz',
                      ca: 'Obrir veu',
                      en: 'Open Voice',
                    })}
              </span>
            </button>
          )}
        </div>
      </div>

      {voice.audioPlaybackBlocked && voice.isJoined && (
        <div
          role="status"
          className="rounded-xl border border-[#9146FF]/45 bg-[#9146FF]/15 px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-[#DFCCFF]"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Volume2 className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
            <span className="leading-snug">
              {pickLang(lang, {
                es: 'Toca para activar el audio de los miembros en este dispositivo.',
                ca: 'Toca per activar l’àudio dels membres en aquest dispositiu.',
                en: 'Tap to enable remote members audio on this device.',
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              voice.resumeRemoteAudio();
            }}
            className="px-2.5 py-1 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] text-[10px] font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            {pickLang(lang, { es: 'Activar audio', ca: 'Activar àudio', en: 'Enable Audio' })}
          </button>
        </div>
      )}

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
  audioLevel?: number;
}

export const VoiceSpeakerIndicator: React.FC<VoiceSpeakerIndicatorProps> = ({
  inVoice,
  isSpeaking,
  isMuted,
  audioLevel = 0,
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

  const speakingActive = isSpeaking || audioLevel > 0.06;
  if (speakingActive) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/75 text-emerald-100 shadow-[0_0_10px_rgba(16,185,129,0.5)] shrink-0"
        title="Speaking"
      >
        <Volume2 className="w-2.5 h-2.5 text-emerald-200 shrink-0" />
        <VoiceWaveBars active level={audioLevel} size="sm" />
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
