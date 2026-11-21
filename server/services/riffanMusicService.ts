import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import {
  fetchItunesAlbumById,
  fetchSpotifyChartsAndAlbums,
  fetchSpotifyPlaylistTracks,
  fetchYouTubeMusicAlbum,
  fetchYouTubeMusicExploreAndCharts,
  mapItunesAlbumRef,
  mapItunesSongToTrack,
  searchItunesMusic,
  searchYouTubeMusic,
} from './musicPlatformSync.ts';

export interface MusicArtistRef {
  id: string;
  name: string;
  picture?: string;
  nbFan?: number;
  nbAlbum?: number;
}

export interface MusicAlbumRef {
  id: string;
  title: string;
  cover: string;
  coverXl?: string;
  artist?: MusicArtistRef;
  releaseDate?: string;
  nbTracks?: number;
  label?: string;
  genres?: string[];
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: MusicArtistRef;
  album: {
    id: string;
    title: string;
    cover: string;
    coverXl?: string;
  };
  durationSec: number;
  explicit?: boolean;
  previewUrl?: string;
  isrc?: string;
  rank?: number;
  source?: 'deezer' | 'audius' | 'soundcloud' | 'youtube_music' | 'spotify' | 'radio';
  audiusId?: string;
  soundcloudId?: string;
  youtubeVideoId?: string;
  spotifyId?: string;
  streamUrl?: string;
}

export interface MusicPlaylist {
  id: string;
  title: string;
  description?: string;
  cover: string;
  nbTracks?: number;
  creator?: string;
  tracks?: MusicTrack[];
}

export interface MusicGenre {
  id: string;
  name: string;
  picture: string;
  color: string;
}

export interface MusicRadioStation {
  id: string;
  name: string;
  country: string;
  tags: string[];
  favicon: string;
  streamUrl: string;
  bitrate?: number;
  codec?: string;
  votes?: number;
}

export interface LyricsLine {
  timeSec: number;
  text: string;
}

export interface LyricsPayload {
  found: boolean;
  trackName?: string;
  artistName?: string;
  synced: boolean;
  lines: LyricsLine[];
  plainLyrics?: string;
}

export interface ResolvedTrackPlayback {
  sourceType: 'audio-hls' | 'audio-mp3' | 'youtube' | 'preview';
  sourceLabel: string;
  streamUrl?: string;
  proxiedUrl?: string;
  youtubeVideoId?: string;
  youtubeMvId?: string;
  previewUrl?: string;
  fullLength: boolean;
  spatial8dYtFallback?: boolean;
}

const homeCache = new LruTtlCache<string, Record<string, unknown>>(8, 12 * 60 * 1000);
const searchCache = new LruTtlCache<string, Record<string, unknown>>(120, 8 * 60 * 1000);
const entityCache = new LruTtlCache<string, Record<string, unknown>>(160, 15 * 60 * 1000);
const lyricsCache = new LruTtlCache<string, LyricsPayload>(250, 60 * 60 * 1000);
const playbackCache = new LruTtlCache<string, ResolvedTrackPlayback>(300, 12 * 60 * 1000);
const radioCache = new LruTtlCache<string, MusicRadioStation[]>(12, 20 * 60 * 1000);

let scClientIdCache: { id: string; expiresAt: number } | null = null;

const GENRE_COLOR_MAP: Record<string, string> = {
  Pop: '#E11D48',
  'Rap/Hip Hop': '#D97706',
  Rock: '#B91C1C',
  Dance: '#2563EB',
  'R&B': '#BE185D',
  Alternative: '#4F46E5',
  Electro: '#0F766E',
  Latin: '#EA580C',
  Reggaeton: '#9333EA',
  Flamenco: '#9F1239',
  Jazz: '#1E3A8A',
  Classical: '#78350F',
  Soul: '#86198F',
  Metal: '#3F3F46',
  Folk: '#0369A1',
  'Films/Games': '#4338CA',
  Blues: '#1D4ED8',
  Reggae: '#15803D',
  Country: '#B45309',
  Kids: '#0D9488',
};

const GENRE_COLORS_FALLBACK = [
  '#E11D48',
  '#EA580C',
  '#2563EB',
  '#D97706',
  '#9333EA',
  '#B91C1C',
  '#0F766E',
  '#1E3A8A',
  '#BE185D',
  '#4F46E5',
];

async function fetchJsonSafe<T>(url: string, timeoutMs = 6500, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RiffanMusic/1.0 (+https://riffantv.ai.studio)',
        Accept: 'application/json',
        ...headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function mapDeezerArtist(raw: any): MusicArtistRef {
  return {
    id: String(raw?.id || ''),
    name: String(raw?.name || 'Artista'),
    picture: raw?.picture_xl || raw?.picture_big || raw?.picture_medium || raw?.picture || '',
    nbFan: typeof raw?.nb_fan === 'number' ? raw.nb_fan : undefined,
    nbAlbum: typeof raw?.nb_album === 'number' ? raw.nb_album : undefined,
  };
}

function mapDeezerAlbum(raw: any): MusicAlbumRef {
  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || 'Álbum'),
    cover: raw?.cover_big || raw?.cover_medium || raw?.cover || '',
    coverXl: raw?.cover_xl || raw?.cover_big || raw?.cover_medium || '',
    artist: raw?.artist ? mapDeezerArtist(raw.artist) : undefined,
    releaseDate: raw?.release_date ? String(raw.release_date) : undefined,
    nbTracks: typeof raw?.nb_tracks === 'number' ? raw.nb_tracks : undefined,
    label: raw?.label ? String(raw.label) : undefined,
    genres: Array.isArray(raw?.genres?.data)
      ? raw.genres.data.map((g: any) => String(g?.name || '')).filter(Boolean)
      : undefined,
  };
}

function mapDeezerTrack(raw: any, fallbackAlbum?: MusicAlbumRef): MusicTrack {
  const alb = raw?.album || fallbackAlbum || {};
  return {
    id: `dz-${raw?.id}`,
    title: String(raw?.title_short || raw?.title || 'Canción'),
    artist: raw?.artist ? mapDeezerArtist(raw.artist) : { id: '0', name: 'Artista' },
    album: {
      id: String(alb?.id || ''),
      title: String(alb?.title || ''),
      cover: String(alb?.cover_medium || alb?.cover_big || alb?.cover || fallbackAlbum?.cover || ''),
      coverXl: String(alb?.cover_xl || alb?.cover_big || alb?.cover || fallbackAlbum?.coverXl || ''),
    },
    durationSec: Number(raw?.duration || 0),
    explicit: Boolean(raw?.explicit_lyrics),
    previewUrl: raw?.preview ? String(raw.preview) : undefined,
    isrc: raw?.isrc ? String(raw.isrc) : undefined,
    rank: typeof raw?.rank === 'number' ? raw.rank : undefined,
    source: 'deezer',
  };
}

function mapDeezerPlaylist(raw: any): MusicPlaylist {
  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || 'Playlist'),
    description: raw?.description ? String(raw.description) : undefined,
    cover: String(raw?.picture_xl || raw?.picture_big || raw?.picture_medium || raw?.picture || ''),
    nbTracks: typeof raw?.nb_tracks === 'number' ? raw.nb_tracks : undefined,
    creator: raw?.user?.name ? String(raw.user.name) : raw?.creator?.name ? String(raw.creator.name) : 'Riffan Music',
  };
}

function mapAudiusTrack(t: any): MusicTrack {
  return {
    id: `au-${t.id}`,
    title: String(t.title || 'Track'),
    artist: {
      id: `au-art-${t.user?.id || '0'}`,
      name: String(t.user?.name || 'Audius Artist'),
      picture: String(t.user?.profile_picture?.['480x480'] || t.user?.profile_picture?.['150x150'] || ''),
    },
    album: {
      id: `au-alb-${t.id}`,
      title: String(t.genre || 'Audius Hi-Fi'),
      cover: String(t.artwork?.['480x480'] || t.artwork?.['150x150'] || ''),
      coverXl: String(t.artwork?.['1000x1000'] || t.artwork?.['480x480'] || ''),
    },
    durationSec: Number(t.duration || 0),
    source: 'audius' as const,
    audiusId: String(t.id),
  };
}

function interleaveUniqueTracks(lists: MusicTrack[][], maxTotal = 32): MusicTrack[] {
  const seen = new Set<string>();
  const out: MusicTrack[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen && out.length < maxTotal; i++) {
    for (const list of lists) {
      const t = list[i];
      if (!t || !t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= maxTotal) break;
    }
  }
  return out;
}

function mapDeezerTracksSafe(rawList: any): MusicTrack[] {
  return Array.isArray(rawList) ? rawList.map((t: any) => mapDeezerTrack(t)) : [];
}

let scWarmPromise: Promise<string> | null = null;

