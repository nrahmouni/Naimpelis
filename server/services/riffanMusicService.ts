import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';

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
  source?: 'deezer' | 'audius' | 'soundcloud' | 'radio';
  audiusId?: string;
  soundcloudId?: string;
  youtubeVideoId?: string;
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
}

const homeCache = new LruTtlCache<string, Record<string, unknown>>(8, 12 * 60 * 1000);
const searchCache = new LruTtlCache<string, Record<string, unknown>>(120, 8 * 60 * 1000);
const entityCache = new LruTtlCache<string, Record<string, unknown>>(160, 15 * 60 * 1000);
const lyricsCache = new LruTtlCache<string, LyricsPayload>(250, 60 * 60 * 1000);
const playbackCache = new LruTtlCache<string, ResolvedTrackPlayback>(300, 12 * 60 * 1000);
const radioCache = new LruTtlCache<string, MusicRadioStation[]>(12, 20 * 60 * 1000);

let scClientIdCache: { id: string; expiresAt: number } | null = null;

const GENRE_COLOR_MAP: Record<string, string> = {
  Pop: '#148A08',
  'Rap/Hip Hop': '#BA5D07',
  Rock: '#E91429',
  Dance: '#0D73EC',
  'R&B': '#DC148C',
  Alternative: '#477D95',
  Electro: '#006450',
  Latin: '#E13300',
  Reggaeton: '#8D67AB',
  Flamenco: '#B02897',
  Jazz: '#1E3264',
  Classical: '#7D4B32',
  Soul: '#AF2896',
  Metal: '#503750',
  Folk: '#537AA1',
};

