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
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  RoomQueueItem,
  SportsMatch,
  TvEpisodeItem,
  TvSeriesDetails,
  YouTubeSearchItem,
} from '../types';
import { UI_COPY } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { getWatchlist, toggleWatchlistItem } from '../utils/storage';
import stadiumBackdrop from '../assets/images/sports_stadium_backdrop_1794353709543.jpg';
import f1Backdrop from '../assets/images/motorsport_f1_backdrop_1794353709150.jpg';

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
  onPlayMovie: (movie: CatalogMovie, preferLang: 'ES' | 'EN') => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: 'ES' | 'EN'
  ) => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  onPlayCustomUrl: (url: string) => void;
  onOpenCloudBrowser: (url: string) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  onRemoveFromQueue: (itemId: string) => void;
  onPlayQueueItem: (item: RoomQueueItem) => void;
}

export const MediaCatalogHub: React.FC<MediaCatalogHubProps> = ({
  activeSection,
  onChangeSection,
  lang,
  activeVideoRawUrl,
  loadingItemId,
  roomQueue,
  onPlayMovie,
  onPlaySeriesEpisode,
  onPlaySportsMatch,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
  onOpenCloudBrowser,
  onAddToQueue,
  onRemoveFromQueue,
  onPlayQueueItem,
}) => {
  const t = UI_COPY[lang];

  // Watchlist state ("Mi Lista")
  const [watchlist, setWatchlist] = useState<CatalogMovie[]>(() => getWatchlist());
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

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

  // Fetch Sports Agenda
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
  };

  useEffect(() => {
    if (activeSection === 'sports' && sportsEvents.length === 0) {
      fetchSportsAgenda();
    }
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
    setWatchlist(toggleWatchlistItem(item));
  };

  const isBookmarked = (item: CatalogMovie) => {
    const key = item.tmdbId ? `${item.mediaType || 'movie'}-${item.tmdbId}` : item.id;
    return watchlist.some(
      (x) => (x.tmdbId ? `${x.mediaType || 'movie'}-${x.tmdbId}` : x.id) === key
    );
  };

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

  const displayedMovies = showWatchlistOnly
    ? watchlist.filter((w) => (w.mediaType || 'movie') === 'movie')
    : movies;

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
    <div className="w-full space-y-5">
      {/* ================================================================== */}
      {/* CINEMA UNIVERSE SWITCHER (MOVIES ES · BINGETRIX EN · SERIES TV)    */}
      {/* ================================================================== */}
      {isCinemaFamily && (
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center p-1 rounded-2xl bg-[#12141D] border border-white/[0.08] shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowWatchlistOnly(false);
                setMoviePage(1);
                onChangeSection('movies');
              }}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeSection === 'movies' && !showWatchlistOnly
                  ? 'bg-[#E11D48] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {lang === 'es' ? 'Películas · Español' : 'Movies · Spanish'}
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowWatchlistOnly(false);
                setMoviePage(1);
                onChangeSection('vose');
              }}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeSection === 'vose' && !showWatchlistOnly
                  ? 'bg-[#E11D48] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Bingetrix · English
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowWatchlistOnly(false);
                onChangeSection('series');
              }}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
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
            className={`min-h-[40px] px-3.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
              showWatchlistOnly
                ? 'bg-white text-[#090A0F] border-white'
                : 'bg-[#12141D] text-zinc-300 border-white/[0.08] hover:text-white'
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
      {/* SECTION 1 & 2: MOVIES (ESPAÑOL CAST/LAT + BINGETRIX EXPLORE EN)    */}
      {/* ================================================================== */}
      {(activeSection === 'movies' || activeSection === 'vose') && (
        <div className="space-y-4">
          {/* Search Input + Genre Filter Strip */}
          {!showWatchlistOnly && (
            <div className="space-y-3">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={movieQuery}
                  onChange={(e) => setMovieQuery(e.target.value)}
                  placeholder={
                    activeSection === 'vose'
                      ? t.searchBingetrixPlaceholder
                      : t.searchMoviesPlaceholder
                  }
                  className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#12141D] border border-white/[0.08] focus:border-white/30 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
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

              {!debouncedMovieQuery && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {MOVIE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setMovieCategory(cat.id);
                        setMoviePage(1);
                      }}
                      className={`min-h-[40px] px-3.5 rounded-2xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        movieCategory === cat.id
                          ? 'bg-white text-[#090A0F]'
                          : 'bg-[#12141D] hover:bg-[#191C28] text-zinc-300 border border-white/[0.08]'
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
            <div className="relative rounded-3xl overflow-hidden border border-white/[0.09] bg-[#12141D] min-h-[210px] sm:min-h-[260px] flex flex-col justify-end p-5 sm:p-8">
              {!spotlightImgFailed && (spotlightMovie.backdrop || spotlightMovie.poster) ? (
                <img
                  src={spotlightMovie.backdrop || spotlightMovie.poster}
                  alt={spotlightMovie.title}
                  referrerPolicy="no-referrer"
                  onError={() => setSpotlightImgFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover object-center opacity-55"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#231229] via-[#12141D] to-[#090A0F]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/80 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#090A0F]/85 via-[#090A0F]/45 to-transparent" />

              <div className="relative z-10 max-w-xl space-y-2.5">
                <div className="text-xs text-[#FB7185] font-medium">
                  <span>
                    {activeSection === 'vose'
                      ? 'Bingetrix Featured · 1080p'
                      : lang === 'es'
                      ? 'Estreno Destacado NAIMCINE'
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
                    className="min-h-[44px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-xs sm:text-sm font-semibold text-white flex items-center gap-2 shadow-lg shadow-[#E11D48]/25 transition-all whitespace-nowrap cursor-pointer"
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
                    onClick={(e) => handleToggleBookmark(spotlightMovie, e)}
                    className="min-h-[44px] px-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isBookmarked(spotlightMovie) ? 'fill-current text-[#FB7185]' : ''
                      }`}
                    />
                    <span>{isBookmarked(spotlightMovie) ? 'Guardada' : 'Mi Lista'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Responsive Mobile-First Movie Grid */}
          {loadingMovies ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-2xl bg-[#12141D] border border-white/[0.06] animate-pulse"
                />
              ))}
            </div>
          ) : gridMovies.length === 0 && !spotlightMovie ? (
            <div className="py-14 text-center rounded-3xl bg-[#12141D] border border-white/[0.08] px-5">
              <Film className="w-8 h-8 text-zinc-500 mx-auto mb-2.5" />
              <p className="text-sm font-medium text-zinc-200">
                {showWatchlistOnly
                  ? lang === 'es'
                    ? 'Aún no has guardado películas en Mi Lista.'
                    : 'Your Watchlist is currently empty.'
                  : lang === 'es'
                  ? 'No se encontraron películas con ese título.'
                  : 'No movies found matching your search.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
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
                        onPlayMovie(movie, activeSection === 'vose' ? 'EN' : 'ES');
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !loadingItemId) {
                          onPlayMovie(movie, activeSection === 'vose' ? 'EN' : 'ES');
                        }
                      }}
                      className="group text-left rounded-2xl overflow-hidden bg-[#12141D] border border-white/[0.08] hover:border-white/25 active:scale-[0.98] transition-all flex flex-col cursor-pointer"
                    >
                      <div className="relative aspect-[2/3] w-full bg-[#191C28] overflow-hidden">
                        {!imgBroken && movie.poster ? (
                          <img
                            src={movie.poster}
                            alt={movie.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenPosters((prev) => ({ ...prev, [movie.id]: true }))
                            }
                            className="w-full h-full object-cover sm:group-hover:scale-[1.03] transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#1F2437] to-[#12141D]">
                            <Film className="w-8 h-8 text-zinc-500 mb-2" />
                            <span className="font-display font-semibold text-xs text-zinc-200 line-clamp-3">
                              {movie.title}
                            </span>
                          </div>
                        )}

                        {/* Bookmark & Add-to-Queue Corner Actions */}
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleToggleBookmark(movie, e)}
                            aria-label="Guardar en Mi Lista"
                            className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md flex items-center justify-center text-white transition-colors cursor-pointer"
                          >
                            <Heart
                              className={`w-4 h-4 ${
                                saved ? 'fill-current text-[#FB7185]' : 'text-zinc-200'
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
                                subtitle: `${movie.year} · ${activeSection === 'vose' ? 'English 1080p' : 'Español / Multi'}`,
                                poster: movie.poster,
                                tmdbId: movie.tmdbId,
                                url: movie.bingetrixUrl || movie.movidyUrl,
                                preferLang: activeSection === 'vose' ? 'EN' : 'ES',
                              });
                            }}
                            aria-label="Añadir a la cola de la sala"
                            title="Añadir a la cola de la sala"
                            className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md flex items-center justify-center text-white transition-colors cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <div
                          className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity pointer-events-none ${
                            isExtractingThis
                              ? 'opacity-100'
                              : 'opacity-0 sm:group-hover:opacity-100'
                          }`}
                        >
                          <div className="w-11 h-11 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-xl">
                            {isExtractingThis ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Clean Unboxed Metadata */}
                      <div className="p-3 flex-1 flex flex-col justify-between gap-1">
                        <h3 className="font-display font-semibold text-xs sm:text-sm text-white line-clamp-1">
                          {movie.title}
                        </h3>
                        <div className="text-[11px] text-zinc-400 truncate">
                          <span>{movie.year || 'HD'}</span>
                          {movie.languages?.length > 0 && (
                            <>
                              <span className="mx-1.5 text-zinc-600" aria-hidden="true">·</span>
                              <span>{movie.languages.slice(0, 2).join(' / ')}</span>
                            </>
                          )}
                          {movie.rating && (
                            <>
                              <span className="mx-1.5 text-zinc-600" aria-hidden="true">·</span>
                              <span className="text-amber-400 font-mono tabular-nums">
                                ★ {movie.rating}
                              </span>
                            </>
                          )}
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

                  {/* Audio Language Preference Toggle for Episodes */}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedSeries.episodes.map((ep) => {
                      const epLoadId = `tv-${selectedSeries.tmdbId}-${ep.seasonNumber}-${ep.episodeNumber}`;
                      const isExtractingEp = loadingItemId === epLoadId;
                      const stillBroken = brokenEpisodeImgs[ep.id];

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
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-[11px] font-mono text-[#FB7185]">
                              {ep.seasonNumber}x{String(ep.episodeNumber).padStart(2, '0')}
                              {ep.runtime ? ` · ${ep.runtime}m` : ''}
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
                    className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#12141D] border border-white/[0.08] focus:border-white/30 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none"
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

                <div className="flex items-center p-1 rounded-2xl bg-[#12141D] border border-white/[0.08] shrink-0">
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
                    Español · LAT
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
                    Bingetrix · English
                  </button>
                </div>
              </div>

              {!debouncedSeriesQuery && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {SERIES_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSeriesCategory(cat.id);
                        setSeriesPage(1);
                      }}
                      className={`min-h-[40px] px-3.5 rounded-2xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        seriesCategory === cat.id
                          ? 'bg-white text-[#090A0F]'
                          : 'bg-[#12141D] hover:bg-[#191C28] text-zinc-300 border border-white/[0.08]'
                      }`}
                    >
                      {lang === 'es' ? cat.es : cat.en}
                    </button>
                  ))}
                </div>
              )}

              {loadingSeries || loadingSeriesDetails ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[2/3] rounded-2xl bg-[#12141D] border border-white/[0.06] animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                    {seriesList.map((show) => {
                      const imgBroken = brokenPosters[show.id];
                      return (
                        <button
                          key={show.id}
                          type="button"
                          onClick={() => {
                            if (!show.tmdbId) return;
                            triggerHaptic('light');
                            openSeriesDetails(show.tmdbId, 1);
                          }}
                          className="group text-left rounded-2xl overflow-hidden bg-[#12141D] border border-white/[0.08] hover:border-white/25 active:scale-[0.98] transition-all flex flex-col cursor-pointer"
                        >
                          <div className="relative aspect-[2/3] w-full bg-[#191C28] overflow-hidden">
                            {!imgBroken && show.poster ? (
                              <img
                                src={show.poster}
                                alt={show.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setBrokenPosters((prev) => ({ ...prev, [show.id]: true }))
                                }
                                className="w-full h-full object-cover sm:group-hover:scale-[1.03] transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#1F2437] to-[#12141D]">
                                <Tv className="w-8 h-8 text-zinc-500 mb-2" />
                                <span className="font-display font-semibold text-xs text-zinc-200 line-clamp-3">
                                  {show.title}
                                </span>
                              </div>
                            )}

                            <div className="absolute inset-0 bg-black/45 opacity-0 sm:group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <div className="px-3.5 py-2 rounded-xl bg-[#E11D48] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xl">
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>{lang === 'es' ? 'Ver Episodios' : 'Episodes'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="p-3 flex-1 flex flex-col justify-between gap-1">
                            <h3 className="font-display font-semibold text-xs sm:text-sm text-white line-clamp-1">
                              {show.title}
                            </h3>
                            <div className="text-[11px] text-zinc-400 truncate">
                              <span>{show.year || 'TV'}</span>
                              <span className="mx-1.5 text-zinc-600">·</span>
                              <span>Serie</span>
                              {show.rating && (
                                <>
                                  <span className="mx-1.5 text-zinc-600">·</span>
                                  <span className="text-amber-400 font-mono">★ {show.rating}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </button>
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
                  className="w-full h-11 pl-10 pr-9 rounded-2xl bg-[#12141D] border border-white/[0.08] focus:border-white/30 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none"
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
                className="w-11 h-11 rounded-2xl bg-[#12141D] hover:bg-[#191C28] active:scale-95 border border-white/[0.08] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSports ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
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
                  className={`min-h-[42px] px-4 rounded-2xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    sportFilter === cat.id
                      ? 'bg-white text-[#090A0F]'
                      : 'bg-[#12141D] hover:bg-[#191C28] text-zinc-300 border border-white/[0.08]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {loadingSports && sportsEvents.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 rounded-3xl bg-[#12141D] border border-white/[0.08] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {multiplexChannels.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                  {multiplexChannels.map((mux) => {
                    const bgAsset = mux.sport === 'motor' ? f1Backdrop : stadiumBackdrop;
                    const imgFailed = brokenHeroImgs[mux.id];
                    const isExtractingMux = loadingItemId?.startsWith(mux.id);

                    return (
                      <div
                        key={mux.id}
                        className="relative rounded-3xl overflow-hidden border border-white/[0.09] bg-[#12141D] min-h-[195px] sm:min-h-[210px] p-5 flex flex-col justify-between gap-4"
                      >
                        {!imgFailed ? (
                          <img
                            src={bgAsset}
                            alt={mux.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenHeroImgs((prev) => ({ ...prev, [mux.id]: true }))
                            }
                            className="absolute inset-0 w-full h-full object-cover object-center opacity-55"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-[#192236] to-[#090A0F]" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/80 to-[#090A0F]/35" />

                        <div className="relative z-10 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-[#FB7185] font-medium">
                              {mux.competition} · {mux.time}
                            </div>
                            <h3 className="font-display font-bold text-base sm:text-lg text-white mt-0.5 text-balance">
                              {mux.title}
                            </h3>
                          </div>
                          {isExtractingMux && (
                            <Loader2 className="w-5 h-5 animate-spin text-[#E11D48] shrink-0" />
                          )}
                        </div>

                        <div className="relative z-10 flex items-center sm:flex-wrap gap-2 overflow-x-auto no-scrollbar pt-1">
                          {mux.channels.map((ch, idx) => {
                            const activeCh = activeVideoRawUrl === ch.sourceUrl;
                            return (
                              <button
                                key={ch.id}
                                type="button"
                                disabled={Boolean(loadingItemId)}
                                onClick={() => {
                                  triggerHaptic('medium');
                                  onPlaySportsMatch(mux, idx);
                                }}
                                className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                                  activeCh
                                    ? 'bg-[#E11D48] text-white shadow-md shadow-[#E11D48]/30'
                                    : 'bg-white/12 hover:bg-white/20 text-white backdrop-blur-md border border-white/15'
                                }`}
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>{ch.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {scheduledMatches.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-display font-semibold text-sm sm:text-base text-zinc-200 px-0.5">
                    {lang === 'es'
                      ? 'Agenda de Partidos en Directo Hoy'
                      : "Today's Live Match Schedule"}
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {scheduledMatches.map((match) => {
                      const isExtractingMatch = loadingItemId?.startsWith(match.id);
                      return (
                        <div
                          key={match.id}
                          className="rounded-2xl bg-[#12141D] border border-white/[0.08] hover:border-white/20 p-4 flex flex-col justify-between gap-3 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-zinc-400 truncate">
                                <span className="font-mono tabular-nums text-white font-semibold">
                                  {match.time}
                                </span>
                                <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                                  ·
                                </span>
                                <span>{match.competition}</span>
                              </div>
                              <h4 className="font-display font-semibold text-sm sm:text-base text-white mt-0.5 line-clamp-2">
                                {match.title}
                              </h4>
                            </div>
                            {isExtractingMatch && (
                              <Loader2 className="w-4 h-4 animate-spin text-[#E11D48] shrink-0 mt-1" />
                            )}
                          </div>

                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
                            {match.channels.slice(0, 6).map((ch, idx) => {
                              const activeCh = activeVideoRawUrl === ch.sourceUrl;
                              return (
                                <button
                                  key={ch.id}
                                  type="button"
                                  disabled={Boolean(loadingItemId)}
                                  onClick={() => {
                                    triggerHaptic('light');
                                    onPlaySportsMatch(match, idx);
                                  }}
                                  className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                                    activeCh
                                      ? 'bg-[#E11D48] text-white'
                                      : 'bg-[#191C28] hover:bg-[#232838] text-zinc-200 border border-white/[0.08]'
                                  }`}
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>{ch.label || `Señal ${idx + 1}`}</span>
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
                  placeholder={t.searchYoutubePlaceholder}
                  className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#12141D] border border-white/[0.08] focus:border-white/30 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none"
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
                className="min-h-[44px] px-4 rounded-2xl bg-[#12141D] hover:bg-[#191C28] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Link2 className="w-4 h-4 text-sky-400" />
                <span>
                  {lang === 'es' ? 'Pegar URL / Cola' : 'Paste URL / Queue'} ({roomQueue.length})
                </span>
              </button>
            </div>

            {/* Quick Party Mood Topics */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {YOUTUBE_QUICK_TOPICS.map((topic) => (
                <button
                  key={topic.q}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setYtQuery(lang === 'es' ? topic.labelEs : topic.labelEn);
                    setDebouncedYtQuery(topic.q);
                  }}
                  className={`min-h-[40px] px-3.5 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    debouncedYtQuery === topic.q
                      ? 'bg-white text-[#090A0F]'
                      : 'bg-[#12141D] hover:bg-[#191C28] text-zinc-300 border border-white/[0.08]'
                  }`}
                >
                  {lang === 'es' ? topic.labelEs : topic.labelEn}
                </button>
              ))}
            </div>
          </div>

          {loadingYt ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-video rounded-2xl bg-[#12141D] border border-white/[0.06] animate-pulse"
                />
              ))}
            </div>
          ) : ytResults.length === 0 ? (
            <div className="py-12 text-center rounded-3xl bg-[#12141D] border border-white/[0.08] px-5">
              <Youtube className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm text-zinc-300">
                {lang === 'es'
                  ? 'Busca cualquier vídeo o canal de YouTube para verlo sincronizado con tus amigos.'
                  : 'Search any YouTube video or channel to watch synchronized with friends.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  className="group rounded-2xl overflow-hidden bg-[#12141D] border border-white/[0.08] hover:border-white/25 active:scale-[0.99] transition-all flex flex-col cursor-pointer"
                >
                  <div className="relative aspect-video w-full bg-[#191C28] overflow-hidden">
                    <img
                      src={vid.thumbnail}
                      alt={vid.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover sm:group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 text-[11px] font-mono text-white">
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
                      className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md flex items-center justify-center text-white cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-1.5">
                    <h4 className="font-display font-semibold text-xs sm:text-sm text-white line-clamp-2">
                      {vid.title}
                    </h4>
                    <div className="text-[11px] text-zinc-400 truncate">
                      <span>{vid.channel}</span>
                      {vid.views && (
                        <>
                          <span className="mx-1.5 text-zinc-600">·</span>
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
          <div className="rounded-3xl bg-[#12141D] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListVideo className="w-5 h-5 text-[#FB7185]" />
                <h3 className="font-display font-semibold text-base sm:text-lg text-white">
                  {lang === 'es' ? 'Cola Compartida de la Sala' : 'Shared Room Queue'} (
                  {roomQueue.length})
                </h3>
              </div>
            </div>

            {roomQueue.length === 0 ? (
              <p className="text-xs sm:text-sm text-zinc-400">
                {lang === 'es'
                  ? 'Pulsa el botón "+" en cualquier película o vídeo de YouTube para preparar la sesión con tus amigos.'
                  : 'Tap "+" on any movie or YouTube video to queue up what your room watches next.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {roomQueue.map((qItem) => (
                  <div
                    key={qItem.id}
                    className="rounded-2xl bg-[#090A0F] border border-white/[0.08] p-3 flex items-center justify-between gap-3"
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
                        className="min-h-[38px] px-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Ver</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFromQueue(qItem.id)}
                        aria-label="Eliminar de la cola"
                        className="w-9 h-9 rounded-xl bg-[#191C28] hover:bg-[#232838] flex items-center justify-center text-zinc-400 hover:text-rose-400 cursor-pointer"
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
          <div className="rounded-3xl bg-[#12141D] border border-white/[0.08] p-5 sm:p-8 space-y-6">
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
                className="w-full h-12 px-4 rounded-2xl bg-[#090A0F] border border-white/12 focus:border-white/35 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none font-mono"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="submit"
                  disabled={!customUrl.trim() || Boolean(loadingItemId)}
                  className="min-h-[48px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] disabled:opacity-40 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
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
                  className="min-h-[48px] px-5 rounded-2xl bg-[#191C28] hover:bg-[#232838] active:scale-[0.98] disabled:opacity-40 border border-white/10 text-sm font-semibold text-zinc-200 flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Tv className="w-4 h-4 text-sky-400" />
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                    className="min-h-[48px] px-4 rounded-2xl bg-[#090A0F] hover:bg-[#191C28] active:scale-[0.98] border border-white/[0.08] text-xs sm:text-sm font-semibold text-zinc-200 transition-all whitespace-nowrap cursor-pointer"
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
