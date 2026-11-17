import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  Mic,
  Play,
  Search,
  Tv,
  Youtube,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  KidsAgeGroup,
  KidsLanguageCode,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { KIDS_LANGUAGES } from './kidsData';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { playKidsSound } from './kidsAudioEngine';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';
import {
  KidsAnimatedCategoryIcon,
  KidsAnimatedPosterSvg,
  type KidsAnimatedIconId,
} from './KidsSvgArt';

interface KidsCinemaTabProps {
  shellLang?: AppLanguage;
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  recentWatched?: CatalogMovie[];
  approvedOnlyMode?: boolean;
  approvedItems?: CatalogMovie[];
  onPlayItem: (item: CatalogMovie, queuePool: CatalogMovie[]) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onBackToPortal?: () => void;
}

export type KidsCinemaCategory =
  | 'all'
  | 'cartoons'
  | 'animals'
  | 'dinosaurs'
  | 'space'
  | 'magic'
  | 'songs'
  | 'educational'
  | 'live'
  | 'recent';

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

interface CinemaThemeCard {
  id: KidsCinemaCategory;
  titleKey: string;
  descKey: string;
  iconName: KidsAnimatedIconId;
  bgGradient: string;
  borderTone: string;
  badgeTone: string;
}

export const KidsCinemaTab: React.FC<KidsCinemaTabProps> = ({
  kidsLang,
  ageGroup,
  recentWatched = [],
  approvedOnlyMode = false,
  approvedItems = [],
  onPlayItem,
  onEarnStar,
  onBackToPortal,
}) => {
  const soundEnabled = useKidsStore((s) => s.ux.soundEnabled);
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  // Multi-screen Cinema Step: 'hub' (big visual themes) vs 'list' (scrollable video catalog)
  const [cinemaStep, setCinemaStep] = useState<'hub' | 'list'>(
    approvedOnlyMode ? 'list' : 'hub'
  );
  const [category, setCategory] = useState<KidsCinemaCategory>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [items, setItems] = useState<CatalogMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [listeningVoice, setListeningVoice] = useState(false);
  const [brokenPosters, setBrokenPosters] = useState<Record<string, boolean>>({});

  const listScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const activeLangMeta =
    KIDS_LANGUAGES.find((l) => l.code === kidsLang) || KIDS_LANGUAGES[0];

  const supportsVoice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  // Theme cards for Portada de Cine (Hub)
  const THEME_CARDS: CinemaThemeCard[] = useMemo(
    () => [
      {
        id: 'live',
        titleKey: t.catLive,
        descKey: 'Clan, Boing, SX3, Ketnet, France 4...',
        iconName: 'live_tv',
        bgGradient: 'from-emerald-500/25 via-emerald-600/15 to-[#13233E]',
        borderTone: 'border-emerald-400/50 hover:border-emerald-300',
        badgeTone: 'bg-emerald-500 text-slate-950',
      },
      {
        id: 'cartoons',
        titleKey: t.catCartoons,
        descKey: 'Bluey, Pocoyó, Peppa Pig, Bumba...',
        iconName: 'cinema',
        bgGradient: 'from-amber-500/25 via-amber-600/15 to-[#1A1E38]',
        borderTone: 'border-amber-400/50 hover:border-amber-300',
        badgeTone: 'bg-amber-400 text-slate-950',
      },
      {
        id: 'animals',
        titleKey: t.catAnimals,
        descKey: 'Naturaleza salvaje y animales amigos',
        iconName: 'animals',
        bgGradient: 'from-teal-500/25 via-teal-600/15 to-[#122238]',
        borderTone: 'border-teal-400/50 hover:border-teal-300',
        badgeTone: 'bg-teal-400 text-slate-950',
      },
      {
        id: 'dinosaurs',
        titleKey: t.catDinos,
        descKey: 'T-Rex, fósiles y mundo jurásico',
        iconName: 'dinosaurs',
        bgGradient: 'from-lime-500/25 via-lime-600/15 to-[#192620]',
        borderTone: 'border-lime-400/50 hover:border-lime-300',
        badgeTone: 'bg-lime-400 text-slate-950',
      },
      {
        id: 'space',
        titleKey: t.catSpace,
        descKey: 'Planetas, estrellas y astronautas',
        iconName: 'space',
        bgGradient: 'from-indigo-500/25 via-indigo-600/15 to-[#18193D]',
        borderTone: 'border-indigo-400/50 hover:border-indigo-300',
        badgeTone: 'bg-indigo-400 text-slate-950',
      },
      {
        id: 'songs',
        titleKey: 'Canciones',
        descKey: 'Música, bailes y nanas para cantar',
        iconName: 'songs',
        bgGradient: 'from-pink-500/25 via-pink-600/15 to-[#281832]',
        borderTone: 'border-pink-400/50 hover:border-pink-300',
        badgeTone: 'bg-pink-400 text-white',
      },
      {
        id: 'magic',
        titleKey: t.catMagic,
        descKey: 'Cuentos animados y fantasía mágica',
        iconName: 'magic',
        bgGradient: 'from-purple-500/25 via-purple-600/15 to-[#221639]',
        borderTone: 'border-purple-400/50 hover:border-purple-300',
        badgeTone: 'bg-purple-400 text-slate-950',
      },
      {
        id: 'recent',
        titleKey: t.catRecent,
        descKey: 'Los dibujos que más te gustan',
        iconName: 'recent',
        bgGradient: 'from-sky-500/25 via-sky-600/15 to-[#13223A]',
        borderTone: 'border-sky-400/50 hover:border-sky-300',
        badgeTone: 'bg-sky-400 text-slate-950',
      },
    ],
    [t]
  );

  // Fetch YouTube Kids or Live Channels when in 'list' step
  useEffect(() => {
    if (cinemaStep !== 'list') return;

    if (approvedOnlyMode) {
      setLoading(false);
      setErrorMsg(null);
      setItems(
        approvedItems.filter(
          (it) => it.platform === 'YouTube Kids' || it.platform === 'Riffan Kids Live'
        )
      );
      return;
    }

    if (category === 'recent') {
      setLoading(false);
      setErrorMsg(null);
      setItems(recentWatched);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    const params = new URLSearchParams({
      lang: kidsLang,
      category,
      ageGroup,
      ...(activeQuery ? { q: activeQuery } : {}),
    });

    fetch(`/api/kids/youtube?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.items)) {
          setItems(data.items);
        } else {
          setItems([]);
          setErrorMsg(t.catalogLoadError);
        }
      })
      .catch(() => {
        if (!cancelled) setErrorMsg(t.catalogConnError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    cinemaStep,
    kidsLang,
    category,
    ageGroup,
    activeQuery,
    approvedOnlyMode,
    approvedItems,
    recentWatched,
    t.catalogLoadError,
    t.catalogConnError,
  ]);

  const handleSelectTheme = (catId: KidsCinemaCategory, label: string) => {
    triggerHaptic('light');
    playKidsSound('tap', soundEnabled, true);
    setActiveQuery('');
    setSearchDraft('');
    setCategory(catId);
    setCinemaStep('list');
    if (ageGroup === '3-5' && soundEnabled) {
      void speakKidsText(label, kidsLang, { ageGroup });
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchDraft.trim();
    if (!query) return;
    triggerHaptic('light');
    playKidsSound('tap', soundEnabled, true);
    setActiveQuery(query);
    setCategory('all');
    setCinemaStep('list');
    setSearchOpen(false);
  };

  const handleVoiceSearch = () => {
    if (typeof window === 'undefined' || approvedOnlyMode) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRec;
      webkitSpeechRecognition?: new () => BrowserSpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    playKidsSound('tap', soundEnabled, true);
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
          setCategory('all');
          setCinemaStep('list');
          setSearchOpen(false);
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

  const handleSelectPlayable = (item: CatalogMovie) => {
    triggerHaptic('light');
    playKidsSound('success', soundEnabled, true);
    if (ageGroup === '3-5' && soundEnabled) {
      void speakKidsText(item.title, kidsLang, { ageGroup });
    }
    onEarnStar(1);
    onPlayItem(item, items);
  };

  const activeThemeMeta = THEME_CARDS.find((c) => c.id === category) || THEME_CARDS[1];

  return (
    <div dir={dir} className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      {/* =========================================================================
          PANTALLA 2A: PORTADA DE CINE (HUB TEMÁTICO LIMPIO CON TARJETAS GRANDES)
         ========================================================================= */}
      {cinemaStep === 'hub' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          {/* Top Bar inside Cinema Hub */}
          <div className="shrink-0 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              {onBackToPortal && (
                <KidsSquishButton
                  onClick={onBackToPortal}
                  data-tv-focusable="true"
                  className="min-h-[46px] px-3.5 sm:px-4 rounded-2xl bg-[#182352] hover:bg-[#253268] border-b-4 border-[#0F1635] text-white font-black text-xs sm:text-sm flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
                  <span>{t.backToHome}</span>
                </KidsSquishButton>
              )}
              <div className="flex items-center gap-2">
                <KidsAnimatedCategoryIcon name="cinema" size={26} />
                <h2 className="font-display font-black text-base sm:text-xl text-white">
                  {t.navCinema}
                </h2>
              </div>
            </div>

            <KidsSquishButton
              onClick={() => setSearchOpen((v) => !v)}
              data-tv-focusable="true"
              ariaLabel={t.searchLabel}
              className={`min-h-[46px] px-3.5 sm:px-4 rounded-2xl border-b-4 text-xs sm:text-sm font-black flex items-center gap-2 ${
                searchOpen
                  ? 'bg-sky-400 text-slate-950 border-sky-600'
                  : 'bg-[#182352] hover:bg-[#253268] text-white border-[#0F1635]'
              }`}
            >
              {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
              <span className="hidden sm:inline">{t.searchLabel}</span>
            </KidsSquishButton>
          </div>

          {/* Search Box & Voice when opened */}
          {searchOpen && (
            <div className="shrink-0 rounded-2xl bg-[#141C42] border-2 border-sky-400/40 p-2.5 shadow-lg">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                {supportsVoice && (
                  <button
                    type="button"
                    onClick={handleVoiceSearch}
                    data-tv-focusable="true"
                    aria-label={t.voiceSearchLabel}
                    className={`min-w-[44px] h-11 rounded-xl flex items-center justify-center border-b-2 cursor-pointer ${
                      listeningVoice
                        ? 'bg-rose-500 text-white border-rose-700 animate-pulse'
                        : 'bg-pink-500/25 text-pink-200 border-pink-700/60'
                    }`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
                <input
                  type="search"
                  autoFocus
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={`${t.searchPlaceholderPrefix} YouTube Kids...`}
                  className="flex-1 h-11 px-3.5 rounded-xl bg-[#0B1028] text-sm font-semibold text-white placeholder:text-zinc-400 outline-none border border-white/10"
                />
                <button
                  type="submit"
                  data-tv-focusable="true"
                  className="h-11 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-black cursor-pointer shrink-0"
                >
                  {t.searchLabel}
                </button>
              </form>
            </div>
          )}

          {/* Theme Grid: 2 columns in portrait, 3 or 4 in landscape / tablet / TV */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-1 pb-20">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 landscape:grid-cols-3 lg:landscape:grid-cols-4 gap-3 sm:gap-4">
              {THEME_CARDS.map((card) => (
                <div
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  data-tv-focusable="true"
                  onClick={() => handleSelectTheme(card.id, card.titleKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectTheme(card.id, card.titleKey);
                    }
                  }}
                  className={`group relative rounded-3xl bg-gradient-to-br ${card.bgGradient} border-2 ${card.borderTone} border-b-4 p-4 flex flex-col justify-between gap-3 min-h-[140px] sm:min-h-[160px] cursor-pointer shadow-lg transition-all active:scale-95 hover:scale-[1.02] focus:scale-105 focus:ring-4 focus:ring-amber-400 outline-none`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <KidsAnimatedCategoryIcon name={card.iconName} size={28} />
                    </div>
                    <span className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-amber-400 group-hover:text-slate-950 text-white flex items-center justify-center transition-colors">
                      <Play className="w-4 h-4 fill-current ms-0.5" />
                    </span>
                  </div>

                  <div>
                    <h3 className="font-display font-black text-base sm:text-lg text-white leading-tight">
                      {card.titleKey}
                    </h3>
                    <p className="text-xs text-sky-100/75 line-clamp-1 mt-0.5">
                      {card.descKey}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PANTALLA 2B: LISTA DE VÍDEOS / CANALES (CON SCROLL VERTICAL FLUIDO)
         ========================================================================= */}
      {cinemaStep === 'list' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
          {/* Top Bar inside Cinema List */}
          <div className="shrink-0 flex items-center justify-between gap-2">
            <KidsSquishButton
              onClick={() => {
                triggerHaptic('light');
                playKidsSound('tap', soundEnabled, true);
                setCinemaStep('hub');
              }}
              data-tv-focusable="true"
              className="min-h-[46px] px-3.5 sm:px-4 rounded-2xl bg-[#182352] hover:bg-[#253268] border-b-4 border-[#0F1635] text-white font-black text-xs sm:text-sm flex items-center gap-1.5 shrink-0"
            >
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              <span>{t.backToThemes}</span>
            </KidsSquishButton>

            <div className="flex items-center gap-2 min-w-0">
              <KidsAnimatedCategoryIcon name={activeThemeMeta.iconName} size={22} />
              <h2 className="font-display font-black text-sm sm:text-base text-white truncate">
                {activeQuery ? `"${activeQuery}"` : activeThemeMeta.titleKey}
              </h2>
            </div>

            <KidsSquishButton
              onClick={() => setSearchOpen((v) => !v)}
              data-tv-focusable="true"
              ariaLabel={t.searchLabel}
              className={`min-h-[46px] min-w-[46px] px-3 rounded-2xl border-b-4 text-xs font-black flex items-center justify-center shrink-0 ${
                searchOpen
                  ? 'bg-sky-400 text-slate-950 border-sky-600'
                  : 'bg-[#182352] hover:bg-[#253268] text-white border-[#0F1635]'
              }`}
            >
              {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </KidsSquishButton>
          </div>

          {/* Search Box & Voice when opened in List view */}
          {searchOpen && (
            <div className="shrink-0 rounded-2xl bg-[#141C42] border-2 border-sky-400/40 p-2.5 shadow-lg">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                {supportsVoice && (
                  <button
                    type="button"
                    onClick={handleVoiceSearch}
                    data-tv-focusable="true"
                    aria-label={t.voiceSearchLabel}
                    className={`min-w-[44px] h-11 rounded-xl flex items-center justify-center border-b-2 cursor-pointer ${
                      listeningVoice
                        ? 'bg-rose-500 text-white border-rose-700 animate-pulse'
                        : 'bg-pink-500/25 text-pink-200 border-pink-700/60'
                    }`}
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
                <input
                  type="search"
                  autoFocus
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={`${t.searchPlaceholderPrefix} YouTube Kids...`}
                  className="flex-1 h-11 px-3.5 rounded-xl bg-[#0B1028] text-sm font-semibold text-white placeholder:text-zinc-400 outline-none border border-white/10"
                />
                <button
                  type="submit"
                  data-tv-focusable="true"
                  className="h-11 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-black cursor-pointer shrink-0"
                >
                  {t.searchLabel}
                </button>
              </form>
            </div>
          )}

          {errorMsg && (
            <div className="shrink-0 px-3.5 py-2 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-xs font-bold text-rose-100">
              {errorMsg}
            </div>
          )}

          {/* NATURAL VERTICAL SCROLLABLE VIDEO CATALOG */}
          <div
            ref={listScrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-1 pb-24"
          >
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 landscape:grid-cols-2 md:landscape:grid-cols-3 lg:landscape:grid-cols-4 gap-3.5">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-48 rounded-3xl bg-[#162046]/75 animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="min-h-[260px] rounded-3xl bg-[#131B3D] border-2 border-white/10 flex flex-col items-center justify-center p-6 text-center gap-3">
                <div className="text-5xl">📺</div>
                <p className="text-base font-bold text-white max-w-sm">
                  {category === 'recent' ? t.emptyRecent : t.emptyDefault}
                </p>
                <KidsSquishButton
                  onClick={() => {
                    setActiveQuery('');
                    setSearchDraft('');
                    setCategory('cartoons');
                  }}
                  data-tv-focusable="true"
                  className="px-6 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-slate-950 text-sm font-black"
                >
                  {t.seeAllKids}
                </KidsSquishButton>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 landscape:grid-cols-2 md:landscape:grid-cols-3 lg:landscape:grid-cols-4 gap-3.5">
                {items.map((item) => {
                  const isChannel =
                    item.platform === 'Riffan Kids Live' || item.id.startsWith('kids-live-');
                  const posterBroken = brokenPosters[item.id];

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      data-tv-focusable="true"
                      onClick={() => handleSelectPlayable(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectPlayable(item);
                        }
                      }}
                      className="group relative rounded-3xl bg-[#151D42] border-2 border-[#293874] border-b-4 hover:border-amber-300 overflow-hidden text-start flex flex-col cursor-pointer transition-all active:scale-[0.98] hover:scale-[1.02] focus:scale-105 focus:ring-4 focus:ring-amber-400 shadow-xl outline-none"
                    >
                      {/* Thumbnail Container (16:9 ratio) */}
                      <div className="relative aspect-video w-full bg-[#1C2652] overflow-hidden">
                        <KidsAnimatedPosterSvg
                          title={item.title}
                          year={item.year}
                          rating={item.rating}
                          langCode={kidsLang}
                          mediaType={isChannel ? 'tv' : 'movie'}
                          category={category}
                          genres={item.genres}
                          className="absolute inset-0 w-full h-full"
                        />

                        {!posterBroken && item.poster && !isChannel && (
                          <img
                            src={item.poster}
                            alt={item.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenPosters((prev) => ({ ...prev, [item.id]: true }))
                            }
                            className="relative z-10 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        )}

                        <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#0D132D]/95 via-transparent to-transparent pointer-events-none" />

                        {/* Large Play Button */}
                        <span className="absolute z-30 inset-0 m-auto w-14 h-14 rounded-full bg-amber-400/95 group-hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                          <Play className="w-7 h-7 fill-current ms-1" />
                        </span>

                        {/* Duration or Live Badge */}
                        <div className="absolute z-30 top-2.5 end-2.5 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-sm text-[11px] font-black text-white flex items-center gap-1 shadow-md">
                          {isChannel ? (
                            <>
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span>LIVE TV</span>
                            </>
                          ) : (
                            <span>{item.quality || item.year || 'HD'}</span>
                          )}
                        </div>
                      </div>

                      {/* Card Content with 2-line title */}
                      <div className="p-3 bg-[#111736] flex-1 flex flex-col justify-between gap-1.5">
                        <h3 className="font-display font-extrabold text-sm sm:text-base text-white line-clamp-2 leading-snug">
                          {item.title}
                        </h3>

                        <div className="flex items-center justify-between text-xs text-sky-200/70 pt-1 border-t border-white/5">
                          <div className="flex items-center gap-1.5 truncate">
                            {isChannel ? (
                              <Tv className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <Youtube className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            )}
                            <span className="truncate">
                              {isChannel ? t.catLive : item.overview || 'YouTube Kids'}
                            </span>
                          </div>
                          <span className="font-bold text-amber-300 shrink-0">+1 ⭐</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
