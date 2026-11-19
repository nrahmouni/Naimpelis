import { LruTtlCache } from '../../utils/lruCache.ts';
import {
  CHROME_UA,
  type TrackRecord,
  areTitlesStrictlyEqual,
  fetchTextWithCurlFallback,
  isMetadataCompatibleForMedia,
  normalizeTitleForMatch,
  parseDurationTextToMinutes,
} from '../httpHelpers.ts';
import { extractAnimeAv1Tracks } from './animeAv1Extractor.ts';

export { extractAnimeAv1Tracks };

const GNULA_MIRRORS = [
  'https://ww3.gnulahd.nu',
  'https://gnulahd.click',
  'https://gnulahd.bid',
];
let GNULA_ORIGIN = GNULA_MIRRORS[0];

const gnulaSlugCache = new LruTtlCache<string, string | null>(400, 30 * 60 * 1000);



function gnrdXorUnpack(base64Payload: string): any {
  const buf = Buffer.from(base64Payload, 'base64');
  const key = [103, 78, 55, 100]; // 'gN7d'
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ key[i & 3];
  }
  return JSON.parse(out.toString('utf8'));
}

export function parseGnulaPageMetadata(html: string): {
  title: string;
  year: string;
  director: string;
  runtimeMin: number;
} {
  const srMatch = html.match(/<span\s+class="gnrd-sr">([^<]+)<\/span>/i)?.[1]?.trim() || '';
  const origMatch = html.match(/<div\s+class="gnrd-fi-orig">([^<]+)<\/div>/i)?.[1]?.trim() || '';
  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const rawTag = String(titleTagMatch?.[1] || '').trim();
  const yearFromTitle = rawTag.match(/\(((?:19|20)\d{2})\)/)?.[1] || '';
  const cleanTitle =
    rawTag
      .replace(/\(((?:19|20)\d{2})\)[\s\S]*$/i, '')
      .replace(/\s*\|\s*Gnula[\s\S]*$/i, '')
      .replace(/^Ver\s+/i, '')
      .replace(/\s+Online[\s\S]*$/i, '')
      .trim() ||
    srMatch ||
    origMatch;

  const jsonYearMatch =
    html.match(/"datePublished"\s*:\s*"((?:19|20)\d{2})/i)?.[1] ||
    html.match(/<span\s+class="gnrd-eyebrow">[^<]*?((?:19|20)\d{2})<\/span>/i)?.[1] ||
    html.match(/<div\s+class="qf"><span\s+class="qf-l">Año<\/span><span\s+class="qf-v">((?:19|20)\d{2})<\/span>/i)?.[1] ||
    '';
  const year = yearFromTitle || jsonYearMatch || '';

  const directorBlock =
    html.match(/"director"\s*:\s*\[\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/"director"\s*:\s*\{\s*[^}]*"name"\s*:\s*"([^"]+)"/i)?.[1] ||
    '';

  const isoDur = html.match(/"duration"\s*:\s*"(PT[^"]+)"/i)?.[1] || '';
  const textDur =
    html.match(/Duraci[oó]n\s*(?:<[^>]+>\s*)*(\d+\s*hr\.?\s*\d*\s*min\.?|\d+\s*min\.?)/i)?.[1] ||
    html.match(/<span>(\d+\s*hr\.?\s*\d*\s*min\.?|\d+\s*min)<\/span>/i)?.[1] ||
    '';
  const runtimeMin =
    parseDurationTextToMinutes(isoDur) || parseDurationTextToMinutes(textDur) || 0;

  return {
    title: cleanTitle,
    year,
    director: directorBlock.trim(),
    runtimeMin,
  };
}

