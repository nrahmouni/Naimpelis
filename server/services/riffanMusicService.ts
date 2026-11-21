import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import { decryptDesEcbBase64 } from '../utils/desEcb.ts';
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
  source?: 'deezer' | 'audius' | 'soundcloud' | 'youtube_music' | 'spotify' | 'jamendo' | 'radio';
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

export interface PlaybackSourceCandidate {
  id: string;
  sourceType: 'audio-hls' | 'audio-mp3' | 'preview';
  sourceLabel: string;
  streamUrl: string;
  proxiedUrl: string;
  bitrateKbps?: number;
  fullLength: boolean;
  provider: string;
  latencyMs?: number;
}

export interface ResolvedTrackPlayback {
  sourceType: 'audio-hls' | 'audio-mp3' | 'youtube' | 'preview';
  sourceLabel: string;
  streamUrl?: string;
  proxiedUrl?: string;
  youtubeVideoId?: string;
  youtubeMvId?: string;
  youtubeAltIds?: string[];
  previewUrl?: string;
  fullLength: boolean;
  spatial8dYtFallback?: boolean;
  bitrateKbps?: number;
  provider?: string;
  alternatives?: PlaybackSourceCandidate[];
}

interface ProviderStat {
  okCount: number;
  failCount: number;
  avgLatencyMs: number;
}

const providerTelemetry = new Map<string, ProviderStat>();
let audiusHostCache: { host: string; expiresAt: number } | null = null;

function recordProviderTelemetry(provider: string, latencyMs: number, ok: boolean): void {
  const prev = providerTelemetry.get(provider) || { okCount: 1, failCount: 0, avgLatencyMs: latencyMs };
  const total = prev.okCount + prev.failCount + 1;
  const nextAvg = Math.round((prev.avgLatencyMs * (total - 1) + latencyMs) / total);
  providerTelemetry.set(provider, {
    okCount: prev.okCount + (ok ? 1 : 0),
    failCount: prev.failCount + (ok ? 0 : 1),
    avgLatencyMs: nextAvg,
  });
}

function getProviderHealthBonus(provider: string): number {
  const st = providerTelemetry.get(provider);
  if (!st) return 0;
  const total = st.okCount + st.failCount;
  const rate = st.okCount / Math.max(1, total);
  const latencyPenalty = Math.min(20, st.avgLatencyMs / 250);
  return rate * 25 - latencyPenalty;
}

