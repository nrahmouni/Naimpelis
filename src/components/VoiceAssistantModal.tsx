import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Send,
  Sparkles,
  Tv,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Loader2,
  Radio,
  Square,
  Trash2,
} from 'lucide-react';
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
import { PosterImage } from './ui/PosterImage';

export interface VoiceCandidateItem {
  kind: 'channel' | 'movie' | 'series' | 'match';
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  targetSeason?: number;
  targetEpisode?: number;
  channel?: SpanishTdtChannel;
  media?: CatalogMovie & { targetSeason?: number; targetEpisode?: number };
  match?: SportsMatch;
}

export interface VoiceAssistantAppAction {
  type: 'open_world' | 'player_control' | 'open_friends' | 'surprise_me';
  payload?: string;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

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

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [idx: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: {
    length: number;
    [idx: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function resolveSpeechLocale(lang: AppLanguage): string {
  if (lang === 'ca') return 'ca-ES';
  if (lang === 'en') return 'en-US';
  if (lang === 'zh') return 'zh-CN';
  return 'es-ES';
}

function findVirtualAssistantVoice(targetLang: AppLanguage): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const prefix =
    targetLang === 'ca' ? 'ca' : targetLang === 'en' ? 'en' : targetLang === 'zh' ? 'zh' : 'es';
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const pool = langVoices.length > 0 ? langVoices : voices;

  const priorityKeywords = [
    'google',
    'natural',
    'neural',
    'online',
    'elvira',
    'helena',
    'monica',
    'mónica',
    'lucia',
    'lucía',
    'alvaro',
    'jorge',
    'samantha',
    'xiaoxiao',
    'tingting',
  ];

  for (const kw of priorityKeywords) {
    const found = pool.find((v) => v.name.toLowerCase().includes(kw));
    if (found) return found;
  }

  return pool[0] || null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

function downsampleTo16k(float32: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000 || inputSampleRate <= 0) return float32;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.max(1, Math.round(float32.length / ratio));
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.min(float32.length, Math.round((offsetResult + 1) * ratio));
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i += 1) {
      accum += float32[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
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
  const cleanName =
    (userName || '').trim() || pickLang(lang, { es: 'amigo', ca: 'amic', en: 'friend', zh: '朋友' });

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
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [items, setItems] = useState<VoiceCandidateItem[]>([]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordAutoStopRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);

  // Gemini Live Bidirectional Audio Refs
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveMicStreamRef = useRef<MediaStream | null>(null);
  const liveInputCtxRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveOutputCtxRef = useRef<AudioContext | null>(null);
  const liveNextStartTimeRef = useRef<number>(0);
  const liveActiveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveUserMsgIdRef = useRef<string | null>(null);
  const liveUserBufRef = useRef<string>('');
  const liveAssistantMsgIdRef = useRef<string | null>(null);
  const liveAssistantBufRef = useRef<string>('');
  const livePendingAutoPlayTimerRef = useRef<number | null>(null);

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
  const inputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const watchHistoryRef = useRef<WatchHistoryItem[]>(watchHistory);
  watchHistoryRef.current = watchHistory;
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, interimText, isThinking]);

  const stopLiveAudioPlayback = useCallback(() => {
    liveActiveSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    });
    liveActiveSourcesRef.current.clear();
    liveNextStartTimeRef.current = 0;
  }, []);

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

  const stopGeminiLiveSession = useCallback(() => {
    if (livePendingAutoPlayTimerRef.current !== null) {
      window.clearTimeout(livePendingAutoPlayTimerRef.current);
      livePendingAutoPlayTimerRef.current = null;
    }
    if (liveProcessorRef.current) {
      try {
        liveProcessorRef.current.onaudioprocess = null;
        liveProcessorRef.current.disconnect();
      } catch {
        // ignore
      }
      liveProcessorRef.current = null;
    }
    if (liveInputCtxRef.current) {
      try {
        void liveInputCtxRef.current.close();
      } catch {
        // ignore
      }
      liveInputCtxRef.current = null;
    }
    if (liveMicStreamRef.current) {
      liveMicStreamRef.current.getTracks().forEach((t) => t.stop());
      liveMicStreamRef.current = null;
    }
    if (liveWsRef.current) {
      try {
        liveWsRef.current.onopen = null;
        liveWsRef.current.onmessage = null;
        liveWsRef.current.onerror = null;
        liveWsRef.current.onclose = null;
        liveWsRef.current.close();
      } catch {
        // ignore
      }
      liveWsRef.current = null;
    }
    stopLiveAudioPlayback();
    if (liveOutputCtxRef.current) {
      try {
        void liveOutputCtxRef.current.close();
      } catch {
        // ignore
      }
      liveOutputCtxRef.current = null;
    }
    liveUserMsgIdRef.current = null;
    liveUserBufRef.current = '';
    liveAssistantMsgIdRef.current = null;
    liveAssistantBufRef.current = '';
    setLiveStatus('idle');
  }, [stopLiveAudioPlayback]);

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