export function pickBestGnulaSearchResult(
  results: any[],
  opts: {
    titleHints: string[];
    mediaType: 'movie' | 'tv';
    yearHint?: string;
  }
): { url: string; exactYear: boolean } | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const wantedType = opts.mediaType === 'tv' ? 'serie' : 'pelicula';
  const expectedYearNum =
    opts.yearHint && /^\d{4}$/.test(opts.yearHint.trim()) ? Number(opts.yearHint.trim()) : 0;

  const hasAnyTypedResult = results.some((r) => Boolean(String(r?.type || '').trim()));
  const pool = hasAnyTypedResult
    ? results.filter((r) => normalizeTitleForMatch(String(r?.type || '')).includes(wantedType))
    : results;
  if (pool.length === 0) return null;

  // Strict exact title equality ONLY (no dangerous substring `.includes()` matches like "The Killer" -> "The Killer's Game")
  const exactTitlePool = pool.filter((r) =>
    areTitlesStrictlyEqual(String(r?.title || ''), opts.titleHints)
  );
  if (exactTitlePool.length === 0) return null;

  if (expectedYearNum > 0) {
    const exactYearHit = exactTitlePool.find(
      (r) => Number(String(r?.year || '').trim()) === expectedYearNum
    );
    if (exactYearHit?.url) {
      return { url: String(exactYearHit.url), exactYear: true };
    }
    const adjacentOrUndatedHit = exactTitlePool.find((r) => {
      const ry = String(r?.year || '').trim();
      if (!/^\d{4}$/.test(ry)) return true;
      return Math.abs(Number(ry) - expectedYearNum) <= 1;
    });
    if (adjacentOrUndatedHit?.url) {
      return { url: String(adjacentOrUndatedHit.url), exactYear: false };
    }
    return null;
  }

  return exactTitlePool[0]?.url
    ? { url: String(exactTitlePool[0].url), exactYear: false }
    : null;
}

export function withGnmParam(rawUrl: string): string {
  try {
    const u = new URL(rawUrl, GNULA_ORIGIN);
    if (u.hostname.includes('gnulahd')) {
      u.searchParams.set('gnm', '1');
    }
    return u.toString();
  } catch {
    return rawUrl.includes('gnm=1')
      ? rawUrl
      : `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}gnm=1`;
  }
}

export function parseGnulaPlayerPayload(pJson: any): TrackRecord[] {
  try {
    const rawField = pJson?.p ?? pJson?.d;
    if (!rawField) return [];

    const unpacked: any =
      typeof rawField === 'string'
        ? gnrdXorUnpack(rawField.trim())
        : rawField;
    const langsPayload: any[] = Array.isArray(unpacked)
      ? unpacked
      : Array.isArray(unpacked?.langs)
      ? unpacked.langs
      : [];
    if (langsPayload.length === 0) return [];

    const nativeTracks: Array<TrackRecord & { hostPriority: number }> = [];
    const embedBackupTracks: TrackRecord[] = [];

    const getVidhideHostPriority = (hostLow: string): number => {
      if (/byse|bysevepoin/i.test(hostLow)) return 0;
      if (/vidaraa?\.[a-z]+/i.test(hostLow)) return 1;
      if (/vidhide|smoothpre|earnvids/i.test(hostLow)) return 2;
      if (/streamwish|hglink|hlswish|wishembed/i.test(hostLow)) return 3;
      if (/filelions/i.test(hostLow)) return 4;
      if (/voe\.[a-z]+/i.test(hostLow)) return 5;
      return 6;
    };

    langsPayload.forEach((grp, lIdx) => {
      const rawLangName = String(grp?.label || grp?.name || '');
      const langCode: 'ES' | 'LAT' | 'VOSE' = /latino/i.test(rawLangName)
        ? 'LAT'
        : /castellano|espa[ñn]ol/i.test(rawLangName)
        ? 'ES'
        : 'VOSE';
      const displayLang =
        langCode === 'ES' ? 'Castellano' : langCode === 'LAT' ? 'Latino' : 'Subtitulado';

      const servers: any[] = Array.isArray(grp?.servers) ? grp.servers : [];
      servers.forEach((srv, sIdx) => {
        const rawSrc = String(srv?.src || '').trim();
        const srvTitle = String(srv?.title || 'HD').trim();
        if (!rawSrc.startsWith('http')) return;
        const hostLow = rawSrc.toLowerCase();

        if (
          /byse|bysevepoin|vidaraa?\.[a-z]+|morencius|vidhide|smoothpre|earnvids|streamwish|filelions|hglink|hlswish|wishembed/i.test(
            hostLow
          )
        ) {
          nativeTracks.push({
            id: `gnula-hls-${langCode}-${lIdx}-${sIdx}`,
            label: `${displayLang} · 1080p`,
            lang: langCode,
            quality: '1080p',
            sourceUrl: rawSrc,
            resolverType: 'vidhide_hls',
            hostPriority: getVidhideHostPriority(hostLow),
          });
        } else if (/voe\.[a-z]+/i.test(hostLow)) {
          nativeTracks.push({
            id: `gnula-voe-${langCode}-${lIdx}-${sIdx}`,
            label: `${displayLang} · VOE HD`,
            lang: langCode,
            quality: 'HD',
            sourceUrl: rawSrc,
            resolverType: 'embed_sniff',
            hostPriority: getVidhideHostPriority(hostLow),
          });
        } else if (/https?:\/\//i.test(rawSrc) && !/(?:ad|banner|counter|tracking|pop|click)\./i.test(hostLow)) {
          // Keep all other legitimate video iframe hosts as web_embed backups so Castellano tracks are never lost
          embedBackupTracks.push({
            id: `gnula-emb-${langCode}-${lIdx}-${sIdx}`,
            label: `${displayLang} · ${srvTitle || 'Web'}`,
            lang: langCode,
            quality: 'HD',
            sourceUrl: rawSrc,
            resolverType: 'web_embed',
          });
        }
      });
    });

    nativeTracks.sort((a, b) => a.hostPriority - b.hostPriority);
    return [
      ...nativeTracks.map(({ hostPriority: _hp, ...track }) => track),
      ...embedBackupTracks,
    ];
  } catch {
    return [];
  }
}