async function getSoundCloudClientId(allowScrape = true): Promise<string> {
  if (scClientIdCache && scClientIdCache.expiresAt > Date.now()) {
    return scClientIdCache.id;
  }
  if (!allowScrape) {
    if (!scWarmPromise) {
      scWarmPromise = getSoundCloudClientId(true).finally(() => {
        scWarmPromise = null;
      });
    }
    return '';
  }
  if (scWarmPromise) {
    return scWarmPromise;
  }
  scWarmPromise = (async () => {
    try {
      const res = await fetch('https://soundcloud.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return '';
      const html = await res.text();
      const scripts = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g)].map((m) => m[0]);
      const recentScripts = scripts.slice(-4).reverse();
      const jsTexts = await Promise.all(
        recentScripts.map((sUrl) =>
          fetch(sUrl, { signal: AbortSignal.timeout(3000) })
            .then((r) => (r.ok ? r.text() : ''))
            .catch(() => '')
        )
      );
      for (const js of jsTexts) {
        const match = js.match(/client_id\s*:\s*"([a-zA-Z0-9]{20,42})"/);
        if (match?.[1]) {
          scClientIdCache = {
            id: match[1],
            expiresAt: Date.now() + 3 * 60 * 60 * 1000,
          };
          return match[1];
        }
      }
    } catch {
      // ignore transient SC scrape issues
    }
    return '';
  })().finally(() => {
    scWarmPromise = null;
  });
  return scWarmPromise;
}

// Pre-warm SoundCloud client_id quietly on server boot so first 8D track resolves in ~400ms
if (typeof setTimeout !== 'undefined') {
  setTimeout(() => {
    void getSoundCloudClientId(true).catch(() => {});
  }, 800);
}

function normalizeStr(s: string): string {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

function tokenizeForMatch(s: string): Set<string> {
  const norm = normalizeStr(s);
  const tokens = new Set<string>();
  for (const w of norm.split(' ')) {
    if (!w) continue;
    if (CJK_CHAR_RE.test(w)) {
      const chars = Array.from(w);
      for (let i = 0; i < chars.length; i++) {
        if (CJK_CHAR_RE.test(chars[i])) {
          tokens.add(chars[i]);
          if (i + 1 < chars.length && CJK_CHAR_RE.test(chars[i + 1])) {
            tokens.add(chars[i] + chars[i + 1]);
          }
        }
      }
    } else if (w.length >= 2) {
      tokens.add(w);
    }
  }
  return tokens;
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = tokenizeForMatch(a);
  const tb = tokenizeForMatch(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const w of ta) {
    if (tb.has(w)) hits++;
  }
  return hits / Math.max(ta.size, 1);
}

async function searchYouTubeHtmlFallback(
  query: string,
  durationSec = 0,
  allow8d = false
): Promise<Array<{ id: string; title: string; sec: number; score: number; isVideo: boolean }>> {
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': CJK_CHAR_RE.test(query)
            ? 'zh-CN,zh;q=0.9,en;q=0.8'
            : 'es-ES,es;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(3200),
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const jsonMatch = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
    const items: any[] = [];
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const sections =
          parsed?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
        for (const sec of sections) {
          for (const entry of sec?.itemSectionRenderer?.contents || []) {
            if (entry?.videoRenderer?.videoId) items.push(entry.videoRenderer);
          }
        }
      } catch {
        // ignore JSON parse fallback
      }
    }

    const candidates: Array<{ id: string; title: string; sec: number; score: number; isVideo: boolean }> = [];
    for (const vr of items.slice(0, 12)) {
      const id = String(vr.videoId || '');
      const vTitle = String(vr.title?.runs?.[0]?.text || '');
      const lenStr = String(vr.lengthText?.simpleText || '');
      if (!id || !vTitle || !lenStr) continue;
      const lenParts = lenStr.split(':').map(Number);
      const sec =
        lenParts.length === 3
          ? lenParts[0] * 3600 + lenParts[1] * 60 + lenParts[2]
          : lenParts.length === 2
          ? lenParts[0] * 60 + lenParts[1]
          : 0;
      if (!sec || sec < 45 || sec > 900) continue;
      const lower = vTitle.toLowerCase();
      if (!allow8d && /\b(1 hour|10 hours|slowed|reverb|nightcore|8d audio|cover|karaoke|reaction)\b/i.test(lower) && !/remix|instrumental/i.test(query)) {
        continue;
      }
      if (allow8d && !/\b8d\b/i.test(lower)) {
        continue;
      }
      const durDiff = durationSec > 20 ? Math.abs(sec - durationSec) : 0;
      const overlap = tokenOverlapScore(query, vTitle);
      let score = overlap * 100 - durDiff * 1.1;
      if (allow8d && /\b8d\b/i.test(lower)) score += 30;
      if (/\b(official audio|audio oficial|topic|auto-generated)\b/i.test(lower)) score += 18;
      if (/\b(lyric|letra)\b/i.test(lower)) score += 6;
      const isVideo = /\b(official video|video oficial|music video|videoclip|official mv)\b/i.test(lower);
      if (isVideo) score += 8;
      candidates.push({ id, title: vTitle, sec, score, isVideo });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  } catch {
    return [];
  }
}

async function resolveYouTubeMatch(artist: string, title: string, durationSec: number): Promise<{ audioId?: string; mvId?: string }> {
  const cleanArtist = artist.split(',')[0].trim();
  const query = `${cleanArtist} ${title}`.trim();
  try {
    // 1. Fast structured YouTube Music search (~300-500ms, handles CJK/Arabic/Cyrillic natively)
    const ytm = await searchYouTubeMusic(query);
    if (ytm.tracks.length > 0) {
      const scored = ytm.tracks
        .filter((t) => t.youtubeVideoId)
        .map((t) => {
          const hay = `${t.artist.name} ${t.title}`;
          const overlap = tokenOverlapScore(query, hay);
          const durDiff = durationSec > 20 && t.durationSec > 20 ? Math.abs(t.durationSec - durationSec) : 0;
          return {
            id: t.youtubeVideoId!,
            score: overlap * 100 - durDiff * 0.9,
          };
        })
        .sort((a, b) => b.score - a.score);
      if (scored[0]?.id) {
        return {
          audioId: scored[0].id,
          mvId: scored[0].id,
        };
      }
    }

    // 2. Fallback to YouTube web search HTML only if YTM yielded nothing
    const candidates = await searchYouTubeHtmlFallback(
      CJK_CHAR_RE.test(query) ? query : `${query} official audio`,
      durationSec
    );
    const bestAudio = candidates.find((c) => !c.isVideo) || candidates[0];
    const bestMv = candidates.find((c) => c.isVideo) || candidates[0];
    return {
      audioId: bestAudio?.id,
      mvId: bestMv?.id,
    };
  } catch {
    return {};
  }
}

const GENERIC_CHANNEL_RE =
  /^(youtube music|top music mix|mega mix|mashup lab|various artists|varios artistas|ile music|dj mix|music mix|reggaeton mix.*|topic|vevo|official|auto-generated)$/i;

