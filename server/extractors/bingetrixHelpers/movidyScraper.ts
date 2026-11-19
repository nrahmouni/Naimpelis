import { LruTtlCache } from '../../utils/lruCache.ts';
import {
  CHROME_UA,
  type TrackRecord,
  areTitlesStrictlyEqual,
  buildHlsProxyUrl,
  curlGetText,
  fetchTextWithCurlFallback,
  generateSpanishTitleHints,
  isMetadataCompatibleForMedia,
  parseDurationTextToMinutes,
} from '../httpHelpers.ts';
import { unpackVidhideToHls } from '../vidhideHelpers/directHostUnpackers.ts';

const movidyPageMetaCache = new LruTtlCache<string, MovidyPageMetadata>(350, 15 * 60 * 1000);

export interface MovidyPageMetadata {
  isTvShow: boolean;
  cleanTitle: string;
  year: string;
  durationText: string;
  director: string;
  cast: { id: number; name: string; character: string }[];
  overview: string;
  html: string;
}

export const MOVIDY_MIRRORS = ['https://movidy.work', 'https://movidy.pw'];
export const MOVIDY_ORIGIN = MOVIDY_MIRRORS[0];
let activeMovidyOrigin = MOVIDY_ORIGIN;

export function isMovidyVerUrl(rawUrl: string): boolean {
  return /movidy\.(?:work|pw|tv|ws)\/ver\//i.test(String(rawUrl || '').trim());
}

export function normalizeMovidyUrl(rawUrl: string): string {
  const s = String(rawUrl || '').trim();
  if (!s) return '';
  if (s.startsWith('/')) return `${MOVIDY_ORIGIN}${s}`;
  return s.replace(/^https?:\/\/(?:www\.)?movidy\.(?:pw|tv|ws)\b/i, MOVIDY_ORIGIN);
}

async function fetchMovidyWithMirrorFailover(
  relPathOrUrl: string,
  refererPath = '/',
  timeoutMs = 4500
): Promise<string> {
  let relPath = relPathOrUrl.trim();
  if (/^https?:\/\//i.test(relPath)) {
    try {
      const u = new URL(relPath);
      relPath = `${u.pathname}${u.search}`;
    } catch {
      return '';
    }
  } else if (!relPath.startsWith('/')) {
    relPath = `/${relPath}`;
  }

  const mirrors = Array.from(new Set([activeMovidyOrigin, ...MOVIDY_MIRRORS]));
  for (const origin of mirrors) {
    const html = await fetchTextWithCurlFallback(
      `${origin}${relPath}`,
      {
        'User-Agent': CHROME_UA,
        Referer: `${origin}${refererPath}`,
      },
      timeoutMs
    ).catch(() => '');
    if (html && html.length > 200 && !/Access denied|Just a moment\.\.\./i.test(html.slice(0, 300))) {
      activeMovidyOrigin = origin;
      return html;
    }
  }
  return '';
}

function buildMovidySlugCandidates(hints: string[], expectedYear?: string): string[] {
  const slugs = new Set<string>();
  for (const h of hints) {
    const clean = String(h || '')
      .replace(/\s*\([^)]*\)/g, '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' y ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (clean.length >= 2) {
      slugs.add(clean);
      if (expectedYear && /^\d{4}$/.test(expectedYear)) {
        slugs.add(`${clean}-${expectedYear}`);
      }
    }
  }
  return Array.from(slugs).slice(0, 6);
}

