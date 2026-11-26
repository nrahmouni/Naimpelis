export type ProviderMediaTab = 'live' | 'movies' | 'series';

export interface ProviderCategoryItem {
  id: string;
  name: string;
}

export interface ProviderLiveItem {
  id: string;
  streamId: string;
  providerId: string;
  providerName: string;
  name: string;
  categoryId: string;
  categoryName: string;
  logo: string;
  playbackUrl: string;
}

export interface ProviderMovieItem {
  id: string;
  streamId: string;
  providerId: string;
  providerName: string;
  name: string;
  categoryId: string;
  categoryName: string;
  poster: string;
  rating: string;
  year: string;
  ext: string;
  playbackUrl: string;
}

export interface ProviderSeriesItem {
  id: string;
  seriesId: string;
  providerId: string;
  providerName: string;
  name: string;
  categoryId: string;
  categoryName: string;
  poster: string;
  rating: string;
  year: string;
  plot: string;
}

export interface ProviderSeriesEpisodeItem {
  id: string;
  episodeId: string;
  season: number;
  episodeNum: number;
  title: string;
  duration: string;
  poster: string;
  ext: string;
  playbackUrl: string;
}

export interface ProviderSeriesInfoResult {
  providerId: string;
  providerName: string;
  seriesId: string;
  title: string;
  poster: string;
  plot: string;
  seasons: number[];
  episodesBySeason: Record<string, ProviderSeriesEpisodeItem[]>;
}

export interface ProviderCatalogCounts {
  live: number;
  movies: number;
  series: number;
}

export interface ProviderCatalogData {
  providerId: string;
  providerName: string;
  syncedAt: number;
  status: 'ready' | 'error';
  errorMessage?: string;
  counts: ProviderCatalogCounts;
  liveCategories: ProviderCategoryItem[];
  vodCategories: ProviderCategoryItem[];
  seriesCategories: ProviderCategoryItem[];
  liveStreams: ProviderLiveItem[];
  vodStreams: ProviderMovieItem[];
  seriesList: ProviderSeriesItem[];
}