function sanitizeMusicSearchText(raw: string): string {
  return String(raw || '')
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】|《|》/g, ' ')
    .replace(/[×xX+·|/—–•,]+/g, ' ')
    .replace(/\b(official video|video oficial|official audio|audio oficial|music video|videoclip|lyric video|lyrics?|full hd|4k|remix 20\d\d|20\d\d|prod\.? by [^\s]+)\b/gi, ' ')
    .replace(/\.\.\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSyntheticOrLongDuration(durationSec: number): boolean {
  return durationSec <= 0 || durationSec === 205 || durationSec >= 540;
}

async function resolveSoundCloudStream(
  artist: string,
  title: string,
  durationSec: number,
  explicitScId?: string,
  allowScrape = false,
  relaxed = false
): Promise<{ sourceType: 'audio-mp3' | 'audio-hls'; url: string; label: string } | null> {
  try {
    const cid = await getSoundCloudClientId(allowScrape);
    if (!cid) return null;

    let candidates: any[] = [];
    if (explicitScId) {
      const single = await fetchJsonSafe<any>(
        `https://api-v2.soundcloud.com/tracks/${encodeURIComponent(explicitScId)}?client_id=${cid}`,
        2500
      );
      if (single?.id) candidates = [single];
    }

    const rawPrimaryArtist = artist.split(',')[0].trim();
    const primaryArtist = GENERIC_CHANNEL_RE.test(rawPrimaryArtist) ? '' : sanitizeMusicSearchText(rawPrimaryArtist);
    const cleanTitle = sanitizeMusicSearchText(title) || title;
    const titleWords = cleanTitle.split(' ').filter((w) => w.length >= 2);
    const shortKeywords = titleWords.slice(0, 5).join(' ');
    const anchorPair = titleWords.length >= 3 ? `${titleWords[0]} ${titleWords[titleWords.length - 1]}` : '';

    if (candidates.length === 0) {
      const primaryQuery = [primaryArtist, cleanTitle].filter(Boolean).join(' ').trim();
      const queriesToTry: string[] = [];
      if (primaryQuery) queriesToTry.push(primaryQuery);
      if (cleanTitle && cleanTitle !== primaryQuery) queriesToTry.push(cleanTitle);
      if (shortKeywords && !queriesToTry.includes(shortKeywords)) {
        const kwWithArtist = primaryArtist ? `${primaryArtist} ${shortKeywords}` : shortKeywords;
        queriesToTry.push(kwWithArtist);
        if (kwWithArtist !== shortKeywords) queriesToTry.push(shortKeywords);
      }
      if (relaxed && anchorPair && !queriesToTry.includes(anchorPair)) {
        queriesToTry.push(anchorPair);
      }

      for (const q of queriesToTry.slice(0, relaxed ? 4 : 2)) {
        const sr = await fetchJsonSafe<any>(
          `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=12`,
          2600
        );
        const found = Array.isArray(sr?.collection) ? sr.collection : [];
        if (found.length > 0) {
          candidates = [...candidates, ...found];
          // Stop early if first query already returned playable candidates
          if (found.some((t: any) => Array.isArray(t?.media?.transcodings) && t.media.transcodings.some((x: any) => !x?.snipped))) {
            break;
          }
        }
      }
    }

    const effectiveQuery = [primaryArtist, cleanTitle].filter(Boolean).join(' ').trim() || cleanTitle;
    const wantRemix = /\b(remix|mashup|mix|sped up|slowed|nightcore|acoustic|live|cover)\b/i.test(`${artist} ${title}`);
    const longOrSynthetic = isSyntheticOrLongDuration(durationSec);
    const minScore = relaxed ? (longOrSynthetic ? 0.14 : 0.2) : 0.34;

    const scoreCandidate = (t: any): number => {
      const scTitle = String(t?.title || '');
      const scUser = String(t?.user?.username || '');
      const hay = `${scUser} ${scTitle}`;
      const titleOverlap = tokenOverlapScore(cleanTitle, hay);
      const fullOverlap = tokenOverlapScore(effectiveQuery, hay);
      let score = titleOverlap * 1.45 + fullOverlap;
      if (!wantRemix && /\b(bootleg|flip|nightcore|sped up|slowed|8d|karaoke|instrumental)\b/i.test(scTitle)) {
        score -= 0.55;
      }
      if (durationSec >= 540) {
        const tDur = Number(t?.full_duration || t?.duration || 0) / 1000;
        if (tDur >= 420) score += 0.45;
      }
      const hasProg = t?.media?.transcodings?.some((x: any) => !x?.snipped && x?.format?.protocol === 'progressive');
      if (hasProg) score += 0.15;
      const tDur = Number(t?.full_duration || t?.duration || 0) / 1000;
      if (!longOrSynthetic && durationSec > 45 && tDur > 0) {
        score -= Math.min(0.7, Math.abs(tDur - durationSec) / 100);
      }
      return score;
    };

    const dedupMap = new Map<string, any>();
    for (const c of candidates) {
      if (c?.id && !dedupMap.has(String(c.id))) dedupMap.set(String(c.id), c);
    }

    const valid = [...dedupMap.values()]
      .filter((t) => {
        const trans = t?.media?.transcodings;
        if (!Array.isArray(trans) || trans.length === 0) return false;
        const playable = trans.some(
          (x: any) =>
            !x?.snipped &&
            (x?.format?.protocol === 'progressive' || x?.format?.protocol === 'hls')
        );
        if (!playable) return false;
        const tDur = Number(t?.full_duration || t?.duration || 0) / 1000;
        if (tDur < 45) return false;
        if (durationSec >= 540) {
          // Mix / mashup session: accept any full mix >= 5 min or fallback >= 90s when relaxed
          if (tDur < (relaxed ? 90 : 300)) return false;
        } else if (!longOrSynthetic && durationSec > 45) {
          const maxDiff = relaxed ? Math.max(120, durationSec * 0.6) : 38;
          if (Math.abs(tDur - durationSec) > maxDiff) return false;
        }
        const hay = `${t?.user?.username || ''} ${t?.title || ''}`;
        const titleOv = tokenOverlapScore(cleanTitle, hay);
        const fullOv = tokenOverlapScore(effectiveQuery, hay);
        const kwOv = shortKeywords ? tokenOverlapScore(shortKeywords, hay) : 0;
        return Math.max(titleOv, fullOv, kwOv) >= minScore;
      })
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

    const chosen = valid[0];
    if (!chosen) return null;

    const transcodings = chosen.media.transcodings as any[];
    const prog = transcodings.find((x) => !x.snipped && x.format?.protocol === 'progressive');
    const hls =
      transcodings.find(
        (x) => !x.snipped && x.format?.protocol === 'hls' && String(x.preset || '').includes('aac')
      ) || transcodings.find((x) => !x.snipped && x.format?.protocol === 'hls');

    const picked = prog || hls;
    if (!picked?.url) return null;

    const streamInfo = await fetchJsonSafe<{ url?: string }>(`${picked.url}?client_id=${cid}`, 2400);
    if (!streamInfo?.url) return null;

    return {
      sourceType: picked.format?.protocol === 'progressive' ? 'audio-mp3' : 'audio-hls',
      url: streamInfo.url,
      label: 'Audio Full HD',
    };
  } catch {
    return null;
  }
}

async function resolveAudiusStream(
  artist: string,
  title: string,
  durationSec: number,
  explicitAudiusId?: string,
  relaxed = false
) {
  try {
    if (explicitAudiusId) {
      return {
        sourceType: 'audio-mp3' as const,
        url: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(explicitAudiusId)}/stream?app_name=RIFFAN`,
        label: 'Audius Hi-Fi',
      };
    }
    const rawPrimary = artist.split(',')[0].trim();
    const cleanArtist = GENERIC_CHANNEL_RE.test(rawPrimary) ? '' : sanitizeMusicSearchText(rawPrimary);
    const cleanTitle = sanitizeMusicSearchText(title) || title;
    const q = [cleanArtist, cleanTitle].filter(Boolean).join(' ').trim();
    const res = await fetchJsonSafe<{ data?: any[] }>(
      `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=RIFFAN`,
      2000
    );
    const items = Array.isArray(res?.data) ? res.data : [];
    const longOrSynthetic = isSyntheticOrLongDuration(durationSec);
    const minScore = relaxed ? 0.35 : 0.62;
    const hit = items.find((t) => {
      const dur = Number(t?.duration || 0);
      if (dur < 45) return false;
      if (!longOrSynthetic && durationSec > 45 && dur > 0) {
        const maxDiff = relaxed ? 100 : 35;
        if (Math.abs(dur - durationSec) > maxDiff) return false;
      }
      const hay = `${t?.user?.name || ''} ${t?.title || ''}`;
      const score = Math.max(tokenOverlapScore(q, hay), tokenOverlapScore(cleanTitle, hay));
      return score >= minScore && (relaxed || !/bootleg|nightcore|sped up/i.test(t?.title || ''));
    });
    if (hit?.id) {
      return {
        sourceType: 'audio-mp3' as const,
        url: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(hit.id)}/stream?app_name=RIFFAN`,
        label: 'Audius Hi-Fi',
      };
    }
  } catch {
    // ignore
  }
  return null;
}

const COUNTRY_RADIO_GROUPS: Record<string, string[]> = {
  MA: ['MA'],
  RU: ['RU'],
  RO: ['RO'],
  CN: ['CN', 'HK', 'TW'],
  US: ['US'],
  FR: ['FR'],
  ES: ['ES'],
  ARAB: ['EG', 'AE', 'SA', 'LB', 'TN', 'DZ'],
  AFRICA: ['NG', 'ZA', 'KE', 'GH', 'SN', 'CI', 'MA'],
  LATIN: ['MX', 'CO', 'AR', 'BR', 'CL', 'PR'],
};

