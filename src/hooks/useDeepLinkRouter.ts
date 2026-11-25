import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildCanonicalRoute,
  FOOTBALL_SCOPE_MAP,
  parseAppRoute,
  resolveActiveTvPackSlug,
  slugify,
  type AppRouteTarget,
} from '../shared/dedicatedRoutes';
import { useAppStore, type SessionMode, type WorldId } from '../store/useAppStore';
import { normalizeDeepLinkGameType } from '../utils/appSessionHelpers';
import { showAppShareToast } from '../utils/shareDedicatedLink';
import { getLastBackPopHandledAt } from '../lib/backInterceptor';
import type { RoomGameInviteType } from '../shared/protocol';
import type { CatalogMovie, SpanishTdtChannel, SportsMatch, TvSeriesDetails } from '../types';
import { getXtreamProviderUiSpecByWorld } from '../config/defaultProviders';

interface UseDeepLinkRouterOptions {
  sessionMode: SessionMode;
  hasEnteredApp: boolean;
  isTvMode: boolean;
  isTvPairLobby: boolean;
  isAdsPageOpen: boolean;
  isAdminPage?: boolean;
  setIsAdminPage?: (open: boolean) => void;
  isSamsungPage?: boolean;
  setIsSamsungPage?: (open: boolean) => void;
  isWebOsPage?: boolean;
  setIsWebOsPage?: (open: boolean) => void;
  enterWorld: (world: WorldId) => void;
  setForcedOpenGame: React.Dispatch<
    React.SetStateAction<{ gameType: RoomGameInviteType; seq: number } | null>
  >;
  setIsInActiveGame: React.Dispatch<React.SetStateAction<boolean>>;
  handlePlayTdtChannel: (tdtCh: SpanishTdtChannel, signalIndex?: number) => Promise<void>;
  handlePlaySportsMatch: (match: SportsMatch, channelIndex: number) => Promise<void>;
  quickPool: {
    movies: CatalogMovie[];
    series: CatalogMovie[];
    tdt: SpanishTdtChannel[];
  };
}

