import { useEffect } from 'react';
import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';
import type {
  AppLanguage,
  CatalaCatalogItem,
  CatalogMovie,
  FootballMatchboardItem,
  LiveScoreMatch,
  SpanishTdtChannel,
  SportsMatch,
  YouTubeSearchItem,
} from '../types';
import type { ProvidersStatusSummaryPublic } from '../components/providers/providersTypes';
import type { PlaybackPriorityMode } from '../store/useAppStore';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 20 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  },
});

export const catalogQueryKeys = {
  liveScores: () => ['sports', 'live-scores'] as const,
  footballBoard: (lang: string) => ['sports', 'football-board-home', lang] as const,
  latestReleases: (lang: string) => ['catalog', 'latest-releases', lang] as const,
  collections: (lang: string) => ['catalog', 'collections', lang] as const,
  discover: (params: {
    mediaType: string;
    genreId: number | string;
    provider: string;
    sort: string;
    lang: string;
    page: number;
  }) => ['catalog', 'discover', params] as const,
  moviesPage: (params: {
    endpoint: 'bingetrix' | 'movies';
    category: string;
    sort: string;
    page: number;
    query: string;
  }) => ['catalog', 'movies-page', params] as const,
  seriesPage: (params: {
    category: string;
    sort: string;
    page: number;
    lang: string;
    query: string;
  }) => ['catalog', 'series-page', params] as const,
  catala: (query: string) => ['catalog', 'catala', query] as const,
  youtube: (query: string) => ['catalog', 'youtube', query] as const,
  tdtBase: (priority: PlaybackPriorityMode = 'es_quality') =>
    ['catalog', 'tdt-base', priority] as const,
  epgLive: () => ['catalog', 'epg-live'] as const,
  providersStatus: () => ['providers', 'status'] as const,
  providersCatalog: (params: Record<string, string | number>) =>
    ['providers', 'catalog', params] as const,
  musicHome: () => ['music', 'home'] as const,
  musicRadios: () => ['music', 'radios'] as const,
};

let sharedPushSource: EventSource | null = null;
let sharedPushSubscribers = 0;
let sharedPushConnected = false;

function useLiveCatalogPush(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return undefined;
    }
    sharedPushSubscribers += 1;
    if (!sharedPushSource) {
      try {
        const es = new EventSource('/api/events/stream');
        es.addEventListener('connected', () => {
          sharedPushConnected = true;
        });
        es.addEventListener('scores:update', () => {
          void queryClient.invalidateQueries({ queryKey: ['sports', 'live-scores'] });
        });
        es.addEventListener('football-board:update', () => {
          void queryClient.invalidateQueries({ queryKey: ['sports', 'football-board-home'] });
        });
        es.onerror = () => {
          sharedPushConnected = false;
        };
        sharedPushSource = es;
      } catch {
        sharedPushConnected = false;
      }
    }

    return () => {
      sharedPushSubscribers = Math.max(0, sharedPushSubscribers - 1);
      if (sharedPushSubscribers === 0 && sharedPushSource) {
        sharedPushSource.close();
        sharedPushSource = null;
        sharedPushConnected = false;
      }
    };
  }, [enabled]);
}

export async function fetchLiveScoresData(): Promise<LiveScoreMatch[]> {
  const res = await fetch('/api/sports/scores');
  if (!res.ok) throw new Error('Failed to load scores');
  const data = await res.json();
  return Array.isArray(data?.scores) ? data.scores : [];
}

export async function fetchFootballBoardData(lang = 'es'): Promise<SportsMatch[]> {
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(new Date())
    .replace(/-/g, '');
  const res = await fetch(
    `/api/sports/football-board?date=${dateKey}&lang=${encodeURIComponent(lang)}`
  );
  if (!res.ok) throw new Error('Failed to load football board');
  const data = await res.json();
  const rawItems: FootballMatchboardItem[] = Array.isArray(data?.matches) ? data.matches : [];
  return rawItems.map((item) => ({
    id: item.id,
    title: `${item.homeTeam} vs ${item.awayTeam}`,
    competition: item.groupTitle,
    sport: 'soccer',
    time:
      item.statusState === 'live'
        ? item.statusLabel || 'EN VIVO'
        : item.kickoffTime,
    isLive: item.statusState === 'live',
    is247Channel: false,
    channels: item.channels || [],
    matchMeta: {
      eventId: item.eventId,
      fotmobMatchId: item.fotmobMatchId,
      leagueSlug: item.leagueSlug,
      leagueName: item.leagueName,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      homeShort: item.homeShort,
      awayShort: item.awayShort,
      homeLogo: item.homeLogo,
      awayLogo: item.awayLogo,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      statusState: item.statusState,
      statusLabel: item.statusLabel,
      kickoffMs: item.kickoffMs,
      kickoffIso: item.kickoffIso,
      kickoffTime: item.kickoffTime,
      spanishBroadcaster: item.spanishBroadcaster,
      verifiedTvGuide: item.verifiedTvGuide,
    },
  }));
}

