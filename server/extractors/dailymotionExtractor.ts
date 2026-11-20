import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  curlGetText,
  normalizeTitleForMatch,
  type TrackRecord,
} from './httpHelpers.ts';

const dailymotionTrackCache = new LruTtlCache<string, TrackRecord[]>(150, 20 * 60 * 1000);

// Seeded Dailymotion video IDs verified against live player metadata for La que se avecina
const KNOWN_LQSA_SEED_MAP: Record<string, string> = {
  '17x1': 'xbxpqdm',
  '16x7': 'xb6oa0e',
  '11x1': 'x8grox1',
  '1x1': 'x9m4pzc',
};

const LQSA_SEASON_EPISODE_COUNTS: Record<number, number> = {
  1: 13,
  2: 15,
  3: 14,
  4: 12,
  5: 13,
  6: 13,
  7: 13,
  8: 16,
  9: 19,
  10: 13,
  11: 13,
  12: 16,
  13: 8,
  14: 8,
  15: 8,
  16: 8,
  17: 8,
};

export function lqsaSeasonEpToGlobal(season: number, episode: number): number | null {
  if (!season || season < 1 || !episode || episode < 1) return null;
  let offset = 0;
  for (let s = 1; s < season; s++) {
    const count = LQSA_SEASON_EPISODE_COUNTS[s];
    if (!count) return null;
    offset += count;
  }
  return offset + episode;
}

export function lqsaGlobalEpisodeToSeasonEp(
  globalEp: number
): { season: number; episode: number } | null {
  if (!globalEp || globalEp < 1) return null;
  let remaining = globalEp;
  for (let s = 1; s <= 17; s++) {
    const count = LQSA_SEASON_EPISODE_COUNTS[s];
    if (!count) break;
    if (remaining <= count) {
      return { season: s, episode: remaining };
    }
    remaining -= count;
  }
  return null;
}

