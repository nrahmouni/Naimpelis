import React from 'react';
import {
  Loader2,
  Mic,
  MicOff,
  Radio,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanVoiceMicIcon } from '../ui/RiffanIcons';
import type { ConversationMessage } from './voiceAudioHelpers';

interface VoiceHeaderBarProps {
  lang: AppLanguage;
  liveStatus: 'idle' | 'connecting' | 'live';
  isListening: boolean;
  useLiveApi: boolean;
  handsFree: boolean;
  voiceMuted: boolean;
  canClearMessages: boolean;
  onToggleLiveApi: () => void;
  onToggleHandsFree: () => void;
  onToggleMute: () => void;
  onClearMessages: () => void;
  onClose: () => void;
}

export const VoiceHeaderBar: React.FC<VoiceHeaderBarProps> = ({
  lang,
  liveStatus,
  isListening,
  useLiveApi,
  handsFree,
  voiceMuted,
  canClearMessages,
  onToggleLiveApi,
  onToggleHandsFree,
  onToggleMute,
  onClearMessages,
  onClose,
}) => {
  return (
    <div className="relative z-10 px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-2 border-b border-white/[0.08]">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#9146FF] to-[#00F0FF] p-[1.5px] shadow-[0_0_16px_rgba(145,70,255,0.45)] shrink-0">
          <div className="w-full h-full rounded-[14px] bg-[#10121C] flex items-center justify-center text-[#BF94FF]">
            <RiffanVoiceMicIcon
              size={20}
              animate={liveStatus === 'live' || isListening ? 'always' : 'hover'}
            />
          </div>
        </div>
        <div className="min-w-0">
          <h3 id="voice-assistant-title" className="font-display font-bold text-sm text-white truncate">
            {pickLang(lang, {
              es: 'RiffanAI · Voz y Conversación',
              ca: 'RiffanAI · Veu i Conversa',
              en: 'RiffanAI · Voice & Chat',
              zh: 'RiffanAI · 智能语音对话',
            })}
          </h3>
          <p className="text-[11px] text-zinc-400 truncate">
            {pickLang(lang, {
              es: 'Habla de cualquier tema, pide contenido o controla el reproductor',
              ca: 'Parla de qualsevol tema, demana contingut o controla el reproductor',
              en: 'Talk about anything, play content, or control the player',
              zh: '畅聊任何话题、点播内容或语音控制播放器',
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onToggleLiveApi}
          title={pickLang(lang, {
            es: 'Conversación bidireccional natural con Gemini Live API',
            ca: 'Conversa bidireccional natural amb Gemini Live API',
            en: 'Natural bidirectional voice via Gemini Live API',
            zh: '使用 Gemini Live API 实时自然语音对话',
          })}
          className={`h-8 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
            useLiveApi
              ? liveStatus === 'live'
                ? 'bg-emerald-500/25 border border-emerald-400/50 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-[#9146FF]/25 border border-[#9146FF]/50 text-[#E9D5FF]'
              : 'bg-[#10121C] hover:bg-white/[0.08] text-zinc-400 border border-white/[0.08]'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              liveStatus === 'live'
                ? 'bg-[#00F593] animate-pulse'
                : useLiveApi
                ? 'bg-[#BF94FF]'
                : 'bg-zinc-500'
            }`}
          />
          <span>Live</span>
        </button>

        <button
          type="button"
          onClick={onToggleHandsFree}
          title={pickLang(lang, {
            es: 'Modo manos libres (escucha tras responder)',
            ca: 'Mode mans lliures',
            en: 'Hands-free conversation mode',
            zh: '免提连续对话模式',
          })}
          className={`h-8 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
            handsFree
              ? 'bg-[#9146FF] text-white shadow-[0_0_14px_rgba(145,70,255,0.45)]'
              : 'bg-[#10121C] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.08]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {pickLang(lang, { es: 'Continuo', ca: 'Continu', en: 'Hands-free', zh: '连续' })}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={voiceMuted ? 'Activar voz' : 'Silenciar voz'}
          className="w-8 h-8 rounded-xl bg-[#10121C] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          {voiceMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {canClearMessages && (
          <button
            type="button"
            onClick={onClearMessages}
            aria-label={pickLang(lang, { es: 'Limpiar conversación', ca: 'Netejar xat', en: 'Clear chat', zh: '清空对话' })}
            className="w-8 h-8 rounded-xl bg-[#10121C] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          aria-label={pickLang(lang, { es: 'Cerrar asistente', ca: 'Tancar', en: 'Close assistant', zh: '关闭' })}
          className="w-8 h-8 rounded-xl bg-[#10121C] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

interface VoiceOrbAndThreadProps {
  lang: AppLanguage;
  liveStatus: 'idle' | 'connecting' | 'live';
  isListening: boolean;
  isRecordingAudio: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  interimText: string;
  messages: ConversationMessage[];
  micNotice: string | null;
  onMicTap: () => void;
}

export const VoiceOrbAndThread: React.FC<VoiceOrbAndThreadProps> = ({
  lang,
  liveStatus,
  isListening,
  isRecordingAudio,
  isThinking,
  isSpeaking,
  interimText,
  messages,
  micNotice,
  onMicTap,
}) => {
  return (
    <>
      <div className="flex flex-col items-center justify-center pt-1">
        <div className="relative flex items-center justify-center">
          {isListening && (
            <>
              <span className="absolute w-24 h-24 rounded-full bg-[#9146FF]/35 animate-ping opacity-65" />
              <span className="absolute w-32 h-32 rounded-full bg-[#00F0FF]/18 blur-md animate-pulse" />
            </>
          )}
          {isSpeaking && !isListening && (
            <span className="absolute w-24 h-24 rounded-full border-2 border-[#9146FF]/60 animate-pulse" />
          )}
          {isThinking && (
            <span className="absolute w-24 h-24 rounded-full border-2 border-dashed border-[#BF94FF] animate-spin opacity-85" />
          )}

          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={onMicTap}
            aria-label={
              isRecordingAudio
                ? 'Enviar audio'
                : isListening
                ? 'Detener micrófono'
                : 'Iniciar micrófono'
            }
            className={`relative z-10 w-18 h-18 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
              isRecordingAudio
                ? 'bg-gradient-to-tr from-rose-500 to-[#9146FF] text-white shadow-[0_0_32px_rgba(244,63,94,0.65)] scale-105'
                : isListening
                ? 'bg-gradient-to-tr from-[#9146FF] to-[#00F0FF] text-white shadow-[0_0_32px_rgba(145,70,255,0.7)] scale-105'
                : isThinking
                ? 'bg-[#10121C] text-[#BF94FF] border border-[#9146FF]/50'
                : isSpeaking
                ? 'bg-[#9146FF] text-white shadow-[0_0_24px_rgba(145,70,255,0.55)]'
                : 'bg-[#10121C] hover:bg-[#191B2C] text-zinc-200 border border-white/15 hover:border-[#9146FF]/70'
            }`}
          >
            {isThinking ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : isRecordingAudio ? (
              <Square className="w-6 h-6 fill-current" />
            ) : isListening ? (
              <Mic className="w-7 h-7" />
            ) : (
              <MicOff className="w-7 h-7 text-zinc-300" />
            )}
          </motion.button>
        </div>

        <p className="text-[11px] font-semibold text-zinc-400 tracking-wider uppercase mt-2.5 text-center">
          {liveStatus === 'live'
            ? isSpeaking
              ? pickLang(lang, { es: 'Gemini Live hablando · Interrumpe al hablar', ca: 'Gemini Live parlant', en: 'Gemini Live speaking · Speak to interrupt', zh: 'Gemini Live 正在回复 · 说话可随时打断' })
              : pickLang(lang, { es: 'Gemini Live conectado · Habla natural', ca: 'Gemini Live connectat · Parla natural', en: 'Gemini Live connected · Speak naturally', zh: 'Gemini Live 已连接 · 请自然说话' })
            : isThinking
            ? pickLang(lang, { es: 'Conectando...', ca: 'Connectant...', en: 'Connecting...', zh: '正在连接...' })
            : isRecordingAudio
            ? pickLang(lang, { es: 'Grabando audio · Pulsa para enviar', ca: 'Gravant · Prem per enviar', en: 'Recording · Tap to send', zh: '正在录音 · 点击发送' })
            : isListening
            ? pickLang(lang, { es: 'Escuchando... Habla ahora', ca: 'Escoltant... Parla ara', en: 'Listening... Speak now', zh: '正在聆听 · 请说话' })
            : isSpeaking
            ? pickLang(lang, { es: 'Hablando... Pulsa el micro para interrumpir', ca: 'Parlant... Prem per parlar', en: 'Speaking... Tap mic to interrupt', zh: '正在回复 · 点击麦克风可打断' })
            : pickLang(lang, { es: 'Pulsa el micro para conversación natural', ca: 'Prem el micro per parlar', en: 'Tap mic for natural voice', zh: '点击麦克风开始自然对话' })}
        </p>
      </div>

      {interimText && (
        <div className="px-3.5 py-2 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/40 text-xs sm:text-sm text-[#E9D5FF] text-center">
          “{interimText}”
        </div>
      )}

      <div className="space-y-2.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#9146FF] text-white rounded-br-sm shadow-[0_6px_20px_rgba(145,70,255,0.28)]'
                  : 'bg-[#10121C] border border-white/[0.08] text-zinc-100 rounded-bl-sm'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {micNotice && (
        <p className="text-xs text-amber-300/90 text-center bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          {micNotice}
        </p>
      )}
    </>
  );
};
