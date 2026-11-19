import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
  WatchHistoryItem,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  ConversationMessage,
  findVirtualAssistantVoice,
  resolveSpeechLocale,
  SpeechRecognitionLike,
  VoiceAssistantAppAction,
  VoiceCandidateItem,
} from './voiceAudioHelpers';
import { useGeminiLiveSession } from './useGeminiLiveSession';
import { useVoiceLegacyInput } from './useVoiceLegacyInput';

interface UseVoiceAssistantEngineArgs {
  isOpen: boolean;
  lang: AppLanguage;
  cleanName: string;
  initialGreeting: string;
  activeMediaTitle: string;
  watchHistory: WatchHistoryItem[];
  onClose: () => void;
  onPlayMovie: (movie: CatalogMovie, preferLang?: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
  onPlaySeries: (series: CatalogMovie, targetSeason?: number, targetEpisode?: number) => void;
  onPlayChannel: (channel: SpanishTdtChannel) => void;
  onPlayMatch: (match: SportsMatch) => void;
  onAppAction?: (action: VoiceAssistantAppAction) => void;
}

export function useVoiceAssistantEngine({
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
}: UseVoiceAssistantEngineArgs) {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    { id: 'greeting-init', role: 'assistant', text: initialGreeting },
  ]);
  const [inputText, setInputText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [useLiveApi, setUseLiveApi] = useState(true);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [items, setItems] = useState<VoiceCandidateItem[]>([]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordAutoStopRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);

  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const useLiveApiRef = useRef(useLiveApi);
  useLiveApiRef.current = useLiveApi;

  const itemsRef = useRef<VoiceCandidateItem[]>(items);
  itemsRef.current = items;
  const messagesRef = useRef<ConversationMessage[]>(messages);
  messagesRef.current = messages;
  const mutedRef = useRef(voiceMuted);
  mutedRef.current = voiceMuted;
  const watchHistoryRef = useRef<WatchHistoryItem[]>(watchHistory);
  watchHistoryRef.current = watchHistory;
  const startListeningRef = useRef<() => void>(() => {});
  const stopLegacyAndRecorderRef = useRef<() => void>(() => {});
  const stopSpeechOutputRef = useRef<() => void>(() => {});
  const startLegacyListeningRef = useRef<() => void>(() => {});

  const {
    liveStatus,
    liveWsRef,
    stopLiveAudioPlayback,
    stopGeminiLiveSession,
    startGeminiLiveSession,
  } = useGeminiLiveSession({
    lang,
    cleanName,
    activeMediaTitle,
    onClose,
    onAppAction,
    isOpenRef,
    mutedRef,
    setMessages,
    setInterimText,
    setIsListening,
    setIsThinking,
    setIsSpeaking,
    setMicNotice,
    setItems,
    setUseLiveApi,
    stopLegacyAndRecorderRef,
    stopSpeechOutputRef,
    startLegacyListeningRef,
  });

  const stopSpeechOutput = useCallback(() => {
    setIsSpeaking(false);
    stopLiveAudioPlayback();
    if (speakAbortRef.current) {
      try {
        speakAbortRef.current.abort();
      } catch {
        // ignore
      }
      speakAbortRef.current = null;
    }
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
        audioElRef.current.currentTime = 0;
        audioElRef.current.src = '';
      } catch {
        // ignore
      }
      audioElRef.current = null;
    }
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
  }, [stopLiveAudioPlayback]);

  stopSpeechOutputRef.current = stopSpeechOutput;

  const stopMediaRecorderOnly = useCallback((discard = false) => {
    if (recordAutoStopRef.current !== null) {
      window.clearTimeout(recordAutoStopRef.current);
      recordAutoStopRef.current = null;
    }
    setIsRecordingAudio(false);
    const rec = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try {
        if (discard) {
          rec.onstop = null;
          rec.ondataavailable = null;
        }
        rec.stop();
      } catch {
        // ignore
      }
    }
    if (discard && mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopLegacyAndRecorder = useCallback(() => {
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    stopMediaRecorderOnly(true);
  }, [stopMediaRecorderOnly]);

  stopLegacyAndRecorderRef.current = stopLegacyAndRecorder;

  const stopListening = useCallback(() => {
    stopLegacyAndRecorder();
    stopGeminiLiveSession();
  }, [stopGeminiLiveSession, stopLegacyAndRecorder]);

  const speakWithWebSpeechFallback = useCallback(
    (cleanText: string, onDone?: () => void) => {
      if (mutedRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setIsSpeaking(false);
        onDone?.();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = resolveSpeechLocale(lang);
        utterance.rate = 1.03;
        utterance.pitch = 1.02;
        const bestVoice = findVirtualAssistantVoice(lang);
        if (bestVoice) utterance.voice = bestVoice;
        utterance.onend = () => {
          setIsSpeaking(false);
          onDone?.();
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
          onDone?.();
        };
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
        onDone?.();
      }
    },
    [lang]
  );

  const speakText = useCallback(
    async (textToSpeak: string, allowAutoResume = false) => {
      if (mutedRef.current) return;
      const clean = textToSpeak.replace(/[*_#`~>]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) return;

      stopSpeechOutput();
      const ctrl = new AbortController();
      speakAbortRef.current = ctrl;
      setIsSpeaking(true);

      const handleFinishSpeech = () => {
        setIsSpeaking(false);
        if (allowAutoResume && handsFreeRef.current && isOpenRef.current) {
          window.setTimeout(() => {
            if (isOpenRef.current && handsFreeRef.current) {
              startListeningRef.current();
            }
          }, 350);
        }
      };

      try {
        const res = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean, lang }),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;

        if (res.ok) {
          const data = (await res.json()) as {
            success?: boolean;
            audioBase64?: string;
            mimeType?: string;
          };
          if (data.success && data.audioBase64 && !mutedRef.current) {
            const audio = new Audio(
              `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`
            );
            audioElRef.current = audio;
            audio.onended = () => {
              audioElRef.current = null;
              handleFinishSpeech();
            };
            audio.onerror = () => {
              audioElRef.current = null;
              speakWithWebSpeechFallback(clean, handleFinishSpeech);
            };
            await audio.play().catch(() => {
              audioElRef.current = null;
              speakWithWebSpeechFallback(clean, handleFinishSpeech);
            });
            return;
          }
        }
      } catch {
        if (ctrl.signal.aborted) {
          setIsSpeaking(false);
          return;
        }
      }

      if (!ctrl.signal.aborted && !mutedRef.current) {
        speakWithWebSpeechFallback(clean, handleFinishSpeech);
      } else {
        setIsSpeaking(false);
      }
    },
    [lang, speakWithWebSpeechFallback, stopSpeechOutput]
  );

  const triggerCandidatePlay = useCallback(
    (candidate: VoiceCandidateItem) => {
      triggerHaptic('medium');
      stopListening();
      stopSpeechOutput();
      if (candidate.kind === 'channel' && candidate.channel) {
        onPlayChannel(candidate.channel);
        onClose();
      } else if (candidate.kind === 'match' && candidate.match) {
        onPlayMatch(candidate.match);
        onClose();
      } else if (candidate.kind === 'series' && candidate.media) {
        onPlaySeries(
          candidate.media,
          candidate.targetSeason || candidate.media.seasonNumber || 1,
          candidate.targetEpisode || candidate.media.episodeNumber || 1
        );
        onClose();
      } else if (candidate.media) {
        onPlayMovie(candidate.media, 'ES');
        onClose();
      }
    },
    [onClose, onPlayChannel, onPlayMatch, onPlayMovie, onPlaySeries, stopListening, stopSpeechOutput]
  );

  const submitVoiceQuery = useCallback(
    async (rawQuery: string) => {
      const clean = rawQuery.trim();
      if (!clean) return;
      stopListening();
      stopSpeechOutput();
      setIsThinking(true);
      setMicNotice(null);
      setInterimText('');
      setInputText('');

      const userTurn: ConversationMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        text: clean,
      };
      const priorHistory = messagesRef.current.slice(-10).map((m) => ({
        role: m.role,
        text: m.text,
      }));
      setMessages((prev) => [...prev, userTurn]);

      try {
        const historySlice = watchHistoryRef.current.slice(0, 8).map((h) => ({
          id: h.id,
          mediaType: h.mediaType,
          tmdbId: h.tmdbId,
          title: h.title,
          subtitle: h.subtitle,
          poster: h.poster,
          backdrop: h.backdrop,
          year: h.year,
          season: h.season,
          episode: h.episode,
          episodeTitle: h.episodeTitle,
          preferLang: h.preferLang,
          watchedAt: h.watchedAt,
        }));

        const res = await fetch('/api/ai/voice-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: clean,
            userName: cleanName,
            lang,
            previousItems: itemsRef.current,
            watchHistory: historySlice,
            history: priorHistory,
            activeMediaTitle,
          }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          spokenReply?: string;
          autoPlay?: boolean;
          action?: VoiceAssistantAppAction;
          items?: VoiceCandidateItem[];
        };

        const reply =
          data.spokenReply ||
          pickLang(lang, {
            es: 'Aquí tienes lo que he encontrado.',
            ca: 'Aquí tens el que he trobat.',
            en: 'Here is what I found.',
            zh: '这是我为你找到的内容。',
          });
        const nextItems = Array.isArray(data.items) ? data.items : [];

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            text: reply,
          },
        ]);
        setItems(nextItems);
        setIsThinking(false);

        if (data.action && onAppAction) {
          void speakText(reply, false);
          window.setTimeout(() => {
            onAppAction(data.action!);
            if (
              data.action?.type === 'open_world' ||
              data.action?.type === 'surprise_me' ||
              data.action?.type === 'open_friends'
            ) {
              onClose();
            }
          }, 550);
          return;
        }

        void speakText(reply, true);
      } catch {
        setIsThinking(false);
        const errMsg = pickLang(lang, {
          es: 'No pude conectar con el asistente ahora mismo. Inténtalo de nuevo.',
          ca: 'No he pogut connectar amb l’assistent ara mateix. Torna-ho a provar.',
          en: 'Could not reach the assistant right now. Please try again.',
          zh: '暂时无法连接语音助手，请稍后再试。',
        });
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: 'assistant', text: errMsg },
        ]);
        void speakText(errMsg, false);
      }
    },
    [
      activeMediaTitle,
      cleanName,
      lang,
      onAppAction,
      onClose,
      speakText,
      stopListening,
      stopSpeechOutput,
    ]
  );

  const { stopRecordingAndSend, startLegacyListening } = useVoiceLegacyInput({
    lang,
    recognitionRef,
    mediaRecorderRef,
    mediaStreamRef,
    audioChunksRef,
    recordAutoStopRef,
    stopListening,
    stopSpeechOutput,
    stopMediaRecorderOnly,
    submitVoiceQuery,
    setIsListening,
    setIsRecordingAudio,
    setIsThinking,
    setInterimText,
    setMicNotice,
  });

  startLegacyListeningRef.current = startLegacyListening;

  const startListening = useCallback(() => {
    if (useLiveApiRef.current) {
      void startGeminiLiveSession();
      return;
    }
    startLegacyListening();
  }, [startGeminiLiveSession, startLegacyListening]);

  startListeningRef.current = startListening;

  useEffect(() => {
    if (isOpen) {
      setMessages([{ id: 'greeting-init', role: 'assistant', text: initialGreeting }]);
      setInputText('');
      setInterimText('');
      setItems([]);
      setMicNotice(null);
      return () => {
        stopListening();
        stopSpeechOutput();
      };
    } else {
      stopListening();
      stopSpeechOutput();
    }
  }, [initialGreeting, isOpen, stopListening, stopSpeechOutput]);

  const sendLiveOrQueryText = useCallback(
    (clean: string) => {
      if (
        liveWsRef.current &&
        liveWsRef.current.readyState === WebSocket.OPEN &&
        liveStatus === 'live'
      ) {
        const uTurn: ConversationMessage = {
          id: `u-live-txt-${Date.now()}`,
          role: 'user',
          text: clean,
        };
        setMessages((prev) => [...prev, uTurn]);
        setInputText('');
        liveWsRef.current.send(JSON.stringify({ text: clean }));
      } else {
        void submitVoiceQuery(clean);
      }
    },
    [liveStatus, submitVoiceQuery]
  );

  return {
    messages,
    setMessages,
    inputText,
    setInputText,
    interimText,
    isListening,
    setIsListening,
    isRecordingAudio,
    isThinking,
    isSpeaking,
    voiceMuted,
    setVoiceMuted,
    handsFree,
    setHandsFree,
    useLiveApi,
    setUseLiveApi,
    liveStatus,
    micNotice,
    items,
    setItems,
    stopSpeechOutput,
    stopGeminiLiveSession,
    stopListening,
    stopRecordingAndSend,
    startListening,
    triggerCandidatePlay,
    submitVoiceQuery,
    sendLiveOrQueryText,
  };
}
