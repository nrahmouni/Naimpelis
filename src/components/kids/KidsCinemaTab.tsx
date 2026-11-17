import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cast,
  ChevronLeft,
  ChevronRight,
  Film,
  Loader2,
  Lock,
  Mic,
  Play,
  Search,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  KidsAgeGroup,
  KidsLanguageCode,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { KIDS_LANGUAGES } from './kidsData';
import { speakKidsText } from './kidsTtsHelper';
import {
  KidsAnimatedCategoryIcon,
  KidsAnimatedPosterSvg,
  type KidsAnimatedIconId,
} from './KidsSvgArt';

interface KidsCinemaTabProps {
  shellLang: AppLanguage;
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  lockedLang?: KidsLanguageCode | null;
  recentWatched?: CatalogMovie[];
  approvedOnlyMode?: boolean;
  approvedItems?: CatalogMovie[];
  onSelectKidsLang: (lang: KidsLanguageCode) => void;
  onPlayMovie: (movie: CatalogMovie, preferLang: string) => void;
  onPlaySeries: (series: CatalogMovie, preferLang: string) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onRequestCastToTv?: (movie: CatalogMovie) => void;
}

type KidsCinemaCategory =
  | 'recent'
  | 'live'
  | 'all'
  | 'animation'
  | 'animals'
  | 'dinosaurs'
  | 'space'
  | 'magic'
  | 'series'
  | 'educational';

