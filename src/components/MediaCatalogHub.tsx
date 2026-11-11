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
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  FavoriteChannelItem,
  LiveScoreMatch,
  RoomQueueItem,
  SportsMatch,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
  YouTubeSearchItem,
} from '../types';
import { UI_COPY } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { buildChannelFavId, getCatalogFavoriteKey, sanitizeItemKey } from '../utils/storage';
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
  | 'sports'
  | 'youtube'
  | 'direct';

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
  onPlayMovie: (movie: CatalogMovie, preferLang: 'ES' | 'EN') => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: 'ES' | 'EN'
  ) => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onRemoveHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
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
}

export const MediaCatalogHub: React.FC<MediaCatalogHubProps> = ({
  activeSection,
  onChangeSection,
  lang,
  activeVideoRawUrl,
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
  const [seriesLangMode, setSeriesLangMode] = useState<'ES' | 'EN'>('ES');
  const [seriesPage, setSeriesPage] = useState<number>(1);
  const [hasMoreSeries, setHasMoreSeries] = useState<boolean>(false);
  const [seriesList, setSeriesList] = useState<CatalogMovie[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingMoreSeries, setLoadingMoreSeries] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<TvSeriesDetails | null>(null);
  const [loadingSeriesDetails, setLoadingSeriesDetails] = useState(false);
  const [brokenEpisodeImgs, setBrokenEpisodeImgs] = useState<Record<string, boolean>>({});

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

  // Fetch Series Seasons & Episodes
  const openSeriesDetails = (tmdbId: number, seasonNum = 1) => {
    setLoadingSeriesDetails(true);
    const apiLang = seriesLangMode === 'EN' ? 'en' : 'es';
    fetch(`/api/catalog/tv/${tmdbId}?season=${seasonNum}&lang=${apiLang}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.details) {
          setSelectedSeries(data.details);
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

  const handleToggleBookmark = (item: CatalogMovie, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    onToggleCatalogFavorite(item);
  };

  const isBookmarked = (item: CatalogMovie) => {
    const key = getCatalogFavoriteKey(item);
    return watchlist.some((x) => getCatalogFavoriteKey(x) === key);
  };

  const isChannelFavorited = (favId: string) => {
    const clean = sanitizeItemKey(favId);
    return favoriteChannels.some((c) => sanitizeItemKey(c.favId) === clean);
  };

  const favoriteSeriesList = watchlist.filter((w) => w.mediaType === 'tv');

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

  const displayedMovies = showWatchlistOnly ? watchlist : movies;

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
      {/* Netflix-Style Rich Details & 4K Official Trailer Modal */}
      <MediaDetailsModal
        item={previewItem}
        lang={lang}
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
      {/* CINEMA UNIVERSE SWITCHER (PELÍCULAS · SERIES TV + MI LISTA)        */}
      {/* ================================================================== */}
      {isCinemaFamily && (
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center p-1 rounded-2xl bg-[#0D0D12] border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowWatchlistOnly(false);
                setMoviePage(1);
                if (activeSection === 'series') onChangeSection('movies');
              }}
              className={`min-h-[36px] px-4 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                (activeSection === 'movies' || activeSection === 'vose') && !showWatchlistOnly
                  ? 'bg-[#E11D48] text-white'
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
              className={`min-h-[36px] px-4 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeSection === 'series'
                  ? 'bg-[#E11D48] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {lang === 'es' ? 'Series TV' : 'TV Series'}
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
              {lang === 'es' ? 'Mi Lista' : 'My List'} ({watchlist.length})
            </span>
          </button>
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
                triggerHaptic('light');
                onClearHistory();
              }}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-200 flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>{lang === 'es' ? 'Limpiar' : 'Clear'}</span>
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

              return (
                <div
                  key={hItem.id}
                  onClick={() => {
                    if (loadingItemId) return;
                    triggerHaptic('light');
                    onReplayHistoryItem(hItem, false);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loadingItemId) {
                      onReplayHistoryItem(hItem, false);
                    }
                  }}
                  className="group relative w-[200px] sm:w-[224px] shrink-0 rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.07] hover:border-white/25 transition-all flex flex-col cursor-pointer"
                >
                  <div className="relative aspect-[16/9] w-full bg-[#14141B] overflow-hidden">
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
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#23142B] to-[#12141D]">
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
                        {hasResume
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
                  {MOVIE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setMovieCategory(cat.id);
                        setMoviePage(1);
                      }}
                      className={`min-h-[42px] px-4 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
                        movieCategory === cat.id
                          ? 'bg-[#E11D48] text-white shadow-[0_6px_20px_rgba(225,29,72,0.35)]'
                          : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
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
                    disabled={Boolean(loadingItemId)}
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayMovie(
                        spotlightMovie,
                        activeSection === 'vose' ? 'EN' : 'ES'
                      );
                    }}
                    className="min-h-[44px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-xs sm:text-sm font-bold text-white flex items-center gap-2 shadow-lg shadow-[#E11D48]/30 transition-all whitespace-nowrap cursor-pointer"
                  >
                    {loadingItemId === spotlightMovie.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                    <span>
                      {lang === 'es' ? 'Proyectar en la Sala' : 'Screen in Room'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPreviewItem(spotlightMovie);
                    }}
                    className="min-h-[44px] px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.12] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Info className="w-4 h-4 text-zinc-200" />
                    <span>{lang === 'es' ? 'Tráiler y Ficha' : 'Trailer & Info'}</span>
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
            <div className="py-14 text-center rounded-3xl bg-white/[0.02] border border-white/[0.07] px-5">
              <Film className="w-8 h-8 text-[#E11D48] mx-auto mb-2.5" />
              <p className="text-sm font-bold text-white">
                {showWatchlistOnly
                  ? lang === 'es'
                    ? 'Tu lista está vacía'
                    : 'Your Watchlist is empty'
                  : lang === 'es'
                  ? 'No encontramos películas con ese título'
                  : 'No movies found matching your search'}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {lang === 'es'
                  ? 'Prueba con otro título o explora las categorías superiores.'
                  : 'Try another title or browse the categories above.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
                {gridMovies.map((movie) => {
                  const isExtractingThis = loadingItemId === movie.id;
                  const saved = isBookmarked(movie);
                  const imgBroken = brokenPosters[movie.id];

                  return (
                    <div
                      key={movie.id}
                      onClick={() => {
                        if (loadingItemId) return;
                        triggerHaptic('light');
                        if (movie.mediaType === 'tv' && movie.tmdbId) {
                          setShowWatchlistOnly(false);
                          onChangeSection('series');
                          openSeriesDetails(movie.tmdbId, 1);
                          return;
                        }
                        if (activeVideoRawUrl && movie.tmdbId) {
                          setPreviewItem(movie);
                          return;
                        }
                        onPlayMovie(movie, activeSection === 'vose' ? 'EN' : 'ES');
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
                          if (activeVideoRawUrl && movie.tmdbId) {
                            setPreviewItem(movie);
                            return;
                          }
                          onPlayMovie(movie, activeSection === 'vose' ? 'EN' : 'ES');
                        }
                      }}
                      className="group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.08] hover:border-white/25 active:scale-[0.98] transition-all cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
                    >
                      {!imgBroken && movie.poster ? (
                        <img
                          src={movie.poster}
                          alt={movie.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenPosters((prev) => ({ ...prev, [movie.id]: true }))
                          }
                          className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#1A1A24] to-[#0D0D12]">
                          <Film className="w-8 h-8 text-zinc-500 mb-2" />
                          <span className="font-display font-semibold text-xs text-zinc-200 line-clamp-3">
                            {movie.title}
                          </span>
                        </div>
                      )}

                      {/* Top Action Targets (44x44px Hitboxes) */}
                      {movie.tmdbId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic('light');
                            setPreviewItem(movie);
                          }}
                          title={lang === 'es' ? 'Ver Tráiler y Ficha' : 'Watch Trailer & Info'}
                          aria-label="Ver ficha y tráiler"
                          className="absolute top-2 left-2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/15 flex items-center justify-center text-zinc-100 hover:text-white active:scale-90 transition-all cursor-pointer"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      )}

                      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleToggleBookmark(movie, e)}
                          aria-label="Guardar en Mi Lista"
                          className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              saved ? 'fill-current text-[#E11D48]' : 'text-zinc-200'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic('success');
                            onAddToQueue({
                              kind: 'movie',
                              title: movie.title,
                              subtitle: `${movie.year} · ${activeSection === 'vose' ? 'VOSE 1080p' : 'Español'}`,
                              poster: movie.poster,
                              tmdbId: movie.tmdbId,
                              url: movie.bingetrixUrl || movie.movidyUrl,
                              preferLang: activeSection === 'vose' ? 'EN' : 'ES',
                            });
                          }}
                          aria-label="Añadir a la cola"
                          title="Añadir a la cola"
                          className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Center Play Indicator */}
                      <div
                        className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity pointer-events-none ${
                          isExtractingThis
                            ? 'opacity-100'
                            : 'opacity-0 sm:group-hover:opacity-100'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-2xl">
                          {isExtractingThis ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          )}
                        </div>
                      </div>

                      {/* Edge-to-Edge Bottom Dark Gradient Overlay */}
                      <div className="absolute inset-x-0 bottom-0 pt-16 pb-3 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col justify-end pointer-events-none">
                        <h3 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug drop-shadow">
                          {movie.title}
                        </h3>
                        <div className="text-[11px] text-zinc-300 truncate mt-1 flex items-center gap-1.5">
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
                          <span className="text-[#FB7185] font-semibold">
                            {activeSection === 'vose' ? 'VOSE' : 'ES'}
                          </span>
                        </div>
                      </div>
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
                    className="min-h-[46px] px-6 rounded-2xl bg-[#12141D] hover:bg-[#191C28] border border-white/12 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
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
      {/* SECTION 3: TV SERIES CATALOG + INTERACTIVE SEASON/EPISODE DRAWER   */}
      {/* ================================================================== */}
      {activeSection === 'series' && (
        <div className="space-y-4">
          {selectedSeries ? (
            /* Series Episode Browser View */
            <div className="rounded-3xl bg-[#12141D] border border-white/[0.09] overflow-hidden">
              <div className="relative p-5 sm:p-7 bg-gradient-to-b from-[#1C1F2E] to-[#12141D] border-b border-white/[0.08] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSeries(null)}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#090A0F] hover:bg-white/10 border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{lang === 'es' ? 'Volver a Series' : 'Back to Series'}</span>
                  </button>

                  {/* Favorite Series + Audio Language Preference Toggle */}
                  <div className="flex flex-wrap items-center gap-2">
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
                      className="min-h-[40px] px-3.5 rounded-xl bg-[#090A0F] hover:bg-white/10 border border-white/12 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Heart
                        className={`w-4 h-4 ${
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
                            ? 'fill-current text-[#FB7185]'
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
                            ? 'Serie Favorita'
                            : 'Favorited'
                          : lang === 'es'
                          ? 'Guardar Serie'
                          : 'Favorite Series'}
                      </span>
                    </button>

                    <div className="flex items-center p-1 rounded-xl bg-[#090A0F] border border-white/10">
                      <button
                        type="button"
                        onClick={() => setSeriesLangMode('ES')}
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                          seriesLangMode === 'ES'
                            ? 'bg-[#E11D48] text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Español · LAT
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeriesLangMode('EN')}
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                          seriesLangMode === 'EN'
                            ? 'bg-[#E11D48] text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Bingetrix · EN
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 max-w-2xl">
                  <div className="text-xs text-[#FB7185] font-medium">
                    <span>{selectedSeries.year}</span>
                    {selectedSeries.rating && (
                      <>
                        <span className="mx-1.5 text-zinc-600">·</span>
                        <span className="text-amber-400 font-mono">★ {selectedSeries.rating}</span>
                      </>
                    )}
                    <span className="mx-1.5 text-zinc-600">·</span>
                    <span>
                      {selectedSeries.seasons.length}{' '}
                      {lang === 'es' ? 'Temporadas' : 'Seasons'}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-xl sm:text-2xl text-white">
                    {selectedSeries.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2">
                    {selectedSeries.overview}
                  </p>
                </div>

                {/* Season Selector Strip */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                  {selectedSeries.seasons.map((s) => (
                    <button
                      key={s.seasonNumber}
                      type="button"
                      disabled={loadingSeriesDetails}
                      onClick={() => {
                        triggerHaptic('light');
                        openSeriesDetails(selectedSeries.tmdbId, s.seasonNumber);
                      }}
                      className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        selectedSeries.activeSeason === s.seasonNumber
                          ? 'bg-white text-[#090A0F]'
                          : 'bg-[#090A0F] hover:bg-white/10 text-zinc-300 border border-white/10'
                      }`}
                    >
                      {lang === 'es' ? `Temporada ${s.seasonNumber}` : `Season ${s.seasonNumber}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Episodes Grid */}
              <div className="p-4 sm:p-6">
                {loadingSeriesDetails ? (
                  <div className="py-10 flex items-center justify-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin text-[#E11D48]" />
                    <span>Cargando episodios...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
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
                        <button
                          key={ep.id}
                          type="button"
                          disabled={Boolean(loadingItemId)}
                          onClick={() => {
                            triggerHaptic('success');
                            onPlaySeriesEpisode(selectedSeries, ep, seriesLangMode);
                          }}
                          className="group text-left rounded-2xl bg-[#090A0F] hover:bg-[#191C28] border border-white/[0.08] hover:border-white/25 p-3 flex items-center gap-3.5 transition-all cursor-pointer"
                        >
                          <div className="relative w-28 sm:w-36 aspect-video rounded-xl overflow-hidden bg-[#191C28] shrink-0">
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
                              <div className="w-full h-full flex items-center justify-center bg-[#191C28]">
                                <Tv className="w-5 h-5 text-zinc-500" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <div className="w-9 h-9 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-md">
                                {isExtractingEp ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Play className="w-4 h-4 fill-current ml-0.5" />
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
                              {ep.overview || 'Reproducir episodio en alta definición sin anuncios.'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Series Browse & Search Grid */
            <>
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
                    className={`flex-1 sm:flex-initial min-h-[36px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      seriesLangMode === 'ES' ? 'bg-[#E11D48] text-white' : 'text-zinc-400'
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
                    className={`flex-1 sm:flex-initial min-h-[36px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      seriesLangMode === 'EN' ? 'bg-[#E11D48] text-white' : 'text-zinc-400'
                    }`}
                  >
                    VOSE · EN
                  </button>
                </div>
              </div>

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
                      className={`min-h-[42px] px-4 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
                        seriesCategory === cat.id
                          ? 'bg-[#E11D48] text-white shadow-[0_6px_20px_rgba(225,29,72,0.35)]'
                          : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
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
                    <Heart className="w-4 h-4 fill-current text-[#FB7185] shrink-0" />
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
                        className="group relative w-[136px] sm:w-[152px] aspect-[2/3] shrink-0 rounded-2xl overflow-hidden bg-[#090A0F] border border-white/[0.08] hover:border-[#FB7185]/60 active:scale-[0.98] transition-all cursor-pointer"
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
                          className="w-9 h-9 rounded-full bg-black/65 hover:bg-black/90 text-[#FB7185] flex items-center justify-center absolute top-2 right-2 z-10 cursor-pointer"
                        >
                          <Heart className="w-4 h-4 fill-current" />
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

              {loadingSeries || loadingSeriesDetails ? (
                <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-4 @xl:grid-cols-5 gap-3.5 @sm:gap-4">
                    {seriesList.map((show) => {
                      const seriesItem: CatalogMovie = { ...show, mediaType: 'tv' };
                      const savedSeries = isBookmarked(seriesItem);
                      const imgBroken = brokenPosters[show.id];
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
                          className="group relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.08] hover:border-white/25 active:scale-[0.98] transition-all cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
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
                            <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#1F2437] to-[#12141D]">
                              <Tv className="w-8 h-8 text-zinc-500 mb-2" />
                              <span className="font-display font-semibold text-xs text-zinc-200 line-clamp-3">
                                {show.title}
                              </span>
                            </div>
                          )}

                          {/* Series Trailer & Info Button (44x44px Hitbox) */}
                          {show.tmdbId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('light');
                                setPreviewItem(seriesItem);
                              }}
                              title={lang === 'es' ? 'Ver Tráiler y Ficha' : 'Watch Trailer & Info'}
                              aria-label="Ver tráiler de la serie"
                              className="absolute top-2 left-2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/15 flex items-center justify-center text-sky-300 hover:text-white active:scale-90 transition-all cursor-pointer"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                          )}

                          {/* Favorite Series Heart Toggle (44x44px Hitbox) */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleBookmark(seriesItem, e)}
                            aria-label="Marcar serie como favorita"
                            title={
                              savedSeries
                                ? 'Quitar de Series Favoritas'
                                : 'Añadir a Series Favoritas'
                            }
                            className="absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                          >
                            <Heart
                              className={`w-4 h-4 ${
                                savedSeries ? 'fill-current text-[#FB7185]' : 'text-zinc-200'
                              }`}
                            />
                          </button>

                          <div className="absolute inset-0 bg-black/45 opacity-0 sm:group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                            <div className="px-4 py-2 rounded-2xl bg-[#E11D48] text-white text-xs font-bold flex items-center gap-1.5 shadow-xl">
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{lang === 'es' ? 'Episodios' : 'Episodes'}</span>
                            </div>
                          </div>

                          {/* Edge-to-Edge Bottom Dark Gradient Overlay */}
                          <div className="absolute inset-x-0 bottom-0 pt-16 pb-3 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col justify-end pointer-events-none">
                            <h3 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug drop-shadow">
                              {show.title}
                            </h3>
                            <div className="text-[11px] text-zinc-300 truncate mt-1 flex items-center gap-1.5">
                              <span>{show.year || 'TV'}</span>
                              <span className="text-zinc-500">·</span>
                              <span className="text-sky-300 font-semibold">Serie</span>
                              {show.rating && (
                                <>
                                  <span className="text-zinc-500">·</span>
                                  <span className="text-amber-400 font-mono font-bold">
                                    ★ {show.rating}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
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
                        className="min-h-[46px] px-6 rounded-2xl bg-[#12141D] hover:bg-[#191C28] border border-white/12 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
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
            </>
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
                        ? 'bg-[#E11D48] text-white shadow-[0_6px_20px_rgba(225,29,72,0.35)]'
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
                      className={`min-w-[178px] sm:min-w-[196px] shrink-0 rounded-2xl p-3 border flex flex-col justify-between gap-1.5 ${
                        sc.isLive
                          ? 'bg-[#121622] border-emerald-400/35'
                          : 'bg-white/[0.03] border-white/[0.07]'
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
                        className="relative rounded-3xl overflow-hidden border border-white/[0.09] bg-[#12141D] min-h-[205px] sm:min-h-[220px] p-5 flex flex-col justify-end gap-4 min-w-0 shadow-[0_14px_40px_rgba(0,0,0,0.65)]"
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
                                className={`inline-flex items-center rounded-2xl shrink-0 overflow-hidden transition-all ${
                                  activeCh
                                    ? 'bg-[#E11D48] text-white shadow-md shadow-[#E11D48]/30'
                                    : 'bg-black/60 hover:bg-black/80 text-white backdrop-blur-xl border border-white/15'
                                }`}
                              >
                                <button
                                  type="button"
                                  disabled={Boolean(loadingItemId)}
                                  onClick={() => {
                                    triggerHaptic('medium');
                                    onPlaySportsMatch(mux, idx);
                                  }}
                                  className="min-h-[44px] pl-3.5 pr-2.5 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>{ch.label}</span>
                                </button>
                                {activeVideoRawUrl &&
                                  !activeCh &&
                                  onPlaySecondaryChannel && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        triggerHaptic('medium');
                                        onPlaySecondaryChannel({
                                          sourceUrl: ch.sourceUrl,
                                          title: ch.label,
                                          subtitle: mux.title,
                                        });
                                      }}
                                      title="Ver en 2ª pantalla (Multiview)"
                                      aria-label="Abrir en segunda pantalla Multiview"
                                      className="min-h-[44px] px-2.5 border-l border-white/15 text-sky-300 hover:text-white flex items-center justify-center cursor-pointer"
                                    >
                                      <Columns2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
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
                                  title="Marcar canal favorito"
                                  aria-label="Marcar como canal favorito"
                                  className="min-h-[44px] px-2.5 border-l border-white/15 flex items-center justify-center cursor-pointer"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      chSaved
                                        ? 'fill-current text-amber-400'
                                        : 'text-zinc-300 hover:text-amber-300'
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
                      return (
                        <div
                          key={match.id}
                          className="relative rounded-3xl overflow-hidden border border-white/[0.09] hover:border-white/25 bg-[#0D0F18] min-h-[168px] p-5 flex flex-col justify-end gap-3.5 transition-all min-w-0 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
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
                            {isExtractingMatch && (
                              <Loader2 className="w-5 h-5 animate-spin text-[#E11D48] shrink-0 mt-1" />
                            )}
                          </div>

                          <div className="relative z-10 flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5 min-w-0">
                            {match.channels.slice(0, 6).map((ch, idx) => {
                              const activeCh = activeVideoRawUrl === ch.sourceUrl;
                              const label = ch.label || `Señal ${idx + 1}`;
                              const chFavId = buildChannelFavId(ch.sourceUrl, label);
                              const chSaved = isChannelFavorited(chFavId);

                              return (
                                <div
                                  key={ch.id}
                                  className={`inline-flex items-center rounded-2xl shrink-0 overflow-hidden transition-all ${
                                    activeCh
                                      ? 'bg-[#E11D48] text-white'
                                      : 'bg-black/65 hover:bg-black/85 text-zinc-100 backdrop-blur-xl border border-white/15'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    disabled={Boolean(loadingItemId)}
                                    onClick={() => {
                                      triggerHaptic('light');
                                      onPlaySportsMatch(match, idx);
                                    }}
                                    className="min-h-[44px] pl-3.5 pr-2.5 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>{label}</span>
                                  </button>
                                  {activeVideoRawUrl &&
                                    !activeCh &&
                                    onPlaySecondaryChannel && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          triggerHaptic('medium');
                                          onPlaySecondaryChannel({
                                            sourceUrl: ch.sourceUrl,
                                            title: `${match.title} · ${label}`,
                                            subtitle: match.competition,
                                          });
                                        }}
                                        title="Ver en 2ª pantalla (Multiview)"
                                        aria-label="Abrir en segunda pantalla Multiview"
                                        className="min-h-[44px] px-2.5 border-l border-white/15 text-sky-300 hover:text-white flex items-center justify-center cursor-pointer"
                                      >
                                        <Columns2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerHaptic('light');
                                      onToggleChannelFavorite({
                                        favId: chFavId,
                                        title: match.title,
                                        channelLabel: label,
                                        channelUrl: ch.sourceUrl,
                                        competition: match.competition,
                                        sport: match.sport,
                                      });
                                    }}
                                    title="Guardar canal favorito"
                                    aria-label="Marcar canal favorito"
                                    className="min-h-[44px] px-2.5 border-l border-white/15 flex items-center justify-center cursor-pointer"
                                  >
                                    <Star
                                      className={`w-3.5 h-3.5 ${
                                        chSaved
                                          ? 'fill-current text-amber-400'
                                          : 'text-zinc-300 hover:text-amber-300'
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
                      ? 'bg-[#E11D48] text-white shadow-[0_6px_20px_rgba(225,29,72,0.35)]'
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
                  onClick={() => {
                    triggerHaptic('success');
                    onPlayYouTubeVideo(vid);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onPlayYouTubeVideo(vid);
                  }}
                  className="group relative aspect-video w-full rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.08] hover:border-white/25 active:scale-[0.98] transition-all cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
                >
                  <img
                    src={vid.thumbnail}
                    alt={vid.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                  />

                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[11px] font-mono font-bold text-white">
                    {vid.duration}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
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
                    title="Añadir a la cola compartida"
                    aria-label="Añadir a la cola compartida"
                    className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  {/* Edge-to-Edge Bottom Dark Gradient Overlay */}
                  <div className="absolute inset-x-0 bottom-0 pt-14 pb-3 px-3.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col justify-end pointer-events-none">
                    <h4 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug drop-shadow">
                      {vid.title}
                    </h4>
                    <div className="text-[11px] text-zinc-300 truncate mt-1">
                      <span>{vid.channel}</span>
                      {vid.views && (
                        <>
                          <span className="mx-1.5 text-zinc-500">·</span>
                          <span>{vid.views}</span>
                        </>
                      )}
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
