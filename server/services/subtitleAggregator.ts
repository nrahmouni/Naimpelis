/**
 * @module server/services/subtitleAggregator
 * @description Multi-source cloud subtitle search & binary gzip/charset decoder.
 * Aggregates OpenSubtitles-v3 Stremio, OpenSubtitles REST, VidLink captions (optional),
 * and optional SubDL API (when SUBDL_API_KEY env var is present), prioritizing ES/LAT/CAT/EN.
 */
import zlib from 'zlib';
import { CHROME_UA } from '../extractors/httpHelpers.ts';
import { fetchTmdbJson } from './tmdbService.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';

export interface NormalizedSubtitleTrack {
  id: string;
  label: string;
  lang: string;
  url: string;
  source?: string;
}

const subAggCache = new LruTtlCache<string, { tracks: NormalizedSubtitleTrack[]; ts: number }>(
  300,
  20 * 60 * 1000
);

function mapSubtitleLang(rawLang: string): { code: string; label: string; rank: number } | null {
  const l = String(rawLang || '').trim().toLowerCase();
  if (!l) return null;

  if (
    l === 'es' ||
    l === 'spa' ||
    l === 'spanish' ||
    l === 'español' ||
    l.includes('castellano') ||
    l.includes('es-es')
  ) {
    return { code: 'ES', label: 'Español', rank: 1 };
  }
  if (l.includes('lat') || l.includes('es-419') || l.includes('es-mx') || l.includes('spanish latin')) {
    return { code: 'LAT', label: 'Español Latino', rank: 2 };
  }
  if (l === 'ca' || l === 'cat' || l.includes('catalan') || l.includes('català')) {
    return { code: 'CAT', label: 'Català', rank: 3 };
  }
  if (l === 'en' || l === 'eng' || l.includes('english')) {
    return { code: 'EN', label: 'English', rank: 4 };
  }
  if (l === 'pt' || l === 'por' || l.includes('portugu')) {
    return { code: 'PT', label: 'Português', rank: 5 };
  }
  if (l === 'fr' || l === 'fre' || l === 'fra' || l.includes('franç') || l.includes('french')) {
    return { code: 'FR', label: 'Français', rank: 6 };
  }
  if (l === 'it' || l === 'ita' || l.includes('italian')) {
    return { code: 'IT', label: 'Italiano', rank: 7 };
  }
  if (l === 'ar' || l === 'ara' || rawLang.includes('العربية')) {
    return { code: 'AR', label: 'العربية', rank: 8 };
  }
  return null;
}

export function buildSubtitleProxyUrl(rawSubtitleUrl: string): string {
  return `/api/subtitles/proxy?url=${encodeURIComponent(rawSubtitleUrl)}`;
}

export function decodeSubtitleBuffer(buf: Buffer, urlHint = ''): string {
  if (!buf || buf.length === 0) return '';
  let rawBuf = buf;

  const hasGzipMagic = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (hasGzipMagic || /\.gz(\?|$)/i.test(urlHint)) {
    try {
      rawBuf = zlib.gunzipSync(buf);
    } catch {
      // Keep original buffer if not actually gzip
    }
  }

  // Strip UTF-8 BOM if present
  let utf8 = rawBuf.toString('utf8').replace(/^\uFEFF/, '');
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > 3 && utf8.length > 0 && replacementCount / utf8.length > 0.01) {
    utf8 = rawBuf.toString('latin1').replace(/^\uFEFF/, '');
  }
  return utf8.trim();
}

async function resolveImdbAndTitleMeta(
  tmdbId: string,
  mediaType: 'movie' | 'tv'
): Promise<{ imdbId: string | null; title: string | null }> {
  const cleanId = String(tmdbId || '').replace(/\D/g, '');
  if (!cleanId) return { imdbId: null, title: null };
  try {
    const data = await fetchTmdbJson<{
      imdb_id?: string;
      title?: string;
      name?: string;
      external_ids?: { imdb_id?: string };
    }>(
      `/${mediaType}/${cleanId}`,
      { language: 'es-ES', append_to_response: 'external_ids' },
      24 * 60 * 60 * 1000
    );
    const imdbId = data?.external_ids?.imdb_id || data?.imdb_id || null;
    const title = data?.title || data?.name || null;
    return { imdbId, title };
  } catch {
    return { imdbId: null, title: null };
  }
}

