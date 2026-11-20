import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  curlGetText,
  fetchTextWithCurlFallback,
  normalizeTitleForMatch,
  type TrackRecord,
} from './httpHelpers.ts';

interface MontepinarChapterRaw {
  nombre?: string;
  titulo?: string;
  poster?: string;
  iframe?: string;
  iframe_alt?: string;
  embedy?: string;
  subtitulos?: string;
  descargable?: string;
}

interface MontepinarSeasonRaw {
  id?: string | number;
  tipo?: string;
  nombre?: string;
  capitulos?: MontepinarChapterRaw[];
}

interface MontepinarJsonPayload {
  temporadas?: MontepinarSeasonRaw[];
}

export interface MontepinarSubtitleItem {
  id: string;
  lang: string;
  label: string;
  url: string;
  source: string;
}

export interface MontepinarExtractResult {
  tracks: TrackRecord[];
  subtitles: MontepinarSubtitleItem[];
}

const CATALOG_URL = 'https://jonilar.eu/visualizador/lqsa/episodios_new.min.json';
const FALLBACK_CATALOG_URL = 'https://jonilar.eu/visualizador/lqsa/episodios_dos.min.json';

const catalogCache = new LruTtlCache<string, MontepinarSeasonRaw[]>(4, 15 * 60 * 1000);
const episodeCache = new LruTtlCache<string, MontepinarExtractResult>(250, 15 * 60 * 1000);

// Verified fallback entries for Seasons 16 and 17 (up to 17x03 released so far) in case jonilar.eu has a transient outage
const VERIFIED_LQSA_FALLBACK_MAP: Record<
  string,
  {
    mp4Url: string;
    vkUrl?: string;
    okUrl?: string;
    subUrl?: string;
    quality: string;
  }
> = {
  '16x1': {
    mp4Url: 'https://ia800501.us.archive.org/14/items/16x-01_202610/16x01.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239021&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/b430/faae/7663/42c4-9699-af5160c0af89/c3d69fb5-5510-4d0d-ac17-bd8085d7a145.vtt',
    quality: '720p',
  },
  '16x2': {
    mp4Url: 'https://ia800501.us.archive.org/14/items/16x-01_202610/16x02.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239022&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/8537/09e4/2074/4c5d-95e0-549b18748e5a/f65ca2ea-57bb-4585-98b8-97561e159c19.vtt',
    quality: '720p',
  },
  '16x3': {
    mp4Url: 'https://ia800501.us.archive.org/14/items/16x-01_202610/16x03.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239025&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/c17f/cee2/6975/49e2-b130-6d726962758d/67f28e0a-6224-442a-be04-60232aac7752.vtt',
    quality: '720p',
  },
  '16x4': {
    mp4Url: 'https://ia800501.us.archive.org/14/items/16x-01_202610/16x04.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239023&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/6bc5/7f28/4a20/41be-9714-f61a45761cd1/f3b2e575-585c-42ec-8cdb-f1e264d72d2c.vtt',
    quality: '720p',
  },
  '16x5': {
    mp4Url: 'https://ia800501.us.archive.org/14/items/16x-01_202610/16x05.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239019&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/6855/49be/fce0/43b8-908f-98afd798b343/3c914e12-7407-48ff-a59f-ea2cddca6dea.vtt',
    quality: '720p',
  },
  '16x6': {
    mp4Url: 'https://ia800501.us.archive.org/14/items/16x-01_202610/16x06.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239018&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/be79/f4ee/8e33/4b39-bd7c-c33680bd788a/96044ee7-ef5a-46e9-8f65-70571ddc93ed.vtt',
    quality: '720p',
  },
  '16x7': {
    mp4Url: 'https://ia800501.us.archive.org/14/items/16x-01_202610/16x07.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239020&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/d17c/b4c5/b851/4ebe-ac84-e690a7a8fc2d/d5e13816-ae3a-44c9-a9fc-3b52b677d21f.vtt',
    quality: '720p',
  },
  '16x8': {
    mp4Url: 'https://ia800501.us.archive.org/14/items/16x-01_202610/16x08.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239024&hd=2&autoplay=1&mute=0',
    okUrl: 'https://ok.ru/videoembed/11397452401208?nochat=1',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/72c5/9630/2084/42a6-9ed9-3b6183dfe22a/46ba2482-ae5f-4b46-9ab9-c57bcf2dda0f.vtt',
    quality: '720p',
  },
  '17x1': {
    mp4Url: 'https://ia600409.us.archive.org/23/items/1701_20261115/1701.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239030&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/329e/5bef/cf4a/43df-a86c-5cf917ffe317/26cf5e3d-7ffe-4229-aaaa-0dfa5ad272a1.vtt',
    quality: '1080p',
  },
  '17x2': {
    mp4Url: 'https://ia600409.us.archive.org/23/items/1701_20261115/1702.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239028&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/730f/30c3/71c0/41c6-8128-325d79b1cca5/971ac18f-26a7-485b-bf51-fbc328bdd63e.vtt',
    quality: '1080p',
  },
  '17x3': {
    mp4Url: 'https://ia600409.us.archive.org/23/items/1701_20261115/1703.mp4',
    vkUrl: 'https://vk.com/video_ext.php?oid=-234915180&id=456239029&hd=2&autoplay=1&mute=0',
    subUrl: 'https://cf-timedtext.aux.pv-cdn.net/49fb/4534/1417/4441-a486-b2495e84f1d6/2eb27de3-32fa-4a05-9e07-c3ddb0d401d8.vtt',
    quality: '1080p',
  },
};

