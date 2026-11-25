/**
 * @module server/services/clipbox/clipboxCatalogService
 * @description ClipBox Movies, Series & Anime search + direct native track/subtitle/intro resolver.
 */
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { buildTmdbImageUrl, fetchTmdbJson } from '../tmdbService.ts';
import { CHROME_UA } from '../../extractors/httpHelpers.ts';
import { extractClipboxDirectStreams } from '../../extractors/clipboxDirectExtractor.ts';
import { buildSubtitleProxyUrl, searchAggregatedSubtitles } from '../subtitleAggregator.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';

export type ClipboxSearchScope = 'all' | 'anime' | 'cinema' | 'movies' | 'series';

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

const searchCache = new LruTtlCache<string, ClipboxSearchItem[]>(240, 5 * 60 * 1000);

function normalizeSubLangCode(raw: string): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'MULTI';
  if (s === 'es' || s === 'spa' || s.includes('castellano') || s.includes('español') || s === 'spanish') {
    return 'ES';
  }
  if (s.includes('lat') || s.includes('419') || s.includes('es-mx')) return 'LAT';
  if (s === 'ca' || s === 'cat' || s.includes('catal')) return 'CAT';
  if (s === 'en' || s === 'eng' || s.includes('english')) return 'EN';
  if (s === 'ja' || s === 'jp' || s === 'jpn' || s.includes('japan')) return 'JA';
  if (s === 'fr' || s === 'fre' || s === 'fra' || s.includes('french')) return 'FR';
  if (s === 'pt' || s === 'por' || s.includes('portug')) return 'PT';
  if (s === 'it' || s === 'ita' || s.includes('italian')) return 'IT';
  if (s === 'de' || s === 'ger' || s === 'deu' || s.includes('german')) return 'DE';
  if (s === 'ar' || s === 'ara' || s.includes('arab')) return 'AR';
  return raw.toUpperCase().slice(0, 8);
}