const GENRE_COLORS_FALLBACK = [
  '#1DB954',
  '#E13300',
  '#0D73EC',
  '#BA5D07',
  '#8D67AB',
  '#E91429',
  '#006450',
  '#1E3264',
  '#B02897',
  '#477D95',
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

async function getSoundCloudClientId(): Promise<string> {
  if (scClientIdCache && scClientIdCache.expiresAt > Date.now()) {
    return scClientIdCache.id;
  }
  try {
    const res = await fetch('https://soundcloud.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const scripts = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g)].map((m) => m[0]);
    for (const sUrl of scripts.slice(-5).reverse()) {
      const jsRes = await fetch(sUrl, { signal: AbortSignal.timeout(4500) });
      if (!jsRes.ok) continue;
      const js = await jsRes.text();
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
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = new Set(normalizeStr(a).split(' ').filter((w) => w.length >= 2));
  const tb = new Set(normalizeStr(b).split(' ').filter((w) => w.length >= 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const w of ta) {
    if (tb.has(w)) hits++;
  }
  return hits / Math.max(ta.size, 1);
}

async function resolveYouTubeMatch(artist: string, title: string, durationSec: number): Promise<{ audioId?: string; mvId?: string }> {
  const cleanArtist = artist.split(',')[0].trim();
  const query = `${cleanArtist} ${title}`.trim();
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} official audio`)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!res.ok) return {};
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
    for (const vr of items.slice(0, 14)) {
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
      if (/\b(1 hour|10 hours|slowed|reverb|nightcore|8d audio|cover|karaoke|reaction)\b/i.test(lower) && !/remix|instrumental/i.test(title)) {
        continue;
      }
      const durDiff = durationSec > 20 ? Math.abs(sec - durationSec) : 0;
      const overlap = tokenOverlapScore(query, vTitle);
      let score = overlap * 100 - durDiff * 1.1;
      if (/\b(official audio|audio oficial|topic|auto-generated)\b/i.test(lower)) score += 18;
      if (/\b(lyric|letra)\b/i.test(lower)) score += 6;
      const isVideo = /\b(official video|video oficial|music video|videoclip)\b/i.test(lower);
      if (isVideo) score += 8;
      candidates.push({ id, title: vTitle, sec, score, isVideo });
    }
    candidates.sort((a, b) => b.score - a.score);
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

async function resolveSoundCloudStream(
  artist: string,
  title: string,
  durationSec: number,
  explicitScId?: string
): Promise<{ sourceType: 'audio-mp3' | 'audio-hls'; url: string; label: string } | null> {
  try {
    const cid = await getSoundCloudClientId();
    if (!cid) return null;

    let candidates: any[] = [];
    if (explicitScId) {
      const single = await fetchJsonSafe<any>(
        `https://api-v2.soundcloud.com/tracks/${encodeURIComponent(explicitScId)}?client_id=${cid}`,
        4500
      );
      if (single?.id) candidates = [single];
    }

    if (candidates.length === 0) {
      const q = `${artist.split(',')[0].trim()} ${title}`.trim();
      const sr = await fetchJsonSafe<any>(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=8`,
        5000
      );
      candidates = Array.isArray(sr?.collection) ? sr.collection : [];
    }

    const cleanQuery = `${artist} ${title}`;
    const valid = candidates
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
        if (durationSec > 45 && Math.abs(tDur - durationSec) > 38) return false;
        return tokenOverlapScore(cleanQuery, `${t?.user?.username || ''} ${t?.title || ''}`) >= 0.35;
      })
      .sort((a, b) => {
        const aProg = a.media.transcodings.some((x: any) => !x.snipped && x.format?.protocol === 'progressive') ? 1 : 0;
        const bProg = b.media.transcodings.some((x: any) => !x.snipped && x.format?.protocol === 'progressive') ? 1 : 0;
        if (aProg !== bProg) return bProg - aProg;
        const aScore = tokenOverlapScore(cleanQuery, `${a?.user?.username || ''} ${a?.title || ''}`);
        const bScore = tokenOverlapScore(cleanQuery, `${b?.user?.username || ''} ${b?.title || ''}`);
        return bScore - aScore;
      });

    const chosen = valid[0];
    if (!chosen) return null;

    const transcodings = chosen.media.transcodings as any[];
    const prog = transcodings.find((x) => !x.snipped && x.format?.protocol === 'progressive');
    const hls = transcodings.find(
      (x) => !x.snipped && x.format?.protocol === 'hls' && String(x.preset || '').includes('aac')
    ) || transcodings.find((x) => !x.snipped && x.format?.protocol === 'hls');

    const picked = prog || hls;
    if (!picked?.url) return null;

    const streamInfo = await fetchJsonSafe<{ url?: string }>(`${picked.url}?client_id=${cid}`, 4500);
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

async function resolveAudiusStream(artist: string, title: string, durationSec: number, explicitAudiusId?: string) {
  try {
    if (explicitAudiusId) {
      return {
        sourceType: 'audio-mp3' as const,
        url: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(explicitAudiusId)}/stream?app_name=RIFFAN`,
        label: 'Audius Hi-Fi',
      };
    }
    const q = `${artist.split(',')[0].trim()} ${title}`.trim();
    const res = await fetchJsonSafe<{ data?: any[] }>(
      `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=RIFFAN`,
      4000
    );
    const items = Array.isArray(res?.data) ? res.data : [];
    const hit = items.find((t) => {
      const dur = Number(t?.duration || 0);
      if (durationSec > 45 && dur > 0 && Math.abs(dur - durationSec) > 35) return false;
      const hay = `${t?.user?.name || ''} ${t?.title || ''}`;
      return tokenOverlapScore(q, hay) >= 0.65 && !/remix|flip|bootleg/i.test(t?.title || '');
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

export async function getMusicRadios(country = 'ES'): Promise<MusicRadioStation[]> {
  const key = country.toUpperCase();
  const cached = radioCache.get(key);
  if (cached) return cached;

  const [esStations, globalStations] = await Promise.all([
    fetchJsonSafe<any[]>(
      'https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/ES?limit=60&order=clickcount&reverse=true&hidebroken=true',
      6000
    ),
    fetchJsonSafe<any[]>(
      'https://de1.api.radio-browser.info/json/stations/bytag/pop?limit=35&order=clickcount&reverse=true&hidebroken=true',
      6000
    ),
  ]);

  const combined = [...(esStations || []), ...(globalStations || [])];
  const seen = new Set<string>();
  const stations: MusicRadioStation[] = [];

  for (const st of combined) {
    const streamUrl = String(st?.url_resolved || st?.url || '').trim();
    const name = String(st?.name || '').trim();
    if (!streamUrl || !name || seen.has(name.toLowerCase())) continue;
    if (/\b(am|cope\b|ser\b|ondacero|esradio|rne radio nacional|radio 5|catalunya informacio|noticias)\b/i.test(name) && !/rock|mega|los40|cadena 100|europa|kiss|hit|music/i.test(name)) {
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
      country: String(st?.countrycode || st?.country || 'ES'),
      tags: tags.length > 0 ? tags : ['Música 24/7'],
      favicon: String(st?.favicon || ''),
      streamUrl,
      bitrate: Number(st?.bitrate || 128),
      codec: String(st?.codec || 'MP3'),
      votes: Number(st?.votes || 0),
    });
    if (stations.length >= 28) break;
  }

  radioCache.set(key, stations);
  return stations;
}

export async function getMusicHome() {
  const cached = homeCache.get('home');
  if (cached) return cached;

  const [
    globalChart,
    quevedoRes,
    badBunnyRes,
    urbanoChart,
    popChart,
    danceChart,
    genresRes,
    radios,
  ] = await Promise.all([
    fetchJsonSafe<any>('https://api.deezer.com/chart/0?limit=25', 6500),
    fetchJsonSafe<any>('https://api.deezer.com/search/track?q=quevedo&limit=12', 6500),
    fetchJsonSafe<any>('https://api.deezer.com/search/track?q=bad+bunny&limit=12', 6500),
    fetchJsonSafe<any>('https://api.deezer.com/chart/116/tracks?limit=20', 6500),
    fetchJsonSafe<any>('https://api.deezer.com/chart/132/tracks?limit=20', 6500),
    fetchJsonSafe<any>('https://api.deezer.com/chart/113/tracks?limit=20', 6500),
    fetchJsonSafe<any>('https://api.deezer.com/genre', 6000),
    getMusicRadios('ES'),
  ]);

  const topTracks: MusicTrack[] = Array.isArray(globalChart?.tracks?.data)
    ? globalChart.tracks.data.map((t: any) => mapDeezerTrack(t))
    : [];
  const topAlbums: MusicAlbumRef[] = Array.isArray(globalChart?.albums?.data)
    ? globalChart.albums.data.map((a: any) => mapDeezerAlbum(a))
    : [];
  const topArtists: MusicArtistRef[] = Array.isArray(globalChart?.artists?.data)
    ? globalChart.artists.data.map((a: any) => mapDeezerArtist(a))
    : [];
  const editorialPlaylists: MusicPlaylist[] = Array.isArray(globalChart?.playlists?.data)
    ? globalChart.playlists.data.map((p: any) => mapDeezerPlaylist(p))
    : [];

  const qTracks = Array.isArray(quevedoRes?.data) ? quevedoRes.data.map((t: any) => mapDeezerTrack(t)) : [];
  const bTracks = Array.isArray(badBunnyRes?.data) ? badBunnyRes.data.map((t: any) => mapDeezerTrack(t)) : [];
  const spainHits: MusicTrack[] = [];
  const maxEs = Math.max(qTracks.length, bTracks.length);
  for (let i = 0; i < maxEs; i++) {
    if (qTracks[i]) spainHits.push(qTracks[i]);
    if (bTracks[i]) spainHits.push(bTracks[i]);
  }
  const urbanoMix: MusicTrack[] = Array.isArray(urbanoChart?.data)
    ? urbanoChart.data.map((t: any) => mapDeezerTrack(t))
    : [];
  const popMix: MusicTrack[] = Array.isArray(popChart?.data)
    ? popChart.data.map((t: any) => mapDeezerTrack(t))
    : [];
  const electronicMix: MusicTrack[] = Array.isArray(danceChart?.data)
    ? danceChart.data.map((t: any) => mapDeezerTrack(t))
    : [];

  const rawGenres = Array.isArray(genresRes?.data) ? genresRes.data : [];
  const genres: MusicGenre[] = rawGenres
    .filter((g: any) => Number(g?.id) > 0)
    .slice(0, 16)
    .map((g: any, idx: number) => {
      const name = String(g?.name || 'Música');
      return {
        id: String(g.id),
        name,
        picture: String(g?.picture_big || g?.picture_medium || g?.picture || ''),
        color: GENRE_COLOR_MAP[name] || GENRE_COLORS_FALLBACK[idx % GENRE_COLORS_FALLBACK.length],
      };
    });

  const payload = {
    topTracks,
    spainHits,
    urbanoMix,
    popMix,
    electronicMix,
    topAlbums,
    topArtists,
    editorialPlaylists,
    genres,
    radios,
  };

  if (topTracks.length > 0 || spainHits.length > 0) {
    homeCache.set('home', payload);
  }
  return payload;
}

export async function searchMusicCatalog(query: string, type = 'all') {
  const clean = String(query || '').trim();
  if (!clean) {
    return { tracks: [], albums: [], artists: [], playlists: [], radios: [] };
  }
  const key = `${type}:${clean.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const qEnc = encodeURIComponent(clean);
  const [dzTracks, dzAlbums, dzArtists, dzPlaylists, audiusRes, radioRes] = await Promise.all([
    type === 'all' || type === 'track'
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/track?q=${qEnc}&limit=25`, 5500)
      : Promise.resolve(null),
    type === 'all' || type === 'album'
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/album?q=${qEnc}&limit=16`, 5500)
      : Promise.resolve(null),
    type === 'all' || type === 'artist'
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/artist?q=${qEnc}&limit=14`, 5500)
      : Promise.resolve(null),
    type === 'all' || type === 'playlist'
      ? fetchJsonSafe<any>(`https://api.deezer.com/search/playlist?q=${qEnc}&limit=14`, 5500)
      : Promise.resolve(null),
    type === 'all' || type === 'track'
      ? fetchJsonSafe<any>(`https://discoveryprovider.audius.co/v1/tracks/search?query=${qEnc}&app_name=RIFFAN`, 4000)
      : Promise.resolve(null),
    getMusicRadios('ES'),
  ]);

  const dzMappedTracks: MusicTrack[] = Array.isArray(dzTracks?.data)
    ? dzTracks.data.map((t: any) => mapDeezerTrack(t))
    : [];

  const audiusTracks: MusicTrack[] = Array.isArray(audiusRes?.data)
    ? audiusRes.data.slice(0, 5).map((t: any) => ({
        id: `au-${t.id}`,
        title: String(t.title || 'Track'),
        artist: {
          id: `au-art-${t.user?.id || '0'}`,
          name: String(t.user?.name || 'Audius Artist'),
          picture: String(t.user?.profile_picture?.['480x480'] || t.user?.profile_picture?.['150x150'] || ''),
        },
        album: {
          id: `au-alb-${t.id}`,
          title: 'Audius Independent',
          cover: String(t.artwork?.['480x480'] || t.artwork?.['150x150'] || ''),
          coverXl: String(t.artwork?.['1000x1000'] || t.artwork?.['480x480'] || ''),
        },
        durationSec: Number(t.duration || 0),
        source: 'audius' as const,
        audiusId: String(t.id),
      }))
    : [];

  const qLow = clean.toLowerCase();
  const matchingRadios = radioRes.filter(
    (r) =>
      r.name.toLowerCase().includes(qLow) ||
      r.tags.some((t) => t.toLowerCase().includes(qLow))
  );

  const directArtists: MusicArtistRef[] = Array.isArray(dzArtists?.data)
    ? dzArtists.data.map((a: any) => mapDeezerArtist(a))
    : [];
  const derivedArtistMap = new Map<string, MusicArtistRef>();
  for (const a of directArtists) {
    if (a.id) derivedArtistMap.set(a.id, a);
  }
  for (const t of dzMappedTracks) {
    if (t.artist.id && !derivedArtistMap.has(t.artist.id)) {
      derivedArtistMap.set(t.artist.id, t.artist);
    }
  }

  const payload = {
    tracks: [...dzMappedTracks, ...audiusTracks],
    albums: Array.isArray(dzAlbums?.data) ? dzAlbums.data.map((a: any) => mapDeezerAlbum(a)) : [],
    artists: Array.from(derivedArtistMap.values()).slice(0, 14),
    playlists: Array.isArray(dzPlaylists?.data) ? dzPlaylists.data.map((p: any) => mapDeezerPlaylist(p)) : [],
    radios: matchingRadios,
  };

  searchCache.set(key, payload);
  return payload;
}