function mapRadioStations(rawList: any[], maxTotal = 72): MusicRadioStation[] {
  const seen = new Set<string>();
  const stations: MusicRadioStation[] = [];
  for (const st of rawList) {
    const streamUrl = String(st?.url_resolved || st?.url || '').trim();
    const name = String(st?.name || '').trim();
    if (!streamUrl || !name || seen.has(name.toLowerCase())) continue;
    if (
      /\b(am|cope\b|ser\b|ondacero|esradio|rne radio nacional|radio 5|catalunya informacio|noticias)\b/i.test(name) &&
      !/rock|mega|los40|cadena 100|europa|kiss|hit|music|flaix|radiolé|dial|mars|hitradio/i.test(name)
    ) {
      continue;
    }
    seen.add(name.toLowerCase());
    const tags = String(st?.tags || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    stations.push({
      id: `radio-${st?.stationuuid || stations.length}`,
      name,
      country: String(st?.countrycode || st?.country || 'INTL'),
      tags: tags.length > 0 ? tags : ['Music 24/7'],
      favicon: String(st?.favicon || ''),
      streamUrl,
      bitrate: Number(st?.bitrate || 128),
      codec: String(st?.codec || 'MP3'),
      votes: Number(st?.votes || 0),
    });
    if (stations.length >= maxTotal) break;
  }
  return stations;
}

const CURATED_FALLBACK_RADIOS: Record<string, MusicRadioStation[]> = {
  ES: [
    { id: 'cur-es-1', name: 'LOS40 España', country: 'ES', tags: ['Pop', 'Hits'], favicon: '', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-es-2', name: 'LOS40 Urban', country: 'ES', tags: ['Urbano', 'Reggaeton'], favicon: '', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_URBAN.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-es-3', name: 'Cadena 100', country: 'ES', tags: ['Pop', 'Rock'], favicon: '', streamUrl: 'https://cadena100-cope-rrcast.flumotion.com/cope/cadena100.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-es-4', name: 'RockFM España', country: 'ES', tags: ['Rock', 'Classics'], favicon: '', streamUrl: 'https://rockfm-cope-rrcast.flumotion.com/cope/rockfm.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-es-5', name: 'FlaixFM Barcelona', country: 'ES', tags: ['Electronic', 'Dance'], favicon: '', streamUrl: 'https://nodo05-cloud01.streaming-pro.com:8005/flaixfm.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-es-6', name: 'Radio Olé', country: 'ES', tags: ['Flamenco', 'Español'], favicon: '', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOLE.mp3', bitrate: 128, codec: 'MP3' },
  ],
  MA: [
    { id: 'cur-ma-1', name: 'Hit Radio Maroc', country: 'MA', tags: ['Marruecos', 'Pop', 'Urbano'], favicon: '', streamUrl: 'https://hitradio-maroc.ice.infomaniak.ch/hitradio-maroc-128.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-ma-2', name: 'Hit Radio Mgharba', country: 'MA', tags: ['Marruecos', 'Rap', 'Chaabi'], favicon: '', streamUrl: 'https://mgharba.ice.infomaniak.ch/mgharba-128.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-ma-3', name: 'Hit Radio R&B', country: 'MA', tags: ['R&B', 'Hip Hop'], favicon: '', streamUrl: 'https://hr-rnb.ice.infomaniak.ch/hr-rnb-128.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-ma-4', name: 'Radio Mars', country: 'MA', tags: ['Marruecos', 'Music'], favicon: '', streamUrl: 'https://radiomars.ice.infomaniak.ch/radiomars-128.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-ma-5', name: 'Aswat FM', country: 'MA', tags: ['Marruecos', 'Arabic'], favicon: '', streamUrl: 'https://aswat.ice.infomaniak.ch/aswat-high.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-ma-6', name: 'Chada FM Casablanca', country: 'MA', tags: ['Marruecos', 'Chaabi'], favicon: '', streamUrl: 'https://chadafm.ice.infomaniak.ch/chadafm-high.mp3', bitrate: 128, codec: 'MP3' },
  ],
  ARAB: [
    { id: 'cur-ar-1', name: 'Nogoum FM 100.6', country: 'EG', tags: ['Arabic', 'Pop'], favicon: '', streamUrl: 'https://audio.nrpstream.com/listen/nogoumfm/radio.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-ar-2', name: 'Nile FM 104.2', country: 'EG', tags: ['Egypt', 'Hits'], favicon: '', streamUrl: 'https://audio.nrpstream.com/listen/nilefm/radio.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-ar-3', name: 'Monte Carlo Doualiya', country: 'FR', tags: ['Arabic', 'World'], favicon: '', streamUrl: 'https://montecarlodoualiya128k.ice.infomaniak.ch/mc-doualiya.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-ar-4', name: 'Radio Orient', country: 'LB', tags: ['Arabic', 'Classic'], favicon: '', streamUrl: 'https://n01.rcs.revma.com/75g2k667k5zuv', bitrate: 128, codec: 'MP3' },
  ],
  AFRICA: [
    { id: 'cur-af-1', name: 'Afrobeats FM', country: 'NG', tags: ['Afrobeats', 'Nigeria'], favicon: '', streamUrl: 'https://stream.zeno.fm/0r0xa792kwzuv', bitrate: 128, codec: 'MP3' },
    { id: 'cur-af-2', name: 'Hit Radio 100% Africa', country: 'CI', tags: ['Africa', 'Amapiano'], favicon: '', streamUrl: 'https://africa.ice.infomaniak.ch/africa-128.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-af-3', name: 'RFI Musique', country: 'FR', tags: ['Afro', 'Rumba'], favicon: '', streamUrl: 'https://rfimonde64k.ice.infomaniak.ch/rfimonde-64k.mp3', bitrate: 64, codec: 'MP3' },
  ],
  RU: [
    { id: 'cur-ru-1', name: 'Europa Plus Russia', country: 'RU', tags: ['Pop', 'Russia'], favicon: '', streamUrl: 'https://ep256.hostingradio.ru:8052/europaplus256.mp3', bitrate: 256, codec: 'MP3' },
    { id: 'cur-ru-2', name: 'Radio Record Dance', country: 'RU', tags: ['Dance', 'Russian'], favicon: '', streamUrl: 'https://radiorecord.hostingradio.ru/rr_main96.aacp', bitrate: 96, codec: 'AAC' },
    { id: 'cur-ru-3', name: 'Russian Mix Record', country: 'RU', tags: ['Russian', 'Hits'], favicon: '', streamUrl: 'https://radiorecord.hostingradio.ru/rus96.aacp', bitrate: 96, codec: 'AAC' },
    { id: 'cur-ru-4', name: 'DFM Moscow', country: 'RU', tags: ['Electronic', 'Pop'], favicon: '', streamUrl: 'https://dfm.hostingradio.ru/dfm96.aacp', bitrate: 96, codec: 'AAC' },
  ],
  RO: [
    { id: 'cur-ro-1', name: 'Kiss FM Romania', country: 'RO', tags: ['Pop', 'Romania'], favicon: '', streamUrl: 'https://live.kissfm.ro/kissfm.aacp', bitrate: 80, codec: 'AAC' },
    { id: 'cur-ro-2', name: 'Magic FM Romania', country: 'RO', tags: ['Soft Pop', 'Classics'], favicon: '', streamUrl: 'https://live.magicfm.ro/magicfm.aacp', bitrate: 80, codec: 'AAC' },
    { id: 'cur-ro-3', name: 'Rock FM Romania', country: 'RO', tags: ['Rock', 'Romania'], favicon: '', streamUrl: 'https://live.rockfm.ro/rockfm.aacp', bitrate: 80, codec: 'AAC' },
  ],
  CN: [
    { id: 'cur-cn-1', name: 'Asia Hitz China', country: 'CN', tags: ['C-Pop', 'Mandopop'], favicon: '', streamUrl: 'https://stream.zeno.fm/49y7s033h2zuv', bitrate: 128, codec: 'MP3' },
    { id: 'cur-cn-2', name: 'Lofi Focus Radio', country: 'INTL', tags: ['Lo-Fi', 'Chill'], favicon: '', streamUrl: 'https://streams.ilovemusic.de/iloveradio17.mp3', bitrate: 192, codec: 'MP3' },
  ],
  US: [
    { id: 'cur-us-1', name: 'KEXP 90.3 Seattle', country: 'US', tags: ['Indie', 'Alternative'], favicon: '', streamUrl: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-us-2', name: 'SomaFM Groove Salad', country: 'US', tags: ['Chill', 'Ambient'], favicon: '', streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-us-3', name: 'SomaFM Beat Blender', country: 'US', tags: ['Electronic', 'Downtempo'], favicon: '', streamUrl: 'https://ice1.somafm.com/beatblender-128-mp3', bitrate: 128, codec: 'MP3' },
  ],
  LATIN: [
    { id: 'cur-la-1', name: 'Los40 Colombia', country: 'CO', tags: ['Latino', 'Urbano'], favicon: '', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_COLOMBIA.mp3', bitrate: 128, codec: 'MP3' },
    { id: 'cur-la-2', name: 'Salsa Mexico Radio', country: 'MX', tags: ['Salsa', 'Tropical'], favicon: '', streamUrl: 'https://stream.zeno.fm/0c8m7p4r2zuv', bitrate: 128, codec: 'MP3' },
  ],
};

function getCuratedFallbackRadios(cleanCountry: string, cleanTag: string): MusicRadioStation[] {
  if (cleanTag) {
    const all = Object.values(CURATED_FALLBACK_RADIOS).flat();
    const matched = all.filter((s) =>
      s.tags.some((t) => t.toLowerCase().includes(cleanTag)) || s.name.toLowerCase().includes(cleanTag)
    );
    return matched.length > 0 ? matched : all.slice(0, 12);
  }
  if (cleanCountry === 'ALL') {
    const groups = Object.values(CURATED_FALLBACK_RADIOS);
    const out: MusicRadioStation[] = [];
    for (let i = 0; i < 4; i++) {
      for (const g of groups) {
        if (g[i]) out.push(g[i]);
      }
    }
    return out;
  }
  return CURATED_FALLBACK_RADIOS[cleanCountry] || CURATED_FALLBACK_RADIOS.ES;
}

export async function getMusicRadios(country = 'ES', tag?: string): Promise<MusicRadioStation[]> {
  const cleanCountry = country.trim().toUpperCase() || 'ES';
  const cleanTag = tag ? tag.trim().toLowerCase() : '';
  const key = `${cleanCountry}:${cleanTag}`;
  const cached = radioCache.get(key);
  if (cached) return cached;

  let urls: string[] = [];
  if (cleanTag) {
    urls = [
      `https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(cleanTag)}?limit=48&order=clickcount&reverse=true&hidebroken=true`,
    ];
  } else if (cleanCountry === 'ALL') {
    urls = [
      'https://de1.api.radio-browser.info/json/stations/topclick/72?hidebroken=true',
    ];
  } else if (COUNTRY_RADIO_GROUPS[cleanCountry]) {
    const codes = COUNTRY_RADIO_GROUPS[cleanCountry];
    const perLimit = codes.length === 1 ? 48 : 16;
    urls = codes.slice(0, 3).map(
      (cc) =>
        `https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/${cc}?limit=${perLimit}&order=clickcount&reverse=true&hidebroken=true`
    );
  } else {
    urls = [
      `https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/${encodeURIComponent(cleanCountry)}?limit=48&order=clickcount&reverse=true&hidebroken=true`,
    ];
  }

  const settled = await Promise.allSettled(urls.map((u) => fetchJsonSafe<any[]>(u, 4500)));
  const combined: any[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      combined.push(...r.value);
    }
  }

  const liveStations = mapRadioStations(combined, 64);
  const fallbackStations = getCuratedFallbackRadios(cleanCountry, cleanTag);
  const seenNames = new Set(liveStations.map((s) => s.name.toLowerCase()));
  const merged = [...liveStations];
  for (const fb of fallbackStations) {
    if (!seenNames.has(fb.name.toLowerCase())) {
      seenNames.add(fb.name.toLowerCase());
      merged.push(fb);
    }
  }

  radioCache.set(key, merged);
  return merged;
}

async function fetchRegionMix(
  ytmQuery: string,
  spotifyPlaylistId?: string,
  spotifyLabel = 'Spotify Charts',
  maxTotal = 26,
  itunesCountry = 'US'
): Promise<MusicTrack[]> {
  const [ytmRes, spTracks] = await Promise.all([
    searchYouTubeMusic(ytmQuery),
    spotifyPlaylistId
      ? fetchSpotifyPlaylistTracks(spotifyPlaylistId, spotifyLabel, 16)
      : Promise.resolve([]),
  ]);
  const lists: MusicTrack[][] = [];
  if (ytmRes.tracks.length > 0) lists.push(ytmRes.tracks);
  if (spTracks.length > 0) lists.push(spTracks);
  let merged = interleaveUniqueTracks(lists, maxTotal);
  if (merged.length < 12) {
    const itRaw = await searchItunesMusic(ytmQuery, 'song', 16, itunesCountry);
    const itTracks = itRaw.map((x) => mapItunesSongToTrack(x, 'spotify'));
    if (itTracks.length > 0) {
      merged = interleaveUniqueTracks([...lists, itTracks], maxTotal);
    }
  }
  return merged;
}

async function runSettledConcurrency(
  tasks: Array<() => Promise<unknown>>,
  concurrency = 4
): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) break;
      try {
        const value = await tasks[idx]();
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function getMusicHome() {
  void getSoundCloudClientId(true);
  const cached = homeCache.get('home_v5');
  if (cached) return cached;

  const settled = await runSettledConcurrency([
    () => fetchJsonSafe<any>('https://api.deezer.com/chart/0?limit=35', 6000), // 0: globalChart
    () => fetchRegionMix('Quevedo Aitana Saiko', '37i9dQZEVXbNFJfN1Vw8d9', 'Top 50 España', 28, 'ES'), // 1: spainHits
    () => fetchJsonSafe<any>('https://api.deezer.com/chart/116/tracks?limit=25', 6000), // 2: urbano
    () => fetchJsonSafe<any>('https://api.deezer.com/chart/132/tracks?limit=25', 6000), // 3: pop
    () => fetchJsonSafe<any>('https://api.deezer.com/chart/113/tracks?limit=25', 6000), // 4: electronic
    () => fetchJsonSafe<any>('https://api.deezer.com/chart/152/tracks?limit=24', 6000), // 5: rock
    () => fetchRegionMix('Bad Bunny Karol G Feid', '37i9dQZF1DX10zKzsJ2jva', 'Viva Latino', 28, 'US'), // 6: latin
    () => fetchJsonSafe<any>('https://api.deezer.com/chart/165/tracks?limit=24', 6000), // 7: rnb/soul
    () => searchYouTubeMusic('lofi hip hop chill study beats jazz'), // 8: chill
    () => searchYouTubeMusic('flamenco camaron paco de lucia'), // 9: flamenco
    () => fetchJsonSafe<any>('https://api.deezer.com/chart/173/tracks?limit=22', 6000), // 10: soundtracks
    () => searchYouTubeMusic('Queen Michael Jackson Daft Punk classics hits'), // 11: classics
    () => fetchJsonSafe<any>('https://api.deezer.com/editorial/0/releases?limit=20', 6000), // 12: new releases
    () => fetchJsonSafe<any>('https://api.deezer.com/genre', 6000), // 13: genres
    () => fetchJsonSafe<any>('https://discoveryprovider.audius.co/v1/tracks/trending?app_name=RIFFAN&limit=16', 5000), // 14: audius
    () => getMusicRadios('ALL'), // 15: worldwide radios
    () => fetchYouTubeMusicExploreAndCharts(), // 16: YouTube Music sync
    () => fetchSpotifyChartsAndAlbums(), // 17: Spotify sync
    () => fetchRegionMix('ElGrandeToto Saad Lamjarred Manal Dystinct', '37i9dQZEVXbJU9eQpX8gPT', 'Top 50 Morocco', 28, 'MA'), // 18: Morocco
    () => fetchRegionMix('Amr Diab Nancy Ajram Tamer Hosny Wegz', undefined, 'Arab Hits', 26, 'EG'), // 19: Arab
    () => fetchRegionMix('Burna Boy Wizkid Tyla Rema Ayra Starr', '37i9dQZF1DWYkaDif7Ztbp', 'African Heat', 28, 'NG'), // 20: Africa
    () => fetchRegionMix('Macan Anna Asti Miyagi Jony Zivert', '37i9dQZF1DX8FwnYE6PRvL', 'Russia Top Hits', 28, 'RU'), // 21: Russia
    () => fetchRegionMix("Inna Carla's Dreams Smiley Delia Theo Rose", undefined, 'Romania Hits', 26, 'RO'), // 22: Romania
    () => fetchRegionMix('Jay Chou GEM Eason Chan JJ Lin Jackson Wang', undefined, 'China C-Pop', 26, 'CN'), // 23: China
    () => fetchRegionMix('Kendrick Lamar SZA Sabrina Carpenter Billie Eilish', '37i9dQZEVXbLRQDuF5jeBp', 'USA Top 50', 28, 'US'), // 24: USA
  ], 4);

  const val = <T>(idx: number): T | null =>
    settled[idx]?.status === 'fulfilled' ? ((settled[idx] as PromiseFulfilledResult<T>).value ?? null) : null;

  const globalChart = val<any>(0);
  const ytmData = val<{ tracks: MusicTrack[]; albums: MusicAlbumRef[] }>(16) || { tracks: [], albums: [] };
  const spData = val<{ tracks: MusicTrack[]; albums: MusicAlbumRef[] }>(17) || { tracks: [], albums: [] };

  const topTracks: MusicTrack[] = mapDeezerTracksSafe(globalChart?.tracks?.data);
  const topAlbums: MusicAlbumRef[] = Array.isArray(globalChart?.albums?.data)
    ? globalChart.albums.data.map((a: any) => mapDeezerAlbum(a))
    : [];
  const topArtists: MusicArtistRef[] = Array.isArray(globalChart?.artists?.data)
    ? globalChart.artists.data.map((a: any) => mapDeezerArtist(a))
    : [];
  const editorialPlaylists: MusicPlaylist[] = Array.isArray(globalChart?.playlists?.data)
    ? globalChart.playlists.data.map((p: any) => mapDeezerPlaylist(p))
    : [];

  const newReleasesRaw = val<any>(12);
  const newReleases: MusicAlbumRef[] = Array.isArray(newReleasesRaw?.data)
    ? newReleasesRaw.data.map((a: any) => mapDeezerAlbum(a))
    : [];

  const audiusRaw = val<any>(14);
  const audiusTrending: MusicTrack[] = Array.isArray(audiusRaw?.data)
    ? audiusRaw.data.slice(0, 16).map((t: any) => mapAudiusTrack(t))
    : [];

  const genresRaw = val<any>(13);
  const rawGenres = Array.isArray(genresRaw?.data) ? genresRaw.data : [];
  const genres: MusicGenre[] = rawGenres
    .filter((g: any) => Number(g?.id) > 0)
    .slice(0, 22)
    .map((g: any, idx: number) => {
      const name = String(g?.name || 'Música');
      return {
        id: String(g.id),
        name,
        picture: String(g?.picture_big || g?.picture_medium || g?.picture || ''),
        color: GENRE_COLOR_MAP[name] || GENRE_COLORS_FALLBACK[idx % GENRE_COLORS_FALLBACK.length],
      };
    });

  const chillSearch = val<{ tracks: MusicTrack[]; albums: MusicAlbumRef[] }>(8);
  const flamencoSearch = val<{ tracks: MusicTrack[]; albums: MusicAlbumRef[] }>(9);
  const classicsSearch = val<{ tracks: MusicTrack[]; albums: MusicAlbumRef[] }>(11);

  const payload = {
    topTracks: topTracks.length > 0 ? topTracks : ytmData.tracks,
    youtubeMusicHits: ytmData.tracks,
    youtubeMusicAlbums: ytmData.albums,
    spotifyHits: spData.tracks,
    spotifyAlbums: spData.albums.length > 0 ? spData.albums : ytmData.albums.slice(0, 14),
    spainHits: val<MusicTrack[]>(1) || [],
    moroccoMix: val<MusicTrack[]>(18) || [],
    arabMix: val<MusicTrack[]>(19) || [],
    africaMix: val<MusicTrack[]>(20) || [],
    russiaMix: val<MusicTrack[]>(21) || [],
    romaniaMix: val<MusicTrack[]>(22) || [],
    chinaMix: val<MusicTrack[]>(23) || [],
    usaMix: val<MusicTrack[]>(24) || [],
    urbanoMix: mapDeezerTracksSafe(val<any>(2)?.data),
    popMix: mapDeezerTracksSafe(val<any>(3)?.data),
    electronicMix: mapDeezerTracksSafe(val<any>(4)?.data),
    rockIndieMix: mapDeezerTracksSafe(val<any>(5)?.data),
    latinSalsaMix: val<MusicTrack[]>(6) || [],
    rnbSoulMix: mapDeezerTracksSafe(val<any>(7)?.data),
    chillLofiMix: chillSearch?.tracks || [],
    flamencoAcousticMix: flamencoSearch?.tracks || [],
    soundtrackMix: mapDeezerTracksSafe(val<any>(10)?.data),
    classicsMix: classicsSearch?.tracks || [],
    audiusTrending,
    topAlbums: topAlbums.length > 0 ? topAlbums : ytmData.albums,
    newReleases: newReleases.length > 0 ? newReleases : ytmData.albums,
    topArtists,
    editorialPlaylists,
    genres,
    radios: val<MusicRadioStation[]>(15) || [],
  };

  if (
    payload.topTracks.length > 0 &&
    payload.spainHits.length > 0 &&
    payload.latinSalsaMix.length > 0 &&
    (ytmData.tracks.length > 0 || payload.moroccoMix.length > 0 || spData.tracks.length > 0)
  ) {
    homeCache.set('home_v5', payload);
  }
  return payload;
}

export async function searchMusicCatalog(query: string, type = 'all') {
  const clean = String(query || '').trim();
  if (!clean) {
    return { tracks: [], albums: [], artists: [], playlists: [], radios: [] };
  }
  const key = `v3:${type}:${clean.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const qEnc = encodeURIComponent(clean);
  const hasCjk = CJK_CHAR_RE.test(clean);
  const wantTracks = type === 'all' || type === 'track';
  const wantAlbums = type === 'all' || type === 'album';

  const [
    dzTracks,
    dzAlbums,
    dzArtists,
    dzPlaylists,
    audiusRes,
    ytmRes,
    itSongsPrimary,
    itSongsExtra,
    itAlbumsCjk,
    rbByName,
  ] = await Promise.all([
    wantTracks
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/track?q=${qEnc}&limit=20`, 4500)
      : Promise.resolve(null),
    wantAlbums
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/album?q=${qEnc}&limit=14`, 4500)
      : Promise.resolve(null),
    type === 'all' || type === 'artist'
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/artist?q=${qEnc}&limit=12`, 4500)
      : Promise.resolve(null),
    type === 'all' || type === 'playlist'
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/playlist?q=${qEnc}&limit=12`, 4500)
      : Promise.resolve(null),
    wantTracks && !hasCjk
      ? fetchJsonSafe<any>(`https://discoveryprovider.audius.co/v1/tracks/search?query=${qEnc}&app_name=RIFFAN`, 3200)
      : Promise.resolve(null),
    wantTracks || wantAlbums
      ? searchYouTubeMusic(clean)
      : Promise.resolve({ tracks: [], albums: [] }),
    wantTracks
      ? searchItunesMusic(clean, 'song', hasCjk ? 12 : 8, hasCjk ? 'TW' : 'US')
      : Promise.resolve([]),
    wantTracks && hasCjk
      ? searchItunesMusic(clean, 'song', 10, 'US')
      : Promise.resolve([]),
    wantAlbums && hasCjk
      ? searchItunesMusic(clean, 'album', 8, 'TW')
      : Promise.resolve([]),
    fetchJsonSafe<any[]>(
      `https://de1.api.radio-browser.info/json/stations/byname/${qEnc}?limit=12&order=clickcount&reverse=true&hidebroken=true`,
      3800
    ),
  ]);

  const dzMappedTracks: MusicTrack[] = Array.isArray(dzTracks?.data)
    ? dzTracks.data.map((t: any) => mapDeezerTrack(t))
    : [];

  const audiusTracks: MusicTrack[] = Array.isArray(audiusRes?.data)
    ? audiusRes.data.slice(0, 5).map((t: any) => mapAudiusTrack(t))
    : [];

  const itCombined = [...(Array.isArray(itSongsPrimary) ? itSongsPrimary : []), ...(Array.isArray(itSongsExtra) ? itSongsExtra : [])];
  const seenItTrack = new Set<string>();
  const itTracks: MusicTrack[] = [];
  for (const x of itCombined) {
    const mapped = mapItunesSongToTrack(x, 'spotify');
    const dedupeKey = `${mapped.title.toLowerCase()}|${mapped.artist.name.toLowerCase()}`;
    if (!seenItTrack.has(dedupeKey)) {
      seenItTrack.add(dedupeKey);
      itTracks.push(mapped);
    }
    if (itTracks.length >= 12) break;
  }

  let ytFallbackTracks: MusicTrack[] = [];
  if (wantTracks && ytmRes.tracks.length === 0 && dzMappedTracks.length === 0 && itTracks.length === 0) {
    const ytHtml = await searchYouTubeHtmlFallback(clean);
    ytFallbackTracks = ytHtml.slice(0, 12).map((v) => ({
      id: `ytm-${v.id}`,
      title: v.title,
      artist: { id: `ytm-art-${encodeURIComponent(clean)}`, name: clean, picture: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` },
      album: {
        id: `ytm-alb-trk-${v.id}`,
        title: 'YouTube Music',
        cover: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        coverXl: `https://i.ytimg.com/vi/${v.id}/hq720.jpg`,
      },
      durationSec: v.sec,
      source: 'youtube_music' as const,
      youtubeVideoId: v.id,
    }));
  }

  const mergedTracks = interleaveUniqueTracks(
    hasCjk
      ? [ytmRes.tracks, itTracks, dzMappedTracks, ytFallbackTracks]
      : [dzMappedTracks, ytmRes.tracks, itTracks, audiusTracks, ytFallbackTracks],
    42
  );

  const dzMappedAlbums = Array.isArray(dzAlbums?.data) ? dzAlbums.data.map((a: any) => mapDeezerAlbum(a)) : [];
  const itMappedAlbums = Array.isArray(itAlbumsCjk) ? itAlbumsCjk.filter((a) => a?.collectionId).map((a) => mapItunesAlbumRef(a)) : [];
  const albumMap = new Map<string, MusicAlbumRef>();
  for (const alb of [...ytmRes.albums, ...itMappedAlbums, ...dzMappedAlbums]) {
    if (alb.id && !albumMap.has(alb.id)) albumMap.set(alb.id, alb);
  }
  const mergedAlbums = Array.from(albumMap.values()).slice(0, 20);

  const matchingRadios = Array.isArray(rbByName) ? mapRadioStations(rbByName, 16) : [];

  const directArtists: MusicArtistRef[] = Array.isArray(dzArtists?.data)
    ? dzArtists.data.map((a: any) => mapDeezerArtist(a))
    : [];
  const derivedArtistMap = new Map<string, MusicArtistRef>();
  for (const a of directArtists) {
    if (a.id) derivedArtistMap.set(a.id, a);
  }
  for (const t of [...dzMappedTracks, ...ytmRes.tracks, ...itTracks]) {
    const artName = t.artist.name;
    if (
      t.artist.id &&
      artName &&
      artName !== 'YouTube Music' &&
      artName !== 'Artista' &&
      !/^\d+:\d{2}$/.test(artName) &&
      !derivedArtistMap.has(t.artist.id)
    ) {
      derivedArtistMap.set(t.artist.id, t.artist);
    }
  }

  const payload = {
    tracks: mergedTracks,
    albums: mergedAlbums,
    artists: Array.from(derivedArtistMap.values()).slice(0, 14),
    playlists: Array.isArray(dzPlaylists?.data) ? dzPlaylists.data.map((p: any) => mapDeezerPlaylist(p)) : [],
    radios: matchingRadios,
  };

  if (
    payload.tracks.length > 0 ||
    payload.albums.length > 0 ||
    payload.artists.length > 0 ||
    payload.playlists.length > 0 ||
    payload.radios.length > 0
  ) {
    searchCache.set(key, payload);
  }
  return payload;
}

