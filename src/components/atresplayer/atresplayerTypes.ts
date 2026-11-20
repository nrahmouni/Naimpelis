import type { SpanishTdtChannel } from '../../types';

export type AtresplayerHostCategory =
  | 'atres_core'
  | 'atres_portal'
  | 'atres_ads_identity'
  | 'store_platform'
  | 'placeholder';

export type AtresplayerServiceGroup =
  | 'playback_catalog'
  | 'config_drm'
  | 'account_auth'
  | 'billing_offers'
  | 'profile_ads_links';

export interface AtresplayerHostItem {
  host: string;
  port: string;
  protocol: 'HTTPS' | 'HTTP';
  category: AtresplayerHostCategory;
  categoryLabel: string;
  basePaths: string[];
  role: string;
  probeAllowed: boolean;
  sampleUrls: string[];
}

export interface AtresplayerBaseUrlItem {
  id: string;
  kind: string;
  value: string;
  note: string;
}

export interface AtresplayerPlaybackStep {
  step: number;
  service: string;
  methods: string[];
  endpointHint: string;
  role: string;
}

export interface AtresplayerMimeEntry {
  family: 'HLS' | 'DASH' | 'Audio';
  mime: string;
  notes: string;
}

export interface AtresplayerServiceDef {
  id: string;
  service: string;
  packageScope: 'com.a3' | 'com.atresmedia';
  group: AtresplayerServiceGroup;
  host: string;
  declarationCount: number;
  highlightMethods: string[];
  routePatterns: string[];
  summary: string;
}

export interface AtresplayerLiteralUrlItem {
  id: string;
  scope: 'own' | 'external';
  host: string;
  url: string;
  category: string;
  note: string;
}

export interface AtresplayerInventoryResponse {
  success: boolean;
  sourceFile: string;
  archiveName: string;
  documentDate: string;
  packageNames: string[];
  zipEntries: number;
  javaFiles: number;
  declaredSummary: {
    literalUrls: number;
    ownLiteralUrls: number;
    externalLiteralUrls: number;
    retrofitDeclarations: number;
    retrofitServices: number;
    hlsDashDrmMatches: number;
    javaFiles: number;
    zipEntries: number;
  };
  actualCounts: {
    hosts: number;
    ownHosts: number;
    externalHosts: number;
    literalUrls: number;
    ownLiteralUrls: number;
    externalLiteralUrls: number;
    retrofitServices: number;
    retrofitDeclarations: number;
    propertiesKeys: number;
    mimeTypes: number;
    playbackSteps: number;
    limitations: number;
  };
  categoryCounts: Record<AtresplayerHostCategory, number>;
  serviceGroupCounts: Record<AtresplayerServiceGroup, number>;
  portNotes: string[];
  videoNotes: string[];
  hosts: AtresplayerHostItem[];
  baseUrls: AtresplayerBaseUrlItem[];
  playbackChain: AtresplayerPlaybackStep[];
  sourceFields: {
    sourceBo: string[];
    playerVideoBo: string[];
    drmSpecs: {
      scheme: string;
      javaClasses: string[];
      propertyKeys: string[];
      notes: string;
    };
  };
  mimeTypes: AtresplayerMimeEntry[];
  propertiesKeys: string[];
  retrofitServices: AtresplayerServiceDef[];
  literalUrls: AtresplayerLiteralUrlItem[];
  limitations: string[];
}

export interface AtresplayerOverviewResponse {
  success: boolean;
  checkedAt: number;
  atresmediaTdtChannels: SpanishTdtChannel[];
  playbackChain: AtresplayerPlaybackStep[];
  mimeTypes: AtresplayerMimeEntry[];
  portNotes: string[];
  videoNotes: string[];
  limitations: string[];
}

export interface AtresplayerProbeResult {
  host: string;
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  contentType: string;
  error?: string;
}

export interface AtresplayerDecodeResult {
  input: string;
  detectedType: string;
  matchedHost?: AtresplayerHostItem;
  matchedService?: AtresplayerServiceDef;
  breakdown?: {
    host: string;
    port: string;
    protocol: string;
    path: string;
    queryParams: Record<string, string>;
    routeKind: string;
  };
  notes: string[];
}