async function fetchOpenSubtitlesStremio(
  imdbId: string,
  mediaType: 'movie' | 'tv',
  season: number,
  episode: number,
  timeoutMs: number
): Promise<Array<NormalizedSubtitleTrack & { _rank: number }>> {
  const isSeries = mediaType === 'tv' && season > 0 && episode > 0;
  const stremioId = isSeries ? `${imdbId}:${season}:${episode}` : imdbId;
  const endpoint = `https://opensubtitles-v3.strem.io/subtitles/${
    isSeries ? 'series' : 'movie'
  }/${encodeURIComponent(stremioId)}.json`;

  try {
    const res = await streamingFetch(endpoint, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      timeoutMs,
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as {
      subtitles?: Array<{ id?: string; url?: string; lang?: string; SubFileName?: string }>;
    } | null;
    if (!Array.isArray(json?.subtitles)) return [];

    const out: Array<NormalizedSubtitleTrack & { _rank: number }> = [];
    const seen = new Set<string>();
    const perLangCount = new Map<string, number>();

    for (const item of json.subtitles) {
      if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
      const mapped = mapSubtitleLang(item.lang || '');
      if (!mapped) continue;

      const count = perLangCount.get(mapped.code) || 0;
      if (count >= 4) continue;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      perLangCount.set(mapped.code, count + 1);

      out.push({
        id: `osv3-${mapped.code.toLowerCase()}-${count + 1}`,
        label: `${mapped.label} · OpenSubtitles #${count + 1}`,
        lang: mapped.code,
        url: buildSubtitleProxyUrl(item.url),
        source: 'opensubtitles-v3.strem.io',
        _rank: mapped.rank * 10 + count,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchOpenSubtitlesRest(
  imdbId: string,
  mediaType: 'movie' | 'tv',
  season: number,
  episode: number,
  timeoutMs: number
): Promise<Array<NormalizedSubtitleTrack & { _rank: number }>> {
  const numericImdb = imdbId.replace(/^tt/i, '').replace(/\D/g, '');
  if (!numericImdb) return [];

  const isSeries = mediaType === 'tv' && season > 0 && episode > 0;
  const pathSeg = isSeries
    ? `/episode-${episode}/imdbid-${numericImdb}/season-${season}/sublanguageid-spa,eng,cat`
    : `/imdbid-${numericImdb}/sublanguageid-spa,eng,cat`;

  try {
    const res = await streamingFetch(`https://rest.opensubtitles.org/search${pathSeg}`, {
      headers: {
        'User-Agent': 'TemporaryUserAgent',
        'X-User-Agent': 'TemporaryUserAgent',
        Accept: 'application/json',
      },
      timeoutMs,
    });
    if (!res.ok) return [];
    const list = (await res.json().catch(() => null)) as Array<{
      SubDownloadLink?: string;
      ISO639?: string;
      LanguageName?: string;
      SubFormat?: string;
      SubDownloadsCnt?: string;
    }> | null;
    if (!Array.isArray(list)) return [];

    const sorted = [...list].sort(
      (a, b) => Number(b.SubDownloadsCnt || 0) - Number(a.SubDownloadsCnt || 0)
    );
    const out: Array<NormalizedSubtitleTrack & { _rank: number }> = [];
    const perLangCount = new Map<string, number>();

    for (const item of sorted) {
      const rawDl = String(item?.SubDownloadLink || '').trim();
      if (!rawDl || !/^https?:\/\//i.test(rawDl)) continue;
      if (item.SubFormat && !/^(srt|vtt|sub)$/i.test(item.SubFormat)) continue;
      const mapped = mapSubtitleLang(item.ISO639 || item.LanguageName || '');
      if (!mapped) continue;

      const count = perLangCount.get(mapped.code) || 0;
      if (count >= 3) continue;
      perLangCount.set(mapped.code, count + 1);

      out.push({
        id: `osrest-${mapped.code.toLowerCase()}-${count + 1}`,
        label: `${mapped.label} · OpenSubtitles ORG #${count + 1}`,
        lang: mapped.code,
        url: buildSubtitleProxyUrl(rawDl),
        source: 'rest.opensubtitles.org',
        _rank: mapped.rank * 10 + count + 3,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchSubdlSubtitles(
  tmdbId: string,
  mediaType: 'movie' | 'tv',
  season: number,
  episode: number,
  timeoutMs: number
): Promise<Array<NormalizedSubtitleTrack & { _rank: number }>> {
  const apiKey = String(process.env.SUBDL_API_KEY || '').trim();
  if (!apiKey || !tmdbId) return [];

  try {
    const qs = new URLSearchParams({
      api_key: apiKey,
      tmdb_id: tmdbId,
      type: mediaType === 'tv' ? 'tv' : 'movie',
      languages: 'ES,EN',
      subs_per_page: '10',
    });
    if (mediaType === 'tv' && season > 0 && episode > 0) {
      qs.set('season_number', String(season));
      qs.set('episode_number', String(episode));
    }
    const res = await streamingFetch(`https://api.subdl.com/api/v1/subtitles?${qs.toString()}`, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      timeoutMs,
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as {
      subtitles?: Array<{ url?: string; lang?: string; release_name?: string }>;
    } | null;
    if (!Array.isArray(json?.subtitles)) return [];

    const out: Array<NormalizedSubtitleTrack & { _rank: number }> = [];
    json.subtitles.slice(0, 6).forEach((sub, idx) => {
      if (!sub?.url) return;
      const mapped = mapSubtitleLang(sub.lang || 'EN');
      if (!mapped) return;
      const dlUrl = sub.url.startsWith('http')
        ? sub.url
        : `https://dl.subdl.com${sub.url.startsWith('/') ? '' : '/'}${sub.url}`;
      out.push({
        id: `subdl-${mapped.code.toLowerCase()}-${idx + 1}`,
        label: `${mapped.label} · SubDL #${idx + 1}`,
        lang: mapped.code,
        url: buildSubtitleProxyUrl(dlUrl),
        source: 'api.subdl.com',
        _rank: mapped.rank * 10 + idx,
      });
    });
    return out;
  } catch {
    return [];
  }
}

export async function searchAggregatedSubtitles(opts: {
  tmdbId?: string;
  imdbId?: string | null;
  title?: string;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  timeoutMs?: number;
  extraInlineTracks?: NormalizedSubtitleTrack[];
}): Promise<NormalizedSubtitleTrack[]> {
  let cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  let mediaType: 'movie' | 'tv' = opts.mediaType === 'tv' ? 'tv' : 'movie';
  const season = Math.max(0, Number(opts.season || 0));
  const episode = Math.max(0, Number(opts.episode || 0));
  if (season > 0 && episode > 0) mediaType = 'tv';
  const timeoutMs = opts.timeoutMs || 5200;

  if (!cleanId && opts.title) {
    try {
      const searchRes = await fetchTmdbJson<{
        results?: Array<{ id?: number; media_type?: string }>;
      }>(
        '/search/multi',
        { query: opts.title.trim(), language: 'es-ES', include_adult: 'false' },
        60 * 60 * 1000
      );
      const hit = searchRes?.results?.find(
        (r) =>
          r?.id &&
          (r.media_type === mediaType || r.media_type === 'movie' || r.media_type === 'tv')
      );
      if (hit?.id) {
        cleanId = String(hit.id);
        if (hit.media_type === 'tv' || hit.media_type === 'movie') {
          mediaType = hit.media_type;
        }
      }
    } catch {
      // continue cleanly
    }
  }

  const cacheKey = `${cleanId || opts.imdbId || opts.title || 'none'}|${mediaType}|${season}|${episode}`;
  const cached = subAggCache.get(cacheKey);
  if (
    cached &&
    Date.now() - cached.ts < 15 * 60 * 1000 &&
    (!opts.extraInlineTracks || opts.extraInlineTracks.length === 0)
  ) {
    return cached.tracks;
  }

  let effectiveImdbId = opts.imdbId || null;
  if (!effectiveImdbId && cleanId) {
    const meta = await resolveImdbAndTitleMeta(cleanId, mediaType);
    effectiveImdbId = meta.imdbId;
    if (!effectiveImdbId) {
      const altType: 'movie' | 'tv' = mediaType === 'tv' ? 'movie' : 'tv';
      const altMeta = await resolveImdbAndTitleMeta(cleanId, altType);
      if (altMeta.imdbId) {
        effectiveImdbId = altMeta.imdbId;
        mediaType = altType;
      }
    }
  }

  const tasks: Promise<Array<NormalizedSubtitleTrack & { _rank: number }>>[] = [];
  if (effectiveImdbId) {
    tasks.push(fetchOpenSubtitlesStremio(effectiveImdbId, mediaType, season, episode, timeoutMs));
    tasks.push(fetchOpenSubtitlesRest(effectiveImdbId, mediaType, season, episode, timeoutMs));
  }
  if (cleanId) {
    tasks.push(fetchSubdlSubtitles(cleanId, mediaType, season, episode, timeoutMs));
  }

  const extraTagged: Array<NormalizedSubtitleTrack & { _rank: number }> = (
    opts.extraInlineTracks || []
  ).map((t, idx) => {
    const mapped = mapSubtitleLang(t.lang || t.label);
    return {
      ...t,
      lang: mapped?.code || t.lang || 'MULTI',
      _rank: (mapped?.rank ?? 9) * 10 - 2 + idx * 0.1,
    };
  });

  const providerBatches = await Promise.all(tasks);
  const combined = [...extraTagged, ...providerBatches.flat()].sort((a, b) => a._rank - b._rank);

  const deduped: NormalizedSubtitleTrack[] = [];
  const seenUrls = new Set<string>();
  for (const item of combined) {
    if (!item.url || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    deduped.push({
      id: item.id,
      label: item.label,
      lang: item.lang,
      url: item.url,
      source: item.source,
    });
    if (deduped.length >= 16) break;
  }

  if (deduped.length > 0 && (!opts.extraInlineTracks || opts.extraInlineTracks.length === 0)) {
    subAggCache.set(cacheKey, { tracks: deduped, ts: Date.now() });
  }
  return deduped;
}
