import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Mic,
  Play,
  Search,
  Star,
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
import { FlagBadgeSvg } from '../ui/LanguageBadge';
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
  title: string;
  subtitle: string;
  iconName: KidsAnimatedIconId;
  bgGradient: string;
  borderTone: string;
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
  const activeProfile = useKidsStore((s) => s.getActiveProfile());
  const earnCinemaByLearning = Boolean(activeProfile.parentPrefs?.earnCinemaByLearning);
  const earnedCinemaMinutes = activeProfile.parentPrefs?.earnedCinemaMinutes ?? 15;
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const [cinemaStep, setCinemaStep] = useState<'hub' | 'list'>(
    approvedOnlyMode ? 'list' : 'hub'
  );
  const [category, setCategory] = useState<KidsCinemaCategory>('cartoons');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [items, setItems] = useState<CatalogMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [listeningVoice, setListeningVoice] = useState(false);
  const [brokenPosters, setBrokenPosters] = useState<Record<string, boolean>>({});
  const [bankEmptyNotice, setBankEmptyNotice] = useState(false);

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

  const THEME_CARDS: CinemaThemeCard[] = useMemo(
    () => [
      {
        id: 'cartoons',
        title: t.catCartoons,
        subtitle: 'Bluey, Pocoyó, Peppa Pig...',
        iconName: 'cinema',
        bgGradient: 'from-amber-500/25 via-amber-600/15 to-[#181E3C]',
        borderTone: 'border-amber-400/50 hover:border-amber-300',
      },
      {
        id: 'animals',
        title: t.catAnimals,
        subtitle: t.vocabAnimals,
        iconName: 'animals',
        bgGradient: 'from-teal-500/25 via-teal-600/15 to-[#13233A]',
        borderTone: 'border-teal-400/50 hover:border-teal-300',
      },
      {
        id: 'dinosaurs',
        title: t.catDinos,
        subtitle: 'T-Rex, Triceratops',
        iconName: 'dinosaurs',
        bgGradient: 'from-emerald-500/25 via-emerald-600/15 to-[#132825]',
        borderTone: 'border-emerald-400/50 hover:border-emerald-300',
      },
      {
        id: 'space',
        title: t.catSpace,
        subtitle: 'Planetas & Astronautas',
        iconName: 'space',
        bgGradient: 'from-indigo-500/25 via-indigo-600/15 to-[#17193C]',
        borderTone: 'border-indigo-400/50 hover:border-indigo-300',
      },
      {
        id: 'songs',
        title: t.catSongs,
        subtitle: 'YouTube Kids Audio',
        iconName: 'songs',
        bgGradient: 'from-pink-500/25 via-pink-600/15 to-[#281834]',
        borderTone: 'border-pink-400/50 hover:border-pink-300',
      },
      {
        id: 'magic',
        title: t.catMagic,
        subtitle: 'Fábulas & Aventuras',
        iconName: 'magic',
        bgGradient: 'from-purple-500/25 via-purple-600/15 to-[#221639]',
        borderTone: 'border-purple-400/50 hover:border-purple-300',
      },
      {
        id: 'educational',
        title: t.catLearn,
        subtitle: 'STEAM & Idiomas',
        iconName: 'educational',
        bgGradient: 'from-sky-500/25 via-sky-600/15 to-[#13223D]',
        borderTone: 'border-sky-400/50 hover:border-sky-300',
      },
      {
        id: 'recent',
        title: t.catRecent,
        subtitle: 'Últimos vistos',
        iconName: 'recent',
        bgGradient: 'from-violet-500/25 via-violet-600/15 to-[#181B3D]',
        borderTone: 'border-violet-400/50 hover:border-violet-300',
      },
    ],
    [t]
  );

  // Fetch strict YouTube Kids filtered by language + age group
  useEffect(() => {
    if (cinemaStep !== 'list') return;

    if (approvedOnlyMode) {
      setLoading(false);
      setErrorMsg(null);
      setItems(approvedItems.filter((it) => it.platform === 'YouTube Kids'));
      return;
    }

    if (category === 'recent') {
      setLoading(false);
      setErrorMsg(null);
      setItems(recentWatched.filter((it) => it.platform === 'YouTube Kids'));
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
    if (earnCinemaByLearning && earnedCinemaMinutes <= 0) {
      playKidsSound('error', soundEnabled, true);
      setBankEmptyNotice(true);
      return;
    }
    setBankEmptyNotice(false);
    triggerHaptic('light');
    playKidsSound('success', soundEnabled, true);
    if (ageGroup === '3-5' && soundEnabled) {
      void speakKidsText(item.title, kidsLang, { ageGroup });
    }
    onEarnStar(1);
    onPlayItem(item, items);
  };

  const activeThemeMeta = THEME_CARDS.find((c) => c.id === category) || THEME_CARDS[0];

  return (
    <div dir={dir} className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      {earnCinemaByLearning && (
        <div
          className={`shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs font-black ${
            earnedCinemaMinutes <= 0
              ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
              : 'bg-amber-400/15 border-amber-300/35 text-amber-200'
          }`}
        >
          <span>
            {earnedCinemaMinutes <= 0
              ? 'Banco de cine agotado (0 min). Gana +2 min por cada acierto en Idiomas o Juegos.'
              : `Tiempo de cine ganado aprendiendo: ${earnedCinemaMinutes} min disponibles`}
          </span>
          {bankEmptyNotice && (
            <span className="text-[11px] text-white">Completa un reto educativo para desbloquear.</span>
          )}
        </div>
      )}
      {/* =========================================================================
          CINEMA HUB: 8 VISUAL YOUTUBE KIDS THEMES
         ========================================================================= */}
      {cinemaStep === 'hub' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
          <div className="shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-400/25 text-xs font-bold text-rose-100">
              <Youtube className="w-4 h-4 text-rose-400 shrink-0" />
              <FlagBadgeSvg code={activeLangMeta.flagCode} className="w-4 h-2.5 shrink-0" />
              <span className="truncate">{activeLangMeta.nativeLabel} · {ageGroup} {t.yearsLabel}</span>
            </div>

            <KidsSquishButton
              onClick={() => setSearchOpen((v) => !v)}
              ariaLabel={t.searchLabel}
              className={`!min-h-[40px] h-10 px-3.5 rounded-xl border-b-4 text-xs sm:text-sm font-black flex items-center gap-1.5 shrink-0 ${
                searchOpen
                  ? 'bg-sky-400 text-slate-950 border-sky-600'
                  : 'bg-[#182352] hover:bg-[#253268] text-white border-[#0F1635]'
              }`}
            >
              {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
              <span>{t.searchLabel}</span>
            </KidsSquishButton>
          </div>

          {searchOpen && (
            <div className="shrink-0 rounded-2xl bg-[#141C42] border-2 border-sky-400/40 p-2 shadow-lg">
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
                  placeholder={t.searchPlaceholderPrefix}
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

          {/* Theme Grid: adapts seamlessly across Mobile Portrait, Mobile Landscape, Tablet, and Google TV */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-1 pb-20 sm:pb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4">
              {THEME_CARDS.map((card) => (
                <div
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  data-tv-focusable="true"
                  onClick={() => handleSelectTheme(card.id, card.title)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectTheme(card.id, card.title);
                    }
                  }}
                  className={`group relative rounded-3xl bg-gradient-to-br ${card.bgGradient} border-2 ${card.borderTone} border-b-4 p-3.5 sm:p-4 flex flex-col justify-between gap-2.5 min-h-[124px] sm:min-h-[150px] landscape:min-h-[104px] cursor-pointer shadow-lg transition-all active:scale-95 hover:scale-[1.02] focus:scale-105 focus:ring-4 focus:ring-amber-400 outline-none`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <KidsAnimatedCategoryIcon name={card.iconName} size={26} />
                    </div>
                    <span className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-amber-400 group-hover:text-slate-950 text-white flex items-center justify-center transition-colors">
                      <Play className="w-4 h-4 fill-current ms-0.5" />
                    </span>
                  </div>

                  <div>
                    <h3 className="font-display font-black text-sm sm:text-lg text-white leading-tight">
                      {card.title}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-sky-100/75 line-clamp-1 mt-0.5">
                      {card.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CINEMA LIST: YOUTUBE KIDS FILTERED VIDEOS
         ========================================================================= */}
      {cinemaStep === 'list' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
          <div className="shrink-0 flex items-center justify-between gap-2">
            <KidsSquishButton
              onClick={() => {
                triggerHaptic('light');
                playKidsSound('tap', soundEnabled, true);
                setCinemaStep('hub');
              }}
              className="px-3.5 sm:px-4 rounded-2xl bg-[#182352] hover:bg-[#253268] border-b-4 border-[#0F1635] text-white font-black text-xs sm:text-sm flex items-center gap-1.5 shrink-0"
            >
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              <span>{t.backToThemes}</span>
            </KidsSquishButton>

            <div className="flex items-center gap-2 min-w-0">
              <KidsAnimatedCategoryIcon name={activeThemeMeta.iconName} size={22} />
              <h2 className="font-display font-black text-sm sm:text-base text-white truncate">
                {activeQuery ? `"${activeQuery}"` : activeThemeMeta.title}
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10 text-[11px] font-black text-amber-300 shrink-0">
                <FlagBadgeSvg code={activeLangMeta.flagCode} className="w-3.5 h-2.5" />
                <span>{ageGroup}</span>
              </span>
            </div>

            <KidsSquishButton
              onClick={() => setSearchOpen((v) => !v)}
              ariaLabel={t.searchLabel}
              className={`px-3 rounded-2xl border-b-4 text-xs font-black flex items-center justify-center shrink-0 ${
                searchOpen
                  ? 'bg-sky-400 text-slate-950 border-sky-600'
                  : 'bg-[#182352] hover:bg-[#253268] text-white border-[#0F1635]'
              }`}
            >
              {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </KidsSquishButton>
          </div>

          {approvedOnlyMode && (
            <div className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-xs font-bold text-emerald-100">
              {t.parentApprovedBanner}
            </div>
          )}

          {searchOpen && (
            <div className="shrink-0 rounded-2xl bg-[#141C42] border-2 border-sky-400/40 p-2 shadow-lg">
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
                  placeholder={t.searchPlaceholderPrefix}
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

          <div
            ref={listScrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-1 pb-24 sm:pb-6"
          >
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 landscape:grid-cols-3 gap-3.5">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-48 rounded-3xl bg-[#162046]/75 animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="min-h-[240px] rounded-3xl bg-[#131B3D] border-2 border-white/10 flex flex-col items-center justify-center p-6 text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-400/30 flex items-center justify-center">
                  <Youtube className="w-9 h-9 text-rose-400" />
                </div>
                <p className="text-base font-bold text-white max-w-sm">
                  {category === 'recent' ? t.emptyRecent : t.emptyDefault}
                </p>
                <KidsSquishButton
                  onClick={() => {
                    setActiveQuery('');
                    setSearchDraft('');
                    setCategory('cartoons');
                  }}
                  className="px-6 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-slate-950 text-sm font-black"
                >
                  {t.seeAllKids}
                </KidsSquishButton>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 landscape:grid-cols-3 gap-3.5">
                {items.map((item) => {
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
                      <div className="relative aspect-video w-full bg-[#1C2652] overflow-hidden">
                        <KidsAnimatedPosterSvg
                          title={item.title}
                          year={item.year}
                          rating={ageGroup}
                          langCode={kidsLang}
                          mediaType="movie"
                          category={category}
                          genres={item.genres}
                          className="absolute inset-0 w-full h-full"
                        />

                        {!posterBroken && item.poster && (
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

                        <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#0D132D]/90 via-transparent to-transparent pointer-events-none" />

                        <span className="absolute z-30 inset-0 m-auto w-14 h-14 rounded-full bg-amber-400/95 group-hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                          <Play className="w-7 h-7 fill-current ms-1" />
                        </span>

                        <div className="absolute z-30 top-2.5 end-2.5 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-sm text-[11px] font-black text-white shadow-md">
                          {item.quality || 'HD'}
                        </div>
                      </div>

                      <div className="p-3 bg-[#111736] flex-1 flex flex-col justify-between gap-1.5">
                        <h3 className="font-display font-extrabold text-sm sm:text-base text-white line-clamp-2 leading-snug">
                          {item.title}
                        </h3>

                        <div className="flex items-center justify-between text-xs text-sky-200/75 pt-1 border-t border-white/5">
                          <div className="flex items-center gap-1.5 truncate">
                            <Youtube className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span className="truncate">{item.overview || 'YouTube Kids'}</span>
                          </div>
                          <span className="inline-flex items-center gap-1 font-bold text-amber-300 shrink-0 tabular-nums">
                            +1
                            <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                          </span>
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