function isLqsaShow(tmdbId?: string | number | null, titleHints: string[] = []): boolean {
  if (String(tmdbId || '') === '35338') return true;
  return titleHints.some((h) => normalizeTitleForMatch(h).includes('la que se avecina'));
}

function isDirectVideoFileUrl(raw?: string): boolean {
  const u = String(raw || '').trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.(vtt|srt|ass|ssa|txt|jpg|jpeg|png|webp)(\?|$)/i.test(u)) return false;
  return /\.(mp4|m4v|webm|mov)(\?|$)/i.test(u) || /\/streams\/[^/]+\//i.test(u);
}

function inferQualityLabel(season: number, mp4Url: string): string {
  if (season >= 17 || /170\d\.mp4|odycdn\.com/i.test(mp4Url)) return '1080p';
  if (season >= 12) return '720p';
  return '720p';
}

async function fetchMontepinarCatalog(): Promise<MontepinarSeasonRaw[] | null> {
  const cached = catalogCache.get('lqsa');
  if (cached) return cached;

  const headers = {
    'User-Agent': CHROME_UA,
    Referer: 'https://jonilar.eu/visualizador/lqsa/',
    Accept: 'application/json',
  };

  for (const url of [CATALOG_URL, FALLBACK_CATALOG_URL]) {
    try {
      let rawText = await fetchTextWithCurlFallback(url, headers, 3800).catch(() => '');
      if (!rawText) {
        const res = await curlGetText(url, headers, 4, true, false).catch(() => ({ text: '' }));
        rawText = res.text || '';
      }
      if (!rawText) continue;
      const parsed = JSON.parse(rawText) as MontepinarJsonPayload;
      if (Array.isArray(parsed?.temporadas) && parsed.temporadas.length > 0) {
        catalogCache.set('lqsa', parsed.temporadas);
        return parsed.temporadas;
      }
    } catch {
      // try fallback catalog URL
    }
  }
  return null;
}

