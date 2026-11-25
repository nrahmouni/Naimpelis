import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Film,
  Heart,
  ListPlus,
  MessageCircle,
  Mic,
  MicOff,
  Play,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  ThumbsDown,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { AppLanguage, CatalogMovie, WatchHistoryItem } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { shareDedicatedLink } from '../../utils/shareDedicatedLink';
import type {
  MovieReelItem,
  ReelsContentMode,
  ReelsMoodFilter,
  ReelsTasteProfile,
} from './reelsTypes';
import {
  applyReelDislike,
  applyReelLike,
  getSortedTasteGenres,
  getTopTasteGenreLabels,
  loadReelsTasteProfile,
  markReelSeen,
  resetReelsTasteProfile,
  saveReelsTasteProfile,
  toCatalogMovieFromReel,
} from './reelsTasteStore';

interface CineReelsWorldViewProps {
  lang: AppLanguage;
  watchlist: CatalogMovie[];
  watchHistory: WatchHistoryItem[];
  onPlayMovie: (movie: CatalogMovie) => void;
  onOpenMovieModal: (movie: CatalogMovie) => void;
  onOpenSeriesPage: (series: CatalogMovie) => void;
  onToggleCatalogFavorite: (movie: CatalogMovie) => void;
  onAddToQueue: (movie: CatalogMovie) => void;
}

const MOOD_OPTIONS: Array<{
  id: ReelsMoodFilter;
  label: { es: string; ca: string; en: string };
}> = [
  { id: 'para_ti', label: { es: 'Para ti', ca: 'Per a tu', en: 'For you' } },
  { id: 'estrenos', label: { es: 'Estrenos', ca: 'Estrenes', en: 'New' } },
  { id: 'accion', label: { es: 'Acción', ca: 'Acció', en: 'Action' } },
  { id: 'thriller', label: { es: 'Suspense', ca: 'Suspens', en: 'Thriller' } },
  { id: 'scifi', label: { es: 'Sci-Fi', ca: 'Sci-Fi', en: 'Sci-Fi' } },
  { id: 'comedia', label: { es: 'Comedia', ca: 'Comèdia', en: 'Comedy' } },
  { id: 'series', label: { es: 'Series', ca: 'Sèries', en: 'Series' } },
];

const QUICK_ASK_PROMPTS = [
  '¿Por qué me va a enganchar sin spoilers?',
  '¿Tiene buen ritmo desde el principio?',
  '¿Qué es lo más pro de esta escena?',
];

