import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  fetchTextWithCurlFallback,
  normalizeTitleForMatch,
  type TrackRecord,
} from './httpHelpers.ts';

const dailymotionTrackCache = new LruTtlCache<string, TrackRecord[]>(150, 20 * 60 * 1000);

// Seeded Dailymotion video IDs (always live-checked via player metadata before returning)
const KNOWN_LQSA_DM_MAP: Record<string, string[]> = {
  '17x1': ['xbx77vu', 'xbxpqdm', 'xbxo7xe'],
  '17x2': ['xbx81xu'],
  '17x3': ['xby1p9i'],
  '16x7': ['xb6oa0e', 'xba9oaq', 'xb79s2q', 'xat0rdy', 'xbazmhi', 'xbfdp3q'],
  '12x6': ['xbnqr0e'],
  '10x3': ['x99tl0q'],
  '4x7': ['xbjnx1y', 'xbmi5v2', 'xblz142', 'xbxjqlu'],
  '3x7': ['xazn0ci', 'xbqrc3a'],
  '3x3': ['x98htky'],
  '1x11': ['x97sn2u'],
};

// Cumulative episode counts before each season of La que se avecina (for global ep numbers 1..210)
const LQSA_SEASON_EP_COUNTS = [13, 15, 14, 12, 13, 13, 13, 16, 19, 13, 13, 16, 8, 8, 8, 8, 8];

export function lqsaGlobalEpisodeToSeasonEp(globalEp: number): { season: number; episode: number } | null {
  if (!Number.isFinite(globalEp) || globalEp < 1) return null;
  let remaining = Math.floor(globalEp);
  for (let idx = 0; idx < LQSA_SEASON_EP_COUNTS.length; idx++) {
    const count = LQSA_SEASON_EP_COUNTS[idx];
    if (remaining <= count) {
      return { season: idx + 1, episode: remaining };
    }
    remaining -= count;
  }
  return null;
}

export function lqsaSeasonEpToGlobal(season: number, episode: number): number | null {
  if (season < 1 || season > LQSA_SEASON_EP_COUNTS.length || episode < 1) return null;
  if (episode > LQSA_SEASON_EP_COUNTS[season - 1]) return null;
  let offset = 0;
  for (let i = 0; i < season - 1; i++) offset += LQSA_SEASON_EP_COUNTS[i];
  return offset + episode;
}

export function parseSeasonEpisodeFromTitle(
  rawTitle: string,
  opts?: { isLqsa?: boolean }
): { season?: number; episode?: number } {
  const title = String(rawTitle || '').replace(/｜/g, '|');

  // Guard against mislabeled re-uploads like "La que se avecina 10x1 (Temporada 1)"
  const parenTempMatch = title.match(/\(\s*temporada\s*0*(\d{1,2})\s*\)/i);
  const parenSeason = parenTempMatch ? parseInt(parenTempMatch[1], 10) : null;

  const pairPatterns = [
    /\b[TS]\s*0*(\d{1,2})\s*[-_.\s]*[EC]\s*0*(\d{1,3})\b/i,
    /\b0*(\d{1,2})\s*[xX×]\s*0*(\d{1,3})\b/,
    /temporada\s*0*(\d{1,2})[^a-z0-9]{0,20}(?:cap[ií]tulo|cap\.?|episodio|ep\.?)\s*0*(\d{1,3})\b/i,
    /season\s*0*(\d{1,2})[^a-z0-9]{0,20}(?:episode|ep\.?)\s*0*(\d{1,3})\b/i,
    /(?:la\s+que\s+se\s+avecina|lqsa)\s*0*(\d{1,2})\s*[-–—|:\s]+(?:cap[ií]tulo|cap\.?|episodio|ep\.?)\s*0*(\d{1,3})\b/i,
  ];
  for (const re of pairPatterns) {
    const m = title.match(re);
    if (m) {
      const parsedSeason = parseInt(m[1], 10);
      const parsedEpisode = parseInt(m[2], 10);
      if (parenSeason && parenSeason !== parsedSeason) {
        return { season: parenSeason, episode: parsedSeason };
      }
      return { season: parsedSeason, episode: parsedEpisode };
    }
  }

  const rev = title.match(
    /(?:cap[ií]tulo|cap\.?|episodio|ep\.?)\s*0*(\d{1,3})\s*(?:de\s+)?(?:temporada\s*0*(\d{1,2})|(?:[|｜\-–—:\s]+)?(?:la\s+que\s+se\s+avecina|lqsa)\s*0*(\d{1,2}))\b/i
  );
  if (rev) {
    const sNum = parseInt(rev[2] || rev[3] || '0', 10);
    const eNum = parseInt(rev[1], 10);
    if (sNum > 0 && eNum > 0) {
      return { season: sNum, episode: eNum };
    }
  }

  // Handle global episode number like "La Que Se Avecina - Capitulo 203" (only > 25 so it never collides with 1..20)
  if (opts?.isLqsa) {
    const globalMatch = title.match(
      /(?:la\s+que\s+se\s+avecina|lqsa)[^0-9a-z]{1,15}(?:cap[ií]tulo|cap\.?|episodio|ep\.?)\s*0*(\d{2,3})\b/i
    );
    if (globalMatch) {
      const gNum = parseInt(globalMatch[1], 10);
      if (gNum >= 25) {
        const mapped = lqsaGlobalEpisodeToSeasonEp(gNum);
        if (mapped) return mapped;
      }
    }
  }

  return {};
}

