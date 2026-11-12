import React, { useEffect, useState } from 'react';
import {
  Search,
  Film,
  Play,
  RefreshCw,
  Loader2,
  Tv,
  Sparkles,
  X,
  Heart,
  Plus,
  Youtube,
  ArrowLeft,
  Trash2,
  ListVideo,
  Link2,
  Clock,
  Star,
  RotateCcw,
  Info,
  Columns2,
  Check,
  Vote,
  Radio,
  Trophy,
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  FavoriteChannelItem,
  LiveScoreMatch,
  RoomQueueItem,
  SpanishTdtChannel,
  SportsMatch,
  TdtCategory,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../types';
import { UI_COPY } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import {
  buildChannelFavId,
  deduplicateWatchlist,
  getCatalogFavoriteKey,
  isSameCatalogItem,
  sanitizeItemKey,
} from '../utils/storage';
import { MediaDetailsModal } from './MediaDetailsModal';
import stadiumBackdrop from '../assets/images/sports_stadium_backdrop_1794353709543.jpg';
import f1Backdrop from '../assets/images/motorsport_f1_backdrop_1794353709150.jpg';

function formatShortTime(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export type CatalogSection =
  | 'movies'
  | 'vose'
  | 'series'
  | 'tdt'
  | 'sports'
  | 'youtube'
  | 'direct';

const TDT_CATEGORIES: { id: 'all' | TdtCategory; es: string; en: string }[] = [
  { id: 'all', es: 'Todos en Vivo', en: 'All Live TV' },
  { id: 'movistar', es: 'Movistar+', en: 'Movistar+' },
  { id: 'dazn', es: 'DAZN', en: 'DAZN' },
  { id: 'generalistas', es: 'TDT Generalistas (1–6)', en: 'National TDT (1–6)' },
  { id: 'cine_series', es: 'Cine & Series', en: 'Movies & Series' },
  { id: 'entretenimiento', es: 'Entretenimiento', en: 'Entertainment' },
  { id: 'noticias_deportes', es: '24h & Deportes TDT', en: 'News & TDT Sports' },
  { id: 'infantil_autonomicas', es: 'Infantil & Autonómicas', en: 'Kids & Regional' },
];

const MOVIE_CATEGORIES = [
  { id: 'trending', es: 'Tendencias', en: 'Trending' },
  { id: 'popular', es: 'Populares', en: 'Popular' },
  { id: 'top_rated', es: 'Mejor Valoradas', en: 'Top Rated' },
  { id: 'now_playing', es: 'En Cines', en: 'In Theaters' },
  { id: 'action', es: 'Acción', en: 'Action' },
  { id: 'scifi', es: 'Sci-Fi', en: 'Sci-Fi' },
  { id: 'horror', es: 'Terror', en: 'Horror' },
  { id: 'comedy', es: 'Comedia', en: 'Comedy' },
  { id: 'animation', es: 'Animación', en: 'Animation' },
  { id: 'thriller', es: 'Thriller', en: 'Thriller' },
  { id: 'adventure', es: 'Aventura', en: 'Adventure' },
  { id: 'drama', es: 'Drama', en: 'Drama' },
] as const;

const SERIES_CATEGORIES = [
  { id: 'trending', es: 'Tendencias TV', en: 'Trending TV' },
  { id: 'popular', es: 'Populares', en: 'Popular' },
  { id: 'top_rated', es: 'Mejor Valoradas', en: 'Top Rated' },
  { id: 'scifi', es: 'Sci-Fi & Fantasía', en: 'Sci-Fi & Fantasy' },
  { id: 'action', es: 'Acción & Aventura', en: 'Action & Adventure' },
  { id: 'drama', es: 'Drama', en: 'Drama' },
  { id: 'crime', es: 'Crimen', en: 'Crime' },
  { id: 'comedy', es: 'Comedia', en: 'Comedy' },
  { id: 'animation', es: 'Animación & Anime', en: 'Animation & Anime' },
  { id: 'mystery', es: 'Misterio', en: 'Mystery' },
] as const;

const YOUTUBE_QUICK_TOPICS = [
  { labelEs: 'Resúmenes LaLiga & Champions', labelEn: 'Football Highlights', q: 'resumen partido laliga champions highlights hd' },
  { labelEs: 'Trailers Cine 4K', labelEn: '4K Movie Trailers', q: 'official movie trailer 2025 4k' },
  { labelEs: 'Música & Videoclips', labelEn: 'Music Videos', q: 'latin hits music video oficial' },
  { labelEs: 'F1 & Motorsport', labelEn: 'F1 Highlights', q: 'formula 1 race highlights official' },
  { labelEs: 'Comedia & Stand-Up', labelEn: 'Stand-Up Comedy', q: 'monologos comedia stand up español' },
  { labelEs: 'Lo-Fi Chill Room', labelEn: 'Lo-Fi Beats', q: 'lofi hip hop radio beats to relax' },
] as const;

interface MediaCatalogHubProps {
  activeSection: CatalogSection;
  onChangeSection: (section: CatalogSection) => void;
  lang: AppLanguage;
  userName: string;
  activeVideoRawUrl: string;
  loadingItemId: string | null;
  roomQueue: RoomQueueItem[];
  watchHistory: WatchHistoryItem[];
  watchlist: CatalogMovie[];
  favoriteChannels: FavoriteChannelItem[];
  onToggleCatalogFavorite: (item: CatalogMovie) => void;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onPlayFavoriteChannel: (channel: FavoriteChannelItem) => void;
  onPlayMovie: (movie: CatalogMovie, preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN'
  ) => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onRemoveHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
  onPlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  onPlayCustomUrl: (url: string) => void;
  onOpenCloudBrowser: (url: string) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  onRemoveFromQueue: (itemId: string) => void;
  onPlayQueueItem: (item: RoomQueueItem) => void;
  onStartPollFromQueue?: () => void;
  onPlaySecondaryChannel?: (opts: {
    sourceUrl: string;
    title: string;
    subtitle?: string;
  }) => void;
  hasConnectedSmartTv?: boolean;
  activeMediaTitle?: string;
}

export const MediaCatalogHub: React.FC<MediaCatalogHubProps> = ({
  activeSection,
  onChangeSection,
  lang,
  activeVideoRawUrl,
  activeMediaTitle = '',
  loadingItemId,
  roomQueue,
  watchHistory,
  watchlist,
  favoriteChannels,
  onToggleCatalogFavorite,
  onToggleChannelFavorite,
  onPlayFavoriteChannel,
  onPlayMovie,
  onPlaySeriesEpisode,
  onReplayHistoryItem,
  onRemoveHistoryItem,
  onClearHistory,
  onPlaySportsMatch,
  onPlayTdtChannel,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
  onOpenCloudBrowser,
  onAddToQueue,
  onRemoveFromQueue,
  onPlayQueueItem,
  onStartPollFromQueue,
  onPlaySecondaryChannel,
}) => {
  const t = UI_COPY[lang];

  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [previewItem, setPreviewItem] = useState<CatalogMovie | null>(null);
  const [liveScores, setLiveScores] = useState<LiveScoreMatch[]>([]);

  // Movies & Bingetrix state
  const [movieQuery, setMovieQuery] = useState('');
  const [debouncedMovieQuery, setDebouncedMovieQuery] = useState('');
  const [movieCategory, setMovieCategory] = useState<string>('trending');
  const [moviePage, setMoviePage] = useState<number>(1);
  const [hasMoreMovies, setHasMoreMovies] = useState<boolean>(false);
  const [movies, setMovies] = useState<CatalogMovie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);
  const [brokenPosters, setBrokenPosters] = useState<Record<string, boolean>>({});
  const [spotlightImgFailed, setSpotlightImgFailed] = useState(false);

  // TV Series state
  const [seriesQuery, setSeriesQuery] = useState('');
  const [debouncedSeriesQuery, setDebouncedSeriesQuery] = useState('');
  const [seriesCategory, setSeriesCategory] = useState<string>('trending');
  const [seriesLangMode, setSeriesLangMode] = useState<'ES' | 'LAT' | 'VOSE' | 'EN'>('ES');
  const [seriesPage, setSeriesPage] = useState<number>(1);
  const [hasMoreSeries, setHasMoreSeries] = useState<boolean>(false);
  const [seriesList, setSeriesList] = useState<CatalogMovie[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingMoreSeries, setLoadingMoreSeries] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<TvSeriesDetails | null>(null);
  const [loadingSeriesDetails, setLoadingSeriesDetails] = useState(false);
  const [brokenEpisodeImgs, setBrokenEpisodeImgs] = useState<Record<string, boolean>>({});

  // Spanish TDT Live Television state
  const [tdtChannels, setTdtChannels] = useState<SpanishTdtChannel[]>([]);
  const [loadingTdt, setLoadingTdt] = useState(false);
  const [tdtCategory, setTdtCategory] = useState<'all' | TdtCategory>('all');
  const [tdtSearch, setTdtSearch] = useState('');

  // Sports state
  const [sportsEvents, setSportsEvents] = useState<SportsMatch[]>([]);
  const [loadingSports, setLoadingSports] = useState(false);
  const [sportFilter, setSportFilter] = useState<
    'all' | 'soccer' | 'motor' | 'basketball' | 'tennis'
  >('all');
  const [sportsSearch, setSportsSearch] = useState('');
  const [brokenHeroImgs, setBrokenHeroImgs] = useState<Record<string, boolean>>({});

  // YouTube state
  const [ytQuery, setYtQuery] = useState('');
  const [debouncedYtQuery, setDebouncedYtQuery] = useState('resumen partido laliga champions highlights hd');
  const [ytResults, setYtResults] = useState<YouTubeSearchItem[]>([]);
  const [loadingYt, setLoadingYt] = useState(false);

  // Direct link / Cloud state
  const [customUrl, setCustomUrl] = useState('');
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  // Debounce Movie Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMovieQuery(movieQuery.trim());
      setMoviePage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [movieQuery]);

  // Debounce Series Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSeriesQuery(seriesQuery.trim());
      setSeriesPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [seriesQuery]);

  // Debounce YouTube Search
  useEffect(() => {
    const clean = ytQuery.trim();
    if (!clean) return;
    const timer = setTimeout(() => {
      setDebouncedYtQuery(clean);
    }, 360);
    return () => clearTimeout(timer);
  }, [ytQuery]);

  // Fetch Movies (Spanish Cinema OR Full Bingetrix English Catalog)
  useEffect(() => {
    if (activeSection !== 'movies' && activeSection !== 'vose') return;
    if (showWatchlistOnly) return;

    let cancelled = false;
    if (moviePage === 1) {
      setLoadingMovies(true);
      setSpotlightImgFailed(false);
    } else {
      setLoadingMoreMovies(true);
    }

    const endpoint =
      activeSection === 'vose'
        ? `/api/catalog/bingetrix?category=${encodeURIComponent(movieCategory)}&page=${moviePage}&query=${encodeURIComponent(debouncedMovieQuery)}`
        : `/api/catalog/movies?category=${encodeURIComponent(movieCategory)}&page=${moviePage}&query=${encodeURIComponent(debouncedMovieQuery)}`;

    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const incoming: CatalogMovie[] = Array.isArray(data?.movies) ? data.movies : [];
        setHasMoreMovies(Boolean(data?.hasMore));
        setMovies((prev) => {
          if (moviePage === 1) return incoming;
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
        });
      })
      .catch(() => {
        if (!cancelled && moviePage === 1) setMovies([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMovies(false);
          setLoadingMoreMovies(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, movieCategory, moviePage, debouncedMovieQuery, showWatchlistOnly]);

  // Fetch TV Series Catalog
  useEffect(() => {
    if (activeSection !== 'series') return;
    let cancelled = false;
    if (seriesPage === 1) {
      setLoadingSeries(true);
    } else {
      setLoadingMoreSeries(true);
    }

    const apiLang = seriesLangMode === 'EN' ? 'en' : 'es';
    fetch(
      `/api/catalog/series?category=${encodeURIComponent(seriesCategory)}&page=${seriesPage}&lang=${apiLang}&query=${encodeURIComponent(debouncedSeriesQuery)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const incoming: CatalogMovie[] = Array.isArray(data?.series) ? data.series : [];
        setHasMoreSeries(Boolean(data?.hasMore));
        setSeriesList((prev) => {
          if (seriesPage === 1) return incoming;
          const seen = new Set(prev.map((s) => s.id));
          return [...prev, ...incoming.filter((s) => !seen.has(s.id))];
        });
      })
      .catch(() => {
        if (!cancelled && seriesPage === 1) setSeriesList([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSeries(false);
          setLoadingMoreSeries(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, seriesCategory, seriesPage, seriesLangMode, debouncedSeriesQuery]);

  // Fetch Series Seasons & Episodes (includes real probed availableLanguages)
  const openSeriesDetails = (tmdbId: number, seasonNum = 1) => {
    setLoadingSeriesDetails(true);
    const apiLang = seriesLangMode === 'EN' ? 'en' : 'es';
    fetch(`/api/catalog/tv/${tmdbId}?season=${seasonNum}&lang=${apiLang}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.details) {
          const nextSeries: TvSeriesDetails = data.details;
          setSelectedSeries(nextSeries);
          const avail = nextSeries.availableLanguages;
          if (Array.isArray(avail) && avail.length > 0) {
            setSeriesLangMode((prev) => (avail.includes(prev) ? prev : avail[0]));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSeriesDetails(false));
  };

  // Fetch Sports Agenda + Live Real-Time Scoreboards
  const fetchSportsAgenda = () => {
    setLoadingSports(true);
    fetch('/api/catalog/sports')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.events)) {
          setSportsEvents(data.events);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSports(false));

    fetch('/api/sports/scores')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.scores)) {
          setLiveScores(data.scores);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (activeSection !== 'sports') return;
    if (sportsEvents.length === 0 || liveScores.length === 0) {
      fetchSportsAgenda();
    }
    const scoreTimer = setInterval(() => {
      fetch('/api/sports/scores')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data?.scores)) setLiveScores(data.scores);
        })
        .catch(() => {});
    }, 45000);
    return () => clearInterval(scoreTimer);
  }, [activeSection]);

  // Fetch YouTube Search Results
  useEffect(() => {
    if (activeSection !== 'youtube') return;
    let cancelled = false;
    setLoadingYt(true);

    fetch(`/api/catalog/youtube?q=${encodeURIComponent(debouncedYtQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.videos)) {
          setYtResults(data.videos);
        }
      })
      .catch(() => {
        if (!cancelled) setYtResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingYt(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, debouncedYtQuery]);

  // Fetch Spanish TDT Live Channels
  const fetchTdtCatalog = async () => {
    setLoadingTdt(true);
    try {
      const res = await fetch('/api/catalog/tdt');
      const data = await res.json();
      if (Array.isArray(data?.channels)) {
        setTdtChannels(data.channels);
      }
    } catch {
      // Keep cached channels if transient network hiccup
    } finally {
      setLoadingTdt(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'tdt' && tdtChannels.length === 0) {
      fetchTdtCatalog();
    }
  }, [activeSection]);

  const handleToggleBookmark = (item: CatalogMovie, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    onToggleCatalogFavorite(item);
  };

  const isBookmarked = (item: CatalogMovie) => {
    return watchlist.some((x) => isSameCatalogItem(x, item));
  };

  const isChannelFavorited = (favId: string) => {
    const clean = sanitizeItemKey(favId);
    return favoriteChannels.some((c) => sanitizeItemKey(c.favId) === clean);
  };

  const cleanWatchlist = React.useMemo(() => deduplicateWatchlist(watchlist), [watchlist]);
  const favoriteSeriesList = cleanWatchlist.filter((w) => w.mediaType === 'tv');

  const filteredTdtChannels = tdtChannels.filter((ch) => {
    if (tdtCategory !== 'all' && ch.category !== tdtCategory) return false;
    if (tdtSearch.trim()) {
      const q = tdtSearch.toLowerCase();
      return (
        ch.name.toLowerCase().includes(q) ||
        ch.shortMark.toLowerCase().includes(q) ||
        ch.network.toLowerCase().includes(q) ||
        ch.description.toLowerCase().includes(q) ||
        String(ch.dial) === q.trim()
      );
    }
    return true;
  });

  const filteredSports = sportsEvents.filter((ev) => {
    if (sportFilter !== 'all' && ev.sport !== sportFilter) return false;
    if (sportsSearch.trim()) {
      const q = sportsSearch.toLowerCase();
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.competition.toLowerCase().includes(q) ||
        ev.channels.some((c) => c.label.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const multiplexChannels = filteredSports.filter((e) => e.is247Channel);
  const scheduledMatches = filteredSports.filter((e) => !e.is247Channel);

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    triggerHaptic('success');
    onPlayCustomUrl(customUrl.trim());
  };

  const displayedMovies = showWatchlistOnly ? cleanWatchlist : movies;

  const showSpotlight =
    (activeSection === 'movies' || activeSection === 'vose') &&
    !showWatchlistOnly &&
    !debouncedMovieQuery &&
    !loadingMovies &&
    displayedMovies.length > 0;

  const spotlightMovie = showSpotlight ? displayedMovies[0] : null;
  const gridMovies = showSpotlight ? displayedMovies.slice(1) : displayedMovies;

  const isCinemaFamily =
    activeSection === 'movies' || activeSection === 'vose' || activeSection === 'series';

  return (
    <div className="@container w-full min-w-0 max-w-full space-y-5">
      {/* Netflix-Style Rich Details, Language Selector & 4K Official Trailer Modal */}
      <MediaDetailsModal
        item={previewItem}
        lang={lang}
        defaultAudioLang={activeSection === 'vose' ? 'EN' : 'ES'}
        isBookmarked={previewItem ? isBookmarked(previewItem) : false}
        onClose={() => setPreviewItem(null)}
        onPlayMovie={(m, pLang) => onPlayMovie(m, pLang)}
        onOpenSeriesEpisodes={(tmdbId) => {
          setShowWatchlistOnly(false);
          onChangeSection('series');
          openSeriesDetails(tmdbId, 1);
        }}
        onToggleBookmark={(m) => onToggleCatalogFavorite(m)}
        onAddToQueue={onAddToQueue}
        onSelectSimilar={(sim) => setPreviewItem(sim)}
      />

      {/* ================================================================== */}
      {/* CINEMA UNIVERSE SWITCHER (PELÍCULAS · SERIES TV · TV ESPAÑA)       */}
      {/* ================================================================== */}
      {isCinemaFamily && (
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center p-1 rounded-2xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowWatchlistOnly(false);
                setMoviePage(1);
                if (activeSection === 'series') onChangeSection('movies');
              }}
              className={`min-h-[36px] px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                (activeSection === 'movies' || activeSection === 'vose') && !showWatchlistOnly
                  ? 'bg-white text-[#050508] shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {lang === 'es' ? 'Películas' : 'Movies'}
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowWatchlistOnly(false);
                onChangeSection('series');
              }}
              className={`min-h-[36px] px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeSection === 'series'
                  ? 'bg-white text-[#050508] shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {lang === 'es' ? 'Series TV' : 'TV Series'}
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowWatchlistOnly(false);
                onChangeSection('tdt');
              }}
              className="min-h-[36px] px-4 rounded-xl text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48] animate-pulse" />
              <span>{lang === 'es' ? 'TV España · Vivo' : 'Spain Live TV'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              if (activeSection === 'series') onChangeSection('movies');
              setShowWatchlistOnly((v) => !v);
            }}
            className={`min-h-[38px] px-3.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
              showWatchlistOnly
                ? 'bg-white text-[#050507] border-white'
                : 'bg-[#0D0D12] text-zinc-300 border-white/[0.08] hover:text-white'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${showWatchlistOnly ? 'fill-current text-[#E11D48]' : ''}`} />
            <span>
              {lang === 'es' ? 'Mi Lista' : 'My List'} ({cleanWatchlist.length})
            </span>
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* LIVE BROADCAST SWITCHER (TV ESPAÑA · MOVISTAR+ · DAZN · PARTIDOS)  */}
      {/* ================================================================== */}
      {(activeSection === 'tdt' || activeSection === 'sports') && (
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center p-1 rounded-2xl bg-[#0D0E15] border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setTdtCategory('all');
                onChangeSection('tdt');
              }}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                activeSection === 'tdt' && tdtCategory !== 'movistar' && tdtCategory !== 'dazn'
                  ? 'bg-white text-[#050508] shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Radio
                className={`w-3.5 h-3.5 ${
                  activeSection === 'tdt' && tdtCategory !== 'movistar' && tdtCategory !== 'dazn'
                    ? 'text-[#E11D48]'
                    : ''
                }`}
              />
              <span>{lang === 'es' ? 'TV España (TDT)' : 'Spain Live TV'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setTdtCategory('movistar');
                onChangeSection('tdt');
              }}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                activeSection === 'tdt' && tdtCategory === 'movistar'
                  ? 'bg-[#00A9E0] text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Movistar+</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setTdtCategory('dazn');
                onChangeSection('tdt');
              }}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                activeSection === 'tdt' && tdtCategory === 'dazn'
                  ? 'bg-white text-[#050508] shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Play className="w-3 h-3 fill-current" />
              <span>DAZN</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeSection('sports');
              }}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                activeSection === 'sports'
                  ? 'bg-white text-[#050508] shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Trophy className={`w-3.5 h-3.5 ${activeSection === 'sports' ? 'text-amber-500' : ''}`} />
              <span>{lang === 'es' ? 'Agenda Partidos' : 'Live Matches'}</span>
            </button>
          </div>

          {activeVideoRawUrl && onPlaySecondaryChannel && (
            <span className="hidden sm:inline-flex text-[11px] text-sky-300 items-center gap-1.5 px-2.5">
              <Columns2 className="w-3.5 h-3.5" />
              <span>
                {lang === 'es'
                  ? 'Icono doble = Ver 2 canales a la vez'
                  : 'Split icon = Multi-View'}
              </span>
            </span>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SINGLE APPLE TV+ 16:9 "SEGUIR VIENDO" RAIL                         */}
      {/* ================================================================== */}
      {isCinemaFamily && !showWatchlistOnly && watchHistory.length > 0 && (
        <section
          aria-label={lang === 'es' ? 'Seguir viendo' : 'Continue watching'}
          className="space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-[#E11D48] shrink-0" />
              <h3 className="font-display font-semibold text-xs sm:text-sm text-white truncate">
                {lang === 'es' ? 'Seguir viendo' : 'Continue Watching'}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                if (confirmClearHistory) {
                  onClearHistory();
                  setConfirmClearHistory(false);
                } else {
                  setConfirmClearHistory(true);
                  setTimeout(() => setConfirmClearHistory(false), 3200);
                }
              }}
              className={`text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-all px-2.5 py-1 rounded-xl border ${
                confirmClearHistory
                  ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                  : 'bg-white/[0.04] text-zinc-400 hover:text-white border-white/[0.08]'
              }`}
            >
              <Trash2 className="w-3 h-3" />
              <span>
                {confirmClearHistory
                  ? lang === 'es'
                    ? '¿Confirmar?'
                    : 'Confirm?'
                  : lang === 'es'
                  ? 'Limpiar'
                  : 'Clear'}
              </span>
            </button>
          </div>

          <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-0.5 min-w-0">
            {watchHistory.map((hItem) => {
              const isLoadingThis = loadingItemId === hItem.id;
              const thumb = hItem.backdrop || hItem.poster;
              const imgBroken = brokenPosters[`hist-${hItem.id}`];
              const resumeSec = hItem.resumeTimeSec || 0;
              const durSec = hItem.durationSec || 0;
              const hasResume = resumeSec > 5;
              const progressPct = hasResume
                ? durSec > 60
                  ? Math.min(96, Math.max(8, Math.round((resumeSec / durSec) * 100)))
                  : 28
                : 0;

              const isReadyForNextEp =
                hItem.mediaType === 'tv' &&
                Boolean(hItem.season) &&
                Boolean(hItem.episode) &&
                progressPct >= 88;

              const triggerHistoryCardPlay = () => {
                if (loadingItemId) return;
                triggerHaptic('light');
                if (isReadyForNextEp && hItem.season && hItem.episode) {
                  const nextEp = hItem.episode + 1;
                  onReplayHistoryItem(
                    {
                      ...hItem,
                      id: sanitizeItemKey(
                        `tv-${hItem.tmdbId || hItem.title}-${hItem.season}-${nextEp}`
                      ),
                      episode: nextEp,
                      subtitle: `${hItem.season}x${String(nextEp).padStart(2, '0')}`,
                      resumeTimeSec: 0,
                    },
                    true
                  );
                } else {
                  onReplayHistoryItem(hItem, false);
                }
              };

              return (
                <div
                  key={hItem.id}
                  onClick={triggerHistoryCardPlay}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      triggerHistoryCardPlay();
                    }
                  }}
                  className="group relative w-[200px] sm:w-[224px] shrink-0 rounded-2xl overflow-hidden bg-[#0E0F16] border border-white/[0.07] hover:border-white/25 transition-all flex flex-col cursor-pointer"
                >
                  <div className="relative aspect-[16/9] w-full bg-[#0E0F16] overflow-hidden">
                    {!imgBroken && thumb ? (
                      <img
                        src={thumb}
                        alt={hItem.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenPosters((prev) => ({
                            ...prev,
                            [`hist-${hItem.id}`]: true,
                          }))
                        }
                        className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#0E0F16]">
                        {hItem.mediaType === 'tv' ? (
                          <Tv className="w-6 h-6 text-zinc-500" />
                        ) : (
                          <Film className="w-6 h-6 text-zinc-500" />
                        )}
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                    {/* Restart from 00:00 + Remove item buttons */}
                    <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                      {hasResume && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (loadingItemId) return;
                            triggerHaptic('light');
                            onReplayHistoryItem(hItem, true);
                          }}
                          title={lang === 'es' ? 'Empezar desde el principio' : 'Start from beginning'}
                          aria-label="Empezar desde el principio"
                          className="w-7 h-7 rounded-full bg-black/65 hover:bg-black/90 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('light');
                          onRemoveHistoryItem(hItem.id);
                        }}
                        aria-label="Quitar del historial"
                        className="w-7 h-7 rounded-full bg-black/65 hover:bg-black/90 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-zinc-100 truncate">
                        {hItem.mediaType === 'tv' && hItem.season && hItem.episode && progressPct >= 88
                          ? `▶ Siguiente: ${hItem.season}x${String(hItem.episode + 1).padStart(2, '0')}`
                          : hasResume
                          ? `${lang === 'es' ? 'Seguir' : 'Resume'} · ${formatShortTime(resumeSec)}`
                          : hItem.mediaType === 'tv' && hItem.season && hItem.episode
                          ? `Serie · ${hItem.season}x${String(hItem.episode).padStart(2, '0')}`
                          : `Película · ${hItem.year || 'HD'}`}
                      </span>
                      <span className="w-7 h-7 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-md shrink-0">
                        {isLoadingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </span>
                    </div>

                    {/* Exact Playback Progress Bar */}
                    {hasResume && (
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                        <div
                          className="h-full bg-[#E11D48]"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 flex flex-col gap-0.5">
                    <h4 className="font-display font-semibold text-xs text-white line-clamp-1">
                      {hItem.title}
                    </h4>
                    <span className="text-[11px] text-zinc-400 line-clamp-1">
                      {hItem.mediaType === 'tv' && hItem.season && hItem.episode
                        ? `${hItem.season}x${String(hItem.episode).padStart(2, '0')} · ${
                            hItem.episodeTitle || 'Episodio'
                          }`
                        : hItem.subtitle ||
                          (hItem.preferLang === 'EN' ? 'English 1080p' : 'Español HD')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* SECTION 1 & 2: MOVIES (ESPAÑOL CAST/LAT + BINGETRIX EXPLORE EN)    */}
      {/* ================================================================== */}
      {(activeSection === 'movies' || activeSection === 'vose') && (
        <div className="space-y-4">
          {/* Smart Search Input + Inline ES/VOSE Toggle + Instant URL Auto-Detect */}
          {!showWatchlistOnly && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={movieQuery}
                    onChange={(e) => setMovieQuery(e.target.value)}
                    placeholder={
                      lang === 'es'
                        ? 'Buscar película o pegar cualquier enlace (YouTube, .m3u8, web)...'
                        : 'Search movies or paste any URL (YouTube, .m3u8, web)...'
                    }
                    className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-white/30 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
                  />
                  {movieQuery && (
                    <button
                      type="button"
                      onClick={() => setMovieQuery('')}
                      aria-label="Limpiar búsqueda"
                      className="w-9 h-9 rounded-xl absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Sleek Inline Audio Language Switcher (ES | VOSE) */}
                <div className="flex items-center p-1 rounded-2xl bg-[#0D0D12] border border-white/[0.08] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setMoviePage(1);
                      onChangeSection('movies');
                    }}
                    className={`flex-1 sm:flex-initial min-h-[34px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      activeSection === 'movies'
                        ? 'bg-white text-[#050507]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Español
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setMoviePage(1);
                      onChangeSection('vose');
                    }}
                    className={`flex-1 sm:flex-initial min-h-[34px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      activeSection === 'vose'
                        ? 'bg-white text-[#050507]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    VOSE · EN
                  </button>
                </div>
              </div>

              {/* Instant Pasted URL Action Strip */}
              {/^https?:\/\//i.test(movieQuery.trim()) && (
                <div className="p-3 rounded-2xl bg-[#101016] border border-[#E11D48]/35 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0 text-xs text-zinc-200">
                    <Link2 className="w-4 h-4 text-[#E11D48] shrink-0" />
                    <span className="font-mono truncate max-w-[260px] sm:max-w-[420px]">
                      {movieQuery.trim()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('success');
                        onPlayCustomUrl(movieQuery.trim());
                        setMovieQuery('');
                      }}
                      className="min-h-[36px] px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{lang === 'es' ? 'Reproducir enlace' : 'Play link'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onOpenCloudBrowser(movieQuery.trim());
                        setMovieQuery('');
                      }}
                      className="min-h-[36px] px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>Cloud Browser</span>
                    </button>
                  </div>
                </div>
              )}

              {!debouncedMovieQuery && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (gridMovies.length === 0) return;
                      triggerHaptic('success');
                      const rand = gridMovies[Math.floor(Math.random() * gridMovies.length)];
                      if (rand) setPreviewItem(rand);
                    }}
                    title="Elegir una película al azar"
                    className="min-h-[38px] px-3.5 rounded-full text-xs font-bold bg-[#E11D48]/15 hover:bg-[#E11D48]/25 border border-[#E11D48]/35 text-[#FB7185] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                  >
                    <span>🎲 Sorpréndeme</span>
                  </button>
                  {MOVIE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setMovieCategory(cat.id);
                        setMoviePage(1);
                      }}
                      className={`min-h-[38px] px-4 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
                        movieCategory === cat.id
                          ? 'bg-white text-[#050508] shadow-[0_6px_18px_rgba(255,255,255,0.16)]'
                          : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border border-white/[0.08]'
                      }`}
                    >
                      {lang === 'es' ? cat.es : cat.en}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editorial Spotlight Feature Card */}
          {spotlightMovie && (
            <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0D0D12] min-h-[220px] sm:min-h-[275px] flex flex-col justify-end p-5 sm:p-8 shadow-2xl">
              {!spotlightImgFailed && (spotlightMovie.backdrop || spotlightMovie.poster) ? (
                <img
                  src={spotlightMovie.backdrop || spotlightMovie.poster}
                  alt={spotlightMovie.title}
                  referrerPolicy="no-referrer"
                  onError={() => setSpotlightImgFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1C0B12] via-[#0D0D12] to-[#050507]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/80 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050507]/90 via-[#050507]/45 to-transparent" />

              <div className="relative z-10 max-w-xl space-y-2.5">
                <div className="text-xs text-zinc-300 font-medium">
                  <span className="text-[#E11D48] font-bold uppercase tracking-wider">
                    {activeSection === 'vose'
                      ? 'VOSE 1080p'
                      : lang === 'es'
                      ? 'Estreno Destacado'
                      : 'Featured Screening'}
                  </span>
                  <span className="mx-1.5 text-zinc-600" aria-hidden="true">·</span>
                  <span>{spotlightMovie.year || 'HD'}</span>
                  {spotlightMovie.rating && (
                    <>
                      <span className="mx-1.5 text-zinc-600" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-amber-400">
                        ★ {spotlightMovie.rating}
                      </span>
                    </>
                  )}
                </div>

                <h3 className="font-display font-bold text-xl sm:text-3xl text-white leading-tight text-balance">
                  {spotlightMovie.title}
                </h3>

                <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2 max-w-[54ch]">
                  {spotlightMovie.overview}
                </p>

                <div className="pt-1.5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPreviewItem(spotlightMovie);
                    }}
                    className="min-h-[44px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-xs sm:text-sm font-bold text-white flex items-center gap-2 shadow-lg shadow-[#E11D48]/30 transition-all whitespace-nowrap cursor-pointer"
                  >
                    <Info className="w-4 h-4 text-white" />
                    <span>
                      {lang === 'es'
                        ? 'Ver Ficha y Elegir Idioma'
                        : 'Details & Select Language'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(loadingItemId)}
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayMovie(
                        spotlightMovie,
                        activeSection === 'vose' ? 'EN' : 'ES'
                      );
                    }}
                    className="min-h-[44px] px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    {loadingItemId === spotlightMovie.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 fill-current text-[#E11D48]" />
                    )}
                    <span>
                      {lang === 'es' ? 'Reproducir ahora' : 'Quick Play'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleToggleBookmark(spotlightMovie, e)}
                    className="min-h-[44px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isBookmarked(spotlightMovie) ? 'fill-current text-[#E11D48]' : ''
                      }`}
                    />
                    <span>{isBookmarked(spotlightMovie) ? 'Guardada' : 'Mi Lista'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edge-to-Edge Movie Poster Grid */}
          {loadingMovies ? (
            <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : gridMovies.length === 0 && !spotlightMovie ? (
            <div className="py-14 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-3">
              <Film className="w-8 h-8 text-[#E11D48] mx-auto mb-1" />
              <p className="text-sm font-bold text-white">
                {showWatchlistOnly
                  ? lang === 'es'
                    ? 'Tu lista está vacía'
                    : 'Your Watchlist is empty'
                  : lang === 'es'
                  ? 'No encontramos películas con ese título'
                  : 'No movies found matching your search'}
              </p>
              <p className="text-xs text-zinc-400">
                {lang === 'es'
                  ? 'Prueba con otro título o busca directamente en Series TV.'
                  : 'Try another title or search in TV Series.'}
              </p>
              {!showWatchlistOnly && movieQuery.trim().length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    setSeriesQuery(movieQuery.trim());
                    onChangeSection('series');
                  }}
                  className="mt-2 min-h-[42px] px-5 rounded-2xl bg-white text-[#050508] hover:bg-zinc-200 text-xs font-bold inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                >
                  <Tv className="w-4 h-4 text-[#E11D48]" />
                  <span>
                    {lang === 'es'
                      ? `¿Buscar «${movieQuery.trim()}» en Series TV?`
                      : `Search "${movieQuery.trim()}" in TV Series?`}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
                {gridMovies.map((movie) => {
                  const favKey = getCatalogFavoriteKey(movie);
                  const isExtractingThis = loadingItemId === movie.id || loadingItemId === favKey;
                  const saved = isBookmarked(movie);
                  const imgBroken = brokenPosters[favKey] || brokenPosters[movie.id];
                  const isNowInRoom =
                    Boolean(activeMediaTitle) &&
                    activeMediaTitle.trim().toLowerCase() === movie.title.trim().toLowerCase();
                  const historyEntry = watchHistory.find(
                    (h) =>
                      (movie.tmdbId && h.tmdbId === movie.tmdbId) ||
                      h.title.trim().toLowerCase() === movie.title.trim().toLowerCase()
                  );
                  const watchedPct =
                    historyEntry?.resumeTimeSec && historyEntry?.durationSec && historyEntry.durationSec > 60
                      ? Math.min(100, Math.max(8, Math.round((historyEntry.resumeTimeSec / historyEntry.durationSec) * 100)))
                      : historyEntry?.resumeTimeSec && historyEntry.resumeTimeSec > 15
                      ? 30
                      : 0;

                  return (
                    <div
                      key={favKey}
                      onClick={() => {
                        if (loadingItemId) return;
                        triggerHaptic('light');
                        if (movie.mediaType === 'tv' && movie.tmdbId) {
                          setShowWatchlistOnly(false);
                          onChangeSection('series');
                          openSeriesDetails(movie.tmdbId, 1);
                          return;
                        }
                        // Always open the Movie Detail Sheet (Ficha + Language Selector + Trailer) first
                        setPreviewItem(movie);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !loadingItemId) {
                          if (movie.mediaType === 'tv' && movie.tmdbId) {
                            setShowWatchlistOnly(false);
                            onChangeSection('series');
                            openSeriesDetails(movie.tmdbId, 1);
                            return;
                          }
                          setPreviewItem(movie);
                        }
                      }}
                      className={`group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border active:scale-[0.98] transition-all cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.6)] ${
                        isNowInRoom
                          ? 'border-[#E11D48] ring-1 ring-[#E11D48]/50'
                          : 'border-white/[0.08] hover:border-white/25'
                      }`}
                    >
                      {!imgBroken && movie.poster ? (
                        <img
                          src={movie.poster}
                          alt={movie.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenPosters((prev) => ({ ...prev, [favKey]: true, [movie.id]: true }))
                          }
                          className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-[#0E0F16]">
                          <Film className="w-8 h-8 text-zinc-500 mb-2" />
                          <span className="font-display font-semibold text-xs text-zinc-200 line-clamp-3">
                            {movie.title}
                          </span>
                        </div>
                      )}

                      {/* Top-Left Live Room Status or Completed Check */}
                      {isNowInRoom ? (
                        <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-[#E11D48] text-white text-[10px] font-bold flex items-center gap-1 shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          <span>En sala</span>
                        </div>
                      ) : watchedPct >= 90 ? (
                        <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-emerald-400/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Vista</span>
                        </div>
                      ) : null}

                      {/* Single Discreet Top-Right Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleBookmark(movie, e)}
                        aria-label="Guardar en Mi Lista"
                        className={`absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center active:scale-90 transition-all cursor-pointer ${
                          saved
                            ? 'bg-black/75 border-[#E11D48]/50 text-[#E11D48]'
                            : 'bg-black/45 hover:bg-black/75 border-white/10 text-white/80 hover:text-white'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${saved ? 'fill-current' : ''}`} />
                      </button>

                      {/* Center Extracting / Hover Play Indicator */}
                      {isExtractingThis && (
                        <div className="absolute inset-0 bg-black/55 flex items-center justify-center pointer-events-none">
                          <div className="w-11 h-11 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-2xl">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        </div>
                      )}

                      {/* Editorial Bottom Overlay + 1-Tap Quick Play Pill */}
                      <div className="absolute inset-x-0 bottom-0 pt-16 pb-2.5 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex items-end justify-between gap-2">
                        <div className="min-w-0 flex-1 pointer-events-none">
                          <h3 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug drop-shadow">
                            {movie.title}
                          </h3>
                          <div className="text-[10px] text-zinc-300 truncate mt-1 flex items-center gap-1.5">
                            <span>{movie.year || 'HD'}</span>
                            {movie.rating && (
                              <>
                                <span className="text-zinc-500">·</span>
                                <span className="text-amber-400 font-mono font-bold">
                                  ★ {movie.rating}
                                </span>
                              </>
                            )}
                            <span className="text-zinc-500">·</span>
                            <span className="text-zinc-200 font-semibold">
                              {activeSection === 'vose' ? 'VOSE · EN' : 'Cine HD'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (loadingItemId) return;
                            triggerHaptic('success');
                            if (movie.mediaType === 'tv' && movie.tmdbId) {
                              openSeriesDetails(movie.tmdbId, 1);
                              return;
                            }
                            onPlayMovie(movie, activeSection === 'vose' ? 'EN' : 'ES');
                          }}
                          title={
                            lang === 'es'
                              ? 'Reproducir directamente en la sala'
                              : 'Play directly in room'
                          }
                          aria-label="Reproducir directamente"
                          className="w-8 h-8 rounded-full bg-[#E11D48] hover:bg-[#F43F5E] text-white flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(225,29,72,0.45)] active:scale-90 transition-all cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </button>
                      </div>

                      {/* Watched Progress Bar along Bottom Edge */}
                      {watchedPct > 0 && watchedPct < 90 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 pointer-events-none">
                          <div
                            className="h-full bg-[#E11D48]"
                            style={{ width: `${watchedPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {!showWatchlistOnly && hasMoreMovies && (
                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMoreMovies}
                    onClick={() => {
                      triggerHaptic('light');
                      setMoviePage((p) => p + 1);
                    }}
                    className="min-h-[46px] px-6 rounded-2xl bg-[#0E0F16] hover:bg-white/[0.08] border border-white/12 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {loadingMoreMovies && <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />}
                    <span>
                      {lang === 'es' ? 'Cargar más películas' : 'Load more movies'}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* DEDICATED SERIES EPISODE BROWSER MODAL / BOTTOM SHEET (Z-65)       */}
      {/* Preserves catalog scroll position and works from any section       */}
      {/* ================================================================== */}
      {selectedSeries && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedSeries.title}
          onClick={() => setSelectedSeries(null)}
          className="fixed inset-0 z-[65] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-[880px] max-h-[92dvh] sm:max-h-[88dvh] rounded-t-3xl sm:rounded-3xl bg-[#08090E]/98 backdrop-blur-2xl border-t sm:border border-white/[0.1] shadow-[0_32px_110px_rgba(0,0,0,0.96)] flex flex-col overflow-hidden"
          >
            {/* Mobile Grab Handle */}
            <div className="sm:hidden pt-2.5 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>

            {/* Series Header & Season Selector */}
            <div className="relative p-4 sm:p-6 bg-gradient-to-b from-[#141622] to-[#08090E] border-b border-white/[0.08] space-y-3.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) =>
                      handleToggleBookmark(
                        {
                          id: `series-${selectedSeries.tmdbId}`,
                          tmdbId: selectedSeries.tmdbId,
                          mediaType: 'tv',
                          title: selectedSeries.title,
                          year: selectedSeries.year,
                          rating: selectedSeries.rating,
                          overview: selectedSeries.overview,
                          poster: selectedSeries.poster,
                          backdrop: selectedSeries.backdrop,
                          languages: [],
                        },
                        e
                      )
                    }
                    className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${
                        isBookmarked({
                          id: `series-${selectedSeries.tmdbId}`,
                          tmdbId: selectedSeries.tmdbId,
                          mediaType: 'tv',
                          title: selectedSeries.title,
                          year: selectedSeries.year,
                          rating: selectedSeries.rating,
                          overview: '',
                          poster: selectedSeries.poster,
                          backdrop: selectedSeries.backdrop,
                          languages: [],
                        })
                          ? 'fill-current text-[#E11D48]'
                          : 'text-zinc-300'
                      }`}
                    />
                    <span>
                      {isBookmarked({
                        id: `series-${selectedSeries.tmdbId}`,
                        tmdbId: selectedSeries.tmdbId,
                        mediaType: 'tv',
                        title: selectedSeries.title,
                        year: selectedSeries.year,
                        rating: selectedSeries.rating,
                        overview: '',
                        poster: selectedSeries.poster,
                        backdrop: selectedSeries.backdrop,
                        languages: [],
                      })
                        ? lang === 'es'
                          ? 'En Mi Lista'
                          : 'Saved'
                        : lang === 'es'
                        ? 'Guardar Serie'
                        : 'Save Series'}
                    </span>
                  </button>

                  {loadingSeriesDetails && !Array.isArray(selectedSeries.availableLanguages) ? (
                    <div className="min-h-9 px-3 rounded-xl bg-black/60 border border-white/10 flex items-center gap-1.5 text-xs text-zinc-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E11D48]" />
                      <span>{lang === 'es' ? 'Comprobando idiomas...' : 'Checking audio...'}</span>
                    </div>
                  ) : Array.isArray(selectedSeries.availableLanguages) &&
                    selectedSeries.availableLanguages.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-black/60 border border-white/10">
                      {(
                        [
                          { code: 'ES', label: '🇪🇸 Castellano' },
                          { code: 'LAT', label: '🇲🇽 Latino' },
                          { code: 'VOSE', label: '💬 VOSE' },
                          { code: 'EN', label: '🇬🇧 Inglés' },
                        ] as const
                      )
                        .filter((opt) => selectedSeries.availableLanguages!.includes(opt.code))
                        .map((opt) => (
                          <button
                            key={opt.code}
                            type="button"
                            onClick={() => setSeriesLangMode(opt.code)}
                            className={`min-h-7 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                              seriesLangMode === opt.code
                                ? 'bg-white text-[#050508]'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSeries(null)}
                  aria-label="Cerrar episodios"
                  className="w-9 h-9 rounded-xl bg-white/[0.08] hover:bg-[#E11D48] text-white flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1 max-w-2xl">
                <div className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                  <span className="text-[#E11D48] font-bold uppercase tracking-wider">Serie TV</span>
                  <span>·</span>
                  <span className="text-zinc-200">{selectedSeries.year}</span>
                  {selectedSeries.rating && (
                    <>
                      <span>·</span>
                      <span className="text-amber-400 font-mono font-bold">
                        ★ {selectedSeries.rating}
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span>
                    {selectedSeries.seasons.length}{' '}
                    {lang === 'es' ? 'Temporadas' : 'Seasons'}
                  </span>
                </div>
                <h3 className="font-display font-bold text-xl sm:text-2xl text-white">
                  {selectedSeries.title}
                </h3>
                <p className="text-xs text-zinc-300 line-clamp-2">
                  {selectedSeries.overview}
                </p>
              </div>

              {/* Season Selector Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                {selectedSeries.seasons.map((s) => (
                  <button
                    key={s.seasonNumber}
                    type="button"
                    disabled={loadingSeriesDetails}
                    onClick={() => {
                      triggerHaptic('light');
                      openSeriesDetails(selectedSeries.tmdbId, s.seasonNumber);
                    }}
                    className={`min-h-9 px-4 rounded-full text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                      selectedSeries.activeSeason === s.seasonNumber
                        ? 'bg-white text-[#050508] shadow-sm'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/10'
                    }`}
                  >
                    {lang === 'es' ? `Temporada ${s.seasonNumber}` : `Season ${s.seasonNumber}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Episodes Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {loadingSeriesDetails ? (
                <div className="py-12 flex items-center justify-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin text-[#E11D48]" />
                  <span>Cargando episodios...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedSeries.episodes.map((ep) => {
                    const epLoadId = `tv-${selectedSeries.tmdbId}-${ep.seasonNumber}-${ep.episodeNumber}`;
                    const isExtractingEp = loadingItemId === epLoadId;
                    const stillBroken = brokenEpisodeImgs[ep.id];
                    const epHistory = watchHistory.find(
                      (h) => sanitizeItemKey(h.id) === sanitizeItemKey(epLoadId)
                    );
                    const epResume = epHistory?.resumeTimeSec || 0;
                    const epDur = epHistory?.durationSec || 0;
                    const epProgressPct =
                      epResume > 5
                        ? epDur > 60
                          ? Math.min(96, Math.max(8, Math.round((epResume / epDur) * 100)))
                          : 30
                        : 0;

                    return (
                      <div
                        key={ep.id}
                        onClick={() => {
                          if (loadingItemId) return;
                          triggerHaptic('success');
                          onPlaySeriesEpisode(selectedSeries, ep, seriesLangMode);
                          setSelectedSeries(null);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !loadingItemId) {
                            onPlaySeriesEpisode(selectedSeries, ep, seriesLangMode);
                            setSelectedSeries(null);
                          }
                        }}
                        className="group text-left rounded-2xl bg-[#0E1017] hover:bg-[#151824] border border-white/[0.08] hover:border-white/25 p-3 flex items-center gap-3 transition-all cursor-pointer"
                      >
                        <div className="relative w-28 sm:w-32 aspect-video rounded-xl overflow-hidden bg-[#0E0F16] shrink-0">
                          {!stillBroken && (ep.still || selectedSeries.backdrop) ? (
                            <img
                              src={ep.still || selectedSeries.backdrop}
                              alt={ep.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenEpisodeImgs((prev) => ({ ...prev, [ep.id]: true }))
                              }
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#0E0F16]">
                              <Tv className="w-5 h-5 text-zinc-500" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-md">
                              {isExtractingEp ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              )}
                            </div>
                          </div>
                          {epProgressPct > 0 && (
                            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                              <div
                                className={`h-full ${
                                  epProgressPct >= 88 ? 'bg-emerald-400' : 'bg-[#E11D48]'
                                }`}
                                style={{ width: `${epProgressPct >= 88 ? 100 : epProgressPct}%` }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-[11px] font-mono text-[#FB7185] flex items-center gap-1.5 flex-wrap">
                            <span>
                              {ep.seasonNumber}x{String(ep.episodeNumber).padStart(2, '0')}
                              {ep.runtime ? ` · ${ep.runtime}m` : ''}
                            </span>
                            {epProgressPct >= 88 ? (
                              <span className="inline-flex items-center gap-0.5 text-emerald-400 font-semibold">
                                <Check className="w-3 h-3" />
                                <span>{lang === 'es' ? 'Visto' : 'Watched'}</span>
                              </span>
                            ) : epResume > 5 ? (
                              <span className="text-amber-300">
                                · {lang === 'es' ? 'Seguir' : 'Resume'} {formatShortTime(epResume)}
                              </span>
                            ) : null}
                          </div>
                          <h4 className="font-display font-semibold text-xs sm:text-sm text-white line-clamp-1">
                            {ep.title}
                          </h4>
                          <p className="text-[11px] text-zinc-400 line-clamp-2">
                            {ep.overview || 'Reproducir episodio en alta definición.'}
                          </p>
                        </div>

                        {/* 1-Tap Add Episode to Room Queue */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic('success');
                            onAddToQueue({
                              kind: 'tv',
                              title: `${selectedSeries.title} · ${ep.seasonNumber}x${String(
                                ep.episodeNumber
                              ).padStart(2, '0')}`,
                              subtitle: `${ep.title} (${seriesLangMode})`,
                              poster: ep.still || selectedSeries.poster,
                              tmdbId: selectedSeries.tmdbId,
                              season: ep.seasonNumber,
                              episode: ep.episodeNumber,
                              preferLang: seriesLangMode,
                            });
                          }}
                          title={lang === 'es' ? 'Añadir episodio a la cola' : 'Add episode to queue'}
                          aria-label="Añadir episodio a la cola"
                          className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.15] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 3: TV SERIES CATALOG                                       */}
      {/* ================================================================== */}
      {activeSection === 'series' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={seriesQuery}
                onChange={(e) => setSeriesQuery(e.target.value)}
                placeholder={t.searchSeriesPlaceholder}
                className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-white/30 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none"
              />
              {seriesQuery && (
                <button
                  type="button"
                  onClick={() => setSeriesQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="w-9 h-9 rounded-xl absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center p-1 rounded-2xl bg-[#0D0D12] border border-white/[0.08] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSeriesLangMode('ES');
                  setSeriesPage(1);
                }}
                className={`flex-1 sm:flex-initial min-h-[34px] px-3.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  seriesLangMode !== 'EN' && seriesLangMode !== 'VOSE'
                    ? 'bg-white text-[#050508]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Español
              </button>
              <button
                type="button"
                onClick={() => {
                  setSeriesLangMode('EN');
                  setSeriesPage(1);
                }}
                className={`flex-1 sm:flex-initial min-h-[34px] px-3.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  seriesLangMode === 'EN' || seriesLangMode === 'VOSE'
                    ? 'bg-white text-[#050508]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                VOSE · EN
              </button>
            </div>
          </div>

          {/^https?:\/\//i.test(seriesQuery.trim()) && (
            <div className="p-3 rounded-2xl bg-[#101016] border border-[#E11D48]/35 flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-xs font-mono text-zinc-200 truncate max-w-[260px] sm:max-w-[420px]">
                {seriesQuery.trim()}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    onPlayCustomUrl(seriesQuery.trim());
                    setSeriesQuery('');
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{lang === 'es' ? 'Reproducir serie / enlace' : 'Play series link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onOpenCloudBrowser(seriesQuery.trim());
                    setSeriesQuery('');
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Cloud Browser</span>
                </button>
              </div>
            </div>
          )}

          {!debouncedSeriesQuery && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {SERIES_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setSeriesCategory(cat.id);
                    setSeriesPage(1);
                  }}
                  className={`min-h-[38px] px-4 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
                    seriesCategory === cat.id
                      ? 'bg-white text-[#050508] shadow-[0_6px_18px_rgba(255,255,255,0.16)]'
                      : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border border-white/[0.08]'
                  }`}
                >
                  {lang === 'es' ? cat.es : cat.en}
                </button>
              ))}
            </div>
          )}

          {/* Quick-Access Favorite TV Series Rail (Edge-to-Edge) */}
          {!debouncedSeriesQuery && favoriteSeriesList.length > 0 && (
            <section className="rounded-3xl bg-white/[0.02] border border-white/[0.07] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 fill-current text-[#E11D48] shrink-0" />
                <h3 className="font-display font-bold text-xs sm:text-sm text-white">
                  {lang === 'es' ? 'Mis Series Favoritas' : 'My Favorite Series'} (
                  {favoriteSeriesList.length})
                </h3>
              </div>
              <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-0.5 min-w-0">
                {favoriteSeriesList.map((favShow) => (
                  <div
                    key={favShow.id}
                    onClick={() => {
                      if (!favShow.tmdbId) return;
                      triggerHaptic('light');
                      openSeriesDetails(favShow.tmdbId, 1);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && favShow.tmdbId) {
                        openSeriesDetails(favShow.tmdbId, 1);
                      }
                    }}
                    className="group relative w-[136px] sm:w-[152px] aspect-[2/3] shrink-0 rounded-2xl overflow-hidden bg-[#090A0F] border border-white/[0.08] hover:border-white/30 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    {favShow.poster ? (
                      <img
                        src={favShow.poster}
                        alt={favShow.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Tv className="w-6 h-6 text-zinc-500" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleToggleBookmark(favShow, e)}
                      aria-label="Quitar de series favoritas"
                      className="w-8 h-8 rounded-full bg-black/65 hover:bg-black/90 text-[#E11D48] flex items-center justify-center absolute top-2 right-2 z-10 cursor-pointer"
                    >
                      <Heart className="w-3.5 h-3.5 fill-current" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 pt-10 pb-2.5 px-2.5 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
                      <div className="font-display font-bold text-xs text-white line-clamp-2 leading-tight">
                        {favShow.title}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {loadingSeries ? (
            <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : seriesList.length === 0 ? (
            <div className="py-14 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-3">
              <Tv className="w-8 h-8 text-[#E11D48] mx-auto mb-1" />
              <p className="text-sm font-bold text-white">
                {lang === 'es'
                  ? 'No encontramos series con ese título'
                  : 'No TV series found matching your search'}
              </p>
              <p className="text-xs text-zinc-400">
                {lang === 'es'
                  ? 'Prueba con otro título o busca directamente en Películas.'
                  : 'Try another title or search in Movies.'}
              </p>
              {seriesQuery.trim().length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    setMovieQuery(seriesQuery.trim());
                    onChangeSection('movies');
                  }}
                  className="mt-2 min-h-[42px] px-5 rounded-2xl bg-white text-[#050508] hover:bg-zinc-200 text-xs font-bold inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                >
                  <Film className="w-4 h-4 text-[#E11D48]" />
                  <span>
                    {lang === 'es'
                      ? `¿Buscar «${seriesQuery.trim()}» en Películas?`
                      : `Search "${seriesQuery.trim()}" in Movies?`}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
                {seriesList.map((show) => {
                  const seriesItem: CatalogMovie = { ...show, mediaType: 'tv' };
                  const savedSeries = isBookmarked(seriesItem);
                  const imgBroken = brokenPosters[show.id];
                  const isSeriesInRoom =
                    Boolean(activeMediaTitle) &&
                    activeMediaTitle.toLowerCase().includes(show.title.trim().toLowerCase());
                  const seriesHistory = watchHistory.find(
                    (h) =>
                      h.mediaType === 'tv' &&
                      ((show.tmdbId && h.tmdbId === show.tmdbId) ||
                        h.title.trim().toLowerCase() === show.title.trim().toLowerCase())
                  );
                  const seriesPct =
                    seriesHistory?.resumeTimeSec &&
                    seriesHistory?.durationSec &&
                    seriesHistory.durationSec > 60
                      ? Math.min(
                          100,
                          Math.max(
                            8,
                            Math.round((seriesHistory.resumeTimeSec / seriesHistory.durationSec) * 100)
                          )
                        )
                      : seriesHistory
                      ? 30
                      : 0;

                  return (
                    <div
                      key={show.id}
                      onClick={() => {
                        if (!show.tmdbId) return;
                        triggerHaptic('light');
                        openSeriesDetails(show.tmdbId, 1);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && show.tmdbId) {
                          openSeriesDetails(show.tmdbId, 1);
                        }
                      }}
                      className={`group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0E0F16] border active:scale-[0.98] transition-all cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.6)] ${
                        isSeriesInRoom
                          ? 'border-[#E11D48] ring-1 ring-[#E11D48]/50'
                          : 'border-white/[0.08] hover:border-white/25'
                      }`}
                    >
                      {!imgBroken && show.poster ? (
                        <img
                          src={show.poster}
                          alt={show.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenPosters((prev) => ({ ...prev, [show.id]: true }))
                          }
                          className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-[#0E0F16]">
                          <Tv className="w-8 h-8 text-zinc-500 mb-2" />
                          <span className="font-display font-semibold text-xs text-zinc-200 line-clamp-3">
                            {show.title}
                          </span>
                        </div>
                      )}

                      {isSeriesInRoom ? (
                        <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-[#E11D48] text-white text-[10px] font-bold flex items-center gap-1 shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          <span>En sala</span>
                        </div>
                      ) : seriesHistory?.season && seriesHistory?.episode ? (
                        <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-white/15 text-zinc-200 text-[10px] font-mono font-bold">
                          {seriesHistory.season}x{String(seriesHistory.episode).padStart(2, '0')}
                        </div>
                      ) : null}

                      {/* Discreet Favorite Heart Button */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleBookmark(seriesItem, e)}
                        aria-label="Marcar serie como favorita"
                        className={`absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center active:scale-90 transition-all cursor-pointer ${
                          savedSeries
                            ? 'bg-black/75 border-[#E11D48]/50 text-[#E11D48]'
                            : 'bg-black/45 hover:bg-black/75 border-white/10 text-white/80 hover:text-white'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${savedSeries ? 'fill-current' : ''}`} />
                      </button>

                      {/* Editorial Bottom Overlay */}
                      <div className="absolute inset-x-0 bottom-0 pt-16 pb-2.5 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex items-end justify-between gap-2">
                        <div className="min-w-0 flex-1 pointer-events-none">
                          <h3 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug drop-shadow">
                            {show.title}
                          </h3>
                          <div className="text-[10px] text-zinc-300 truncate mt-1 flex items-center gap-1.5">
                            <span>{show.year || 'TV'}</span>
                            {show.rating && (
                              <>
                                <span className="text-zinc-500">·</span>
                                <span className="text-amber-400 font-mono font-bold">
                                  ★ {show.rating}
                                </span>
                              </>
                            )}
                            <span className="text-zinc-500">·</span>
                            <span className="text-zinc-200 font-semibold">
                              {seriesLangMode === 'EN' || seriesLangMode === 'VOSE'
                                ? 'VOSE · EN'
                                : 'Serie TV'}
                            </span>
                          </div>
                        </div>

                        {show.tmdbId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('light');
                              setPreviewItem(seriesItem);
                            }}
                            title={lang === 'es' ? 'Ver Ficha y Tráiler' : 'Details & Trailer'}
                            aria-label="Ver ficha de la serie"
                            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shrink-0 active:scale-90 transition-all cursor-pointer"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {seriesPct > 0 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 pointer-events-none">
                          <div
                            className="h-full bg-[#E11D48]"
                            style={{ width: `${seriesPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasMoreSeries && (
                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMoreSeries}
                    onClick={() => {
                      triggerHaptic('light');
                      setSeriesPage((p) => p + 1);
                    }}
                    className="min-h-[46px] px-6 rounded-2xl bg-[#0E0F16] hover:bg-white/[0.08] border border-white/12 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {loadingMoreSeries && (
                      <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
                    )}
                    <span>{lang === 'es' ? 'Cargar más series' : 'Load more series'}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 3.5: TV ESPAÑA · CANALES NACIONALES TDT EN DIRECTO 1080P   */}
      {/* ================================================================== */}
      {activeSection === 'tdt' && (
        <div className="space-y-5">
          {/* Search + Category Filter Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={tdtSearch}
                  onChange={(e) => setTdtSearch(e.target.value)}
                  placeholder={t.searchTdtPlaceholder}
                  className="w-full h-11 pl-10 pr-9 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-white/30 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none"
                />
                {tdtSearch && (
                  <button
                    type="button"
                    onClick={() => setTdtSearch('')}
                    aria-label="Limpiar búsqueda"
                    className="w-9 h-9 rounded-xl absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  fetchTdtCatalog();
                }}
                aria-label="Actualizar canales TDT"
                className="w-11 h-11 rounded-2xl bg-[#0D0D12] hover:bg-[#16161E] active:scale-95 border border-white/[0.08] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${loadingTdt ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {TDT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setTdtCategory(cat.id);
                  }}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
                    tdtCategory === cat.id
                      ? 'bg-white text-[#050508] shadow-sm'
                      : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border border-white/[0.08]'
                  }`}
                >
                  {lang === 'es' ? cat.es : cat.en}
                </button>
              ))}
            </div>
          </div>

          {/* Saved Favorite Channels Quick Bar */}
          {favoriteChannels.length > 0 && (
            <section className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-display font-bold text-white">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
                  <span>
                    {lang === 'es'
                      ? `Mis Canales Favoritos (${favoriteChannels.length})`
                      : `Favorite Channels (${favoriteChannels.length})`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {favoriteChannels.map((fCh) => {
                  const isPlayingFav = activeVideoRawUrl === fCh.channelUrl;
                  const isLoadingFav = loadingItemId === `favch-${fCh.favId}`;
                  return (
                    <div
                      key={fCh.favId}
                      className={`flex items-center rounded-xl border shrink-0 transition-all ${
                        isPlayingFav
                          ? 'bg-white text-[#050508] border-white'
                          : 'bg-[#0E0F16] border-white/[0.1] text-zinc-100 hover:border-white/25'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={Boolean(loadingItemId)}
                        onClick={() => {
                          triggerHaptic('medium');
                          onPlayFavoriteChannel(fCh);
                        }}
                        className="min-h-[40px] pl-3 pr-2.5 flex items-center gap-2 text-xs font-semibold whitespace-nowrap cursor-pointer"
                      >
                        {isLoadingFav ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E11D48]" />
                        ) : (
                          <Play
                            className={`w-3.5 h-3.5 fill-current ${
                              isPlayingFav ? 'text-[#050508]' : 'text-[#E11D48]'
                            }`}
                          />
                        )}
                        <span>{fCh.channelLabel}</span>
                      </button>

                      {activeVideoRawUrl &&
                        activeVideoRawUrl !== fCh.channelUrl &&
                        onPlaySecondaryChannel && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('medium');
                              onPlaySecondaryChannel({
                                sourceUrl: fCh.channelUrl,
                                title: fCh.channelLabel,
                                subtitle: fCh.competition,
                              });
                            }}
                            title="Abrir en 2ª pantalla (Multiview)"
                            aria-label="Abrir en 2ª pantalla"
                            className={`w-9 h-9 flex items-center justify-center border-l cursor-pointer ${
                              isPlayingFav
                                ? 'border-black/10 text-zinc-700 hover:text-black'
                                : 'border-white/[0.08] text-sky-400 hover:text-sky-300'
                            }`}
                          >
                            <Columns2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Spanish TDT Dial Grid */}
          {loadingTdt && tdtChannels.length === 0 ? (
            <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-3.5">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-36 rounded-2xl bg-white/[0.04] border border-white/[0.07] skeleton-shimmer"
                />
              ))}
            </div>
          ) : filteredTdtChannels.length === 0 ? (
            <div className="py-12 text-center rounded-2xl bg-white/[0.02] border border-white/[0.07] px-5 space-y-2">
              <Tv className="w-8 h-8 text-zinc-500 mx-auto" />
              <p className="text-sm font-bold text-white">
                {lang === 'es'
                  ? 'No se encontraron canales con ese filtro'
                  : 'No channels match your search'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTdtSearch('');
                  setTdtCategory('all');
                }}
                className="min-h-[40px] px-4 rounded-xl bg-white text-[#050508] text-xs font-bold cursor-pointer"
              >
                {lang === 'es' ? 'Mostrar todos los canales TDT' : 'Show all channels'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-3.5">
              {filteredTdtChannels.map((ch) => {
                const primarySignal = ch.channels[0];
                const isPlayingThis = ch.channels.some(
                  (sig) => activeVideoRawUrl && activeVideoRawUrl === sig.sourceUrl
                );
                const favId = buildChannelFavId(ch.name, primarySignal?.sourceUrl || ch.id);
                const isFav = isChannelFavorited(favId);

                return (
                  <div
                    key={ch.id}
                    className={`group relative rounded-2xl p-4 bg-[#0D0E15] border transition-all flex flex-col justify-between gap-3.5 ${
                      isPlayingThis
                        ? 'border-white/60 ring-1 ring-white/25 shadow-[0_14px_34px_rgba(0,0,0,0.65)]'
                        : 'border-white/[0.08] hover:border-white/20 shadow-[0_10px_28px_rgba(0,0,0,0.5)]'
                    }`}
                  >
                    {/* Top Row: Dial Monogram + Channel Identity + Quick Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        disabled={Boolean(loadingItemId)}
                        onClick={() => {
                          triggerHaptic('medium');
                          onPlayTdtChannel(ch, 0);
                        }}
                        className="flex items-center gap-3.5 min-w-0 text-left flex-1 cursor-pointer"
                      >
                        {/* Broadcaster Dial Tile */}
                        <div
                          className="w-13 h-13 rounded-2xl shrink-0 flex flex-col items-center justify-center border border-white/15 shadow-inner relative overflow-hidden"
                          style={{
                            background: `linear-gradient(145deg, ${ch.brandTone}2E 0%, #090A10 100%)`,
                          }}
                        >
                          <span
                            className={`font-display font-extrabold tracking-tight text-white leading-none px-0.5 text-center ${
                              ch.shortMark.length > 4 ? 'text-[10.5px]' : 'text-sm'
                            }`}
                          >
                            {ch.shortMark}
                          </span>
                          <span className="mt-1 text-[10px] font-mono tabular-nums text-zinc-400 leading-none">
                            DIAL {ch.dial}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-display font-bold text-sm sm:text-base text-white truncate">
                              {ch.name}
                            </h3>
                            {isPlayingThis && (
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-400 truncate">
                            <span className="text-emerald-400 font-semibold">EN DIRECTO</span>
                            <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span>{ch.network}</span>
                            <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-zinc-300">
                              {ch.quality || '1080p'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-400 line-clamp-1">
                            {ch.description}
                          </p>
                        </div>
                      </button>

                      {/* Favorite Star + Optional Multi-View Split Button */}
                      <div className="flex items-center gap-1 shrink-0">
                        {activeVideoRawUrl &&
                          !isPlayingThis &&
                          primarySignal &&
                          onPlaySecondaryChannel && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('medium');
                                onPlaySecondaryChannel({
                                  sourceUrl: primarySignal.sourceUrl,
                                  title: ch.name,
                                  subtitle: `TV en Directo · ${ch.network}`,
                                });
                              }}
                              title="Ver en 2ª pantalla simultánea (Multiview)"
                              aria-label={`Ver ${ch.name} en 2ª pantalla`}
                              className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-sky-400 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                            >
                              <Columns2 className="w-4 h-4" />
                            </button>
                          )}

                        {primarySignal && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onToggleChannelFavorite({
                                favId,
                                channelLabel: ch.name,
                                channelUrl: primarySignal.sourceUrl,
                                sport: 'tdt',
                                competition: `TV en Directo · ${ch.network}`,
                                title: `${ch.name} en Directo`,
                              });
                            }}
                            title={
                              isFav
                                ? 'Quitar de mis canales favoritos'
                                : 'Guardar en mis canales favoritos'
                            }
                            aria-label={`Favorito ${ch.name}`}
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                              isFav
                                ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                                : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.08] text-zinc-400 hover:text-white'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Row: Primary Play + Backup Signal Selector */}
                    <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                      {ch.channels.map((sig, sIdx) => {
                        const sigActive = activeVideoRawUrl === sig.sourceUrl;
                        const sigLoading = loadingItemId === `tdt-${ch.id}-${sIdx}`;
                        const isPrimary = sIdx === 0;

                        return (
                          <button
                            key={sig.id}
                            type="button"
                            disabled={Boolean(loadingItemId)}
                            onClick={() => {
                              triggerHaptic('success');
                              onPlayTdtChannel(ch, sIdx);
                            }}
                            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                              sigActive
                                ? 'flex-1 bg-white text-[#050508] shadow-sm'
                                : isPrimary
                                ? 'flex-1 bg-[#E11D48] hover:bg-[#BE123C] text-white'
                                : 'bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.09] text-zinc-200'
                            }`}
                          >
                            {sigLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            <span>
                              {sigActive
                                ? lang === 'es'
                                  ? 'Viendo en sala'
                                  : 'Live in room'
                                : isPrimary
                                ? lang === 'es'
                                  ? 'Ver en directo'
                                  : 'Watch Live'
                                : sig.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 4: LIVE SPORTS & 24/7 MULTIPLEX CHANNELS                   */}
      {/* ================================================================== */}
      {activeSection === 'sports' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={sportsSearch}
                    onChange={(e) => setSportsSearch(e.target.value)}
                    placeholder={t.searchSportsPlaceholder}
                    className="w-full h-11 pl-10 pr-9 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-white/30 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none"
                  />
                  {sportsSearch && (
                    <button
                      type="button"
                      onClick={() => setSportsSearch('')}
                      aria-label="Limpiar búsqueda"
                      className="w-9 h-9 rounded-xl absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    fetchSportsAgenda();
                  }}
                  aria-label="Actualizar agenda deportiva"
                  className="w-11 h-11 rounded-2xl bg-[#0D0D12] hover:bg-[#16161E] active:scale-95 border border-white/[0.08] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer transition-all"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingSports ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                {(
                  [
                    { id: 'all', label: t.allSports },
                    { id: 'soccer', label: t.soccer },
                    { id: 'motor', label: t.motor },
                    { id: 'basketball', label: t.basketball },
                    { id: 'tennis', label: t.tennis },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSportFilter(cat.id);
                    }}
                    className={`min-h-[42px] px-4 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
                      sportFilter === cat.id
                        ? 'bg-white text-[#050508] shadow-sm'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Real-Time Match Scoreboards Ticker (LaLiga, Champions, Premier, NBA) */}
            {liveScores.length > 0 && (
              <section className="rounded-3xl bg-white/[0.02] border border-white/[0.07] p-3.5 sm:p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-display font-bold text-white">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {lang === 'es'
                      ? 'Marcadores en Directo · Jornada'
                      : 'Live Match Scoreboard'}
                  </span>
                </div>
                {activeVideoRawUrl && onPlaySecondaryChannel && (
                  <span className="text-[11px] text-sky-300 flex items-center gap-1">
                    <Columns2 className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'es'
                        ? 'Icono doble = Multiview'
                        : 'Split icon = Multi-View'}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
                {liveScores
                  .filter(
                    (sc) =>
                      sportFilter === 'all' ||
                      (sportFilter === 'soccer' && sc.sport === 'soccer') ||
                      (sportFilter === 'basketball' && sc.sport === 'basketball')
                  )
                  .map((sc) => (
                    <div
                      key={sc.id}
                      onClick={() => {
                        triggerHaptic('light');
                        setSportsSearch(sc.homeTeam);
                      }}
                      title={`Buscar retransmisión de ${sc.homeTeam}`}
                      className={`min-w-[178px] sm:min-w-[196px] shrink-0 rounded-2xl p-3 border flex flex-col justify-between gap-1.5 cursor-pointer active:scale-95 transition-all ${
                        sc.isLive
                          ? 'bg-[#0E0F16] border-emerald-400/40 hover:border-emerald-400'
                          : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[10px]">
                        <span className="font-semibold text-zinc-400">{sc.league}</span>
                        <span
                          className={`font-mono font-bold ${
                            sc.isLive ? 'text-emerald-400' : 'text-zinc-400'
                          }`}
                        >
                          {sc.statusText}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {sc.homeLogo && (
                              <img
                                src={sc.homeLogo}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-4 h-4 object-contain shrink-0"
                              />
                            )}
                            <span className="font-semibold text-white truncate">
                              {sc.homeTeam}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-white shrink-0">
                            {sc.homeScore}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {sc.awayLogo && (
                              <img
                                src={sc.awayLogo}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-4 h-4 object-contain shrink-0"
                              />
                            )}
                            <span className="font-semibold text-zinc-200 truncate">
                              {sc.awayTeam}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-zinc-200 shrink-0">
                            {sc.awayScore}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Quick-Launch Favorite Sports Channels Rail */}
          {favoriteChannels.length > 0 && (
            <section className="rounded-3xl bg-white/[0.02] border border-amber-400/25 p-3.5 sm:p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Star className="w-4 h-4 fill-current text-amber-400 shrink-0" />
                  <h3 className="font-display font-bold text-xs sm:text-sm text-white truncate">
                    {lang === 'es'
                      ? 'Mis Canales Favoritos · Acceso Rápido'
                      : 'My Favorite Channels · Quick Launch'}{' '}
                    ({favoriteChannels.length})
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 min-w-0">
                {favoriteChannels.map((favCh) => {
                  const isActiveFav = activeVideoRawUrl === favCh.channelUrl;
                  const isLoadingFav = loadingItemId === `favch-${favCh.favId}`;
                  return (
                    <div
                      key={favCh.favId}
                      className={`inline-flex items-center rounded-2xl border shrink-0 overflow-hidden transition-colors ${
                        isActiveFav
                          ? 'bg-[#E11D48] border-[#E11D48] text-white'
                          : 'bg-[#090A0F] border-white/12 text-zinc-100'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={Boolean(loadingItemId)}
                        onClick={() => {
                          triggerHaptic('medium');
                          onPlayFavoriteChannel(favCh);
                        }}
                        className="min-h-[44px] pl-3.5 pr-2.5 text-xs font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer"
                      >
                        {isLoadingFav ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <div className="text-left">
                          <div className="leading-tight">{favCh.channelLabel}</div>
                          <div className="text-[10px] opacity-75 font-normal">
                            {favCh.title}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onToggleChannelFavorite(favCh);
                        }}
                        aria-label="Quitar canal de favoritos"
                        title="Quitar canal de favoritos"
                        className="min-h-[44px] px-3 border-l border-white/10 text-amber-400 hover:text-rose-300 flex items-center justify-center cursor-pointer"
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {loadingSports && sportsEvents.length === 0 ? (
            <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 rounded-3xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : (
            <>
              {multiplexChannels.length > 0 && (
                <div className="grid grid-cols-1 @md:grid-cols-2 gap-3.5">
                  {multiplexChannels.map((mux) => {
                    const bgAsset = mux.sport === 'motor' ? f1Backdrop : stadiumBackdrop;
                    const imgFailed = brokenHeroImgs[mux.id];
                    const isExtractingMux = loadingItemId?.startsWith(mux.id);

                    return (
                      <div
                        key={mux.id}
                        className="relative rounded-3xl overflow-hidden border border-white/[0.09] bg-[#0E0F16] min-h-[205px] sm:min-h-[220px] p-5 flex flex-col justify-end gap-4 min-w-0 shadow-[0_14px_40px_rgba(0,0,0,0.65)]"
                      >
                        {!imgFailed ? (
                          <img
                            src={bgAsset}
                            alt={mux.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenHeroImgs((prev) => ({ ...prev, [mux.id]: true }))
                            }
                            className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-[#192236] to-[#090A0F]" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-black/25" />

                        <div className="relative z-10 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-[#FB7185] font-bold uppercase tracking-wider">
                              {mux.competition} · {mux.time}
                            </div>
                            <h3 className="font-display font-bold text-base sm:text-xl text-white mt-0.5 text-balance drop-shadow">
                              {mux.title}
                            </h3>
                          </div>
                          {isExtractingMux && (
                            <Loader2 className="w-5 h-5 animate-spin text-[#E11D48] shrink-0" />
                          )}
                        </div>

                        <div className="relative z-10 flex items-center sm:flex-wrap gap-2 overflow-x-auto no-scrollbar pt-1 min-w-0">
                          {mux.channels.map((ch, idx) => {
                            const activeCh = activeVideoRawUrl === ch.sourceUrl;
                            const chFavId = buildChannelFavId(ch.sourceUrl, ch.label);
                            const chSaved = isChannelFavorited(chFavId);

                            return (
                              <div
                                key={ch.id}
                                className={`inline-flex items-center rounded-full shrink-0 overflow-hidden transition-all ${
                                  activeCh
                                    ? 'bg-white text-[#050508] shadow-md'
                                    : 'bg-black/65 hover:bg-black/85 text-white backdrop-blur-xl border border-white/15'
                                }`}
                              >
                                <button
                                  type="button"
                                  disabled={Boolean(loadingItemId)}
                                  onClick={() => {
                                    triggerHaptic('medium');
                                    onPlaySportsMatch(mux, idx);
                                  }}
                                  className="min-h-9 pl-3.5 pr-2.5 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>{ch.label}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerHaptic('light');
                                    onToggleChannelFavorite({
                                      favId: chFavId,
                                      title: mux.title,
                                      channelLabel: ch.label,
                                      channelUrl: ch.sourceUrl,
                                      competition: mux.competition,
                                      sport: mux.sport,
                                    });
                                  }}
                                  title="Guardar canal favorito"
                                  aria-label="Marcar como canal favorito"
                                  className={`min-h-9 px-2.5 border-l flex items-center justify-center cursor-pointer ${
                                    activeCh ? 'border-black/10' : 'border-white/10'
                                  }`}
                                >
                                  <Star
                                    className={`w-3 h-3 ${
                                      chSaved
                                        ? 'fill-current text-amber-400'
                                        : activeCh
                                        ? 'text-zinc-700'
                                        : 'text-zinc-400 hover:text-amber-300'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Edge-to-Edge Live Match Cards */}
              {scheduledMatches.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-display font-bold text-sm sm:text-base text-white px-0.5">
                    {lang === 'es'
                      ? 'Agenda de Partidos en Directo Hoy'
                      : "Today's Live Match Schedule"}
                  </h3>
                  <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3.5">
                    {scheduledMatches.map((match) => {
                      const isExtractingMatch = loadingItemId?.startsWith(match.id);
                      const matchBackdrop =
                        match.sport === 'motor' ? f1Backdrop : stadiumBackdrop;
                      const primaryCh = match.channels[0];
                      const primaryFavId = primaryCh
                        ? buildChannelFavId(primaryCh.sourceUrl, primaryCh.label || 'Señal 1')
                        : '';
                      const isPrimarySaved = primaryFavId ? isChannelFavorited(primaryFavId) : false;

                      return (
                        <div
                          key={match.id}
                          className="relative rounded-3xl overflow-hidden border border-white/[0.09] hover:border-white/25 bg-[#0D0F18] min-h-[164px] p-4 sm:p-5 flex flex-col justify-end gap-3 transition-all min-w-0 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
                        >
                          <img
                            src={matchBackdrop}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover object-center opacity-35"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/80 to-black/35" />

                          <div className="relative z-10 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-zinc-300 truncate flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-full bg-[#E11D48]/20 border border-[#E11D48]/40 font-mono tabular-nums text-[#FB7185] font-bold">
                                  {match.time}
                                </span>
                                <span className="font-semibold text-zinc-300 truncate">
                                  {match.competition}
                                </span>
                              </div>
                              <h4 className="font-display font-bold text-base sm:text-lg text-white mt-1.5 line-clamp-2 drop-shadow">
                                {match.title}
                              </h4>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isExtractingMatch && (
                                <Loader2 className="w-5 h-5 animate-spin text-[#E11D48]" />
                              )}
                              {primaryCh && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerHaptic('light');
                                    onToggleChannelFavorite({
                                      favId: primaryFavId,
                                      title: match.title,
                                      channelLabel: primaryCh.label || 'Señal 1',
                                      channelUrl: primaryCh.sourceUrl,
                                      competition: match.competition,
                                      sport: match.sport,
                                    });
                                  }}
                                  title="Guardar partido / canal en Favoritos"
                                  aria-label="Guardar canal favorito"
                                  className="w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 flex items-center justify-center cursor-pointer transition-colors"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      isPrimarySaved
                                        ? 'fill-current text-amber-400'
                                        : 'text-zinc-300 hover:text-amber-300'
                                    }`}
                                  />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Clean 1-Tap Signal Pills */}
                          <div className="relative z-10 flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 min-w-0">
                            {match.channels.slice(0, 6).map((ch, idx) => {
                              const activeCh = activeVideoRawUrl === ch.sourceUrl;
                              const label = ch.label || `Señal ${idx + 1}`;

                              return (
                                <button
                                  key={ch.id}
                                  type="button"
                                  disabled={Boolean(loadingItemId)}
                                  onClick={() => {
                                    triggerHaptic('light');
                                    onPlaySportsMatch(match, idx);
                                  }}
                                  className={`min-h-9 px-3.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all active:scale-95 ${
                                    activeCh
                                      ? 'bg-white text-[#050508] shadow-md'
                                      : idx === 0
                                      ? 'bg-[#E11D48] hover:bg-[#F43F5E] text-white shadow-[0_4px_14px_rgba(225,29,72,0.35)]'
                                      : 'bg-black/65 hover:bg-black/85 text-zinc-100 backdrop-blur-xl border border-white/15'
                                  }`}
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 5: DEDICATED SYNCHRONIZED YOUTUBE PARTY HUB                */}
      {/* ================================================================== */}
      {activeSection === 'youtube' && (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={ytQuery}
                  onChange={(e) => setYtQuery(e.target.value)}
                  placeholder={
                    lang === 'es'
                      ? 'Buscar en YouTube o pegar enlace directo...'
                      : 'Search YouTube or paste direct link...'
                  }
                  className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#0D0D12] border border-white/[0.08] focus:border-[#E11D48] text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none"
                />
                {ytQuery && (
                  <button
                    type="button"
                    onClick={() => setYtQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="w-9 h-9 rounded-xl absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => onChangeSection('direct')}
                className="min-h-[44px] px-4 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-bold text-zinc-100 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Link2 className="w-4 h-4 text-[#E11D48]" />
                <span>
                  {lang === 'es' ? 'Cola y Cloud Browser' : 'Queue & Cloud'} ({roomQueue.length})
                </span>
              </button>
            </div>

            {/^https?:\/\//i.test(ytQuery.trim()) && (
              <div className="p-3 rounded-2xl bg-[#101016] border border-[#E11D48]/35 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-xs font-mono text-zinc-200 truncate max-w-[260px] sm:max-w-[420px]">
                  {ytQuery.trim()}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayCustomUrl(ytQuery.trim());
                      setYtQuery('');
                    }}
                    className="min-h-[38px] px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{lang === 'es' ? 'Reproducir enlace' : 'Play link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onOpenCloudBrowser(ytQuery.trim());
                      setYtQuery('');
                    }}
                    className="min-h-[38px] px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>Cloud Browser</span>
                  </button>
                </div>
              </div>
            )}

            {/* Fluid Quick Party Mood Topics */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {YOUTUBE_QUICK_TOPICS.map((topic) => (
                <button
                  key={topic.q}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setYtQuery(lang === 'es' ? topic.labelEs : topic.labelEn);
                    setDebouncedYtQuery(topic.q);
                  }}
                  className={`min-h-[42px] px-4 rounded-full text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                    debouncedYtQuery === topic.q
                      ? 'bg-white text-[#050508] shadow-sm'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
                  }`}
                >
                  {lang === 'es' ? topic.labelEs : topic.labelEn}
                </button>
              ))}
            </div>
          </div>

          {loadingYt ? (
            <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-video rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                />
              ))}
            </div>
          ) : ytResults.length === 0 ? (
            <div className="py-12 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5">
              <Youtube className="w-8 h-8 text-[#E11D48] mx-auto mb-2" />
              <p className="text-sm font-bold text-white">
                {lang === 'es'
                  ? 'Busca cualquier vídeo o canal de YouTube'
                  : 'Search any YouTube video or channel'}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {lang === 'es'
                  ? 'Reproduce al instante en sincronía o añádelo a la cola compartida.'
                  : 'Play in instant sync or add it to the shared room queue.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-4">
              {ytResults.map((vid) => (
                <div
                  key={vid.id}
                  className="group relative w-full rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.08] hover:border-white/25 transition-all flex flex-col shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
                >
                  <div
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayYouTubeVideo(vid);
                    }}
                    className="relative aspect-video w-full bg-black overflow-hidden cursor-pointer"
                  >
                    <img
                      src={vid.thumbnail}
                      alt={vid.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-mono font-bold text-white">
                      {vid.duration}
                    </div>
                  </div>

                  <div className="p-3 flex flex-col justify-between gap-2.5 flex-1">
                    <div>
                      <h4
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayYouTubeVideo(vid);
                        }}
                        className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug cursor-pointer hover:text-rose-300 transition-colors"
                      >
                        {vid.title}
                      </h4>
                      <div className="text-[11px] text-zinc-400 truncate mt-1">
                        <span>{vid.channel}</span>
                        {vid.views && (
                          <>
                            <span className="mx-1 text-zinc-600">·</span>
                            <span>{vid.views}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayYouTubeVideo(vid);
                        }}
                        className="flex-1 min-h-[34px] px-3 rounded-xl bg-white text-[#050508] hover:bg-zinc-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Poner</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onAddToQueue({
                            kind: 'youtube',
                            title: vid.title,
                            subtitle: `YouTube · ${vid.channel}`,
                            poster: vid.thumbnail,
                            youtubeId: vid.videoId,
                            url: vid.url,
                          });
                        }}
                        className="min-h-[34px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cola</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 6: SHARED ROOM QUEUE + UNIVERSAL LINK & CLOUD BROWSER      */}
      {/* ================================================================== */}
      {activeSection === 'direct' && (
        <div className="space-y-5">
          {/* Shared Room Queue ("Cola de la Sala") */}
          <div className="rounded-3xl bg-[#0D0D12] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListVideo className="w-5 h-5 text-[#E11D48]" />
                <h3 className="font-display font-semibold text-base sm:text-lg text-white">
                  {lang === 'es' ? 'Cola Compartida de la Sala' : 'Shared Room Queue'} (
                  {roomQueue.length})
                </h3>
              </div>

              {roomQueue.length >= 2 && onStartPollFromQueue && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onStartPollFromQueue();
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Vote className="w-4 h-4" />
                  <span>
                    {lang === 'es'
                      ? 'Lanzar Votación en Vivo (25s)'
                      : 'Start Live Room Poll (25s)'}
                  </span>
                </button>
              )}
            </div>

            {roomQueue.length === 0 ? (
              <p className="text-xs sm:text-sm text-zinc-400">
                {lang === 'es'
                  ? 'Pulsa el botón "+" en cualquier película o vídeo de YouTube para preparar la sesión con tus amigos.'
                  : 'Tap "+" on any movie or YouTube video to queue up what your room watches next.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 @md:grid-cols-2 gap-2.5">
                {roomQueue.map((qItem) => (
                  <div
                    key={qItem.id}
                    className="rounded-2xl bg-[#07070A] border border-white/[0.07] p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-semibold text-white truncate">
                        {qItem.title}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {qItem.subtitle} · por {qItem.addedBy}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('success');
                          onPlayQueueItem(qItem);
                        }}
                        className="min-h-10 px-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Ver</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFromQueue(qItem.id)}
                        aria-label="Eliminar de la cola"
                        className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Universal Link Decompiler & Cloud Browser */}
          <div className="rounded-3xl bg-[#0D0D12] border border-white/[0.08] p-5 sm:p-8 space-y-6">
            <div className="max-w-2xl space-y-1.5">
              <h3 className="font-display font-semibold text-lg sm:text-xl text-white">
                {t.directTitle}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {t.directSub}
              </p>
            </div>

            <form onSubmit={handleDirectSubmit} className="space-y-3">
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=... | https://bingetrix.sc/watch/... | .m3u8"
                className="w-full h-12 px-4 rounded-2xl bg-[#07070A] border border-white/12 focus:border-white/35 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none font-mono"
              />
              <div className="grid grid-cols-1 @sm:grid-cols-2 gap-2.5">
                <button
                  type="submit"
                  disabled={!customUrl.trim() || Boolean(loadingItemId)}
                  className="min-h-12 px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] disabled:opacity-40 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{t.playNativeBtn}</span>
                </button>
                <button
                  type="button"
                  disabled={!customUrl.trim()}
                  onClick={() => {
                    if (!customUrl.trim()) return;
                    triggerHaptic('medium');
                    onOpenCloudBrowser(customUrl.trim());
                  }}
                  className="min-h-12 px-5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.98] disabled:opacity-40 border border-white/10 text-sm font-semibold text-zinc-100 flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Tv className="w-4 h-4 text-zinc-300" />
                  <span>{t.openCloudBtn}</span>
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <span className="block text-xs font-medium text-zinc-400">
                {lang === 'es'
                  ? 'Portales rápidos en Cloud Browser Aislado (cero redirecciones ni popups):'
                  : 'Quick portals in Isolated Cloud Browser (zero redirects or popups):'}
              </span>
              <div className="grid grid-cols-2 @sm:grid-cols-4 gap-2.5">
                {[
                  { label: 'Bingetrix Explore', url: 'https://bingetrix.sc/explore-movies' },
                  { label: 'Movidy.pw', url: 'https://movidy.pw/pelis/' },
                  { label: 'Rojadirecta TV', url: 'https://www.rojadirectv.live/' },
                  { label: 'YouTube', url: 'https://www.youtube.com/' },
                ].map((portal) => (
                  <button
                    key={portal.label}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenCloudBrowser(portal.url);
                    }}
                    className="min-h-[48px] px-4 rounded-2xl bg-[#07070A] hover:bg-white/[0.07] active:scale-[0.98] border border-white/[0.08] text-xs sm:text-sm font-semibold text-zinc-200 transition-all whitespace-nowrap cursor-pointer"
                  >
                    {portal.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
