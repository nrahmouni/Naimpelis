import type { SpanishTdtChannel, SportsMatch } from '../../types';

export type BelixHostCategoryId = 'app_players' | 'community' | 'streaming_specs' | 'sdk_docs';

export interface BelixApiEndpoint {
  id: string;
  label: string;
  path: string;
  action: string;
  requiresCategoryId: boolean;
  requiresStreamOrVodOrSeriesId?: 'stream_id' | 'vod_id' | 'series_id';
  group: 'auth_epg' | 'live' | 'vod' | 'series';
}

export interface BelixDynamicRoute {
  id: string;
  label: string;
  template: string;
  kind: 'live' | 'movie' | 'series' | 'playlist';
  notes: string;
}

export interface BelixAppExternalUrl {
  url: string;
  host: string;
  role: string;
  origins: string[];
}

export interface BelixHostEntry {
  host: string;
  urls: string[];
  category: BelixHostCategoryId;
  categoryLabel: string;
  role: string;
  decodedNote?: string;
  origins: string[];
  isAppCodeHost: boolean;
  probeAllowed: boolean;
}

export interface BelixCodeFileNode {
  file: string;
  component: string;
  role: string;
  mechanism: string;
}

export interface BelixInventoryResponse {
  success: boolean;
  sourceFile: string;
  archiveName: string;
  packageName: string;
  declaredSummary: {
    literalUrls: number;
    uniqueHosts: number;
    appPackageUrls: number;
  };
  actualCounts: {
    literalUrls: number;
    hosts: number;
    appExternalUrls: number;
    apiEndpoints: number;
    apiParams: number;
    dynamicRoutes: number;
    relevantCodeFiles: number;
  };
  categoryCounts: Record<BelixHostCategoryId, number>;
  apiEndpoints: BelixApiEndpoint[];
  apiParams: string[];
  dynamicRoutes: BelixDynamicRoute[];
  streamingNotes: string[];
  appExternalUrls: BelixAppExternalUrl[];
  hosts: BelixHostEntry[];
  codeFiles: BelixCodeFileNode[];
  limitations: string[];
}

export interface BelixLiveOverviewResponse {
  success: boolean;
  checkedAt: number;
  packageName: string;
  apiEndpoints: BelixApiEndpoint[];
  dynamicRoutes: BelixDynamicRoute[];
  liveMatches: SportsMatch[];
  sports247Channels: SportsMatch[];
  featuredTdt: SpanishTdtChannel[];
}

export interface BelixProbeResult {
  host: string;
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  contentType: string;
  error?: string;
}

export interface BelixDecodeResult {
  input: string;
  detectedType: string;
  matchedHost?: BelixHostEntry;
  smaliOriginRef?: string;
  xtreamBreakdown?: {
    baseHost: string;
    routeKind: 'live' | 'movie' | 'series' | 'player_api' | 'xmltv' | 'm3u_plus' | 'external';
    maskedUrl: string;
    action?: string;
    streamId?: string;
    extension?: string;
    hasCredentials: boolean;
    params: Record<string, string>;
  };
  notes: string[];
}

export interface BelixXtreamInspectResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  serverOrigin: string;
  maskedPlaylistUrl: string;
  userStatus?: string;
  activeConnections?: string;
  maxConnections?: string;
  expDate?: string;
  serverTimezone?: string;
  liveCategoriesCount?: number;
  vodCategoriesCount?: number;
  seriesCategoriesCount?: number;
  sampleLiveStreams?: Array<{
    streamId: number;
    name: string;
    icon?: string;
    maskedPlayUrl: string;
  }>;
  error?: string;
}
