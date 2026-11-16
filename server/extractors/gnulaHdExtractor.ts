import {
  CHROME_UA,
  curlGetText,
  fetchTextWithCurlFallback,
  normalizeTitleForMatch,
  areTitlesStrictlyEqual,
  isMetadataCompatibleForMedia,
  parseDurationTextToMinutes,
  type TrackRecord,
} from './httpHelpers.ts';
import { unpackVidhideToHls } from './vidhideEmbed69.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';

/**
 * GNULA HD EXTRACTOR & CATALOG SERVICE
 *
 * Mirror Directory: https://dominiosgnulahd.com/
 * Primary / Active Mirrors: https://ww3.gnulahd.nu, https://gnulahd.click, https://gnulahd.bid
 */

export const GNULA_DIRECTORY_URL = 'https://dominiosgnulahd.com/';

export const GNULA_MIRRORS = [
  'https://ww3.gnulahd.nu',
  'https://gnulahd.click',
  'https://gnulahd.bid',
];

let activeGnulaOrigin = GNULA_MIRRORS[0];

const gnulaMirrorsCache = new LruTtlCache<string, string[]>(4, 15 * 60 * 1000);
const gnulaPageMetaCache = new LruTtlCache<string, GnulaPageMetadata>(350, 15 * 60 * 1000);
const gnulaSearchCache = new LruTtlCache<string, GnulaSearchResultItem[]>(300, 10 * 60 * 1000);
const gnulaCatalogCache = new LruTtlCache<
  string,
  { items: GnulaCatalogCardItem[]; hasMore: boolean }
>(120, 8 * 60 * 1000);

export interface GnulaSearchResultItem {
  title: string;
  url: string;
  img: string;
  type: string;
  year: string;
}

export interface GnulaPageMetadata {
  cleanTitle: string;
  origTitle: string;
  year: string;
  rating: string;
  durationText: string;
  durationMin: number;
  director: string;
  genres: string[];
  overview: string;
  poster: string;
  backdrop: string;
  isTvShow: boolean;
  episodeUrls: Record<string, string>;
  pid: number;
  token: string;
  resolvedUrl: string;
  html: string;
}

export interface GnulaCatalogCardItem {
  id: string;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  gnulaUrl: string;
  languages: string[];
  genres: string[];
  sources: ['gnula'];
}

export function isGnulaHdUrl(rawUrl: string): boolean {
  return /gnulahd\.(?:nu|click|bid|com)\/(?:ver\/|[a-z0-9-]+-\d+x\d+\/?)/i.test(
    String(rawUrl || '').trim()
  );
}

export function normalizeGnulaUrl(rawUrl: string, targetOrigin = activeGnulaOrigin): string {
  const s = String(rawUrl || '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `${targetOrigin}${s}`;
  return s.replace(/^https?:\/\/(?:ww\d+\.)?gnulahd\.(?:nu|click|bid|com)/i, targetOrigin);
}

/**
 * Discovers current operational Gnula HD mirrors from https://dominiosgnulahd.com/
 */
export async function resolveActiveGnulaMirrors(): Promise<string[]> {
  const cached = gnulaMirrorsCache.get('mirrors');
  if (cached && cached.length > 0) return cached;

  const discovered: string[] = [];
  try {
    const dirHtml = await fetchTextWithCurlFallback(
      GNULA_DIRECTORY_URL,
      { 'User-Agent': CHROME_UA },
      3500
    );
    if (dirHtml) {
      const re = /href=["'](https:\/\/[^"'\s<>]*gnulahd\.(?:nu|click|bid)[^"'\s<>]*)["']/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(dirHtml)) !== null) {
        try {
          const origin = new URL(m[1]).origin;
          if (!discovered.includes(origin)) discovered.push(origin);
        } catch {
          // ignore invalid URL
        }
      }
    }
  } catch {
    // fallback to static mirror list
  }

  const ordered = Array.from(new Set([...discovered, activeGnulaOrigin, ...GNULA_MIRRORS]));
  if (ordered.length > 0) {
    activeGnulaOrigin = ordered[0];
    gnulaMirrorsCache.set('mirrors', ordered);
  }
  return ordered;
}

export async function resolveActiveGnulaOrigin(): Promise<string> {
  const mirrors = await resolveActiveGnulaMirrors();
  return mirrors[0] || activeGnulaOrigin;
}

async function getOrderedMirrors(): Promise<string[]> {
  const cached = gnulaMirrorsCache.get('mirrors');
  if (cached && cached.length > 0) {
    return Array.from(new Set([activeGnulaOrigin, ...cached, ...GNULA_MIRRORS]));
  }
  // Never block interactive search/extract requests for 2s on dominiosgnulahd.com; refresh in background
  void resolveActiveGnulaMirrors().catch(() => undefined);
  return Array.from(new Set([activeGnulaOrigin, ...GNULA_MIRRORS]));
}

