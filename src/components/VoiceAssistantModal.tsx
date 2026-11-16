import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Send,
  Sparkles,
  Tv,
  Film,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Loader2,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
  WatchHistoryItem,
} from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { ChannelLogoBadge } from './ui/ChannelLogoBadge';
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

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  userName: string;
  watchHistory?: WatchHistoryItem[];
  onPlayMovie: (movie: CatalogMovie, preferLang?: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
  onPlaySeries: (series: CatalogMovie, targetSeason?: number, targetEpisode?: number) => void;
  onPlayChannel: (channel: SpanishTdtChannel) => void;
  onPlayMatch: (match: SportsMatch) => void;
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
  return 'es-ES';
}

/**
 * Searches for a natural, expressive virtual assistant voice in the browser,
 * avoiding flat robotic system defaults.
 */
function findVirtualAssistantVoice(targetLang: AppLanguage): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const prefix = targetLang === 'ca' ? 'ca' : targetLang === 'en' ? 'en' : 'es';
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const pool = langVoices.length > 0 ? langVoices : voices;

  const priorityKeywords = [
    'google español',
    'google',
    'natural',
    'neural',
    'online',
    'elvira',
    'helena',
    'monica',
    'mónica',
    'jorge',
    'alvaro',
    'alicia',
    'lucia',
    'lucía',
    'paulina',
    'samantha',
    'karen',
    'assistant',
    'virtual',
    'premium',
  ];

  for (const kw of priorityKeywords) {
    const found = pool.find((v) => v.name.toLowerCase().includes(kw));
    if (found) return found;
  }

  return pool[0] || null;
}

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  lang,
  userName,
  watchHistory = [],
  onPlayMovie,
  onPlaySeries,
  onPlayChannel,
  onPlayMatch,
}) => {
  const cleanName = (userName || '').trim() || pickLang(lang, { es: 'amigo', ca: 'amic', en: 'friend' });
  const initialGreeting = useMemo(
    () =>
      pickLang(lang, {
        es: `Hola, ${cleanName}, ¿qué quieres ver hoy?`,
        ca: `Hola, ${cleanName}, què vols veure avui?`,
        en: `Hi, ${cleanName}, what do you want to watch today?`,
      }),
    [lang, cleanName]
  );

  const [assistantMessage, setAssistantMessage] = useState(initialGreeting);
  const [inputText, setInputText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [items, setItems] = useState<VoiceCandidateItem[]>([]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const itemsRef = useRef<VoiceCandidateItem[]>([]);
  itemsRef.current = items;
  const mutedRef = useRef(voiceMuted);
  mutedRef.current = voiceMuted;
  const inputRef = useRef<HTMLInputElement>(null);
  const watchHistoryRef = useRef<WatchHistoryItem[]>(watchHistory);
  watchHistoryRef.current = watchHistory;

  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  const stopSpeechSynthesis = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
  }, []);

  const speakText = useCallback(
    (textToSpeak: string) => {
      if (mutedRef.current) return;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const clean = textToSpeak.replace(/[*_#`~[\]()]/g, '').trim();
        if (!clean) return;
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = resolveSpeechLocale(lang);
        utterance.rate = 1.02;
        utterance.pitch = 1.05;

        const bestVoice = findVirtualAssistantVoice(lang);
        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        window.speechSynthesis.speak(utterance);
      } catch {
        // ignore
      }
    },
    [lang]
  );

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
  }, []);

  const triggerCandidatePlay = useCallback(
    (candidate: VoiceCandidateItem) => {
      triggerHaptic('medium');
      stopListening();
      stopSpeechSynthesis();
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
    [onClose, onPlayChannel, onPlayMatch, onPlayMovie, onPlaySeries, stopListening, stopSpeechSynthesis]
  );

  const submitVoiceQuery = useCallback(
    async (rawQuery: string) => {
      const clean = rawQuery.trim();
      if (!clean) return;
      stopListening();
      setIsThinking(true);
      setMicNotice(null);
      setInterimText('');
      setInputText(clean);

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
          }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          spokenReply?: string;
          autoPlay?: boolean;
          items?: VoiceCandidateItem[];
        };

        const reply =
          data.spokenReply ||
          pickLang(lang, {
            es: 'Aquí tienes lo que he encontrado.',
            ca: 'Aquí tens el que he trobat.',
            en: 'Here is what I found.',
          });
        const nextItems = Array.isArray(data.items) ? data.items : [];

        setAssistantMessage(reply);
        setItems(nextItems);
        setIsThinking(false);

        if (data.autoPlay && nextItems.length > 0) {
          speakText(reply);
          window.setTimeout(() => {
            triggerCandidatePlay(nextItems[0]);
          }, 600);
        } else {
          speakText(reply);
        }
      } catch {
        setIsThinking(false);
        const errMsg = pickLang(lang, {
          es: 'No pude conectar con el asistente ahora mismo. Inténtalo de nuevo.',
          ca: 'No he pogut connectar amb l’assistent ara mateix. Torna-ho a provar.',
          en: 'Could not reach the assistant right now. Please try again.',
        });
        setAssistantMessage(errMsg);
        speakText(errMsg);
      }
    },
    [cleanName, lang, speakText, stopListening, triggerCandidatePlay]
  );

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setMicNotice(
        pickLang(lang, {
          es: 'Tu navegador no soporta micrófono directo; escribe tu petición abajo.',
          ca: 'El navegador no suporta micròfon directe; escriu la petició a sota.',
          en: 'Direct microphone is not supported here; type your request below.',
        })
      );
      inputRef.current?.focus();
      return;
    }

    stopListening();
    stopSpeechSynthesis();
    setMicNotice(null);
    setInterimText('');

    try {
      const rec = new Ctor();
      rec.lang = resolveSpeechLocale(lang);
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      let finalCaptured = '';

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
        if (finalStr.trim()) {
          void submitVoiceQuery(finalStr.trim());
        }
      };

      rec.onerror = (ev) => {
        setIsListening(false);
        recognitionRef.current = null;
        const errCode = String(ev?.error || '');
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          setMicNotice(
            pickLang(lang, {
              es: 'Permiso de micrófono denegado. Puedes escribir lo que quieres ver abajo.',
              ca: 'Permís de micròfon denegat. Pots escriure què vols veure a sota.',
              en: 'Microphone permission denied. You can type what you want to watch below.',
            })
          );
        } else if (errCode !== 'no-speech') {
          setMicNotice(
            pickLang(lang, {
              es: 'Micrófono inactivo. Pulsa el botón para intentarlo de nuevo o escribe abajo.',
              ca: 'Micròfon inactiu. Prem el botó per tornar-ho a provar o escriu a sota.',
              en: 'Mic idle. Tap the button to retry or type below.',
            })
          );
        }
      };

      rec.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        if (finalCaptured.trim()) {
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
    }
  }, [lang, stopListening, stopSpeechSynthesis, submitVoiceQuery]);

  useEffect(() => {
    if (isOpen) {
      setAssistantMessage(initialGreeting);
      setInputText('');
      setInterimText('');
      setItems([]);
      setMicNotice(null);
      speakText(initialGreeting);
      const timer = window.setTimeout(() => {
        startListening();
      }, 350);
      return () => {
        window.clearTimeout(timer);
        stopListening();
        stopSpeechSynthesis();
      };
    } else {
      stopListening();
      stopSpeechSynthesis();
    }
  }, [initialGreeting, isOpen, speakText, startListening, stopListening, stopSpeechSynthesis]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-assistant-title"
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
    >
      <div
        className="relative w-full sm:max-w-xl max-h-[92dvh] rounded-t-3xl sm:rounded-3xl bg-[#0B0C12] border border-white/[0.12] shadow-[0_24px_80px_rgba(0,0,0,0.9),0_0_40px_rgba(145,70,255,0.22)] flex flex-col overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-44 rounded-full bg-gradient-to-b from-[#9146FF]/35 via-[#00F0FF]/15 to-transparent blur-3xl"
        />

        {/* Header */}
        <div className="relative z-10 px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#9146FF] to-[#00F0FF] p-[1.5px] shadow-[0_0_16px_rgba(145,70,255,0.5)]">
              <div className="w-full h-full rounded-[14px] bg-[#0F111D] flex items-center justify-center text-[#D8B4FE]">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div>
              <h3 id="voice-assistant-title" className="font-display font-bold text-sm text-white">
                {pickLang(lang, {
                  es: 'Asistente por Voz AI',
                  ca: 'Assistent per Veu AI',
                  en: 'AI Voice Assistant',
                })}
              </h3>
              <p className="text-[11px] text-zinc-400">
                {pickLang(lang, {
                  es: 'Pide canales, partidos, pelis o series',
                  ca: 'Demana canals, partits, pel·lis o sèries',
                  en: 'Ask for channels, matches, movies or shows',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const next = !voiceMuted;
                setVoiceMuted(next);
                if (next) stopSpeechSynthesis();
              }}
              aria-label={voiceMuted ? 'Activar voz' : 'Silenciar voz'}
              className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              {voiceMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onClose();
              }}
              aria-label="Cerrar asistente"
              className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="relative z-10 flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
          {/* Glowing Orb / Mic Hero */}
          <div className="flex flex-col items-center justify-center pt-2">
            <div className="relative flex items-center justify-center">
              {isListening && (
                <>
                  <span className="absolute w-28 h-28 rounded-full bg-[#9146FF]/30 animate-ping opacity-60" />
                  <span className="absolute w-36 h-36 rounded-full bg-[#00F0FF]/18 blur-md animate-pulse" />
                </>
              )}
              {isThinking && (
                <span className="absolute w-28 h-28 rounded-full border-2 border-dashed border-[#BF94FF] animate-spin opacity-80" />
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  if (isListening) stopListening();
                  else startListening();
                }}
                aria-label={isListening ? 'Detener micrófono' : 'Iniciar micrófono'}
                className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
                  isListening
                    ? 'bg-gradient-to-tr from-[#9146FF] to-[#00F0FF] text-white shadow-[0_0_36px_rgba(145,70,255,0.7)] scale-105'
                    : isThinking
                    ? 'bg-[#181928] text-[#BF94FF] border border-[#9146FF]/50'
                    : 'bg-[#141624] hover:bg-[#1B1E30] text-zinc-200 border border-white/15 hover:border-[#9146FF]/60 hover:scale-105'
                }`}
              >
                {isThinking ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : isListening ? (
                  <Mic className="w-7 h-7" />
                ) : (
                  <MicOff className="w-7 h-7 text-zinc-400" />
                )}
              </button>
            </div>

            <p className="text-[11px] font-semibold text-zinc-400 tracking-wider uppercase mt-3">
              {isThinking
                ? pickLang(lang, { es: 'Interpretando petición...', ca: 'Interpretant petició...', en: 'Thinking...' })
                : isListening
                ? pickLang(lang, { es: 'Escuchando... Di lo que quieres ver', ca: 'Escoltant... Digues què vols veure', en: 'Listening... Speak now' })
                : pickLang(lang, { es: 'Pulsa el micro para hablar', ca: 'Prem el micro per parlar', en: 'Tap mic to speak' })}
            </p>
          </div>

          {/* Assistant Speech Bubble */}
          <div className="p-4 rounded-2xl bg-[#141726]/90 border border-white/[0.08] shadow-inner text-center space-y-1.5">
            <p className="text-sm sm:text-base font-semibold text-zinc-100 leading-snug">
              “{interimText || assistantMessage}”
            </p>
            {micNotice && (
              <p className="text-xs text-amber-300/90 leading-tight">
                {micNotice}
              </p>
            )}
          </div>

          {/* Candidate Items Grid */}
          {items.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span>
                  {pickLang(lang, {
                    es: `Opciones encontradas (${items.length})`,
                    ca: `Opcions trobades (${items.length})`,
                    en: `Options found (${items.length})`,
                  })}
                  {' · '}
                  <span className="text-[#BF94FF]">
                    {pickLang(lang, {
                      es: 'Pulsa o di "pon la primera"',
                      ca: 'Prem o digues "posa la primera"',
                      en: 'Tap or say "play first"',
                    })}
                  </span>
                </span>
              </div>

              <div className="space-y-2 max-h-[36dvh] overflow-y-auto pr-1">
                {items.map((it, idx) => (
                  <button
                    key={`${it.kind}-${it.id}-${idx}`}
                    type="button"
                    onClick={() => triggerCandidatePlay(it)}
                    className="w-full p-2.5 rounded-2xl bg-[#10121D] hover:bg-[#161928] border border-white/[0.08] hover:border-[#9146FF]/60 flex items-center gap-3 text-left group transition-all cursor-pointer"
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

                      {/* Number badge (1, 2, 3...) for easy voice ordinals */}
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

          {/* Quick Voice Chips */}
          {items.length === 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
                {pickLang(lang, {
                  es: 'Ejemplos que puedes pedir:',
                  ca: 'Exemples que pots demanar:',
                  en: 'Things you can ask:',
                })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Quiero ver DAZN LaLiga',
                  'Las mejores 3 pelis de terror de este mes',
                  'Ponme National Geographic',
                  'Canales de Marruecos en directo',
                  '¿Cuándo juega el Barça el siguiente partido?',
                  'Capítulo 3 de la primera temporada de Nocturno',
                  'Quiero ver la última serie que estaba viendo',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      void submitVoiceQuery(chip);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] hover:border-[#9146FF]/40 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer text-left"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Text Input Fallback */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputText.trim()) {
              void submitVoiceQuery(inputText);
            }
          }}
          className="relative z-10 p-3 bg-[#0A0B10] border-t border-white/[0.08] flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={pickLang(lang, {
              es: 'Escribe lo que quieres ver o pulsa el micro...',
              ca: 'Escriu què vols veure o prem el micro...',
              en: 'Type what you want to watch or tap the mic...',
            })}
            className="flex-1 min-h-11 px-3.5 rounded-xl bg-white/[0.05] border border-white/10 focus:border-[#9146FF] text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="w-11 h-11 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] disabled:opacity-30 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
