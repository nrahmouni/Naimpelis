/**
 * @module worldPrefetch
 * @description Smart predictive prefetching for world JS chunks, React Query catalog data,
 * and the top 12–16 visible poster/logo artwork assets.
 */
import type { AppLanguage } from '../types';
import type { PrimaryWorldId, WorldId } from '../store/useAppStore';
import {
  catalogQueryKeys,
  fetchCatalogMoviesPageData,
  fetchCatalogSeriesPageData,
  fetchEditorialCollectionsData,
  fetchFootballBoardData,
  fetchLatestReleasesData,
  fetchLiveScoresData,
  fetchProvidersStatusData,
  fetchTdtBaseCatalogData,
  queryClient,
} from '../hooks/useCatalogQueries';
import { prefetchImageUrls } from './imageUrl';

const worldPrefetchStamp = new Map<string, number>();
const PREFETCH_COOLDOWN_MS = 45_000;

function isNetworkConstrained(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  return Boolean(nav.connection?.saveData || nav.connection?.effectiveType === '2g');
}

export function preloadWorldChunks(world: WorldId): void {
  const noop = () => {};
  if (world === 'cine') {
    void import('../components/MediaCatalogHub').catch(noop);
    void import('../components/catalog/CineWorldView').catch(noop);
    void import('../components/ExpandedDiscoverySection').catch(noop);
  } else if (world === 'futbol') {
    void import('../components/MediaCatalogHub').catch(noop);
    void import('../components/catalog/FootballWorldView').catch(noop);
    void import('../components/FootballMatchboard').catch(noop);
  } else if (world === 'tv') {
    void import('../components/MediaCatalogHub').catch(noop);
    void import('../components/catalog/LiveTvWorldView').catch(noop);
  } else if (world === 'youtube') {
    void import('../components/MediaCatalogHub').catch(noop);
    void import('../components/catalog/YouTubeWorldView').catch(noop);
  } else if (world === 'juegos') {
    void import('../components/GamesHubSection').catch(noop);
  } else if (world === 'clipbox') {
    void import('../components/clipbox/ClipBoxWorldView').catch(noop);
  } else if (world === 'rbtv') {
    void import('../components/rbtv/RbtvWorldView').catch(noop);
  } else if (world === 'belix') {
    void import('../components/belix/BelixWorldView').catch(noop);
  } else if (world === 'atresplayer') {
    void import('../components/atresplayer/AtresplayerWorldView').catch(noop);
  } else if (world === 'movistardazn') {
    void import('../components/movistardazn/DaznMovistarWorldView').catch(noop);
  } else if (world === 'music') {
    void import('../components/music/RiffanMusicWorldView').catch(noop);
  } else if (world === 'providers') {
    void import('../components/providers/ProvidersWorldView').catch(noop);
  } else if (world === 'reels') {
    void import('../components/reels/CineReelsWorldView').catch(noop);
  }
}

/**
 * Preloads JS chunks, React Query catalog data, and top 16 visible images for a target world.
 */