async function fetchGnulaPathWithMirrorFailover(
  relativePathOrUrl: string,
  opts?: { referer?: string; acceptJson?: boolean; timeoutMs?: number }
): Promise<{ text: string; origin: string; url: string } | null> {
  const mirrors = await getOrderedMirrors();
  let relPath = relativePathOrUrl.trim();
  if (/^https?:\/\//i.test(relPath)) {
    try {
      const u = new URL(relPath);
      relPath = `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  } else if (!relPath.startsWith('/')) {
    relPath = `/${relPath}`;
  }

  const timeoutMs = opts?.timeoutMs || 4500;
  for (const origin of mirrors) {
    const fullUrl = `${origin}${relPath}`;
    try {
      const html = await fetchTextWithCurlFallback(
        fullUrl,
        {
          'User-Agent': CHROME_UA,
          Referer: opts?.referer ? normalizeGnulaUrl(opts.referer, origin) : `${origin}/`,
          ...(opts?.acceptJson ? { Accept: 'application/json' } : {}),
        },
        timeoutMs
      );
      if (html && html.length > 20 && !/^<\?xml|Access denied|Just a moment\.\.\./i.test(html.slice(0, 300))) {
        activeGnulaOrigin = origin;
        return { text: html, origin, url: fullUrl };
      }
    } catch {
      // failover to next mirror
    }
  }
  return null;
}

/**
 * Unpacks XOR-encrypted player JSON payload from Gnula HD API
 * XOR key = [103, 78, 55, 100] ('gN7d')
 */
export function gnrdUnpack(base64Payload: string): {
  t?: string;
  langs?: Array<{
    label: string;
    flag?: string;
    servers: Array<{ title: string; src: string }>;
  }>;
  dl?: Array<{ name: string; lang: string; qual: string; url: string }>;
} {
  try {
    const cleanB64 = String(base64Payload || '').trim();
    if (!cleanB64) return {};
    const b = Buffer.from(cleanB64, 'base64');
    const k = [103, 78, 55, 100];
    const a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) {
      a[i] = b[i] ^ k[i & 3];
    }
    const decoded = new TextDecoder('utf-8').decode(a);
    return JSON.parse(decoded);
  } catch (err) {
    logger.debug({ err }, 'gnrdUnpack_failed');
    return {};
  }
}

export function parseGnulaCardsFromHtml(html: string, origin = activeGnulaOrigin): GnulaCatalogCardItem[] {
  const items: GnulaCatalogCardItem[] = [];
  const seenUrls = new Set<string>();
  const cardRe = /<a\s+class="gnrd-card"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = cardRe.exec(html)) !== null) {
    const rawHref = String(m[1] || '').trim();
    const block = m[2] || '';
    if (!rawHref || !/\/ver\//i.test(rawHref)) continue;

    const gnulaUrl = normalizeGnulaUrl(rawHref, origin);
    if (!gnulaUrl || seenUrls.has(gnulaUrl)) continue;
    seenUrls.add(gnulaUrl);

    const imgSrcMatch = block.match(/<img[^>]+(?:data-src|src)="([^"]+)"/i);
    const imgAltMatch = block.match(/<img[^>]+alt="([^"]*)"/i);
    const rawImg = imgSrcMatch?.[1] ? imgSrcMatch[1].trim() : '';
    const altTitle = imgAltMatch?.[1] ? imgAltMatch[1].trim() : '';

    const titleSpanMatch = block.match(/<span\s+class="gnrd-card-title">([^<]+)<\/span>/i);
    const title = (titleSpanMatch?.[1] || altTitle || '').trim();
    if (!title || title.length < 2) continue;

    const ratingMatch = block.match(/class="gnrd-(?:cm-)?rating"[^>]*>★?\s*([\d.]+)/i);
    const rating = ratingMatch?.[1] ? ratingMatch[1].trim() : '';

    const yearMatch = block.match(/<div\s+class="gnrd-card-metaline">[\s\S]*?<span>((?:19|20)\d{2})<\/span>/i);
    const year = yearMatch?.[1] ? yearMatch[1].trim() : 'HD';

    const genresMatch = block.match(/<div\s+class="gnrd-card-genres">([^<]+)<\/div>/i);
    const genres = genresMatch?.[1]
      ? genresMatch[1]
          .split('·')
          .map((g) => g.trim())
          .filter(Boolean)
      : [];

    const langs = [...block.matchAll(/<span\s+class="gnrd-lang">([^<]+)<\/span>/gi)].map((lm) => {
      const code = String(lm[1] || '').trim().toUpperCase();
      if (code === 'CAS' || code === 'ES' || code === 'ESP') return 'Castellano';
      if (code === 'LAT') return 'Latino';
      if (code === 'SUB' || code === 'VOSE') return 'VOSE';
      return code;
    });

    const absImg = rawImg ? normalizeGnulaUrl(rawImg, origin) : '';
    const proxiedPoster = absImg ? `/api/img-proxy?url=${encodeURIComponent(absImg)}` : '';

    const slug =
      gnulaUrl
        .split('/ver/')[1]
        ?.replace(/\//g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '') || `${items.length}`;

    // Detect if card came from series/anime sections or has episode badge
    const isSeriesCard =
      /Temporada|Episodio|Cap[íi]tulo|\bS\d+\b/i.test(block) ||
      /Anime|Animaci[óo]n/i.test(genres.join(' ')) && /Sub|LAT/i.test(langs.join(' ')) && /\bseries?\b/i.test(rawHref);

    items.push({
      id: `gnula-${slug}`,
      mediaType: isSeriesCard ? 'tv' : 'movie',
      title,
      originalTitle: title,
      year,
      rating,
      overview:
        'Disponible en reproducción directa HD HLS (Castellano, Español Latino y VOSE vía GnulaHD).',
      poster: proxiedPoster,
      backdrop: proxiedPoster,
      gnulaUrl,
      languages: langs.length > 0 ? Array.from(new Set(langs)) : ['Castellano', 'Latino', 'VOSE'],
      genres,
      sources: ['gnula'],
    });
  }

  return items;
}

/**
 * Fast search query on Gnula HD via /wp-json/gnrd/v1/search?q= with mirror failover
 */
export async function searchGnulaHd(query: string): Promise<GnulaSearchResultItem[]> {
  const q = String(query || '').trim();
  if (!q || q.length < 2) return [];

  const cacheKey = q.toLowerCase();
  const cached = gnulaSearchCache.get(cacheKey);
  if (cached) return cached;

  const mirrors = await getOrderedMirrors();

  for (const origin of mirrors) {
    try {
      const searchApi = `${origin}/wp-json/gnrd/v1/search?q=${encodeURIComponent(q)}`;
      const { text } = await curlGetText(
        searchApi,
        {
          'User-Agent': CHROME_UA,
          Referer: `${origin}/`,
          Accept: 'application/json',
        },
        4,
        true
      );
      if (text && text.trim().startsWith('{')) {
        const json = JSON.parse(text);
        if (Array.isArray(json?.results)) {
          activeGnulaOrigin = origin;
          const results: GnulaSearchResultItem[] = json.results.map((r: any) => ({
            title: String(r.title || '').trim(),
            url: normalizeGnulaUrl(String(r.url || '').trim(), origin),
            img: normalizeGnulaUrl(String(r.img || '').trim(), origin),
            type: String(r.type || 'Pelicula').trim(),
            year: String(r.year || '').replace(/\D/g, ''),
          }));
          gnulaSearchCache.set(cacheKey, results);
          return results;
        }
      }
    } catch {
      // try next mirror
    }
  }

  // HTML search fallback across mirrors
  const htmlRes = await fetchGnulaPathWithMirrorFailover(`/?s=${encodeURIComponent(q)}`, {
    timeoutMs: 4500,
  });
  if (htmlRes?.text) {
    const cards = parseGnulaCardsFromHtml(htmlRes.text, htmlRes.origin);
    if (cards.length > 0) {
      const results: GnulaSearchResultItem[] = cards.map((c) => ({
        title: c.title,
        url: c.gnulaUrl,
        img: c.poster,
        type: c.mediaType === 'tv' ? 'Serie' : 'Pelicula',
        year: /^\d{4}$/.test(c.year) ? c.year : '',
      }));
      gnulaSearchCache.set(cacheKey, results);
      return results;
    }
  }

  return [];
}

/**
 * Parses Gnula HD movie or series page HTML for metadata, episode links, PID and Tok
 */
export function parseGnulaHtmlMetadata(html: string, resolvedUrl = ''): GnulaPageMetadata {
  const h1Match =
    html.match(/<span\s+class="gnrd-sr">([^<]+)<\/span>/i) ||
    html.match(/<h1[^>]*class="[^"]*gnrd-fi-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const tagClean = String(titleTagMatch?.[1] || '')
    .replace(/\(((?:19|20)\d{2})\)[\s\S]*$/i, '')
    .replace(/\s*\|\s*Gnula[\s\S]*$/i, '')
    .replace(/^Ver\s+/i, '')
    .replace(/\s+Online[\s\S]*$/i, '')
    .trim();
  const cleanTitle = h1Match?.[1] ? h1Match[1].trim() : tagClean;

  const origMatch = html.match(/<div\s+class="gnrd-fi-orig">([^<]+)<\/div>/i);
  const origTitle = origMatch?.[1] ? origMatch[1].trim() : '';

  const yearMatch =
    html.match(/<span\s+class="gnrd-eyebrow">[^<]*?((?:19|20)\d{2})<\/span>/i) ||
    html.match(/<div\s+class="qf"><span\s+class="qf-l">Año<\/span><span\s+class="qf-v">((?:19|20)\d{2})<\/span>/i) ||
    html.match(/"datePublished"\s*:\s*"((?:19|20)\d{2})/i) ||
    String(titleTagMatch?.[1] || '').match(/\(((?:19|20)\d{2})\)/);
  const year = yearMatch?.[1] ? yearMatch[1].trim() : '';

  const ratingMatch = html.match(/<span\s+class="gnrd-m-rating"[^>]*>★?\s*([\d.]+)/i);
  const rating = ratingMatch?.[1] ? ratingMatch[1].trim() : '';

  const isoDur = html.match(/"duration"\s*:\s*"(PT[^"]+)"/i)?.[1] || '';
  const durMatch =
    html.match(/<span>(\d+\s*hr\.?\s*\d*\s*min\.?|\d+\s*min)<\/span>/i) ||
    html.match(/Duraci[oó]n\s*(?:<[^>]+>\s*)*(\d+\s*hr\.?\s*\d*\s*min\.?|\d+\s*min\.?)/i);
  const durationText = durMatch?.[1] ? durMatch[1].trim() : '';
  const durationMin =
    parseDurationTextToMinutes(isoDur) || parseDurationTextToMinutes(durationText) || 0;

  const director =
    html.match(/"director"\s*:\s*\[\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)?.[1]?.trim() ||
    html.match(/"director"\s*:\s*\{\s*[^}]*"name"\s*:\s*"([^"]+)"/i)?.[1]?.trim() ||
    '';

  const pMatch = html.match(/<p\s+class="gnrd-fi-syn[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const overview = pMatch?.[1] ? pMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  const bgMatch = html.match(
    /class="gnrd-fi-bg\s*"[^>]*style="background-image:url\(['"]([^'"]+)['"]\)"/i
  );
  const backdrop = bgMatch?.[1] ? bgMatch[1].trim() : '';

  const posterMatch = html.match(/<meta\s+itemprop="image"\s+content="([^"]+)"/i);
  const poster = posterMatch?.[1] ? posterMatch[1].trim() : '';

  const genres = [...html.matchAll(/class="gnrd-fi-genre"[^>]*>([^<]+)</gi)]
    .map((gm) => String(gm[1] || '').trim())
    .filter(Boolean);

  const pidTokMatch = html.match(
    /var\s+_gnrdPid\s*=\s*(\d+)\s*,\s*_gnrdTok\s*=\s*["']([a-f0-9]+)["']/i
  );
  const pid = pidTokMatch ? parseInt(pidTokMatch[1], 10) : 0;
  const token = pidTokMatch ? pidTokMatch[2] : '';

  const episodeUrls: Record<string, string> = {};
  const epRe = /href=["']((?:https?:\/\/[^"']*gnulahd\.[^"'/]+)?\/[^"']*?-(\d+)x0?(\d+)\/?(?:\?[^"']*)?)["']/gi;
  let epM: RegExpExecArray | null;
  while ((epM = epRe.exec(html)) !== null) {
    const key = `${parseInt(epM[2], 10)}x${parseInt(epM[3], 10)}`;
    if (!episodeUrls[key]) {
      episodeUrls[key] = normalizeGnulaUrl(epM[1]);
    }
  }

  const isTvShow =
    Object.keys(episodeUrls).length > 0 ||
    /id=["']gnrd-cta-play["'][^>]*href=["'][^"']*-\d+x\d+/i.test(html) ||
    /gnrd-eplist/i.test(html);

  return {
    cleanTitle: cleanTitle || origTitle,
    origTitle,
    year,
    rating,
    durationText,
    durationMin,
    director,
    genres,
    overview,
    poster,
    backdrop,
    isTvShow,
    episodeUrls,
    pid,
    token,
    resolvedUrl,
    html,
  };
}

export async function fetchGnulaPageMetadata(pageUrl: string): Promise<GnulaPageMetadata | null> {
  const cleanUrl = normalizeGnulaUrl(pageUrl);
  if (!cleanUrl) return null;

  const cached = gnulaPageMetaCache.get(cleanUrl);
  if (cached) return cached;

  const res = await fetchGnulaPathWithMirrorFailover(cleanUrl, {
    timeoutMs: 5000,
  });
  if (!res?.text) return null;

  const meta = parseGnulaHtmlMetadata(res.text, res.url);
  gnulaPageMetaCache.set(cleanUrl, meta);
  gnulaPageMetaCache.set(res.url, meta);
  return meta;
}

export function verifyGnulaMetaMatch(
  meta: Pick<
    GnulaPageMetadata,
    'cleanTitle' | 'origTitle' | 'year' | 'durationMin' | 'director' | 'isTvShow'
  > & { pid?: number },
  opts: {
    titleHints: string[];
    expectedYear?: string;
    expectedDirector?: string;
    expectedRuntimeMin?: number;
    expectedMediaType?: 'movie' | 'tv';
  }
): { ok: boolean; exactYear: boolean; reason?: string } {
  if (opts.expectedMediaType === 'movie' && meta.isTvShow) {
    return { ok: false, exactYear: false, reason: 'tv_show_not_movie' };
  }
  if (opts.expectedMediaType === 'tv' && !meta.isTvShow && (meta.pid ?? 0) > 0) {
    // A series hub page has isTvShow=true and pid=0; an episode page has pid>0. A movie /ver/ page has pid>0 and isTvShow=false.
    return { ok: false, exactYear: false, reason: 'movie_not_tv_show' };
  }

  const candidateTitles = [meta.cleanTitle, meta.origTitle].filter(Boolean);
  const matchingTitle =
    candidateTitles.find((t) => areTitlesStrictlyEqual(t, opts.titleHints)) ||
    candidateTitles[0] ||
    undefined;

  const isTv = opts.expectedMediaType === 'tv' || meta.isTvShow;
  return isMetadataCompatibleForMedia({
    candidateTitle: matchingTitle,
    targetTitleHints: opts.titleHints,
    candidateYear: meta.year || undefined,
    expectedYear: opts.expectedYear,
    candidateDirector: isTv ? undefined : meta.director || undefined,
    expectedDirector: isTv ? undefined : opts.expectedDirector,
    candidateRuntimeMin: isTv ? undefined : meta.durationMin || undefined,
    expectedRuntimeMin: isTv ? undefined : opts.expectedRuntimeMin,
  });
}

/**
 * Finds matching Gnula HD page for a movie or TV series given title hints and year
 */
export async function findGnulaHdUrlByTitle(
  searchTerms: string[],
  expectedYear?: string,
  opts?: {
    expectedDirector?: string;
    expectedRuntimeMin?: number;
    titleHints?: string[];
    expectedMediaType?: 'movie' | 'tv';
  }
): Promise<string | null> {
  const hints = Array.from(
    new Set(
      [...searchTerms, ...(opts?.titleHints || [])]
        .map((s) => String(s || '').replace(/\s*\([^)]*\)/g, '').trim())
        .filter((s) => normalizeTitleForMatch(s).length >= 2)
    )
  );
  if (hints.length === 0) return null;

  const wantType = opts?.expectedMediaType === 'tv' ? 'serie' : opts?.expectedMediaType === 'movie' ? 'pelicula' : '';

  const pickFromHits = async (hits: GnulaSearchResultItem[]): Promise<string | null> => {
    if (hits.length === 0) return null;

    const typedHits = wantType
      ? hits.filter((h) => {
          const nt = normalizeTitleForMatch(h.type || '');
          if (!nt) return true;
          if (wantType === 'serie') return nt.includes('serie') || nt.includes('anime');
          return nt.includes('pelicula');
        })
      : hits;

    const pool = typedHits.length > 0 ? typedHits : hits;

    // Prioritize exact title or exact year hits first so we inspect minimal HTML pages
    const scoredHits = pool
      .map((h) => {
        const titleEq = areTitlesStrictlyEqual(h.title, hints) ? 100 : 0;
        const yearEq =
          expectedYear && h.year && h.year === expectedYear
            ? 50
            : expectedYear && h.year && Math.abs(parseInt(h.year, 10) - parseInt(expectedYear, 10)) <= 1
            ? 15
            : 0;
        const prefixHit = hints.some((hint) => {
          const nh = normalizeTitleForMatch(hint);
          const nt = normalizeTitleForMatch(h.title);
          return nh && nt && (nt.includes(nh) || nh.includes(nt));
        })
          ? 20
          : 0;
        return { hit: h, score: titleEq + yearEq + prefixHit };
      })
      .sort((a, b) => b.score - a.score);

    let adjacentFallback: string | null = null;
    const validHits = scoredHits
      .filter(
        ({ hit }) =>
          Boolean(hit.url) &&
          !(expectedYear && hit.year && Math.abs(parseInt(hit.year, 10) - parseInt(expectedYear, 10)) > 1)
      )
      .slice(0, 4);

    // Inspect top candidates concurrently rather than sequentially for ~3x faster resolution
    const inspectedPairs = await Promise.all(
      validHits.map(async ({ hit }) => ({
        hit,
        pageMeta: await fetchGnulaPageMetadata(hit.url).catch(() => null),
      }))
    );

    for (const { hit, pageMeta } of inspectedPairs) {
      if (!pageMeta) continue;

      const verdict = verifyGnulaMetaMatch(pageMeta, {
        titleHints: hints,
        expectedYear,
        expectedDirector: opts?.expectedDirector,
        expectedRuntimeMin: opts?.expectedRuntimeMin,
        expectedMediaType: opts?.expectedMediaType,
      });

      if (verdict.ok) {
        if (verdict.exactYear || !expectedYear) {
          return pageMeta.resolvedUrl || hit.url;
        }
        if (!adjacentFallback) {
          adjacentFallback = pageMeta.resolvedUrl || hit.url;
        }
      } else if (
        expectedYear &&
        pageMeta.year === expectedYear &&
        (!opts?.expectedMediaType ||
          (opts.expectedMediaType === 'movie' && !pageMeta.isTvShow) ||
          (opts.expectedMediaType === 'tv' && pageMeta.isTvShow)) &&
        hints.some((h) => {
          const nh = normalizeTitleForMatch(h);
          const nc = normalizeTitleForMatch(pageMeta.cleanTitle);
          const no = normalizeTitleForMatch(pageMeta.origTitle);
          return (
            (nh.length >= 4 && (nc.includes(nh) || no.includes(nh))) ||
            (nc.length >= 4 && nh.includes(nc)) ||
            (no.length >= 4 && nh.includes(no))
          );
        })
      ) {
        // Exact year + matching franchise/original title match (e.g. non-literal localized title)
        return pageMeta.resolvedUrl || hit.url;
      }
    }

    return adjacentFallback;
  };

  // Query top 4 hints concurrently for low latency (covers English + non-literal ES translations)
  const firstBatchResults = await Promise.all(hints.slice(0, 4).map((term) => searchGnulaHd(term)));
  const mergedFirst = Array.from(
    new Map(firstBatchResults.flat().map((r) => [r.url, r])).values()
  );
  const foundFirst = await pickFromHits(mergedFirst);
  if (foundFirst) return foundFirst;

  // Query remaining localized hints + franchise prefix if needed
  const remainingTerms = [...hints.slice(3, 6)];
  if (expectedYear) {
    const prefix = hints[0].split(/[:\-\u2013]/)[0]?.trim();
    if (prefix && prefix.length >= 3 && !hints.includes(prefix)) {
      remainingTerms.push(prefix);
    }
  }
  if (remainingTerms.length > 0) {
    const secondBatchResults = await Promise.all(
      remainingTerms.slice(0, 3).map((term) => searchGnulaHd(term))
    );
    const mergedSecond = Array.from(
      new Map(secondBatchResults.flat().map((r) => [r.url, r])).values()
    );
    const foundSecond = await pickFromHits(mergedSecond);
    if (foundSecond) return foundSecond;
  }

  return null;
}

function getGnulaHostPriority(rawUrl: string): number {
  const low = rawUrl.toLowerCase();
  if (/byse|bysevepoin/i.test(low)) return 0;
  if (/vidaraa?\.[a-z]+/i.test(low)) return 1;
  if (/vidhide|smoothpre|earnvids/i.test(low)) return 2;
  if (/streamwish|hglink|hlswish|wishembed/i.test(low)) return 3;
  if (/filelions|morencius/i.test(low)) return 4;
  if (/voe\.[a-z]+/i.test(low)) return 5;
  return 6;
}

/**
 * Extracts streaming tracks from a Gnula HD movie or series page in HLS
 * (unpacking Byse/Vidara/Vidhide/Streamwish/Filelions concurrently across mirrors)
 */
export async function extractGnulaHdTracks(
  pageUrl: string,
  opts?: {
    expectedYear?: string;
    expectedTitleHints?: string[];
    expectedDirector?: string;
    expectedRuntimeMin?: number;
    mediaType?: 'movie' | 'tv';
    season?: number;
    episode?: number;
    skipUnpack?: boolean;
  }
): Promise<TrackRecord[]> {
  try {
    let targetUrl = normalizeGnulaUrl(pageUrl);
    if (!targetUrl) return [];

    let meta = await fetchGnulaPageMetadata(targetUrl);
    if (!meta) return [];

    if (opts?.expectedTitleHints && opts.expectedTitleHints.length > 0 && meta.cleanTitle) {
      const check = verifyGnulaMetaMatch(meta, {
        titleHints: opts.expectedTitleHints,
        expectedYear: opts.expectedYear,
        expectedDirector: opts.expectedDirector,
        expectedRuntimeMin: opts.expectedRuntimeMin,
        expectedMediaType: opts.mediaType,
      });
      if (!check.ok && !(opts.expectedYear && meta.year === opts.expectedYear)) {
        return [];
      }
    }

    // If TV series hub (/ver/<slug>/ without _gnrdPid), navigate to the specific episode page
    if ((opts?.mediaType === 'tv' || meta.isTvShow) && (!meta.pid || !meta.token)) {
      const sNum = Math.max(1, opts?.season || 1);
      const eNum = Math.max(1, opts?.episode || 1);
      const epKey = `${sNum}x${eNum}`;
      const epPadded = String(eNum).padStart(2, '0');
      const slug = targetUrl.split('/ver/')[1]?.replace(/\//g, '') || '';

      const epCandidates = [
        meta.episodeUrls[epKey],
        slug ? `${activeGnulaOrigin}/${slug}-${sNum}x${epPadded}/` : '',
        slug ? `${activeGnulaOrigin}/${slug}-${sNum}x${eNum}/` : '',
      ].filter(Boolean);

      let epMeta: GnulaPageMetadata | null = null;
      for (const epUrl of Array.from(new Set(epCandidates))) {
        const candidateMeta = await fetchGnulaPageMetadata(epUrl);
        if (candidateMeta && candidateMeta.pid && candidateMeta.token) {
          epMeta = candidateMeta;
          targetUrl = candidateMeta.resolvedUrl || epUrl;
          break;
        }
      }
      if (!epMeta) return [];
      meta = epMeta;
    }

    if (!meta.pid || !meta.token) return [];

    const playerPath = `/wp-json/gnrd/v1/player?id=${meta.pid}&t=${encodeURIComponent(meta.token)}`;
    const playerRes = await fetchGnulaPathWithMirrorFailover(playerPath, {
      referer: targetUrl,
      acceptJson: true,
      timeoutMs: 5000,
    });
    if (!playerRes?.text) return [];

    const json = JSON.parse(playerRes.text);
    const rawPayload = json?.p ?? json?.d;
    if (!rawPayload) return [];

    const unpacked = typeof rawPayload === 'string' ? gnrdUnpack(rawPayload) : rawPayload;
    const langsPayload: any[] = Array.isArray(unpacked?.langs)
      ? unpacked.langs
      : Array.isArray(unpacked)
      ? unpacked
      : [];
    if (langsPayload.length === 0) return [];

    interface CandidateServerJob {
      lang: 'ES' | 'LAT' | 'VOSE';
      srvTitle: string;
      srcUrl: string;
      sIdx: number;
      hostPriority: number;
    }

    const jobs: CandidateServerJob[] = [];

    for (const langItem of langsPayload) {
      const rawLang = String(langItem.label || langItem.name || '').toLowerCase();
      let trackLang: 'ES' | 'LAT' | 'VOSE' = 'ES';
      if (rawLang.includes('latino') || langItem.flag === 'MX') {
        trackLang = 'LAT';
      } else if (rawLang.includes('sub') || langItem.flag === 'US') {
        trackLang = 'VOSE';
      } else if (rawLang.includes('castellano') || rawLang.includes('espa') || langItem.flag === 'ES') {
        trackLang = 'ES';
      }

      const servers: any[] = Array.isArray(langItem.servers) ? langItem.servers : [];
      servers.forEach((srv, sIdx) => {
        const srcUrl = String(srv?.src || '').trim();
        if (!srcUrl.startsWith('http')) return;
        jobs.push({
          lang: trackLang,
          srvTitle: String(srv?.title || 'HD').trim(),
          srcUrl,
          sIdx,
          hostPriority: getGnulaHostPriority(srcUrl),
        });
      });
    }

    const langDisplay = (lang: 'ES' | 'LAT' | 'VOSE') =>
      lang === 'ES' ? 'Castellano' : lang === 'LAT' ? 'Español Latino' : 'Subtitulado VOSE';

    const resolvedItems = await Promise.all(
      jobs.map(async (job): Promise<{ track: TrackRecord; hostPriority: number } | null> => {
        const { lang, srvTitle, srcUrl, sIdx, hostPriority } = job;
        const low = srcUrl.toLowerCase();

        if (/byse|bysevepoin|vidaraa?\.[a-z]+|morencius|vidhide|smoothpre|earnvids|streamwish|filelions|hglink|hlswish|wishembed/i.test(low)) {
          const directHls =
            !opts?.skipUnpack && hostPriority <= 3
              ? await Promise.race([
                  unpackVidhideToHls(srcUrl).catch(() => null),
                  new Promise<null>((r) => setTimeout(() => r(null), 2800)),
                ])
              : null;
          if (directHls) {
            return {
              hostPriority,
              track: {
                id: `gnula-hls-${meta!.pid}-${lang.toLowerCase()}-${sIdx + 1}`,
                label: `${langDisplay(lang)} HD · GnulaHD (${srvTitle || 'HLS'})`,
                lang,
                quality: '1080p HLS',
                resolvedStreamUrl: directHls.proxyUrl,
                sourceUrl: srcUrl,
                resolverType: 'direct_hls',
              },
            };
          }
          // Keep vidhide_hls resolver so primary playback / track switching unpacks on demand cleanly
          return {
            hostPriority,
            track: {
              id: `gnula-vidhide-${meta!.pid}-${lang.toLowerCase()}-${sIdx + 1}`,
              label: `${langDisplay(lang)} HD · GnulaHD (${srvTitle || 'HLS'})`,
              lang,
              quality: '1080p',
              sourceUrl: srcUrl,
              resolverType: 'vidhide_hls',
            },
          };
        }

        if (/voe\.[a-z]+/i.test(low)) {
          return {
            hostPriority,
            track: {
              id: `gnula-voe-${meta!.pid}-${lang.toLowerCase()}-${sIdx + 1}`,
              label: `${langDisplay(lang)} · GnulaHD (VOE)`,
              lang,
              quality: 'HD',
              sourceUrl: srcUrl,
              resolverType: 'embed_sniff',
            },
          };
        }

        return {
          hostPriority,
          track: {
            id: `gnula-embed-${meta!.pid}-${lang.toLowerCase()}-${sIdx + 1}`,
            label: `${langDisplay(lang)} · GnulaHD (${srvTitle || 'Web'})`,
            lang,
            quality: 'HD',
            sourceUrl: srcUrl,
            resolverType: 'web_embed',
          },
        };
      })
    );

    const langOrder: Record<string, number> = { ES: 1, LAT: 2, VOSE: 3 };
    const resolverRank = (rt: string) =>
      rt === 'direct_hls' ? 0 : rt === 'vidhide_hls' ? 1 : rt === 'embed_sniff' ? 2 : 3;

    return resolvedItems
      .filter((x): x is { track: TrackRecord; hostPriority: number } => Boolean(x))
      .sort((a, b) => {
        const rDiff = resolverRank(a.track.resolverType) - resolverRank(b.track.resolverType);
        if (rDiff !== 0) return rDiff;
        const lDiff = (langOrder[a.track.lang] || 9) - (langOrder[b.track.lang] || 9);
        if (lDiff !== 0) return lDiff;
        return a.hostPriority - b.hostPriority;
      })
      .map((x) => x.track);
  } catch (err) {
    logger.warn({ err }, 'extractGnulaHdTracks_error');
    return [];
  }
}

/**
 * Scrapes Gnula HD catalog across operational mirrors (ww3.gnulahd.nu, gnulahd.click, gnulahd.bid)
 */
export async function scrapeGnulaCatalog(opts: {
  category?: string;
  page?: number;
  query?: string;
  mediaType?: 'movie' | 'tv' | 'all';
}): Promise<{ items: GnulaCatalogCardItem[]; hasMore: boolean }> {
  const category = String(opts.category || 'trending').toLowerCase();
  const page = Math.max(1, opts.page || 1);
  const query = String(opts.query || '').trim();
  const mediaType = opts.mediaType || 'movie';

  const cacheKey = `${mediaType}|${category}|${page}|${query.toLowerCase()}`;
  const cached = gnulaCatalogCache.get(cacheKey);
  if (cached) return cached;

  try {
    let relPath = '/ver/peliculas/';
    if (query) {
      relPath = page > 1 ? `/?s=${encodeURIComponent(query)}&pag=${page}` : `/?s=${encodeURIComponent(query)}`;
    } else if (mediaType === 'tv') {
      const base = category === 'anime' ? '/ver/anime/' : '/ver/series/';
      relPath = page > 1 ? `${base}?pag=${page}` : base;
    } else {
      const base = category === 'anime' ? '/ver/anime/' : '/ver/peliculas/';
      relPath = page > 1 ? `${base}?pag=${page}` : base;
    }

    const res = await fetchGnulaPathWithMirrorFailover(relPath, { timeoutMs: 4800 });
    let items: GnulaCatalogCardItem[] = [];
    if (res?.text) {
      items = parseGnulaCardsFromHtml(res.text, res.origin).map((it) => ({
        ...it,
        mediaType: mediaType === 'tv' ? 'tv' : mediaType === 'movie' ? 'movie' : it.mediaType,
      }));
    }

    // Supplement search with JSON API hits when querying
    if (query && page === 1) {
      const jsonHits = await searchGnulaHd(query).catch(() => [] as GnulaSearchResultItem[]);
      const existingUrls = new Set(items.map((it) => normalizeGnulaUrl(it.gnulaUrl)));
      for (const hit of jsonHits) {
        if (!hit.url) continue;
        const normHitUrl = normalizeGnulaUrl(hit.url);
        if (existingUrls.has(normHitUrl)) continue;
        const isTvHit = /serie|anime/i.test(hit.type || '');
        if (mediaType === 'movie' && isTvHit && !/pelicula/i.test(hit.type || '')) continue;
        if (mediaType === 'tv' && !isTvHit) continue;
        existingUrls.add(normHitUrl);
        const slug =
          normHitUrl
            .split('/ver/')[1]
            ?.replace(/\//g, '')
            .replace(/[^a-zA-Z0-9_-]/g, '') || `${items.length}`;
        const posterUrl = hit.img
          ? `/api/img-proxy?url=${encodeURIComponent(normalizeGnulaUrl(hit.img))}`
          : '';
        items.push({
          id: `gnula-${slug}`,
          mediaType: isTvHit ? 'tv' : 'movie',
          title: hit.title,
          originalTitle: hit.title,
          year: /^\d{4}$/.test(hit.year) ? hit.year : 'HD',
          rating: '',
          overview:
            'Disponible en reproducción directa HD HLS (Castellano, Español Latino y VOSE vía GnulaHD).',
          poster: posterUrl,
          backdrop: posterUrl,
          gnulaUrl: normHitUrl,
          languages: ['Castellano', 'Latino', 'VOSE'],
          genres: [],
          sources: ['gnula'],
        });
      }
    }

    const hasMore = Boolean(res?.text && (res.text.includes('gnrd-loadmore') || items.length >= 24));
    const payload = { items, hasMore };
    if (items.length > 0) {
      gnulaCatalogCache.set(cacheKey, payload);
    }
    return payload;
  } catch (err) {
    logger.warn({ err }, 'scrapeGnulaCatalog_error');
    return { items: [], hasMore: false };
  }
}