export async function getAlbumDetails(albumId: string) {
  const key = `album:${albumId}`;
  const cached = entityCache.get(key);
  if (cached) return cached;

  if (albumId.startsWith('ytm-')) {
    const ytmAlb = await fetchYouTubeMusicAlbum(albumId);
    if (ytmAlb) {
      entityCache.set(key, ytmAlb);
      return ytmAlb;
    }
  }

  if (albumId.startsWith('it-alb-')) {
    const itAlb = await fetchItunesAlbumById(albumId);
    if (itAlb) {
      entityCache.set(key, itAlb);
      return itAlb;
    }
  }

  const raw = await fetchJsonSafe<any>(`https://api.deezer.com/album/${encodeURIComponent(albumId)}`, 6000);
  if (!raw?.id) return null;

  const album = mapDeezerAlbum(raw);
  const tracks: MusicTrack[] = Array.isArray(raw?.tracks?.data)
    ? raw.tracks.data.map((t: any) => mapDeezerTrack(t, album))
    : [];
  const payload = { album, tracks };
  entityCache.set(key, payload);
  return payload;
}

export async function getArtistDetails(artistId: string) {
  const key = `artist:${artistId}`;
  const cached = entityCache.get(key);
  if (cached) return cached;

  const [rawArtist, topRes, albumsRes, relatedRes] = await Promise.all([
    fetchJsonSafe<any>(`https://api.deezer.com/artist/${encodeURIComponent(artistId)}`, 6000),
    fetchJsonSafe<any>(`https://api.deezer.com/artist/${encodeURIComponent(artistId)}/top?limit=20`, 6000),
    fetchJsonSafe<any>(`https://api.deezer.com/artist/${encodeURIComponent(artistId)}/albums?limit=18`, 6000),
    fetchJsonSafe<any>(`https://api.deezer.com/artist/${encodeURIComponent(artistId)}/related?limit=12`, 6000),
  ]);

  if (!rawArtist?.id) return null;
  const artist = mapDeezerArtist(rawArtist);
  const topTracks: MusicTrack[] = Array.isArray(topRes?.data)
    ? topRes.data.map((t: any) => mapDeezerTrack(t))
    : [];
  const albums: MusicAlbumRef[] = Array.isArray(albumsRes?.data)
    ? albumsRes.data.map((a: any) => ({ ...mapDeezerAlbum(a), artist }))
    : [];
  const related: MusicArtistRef[] = Array.isArray(relatedRes?.data)
    ? relatedRes.data.map((a: any) => mapDeezerArtist(a))
    : [];

  const payload = { artist, topTracks, albums, related };
  entityCache.set(key, payload);
  return payload;
}

