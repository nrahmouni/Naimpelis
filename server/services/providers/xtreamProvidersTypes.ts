/**
 * @module server/services/providers/xtreamProvidersTypes
 * @description Public sanitized DTOs for multi-provider Xtream catalogs.
 * Contains zero credentials, zero raw upstream URLs, and zero account identifiers.
 */

export type ProviderMediaKind = 'live' | 'movie' | 'series';

export type ProviderPriorityMode = 'es_quality' | 'best_quality';

export interface ProviderCategoryPublic {
  id: string;
  name: string;
  kind: ProviderMediaKind;
  count: number;
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

export interface ProviderCatalogAlternativePublic {
  id: string;
  providerId: string;
  providerName: string;
  streamId: string;
  name: string;
  categoryName: string;
  lang: string;
  langLabel: string;
  quality: string;
  qualityTier: number;
  containerExtension?: string;
  streamUrl: string;
}

export interface ProviderCatalogItemPublic {
  id: string;
  providerId: string;
  providerName: string;
  kind: ProviderMediaKind;
  streamId: string;
  name: string;
  cleanTitle?: string;
  categoryId: string;
  categoryName: string;
  lang?: string;
  langLabel?: string;
  quality?: string;
  qualityTier?: number;
  poster?: string;
  rating?: string;
  year?: string;
  plot?: string;
  containerExtension?: string;
  streamUrl: string;
  alternatives?: ProviderCatalogAlternativePublic[];
}

export interface ProviderSeriesEpisodePublic {
  id: string;
  season: number;
  episodeNum: number;
  title: string;
  duration?: string;
  plot?: string;
  still?: string;
  containerExtension: string;
  streamUrl: string;
}

export interface ProviderSeriesDetailPublic {
  providerId: string;
  providerName: string;
  seriesId: string;
  title: string;
  poster?: string;
  backdrop?: string;
  plot?: string;
  genre?: string;
  year?: string;
  rating?: string;
  seasons: Array<{
    seasonNumber: number;
    name: string;
    episodes: ProviderSeriesEpisodePublic[];
  }>;
}

export interface ProvidersStatusSummaryPublic {
  providers: ProviderStatusPublic[];
  totals: {
    liveCount: number;
    movieCount: number;
    seriesCount: number;
    totalCount: number;
    connectedCount: number;
    totalProviders: number;
  };
}

export interface ProviderCatalogQueryResult {
  scope: string;
  kind: ProviderMediaKind | 'all';
  priority?: ProviderPriorityMode;
  grouped?: boolean;
  lang?: string;
  quality?: string;
  total: number;
  offset: number;
  limit: number;
  items: ProviderCatalogItemPublic[];
}
