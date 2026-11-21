import crypto from 'crypto';
import type { MusicTrack } from '../../src/types/music.ts';
import { ENV } from '../config/env.ts';
import { matchImportedTracksBatch } from './musicPlatformSync.ts';

export const SPOTIFY_OAUTH_SCOPES = [
  'user-read-private',
  'user-library-read',
  'user-top-read',
  'user-follow-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played',
].join(' ');

export const SPOTIFY_CALLBACK_PATH = '/api/music/oauth/spotify/callback';

const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 20 * 60 * 1000;

interface PendingOAuthState {
  redirectUri: string;
  openerOrigin: string;
  createdAt: number;
}

interface StoredSpotifySession {
  accessToken: string;
  createdAt: number;
}

const spotifyPendingStates = new Map<string, PendingOAuthState>();
const spotifySessions = new Map<string, StoredSpotifySession>();

function pruneExpiredMaps() {
  const now = Date.now();
  for (const [k, v] of spotifyPendingStates.entries()) {
    if (now - v.createdAt > STATE_TTL_MS) spotifyPendingStates.delete(k);
  }
  for (const [k, v] of spotifySessions.entries()) {
    if (now - v.createdAt > SESSION_TTL_MS) spotifySessions.delete(k);
  }
}

export function isTrustedAppOrigin(rawOrigin: string): boolean {
  const clean = String(rawOrigin || '').trim().replace(/\/+$/, '');
  if (!clean) return false;
  try {
    const u = new URL(clean);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (ENV.appUrl) {
      try {
        if (new URL(ENV.appUrl).origin === u.origin) return true;
      } catch {
        // ignore invalid APP_URL
      }
    }
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.run.app') ||
      host.endsWith('.ai.studio') ||
      (ENV.publicDomain && host === ENV.publicDomain.toLowerCase())
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function resolveSpotifyBaseOrigin(requestedOrigin?: string): string {
  const candidate = String(requestedOrigin || '').trim().replace(/\/+$/, '');
  if (candidate && isTrustedAppOrigin(candidate)) {
    return candidate;
  }
  if (ENV.appUrl) {
    return ENV.appUrl;
  }
  return 'http://localhost:3000';
}

export function getSpotifyOAuthStatus(requestedOrigin?: string) {
  const configured = Boolean(ENV.spotifyClientId && ENV.spotifyClientSecret);
  const baseOrigin = resolveSpotifyBaseOrigin(requestedOrigin);
  const activeCallbackUrl = `${baseOrigin}${SPOTIFY_CALLBACK_PATH}`;
  const devCallbackUrl = ENV.appUrl
    ? `${ENV.appUrl}${SPOTIFY_CALLBACK_PATH}`
    : activeCallbackUrl;

  return {
    configured,
    activeCallbackUrl,
    devCallbackUrl,
    scopes: SPOTIFY_OAUTH_SCOPES.split(' '),
  };
}

export function createSpotifyAuthorizeUrl(requestedOrigin?: string): {
  ok: boolean;
  url?: string;
  error?: string;
} {
  pruneExpiredMaps();
  if (!ENV.spotifyClientId || !ENV.spotifyClientSecret) {
    return {
      ok: false,
      error: 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET no están configurados en el servidor.',
    };
  }

  const openerOrigin = resolveSpotifyBaseOrigin(requestedOrigin);
  const redirectOrigin = ENV.appUrl || openerOrigin;
  const redirectUri = `${redirectOrigin}${SPOTIFY_CALLBACK_PATH}`;
  const state = crypto.randomBytes(24).toString('hex');

  spotifyPendingStates.set(state, {
    redirectUri,
    openerOrigin,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: ENV.spotifyClientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_OAUTH_SCOPES,
    state,
    show_dialog: 'true',
  });

  return {
    ok: true,
    url: `https://accounts.spotify.com/authorize?${params.toString()}`,
  };
}

export async function handleSpotifyOAuthCallback(params: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<{
  ok: boolean;
  sessionToken?: string;
  openerOrigin: string;
  error?: string;
}> {
  pruneExpiredMaps();
  const stateKey = String(params.state || '').trim();
  const pending = stateKey ? spotifyPendingStates.get(stateKey) : undefined;
  if (stateKey) spotifyPendingStates.delete(stateKey);

  const openerOrigin = pending?.openerOrigin || ENV.appUrl || '*';

  if (params.error) {
    return {
      ok: false,
      openerOrigin,
      error:
        params.error === 'access_denied'
          ? 'Has cancelado el acceso en Spotify.'
          : `Spotify OAuth error: ${params.error}`,
    };
  }

  if (!pending || !params.code) {
    return {
      ok: false,
      openerOrigin,
      error: 'Sesión OAuth expirada o inválida. Vuelve a intentarlo.',
    };
  }

  if (!ENV.spotifyClientId || !ENV.spotifyClientSecret) {
    return {
      ok: false,
      openerOrigin,
      error: 'Faltan credenciales de Spotify en el servidor.',
    };
  }

  try {
    const basicAuth = Buffer.from(
      `${ENV.spotifyClientId}:${ENV.spotifyClientSecret}`
    ).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(params.code),
      redirect_uri: pending.redirectUri,
    });

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });

    const tokenJson = (await tokenRes.json().catch(() => null)) as {
      access_token?: string;
      error_description?: string;
      error?: string;
    } | null;

    if (!tokenRes.ok || !tokenJson?.access_token) {
      return {
        ok: false,
        openerOrigin,
        error:
          tokenJson?.error_description ||
          tokenJson?.error ||
          'Spotify rechazó el intercambio de token.',
      };
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    spotifySessions.set(sessionToken, {
      accessToken: tokenJson.access_token,
      createdAt: Date.now(),
    });

    return {
      ok: true,
      sessionToken,
      openerOrigin,
    };
  } catch {
    return {
      ok: false,
      openerOrigin,
      error: 'Error de red conectando con Spotify.',
    };
  }
}

