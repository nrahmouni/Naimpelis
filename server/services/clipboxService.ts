import { LruTtlCache } from '../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { buildTmdbImageUrl, fetchTmdbJson } from './tmdbService.ts';
import { CHROME_UA } from '../extractors/httpHelpers.ts';
import { extractClipboxDirectStreams } from '../extractors/clipboxDirectExtractor.ts';
import { extractVidRockHlsTracks } from '../extractors/bingetrixMovidy.ts';
import { searchAggregatedSubtitles } from './subtitleAggregator.ts';
import {
  parseClipboxInventory,
  type ClipboxHostEntry,
} from './clipbox/clipboxParser.ts';

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
  source: 'tmdb' | 'kitsu';
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

const probeCache = new LruTtlCache<string, ClipboxProbeResult>(500, 2 * 60 * 1000);
const searchCache = new LruTtlCache<string, ClipboxSearchItem[]>(200, 5 * 60 * 1000);

function getAllowedClipboxHostSet(): Set<string> {
  const inv = parseClipboxInventory();
  const set = new Set<string>();
  for (const h of inv.hosts) {
    if (h.probeAllowed) {
      set.add(h.host.toLowerCase());
      for (const u of h.urls) {
        try {
          set.add(new URL(u).hostname.toLowerCase());
        } catch {
          // ignore
        }
      }
    }
  }
  return set;
}

export async function probeClipboxUrl(targetInput: {
  host?: string;
  url?: string;
}): Promise<ClipboxProbeResult> {
  const inv = parseClipboxInventory();
  const allowedHosts = getAllowedClipboxHostSet();

  let targetUrl = String(targetInput.url || '').trim();
  const requestedHost = String(targetInput.host || '').trim().toLowerCase();

  if (!targetUrl && requestedHost) {
    const matched = inv.hosts.find((h) => h.host.toLowerCase() === requestedHost);
    if (!matched) {
      return {
        host: requestedHost,
        url: '',
        ok: false,
        status: 400,
        latencyMs: 0,
        finalUrl: '',
        contentType: '',
        error: 'Host no pertenece al inventario ClipBox',
      };
    }
    if (!matched.probeAllowed) {
      return {
        host: matched.host,
        url: matched.urls[0] || '',
        ok: false,
        status: 403,
        latencyMs: 0,
        finalUrl: '',
        contentType: '',
        error: 'Host técnico o local excluido de comprobación remota',
      };
    }
    targetUrl = matched.urls.find((u) => /^https?:\/\/[a-z0-9]/i.test(u)) || `https://${matched.host}`;
  }

  if (!targetUrl) {
    return {
      host: requestedHost,
      url: '',
      ok: false,
      status: 400,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: 'URL o host requerido',
    };
  }

  let parsed: URL;
  try {
    parsed = await assertSafeProxyUrl(targetUrl);
  } catch (err) {
    return {
      host: requestedHost || targetUrl,
      url: targetUrl,
      ok: false,
      status: 403,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: err instanceof Error ? err.message : 'Destino bloqueado',
    };
  }

  const hostLower = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(hostLower) && !allowedHosts.has(`www.${hostLower}`)) {
    return {
      host: hostLower,
      url: targetUrl,
      ok: false,
      status: 403,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: 'Solo se permite comprobar hosts presentes en ClipBox',
    };
  }

  const cached = probeCache.get(targetUrl);
  if (cached) return cached;

  const t0 = Date.now();
  try {
    let res = await streamingFetch(targetUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/json,*/*;q=0.8',
      },
      timeoutMs: 4200,
    });
    if (res.status === 405 || res.status === 501) {
      res = await streamingFetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': CHROME_UA,
          Range: 'bytes=0-1023',
          Accept: 'text/html,application/json,*/*;q=0.8',
        },
        timeoutMs: 4200,
      });
    }
    const latencyMs = Date.now() - t0;
    const status = res.status;
    const ok = status >= 200 && status < 400;
    const result: ClipboxProbeResult = {
      host: hostLower,
      url: targetUrl,
      ok,
      status,
      latencyMs,
      finalUrl: res.url || targetUrl,
      contentType: String(res.headers.get('content-type') || '').split(';')[0],
    };
    probeCache.set(targetUrl, result);
    return result;
  } catch (err) {
    const result: ClipboxProbeResult = {
      host: hostLower,
      url: targetUrl,
      ok: false,
      status: 0,
      latencyMs: Date.now() - t0,
      finalUrl: targetUrl,
      contentType: '',
      error: err instanceof Error ? err.message : 'Timeout o error de red',
    };
    probeCache.set(targetUrl, result);
    return result;
  }
}