export async function getPlaylistDetails(playlistId: string) {
  const key = `playlist:${playlistId}`;
  const cached = entityCache.get(key);
  if (cached) return cached;

  const raw = await fetchJsonSafe<any>(`https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}`, 6000);
  if (!raw?.id) return null;

  const playlist = mapDeezerPlaylist(raw);
  const tracks: MusicTrack[] = Array.isArray(raw?.tracks?.data)
    ? raw.tracks.data.map((t: any) => mapDeezerTrack(t))
    : [];
  const payload = { playlist, tracks };
  entityCache.set(key, payload);
  return payload;
}

export async function getGenreCatalog(genreId: string, genreName = '') {
  const key = `genre:${genreId}:${genreName}`;
  const cached = entityCache.get(key);
  if (cached) return cached;

  const [artistsRes, radiosRes, searchTracks] = await Promise.all([
    fetchJsonSafe<any>(`https://api.deezer.com/genre/${encodeURIComponent(genreId)}/artists`, 6000),
    fetchJsonSafe<any>(`https://api.deezer.com/chart/${encodeURIComponent(genreId)}/tracks?limit=25`, 6000),
    genreName
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/track?q=${encodeURIComponent(genreName)}&limit=25`, 6000)
      : Promise.resolve(null),
  ]);

  const artists: MusicArtistRef[] = Array.isArray(artistsRes?.data)
    ? artistsRes.data.slice(0, 18).map((a: any) => mapDeezerArtist(a))
    : [];
  const chartTracks: MusicTrack[] = Array.isArray(radiosRes?.data)
    ? radiosRes.data.map((t: any) => mapDeezerTrack(t))
    : [];
  const fallbackTracks: MusicTrack[] = Array.isArray(searchTracks?.data)
    ? searchTracks.data.map((t: any) => mapDeezerTrack(t))
    : [];

  const payload = {
    artists,
    tracks: chartTracks.length > 0 ? chartTracks : fallbackTracks,
  };
  entityCache.set(key, payload);
  return payload;
}

function parseLrcLyrics(lrc: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const rawLine of lrc.split('\n')) {
    const match = rawLine.match(/^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
    if (!match) continue;
    const min = Number(match[1]);
    const sec = Number(match[2]);
    const msStr = (match[3] || '0').padEnd(3, '0').slice(0, 3);
    const timeSec = min * 60 + sec + Number(msStr) / 1000;
    const text = match[4].trim();
    lines.push({ timeSec, text: text || '♪' });
  }
  return lines;
}

export async function getTrackLyrics(params: {
  artist: string;
  title: string;
  album?: string;
  durationSec?: number;
}): Promise<LyricsPayload> {
  const cleanArtist = params.artist.split(',')[0].trim();
  const cleanTitle = params.title.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim() || params.title;
  const key = `${cleanArtist.toLowerCase()}|${cleanTitle.toLowerCase()}`;
  const cached = lyricsCache.get(key);
  if (cached) return cached;

  const qs = new URLSearchParams({
    artist_name: cleanArtist,
    track_name: cleanTitle,
  });
  if (params.album) qs.set('album_name', params.album);
  if (params.durationSec && params.durationSec > 10) qs.set('duration', String(Math.round(params.durationSec)));

  let hit = await fetchJsonSafe<any>(`https://lrclib.net/api/get?${qs.toString()}`, 5500);
  if (!hit?.syncedLyrics && !hit?.plainLyrics) {
    const list = await fetchJsonSafe<any[]>(
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}`,
      5500
    );
    if (Array.isArray(list) && list.length > 0) {
      hit = list.find((item) => item?.syncedLyrics) || list[0];
    }
  }

  let payload: LyricsPayload = { found: false, synced: false, lines: [] };
  if (hit?.syncedLyrics) {
    payload = {
      found: true,
      trackName: String(hit.trackName || cleanTitle),
      artistName: String(hit.artistName || cleanArtist),
      synced: true,
      lines: parseLrcLyrics(String(hit.syncedLyrics)),
      plainLyrics: hit.plainLyrics ? String(hit.plainLyrics) : undefined,
    };
  } else if (hit?.plainLyrics) {
    const plainLines = String(hit.plainLyrics)
      .split('\n')
      .map((t, idx) => ({ timeSec: idx * 4, text: t.trim() || '♪' }));
    payload = {
      found: true,
      trackName: String(hit.trackName || cleanTitle),
      artistName: String(hit.artistName || cleanArtist),
      synced: false,
      lines: plainLines,
      plainLyrics: String(hit.plainLyrics),
    };
  }

  lyricsCache.set(key, payload);
  return payload;
}

async function resolveYouTubeAudioStream(
  videoId: string
): Promise<{ sourceType: 'audio-mp3'; url: string; label: string } | null> {
  const cleanId = String(videoId || '').trim();
  if (!cleanId || cleanId.length !== 11) return null;
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.60.19',
            androidSdkVersion: 32,
            userAgent:
              'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
          },
        },
        videoId: cleanId,
        contentCheckOk: true,
        racyOk: true,
      }),
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data?.playabilityStatus?.status !== 'OK') return null;

    const formats: any[] = [
      ...(Array.isArray(data?.streamingData?.adaptiveFormats)
        ? data.streamingData.adaptiveFormats
        : []),
      ...(Array.isArray(data?.streamingData?.formats) ? data.streamingData.formats : []),
    ];
    const audioOnly = formats.filter(
      (f) => f?.url && String(f?.mimeType || '').toLowerCase().startsWith('audio/')
    );
    if (audioOnly.length === 0) return null;

    // Prefer itag 140 (128kbps AAC-LC MP4) for universal Safari/iOS + Chrome/Android hardware decode & seeking
    const preferredOrder = [140, 141, 139, 251, 250, 249];
    audioOnly.sort((a, b) => {
      const ia = preferredOrder.indexOf(Number(a?.itag || 0));
      const ib = preferredOrder.indexOf(Number(b?.itag || 0));
      const ra = ia === -1 ? 99 : ia;
      const rb = ib === -1 ? 99 : ib;
      if (ra !== rb) return ra - rb;
      return Number(b?.bitrate || 0) - Number(a?.bitrate || 0);
    });

    const best = audioOnly[0];
    if (!best?.url) return null;

    return {
      sourceType: 'audio-mp3',
      url: String(best.url),
      label: 'Audio HD · Directo 8D',
    };
  } catch {
    return null;
  }
}

export async function resolveTrackPlayback(params: {
  title: string;
  artist: string;
  durationSec?: number;
  previewUrl?: string;
  soundcloudId?: string;
  audiusId?: string;
  youtubeVideoId?: string;
  preferVideo?: boolean;
  preferAudio?: boolean;
}): Promise<ResolvedTrackPlayback> {
  const durationSec = Number(params.durationSec || 0);
  const preferAudio = Boolean(params.preferAudio);
  const key = `${params.artist.toLowerCase()}|${params.title.toLowerCase()}|${durationSec}|${params.audiusId || ''}|${params.soundcloudId || ''}|${params.youtubeVideoId || ''}${preferAudio ? '|audio8d' : ''}`;
  const cached = playbackCache.get(key);
  if (cached) return cached;

  if (params.audiusId) {
    const streamUrl = `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(params.audiusId)}/stream?app_name=RIFFAN`;
    const fastAu: ResolvedTrackPlayback = {
      sourceType: 'audio-mp3',
      sourceLabel: 'Audius Hi-Fi',
      streamUrl,
      proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(streamUrl)}`,
      youtubeVideoId: params.youtubeVideoId,
      youtubeMvId: params.youtubeVideoId,
      previewUrl: params.previewUrl,
      fullLength: true,
    };
    playbackCache.set(key, fastAu);
    return fastAu;
  }

  // 0ms fast path when track carries a YouTube Video ID and direct WebAudio (8D/EQ) isn't explicitly requested
  if (params.youtubeVideoId && !preferAudio) {
    const fastYt: ResolvedTrackPlayback = {
      sourceType: 'youtube',
      sourceLabel: 'YouTube Audio HD',
      youtubeVideoId: params.youtubeVideoId,
      youtubeMvId: params.youtubeVideoId,
      previewUrl: params.previewUrl,
      fullLength: true,
    };
    playbackCache.set(key, fastYt);
    return fastYt;
  }

  // Fast direct YouTube AAC-MP4 stream when track has known youtubeVideoId & WebAudio DSP is active (exact track + duration)
  const ytDirectFastPromise =
    preferAudio && params.youtubeVideoId
      ? resolveYouTubeAudioStream(params.youtubeVideoId)
      : Promise.resolve(null);

  // Trigger SoundCloud & Audius direct streams in parallel
  const scPromise = resolveSoundCloudStream(
    params.artist,
    params.title,
    durationSec,
    params.soundcloudId,
    preferAudio,
    preferAudio
  );
  const audiusPromise = CJK_CHAR_RE.test(`${params.artist} ${params.title}`) && !preferAudio
    ? Promise.resolve(null)
    : resolveAudiusStream(params.artist, params.title, durationSec, params.audiusId, preferAudio);
  const ytPromise = params.youtubeVideoId
    ? Promise.resolve({ audioId: params.youtubeVideoId, mvId: params.youtubeVideoId })
    : resolveYouTubeMatch(params.artist, params.title, durationSec);

  type DirectStream = { sourceType: 'audio-mp3' | 'audio-hls'; url: string; label: string } | null;
  const holder: {
    ytDirect: DirectStream;
    sc: DirectStream;
    audius: DirectStream;
    yt: { audioId?: string; mvId?: string };
  } = { ytDirect: null, sc: null, audius: null, yt: {} };

  const directRace = Promise.all([
    ytDirectFastPromise.then((v) => {
      holder.ytDirect = v;
      return v;
    }),
    audiusPromise.then((v) => {
      holder.audius = v;
      return v;
    }),
    scPromise.then((v) => {
      holder.sc = v;
      return v;
    }),
  ]);

  const ytSettled = ytPromise.then(async (v) => {
    holder.yt = v;
    if (preferAudio && !params.youtubeVideoId && !holder.ytDirect && !holder.audius && !holder.sc && v.audioId) {
      holder.ytDirect = await resolveYouTubeAudioStream(v.audioId);
    }
    return v;
  });

  if (preferAudio) {
    // Resolve direct CORS-proxied stream quickly (~500ms if ytDirect hits) or cap at 6200ms
    await Promise.race([
      Promise.all([directRace, ytSettled]),
      new Promise((r) => setTimeout(r, 6200)),
    ]);
  } else {
    // Normal mode: return as soon as YouTube resolves + brief 180ms grace window for direct MP3, hard cap 2400ms
    await Promise.race([
      (async () => {
        const yt = await ytSettled;
        if (yt.audioId || yt.mvId) {
          await Promise.race([directRace, new Promise((r) => setTimeout(r, 180))]);
        } else {
          await directRace;
        }
      })(),
      new Promise((r) => setTimeout(r, 2400)),
    ]);
  }

  // Prefer exact YT Direct or SoundCloud full match ahead of general Audius search (explicit audiusId returned early at line 1486)
  const direct = holder.ytDirect || holder.sc || holder.audius;
  let result: ResolvedTrackPlayback;

  if (direct) {
    result = {
      sourceType: direct.sourceType,
      sourceLabel: direct.label,
      streamUrl: direct.url,
      proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(direct.url)}`,
      youtubeVideoId: holder.yt.audioId || holder.yt.mvId || params.youtubeVideoId,
      youtubeMvId: holder.yt.mvId || holder.yt.audioId || params.youtubeVideoId,
      previewUrl: params.previewUrl,
      fullLength: true,
    };
  } else if (preferAudio) {
    // Last-resort fallback for rare tracks with no SoundCloud/Audius/YouTube direct stream
    const fallbackYtId = holder.yt.audioId || holder.yt.mvId || params.youtubeVideoId;
    if (fallbackYtId) {
      result = {
        sourceType: 'youtube',
        sourceLabel: 'YouTube Audio HD',
        youtubeVideoId: fallbackYtId,
        youtubeMvId: holder.yt.mvId || fallbackYtId,
        previewUrl: params.previewUrl,
        fullLength: true,
      };
    } else {
      result = {
        sourceType: 'preview',
        sourceLabel: 'Preview HD (30s)',
        streamUrl: params.previewUrl,
        proxiedUrl: params.previewUrl
          ? `/api/music/stream-proxy?url=${encodeURIComponent(params.previewUrl)}`
          : undefined,
        previewUrl: params.previewUrl,
        fullLength: false,
      };
    }
  } else if (holder.yt.audioId || holder.yt.mvId) {
    result = {
      sourceType: 'youtube',
      sourceLabel: 'YouTube Audio HD',
      youtubeVideoId: holder.yt.audioId || holder.yt.mvId,
      youtubeMvId: holder.yt.mvId || holder.yt.audioId,
      previewUrl: params.previewUrl,
      fullLength: true,
    };
  } else {
    result = {
      sourceType: 'preview',
      sourceLabel: 'Preview HD (30s)',
      streamUrl: params.previewUrl,
      proxiedUrl: params.previewUrl
        ? `/api/music/stream-proxy?url=${encodeURIComponent(params.previewUrl)}`
        : undefined,
      previewUrl: params.previewUrl,
      fullLength: false,
    };
  }

  logger.info(
    {
      title: params.title,
      artist: params.artist,
      preferAudio,
      sourceType: result.sourceType,
      hasYt: Boolean(result.youtubeVideoId),
    },
    'riffan_music_resolved_playback'
  );
  if ((result.fullLength && (!preferAudio || result.sourceType !== 'youtube')) || result.proxiedUrl) {
    playbackCache.set(key, result);
  }
  return result;
}