export interface OAuthImportedPlaylist {
  id: string;
  name: string;
  description: string;
  cover?: string;
  tracks: MusicTrack[];
}

export interface FullOAuthImportPayload {
  ok: boolean;
  provider: 'spotify' | 'youtube_music';
  accountLabel: string;
  likedTracks: MusicTrack[];
  playlists: OAuthImportedPlaylist[];
  favoriteArtists: string[];
  favoriteGenres: string[];
  totalTracksImported: number;
  error?: string;
}

async function fetchJsonWithBearer<T = any>(url: string, accessToken: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalizeSpotifyGenreLabel(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function mapSpotifyRawTrack(raw: any, fallbackAlbum = 'Spotify'): MusicTrack | null {
  if (!raw || !raw.name || raw.is_local) return null;
  const title = String(raw.name || '').trim();
  if (!title) return null;
  const artistsArr = Array.isArray(raw.artists) ? raw.artists : [];
  const artistName =
    artistsArr
      .map((a: any) => String(a?.name || '').trim())
      .filter(Boolean)
      .join(', ') || 'Spotify Artist';
  const primaryArtist = String(artistsArr[0]?.name || artistName.split(',')[0] || '').trim();
  const images = Array.isArray(raw.album?.images) ? raw.album.images : [];
  const coverXl = String(images[0]?.url || '');
  const cover = String(images[1]?.url || images[0]?.url || '');
  const spId = String(raw.id || `${primaryArtist}-${title}`);

  return {
    id: `sp-${spId}`,
    title,
    artist: {
      id: `sp-art-${String(artistsArr[0]?.id || encodeURIComponent(primaryArtist.toLowerCase()))}`,
      name: artistName,
      picture: cover,
    },
    album: {
      id: `sp-alb-${String(raw.album?.id || encodeURIComponent(fallbackAlbum.toLowerCase()))}`,
      title: String(raw.album?.name || fallbackAlbum),
      cover,
      coverXl: coverXl || cover,
    },
    durationSec: Math.max(30, Math.round(Number(raw.duration_ms || 195000) / 1000)),
    explicit: Boolean(raw.explicit),
    previewUrl: raw.preview_url ? String(raw.preview_url) : undefined,
    isrc: raw.external_ids?.isrc ? String(raw.external_ids.isrc) : undefined,
    source: 'spotify',
    spotifyId: raw.id ? String(raw.id) : undefined,
  };
}

export async function importFullSpotifyAccount(
  sessionToken: string
): Promise<FullOAuthImportPayload> {
  pruneExpiredMaps();
  const cleanSession = String(sessionToken || '').trim();
  const session = cleanSession ? spotifySessions.get(cleanSession) : undefined;
  if (!session) {
    return {
      ok: false,
      provider: 'spotify',
      accountLabel: '',
      likedTracks: [],
      playlists: [],
      favoriteArtists: [],
      favoriteGenres: [],
      totalTracksImported: 0,
      error: 'Tu sesión de Spotify ha expirado. Vuelve a iniciar sesión.',
    };
  }

  const token = session.accessToken;

  const [me, topArtistsMed, topArtistsShort, topTracks, savedTracks, followed, recentlyPlayed, userPlaylists] =
    await Promise.all([
      fetchJsonWithBearer('https://api.spotify.com/v1/me', token),
      fetchJsonWithBearer('https://api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=30', token),
      fetchJsonWithBearer('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=20', token),
      fetchJsonWithBearer('https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=40', token),
      fetchJsonWithBearer('https://api.spotify.com/v1/me/tracks?limit=50', token),
      fetchJsonWithBearer('https://api.spotify.com/v1/me/following?type=artist&limit=50', token),
      fetchJsonWithBearer('https://api.spotify.com/v1/me/recently-played?limit=30', token),
      fetchJsonWithBearer('https://api.spotify.com/v1/me/playlists?limit=20', token),
    ]);

  if (!me && !savedTracks && !topArtistsMed) {
    return {
      ok: false,
      provider: 'spotify',
      accountLabel: '',
      likedTracks: [],
      playlists: [],
      favoriteArtists: [],
      favoriteGenres: [],
      totalTracksImported: 0,
      error: 'Spotify no devolvió datos de la cuenta (token inválido o sin permisos).',
    };
  }

  const accountLabel = String(me?.display_name || me?.id || 'Spotify Account').trim();

  // Extract Top Artists + Genres with frequency weighting
  const artistScores = new Map<string, number>();
  const genreScores = new Map<string, number>();

  const registerArtists = (items: any[], weight: number) => {
    for (const a of items || []) {
      const name = String(a?.name || '').trim();
      if (name) artistScores.set(name, (artistScores.get(name) || 0) + weight);
      const genres = Array.isArray(a?.genres) ? a.genres : [];
      for (const g of genres) {
        const cleanG = normalizeSpotifyGenreLabel(g);
        if (cleanG) genreScores.set(cleanG, (genreScores.get(cleanG) || 0) + weight);
      }
    }
  };

  registerArtists(topArtistsShort?.items || [], 4);
  registerArtists(topArtistsMed?.items || [], 3);
  registerArtists(followed?.artists?.items || [], 2);

  // Collect Liked + Top + Recently Played tracks
  const likedTracksRaw: MusicTrack[] = [];
  const seenLiked = new Set<string>();

  const pushLiked = (tr: MusicTrack | null, boostArtist = false) => {
    if (!tr) return;
    const key = `${tr.artist.name.toLowerCase()}|${tr.title.toLowerCase()}`;
    if (seenLiked.has(key)) return;
    seenLiked.add(key);
    likedTracksRaw.push(tr);
    if (boostArtist) {
      const art = tr.artist.name.split(',')[0].trim();
      if (art) artistScores.set(art, (artistScores.get(art) || 0) + 1);
    }
  };

  for (const item of savedTracks?.items || []) {
    pushLiked(mapSpotifyRawTrack(item?.track, 'Tus Me Gusta'), true);
  }
  for (const item of topTracks?.items || []) {
    pushLiked(mapSpotifyRawTrack(item, 'Top Spotify'), true);
  }
  for (const item of recentlyPlayed?.items || []) {
    pushLiked(mapSpotifyRawTrack(item?.track, 'Recientes'), true);
  }

  // Fetch up to top 6 user playlists concurrently
  const rawPlaylistItems = Array.isArray(userPlaylists?.items)
    ? userPlaylists.items.filter((p: any) => p?.id && Number(p?.tracks?.total || 0) > 0).slice(0, 6)
    : [];

  const playlists: OAuthImportedPlaylist[] = [];
  await Promise.all(
    rawPlaylistItems.map(async (pl: any) => {
      const plTracksData = await fetchJsonWithBearer(
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(String(pl.id))}/tracks?limit=50`,
        token
      );
      const mappedTracks: MusicTrack[] = [];
      const seenPl = new Set<string>();
      for (const entry of plTracksData?.items || []) {
        const t = mapSpotifyRawTrack(entry?.track, String(pl.name || 'Spotify'));
        if (t && !seenPl.has(t.id)) {
          seenPl.add(t.id);
          mappedTracks.push(t);
          const art = t.artist.name.split(',')[0].trim();
          if (art) artistScores.set(art, (artistScores.get(art) || 0) + 0.5);
        }
      }
      if (mappedTracks.length > 0) {
        playlists.push({
          id: `sp-pl-${pl.id}`,
          name: String(pl.name || 'Playlist Spotify').trim(),
          description: `Spotify · ${mappedTracks.length} canciones`,
          cover: String(pl.images?.[0]?.url || mappedTracks[0]?.album.cover || ''),
          tracks: mappedTracks,
        });
      }
    })
  );

  // Also ensure likedTracks have crisp playable audio previews/artwork matched if missing previewUrl
  const needMatch = likedTracksRaw.filter((t) => !t.previewUrl || !t.album.cover).slice(0, 35);
  if (needMatch.length > 0) {
    const matched = await matchImportedTracksBatch(
      needMatch.map((t) => ({
        title: t.title,
        artist: t.artist.name,
        album: t.album.title,
        durationSec: t.durationSec,
      }))
    );
    const matchedByIdx = new Map<number, MusicTrack>();
    matched.forEach((m, i) => matchedByIdx.set(i, m));
    needMatch.forEach((orig, i) => {
      const m = matchedByIdx.get(i);
      if (m) {
        if (!orig.previewUrl && m.previewUrl) orig.previewUrl = m.previewUrl;
        if (!orig.album.cover && m.album.cover) orig.album.cover = m.album.cover;
        if (!orig.album.coverXl && m.album.coverXl) orig.album.coverXl = m.album.coverXl;
      }
    });
  }

  const favoriteArtists = Array.from(artistScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 35)
    .map(([name]) => name);

  const favoriteGenres = Array.from(genreScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([name]) => name);

  const totalTracksImported =
    likedTracksRaw.length + playlists.reduce((acc, p) => acc + p.tracks.length, 0);

  return {
    ok: true,
    provider: 'spotify',
    accountLabel,
    likedTracks: likedTracksRaw.slice(0, 120),
    playlists,
    favoriteArtists,
    favoriteGenres,
    totalTracksImported,
  };
}

// ============================================================================
// YOUTUBE / YOUTUBE MUSIC GOOGLE OAUTH ACCOUNT IMPORTER
// ============================================================================
const YT_NOISE_TAGS_RE =
  /\s*[\[(]\s*(official\s*(music\s*)?(video|audio|lyric\s*video|visualizer|hd|4k)|video\s*oficial|audio\s*oficial|letra|lyrics|clip\s*oficial|videoclip(?:\s*oficial)?|live|en\s*vivo|hd|4k|remix\s*video)\s*[\])]/gi;

function parseYoutubeArtistAndTitle(rawTitle: string, channelTitle: string): {
  title: string;
  artist: string;
} {
  let cleanChannel = String(channelTitle || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .replace(/\s*Official$/i, '')
    .trim();

  let cleanTitle = String(rawTitle || '')
    .replace(YT_NOISE_TAGS_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Split "Artist - Title" or "Artist | Title"
  const sepMatch = cleanTitle.match(/^(.{2,42}?)\s+[-–—|:]\s+(.{2,})$/);
  if (sepMatch) {
    const left = sepMatch[1].trim();
    const right = sepMatch[2].trim();
    if (!/^(official|video|audio|music|feat|ft)\b/i.test(left)) {
      return { artist: left, title: right };
    }
  }

  return {
    artist: cleanChannel || 'YouTube Music',
    title: cleanTitle || rawTitle,
  };
}

const NON_MUSIC_CHANNEL_RE =
  /(gaming|gameplay|vlog|podcast|noticias|news|deportes|sports|futbol|fútbol|trailer|peliculas|películas|tutorial|review|unboxing|stream|twitch|comedy|humor)/i;

async function inferGenresFromTopArtists(artists: string[]): Promise<string[]> {
  const top = artists.slice(0, 8);
  const genreCounts = new Map<string, number>();

  await Promise.allSettled(
    top.map(async (name) => {
      const res = await fetch(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`,
        { signal: AbortSignal.timeout(3000) }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const artistId = res?.data?.[0]?.id;
      if (!artistId) return;

      const albumsRes = await fetch(
        `https://api.deezer.com/artist/${encodeURIComponent(String(artistId))}/albums?limit=1`,
        { signal: AbortSignal.timeout(3000) }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const albumId = albumsRes?.data?.[0]?.id;
      if (!albumId) return;

      const albumDetail = await fetch(
        `https://api.deezer.com/album/${encodeURIComponent(String(albumId))}`,
        { signal: AbortSignal.timeout(3000) }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const genres = Array.isArray(albumDetail?.genres?.data) ? albumDetail.genres.data : [];
      for (const g of genres) {
        const gName = String(g?.name || '').trim();
        if (gName && gName.toLowerCase() !== 'all') {
          genreCounts.set(gName, (genreCounts.get(gName) || 0) + 1);
        }
      }
    })
  );

  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([g]) => g);
}

export async function importFullYoutubeAccount(
  googleAccessToken: string
): Promise<FullOAuthImportPayload> {
  const token = String(googleAccessToken || '').trim();
  if (!token) {
    return {
      ok: false,
      provider: 'youtube_music',
      accountLabel: '',
      likedTracks: [],
      playlists: [],
      favoriteArtists: [],
      favoriteGenres: [],
      totalTracksImported: 0,
      error: 'Falta el token de acceso de Google / YouTube.',
    };
  }

  const [myChannels, myPlaylists, myLikedVideos, mySubscriptions, likedMusicPl] = await Promise.all([
    fetchJsonWithBearer('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', token),
    fetchJsonWithBearer(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=25',
      token
    ),
    fetchJsonWithBearer(
      'https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&myRating=like&maxResults=50',
      token
    ),
    fetchJsonWithBearer(
      'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50',
      token
    ),
    fetchJsonWithBearer(
      'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=LM&maxResults=50',
      token
    ),
  ]);

  if (!myChannels && !myPlaylists && !myLikedVideos) {
    return {
      ok: false,
      provider: 'youtube_music',
      accountLabel: '',
      likedTracks: [],
      playlists: [],
      favoriteArtists: [],
      favoriteGenres: [],
      totalTracksImported: 0,
      error:
        'No se pudo leer tu cuenta de YouTube. Asegúrate de aceptar el permiso de lectura de YouTube y volver a intentarlo.',
    };
  }

  const accountLabel = String(
    myChannels?.items?.[0]?.snippet?.title || 'Cuenta YouTube Music'
  ).trim();

  const artistScores = new Map<string, number>();

  // 1. Collect Liked Music (prefer YouTube Music 'LM' playlist, plus Music-category liked videos)
  const rawLikedCandidates: Array<{
    videoId: string;
    title: string;
    artist: string;
    cover: string;
  }> = [];
  const seenLikedIds = new Set<string>();

  for (const item of likedMusicPl?.items || []) {
    const vid = String(
      item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId || ''
    ).trim();
    const rawTitle = String(item?.snippet?.title || '');
    const ch = String(
      item?.snippet?.videoOwnerChannelTitle || item?.snippet?.channelTitle || ''
    );
    if (!vid || !rawTitle || rawTitle === 'Private video' || rawTitle === 'Deleted video') continue;
    if (seenLikedIds.has(vid)) continue;
    seenLikedIds.add(vid);
    const parsed = parseYoutubeArtistAndTitle(rawTitle, ch);
    const thumb =
      item?.snippet?.thumbnails?.maxres?.url ||
      item?.snippet?.thumbnails?.high?.url ||
      item?.snippet?.thumbnails?.medium?.url ||
      `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    rawLikedCandidates.push({ videoId: vid, title: parsed.title, artist: parsed.artist, cover: thumb });
    if (parsed.artist && parsed.artist !== 'YouTube Music') {
      artistScores.set(parsed.artist, (artistScores.get(parsed.artist) || 0) + 3);
    }
  }

  for (const vidItem of myLikedVideos?.items || []) {
    const vid = String(vidItem?.id || '').trim();
    const snip = vidItem?.snippet || {};
    const catId = String(snip?.categoryId || '');
    const rawTitle = String(snip?.title || '');
    const ch = String(snip?.channelTitle || '');
    // Keep categoryId '10' (Music) OR tracks ending with '- Topic' OR "Artist - Song" patterns
    const looksMusic =
      catId === '10' ||
      /-\s*Topic$/i.test(ch) ||
      (/\s+[-–—]\s+/.test(rawTitle) && !NON_MUSIC_CHANNEL_RE.test(`${ch} ${rawTitle}`));
    if (!vid || !rawTitle || !looksMusic || seenLikedIds.has(vid)) continue;
    seenLikedIds.add(vid);
    const parsed = parseYoutubeArtistAndTitle(rawTitle, ch);
    const thumb =
      snip?.thumbnails?.maxres?.url ||
      snip?.thumbnails?.high?.url ||
      snip?.thumbnails?.medium?.url ||
      `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    rawLikedCandidates.push({ videoId: vid, title: parsed.title, artist: parsed.artist, cover: thumb });
    if (parsed.artist && parsed.artist !== 'YouTube Music') {
      artistScores.set(parsed.artist, (artistScores.get(parsed.artist) || 0) + 2.5);
    }
  }

  // 2. Subscribed music artists / Topic channels
  for (const sub of mySubscriptions?.items || []) {
    const rawCh = String(sub?.snippet?.title || '').trim();
    const desc = String(sub?.snippet?.description || '');
    if (!rawCh) continue;
    if (NON_MUSIC_CHANNEL_RE.test(rawCh)) continue;
    const isTopicOrMusic =
      /-\s*Topic$/i.test(rawCh) ||
      /VEVO$/i.test(rawCh) ||
      /\b(music|música|official|oficial|records|singer|artist|band|dj|rapper)\b/i.test(
        `${rawCh} ${desc}`
      );
    const clean = rawCh
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .trim();
    if (clean) {
      artistScores.set(clean, (artistScores.get(clean) || 0) + (isTopicOrMusic ? 3 : 0.8));
    }
  }

  // 3. Match liked candidates preserving direct youtubeVideoId for instant playback
  const matchedLiked =
    rawLikedCandidates.length > 0
      ? await matchImportedTracksBatch(
          rawLikedCandidates.slice(0, 45).map((c) => ({
            title: c.title,
            artist: c.artist,
            album: 'YouTube Music',
          }))
        )
      : [];

  const likedTracks: MusicTrack[] = matchedLiked.map((trk, idx) => {
    const orig = rawLikedCandidates[idx];
    if (!orig) return trk;
    return {
      ...trk,
      youtubeVideoId: orig.videoId,
      album: {
        ...trk.album,
        cover: trk.album.cover || orig.cover,
        coverXl: trk.album.coverXl || trk.album.cover || orig.cover,
      },
    };
  });

  // 4. Fetch top 6 user playlists
  const playlistDefs = Array.isArray(myPlaylists?.items)
    ? myPlaylists.items
        .filter((p: any) => p?.id && Number(p?.contentDetails?.itemCount || 0) > 0)
        .slice(0, 6)
    : [];

  const playlists: OAuthImportedPlaylist[] = [];
  await Promise.all(
    playlistDefs.map(async (pl: any) => {
      const plItems = await fetchJsonWithBearer(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(
          String(pl.id)
        )}&maxResults=45`,
        token
      );
      const plTracks: MusicTrack[] = [];
      const seenPl = new Set<string>();
      for (const item of plItems?.items || []) {
        const vid = String(
          item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId || ''
        ).trim();
        const rawTitle = String(item?.snippet?.title || '');
        if (!vid || !rawTitle || rawTitle === 'Private video' || rawTitle === 'Deleted video') continue;
        if (seenPl.has(vid)) continue;
        seenPl.add(vid);
        const ch = String(
          item?.snippet?.videoOwnerChannelTitle || item?.snippet?.channelTitle || ''
        );
        const parsed = parseYoutubeArtistAndTitle(rawTitle, ch);
        const thumb =
          item?.snippet?.thumbnails?.high?.url ||
          item?.snippet?.thumbnails?.medium?.url ||
          `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

        if (parsed.artist && parsed.artist !== 'YouTube Music') {
          artistScores.set(parsed.artist, (artistScores.get(parsed.artist) || 0) + 1);
        }

        plTracks.push({
          id: `ytm-${vid}`,
          title: parsed.title,
          artist: {
            id: `ytm-art-${encodeURIComponent(parsed.artist.toLowerCase())}`,
            name: parsed.artist,
            picture: thumb,
          },
          album: {
            id: `ytm-pl-${pl.id}`,
            title: String(pl?.snippet?.title || 'YouTube Playlist'),
            cover: thumb,
            coverXl: thumb,
          },
          durationSec: 205,
          source: 'youtube_music',
          youtubeVideoId: vid,
        });
      }

      if (plTracks.length > 0) {
        playlists.push({
          id: `ytm-pl-${pl.id}`,
          name: String(pl?.snippet?.title || 'Playlist YouTube').trim(),
          description: `YouTube Music · ${plTracks.length} canciones`,
          cover: String(
            pl?.snippet?.thumbnails?.high?.url ||
              pl?.snippet?.thumbnails?.medium?.url ||
              plTracks[0]?.album.cover ||
              ''
          ),
          tracks: plTracks,
        });
      }
    })
  );

  const favoriteArtists = Array.from(artistScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 35)
    .map(([name]) => name);

  const favoriteGenres = await inferGenresFromTopArtists(favoriteArtists);
  const totalTracksImported =
    likedTracks.length + playlists.reduce((acc, p) => acc + p.tracks.length, 0);

  return {
    ok: true,
    provider: 'youtube_music',
    accountLabel,
    likedTracks,
    playlists,
    favoriteArtists,
    favoriteGenres,
    totalTracksImported,
  };
}
