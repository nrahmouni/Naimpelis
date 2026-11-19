import {
  CHROME_UA,
  curlGetText,
  matchesYouTubeFallbackTitle,
  normalizeTitleForMatch,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import { probeVidsrcBuzzHasContent } from '../extractors/bingetrixMovidy.ts';

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
  const isCloudflareDirectEmbed = /(?:^|\.)(voe\.sx|voe\.bar|hglink\.to|streamwish\.[a-z]+|ok\.ru|byse\.[a-z]+|filelions\.[a-z]+)/i.test(
    url
  );
  const shouldProxyHtml =
    /(^|\.)(vidsrc\.buzz|videm\.buzz|2embed\.cc|vidfast\.[a-z.]+)/i.test(url) ||
    (isSandboxedFrame && !isCloudflareDirectEmbed);
  return shouldProxyHtml ? `/api/embed-proxy?url=${encodeURIComponent(url)}` : url;
}

export async function verifyWebEmbedCandidateAlive(
  track: TrackRecord,
  url: string
): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (/player\.gnulahd\./i.test(url)) {
    try {
      const headRes = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { Referer: 'https://ww3.gnulahd.nu/', 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(2200),
      });
      const loc = String(headRes.headers.get('location') || '').toLowerCase();
      if (loc.includes('aviso.mp4')) return false;
    } catch {
      // allow if HEAD check itself timed out
    }
  }
  if (/voe\.[a-z]+/i.test(url) && !track.id.startsWith('movidy-')) {
    try {
      const check = await curlGetText(
        url,
        { Referer: 'https://embed69.org/', 'User-Agent': CHROME_UA },
        3,
        true
      );
      if (
        check.text &&
        /<title>\s*404|not found<\/title>|file was deleted|no longer available/i.test(
          check.text.slice(0, 1200)
        )
      ) {
        return false;
      }
    } catch {
      // allow on network timeout
    }
  }
  return true;
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
  const epNumRegex = new RegExp(`\\b0*${effectiveEpisode}\\b`);

  for (const q of queries.slice(0, 2)) {
    try {
      const ytRes = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
        {
          headers: {
            'User-Agent': CHROME_UA,
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(3800),
        }
      );
      if (!ytRes.ok) continue;
      const html = await ytRes.text();
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
            if (durSec < 360 || durSec > 7200) continue;
          } else {
            if (durSec < 2700 || durSec > 14400) continue;
          }

          if (
            /\b(trailer|tráiler|teaser|reaction|reaccion|reacción|review|resumen|opening|ending|amv|ost|soundtrack|gameplay|parodia|parody|shorts|#shorts|podcast|entrevista|interview|documentary essay)\b/i.test(
              vTitle
            )
          ) {
            continue;
          }

          if (!matchesYouTubeFallbackTitle(shortMain, vTitle)) {
            continue;
          }

          const normVTitle = normalizeTitleForMatch(vTitle);
          const exactEpisodeMatch =
            effectiveMediaType === 'movie' ||
            epNumRegex.test(vTitle) ||
            Boolean(normEpTitle && normEpTitle.length >= 4 && normVTitle.includes(normEpTitle));

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
    rawInput,
    isSandboxedFrame,
  } = opts;
  if (!resolvedTmdbId) return [];
  const idStr = String(resolvedTmdbId);
  const s = Math.max(1, effectiveSeason || 1);
  const e = Math.max(1, effectiveEpisode || 1);
  const isExplicitVidfastInput = /(^|\/|https?:\/\/)(?:www\.)?vidfast\.[a-z.]+/i.test(rawInput);

  const hasBuzzContent = await probeVidsrcBuzzHasContent({
    tmdbId: idStr,
    mediaType: effectiveMediaType,
    season: s,
    episode: e,
  });

  const vidfastEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-vidfast-${idStr}-${s}-${e}`,
          label: 'Servidor Web · VidFast HD',
          url: isExplicitVidfastInput && /vidfast\.[a-z.]+\/tv\//i.test(rawInput)
            ? rawInput
            : `https://vidfast.vc/tv/${idStr}/${s}/${e}?autoPlay=true&theme=9146FF`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-vidfast-${idStr}`,
          label: 'Servidor Web · VidFast HD',
          url: isExplicitVidfastInput && /vidfast\.[a-z.]+\/movie\//i.test(rawInput)
            ? rawInput
            : `https://vidfast.vc/movie/${idStr}?autoPlay=true&theme=9146FF`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const vidrockEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-vidrock-${idStr}-${s}-${e}`,
          label: 'Servidor Web · VidRock HD',
          url: `https://vidrock.net/embed/tv/${idStr}/${s}/${e}`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-vidrock-${idStr}`,
          label: 'Servidor Web · VidRock HD',
          url: `https://vidrock.net/embed/movie/${idStr}`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const vidnestEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-vidnest-${idStr}-${s}-${e}`,
          label: 'Servidor Web · VidNest HD',
          url: `https://vidnest.fun/tv/${idStr}/${s}/${e}`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-vidnest-${idStr}`,
          label: 'Servidor Web · VidNest HD',
          url: `https://vidnest.fun/movie/${idStr}`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const vidsrcBuzzEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-vidsrcbuzz-${idStr}-${s}-${e}`,
          label: 'Servidor Web 1 · Cloud Limpio',
          url: `https://vidsrc.buzz/embed/tv/${idStr}/${s}/${e}`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-vidsrcbuzz-${idStr}`,
          label: 'Servidor Web 1 · Cloud Limpio',
          url: `https://vidsrc.buzz/embed/movie/${idStr}`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const videmBuzzEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-vidembuzz-${idStr}-${s}-${e}`,
          label: 'Servidor Web 2 · VidEm Limpio',
          url: `https://videm.buzz/embed/tv/${idStr}/${s}/${e}`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-vidembuzz-${idStr}`,
          label: 'Servidor Web 2 · VidEm Limpio',
          url: `https://videm.buzz/embed/movie/${idStr}`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const twoEmbedEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-2embed-${idStr}-${s}-${e}`,
          label: 'Servidor Web 3 · 2Embed Limpio',
          url: `https://www.2embed.cc/embedtv/${idStr}&s=${s}&e=${e}`,
          proxyHtml: true,
          sandboxSafe: true,
        }
      : {
          id: `embed-2embed-${idStr}`,
          label: 'Servidor Web 3 · 2Embed Limpio',
          url: `https://www.2embed.cc/embed/${idStr}`,
          proxyHtml: true,
          sandboxSafe: true,
        };

  const vidlinkEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-vidlink-${idStr}-${s}-${e}`,
          label: 'Servidor Web 4 · Multi-Audio',
          url: `https://vidlink.pro/tv/${idStr}/${s}/${e}?autoplay=true&primaryColor=9146FF`,
          proxyHtml: false,
          sandboxSafe: false,
        }
      : {
          id: `embed-vidlink-${idStr}`,
          label: 'Servidor Web 4 · Multi-Audio',
          url: `https://vidlink.pro/movie/${idStr}?autoplay=true&primaryColor=9146FF`,
          proxyHtml: false,
          sandboxSafe: false,
        };

  const vidsrcShEntry =
    effectiveMediaType === 'tv'
      ? {
          id: `embed-vidsrcsh-${idStr}-${s}-${e}`,
          label: 'Servidor Web 5 · VidSrc',
          url: `https://vidsrc.sh/embed/tv/${idStr}/${s}-${e}`,
          proxyHtml: false,
          sandboxSafe: false,
        }
      : {
          id: `embed-vidsrcsh-${idStr}`,
          label: 'Servidor Web 5 · VidSrc',
          url: `https://vidsrc.sh/embed/movie/${idStr}`,
          proxyHtml: false,
          sandboxSafe: false,
        };

  let baseEntries: any[];
  if (isExplicitVidfastInput) {
    baseEntries = [vidfastEntry, vidrockEntry, vidnestEntry, twoEmbedEntry, vidlinkEntry];
  } else if (hasBuzzContent) {
    baseEntries = [
      vidsrcBuzzEntry,
      videmBuzzEntry,
      vidfastEntry,
      vidrockEntry,
      twoEmbedEntry,
      vidlinkEntry,
    ];
  } else {
    baseEntries = [
      vidfastEntry,
      vidrockEntry,
      vidnestEntry,
      twoEmbedEntry,
      vidlinkEntry,
      vidsrcShEntry,
    ];
  }

  const orderedEntries = (isSandboxedFrame
    ? baseEntries.filter((entry) => entry.sandboxSafe)
    : baseEntries
  ).slice(0, 5);

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
