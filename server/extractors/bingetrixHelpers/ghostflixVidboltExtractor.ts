/**
 * @module server/extractors/bingetrixHelpers/ghostflixVidboltExtractor
 * @description Ghostflix / VidBolt (vidbolt.st) multi-server & multi-audio HLS VOD extractor.
 * Resolves Orion / Callisto / Luna streams, parses `#EXT-X-MEDIA:TYPE=AUDIO` for ES/LAT/EN audio
 * discovery, and extracts `#EXT-X-MEDIA:TYPE=SUBTITLES` tracks into proxied RiffanTV subtitles.
 */
import { LruTtlCache } from '../../utils/lruCache.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  curlGetText,
  type SubtitleTrackOutput,
  type TrackRecord,
} from '../httpHelpers.ts';

export interface GhostflixVidboltResult {
  tracks: TrackRecord[];
  subtitles: SubtitleTrackOutput[];
  detectedLangs: ('ES' | 'LAT' | 'VOSE' | 'EN')[];
}

interface VidboltApiResponse {
  stream?: {
    server?: string;
    sources?: Array<{
      url?: string;
      kind?: string;
      quality?: string;
      master?: string;
    }>;
  };
}

const VIDBOLT_REFERER = 'https://vidbolt.st/';
const VIDBOLT_SERVERS = ['orion', 'callisto', 'luna'] as const;

const vidboltExtractCache = new LruTtlCache<string, GhostflixVidboltResult>(300, 12 * 60 * 1000);
const vidboltFastProbeCache = new LruTtlCache<
  string,
  { ok: boolean; langs: ('ES' | 'LAT' | 'VOSE' | 'EN')[] }
>(400, 15 * 60 * 1000);

export function isGhostflixOrVidboltUrl(rawUrl: string): boolean {
  return /(?:ghostflix\.st|vidbolt\.st)\/(?:embed\/|movies\/|tv\/|watch\/)?/i.test(
    String(rawUrl || '')
  );
}

export function parseGhostflixOrVidboltUrl(rawUrl: string): {
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
} | null {
  const s = String(rawUrl || '').trim();
  const tvMatch = s.match(/(?:ghostflix|vidbolt)\.st\/(?:embed\/)?tv\/(\d+)\/(\d+)\/(\d+)/i);
  if (tvMatch) {
    return {
      tmdbId: tvMatch[1],
      mediaType: 'tv',
      season: parseInt(tvMatch[2], 10) || 1,
      episode: parseInt(tvMatch[3], 10) || 1,
    };
  }
  const movieMatch = s.match(/(?:ghostflix|vidbolt)\.st\/(?:embed\/)?(?:movies?|watch)\/(\d+)/i);
  if (movieMatch) {
    return {
      tmdbId: movieMatch[1],
      mediaType: 'movie',
    };
  }
  return null;
}