export function useLiveScoresQuery(enabled = true) {
  useLiveCatalogPush(enabled);
  return useQuery<LiveScoreMatch[]>({
    queryKey: catalogQueryKeys.liveScores(),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: () => {
      if (!enabled) return false;
      return sharedPushConnected ? 120_000 : 45_000;
    },
    queryFn: fetchLiveScoresData,
  });
}

export function useFootballBoardQuery(enabled = true, lang = 'es') {
  useLiveCatalogPush(enabled);
  return useQuery<SportsMatch[]>({
    queryKey: catalogQueryKeys.footballBoard(lang),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      if (!enabled) return false;
      const matches = query.state.data;
      if (Array.isArray(matches)) {
        const now = Date.now();
        const nearOrLiveFeatured = matches.some((m) => {
          const home = String(m.matchMeta?.homeTeam || '').toLowerCase();
          const away = String(m.matchMeta?.awayTeam || '').toLowerCase();
          const isFeatured =
            home === 'barcelona' ||
            home === 'fc barcelona' ||
            home === 'real madrid' ||
            away === 'barcelona' ||
            away === 'fc barcelona' ||
            away === 'real madrid';
          if (!isFeatured) return false;
          if (m.matchMeta?.statusState === 'live' || m.isLive) return true;
          const k = Number(m.matchMeta?.kickoffMs || 0);
          return k > 0 && k - now <= 15 * 60 * 1000 && k - now >= -150 * 60 * 1000;
        });
        if (nearOrLiveFeatured) return sharedPushConnected ? 45_000 : 25_000;
      }
      return sharedPushConnected ? 120_000 : 60_000;
    },
    queryFn: () => fetchFootballBoardData(lang),
  });
}

export interface LatestReleasesResponse {
  cinemaReleases: CatalogMovie[];
  newSeasons: CatalogMovie[];
}