function extractNuploadPageIframe(html: string): string | null {
  const re = /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const cand = String(m[1] || '').trim();
    if (!cand) continue;
    // Skip placeholder decoy embed (`/e/123`) and analytics/ad iframes
    if (/\/e\/123(?:$|[/?#])|googletagmanager|doubleclick|googlesyndication|youtube\.com/i.test(cand)) {
      continue;
    }
    return cand;
  }
  return null;
}

export async function decodeNuploadToHls(
  embedUrlOrB64: string
): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    let embedUrl = embedUrlOrB64.trim();
    if (!embedUrl.startsWith('http')) {
      embedUrl = Buffer.from(embedUrl, 'base64').toString('utf8').trim();
    }
    if (!embedUrl.startsWith('http')) return null;
    if (!embedUrl.includes('?')) {
      embedUrl += '?h=';
    }

    const html = await fetchTextWithCurlFallback(
      embedUrl,
      {
        Referer: `${MOVIDY_ORIGIN}/`,
        'User-Agent': CHROME_UA,
      },
      5500
    );
    if (!html) return null;

    const forEachMatch = html.match(/([a-zA-Z0-9_]+)\.forEach\([\s\S]{0,200}?-\s*(\d+)\)/);
    const offsetMatch = forEachMatch
      ? forEachMatch
      : html.match(/\.forEach\([\s\S]{0,200}?-\s*(\d+)\s*\)/);
    const offset = offsetMatch ? parseInt(offsetMatch[2] || offsetMatch[1], 10) : 0;

    const arrMatch =
      html.match(/var\s+[a-zA-Z0-9_]+\s*=\s*(\[\s*["'][A-Za-z0-9+/=]{16,}["'][\s\S]*?\])/) ||
      (forEachMatch ? html.match(new RegExp(`var\\s+${forEachMatch[1]}\\s*=\\s*(\\[[^\\]]+\\])`)) : null) ||
      html.match(/var\s+[a-zA-Z0-9_]+\s*=\s*(\[[^\]]+\])/);
    const sesMatch = html.match(/var\s+sesz\s*=\s*["']([^"']+)["']/i);

    if (offset && arrMatch && sesMatch) {
      try {
        const encodedItems: string[] = JSON.parse(arrMatch[1]);
        const baseStream = encodedItems
          .map((item) => {
            const decodedDigits = Buffer.from(item, 'base64').toString('utf8').replace(/\D/g, '');
            return String.fromCharCode(parseInt(decodedDigits, 10) - offset);
          })
          .join('');

        const rawM3u8 = `${baseStream}?s=${sesMatch[1]}`;
        const embedOrigin = new URL(embedUrl).origin + '/';
        return {
          rawM3u8,
          proxyUrl: buildHlsProxyUrl(rawM3u8, embedOrigin),
        };
      } catch {
        // ignore parse error and proceed to fallback
      }
    }

    // Fallback: nested vidhide / vidara / streamwish / smoothpre iframe inside nupload.my
    const nestedIframe = extractNuploadPageIframe(html);
    if (nestedIframe && /vidaraa?|vidhide|smoothpre|earnvids|streamwish|filelions|hglink|hlswish/i.test(nestedIframe)) {
      const unpacked = await unpackVidhideToHls(nestedIframe);
      if (unpacked) return unpacked;
    }

    return null;
  } catch {
    return null;
  }
}

export async function resolveMovidyEmbedTrack(
  embedUrlOrB64: string
): Promise<
  | { mode: 'hls'; rawM3u8: string; proxyUrl: string }
  | { mode: 'embed'; embedUrl: string }
  | null
> {
  try {
    let embedUrl = embedUrlOrB64.trim();
    if (!embedUrl.startsWith('http')) {
      embedUrl = Buffer.from(embedUrl, 'base64').toString('utf8').trim();
    }
    if (!embedUrl.startsWith('http')) return null;

    const hls = await decodeNuploadToHls(embedUrl);
    if (hls) {
      return { mode: 'hls', rawM3u8: hls.rawM3u8, proxyUrl: hls.proxyUrl };
    }

    const targetWithQuery = embedUrl.includes('?') ? embedUrl : `${embedUrl}?h=`;
    const html = await fetchTextWithCurlFallback(
      targetWithQuery,
      { Referer: `${MOVIDY_ORIGIN}/`, 'User-Agent': CHROME_UA },
      4500
    );
    if (!html) return null;

    const nestedIframe = extractNuploadPageIframe(html);
    if (!nestedIframe) return null;

    // Quickly check that the nested iframe does not serve a 404 dead page
    const iframeCheck = await curlGetText(
      nestedIframe,
      { Referer: `${new URL(targetWithQuery).origin}/`, 'User-Agent': CHROME_UA },
      3,
      true
    ).catch(() => ({ text: '' }));
    if (iframeCheck.text && /<title>\s*404|not found<\/title>|file was deleted|no longer available/i.test(iframeCheck.text.slice(0, 1200))) {
      return null;
    }

    return { mode: 'embed', embedUrl: nestedIframe };
  } catch {
    return null;
  }
}

export function parseMovidyHtmlMetadata(html: string): MovidyPageMetadata {
  const isTvShow = html.includes('id="eps"');
  const h2Match = html.match(/<h2>\s*Ver\s+([\s\S]*?)\s+Movidy\s*<\/h2>/i);
  const cleanTitle = h2Match?.[1] ? h2Match[1].replace(/<[^>]+>/g, '').trim() : '';

  const numbersBlock =
    html.match(/<div\s+class="numbers">([\s\S]*?)<\/div>\s*<div\s+class="links">/i)?.[1] ||
    html.match(/<div\s+class="numbers">([\s\S]{0,400})/i)?.[1] ||
    '';
  const yearMatch = numbersBlock.match(/<span>\s*(19\d{2}|20\d{2})\s*<\/span>/i);
  const year = yearMatch?.[1] ? yearMatch[1].trim() : '';
  const durMatch = numbersBlock.match(/<span>\s*(\d+h\s*\d*m(?:in)?|\d+\s*min)\s*<\/span>/i);
  const durationText = durMatch?.[1] ? durMatch[1].trim() : '';

  const linksBlock =
    html.match(/<div\s+class="links">([\s\S]*?)<\/div>\s*<p>/i)?.[1] || '';
  const dirMatch = linksBlock.match(/<b>\s*Director:\s*<\/b>\s*<a[^>]*>([^<]+)<\/a>/i);
  const director = dirMatch?.[1] ? dirMatch[1].trim() : '';

  const castBlock = linksBlock.split(/<b>\s*Reparto:\s*<\/b>/i)[1] || '';
  const castNames = [...castBlock.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)]
    .map((m) => String(m[1] || '').replace(/,+$/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const cast = castNames.map((name, idx) => ({
    id: idx + 1,
    name,
    character: 'Reparto',
  }));

  const pMatch = html.match(/<div\s+class="links">[\s\S]*?<\/div>\s*<p>([\s\S]*?)<\/p>/i);
  const overview = pMatch?.[1] ? pMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  return {
    isTvShow,
    cleanTitle,
    year,
    durationText,
    director,
    cast,
    overview,
    html,
  };
}

export async function fetchMovidyPageMetadata(
  movidyVerUrl: string
): Promise<MovidyPageMetadata | null> {
  try {
    const cleanUrl = normalizeMovidyUrl(movidyVerUrl);
    if (!isMovidyVerUrl(cleanUrl)) return null;

    const cached = movidyPageMetaCache.get(cleanUrl);
    if (cached) return cached;

    const html = await fetchMovidyWithMirrorFailover(cleanUrl, '/pelis/', 5000);

    if (!html) return null;
    if (/<title>\s*404|p[áa]gina no encontrada|not found<\/title>/i.test(html.slice(0, 1500))) {
      return null;
    }

    const meta = parseMovidyHtmlMetadata(html);
    if (!meta.cleanTitle && !meta.isTvShow && !html.includes('play-url')) {
      return null;
    }
    movidyPageMetaCache.set(cleanUrl, meta);
    return meta;
  } catch {
    return null;
  }
}

export function extractMovidyTracksFromHtml(html: string, slugHint = 'movidy'): TrackRecord[] {
  const trackRegex =
    /<(?:li|span)[^>]*class="[^"]*play-url[^"]*"[^>]*data-url="([^"]+)"[^>]*>([\s\S]*?)<\/(?:li|span)>/gi;
  const rawTracks: TrackRecord[] = [];
  let match: RegExpExecArray | null;

  while ((match = trackRegex.exec(html)) !== null) {
    const dataUrl = String(match[1] || '').trim();
    const rawInnerHtml = String(match[2] || '').trim();
    if (!dataUrl || dataUrl.toLowerCase() === 'array') continue;

    let testUrl = dataUrl;
    if (!testUrl.startsWith('http')) {
      try {
        testUrl = Buffer.from(testUrl, 'base64').toString('utf8').trim();
      } catch {
        continue;
      }
    }
    if (!testUrl.startsWith('http')) continue;

    const spanTextMatch = rawInnerHtml.match(/<span>([^<]+)<\/span>/i);
    const rawLangText = (spanTextMatch?.[1] || rawInnerHtml.replace(/<[^>]+>/g, '')).trim();

    let lang: 'ES' | 'LAT' | 'VOSE' = 'ES';
    let label = 'Castellano HD (Movidy)';

    if (/castellano|espa[ñn]ol|espa[ñn]a/i.test(rawLangText) && !/latino/i.test(rawLangText)) {
      lang = 'ES';
      label = 'Castellano HD · Movidy';
    } else if (/latino/i.test(rawLangText)) {
      lang = 'LAT';
      label = 'Español Latino HD · Movidy';
    } else if (/subtitulado|vose|original/i.test(rawLangText)) {
      lang = 'VOSE';
      label = 'Subtitulado VOSE · Movidy';
    } else {
      lang = 'ES';
      label = `${rawLangText || 'Castellano'} HD · Movidy`;
    }

    rawTracks.push({
      id: `movidy-${slugHint}-${lang.toLowerCase()}-${rawTracks.length + 1}`,
      label,
      lang,
      quality: 'HD HLS',
      sourceUrl: dataUrl,
      resolverType: 'movidy_embed',
    });
  }

  const langOrder: Record<string, number> = { ES: 1, LAT: 2, VOSE: 3 };
  return rawTracks.sort((a, b) => (langOrder[a.lang] || 9) - (langOrder[b.lang] || 9));
}

export function verifyMovidyMetaMatch(
  meta: Pick<MovidyPageMetadata, 'isTvShow' | 'cleanTitle' | 'year' | 'durationText' | 'director'>,
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
  if (opts.expectedMediaType === 'tv' && !meta.isTvShow) {
    return { ok: false, exactYear: false, reason: 'movie_not_tv_show' };
  }
  if (!meta.cleanTitle || !meta.cleanTitle.trim()) {
    return { ok: false, exactYear: false, reason: 'missing_title' };
  }
  const isTv = opts.expectedMediaType === 'tv' || meta.isTvShow;
  const candRuntimeMin = parseDurationTextToMinutes(meta.durationText);
  return isMetadataCompatibleForMedia({
    candidateTitle: meta.cleanTitle,
    targetTitleHints: opts.titleHints,
    candidateYear: meta.year || undefined,
    expectedYear: opts.expectedYear,
    candidateDirector: isTv ? undefined : (meta.director || undefined),
    expectedDirector: isTv ? undefined : opts.expectedDirector,
    candidateRuntimeMin: isTv ? undefined : (candRuntimeMin || undefined),
    expectedRuntimeMin: isTv ? undefined : opts.expectedRuntimeMin,
  });
}

export async function extractMovidyPageTracks(
  movidyVerUrl: string,
  opts?: {
    expectedYear?: string;
    requireMovieOnly?: boolean;
    expectedTitleHints?: string[];
    expectedDirector?: string;
    expectedRuntimeMin?: number;
  }
): Promise<TrackRecord[]> {
  try {
    const cleanUrl = normalizeMovidyUrl(movidyVerUrl);
    if (!isMovidyVerUrl(cleanUrl)) return [];

    const meta = await fetchMovidyPageMetadata(cleanUrl);
    if (!meta || !meta.html) return [];

    if (opts?.requireMovieOnly && meta.isTvShow) {
      return [];
    }

    if (
      opts &&
      (opts.expectedYear ||
        (opts.expectedTitleHints && opts.expectedTitleHints.length > 0) ||
        opts.expectedDirector ||
        opts.expectedRuntimeMin)
    ) {
      const check = verifyMovidyMetaMatch(meta, {
        titleHints: opts.expectedTitleHints || [],
        expectedYear: opts.expectedYear,
        expectedDirector: opts.expectedDirector,
        expectedRuntimeMin: opts.expectedRuntimeMin,
        expectedMediaType: opts.requireMovieOnly ? 'movie' : undefined,
      });
      if (!check.ok) {
        return [];
      }
    }

    const slug =
      cleanUrl
        .split('/ver/')[1]
        ?.replace(/\//g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '') || 'movidy';

    return extractMovidyTracksFromHtml(meta.html, slug);
  } catch (err) {
    console.warn('extractMovidyPageTracks error:', err);
    return [];
  }
}

export async function findMovidyUrlByTitle(
  title: string,
  expectedYear?: string,
  opts?: {
    expectedDirector?: string;
    expectedRuntimeMin?: number;
    titleHints?: string[];
    expectedMediaType?: 'movie' | 'tv';
  }
): Promise<string | null> {
  try {
    const rawClean = String(title || '').trim();
    const clean = rawClean.replace(/\s*\([^)]*\)/g, '').trim();
    const queryTerm = clean || rawClean;
    const baseHints = Array.from(
      new Set([rawClean, clean, ...(opts?.titleHints || [])].map((s) => String(s || '').trim()).filter(Boolean))
    );
    const spanishHints = baseHints.flatMap((h) => generateSpanishTitleHints(h));
    const allHints = Array.from(new Set([...baseHints, ...spanishHints].filter(Boolean)));

    if (!queryTerm || queryTerm.length < 2 || allHints.length === 0) {
      return null;
    }

    const rawSearchPool = [
      ...spanishHints.map((t) => String(t || '').replace(/\s*\([^)]*\)/g, '').trim()),
      ...allHints.map((t) => String(t || '').replace(/\s*\([^)]*\)/g, '').trim()),
    ].filter((s) => s && s.length >= 2);

    const searchTerms: string[] = [];
    const seenTerms = new Set<string>();
    const pushTerm = (t: string) => {
      const k = t.toLowerCase();
      if (t.length >= 2 && !seenTerms.has(k)) {
        seenTerms.add(k);
        searchTerms.push(t);
      }
    };
    for (const t of rawSearchPool) {
      pushTerm(t);
      const noPunct = t.replace(/[:\-\u2013]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (noPunct !== t) pushTerm(noPunct);
      const colonParts = t.split(/[:\u2013]/).map((p) => p.trim()).filter((p) => p.length >= 4);
      if (colonParts.length > 1) {
        pushTerm(colonParts[colonParts.length - 1]);
      }
    }

    const exactMatches: string[] = [];
    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>/gi;

    const collectHits = (html: string, strictOnly: boolean) => {
      if (!html) return;
      itemRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(html)) !== null) {
        const rawHref = String(m[1] || '').trim();
        const rawSpanTitle = String(m[2] || '').trim();
        if (!rawHref || !rawSpanTitle) continue;

        const fullUrl = normalizeMovidyUrl(rawHref);
        if (!fullUrl || exactMatches.includes(fullUrl)) continue;
        if (!strictOnly || areTitlesStrictlyEqual(rawSpanTitle, allHints)) {
          exactMatches.push(fullUrl);
        }
      }
    };

    const firstHtmls = await Promise.all(
      searchTerms
        .slice(0, 4)
        .map((term) => fetchMovidyWithMirrorFailover(`/?s=${encodeURIComponent(term)}&_=${Date.now()}`, '/', 4200))
    );
    for (const html of firstHtmls) {
      collectHits(html, true);
    }

    if (exactMatches.length === 0 && searchTerms.length > 4) {
      for (const term of searchTerms.slice(4, 8)) {
        const html = await fetchMovidyWithMirrorFailover(
          `/?s=${encodeURIComponent(term)}&_=${Date.now()}`,
          '/',
          3800
        );
        collectHits(html, true);
        if (exactMatches.length > 0) break;
      }
    }

    if (exactMatches.length === 0) {
      const prefix = queryTerm.split(/[:\-\u2013]/)[0]?.trim();
      if (prefix && prefix.length >= 3 && !seenTerms.has(prefix.toLowerCase())) {
        const html = await fetchMovidyWithMirrorFailover(
          `/?s=${encodeURIComponent(prefix)}&_=${Date.now()}`,
          '/',
          4200
        );
        collectHits(html, !expectedYear);
      }
    }

    if (exactMatches.length === 0) {
      for (const slug of buildMovidySlugCandidates(allHints, expectedYear)) {
        const directCand = `${MOVIDY_ORIGIN}/ver/${slug}/`;
        if (!exactMatches.includes(directCand)) {
          exactMatches.push(directCand);
        }
      }
    }

    if (exactMatches.length === 0) return null;

    const candidateSlice = exactMatches.slice(0, 4);
    const inspectedCandidates = await Promise.all(
      candidateSlice.map(async (candidateUrl) => ({
        candidateUrl,
        meta: await fetchMovidyPageMetadata(candidateUrl).catch(() => null),
      }))
    );

    let verifiedAdjacentFallback: string | null = null;
    for (const { candidateUrl, meta } of inspectedCandidates) {
      if (!meta) continue;
      if (opts?.expectedMediaType === 'movie' && meta.isTvShow) continue;
      if (opts?.expectedMediaType === 'tv' && !meta.isTvShow) continue;

      const verdict = verifyMovidyMetaMatch(meta, {
        titleHints: allHints,
        expectedYear,
        expectedDirector: opts?.expectedDirector,
        expectedRuntimeMin: opts?.expectedRuntimeMin,
        expectedMediaType: opts?.expectedMediaType || 'movie',
      });
      if (!verdict.ok) continue;

      if (verdict.exactYear || !expectedYear) {
        return candidateUrl;
      }
      if (!verifiedAdjacentFallback) {
        verifiedAdjacentFallback = candidateUrl;
      }
    }

    return verifiedAdjacentFallback;
  } catch {
    return null;
  }
}