export function parseVidboltMasterManifest(
  masterText: string,
  baseUrl: string
): {
  audioLangs: ('ES' | 'LAT' | 'VOSE' | 'EN')[];
  audioSummary: string[];
  subtitles: SubtitleTrackOutput[];
} {
  const audioLangsSet = new Set<'ES' | 'LAT' | 'VOSE' | 'EN'>();
  const audioSummary: string[] = [];
  const subtitles: SubtitleTrackOutput[] = [];
  const seenSubKeys = new Set<string>();

  const lines = String(masterText || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('#EXT-X-MEDIA:')) continue;

    const typeMatch = line.match(/TYPE=([A-Z]+)/i);
    const mediaType = typeMatch?.[1]?.toUpperCase();
    const nameMatch = line.match(/NAME="([^"]*)"/i);
    const langMatch = line.match(/LANGUAGE="([^"]*)"/i);
    const uriMatch = line.match(/URI="([^"]*)"/i);

    const name = String(nameMatch?.[1] || '').trim();
    const langRaw = String(langMatch?.[1] || '').trim().toLowerCase();
    const uri = String(uriMatch?.[1] || '').trim();

    if (mediaType === 'AUDIO') {
      const labelToken = name || langRaw.toUpperCase() || 'Audio';
      if (labelToken && !audioSummary.includes(labelToken)) {
        audioSummary.push(labelToken);
      }
      if (/^(es|es-es|spa)$/i.test(langRaw) || /castellano|european spanish|\bspanish\b/i.test(name)) {
        audioLangsSet.add('ES');
      } else if (/^(es-419|es-mx|es-la|lat)$/i.test(langRaw) || /latino|latin spanish/i.test(name)) {
        audioLangsSet.add('LAT');
      } else if (/^(en|eng|en-us|en-gb)$/i.test(langRaw) || /\benglish\b/i.test(name)) {
        audioLangsSet.add('EN');
      }
    } else if (mediaType === 'SUBTITLES' && uri) {
      let absUri = '';
      try {
        absUri = new URL(uri, baseUrl).href;
      } catch {
        continue;
      }
      const normSubLang = /^es/i.test(langRaw) || /spanish|español|castellano/i.test(name)
        ? 'es'
        : /^en/i.test(langRaw) || /english/i.test(name)
        ? 'en'
        : /^ar/i.test(langRaw)
        ? 'ar'
        : /^fr/i.test(langRaw)
        ? 'fr'
        : /^de/i.test(langRaw)
        ? 'de'
        : /^pt/i.test(langRaw)
        ? 'pt'
        : /^it/i.test(langRaw)
        ? 'it'
        : langRaw.slice(0, 6) || 'sub';

      const subKey = `${normSubLang}|${name.toLowerCase()}`;
      if (seenSubKeys.has(subKey)) continue;
      seenSubKeys.add(subKey);

      const isSpanish = normSubLang === 'es';
      const isEnglish = normSubLang === 'en';
      if (isSpanish || isEnglish || subtitles.length < 8) {
        const cleanLabel = isSpanish
          ? /european/i.test(name)
            ? 'Español (España)'
            : 'Español'
          : name || normSubLang.toUpperCase();
        subtitles.push({
          id: `vidbolt-sub-${subtitles.length}`,
          label: cleanLabel,
          lang: normSubLang,
          url: buildHlsProxyUrl(absUri, VIDBOLT_REFERER),
        });
      }
    }
  }

  if (audioLangsSet.size === 0) {
    audioLangsSet.add('EN');
  }
  if (subtitles.some((s) => s.lang === 'es')) {
    audioLangsSet.add('VOSE');
  }

  return {
    audioLangs: Array.from(audioLangsSet),
    audioSummary,
    subtitles: subtitles.sort((a, b) => {
      if (a.lang === 'es' && b.lang !== 'es') return -1;
      if (b.lang === 'es' && a.lang !== 'es') return 1;
      if (a.lang === 'en' && b.lang !== 'en') return -1;
      if (b.lang === 'en' && a.lang !== 'en') return 1;
      return 0;
    }),
  };
}

