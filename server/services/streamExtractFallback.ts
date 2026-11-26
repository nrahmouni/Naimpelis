import {
  CHROME_UA,
  curlGetText,
  fetchTextWithCurlFallback,
  matchesYouTubeFallbackTitle,
  normalizeTitleForMatch,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';

function parseYtDurationSeconds(durText: string): number {
  const clean = String(durText || '').trim();
  if (!clean || /live|directo/i.test(clean)) return 0;
  const parts = clean.split(':').map((p) => parseInt(p.replace(/\D/g, ''), 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export function toProxiedEmbedUrl(url: string, isSandboxedFrame: boolean): string {
  const isCloudflareDirectEmbed = /(?:^|\.)(voe\.sx|voe\.bar|hglink\.to|streamwish\.[a-z]+|ok\.ru|vk\.com|vkvideo\.ru|byse\.[a-z]+|filelions\.[a-z]+)/i.test(
    url
  );
  const shouldProxyHtml =
    /(^|\.)(2embed\.cc|bingetrix\.sc|vidbolt\.st)/i.test(url) ||
    (isSandboxedFrame && !isCloudflareDirectEmbed);
  return shouldProxyHtml ? `/api/embed-proxy?url=${encodeURIComponent(url)}` : url;
}

const KNOWN_TRUSTED_WEB_EMBED_RE =
  /(?:^|\.)(bingetrix\.sc|vidbolt\.st|2embed\.cc|vidsrc\.[a-z]+|vidlink\.pro|vidfast\.[a-z.]+|videm\.buzz|player\.videasy\.net|player\.vidzee\.wtf|vixsrc\.to|moviesapi\.club|megaplay\.buzz|primesrc\.me|ok\.ru|vk\.com|vkvideo\.ru|archive\.org|dailymotion\.com|youtube\.com|youtu\.be)$/i;

export async function verifyWebEmbedCandidateAlive(
  track: TrackRecord,
  url: string,
  signal?: AbortSignal
): Promise<boolean> {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
  if (!url || !/^https?:\/\//i.test(url)) return false;

  let parsedHost = '';
  try {
    parsedHost = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const isTrustedEmbedHost = KNOWN_TRUSTED_WEB_EMBED_RE.test(parsedHost);
  const isGnulaUrl = /gnulahd\./i.test(url) || track.id.startsWith('gnula-');

  if (/voe\.[a-z]+/i.test(url) && !track.id.startsWith('movidy-')) {
    try {
      const check = await curlGetText(
        url,
        { Referer: 'https://embed69.org/', 'User-Agent': CHROME_UA },
        3,
        true,
        true,
        signal
      );
      if (
        !check.text ||
        /<title>\s*404|not found<\/title>|file was deleted|no longer available/i.test(
          check.text.slice(0, 1200)
        )
      ) {
        return false;
      }
      return /<(?:html|head|body|div|iframe|script|video)\b/i.test(check.text);
    } catch (err) {
      if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') throw err;
      return false;
    }
  }

  try {
    const reqSig = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(1300)])
      : AbortSignal.timeout(1300);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Range: 'bytes=0-1535',
        Referer: isGnulaUrl ? 'https://ww3.gnulahd.nu/' : `${new URL(url).origin}/`,
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: reqSig,
    });

    const finalUrl = String(res.url || url).toLowerCase();
    if (finalUrl.includes('aviso.mp4') || /\.(mp4|m4v|mkv|webm|avi|ts|m3u8)(\?|$)/i.test(finalUrl)) {
      try {
        await res.body?.cancel?.();
      } catch {
        // ignore
      }
      return false;
    }

    if (res.status >= 400 && res.status !== 416) {
      try {
        await res.body?.cancel?.();
      } catch {
        // ignore
      }
      return false;
    }

    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    if (
      ct &&
      (ct.startsWith('video/') ||
        ct.startsWith('audio/') ||
        ct.startsWith('image/') ||
        ct.includes('octet-stream') ||
        ct.includes('mp4') ||
        ct.includes('mpegurl') ||
        ct.includes('application/json') ||
        (!ct.includes('html') && !ct.includes('text/plain')))
    ) {
      try {
        await res.body?.cancel?.();
      } catch {
        // ignore
      }
      return false;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (
      (buf.length >= 8 && buf.subarray(4, 8).toString('ascii') === 'ftyp') ||
      (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) ||
      buf.subarray(0, Math.min(buf.length, 512)).includes(0)
    ) {
      return false;
    }

    const snippet = buf.toString('utf8', 0, Math.min(buf.length, 1536));
    if (
      /aviso\.mp4|<title>\s*404|not found<\/title>|file was deleted|no longer available|video has been removed/i.test(
        snippet
      )
    ) {
      return false;
    }
    if (snippet.trim().length > 0 && !snippet.includes('<')) {
      return false;
    }
    if (!isTrustedEmbedHost && !/<(?:html|head|body|div|iframe|script|video|meta)\b/i.test(snippet)) {
      return false;
    }
    return true;
  } catch (err) {
    if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') throw err;
    // Trusted SPA embed players behind Cloudflare/CORS can fail Node fetch; unverified hosts must pass HTML probe
    return isTrustedEmbedHost && !isGnulaUrl;
  }
}

export async function searchYouTubeFullFallback(opts: {
  fallbackBaseTitle: string;
  episodeTitleHint: string;
  preferLang: string;
  effectiveMediaType: 'movie' | 'tv';
  effectiveSeason: number;
  effectiveEpisode: number;
}): Promise<{
  track: TrackRecord;
  exactEpisodeMatch: boolean;
} | null> {
  const {
    fallbackBaseTitle,
    episodeTitleHint,
    preferLang,
    effectiveMediaType,
    effectiveSeason,
    effectiveEpisode,
  } = opts;
  const cleanMain = fallbackBaseTitle
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[,:;!?]+/g, ' ')
    .trim();
  if (cleanMain.length < 2) return null;

  const shortMain = cleanMain.split(/\s+/).slice(0, 4).join(' ');
  const isGenericEpTitle =
    !episodeTitleHint ||
    /^(episodio|episode|cap[ií]tulo|cap\.?|ep\.?)\s*\d+$/i.test(episodeTitleHint.trim());

  const langKeywords =
    preferLang === 'LAT'
      ? 'español latino'
      : preferLang === 'VOSE'
      ? 'sub español'
      : preferLang === 'EN'
      ? 'english'
      : 'español castellano';

  const queries: string[] = [];
  if (effectiveMediaType === 'tv') {
    if (!isGenericEpTitle && episodeTitleHint.length >= 3) {
      queries.push(`${shortMain} ${episodeTitleHint} ${preferLang === 'EN' ? 'full episode' : 'español'}`);
    }
    queries.push(
      preferLang === 'EN'
        ? `${shortMain} season ${effectiveSeason} episode ${effectiveEpisode} full episode`
        : `${shortMain} capitulo ${effectiveEpisode} ${langKeywords} completo`
    );
  } else {
    queries.push(
      preferLang === 'EN'
        ? `${shortMain} full movie`
        : `${shortMain} pelicula completa ${langKeywords}`
    );
  }

  const normEpTitle = !isGenericEpTitle ? normalizeTitleForMatch(episodeTitleHint) : '';
  const epFirstClause = !isGenericEpTitle ? episodeTitleHint.split(',')[0].trim() : '';
  const normEpClause = epFirstClause ? normalizeTitleForMatch(epFirstClause) : '';
  const epNumRegex = new RegExp(`\\b0*${effectiveEpisode}\\b`);
  const explicitSeasonEpRegex = new RegExp(
    `(?:\\b[TS]0*${effectiveSeason}[_\\s.-]*E0*${effectiveEpisode}\\b|\\b0*${effectiveSeason}\\s*[xX×]\\s*0*${effectiveEpisode}\\b|temporada\\s*0*${effectiveSeason}[^a-z0-9]{0,20}(?:cap(?:[ií]tulo)?|ep(?:isodio)?)\\s*0*${effectiveEpisode}\\b|season\\s*0*${effectiveSeason}[^a-z0-9]{0,20}episode\\s*0*${effectiveEpisode}\\b)`,
    'i'
  );
  const seasonMentionRegex =
    /(?:\b[TS]0*(\d{1,2})[_\s.-]*E\d{1,3}\b|\b0*(\d{1,2})\s*[xX×]\s*\d{1,3}\b|(?:temporada|season)\s*0*(\d{1,2})\b)/i;

  for (const q of queries.slice(0, 2)) {
    try {
      const html = await fetchTextWithCurlFallback(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
        {
          'User-Agent': CHROME_UA,
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        2800
      );
      if (!html) continue;
      const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
      if (!initMatch) continue;
      const ytData = JSON.parse(initMatch[1]);
      const sections =
        ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents
          ?.sectionListRenderer?.contents || [];

      for (const sec of sections) {
        const items = sec?.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const vr = item?.videoRenderer;
          if (!vr?.videoId) continue;
          const vTitle = vr.title?.runs?.map((r: any) => r.text).join('') || '';
          const durStr = vr.lengthText?.simpleText || '';
          const durSec = parseYtDurationSeconds(durStr);

          if (effectiveMediaType === 'tv') {
            if (durSec < 1100 || durSec > 16200) continue;
          } else {
            if (durSec < 2700 || durSec > 14400) continue;
          }

          if (
            /\b(trailer|tráiler|teaser|avance|promo|reaction|reaccion|reacción|review|resumen|opening|ending|amv|ost|soundtrack|gameplay|parodia|parody|shorts|#shorts|podcast|entrevista|interview|tomas falsas|cabecera|documentary essay)\b/i.test(
              vTitle
            )
          ) {
            continue;
          }

          if (!matchesYouTubeFallbackTitle(shortMain, vTitle)) {
            continue;
          }

          const seasonMatch = vTitle.match(seasonMentionRegex);
          if (effectiveMediaType === 'tv' && seasonMatch) {
            const foundSeason = parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3] || '0', 10);
            if (foundSeason > 0 && foundSeason !== effectiveSeason) {
              continue;
            }
          }

          const normVTitle = normalizeTitleForMatch(vTitle);
          const hasExplicitSeEp = explicitSeasonEpRegex.test(vTitle);
          const hasDistinctTitleMatch = Boolean(
            (normEpTitle && normEpTitle.length >= 6 && normVTitle.includes(normEpTitle)) ||
              (normEpClause && normEpClause.length >= 14 && normVTitle.includes(normEpClause))
          );
          const hasSeason1ImplicitMatch =
            effectiveSeason === 1 && !seasonMatch && epNumRegex.test(vTitle);

          if (effectiveMediaType === 'tv' && durSec > 7200 && !hasDistinctTitleMatch) {
            continue;
          }

          const exactEpisodeMatch =
            effectiveMediaType === 'movie' ||
            hasExplicitSeEp ||
            hasDistinctTitleMatch ||
            hasSeason1ImplicitMatch;

          if (effectiveMediaType === 'tv' && !exactEpisodeMatch) {
            continue;
          }

          const ytLangCode =
            preferLang === 'LAT'
              ? 'LAT'
              : preferLang === 'VOSE'
              ? 'VOSE'
              : preferLang === 'EN'
              ? 'EN'
              : 'ES';
          const ytLangName =
            ytLangCode === 'LAT'
              ? 'Latino'
              : ytLangCode === 'VOSE'
              ? 'VOSE'
              : ytLangCode === 'EN'
              ? 'Inglés'
              : 'Español';

          return {
            track: {
              id: `yt-fallback-${vr.videoId}`,
              label: `YouTube · ${ytLangName} (${durStr})`,
              lang: ytLangCode,
              quality: 'HD',
              sourceUrl: `https://www.youtube.com/watch?v=${vr.videoId}`,
              resolverType: 'youtube',
              resolvedStreamUrl: vr.videoId,
            },
            exactEpisodeMatch,
          };
        }
      }
    } catch {
      // continue to next query or web embed
    }
  }
  return null;
}

