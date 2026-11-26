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
import {
  getProvidersStatusSummary,
  resolveProviderLiveManifest,
} from './providers/xtreamProvidersService.ts';
import {
  getProviderStatusSummaries,
  probeProviderOpaqueSegment,
  resolveProviderLiveManifest as resolveMultiProviderLiveManifest,
} from './providers/xtreamMultiProviderService.ts';
import { getActiveDvbSessionPath, isDvbUpstreamCoolingDown } from '../routes/proxies/dvbTranscoder.ts';
import {
  deriveNextPredictedSegmentUrl,
  getCachedLiveManifest,
  prefetchLiveTsSegment,
  setCachedLiveManifest,
} from '../routes/proxies/liveSegmentCache.ts';
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
  backupStreamUrl?: string;
  mode: 'hls' | 'embed';
  latencyMs: number;
  fromCache?: boolean;
  checkedCount: number;
  extraTracks?: FastLiveTrackCandidate[];
}

function prewarmMediaManifestIntoCache(
  manifestText: string,
  baseUrl: string,
  referer: string,
  isDvb: boolean
): void {
  if (!manifestText || !baseUrl || isDvb || /#EXT-X-STREAM-INF/i.test(manifestText)) return;
  setCachedLiveManifest(baseUrl, manifestText, baseUrl);
  const segUrls: string[] = [];
  for (const raw of manifestText.split(/\r?\n/)) {
    const tr = raw.trim();
    if (!tr || tr.startsWith('#')) continue;
    try {
      const abs = new URL(tr, baseUrl).href;
      if (!/\.m3u8(\?|$)/i.test(abs)) {
        segUrls.push(abs);
      }
    } catch {
      // ignore invalid URI
    }
  }
  if (segUrls.length > 0) {
    const ua = getPreferredUpstreamUa(baseUrl);
    for (const segUrl of segUrls.slice(-2)) {
      prefetchLiveTsSegment(segUrl, referer, ua).catch(() => {});
    }
    const predicted = deriveNextPredictedSegmentUrl(segUrls[segUrls.length - 1]);
    if (predicted) {
      prefetchLiveTsSegment(predicted, referer, ua).catch(() => {});
    }
  }
}

const fastLiveWinnerCache = new LruTtlCache<string, FastLiveResolveResult & { cachedAt?: number }>(
  300,
  90_000
);
const inflightPrewarms = new Map<string, Promise<FastLiveResolveResult>>();

export const MAX_LIVE_PROBE_CONCURRENCY = 10;
let activeLiveProbes = 0;
let peakActiveLiveProbes = 0;
const liveProbeWaitQueue: Array<() => void> = [];

export function getLiveProbeConcurrencyStats(): {
  active: number;
  queued: number;
  peakActive: number;
  maxConcurrency: number;
} {
  return {
    active: activeLiveProbes,
    queued: liveProbeWaitQueue.length,
    peakActive: peakActiveLiveProbes,
    maxConcurrency: MAX_LIVE_PROBE_CONCURRENCY,
  };
}

export function resetLiveProbeConcurrencyStats(): void {
  peakActiveLiveProbes = activeLiveProbes;
}

async function runWithBoundedLiveProbeSlot<T>(
  deadlineAt: number,
  fn: (remainingMs: number) => Promise<T>,
  onTimeout: () => T
): Promise<T> {
  if (Date.now() >= deadlineAt) {
    return onTimeout();
  }
  if (activeLiveProbes >= MAX_LIVE_PROBE_CONCURRENCY) {
    const acquired = await new Promise<boolean>((resolve) => {
      const waitMs = Math.max(10, deadlineAt - Date.now());
      let done = false;
      const grant = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        const idx = liveProbeWaitQueue.indexOf(grant);
        if (idx >= 0) liveProbeWaitQueue.splice(idx, 1);
        resolve(false);
      }, waitMs);
      liveProbeWaitQueue.push(grant);
    });
    if (!acquired || Date.now() >= deadlineAt) {
      return onTimeout();
    }
  }
  activeLiveProbes += 1;
  if (activeLiveProbes > peakActiveLiveProbes) {
    peakActiveLiveProbes = activeLiveProbes;
  }
  try {
    const remainingMs = Math.max(250, deadlineAt - Date.now());
    return await fn(remainingMs);
  } finally {
    activeLiveProbes = Math.max(0, activeLiveProbes - 1);
    const next = liveProbeWaitQueue.shift();
    if (next) next();
  }
}

