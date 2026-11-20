import type { SportsMatch } from '../../types';

export type RbtvCategoryId = 'core' | 'doh' | 'streaming_specs' | 'sdk';

export interface RbtvUrlItem {
  url: string;
  references: string[];
  pathSpec?: string;
}

export interface RbtvHostEntry {
  host: string;
  declaredUrlCount: number;
  urls: string[];
  urlItems: RbtvUrlItem[];
  paths: string[];
  category: RbtvCategoryId;
  categoryLabel: string;
  role: string;
  decodedNote?: string;
  isCoreAppDomain: boolean;
  probeAllowed: boolean;
}

export interface RbtvMediaFormat {
  ext: string;
  kind: 'manifest' | 'segment' | 'video' | 'audio' | 'subtitle';
  description: string;
}

export interface RbtvArchitectureNode {
  component: string;
  javaRef: string;
  role: string;
  endpoints: string[];
  mechanism: string;
}

export interface RbtvInventoryResponse {
  success: boolean;
  sourceFile: string;
  archiveName: string;
  declaredSummary: {
    inspectedFiles: number;
    absoluteUrls: number;
    uniqueHosts: number;
    explicitHlsDashUrls: number;
    explicitVideoUrls: number;
  };
  actualCounts: {
    absoluteUrls: number;
    hosts: number;
    coreDomains: number;
    dohResolvers: number;
    paths: number;
    mediaFormats: number;
  };
  categoryCounts: Record<RbtvCategoryId, number>;
  hosts: RbtvHostEntry[];
  pathsByHost: Array<{ host: string; paths: string[] }>;
  mediaFormats: RbtvMediaFormat[];
  primaryDomains: string[];
  architectureNodes: RbtvArchitectureNode[];
}

export interface RbtvProbeResult {
  host: string;
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  contentType: string;
  error?: string;
}

export interface RbtvDohResolveResult {
  domain: string;
  provider: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  answers: Array<{ name: string; type: number; ttl: number; data: string }>;
  error?: string;
}

export interface RbtvDecodeResult {
  input: string;
  detectedType: string;
  matchedHost?: RbtvHostEntry;
  componentRef?: string;
  urlBreakdown?: {
    protocol: string;
    host: string;
    pathname: string;
    queryParams: Record<string, string>;
  };
  notes: string[];
  dohLookup?: RbtvDohResolveResult;
  livePayloadPreview?: unknown;
}

export interface RbtvLiveOverviewResponse {
  success: boolean;
  coreStatuses: RbtvProbeResult[];
  liveMatches: SportsMatch[];
  sports247Channels: SportsMatch[];
}