async function getAudiusMirrorHost(): Promise<string> {
  if (audiusHostCache && audiusHostCache.expiresAt > Date.now()) {
    return audiusHostCache.host;
  }
  try {
    const res = await fetchJsonSafe<{ data?: string[] }>('https://api.audius.co', 2500);
    const first = Array.isArray(res?.data) ? res.data.find((h) => typeof h === 'string' && h.startsWith('http')) : '';
    if (first) {
      const clean = first.replace(/\/+$/, '');
      audiusHostCache = { host: clean, expiresAt: Date.now() + 20 * 60 * 1000 };
      return clean;
    }
  } catch {
    // fallback below
  }
  return 'https://discoveryprovider.audius.co';
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
        'User-Agent': 'RiffanMusic/1.0 (+https://riffan.ai.studio)',
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

export async function warmMusicPlaybackEngine(): Promise<void> {
  await Promise.allSettled([
    getSoundCloudClientId(true),
    getAudiusMirrorHost(),
  ]);
}

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
  try {
    const res = await fetch('https://soundcloud.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const scripts = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g)].map((m) => m[0]);
    const recentScripts = scripts.slice(-4).reverse();
    const jsTexts = await Promise.all(
      recentScripts.map((sUrl) =>
        fetch(sUrl, { signal: AbortSignal.timeout(3500) })
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

function normalizeRawWithTags(s: string): string {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const GENERIC_ARTIST_NAMES = new Set(['varios', 'various artists', 'artistas varios', 'artista', 'unknown', 'va']);

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
    } else if (w.length >= 2 || /^\d+$/.test(w)) {
      tokens.add(w);
    }
  }
  return tokens;
}

function tokenMatchMetrics(expected: string, candidate: string): { recall: number; precision: number; f1: number; hits: number } {
  const ta = tokenizeForMatch(expected);
  const tb = tokenizeForMatch(candidate);
  if (ta.size === 0 || tb.size === 0) return { recall: 0, precision: 0, f1: 0, hits: 0 };
  let hits = 0;
  for (const w of ta) {
    if (tb.has(w)) hits++;
  }
  const recall = hits / ta.size;
  const precision = hits / tb.size;
  const f1 = hits > 0 ? (2 * recall * precision) / (recall + precision) : 0;
  return { recall, precision, f1, hits };
}

function tokenOverlapScore(a: string, b: string): number {
  return tokenMatchMetrics(a, b).recall;
}

function extractPrimaryArtist(artist: string): string {
  return String(artist || '')
    .split(/,|&|\bfeat\.?\b|\bft\.?\b|\bx\b/i)[0]
    .trim();
}

const VARIANT_MODIFIER_RE =
  /\b(remix|bootleg|flip|mashup|megamix|sped up|slowed|reverb|nightcore|karaoke|instrumental|tribute|cover version|cover|piano cover|guitar cover|8d|8-bit|midi|lofi|lo-fi|parody|parodia|acapella|a capella|acoustic|acustico|acústico|live|en vivo|en directo|type beat|beat|snippet|preview|teaser|trailer|demo|leak|loop|chipmunk|bass boosted|earrape|orchestral|symphony|ringtone|reaction|interview|podcast|tutorial|1 hour|10 hours|pitched)\b/i;

const VERSION_INTENT_TOKENS = [
  'remix',
  'live',
  'en vivo',
  'en directo',
  'acoustic',
  'acustico',
  'instrumental',
  'sped up',
  'slowed',
  'nightcore',
  'radio edit',
  'extended',
  'remastered',
  'deluxe',
  'version',
  'part 2',
  'pt 2',
];

function extractTitleOnlyWithoutTrailingFeat(rawTitle: string): string {
  return String(rawTitle || '')
    .replace(/\([^)]*\b(?:feat|ft|con|with)\.?\b[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*\b(?:feat|ft|con|with)\.?\b[^\]]*\]/gi, ' ')
    .replace(/\s+\b(?:feat|ft)\.?\s+[^([]+$/i, ' ')
    .trim();
}

export function isStrictTrackMatch(params: {
  expectedArtist: string;
  expectedTitle: string;
  candidateArtist: string;
  candidateTitle: string;
  expectedDurationSec?: number;
  candidateDurationSec?: number;
  maxDurationDeltaSec?: number;
}): { ok: boolean; score: number } {
  const cleanExpTitle =
    params.expectedTitle.replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, ' ').trim() ||
    params.expectedTitle;
  const primaryExpArtist = extractPrimaryArtist(params.expectedArtist);
  const candTitleRaw = String(params.candidateTitle || '');
  let candArtist = String(params.candidateArtist || '').trim();
  let candTitle = candTitleRaw.trim();

  // Extract artist from "Artist - Title" if uploader/artist field is empty or generic
  if (!candArtist || GENERIC_ARTIST_NAMES.has(normalizeStr(candArtist)) || normalizeStr(candArtist) === 'youtube music') {
    const dashSplit = candTitleRaw.match(/^(.{2,45}?)\s+[-–—]\s+(.{2,})$/);
    if (dashSplit) {
      candArtist = dashSplit[1].trim();
      candTitle = dashSplit[2].trim();
    }
  }

  const candCombined = `${candArtist} ${candTitle}`.trim();

  const expDur = Number(params.expectedDurationSec || 0);
  const candDur = Number(params.candidateDurationSec || 0);
  if (candDur > 0 && (candDur < 45 || candDur > 900)) {
    return { ok: false, score: -1 };
  }
  const maxDelta = params.maxDurationDeltaSec ?? 25;
  if (expDur > 35 && candDur > 35 && Math.abs(candDur - expDur) > maxDelta) {
    return { ok: false, score: -1 };
  }

  // Reject unrequested variants unless explicitly requested in expected title/artist
  const expectedTags = normalizeRawWithTags(`${params.expectedArtist} ${params.expectedTitle}`);
  const candTags = normalizeRawWithTags(`${params.candidateArtist} ${candTitleRaw}`);
  const variantMatch = candTags.match(VARIANT_MODIFIER_RE);
  if (variantMatch) {
    const modWord = variantMatch[0].toLowerCase();
    if (!expectedTags.includes(modWord)) {
      return { ok: false, score: -1 };
    }
  }
  // If expected explicitly specifies Remix / Live / Acoustic, require candidate to match that intent too
  for (const intent of VERSION_INTENT_TOKENS) {
    if (expectedTags.includes(intent) && !candTags.includes(intent)) {
      if (intent === 'remix' || intent === 'live' || intent === 'acoustic' || intent === 'instrumental') {
        return { ok: false, score: -1 };
      }
    }
  }

  // Always block karaoke/reaction/podcast/tribute unless explicitly asked
  if (
    !/\b(karaoke|reaction|podcast|tribute)\b/i.test(expectedTags) &&
    /\b(karaoke|reaction|podcast|tribute)\b/i.test(candTags)
  ) {
    return { ok: false, score: -1 };
  }

  const normExpTitle = normalizeStr(cleanExpTitle);
  const cleanCandTitleNoFeat = extractTitleOnlyWithoutTrailingFeat(candTitle);
  const normCandTitle = normalizeStr(cleanCandTitleNoFeat || candTitle);
  const normExpArtist = normalizeStr(primaryExpArtist);
  const normCandArtist = normalizeStr(candArtist);
  const normCandCombined = normalizeStr(candCombined);

  if (!normExpTitle || !normCandTitle) return { ok: false, score: -1 };

  const titleM = tokenMatchMetrics(cleanExpTitle, cleanCandTitleNoFeat || candTitle);
  const expTokenCount = tokenizeForMatch(cleanExpTitle).size;
  const candTokenCount = tokenizeForMatch(cleanCandTitleNoFeat || candTitle).size;

  // Strict title matching — never let short substring bypass or uploader leakage pass unrelated tracks
  if (normExpTitle !== normCandTitle) {
    if (expTokenCount <= 1 || normExpTitle.length <= 5) {
      // Single-word or very short titles ("Love", "Solo", "Stay", "Dile") must match essentially all candidate title words
      if (titleM.recall < 1 || titleM.precision < 0.72 || candTokenCount > expTokenCount + 1) {
        return { ok: false, score: -1 };
      }
    } else if (expTokenCount === 2) {
      if (titleM.recall < 1 || titleM.f1 < 0.72) {
        return { ok: false, score: -1 };
      }
    } else {
      if (titleM.recall < 0.8 || titleM.f1 < 0.65) {
        return { ok: false, score: -1 };
      }
    }
  }

  // Strict Artist verification: prevent 1-of-2 word collisions like "Justin" matching "Justin Bieber"
  const hasRealArtist = normExpArtist.length >= 2 && !GENERIC_ARTIST_NAMES.has(normExpArtist);
  let artScore = 0;
  if (hasRealArtist) {
    const artDirect = tokenMatchMetrics(primaryExpArtist, candArtist);
    const artCombined = tokenMatchMetrics(primaryExpArtist, candCombined);
    const fullArtistDirect = tokenMatchMetrics(params.expectedArtist, candArtist);
    const expArtistTokens = tokenizeForMatch(primaryExpArtist);
    const artistExactPhrase =
      normExpArtist.length >= 3 &&
      (normCandArtist.includes(normExpArtist) || normCandCombined.includes(normExpArtist));

    const bestArtRecall = Math.max(artDirect.recall, artCombined.recall, fullArtistDirect.recall);
    const minArtRecall = expArtistTokens.size <= 2 ? 0.99 : 0.75;

    if (!artistExactPhrase && bestArtRecall < minArtRecall) {
      return { ok: false, score: -1 };
    }
    artScore = artistExactPhrase ? 1.0 : bestArtRecall;
  }

  const durPenalty = expDur > 35 && candDur > 35 ? Math.min(0.45, Math.abs(candDur - expDur) / 60) : 0;
  const totalScore =
    titleM.f1 * 1.5 +
    titleM.recall * 0.7 +
    artScore * 1.3 +
    (normExpTitle === normCandTitle ? 0.45 : 0) -
    durPenalty;

  return { ok: true, score: totalScore };
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

async function resolveYouTubeMatch(
  artist: string,
  title: string,
  durationSec: number
): Promise<{ audioId?: string; mvId?: string; altIds?: string[] }> {
  const cleanArtist = artist.split(',')[0].trim();
  const query = `${cleanArtist} ${title}`.trim();
  try {
    // 1. Fast structured YouTube Music search (~250-500ms, returns official Topic studio tracks first)
    const ytm = await searchYouTubeMusic(query);
    if (ytm.tracks.length > 0) {
      const scored = ytm.tracks
        .filter((t) => t.youtubeVideoId)
        .map((t) => {
          const check = isStrictTrackMatch({
            expectedArtist: artist,
            expectedTitle: title,
            candidateArtist: t.artist.name,
            candidateTitle: t.title,
            expectedDurationSec: durationSec,
            candidateDurationSec: t.durationSec,
            maxDurationDeltaSec: 35,
          });
          return {
            id: t.youtubeVideoId!,
            ok: check.ok,
            score: check.score,
          };
        })
        .filter((x) => x.ok)
        .sort((a, b) => b.score - a.score);
      if (scored[0]?.id) {
        const uniqueIds = Array.from(new Set(scored.map((x) => x.id))).slice(0, 3);
        return {
          audioId: uniqueIds[0],
          mvId: uniqueIds[0],
          altIds: uniqueIds.slice(1),
        };
      }
    }

    // 2. Fallback to YouTube web search HTML only if YTM yielded nothing
    const candidates = await searchYouTubeHtmlFallback(
      CJK_CHAR_RE.test(query) ? query : `${query} official audio`,
      durationSec
    );
    const verified = candidates.filter((c) =>
      isStrictTrackMatch({
        expectedArtist: artist,
        expectedTitle: title,
        candidateArtist: '',
        candidateTitle: c.title,
        expectedDurationSec: durationSec,
        candidateDurationSec: c.sec,
        maxDurationDeltaSec: 35,
      }).ok
    );
    const bestAudio = verified.find((c) => !c.isVideo) || verified[0];
    const bestMv = verified.find((c) => c.isVideo) || verified[0];
    const uniqueIds = Array.from(
      new Set([bestAudio?.id, bestMv?.id, ...verified.map((v) => v.id)].filter(Boolean) as string[])
    ).slice(0, 3);
    return {
      audioId: bestAudio?.id,
      mvId: bestMv?.id,
      altIds: uniqueIds.filter((id) => id !== bestAudio?.id),
    };
  } catch {
    return {};
  }
}

async function verifyDirectStreamUrl(url: string, timeoutMs = 3200): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        Range: 'bytes=0-512',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    void res.body?.cancel().catch(() => {});
    if (!res.ok && res.status !== 206) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('application/json')) return false;
    return true;
  } catch {
    return false;
  }
}

async function resolveJioSaavnStream(
  artist: string,
  title: string,
  durationSec: number
): Promise<{ sourceType: 'audio-mp3'; url: string; label: string } | null> {
  try {
    const primaryArtist = extractPrimaryArtist(artist);
    const cleanTitle = title.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim() || title;
    const query = `${primaryArtist} ${cleanTitle}`.trim();
    if (!query) return null;

    const candidates: Array<{ score: number; url: string }> = [];

    const res = await fetchJsonSafe<{ results?: any[] }>(
      `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=10&p=1&q=${encodeURIComponent(query)}`,
      3400
    );
    const list = Array.isArray(res?.results) ? res.results : [];
    for (const s of list) {
      const enc = s?.more_info?.encrypted_media_url;
      if (!enc || typeof enc !== 'string') continue;
      const sTitle = String(s?.title || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      const primaryArtists = String(
        s?.more_info?.artistMap?.primary_artists?.map((a: any) => a?.name).filter(Boolean).join(' ') ||
          s?.subtitle ||
          ''
      );
      const sDur = Number(s?.more_info?.duration || 0);
      const check = isStrictTrackMatch({
        expectedArtist: artist,
        expectedTitle: title,
        candidateArtist: primaryArtists,
        candidateTitle: sTitle,
        expectedDurationSec: durationSec,
        candidateDurationSec: sDur,
        maxDurationDeltaSec: 28,
      });
      if (!check.ok) continue;

      const decrypted = decryptDesEcbBase64(enc, '38346591').trim();
      if (!decrypted || !decrypted.startsWith('http')) continue;
      const hiUrl = decrypted.replace(/_96\.mp4$/, '_320.mp4');
      candidates.push({ score: check.score, url: hiUrl });
    }

    candidates.sort((a, b) => b.score - a.score);
    const topUrls = Array.from(new Set(candidates.map((c) => c.url))).slice(0, 2);
    for (const hiUrl of topUrls) {
      const fallback160 = hiUrl.replace(/_320\.mp4$/, '_160.mp4');
      const [ok320, ok160] = await Promise.all([
        verifyDirectStreamUrl(hiUrl, 3200),
        fallback160 !== hiUrl ? verifyDirectStreamUrl(fallback160, 2800) : Promise.resolve(false),
      ]);
      if (ok320) return { sourceType: 'audio-mp3', url: hiUrl, label: 'Hi-Fi 320kbps', bitrateKbps: 320 } as any;
      if (ok160) return { sourceType: 'audio-mp3', url: fallback160, label: 'Hi-Fi 160kbps', bitrateKbps: 160 } as any;
    }
  } catch {
    // ignore transient JioSaavn errors
  }
  return null;
}

async function resolveSoundCloudStream(
  artist: string,
  title: string,
  durationSec: number,
  explicitScId?: string,
  allowScrape = true
): Promise<{ sourceType: 'audio-mp3' | 'audio-hls'; url: string; label: string; bitrateKbps?: number } | null> {
  try {
    const cid = await getSoundCloudClientId(allowScrape);
    if (!cid) return null;

    let candidates: any[] = [];
    let isExplicitIdLookup = false;
    if (explicitScId) {
      const single = await fetchJsonSafe<any>(
        `https://api-v2.soundcloud.com/tracks/${encodeURIComponent(explicitScId)}?client_id=${cid}`,
        2200
      );
      if (single?.id) {
        candidates = [single];
        isExplicitIdLookup = true;
      }
    }

    const primaryArtist = extractPrimaryArtist(artist);
    const cleanTitle = title.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim() || title;
    if (candidates.length === 0) {
      const q = `${primaryArtist} ${cleanTitle}`.trim();
      const sr = await fetchJsonSafe<any>(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=14`,
        2400
      );
      candidates = Array.isArray(sr?.collection) ? sr.collection : [];
    }

    const isUnencryptedPlayable = (x: any): boolean => {
      if (!x || x.snipped) return false;
      const proto = String(x?.format?.protocol || '').toLowerCase();
      return proto === 'progressive' || proto === 'hls';
    };

    const valid = candidates
      .map((t) => {
        if (!t || t.policy === 'SNIP' || t.snipped) return null;
        const fullDur = Number(t?.full_duration || t?.duration || 0);
        const playDur = Number(t?.duration || fullDur || 0);
        if (fullDur > 45_000 && playDur > 0 && fullDur - playDur > 15_000) {
          // Go+ 30-second snipped preview masquerading as full track
          return null;
        }
        const trans = t?.media?.transcodings;
        if (!Array.isArray(trans) || trans.length === 0) return null;
        if (!trans.some(isUnencryptedPlayable)) return null;
        const tDur = fullDur / 1000;
        if (tDur < 45) return null;

        if (isExplicitIdLookup) {
          return { track: t, score: 10 };
        }

        const check = isStrictTrackMatch({
          expectedArtist: artist,
          expectedTitle: title,
          candidateArtist: String(t?.user?.username || ''),
          candidateTitle: String(t?.title || ''),
          expectedDurationSec: durationSec,
          candidateDurationSec: tDur,
          maxDurationDeltaSec: 25,
        });
        if (!check.ok) return null;

        const hasProg = trans.some(
          (x: any) => !x?.snipped && String(x?.format?.protocol || '').toLowerCase() === 'progressive'
        );
        const verifiedBonus = t?.user?.verified ? 0.12 : 0;
        return { track: t, score: check.score + (hasProg ? 0.15 : 0) + verifiedBonus };
      })
      .filter((x): x is { track: any; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score);

    for (const { track: chosen } of valid.slice(0, 2)) {
      const transcodings = (chosen.media.transcodings as any[]).filter(isUnencryptedPlayable);
      const prog = transcodings.find((x) => String(x.format?.protocol || '').toLowerCase() === 'progressive');
      const hls =
        transcodings.find(
          (x) => String(x.format?.protocol || '').toLowerCase() === 'hls' && String(x.preset || '').includes('aac')
        ) || transcodings.find((x) => String(x.format?.protocol || '').toLowerCase() === 'hls');

      const picked = prog || hls;
      if (!picked?.url) continue;

      const streamInfo = await fetchJsonSafe<{ url?: string }>(`${picked.url}?client_id=${cid}`, 2000);
      if (!streamInfo?.url || !streamInfo.url.startsWith('http')) continue;

      const isProg = String(picked.format?.protocol || '').toLowerCase() === 'progressive';
      return {
        sourceType: isProg ? 'audio-mp3' : 'audio-hls',
        url: streamInfo.url,
        label: isProg ? 'SoundCloud MP3 128k' : 'SoundCloud HLS AAC',
        bitrateKbps: isProg ? 128 : 160,
      };
    }
  } catch {
    // ignore transient SC scrape issues
  }
  return null;
}

async function resolveAudiusStream(artist: string, title: string, durationSec: number, explicitAudiusId?: string) {
  try {
    const mirrorHost = await getAudiusMirrorHost();
    if (explicitAudiusId) {
      const url = `${mirrorHost}/v1/tracks/${encodeURIComponent(explicitAudiusId)}/stream?app_name=RIFFAN`;
      return {
        sourceType: 'audio-mp3' as const,
        url,
        label: 'Audius 320kbps',
        bitrateKbps: 320,
      };
    }
    const cleanArtist = extractPrimaryArtist(artist);
    const cleanTitle = title.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim() || title;
    const q = `${cleanArtist} ${cleanTitle}`.trim();
    const res = await fetchJsonSafe<{ data?: any[] }>(
      `${mirrorHost}/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=RIFFAN`,
      1900
    );
    const items = Array.isArray(res?.data) ? res.data : [];
    const scored = items
      .map((t) => {
        const check = isStrictTrackMatch({
          expectedArtist: artist,
          expectedTitle: title,
          candidateArtist: String(t?.user?.name || ''),
          candidateTitle: String(t?.title || ''),
          expectedDurationSec: durationSec,
          candidateDurationSec: Number(t?.duration || 0),
          maxDurationDeltaSec: 28,
        });
        return check.ok ? { hit: t, score: check.score } : null;
      })
      .filter((x): x is { hit: any; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score);

    const hit = scored[0]?.hit;
    if (hit?.id) {
      return {
        sourceType: 'audio-mp3' as const,
        url: `${mirrorHost}/v1/tracks/${encodeURIComponent(hit.id)}/stream?app_name=RIFFAN`,
        label: 'Audius 320kbps',
        bitrateKbps: 320,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

async function resolveArchiveAudioFallback(
  artist: string,
  title: string,
  durationSec = 0
): Promise<{ sourceType: 'audio-mp3'; url: string; label: string; bitrateKbps?: number } | null> {
  try {
    const cleanArtist = extractPrimaryArtist(artist);
    const cleanTitle = title.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim() || title;
    if (!cleanArtist || !cleanTitle) return null;
    const q = `("${cleanArtist}" AND "${cleanTitle}") AND mediatype:audio`;
    const res = await fetchJsonSafe<{ response?: { docs?: Array<{ identifier?: string; title?: string; creator?: string | string[] }> } }>(
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&rows=4&output=json`,
      2200
    );
    const docs = Array.isArray(res?.response?.docs) ? res.response.docs : [];
    for (const d of docs.slice(0, 3)) {
      if (!d?.identifier) continue;
      const docArtist = Array.isArray(d.creator) ? d.creator.join(' ') : String(d.creator || '');
      const docTitle = String(d.title || '');
      const docMatch = isStrictTrackMatch({
        expectedArtist: artist,
        expectedTitle: title,
        candidateArtist: docArtist,
        candidateTitle: docTitle || d.identifier,
        expectedDurationSec: durationSec,
      });
      if (!docMatch.ok) continue;

      const meta = await fetchJsonSafe<{ files?: Array<{ name?: string; format?: string; length?: string }> }>(
        `https://archive.org/metadata/${encodeURIComponent(d.identifier)}`,
        2200
      );
      const mp3 = meta?.files?.find(
        (f) => f?.name && /\.(mp3|m4a)$/i.test(f.name) && !f.name.startsWith('__')
      );
      if (!mp3?.name) continue;
      const streamUrl = `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(mp3.name)}`;
      if (await verifyDirectStreamUrl(streamUrl, 1500)) {
        return { sourceType: 'audio-mp3', url: streamUrl, label: 'Archive Hi-Fi 192k', bitrateKbps: 192 };
      }
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
    ytFallbackTracks = ytHtml.slice(0, 12).map((v) => {
      const sepMatch = v.title.match(/^(.{2,45}?)\s+[-–—]\s+(.{2,})$/);
      const parsedArtist = sepMatch ? sepMatch[1].trim() : 'Artista';
      const parsedTitle = sepMatch ? sepMatch[2].replace(/\([^)]*official[^)]*\)/gi, '').trim() : v.title;
      return {
        id: `ytm-${v.id}`,
        title: parsedTitle || v.title,
        artist: {
          id: `ytm-art-${encodeURIComponent(parsedArtist.toLowerCase())}`,
          name: parsedArtist,
          picture: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        },
        album: {
          id: `ytm-alb-trk-${v.id}`,
          title: 'YouTube Music',
          cover: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          coverXl: `https://i.ytimg.com/vi/${v.id}/hq720.jpg`,
        },
        durationSec: v.sec,
        source: 'youtube_music' as const,
        youtubeVideoId: v.id,
      };
    });
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

export async function resolveTrackPlayback(params: {
  trackId?: string;
  title: string;
  artist: string;
  durationSec?: number;
  previewUrl?: string;
  soundcloudId?: string;
  audiusId?: string;
  youtubeVideoId?: string;
  isrc?: string;
  preferVideo?: boolean;
  preferAudio?: boolean;
}): Promise<ResolvedTrackPlayback> {
  const durationSec = Number(params.durationSec || 0);
  const key = `v6-full:${params.trackId || ''}|${normalizeRawWithTags(params.artist)}|${normalizeRawWithTags(params.title)}|${Math.round(durationSec / 10)}|${params.audiusId || ''}|${params.soundcloudId || ''}|${params.youtubeVideoId || ''}`;
  const cached = playbackCache.get(key);
  if (cached) return cached;

  const timed = async <T>(
    provider: string,
    fn: () => Promise<T | null>
  ): Promise<{ provider: string; value: T | null; latencyMs: number }> => {
    const t0 = Date.now();
    try {
      const value = await fn();
      const latencyMs = Date.now() - t0;
      recordProviderTelemetry(provider, latencyMs, Boolean(value));
      return { provider, value, latencyMs };
    } catch {
      const latencyMs = Date.now() - t0;
      recordProviderTelemetry(provider, latencyMs, false);
      return { provider, value: null, latencyMs };
    }
  };

  if (params.audiusId) {
    const auTimed = await timed('audius', () =>
      resolveAudiusStream(params.artist, params.title, durationSec, params.audiusId)
    );
    if (auTimed.value) {
      const cand: PlaybackSourceCandidate = {
        id: 'audius-direct',
        sourceType: 'audio-mp3',
        sourceLabel: auTimed.value.label,
        streamUrl: auTimed.value.url,
        proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(auTimed.value.url)}`,
        bitrateKbps: 320,
        fullLength: true,
        provider: 'Audius',
        latencyMs: auTimed.latencyMs,
      };
      const fastAu: ResolvedTrackPlayback = {
        sourceType: 'audio-mp3',
        sourceLabel: auTimed.value.label,
        streamUrl: auTimed.value.url,
        proxiedUrl: cand.proxiedUrl,
        youtubeVideoId: params.youtubeVideoId,
        youtubeMvId: params.youtubeVideoId,
        previewUrl: params.previewUrl,
        fullLength: true,
        bitrateKbps: 320,
        provider: 'Audius',
        alternatives: [cand],
      };
      playbackCache.set(key, fastAu);
      return fastAu;
    }
  }

  // Launch all full-length providers in parallel with fast-first early exit
  const jioP = timed('jiosaavn', () => resolveJioSaavnStream(params.artist, params.title, durationSec));
  const scP = timed('soundcloud', () =>
    resolveSoundCloudStream(params.artist, params.title, durationSec, params.soundcloudId, true)
  );
  const audiusP = timed('audius', () => resolveAudiusStream(params.artist, params.title, durationSec));
  const ytP: Promise<{ audioId?: string; mvId?: string; altIds?: string[] }> = params.youtubeVideoId
    ? Promise.resolve({ audioId: params.youtubeVideoId, mvId: params.youtubeVideoId, altIds: [] })
    : resolveYouTubeMatch(params.artist, params.title, durationSec).catch(() => ({}));

  type DirectTimed = {
    provider: string;
    value: { sourceType: 'audio-mp3' | 'audio-hls'; url: string; label: string; bitrateKbps?: number } | null;
    latencyMs: number;
  };
  let jioTimed: DirectTimed = { provider: 'jiosaavn', value: null, latencyMs: 0 };
  let scTimed: DirectTimed = { provider: 'soundcloud', value: null, latencyMs: 0 };
  let audiusTimed: DirectTimed = { provider: 'audius', value: null, latencyMs: 0 };
  let ytRes: { audioId?: string; mvId?: string; altIds?: string[] } = {};

  void jioP.then((r) => {
    jioTimed = r as DirectTimed;
  });
  void scP.then((r) => {
    scTimed = r;
  });
  void audiusP.then((r) => {
    audiusTimed = r;
  });
  void ytP.then((r) => {
    ytRes = r;
  });

  // Fast-first synchronization: return as soon as a direct audio hit arrives + 160ms grace window,
  // or after 2200ms max so slow providers never stall playback start!
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const maxTimer = setTimeout(finish, 3400);
    let graceStarted = false;
    const triggerGrace = () => {
      if (graceStarted || settled) return;
      graceStarted = true;
      setTimeout(() => {
        clearTimeout(maxTimer);
        finish();
      }, 160);
    };

    const directPromises = [jioP, scP, audiusP];
    let doneCount = 0;
    for (const p of directPromises) {
      void p.then((res) => {
        doneCount++;
        if (res?.value) {
          triggerGrace();
        } else if (doneCount === directPromises.length) {
          // None of the direct providers resolved — finish immediately once ytP resolves
          Promise.race([ytP, new Promise((r) => setTimeout(r, 1800))]).finally(() => {
            clearTimeout(maxTimer);
            finish();
          });
        }
      });
    }
  });

  const rawCandidates: Array<{ score: number; cand: PlaybackSourceCandidate }> = [];
  const pushCand = (
    id: string,
    providerKey: string,
    providerDisplay: string,
    baseQualityScore: number,
    latencyMs: number,
    res: { sourceType: 'audio-mp3' | 'audio-hls'; url: string; label: string; bitrateKbps?: number } | null
  ) => {
    if (!res?.url) return;
    rawCandidates.push({
      score: baseQualityScore + getProviderHealthBonus(providerKey),
      cand: {
        id,
        sourceType: res.sourceType,
        sourceLabel: res.label,
        streamUrl: res.url,
        proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(res.url)}`,
        bitrateKbps: res.bitrateKbps || (res.label.includes('320') ? 320 : 160),
        fullLength: true,
        provider: providerDisplay,
        latencyMs,
      },
    });
  };

  pushCand('jiosaavn', 'jiosaavn', 'Hi-Fi Mirror', 100, jioTimed.latencyMs, jioTimed.value);
  pushCand(
    'soundcloud',
    'soundcloud',
    'SoundCloud',
    scTimed.value?.sourceType === 'audio-mp3' ? 92 : 84,
    scTimed.latencyMs,
    scTimed.value
  );
  pushCand('audius', 'audius', 'Audius', 82, audiusTimed.latencyMs, audiusTimed.value);

  rawCandidates.sort((a, b) => b.score - a.score);
  const alternatives = rawCandidates.map((x) => x.cand);
  const primaryYtId = params.youtubeVideoId || ytRes?.audioId || ytRes?.mvId;
  const mvId = ytRes?.mvId || primaryYtId;
  const ytAltIds = (ytRes?.altIds || []).filter((id) => id && id !== primaryYtId);
  let result: ResolvedTrackPlayback;

  if (alternatives.length > 0) {
    const primary = alternatives[0];
    if (params.previewUrl) {
      alternatives.push({
        id: 'preview-hd',
        sourceType: 'preview',
        sourceLabel: 'Preview HD (30s)',
        streamUrl: params.previewUrl,
        proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(params.previewUrl)}`,
        bitrateKbps: 128,
        fullLength: false,
        provider: 'Preview',
      });
    }
    result = {
      sourceType: primary.sourceType,
      sourceLabel: primary.sourceLabel,
      streamUrl: primary.streamUrl,
      proxiedUrl: primary.proxiedUrl,
      youtubeVideoId: primaryYtId,
      youtubeMvId: mvId,
      youtubeAltIds: ytAltIds,
      previewUrl: params.previewUrl,
      fullLength: true,
      bitrateKbps: primary.bitrateKbps,
      provider: primary.provider,
      alternatives,
    };
  } else if (primaryYtId) {
    // Full-length Studio / Official Audio track (zero 30s truncation!)
    result = {
      sourceType: 'youtube',
      sourceLabel: 'Audio Completo HD',
      youtubeVideoId: primaryYtId,
      youtubeMvId: mvId,
      youtubeAltIds: ytAltIds,
      previewUrl: params.previewUrl,
      fullLength: true,
      bitrateKbps: 256,
      provider: 'Riffan Engine',
      alternatives: [],
    };
  } else {
    // Archive.org fallback only if neither direct MP3/HLS nor YouTube full track resolved
    const arcTimed = await timed('archive', () =>
      resolveArchiveAudioFallback(params.artist, params.title, durationSec)
    );
    pushCand('archive', 'archive', 'Archive.org', 72, arcTimed.latencyMs, arcTimed.value);
    if (rawCandidates.length > 0) {
      const arcPrimary = rawCandidates[0].cand;
      result = {
        sourceType: arcPrimary.sourceType,
        sourceLabel: arcPrimary.sourceLabel,
        streamUrl: arcPrimary.streamUrl,
        proxiedUrl: arcPrimary.proxiedUrl,
        youtubeVideoId: mvId,
        youtubeMvId: mvId,
        youtubeAltIds: ytAltIds,
        previewUrl: params.previewUrl,
        fullLength: true,
        bitrateKbps: arcPrimary.bitrateKbps,
        provider: arcPrimary.provider,
        alternatives: [arcPrimary],
      };
    } else {
      let fallbackPreview = params.previewUrl;
      if (!fallbackPreview) {
        const qTerm = `${extractPrimaryArtist(params.artist)} ${params.title}`.trim();
        const [itList, dzList] = await Promise.all([
          searchItunesMusic(qTerm, 'song', 5, 'US'),
          fetchJsonSafe<{ data?: any[] }>(
            `https://api.deezer.com/search/track?q=${encodeURIComponent(qTerm)}&limit=5`,
            2500
          ),
        ]);
        const itMatch = itList.find(
          (x) =>
            x?.previewUrl &&
            isStrictTrackMatch({
              expectedArtist: params.artist,
              expectedTitle: params.title,
              candidateArtist: String(x?.artistName || ''),
              candidateTitle: String(x?.trackName || ''),
              expectedDurationSec: durationSec,
              candidateDurationSec: x?.trackTimeMillis ? Math.round(Number(x.trackTimeMillis) / 1000) : 0,
              maxDurationDeltaSec: 35,
            }).ok
        );
        const dzMatch = dzList?.data?.find(
          (x) =>
            x?.preview &&
            isStrictTrackMatch({
              expectedArtist: params.artist,
              expectedTitle: params.title,
              candidateArtist: String(x?.artist?.name || ''),
              candidateTitle: String(x?.title || ''),
              expectedDurationSec: durationSec,
              candidateDurationSec: Number(x?.duration || 0),
              maxDurationDeltaSec: 35,
            }).ok
        );
        const hitPreview = itMatch?.previewUrl || dzMatch?.preview;
        if (hitPreview) fallbackPreview = String(hitPreview);
      }
      result = {
        sourceType: 'preview',
        sourceLabel: fallbackPreview ? 'Preview HD (30s)' : 'No Audio Stream',
        streamUrl: fallbackPreview,
        proxiedUrl: fallbackPreview
          ? `/api/music/stream-proxy?url=${encodeURIComponent(fallbackPreview)}`
          : undefined,
        youtubeMvId: mvId,
        previewUrl: fallbackPreview,
        fullLength: false,
        bitrateKbps: fallbackPreview ? 128 : undefined,
        provider: 'Preview',
        alternatives: fallbackPreview
          ? [
              {
                id: 'preview-hd',
                sourceType: 'preview',
                sourceLabel: 'Preview HD (30s)',
                streamUrl: fallbackPreview,
                proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(fallbackPreview)}`,
                bitrateKbps: 128,
                fullLength: false,
                provider: 'Preview',
              },
            ]
          : [],
      };
    }
  }

  logger.info(
    {
      title: params.title,
      artist: params.artist,
      sourceType: result.sourceType,
      sourceLabel: result.sourceLabel,
      provider: result.provider,
      altCount: alternatives.length,
      fullLength: result.fullLength,
    },
    'riffan_music_resolved_full_playback'
  );
  if (result.fullLength || result.streamUrl) {
    playbackCache.set(key, result);
  }
  return result;
}

export async function getRelatedGenreTracks(params: {
  trackId?: string;
  title: string;
  artist: string;
  album?: string;
  excludeIds?: string[];
  limit?: number;
}): Promise<{
  genreId?: string;
  genreName: string;
  seedArtist: string;
  tracks: MusicTrack[];
}> {
  const cleanTitle = String(params.title || '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim() || String(params.title || '').trim();
  const primaryArtist = String(params.artist || '').split(',')[0].split('&')[0].split('feat.')[0].trim() || String(params.artist || '').trim();
  const limit = Math.min(40, Math.max(8, Number(params.limit || 22)));
  const excludeSet = new Set((params.excludeIds || []).filter(Boolean));
  if (params.trackId) excludeSet.add(params.trackId);

  const seedNormKey = `${normalizeStr(cleanTitle)}|${normalizeStr(primaryArtist)}`;
  const cacheKey = `related:${normalizeStr(primaryArtist)}|${normalizeStr(cleanTitle)}|${params.trackId || ''}`;
  const cached = entityCache.get(cacheKey) as
    | { genreId?: string; genreName: string; seedArtist: string; tracks: MusicTrack[] }
    | undefined;

  const filterAndCap = (rawList: MusicTrack[]): MusicTrack[] => {
    const out: MusicTrack[] = [];
    const seenIds = new Set<string>();
    const seenTitleArtist = new Set<string>([seedNormKey]);
    const artistCount = new Map<string, number>();

    for (const t of rawList) {
      if (!t?.id || excludeSet.has(t.id) || seenIds.has(t.id)) continue;
      const tArtist = (t.artist?.name || '').split(',')[0].trim();
      const taKey = `${normalizeStr(t.title)}|${normalizeStr(tArtist)}`;
      if (seenTitleArtist.has(taKey)) continue;
      const artNorm = normalizeStr(tArtist) || 'unknown';
      const usedCount = artistCount.get(artNorm) || 0;
      if (usedCount >= 2 && out.length < limit - 4) continue;
      seenIds.add(t.id);
      seenTitleArtist.add(taKey);
      artistCount.set(artNorm, usedCount + 1);
      out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  };

  if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
    const filtered = filterAndCap(cached.tracks);
    if (filtered.length >= 6) {
      return {
        genreId: cached.genreId,
        genreName: cached.genreName,
        seedArtist: cached.seedArtist,
        tracks: filtered,
      };
    }
  }

  let dzArtistId = '';
  let dzAlbumId = '';

  if (params.trackId?.startsWith('dz-')) {
    const dzId = params.trackId.slice(3);
    const dzTrackRaw = await fetchJsonSafe<any>(`https://api.deezer.com/track/${encodeURIComponent(dzId)}`, 3500);
    if (dzTrackRaw?.artist?.id) dzArtistId = String(dzTrackRaw.artist.id);
    if (dzTrackRaw?.album?.id) dzAlbumId = String(dzTrackRaw.album.id);
  }

  if (!dzArtistId && (primaryArtist || cleanTitle)) {
    const q = encodeURIComponent(`${primaryArtist} ${cleanTitle}`.trim());
    const dzSearch = await fetchJsonSafe<any>(`https://api.deezer.com/search/track?q=${q}&limit=4`, 3500);
    const first = Array.isArray(dzSearch?.data) ? dzSearch.data[0] : null;
    if (first?.artist?.id) dzArtistId = String(first.artist.id);
    if (!dzAlbumId && first?.album?.id) dzAlbumId = String(first.album.id);

    if (!dzArtistId && primaryArtist) {
      const artSearch = await fetchJsonSafe<any>(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(primaryArtist)}&limit=2`,
        3000
      );
      const artHit = Array.isArray(artSearch?.data) ? artSearch.data[0] : null;
      if (artHit?.id) dzArtistId = String(artHit.id);
    }
  }

  let genreId = '';
  let genreName = '';

  const [albumRaw, relatedArtistsRaw, artistTopRaw, itSeedHits] = await Promise.all([
    dzAlbumId
      ? fetchJsonSafe<any>(`https://api.deezer.com/album/${encodeURIComponent(dzAlbumId)}`, 3500)
      : Promise.resolve(null),
    dzArtistId
      ? fetchJsonSafe<any>(`https://api.deezer.com/artist/${encodeURIComponent(dzArtistId)}/related?limit=12`, 3500)
      : Promise.resolve(null),
    dzArtistId
      ? fetchJsonSafe<any>(`https://api.deezer.com/artist/${encodeURIComponent(dzArtistId)}/top?limit=10`, 3500)
      : Promise.resolve(null),
    searchItunesMusic(`${primaryArtist} ${cleanTitle}`.trim(), 'song', 4, CJK_CHAR_RE.test(cleanTitle) ? 'TW' : 'US'),
  ]);

  if (albumRaw) {
    if (albumRaw.genre_id && Number(albumRaw.genre_id) > 0) {
      genreId = String(albumRaw.genre_id);
    }
    if (Array.isArray(albumRaw?.genres?.data) && albumRaw.genres.data[0]?.name) {
      genreName = String(albumRaw.genres.data[0].name);
      if (!genreId && albumRaw.genres.data[0].id) {
        genreId = String(albumRaw.genres.data[0].id);
      }
    }
  }

  if (!genreName && Array.isArray(itSeedHits) && itSeedHits[0]?.primaryGenreName) {
    genreName = String(itSeedHits[0].primaryGenreName);
  }

  const relatedArtistIds: string[] = Array.isArray(relatedArtistsRaw?.data)
    ? relatedArtistsRaw.data.slice(0, 6).map((a: any) => String(a?.id || '')).filter(Boolean)
    : [];

  const [relatedTopSettled, genreChartRaw, genreSearchRaw, itGenreSongs] = await Promise.all([
    Promise.allSettled(
      relatedArtistIds.map((aid) =>
        fetchJsonSafe<any>(`https://api.deezer.com/artist/${encodeURIComponent(aid)}/top?limit=6`, 3500)
      )
    ),
    genreId
      ? fetchJsonSafe<any>(`https://api.deezer.com/chart/${encodeURIComponent(genreId)}/tracks?limit=24`, 3500)
      : Promise.resolve(null),
    genreName
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/track?q=${encodeURIComponent(genreName)}&limit=18`, 3500)
      : Promise.resolve(null),
    genreName || primaryArtist
      ? searchItunesMusic(genreName || primaryArtist, 'song', 14, CJK_CHAR_RE.test(cleanTitle) ? 'TW' : 'US')
      : Promise.resolve([]),
  ]);

  const relatedArtistsTrackLists: MusicTrack[][] = [];
  for (const r of relatedTopSettled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value?.data)) {
      relatedArtistsTrackLists.push(r.value.data.map((t: any) => mapDeezerTrack(t)));
    }
  }

  const relatedInterleaved = interleaveUniqueTracks(relatedArtistsTrackLists, 28);
  const genreChartTracks = mapDeezerTracksSafe(genreChartRaw?.data);
  const genreSearchTracks = mapDeezerTracksSafe(genreSearchRaw?.data);
  const artistTopTracks = mapDeezerTracksSafe(artistTopRaw?.data);
  const itGenreMapped = Array.isArray(itGenreSongs)
    ? itGenreSongs.map((x: any) => mapItunesSongToTrack(x, 'spotify'))
    : [];

  let ytmFallback: MusicTrack[] = [];
  if (relatedInterleaved.length + genreChartTracks.length + itGenreMapped.length < 10) {
    const ytm = await searchYouTubeMusic(`${genreName || primaryArtist} mix`);
    ytmFallback = ytm.tracks || [];
  }

  const combinedPool = interleaveUniqueTracks(
    [relatedInterleaved, genreChartTracks, genreSearchTracks, itGenreMapped, artistTopTracks, ytmFallback],
    48
  );

  const finalGenreLabel = genreName || (primaryArtist ? `${primaryArtist} Mix` : 'Radio Mix');
  if (combinedPool.length > 0) {
    entityCache.set(cacheKey, {
      genreId: genreId || undefined,
      genreName: finalGenreLabel,
      seedArtist: primaryArtist || 'Radio',
      tracks: combinedPool,
    });
  }

  return {
    genreId: genreId || undefined,
    genreName: finalGenreLabel,
    seedArtist: primaryArtist || 'Radio',
    tracks: filterAndCap(combinedPool),
  };
}