async function fetchVidboltServerResolve(
  server: (typeof VIDBOLT_SERVERS)[number],
  opts: {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    season: number;
    episode: number;
  }
): Promise<VidboltApiResponse | null> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  if (!cleanId) return null;

  const qs =
    opts.mediaType === 'tv'
      ? `type=tv&id=${encodeURIComponent(cleanId)}&season=${opts.season}&episode=${opts.episode}&prefer=${server}`
      : `type=movie&id=${encodeURIComponent(cleanId)}&prefer=${server}`;

  const apiUrl = `https://vidbolt.st/api/resolve?${qs}`;
  const embedReferer =
    opts.mediaType === 'tv'
      ? `https://vidbolt.st/embed/tv/${cleanId}/${opts.season}/${opts.episode}`
      : `https://vidbolt.st/embed/movie/${cleanId}`;

  const headers = {
    'User-Agent': CHROME_UA,
    Referer: embedReferer,
    Origin: 'https://vidbolt.st',
    Accept: 'application/json, text/plain, */*',
  };

  try {
    const res = await streamingFetch(apiUrl, { headers, timeoutMs: 4200 });
    if (res.ok) {
      const text = await res.text();
      if (text.trim().startsWith('{')) {
        return JSON.parse(text) as VidboltApiResponse;
      }
    }
  } catch {
    // fallback to curlGetText below
  }

  try {
    const fb = await curlGetText(apiUrl, headers, 5);
    if (fb.text.trim().startsWith('{')) {
      return JSON.parse(fb.text) as VidboltApiResponse;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function extractGhostflixVidboltTracks(opts: {
  tmdbId: string | number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  force?: boolean;
}): Promise<GhostflixVidboltResult> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  if (!cleanId) {
    return { tracks: [], subtitles: [], detectedLangs: [] };
  }

  const season = opts.mediaType === 'tv' ? Math.max(1, opts.season || 1) : 0;
  const episode = opts.mediaType === 'tv' ? Math.max(1, opts.episode || 1) : 0;
  const cacheKey = `${opts.mediaType}|${cleanId}|${season}|${episode}`;

  if (!opts.force) {
    const cached = vidboltExtractCache.get(cacheKey);
    if (cached) return cached;
  }

  const responses = await Promise.all(
    VIDBOLT_SERVERS.map((srv) =>
      fetchVidboltServerResolve(srv, {
        tmdbId: cleanId,
        mediaType: opts.mediaType,
        season: Math.max(1, season),
        episode: Math.max(1, episode),
      }).then((data) => ({ srv, data }))
    )
  );

  const tracks: TrackRecord[] = [];
  const allSubtitles: SubtitleTrackOutput[] = [];
  const seenUrls = new Set<string>();
  const detectedLangSet = new Set<'ES' | 'LAT' | 'VOSE' | 'EN'>();

  for (const { srv, data } of responses) {
    const sources = Array.isArray(data?.stream?.sources) ? data.stream.sources : [];
    for (const src of sources) {
      const streamUrl = String(src?.url || '').trim();
      if (!/^https?:\/\//i.test(streamUrl) || seenUrls.has(streamUrl)) continue;
      seenUrls.add(streamUrl);

      const masterText = String(src?.master || '');
      const parsedMaster = masterText
        ? parseVidboltMasterManifest(masterText, streamUrl)
        : {
            audioLangs: ['EN' as const],
            audioSummary: [] as string[],
            subtitles: [] as SubtitleTrackOutput[],
          };

      for (const l of parsedMaster.audioLangs) detectedLangSet.add(l);
      if (allSubtitles.length === 0 && parsedMaster.subtitles.length > 0) {
        allSubtitles.push(...parsedMaster.subtitles);
      }

      const proxyUrl = buildHlsProxyUrl(streamUrl, VIDBOLT_REFERER);
      const serverName = (data?.stream?.server || srv).replace(/^./, (c) => c.toUpperCase());
      const quality = src?.quality || '1080p';
      const hasEsAudio = parsedMaster.audioLangs.includes('ES');
      const hasLatAudio = parsedMaster.audioLangs.includes('LAT');
      const hasEsSub = parsedMaster.subtitles.some((s) => s.lang === 'es');

      if (hasEsAudio) {
        tracks.push({
          id: `vidbolt-${srv}-es`,
          label: `Ghostflix ${serverName} · Audio Español HD`,
          lang: 'ES',
          quality,
          sourceUrl: streamUrl,
          referer: VIDBOLT_REFERER,
          resolverType: 'direct_hls',
          resolvedStreamUrl: proxyUrl,
        });
      }
      if (hasLatAudio) {
        tracks.push({
          id: `vidbolt-${srv}-lat`,
          label: `Ghostflix ${serverName} · Audio Latino HD`,
          lang: 'LAT',
          quality,
          sourceUrl: streamUrl,
          referer: VIDBOLT_REFERER,
          resolverType: 'direct_hls',
          resolvedStreamUrl: proxyUrl,
        });
      }
      tracks.push({
        id: `vidbolt-${srv}-${hasEsSub ? 'vose' : 'en'}`,
        label: `Ghostflix ${serverName} ${
          parsedMaster.audioSummary.length > 1
            ? `Multi-Audio (${parsedMaster.audioSummary.slice(0, 3).join('/')})`
            : 'HD'
        }`,
        lang: hasEsSub ? 'VOSE' : 'EN',
        quality,
        sourceUrl: streamUrl,
        referer: VIDBOLT_REFERER,
        resolverType: 'direct_hls',
        resolvedStreamUrl: proxyUrl,
      });
    }
  }

  const result: GhostflixVidboltResult = {
    tracks,
    subtitles: allSubtitles,
    detectedLangs: Array.from(detectedLangSet),
  };

  if (tracks.length > 0) {
    vidboltExtractCache.set(cacheKey, result);
    vidboltFastProbeCache.set(cacheKey, { ok: true, langs: result.detectedLangs });
  }
  return result;
}

export async function hasGhostflixVidboltStreamFast(opts: {
  tmdbId: string | number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<{ ok: boolean; langs: ('ES' | 'LAT' | 'VOSE' | 'EN')[] }> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  if (!cleanId) return { ok: false, langs: [] };

  const season = opts.mediaType === 'tv' ? Math.max(1, opts.season || 1) : 0;
  const episode = opts.mediaType === 'tv' ? Math.max(1, opts.episode || 1) : 0;
  const cacheKey = `${opts.mediaType}|${cleanId}|${season}|${episode}`;

  const cached = vidboltFastProbeCache.get(cacheKey);
  if (cached) return cached;

  const data = await fetchVidboltServerResolve('orion', {
    tmdbId: cleanId,
    mediaType: opts.mediaType,
    season: Math.max(1, season),
    episode: Math.max(1, episode),
  });

  const src = data?.stream?.sources?.[0];
  if (!src?.url) {
    return { ok: false, langs: [] };
  }

  const parsed = src.master
    ? parseVidboltMasterManifest(src.master, src.url)
    : { audioLangs: ['EN' as const], audioSummary: [], subtitles: [] };
  const probe = { ok: true, langs: parsed.audioLangs };
  vidboltFastProbeCache.set(cacheKey, probe);
  return probe;
}