export function parseSeasonEpisodeFromTitle(
  rawTitle: string,
  opts?: { isLqsa?: boolean }
): { season?: number; episode?: number } {
  const title = String(rawTitle || '');

  // Detect uploader quirk like "La que se avecina 10x1 (Temporada 1)" -> actually S01E10
  const parenTempMatch = title.match(/\(\s*(?:temporada|temp\.?)\s*0*(\d{1,2})\s*\)/i);
  const slashTempEpMatch = title.match(/\b0*(\d{1,2})\s*[xX×]\s*0*(\d{1,3})\b/);
  if (parenTempMatch && slashTempEpMatch) {
    const parenSeason = parseInt(parenTempMatch[1], 10);
    const left = parseInt(slashTempEpMatch[1], 10);
    const right = parseInt(slashTempEpMatch[2], 10);
    if (right === 1 && parenSeason > 0 && parenSeason !== left && left >= 1 && left <= 25) {
      return { season: parenSeason, episode: left };
    }
  }

  const pairPatterns = [
    /\b[TS]\s*0*(\d{1,2})\s*[_\-.\s]*(?:E|C)\s*0*(\d{1,3})\b/i,
    /\b0*(\d{1,2})\s*[xX×]\s*0*(\d{1,3})\b/,
    /temporada\s*0*(\d{1,2})[^a-z0-9]{0,20}(?:cap[ií]tulo|cap\.?|episodio|ep\.?|c)\s*0*(\d{1,3})\b/i,
    /season\s*0*(\d{1,2})[^a-z0-9]{0,20}(?:episode|ep\.?)\s*0*(\d{1,3})\b/i,
    /\b(?:lqsa|avecina)\s+0*(\d{1,2})\s*[-–—\s]+\s*(?:cap[ií]tulo|cap\.?|episodio|ep\.?|c)\s*0*(\d{1,3})\b/i,
  ];
  for (const re of pairPatterns) {
    const m = title.match(re);
    if (m) {
      return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
    }
  }

  const rev = title.match(
    /(?:cap[ií]tulo|episodio)\s*0*(\d{1,3})[^a-z0-9]{0,20}temporada\s*0*(\d{1,2})\b/i
  );
  if (rev) {
    return { season: parseInt(rev[2], 10), episode: parseInt(rev[1], 10) };
  }

  // Reversed format with separator like "Capitulo 7 ｜ La Que Se Avecina 16"
  const revLqsa = title.match(
    /(?:cap[ií]tulo|cap\.?|episodio|ep\.?)\s*0*(\d{1,3})[^a-z0-9]+(?:la\s+que\s+se\s+avecina|lqsa)\s*0*(\d{1,2})\b/i
  );
  if (revLqsa) {
    return { season: parseInt(revLqsa[2], 10), episode: parseInt(revLqsa[1], 10) };
  }

  // Global episode fallback for LQSA uploads like "La Que Se Avecina - Capitulo 203"
  if (opts?.isLqsa) {
    const globalMatch = title.match(
      /(?:cap[ií]tulo|cap\.?|episodio|ep\.?)\s*0*(\d{1,3})\b/i
    );
    if (globalMatch) {
      const globalEp = parseInt(globalMatch[1], 10);
      if (globalEp > 20) {
        const mapped = lqsaGlobalEpisodeToSeasonEp(globalEp);
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

async function dmCurlJson<T>(url: string, headers: Record<string, string>, maxSec = 4): Promise<T | null> {
  try {
    const res = await curlGetText(url, headers, maxSec, true, true);
    if (!res.text) return null;
    return JSON.parse(res.text) as T;
  } catch {
    return null;
  }
}

export async function resolveDailymotionVideoToM3u8(videoId: string): Promise<string | null> {
  const url = `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(videoId)}`;
  const headers = {
    'User-Agent': CHROME_UA,
    Referer: 'https://www.dailymotion.com/',
    'Accept-Language': 'es-ES,es;q=0.9',
  };
  let meta: any = await dmCurlJson(url, headers, 2);
  if (!meta) {
    try {
      const h2 = await curlGetText(url, headers, 3, false, false);
      if (h2.text) meta = JSON.parse(h2.text);
    } catch {
      meta = null;
    }
  }
  if (!meta || meta?.error) return null;
  const m3uUrl =
    meta?.qualities?.auto?.[0]?.url ||
    meta?.qualities?.['1080']?.[0]?.url ||
    meta?.qualities?.['720']?.[0]?.url ||
    '';
  return typeof m3uUrl === 'string' && m3uUrl.includes('.m3u8') ? m3uUrl : null;
}

export async function extractDailymotionSeriesTracks(opts: {
  tmdbId?: string | number | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints: string[];
  episodeTitleHint?: string;
}): Promise<TrackRecord[]> {
  const { tmdbId, mediaType, season = 1, episode = 1, titleHints, episodeTitleHint = '' } = opts;
  if (mediaType !== 'tv' || !titleHints || titleHints.length === 0) return [];

  const mainTitle = String(titleHints[0] || '').trim();
  if (!mainTitle) return [];

  const isLqsa =
    String(tmdbId || '') === '35338' ||
    titleHints.some((h) => normalizeTitleForMatch(h).includes('la que se avecina'));

  const searchBaseTitle = isLqsa ? 'La que se avecina' : mainTitle;
  const cacheKey = `${String(tmdbId || searchBaseTitle)}:${season}x${episode}`;
  const cached = dailymotionTrackCache.get(cacheKey);
  if (cached) return cached;

  const epPad = String(episode).padStart(2, '0');
  const seededId = isLqsa ? KNOWN_LQSA_SEED_MAP[`${season}x${episode}`] : undefined;

  // Fast-path: resolve seeded ID immediately via IPv4 curl (~220ms) instead of blocking on 6+ API searches!
  if (seededId) {
    const directM3u = await resolveDailymotionVideoToM3u8(seededId);
    if (directM3u) {
      const fastTracks: TrackRecord[] = [
        {
          id: `dm-${seededId}`,
          label: `Dailymotion HD · T${season}x${epPad} (Español)`,
          lang: 'ES',
          quality: '1080p',
          sourceUrl: `https://www.dailymotion.com/video/${seededId}`,
          referer: 'https://www.dailymotion.com/',
          resolverType: 'direct_hls',
          resolvedStreamUrl: buildHlsProxyUrl(directM3u, 'https://www.dailymotion.com/'),
        },
      ];
      dailymotionTrackCache.set(cacheKey, fastTracks);
      return fastTracks;
    }
  }

  const candidateIds: string[] = [];
  const globalEp = isLqsa ? lqsaSeasonEpToGlobal(season, episode) : null;
  const queries = [
    `${searchBaseTitle} T${season} E${episode}`,
    `${searchBaseTitle} ${season}x${epPad}`,
    `${searchBaseTitle} temporada ${season} capitulo ${episode}`,
    ...(isLqsa
      ? [
          `LQSA ${season} Capitulo ${episode}`,
          `La que se avecina ${season} Capitulo ${episode}`,
          ...(globalEp ? [`La que se avecina capitulo ${globalEp}`] : []),
        ]
      : []),
  ];

  const cleanEpHint = String(episodeTitleHint || '').trim();
  const isGenericEp =
    !cleanEpHint || /^(episodio|episode|cap[ií]tulo|cap\.?|ep\.?)\s*\d+$/i.test(cleanEpHint);
  const firstClause = !isGenericEp ? cleanEpHint.split(',')[0].trim() : '';
  if (isLqsa && firstClause.length >= 6) {
    queries.push(`La que se avecina ${firstClause}`);
  }

  const dmHeaders = { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' };
  const searchRequests: Promise<any>[] = queries.slice(0, 7).map((q) =>
    dmCurlJson(
      `https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&fields=id,title,duration&limit=50`,
      dmHeaders,
      3
    )
  );

  // Also check most recent LQSA uploads so newly re-uploaded mirrors after DMCA purges appear immediately
  if (isLqsa) {
    searchRequests.push(
      dmCurlJson(
        `https://api.dailymotion.com/videos?search=${encodeURIComponent(
          `La que se avecina ${season}`
        )}&fields=id,title,duration&limit=50&sort=recent`,
        dmHeaders,
        3
      )
    );
  }

  const searchResults = await Promise.all(searchRequests);

  const lqsaHints = isLqsa ? [...titleHints, 'La que se avecina', 'LQSA'] : titleHints;
  const normFirstClause = firstClause.length >= 6 ? normalizeTitleForMatch(firstClause) : '';
  for (const data of searchResults) {
    const list: any[] = Array.isArray(data?.list) ? data.list : [];
    for (const item of list) {
      const id = String(item?.id || '').trim();
      const vTitle = String(item?.title || '');
      const duration = Number(item?.duration || 0);
      if (!id || duration < 900 || duration > 7200) continue;
      if (/\b(trailer|avance|promo|teaser|resumen|cabecera|tomas falsas|reacci[oó]n)\b/i.test(vTitle)) {
        continue;
      }

      const parsed = parseSeasonEpisodeFromTitle(vTitle, { isLqsa });
      const normV = normalizeTitleForMatch(vTitle);
      const matchesSeasonEp = parsed.season === season && parsed.episode === episode;
      const matchesEpClause = Boolean(
        normFirstClause &&
          normFirstClause.length >= 8 &&
          normV.includes(normFirstClause) &&
          (!parsed.season || parsed.season === season)
      );

      if (!matchesSeasonEp && !matchesEpClause) continue;
      if (!titleMatchesHint(vTitle, lqsaHints) && !matchesEpClause) continue;
      if (!candidateIds.includes(id)) candidateIds.push(id);
    }
  }

  // Probe up to 36 unique IDs in parallel so alive re-uploads lower in search results are still reached
  const resolvedPairs = await Promise.all(
    candidateIds.slice(0, 36).map(async (vid) => ({
      vid,
      m3uUrl: await resolveDailymotionVideoToM3u8(vid),
    }))
  );

  const tracks: TrackRecord[] = [];
  for (const { vid, m3uUrl } of resolvedPairs) {
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
