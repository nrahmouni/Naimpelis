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
  isDvbHeadendStream,
  maybeSignEasyBroadcastUrl,
  resolveKnownUpstreamReferer,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import { isElahmadUrl, resolveElahmadChannelToHls } from '../extractors/elahmadExtractor.ts';
import { resolveMediasetLiveHlsUrl } from './mediasetLiveService.ts';
import { isAnyBelixConnected, resolveBelixManifest } from './belix/belixXtreamClient.ts';
import { fetchProxiedXtreamManifest } from './xtreamService.ts';
import { resolveProviderLiveManifest } from './providers/xtreamProvidersService.ts';
import { channelHealthMonitor } from './channelHealthMonitor.ts';
import { unwrapProxyTargetUrl } from './channelHealthProbe.ts';
import { getActiveDvbSessionPath, isDvbUpstreamCoolingDown } from '../routes/proxies/dvbTranscoder.ts';
import { inferStreamQualityTag, normalizeLiveTrackLang } from '../../src/utils/channelQualityRanker.ts';

import {
  extractProviderBucket,
  getProviderSteeringPenaltyMs,
  isProviderCircuitOpen,
  recordProviderOutcome,
} from './providerCircuitBreaker.ts';

export const MAX_LIVE_PROBE_CONCURRENCY = 10;

let activeLiveProbeCount = 0;
let peakLiveProbeCount = 0;
const liveProbeWaiters: Array<() => void> = [];

async function acquireLiveProbeSlot(): Promise<void> {
  if (activeLiveProbeCount < MAX_LIVE_PROBE_CONCURRENCY) {
    activeLiveProbeCount += 1;
    if (activeLiveProbeCount > peakLiveProbeCount) {
      peakLiveProbeCount = activeLiveProbeCount;
    }
    return;
  }
  await new Promise<void>((resolve) => {
    liveProbeWaiters.push(() => {
      activeLiveProbeCount += 1;
      if (activeLiveProbeCount > peakLiveProbeCount) {
        peakLiveProbeCount = activeLiveProbeCount;
      }
      resolve();
    });
  });
}

function releaseLiveProbeSlot(): void {
  activeLiveProbeCount = Math.max(0, activeLiveProbeCount - 1);
  const next = liveProbeWaiters.shift();
  if (next) next();
}

export function getLiveProbeConcurrencyStats(): {
  active: number;
  peak: number;
  max: number;
} {
  return {
    active: activeLiveProbeCount,
    peak: peakLiveProbeCount,
    max: MAX_LIVE_PROBE_CONCURRENCY,
  };
}

export function resetLiveProbeConcurrencyStats(): void {
  activeLiveProbeCount = 0;
  peakLiveProbeCount = 0;
  while (liveProbeWaiters.length > 0) {
    const fn = liveProbeWaiters.shift();
    if (fn) fn();
  }
}

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
}