async function verifyDirectMp4Reachable(url: string): Promise<string | null> {
  const tryProbe = async (candidate: string): Promise<boolean> => {
    try {
      const res = await fetch(candidate, {
        method: 'GET',
        headers: {
          'User-Agent': CHROME_UA,
          Range: 'bytes=0-1023',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(3200),
      });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      try {
        await res.body?.cancel?.();
      } catch {
        // ignore
      }
      return (res.status === 200 || res.status === 206) && !ct.includes('text/html');
    } catch {
      return false;
    }
  };

  if (await tryProbe(url)) return url;

  // If an archive node (e.g. ia800501.us.archive.org) fails, try canonical archive.org/download/ redirect
  const iaMatch = url.match(/archive\.org\/\d+\/items\/([^/]+\/.+)$/i);
  if (iaMatch?.[1]) {
    const canonical = `https://archive.org/download/${iaMatch[1]}`;
    if (canonical !== url && (await tryProbe(canonical))) {
      return canonical;
    }
  }
  return null;
}

function findEpisodeEntryInCatalog(
  seasons: MontepinarSeasonRaw[],
  season: number,
  episode: number
): MontepinarChapterRaw | null {
  const seasonObj = seasons.find(
    (s) => String(s?.id ?? '').trim() === String(season) && s?.tipo !== '24h'
  );
  if (!seasonObj || !Array.isArray(seasonObj.capitulos) || seasonObj.capitulos.length === 0) {
    return null;
  }

  // Prefer matching explicit chapter number in `nombre` (e.g. "Capítulo 3 (205)"), fallback to 1-based index
  const byNumber = seasonObj.capitulos.find((cap) => {
    const m = String(cap?.nombre || '').match(/cap[ií]tulo\s*0*(\d{1,3})\b/i);
    return m ? parseInt(m[1], 10) === episode : false;
  });
  if (byNumber) return byNumber;

  return seasonObj.capitulos[episode - 1] || null;
}

export async function extractComunidadMontepinarLqsaTracks(opts: {
  tmdbId?: string | number | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints: string[];
}): Promise<MontepinarExtractResult> {
  if (opts.mediaType !== 'tv' || !isLqsaShow(opts.tmdbId, opts.titleHints)) {
    return { tracks: [], subtitles: [] };
  }

  const season = Math.max(1, Number(opts.season) || 1);
  const episode = Math.max(1, Number(opts.episode) || 1);
  const epPad = String(episode).padStart(2, '0');
  const epKey = `${season}x${episode}`;

  const cached = episodeCache.get(epKey);
  if (cached) return cached;

  const seasons = await fetchMontepinarCatalog().catch(() => null);
  const catalogEp = seasons ? findEpisodeEntryInCatalog(seasons, season, episode) : null;
  const fallbackEp = VERIFIED_LQSA_FALLBACK_MAP[epKey];

  const rawMp4Candidates: string[] = [];
  if (catalogEp?.iframe_alt && isDirectVideoFileUrl(catalogEp.iframe_alt)) {
    rawMp4Candidates.push(catalogEp.iframe_alt.trim());
  }
  if (catalogEp?.iframe && isDirectVideoFileUrl(catalogEp.iframe)) {
    rawMp4Candidates.push(catalogEp.iframe.trim());
  }
  if (fallbackEp?.mp4Url && !rawMp4Candidates.includes(fallbackEp.mp4Url)) {
    rawMp4Candidates.push(fallbackEp.mp4Url);
  }

  let verifiedMp4Url: string | null = null;
  for (const cand of rawMp4Candidates) {
    const okUrl = await verifyDirectMp4Reachable(cand);
    if (okUrl) {
      verifiedMp4Url = okUrl;
      break;
    }
  }

  const tracks: TrackRecord[] = [];
  if (verifiedMp4Url) {
    const quality = fallbackEp?.quality || inferQualityLabel(season, verifiedMp4Url);
    const isFullHd = quality === '1080p';
    tracks.push({
      id: `cm-lqsa-${season}x${epPad}-mp4`,
      label: `${isFullHd ? 'Montepinar Full HD' : 'Montepinar HD'} · T${season}x${epPad} (Castellano)`,
      lang: 'ES',
      quality,
      sourceUrl: verifiedMp4Url,
      referer: verifiedMp4Url.includes('archive.org')
        ? 'https://archive.org/'
        : 'https://jonilar.eu/',
      resolverType: 'direct_mp4',
      resolvedStreamUrl: verifiedMp4Url,
    });
  }

  const okUrl =
    (catalogEp?.embedy && /ok\.ru\/videoembed\//i.test(catalogEp.embedy)
      ? catalogEp.embedy.trim()
      : '') ||
    fallbackEp?.okUrl ||
    '';
  if (okUrl) {
    tracks.push({
      id: `cm-lqsa-${season}x${epPad}-ok`,
      label: `OK.ru HD · T${season}x${epPad} (Castellano)`,
      lang: 'ES',
      quality: '1080p',
      sourceUrl: okUrl,
      referer: 'https://ok.ru/',
      resolverType: 'web_embed',
    });
  }

  const vkUrl =
    (catalogEp?.iframe && /vk(?:video)?\.(?:com|ru)\/video_ext\.php/i.test(catalogEp.iframe)
      ? catalogEp.iframe.trim()
      : '') ||
    fallbackEp?.vkUrl ||
    '';
  if (vkUrl) {
    tracks.push({
      id: `cm-lqsa-${season}x${epPad}-vk`,
      label: `VK Video HD · T${season}x${epPad} (Castellano)`,
      lang: 'ES',
      quality: '1080p',
      sourceUrl: vkUrl,
      referer: 'https://vk.com/',
      resolverType: 'web_embed',
    });
  }

  const subtitles: MontepinarSubtitleItem[] = [];
  const rawSubUrl = String(catalogEp?.subtitulos || fallbackEp?.subUrl || '').trim();
  if (/^https?:\/\//i.test(rawSubUrl)) {
    subtitles.push({
      id: `cm-lqsa-sub-${season}x${epPad}`,
      lang: 'es',
      label: 'Español (Oficial)',
      url: `/api/subtitles/proxy?url=${encodeURIComponent(rawSubUrl)}`,
      source: 'ComunidadMontepinar',
    });
  }

  const result: MontepinarExtractResult = { tracks, subtitles };
  if (tracks.length > 0) {
    episodeCache.set(epKey, result);
  }
  return result;
}
