import {
  CHROME_UA,
  areTitlesStrictlyEqual,
  fetchTextWithCurlFallback,
  isMetadataCompatibleForMedia,
  parseDurationTextToMinutes,
} from '../httpHelpers.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { logger } from '../../utils/logger.ts';

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

export function getActiveGnulaOrigin(): string {
  return activeGnulaOrigin;
}

export function setActiveGnulaOrigin(origin: string): void {
  if (origin) activeGnulaOrigin = origin;
}

const gnulaMirrorsCache = new LruTtlCache<string, string[]>(4, 15 * 60 * 1000);
const gnulaPageMetaCache = new LruTtlCache<string, GnulaPageMetadata>(350, 15 * 60 * 1000);

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

export async function getOrderedGnulaMirrors(): Promise<string[]> {
  const cached = gnulaMirrorsCache.get('mirrors');
  if (cached && cached.length > 0) {
    return Array.from(new Set([activeGnulaOrigin, ...cached, ...GNULA_MIRRORS]));
  }
  // Never block interactive search/extract requests for 2s on dominiosgnulahd.com; refresh in background
  void resolveActiveGnulaMirrors().catch(() => undefined);
  return Array.from(new Set([activeGnulaOrigin, ...GNULA_MIRRORS]));
}

export async function fetchGnulaPathWithMirrorFailover(
  relativePathOrUrl: string,
  opts?: { referer?: string; acceptJson?: boolean; timeoutMs?: number }
): Promise<{ text: string; origin: string; url: string } | null> {
  const mirrors = await getOrderedGnulaMirrors();
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