export const CineReelsWorldView: React.FC<CineReelsWorldViewProps> = ({
  lang,
  watchlist,
  watchHistory,
  onPlayMovie,
  onOpenMovieModal,
  onOpenSeriesPage,
  onToggleCatalogFavorite,
  onAddToQueue,
}) => {
  const [taste, setTaste] = useState<ReelsTasteProfile>(() =>
    loadReelsTasteProfile(watchlist, watchHistory)
  );
  const [mood, setMood] = useState<ReelsMoodFilter>('para_ti');
  const [contentMode, setContentMode] = useState<ReelsContentMode>('all');
  const [reels, setReels] = useState<MovieReelItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [clipSelections, setClipSelections] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiHostActive, setAiHostActive] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [mobileInsightOpen, setMobileInsightOpen] = useState(false);

  // Interactive Host Deep-Dive state
  const [questionInput, setQuestionInput] = useState('');
  const [hostReplies, setHostReplies] = useState<Record<string, string>>({});
  const [askingHost, setAskingHost] = useState(false);

  const feedContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fetchInFlightRef = useRef(false);
  const tasteRef = useRef(taste);
  tasteRef.current = taste;
  const activeReelStartRef = useRef<number>(Date.now());
  const prevReelRef = useRef<MovieReelItem | null>(null);

  const watchlistIds = useMemo(
    () => new Set(watchlist.map((w) => String(w.id))),
    [watchlist]
  );

  const showToast = useCallback((msg: string) => {
    setFeedbackToast(msg);
  }, []);

  useEffect(() => {
    if (!feedbackToast) return;
    const t = window.setTimeout(() => setFeedbackToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [feedbackToast]);

  const fetchBatch = useCallback(
    async (opts: {
      mode: 'replace' | 'append';
      nextMood?: ReelsMoodFilter;
      nextContentMode?: ReelsContentMode;
      overrideTaste?: ReelsTasteProfile;
    }) => {
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      if (opts.mode === 'replace') {
        setLoading(true);
        setErrorMsg(null);
      } else {
        setLoadingMore(true);
      }

      const activeTaste = opts.overrideTaste || tasteRef.current;
      const { likedGenres, dislikedGenres } = getSortedTasteGenres(activeTaste);

      try {
        const res = await fetch('/api/reels/feed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            likedIds: activeTaste.likedIds,
            dislikedIds: activeTaste.dislikedIds,
            seenIds: activeTaste.seenIds,
            likedGenres,
            dislikedGenres,
            likedTitles: activeTaste.likedTitles,
            seedItems: activeTaste.likedSeeds,
            mood: opts.nextMood ?? mood,
            contentMode: opts.nextContentMode ?? contentMode,
            lang,
            limit: opts.mode === 'replace' ? 4 : 5,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success || !Array.isArray(data.reels)) {
          throw new Error(data?.error || 'Feed error');
        }

        const incoming = data.reels as MovieReelItem[];
        setAiHostActive(Boolean(data.aiHostActive));

        if (opts.mode === 'replace') {
          setReels(incoming);
          setActiveIndex(0);
          if (feedContainerRef.current) {
            feedContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
          }
        } else {
          setReels((prev) => {
            const existing = new Set(prev.map((r) => r.id));
            const uniqueNew = incoming.filter((r) => !existing.has(r.id));
            return [...prev, ...uniqueNew];
          });
        }
      } catch (err) {
        if (opts.mode === 'replace') {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : pickLang(lang, {
                  es: 'No se pudieron cargar los clips.',
                  ca: 'No s’han pogut carregar els clips.',
                  en: 'Could not load reels.',
                })
          );
        }
      } finally {
        fetchInFlightRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mood, contentMode, lang]
  );

  // Initial load
  useEffect(() => {
    void fetchBatch({ mode: 'replace' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentReel = reels[activeIndex] || null;

  // Track seen duration on reel change and prefetch upcoming batch
  useEffect(() => {
    const prev = prevReelRef.current;
    if (prev && (!currentReel || prev.id !== currentReel.id)) {
      const dwell = Date.now() - activeReelStartRef.current;
      setTaste((t) => markReelSeen(t, prev, dwell));
    }
    prevReelRef.current = currentReel;
    activeReelStartRef.current = Date.now();

    if (reels.length > 0 && activeIndex >= reels.length - 2 && !loadingMore && !loading) {
      void fetchBatch({ mode: 'append' });
    }
  }, [activeIndex, currentReel, reels.length, loadingMore, loading, fetchBatch]);

  // Optional Spanish AI Voice Narration via Web Speech API
  const speakHostComment = useCallback(
    (reel: MovieReelItem | null) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !reel) return;
      try {
        window.speechSynthesis.cancel();
        const text = `${reel.title}. ${reel.hostComment.hook} ${reel.hostComment.whyForYou}`;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang === 'ca' ? 'ca-ES' : lang === 'en' ? 'en-US' : 'es-ES';
        utter.rate = 1.04;
        utter.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find((v) =>
          v.lang.toLowerCase().startsWith(lang === 'ca' ? 'ca' : lang === 'en' ? 'en' : 'es')
        );
        if (preferredVoice) utter.voice = preferredVoice;
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore speech synthesis restrictions
      }
    },
    [lang]
  );

  useEffect(() => {
    if (taste.voiceEnabled && currentReel) {
      speakHostComment(currentReel);
    } else if (!taste.voiceEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [taste.voiceEnabled, currentReel?.id, speakHostComment, currentReel]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const scrollToIndex = useCallback(
    (targetIdx: number) => {
      const container = feedContainerRef.current;
      if (!container) return;
      const clamped = Math.max(0, Math.min(reels.length - 1, targetIdx));
      const height = container.clientHeight;
      if (height > 0) {
        container.scrollTo({ top: clamped * height, behavior: 'smooth' });
      }
      setActiveIndex(clamped);
    },
    [reels.length]
  );

  // Listen for YouTube iframe end-of-video to auto-advance seamlessly
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data || typeof data !== 'object') return;
        const playerState =
          data.event === 'onStateChange'
            ? data.info
            : data.info && typeof data.info === 'object'
            ? data.info.playerState
            : undefined;
        if (playerState === 0 && tasteRef.current.autoAdvance && activeIndex < reels.length - 1) {
          scrollToIndex(activeIndex + 1);
        }
      } catch {
        // ignore non-JSON postMessages
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activeIndex, reels.length, scrollToIndex]);

  // Keyboard / TV D-Pad Up-Down Navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, scrollToIndex]);

  const handleFeedScroll = useCallback(() => {
    const container = feedContainerRef.current;
    if (!container) return;
    const h = container.clientHeight;
    if (h <= 0) return;
    const idx = Math.round(container.scrollTop / h);
    if (idx !== activeIndex && idx >= 0 && idx < reels.length) {
      setActiveIndex(idx);
    }
  }, [activeIndex, reels.length]);

  const handleToggleLike = (reel: MovieReelItem) => {
    triggerHaptic('medium');
    const alreadyLiked = taste.likedIds.includes(reel.id);
    const updated = applyReelLike(taste, reel, !alreadyLiked);
    setTaste(updated);
    if (!alreadyLiked) {
      showToast(
        reel.genres.length > 0
          ? `Afinado con ${reel.genres.slice(0, 2).join(' · ')}`
          : 'Me gusta guardado'
      );
      if (reels.length - activeIndex <= 3 && !loadingMore) {
        void fetchBatch({ mode: 'append', overrideTaste: updated });
      }
    }
  };

  const handleDislikeAndSkip = (reel: MovieReelItem) => {
    triggerHaptic('light');
    const updated = applyReelDislike(taste, reel);
    setTaste(updated);
    showToast('Menos títulos de este estilo');
    if (activeIndex < reels.length - 1) {
      scrollToIndex(activeIndex + 1);
    } else {
      void fetchBatch({ mode: 'append', overrideTaste: updated });
    }
  };

  const handleToggleMute = () => {
    triggerHaptic('light');
    const nextMuted = !taste.muted;
    const updated: ReelsTasteProfile = { ...taste, muted: nextMuted };
    saveReelsTasteProfile(updated);
    setTaste(updated);
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: nextMuted ? 'mute' : 'unMute', args: [] }),
        '*'
      );
    } catch {
      // fallback: iframe key/src updates cleanly
    }
  };

  const handleToggleVoice = () => {
    triggerHaptic('light');
    const nextVoice = !taste.voiceEnabled;
    const updated: ReelsTasteProfile = { ...taste, voiceEnabled: nextVoice };
    saveReelsTasteProfile(updated);
    setTaste(updated);
    showToast(nextVoice ? 'Narrador IA activado' : 'Narrador IA silenciado');
  };

  const handleToggleAutoAdvance = () => {
    triggerHaptic('light');
    const nextAuto = !taste.autoAdvance;
    const updated: ReelsTasteProfile = { ...taste, autoAdvance: nextAuto };
    saveReelsTasteProfile(updated);
    setTaste(updated);
    showToast(nextAuto ? 'Auto-salto al terminar' : 'Auto-salto pausado');
  };

  const handleAskHost = async (reel: MovieReelItem, customPrompt?: string) => {
    const question = (customPrompt ?? questionInput).trim();
    if (!question || askingHost) return;
    setAskingHost(true);
    try {
      const res = await fetch('/api/reels/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: reel.title,
          mediaType: reel.mediaType,
          year: reel.year,
          genres: reel.genres,
          overview: reel.overview,
          question,
          likedTitles: taste.likedTitles,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.reply) {
        setHostReplies((prev) => ({ ...prev, [reel.id]: String(data.reply) }));
        if (!customPrompt) setQuestionInput('');
        if (taste.voiceEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(String(data.reply));
          u.lang = lang === 'ca' ? 'ca-ES' : lang === 'en' ? 'en-US' : 'es-ES';
          window.speechSynthesis.speak(u);
        }
      }
    } catch {
      // ignore transient error
    } finally {
      setAskingHost(false);
    }
  };

  const handleOpenFullContent = (reel: MovieReelItem) => {
    triggerHaptic('medium');
    const catItem = toCatalogMovieFromReel(reel);
    if (reel.mediaType === 'tv') {
      onOpenSeriesPage(catItem);
    } else {
      onOpenMovieModal(catItem);
    }
  };

  const handlePlayDirectNow = (reel: MovieReelItem) => {
    triggerHaptic('medium');
    const catItem = toCatalogMovieFromReel(reel);
    if (reel.mediaType === 'tv') {
      onOpenSeriesPage(catItem);
    } else {
      onPlayMovie(catItem);
    }
  };

  const handleMoodChange = (nextMood: ReelsMoodFilter) => {
    if (nextMood === mood) return;
    triggerHaptic('light');
    setMood(nextMood);
    void fetchBatch({ mode: 'replace', nextMood });
  };

  const handleContentModeChange = (nextMode: ReelsContentMode) => {
    if (nextMode === contentMode) return;
    triggerHaptic('light');
    setContentMode(nextMode);
    if (reels.length > 0) {
      setClipSelections((prev) => {
        const updated = { ...prev };
        for (const r of reels) {
          const targetIdx =
            nextMode === 'scenes'
              ? r.clips.findIndex((c) => c.kind === 'pro_scene')
              : nextMode === 'trailers'
              ? r.clips.findIndex((c) => c.kind === 'trailer')
              : r.defaultClipIndex;
          if (targetIdx !== -1) updated[r.id] = targetIdx;
        }
        return updated;
      });
    }
    void fetchBatch({ mode: 'replace', nextContentMode: nextMode });
  };

  const handleResetTaste = () => {
    triggerHaptic('medium');
    const fresh = resetReelsTasteProfile();
    setTaste(fresh);
    showToast('Gustos reiniciados');
    void fetchBatch({ mode: 'replace', overrideTaste: fresh });
  };

  const topGenres = useMemo(() => getTopTasteGenreLabels(taste), [taste]);
  const iframeOrigin =
    typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';

  return (
    <div className="h-[calc(100dvh-3.75rem)] min-h-[480px] w-full flex flex-col bg-[#05060A] text-white overflow-hidden">
      {/* COMPACT SINGLE-LINE MOOD & CLIP-TYPE FILTER BAR */}
      <div className="shrink-0 z-20 px-2.5 sm:px-5 py-1.5 border-b border-white/[0.08] bg-[#07080E]/95 backdrop-blur-xl flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0 py-0.5">
          {MOOD_OPTIONS.map((opt) => {
            const active = mood === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleMoodChange(opt.id)}
                className={`min-h-8 sm:min-h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-all shrink-0 ${
                  active
                    ? 'bg-gradient-to-r from-[#FF2E63] to-[#9146FF] text-white shadow-[0_4px_16px_rgba(255,46,99,0.28)]'
                    : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
                }`}
              >
                {pickLang(lang, opt.label)}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(['all', 'scenes', 'trailers'] as ReelsContentMode[]).map((cm) => {
            const active = contentMode === cm;
            return (
              <button
                key={cm}
                type="button"
                onClick={() => handleContentModeChange(cm)}
                className={`min-h-8 px-2 sm:px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-black'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
                }`}
              >
                {cm === 'all'
                  ? 'Todo'
                  : cm === 'scenes'
                  ? 'Pro'
                  : 'Tráiler'}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              void fetchBatch({ mode: 'replace' });
            }}
            aria-label="Refrescar feed"
            title="Cargar nuevos títulos"
            className="min-w-8 min-h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 flex items-center justify-center cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* MAIN STAGE: RESPONSIVE VERTICAL SNAP FEED + DESKTOP HOST PANEL */}
      <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_390px] overflow-hidden">
        {/* LEFT / MAIN: VERTICAL TIKTOK SNAP PLAYER */}
        <div className="relative min-h-0 h-full bg-[#07080F] overflow-hidden">
          {loading && reels.length === 0 ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center bg-gradient-to-b from-[#130816] via-[#07080F] to-[#05060A]">
              <div className="w-12 h-12 rounded-full border-2 border-[#FF2E63] border-t-transparent animate-spin" />
              <div className="space-y-1 max-w-xs">
                <p className="font-display font-bold text-base sm:text-lg text-white">
                  Cargando tráilers y escenas pro...
                </p>
                <p className="text-xs text-zinc-400">
                  Seleccionando clips en español según tus gustos
                </p>
              </div>
            </div>
          ) : errorMsg && reels.length === 0 ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="text-sm text-rose-300">{errorMsg}</p>
              <button
                type="button"
                onClick={() => void fetchBatch({ mode: 'replace' })}
                className="min-h-11 px-5 rounded-xl bg-[#FF2E63] text-white text-sm font-semibold cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <div
              ref={feedContainerRef}
              onScroll={handleFeedScroll}
              className="h-full w-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar"
            >
              {reels.map((reel, idx) => {
                const isActive = idx === activeIndex;
                const isLiked = taste.likedIds.includes(reel.id);
                const isSaved = watchlistIds.has(String(reel.id));
                const selClipIdx = clipSelections[reel.id] ?? reel.defaultClipIndex;
                const selClip = reel.clips[selClipIdx] || reel.clips[0];
                const embedUrl =
                  isActive && selClip
                    ? `https://www.youtube.com/embed/${selClip.videoId}?enablejsapi=1&autoplay=1&mute=${
                        taste.muted ? 1 : 0
                      }&start=${selClip.startSec || 0}&rel=0&modestbranding=1&playsinline=1&origin=${iframeOrigin}`
                    : '';

                return (
                  <section
                    key={reel.id}
                    className="relative h-full w-full snap-start snap-always shrink-0 overflow-hidden flex items-center justify-center bg-[#05060A]"
                  >
                    {/* AMBIENT BACKDROP */}
                    <img
                      src={reel.poster || reel.backdrop}
                      alt={reel.title}
                      className="absolute inset-0 w-full h-full object-cover opacity-45 blur-xl scale-105 pointer-events-none select-none"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/95 pointer-events-none"
                    />

                    {/* VIDEO PLAYER CONTAINER */}
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-start sm:justify-center pt-5 sm:pt-4 px-2 sm:px-14 lg:px-8 pb-56 sm:pb-36">
                      <div className="relative w-full max-w-4xl aspect-video rounded-xl sm:rounded-2xl overflow-hidden bg-black shadow-[0_24px_70px_rgba(0,0,0,0.85)] border border-white/[0.14]">
                        {isActive && selClip ? (
                          <iframe
                            ref={isActive ? iframeRef : undefined}
                            key={`${reel.id}-${selClip.id}-${taste.muted ? 'm' : 'u'}`}
                            src={embedUrl}
                            title={`${reel.title} - ${selClip.label}`}
                            onLoad={() => {
                              try {
                                iframeRef.current?.contentWindow?.postMessage(
                                  JSON.stringify({ event: 'listening' }),
                                  '*'
                                );
                              } catch {
                                // ignore
                              }
                            }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="w-full h-full border-0"
                          />
                        ) : (
                          <div className="relative w-full h-full">
                            <img
                              src={reel.backdrop || reel.poster}
                              alt={reel.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                              <div className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
                                <Play className="w-7 h-7 text-white fill-white ml-1" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BOTTOM LEFT INFO OVERLAY & CLIP SWITCHER */}
                    <div className="absolute inset-x-0 bottom-0 z-20 p-3.5 sm:p-6 pr-[72px] sm:pr-24 bg-gradient-to-t from-black via-black/90 to-transparent pointer-events-none">
                      <div className="max-w-2xl space-y-2 pointer-events-auto">
                        {/* Clean unboxed typographic metadata */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-zinc-200">
                          <span className="inline-flex items-center gap-1 text-[#FF5C8D] font-bold">
                            {reel.mediaType === 'tv' ? (
                              <Tv className="w-3.5 h-3.5" />
                            ) : (
                              <Film className="w-3.5 h-3.5" />
                            )}
                            {reel.mediaType === 'tv' ? 'Serie' : 'Película'}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">{reel.year}</span>
                          <span>·</span>
                          <span className="text-amber-300 font-semibold tabular-nums">
                            ★ {reel.rating}
                          </span>
                          {reel.genres.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-300">{reel.genres.slice(0, 2).join(' · ')}</span>
                            </>
                          )}
                          {selClip?.durationLabel && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-400 tabular-nums">{selClip.durationLabel}</span>
                            </>
                          )}
                        </div>

                        <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white tracking-tight leading-tight drop-shadow">
                          {reel.title}
                        </h2>

                        {/* Host Comment Hook on-screen */}
                        <div className="flex items-start gap-2 text-xs sm:text-sm text-zinc-100 leading-snug">
                          <Sparkles className="w-4 h-4 text-[#FF5C8D] shrink-0 mt-0.5" />
                          <p className="line-clamp-2">
                            <span className="font-semibold text-white">{reel.hostComment.hook}</span>{' '}
                            <span className="text-zinc-300">{reel.hostComment.whyForYou}</span>
                          </p>
                        </div>

                        {/* Interactive Clip Switcher (Tráiler Oficial / Escena Pro) + Watch Now */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {reel.clips.map((clip, cIdx) => {
                            const isClipActive = cIdx === selClipIdx;
                            return (
                              <button
                                key={clip.id}
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  setClipSelections((prev) => ({
                                    ...prev,
                                    [reel.id]: cIdx,
                                  }));
                                }}
                                className={`min-h-10 px-3 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                                  isClipActive
                                    ? 'bg-white text-black shadow-md'
                                    : 'bg-white/12 hover:bg-white/22 text-white border border-white/15'
                                }`}
                              >
                                {clip.kind === 'pro_scene' ? '⚡ ' : '🎬 '}
                                {clip.label}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => handlePlayDirectNow(reel)}
                            className="min-h-10 px-3.5 rounded-xl bg-gradient-to-r from-[#FF2E63] to-[#9146FF] hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            {reel.mediaType === 'tv' ? 'Ver episodios' : 'Ver película'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT TIKTOK VERTICAL ACTION RAIL (>=44px touch targets) */}
                    <div className="absolute right-2 sm:right-4 bottom-4 sm:bottom-6 z-30 flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleLike(reel)}
                        aria-label="Me gusta"
                        className="flex flex-col items-center gap-0.5 cursor-pointer group"
                      >
                        <span
                          className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all active:scale-90 ${
                            isLiked
                              ? 'bg-[#FF2E63] border-[#FF2E63] text-white shadow-[0_0_24px_rgba(255,46,99,0.55)]'
                              : 'bg-black/60 border-white/15 text-white hover:bg-white/15'
                          }`}
                        >
                          <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-200 drop-shadow">
                          Me gusta
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDislikeAndSkip(reel)}
                        aria-label="No me va"
                        className="flex flex-col items-center gap-0.5 cursor-pointer"
                      >
                        <span className="w-12 h-12 rounded-full bg-black/60 hover:bg-rose-500/25 border border-white/15 text-zinc-200 hover:text-rose-200 flex items-center justify-center backdrop-blur-xl active:scale-90 transition-all">
                          <ThumbsDown className="w-5 h-5" />
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-200 drop-shadow">
                          Pasar
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onToggleCatalogFavorite(toCatalogMovieFromReel(reel));
                          showToast(isSaved ? 'Quitado de tu lista' : 'Guardado en Mi Lista');
                        }}
                        aria-label="Guardar en Mi Lista"
                        className="flex flex-col items-center gap-0.5 cursor-pointer"
                      >
                        <span
                          className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all active:scale-90 ${
                            isSaved
                              ? 'bg-[#9146FF] border-[#9146FF] text-white'
                              : 'bg-black/60 border-white/15 text-white hover:bg-white/15'
                          }`}
                        >
                          <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-200 drop-shadow">
                          Guardar
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onAddToQueue(toCatalogMovieFromReel(reel));
                          showToast('Añadido a la cola de la sala');
                        }}
                        aria-label="Añadir a cola"
                        className="flex flex-col items-center gap-0.5 cursor-pointer"
                      >
                        <span className="w-12 h-12 rounded-full bg-black/60 hover:bg-white/15 border border-white/15 text-white flex items-center justify-center backdrop-blur-xl active:scale-90 transition-all">
                          <ListPlus className="w-5 h-5" />
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-200 drop-shadow">
                          Cola
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMobileInsightOpen(true)}
                        aria-label="Preguntar al presentador"
                        className="lg:hidden flex flex-col items-center gap-0.5 cursor-pointer"
                      >
                        <span className="w-12 h-12 rounded-full bg-black/60 hover:bg-white/15 border border-white/15 text-[#22D3EE] flex items-center justify-center backdrop-blur-xl active:scale-90 transition-all">
                          <MessageCircle className="w-5 h-5" />
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-200 drop-shadow">
                          Comentar
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          void shareDedicatedLink({
                            target:
                              reel.mediaType === 'tv'
                                ? { kind: 'series', tmdbId: reel.tmdbId, title: reel.title }
                                : { kind: 'movie', tmdbId: reel.tmdbId, title: reel.title },
                            title: `RiffanTV · ${reel.title}`,
                          });
                        }}
                        aria-label="Compartir"
                        className="flex flex-col items-center gap-0.5 cursor-pointer"
                      >
                        <span className="w-11 h-11 rounded-full bg-black/60 hover:bg-white/15 border border-white/15 text-white flex items-center justify-center backdrop-blur-xl active:scale-90 transition-all">
                          <Share2 className="w-4.5 h-4.5" />
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleMute}
                        aria-label={taste.muted ? 'Activar sonido' : 'Silenciar'}
                        className="w-11 h-11 rounded-full bg-black/60 hover:bg-white/15 border border-white/15 text-white flex items-center justify-center backdrop-blur-xl cursor-pointer active:scale-90 transition-all"
                      >
                        {taste.muted ? (
                          <VolumeX className="w-4.5 h-4.5 text-rose-300" />
                        ) : (
                          <Volume2 className="w-4.5 h-4.5" />
                        )}
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* QUICK PREV / NEXT NAVIGATION CONTROLS */}
          {reels.length > 1 && (
            <div className="hidden sm:flex flex-col gap-2 absolute left-3 top-1/2 -translate-y-1/2 z-30">
              <button
                type="button"
                disabled={activeIndex <= 0}
                onClick={() => scrollToIndex(activeIndex - 1)}
                aria-label="Clip anterior"
                className="w-11 h-11 rounded-full bg-black/65 hover:bg-white/15 disabled:opacity-30 border border-white/15 text-white flex items-center justify-center cursor-pointer backdrop-blur-md transition-all"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <button
                type="button"
                disabled={activeIndex >= reels.length - 1}
                onClick={() => scrollToIndex(activeIndex + 1)}
                aria-label="Siguiente clip"
                className="w-11 h-11 rounded-full bg-black/65 hover:bg-white/15 disabled:opacity-30 border border-white/15 text-white flex items-center justify-center cursor-pointer backdrop-blur-md transition-all"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* FEEDBACK TOAST */}
          {feedbackToast && (
            <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-black/85 border border-white/20 text-xs font-semibold text-white shadow-xl backdrop-blur-md">
              {feedbackToast}
            </div>
          )}
        </div>

        {/* DESKTOP RIGHT SIDEBAR: CONVERSATIONAL AI HOST & TASTE ENGINE */}
        <aside className="hidden lg:flex flex-col min-h-0 border-l border-white/[0.08] bg-[#080A11] overflow-y-auto p-5 gap-5">
          {/* Taste Profile Radar */}
          <div className="space-y-2.5 pb-4 border-b border-white/[0.08]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Tu Radar de Gustos
              </span>
              {Object.keys(taste.genreScores).length > 0 && (
                <button
                  type="button"
                  onClick={handleResetTaste}
                  className="text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  Reiniciar
                </button>
              )}
            </div>
            <p className="text-sm font-semibold text-white">
              {topGenres.length > 0
                ? topGenres.join(' · ')
                : taste.likedTitles.length > 0
                ? `Inspirado en ${taste.likedTitles.slice(0, 2).join(', ')}`
                : 'Dale a Me gusta o Pasar para entrenar tu algoritmo'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`min-h-10 flex-1 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border cursor-pointer transition-colors ${
                  taste.voiceEnabled
                    ? 'bg-[#22D3EE]/15 border-[#22D3EE]/45 text-[#67E8F9]'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                {taste.voiceEnabled ? (
                  <Mic className="w-3.5 h-3.5" />
                ) : (
                  <MicOff className="w-3.5 h-3.5" />
                )}
                {taste.voiceEnabled ? 'Voz IA activa' : 'Voz IA off'}
              </button>
              <button
                type="button"
                onClick={handleToggleAutoAdvance}
                className={`min-h-10 flex-1 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                  taste.autoAdvance
                    ? 'bg-[#9146FF]/15 border-[#9146FF]/45 text-[#C4B5FD]'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                }`}
              >
                {taste.autoAdvance ? 'Auto-salto ON' : 'Auto-salto OFF'}
              </button>
            </div>
          </div>

          {/* Current Reel Host Commentary & Interactive Q&A */}
          {currentReel && (
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#FF5C8D] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Presentador {aiHostActive ? 'IA' : 'Cine'}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {activeIndex + 1} / {reels.length}
                  </span>
                </div>
                <h3 className="font-display font-bold text-lg text-white leading-snug">
                  {currentReel.title}
                </h3>
                <p className="text-sm text-zinc-100 leading-relaxed">
                  {currentReel.hostComment.hook}
                </p>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {currentReel.hostComment.whyForYou}
                </p>
                {currentReel.hostComment.proMoment && (
                  <p className="text-xs text-[#67E8F9] pt-1">
                    Momento clave: {currentReel.hostComment.proMoment}
                  </p>
                )}
              </div>

              {/* Overview & Open Full Sheet */}
              {currentReel.overview && (
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-4">
                  {currentReel.overview}
                </p>
              )}

              <button
                type="button"
                onClick={() => handleOpenFullContent(currentReel)}
                className="min-h-11 w-full px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                Abrir ficha completa y servidores
              </button>

              {/* Interactive Ask Host Box */}
              <div className="mt-auto pt-4 border-t border-white/[0.08] space-y-2.5">
                <p className="text-xs font-semibold text-zinc-300">
                  Pregúntale al presentador sin spoilers
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ASK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={askingHost}
                      onClick={() => void handleAskHost(currentReel, q)}
                      className="text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-200 cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {hostReplies[currentReel.id] && (
                  <div className="p-3 rounded-xl bg-[#111524] border border-[#22D3EE]/30 text-xs text-zinc-100 leading-relaxed">
                    {hostReplies[currentReel.id]}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAskHost(currentReel);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    placeholder="¿De qué va, ritmo, final...?"
                    className="flex-1 min-h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5C8D]"
                  />
                  <button
                    type="submit"
                    disabled={askingHost || !questionInput.trim()}
                    aria-label="Enviar pregunta"
                    className="min-w-10 min-h-10 rounded-xl bg-[#FF2E63] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* MOBILE HOST INSIGHT DRAWER */}
      {mobileInsightOpen && currentReel && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end"
          onClick={() => setMobileInsightOpen(false)}
        >
          <div
            className="w-full max-h-[82dvh] overflow-y-auto rounded-t-3xl bg-[#0B0D16] border-t border-white/15 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FF5C8D]">
                <Sparkles className="w-4 h-4" />
                Presentador · {currentReel.title}
              </div>
              <button
                type="button"
                onClick={() => setMobileInsightOpen(false)}
                aria-label="Cerrar"
                className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm font-semibold text-white">{currentReel.hostComment.hook}</p>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {currentReel.hostComment.whyForYou}
            </p>
            {currentReel.hostComment.proMoment && (
              <p className="text-xs text-[#67E8F9]">
                Momento clave: {currentReel.hostComment.proMoment}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`min-h-10 flex-1 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                  taste.voiceEnabled
                    ? 'bg-[#22D3EE]/15 border-[#22D3EE]/45 text-[#67E8F9]'
                    : 'bg-white/[0.06] border-white/10 text-zinc-200'
                }`}
              >
                {taste.voiceEnabled ? 'Voz IA activa' : 'Activar Voz IA'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileInsightOpen(false);
                  handleOpenFullContent(currentReel);
                }}
                className="min-h-10 flex-1 px-3 rounded-xl bg-white/10 text-xs font-semibold text-white cursor-pointer"
              >
                Ver ficha completa
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_ASK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={askingHost}
                  onClick={() => void handleAskHost(currentReel, q)}
                  className="text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-zinc-200 cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>

            {hostReplies[currentReel.id] && (
              <div className="p-3 rounded-xl bg-[#111524] border border-[#22D3EE]/30 text-xs text-zinc-100 leading-relaxed">
                {hostReplies[currentReel.id]}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAskHost(currentReel);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Preguntar sin spoilers..."
                className="flex-1 min-h-11 px-3 rounded-xl bg-white/[0.06] border border-white/15 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={askingHost || !questionInput.trim()}
                aria-label="Enviar"
                className="min-w-11 min-h-11 rounded-xl bg-[#FF2E63] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