export function prefetchWorldExperience(world: WorldId, lang: AppLanguage = 'es'): void {
  if (typeof window === 'undefined') return;
  preloadWorldChunks(world);
  if (isNetworkConstrained()) return;

  const cacheKey = `${world}:${lang}`;
  const now = Date.now();
  const prev = worldPrefetchStamp.get(cacheKey) || 0;
  if (now - prev < PREFETCH_COOLDOWN_MS) return;
  worldPrefetchStamp.set(cacheKey, now);

  if (world === 'cine') {
    const apiLang = lang === 'en' ? 'en' : 'es';
    const movieKey = catalogQueryKeys.moviesPage({
      endpoint: 'movies',
      category: 'trending',
      sort: 'trending',
      page: 1,
      query: '',
    });
    const seriesKey = catalogQueryKeys.seriesPage({
      category: 'trending',
      sort: 'trending',
      page: 1,
      lang: apiLang,
      query: '',
    });

    void Promise.all([
      queryClient.prefetchQuery({
        queryKey: movieKey,
        staleTime: 10 * 60_000,
        queryFn: () =>
          fetchCatalogMoviesPageData({
            endpoint: 'movies',
            category: 'trending',
            sort: 'trending',
            page: 1,
            query: '',
          }),
      }),
      queryClient.prefetchQuery({
        queryKey: seriesKey,
        staleTime: 10 * 60_000,
        queryFn: () =>
          fetchCatalogSeriesPageData({
            category: 'trending',
            sort: 'trending',
            page: 1,
            lang: apiLang,
            query: '',
          }),
      }),
      queryClient.prefetchQuery({
        queryKey: catalogQueryKeys.latestReleases(lang),
        staleTime: 10 * 60_000,
        queryFn: () => fetchLatestReleasesData(lang),
      }),
      queryClient.prefetchQuery({
        queryKey: catalogQueryKeys.collections(lang),
        staleTime: 15 * 60_000,
        queryFn: () => fetchEditorialCollectionsData(lang),
      }),
    ]).then(() => {
      const mData = queryClient.getQueryData<{ movies?: Array<{ poster?: string; backdrop?: string }> }>(movieKey);
      const sData = queryClient.getQueryData<{ series?: Array<{ poster?: string }> }>(seriesKey);
      const lrData = queryClient.getQueryData<{
        cinemaReleases?: Array<{ poster?: string }>;
        newSeasons?: Array<{ poster?: string }>;
      }>(catalogQueryKeys.latestReleases(lang));
      const posterUrls = [
        ...(mData?.movies || []).slice(0, 8).map((m) => m.poster || m.backdrop),
        ...(sData?.series || []).slice(0, 4).map((s) => s.poster),
        ...(lrData?.cinemaReleases || []).slice(0, 4).map((m) => m.poster),
      ];
      prefetchImageUrls(posterUrls, { limit: 16, kind: 'poster' });
    });
  } else if (world === 'tv') {
    void queryClient
      .prefetchQuery({
        queryKey: catalogQueryKeys.tdtBase(),
        staleTime: 3 * 60_000,
        queryFn: fetchTdtBaseCatalogData,
      })
      .then(() => {
        const channels = queryClient.getQueryData<Array<{ logoUrl?: string }>>(
          catalogQueryKeys.tdtBase()
        );
        if (Array.isArray(channels)) {
          prefetchImageUrls(
            channels.slice(0, 16).map((c) => c.logoUrl),
            { limit: 16, kind: 'square' }
          );
        }
      });
  } else if (world === 'futbol') {
    void Promise.all([
      queryClient.prefetchQuery({
        queryKey: catalogQueryKeys.footballBoard(lang),
        staleTime: 30_000,
        queryFn: () => fetchFootballBoardData(lang),
      }),
      queryClient.prefetchQuery({
        queryKey: catalogQueryKeys.liveScores(),
        staleTime: 30_000,
        queryFn: fetchLiveScoresData,
      }),
    ]).then(() => {
      const matches = queryClient.getQueryData<
        Array<{ matchMeta?: { homeLogo?: string; awayLogo?: string } }>
      >(catalogQueryKeys.footballBoard(lang));
      if (Array.isArray(matches)) {
        const crests: Array<string | undefined> = [];
        for (const m of matches.slice(0, 8)) {
          crests.push(m.matchMeta?.homeLogo, m.matchMeta?.awayLogo);
        }
        prefetchImageUrls(crests, { limit: 16, kind: 'square' });
      }
    });
  } else if (world === 'providers') {
    void queryClient.prefetchQuery({
      queryKey: catalogQueryKeys.providersStatus(),
      staleTime: 2 * 60_000,
      queryFn: fetchProvidersStatusData,
    });
  } else if (world === 'music') {
    void queryClient.prefetchQuery({
      queryKey: catalogQueryKeys.musicHome(),
      staleTime: 10 * 60_000,
      queryFn: async () => {
        const res = await fetch('/api/music/home');
        return res.ok ? res.json() : null;
      },
    });
  }
}

/**
 * Predictively prefetches the most probable next world during browser idle time
 * based on the user's current world and `lastUsedWorld`.
 */
export function schedulePredictiveNextWorldPrefetch(
  activeWorld: WorldId,
  lastUsedWorld: PrimaryWorldId | null,
  lang: AppLanguage = 'es'
): () => void {
  if (typeof window === 'undefined' || isNetworkConstrained()) return () => {};

  let cancelled = false;
  const candidates: PrimaryWorldId[] = [];
  if (activeWorld === 'entry') {
    if (lastUsedWorld && lastUsedWorld !== 'sala') candidates.push(lastUsedWorld);
    if (!candidates.includes('cine')) candidates.push('cine');
    if (!candidates.includes('tv')) candidates.push('tv');
  } else if (activeWorld === 'cine') {
    candidates.push('tv', 'futbol');
  } else if (activeWorld === 'tv') {
    candidates.push('futbol', 'cine');
  } else if (activeWorld === 'futbol') {
    candidates.push('tv', 'cine');
  } else if (activeWorld === 'music') {
    candidates.push('cine');
  }

  const run = () => {
    if (cancelled) return;
    const primary = candidates[0];
    if (primary) prefetchWorldExperience(primary, lang);
    if (candidates[1]) preloadWorldChunks(candidates[1]);
  };

  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (win.requestIdleCallback) {
    const idleId = win.requestIdleCallback(run, { timeout: 1500 });
    return () => {
      cancelled = true;
      win.cancelIdleCallback?.(idleId);
    };
  }
  const timerId = window.setTimeout(run, 450);
  return () => {
    cancelled = true;
    window.clearTimeout(timerId);
  };
}
