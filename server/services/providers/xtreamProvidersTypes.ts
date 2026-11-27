export type ProviderMediaKind = 'live' | 'movie' | 'series';

export interface ProviderCategoryPublic {
  id: string;
  name: string;
  kind: ProviderMediaKind;
  count: number;
}

export interface ProviderCatalogItemPublic {
  id: string;
  providerId: string;
  providerName: string;
  kind: ProviderMediaKind;
  streamId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  lang: string;
  langLabel: string;
  quality: string;
  qualityTier: number;
  poster?: string;
  rating?: string;
  year?: string;
  plot?: string;
  containerExtension?: string;
  streamUrl: string;
}

export interface ProviderSeriesEpisodePublic {
  id: string;
  episodeNum: number;
  title: string;
  season: number;
  containerExtension: string;
  duration?: string;
  plot?: string;
  still?: string;
  streamUrl: string;
}

export interface ProviderSeriesSeasonPublic {
  seasonNumber: number;
  name: string;
  episodes: ProviderSeriesEpisodePublic[];
}

export interface ProviderSeriesDetailPublic {
  providerId: string;
  providerName?: string;
  seriesId: string;
  title?: string;
  name?: string;
  poster?: string;
  backdrop?: string;
  plot?: string;
  genre?: string;
  year?: string;
  rating?: string;
  seasons: ProviderSeriesSeasonPublic[];
}

export interface ProviderStatusPublic {
  id: string;
  name: string;
  accentColor: string;
  autoConnect: boolean;
  connected: boolean;
  connecting: boolean;
  accountCount: number;
  activeAccountSlot: number;
  liveCount: number;
  movieCount: number;
  seriesCount: number;
  totalCount: number;
  liveCategories: ProviderCategoryPublic[];
  movieCategories: ProviderCategoryPublic[];
  seriesCategories: ProviderCategoryPublic[];
  lastSyncedAt?: number;
  error?: string;
}

export interface ProvidersStatusSummaryPublic {
  providers: ProviderStatusPublic[];
  totals: {
    connectedCount: number;
    totalProviders?: number;
    totalServers?: number;
    liveCount: number;
    movieCount: number;
    seriesCount: number;
    totalCount: number;
  };
}

export interface ProviderCatalogQueryResult {
  scope?: string;
  kind?: ProviderMediaKind | 'all';
  lang?: string;
  quality?: string;
  items: ProviderCatalogItemPublic[];
  total: number;
  offset: number;
  limit: number;
}