function titleMatchesHint(videoTitle: string, hints: string[]): boolean {
  const normVid = normalizeTitleForMatch(videoTitle);
  if (!normVid) return false;
  for (const h of hints) {
    const normHint = normalizeTitleForMatch(h);
    if (!normHint || normHint.length < 3) continue;
    const words = normHint.split(' ').filter((w) => w.length >= 3);
    if (normVid.includes(normHint)) return true;
    if (words.length >= 2 && words.every((w) => normVid.includes(w))) return true;
  }
  return false;
}

function matchesEpisodeTitleHint(videoTitle: string, episodeTitleHint?: string): boolean {
  if (!episodeTitleHint) return false;
  const cleanEp = normalizeTitleForMatch(episodeTitleHint);
  if (!cleanEp || /^(episodio|episode|capitulo|cap)\s*\d+$/.test(cleanEp)) return false;
  const normVid = normalizeTitleForMatch(videoTitle);
  const meaningfulWords = cleanEp.split(/\s+/).filter((w) => w.length >= 4);
  if (meaningfulWords.length < 2) return false;
  const hits = meaningfulWords.filter((w) => normVid.includes(w));
  return hits.length >= Math.min(3, meaningfulWords.length);
}

async function resolveDailymotionVideoToM3u8(videoId: string): Promise<string | null> {
  const url = `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(videoId)}`;
  const headers = {
    'User-Agent': CHROME_UA,
    Referer: 'https://www.dailymotion.com/',
    'Accept-Language': 'es-ES,es;q=0.9',
  };
  const extractFromMeta = (meta: any): string | null => {
    if (!meta || meta?.error) return null;
    const m3uUrl =
      meta?.qualities?.auto?.[0]?.url ||
      meta?.qualities?.['1080']?.[0]?.url ||
      meta?.qualities?.['720']?.[0]?.url ||
      '';
    return typeof m3uUrl === 'string' && m3uUrl.includes('.m3u8') ? m3uUrl : null;
  };
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(4200),
    });
    if (res.ok) {
      const meta: any = await res.json();
      const found = extractFromMeta(meta);
      if (found) return found;
    }
  } catch {
    // fallback to curl below
  }
  try {
    const raw = await fetchTextWithCurlFallback(url, headers, 3800);
    if (raw) {
      return extractFromMeta(JSON.parse(raw));
    }
  } catch {
    // ignore
  }
  return null;
}