interface BrowserSpeechRec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const KidsCinemaTab: React.FC<KidsCinemaTabProps> = ({
  shellLang,
  kidsLang,
  ageGroup,
  lockedLang = null,
  recentWatched = [],
  approvedOnlyMode = false,
  approvedItems = [],
  onSelectKidsLang,
  onPlayMovie,
  onPlaySeries,
  onEarnStar,
  onRequestCastToTv,
}) => {
  const [category, setCategory] = useState<KidsCinemaCategory>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [items, setItems] = useState<Array<CatalogMovie & { aiReason?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiIntro, setAiIntro] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [perPage, setPerPage] = useState(8);
  const [listeningVoice, setListeningVoice] = useState(false);
  const [brokenPosters, setBrokenPosters] = useState<Record<string, boolean>>({});
  const touchStartXRef = useRef<number | null>(null);

  const supportsVoice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    const updatePerPage = () => {
      if (typeof window === 'undefined') return;
      if (ageGroup === '3-5') {
        setPerPage(4);
        return;
      }
      if (window.innerWidth < 640) {
        setPerPage(4);
      } else if (window.innerWidth < 1024) {
        setPerPage(6);
      } else {
        setPerPage(8);
      }
    };
    updatePerPage();
    window.addEventListener('resize', updatePerPage);
    return () => window.removeEventListener('resize', updatePerPage);
  }, [ageGroup]);

  const activeLangMeta =
    KIDS_LANGUAGES.find((l) => l.code === kidsLang) || KIDS_LANGUAGES[0];

  useEffect(() => {
    if (approvedOnlyMode) {
      setLoading(false);
      setErrorMsg(null);
      setAiIntro(null);
      setItems(approvedItems);
      setPageIdx(0);
      return;
    }

    if (category === 'recent') {
      setLoading(false);
      setErrorMsg(null);
      setAiIntro(null);
      setItems(recentWatched);
      setPageIdx(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    setAiIntro(null);
    setPageIdx(0);

    const params = new URLSearchParams({
      lang: kidsLang,
      category,
      ...(activeQuery ? { q: activeQuery } : {}),
    });

    fetch(`/api/kids/catalog?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.items)) {
          setItems(data.items);
        } else {
          setItems([]);
          setErrorMsg(
            pickLang(shellLang, {
              es: 'No se pudo cargar el catálogo infantil ahora.',
              ca: 'No s’ha pogut carregar el catàleg infantil ara.',
              en: 'Could not load kids catalog right now.',
            })
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg(
            pickLang(shellLang, {
              es: 'Error de conexión al cargar películas infantiles.',
              ca: 'Error de connexió en carregar pel·lícules infantils.',
              en: 'Connection error loading kids movies.',
            })
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kidsLang, category, activeQuery, shellLang, approvedOnlyMode, approvedItems, recentWatched]);

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePageIdx = Math.min(pageIdx, totalPages - 1);
  const visibleItems = useMemo(
    () => items.slice(safePageIdx * perPage, safePageIdx * perPage + perPage),
    [items, safePageIdx, perPage]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('light');
    setActiveQuery(searchDraft.trim());
    setPageIdx(0);
  };

  const handleVoiceSearch = () => {
    if (typeof window === 'undefined' || approvedOnlyMode) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRec;
      webkitSpeechRecognition?: new () => BrowserSpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    triggerHaptic('medium');
    setListeningVoice(true);
    try {
      const rec = new Ctor();
      rec.lang = activeLangMeta.speechCode || 'es-ES';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (evt) => {
        const transcript = String(evt.results?.[0]?.[0]?.transcript || '').trim();
        if (transcript) {
          setSearchDraft(transcript);
          setActiveQuery(transcript);
          setPageIdx(0);
          setSearchOpen(true);
        }
        setListeningVoice(false);
      };
      rec.onerror = () => setListeningVoice(false);
      rec.onend = () => setListeningVoice(false);
      rec.start();
    } catch {
      setListeningVoice(false);
    }
  };

  const handleAiCurate = async (customPrompt?: string) => {
    if (approvedOnlyMode) return;
    const promptText = (customPrompt ?? searchDraft).trim();
    if (!promptText) return;
    triggerHaptic('medium');
    setAiLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/kids/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: kidsLang,
          ageGroup,
          prompt: promptText,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setErrorMsg(
          data?.error ||
            pickLang(shellLang, {
              es: 'No se pudo consultar al curador IA.',
              ca: 'No s’ha pogut consultar el curador IA.',
              en: 'AI curator unavailable right now.',
            })
        );
      } else if (Array.isArray(data.items) && data.items.length > 0) {
        setAiIntro(data.intro || null);
        setItems(data.items);
        setPageIdx(0);
        setSearchOpen(false);
        onEarnStar(2, 'cinefilo_kids');
      }
    } catch {
      setErrorMsg(
        pickLang(shellLang, {
          es: 'Error al conectar con la IA de Riffan Kids.',
          ca: 'Error en connectar amb la IA de Riffan Kids.',
          en: 'Could not reach Riffan Kids AI.',
        })
      );
    } finally {
      setAiLoading(false);
    }
  };

  const categories: Array<{ id: KidsCinemaCategory; iconName: KidsAnimatedIconId; label: string }> = [
    { id: 'recent', iconName: 'recent', label: pickLang(shellLang, { es: 'Mis Dibujos', ca: 'Els Meus', en: 'Recent' }) },
    { id: 'live', iconName: 'live_tv', label: pickLang(shellLang, { es: 'Canales TV', ca: 'Canals TV', en: 'TV Live' }) },
    { id: 'all', iconName: 'animation', label: pickLang(shellLang, { es: 'Todo', ca: 'Tot', en: 'All' }) },
    { id: 'animation', iconName: 'animation', label: pickLang(shellLang, { es: 'Dibujos', ca: 'Dibuixos', en: 'Cartoons' }) },
    { id: 'animals', iconName: 'animals', label: pickLang(shellLang, { es: 'Animales', ca: 'Animals', en: 'Animals' }) },
    { id: 'dinosaurs', iconName: 'dinosaurs', label: pickLang(shellLang, { es: 'Dinos', ca: 'Dinos', en: 'Dinos' }) },
    { id: 'space', iconName: 'space', label: pickLang(shellLang, { es: 'Espacio', ca: 'Espai', en: 'Space' }) },
    { id: 'magic', iconName: 'magic', label: pickLang(shellLang, { es: 'Magia', ca: 'Màgia', en: 'Magic' }) },
    { id: 'series', iconName: 'series', label: pickLang(shellLang, { es: 'Series', ca: 'Sèries', en: 'Series' }) },
    { id: 'educational', iconName: 'educational', label: pickLang(shellLang, { es: 'Aprender', ca: 'Aprendre', en: 'Learn' }) },
  ];

  const handlePlayItem = (item: CatalogMovie) => {
    triggerHaptic('medium');
    onEarnStar(1);
    if (item.mediaType === 'tv') {
      onPlaySeries(item, activeLangMeta.preferStreamLang);
    } else {
      onPlayMovie(item, activeLangMeta.preferStreamLang);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    if (Math.abs(delta) < 42) return;
    if (delta < 0 && safePageIdx < totalPages - 1) {
      triggerHaptic('light');
      setPageIdx((p) => Math.min(totalPages - 1, p + 1));
    } else if (delta > 0 && safePageIdx > 0) {
      triggerHaptic('light');
      setPageIdx((p) => Math.max(0, p - 1));
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      {/* Row 1: Joyful 8-Language Flag Ribbon with instant native audio greeting */}
      <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {KIDS_LANGUAGES.map((item) => {
          const selected = item.code === kidsLang;
          const blockedByParent = Boolean(lockedLang && lockedLang !== item.code);
          return (
            <button
              key={item.code}
              type="button"
              disabled={blockedByParent}
              onClick={() => {
                triggerHaptic('medium');
                onSelectKidsLang(item.code);
                void speakKidsText(item.greeting, item.code);
              }}
              className={`h-9 px-3 rounded-2xl text-xs font-black flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-all border-b-2 active:scale-95 ${
                selected
                  ? 'bg-gradient-to-r from-amber-300 to-amber-500 text-zinc-950 border-amber-700 ring-2 ring-amber-300 shadow-md scale-105'
                  : blockedByParent
                  ? 'bg-[#12162B]/40 text-zinc-500 border-transparent opacity-40 cursor-not-allowed'
                  : 'bg-[#182144] hover:bg-[#232F5C] text-zinc-100 border-[#0D1226]'
              }`}
            >
              <FlagBadgeSvg code={item.flagCode} className="w-5 h-3.5 shadow-sm" />
              <span>{item.nativeLabel}</span>
              {lockedLang === item.code && <Lock className="w-3 h-3" />}
            </button>
          );
        })}
      </div>

      {/* Row 2: Joyful Kid Worlds (Categories & Live TV) + Voice / AI Finder */}
      <div className="shrink-0 flex items-center justify-between gap-2">
        {approvedOnlyMode ? (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400/40 text-xs font-black text-emerald-100">
            <Lock className="w-4 h-4 text-emerald-300" />
            <span>Selección aprobada por Papá y Mamá</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveQuery('');
                  setSearchDraft('');
                  setCategory(cat.id);
                }}
                className={`h-8 sm:h-9 px-3 rounded-xl sm:rounded-2xl text-xs font-black whitespace-nowrap cursor-pointer border-b-2 flex items-center gap-2 transition-all active:scale-95 ${
                  category === cat.id && !aiIntro
                    ? 'bg-gradient-to-r from-sky-300 to-sky-500 text-zinc-950 border-sky-700 shadow-md scale-105'
                    : 'bg-[#182144] hover:bg-[#232F5C] text-zinc-200 border-[#0D1226]'
                }`}
              >
                <KidsAnimatedCategoryIcon name={cat.iconName} size={16} />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        )}

        {!approvedOnlyMode && (
          <div className="flex items-center gap-1.5 shrink-0">
            {supportsVoice && (
              <button
                type="button"
                onClick={handleVoiceSearch}
                aria-label="Buscar con voz"
                title="Habla para buscar dibujos"
                className={`h-9 w-9 rounded-2xl flex items-center justify-center cursor-pointer border-b-2 transition-all active:scale-95 ${
                  listeningVoice
                    ? 'bg-rose-500 text-white border-rose-700 animate-pulse ring-2 ring-rose-400'
                    : 'bg-pink-500/30 hover:bg-pink-500/45 text-pink-200 border-pink-700/60'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              disabled={aiLoading}
              onClick={() =>
                void handleAiCurate(
                  `Recomienda películas o series divertidas para niños de ${ageGroup} años en ${activeLangMeta.esLabel}`
                )
              }
              className="h-9 px-3 rounded-2xl bg-amber-400/30 hover:bg-amber-400/45 border-b-2 border-amber-600/60 text-amber-200 text-xs font-black flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
              <span>IA</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Buscar"
              className={`h-9 px-3 rounded-2xl border-b-2 text-xs font-black flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                searchOpen
                  ? 'bg-white text-black border-zinc-300'
                  : 'bg-[#182144] text-zinc-200 border-[#0D1226]'
              }`}
            >
              {searchOpen ? <X className="w-3 h-3" /> : <Search className="w-3 h-3" />}
              <span className="hidden sm:inline">Buscar</span>
            </button>
          </div>
        )}
      </div>

      {/* Collapsible compact search strip */}
      {searchOpen && !approvedOnlyMode && (
        <form
          onSubmit={handleSearchSubmit}
          className="shrink-0 flex items-center gap-1.5 bg-[#161D38] border border-amber-400/35 rounded-xl p-1.5"
        >
          <input
            type="search"
            autoFocus
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={`Buscar en ${activeLangMeta.nativeLabel}...`}
            className="flex-1 h-8 px-2.5 rounded-lg bg-[#0B0F20] text-xs text-white placeholder:text-zinc-400 outline-none"
          />
          <button
            type="submit"
            className="h-8 px-3 rounded-lg bg-white/15 text-xs font-bold text-white cursor-pointer"
          >
            Buscar
          </button>
          <button
            type="button"
            disabled={aiLoading || !searchDraft.trim()}
            onClick={() => void handleAiCurate()}
            className="h-8 px-3 rounded-lg bg-amber-400 text-black text-xs font-extrabold cursor-pointer disabled:opacity-45"
          >
            Pedir IA
          </button>
        </form>
      )}

      {errorMsg && (
        <div className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100">
          {errorMsg}
        </div>
      )}

      {/* Zero-Scroll Paged Poster Stage */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden"
      >
        {loading ? (
          <div
            className={`flex-1 min-h-0 grid gap-2.5 ${
              ageGroup === '3-5'
                ? 'grid-cols-2 grid-rows-2'
                : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 grid-rows-2'
            }`}
          >
            {Array.from({ length: perPage }).map((_, idx) => (
              <div key={idx} className="rounded-2xl bg-[#18203D]/80 animate-pulse" />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border border-white/10 flex flex-col items-center justify-center p-4 text-center gap-2">
            <div className="text-3xl">📺</div>
            <p className="text-sm font-bold text-white">
              {category === 'recent'
                ? 'Aún no has visto dibujos hoy. ¡Elige uno en Todo!'
                : 'No encontramos títulos aquí'}
            </p>
            {!approvedOnlyMode && (
              <button
                type="button"
                onClick={() => {
                  setCategory('all');
                  setActiveQuery('');
                  setSearchDraft('');
                }}
                className="h-9 px-4 rounded-xl bg-amber-400 border-b-2 border-amber-600 text-black text-xs font-extrabold cursor-pointer"
              >
                Ver todo Kids
              </button>
            )}
          </div>
        ) : (
          <div
            className={`flex-1 min-h-0 grid gap-2.5 ${
              ageGroup === '3-5'
                ? 'grid-cols-2 grid-rows-2'
                : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 grid-rows-2'
            }`}
          >
            {visibleItems.map((item) => {
              const posterBroken = brokenPosters[item.id];
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePlayItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePlayItem(item);
                    }
                  }}
                  className="group relative rounded-2xl bg-[#151D38] border-2 border-[#253059] border-b-4 hover:border-amber-300 overflow-hidden text-left flex flex-col cursor-pointer transition-all active:translate-y-0.5 shadow-lg min-h-0 outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  <div className="relative flex-1 min-h-0 w-full bg-[#1C2547] overflow-hidden">
                    {/* 100% Self-Contained Animated SVG Cover by Riffan Kids */}
                    <KidsAnimatedPosterSvg
                      title={item.title}
                      year={item.year}
                      rating={item.rating}
                      langCode={kidsLang}
                      mediaType={item.mediaType}
                      category={category}
                      genres={item.genres}
                      className="absolute inset-0 w-full h-full"
                    />

                    {!posterBroken && item.poster && category !== 'live' && item.platform !== 'Riffan Kids Live' && (
                      <img
                        src={item.poster}
                        alt={item.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenPosters((prev) => ({ ...prev, [item.id]: true }))
                        }
                        className="relative z-10 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90 group-hover:opacity-100"
                      />
                    )}
                    <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#0D1226] via-black/15 to-transparent pointer-events-none" />

                    <span className="absolute z-30 top-1.5 left-1.5 drop-shadow">
                      <FlagBadgeSvg code={activeLangMeta.flagCode} className="w-5 h-3.5" />
                    </span>

                    {onRequestCastToTv && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestCastToTv(item);
                        }}
                        aria-label={`Enviar ${item.title} a Smart TV`}
                        title="Enviar a Smart TV (PIN)"
                        className="absolute z-30 top-1.5 right-1.5 h-6 px-1.5 rounded-lg bg-black/65 hover:bg-amber-400 text-white hover:text-black border border-white/20 flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        <Cast className="w-3 h-3" />
                        <span className="hidden sm:inline">TV</span>
                      </button>
                    )}

                    <span
                      className={`absolute z-30 ${
                        ageGroup === '3-5'
                          ? 'inset-0 m-auto w-12 h-12 bg-amber-400/95'
                          : 'bottom-1.5 right-1.5 w-9 h-9 bg-amber-400'
                      } rounded-full text-zinc-950 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}
                    >
                      <Play className={`${ageGroup === '3-5' ? 'w-6 h-6' : 'w-4 h-4'} fill-current ml-0.5`} />
                    </span>
                  </div>

                  <div className="shrink-0 px-2.5 py-1.5 bg-[#10162E]">
                    <h3 className="font-display font-bold text-xs text-white truncate">
                      {item.title}
                    </h3>
                    {ageGroup !== '3-5' && (
                      <div className="flex items-center gap-1 text-[10px] text-sky-200/80">
                        {item.mediaType === 'tv' ? (
                          <Tv className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                        ) : (
                          <Film className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        )}
                        <span className="truncate">
                          {activeLangMeta.nativeLabel} · {item.year}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Swipe Dots + Tactile Left/Right Pager Strip */}
        {totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-center gap-3 pt-0.5">
            <button
              type="button"
              disabled={safePageIdx <= 0}
              onClick={() => {
                triggerHaptic('light');
                setPageIdx((p) => Math.max(0, p - 1));
              }}
              aria-label="Página anterior"
              className="h-8 px-3 rounded-xl bg-[#18203D] hover:bg-[#232E56] disabled:opacity-35 border-b-2 border-[#0B0F20] text-white flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <div className="flex items-center gap-1.5" aria-label={`Página ${safePageIdx + 1} de ${totalPages}`}>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPageIdx(idx)}
                  aria-label={`Ir a página ${idx + 1}`}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    idx === safePageIdx ? 'w-6 bg-amber-400' : 'w-2.5 bg-white/25 hover:bg-white/45'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              disabled={safePageIdx >= totalPages - 1}
              onClick={() => {
                triggerHaptic('light');
                setPageIdx((p) => Math.min(totalPages - 1, p + 1));
              }}
              aria-label="Página siguiente"
              className="h-8 px-3 rounded-xl bg-[#18203D] hover:bg-[#232E56] disabled:opacity-35 border-b-2 border-[#0B0F20] text-white flex items-center gap-1 text-xs font-bold cursor-pointer"
            >
              <span>Más</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