export async function buildWebEmbedTracks(opts: {
  resolvedTmdbId: string | number | null;
  effectiveMediaType: 'movie' | 'tv';
  effectiveSeason: number;
  effectiveEpisode: number;
  rawInput: string;
  isSandboxedFrame: boolean;
}): Promise<TrackRecord[]> {
  const {
    resolvedTmdbId,
    effectiveMediaType,
    effectiveSeason,
    effectiveEpisode,
    isSandboxedFrame,
  } = opts;
  if (!resolvedTmdbId) return [];
  const idStr = String(resolvedTmdbId);
  const s = Math.max(1, effectiveSeason || 1);
  const e = Math.max(1, effectiveEpisode || 1);

  const bingetrixEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-bingetrix-${idStr}-${s}-${e}`,
          label: 'Bingetrix · Web HD',
          url: `https://bingetrix.sc/watch/tv/${idStr}/${s}/${e}`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-bingetrix-${idStr}`,
          label: 'Bingetrix · Web HD',
          url: `https://bingetrix.sc/watch/${idStr}`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const vidboltEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-vidbolt-${idStr}-${s}-${e}`,
          label: 'Ghostflix · Multi-Audio HD',
          url: `https://vidbolt.st/embed/tv/${idStr}/${s}/${e}`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-vidbolt-${idStr}`,
          label: 'Ghostflix · Multi-Audio HD',
          url: `https://vidbolt.st/embed/movie/${idStr}`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const twoEmbedEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-2embed-${idStr}-${s}-${e}`,
          label: '2Embed · Cloud HD',
          url: `https://www.2embed.cc/embedtv/${idStr}&s=${s}&e=${e}`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-2embed-${idStr}`,
          label: '2Embed · Cloud HD',
          url: `https://www.2embed.cc/embed/${idStr}`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const baseEntries = [bingetrixEntry, vidboltEntry, twoEmbedEntry];
  const orderedEntries = (isSandboxedFrame
    ? baseEntries.filter((entry) => entry.sandboxSafe)
    : baseEntries
  ).slice(0, 4);

  return orderedEntries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    lang: 'EN',
    quality: '1080p',
    sourceUrl: entry.url,
    resolverType: 'web_embed' as const,
    resolvedStreamUrl: entry.proxyHtml
      ? `/api/embed-proxy?url=${encodeURIComponent(entry.url)}`
      : entry.url,
  }));
}
