/**
 * @module server/services/liveFastResolver
 * @description Ultra-fast hedged concurrent live stream resolver.
 * Launches the top ranked track (Castellano ES + 4K UHD/1080p FHD) immediately,
 * hedges backup mirrors staggered at +220ms and +520ms if not yet resolved,
 * warms Xtream/HLS manifest caches, updates channelHealthMonitor latency, and
 * returns the fastest healthy streamUrl in sub-second latency.
 */
import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
  getPreferredUpstreamUa,
  isDvbHeadendStream,
  maybeSignEasyBroadcastUrl,
  resolveKnownUpstreamReferer,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import { isElahmadUrl, resolveElahmadChannelToHls } from '../extractors/elahmadExtractor.ts';
import { extractLiveSportsHlsDirect } from '../extractors/sportsExtractor.ts';
import { resolveMediasetLiveHlsUrl } from './mediasetLiveService.ts';
import { isAnyBelixConnected, resolveBelixManifest } from './belix/belixXtreamClient.ts';
import { fetchProxiedXtreamManifest } from './xtreamService.ts';
import { resolveProviderLiveManifest } from './providers/xtreamProvidersService.ts';
import { getActiveDvbSessionPath, isDvbUpstreamCoolingDown } from '../routes/proxies/dvbTranscoder.ts';
import {
  extractXtreamLiveHintsFromSportsRequest,
  findXtreamLiveChannelMatches,
} from './xtreamVodMatcher.ts';
import { channelHealthMonitor } from './channelHealthMonitor.ts';
import { inferStreamQualityTag, normalizeLiveTrackLang } from '../../src/utils/channelQualityRanker.ts';
import {
  extractProviderBucket,
  getProviderSteeringPenaltyMs,
  isProviderCircuitOpen,
  recordProviderOutcome,
} from './providerCircuitBreaker.ts';

export interface FastLiveTrackCandidate {
  id?: string;
  label?: string;
  lang?: string;
  quality?: string;
  providerId?: string;
  providerName?: string;
  sourceUrl: string;
  referer?: string;
  resolverType?: string;
  resolvedStreamUrl?: string;
  health?: {
    status?: string;
    latencyMs?: number;
  };
}

export interface FastLiveProbeOutcome {
  ok: boolean;
  streamUrl: string;
  mode: 'hls' | 'embed';
  latencyMs: number;
  statusCode?: number;
}

export interface FastLiveResolveResult {
  ok: boolean;
  winningIndex: number;
  winningTrack: FastLiveTrackCandidate | null;
  streamUrl: string;
  mode: 'hls' | 'embed';
  latencyMs: number;
  fromCache?: boolean;
  checkedCount: number;
  extraTracks?: FastLiveTrackCandidate[];
}

const fastLiveWinnerCache = new LruTtlCache<string, FastLiveResolveResult & { cachedAt?: number }>(
  300,
  90_000
);
const inflightPrewarms = new Map<string, Promise<FastLiveResolveResult>>();

function parseXtreamSource(
  sourceUrl: string
): { streamId: string; providerId: string; isProvidersRoute?: boolean } | null {
  if (!/^\/api\/(?:xtream\/stream\/|providers\/stream\/|stream\b)/i.test(sourceUrl)) return null;
  const provRouteMatch = sourceUrl.match(/^\/api\/providers\/stream\/([^/]+)\/live\/([^.?/]+)(?:\.[^?]*)?(?:\?.*)?$/i);
  if (provRouteMatch) {
    return {
      providerId: decodeURIComponent(provRouteMatch[1]),
      streamId: decodeURIComponent(provRouteMatch[2]),
      isProvidersRoute: true,
    };
  }
  if (sourceUrl.startsWith('/api/xtream/stream/')) {
    const rawId = sourceUrl.split('/').pop()?.split('?')[0]?.replace(/\.m3u8.*$/i, '') || '';
    let providerId = 'primary';
    try {
      const parsed = new URL(sourceUrl, 'http://localhost');
      providerId = parsed.searchParams.get('provider') || 'primary';
    } catch {
      // ignore
    }
    return rawId ? { streamId: rawId, providerId } : null;
  }
  try {
    const parsed = new URL(sourceUrl, 'http://localhost');
    const type = (parsed.searchParams.get('type') || 'live').toLowerCase();
    if (type !== 'live') return null;
    const streamId = (parsed.searchParams.get('id') || '').replace(/\.m3u8$/i, '').trim();
    const providerId = parsed.searchParams.get('provider') || 'primary';
    return streamId ? { streamId, providerId } : null;
  } catch {
    return null;
  }
}