const fastLiveWinnerCache = new LruTtlCache<string, FastLiveResolveResult>(250, 35_000);
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
    signal?: AbortSignal;
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
      if (manifest && manifest.includes('#EXTM3U')) {
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

  // 5. Local already-proxied streams: verify /api/hls-proxy targets (especially DVB cooldown/reachability)
  if (sourceUrl.startsWith('/api/')) {
    if (sourceUrl.startsWith('/api/hls-proxy')) {
      const inner = unwrapProxyTargetUrl(sourceUrl);
      if (inner && isDvbHeadendStream(inner)) {
        if (isDvbUpstreamCoolingDown(inner)) {
          return { ok: false, streamUrl: '', mode: 'hls', latencyMs: Math.max(1, Date.now() - startedAt), statusCode: 502 };
        }
        const activeDvb = getActiveDvbSessionPath(inner, 'hd');
        if (activeDvb) {
          return { ok: true, streamUrl: activeDvb, mode: 'hls', latencyMs: Math.max(1, Date.now() - startedAt), statusCode: 200 };
        }
        try {
          const probeRes = await streamingFetch(inner, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36',
              Referer: 'http://90.163.85.113:8093/',
              Accept: '*/*',
            },
            timeoutMs: Math.min(opts.timeoutMs, 2200),
          });
          const lat = Math.max(1, Date.now() - startedAt);
          if (!probeRes.ok) {
            void probeRes.body?.cancel?.().catch(() => undefined);
            return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: probeRes.status };
          }
          const txt = await probeRes.text();
          if (txt.includes('#EXTM3U') && !/nosignal/i.test(txt)) {
            return { ok: true, streamUrl: sourceUrl, mode: 'hls', latencyMs: lat, statusCode: 200 };
          }
          return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 502 };
        } catch {
          return { ok: false, streamUrl: '', mode: 'hls', latencyMs: Math.max(1, Date.now() - startedAt), statusCode: 502 };
        }
      }
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
    if (isDvbHeadendStream(cleanUrl)) {
      if (isDvbUpstreamCoolingDown(cleanUrl)) {
        return { ok: false, streamUrl: '', mode: 'hls', latencyMs: Math.max(1, Date.now() - startedAt), statusCode: 502 };
      }
      const dvbProfile = /[?&]profile=fast\b/i.test(sourceUrl) ? 'fast' : 'hd';
      const activeDvb = getActiveDvbSessionPath(cleanUrl, dvbProfile);
      if (activeDvb) {
        return {
          ok: true,
          streamUrl: activeDvb,
          mode: 'hls',
          latencyMs: Math.max(1, Date.now() - startedAt),
          statusCode: 200,
        };
      }
      try {
        const res = await streamingFetch(cleanUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36',
            Referer: 'http://90.163.85.113:8093/',
            Accept: '*/*',
          },
          timeoutMs: Math.min(opts.timeoutMs, 2200),
        });
        const lat = Math.max(1, Date.now() - startedAt);
        if (!res.ok) {
          void res.body?.cancel?.().catch(() => undefined);
          return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: res.status };
        }
        const txt = await res.text();
        if (txt.includes('#EXTM3U') && !/nosignal/i.test(txt)) {
          return {
            ok: true,
            streamUrl: `/api/dvb-live/playlist.m3u8?url=${encodeURIComponent(cleanUrl)}`,
            mode: 'hls',
            latencyMs: lat,
            statusCode: 200,
          };
        }
        return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: 502 };
      } catch {
        return { ok: false, streamUrl: '', mode: 'hls', latencyMs: Math.max(1, Date.now() - startedAt), statusCode: 502 };
      }
    }
    const referer = resolveKnownUpstreamReferer(cleanUrl, track.referer) || `${new URL(cleanUrl).origin}/`;
    try {
      const res = await streamingFetch(cleanUrl, {
        method: 'GET',
        keepAliveAgent: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
          Referer: referer,
          Accept: '*/*',
        },
        signal: opts.signal,
        timeoutMs: opts.timeoutMs,
      });
      const lat = Math.max(1, Date.now() - startedAt);
      if (!res.ok) {
        if (res.body) void res.body.cancel().catch(() => undefined);
        return { ok: false, streamUrl: '', mode: 'hls', latencyMs: lat, statusCode: res.status };
      }
      const txt = await res.text();
      if (txt.includes('#EXTM3U') && !/nosignal/i.test(txt)) {
        const proxyUrl = buildHlsProxyUrl(res.url || cleanUrl, referer);
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
    const isPriority =
      /priority/i.test(String(track.id || '')) || /prioritaria/i.test(String(track.label || ''));
    const statusRank = status === 'up' ? 0 : status === 'unknown' ? 1 : status === 'degraded' ? 2 : 3;
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
    const unwrapped = unwrapProxyTargetUrl(String(track.sourceUrl || ''));
    const isResidentialDvb = /90\.163\.85\.113(?::|%3A)8093/i.test(unwrapped);
    const q = inferStreamQualityTag(track.quality, track.label, track.sourceUrl);
    const lat = typeof liveHealth?.latencyMs === 'number' ? Math.min(9999, liveHealth.latencyMs) : 1200;
    const circuitOpen = isProviderCircuitOpen(track.sourceUrl, track.providerId);
    const steeringPenalty = status === 'up' ? 0 : Math.min(4000, getProviderSteeringPenaltyMs(track.sourceUrl, track.providerId));
    const score =
      (isPriority && status !== 'down' ? -2_000_000 : 0) +
      (circuitOpen ? 1_500_000 : 0) +
      statusRank * 1_000_000 +
      (isEmbed ? 500_000 : 0) +
      (isResidentialDvb ? 150_000 : 0) +
      langRank * 10_000 +
      Math.round(q.tier * 90) +
      lat +
      Math.round(steeringPenalty * 0.15);
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
    return { ...cachedWinner, fromCache: true };
  }

  const existingInflight = inflightPrewarms.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  const healthSnapshot = channelHealthMonitor.getAllTrackStatuses();
  const nonDownTracks = safeTracks.filter((t) => {
    const st = healthSnapshot[String(t.sourceUrl || '').trim()]?.status || t.health?.status;
    return st !== 'down';
  });
  const eligibleTracks = nonDownTracks.length > 0 ? nonDownTracks : safeTracks;

  const ordered = orderCandidatesForFastResolve(eligibleTracks, {
    preferLang,
    preferQualityFirst: qualityFirst,
  }).slice(0, 6);

  const probeImpl = opts.probeImpl || defaultProbeSingleLiveTrack;
  const timeoutMs = opts.timeoutMs ?? 2_600;
  const clampedProbeTimeoutMs = Math.max(250, Math.min(1_500, timeoutMs));
  const hedgeDelay1 = opts.hedgeDelayMs ?? 120;
  const hedgeDelay2 = opts.hedgeSecondaryDelayMs ?? 300;
  const publicOrigin = opts.publicOrigin || '';
  const belixSessionKey = opts.belixSessionKey || 'default';

  const runRace = async (): Promise<FastLiveResolveResult> => {
    const startedAt = Date.now();
    let settled = false;
    let checkedCount = 0;
    const raceAbort = new AbortController();

    return new Promise<FastLiveResolveResult>((resolve) => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      let backupGraceTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingCount = ordered.length;
      let wave1InFlight = 0;
      let primaryHlsWinner: {
        cand: { originalIndex: number; track: FastLiveTrackCandidate };
        out: FastLiveProbeOutcome;
      } | null = null;
      let backupHlsUrl: string | undefined;
      let embedFallback: { originalIndex: number; track: FastLiveTrackCandidate; out: FastLiveProbeOutcome } | null = null;

      const finish = (res: FastLiveResolveResult) => {
        if (settled) return;
        settled = true;
        if (backupGraceTimer) clearTimeout(backupGraceTimer);
        for (const t of timers) clearTimeout(t);
        raceAbort.abort();
        if (res.ok) {
          fastLiveWinnerCache.set(cacheKey, res);
        }
        resolve(res);
      };

      const flushPrimaryWinner = () => {
        if (!primaryHlsWinner || settled) return;
        finish({
          ok: true,
          winningIndex: primaryHlsWinner.cand.originalIndex,
          winningTrack: primaryHlsWinner.cand.track,
          streamUrl: primaryHlsWinner.out.streamUrl,
          ...(backupHlsUrl ? { backupStreamUrl: backupHlsUrl } : {}),
          mode: 'hls',
          latencyMs: primaryHlsWinner.out.latencyMs,
          checkedCount,
        });
      };

      const launchCandidate = (
        cand: { originalIndex: number; track: FastLiveTrackCandidate },
        isWave1 = false
      ) => {
        if (settled) {
          pendingCount -= 1;
          return;
        }
        checkedCount += 1;
        if (isWave1) wave1InFlight += 1;

        void (async () => {
          await acquireLiveProbeSlot();
          try {
            if (settled) return;
            const out = await probeImpl(cand.track, {
              publicOrigin,
              belixSessionKey,
              titleHint: opts.titleHint,
              timeoutMs: clampedProbeTimeoutMs,
              signal: raceAbort.signal,
            });
            if (out.ok && out.streamUrl) {
              recordProviderOutcome(cand.track.sourceUrl, {
                ok: true,
                latencyMs: out.latencyMs,
                explicitProviderId: cand.track.providerId,
              });
              if (out.mode === 'hls') {
                channelHealthMonitor.setTrackHealth(cand.track.sourceUrl, {
                  status: out.latencyMs <= 1800 ? 'up' : 'degraded',
                  latencyMs: out.latencyMs,
                  failCount: 0,
                  checkedAt: Date.now(),
                  statusCode: out.statusCode ?? 200,
                });
                if (!primaryHlsWinner) {
                  primaryHlsWinner = { cand, out };
                  const isPriorityWinner =
                    /priority/i.test(String(cand.track.id || '')) ||
                    /prioritaria/i.test(String(cand.track.label || ''));
                  const othersStillInWave1 = wave1InFlight - 1 > 0;
                  if (isPriorityWinner || !othersStillInWave1 || settled) {
                    flushPrimaryWinner();
                  } else {
                    backupGraceTimer = setTimeout(flushPrimaryWinner, Math.min(80, clampedProbeTimeoutMs));
                  }
                } else if (!backupHlsUrl && out.streamUrl !== primaryHlsWinner.out.streamUrl) {
                  backupHlsUrl = out.streamUrl;
                  flushPrimaryWinner();
                }
                return;
              }
              if (!embedFallback) {
                embedFallback = { ...cand, out };
              }
            } else {
              recordProviderOutcome(cand.track.sourceUrl, {
                ok: false,
                explicitProviderId: cand.track.providerId,
              });
              channelHealthMonitor.setTrackHealth(cand.track.sourceUrl, {
                status: 'down',
                latencyMs: out.latencyMs,
                failCount: 1,
                checkedAt: Date.now(),
                statusCode: out.statusCode ?? 502,
              });
            }
          } catch {
            if (!settled) {
              recordProviderOutcome(cand.track.sourceUrl, {
                ok: false,
                explicitProviderId: cand.track.providerId,
              });
              channelHealthMonitor.setTrackHealth(cand.track.sourceUrl, {
                status: 'down',
                failCount: 1,
                checkedAt: Date.now(),
              });
            }
          } finally {
            releaseLiveProbeSlot();
            if (isWave1) wave1InFlight = Math.max(0, wave1InFlight - 1);
            pendingCount -= 1;
            if (!settled && primaryHlsWinner && isWave1 && wave1InFlight === 0) {
              flushPrimaryWinner();
            } else if (!settled && pendingCount <= 0) {
              if (primaryHlsWinner) {
                flushPrimaryWinner();
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
          }
        })();
      };

      // Wave 1 (t=0): Top candidate immediately; if unprobed and non-priority, hedge up to 4 distinct-provider non-DVB mirrors
      const firstHealth =
        healthSnapshot[String(ordered[0]?.track.sourceUrl || '').trim()] || ordered[0]?.track.health;
      const firstFastUp =
        firstHealth?.status === 'up' && typeof firstHealth.latencyMs === 'number' && firstHealth.latencyMs <= 350;
      const firstIsPriority =
        /priority/i.test(String(ordered[0]?.track.id || '')) ||
        /prioritaria/i.test(String(ordered[0]?.track.label || ''));
      const isNonDvb = (cand?: { track: FastLiveTrackCandidate }) =>
        Boolean(cand) &&
        !/90\.163\.85\.113/i.test(unwrapProxyTargetUrl(String(cand!.track.sourceUrl || '')));

      const wave1Indexes = new Set<number>([0]);
      if (!firstFastUp && !firstIsPriority && isNonDvb(ordered[0])) {
        const seenBuckets = new Set<string>([
          extractProviderBucket(ordered[0].track.sourceUrl, ordered[0].track.providerId),
        ]);
        for (let i = 1; i < ordered.length && wave1Indexes.size < 4; i++) {
          if (!isNonDvb(ordered[i])) continue;
          const bucket = extractProviderBucket(ordered[i].track.sourceUrl, ordered[i].track.providerId);
          if (!seenBuckets.has(bucket) || ordered.length <= 4) {
            seenBuckets.add(bucket);
            wave1Indexes.add(i);
          }
        }
      }

      for (const idx of wave1Indexes) {
        launchCandidate(ordered[idx], true);
      }

      // Wave 2 (t=+hedgeDelay1): Hedge next candidates not yet launched
      const remaining = ordered.filter((_, idx) => !wave1Indexes.has(idx));
      if (remaining.length > 0) {
        const wave2 = setTimeout(() => {
          if (settled) return;
          for (const c of remaining.slice(0, 2)) {
            launchCandidate(c, false);
          }
        }, hedgeDelay1);
        timers.push(wave2);
      }

      // Wave 3 (t=+hedgeDelay2): Hedge any trailing candidates
      if (remaining.length > 2) {
        const wave3 = setTimeout(() => {
          if (settled) return;
          for (const c of remaining.slice(2)) {
            launchCandidate(c, false);
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