export async function extractDailymotionSeriesTracks(opts: {
  tmdbId?: string | number | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints: string[];
  episodeTitleHint?: string;
}): Promise<TrackRecord[]> {
  const { tmdbId, mediaType, season = 1, episode = 1, titleHints, episodeTitleHint } = opts;
  if (mediaType !== 'tv' || !titleHints || titleHints.length === 0) return [];

  const rawMainTitle = String(titleHints[0] || '').trim();
  const mainTitle =
    rawMainTitle.replace(/\s*·\s*\d+\s*[xX×]\s*\d+.*$/i, '').trim() || rawMainTitle;
  if (!mainTitle) return [];

  const cacheKey = `${String(tmdbId || mainTitle)}:${season}x${episode}`;
  const cached = dailymotionTrackCache.get(cacheKey);
  if (cached) return cached;

  const isLqsa =
    String(tmdbId || '') === '35338' ||
    titleHints.some((h) => normalizeTitleForMatch(h).includes('la que se avecina'));

  const epPad = String(episode).padStart(2, '0');
  const seededIds: string[] = isLqsa
    ? [...(KNOWN_LQSA_DM_MAP[`${season}x${episode}`] || [])]
    : [];

  // Resolve seeded IDs immediately at t=0 so slow Dailymotion searches never cause a timeout
  const seededPromise = Promise.all(
    seededIds.map(async (vid) => ({
      vid,
      m3uUrl: await resolveDailymotionVideoToM3u8(vid),
    }))
  );

  const globalEp = isLqsa ? lqsaSeasonEpToGlobal(season, episode) : null;
  const queries = [
    `${mainTitle} T${season} E${episode}`,
    `${mainTitle} ${season}x${epPad}`,
    `${mainTitle} ${season} capitulo ${episode}`,
    `${mainTitle} temporada ${season} capitulo ${episode}`,
    ...(isLqsa
      ? [
          `LQSA ${season} Capitulo ${episode}`,
          `${mainTitle} T${season} C${episode}`,
          ...(globalEp ? [`${mainTitle} Capitulo ${globalEp}`] : []),
        ]
      : []),
  ];

  const searchRequests: Promise<any>[] = [];
  for (const q of queries) {
    searchRequests.push(
      fetch(
        `https://api.dailymotion.com/videos?search=${encodeURIComponent(
          q
        )}&fields=id,title,duration&longer_than=18&limit=30`,
        {
          headers: { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' },
          signal: AbortSignal.timeout(3500),
        }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  searchRequests.push(
    fetch(
      `https://api.dailymotion.com/videos?search=${encodeURIComponent(
        `${mainTitle} ${season} ${episode}`
      )}&fields=id,title,duration&longer_than=18&sort=recent&limit=30`,
      {
        headers: { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' },
        signal: AbortSignal.timeout(3500),
      }
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  );

  if (isLqsa && season >= 17) {
    searchRequests.push(
      fetch('https://api.dailymotion.com/user/x3qhrza/videos?fields=id,title,duration&limit=20', {
        headers: { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' },
        signal: AbortSignal.timeout(3500),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }

  const seededPairs = await seededPromise;
  const hasSeededLive = seededPairs.some((p) => Boolean(p.m3uUrl));
  const searchWaitMs = hasSeededLive ? 1400 : 3800;

  const searchResults = await Promise.race([
    Promise.all(searchRequests),
    new Promise<any[]>((resolve) => setTimeout(() => resolve([]), searchWaitMs)),
  ]);

  const extraIds: string[] = [];
  const seededSet = new Set(seededIds);
  const lqsaHints = isLqsa ? [...titleHints, 'LQSA'] : titleHints;
  for (const data of searchResults) {
    const list: any[] = Array.isArray(data?.list) ? data.list : [];
    for (const item of list) {
      const id = String(item?.id || '').trim();
      const vTitle = String(item?.title || '');
      const duration = Number(item?.duration || 0);
      if (!id || duration < 900 || duration > 7200) continue;
      if (
        /\b(trailer|avance|promo|teaser|resumen|cabecera|tomas falsas|mejores momentos|portugal)\b/i.test(
          vTitle
        )
      ) {
        continue;
      }
      if (!titleMatchesHint(vTitle, lqsaHints)) continue;

      const parsed = parseSeasonEpisodeFromTitle(vTitle, { isLqsa });
      const exactPair = parsed.season === season && parsed.episode === episode;
      const epTitleOk =
        !parsed.season && matchesEpisodeTitleHint(vTitle, episodeTitleHint);
      if (!exactPair && !epTitleOk) continue;
      if (!seededSet.has(id) && !extraIds.includes(id)) extraIds.push(id);
    }
  }

  const remainingCap = Math.max(0, 18 - seededPairs.length);
  const extraPairs =
    remainingCap > 0 && extraIds.length > 0
      ? await Promise.all(
          extraIds.slice(0, remainingCap).map(async (vid) => ({
            vid,
            m3uUrl: await resolveDailymotionVideoToM3u8(vid),
          }))
        )
      : [];

  const tracks: TrackRecord[] = [];
  for (const { vid, m3uUrl } of [...seededPairs, ...extraPairs]) {
    if (!m3uUrl) continue;
    tracks.push({
      id: `dm-${vid}`,
      label: `Dailymotion HD · T${season}x${epPad} (Español)`,
      lang: 'ES',
      quality: '1080p',
      sourceUrl: `https://www.dailymotion.com/video/${vid}`,
      referer: 'https://www.dailymotion.com/',
      resolverType: 'direct_hls',
      resolvedStreamUrl: buildHlsProxyUrl(m3uUrl, 'https://www.dailymotion.com/'),
    });
  }

  if (tracks.length > 0) {
    dailymotionTrackCache.set(cacheKey, tracks);
  }
  return tracks;
}
