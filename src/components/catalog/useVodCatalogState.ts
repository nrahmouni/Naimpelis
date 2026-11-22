import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppLanguage,
  CatalaCatalogItem,
  CatalaSeriesDetails,
  CatalogMovie,
  YouTubeSearchItem,
} from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { mergeAndRankCatalogResults } from '../../utils/catalogSearchRank';
import type { CatalogSection } from './catalogConstants';

interface UseVodCatalogStateArgs {
  lang: AppLanguage;
  worldMode?: 'cine' | 'futbol' | 'tv' | 'youtube';
  activeSection: CatalogSection;
  showWatchlistOnly: boolean;
  effectiveCineTab: 'movies' | 'series';
  effectiveCineCastellano: boolean;
  externalSearchQuery?: string;
}

export function useVodCatalogState({
  lang,
  worldMode,
  activeSection,
  showWatchlistOnly,
  effectiveCineTab,
  effectiveCineCastellano,
  externalSearchQuery,
}: UseVodCatalogStateArgs) {
  const [homeGenreId] = useState<number | null>(null);
  const [homeProvider] = useState<string>('all');
  const [homeSortBy] = useState<
    'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc'
  >('popularity.desc');
  const initialCineSearch = worldMode === 'cine' ? (externalSearchQuery || '') : '';
  const initialCineTrimmed = initialCineSearch.trim();
  const initialHomeDebounced =
    initialCineTrimmed && !/^https?:\/\//i.test(initialCineTrimmed) ? initialCineTrimmed : '';

  const [homeQuery, setHomeQuery] = useState(initialCineSearch);
  const [debouncedHomeQuery, setDebouncedHomeQuery] = useState(initialHomeDebounced);
  const [homeMovieResults, setHomeMovieResults] = useState<CatalogMovie[]>([]);
  const [homeSeriesResults, setHomeSeriesResults] = useState<CatalogMovie[]>([]);
  const [loadingHomeMovies, setLoadingHomeMovies] = useState(false);
  const [loadingHomeSeries, setLoadingHomeSeries] = useState(false);
  const loadingHomeSearch =
    effectiveCineTab === 'series' ? loadingHomeSeries : loadingHomeMovies;
  const [homeShowcaseMovies, setHomeShowcaseMovies] = useState<CatalogMovie[]>([]);
  const [homeShowcaseSeries, setHomeShowcaseSeries] = useState<CatalogMovie[]>([]);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [, setIsHeroHovered] = useState(false);

  const [movieQuery, setMovieQuery] = useState(initialCineSearch);
  const [debouncedMovieQuery, setDebouncedMovieQuery] = useState(initialCineTrimmed);
  const movieSort = useAppStore((s) => s.cineMovieSort);
  const setMovieSort = useAppStore((s) => s.setCineMovieSort);
  const movieGenre = useAppStore((s) => s.cineMovieGenre);
  const setMovieGenre = useAppStore((s) => s.setCineMovieGenre);
  const [moviePage, setMoviePage] = useState<number>(1);
  const [hasMoreMovies, setHasMoreMovies] = useState<boolean>(false);
  const [movies, setMovies] = useState<CatalogMovie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [loadingMoreMovies, setLoadingMoreMovies] = useState(false);

  const [seriesQuery, setSeriesQuery] = useState(initialCineSearch);
  const [debouncedSeriesQuery, setDebouncedSeriesQuery] = useState(initialCineTrimmed);
  const seriesSort = useAppStore((s) => s.cineSeriesSort);
  const setSeriesSort = useAppStore((s) => s.setCineSeriesSort);
  const seriesGenre = useAppStore((s) => s.cineSeriesGenre);
  const setSeriesGenre = useAppStore((s) => s.setCineSeriesGenre);
  const seriesLangMode = useAppStore((s) => s.cineSeriesLangMode);
  const setSeriesLangMode = useAppStore((s) => s.setCineSeriesLangMode);
  const [seriesPage, setSeriesPage] = useState<number>(1);
  const [hasMoreSeries, setHasMoreSeries] = useState<boolean>(false);
  const [seriesList, setSeriesList] = useState<CatalogMovie[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingMoreSeries, setLoadingMoreSeries] = useState(false);

  const requestedCatalaModal = useAppStore((s) => s.requestedCatalaModal);

  const [ytQuery, setYtQuery] = useState(worldMode === 'youtube' ? (externalSearchQuery || '') : '');
  const [debouncedYtQuery, setDebouncedYtQuery] = useState(
    worldMode === 'youtube' && externalSearchQuery?.trim()
      ? externalSearchQuery.trim()
      : 'resumen partido laliga champions highlights hd'
  );
  const [ytResults, setYtResults] = useState<YouTubeSearchItem[]>([]);
  const [loadingYt, setLoadingYt] = useState(false);

  const cineSpecialPortal = useAppStore((s) => s.cineSpecialPortal);
  const setCineSpecialPortal = useAppStore((s) => s.setCineSpecialPortal);
  const [cineFiltersOpen, setCineFiltersOpen] = useState(false);
  const cineAudioOverride = useAppStore((s) => s.cineAudioOverride);
  const setCineAudioOverride = useAppStore((s) => s.setCineAudioOverride);

  const [catalaQuery, setCatalaQuery] = useState(initialCineSearch);
  const [debouncedCatalaQuery, setDebouncedCatalaQuery] = useState(initialCineTrimmed);
  const [catalaItems, setCatalaItems] = useState<CatalaCatalogItem[]>([]);
  const [loadingCatala, setLoadingCatala] = useState<boolean>(false);
  const [selectedCatalaSeries, setSelectedCatalaSeries] = useState<CatalaSeriesDetails | null>(
    null
  );
  const [loadingCatalaEpisodes, setLoadingCatalaEpisodes] = useState<boolean>(false);

  const prevExternalSearchRef = useRef<string | undefined>(externalSearchQuery);
  useEffect(() => {
    if (externalSearchQuery === undefined) return;
    if (prevExternalSearchRef.current === externalSearchQuery) return;
    prevExternalSearchRef.current = externalSearchQuery;
    if (worldMode === 'cine') {
      setHomeQuery(externalSearchQuery);
      setMovieQuery(externalSearchQuery);
      setSeriesQuery(externalSearchQuery);
      setCatalaQuery(externalSearchQuery);
    } else if (worldMode === 'youtube') {
      setYtQuery(externalSearchQuery);
    }
  }, [externalSearchQuery, worldMode]);

  useEffect(() => {
    if (!requestedCatalaModal) return;
    setCineSpecialPortal('catala');
    setSelectedCatalaSeries(requestedCatalaModal.series);
    setLoadingCatalaEpisodes(false);
  }, [requestedCatalaModal, setCineSpecialPortal]);

  useEffect(() => {
    const clean = homeQuery.trim();
    if (!clean || /^https?:\/\//i.test(clean)) {
      setDebouncedHomeQuery((prev) => (prev === '' ? prev : ''));
      return;
    }
    const timer = setTimeout(
      () => setDebouncedHomeQuery((prev) => (prev === clean ? prev : clean)),
      260
    );
    return () => clearTimeout(timer);
  }, [homeQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const clean = movieQuery.trim();
      setDebouncedMovieQuery((prev) => {
        if (prev === clean) return prev;
        setMoviePage(1);
        return clean;
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [movieQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const clean = seriesQuery.trim();
      setDebouncedSeriesQuery((prev) => {
        if (prev === clean) return prev;
        setSeriesPage(1);
        return clean;
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [seriesQuery]);

  useEffect(() => {
    const clean = ytQuery.trim();
    if (!clean) return;
    const timer = setTimeout(
      () => setDebouncedYtQuery((prev) => (prev === clean ? prev : clean)),
      340
    );
    return () => clearTimeout(timer);
  }, [ytQuery]);

  useEffect(() => {
    const clean = catalaQuery.trim();
    const timer = setTimeout(
      () => setDebouncedCatalaQuery((prev) => (prev === clean ? prev : clean)),
      280
    );
    return () => clearTimeout(timer);
  }, [catalaQuery]);

  // Showcase movies & series
  useEffect(() => {
    if (homeShowcaseMovies.length > 0 && homeShowcaseSeries.length > 0) return;
    let cancelled = false;

    Promise.all([
      fetch('/api/catalog/movies?provider=all&category=trending&page=1')
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
      fetch('/api/catalog/series?provider=all&category=trending&page=1&lang=es')
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
    ]).then(([mData, sData]) => {
      if (cancelled) return;
      const mItems: CatalogMovie[] = Array.isArray(mData?.items)
        ? mData.items
        : Array.isArray(mData?.movies)
        ? mData.movies
        : [];
      const sItems: CatalogMovie[] = Array.isArray(sData?.items)
        ? sData.items.map((it: CatalogMovie) => ({ ...it, mediaType: 'tv' as const }))
        : Array.isArray(sData?.series)
        ? sData.series.map((it: CatalogMovie) => ({ ...it, mediaType: 'tv' as const }))
        : [];
      if (mItems.length > 0) setHomeShowcaseMovies(mItems);
      if (sItems.length > 0) setHomeShowcaseSeries(sItems);
    });

    return () => {
      cancelled = true;
    };
  }, [homeShowcaseMovies.length, homeShowcaseSeries.length]);

  // Unified Home/Cine Search
  useEffect(() => {
    const activeForHomeSearch = worldMode === 'cine' || activeSection === 'home';
    if (!activeForHomeSearch || debouncedHomeQuery.length < 2) {
      setHomeMovieResults((prev) => (prev.length === 0 ? prev : []));
      setHomeSeriesResults((prev) => (prev.length === 0 ? prev : []));
      setLoadingHomeMovies((prev) => (prev ? false : prev));
      setLoadingHomeSeries((prev) => (prev ? false : prev));
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoadingHomeMovies(true);
    setLoadingHomeSeries(true);

    const useVoseMovies =
      activeSection === 'vose' ||
      (worldMode === 'cine' && !effectiveCineCastellano && cineAudioOverride === 'EN');
    const movieEndpoint = useVoseMovies
      ? `/api/catalog/bingetrix?provider=all&category=trending&sort=${encodeURIComponent(
          movieSort
        )}&page=1&query=${encodeURIComponent(debouncedHomeQuery)}`
      : `/api/catalog/movies?provider=all&category=trending&sort=${encodeURIComponent(
          movieSort
        )}&page=1&query=${encodeURIComponent(debouncedHomeQuery)}`;

    fetch(movieEndpoint, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { movies: [] }))
      .then((mData) => {
        if (!active) return;
        const raw: CatalogMovie[] = Array.isArray(mData?.movies)
          ? mData.movies
          : Array.isArray(mData?.items)
          ? mData.items
          : [];
        setHomeMovieResults(
          mergeAndRankCatalogResults(raw, [], debouncedHomeQuery, {
            limit: 15,
            prefer4k: movieSort === '4k',
          })
        );
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setHomeMovieResults([]);
      })
      .finally(() => {
        if (active) setLoadingHomeMovies(false);
      });

    const apiSeriesLang =
      !effectiveCineCastellano && (seriesLangMode === 'EN' || seriesLangMode === 'VOSE')
        ? 'en'
        : 'es';
    fetch(
      `/api/catalog/series?provider=all&category=trending&sort=${encodeURIComponent(
        seriesSort
      )}&page=1&lang=${apiSeriesLang}&query=${encodeURIComponent(debouncedHomeQuery)}`,
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : { series: [] }))
      .then((sData) => {
        if (!active) return;
        const raw: CatalogMovie[] = Array.isArray(sData?.series)
          ? sData.series
          : Array.isArray(sData?.items)
          ? sData.items
          : [];
        setHomeSeriesResults(
          mergeAndRankCatalogResults(raw, [], debouncedHomeQuery, {
            limit: 15,
            prefer4k: seriesSort === '4k',
          })
        );
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setHomeSeriesResults([]);
      })
      .finally(() => {
        if (active) setLoadingHomeSeries(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    worldMode,
    activeSection,
    debouncedHomeQuery,
    effectiveCineCastellano,
    cineAudioOverride,
    seriesLangMode,
    movieSort,
    seriesSort,
  ]);

  // Fetch Movies (skip while Cine unified search already handles the query)
  useEffect(() => {
    const inCineMovies =
      worldMode === 'cine' && effectiveCineTab === 'movies' && cineSpecialPortal === 'none';
    const isCineSearching = worldMode === 'cine' && debouncedHomeQuery.length >= 2;
    const shouldFetch =
      (inCineMovies && !isCineSearching) || activeSection === 'movies' || activeSection === 'vose';
    if (!shouldFetch || showWatchlistOnly) return;

    let cancelled = false;
    if (moviePage === 1) setLoadingMovies(true);
    else setLoadingMoreMovies(true);

    const activeCatParam = movieGenre || movieSort;
    const useVose =
      activeSection === 'vose' ||
      (worldMode === 'cine' && !effectiveCineCastellano && cineAudioOverride === 'EN');
    const endpoint = useVose
      ? `/api/catalog/bingetrix?provider=all&category=${encodeURIComponent(
          activeCatParam
        )}&sort=${encodeURIComponent(movieSort)}&page=${moviePage}&query=${encodeURIComponent(
          debouncedMovieQuery
        )}`
      : `/api/catalog/movies?provider=all&category=${encodeURIComponent(
          activeCatParam
        )}&sort=${encodeURIComponent(movieSort)}&page=${moviePage}&query=${encodeURIComponent(
          debouncedMovieQuery
        )}`;

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
  }, [
    worldMode,
    effectiveCineTab,
    effectiveCineCastellano,
    cineAudioOverride,
    cineSpecialPortal,
    activeSection,
    movieSort,
    movieGenre,
    moviePage,
    debouncedMovieQuery,
    showWatchlistOnly,
  ]);

  // Fetch TV Series (skip while Cine unified search already handles the query)
  useEffect(() => {
    const inCineSeries =
      worldMode === 'cine' && effectiveCineTab === 'series' && cineSpecialPortal === 'none';
    const isCineSearching = worldMode === 'cine' && debouncedHomeQuery.length >= 2;
    if ((!inCineSeries || isCineSearching) && activeSection !== 'series') return;
    let cancelled = false;
    if (seriesPage === 1) setLoadingSeries(true);
    else setLoadingMoreSeries(true);

    const activeCatParam = seriesGenre || seriesSort;
    const apiLang =
      !effectiveCineCastellano && (seriesLangMode === 'EN' || seriesLangMode === 'VOSE')
        ? 'en'
        : 'es';
    fetch(
      `/api/catalog/series?provider=all&category=${encodeURIComponent(
        activeCatParam
      )}&sort=${encodeURIComponent(seriesSort)}&page=${seriesPage}&lang=${apiLang}&query=${encodeURIComponent(
        debouncedSeriesQuery
      )}`
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
  }, [
    worldMode,
    effectiveCineTab,
    effectiveCineCastellano,
    cineSpecialPortal,
    activeSection,
    seriesSort,
    seriesGenre,
    seriesPage,
    seriesLangMode,
    debouncedSeriesQuery,
  ]);

  // YouTube search
  useEffect(() => {
    if (worldMode !== 'youtube' && activeSection !== 'youtube') return;
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
  }, [worldMode, activeSection, debouncedYtQuery]);

  // Català Anime Catalog
  useEffect(() => {
    const inCineCatala = worldMode === 'cine' && cineSpecialPortal === 'catala';
    if (!inCineCatala && activeSection !== 'catala') return;
    let cancelled = false;
    setLoadingCatala(true);

    const params = new URLSearchParams({
      category: 'all',
      query: debouncedCatalaQuery,
    });

    fetch(`/api/catalog/catala?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.items)) setCatalaItems(data.items);
      })
      .catch(() => {
        if (!cancelled) setCatalaItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatala(false);
      });

    return () => {
      cancelled = true;
    };
  }, [worldMode, cineSpecialPortal, activeSection, debouncedCatalaQuery]);

  const openCatalaSeriesDetails = useCallback(async (item: CatalaCatalogItem, seasonNum = 1) => {
    setLoadingCatalaEpisodes(true);

    setSelectedCatalaSeries((prev) =>
      prev && prev.id === item.id
        ? { ...prev, activeSeason: seasonNum }
        : {
            id: item.id,
            title: item.title,
            originalTitle: item.originalTitle,
            eraTag: item.eraTag,
            year: item.year,
            rating: item.rating,
            overview: item.overview,
            poster: item.poster,
            backdrop: item.backdrop || item.poster,
            activeSeason: seasonNum,
            seasons: [{ seasonNumber: seasonNum, name: `Temporada ${seasonNum}`, episodeCount: 0 }],
            episodes: [],
          }
    );

    try {
      const res = await fetch(
        `/api/catalog/catala/${encodeURIComponent(item.id)}/episodes?season=${seasonNum}`
      );
      const data = await res.json();
      if (res.ok && data?.success && data?.details) {
        setSelectedCatalaSeries(data.details);
      }
    } catch {
      // Keep shell
    } finally {
      setLoadingCatalaEpisodes(false);
    }
  }, []);

  return {
    homeGenreId,
    homeProvider,
    homeSortBy,
    homeQuery,
    homeMovieResults,
    homeSeriesResults,
    loadingHomeSearch,
    homeShowcaseMovies,
    homeShowcaseSeries,
    heroSlideIndex,
    setHeroSlideIndex,
    setIsHeroHovered,
    movieSort,
    setMovieSort,
    movieGenre,
    setMovieGenre,
    setMoviePage,
    hasMoreMovies,
    movies,
    loadingMovies,
    loadingMoreMovies,
    seriesSort,
    setSeriesSort,
    seriesGenre,
    setSeriesGenre,
    seriesLangMode,
    setSeriesLangMode,
    setSeriesPage,
    hasMoreSeries,
    seriesList,
    loadingSeries,
    loadingMoreSeries,
    debouncedYtQuery,
    setYtQuery,
    setDebouncedYtQuery,
    ytResults,
    loadingYt,
    cineSpecialPortal,
    setCineSpecialPortal,
    cineFiltersOpen,
    setCineFiltersOpen,
    cineAudioOverride,
    setCineAudioOverride,
    catalaItems,
    loadingCatala,
    selectedCatalaSeries,
    setSelectedCatalaSeries,
    loadingCatalaEpisodes,
    openCatalaSeriesDetails,
  };
}
