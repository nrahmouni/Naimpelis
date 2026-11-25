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
import { inferStreamQualityTag, normalizeLiveTrackLang } from '../../src/utils/channelQualityRanker.ts';

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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
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
      return {
        ok: true,
        streamUrl: `/api/dvb-live/playlist.m3u8?url=${encodeURIComponent(cleanUrl)}`,
        mode: 'hls',
        latencyMs: Math.max(1, Date.now() - startedAt),
      };
    }
    const referer = resolveKnownUpstreamReferer(cleanUrl, track.referer) || `${new URL(cleanUrl).origin}/`;
    try {
      const res = await streamingFetch(cleanUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
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
    const isResidentialDvb = /90\.163\.85\.113(?:%3A|:)8093/i.test(String(track.sourceUrl || ''));
    const q = inferStreamQualityTag(track.quality, track.label, track.sourceUrl);
    const lat = typeof liveHealth?.latencyMs === 'number' ? Math.min(9999, liveHealth.latencyMs) : 1200;
    const score =
      statusRank * 1000000 +
      (isEmbed ? 500000 : 0) +
      (isResidentialDvb ? 150000 : 0) +
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

  const ordered = orderCandidatesForFastResolve(safeTracks, {
    preferLang,
    preferQualityFirst: qualityFirst,
  }).slice(0, 8);

  const probeImpl = opts.probeImpl || defaultProbeSingleLiveTrack;
  const timeoutMs = opts.timeoutMs ?? 2_600;
  const hedgeDelay1 = opts.hedgeDelayMs ?? 120;
  const hedgeDelay2 = opts.hedgeSecondaryDelayMs ?? 300;
  const publicOrigin = opts.publicOrigin || '';
  const belixSessionKey = opts.belixSessionKey || 'default';

  const runRace = async (): Promise<FastLiveResolveResult> => {
    const startedAt = Date.now();
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
        if (res.ok) {
          fastLiveWinnerCache.set(cacheKey, res);
        }
        resolve(res);
      };

      const launchCandidate = (cand: { originalIndex: number; track: FastLiveTrackCandidate }) => {
        if (settled) {
          pendingCount -= 1;
          return;
        }
        checkedCount += 1;
        probeImpl(cand.track, {
          publicOrigin,
          belixSessionKey,
          titleHint: opts.titleHint,
          timeoutMs,
        })
          .then((out) => {
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
            channelHealthMonitor.setTrackHealth(cand.track.sourceUrl, {
              status: 'down',
              failCount: 1,
              checkedAt: Date.now(),
            });
          })
          .finally(() => {
            pendingCount -= 1;
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
          });
      };

      // Wave 1 (t=0): Top candidate immediately
      launchCandidate(ordered[0]);

      // Wave 2 (t=+hedgeDelay1): Hedge candidates 1 & 2 if top candidate hasn't succeeded yet
      if (ordered.length > 1) {
        const wave2 = setTimeout(() => {
          if (settled) return;
          for (const c of ordered.slice(1, 3)) {
            launchCandidate(c);
          }
        }, hedgeDelay1);
        timers.push(wave2);
      }

      // Wave 3 (t=+hedgeDelay2): Hedge remaining candidates 3 & 4
      if (ordered.length > 3) {
        const wave3 = setTimeout(() => {
          if (settled) return;
          for (const c of ordered.slice(3)) {
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