export function useDeepLinkRouter({
  sessionMode,
  hasEnteredApp,
  isTvMode,
  isTvPairLobby,
  isAdsPageOpen,
  isAdminPage = false,
  setIsAdminPage,
  isSamsungPage = false,
  setIsSamsungPage,
  isWebOsPage = false,
  setIsWebOsPage,
  enterWorld,
  setForcedOpenGame,
  setIsInActiveGame,
  handlePlayTdtChannel,
  handlePlaySportsMatch,
  quickPool,
}: UseDeepLinkRouterOptions) {
  const [deepLinkResolving, setDeepLinkResolving] = useState<boolean>(false);
  const lastResolvedRouteKeyRef = useRef<string>('');
  const lastObservedHrefRef = useRef<string>(
    typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : ''
  );
  const quickPoolRef = useRef(quickPool);
  quickPoolRef.current = quickPool;
  const enterWorldRef = useRef(enterWorld);
  enterWorldRef.current = enterWorld;
  const isAdminPageRef = useRef(isAdminPage);
  isAdminPageRef.current = isAdminPage;
  const setIsAdminPageRef = useRef(setIsAdminPage);
  setIsAdminPageRef.current = setIsAdminPage;
  const isSamsungPageRef = useRef(isSamsungPage);
  isSamsungPageRef.current = isSamsungPage;
  const setIsSamsungPageRef = useRef(setIsSamsungPage);
  setIsSamsungPageRef.current = setIsSamsungPage;
  const isWebOsPageRef = useRef(isWebOsPage);
  isWebOsPageRef.current = isWebOsPage;
  const setIsWebOsPageRef = useRef(setIsWebOsPage);
  setIsWebOsPageRef.current = setIsWebOsPage;
  const setForcedOpenGameRef = useRef(setForcedOpenGame);
  setForcedOpenGameRef.current = setForcedOpenGame;
  const setIsInActiveGameRef = useRef(setIsInActiveGame);
  setIsInActiveGameRef.current = setIsInActiveGame;
  const handlePlayTdtChannelRef = useRef(handlePlayTdtChannel);
  handlePlayTdtChannelRef.current = handlePlayTdtChannel;
  const handlePlaySportsMatchRef = useRef(handlePlaySportsMatch);
  handlePlaySportsMatchRef.current = handlePlaySportsMatch;

  const activeWorld = useAppStore((s) => s.activeWorld);
  const cineTab = useAppStore((s) => s.cineTab);
  const cineCastellano = useAppStore((s) => s.cineCastellano);
  const futbolTab = useAppStore((s) => s.futbolTab);
  const tvRegion = useAppStore((s) => s.tvRegion);
  const tdtCategory = useAppStore((s) => s.tdtCategory);
  const adrarCountryFilter = useAppStore((s) => s.adrarCountryFilter);
  const futbolLeagueFilter = useAppStore((s) => s.futbolLeagueFilter);
  const futbolSearchQuery = useAppStore((s) => s.futbolSearchQuery);
  const futbolDayOffset = useAppStore((s) => s.futbolDayOffset);
  const futbolStatusTab = useAppStore((s) => s.futbolStatusTab);
  const requestedMovieModal = useAppStore((s) => s.requestedMovieModal);
  const requestedSeriesModal = useAppStore((s) => s.requestedSeriesModal);
  const requestedMatchSlug = useAppStore((s) => s.requestedMatchSlug);

  const resolveAndApplyRoute = useCallback(
    async (pathname: string, search: string) => {
      if (isTvMode || isTvPairLobby || isAdsPageOpen) return;
      const routeKey = `${pathname}${search}`;
      if (lastResolvedRouteKeyRef.current === routeKey) return;
      lastResolvedRouteKeyRef.current = routeKey;

      const target: AppRouteTarget = parseAppRoute(pathname, search);
      if (target.kind === 'system' && target.systemType === 'admin') {
        setIsAdminPageRef.current?.(true);
        setIsSamsungPageRef.current?.(false);
        setIsWebOsPageRef.current?.(false);
        return;
      }
      if (target.kind === 'system' && target.systemType === 'samsung') {
        setIsSamsungPageRef.current?.(true);
        setIsAdminPageRef.current?.(false);
        setIsWebOsPageRef.current?.(false);
        return;
      }
      if (target.kind === 'system' && target.systemType === 'webos') {
        setIsWebOsPageRef.current?.(true);
        setIsAdminPageRef.current?.(false);
        setIsSamsungPageRef.current?.(false);
        return;
      }
      if (isAdminPageRef.current) {
        setIsAdminPageRef.current?.(false);
      }
      if (isSamsungPageRef.current) {
        setIsSamsungPageRef.current?.(false);
      }
      if (isWebOsPageRef.current) {
        setIsWebOsPageRef.current?.(false);
      }
      if (target.kind === 'home' || target.kind === 'system' || target.kind === 'room') {
        return;
      }

      const store = useAppStore.getState();

      if (target.kind === 'world') {
        if (target.cineTab) store.setCineTab(target.cineTab);
        if (typeof target.cineCastellano === 'boolean') store.setCineCastellano(target.cineCastellano);
        if (target.futbolTab) store.setFutbolTab(target.futbolTab);
        enterWorldRef.current(target.world);
        if (target.world === 'music' && (target.musicTrackParam || target.musicQuery)) {
          void Promise.all([
            import('../store/useMusicStore'),
            import('../utils/musicDedupe'),
          ])
            .then(async ([{ useMusicStore }, { decodeMusicTrackShare }]) => {
              const musicState = useMusicStore.getState();
              if (target.musicTrackParam) {
                const decoded = decodeMusicTrackShare(target.musicTrackParam);
                if (decoded) {
                  musicState.playTrack(decoded);
                  musicState.setShowNowPlayingModal(true);
                  return;
                }
                const res = await fetch(
                  `/api/music/search?q=${encodeURIComponent(target.musicTrackParam)}`
                )
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null);
                const firstTrack = Array.isArray(res?.tracks) ? res.tracks[0] : null;
                if (firstTrack) {
                  musicState.playTrack(firstTrack, res.tracks);
                  musicState.setShowNowPlayingModal(true);
                }
                return;
              }
              if (target.musicQuery) {
                musicState.clearMusicDetailStack();
                musicState.setMusicNavTab('search');
                musicState.setMusicSearchQuery(target.musicQuery);
                const res = await fetch(
                  `/api/music/search?q=${encodeURIComponent(target.musicQuery)}`
                )
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null);
                if (res && Array.isArray(res.tracks)) {
                  musicState.setMusicSearchResults({
                    tracks: res.tracks || [],
                    albums: res.albums || [],
                    artists: res.artists || [],
                    playlists: res.playlists || [],
                    radios: res.radios || [],
                  });
                }
              }
            })
            .catch(() => undefined);
        }
        return;
      }

      if (target.kind === 'pack') {
        store.setTvRegion(target.pack.tvRegion);
        store.setTdtCategory(target.pack.tdtCategory);
        store.setAdrarCountryFilter(target.pack.adrarCountryFilter || 'all');
        if (target.pack.footballLiveBrand) {
          store.setFootballLiveBrand(target.pack.footballLiveBrand);
        }
        enterWorldRef.current('tv');
        return;
      }

      if (target.kind === 'footballScope') {
        const cfg = target.config;
        store.setFutbolTab(cfg.futbolTab || 'matches');
        store.setFutbolDayOffset(cfg.dayOffset ?? 0);
        store.setFutbolStatusTab(cfg.statusTab || 'all');
        store.setFutbolLeagueFilter(cfg.leagueFilter || 'all');
        store.setFutbolSearchQuery(cfg.searchQuery || '');
        if (cfg.brandFilter) store.setFootballLiveBrand(cfg.brandFilter);
        enterWorldRef.current('futbol');
        return;
      }

      if (target.kind === 'game') {
        const normalized = normalizeDeepLinkGameType(target.gameId);
        enterWorldRef.current('juegos');
        if (normalized) {
          setForcedOpenGameRef.current({ gameType: normalized, seq: Date.now() });
          setIsInActiveGameRef.current(true);
        }
        return;
      }

      // Dynamic entities: movie, series, channel, match
      setDeepLinkResolving(true);
      try {
        // Fast local match check for movie / series / channel before network
        if (target.kind === 'movie' && target.tmdbId) {
          const localMovie = quickPoolRef.current.movies.find(
            (m) => m.tmdbId && m.tmdbId === target.tmdbId
          );
          if (localMovie) {
            store.setCineTab('movies');
            enterWorldRef.current('cine');
            store.setRequestedMovieModal(localMovie);
            setDeepLinkResolving(false);
            return;
          }
        }

        if (target.kind === 'channel') {
          const targetSlug = target.channelSlug;
          const targetAliasId = target.channelIdAlias;
          const localTdt = quickPoolRef.current.tdt.find(
            (ch) =>
              (targetAliasId && ch.id.toLowerCase() === targetAliasId) ||
              slugify(ch.name) === targetSlug ||
              slugify(ch.id) === targetSlug
          );
          if (localTdt) {
            enterWorldRef.current('tv');
            setDeepLinkResolving(false);
            void handlePlayTdtChannelRef.current(localTdt, 0);
            return;
          }
        }

        const res = await fetch(
          `/api/resolve-link?path=${encodeURIComponent(`${pathname}${search}`)}`
        );
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.found) {
          if (target.kind === 'movie') {
            store.setCineTab('movies');
            enterWorldRef.current('cine');
          } else if (target.kind === 'series') {
            store.setCineTab('series');
            enterWorldRef.current('cine');
          } else if (target.kind === 'channel') {
            enterWorldRef.current('tv');
          } else if (target.kind === 'match') {
            enterWorldRef.current('futbol');
          }
          showAppShareToast('No encontramos ese enlace exacto; te mostramos el catálogo relacionado.');
          return;
        }

        if (data.kind === 'movie' && data.movie) {
          store.setCineTab('movies');
          enterWorldRef.current('cine');
          store.setRequestedMovieModal(data.movie as CatalogMovie);
          return;
        }

        if (data.kind === 'series' && data.series) {
          store.setCineTab('series');
          enterWorldRef.current('cine');
          store.setRequestedSeriesModal({
            series: data.series as TvSeriesDetails,
            season: data.requestedSeason,
            episode: data.requestedEpisode,
          });
          return;
        }

        if (data.kind === 'channel' && data.channel) {
          enterWorldRef.current('tv');
          await handlePlayTdtChannelRef.current(data.channel as SpanishTdtChannel, 0);
          return;
        }

        if (data.kind === 'match' && data.match) {
          enterWorldRef.current('futbol');
          const m = data.match as SportsMatch;
          store.setRequestedMatchSlug(target.kind === 'match' ? target.matchIdOrSlug : m.id);
          if (m.channels && m.channels.length > 0 && m.isLive) {
            void handlePlaySportsMatchRef.current(m, 0);
          }
        }
      } catch {
        // fail gracefully without breaking shell
      } finally {
        setDeepLinkResolving(false);
      }
    },
    [
      isTvMode,
      isTvPairLobby,
      isAdsPageOpen,
    ]
  );

  // Initial route resolution on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    lastObservedHrefRef.current = `${window.location.pathname}${window.location.search}`;
    void resolveAndApplyRoute(window.location.pathname, window.location.search);
  }, [resolveAndApplyRoute]);

  // Re-resolve on browser back/forward navigation only when URL actually changed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      if (Date.now() - getLastBackPopHandledAt() < 120) return;
      const nextHref = `${window.location.pathname}${window.location.search}`;
      if (nextHref === lastObservedHrefRef.current) return;
      lastObservedHrefRef.current = nextHref;
      lastResolvedRouteKeyRef.current = '';
      void resolveAndApplyRoute(window.location.pathname, window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [resolveAndApplyRoute]);

  // Bidirectional URL synchronization while navigating in Solo mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionMode !== 'solo' || !hasEnteredApp) return;
    if (isTvMode || isTvPairLobby || isAdsPageOpen || isAdminPage || isSamsungPage || isWebOsPage || deepLinkResolving) return;
    if (requestedMovieModal || requestedSeriesModal || requestedMatchSlug) return;

    let nextRoute = '/';
    if (activeWorld === 'cine') {
      nextRoute = buildCanonicalRoute({
        kind: 'world',
        world: 'cine',
        cineTab,
        cineCategory: !cineCastellano && cineTab === 'movies' ? 'vose' : undefined,
      });
    } else if (activeWorld === 'tv') {
      const packSlug = resolveActiveTvPackSlug({
        tvRegion,
        tdtCategory,
        adrarCountryFilter,
      });
      nextRoute = packSlug
        ? buildCanonicalRoute({ kind: 'pack', packSlug })
        : '/directo';
    } else if (activeWorld === 'futbol') {
      if (futbolTab === 'channels') {
        nextRoute = '/futbol/canales';
      } else {
        let matchedScope: string | undefined;
        if (futbolDayOffset === 1) matchedScope = 'manana';
        else if (futbolDayOffset === -1) matchedScope = 'ayer';
        else if (futbolStatusTab === 'live') matchedScope = 'en-vivo';
        else if (futbolLeagueFilter && futbolLeagueFilter !== 'all') {
          const found = Object.values(FOOTBALL_SCOPE_MAP).find(
            (cfg) => cfg.leagueFilter === futbolLeagueFilter
          );
          if (found) matchedScope = found.scope;
        } else if (futbolSearchQuery.trim()) {
          const cleanQ = slugify(futbolSearchQuery);
          if (FOOTBALL_SCOPE_MAP[cleanQ]) matchedScope = FOOTBALL_SCOPE_MAP[cleanQ].scope;
        }
        nextRoute = matchedScope
          ? buildCanonicalRoute({ kind: 'footballScope', scope: matchedScope })
          : '/futbol';
      }
    } else if (activeWorld === 'juegos') {
      nextRoute = '/juegos';
    } else if (activeWorld === 'youtube') {
      nextRoute = '/youtube';
    } else if (activeWorld === 'clipbox') {
      nextRoute = '/clipbox';
    } else if (activeWorld === 'rbtv') {
      nextRoute = '/rbtv';
    } else if (activeWorld === 'belix') {
      nextRoute = '/belix';
    } else if (activeWorld === 'danaactive') {
      nextRoute = '/dana-active';
    } else if (activeWorld === 'atresplayer') {
      nextRoute = '/atresplayer';
    } else if (activeWorld === 'movistardazn') {
      nextRoute = '/movistar-dazn';
    } else if (activeWorld === 'champions') {
      nextRoute = '/champions';
    } else if (activeWorld === 'music') {
      nextRoute = '/musica';
    } else if (activeWorld === 'providers') {
      nextRoute = '/catalogo-total';
    } else if (activeWorld === 'reels') {
      nextRoute = '/clips';
    } else {
      const xtSpec = getXtreamProviderUiSpecByWorld(activeWorld);
      // On entry home, preserve active deep-linked channel/series path only if navigating back explicitly from home?
      // When user explicitly returns to Entry Home in Solo mode, update URL cleanly to '/'
      nextRoute = xtSpec ? `/${xtSpec.slug}` : '/';
    }

    const currentFull = `${window.location.pathname}${window.location.search}`;
    const hasMusicDeepQuery =
      activeWorld === 'music' &&
      (window.location.search.includes('install=music') ||
        window.location.search.includes('track=') ||
        window.location.search.includes('musicq=') ||
        window.location.search.includes('view=') ||
        window.location.search.includes('import=') ||
        window.location.search.includes('url='));
    if (currentFull !== nextRoute && !hasMusicDeepQuery) {
      lastObservedHrefRef.current = nextRoute;
      window.history.replaceState(window.history.state, '', nextRoute);
    }
  }, [
    sessionMode,
    hasEnteredApp,
    isTvMode,
    isTvPairLobby,
    isAdsPageOpen,
    isAdminPage,
    isSamsungPage,
    isWebOsPage,
    deepLinkResolving,
    requestedMovieModal,
    requestedSeriesModal,
    requestedMatchSlug,
    activeWorld,
    cineTab,
    cineCastellano,
    tvRegion,
    tdtCategory,
    adrarCountryFilter,
    futbolTab,
    futbolLeagueFilter,
    futbolSearchQuery,
    futbolDayOffset,
    futbolStatusTab,
  ]);

  // Keep PWA manifest, iOS Safari apple-touch-icon, and browser theme synced with Riffan Music vs RiffanTV
  useEffect(() => {
    if (typeof document === 'undefined' || isTvMode || isTvPairLobby) return;
    const isMusic = activeWorld === 'music';

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.setAttribute(
        'href',
        isMusic ? '/music-manifest.webmanifest' : '/manifest.webmanifest'
      );
    }

    const appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleTouchIcon) {
      appleTouchIcon.setAttribute(
        'href',
        isMusic ? '/music-apple-touch-icon.png' : '/apple-touch-icon.png'
      );
    }

    const svgIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (svgIcon) {
      svgIcon.setAttribute('href', isMusic ? '/music-icon.svg' : '/icon.svg');
    }

    const appleTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]'
    );
    if (appleTitle) {
      appleTitle.setAttribute('content', isMusic ? 'Riffan Music' : 'RiffanTV');
    }

    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', isMusic ? '#05080D' : '#060608');
    }

    if (isMusic) {
      document.title = 'Riffan Music — Audio 8D, Letras y Radios';
    } else if (document.title.startsWith('Riffan Music')) {
      document.title = 'RiffanTV';
    }
  }, [activeWorld, isTvMode, isTvPairLobby]);

  return {
    deepLinkResolving,
  };
}