function toSafeSubtitleUrl(rawUrl: string): string {
  const clean = String(rawUrl || '').trim();
  if (!clean) return '';
  if (clean.startsWith('/api/subtitles/proxy')) return clean;
  if (/^https?:\/\//i.test(clean)) return buildSubtitleProxyUrl(clean);
  return '';
}

function parseIntroTimestampSeg(
  type: string,
  seg?: {
    start_sec?: number;
    end_sec?: number;
    start_ms?: number;
    end_ms?: number;
  }
): { type: string; startSec: number; endSec: number; source: string } | null {
  if (!seg) return null;
  if (typeof seg.start_sec === 'number' && typeof seg.end_sec === 'number') {
    return { type, startSec: seg.start_sec, endSec: seg.end_sec, source: 'api.theintrodb.org' };
  }
  if (typeof seg.start_ms === 'number' && typeof seg.end_ms === 'number') {
    return {
      type,
      startSec: Math.round(seg.start_ms / 1000),
      endSec: Math.round(seg.end_ms / 1000),
      source: 'api.theintrodb.org',
    };
  }
  return null;
}

export async function searchClipboxCatalog(
  query: string,
  scope: ClipboxSearchScope = 'all',
  page = 1
): Promise<ClipboxSearchItem[]> {
  const cleanQ = query.trim();
  const safePage = Math.max(1, Math.min(10, Math.floor(page) || 1));
  const cacheKey = `${scope}:${safePage}:${cleanQ.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const results: ClipboxSearchItem[] = [];
  const tasks: Promise<void>[] = [];

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
          const endpoint =
            scope === 'movies'
              ? cleanQ
                ? '/search/movie'
                : '/trending/movie/week'
              : scope === 'series'
              ? cleanQ
                ? '/search/tv'
                : '/trending/tv/week'
              : cleanQ
              ? '/search/multi'
              : '/trending/all/week';
          const qp: Record<string, string> = cleanQ
            ? { query: cleanQ, language: 'es-ES', include_adult: 'false', page: String(safePage) }
            : { language: 'es-ES', page: String(safePage) };
          const data = await fetchTmdbJson<TmdbSearchRes>(endpoint, qp, 5 * 60 * 1000);
          for (const item of data?.results || []) {
            const mt: 'movie' | 'tv' | undefined =
              scope === 'movies'
                ? 'movie'
                : scope === 'series'
                ? 'tv'
                : item.media_type === 'movie' || item.media_type === 'tv'
                ? item.media_type
                : undefined;
            if (!mt || !item.poster_path) continue;
            const year = (item.release_date || item.first_air_date || '').slice(0, 4);
            results.push({
              id: `tmdb-${mt}-${item.id}`,
              source: 'tmdb',
              mediaType: mt,
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

  if (scope === 'all' || scope === 'anime') {
    tasks.push(
      (async () => {
        try {
          const offset = (safePage - 1) * 12;
          const url = cleanQ
            ? `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(
                cleanQ
              )}&page[limit]=12&page[offset]=${offset}`
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
  directMp4Url?: string;
}): Promise<ClipboxTitleStreamsResult> {
  const season = Math.max(1, params.season || 1);
  const episode = Math.max(1, params.episode || 1);
  let resolvedTmdbId = params.tmdbId;

  if (!resolvedTmdbId && params.title && !params.directMp4Url) {
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

  if (
    params.directMp4Url &&
    /^https:\/\/archive\.org\/download\/[A-Za-z0-9._-]+\/.+\.mp4$/i.test(params.directMp4Url)
  ) {
    tracks.push({
      id: `cb-archive-mp4-${Buffer.from(params.directMp4Url).toString('hex').slice(0, 10)}`,
      provider: 'Internet Archive MP4 Directo',
      label: 'Película Directa MP4 · Dominio Público / Archivo HD',
      lang: 'EN / VO',
      quality: 'HD MP4',
      mode: 'direct',
      url: params.directMp4Url,
      rawUrl: params.directMp4Url,
      note: 'Archivo MP4 directo verificado desde Internet Archive sin bloqueos.',
    });
  }

  if (resolvedTmdbId || params.title) {
    const extractQs = new URLSearchParams({
      title: params.title,
      ...(resolvedTmdbId ? { tmdbId: String(resolvedTmdbId) } : {}),
      mediaType: isSeriesLike ? 'tv' : 'movie',
      preferLang: params.mediaType === 'anime' ? 'VOSE' : 'ES',
      directOnly: '1',
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
      note: 'Resuelve flujo HLS/MP4 directo con subtítulos dentro del reproductor nativo.',
    });
  }

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
            const safeUrl = toSafeSubtitleUrl(sub.url);
            if (!safeUrl) continue;
            subtitles.push({
              lang: normalizeSubLangCode(sub.lang || sub.label),
              label: sub.label,
              url: safeUrl,
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
          const aggSubs = await searchAggregatedSubtitles({
            tmdbId: idStr,
            title: params.title,
            mediaType: isSeriesLike ? 'tv' : 'movie',
            season,
            episode,
            timeoutMs: 4200,
          });
          for (const s of aggSubs) {
            const safeUrl = toSafeSubtitleUrl(s.url);
            if (!safeUrl) continue;
            subtitles.push({
              lang: normalizeSubLangCode(s.lang || s.label),
              label: s.label,
              url: safeUrl,
              source: s.source || 'opensubtitles',
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
          const introUrl = isSeriesLike
            ? `https://api.theintrodb.org/v3/media?tmdb_id=${resolvedTmdbId}&season=${season}&episode=${episode}`
            : `https://api.theintrodb.org/v3/media?tmdb_id=${resolvedTmdbId}`;
          const res = await streamingFetch(introUrl, {
            headers: { 'User-Agent': CHROME_UA },
            timeoutMs: 3200,
          });
          if (res.ok) {
            const json = (await res.json().catch(() => null)) as any;
            const pushSeg = (type: string, seg: any) => {
              const parsed = parseIntroTimestampSeg(type, seg);
              if (parsed) introTimestamps.push(parsed);
            };
            if (Array.isArray(json?.intro)) json.intro.forEach((s: any) => pushSeg('intro', s));
            else pushSeg('intro', json?.intro);
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
            const safeUrl = toSafeSubtitleUrl(s.url);
            if (!safeUrl) continue;
            subtitles.push({
              lang: normalizeSubLangCode(s.lang || s.label),
              label: s.label,
              url: safeUrl,
              source: s.source || 'opensubtitles',
            });
          }
        } catch {
          // ignore
        }
      })()
    );
  }

  if (params.kitsuId) {
    enrichTasks.push(
      (async () => {
        try {
          const mapRes = await streamingFetch(
            `https://kitsu.io/api/edge/anime/${encodeURIComponent(params.kitsuId!)}/mappings`,
            { headers: { Accept: 'application/vnd.api+json', 'User-Agent': CHROME_UA }, timeoutMs: 3500 }
          );
          if (!mapRes.ok) return;
          const mapJson = (await mapRes.json().catch(() => null)) as any;
          const malMapping = mapJson?.data?.find(
            (m: any) => m.attributes?.externalSite === 'myanimelist/anime'
          );
          const malId = malMapping?.attributes?.externalId;
          if (!malId) return;

          const skipRes = await streamingFetch(
            `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types=op&types=ed&episodeLength=0`,
            { headers: { 'User-Agent': CHROME_UA }, timeoutMs: 3200 }
          );
          if (!skipRes.ok) return;
          const skipJson = (await skipRes.json().catch(() => null)) as any;
          if (skipJson?.found && Array.isArray(skipJson.results)) {
            for (const r of skipJson.results) {
              if (
                r.interval &&
                typeof r.interval.startTime === 'number' &&
                typeof r.interval.endTime === 'number'
              ) {
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