export async function defaultProbeSingleLiveTrack(
  track: FastLiveTrackCandidate,
  opts: {
    publicOrigin: string;
    belixSessionKey: string;
    titleHint?: string;
    timeoutMs: number;
  }
): Promise<FastLiveProbeOutcome> {
  const startedAt = Date.now();
  const sourceUrl = String(track.sourceUrl || '').trim();
  const rt = String(track.resolverType || 'tdt_hls');
  if (!sourceUrl) {
    return { ok: false, streamUrl: '', mode: 'hls', latencyMs: 1, statusCode: 400 };
  }

  if (rt === 'web_embed') {
    return {
      ok: true,
      streamUrl: sourceUrl,
      mode: 'embed',
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  }

  // 1. Xtream provider stream (/api/stream, /api/xtream/stream, or /api/providers/stream) -> populates RAM cache too!
  const xtreamRef = parseXtreamSource(sourceUrl);
  if (xtreamRef) {
    try {
      const manifest = await Promise.race([
        xtreamRef.isProvidersRoute
          ? resolveProviderLiveManifest(xtreamRef.providerId, xtreamRef.streamId, '')
          : fetchProxiedXtreamManifest(xtreamRef.streamId, '', xtreamRef.providerId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), opts.timeoutMs)),
      ]);
      const lat = Math.max(1, Date.now() - startedAt);
      const hasPlayableEntries =
        Boolean(manifest) &&
        manifest!.includes('#EXTM3U') &&
        (manifest!.includes('#EXTINF') || manifest!.includes('#EXT-X-STREAM-INF')) &&
        !/nosignal/i.test(manifest!);
      if (hasPlayableEntries) {
        return {
          ok: true,
          streamUrl: sourceUrl,
          mode: 'hls',
          latencyMs: lat,
          statusCode: 200,
        };
      }
      return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 503 };
    } catch {
      return {
        ok: false,
        streamUrl: '',
        mode: 'hls',
        latencyMs: Math.max(1, Date.now() - startedAt),
        statusCode: 502,
      };
    }
  }

  // 2. Belix edge stream
  if (sourceUrl.startsWith('/api/belix/stream/')) {
    if (!isAnyBelixConnected(opts.belixSessionKey)) {
      return { ok: false, streamUrl: '', mode: 'hls', latencyMs: 1, statusCode: 503 };
    }
    const belixStreamId = sourceUrl.split('/').pop()?.replace(/\.m3u8.*$/i, '') || '';
    const manifest = await Promise.race([
      resolveBelixManifest(belixStreamId, opts.publicOrigin, opts.belixSessionKey, opts.titleHint || ''),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), opts.timeoutMs)),
    ]).catch(() => null);
    const lat = Math.max(1, Date.now() - startedAt);
    if (manifest) {
      return { ok: true, streamUrl: sourceUrl, mode: 'hls', latencyMs: lat, statusCode: 200 };
    }
    return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 503 };
  }

  // 3. Mediaset Mitele dynamic live resolver
  if (rt === 'mediaset_live') {
    const resolved = await Promise.race([
      resolveMediasetLiveHlsUrl(sourceUrl),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), opts.timeoutMs)),
    ]).catch(() => null);
    const lat = Math.max(1, Date.now() - startedAt);
    if (resolved?.streamUrl) {
      const proxyUrl = buildHlsProxyUrl(resolved.streamUrl, resolved.referer);
      return { ok: true, streamUrl: proxyUrl, mode: 'hls', latencyMs: lat, statusCode: 200 };
    }
    return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 403 };
  }

  // 4. Elahmad dynamic live resolver
  if (rt === 'elahmad_live' || isElahmadUrl(sourceUrl)) {
    const resolved = await Promise.race([
      resolveElahmadChannelToHls(sourceUrl),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), opts.timeoutMs)),
    ]).catch(() => null);
    const lat = Math.max(1, Date.now() - startedAt);
    if (resolved?.streamUrl && !resolved.isYoutube) {
      const signed = await maybeSignEasyBroadcastUrl(resolved.streamUrl);
      const proxyUrl = buildHlsProxyUrl(signed, resolved.referer);
      return { ok: true, streamUrl: proxyUrl, mode: 'hls', latencyMs: lat, statusCode: 200 };
    }
    return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 502 };
  }

  // 4B. Dynamic external sports_channel mirrors (footunder, streamxhd, tilinhd, etc.)
  if (rt === 'sports_channel' || /footunder\.online|streamxhd\.|tilinhd\./i.test(sourceUrl)) {
    if (isProviderCircuitOpen(sourceUrl, track.providerId)) {
      return { ok: false, streamUrl: '', mode: 'hls', latencyMs: 1, statusCode: 503 };
    }
    const fullTarget = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`;
    const directSports = await Promise.race([
      extractLiveSportsHlsDirect(fullTarget),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.min(opts.timeoutMs, 14_000))),
    ]).catch(() => null);
    const lat = Math.max(1, Date.now() - startedAt);
    if (directSports && directSports.streamUrl && !directSports.isBrokenGreenFeed) {
      const proxiedUrl = directSports.isDirectMp4
        ? buildTsProxyUrl(directSports.streamUrl, directSports.referer)
        : buildHlsProxyUrl(directSports.streamUrl, directSports.referer);
      return { ok: true, streamUrl: proxiedUrl, mode: 'hls', latencyMs: lat, statusCode: 200 };
    }
    return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 502 };
  }

  // 5. Local proxied streams: unwrap /api/hls-proxy?url=... to verify upstream health instead of blind-passing dead streams
  if (sourceUrl.startsWith('/api/hls-proxy')) {
    try {
      const inner = new URL(sourceUrl, 'http://localhost').searchParams.get('url');
      if (inner && /^https?:\/\//i.test(inner)) {
        const cleanInner = await maybeSignEasyBroadcastUrl(inner);
        const referer =
          resolveKnownUpstreamReferer(cleanInner, track.referer) || `${new URL(cleanInner).origin}/`;
        const res = await streamingFetch(cleanInner, {
          method: 'GET',
          headers: {
            'User-Agent': getPreferredUpstreamUa(cleanInner),
            Referer: referer,
            Accept: '*/*',
          },
          timeoutMs: opts.timeoutMs,
        });
        const lat = Math.max(1, Date.now() - startedAt);
        if (!res.ok) {
          if (res.body) void res.body.cancel().catch(() => undefined);
          return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: res.status };
        }
        const txt = await res.text();
        if (txt.includes('#EXTM3U') && (txt.includes('#EXTINF') || txt.includes('#EXT-X-STREAM-INF')) && !/nosignal/i.test(txt)) {
          return { ok: true, streamUrl: sourceUrl, mode: 'hls', latencyMs: lat, statusCode: 200 };
        }
        return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 502 };
      }
    } catch {
      return {
        ok: false,
        streamUrl: '',
        mode: 'hls',
        latencyMs: Math.max(1, Date.now() - startedAt),
        statusCode: 502,
      };
    }
  }

  if (sourceUrl.startsWith('/api/')) {
    if (sourceUrl.startsWith('/api/dvb-live/playlist.m3u8')) {
      return { ok: false, streamUrl: '', mode: 'hls', latencyMs: 1, statusCode: 404 };
    }
    return {
      ok: true,
      streamUrl: sourceUrl,
      mode: 'hls',
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  }

  // 6. Direct upstream HLS URLs: probe reachability and wrap via proxy cleanly
  if (rt === 'tdt_hls' || rt === 'direct_hls' || /\.m3u8(\?|$)/i.test(sourceUrl)) {
    const cleanUrl = await maybeSignEasyBroadcastUrl(
      sourceUrl.replace(/[?&]profile=(hd|fast)\b/gi, '')
    );
    const isDvb = isDvbHeadendStream(cleanUrl);
    if (isDvb) {
      const warmDvbPath = getActiveDvbSessionPath(cleanUrl, 'hd');
      if (warmDvbPath) {
        return {
          ok: true,
          streamUrl: warmDvbPath,
          mode: 'hls',
          latencyMs: Math.max(1, Date.now() - startedAt),
          statusCode: 200,
        };
      }
      if (isDvbUpstreamCoolingDown(cleanUrl)) {
        return {
          ok: false,
          streamUrl: '',
          mode: 'hls',
          latencyMs: Math.max(1, Date.now() - startedAt),
          statusCode: 503,
        };
      }
    }
    const referer = resolveKnownUpstreamReferer(cleanUrl, track.referer) || `${new URL(cleanUrl).origin}/`;
    try {
      const res = await streamingFetch(cleanUrl, {
        method: 'GET',
        headers: {
          'User-Agent': getPreferredUpstreamUa(cleanUrl),
          Referer: referer,
          Accept: '*/*',
        },
        timeoutMs: Math.min(opts.timeoutMs, isDvb ? 12_000 : opts.timeoutMs),
      });
      const lat = Math.max(1, Date.now() - startedAt);
      if (!res.ok) {
        if (res.body) void res.body.cancel().catch(() => undefined);
        return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: res.status };
      }
      const txt = await res.text();
      if (txt.includes('#EXTM3U') && (txt.includes('#EXTINF') || txt.includes('#EXT-X-STREAM-INF')) && !/nosignal/i.test(txt)) {
        const proxyUrl = buildHlsProxyUrl(res.url || cleanUrl, referer, isDvb);
        return { ok: true, streamUrl: proxyUrl, mode: 'hls', latencyMs: lat, statusCode: 200 };
      }
      return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 404 };
    } catch {
      return {
        ok: false,
        streamUrl: '',
        mode: 'hls',
        latencyMs: Math.max(1, Date.now() - startedAt),
        statusCode: 502,
      };
    }
  }

  return {
    ok: false,
    streamUrl: '',
    mode: 'hls',
    latencyMs: Math.max(1, Date.now() - startedAt),
    statusCode: 400,
  };
}

export function orderCandidatesForFastResolve(
  tracks: FastLiveTrackCandidate[],
  opts?: { preferLang?: string; preferQualityFirst?: boolean }
): Array<{ originalIndex: number; track: FastLiveTrackCandidate }> {
  const preferLang = String(opts?.preferLang || 'ES').toUpperCase();
  const qualityFirst = Boolean(opts?.preferQualityFirst) || preferLang === 'QUALITY';
  const healthMap = channelHealthMonitor.getAllTrackStatuses();

  const indexed = tracks.map((track, originalIndex) => {
    const liveHealth = healthMap[String(track.sourceUrl || '').trim()] || track.health;
    const status = liveHealth?.status ?? 'unknown';
    const circuitOpen = isProviderCircuitOpen(track.sourceUrl, track.providerId);
    const statusRank =
      status === 'up'
        ? 0
        : circuitOpen
        ? 3
        : status === 'unknown'
        ? 1
        : status === 'degraded'
        ? 2
        : 4;
    const normLang = normalizeLiveTrackLang(track.lang, track.label);
    const langRank = qualityFirst
      ? 0
      : normLang === preferLang
      ? 0
      : normLang === 'ES'
      ? 1
      : normLang === 'LAT'
      ? 2
      : normLang === 'EN'
      ? 3
      : 4;
    const isEmbed = track.resolverType === 'web_embed';
    const src = String(track.sourceUrl || '');
    const isResidentialDvb = /90\.163\.85\.113(?:%3A|:)8093/i.test(src);
    const isSportsScraper =
      track.resolverType === 'sports_channel' || /footunder\.online|streamxhd\.|tilinhd\./i.test(src);
    const q = inferStreamQualityTag(track.quality, track.label, src);
    const steeringPenalty = getProviderSteeringPenaltyMs(src, track.providerId);
    const lat =
      typeof liveHealth?.latencyMs === 'number'
        ? Math.min(9999, Math.round(liveHealth.latencyMs * 0.7 + steeringPenalty * 0.3))
        : steeringPenalty;
    const score =
      statusRank * 1000000 +
      (isEmbed ? 500000 : 0) +
      (isSportsScraper ? 220000 : 0) +
      (isResidentialDvb ? 180000 : 0) +
      langRank * 10000 +
      Math.round(q.tier * 1000) +
      Math.round(lat / 10);
    return { originalIndex, track, score };
  });

  indexed.sort((a, b) => a.score - b.score || a.originalIndex - b.originalIndex);
  return indexed.map(({ originalIndex, track }) => ({ originalIndex, track }));
}

export async function raceFastLiveTracks(
  tracks: FastLiveTrackCandidate[],
  opts: {
    channelId?: string;
    titleHint?: string;
    broadcasters?: string[];
    competition?: string;
    preferLang?: string;
    preferQualityFirst?: boolean;
    publicOrigin?: string;
    belixSessionKey?: string;
    timeoutMs?: number;
    hedgeDelayMs?: number;
    hedgeSecondaryDelayMs?: number;
    probeImpl?: typeof defaultProbeSingleLiveTrack;
  } = {}
): Promise<FastLiveResolveResult> {
  const safeTracks = Array.isArray(tracks) ? tracks.filter((t) => Boolean(t?.sourceUrl)) : [];
  if (safeTracks.length === 0) {
    return {
      ok: false,
      winningIndex: -1,
      winningTrack: null,
      streamUrl: '',
      mode: 'hls',
      latencyMs: 0,
      checkedCount: 0,
    };
  }

  const preferLang = String(opts.preferLang || 'ES').toUpperCase();
  const qualityFirst = Boolean(opts.preferQualityFirst);
  const cacheKey = `${opts.channelId || safeTracks[0].sourceUrl}|${preferLang}|${qualityFirst ? 'q1' : 'q0'}`;
  const cachedWinner = fastLiveWinnerCache.get(cacheKey);
  if (cachedWinner && cachedWinner.ok) {
    const ageMs = Date.now() - (cachedWinner.cachedAt || 0);
    if (ageMs > 45_000 && !inflightPrewarms.has(cacheKey)) {
      // Stale-while-revalidate refresh in background without blocking playback
      fastLiveWinnerCache.delete(cacheKey);
      void raceFastLiveTracks(safeTracks, opts).catch(() => undefined);
    }
    return { ...cachedWinner, fromCache: true };
  }

  const existingInflight = inflightPrewarms.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  const getCandidateProviderBucket = (tr: FastLiveTrackCandidate): string => {
    const pid = String(tr.providerId || '').trim().toLowerCase();
    if (pid) return pid;
    const src = String(tr.sourceUrl || '').trim();
    const xRef = parseXtreamSource(src);
    if (xRef) return `xtream:${xRef.providerId.toLowerCase()}`;
    if (src.startsWith('/api/belix/')) return 'belix';
    try {
      const inner = src.startsWith('/api/hls-proxy')
        ? new URL(src, 'http://localhost').searchParams.get('url') || src
        : src;
      if (/^https?:\/\//i.test(inner)) {
        return new URL(inner).hostname.toLowerCase();
      }
    } catch {
      // ignore
    }
    return src.slice(0, 48);
  };

  const selectProviderDiversePool = (
    ranked: Array<{ originalIndex: number; track: FastLiveTrackCandidate }>,
    limit = 14
  ): Array<{ originalIndex: number; track: FastLiveTrackCandidate }> => {
    const picked: Array<{ originalIndex: number; track: FastLiveTrackCandidate }> = [];
    const seenIdx = new Set<number>();
    const seenProviders = new Set<string>();
    // Pass 1: ensure at least 1 signal from every distinct provider/host
    for (const item of ranked) {
      const bucket = getCandidateProviderBucket(item.track);
      if (seenProviders.has(bucket)) continue;
      seenProviders.add(bucket);
      seenIdx.add(item.originalIndex);
      picked.push(item);
      if (picked.length >= limit) return picked;
    }
    // Pass 2: fill remaining race slots with next highest-priority backups
    for (const item of ranked) {
      if (seenIdx.has(item.originalIndex)) continue;
      seenIdx.add(item.originalIndex);
      picked.push(item);
      if (picked.length >= limit) break;
    }
    return picked;
  };

  const isVodOrSeries =
    String(opts.channelId || '').startsWith('xtream-vod-') ||
    String(opts.channelId || '').startsWith('xtream-ser-') ||
    safeTracks.some(
      (t) =>
        /[?&]type=(?:vod|series)(?:&|$)/i.test(String(t.sourceUrl || '')) ||
        /^\/api\/(?:providers\/stream\/[^/]+\/(?:movie|series)\/|xtream\/vod\/)/i.test(
          String(t.sourceUrl || '')
        ) ||
        /\.(mp4|mkv|webm|avi)(\?|$)/i.test(String(t.sourceUrl || ''))
    );

  // Only do synchronous Xtream discovery if the caller supplied fewer than 4 distinct healthy providers
  const initialDistinctHealthyProviders = new Set<string>();
  for (const tr of safeTracks) {
    if (tr.health?.status === 'down' || isProviderCircuitOpen(tr.sourceUrl, tr.providerId)) continue;
    if (tr.resolverType === 'sports_channel' && /footunder\.online|streamxhd\.|tilinhd\./i.test(tr.sourceUrl)) continue;
    initialDistinctHealthyProviders.add(getCandidateProviderBucket(tr));
  }

  let discoveredExtraTracks: FastLiveTrackCandidate[] = [];
  if (!opts.probeImpl && !isVodOrSeries && initialDistinctHealthyProviders.size < 4) {
    const hintPool = new Set<string>();
    if (opts.channelId === 'mux-champions' || /liga\s*de\s*campeones/i.test(String(opts.titleHint || ''))) {
      hintPool.add('M+ Liga de Campeones');
      hintPool.add('Liga de Campeones');
    }
    if (Array.isArray(opts.broadcasters)) {
      for (const b of opts.broadcasters) {
        const cleanB = String(b || '').trim();
        if (cleanB.length >= 3) hintPool.add(cleanB);
      }
    }
    if (opts.competition && hintPool.size === 0) {
      const compLower = String(opts.competition).toLowerCase();
      if (/champions|ucl|europa league|conference league/i.test(compLower)) {
        hintPool.add('M+ Liga de Campeones');
        hintPool.add('Liga de Campeones');
        hintPool.add('TNT Sports');
      } else if (/laliga|la liga|primera divisi|copa del rey/i.test(compLower)) {
        hintPool.add('M+ LaLiga');
        hintPool.add('DAZN LaLiga');
        hintPool.add('LaLiga TV');
      } else if (/premier league|epl/i.test(compLower)) {
        hintPool.add('DAZN 1');
        hintPool.add('DAZN 2');
        hintPool.add('Sky Sports Premier League');
      } else if (/serie a|bundesliga|ligue 1/i.test(compLower)) {
        hintPool.add('M+ Liga de Campeones');
        hintPool.add('Eurosport');
        hintPool.add('DAZN 1');
      } else if (/f1|formula\s*1|motogp/i.test(compLower)) {
        hintPool.add('DAZN F1');
      } else if (/nba|euroliga|acb/i.test(compLower)) {
        hintPool.add('M+ Deportes');
      }
    }
    if (opts.titleHint) {
      const cleanTitle = String(opts.titleHint || '')
        .replace(/\b(?:hd|fhd|uhd|4k|1080p|720p|sd|tv|oficial|directo)\b/gi, ' ')
        .replace(/[|·•\-()[\]]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const isVsMatchTitle = /\s+(?:vs\.?|v)\s+/i.test(cleanTitle);
      if (cleanTitle.length >= 2 && (!isVsMatchTitle || hintPool.size === 0)) {
        hintPool.add(cleanTitle);
      }
    }
    if (opts.channelId) {
      const idSlug = String(opts.channelId)
        .replace(/^(?:tdt-|mux-|mplus-|dazn-|intl-|sport-ch-|rbtv-|news-|eu-|uk-|espn-|dsports-|belix-|xtream-[a-z0-9-]+-)/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      if (idSlug.length >= 3 && !/^\d+$/.test(idSlug) && idSlug.toLowerCase() !== 'champions') {
        hintPool.add(idSlug);
      }
    }
    for (const tr of safeTracks) {
      for (const h of extractXtreamLiveHintsFromSportsRequest(tr.sourceUrl, tr.label, opts.titleHint)) {
        hintPool.add(h);
      }
    }
    const hints = Array.from(hintPool);
    if (hints.length > 0) {
      const xtreamMatches = await Promise.race([
        findXtreamLiveChannelMatches({
          channelHints: hints,
          preferLang,
          limit: 24,
        }).catch(() => []),
        new Promise<TrackRecord[]>((resolve) => setTimeout(() => resolve([]), 380)),
      ]);
      const existingUrls = new Set(safeTracks.map((t) => String(t.sourceUrl || '').trim()));
      for (const m of xtreamMatches) {
        if (!m.sourceUrl || existingUrls.has(m.sourceUrl)) continue;
        existingUrls.add(m.sourceUrl);
        const mAny = m as TrackRecord & { providerId?: string; providerName?: string };
        discoveredExtraTracks.push({
          id: m.id,
          label: m.label,
          lang: m.lang,
          quality: m.quality,
          providerId: mAny.providerId,
          providerName: mAny.providerName,
          sourceUrl: m.sourceUrl,
          resolverType: m.resolverType || 'direct_hls',
        });
      }
    }
  }

  const combinedPool: FastLiveTrackCandidate[] = [...safeTracks, ...discoveredExtraTracks];
  const ordered = selectProviderDiversePool(
    orderCandidatesForFastResolve(combinedPool, {
      preferLang,
      preferQualityFirst: qualityFirst,
    }),
    14
  );

  const probeImpl = opts.probeImpl || defaultProbeSingleLiveTrack;
  const timeoutMs = Math.min(15_000, opts.timeoutMs ?? 15_000);
  const hedgeDelay1 = opts.hedgeDelayMs ?? 150;
  const hedgeDelay2 = opts.hedgeSecondaryDelayMs ?? 420;
  const publicOrigin = opts.publicOrigin || '';
  const belixSessionKey = opts.belixSessionKey || 'default';

  const runRace = async (): Promise<FastLiveResolveResult> => {
    const startedAt = Date.now();
    const deadlineAt = startedAt + timeoutMs + 120;
    let settled = false;
    let checkedCount = 0;

    return new Promise<FastLiveResolveResult>((resolve) => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      let pendingCount = ordered.length;
      let embedFallback: { originalIndex: number; track: FastLiveTrackCandidate; out: FastLiveProbeOutcome } | null = null;

      const finish = (res: FastLiveResolveResult) => {
        if (settled) return;
        settled = true;
        for (const t of timers) clearTimeout(t);
        const finalRes: FastLiveResolveResult =
          discoveredExtraTracks.length > 0
            ? { ...res, extraTracks: discoveredExtraTracks }
            : res;
        if (finalRes.ok && (isVodOrSeries || finalRes.mode === 'hls' || discoveredExtraTracks.length > 0)) {
          fastLiveWinnerCache.set(cacheKey, { ...finalRes, cachedAt: Date.now() });
        }
        resolve(finalRes);
      };

      const hardDeadlineTimer = setTimeout(() => {
        if (settled) return;
        if (embedFallback) {
          finish({
            ok: true,
            winningIndex: embedFallback.originalIndex,
            winningTrack: embedFallback.track,
            streamUrl: embedFallback.out.streamUrl,
            mode: 'embed',
            latencyMs: Math.max(1, Date.now() - startedAt),
            checkedCount,
          });
          return;
        }
        finish({
          ok: false,
          winningIndex: 0,
          winningTrack: ordered[0]?.track || safeTracks[0],
          streamUrl: ordered[0]?.track.sourceUrl || safeTracks[0].sourceUrl,
          mode: 'hls',
          latencyMs: Math.max(1, Date.now() - startedAt),
          checkedCount,
        });
      }, timeoutMs + 200);
      timers.push(hardDeadlineTimer);

      const checkAllDone = () => {
        if (!settled && pendingCount <= 0) {
          if (embedFallback) {
            finish({
              ok: true,
              winningIndex: embedFallback.originalIndex,
              winningTrack: embedFallback.track,
              streamUrl: embedFallback.out.streamUrl,
              mode: 'embed',
              latencyMs: embedFallback.out.latencyMs,
              checkedCount,
            });
            return;
          }
          finish({
            ok: false,
            winningIndex: 0,
            winningTrack: ordered[0]?.track || safeTracks[0],
            streamUrl: ordered[0]?.track.sourceUrl || safeTracks[0].sourceUrl,
            mode: 'hls',
            latencyMs: Math.max(1, Date.now() - startedAt),
            checkedCount,
          });
        }
      };

      const launchCandidate = (cand: { originalIndex: number; track: FastLiveTrackCandidate }) => {
        const remainingMs = deadlineAt - Date.now();
        if (settled || remainingMs < 200) {
          pendingCount -= 1;
          checkAllDone();
          return;
        }
        checkedCount += 1;
        const bucket = extractProviderBucket(cand.track.sourceUrl, cand.track.providerId);
        probeImpl(cand.track, {
          publicOrigin,
          belixSessionKey,
          titleHint: opts.titleHint,
          timeoutMs: Math.max(400, Math.min(14_800, remainingMs)),
        })
          .then((out) => {
            recordProviderOutcome(bucket, { ok: out.ok, latencyMs: out.latencyMs });
            if (out.ok && out.streamUrl) {
              if (out.mode === 'hls') {
                channelHealthMonitor.setTrackHealth(cand.track.sourceUrl, {
                  status: out.latencyMs <= 1800 ? 'up' : 'degraded',
                  latencyMs: out.latencyMs,
                  failCount: 0,
                  checkedAt: Date.now(),
                  statusCode: out.statusCode ?? 200,
                });
                finish({
                  ok: true,
                  winningIndex: cand.originalIndex,
                  winningTrack: cand.track,
                  streamUrl: out.streamUrl,
                  mode: 'hls',
                  latencyMs: out.latencyMs,
                  checkedCount,
                });
                return;
              }
              if (!embedFallback) {
                embedFallback = { ...cand, out };
              }
            } else {
              channelHealthMonitor.setTrackHealth(cand.track.sourceUrl, {
                status: 'down',
                latencyMs: out.latencyMs,
                failCount: 1,
                checkedAt: Date.now(),
                statusCode: out.statusCode ?? 502,
              });
            }
          })
          .catch(() => {
            recordProviderOutcome(bucket, { ok: false });
            channelHealthMonitor.setTrackHealth(cand.track.sourceUrl, {
              status: 'down',
              failCount: 1,
              checkedAt: Date.now(),
            });
          })
          .finally(() => {
            pendingCount -= 1;
            checkAllDone();
          });
      };

      // Wave 1 (t=0): Launch top 3 distinct healthy provider candidates immediately
      for (const c of ordered.slice(0, 3)) {
        launchCandidate(c);
      }

      // Wave 2 (t=+hedgeDelay1): Hedge candidates 3..7
      if (ordered.length > 3) {
        const wave2 = setTimeout(() => {
          if (settled) return;
          for (const c of ordered.slice(3, 7)) {
            launchCandidate(c);
          }
        }, hedgeDelay1);
        timers.push(wave2);
      }

      // Wave 3 (t=+hedgeDelay2): Hedge remaining provider candidates
      if (ordered.length > 7) {
        const wave3 = setTimeout(() => {
          if (settled) return;
          for (const c of ordered.slice(7)) {
            launchCandidate(c);
          }
        }, hedgeDelay2);
        timers.push(wave3);
      }
    });
  };

  const p = runRace().finally(() => {
    inflightPrewarms.delete(cacheKey);
  });
  inflightPrewarms.set(cacheKey, p);
  return p;
}

export function clearFastLiveResolverCache(): void {
  fastLiveWinnerCache.clear();
  inflightPrewarms.clear();
}

export type { TrackRecord };