export async function fetchLatestReleasesData(lang: string): Promise<LatestReleasesResponse> {
  const res = await fetch(`/api/catalog/latest-releases?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error('Failed to load latest releases');
  const data = await res.json();
  return {
    cinemaReleases: Array.isArray(data?.cinemaReleases) ? data.cinemaReleases : [],
    newSeasons: Array.isArray(data?.newSeasons) ? data.newSeasons : [],
  };
}

export function useLatestReleasesQuery(lang: AppLanguage, enabled = true) {
  return useQuery<LatestReleasesResponse>({
    queryKey: catalogQueryKeys.latestReleases(lang),
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchLatestReleasesData(lang),
  });
}

export interface EditorialCollectionPayload {
  id: string;
  titleEs: string;
  titleCa: string;
  titleEn: string;
  subtitleEs: string;
  subtitleCa: string;
  subtitleEn: string;
  mediaType: 'movie' | 'tv';
  items: CatalogMovie[];
}

export interface CollectionsResponse {
  collections: EditorialCollectionPayload[];
  genres: Array<{
    id: number;
    slug: string;
    es: string;
    ca: string;
    en: string;
    mediaType: 'movie' | 'tv' | 'both';
  }>;
}

export async function fetchEditorialCollectionsData(lang: string): Promise<CollectionsResponse> {
  const res = await fetch(`/api/catalog/collections?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error('Failed to load collections');
  const data = await res.json();
  return {
    collections: Array.isArray(data?.collections) ? data.collections : [],
    genres: Array.isArray(data?.genres) ? data.genres : [],
  };
}

export function useEditorialCollectionsQuery(lang: AppLanguage, enabled = true) {
  return useQuery<CollectionsResponse>({
    queryKey: catalogQueryKeys.collections(lang),
    enabled,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchEditorialCollectionsData(lang),
  });
}

export interface CatalogMoviesPageResponse {
  movies: CatalogMovie[];
  hasMore: boolean;
}

export async function fetchCatalogMoviesPageData(params: {
  endpoint: 'bingetrix' | 'movies';
  category: string;
  sort: string;
  page: number;
  query: string;
}): Promise<CatalogMoviesPageResponse> {
  const url =
    params.endpoint === 'bingetrix'
      ? `/api/catalog/bingetrix?provider=all&category=${encodeURIComponent(
          params.category
        )}&sort=${encodeURIComponent(params.sort)}&page=${params.page}&query=${encodeURIComponent(
          params.query
        )}`
      : `/api/catalog/movies?provider=all&category=${encodeURIComponent(
          params.category
        )}&sort=${encodeURIComponent(params.sort)}&page=${params.page}&query=${encodeURIComponent(
          params.query
        )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load movies');
  const data = await res.json();
  const list: CatalogMovie[] = Array.isArray(data?.movies)
    ? data.movies
    : Array.isArray(data?.items)
    ? data.items
    : [];
  return {
    movies: list,
    hasMore: Boolean(data?.hasMore),
  };
}

export interface CatalogSeriesPageResponse {
  series: CatalogMovie[];
  hasMore: boolean;
}

export async function fetchCatalogSeriesPageData(params: {
  category: string;
  sort: string;
  page: number;
  lang: string;
  query: string;
}): Promise<CatalogSeriesPageResponse> {
  const res = await fetch(
    `/api/catalog/series?provider=all&category=${encodeURIComponent(
      params.category
    )}&sort=${encodeURIComponent(params.sort)}&page=${params.page}&lang=${encodeURIComponent(
      params.lang
    )}&query=${encodeURIComponent(params.query)}`
  );
  if (!res.ok) throw new Error('Failed to load series');
  const data = await res.json();
  const rawList: CatalogMovie[] = Array.isArray(data?.series)
    ? data.series
    : Array.isArray(data?.items)
    ? data.items
    : [];
  return {
    series: rawList.map((it) => ({ ...it, mediaType: 'tv' as const })),
    hasMore: Boolean(data?.hasMore),
  };
}

export async function fetchCatalaCatalogData(query: string): Promise<CatalaCatalogItem[]> {
  const params = new URLSearchParams({ category: 'all', query });
  const res = await fetch(`/api/catalog/catala?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to load catala catalog');
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

export async function fetchYouTubeCatalogData(query: string): Promise<YouTubeSearchItem[]> {
  const res = await fetch(`/api/catalog/youtube?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to load YouTube catalog');
  const data = await res.json();
  return Array.isArray(data?.videos) ? data.videos : [];
}

export async function fetchTdtBaseCatalogData(
  priorityOrCtx: PlaybackPriorityMode | { queryKey?: readonly unknown[] } = 'es_quality'
): Promise<SpanishTdtChannel[]> {
  const priority: PlaybackPriorityMode =
    typeof priorityOrCtx === 'string'
      ? priorityOrCtx
      : priorityOrCtx?.queryKey?.[2] === 'best_quality'
      ? 'best_quality'
      : 'es_quality';
  const res = await fetch(`/api/catalog/tdt?priority=${encodeURIComponent(priority)}`);
  if (!res.ok) throw new Error('Failed to load TDT catalog');
  const data = await res.json();
  return Array.isArray(data?.channels) ? data.channels : [];
}

export async function fetchProvidersStatusData(): Promise<
  (ProvidersStatusSummaryPublic & { success?: boolean }) | null
> {
  const res = await fetch('/api/providers/status');
  const json = (await res.json().catch(() => null)) as
    | (ProvidersStatusSummaryPublic & { success?: boolean })
    | null;
  if (!res.ok || !json?.success) return null;
  return json;
}

export function useProvidersStatusQuery(enabled = true) {
  return useQuery<(ProvidersStatusSummaryPublic & { success?: boolean }) | null>({
    queryKey: catalogQueryKeys.providersStatus(),
    enabled,
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.providers?.some((p) => p.connecting)) return 2_000;
      return false;
    },
    queryFn: fetchProvidersStatusData,
  });
}

