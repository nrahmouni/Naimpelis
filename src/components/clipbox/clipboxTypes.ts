export type ClipboxCategoryId =
  | 'core'
  | 'decoding'
  | 'cinema_es'
  | 'cinema_intl'
  | 'anime'
  | 'extractors'
  | 'subtitles'
  | 'sdk';

export interface ClipboxDecodedToken {
  label: string;
  host: string;
  rawUrl: string;
  encoding: 'base64-json' | 'api-endpoint' | 'keys-repo' | 'proxy-router' | 'dns-resolver';
  decodedSummary: string;
  decodedPayload?: unknown;
}

export interface ClipboxHostEntry {
  host: string;
  urls: string[];
  category: ClipboxCategoryId;
  categoryLabel: string;
  language: string;
  role: string;
  isBoilerplate: boolean;
  probeAllowed: boolean;
  decodedNote?: string;
}

export type ClipboxRouteKind =
  | 'hls_mp4'
  | 'player_embed'
  | 'provider_smali'
  | 'extractor_smali'
  | 'app_internal';

export interface ClipboxRoutePattern {
  pattern: string;
  kind: ClipboxRouteKind;
  decodedName?: string;
  description?: string;
}

export interface ClipboxMediaRef {
  kind: 'hls' | 'mp4';
  url: string;
  sources: string[];
  note: string;
}

export interface ClipboxInventoryResponse {
  success: boolean;
  sourceFile: string;
  declaredSummary: {
    literalUrls: number;
    hosts: number;
    routePatterns: number;
  };
  actualCounts: {
    literalUrls: number;
    hosts: number;
    routePatterns: number;
    streamingHosts: number;
    sdkHosts: number;
  };
  categoryCounts: Record<ClipboxCategoryId, number>;
  hosts: ClipboxHostEntry[];
  decodedTokens: ClipboxDecodedToken[];
  routePatterns: ClipboxRoutePattern[];
  totalFilteredRoutes: number;
  decodedProviders: Array<{ name: string; rawPattern: string; region: string }>;
  decodedExtractors: Array<{ name: string; rawPattern: string; family: string }>;
  mediaRefs: ClipboxMediaRef[];
}

export interface ClipboxProbeResult {
  host: string;
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  contentType: string;
  error?: string;
}

export interface ClipboxSearchItem {
  id: string;
  source: 'tmdb' | 'kitsu' | 'archive';
  mediaType: 'movie' | 'tv' | 'anime';
  title: string;
  originalTitle?: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  tmdbId?: number;
  kitsuId?: string;
  episodeCount?: number;
  directMp4Url?: string;
}

export interface ClipboxPlayerTrack {
  id: string;
  provider: string;
  label: string;
  lang: string;
  quality: string;
  mode: 'direct' | 'hls' | 'extract';
  url: string;
  rawUrl: string;
  note: string;
}

export interface ClipboxTitleStreamsResult {
  title: string;
  mediaType: 'movie' | 'tv' | 'anime';
  season: number;
  episode: number;
  tracks: ClipboxPlayerTrack[];
  subtitles: Array<{ lang: string; label: string; url: string; source: string }>;
  introTimestamps: Array<{ type: string; startSec: number; endSec: number; source: string }>;
  portalLinks: Array<{ host: string; label: string; searchUrl: string }>;
}

export interface ClipboxDecodeResponse {
  input: string;
  detectedType: string;
  matchedHost?: ClipboxHostEntry;
  extractorFamily?: string;
  base64Decoded?: Array<{ token: string; text: string; json?: unknown }>;
  urlBreakdown?: {
    protocol: string;
    host: string;
    pathname: string;
    queryParams: Record<string, string>;
  };
  notes: string[];
  liveKeysPreview?: unknown;
}