async function resolveGnulaSlug(opts: {
  titleHints: string[];
  mediaType: 'movie' | 'tv';
  yearHint?: string;
  force?: boolean;
}): Promise<string | null> {
  const uniqueHints = Array.from(
    new Set(
      opts.titleHints
        .map((h) => String(h || '').replace(/\s*\([^)]*\)/g, '').trim())
        .filter((h) => normalizeTitleForMatch(h).length >= 2)
    )
  ).slice(0, 5);
  if (uniqueHints.length === 0) return null;

  const cacheKey = `v4|${opts.mediaType}|${opts.yearHint || ''}|${uniqueHints
    .map((h) => normalizeTitleForMatch(h))
    .join('|')}`;
  if (!opts.force && gnulaSlugCache.has(cacheKey)) {
    const cached = gnulaSlugCache.get(cacheKey);
    if (cached) return cached;
  }

  const orderedOrigins = Array.from(new Set([GNULA_ORIGIN, ...GNULA_MIRRORS]));

  for (const origin of orderedOrigins) {
    const searchPromises = uniqueHints.map(async (hint) => {
      try {
        const searchUrl = withGnmParam(
          `${origin}/wp-json/gnrd/v1/search?q=${encodeURIComponent(hint)}`
        );
        const rawJsonText = await fetchTextWithCurlFallback(
          searchUrl,
          {
            'User-Agent': CHROME_UA,
            Accept: 'application/json',
            Referer: `${origin}/?gnm=1`,
          },
          3200
        );
        if (!rawJsonText) return null;
        let json: any = null;
        try {
          json = JSON.parse(rawJsonText);
        } catch {
          return null;
        }
        const results: any[] = Array.isArray(json?.results) ? json.results : [];
        if (results.length === 0) return null;

        const picked = pickBestGnulaSearchResult(results, {
          titleHints: uniqueHints,
          mediaType: opts.mediaType,
          yearHint: opts.yearHint,
        });

        if (picked?.url) {
          const m = picked.url.match(/\/(?:ver|series?|peliculas?)\/([^/?#]+)\/?/i);
          if (m?.[1]) {
            return { slug: m[1], exactYear: picked.exactYear, origin };
          }
        }
        return null;
      } catch {
        return null;
      }
    });

    const searchResults = (await Promise.all(searchPromises)).filter(Boolean);
    const exact = searchResults.find((r) => r?.exactYear);
    const picked = exact || searchResults[0];
    if (picked?.slug) {
      GNULA_ORIGIN = picked.origin;
      gnulaSlugCache.set(cacheKey, picked.slug);
      return picked.slug;
    }
  }

  return null;
}

export async function extractGnulaCastellanoTracks(opts: {
  titleHints: string[];
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  yearHint?: string;
  directorHint?: string;
  runtimeMinHint?: number;
  force?: boolean;
}): Promise<TrackRecord[]> {
  try {
    const slug = await resolveGnulaSlug({
      titleHints: opts.titleHints,
      mediaType: opts.mediaType,
      yearHint: opts.yearHint,
      force: opts.force,
    });
    if (!slug) return [];

    const sNum = Math.max(1, opts.season || 1);
    const eNum = Math.max(1, opts.episode || 1);
    const epPadded = String(eNum).padStart(2, '0');

    let pageUrl =
      opts.mediaType === 'tv'
        ? withGnmParam(`${GNULA_ORIGIN}/${slug}-${sNum}x${epPadded}/`)
        : withGnmParam(`${GNULA_ORIGIN}/ver/${slug}/`);

    let html = await fetchTextWithCurlFallback(
      pageUrl,
      {
        'User-Agent': CHROME_UA,
        Referer: `${GNULA_ORIGIN}/?gnm=1`,
      },
      4200
    );

    // Fallback for TV series whose episode slug isn't zero-padded or uses an alternate episode URL inside /ver/<slug>/
    if (opts.mediaType === 'tv' && (!html || !/_gnrdPid\s*=/.test(html))) {
      const showPageUrl = withGnmParam(`${GNULA_ORIGIN}/ver/${slug}/`);
      const showHtml = await fetchTextWithCurlFallback(
        showPageUrl,
        {
          'User-Agent': CHROME_UA,
          Referer: `${GNULA_ORIGIN}/?gnm=1`,
        },
        4000
      );
      if (showHtml) {
        const epHrefMatch = showHtml.match(
          new RegExp(
            `href=["']((?:https?:\\/\\/[^"']*gnulahd\\.[^"'\\/]+)?\\/[^"']*?-${sNum}x0?${eNum}\\/?(?:\\?[^"']*)?)["']`,
            'i'
          )
        );
        if (epHrefMatch?.[1]) {
          const rawEpHref = epHrefMatch[1].startsWith('http')
            ? epHrefMatch[1]
            : `${GNULA_ORIGIN}${epHrefMatch[1]}`;
          const nextPageUrl = withGnmParam(rawEpHref);
          if (nextPageUrl !== pageUrl) {
            const epHtml2 = await fetchTextWithCurlFallback(
              nextPageUrl,
              {
                'User-Agent': CHROME_UA,
                Referer: showPageUrl,
              },
              4000
            );
            if (epHtml2 && /_gnrdPid\s*=/.test(epHtml2)) {
              pageUrl = nextPageUrl;
              html = epHtml2;
            }
          }
        }
      }
    }

    if (!html) return [];

    // Verify Gnula page metadata against expected year, director, and runtime before accepting streams
    if (opts.mediaType === 'movie') {
      const pageMeta = parseGnulaPageMetadata(html);
      const origPageTitle = html.match(/<div\s+class="gnrd-fi-orig">([^<]+)<\/div>/i)?.[1]?.trim() || '';
      const candTitles = [pageMeta.title, origPageTitle].filter(Boolean);
      const bestCandTitle =
        candTitles.find((t) => areTitlesStrictlyEqual(t, opts.titleHints)) ||
        pageMeta.title ||
        origPageTitle ||
        undefined;
      const compat = isMetadataCompatibleForMedia({
        candidateTitle: bestCandTitle,
        targetTitleHints: opts.titleHints,
        candidateYear: pageMeta.year || undefined,
        expectedYear: opts.yearHint,
        candidateDirector: pageMeta.director || undefined,
        expectedDirector: opts.directorHint,
        candidateRuntimeMin: pageMeta.runtimeMin || undefined,
        expectedRuntimeMin: opts.runtimeMinHint,
      });
      if (!compat.ok) {
        return [];
      }
    }

    const pidMatch = html.match(/_gnrdPid\s*=\s*(\d+)/);
    const tokMatch = html.match(/_gnrdTok\s*=\s*["']([^"']+)["']/);
    if (!pidMatch?.[1] || !tokMatch?.[1]) return [];

    const playerApiUrl = withGnmParam(
      `${GNULA_ORIGIN}/wp-json/gnrd/v1/player?id=${pidMatch[1]}&t=${encodeURIComponent(
        tokMatch[1]
      )}`
    );
    const pText = await fetchTextWithCurlFallback(
      playerApiUrl,
      {
        'User-Agent': CHROME_UA,
        Accept: 'application/json',
        Referer: pageUrl,
      },
      4000
    );
    if (!pText) return [];
    const pJson = JSON.parse(pText);
    return parseGnulaPlayerPayload(pJson);
  } catch {
    return [];
  }
}