export async function searchClipboxCatalog(
  query: string,
  scope: 'all' | 'anime' | 'cinema' = 'all'
): Promise<ClipboxSearchItem[]> {
  const cleanQ = query.trim();
  const cacheKey = `${scope}:${cleanQ.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const results: ClipboxSearchItem[] = [];

  const tasks: Promise<void>[] = [];

  // 1. TMDB Movies & Series (if scope !== 'anime')
  if (scope !== 'anime') {
    tasks.push(
      (async () => {
        try {
          interface TmdbSearchRes {
            results?: Array<{
              id: number;
              media_type?: 'movie' | 'tv' | 'person';
              title?: string;
              name?: string;
              original_title?: string;
              original_name?: string;
              release_date?: string;
              first_air_date?: string;
              vote_average?: number;
              overview?: string;
              poster_path?: string | null;
              backdrop_path?: string | null;
            }>;
          }
          const endpoint = cleanQ ? '/search/multi' : '/trending/all/week';
          const data = await fetchTmdbJson<TmdbSearchRes>(
            endpoint,
            cleanQ ? { query: cleanQ, language: 'es-ES', include_adult: 'false' } : { language: 'es-ES' },
            5 * 60 * 1000
          );
          for (const item of data?.results || []) {
            if (item.media_type !== 'movie' && item.media_type !== 'tv') continue;
            if (!item.poster_path) continue;
            const year = (item.release_date || item.first_air_date || '').slice(0, 4);
            results.push({
              id: `tmdb-${item.media_type}-${item.id}`,
              source: 'tmdb',
              mediaType: item.media_type,
              title: item.title || item.name || 'Sin título',
              originalTitle: item.original_title || item.original_name,
              year,
              rating: item.vote_average ? item.vote_average.toFixed(1) : '',
              overview: item.overview || '',
              poster: buildTmdbImageUrl(item.poster_path, 'w500'),
              backdrop: buildTmdbImageUrl(item.backdrop_path || item.poster_path, 'w1280'),
              tmdbId: item.id,
            });
          }
        } catch {
          // ignore TMDB failure cleanly
        }
      })()
    );
  }

  // 2. Kitsu Anime API (directly from ClipBox inventory!)
  if (scope === 'all' || scope === 'anime') {
    tasks.push(
      (async () => {
        try {
          const url = cleanQ
            ? `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanQ)}&page[limit]=12`
            : `https://kitsu.io/api/edge/trending/anime?limit=12`;
          const res = await streamingFetch(url, {
            headers: {
              Accept: 'application/vnd.api+json',
              'User-Agent': CHROME_UA,
            },
            timeoutMs: 5500,
          });
          if (!res.ok) return;
          const json = (await res.json().catch(() => null)) as {
            data?: Array<{
              id: string;
              attributes?: {
                canonicalTitle?: string;
                titles?: Record<string, string>;
                synopsis?: string;
                startDate?: string;
                averageRating?: string;
                episodeCount?: number;
                posterImage?: { medium?: string; large?: string };
                coverImage?: { large?: string; original?: string };
              };
            }>;
          } | null;

          for (const entry of json?.data || []) {
            const attr = entry.attributes;
            if (!attr?.canonicalTitle) continue;
            const poster = attr.posterImage?.large || attr.posterImage?.medium || '';
            if (!poster) continue;
            const rawScore = Number(attr.averageRating || 0);
            const rating10 = rawScore > 0 ? (rawScore / 10).toFixed(1) : '';
            results.push({
              id: `kitsu-${entry.id}`,
              source: 'kitsu',
              mediaType: 'anime',
              title: attr.titles?.en || attr.canonicalTitle,
              originalTitle: attr.titles?.ja_jp || attr.canonicalTitle,
              year: (attr.startDate || '').slice(0, 4),
              rating: rating10,
              overview: attr.synopsis || '',
              poster,
              backdrop: attr.coverImage?.large || attr.coverImage?.original || poster,
              kitsuId: entry.id,
              episodeCount: attr.episodeCount || 12,
            });
          }
        } catch {
          // ignore Kitsu failure cleanly
        }
      })()
    );
  }

  await Promise.all(tasks);
  if (results.length > 0) {
    searchCache.set(cacheKey, results);
  }
  return results;
}