  const stopListening = useCallback(() => {
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
    stopGeminiLiveSession();
  }, [stopGeminiLiveSession, stopMediaRecorderOnly]);

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
            if (data.action?.type === 'open_world' || data.action?.type === 'surprise_me' || data.action?.type === 'open_friends') {
              onClose();
            }
          }, 550);
          return;
        }

        if (data.autoPlay && nextItems.length > 0) {
          void speakText(reply, false);
          window.setTimeout(() => {
            triggerCandidatePlay(nextItems[0]);
          }, 600);
        } else {
          void speakText(reply, true);
        }
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
      triggerCandidatePlay,
    ]
  );

  // Universal fallback microphone recorder -> /api/ai/transcribe (works even when Web Speech API is blocked)
  const startAudioRecorderFallback = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicNotice(
        pickLang(lang, {
          es: 'Tu navegador no permite capturar audio; escribe tu mensaje abajo.',
          ca: 'El navegador no permet capturar àudio; escriu el missatge a sota.',
          en: 'Audio capture is not available in this browser; type below.',
          zh: '当前浏览器不支持录音；请在下方输入消息。',
        })
      );
      inputRef.current?.focus();
      return;
    }

    stopListening();
    stopSpeechOutput();
    setMicNotice(null);
    setInterimText('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidate = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      const recorder = mimeCandidate ? new MediaRecorder(stream, { mimeType: mimeCandidate }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const usedMime = recorder.mimeType || 'audio/webm';
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        setIsRecordingAudio(false);
        setIsListening(false);

        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: usedMime });
        if (blob.size < 400) return;

        setIsThinking(true);
        try {
          const base64 = await blobToBase64(blob);
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType: usedMime, lang }),
          });
          const data = (await res.json()) as { success?: boolean; transcript?: string };
          if (data.success && data.transcript?.trim()) {
            await submitVoiceQuery(data.transcript.trim());
            return;
          }
          setIsThinking(false);
          setMicNotice(
            pickLang(lang, {
              es: 'No se escuchó voz clara. Pulsa el micro e inténtalo de nuevo.',
              ca: 'No s’ha sentit veu clara. Prem el micro i torna-ho a provar.',
              en: 'No clear voice detected. Tap the mic to retry.',
              zh: '未检测到清晰语音，请点击麦克风重试。',
            })
          );
        } catch {
          setIsThinking(false);
          setMicNotice(
            pickLang(lang, {
              es: 'Error al transcribir audio. Escribe abajo o reintenta.',
              ca: 'Error en transcriure l’àudio. Escriu a sota o reintenta.',
              en: 'Audio transcription error. Type below or retry.',
              zh: '音频转写失败，请重说或直接打字。',
            })
          );
        }
      };

      recorder.start();
      setIsRecordingAudio(true);
      setIsListening(true);
      triggerHaptic('light');

      recordAutoStopRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 12000);
    } catch {
      setIsRecordingAudio(false);
      setIsListening(false);
      setMicNotice(
        pickLang(lang, {
          es: 'Permiso de micrófono bloqueado. Permite el micro o escribe abajo.',
          ca: 'Permís de micròfon bloquejat. Permet el micro o escriu a sota.',
          en: 'Microphone blocked. Allow mic permission or type below.',
          zh: '麦克风权限被阻止，请允许权限或在下方输入。',
        })
      );
    }
  }, [lang, stopListening, stopSpeechOutput, submitVoiceQuery]);

  const stopRecordingAndSend = useCallback(() => {
    if (recordAutoStopRef.current !== null) {
      window.clearTimeout(recordAutoStopRef.current);
      recordAutoStopRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === 'recording') {
      try {
        rec.stop();
      } catch {
        stopMediaRecorderOnly(true);
      }
    }
  }, [stopMediaRecorderOnly]);

  const startLegacyListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      void startAudioRecorderFallback();
      return;
    }

    stopListening();
    stopSpeechOutput();
    setMicNotice(null);
    setInterimText('');

    try {
      const rec = new Ctor();
      rec.lang = resolveSpeechLocale(lang);
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      let finalCaptured = '';
      let submitted = false;

      rec.onresult = (ev) => {
        let interim = '';
        let finalStr = '';
        for (let i = 0; i < ev.results.length; i += 1) {
          const r = ev.results[i];
          const text = r[0]?.transcript || '';
          if (r.isFinal) finalStr += `${text} `;
          else interim += `${text} `;
        }
        const merged = (finalStr || interim).trim();
        finalCaptured = merged;
        setInterimText(merged);
        if (finalStr.trim() && !submitted) {
          submitted = true;
          void submitVoiceQuery(finalStr.trim());
        }
      };

      rec.onerror = (ev) => {
        setIsListening(false);
        recognitionRef.current = null;
        const errCode = String(ev?.error || '');
        if (errCode === 'network' || errCode === 'service-not-allowed' || errCode === 'audio-capture') {
          // Seamless fallback to MediaRecorder + Gemini transcription
          void startAudioRecorderFallback();
          return;
        }
        if (errCode === 'not-allowed') {
          setMicNotice(
            pickLang(lang, {
              es: 'Permiso de micrófono denegado. Puedes escribir lo que quieres abajo.',
              ca: 'Permís de micròfon denegat. Pots escriure a sota.',
              en: 'Microphone permission denied. You can type below.',
              zh: '麦克风权限被拒绝，请在下方输入。',
            })
          );
        } else if (errCode !== 'no-speech' && errCode !== 'aborted') {
          setMicNotice(
            pickLang(lang, {
              es: 'No pude oírte bien. Pulsa el micro para intentarlo o usa el chat de texto.',
              ca: 'No t’he sentit bé. Prem el micro o escriu a sota.',
              en: 'Could not hear clearly. Tap mic to retry or type below.',
              zh: '未能清晰收音，请重试或输入文字。',
            })
          );
        }
      };

      rec.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        if (finalCaptured.trim() && !submitted) {
          submitted = true;
          void submitVoiceQuery(finalCaptured.trim());
        }
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
      triggerHaptic('light');
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      void startAudioRecorderFallback();
    }
  }, [lang, startAudioRecorderFallback, stopListening, stopSpeechOutput, submitVoiceQuery]);

  const startGeminiLiveSession = useCallback(async () => {
    if (
      typeof window === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof WebSocket === 'undefined'
    ) {
      startLegacyListening();
      return;
    }

    stopListening();
    stopSpeechOutput();
    setMicNotice(null);
    setInterimText('');
    setLiveStatus('connecting');
    setIsThinking(true);

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      liveMicStreamRef.current = micStream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      let outCtx: AudioContext;
      try {
        outCtx = new AudioCtx({ sampleRate: 24000 });
      } catch {
        outCtx = new AudioCtx();
      }
      if (outCtx.state === 'suspended') {
        await outCtx.resume().catch(() => {});
      }
      liveOutputCtxRef.current = outCtx;
      liveNextStartTimeRef.current = outCtx.currentTime;

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/ws/gemini-live?userName=${encodeURIComponent(
        cleanName
      )}&lang=${encodeURIComponent(lang)}&activeMedia=${encodeURIComponent(activeMediaTitle)}`;

      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      const enqueueLivePcm = (b64: string) => {
        if (mutedRef.current || !liveOutputCtxRef.current) return;
        const ctx = liveOutputCtxRef.current;
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        const float32 = base64Pcm16ToFloat32(b64);
        if (float32.length === 0) return;
        const buffer = ctx.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime + 0.02, liveNextStartTimeRef.current);
        source.start(startAt);
        liveNextStartTimeRef.current = startAt + buffer.duration;
        liveActiveSourcesRef.current.add(source);
        setIsSpeaking(true);
        source.onended = () => {
          liveActiveSourcesRef.current.delete(source);
          if (liveActiveSourcesRef.current.size === 0) {
            setIsSpeaking(false);
          }
        };
      };

      ws.onmessage = (ev) => {
        if (!isOpenRef.current) return;
        try {
          const msg = JSON.parse(String(ev.data)) as {
            ready?: boolean;
            error?: string;
            fallback?: boolean;
            inputTranscript?: string;
            outputTranscript?: string;
            audio?: string;
            interrupted?: boolean;
            turnComplete?: boolean;
            toolItems?: VoiceCandidateItem[];
            autoPlay?: boolean;
            toolAction?: VoiceAssistantAppAction;
          };

          if (msg.fallback || msg.error) {
            stopGeminiLiveSession();
            setIsThinking(false);
            setUseLiveApi(false);
            startLegacyListening();
            return;
          }

          if (msg.ready) {
            setLiveStatus('live');
            setIsThinking(false);
            setIsListening(true);
            triggerHaptic('medium');

            try {
              let inCtx: AudioContext;
              try {
                inCtx = new AudioCtx({ sampleRate: 16000 });
              } catch {
                inCtx = new AudioCtx();
              }
              liveInputCtxRef.current = inCtx;
              const srcNode = inCtx.createMediaStreamSource(micStream);
              const processor = inCtx.createScriptProcessor(2048, 1, 1);
              const silentGain = inCtx.createGain();
              silentGain.gain.value = 0;

              processor.onaudioprocess = (audioEv) => {
                const activeWs = liveWsRef.current;
                if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
                const rawChannel = audioEv.inputBuffer.getChannelData(0);
                const pcm16k = downsampleTo16k(rawChannel, inCtx.sampleRate);
                const audioB64 = float32ToPcm16Base64(pcm16k);
                activeWs.send(JSON.stringify({ audio: audioB64 }));
              };

              srcNode.connect(processor);
              processor.connect(silentGain);
              silentGain.connect(inCtx.destination);
              liveProcessorRef.current = processor;
            } catch {
              stopGeminiLiveSession();
              setUseLiveApi(false);
              startLegacyListening();
            }
            return;
          }

          if (msg.inputTranscript) {
            liveUserBufRef.current = `${liveUserBufRef.current} ${msg.inputTranscript}`.replace(/\s+/g, ' ').trim();
            setInterimText(liveUserBufRef.current);
            liveAssistantMsgIdRef.current = null;
            liveAssistantBufRef.current = '';
          }

          if (msg.outputTranscript) {
            if (liveUserBufRef.current) {
              const userText = liveUserBufRef.current;
              const uId = liveUserMsgIdRef.current || `u-live-${Date.now()}`;
              liveUserMsgIdRef.current = null;
              liveUserBufRef.current = '';
              setInterimText('');
              setMessages((prev) =>
                prev.some((m) => m.id === uId)
                  ? prev.map((m) => (m.id === uId ? { ...m, text: userText } : m))
                  : [...prev, { id: uId, role: 'user', text: userText }]
              );
            }

            const aId = liveAssistantMsgIdRef.current || `a-live-${Date.now()}`;
            liveAssistantMsgIdRef.current = aId;
            liveAssistantBufRef.current = `${liveAssistantBufRef.current}${msg.outputTranscript}`;
            const mergedAssistant = liveAssistantBufRef.current.trim();
            setMessages((prev) =>
              prev.some((m) => m.id === aId)
                ? prev.map((m) => (m.id === aId ? { ...m, text: mergedAssistant } : m))
                : [...prev, { id: aId, role: 'assistant', text: mergedAssistant }]
            );
          }

          if (msg.audio) {
            enqueueLivePcm(msg.audio);
          }

          if (msg.interrupted) {
            stopLiveAudioPlayback();
            setIsSpeaking(false);
          }

          if (msg.turnComplete) {
            liveAssistantMsgIdRef.current = null;
            liveAssistantBufRef.current = '';
          }

          if (msg.toolAction && onAppAction) {
            const actionPayload = msg.toolAction;
            window.setTimeout(() => {
              onAppAction(actionPayload);
              if (
                actionPayload.type === 'open_world' ||
                actionPayload.type === 'surprise_me' ||
                actionPayload.type === 'open_friends'
              ) {
                onClose();
              }
            }, 650);
          }

          if (Array.isArray(msg.toolItems) && msg.toolItems.length > 0) {
            setItems(msg.toolItems);
            if (msg.autoPlay) {
              const firstCandidate = msg.toolItems[0];
              if (livePendingAutoPlayTimerRef.current !== null) {
                window.clearTimeout(livePendingAutoPlayTimerRef.current);
              }
              livePendingAutoPlayTimerRef.current = window.setTimeout(() => {
                triggerCandidatePlay(firstCandidate);
              }, 950);
            }
          }
        } catch {
          // ignore malformed ws payload
        }
      };

      ws.onerror = () => {
        stopGeminiLiveSession();
        setIsThinking(false);
        setUseLiveApi(false);
        startLegacyListening();
      };

      ws.onclose = () => {
        setLiveStatus('idle');
        setIsListening(false);
        setIsThinking(false);
      };
    } catch {
      stopGeminiLiveSession();
      setIsThinking(false);
      setMicNotice(
        pickLang(lang, {
          es: 'Permiso de micrófono bloqueado. Permite el micro o escribe abajo.',
          ca: 'Permís de micròfon bloquejat. Permet el micro o escriu a sota.',
          en: 'Microphone blocked. Allow mic permission or type below.',
          zh: '麦克风权限被阻止，请允许权限或在下方输入。',
        })
      );
    }
  }, [
    activeMediaTitle,
    cleanName,
    lang,
    onAppAction,
    onClose,
    startLegacyListening,
    stopGeminiLiveSession,
    stopListening,
    stopLiveAudioPlayback,
    stopSpeechOutput,
    triggerCandidatePlay,
  ]);

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

  const quickChips = useMemo(() => {
    const map: Record<AppLanguage, string[]> = {
      es: [
        'Ponme la película In Time',
        'Ponme el capítulo 2 de la temporada 2 de Juego de Tronos',
        'Dime las películas de Christopher Nolan',
        'Películas de Leonardo DiCaprio',
        '¿Cómo funciona un agujero negro?',
        'Ponme DAZN LaLiga',
      ],
      ca: [
        'Posa’m la pel·lícula In Time',
        'Posa’m el capítol 2 de la temporada 2 de Game of Thrones',
        'Digues-me les pel·lícules de Christopher Nolan',
        'Pel·lícules de Leonardo DiCaprio',
        'Com funciona un forat negre?',
        'Posa’m DAZN LaLiga',
      ],
      en: [
        'Play the movie In Time',
        'Play Game of Thrones season 2 episode 2',
        'Show me movies directed by Christopher Nolan',
        'Leonardo DiCaprio movies',
        'How does a black hole work?',
        'Play DAZN LaLiga',
      ],
      zh: [
        '播放电影 规划局 In Time',
        '播放 权力的游戏 第2季第2集',
        '克里斯托弗·诺兰导演的电影',
        '莱昂纳多·迪卡普里奥的电影',
        '黑洞是怎么形成的？',
        '播放 DAZN LaLiga',
      ],
      rif: [
        'Sker asaru In Time',
        'Sker asaru Game of Thrones T2 E2',
        'Isura n Christopher Nolan',
        'Isura n Leonardo DiCaprio',
        'Mamek taddal tafukt?',
        'Ẓer takurt DAZN LaLiga',
      ],
    };
    return map[lang] || map.es;
  }, [lang]);

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
        className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#0B0B0F]/85 backdrop-blur-md"
      >
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative w-full sm:max-w-xl max-h-[92dvh] rounded-t-3xl sm:rounded-3xl bg-[#0B0B0F] border border-[#9146FF]/30 shadow-[0_24px_80px_rgba(0,0,0,0.9),0_0_48px_rgba(145,70,255,0.22)] flex flex-col overflow-hidden text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Ambient Top Glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-44 rounded-full bg-gradient-to-b from-[#9146FF]/35 via-[#00F0FF]/12 to-transparent blur-3xl"
          />

          {/* Header */}
          <div className="relative z-10 px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#9146FF] to-[#00F0FF] p-[1.5px] shadow-[0_0_16px_rgba(145,70,255,0.45)] shrink-0">
                <div className="w-full h-full rounded-[14px] bg-[#10121C] flex items-center justify-center text-[#BF94FF]">
                  <Sparkles className="w-4 h-4" />
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
                onClick={() => {
                  triggerHaptic('light');
                  const next = !useLiveApi;
                  setUseLiveApi(next);
                  if (!next) {
                    stopGeminiLiveSession();
                    setIsListening(false);
                  }
                }}
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
                onClick={() => {
                  triggerHaptic('light');
                  setHandsFree((prev) => !prev);
                }}
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
                onClick={() => {
                  const next = !voiceMuted;
                  setVoiceMuted(next);
                  if (next) stopSpeechOutput();
                }}
                aria-label={voiceMuted ? 'Activar voz' : 'Silenciar voz'}
                className="w-8 h-8 rounded-xl bg-[#10121C] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                {voiceMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {messages.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    stopSpeechOutput();
                    setMessages([{ id: 'greeting-reset', role: 'assistant', text: initialGreeting }]);
                    setItems([]);
                  }}
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

          {/* Main Scrollable Area */}
          <div ref={chatScrollRef} className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar">
            {/* Compact Glowing Orb / Mic Control */}
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
                  onClick={() => {
                    triggerHaptic('medium');
                    if (isRecordingAudio) {
                      stopRecordingAndSend();
                    } else if (isListening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
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

            {/* Live Interim Transcript */}
            {interimText && (
              <div className="px-3.5 py-2 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/40 text-xs sm:text-sm text-[#E9D5FF] text-center">
                “{interimText}”
              </div>
            )}

            {/* Conversation History Thread */}
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

            {/* Candidate Items Grid */}
            {items.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                  <span>
                    {pickLang(lang, {
                      es: `Resultados (${items.length})`,
                      ca: `Resultats (${items.length})`,
                      en: `Results (${items.length})`,
                      zh: `找到内容 (${items.length})`,
                    })}
                    {' · '}
                    <span className="text-[#BF94FF]">
                      {pickLang(lang, {
                        es: 'Pulsa o di "pon la primera"',
                        ca: 'Prem o digues "posa la primera"',
                        en: 'Tap or say "play first"',
                        zh: '点击播放或说“播放第一个”',
                      })}
                    </span>
                  </span>
                </div>

                <div className="space-y-2 max-h-[34dvh] overflow-y-auto pr-1">
                  {items.map((it, idx) => (
                    <button
                      key={`${it.kind}-${it.id}-${idx}`}
                      type="button"
                      onClick={() => triggerCandidatePlay(it)}
                      className="w-full p-2.5 rounded-2xl bg-[#10121C] hover:bg-[#171A29] border border-white/[0.08] hover:border-[#9146FF]/60 flex items-center gap-3 text-left group transition-all cursor-pointer"
                    >
                      <div className="relative w-12 h-16 sm:w-14 sm:h-18 rounded-xl overflow-hidden bg-black/60 shrink-0 border border-white/10 flex items-center justify-center">
                        {it.kind === 'channel' ? (
                          <div className="p-2 w-full h-full flex items-center justify-center">
                            {it.imageUrl ? (
                              <img
                                src={it.imageUrl}
                                alt={it.title}
                                className="max-h-full max-w-full object-contain filter drop-shadow"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Tv className="w-5 h-5 text-[#BF94FF]" />
                            )}
                          </div>
                        ) : it.kind === 'match' ? (
                          <div className="p-1.5 w-full h-full flex items-center justify-center bg-emerald-950/40">
                            {it.imageUrl ? (
                              <img
                                src={it.imageUrl}
                                alt={it.title}
                                className="w-8 h-8 object-contain"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Trophy className="w-6 h-6 text-emerald-400" />
                            )}
                          </div>
                        ) : (
                          <PosterImage
                            src={it.imageUrl || ''}
                            alt={it.title}
                            aspect="poster"
                            fallbackTitle={it.title}
                            imgClassName="w-full h-full object-cover"
                          />
                        )}

                        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[#9146FF] text-[10px] font-bold text-white flex items-center justify-center shadow">
                          {idx + 1}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-white/10 text-zinc-300">
                            {it.badge || it.kind}
                          </span>
                          {it.targetSeason && it.targetEpisode && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-[#9146FF]/30 text-[#D8B4FE]">
                              T{it.targetSeason}·E{it.targetEpisode}
                            </span>
                          )}
                        </div>
                        <h4 className="font-display font-bold text-sm text-white truncate mt-0.5 group-hover:text-[#BF94FF] transition-colors">
                          {it.title}
                        </h4>
                        {it.subtitle && (
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{it.subtitle}</p>
                        )}
                      </div>

                      <span className="w-9 h-9 rounded-xl bg-white/[0.06] group-hover:bg-[#9146FF] text-white flex items-center justify-center shrink-0 transition-colors">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Voice & Conversation Chips */}
            {messages.length <= 2 && items.length === 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
                  {pickLang(lang, {
                    es: 'Prueba diciendo o tocando:',
                    ca: 'Prova dient o tocant:',
                    en: 'Try asking:',
                    zh: '试试这样问我：',
                  })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quickChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        void submitVoiceQuery(chip);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-[#10121C] hover:bg-[#9146FF]/20 border border-white/[0.08] hover:border-[#9146FF]/60 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer text-left"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Text Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = inputText.trim();
              if (!clean || isThinking) return;
              if (liveWsRef.current && liveWsRef.current.readyState === WebSocket.OPEN && liveStatus === 'live') {
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
            }}
            className="relative z-10 p-3 bg-[#0B0B0F] border-t border-white/[0.08] flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
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
              disabled={!inputText.trim() || isThinking}
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
