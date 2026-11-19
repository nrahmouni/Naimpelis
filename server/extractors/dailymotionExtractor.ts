import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  normalizeTitleForMatch,
  type TrackRecord,
} from './httpHelpers.ts';

const dailymotionTrackCache = new LruTtlCache<string, TrackRecord[]>(150, 20 * 60 * 1000);

// Seeded Dailymotion video IDs verified against live player metadata for La que se avecina T17
const KNOWN_LQSA_T17_MAP: Record<string, string> = {
  '17x1': 'xbx77vu',
  '17x2': 'xbx81xu',
  '17x3': 'xby1p9i',
};

function parseSeasonEpisodeFromTitle(rawTitle: string): { season?: number; episode?: number } {
  const title = String(rawTitle || '');
  const pairPatterns = [
    /\b[TS]\s*0*(\d{1,2})\s*[_\-.\s]*E\s*0*(\d{1,3})\b/i,
    /\b0*(\d{1,2})\s*[xX×]\s*0*(\d{1,3})\b/,
    /temporada\s*0*(\d{1,2})[^a-z0-9]{0,20}(?:cap[ií]tulo|cap\.?|episodio|ep\.?)\s*0*(\d{1,3})\b/i,
    /season\s*0*(\d{1,2})[^a-z0-9]{0,20}(?:episode|ep\.?)\s*0*(\d{1,3})\b/i,
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

async function resolveDailymotionVideoToM3u8(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(videoId)}`, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://www.dailymotion.com/',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(4200),
    });
    if (!res.ok) return null;
    const meta: any = await res.json();
    if (meta?.error) return null;
    const m3uUrl =
      meta?.qualities?.auto?.[0]?.url ||
      meta?.qualities?.['1080']?.[0]?.url ||
      meta?.qualities?.['720']?.[0]?.url ||
      '';
    return typeof m3uUrl === 'string' && m3uUrl.includes('.m3u8') ? m3uUrl : null;
  } catch {
    return null;
  }
}

export async function extractDailymotionSeriesTracks(opts: {
  tmdbId?: string | number | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints: string[];
}): Promise<TrackRecord[]> {
  const { tmdbId, mediaType, season = 1, episode = 1, titleHints } = opts;
  if (mediaType !== 'tv' || !titleHints || titleHints.length === 0) return [];

  const mainTitle = String(titleHints[0] || '').trim();
  if (!mainTitle) return [];

  const cacheKey = `${String(tmdbId || mainTitle)}:${season}x${episode}`;
  const cached = dailymotionTrackCache.get(cacheKey);
  if (cached) return cached;

  const isLqsa =
    String(tmdbId || '') === '35338' ||
    titleHints.some((h) => normalizeTitleForMatch(h).includes('la que se avecina'));

  const epPad = String(episode).padStart(2, '0');
  const candidateIds: string[] = [];

  if (isLqsa) {
    const seededId = KNOWN_LQSA_T17_MAP[`${season}x${episode}`];
    if (seededId) candidateIds.push(seededId);
  }

  const queries = [
    `${mainTitle} T${season} E${episode}`,
    `${mainTitle} ${season}x${epPad}`,
    `${mainTitle} temporada ${season} capitulo ${episode}`,
    ...(isLqsa ? [`LQSA ${season}x${epPad}`, `La que se avecina T${season}_E${episode}`] : []),
  ];

  const searchRequests: Promise<any>[] = queries.map((q) =>
    fetch(
      `https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&fields=id,title,duration&limit=20`,
      {
        headers: { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' },
        signal: AbortSignal.timeout(4000),
      }
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  );

  if (isLqsa && season >= 17) {
    searchRequests.push(
      fetch(
        'https://api.dailymotion.com/user/x3qhrza/videos?fields=id,title,duration&limit=20',
        {
          headers: { 'User-Agent': CHROME_UA, 'Accept-Language': 'es-ES,es;q=0.9' },
          signal: AbortSignal.timeout(4000),
        }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }

  const searchResults = await Promise.all(searchRequests);

  const lqsaHints = isLqsa ? [...titleHints, 'LQSA'] : titleHints;
  for (const data of searchResults) {
    const list: any[] = Array.isArray(data?.list) ? data.list : [];
    for (const item of list) {
      const id = String(item?.id || '').trim();
      const vTitle = String(item?.title || '');
      const duration = Number(item?.duration || 0);
      if (!id || duration < 900 || duration > 7200) continue;
      if (/\b(trailer|avance|promo|teaser|resumen|cabecera|tomas falsas)\b/i.test(vTitle)) continue;
      if (!titleMatchesHint(vTitle, lqsaHints)) continue;

      const parsed = parseSeasonEpisodeFromTitle(vTitle);
      if (parsed.season !== season || parsed.episode !== episode) continue;
      if (!candidateIds.includes(id)) candidateIds.push(id);
    }
  }

  const resolvedPairs = await Promise.all(
    candidateIds.slice(0, 6).map(async (vid) => ({
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