function parseXtreamSource(
  sourceUrl: string
): {
  streamId: string;
  providerId: string;
  isProvidersRoute?: boolean;
  isMultiProviderLive?: boolean;
} | null {
  if (!/^\/api\/(?:xtream\/stream\/|providers\/(?:stream|live)\/|stream\b)/i.test(sourceUrl)) return null;
  const multiLiveMatch = sourceUrl.match(/^\/api\/providers\/live\/([^/]+)\/([^.?/]+)(?:\.[^?]*)?(?:\?.*)?$/i);
  if (multiLiveMatch) {
    return {
      providerId: decodeURIComponent(multiLiveMatch[1]),
      streamId: decodeURIComponent(multiLiveMatch[2]),
      isMultiProviderLive: true,
    };
  }
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
    allowTranscodeFallback?: boolean;
  }
): Promise<FastLiveProbeOutcome> {
  const startedAt = Date.now();
  const probeTimeoutMs = Math.max(350, Math.min(1_500, opts.timeoutMs));
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
      const allowTranscode = opts.allowTranscodeFallback ?? false;
      const manifest = await Promise.race([
        xtreamRef.isMultiProviderLive
          ? resolveMultiProviderLiveManifest(xtreamRef.providerId, xtreamRef.streamId, '', {
              allowTranscodeFallback: allowTranscode,
              probeTimeoutMs,
            })
          : xtreamRef.isProvidersRoute
          ? resolveProviderLiveManifest(xtreamRef.providerId, xtreamRef.streamId, '', {
              allowTranscodeFallback: allowTranscode,
              probeTimeoutMs,
            })
          : fetchProxiedXtreamManifest(xtreamRef.streamId, '', xtreamRef.providerId, undefined, {
              allowTranscodeFallback: allowTranscode,
              probeTimeoutMs,
            }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), probeTimeoutMs)),
      ]);
      const lat = Math.max(1, Date.now() - startedAt);
      const hasPlayableEntries =
        Boolean(manifest) &&
        manifest!.includes('#EXTM3U') &&
        (manifest!.includes('#EXTINF') || manifest!.includes('#EXT-X-STREAM-INF')) &&
        !/nosignal/i.test(manifest!);
      if (hasPlayableEntries) {
        if (xtreamRef.isMultiProviderLive && !process.env.VITEST) {
          const segMatch = manifest!.match(/\/api\/providers\/seg\/([a-f0-9]+)\.ts/i);
          if (segMatch?.[1]) {
            const segTimeout = Math.max(350, Math.min(1_000, probeTimeoutMs - lat));
            const segOk = await probeProviderOpaqueSegment(segMatch[1], segTimeout).catch(() => false);
            if (!segOk) {
              return {
                ok: false,
                streamUrl: '',
                mode: 'hls',
                latencyMs: Math.max(1, Date.now() - startedAt),
                statusCode: 502,
              };
            }
          }
        }
        return {
          ok: true,
          streamUrl: sourceUrl,
          mode: 'hls',
          latencyMs: Math.max(1, Date.now() - startedAt),
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
      new Promise<null>((resolve) => setTimeout(() => resolve(null), probeTimeoutMs)),
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
      new Promise<null>((resolve) => setTimeout(() => resolve(null), probeTimeoutMs)),
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
      new Promise<null>((resolve) => setTimeout(() => resolve(null), probeTimeoutMs)),
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
      new Promise<null>((resolve) => setTimeout(() => resolve(null), probeTimeoutMs)),
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
        if (isProviderCircuitOpen(inner, track.providerId)) {
          return { ok: false, streamUrl: '', mode: 'hls', latencyMs: 1, statusCode: 503 };
        }
        const cleanInner = await maybeSignEasyBroadcastUrl(inner);
        const referer =
          resolveKnownUpstreamReferer(cleanInner, track.referer) || `${new URL(cleanInner).origin}/`;
        const cachedManifest = getCachedLiveManifest(cleanInner);
        if (cachedManifest) {
          prewarmMediaManifestIntoCache(
            cachedManifest.text,
            cachedManifest.baseUrl || cleanInner,
            referer,
            isDvbHeadendStream(cleanInner)
          );
          return {
            ok: true,
            streamUrl: sourceUrl,
            mode: 'hls',
            latencyMs: Math.max(1, Date.now() - startedAt),
            statusCode: 200,
          };
        }
        const res = await streamingFetch(cleanInner, {
          method: 'GET',
          headers: {
            'User-Agent': getPreferredUpstreamUa(cleanInner),
            Referer: referer,
            Accept: '*/*',
          },
          keepAliveAgent: true,
          timeoutMs: probeTimeoutMs,
        });
        const lat = Math.max(1, Date.now() - startedAt);
        if (!res.ok) {
          if (res.body) void res.body.cancel().catch(() => undefined);
          return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: res.status };
        }
        const txt = await res.text();
        if (txt.includes('#EXTM3U') && (txt.includes('#EXTINF') || txt.includes('#EXT-X-STREAM-INF')) && !/nosignal/i.test(txt)) {
          const finalInner = res.url || cleanInner;
          setCachedLiveManifest(cleanInner, txt, finalInner);
          prewarmMediaManifestIntoCache(txt, finalInner, referer, isDvbHeadendStream(finalInner));
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
    if (!isDvb) {
      const cachedManifest = getCachedLiveManifest(cleanUrl);
      if (cachedManifest) {
        const finalUrl = cachedManifest.baseUrl || cleanUrl;
        prewarmMediaManifestIntoCache(cachedManifest.text, finalUrl, referer, false);
        return {
          ok: true,
          streamUrl: buildHlsProxyUrl(finalUrl, referer, false),
          mode: 'hls',
          latencyMs: Math.max(1, Date.now() - startedAt),
          statusCode: 200,
        };
      }
    }
    if (isProviderCircuitOpen(cleanUrl, track.providerId)) {
      return { ok: false, streamUrl: '', mode: 'hls', latencyMs: 1, statusCode: 503 };
    }
    try {
      const res = await streamingFetch(cleanUrl, {
        method: 'GET',
        headers: {
          'User-Agent': getPreferredUpstreamUa(cleanUrl),
          Referer: referer,
          Accept: '*/*',
        },
        keepAliveAgent: true,
        timeoutMs: probeTimeoutMs,
      });
      const lat = Math.max(1, Date.now() - startedAt);
      if (!res.ok) {
        if (res.body) void res.body.cancel().catch(() => undefined);
        return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: res.status };
      }
      const txt = await res.text();
      if (txt.includes('#EXTM3U') && (txt.includes('#EXTINF') || txt.includes('#EXT-X-STREAM-INF')) && !/nosignal/i.test(txt)) {
        const finalUrl = res.url || cleanUrl;
        if (!isDvb && txt.includes('#EXT-X-STREAM-INF') && !process.env.VITEST) {
          const subPath = txt
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l && !l.startsWith('#'));
          if (subPath) {
            try {
              const subUrl = new URL(subPath, finalUrl).href;
              const subRes = await streamingFetch(subUrl, {
                method: 'GET',
                headers: {
                  'User-Agent': getPreferredUpstreamUa(subUrl),
                  Referer: referer,
                  Accept: '*/*',
                },
                keepAliveAgent: true,
                timeoutMs: Math.min(1000, Math.max(350, probeTimeoutMs - lat)),
              });
              if (!subRes.ok) {
                if (subRes.body) void subRes.body.cancel().catch(() => undefined);
                return { ok: false, streamUrl: '', mode: 'hls', latencyMs: Date.now() - startedAt, statusCode: subRes.status };
              }
              const subTxt = await subRes.text();
              const segPath = subTxt
                .split(/\r?\n/)
                .map((l) => l.trim())
                .find((l) => l && !l.startsWith('#') && !/\.m3u8(\?|$)/i.test(l));
              if (segPath) {
                const segUrl = new URL(segPath, subRes.url || subUrl).href;
                const segRes = await streamingFetch(segUrl, {
                  method: 'GET',
                  headers: {
                    'User-Agent': getPreferredUpstreamUa(segUrl),
                    Referer: referer,
                    Range: 'bytes=0-1023',
                    Accept: '*/*',
                  },
                  keepAliveAgent: true,
                  timeoutMs: Math.min(1000, Math.max(350, probeTimeoutMs - (Date.now() - startedAt))),
                });
                const segStatus = segRes.status;
                if (segRes.body) void segRes.body.cancel().catch(() => undefined);
                if (!segRes.ok && segStatus !== 416) {
                  return { ok: false, streamUrl: '', mode: 'hls', latencyMs: Date.now() - startedAt, statusCode: segStatus };
                }
              }
            } catch {
              // If segment validation fails or times out on a multi-variant CDN, let healthy mirrors win
              return { ok: false, streamUrl: '', mode: 'hls', latencyMs: Date.now() - startedAt, statusCode: 502 };
            }
          }
        }
        if (!isDvb) {
          setCachedLiveManifest(cleanUrl, txt, finalUrl);
          prewarmMediaManifestIntoCache(txt, finalUrl, referer, false);
        }
        const proxyUrl = buildHlsProxyUrl(finalUrl, referer, isDvb);
        return { ok: true, streamUrl: proxyUrl, mode: 'hls', latencyMs: Math.max(1, Date.now() - startedAt), statusCode: 200 };
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
    const isPriorityFeed =
      /(?:^|-)priority-/i.test(String(track.id || '')) ||
      /prioritaria|spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(String(track.label || ''));
    const priorityDiscount = isPriorityFeed && status !== 'down' && !circuitOpen ? -1_500_000 : 0;
    const score =
      priorityDiscount +
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
  const rawTracks = Array.isArray(tracks) ? tracks.filter((t) => Boolean(t?.sourceUrl)) : [];
  const connectedProviderIds = new Set<string>();
  const knownProviderIds = new Set<string>();
  try {
    const summary = getProvidersStatusSummary();
    if (summary.totals.connectedCount > 0) {
      for (const p of summary.providers) {
        knownProviderIds.add(p.id);
        if (p.connected) connectedProviderIds.add(p.id);
      }
    }
  } catch {
    // ignore in isolated unit tests
  }
  try {
    const multiSummaries = getProviderStatusSummaries();
    if (multiSummaries.some((p) => p.status === 'ready')) {
      for (const p of multiSummaries) {
        if (p.status === 'ready') {
          knownProviderIds.add(p.providerId);
          connectedProviderIds.add(p.providerId);
        } else if (p.status === 'error') {
          knownProviderIds.add(p.providerId);
        }
      }
    }
  } catch {
    // ignore in isolated unit tests
  }
  const hasProviderReadinessInfo = connectedProviderIds.size > 0 && knownProviderIds.size > 0;
  const nonBlockedTracks = rawTracks.filter((tr) => {
    if (hasProviderReadinessInfo) {
      const xRef = parseXtreamSource(String(tr.sourceUrl || ''));
      const pid = tr.providerId || xRef?.providerId;
      if (pid && knownProviderIds.has(pid) && !connectedProviderIds.has(pid)) {
        return false;
      }
    }
    const monitored = channelHealthMonitor.getTrackHealth(String(tr.sourceUrl || '')) ?? tr.health;
    if (monitored?.status === 'down') {
      return false;
    }
    if (isProviderCircuitOpen(tr.sourceUrl, tr.providerId)) {
      return false;
    }
    return true;
  });
  const effectiveTracks = nonBlockedTracks.length > 0 ? nonBlockedTracks : rawTracks;
  const safeTracks = effectiveTracks;
  if (effectiveTracks.length === 0) {
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
  const timeoutMs = Math.min(8_500, opts.timeoutMs ?? 3_800);
  const overallDeadlineAt = Date.now() + timeoutMs;
  const cacheKey = `${opts.channelId || effectiveTracks[0].sourceUrl}|${preferLang}|${qualityFirst ? 'q1' : 'q0'}`;
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
    const seenCounts = new Map<string, number>();
    for (const item of ranked) {
      const bucket = getCandidateProviderBucket(item.track);
      const count = seenCounts.get(bucket) || 0;
      if (count >= 1) continue;
      seenCounts.set(bucket, count + 1);
      seenIdx.add(item.originalIndex);
      picked.push(item);
      if (picked.length >= limit) return picked;
    }
    for (const item of ranked) {
      if (seenIdx.has(item.originalIndex)) continue;
      const bucket = getCandidateProviderBucket(item.track);
      const count = seenCounts.get(bucket) || 0;
      if (count >= 2) continue;
      seenCounts.set(bucket, count + 1);
      seenIdx.add(item.originalIndex);
      picked.push(item);
      if (picked.length >= limit) return picked;
    }
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
    effectiveTracks.some(
      (t) =>
        /[?&]type=(?:vod|series)(?:&|$)/i.test(String(t.sourceUrl || '')) ||
        /^\/api\/(?:providers\/stream\/[^/]+\/(?:movie|series)\/|xtream\/vod\/)/i.test(
          String(t.sourceUrl || '')
        ) ||
        /\.(mp4|mkv|webm|avi)(\?|$)/i.test(String(t.sourceUrl || ''))
    );

  const initialDistinctHealthyProviders = new Set<string>();
  let has4kAlready = false;
  for (const tr of effectiveTracks) {
    if (tr.health?.status === 'down' || isProviderCircuitOpen(tr.sourceUrl, tr.providerId)) continue;
    if (tr.resolverType === 'sports_channel' && /footunder\.online|streamxhd\.|tilinhd\./i.test(tr.sourceUrl)) continue;
    initialDistinctHealthyProviders.add(getCandidateProviderBucket(tr));
    if (/\b(?:4k|uhd|2160p?)\b/i.test(`${tr.quality || ''} ${tr.label || ''}`)) {
      has4kAlready = true;
    }
  }

  const hasHealthyUpTrack = effectiveTracks.some((tr) => {
    const h = channelHealthMonitor.getTrackHealth(String(tr.sourceUrl || '')) ?? tr.health;
    return h?.status === 'up';
  });
  const isWorldTvChannel = /^(?:fl-|freetv-|iptvorg-)/i.test(String(opts.channelId || ''));

  let discoveredExtraTracks: FastLiveTrackCandidate[] = [];
  if (
    !opts.probeImpl &&
    !isVodOrSeries &&
    !isWorldTvChannel &&
    !hasHealthyUpTrack &&
    (initialDistinctHealthyProviders.size < 4 || (qualityFirst && !has4kAlready))
  ) {
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
    for (const tr of effectiveTracks) {
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
          preferQualityFirst: qualityFirst,
          limit: 24,
        }).catch(() => []),
        new Promise<TrackRecord[]>((resolve) => setTimeout(() => resolve([]), 320)),
      ]);
      const existingUrls = new Set(effectiveTracks.map((t) => String(t.sourceUrl || '').trim()));
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

  const combinedPool: FastLiveTrackCandidate[] = [...effectiveTracks, ...discoveredExtraTracks];
  const ordered = selectProviderDiversePool(
    orderCandidatesForFastResolve(combinedPool, {
      preferLang,
      preferQualityFirst: qualityFirst,
    }),
    14
  );

  const probeImpl = opts.probeImpl || defaultProbeSingleLiveTrack;
  const hedgeDelay1 = opts.hedgeDelayMs ?? 60;
  const hedgeDelay2 = opts.hedgeSecondaryDelayMs ?? 150;
  const publicOrigin = opts.publicOrigin || '';
  const belixSessionKey = opts.belixSessionKey || 'default';

  const bestQualityTierInRace = ordered.reduce((best, o) => {
    const t = inferStreamQualityTag(o.track.quality, o.track.label, o.track.sourceUrl).tier;
    return Math.min(best, t);
  }, 99);

  const runRace = async (): Promise<FastLiveResolveResult> => {
    const startedAt = Date.now();
    const deadlineAt = Math.max(startedAt + 400, overallDeadlineAt + 120);
    const remainingBudgetMs = Math.max(400, deadlineAt - startedAt);
    let settled = false;
    let checkedCount = 0;

    return new Promise<FastLiveResolveResult>((resolve) => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      let pendingCount = ordered.length;
      let embedFallback: { originalIndex: number; track: FastLiveTrackCandidate; out: FastLiveProbeOutcome } | null = null;
      let pendingLowerQualityFallback: {
        originalIndex: number;
        track: FastLiveTrackCandidate;
        out: FastLiveProbeOutcome;
        tier: number;
      } | null = null;
      let qualityGraceTimer: ReturnType<typeof setTimeout> | null = null;
      const topOrdered = ordered[0];
      let topPriorityPending =
        Boolean(topOrdered) &&
        (/(?:^|-)priority-/i.test(String(topOrdered.track.id || '')) ||
          /prioritaria|spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(String(topOrdered.track.label || '')));

      const finish = (res: FastLiveResolveResult) => {
        if (settled) return;
        settled = true;
        for (const t of timers) clearTimeout(t);
        const backupCand = ordered.find(
          (o) =>
            o.originalIndex !== res.winningIndex &&
            o.track.resolverType !== 'web_embed' &&
            Boolean(o.track.sourceUrl)
        );
        const backupStreamUrl = backupCand
          ? backupCand.track.sourceUrl.startsWith('/api/')
            ? backupCand.track.sourceUrl
            : /\.m3u8(\?|$)/i.test(backupCand.track.sourceUrl)
              ? buildHlsProxyUrl(
                  backupCand.track.sourceUrl,
                  backupCand.track.referer || '',
                  isDvbHeadendStream(backupCand.track.sourceUrl)
                )
              : undefined
          : undefined;
        const finalRes: FastLiveResolveResult = {
          ...res,
          ...(backupStreamUrl ? { backupStreamUrl } : {}),
          ...(discoveredExtraTracks.length > 0 ? { extraTracks: discoveredExtraTracks } : {}),
        };
        if (finalRes.ok && (isVodOrSeries || finalRes.mode === 'hls' || discoveredExtraTracks.length > 0)) {
          fastLiveWinnerCache.set(cacheKey, { ...finalRes, cachedAt: Date.now() });
        }
        resolve(finalRes);
      };

      const hardDeadlineTimer = setTimeout(() => {
        if (settled) return;
        if (pendingLowerQualityFallback) {
          finish({
            ok: true,
            winningIndex: pendingLowerQualityFallback.originalIndex,
            winningTrack: pendingLowerQualityFallback.track,
            streamUrl: pendingLowerQualityFallback.out.streamUrl,
            mode: 'hls',
            latencyMs: pendingLowerQualityFallback.out.latencyMs,
            checkedCount,
          });
          return;
        }
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
      }, remainingBudgetMs + 80);
      timers.push(hardDeadlineTimer);

      const checkAllDone = () => {
        if (!settled && pendingCount <= 0) {
          if (pendingLowerQualityFallback) {
            finish({
              ok: true,
              winningIndex: pendingLowerQualityFallback.originalIndex,
              winningTrack: pendingLowerQualityFallback.track,
              streamUrl: pendingLowerQualityFallback.out.streamUrl,
              mode: 'hls',
              latencyMs: pendingLowerQualityFallback.out.latencyMs,
              checkedCount,
            });
            return;
          }
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
          if (topOrdered && cand.originalIndex === topOrdered.originalIndex) {
            topPriorityPending = false;
          }
          pendingCount -= 1;
          checkAllDone();
          return;
        }
        checkedCount += 1;
        const bucket = extractProviderBucket(cand.track.sourceUrl, cand.track.providerId);
        runWithBoundedLiveProbeSlot<FastLiveProbeOutcome>(
          deadlineAt,
          (slotRemainingMs) => {
            if (settled) {
              return Promise.resolve<FastLiveProbeOutcome>({
                ok: false,
                streamUrl: '',
                mode: 'hls',
                latencyMs: 1,
                statusCode: 499,
              });
            }
            return probeImpl(cand.track, {
              publicOrigin,
              belixSessionKey,
              titleHint: opts.titleHint,
              timeoutMs: Math.max(350, Math.min(1_500, slotRemainingMs)),
              allowTranscodeFallback: ordered.length <= 1,
            });
          },
          () => ({
            ok: false,
            streamUrl: '',
            mode: 'hls',
            latencyMs: Math.max(1, Date.now() - startedAt),
            statusCode: 504,
          })
        )
          .then((out) => {
            if (topOrdered && cand.originalIndex === topOrdered.originalIndex) {
              topPriorityPending = false;
            }
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
                const candTier = inferStreamQualityTag(
                  cand.track.quality,
                  cand.track.label,
                  cand.track.sourceUrl
                ).tier;
                const candIsPriority =
                  /(?:^|-)priority-/i.test(String(cand.track.id || '')) ||
                  /prioritaria|spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(String(cand.track.label || ''));
                if (
                  candIsPriority ||
                  (!topPriorityPending && (!qualityFirst || candTier <= bestQualityTierInRace)) ||
                  pendingCount <= 1
                ) {
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
                if (
                  !pendingLowerQualityFallback ||
                  candTier < pendingLowerQualityFallback.tier ||
                  (candTier === pendingLowerQualityFallback.tier &&
                    out.latencyMs < pendingLowerQualityFallback.out.latencyMs)
                ) {
                  pendingLowerQualityFallback = { ...cand, out, tier: candTier };
                }
                if (!qualityGraceTimer) {
                  qualityGraceTimer = setTimeout(() => {
                    topPriorityPending = false;
                    if (!settled && pendingLowerQualityFallback) {
                      finish({
                        ok: true,
                        winningIndex: pendingLowerQualityFallback.originalIndex,
                        winningTrack: pendingLowerQualityFallback.track,
                        streamUrl: pendingLowerQualityFallback.out.streamUrl,
                        mode: 'hls',
                        latencyMs: pendingLowerQualityFallback.out.latencyMs,
                        checkedCount,
                      });
                    }
                  }, topPriorityPending ? 2400 : 220);
                  timers.push(qualityGraceTimer);
                }
                return;
              }
              if (!embedFallback) {
                embedFallback = { ...cand, out };
              }
            } else {
              if (topPriorityPending === false && pendingLowerQualityFallback) {
                finish({
                  ok: true,
                  winningIndex: pendingLowerQualityFallback.originalIndex,
                  winningTrack: pendingLowerQualityFallback.track,
                  streamUrl: pendingLowerQualityFallback.out.streamUrl,
                  mode: 'hls',
                  latencyMs: pendingLowerQualityFallback.out.latencyMs,
                  checkedCount,
                });
              }
              const candIsPriorityFail =
                /(?:^|-)priority-/i.test(String(cand.track.id || '')) ||
                /prioritaria|spain\s*[-_]\s*(?:ljli|أسبانيا|اسبانيا)/i.test(String(cand.track.label || ''));
              const prevFailCount = channelHealthMonitor.getTrackHealth(cand.track.sourceUrl)?.failCount || 0;
              channelHealthMonitor.setTrackHealth(cand.track.sourceUrl, {
                status: candIsPriorityFail && prevFailCount < 1 ? 'degraded' : 'down',
                latencyMs: out.latencyMs,
                failCount: prevFailCount + 1,
                checkedAt: Date.now(),
                statusCode: out.statusCode ?? 502,
              });
            }
          })
          .catch(() => {
            if (topOrdered && cand.originalIndex === topOrdered.originalIndex) {
              topPriorityPending = false;
            }
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

      // Wave 1 (t=0): Launch top 4 distinct healthy provider candidates immediately
      for (const c of ordered.slice(0, 4)) {
        launchCandidate(c);
      }

      // Wave 2 (t=+hedgeDelay1): Hedge candidates 4..8
      if (ordered.length > 4) {
        const wave2 = setTimeout(() => {
          if (settled) return;
          for (const c of ordered.slice(4, 8)) {
            launchCandidate(c);
          }
        }, hedgeDelay1);
        timers.push(wave2);
      }

      // Wave 3 (t=+hedgeDelay2): Hedge remaining provider candidates
      if (ordered.length > 8) {
        const wave3 = setTimeout(() => {
          if (settled) return;
          for (const c of ordered.slice(8)) {
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
