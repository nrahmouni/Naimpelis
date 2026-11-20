/**
 * @module server/services/atresplayer/atresplayerParser
 * @description Deterministic parser & indexer for the Atresplayer APK technical inventory.
 */

import {
  ATRESPLAYER_BASE_URLS,
  ATRESPLAYER_HOSTS,
  ATRESPLAYER_LIMITATIONS,
  ATRESPLAYER_LITERAL_URLS,
  ATRESPLAYER_METADATA,
  ATRESPLAYER_MIME_TYPES,
  ATRESPLAYER_PLAYBACK_CHAIN,
  ATRESPLAYER_PORT_NOTES,
  ATRESPLAYER_PROPERTIES_KEYS,
  ATRESPLAYER_RETROFIT_SERVICES,
  ATRESPLAYER_SOURCE_FIELDS,
  ATRESPLAYER_VIDEO_NOTES,
  type AtresplayerLiteralUrlItem,
  type AtresplayerMimeEntry,
  type AtresplayerPlaybackStep,
  type AtresplayerRawHostRow,
  type AtresplayerRawServiceDef,
} from './atresplayerRawData.ts';

export type AtresplayerHostCategory = AtresplayerRawHostRow['category'];
export type AtresplayerServiceGroup = AtresplayerRawServiceDef['group'];

export interface ParsedAtresplayerInventory {
  sourceFile: string;
  archiveName: string;
  documentDate: string;
  packageNames: string[];
  zipEntries: number;
  javaFiles: number;
  declaredSummary: typeof ATRESPLAYER_METADATA.declaredStats;
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
  hosts: AtresplayerRawHostRow[];
  baseUrls: typeof ATRESPLAYER_BASE_URLS;
  playbackChain: AtresplayerPlaybackStep[];
  sourceFields: typeof ATRESPLAYER_SOURCE_FIELDS;
  mimeTypes: AtresplayerMimeEntry[];
  propertiesKeys: string[];
  retrofitServices: AtresplayerRawServiceDef[];
  literalUrls: AtresplayerLiteralUrlItem[];
  limitations: string[];
}

let cachedInventory: ParsedAtresplayerInventory | null = null;

export function parseAtresplayerInventory(): ParsedAtresplayerInventory {
  if (cachedInventory) return cachedInventory;

  const categoryCounts: Record<AtresplayerHostCategory, number> = {
    atres_core: 0,
    atres_portal: 0,
    atres_ads_identity: 0,
    store_platform: 0,
    placeholder: 0,
  };
  for (const h of ATRESPLAYER_HOSTS) {
    categoryCounts[h.category] += 1;
  }

  const serviceGroupCounts: Record<AtresplayerServiceGroup, number> = {
    playback_catalog: 0,
    config_drm: 0,
    account_auth: 0,
    billing_offers: 0,
    profile_ads_links: 0,
  };
  let totalRetrofitDeclarations = 0;
  for (const svc of ATRESPLAYER_RETROFIT_SERVICES) {
    serviceGroupCounts[svc.group] += 1;
    totalRetrofitDeclarations += svc.declarationCount;
  }

  const ownHosts = ATRESPLAYER_HOSTS.filter(
    (h) => h.category === 'atres_core' || h.category === 'atres_portal'
  ).length;
  const externalHosts = ATRESPLAYER_HOSTS.length - ownHosts;
  const ownLiteralUrls = ATRESPLAYER_LITERAL_URLS.filter((u) => u.scope === 'own').length;
  const externalLiteralUrls = ATRESPLAYER_LITERAL_URLS.filter((u) => u.scope === 'external').length;

  cachedInventory = {
    sourceFile: ATRESPLAYER_METADATA.sourceFile,
    archiveName: ATRESPLAYER_METADATA.archiveName,
    documentDate: ATRESPLAYER_METADATA.documentDate,
    packageNames: [...ATRESPLAYER_METADATA.packageNames],
    zipEntries: ATRESPLAYER_METADATA.zipEntries,
    javaFiles: ATRESPLAYER_METADATA.javaFiles,
    declaredSummary: ATRESPLAYER_METADATA.declaredStats,
    actualCounts: {
      hosts: ATRESPLAYER_HOSTS.length,
      ownHosts,
      externalHosts,
      literalUrls: ATRESPLAYER_LITERAL_URLS.length,
      ownLiteralUrls,
      externalLiteralUrls,
      retrofitServices: ATRESPLAYER_RETROFIT_SERVICES.length,
      retrofitDeclarations: totalRetrofitDeclarations,
      propertiesKeys: ATRESPLAYER_PROPERTIES_KEYS.length,
      mimeTypes: ATRESPLAYER_MIME_TYPES.length,
      playbackSteps: ATRESPLAYER_PLAYBACK_CHAIN.length,
      limitations: ATRESPLAYER_LIMITATIONS.length,
    },
    categoryCounts,
    serviceGroupCounts,
    portNotes: [...ATRESPLAYER_PORT_NOTES],
    videoNotes: [...ATRESPLAYER_VIDEO_NOTES],
    hosts: [...ATRESPLAYER_HOSTS],
    baseUrls: ATRESPLAYER_BASE_URLS,
    playbackChain: [...ATRESPLAYER_PLAYBACK_CHAIN],
    sourceFields: ATRESPLAYER_SOURCE_FIELDS,
    mimeTypes: [...ATRESPLAYER_MIME_TYPES],
    propertiesKeys: [...ATRESPLAYER_PROPERTIES_KEYS],
    retrofitServices: [...ATRESPLAYER_RETROFIT_SERVICES],
    literalUrls: [...ATRESPLAYER_LITERAL_URLS],
    limitations: [...ATRESPLAYER_LIMITATIONS],
  };

  return cachedInventory;
}
