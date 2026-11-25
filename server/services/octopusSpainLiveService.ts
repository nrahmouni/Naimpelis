/**
 * @module server/services/octopusSpainLiveService
 * @description Extracts ALL Spanish live channels from Octopus TV and all connected Xtream servers
 * (Dana 4K Pro, Shark Pro, VOD 4K, 24TV, 2M2H, Active CDNS), probes real stream startup latency,
 * promotes fastest verified 4K/FHD signals as primary tracks in TV en Directo, and populates channelHealthMonitor.
 * Never exposes upstream hostnames, ports, usernames, or passwords.
 */
import {
  resolveCanonicalChannelKey,
  stripChannelNoise,
} from '../../src/utils/channelQualityRanker.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import { logger } from '../utils/logger.ts';
import { channelHealthMonitor } from './channelHealthMonitor.ts';
import { getAllXtreamProviders, normalizeXtreamServerInput } from './providersConfig.ts';
import {
  getCachedXtreamProviderCatalogs,
  isXtreamEnvConfigured,
  probeXtreamLiveStreamLatency,
  syncFullCatalog,
  type XtreamFullCatalogPayload,
} from './xtreamService.ts';

export type SpainChannelCategory =
  | 'generalistas'
  | 'dazn'
  | 'movistar'
  | 'noticias_deportes'
  | 'cine_series'
  | 'documentales'
  | 'entretenimiento'
  | 'infantil_autonomicas';

export interface VerifiedSpainTrackRecord {
  id: string;
  label: string;
  lang: 'ES';
  quality: string;
  sourceUrl: string;
  resolverType: 'direct_hls';
  providerId: string;
  providerName: string;
  streamId: string;
  qualityTier: number;
  isHevc: boolean;
  latencyMs?: number;
  probedOk?: boolean;
}

export interface VerifiedSpainChannelEntry {
  id: string;
  canonicalKey: string;
  streamId: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category: SpainChannelCategory;
  quality: string;
  countryCode: 'ES';
  logoUrl?: string;
  description: string;
  epgChannelId?: string;
  channels: VerifiedSpainTrackRecord[];
}

interface CachedProbeResult {
  ok: boolean;
  latencyMs: number;
  lineCount: number;
  checkedAt: number;
}

const PROBE_CACHE_TTL_MS = 10 * 60 * 1000;
const probeResultCache = new Map<string, CachedProbeResult>();
const PROVIDER_PRIORITY_ORDER = [
  'dana4k',
  'octopus',
  'primary',
  'vod4k',
  'sult-vo',
  'ultra-vip',
  'adtupac',
  '2m2h-alt',
  '24tv',
  '2m2h',
  'activecdns',
];

const SPANISH_TDT_BY_ID = new Map(SPANISH_TDT_CHANNELS.map((c) => [c.id, c]));

const FLAGSHIP_KEY_SET = new Set([
  'tdt-la1',
  'tdt-la2',
  'tdt-antena3',
  'tdt-cuatro',
  'tdt-telecinco',
  'tdt-lasexta',
  'tdt-24h',
  'tdt-teledeporte',
  'tdt-neox',
  'tdt-nova',
  'tdt-mega',
  'tdt-atreseries',
  'tdt-fdf',
  'tdt-divinity',
  'tdt-energy',
  'tdt-bemad',
  'tdt-dmax',
  'tdt-dkiss',
  'tdt-ten',
  'tdt-trece',
  'tdt-clan',
  'tdt-boing',
  'tdt-rmtv',
  'tdt-canalsur',
  'tdt-3cat',
  'mplus-laliga',
  'dazn-laliga',
  'mplus-champions',
  'mplus-canal',
  'mplus-vamos',
  'mplus-hypermotion',
  'mplus-deportes',
  'dazn-1',
  'dazn-2',
  'dazn-3',
  'dazn-4',
  'dazn-f1',
]);

let warmupPromise: Promise<void> | null = null;
let lastSyncAttemptAt = 0;