export async function resolveClipboxTitleStreams(params: {
  title: string;
  mediaType: 'movie' | 'tv' | 'anime';
  tmdbId?: number;
  kitsuId?: string;
  season?: number;
  episode?: number;
}): Promise<ClipboxTitleStreamsResult> {
  const season = Math.max(1, params.season || 1);
  const episode = Math.max(1, params.episode || 1);
  let resolvedTmdbId = params.tmdbId;

  // If Anime item from Kitsu doesn't have tmdbId yet, try finding its TMDB TV/Movie match for ClipBox multi-players
  if (!resolvedTmdbId && params.title) {
    try {
      interface TmdbFindRes {
        results?: Array<{ id: number; media_type?: string }>;
      }
      const sr = await fetchTmdbJson<TmdbFindRes>(
        '/search/multi',
        { query: params.title, language: 'es-ES' },
        60 * 60 * 1000
      );
      const hit = sr?.results?.find((r) => r.media_type === 'tv' || r.media_type === 'movie');
      if (hit?.id) resolvedTmdbId = hit.id;
    } catch {
      // ignore
    }
  }

  const tracks: ClipboxPlayerTrack[] = [];
  const isSeriesLike = params.mediaType === 'tv' || params.mediaType === 'anime';

  // Option 0: RiffanTV Native Castellano/LAT/VOSE Resolver (Movidy / GnulaHD / Vest / ClipBox Direct)
  if (resolvedTmdbId || params.title) {
    const extractQs = new URLSearchParams({
      title: params.title,
      ...(resolvedTmdbId ? { tmdbId: String(resolvedTmdbId) } : {}),
      mediaType: isSeriesLike ? 'tv' : 'movie',
      preferLang: params.mediaType === 'anime' ? 'VOSE' : 'ES',
      ...(isSeriesLike ? { season: String(season), episode: String(episode) } : {}),
    });
    tracks.push({
      id: `cb-riffan-es-${resolvedTmdbId || 'title'}-${season}-${episode}`,
      provider: 'RiffanTV + ClipBox',
      label:
        params.mediaType === 'anime'
          ? 'Reproductor Nativo HD · Español / VOSE Sub'
          : 'Reproductor Nativo HD · Castellano / Latam',
      lang: params.mediaType === 'anime' ? 'VOSE / ES' : 'ES / LAT',
      quality: '1080p',
      mode: 'extract',
      url: `/api/extract/stream?${extractQs.toString()}`,
      rawUrl: resolvedTmdbId ? `tmdb://${resolvedTmdbId}` : params.title,
      note: 'Resuelve flujo HLS/MP4 nativo con subtítulos automáticos dentro del reproductor.',
    });
  }

  // Parallel enrichment: Direct VidLink H.264/HLS + VidRock HLS + Aggregated Subtitles + TheIntroDB + AniSkip
  const introTimestamps: Array<{ type: string; startSec: number; endSec: number; source: string }> = [];
  const subtitles: Array<{ lang: string; label: string; url: string; source: string }> = [];
  const enrichTasks: Promise<void>[] = [];

  if (resolvedTmdbId) {
    const idStr = String(resolvedTmdbId);

    enrichTasks.push(
      (async () => {
        try {
          const directRes = await extractClipboxDirectStreams({
            tmdbId: idStr,
            mediaType: isSeriesLike ? 'tv' : 'movie',
            season,
            episode,
            originalLanguage: params.mediaType === 'anime' ? 'ja' : undefined,
          });
          for (const tr of directRes.tracks) {
            if (!tr.resolvedStreamUrl) continue;
            tracks.push({
              id: tr.id,
              provider: 'ClipBox Direct (VidLink)',
              label: tr.label,
              lang: tr.lang,
              quality: tr.quality || '1080p',
              mode: tr.resolverType === 'direct_mp4' ? 'direct' : 'hls',
              url: tr.resolvedStreamUrl,
              rawUrl: tr.resolvedStreamUrl,
              note: 'Stream directo MP4/HLS reproducido en reproductor nativo sin popups.',
            });
          }
          for (const sub of directRes.subtitles) {
            subtitles.push({
              lang: sub.lang,
              label: sub.label,
              url: sub.url,
              source: sub.source || 'vidlink.pro',
            });
          }
        } catch {
          // ignore cleanly
        }
      })()
    );

    enrichTasks.push(
      (async () => {
        try {
          const vidRockTracks = await extractVidRockHlsTracks({
            tmdbId: idStr,
            mediaType: isSeriesLike ? 'tv' : 'movie',
            season,
            episode,
          });
          for (const tr of vidRockTracks) {
            if (!tr.resolvedStreamUrl) continue;
            tracks.push({
              id: tr.id,
              provider: 'VidRock Native HLS',
              label: tr.label,
              lang: tr.lang,
              quality: tr.quality || '1080p',
              mode: 'hls',
              url: tr.resolvedStreamUrl,
              rawUrl: tr.resolvedStreamUrl,
              note: 'Flujo HLS nativo estable sin ventanas externas.',
            });
          }
        } catch {
          // ignore cleanly
        }
      })()
    );

    enrichTasks.push(
      (async () => {
        try {
          const aggSubs = await searchAggregatedSubtitles({
            tmdbId: idStr,
            title: params.title,
            mediaType: isSeriesLike ? 'tv' : 'movie',
            season,
            episode,
            timeoutMs: 4200,
          });
          for (const s of aggSubs) {
            subtitles.push({
              lang: s.lang,
              label: s.label,
              url: s.url,
              source: s.source || 'opensubtitles',
            });
          }
        } catch {
          // ignore cleanly
        }
      })()
    );

    // TheIntroDB API (from ClipBox inventory: api.theintrodb.org/v3/media)
    enrichTasks.push(
      (async () => {
        try {
          const introUrl = isSeriesLike
            ? `https://api.theintrodb.org/v3/media?tmdb_id=${resolvedTmdbId}&season=${season}&episode=${episode}`
            : `https://api.theintrodb.org/v3/media?tmdb_id=${resolvedTmdbId}`;
          const res = await streamingFetch(introUrl, {
            headers: { 'User-Agent': CHROME_UA },
            timeoutMs: 3200,
          });
          if (res.ok) {
            const json = (await res.json().catch(() => null)) as {
              intro?: { start_sec?: number; end_sec?: number } | Array<{ start_sec?: number; end_sec?: number }>;
              recap?: { start_sec?: number; end_sec?: number };
              credits?: { start_sec?: number; end_sec?: number };
            } | null;
            const pushSeg = (type: string, seg?: { start_sec?: number; end_sec?: number }) => {
              if (seg && typeof seg.start_sec === 'number' && typeof seg.end_sec === 'number') {
                introTimestamps.push({
                  type,
                  startSec: seg.start_sec,
                  endSec: seg.end_sec,
                  source: 'api.theintrodb.org',
                });
              }
            };
            if (Array.isArray(json?.intro)) {
              json.intro.forEach((s) => pushSeg('intro', s));
            } else {
              pushSeg('intro', json?.intro);
            }
            pushSeg('recap', json?.recap);
            pushSeg('credits', json?.credits);
          }
        } catch {
          // ignore
        }
      })()
    );
  } else if (params.title) {
    enrichTasks.push(
      (async () => {
        try {
          const aggSubs = await searchAggregatedSubtitles({
            title: params.title,
            mediaType: isSeriesLike ? 'tv' : 'movie',
            season,
            episode,
            timeoutMs: 3800,
          });
          for (const s of aggSubs) {
            subtitles.push({
              lang: s.lang,
              label: s.label,
              url: s.url,
              source: s.source || 'opensubtitles',
            });
          }
        } catch {
          // ignore
        }
      })()
    );
  }

  // If Kitsu ID is provided, check MAL mapping for AniSkip v2 (api.aniskip.com)
  if (params.kitsuId) {
    enrichTasks.push(
      (async () => {
        try {
          const mapRes = await streamingFetch(
            `https://kitsu.io/api/edge/anime/${encodeURIComponent(params.kitsuId!)}/mappings`,
            { headers: { Accept: 'application/vnd.api+json', 'User-Agent': CHROME_UA }, timeoutMs: 3500 }
          );
          if (!mapRes.ok) return;
          const mapJson = (await mapRes.json().catch(() => null)) as {
            data?: Array<{ attributes?: { externalSite?: string; externalId?: string } }>;
          } | null;
          const malMapping = mapJson?.data?.find(
            (m) => m.attributes?.externalSite === 'myanimelist/anime'
          );
          const malId = malMapping?.attributes?.externalId;
          if (!malId) return;

          const skipRes = await streamingFetch(
            `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types=op&types=ed&episodeLength=0`,
            { headers: { 'User-Agent': CHROME_UA }, timeoutMs: 3200 }
          );
          if (!skipRes.ok) return;
          const skipJson = (await skipRes.json().catch(() => null)) as {
            found?: boolean;
            results?: Array<{
              skipType?: string;
              interval?: { startTime?: number; endTime?: number };
            }>;
          } | null;
          if (skipJson?.found && Array.isArray(skipJson.results)) {
            for (const r of skipJson.results) {
              if (r.interval && typeof r.interval.startTime === 'number' && typeof r.interval.endTime === 'number') {
                introTimestamps.push({
                  type: r.skipType === 'ed' ? 'Ending (ED)' : 'Opening (OP)',
                  startSec: Math.round(r.interval.startTime),
                  endSec: Math.round(r.interval.endTime),
                  source: 'api.aniskip.com',
                });
              }
            }
          }
        } catch {
          // ignore
        }
      })()
    );
  }

  await Promise.all(enrichTasks);

  // Deduplicate subtitles preserving ClipBox VidLink signed SRTs and top ES/LAT/EN sources
  const seenSubs = new Set<string>();
  const dedupedSubtitles = subtitles.filter((s) => {
    if (!s.url || seenSubs.has(s.url)) return false;
    seenSubs.add(s.url);
    return true;
  });

  return {
    title: params.title,
    mediaType: params.mediaType,
    season,
    episode,
    tracks,
    subtitles: dedupedSubtitles,
    introTimestamps,
    portalLinks: [],
  };
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

export async function decodeClipboxInput(
  rawInput: string,
  fetchLiveSample = false
): Promise<ClipboxDecodeResponse> {
  const input = rawInput.trim();
  const inv = parseClipboxInventory();
  const notes: string[] = [];
  const base64Decoded: Array<{ token: string; text: string; json?: unknown }> = [];

  let urlBreakdown: ClipboxDecodeResponse['urlBreakdown'];
  let matchedHost: ClipboxHostEntry | undefined;

  if (/^https?:\/\//i.test(input)) {
    try {
      const u = new URL(input);
      const qp: Record<string, string> = {};
      u.searchParams.forEach((v, k) => {
        qp[k] = v;
      });
      urlBreakdown = {
        protocol: u.protocol,
        host: u.hostname,
        pathname: u.pathname,
        queryParams: qp,
      };
      matchedHost = inv.hosts.find(
        (h) =>
          h.host.toLowerCase() === u.hostname.toLowerCase() ||
          `www.${h.host.toLowerCase()}` === u.hostname.toLowerCase()
      );
      if (matchedHost) {
        notes.push(`Host identificado en ClipBox: ${matchedHost.categoryLabel} (${matchedHost.role}).`);
        if (matchedHost.decodedNote) notes.push(matchedHost.decodedNote);
      }
    } catch {
      // ignore invalid URL parse
    }
  } else {
    matchedHost = inv.hosts.find((h) => h.host.toLowerCase() === input.toLowerCase());
  }

  // Extract Base64 / Base64URL tokens cleanly from path segments, query params, or raw strings
  const candidates = new Set<string>();
  if (!/\s/.test(input) && input.length >= 8 && /^[A-Za-z0-9+/=_-]+$/.test(input)) {
    candidates.add(input);
  }
  if (/^https?:\/\//i.test(input)) {
    try {
      const u = new URL(input);
      for (const seg of u.pathname.split('/')) {
        if (seg.length >= 12) candidates.add(seg);
      }
      u.searchParams.forEach((v) => {
        if (v.length >= 12) candidates.add(v);
      });
      if (u.hash.length > 12) candidates.add(u.hash.slice(1));
    } catch {
      // ignore
    }
  }
  const matches = input.match(/[A-Za-z0-9+_-]{16,}={0,2}/g) || [];
  for (const m of matches) candidates.add(m);

  for (const tok of candidates) {
    const norm = tok.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (norm.length < 8) continue;
    const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
    try {
      const buf = Buffer.from(norm + pad, 'base64');
      const txt = buf.toString('utf8').trim();
      // Heuristic: ensure decoded text has high printable ASCII/UTF-8 ratio
      const printableCount = (txt.match(/[\x20-\x7E\u00A0-\u024F\u4E00-\u9FFF]/g) || []).length;
      if (txt.length >= 4 && printableCount / txt.length >= 0.78) {
        let parsedJson: unknown;
        if ((txt.startsWith('{') && txt.endsWith('}')) || (txt.startsWith('[') && txt.endsWith(']'))) {
          try {
            parsedJson = JSON.parse(txt);
          } catch {
            // not JSON
          }
        }
        base64Decoded.push({ token: tok, text: txt, json: parsedJson });
      }
    } catch {
      // not valid base64
    }
  }

  // Identify extractor family from Smali/ClipBox patterns
  let extractorFamily: string | undefined;
  if (/wish|\.sbs$|hlswish|playerwish|embedwish|swiftplayers/i.test(input)) {
    extractorFamily = 'StreamWishExtractor (packer/jwplayer -> HLS m3u8)';
  } else if (/vidhide|filelions|dhtpre|dhcplay|guccihide/i.test(input)) {
    extractorFamily = 'VidHide / EarnVids Extractor (eval packer -> sources)';
  } else if (/dood|d000d|do7go|dsvplay|myvidplay/i.test(input)) {
    extractorFamily = 'DoodStream Extractor (/pass_md5/ + token)';
  } else if (/mixdrop|m1xdrop|miixdrop|mxdrop/i.test(input)) {
    extractorFamily = 'MixDrop Extractor (MDCore.wurl)';
  } else if (/voe\./i.test(input)) {
    extractorFamily = 'VoeExtractor (redirect + HLS/MP4 cipher)';
  } else if (/filemoon/i.test(input)) {
    extractorFamily = 'FilemoonExtractor (packed jwplayer script)';
  } else if (/enc-dec\.app/i.test(input)) {
    extractorFamily = 'EncDec API Bridge (videasy / megaplay / cinejoy / kisskh / meowtv / nexa)';
  } else if (/fkplayer\.xyz/i.test(input)) {
    extractorFamily = 'FKPlayer Token Decoding API (/api/decoding)';
  } else if (/sibnet/i.test(input)) {
    extractorFamily = 'VideoSibNetExtractor (MP4 player.src)';
  } else if (/mp4upload/i.test(input)) {
    extractorFamily = 'Mp4UploadExtractor (direct MP4 player.src)';
  }

  if (extractorFamily) {
    notes.push(`Familia de extractor ClipBox detectada: ${extractorFamily}`);
  }

  let liveKeysPreview: unknown;
  if (fetchLiveSample) {
    try {
      const targetKeyUrl =
        input.includes('multi-keys')
          ? 'https://raw.githubusercontent.com/Rowdy-Avocado/multi-keys/keys/index.html'
          : input.includes('clipbox.mov')
          ? 'https://clipbox.mov/api/go/zoog/app-settings'
          : 'https://raw.githubusercontent.com/Ciarands/vidsrc-keys/main/keys.json';
      await assertSafeProxyUrl(targetKeyUrl);
      const r = await streamingFetch(targetKeyUrl, {
        headers: { 'User-Agent': CHROME_UA },
        timeoutMs: 4000,
      });
      if (r.ok) {
        const bodyText = await r.text();
        try {
          liveKeysPreview = JSON.parse(bodyText);
        } catch {
          liveKeysPreview = bodyText.slice(0, 1200);
        }
      }
    } catch {
      // ignore fetch failures
    }
  }

  return {
    input,
    detectedType: base64Decoded.some((b) => b.json)
      ? 'Base64 JSON Config'
      : base64Decoded.length > 0
      ? 'Base64 Payload'
      : extractorFamily
      ? 'ClipBox Extractor / API'
      : urlBreakdown
      ? 'URL Estructurada'
      : 'Texto / Patrón',
    matchedHost,
    extractorFamily,
    base64Decoded: base64Decoded.length > 0 ? base64Decoded : undefined,
    urlBreakdown,
    notes,
    liveKeysPreview,
  };
}
