import React, { useEffect, useMemo, useRef } from 'react';
import { Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
  WatchHistoryItem,
} from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { useGlobalEscape } from '../utils/useGlobalEscape';
import {
  getQuickVoiceChips,
  type VoiceAssistantAppAction,
  type VoiceCandidateItem,
} from './voice/voiceAudioHelpers';
import { VoiceCandidateCards } from './voice/VoiceCandidateCards';
import { VoiceHeaderBar, VoiceOrbAndThread } from './voice/VoiceChatPanel';
import { useVoiceAssistantEngine } from './voice/useVoiceAssistantEngine';

export type { VoiceCandidateItem, VoiceAssistantAppAction };

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  userName: string;
  activeMediaTitle?: string;
  watchHistory?: WatchHistoryItem[];
  onPlayMovie: (movie: CatalogMovie, preferLang?: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
  onPlaySeries: (series: CatalogMovie, targetSeason?: number, targetEpisode?: number) => void;
  onPlayChannel: (channel: SpanishTdtChannel) => void;
  onPlayMatch: (match: SportsMatch) => void;
  onAppAction?: (action: VoiceAssistantAppAction) => void;
}

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  lang,
  userName,
  activeMediaTitle = '',
  watchHistory = [],
  onPlayMovie,
  onPlaySeries,
  onPlayChannel,
  onPlayMatch,
  onAppAction,
}) => {
  useGlobalEscape(onClose, isOpen);

  const cleanName =
    (userName || '').trim() ||
    pickLang(lang, { es: 'amigo', ca: 'amic', en: 'friend', zh: '朋友' });

  const initialGreeting = useMemo(
    () =>
      pickLang(lang, {
        es: `Hola ${cleanName}. Pídeme cualquier peli, serie, canal, partido o háblame de lo que quieras.`,
        ca: `Hola ${cleanName}. Demana’m qualsevol pel·lícula, sèrie, canal, partit o parla’m del que vulguis.`,
        en: `Hi ${cleanName}. Ask me to play movies, series, live channels, matches, or chat with me about anything.`,
        zh: `你好 ${cleanName}。你可以让我播放电影、剧集、直播频道、足球比赛，或者和我聊任何话题。`,
      }),
    [lang, cleanName]
  );

  const engine = useVoiceAssistantEngine({
    isOpen,
    lang,
    cleanName,
    initialGreeting,
    activeMediaTitle,
    watchHistory,
    onClose,
    onPlayMovie,
    onPlaySeries,
    onPlayChannel,
    onPlayMatch,
    onAppAction,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [isOpen]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [engine.messages.length]);

  const quickChips = useMemo(() => getQuickVoiceChips(lang), [lang]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-assistant-title"
        onClick={onClose}
        className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden select-none"
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative w-full max-w-xl h-[86dvh] max-h-[720px] rounded-3xl bg-[#0B0B0F] border border-[#9146FF]/35 shadow-[0_24px_80px_rgba(0,0,0,0.95),0_0_48px_rgba(145,70,255,0.25)] flex flex-col overflow-hidden text-white overscroll-contain"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-44 rounded-full bg-gradient-to-b from-[#9146FF]/35 via-[#00F0FF]/12 to-transparent blur-3xl"
          />

          <VoiceHeaderBar
            lang={lang}
            liveStatus={engine.liveStatus}
            isListening={engine.isListening}
            useLiveApi={engine.useLiveApi}
            handsFree={engine.handsFree}
            voiceMuted={engine.voiceMuted}
            canClearMessages={engine.messages.length > 1}
            onToggleLiveApi={() => {
              triggerHaptic('light');
              const next = !engine.useLiveApi;
              engine.setUseLiveApi(next);
              if (!next) {
                engine.stopGeminiLiveSession();
                engine.setIsListening(false);
              }
            }}
            onToggleHandsFree={() => {
              triggerHaptic('light');
              engine.setHandsFree((prev) => !prev);
            }}
            onToggleMute={() => {
              const next = !engine.voiceMuted;
              engine.setVoiceMuted(next);
              if (next) engine.stopSpeechOutput();
            }}
            onClearMessages={() => {
              engine.stopSpeechOutput();
              engine.setMessages([{ id: 'greeting-reset', role: 'assistant', text: initialGreeting }]);
              engine.setItems([]);
            }}
            onClose={onClose}
          />

          <div
            ref={chatScrollRef}
            className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar overscroll-contain"
          >
            <VoiceOrbAndThread
              lang={lang}
              liveStatus={engine.liveStatus}
              isListening={engine.isListening}
              isRecordingAudio={engine.isRecordingAudio}
              isThinking={engine.isThinking}
              isSpeaking={engine.isSpeaking}
              interimText={engine.interimText}
              messages={engine.messages}
              micNotice={engine.micNotice}
              onMicTap={() => {
                triggerHaptic('medium');
                if (engine.isRecordingAudio) {
                  engine.stopRecordingAndSend();
                } else if (engine.isListening) {
                  engine.stopListening();
                } else {
                  engine.startListening();
                }
              }}
            />

            <VoiceCandidateCards
              lang={lang}
              items={engine.items}
              showQuickChips={engine.messages.length <= 2 && engine.items.length === 0}
              quickChips={quickChips}
              onTriggerCandidatePlay={engine.triggerCandidatePlay}
              onSelectQuickChip={(chip) => void engine.submitVoiceQuery(chip)}
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = engine.inputText.trim();
              if (!clean || engine.isThinking) return;
              engine.sendLiveOrQueryText(clean);
            }}
            className="relative z-10 p-3 bg-[#0B0B0F] border-t border-white/[0.08] flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={engine.inputText}
              onChange={(e) => engine.setInputText(e.target.value)}
              placeholder={pickLang(lang, {
                es: 'Escribe cualquier pregunta o pide qué ver...',
                ca: 'Escriu qualsevol pregunta o demana què veure...',
                en: 'Ask anything or say what you want to watch...',
                zh: '输入任何问题或想看的内容...',
              })}
              className="flex-1 min-h-11 px-3.5 rounded-xl bg-[#10121C] border border-white/10 focus:border-[#9146FF] text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!engine.inputText.trim() || engine.isThinking}
              className="w-11 h-11 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] disabled:opacity-30 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
