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
import type { RoomGameInviteType } from '../shared/protocol';
import type { CatalogMovie, SpanishTdtChannel, SportsMatch, TvSeriesDetails } from '../types';

interface UseDeepLinkRouterOptions {
  sessionMode: SessionMode;
  hasEnteredApp: boolean;
  isTvMode: boolean;
  isTvPairLobby: boolean;
  isAdsPageOpen: boolean;
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
  enterWorld,
  setForcedOpenGame,
  setIsInActiveGame,
  handlePlayTdtChannel,
  handlePlaySportsMatch,
  quickPool,
}: UseDeepLinkRouterOptions) {
  const [deepLinkResolving, setDeepLinkResolving] = useState<boolean>(false);
  const lastResolvedRouteKeyRef = useRef<string>('');
  const quickPoolRef = useRef(quickPool);
  quickPoolRef.current = quickPool;

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
      const target: AppRouteTarget = parseAppRoute(pathname, search);
      if (target.kind === 'home' || target.kind === 'system' || target.kind === 'room') {
        if (target.kind === 'system' && target.systemType === 'kids') {
          enterWorld('kids');
        }
        return;
      }

      const routeKey = `${pathname}${search}`;
      if (lastResolvedRouteKeyRef.current === routeKey) return;
      lastResolvedRouteKeyRef.current = routeKey;

      const store = useAppStore.getState();

      if (target.kind === 'world') {
        if (target.cineTab) store.setCineTab(target.cineTab);
        if (typeof target.cineCastellano === 'boolean') store.setCineCastellano(target.cineCastellano);
        if (target.futbolTab) store.setFutbolTab(target.futbolTab);
        enterWorld(target.world);
        return;
      }

      if (target.kind === 'pack') {
        store.setTvRegion(target.pack.tvRegion);
        store.setTdtCategory(target.pack.tdtCategory);
        store.setAdrarCountryFilter(target.pack.adrarCountryFilter || 'all');
        if (target.pack.footballLiveBrand) {
          store.setFootballLiveBrand(target.pack.footballLiveBrand);
        }
        enterWorld('tv');
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
        enterWorld('futbol');
        return;
      }

      if (target.kind === 'game') {
        const normalized = normalizeDeepLinkGameType(target.gameId);
        enterWorld('juegos');
        if (normalized) {
          setForcedOpenGame({ gameType: normalized, seq: Date.now() });
          setIsInActiveGame(true);
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
            enterWorld('cine');
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
            enterWorld('tv');
            setDeepLinkResolving(false);
            void handlePlayTdtChannel(localTdt, 0);
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
            enterWorld('cine');
          } else if (target.kind === 'series') {
            store.setCineTab('series');
            enterWorld('cine');
          } else if (target.kind === 'channel') {
            enterWorld('tv');
          } else if (target.kind === 'match') {
            enterWorld('futbol');
          }
          showAppShareToast('No encontramos ese enlace exacto; te mostramos el catálogo relacionado.');
          return;
        }

        if (data.kind === 'movie' && data.movie) {
          store.setCineTab('movies');
          enterWorld('cine');
          store.setRequestedMovieModal(data.movie as CatalogMovie);
          return;
        }

        if (data.kind === 'series' && data.series) {
          store.setCineTab('series');
          enterWorld('cine');
          store.setRequestedSeriesModal({
            series: data.series as TvSeriesDetails,
            season: data.requestedSeason,
            episode: data.requestedEpisode,
          });
          return;
        }

        if (data.kind === 'channel' && data.channel) {
          enterWorld('tv');
          await handlePlayTdtChannel(data.channel as SpanishTdtChannel, 0);
          return;
        }

        if (data.kind === 'match' && data.match) {
          enterWorld('futbol');
          const m = data.match as SportsMatch;
          store.setRequestedMatchSlug(target.kind === 'match' ? target.matchIdOrSlug : m.id);
          if (m.channels && m.channels.length > 0 && m.isLive) {
            void handlePlaySportsMatch(m, 0);
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
      enterWorld,
      setForcedOpenGame,
      setIsInActiveGame,
      handlePlayTdtChannel,
      handlePlaySportsMatch,
    ]
  );

  // Initial route resolution on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    void resolveAndApplyRoute(window.location.pathname, window.location.search);
  }, [resolveAndApplyRoute]);

  // Re-resolve on browser back/forward navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
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
    if (isTvMode || isTvPairLobby || isAdsPageOpen || deepLinkResolving) return;
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
    } else if (activeWorld === 'kids') {
      nextRoute = '/kids';
    } else {
      // On entry home, preserve active deep-linked channel/series path only if navigating back explicitly from home?
      // When user explicitly returns to Entry Home in Solo mode, update URL cleanly to '/'
      nextRoute = '/';
    }

    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== nextRoute) {
      window.history.replaceState({}, '', nextRoute);
    }
  }, [
    sessionMode,
    hasEnteredApp,
    isTvMode,
    isTvPairLobby,
    isAdsPageOpen,
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

  return {
    deepLinkResolving,
  };
}