export function normalizeSpainProviderText(raw: string): string {
  return String(raw || '')
    .replace(/⁴ᴷ|⁴ᵏ/g, ' 4K ')
    .replace(/ᶠᴴᴰ/gi, ' FHD ')
    .replace(/ᴴᴰ/gi, ' HD ')
    .replace(/＋/g, '+')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSpanishLiveChannelEntry(streamName: string, categoryName: string): boolean {
  const cat = normalizeSpainProviderText(categoryName).trim();
  const name = normalizeSpainProviderText(streamName).trim();
  if (!name) return false;
  if (/^(?:yes|philippines|usa|uk|arabic|ar|fr|france|de|germany|it|italy|pt|portugal)$/i.test(cat)) {
    return false;
  }

  // Reject explicit foreign channel prefixes inside mixed categories
  if (
    /^(?:\[?\s*(?:UK|US|USA|FR|DE|GER|IT|ITA|PT|POR|AR|ARB|BR|BRA|NL|PL|TR|RO|RU|IN|LAT|LA|MX|ARG|COL|CHL|PER|PE|GR|BG|RS|MK|IR|AL|BE|AT|CH|FI|NO|SE|DK)\s*\]?\s*[|:/-·•▎┃│◈])/i.test(
      name
    ) ||
    /^[┃│▎◈•]/.test(name)
  ) {
    return false;
  }

  const hasSpainCat =
    /\b(?:spain|espa[ñn]a|castellano|tdt|tivify|tivfiy|movistar|atresmedia|mediaset|rtve|autonomicas|auton[oó]micas|laliga|hypermotion|rakuten\s*tv)\b|أسبانيا|^(?:\[?\s*(?:vip\s*)?(?:es|esp|cast)\s*\]?\s*[|:/-])/i.test(
      cat
    );

  const hasForeignCatPrefix =
    /^(?:\[?\s*(?:UK|US|USA|FR|DE|IT|PT|AR|BR|NL|PL|TR|RO|LA|LAT|MX|GR|BG|RS|FI|NO|SE|DK|BE|AT|AL|IND|ARABIC|PHILIPPINES)\s*\]?\s*[|:/-l])/i.test(
      cat
    );

  if (hasForeignCatPrefix && !hasSpainCat) return false;

  const hasSpainStreamPrefix =
    /^(?:tivif?y\s*es\s*[:|]|vip\s*es\s*[:|]|\[?\s*(?:es|esp|cast|spain)\s*\]?\s*[|:/-])/i.test(name);
  return hasSpainCat || hasSpainStreamPrefix;
}

export function inferSpainStreamQualityMeta(
  streamName: string,
  categoryName = ''
): { quality: string; qualityTier: number; isHevc: boolean } {
  const hay = normalizeSpainProviderText(`${streamName} ${categoryName}`).toLowerCase();
  const isHevc = /\b(?:hevc|h\.?265|x265)\b/.test(hay);

  if (/\b(?:4k|uhd|2160p?)\b/.test(hay)) {
    return {
      quality: '4K UHD',
      qualityTier: isHevc ? 3 : 0,
      isHevc,
    };
  }
  if (/\b(?:fhd|1080p?|full\s*hd)\b/.test(hay)) {
    return {
      quality: '1080p FHD',
      qualityTier: isHevc ? 3 : 1,
      isHevc,
    };
  }
  if (/\b(?:576p?|480p?|360p?|sd|lq)\b/.test(hay)) {
    return {
      quality: 'SD',
      qualityTier: 4,
      isHevc,
    };
  }
  return {
    quality: 'HD',
    qualityTier: isHevc ? 3 : 2,
    isHevc,
  };
}

export function classifySpanishChannelCategory(
  cleanName: string,
  catName: string
): SpainChannelCategory {
  const canonicalExisting = SPANISH_TDT_BY_ID.get(
    resolveCanonicalChannelKey({ id: `xtream-${cleanName}`, name: cleanName, countryCode: 'ES' })
  );
  if (canonicalExisting) {
    return canonicalExisting.category as SpainChannelCategory;
  }

  const hay = normalizeSpainProviderText(`${cleanName} ${catName}`).toLowerCase();
  if (/\b(?:dazn)\b/.test(hay)) return 'dazn';
  if (
    /\b(?:movistar|m\+|vamos|laliga|hypermotion|campeones|liga|futbol|f[uú]tbol|gol\s*play|gol\s*tv)\b/.test(
      hay
    )
  ) {
    return 'movistar';
  }
  if (
    /\b(?:teledeporte|tdp|24\s*h|24\s*horas|eurosport|real\s*madrid|barca|sevilla|betis|deportes|golf|caza|iberlia|sport|motor|garage|nba)\b/.test(
      hay
    )
  ) {
    return 'noticias_deportes';
  }
  if (
    /\b(?:clan|boing|disney|nick|cartoon|baby|panda|canal\s*sur|tv\s*3|3cat|etb|tvg|telemadrid|apunt|aragon|ib3|rtpa|tpa|canaria|7rm|extremadura|cmm|cyl|super3|esport3|autonomic)\b/.test(
      hay
    )
  ) {
    return 'infantil_autonomicas';
  }
  if (
    /\b(?:dmax|nat\s*geo|national\s*geo|discovery|historia|history|odisea|viajar|cocina|decasa|animal|nature|document)\b/.test(
      hay
    )
  ) {
    return 'documentales';
  }
  if (
    /\b(?:amc|warner|calle\s*13|axn|star\s*channel|syfy|tnt|tcm|sundance|dark|somos|hollywood|bom|squirrel|veo\s*7|atreseries|fdf|xtrm|paramount|netflix|rakuten|cine|estrenos|pelicula|series|scifi)\b/.test(
      hay
    )
  ) {
    return 'cine_series';
  }
  if (/\b(?:neox|nova|mega|divinity|energy|be\s*mad|bemad|dkiss|ten|mtv|cosmo|enfamilia)\b/.test(hay)) {
    return 'entretenimiento';
  }
  if (/\b(?:la\s*1|la\s*2|tve|antena\s*3|cuatro|telecinco|tele\s*5|la\s*sexta|lasexta|trece|13\s*tv)\b/.test(hay)) {
    return 'generalistas';
  }
  return 'entretenimiento';
}

function formatReadableSpanishName(rawName: string, canonicalKey: string): string {
  const known = SPANISH_TDT_BY_ID.get(canonicalKey);
  if (known) return known.name;
  const normalized = normalizeSpainProviderText(rawName);
  const stripped = stripChannelNoise(normalized) || normalized;
  return stripped.length >= 2 ? stripped : normalized;
}

function getProviderBrandTone(category: SpainChannelCategory): string {
  switch (category) {
    case 'dazn':
      return '#0EA5E9';
    case 'movistar':
      return '#00A9E0';
    case 'noticias_deportes':
      return '#F59E0B';
    case 'cine_series':
      return '#9146FF';
    case 'documentales':
      return '#10B981';
    case 'infantil_autonomicas':
      return '#EC4899';
    default:
      return '#38BDF8';
  }
}

async function ensureProviderCatalogsHydrated(maxWaitMs = 2000): Promise<XtreamFullCatalogPayload[]> {
  let catalogs = getCachedXtreamProviderCatalogs();
  const configuredProviders = getAllXtreamProviders().filter((p) =>
    Boolean(normalizeXtreamServerInput(p.serverUrl) && p.accounts.length > 0)
  );
  const loadedIds = new Set(catalogs.map((c) => c.providerId));
  const missingImportant = configuredProviders.filter((p) => !loadedIds.has(p.id));

  if (missingImportant.length > 0 && Date.now() - lastSyncAttemptAt > 20_000) {
    lastSyncAttemptAt = Date.now();
    const syncTasks = Promise.allSettled(
      missingImportant.map((p) => syncFullCatalog(false, p.id).catch(() => null))
    );
    await Promise.race([
      syncTasks,
      new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
    ]);
    catalogs = getCachedXtreamProviderCatalogs();
  }

  return catalogs;
}

function sortTracksByQualityAndSpeed(tracks: VerifiedSpainTrackRecord[]): VerifiedSpainTrackRecord[] {
  const providerRank = (pid: string) => {
    const idx = PROVIDER_PRIORITY_ORDER.indexOf(pid);
    return idx === -1 ? 99 : idx;
  };

  return [...tracks].sort((a, b) => {
    // 1. Verified 'up' first, known 'down' strictly last
    const aStatus = a.probedOk === true ? 0 : a.probedOk === false ? 2 : 1;
    const bStatus = b.probedOk === true ? 0 : b.probedOk === false ? 2 : 1;
    if (aStatus !== bStatus) return aStatus - bStatus;

    // 2. Non-HEVC high quality (4K=0, FHD=1, HD=2) beats HEVC (3) & SD (4)
    if (a.qualityTier !== b.qualityTier) return a.qualityTier - b.qualityTier;

    // 3. Prefer Dana 4K Pro / top provider priority unless another live mirror is strictly verified much faster
    const aDanaPriority = a.providerId === 'dana4k' && a.probedOk !== false ? 0 : 1;
    const bDanaPriority = b.providerId === 'dana4k' && b.probedOk !== false ? 0 : 1;
    if (aDanaPriority !== bDanaPriority) return aDanaPriority - bDanaPriority;

    const aLat = typeof a.latencyMs === 'number' ? a.latencyMs : 2500;
    const bLat = typeof b.latencyMs === 'number' ? b.latencyMs : 2500;
    if (Math.abs(aLat - bLat) >= 250) {
      return aLat - bLat;
    }

    const pDiff = providerRank(a.providerId) - providerRank(b.providerId);
    if (pDiff !== 0) return pDiff;

    return aLat - bLat;
  });
}

function extractRawSpanishGrouped(catalogs: XtreamFullCatalogPayload[]): VerifiedSpainChannelEntry[] {
  const byKey = new Map<string, VerifiedSpainChannelEntry>();
  const seenSourceUrls = new Set<string>();

  // Order catalogs with Octopus first, then Dana 4K Pro, Shark Pro, VOD 4K, 24TV, 2M2H, Active CDNS
  const orderedCatalogs = [...catalogs].sort((a, b) => {
    const ia = PROVIDER_PRIORITY_ORDER.indexOf(a.providerId);
    const ib = PROVIDER_PRIORITY_ORDER.indexOf(b.providerId);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const catPayload of orderedCatalogs) {
    const catNameById = new Map(catPayload.liveCategories.map((c) => [c.id, c.name]));

    for (const stream of catPayload.liveStreams) {
      const catName = catNameById.get(stream.categoryId) || catPayload.providerName;
      if (!isSpanishLiveChannelEntry(stream.name, catName)) continue;

      const normalizedName = normalizeSpainProviderText(stream.name);
      const canonicalKey = resolveCanonicalChannelKey({
        id: `xtream-${catPayload.providerId}-${stream.streamId}`,
        name: normalizedName,
        network: catName,
        countryCode: 'ES',
      });

      // Skip overly vague junk separators (e.g., "----- SPAIN -----")
      const cleanName = formatReadableSpanishName(stream.name, canonicalKey);
      if (!cleanName || /^[-=_*#|.\s]+$/.test(cleanName)) continue;

      const qMeta = inferSpainStreamQualityMeta(stream.name, catName);
      const sourceUrl = `/api/stream?provider=${encodeURIComponent(
        catPayload.providerId
      )}&id=${encodeURIComponent(stream.streamId)}`;
      if (seenSourceUrls.has(sourceUrl)) continue;
      seenSourceUrls.add(sourceUrl);

      const probeKey = `${catPayload.providerId}:${stream.streamId}`;
      const cachedProbe = probeResultCache.get(probeKey);
      const isFreshProbe = cachedProbe && Date.now() - cachedProbe.checkedAt < PROBE_CACHE_TTL_MS;

      if (isFreshProbe) {
        channelHealthMonitor.setTrackHealth(sourceUrl, {
          status: cachedProbe.ok ? 'up' : 'down',
          latencyMs: cachedProbe.latencyMs,
          failCount: cachedProbe.ok ? 0 : 1,
          checkedAt: cachedProbe.checkedAt,
        });
      }

      const trackRecord: VerifiedSpainTrackRecord = {
        id: `xtream-es-${catPayload.providerId}-${stream.streamId}`,
        label: `${catPayload.providerName} · Castellano · ${qMeta.quality}${qMeta.isHevc ? ' HEVC' : ''}`,
        lang: 'ES',
        quality: qMeta.quality,
        sourceUrl,
        resolverType: 'direct_hls',
        providerId: catPayload.providerId,
        providerName: catPayload.providerName,
        streamId: stream.streamId,
        qualityTier: qMeta.qualityTier,
        isHevc: qMeta.isHevc,
        ...(isFreshProbe ? { latencyMs: cachedProbe.latencyMs, probedOk: cachedProbe.ok } : {}),
      };

      const existing = byKey.get(canonicalKey);
      if (!existing) {
        const tdtMeta = SPANISH_TDT_BY_ID.get(canonicalKey);
        const category = classifySpanishChannelCategory(cleanName, catName);
        const shortMark =
          tdtMeta?.shortMark ||
          cleanName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase()
            .slice(0, 4) ||
          'ES';

        byKey.set(canonicalKey, {
          id: tdtMeta ? tdtMeta.id : `xtream-es-${canonicalKey.replace(/^norm:/, '').replace(/[^a-z0-9-]/gi, '-')}`,
          canonicalKey,
          streamId: stream.streamId,
          dial: tdtMeta?.dial || stream.num || 700 + byKey.size,
          name: cleanName,
          shortMark,
          brandTone: tdtMeta?.brandTone || getProviderBrandTone(category),
          network: tdtMeta?.network || `${catPayload.providerName} · España`,
          category,
          quality: qMeta.quality,
          countryCode: 'ES',
          logoUrl: tdtMeta?.logoUrl || stream.streamIcon,
          description: tdtMeta?.description || `${cleanName} · Señal España en Directo (${catPayload.providerName})`,
          epgChannelId: (tdtMeta as { epgChannelId?: string } | undefined)?.epgChannelId || stream.epgChannelId,
          channels: [trackRecord],
        });
      } else {
        existing.channels.push(trackRecord);
        if (!existing.logoUrl && stream.streamIcon) {
          existing.logoUrl = stream.streamIcon;
        }
      }
    }
  }

  const out: VerifiedSpainChannelEntry[] = [];
  for (const ch of byKey.values()) {
    ch.channels = sortTracksByQualityAndSpeed(ch.channels);
    if (ch.channels[0]) {
      ch.quality = ch.channels[0].quality;
    }
    out.push(ch);
  }
  return out;
}

async function runBenchmarkBatch(
  tracks: VerifiedSpainTrackRecord[],
  perProviderConcurrency = 3,
  timeoutMs = 2600
): Promise<void> {
  const byProvider = new Map<string, VerifiedSpainTrackRecord[]>();
  for (const tr of tracks) {
    const key = `${tr.providerId}:${tr.streamId}`;
    const existing = probeResultCache.get(key);
    if (existing && Date.now() - existing.checkedAt < PROBE_CACHE_TTL_MS) continue;
    const arr = byProvider.get(tr.providerId) || [];
    arr.push(tr);
    byProvider.set(tr.providerId, arr);
  }

  const providerJobs = Array.from(byProvider.entries()).map(async ([, list]) => {
    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const cur = list[idx++];
        const key = `${cur.providerId}:${cur.streamId}`;
        const cached = probeResultCache.get(key);
        if (cached && Date.now() - cached.checkedAt < PROBE_CACHE_TTL_MS) continue;

        const res = await probeXtreamLiveStreamLatency(cur.streamId, cur.providerId, timeoutMs);
        const now = Date.now();
        probeResultCache.set(key, {
          ok: res.ok,
          latencyMs: res.latencyMs,
          lineCount: res.lineCount,
          checkedAt: now,
        });
        channelHealthMonitor.setTrackHealth(cur.sourceUrl, {
          status: res.ok ? 'up' : 'down',
          latencyMs: res.latencyMs,
          failCount: res.ok ? 0 : 1,
          checkedAt: now,
        });
      }
    };
    const workers = Array.from(
      { length: Math.min(perProviderConcurrency, list.length) },
      () => worker()
    );
    await Promise.allSettled(workers);
  });

  await Promise.allSettled(providerJobs);
}

export async function benchmarkSpainLiveChannels(opts?: {
  includeAllChannels?: boolean;
  maxTracksPerProvider?: number;
  timeoutMs?: number;
}): Promise<void> {
  const catalogs = await ensureProviderCatalogsHydrated(2200);
  if (catalogs.length === 0) return;

  const grouped = extractRawSpanishGrouped(catalogs);
  const flagshipQueue: VerifiedSpainTrackRecord[] = [];
  const generalQueue: VerifiedSpainTrackRecord[] = [];

  for (const ch of grouped) {
    const isFlagship = FLAGSHIP_KEY_SET.has(ch.canonicalKey);
    // Pick up to top 2 non-HEVC high-quality candidates per provider for this channel
    const perProvSeen = new Map<string, number>();
    for (const tr of ch.channels) {
      if (tr.qualityTier >= 4) continue; // skip SD during fast probing unless needed
      const cnt = perProvSeen.get(tr.providerId) || 0;
      if (cnt >= 2) continue;
      perProvSeen.set(tr.providerId, cnt + 1);
      if (isFlagship) {
        flagshipQueue.push(tr);
      } else if (opts?.includeAllChannels) {
        generalQueue.push(tr);
      }
    }
  }

  const maxPerProv = opts?.maxTracksPerProvider ?? 45;
  const cappedFlagship: VerifiedSpainTrackRecord[] = [];
  const countByProv = new Map<string, number>();
  for (const tr of flagshipQueue) {
    const n = countByProv.get(tr.providerId) || 0;
    if (n >= maxPerProv) continue;
    countByProv.set(tr.providerId, n + 1);
    cappedFlagship.push(tr);
  }

  await runBenchmarkBatch(cappedFlagship, 3, opts?.timeoutMs ?? 2500);

  if (opts?.includeAllChannels && generalQueue.length > 0) {
    const cappedGeneral: VerifiedSpainTrackRecord[] = [];
    const genByProv = new Map<string, number>();
    for (const tr of generalQueue) {
      const n = genByProv.get(tr.providerId) || 0;
      if (n >= maxPerProv) continue;
      genByProv.set(tr.providerId, n + 1);
      cappedGeneral.push(tr);
    }
    await runBenchmarkBatch(cappedGeneral, 2, opts?.timeoutMs ?? 2400);
  }

  logger.info(
    {
      event: 'spain_live_benchmark_complete',
      flagshipProbed: cappedFlagship.length,
      channelsGrouped: grouped.length,
    },
    'Spanish live IPTV benchmark complete'
  );
}

export async function getVerifiedSpainXtreamChannels(opts?: {
  waitWarmupMs?: number;
  forceReprobe?: boolean;
}): Promise<VerifiedSpainChannelEntry[]> {
  if (!isXtreamEnvConfigured()) return [];

  const catalogs = await ensureProviderCatalogsHydrated(opts?.waitWarmupMs ?? 1800);
  if (catalogs.length === 0) return [];

  if (opts?.forceReprobe) {
    probeResultCache.clear();
  }

  if (probeResultCache.size === 0 || opts?.forceReprobe) {
    if (!warmupPromise) {
      warmupPromise = benchmarkSpainLiveChannels({
        includeAllChannels: false,
        maxTracksPerProvider: 40,
        timeoutMs: 2400,
      })
        .catch(() => undefined)
        .finally(() => {
          warmupPromise = null;
          // Continue probing broader Spanish channels quietly in background
          void benchmarkSpainLiveChannels({
            includeAllChannels: true,
            maxTracksPerProvider: 60,
            timeoutMs: 2400,
          }).catch(() => undefined);
        });
    }
    const waitMs = Math.max(0, opts?.waitWarmupMs ?? 2000);
    if (waitMs > 0) {
      await Promise.race([
        warmupPromise,
        new Promise<void>((resolve) => setTimeout(resolve, waitMs)),
      ]);
    }
  }

  return extractRawSpanishGrouped(catalogs);
}

export function getCachedSpainXtreamChannelsSync(): VerifiedSpainChannelEntry[] {
  if (!isXtreamEnvConfigured()) return [];
  const catalogs = getCachedXtreamProviderCatalogs();
  if (catalogs.length === 0) return [];
  return extractRawSpanishGrouped(catalogs);
}

export function getSpainLiveDiagnosticSummary(): {
  probedTotal: number;
  probedUp: number;
  probedDown: number;
  channels: Array<{
    id: string;
    name: string;
    category: string;
    bestProvider: string;
    bestQuality: string;
    bestLatencyMs?: number;
    trackCount: number;
  }>;
} {
  const catalogs = getCachedXtreamProviderCatalogs();
  const grouped = extractRawSpanishGrouped(catalogs);
  let probedUp = 0;
  let probedDown = 0;
  for (const val of probeResultCache.values()) {
    if (val.ok) probedUp++;
    else probedDown++;
  }
  return {
    probedTotal: probeResultCache.size,
    probedUp,
    probedDown,
    channels: grouped.slice(0, 120).map((ch) => ({
      id: ch.id,
      name: ch.name,
      category: ch.category,
      bestProvider: ch.channels[0]?.providerName || 'N/D',
      bestQuality: ch.channels[0]?.quality || ch.quality,
      bestLatencyMs: ch.channels[0]?.latencyMs,
      trackCount: ch.channels.length,
    })),
  };
}