export async function getAlbumDetails(albumId: string) {
  const key = `album:${albumId}`;
  const cached = entityCache.get(key);
  if (cached) return cached;

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
  title: string;
  artist: string;
  durationSec?: number;
  previewUrl?: string;
  soundcloudId?: string;
  audiusId?: string;
  youtubeVideoId?: string;
  preferVideo?: boolean;
}): Promise<ResolvedTrackPlayback> {
  const durationSec = Number(params.durationSec || 0);
  const key = `${params.artist.toLowerCase()}|${params.title.toLowerCase()}|${durationSec}|${params.audiusId || ''}|${params.soundcloudId || ''}`;
  const cached = playbackCache.get(key);
  if (cached) return cached;

  const [scStream, audiusStream, ytMatch] = await Promise.all([
    params.audiusId
      ? Promise.resolve(null)
      : resolveSoundCloudStream(params.artist, params.title, durationSec, params.soundcloudId),
    resolveAudiusStream(params.artist, params.title, durationSec, params.audiusId),
    params.youtubeVideoId
      ? Promise.resolve({ audioId: params.youtubeVideoId, mvId: params.youtubeVideoId })
      : resolveYouTubeMatch(params.artist, params.title, durationSec),
  ]);

  const direct = audiusStream || scStream;
  let result: ResolvedTrackPlayback;

  if (direct) {
    result = {
      sourceType: direct.sourceType,
      sourceLabel: direct.label,
      streamUrl: direct.url,
      proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(direct.url)}`,
      youtubeVideoId: ytMatch.audioId || ytMatch.mvId,
      youtubeMvId: ytMatch.mvId || ytMatch.audioId,
      previewUrl: params.previewUrl,
      fullLength: true,
    };
  } else if (ytMatch.audioId || ytMatch.mvId) {
    result = {
      sourceType: 'youtube',
      sourceLabel: 'YouTube Audio HD',
      youtubeVideoId: ytMatch.audioId || ytMatch.mvId,
      youtubeMvId: ytMatch.mvId || ytMatch.audioId,
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
    { title: params.title, artist: params.artist, sourceType: result.sourceType, hasYt: Boolean(result.youtubeVideoId) },
    'riffan_music_resolved_playback'
  );
  playbackCache.set(key, result);
  return result;
}
