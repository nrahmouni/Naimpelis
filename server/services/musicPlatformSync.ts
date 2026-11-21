import type {
  MusicAlbumRef,
  MusicTrack,
} from '../../src/types/music.ts';

const YTM_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20241120.01.00',
    hl: 'es',
    gl: 'ES',
  },
};

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function collectRenderers<T = any>(root: unknown, key: string, out: T[] = [], depth = 0): T[] {
  if (!root || typeof root !== 'object' || depth > 24) return out;
  const obj = root as Record<string, unknown>;
  if (obj[key] && typeof obj[key] === 'object') {
    out.push(obj[key] as T);
  }
  if (Array.isArray(root)) {
    for (const item of root) collectRenderers(item, key, out, depth + 1);
  } else {
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') collectRenderers(val, key, out, depth + 1);
    }
  }
  return out;
}

function parseRunsText(node: any): string {
  if (!node) return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) {
    return node.runs.map((r: any) => String(r?.text || '')).join('');
  }
  return '';
}

function pickBestThumb(thumbs: any): string {
  if (!Array.isArray(thumbs) || thumbs.length === 0) return '';
  const sorted = [...thumbs].sort((a, b) => Number(b?.width || 0) - Number(a?.width || 0));
  return String(sorted[0]?.url || thumbs[thumbs.length - 1]?.url || '');
}

function parseDurationLabel(label: string): number {
  const m = String(label || '').match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!m) return 205;
  if (m[3]) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number(m[1]) * 60 + Number(m[2]);
}

const YTM_TYPE_OR_NOISE_RE =
  /^(song|canción|cancion|video|vídeo|single|ep|album|álbum|podcast|episode|episodio|歌曲|专辑|專輯|单曲|單曲|视频|影片|chanson|titre|cançó|àlbum|трек|песня)$/i;
const YTM_DURATION_RE = /^\d+:\d{2}(?::\d{2})?$/;
const YTM_VIEWS_RE =
  /(\b(views?|plays?|reproducciones|visualizaciones|vues|listeners?|subscribers?|oyentes)\b|\d+(?:[.,]\d+)?\s*(?:[kmb]\s+de\s+|m\s+de\s+|mil(?:lones)?\s+de\s+)?(?:visualizaciones|reproducciones|views?|plays?|vues)|次播放|次观看|次觀看|萬|万)/i;

function getYtmContextForQuery(query: string) {
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(query)) {
    return {
      client: {
        ...YTM_CONTEXT.client,
        hl: 'zh-CN',
        gl: 'TW',
      },
    };
  }
  if (/[\u0600-\u06ff]/.test(query)) {
    return {
      client: {
        ...YTM_CONTEXT.client,
        hl: 'ar',
        gl: 'EG',
      },
    };
  }
  if (/[\u0400-\u04ff]/.test(query)) {
    return {
      client: {
        ...YTM_CONTEXT.client,
        hl: 'ru',
        gl: 'RU',
      },
    };
  }
  return YTM_CONTEXT;
}

function parseYtmTrackFromResponsive(item: any): MusicTrack | null {
  const flexCols = Array.isArray(item?.flexColumns) ? item.flexColumns : [];
  const titleRun = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text;
  const subRun = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text;
  const thirdRun = flexCols[2]?.musicResponsiveListItemFlexColumnRenderer?.text;
  const title = parseRunsText(titleRun).trim();

  const videoId =
    item?.playlistItemData?.videoId ||
    item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
      ?.watchEndpoint?.videoId ||
    titleRun?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
    '';

  if (!title || !videoId || typeof videoId !== 'string' || videoId.length !== 11) return null;

  const rawParts = [parseRunsText(subRun), parseRunsText(thirdRun)]
    .filter(Boolean)
    .join('•')
    .split('•')
    .map((s) => s.trim())
    .filter(Boolean);

  const durPart = rawParts.find((p) => YTM_DURATION_RE.test(p)) || '';
  const subParts = rawParts.filter(
    (s) => !YTM_TYPE_OR_NOISE_RE.test(s) && !YTM_DURATION_RE.test(s) && !YTM_VIEWS_RE.test(s)
  );

  const artistName = subParts[0] || 'YouTube Music';
  const albumTitle = subParts[1] || 'YouTube Music';
  const thumbs = item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  const cover = pickBestThumb(thumbs) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    id: `ytm-${videoId}`,
    title,
    artist: {
      id: `ytm-art-${encodeURIComponent(artistName.toLowerCase())}`,
      name: artistName,
      picture: cover,
    },
    album: {
      id: `ytm-alb-trk-${videoId}`,
      title: albumTitle,
      cover,
      coverXl: cover.includes('=w') ? cover.replace(/=w\d+-h\d+/, '=w720-h720') : `https://i.ytimg.com/vi/${videoId}/hq720.jpg`,
    },
    durationSec: parseDurationLabel(durPart),
    source: 'youtube_music',
    youtubeVideoId: videoId,
  };
}

function parseYtmItemFromTwoRow(item: any): { track?: MusicTrack; album?: MusicAlbumRef } {
  const title = parseRunsText(item?.title).trim();
  const subtitle = parseRunsText(item?.subtitle).trim();
  const thumbs = item?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  const cover = pickBestThumb(thumbs);
  if (!title || !cover) return {};

  const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId;
  const videoId =
    item?.navigationEndpoint?.watchEndpoint?.videoId ||
    item?.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
      ?.watchEndpoint?.videoId;

  const parts = subtitle
    .split('•')
    .map((s) => s.trim())
    .filter(Boolean);
  const cleanedParts = parts.filter(
    (p) => !YTM_TYPE_OR_NOISE_RE.test(p) && !YTM_DURATION_RE.test(p) && !YTM_VIEWS_RE.test(p)
  );
  const artistName = cleanedParts[0] || 'YouTube Music';

  if (typeof browseId === 'string' && browseId.startsWith('MPREb_')) {
    return {
      album: {
        id: `ytm-${browseId}`,
        title,
        cover,
        coverXl: cover.includes('=w') ? cover.replace(/=w\d+-h\d+/, '=w720-h720') : cover,
        artist: {
          id: `ytm-art-${encodeURIComponent(artistName.toLowerCase())}`,
          name: artistName,
        },
        genres: parts[0] && /^(album|álbum|single|ep|专辑|單曲)$/i.test(parts[0]) ? [parts[0]] : ['Álbum'],
      },
    };
  }

  if (typeof videoId === 'string' && videoId.length === 11) {
    return {
      track: {
        id: `ytm-${videoId}`,
        title,
        artist: {
          id: `ytm-art-${encodeURIComponent(artistName.toLowerCase())}`,
          name: artistName,
          picture: cover,
        },
        album: {
          id: `ytm-alb-trk-${videoId}`,
          title: 'YouTube Music',
          cover,
          coverXl: cover.includes('=w') ? cover.replace(/=w\d+-h\d+/, '=w720-h720') : `https://i.ytimg.com/vi/${videoId}/hq720.jpg`,
        },
        durationSec: 205,
        source: 'youtube_music',
        youtubeVideoId: videoId,
      },
    };
  }

  return {};
}

async function ytmBrowse(browseId: string): Promise<any | null> {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse?alt=json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': CHROME_UA,
        Origin: 'https://music.youtube.com',
      },
      body: JSON.stringify({ context: YTM_CONTEXT, browseId }),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchYouTubeMusicExploreAndCharts(): Promise<{
  tracks: MusicTrack[];
  albums: MusicAlbumRef[];
}> {
  const [explore, charts] = await Promise.all([
    ytmBrowse('FEmusic_explore'),
    ytmBrowse('FEmusic_charts'),
  ]);

  const tracks: MusicTrack[] = [];
  const albums: MusicAlbumRef[] = [];
  const seenTrack = new Set<string>();
  const seenAlbum = new Set<string>();

  for (const doc of [charts, explore]) {
    if (!doc) continue;
    const respItems = collectRenderers(doc, 'musicResponsiveListItemRenderer');
    for (const item of respItems) {
      const t = parseYtmTrackFromResponsive(item);
      if (t && !seenTrack.has(t.id)) {
        seenTrack.add(t.id);
        tracks.push(t);
      }
    }
    const twoRows = collectRenderers(doc, 'musicTwoRowItemRenderer');
    for (const item of twoRows) {
      const parsed = parseYtmItemFromTwoRow(item);
      if (parsed.album && !seenAlbum.has(parsed.album.id)) {
        seenAlbum.add(parsed.album.id);
        albums.push(parsed.album);
      }
      if (parsed.track && !seenTrack.has(parsed.track.id)) {
        seenTrack.add(parsed.track.id);
        tracks.push(parsed.track);
      }
    }
  }

  return {
    tracks: tracks.slice(0, 32),
    albums: albums.slice(0, 24),
  };
}

export async function searchYouTubeMusic(query: string): Promise<{
  tracks: MusicTrack[];
  albums: MusicAlbumRef[];
}> {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search?alt=json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': CHROME_UA,
        Origin: 'https://music.youtube.com',
      },
      body: JSON.stringify({ context: getYtmContextForQuery(query), query }),
      signal: AbortSignal.timeout(8500),
    });
    if (!res.ok) return { tracks: [], albums: [] };
    const doc = await res.json();
    const tracks: MusicTrack[] = [];
    const albums: MusicAlbumRef[] = [];
    const seenT = new Set<string>();
    const seenA = new Set<string>();

    // Parse Top Result card if it links directly to a song/video
    for (const card of collectRenderers(doc, 'musicCardShelfRenderer')) {
      const title = parseRunsText(card?.title).trim();
      const videoId =
        card?.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
        card?.onTap?.watchEndpoint?.videoId ||
        '';
      const cover = pickBestThumb(card?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails);
      if (title && typeof videoId === 'string' && videoId.length === 11 && !seenT.has(`ytm-${videoId}`)) {
        const subParts = parseRunsText(card?.subtitle)
          .split('•')
          .map((s) => s.trim())
          .filter((s) => s && !YTM_TYPE_OR_NOISE_RE.test(s) && !YTM_DURATION_RE.test(s) && !YTM_VIEWS_RE.test(s));
        const artistName = subParts[0] || title;
        seenT.add(`ytm-${videoId}`);
        tracks.push({
          id: `ytm-${videoId}`,
          title,
          artist: {
            id: `ytm-art-${encodeURIComponent(artistName.toLowerCase())}`,
            name: artistName,
            picture: cover,
          },
          album: {
            id: `ytm-alb-trk-${videoId}`,
            title: subParts[1] || 'YouTube Music',
            cover: cover || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            coverXl: cover ? cover.replace(/=w\d+-h\d+/, '=w720-h720') : `https://i.ytimg.com/vi/${videoId}/hq720.jpg`,
          },
          durationSec: 205,
          source: 'youtube_music',
          youtubeVideoId: videoId,
        });
      }
    }

    for (const item of collectRenderers(doc, 'musicResponsiveListItemRenderer')) {
      const t = parseYtmTrackFromResponsive(item);
      if (t && !seenT.has(t.id)) {
        seenT.add(t.id);
        tracks.push(t);
      }
      const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId;
      if (typeof browseId === 'string' && browseId.startsWith('MPREb_') && !seenA.has(`ytm-${browseId}`)) {
        const flex = Array.isArray(item?.flexColumns) ? item.flexColumns : [];
        const title = parseRunsText(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text).trim();
        const sub = parseRunsText(flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text)
          .split('•')
          .map((s) => s.trim())
          .filter((s) => s && !YTM_TYPE_OR_NOISE_RE.test(s) && !YTM_DURATION_RE.test(s));
        const cover = pickBestThumb(item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails);
        if (title && cover) {
          seenA.add(`ytm-${browseId}`);
          albums.push({
            id: `ytm-${browseId}`,
            title,
            cover,
            coverXl: cover.includes('=w') ? cover.replace(/=w\d+-h\d+/, '=w720-h720') : cover,
            artist: { id: `ytm-art-${encodeURIComponent(sub[0] || 'artist')}`, name: sub[0] || 'YouTube Music' },
          });
        }
      }
    }
    for (const item of collectRenderers(doc, 'musicTwoRowItemRenderer')) {
      const parsed = parseYtmItemFromTwoRow(item);
      if (parsed.track && !seenT.has(parsed.track.id)) {
        seenT.add(parsed.track.id);
        tracks.push(parsed.track);
      }
      if (parsed.album && !seenA.has(parsed.album.id)) {
        seenA.add(parsed.album.id);
        albums.push(parsed.album);
      }
    }
    return { tracks: tracks.slice(0, 20), albums: albums.slice(0, 12) };
  } catch {
    return { tracks: [], albums: [] };
  }
}

export async function fetchYouTubeMusicAlbum(browseId: string): Promise<{
  album: MusicAlbumRef;
  tracks: MusicTrack[];
} | null> {
  const cleanId = browseId.replace(/^ytm-/, '');
  const doc = await ytmBrowse(cleanId);
  if (!doc) return null;

  const header =
    collectRenderers(doc, 'musicResponsiveHeaderRenderer')[0] ||
    collectRenderers(doc, 'musicDetailHeaderRenderer')[0];
  const title = parseRunsText(header?.title).trim() || 'Álbum YouTube Music';
  const artistName = parseRunsText(header?.straplineTextOne || header?.subtitle).trim() || 'YouTube Music';
  const cover =
    pickBestThumb(
      header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
        header?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails
    ) || '';

  const album: MusicAlbumRef = {
    id: `ytm-${cleanId}`,
    title,
    cover,
    coverXl: cover.includes('=w') ? cover.replace(/=w\d+-h\d+/, '=w800-h800') : cover,
    artist: {
      id: `ytm-art-${encodeURIComponent(artistName.toLowerCase())}`,
      name: artistName,
      picture: cover,
    },
  };

  const respItems = collectRenderers(doc, 'musicResponsiveListItemRenderer');
  const tracks: MusicTrack[] = [];
  for (const item of respItems) {
    const parsed = parseYtmTrackFromResponsive(item);
    if (parsed) {
      tracks.push({
        ...parsed,
        artist: parsed.artist.name === 'YouTube Music' ? { id: album.artist!.id, name: artistName, picture: cover } : parsed.artist,
        album: {
          id: album.id,
          title: album.title,
          cover: parsed.album.cover || cover,
          coverXl: album.coverXl || parsed.album.coverXl,
        },
      });
    }
  }

  return tracks.length > 0 ? { album, tracks } : null;
}

interface SpotifyRawEntry {
  uri?: string;
  title?: string;
  subtitle?: string;
  duration?: number;
  isExplicit?: boolean;
  audioPreview?: { url?: string };
}

async function fetchSpotifyEmbedPlaylist(playlistId: string): Promise<{
  playlistTitle: string;
  playlistCover: string;
  entries: SpotifyRawEntry[];
}> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}`, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return { playlistTitle: '', playlistCover: '', entries: [] };
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match?.[1]) return { playlistTitle: '', playlistCover: '', entries: [] };
    const parsed = JSON.parse(match[1]);
    const entity = parsed?.props?.pageProps?.state?.data?.entity;
    const entries = Array.isArray(entity?.trackList) ? (entity.trackList as SpotifyRawEntry[]) : [];
    const playlistCover = String(
      entity?.coverArt?.sources?.[0]?.url ||
        entity?.visualIdentity?.image?.[0]?.url ||
        ''
    );
    return {
      playlistTitle: String(entity?.title || entity?.name || 'Spotify Charts'),
      playlistCover,
      entries,
    };
  } catch {
    return { playlistTitle: '', playlistCover: '', entries: [] };
  }
}

async function fetchSpotifyOembedThumb(trackUri: string): Promise<string> {
  const id = trackUri.split(':').pop();
  if (!id) return '';
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return '';
    const j = (await res.json()) as { thumbnail_url?: string };
    return String(j?.thumbnail_url || '');
  } catch {
    return '';
  }
}

export async function fetchSpotifyPlaylistTracks(
  playlistId: string,
  label: string,
  limit = 22,
  withOembedThumbs = false
): Promise<MusicTrack[]> {
  const pl = await fetchSpotifyEmbedPlaylist(playlistId);
  const sliced = pl.entries.filter((e) => e?.title && e?.uri).slice(0, limit);
  if (sliced.length === 0) return [];

  const thumbs: string[] = new Array(sliced.length).fill(pl.playlistCover);
  if (withOembedThumbs) {
    // Batch oEmbed calls in gentle chunks of 6 to avoid starving sockets
    const maxOembed = Math.min(sliced.length, 16);
    for (let i = 0; i < maxOembed; i += 6) {
      const chunk = sliced.slice(i, i + 6);
      const res = await Promise.allSettled(
        chunk.map((e) => fetchSpotifyOembedThumb(e.uri || ''))
      );
      res.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value) {
          thumbs[i + idx] = r.value;
        }
      });
    }
  }

  return sliced.map((entry, idx) => {
    const spId = String(entry.uri || '').split(':').pop() || `${playlistId}-${idx}`;
    const artistName = String(entry.subtitle || 'Spotify Artist').trim();
    const cover = thumbs[idx] || pl.playlistCover || '';
    return {
      id: `sp-${spId}`,
      title: String(entry.title || 'Spotify Track').trim(),
      artist: {
        id: `sp-art-${encodeURIComponent(artistName.toLowerCase())}`,
        name: artistName,
        picture: cover,
      },
      album: {
        id: `sp-trk-${spId}`,
        title: label,
        cover,
        coverXl: cover,
      },
      durationSec: Math.max(90, Math.round(Number(entry.duration || 195000) / 1000)),
      explicit: Boolean(entry.isExplicit),
      previewUrl: entry.audioPreview?.url ? String(entry.audioPreview.url) : undefined,
      source: 'spotify',
      spotifyId: spId,
    };
  });
}

export async function searchItunesMusic(
  term: string,
  entity: 'song' | 'album' = 'song',
  limit = 16,
  country = 'ES'
): Promise<any[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=${entity}&limit=${limit}&country=${country}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: any[] };
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

export function mapItunesSongToTrack(r: any, source: MusicTrack['source'] = 'deezer'): MusicTrack {
  const art100 = String(r?.artworkUrl100 || r?.artworkUrl60 || '');
  const cover = art100.replace(/100x100bb/, '400x400bb');
  const coverXl = art100.replace(/100x100bb/, '800x800bb');
  return {
    id: `it-${r?.trackId || Math.random().toString(36).slice(2)}`,
    title: String(r?.trackName || r?.collectionName || 'Track'),
    artist: {
      id: `it-art-${r?.artistId || encodeURIComponent(String(r?.artistName || 'artist'))}`,
      name: String(r?.artistName || 'Artista'),
      picture: cover,
    },
    album: {
      id: `it-alb-${r?.collectionId || r?.trackId || '0'}`,
      title: String(r?.collectionName || 'Álbum'),
      cover,
      coverXl,
    },
    durationSec: Math.round(Number(r?.trackTimeMillis || 195000) / 1000),
    explicit: r?.trackExplicitness === 'explicit',
    previewUrl: r?.previewUrl ? String(r.previewUrl) : undefined,
    source,
  };
}

export function mapItunesAlbumRef(r: any): MusicAlbumRef {
  const art100 = String(r?.artworkUrl100 || r?.artworkUrl60 || '');
  const cover = art100.replace(/100x100bb/, '500x500bb');
  const coverXl = art100.replace(/100x100bb/, '800x800bb');
  return {
    id: `it-alb-${r?.collectionId}`,
    title: String(r?.collectionName || 'Álbum'),
    cover,
    coverXl,
    artist: {
      id: `it-art-${r?.artistId || '0'}`,
      name: String(r?.artistName || 'Artista'),
      picture: cover,
    },
    releaseDate: r?.releaseDate ? String(r.releaseDate) : undefined,
    nbTracks: typeof r?.trackCount === 'number' ? r.trackCount : undefined,
    genres: r?.primaryGenreName ? [String(r.primaryGenreName)] : undefined,
  };
}

export async function fetchItunesAlbumById(albumId: string): Promise<{
  album: MusicAlbumRef;
  tracks: MusicTrack[];
} | null> {
  const cleanId = albumId.replace(/^it-alb-/, '');
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(cleanId)}&entity=song`,
      { signal: AbortSignal.timeout(5500) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: any[] };
    const results = Array.isArray(data?.results) ? data.results : [];
    const col = results.find((x) => x?.wrapperType === 'collection') || results[0];
    if (!col) return null;
    const album = mapItunesAlbumRef(col);
    const tracks = results
      .filter((x) => x?.wrapperType === 'track')
      .map((t) => mapItunesSongToTrack(t, 'spotify'));
    return { album, tracks };
  } catch {
    return null;
  }
}

export async function fetchSpotifyChartsAndAlbums(): Promise<{
  tracks: MusicTrack[];
  albums: MusicAlbumRef[];
}> {
  const [globalTracks, hitsTracks, usAlbumsRaw, esAlbumsRaw] = await Promise.all([
    fetchSpotifyPlaylistTracks('37i9dQZEVXbMDoHDwVN2tF', 'Spotify Global', 14, true),
    fetchSpotifyPlaylistTracks('37i9dQZF1DXcBWIGoYBM5M', 'Today’s Top Hits', 12, true),
    searchItunesMusic('top hits album 2025', 'album', 10, 'US'),
    searchItunesMusic('top pop urbano españa', 'album', 10, 'ES'),
  ]);

  const seen = new Set<string>();
  const tracks: MusicTrack[] = [];
  for (const t of [...globalTracks, ...hitsTracks]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      tracks.push(t);
    }
    if (tracks.length >= 28) break;
  }

  const albumsMap = new Map<string, MusicAlbumRef>();
  for (const rawAlb of [...usAlbumsRaw, ...esAlbumsRaw]) {
    if (!rawAlb?.collectionId) continue;
    const mapped = mapItunesAlbumRef(rawAlb);
    if (!albumsMap.has(mapped.id)) albumsMap.set(mapped.id, mapped);
  }

  return {
    tracks,
    albums: Array.from(albumsMap.values()).slice(0, 20),
  };
}

async function fetchSpotifyEmbedEntity(
  kind: 'playlist' | 'album' | 'track',
  id: string
): Promise<{
  title: string;
  cover: string;
  entries: SpotifyRawEntry[];
  singleArtist?: string;
}> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/${kind}/${encodeURIComponent(id)}`, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { title: '', cover: '', entries: [] };
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match?.[1]) return { title: '', cover: '', entries: [] };
    const parsed = JSON.parse(match[1]);
    const entity = parsed?.props?.pageProps?.state?.data?.entity;
    const cover = String(
      entity?.coverArt?.sources?.[0]?.url ||
        entity?.visualIdentity?.image?.[0]?.url ||
        ''
    );
    if (kind === 'track') {
      const artistsList = Array.isArray(entity?.artists)
        ? entity.artists.map((a: any) => String(a?.name || '')).filter(Boolean).join(', ')
        : String(entity?.subtitle || '');
      return {
        title: String(entity?.title || entity?.name || 'Spotify Track'),
        cover,
        singleArtist: artistsList || 'Spotify Artist',
        entries: [
          {
            uri: String(entity?.uri || `spotify:track:${id}`),
            title: String(entity?.title || entity?.name || ''),
            subtitle: artistsList || 'Spotify Artist',
            duration: Number(entity?.duration || 195000),
            isExplicit: Boolean(entity?.isExplicit),
            audioPreview: entity?.audioPreview,
          },
        ],
      };
    }
    const entries = Array.isArray(entity?.trackList) ? (entity.trackList as SpotifyRawEntry[]) : [];
    return {
      title: String(entity?.title || entity?.name || (kind === 'album' ? 'Spotify Album' : 'Spotify Playlist')),
      cover,
      entries,
    };
  } catch {
    return { title: '', cover: '', entries: [] };
  }
}

export interface ImportedCollectionResult {
  ok: boolean;
  provider: 'spotify' | 'youtube_music';
  title: string;
  cover: string;
  tracks: MusicTrack[];
  topArtists: string[];
  error?: string;
}

export async function importExternalMusicUrl(rawUrl: string): Promise<ImportedCollectionResult> {
  const input = String(rawUrl || '').trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input);
  } catch {
    return {
      ok: false,
      provider: 'spotify',
      title: '',
      cover: '',
      tracks: [],
      topArtists: [],
      error: 'URL no válida. Pega un enlace completo de Spotify o YouTube Music.',
    };
  }

  const host = parsedUrl.hostname.toLowerCase();

  // 1. Spotify Playlist / Album / Track URL
  if (host.includes('spotify.com') || host === 'spoti.fi') {
    let targetUrl = parsedUrl.toString();
    if (host === 'spoti.fi') {
      try {
        const redir = await fetch(targetUrl, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(4000),
        });
        if (redir.url) targetUrl = redir.url;
      } catch {
        // ignore shortlink resolve fallback
      }
    }
    const m = targetUrl.match(/spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([a-zA-Z0-9]+)/i);
    if (!m) {
      const userMatch = targetUrl.match(/spotify\.com\/(?:intl-[a-z]+\/)?user\/([a-zA-Z0-9._-]+)/i);
      if (userMatch) {
        const spUser = userMatch[1];
        try {
          const profRes = await fetch(`https://open.spotify.com/user/${encodeURIComponent(spUser)}`, {
            headers: { 'User-Agent': CHROME_UA, Accept: 'text/html' },
            signal: AbortSignal.timeout(6000),
          });
          const html = profRes.ok ? await profRes.text() : '';
          const plIds = Array.from(
            new Set(
              Array.from(html.matchAll(/spotify(?:\.com)?[:/]playlist[:/]([a-zA-Z0-9]{15,32})/g)).map(
                (x) => x[1]
              )
            )
          ).slice(0, 4);

          if (plIds.length > 0) {
            const scraped = await Promise.all(plIds.map((pid) => fetchSpotifyEmbedEntity('playlist', pid)));
            const allTracks: MusicTrack[] = [];
            const seen = new Set<string>();
            const artistCount = new Map<string, number>();

            for (const ent of scraped) {
              for (const entry of ent.entries.filter((e) => e?.title).slice(0, 35)) {
                const tid = String(entry.uri || '').split(':').pop() || `${allTracks.length}`;
                if (seen.has(tid)) continue;
                seen.add(tid);
                const artistName = String(entry.subtitle || ent.singleArtist || 'Spotify Artist').trim();
                const primaryArtist = artistName.split(',')[0].trim();
                if (primaryArtist) {
                  artistCount.set(primaryArtist, (artistCount.get(primaryArtist) || 0) + 1);
                }
                allTracks.push({
                  id: `sp-${tid}`,
                  title: String(entry.title || 'Track').trim(),
                  artist: {
                    id: `sp-art-${encodeURIComponent(primaryArtist.toLowerCase())}`,
                    name: artistName,
                    picture: ent.cover,
                  },
                  album: {
                    id: `sp-user-${spUser}`,
                    title: ent.title || `Perfil ${spUser}`,
                    cover: ent.cover,
                    coverXl: ent.cover,
                  },
                  durationSec: Math.max(60, Math.round(Number(entry.duration || 195000) / 1000)),
                  explicit: Boolean(entry.isExplicit),
                  previewUrl: entry.audioPreview?.url ? String(entry.audioPreview.url) : undefined,
                  source: 'spotify',
                  spotifyId: tid,
                });
              }
            }

            if (allTracks.length > 0) {
              return {
                ok: true,
                provider: 'spotify',
                title: `Perfil Spotify · ${spUser}`,
                cover: allTracks[0]?.album.cover || '',
                tracks: allTracks.slice(0, 100),
                topArtists: Array.from(artistCount.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 15)
                  .map(([n]) => n),
              };
            }
          }
        } catch {
          // fall through to public playlist message
        }
      }
      return {
        ok: false,
        provider: 'spotify',
        title: '',
        cover: '',
        tracks: [],
        topArtists: [],
        error: 'Usa "Conectar con Spotify" o pega un enlace público de playlist/álbum/perfil (open.spotify.com/playlist/...).',
      };
    }
    const kind = m[1].toLowerCase() as 'playlist' | 'album' | 'track';
    const spId = m[2];
    const entity = await fetchSpotifyEmbedEntity(kind, spId);
    if (entity.entries.length === 0) {
      return {
        ok: false,
        provider: 'spotify',
        title: entity.title || 'Spotify',
        cover: entity.cover,
        tracks: [],
        topArtists: [],
        error: 'No pudimos leer esa lista. Asegúrate de que la playlist sea Pública (no privada) o inicia sesión arriba.',
      };
    }

    const sliced = entity.entries.filter((e) => e?.title).slice(0, 100);
    const artistCount = new Map<string, number>();
    const tracks: MusicTrack[] = sliced.map((entry, idx) => {
      const tid = String(entry.uri || '').split(':').pop() || `${spId}-${idx}`;
      const artistName = String(entry.subtitle || entity.singleArtist || 'Spotify Artist').trim();
      const primaryArtist = artistName.split(',')[0].trim();
      if (primaryArtist) {
        artistCount.set(primaryArtist, (artistCount.get(primaryArtist) || 0) + 1);
      }
      return {
        id: `sp-${tid}`,
        title: String(entry.title || 'Track').trim(),
        artist: {
          id: `sp-art-${encodeURIComponent(primaryArtist.toLowerCase())}`,
          name: artistName,
          picture: entity.cover,
        },
        album: {
          id: `sp-${kind}-${spId}`,
          title: entity.title || 'Spotify Import',
          cover: entity.cover,
          coverXl: entity.cover,
        },
        durationSec: Math.max(60, Math.round(Number(entry.duration || 195000) / 1000)),
        explicit: Boolean(entry.isExplicit),
        previewUrl: entry.audioPreview?.url ? String(entry.audioPreview.url) : undefined,
        source: 'spotify',
        spotifyId: tid,
      };
    });

    // Enrich first 18 tracks with individual cover art via iTunes/oEmbed concurrently
    await Promise.allSettled(
      tracks.slice(0, 18).map(async (trk) => {
        if (trk.spotifyId) {
          const thumb = await fetchSpotifyOembedThumb(`spotify:track:${trk.spotifyId}`);
          if (thumb) {
            trk.album.cover = thumb;
            trk.album.coverXl = thumb;
            trk.artist.picture = thumb;
          }
        }
      })
    );

    const topArtists = Array.from(artistCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name);

    return {
      ok: true,
      provider: 'spotify',
      title: entity.title || 'Spotify Import',
      cover: entity.cover || tracks[0]?.album.cover || '',
      tracks,
      topArtists,
    };
  }

  // 2. YouTube Music / YouTube Playlist / Channel URL
  if (host.includes('youtube.com') || host === 'youtu.be') {
    const listId = parsedUrl.searchParams.get('list') || '';
    const vId =
      parsedUrl.searchParams.get('v') ||
      (host === 'youtu.be' ? parsedUrl.pathname.replace(/^\//, '').slice(0, 11) : '');

    if (listId === 'LM' || listId === 'LL' || listId === 'WL') {
      return {
        ok: false,
        provider: 'youtube_music',
        title: '',
        cover: '',
        tracks: [],
        topArtists: [],
        error:
          'Tu lista "Me gusta" (LM/LL) requiere iniciar sesión arriba con "Conectar con Google / YouTube Music" para leerla automáticamente.',
      };
    }

    if (listId) {
      const browseId = listId.startsWith('VL') || listId.startsWith('MPREb_') ? listId : `VL${listId}`;
      const doc = await ytmBrowse(browseId);
      if (doc) {
        const header =
          collectRenderers(doc, 'musicResponsiveHeaderRenderer')[0] ||
          collectRenderers(doc, 'musicDetailHeaderRenderer')[0] ||
          collectRenderers(doc, 'musicEditablePlaylistDetailHeaderRenderer')[0]?.header
            ?.musicResponsiveHeaderRenderer;
        const plTitle = parseRunsText(header?.title).trim() || 'YouTube Music Playlist';
        const plCover =
          pickBestThumb(
            header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
              header?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails
          ) || '';

        const items = collectRenderers(doc, 'musicResponsiveListItemRenderer');
        const tracks: MusicTrack[] = [];
        const seen = new Set<string>();
        const artistCount = new Map<string, number>();

        for (const item of items) {
          const parsed = parseYtmTrackFromResponsive(item);
          if (parsed && !seen.has(parsed.id)) {
            seen.add(parsed.id);
            tracks.push(parsed);
            const art = parsed.artist.name.split(',')[0].trim();
            if (art && art !== 'YouTube Music') {
              artistCount.set(art, (artistCount.get(art) || 0) + 1);
            }
            if (tracks.length >= 100) break;
          }
        }

        if (tracks.length > 0) {
          return {
            ok: true,
            provider: 'youtube_music',
            title: plTitle,
            cover: plCover || tracks[0].album.cover,
            tracks,
            topArtists: Array.from(artistCount.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([name]) => name),
          };
        }
      }
      try {
        const ytPlRes = await fetch(
          `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`,
          {
            headers: { 'User-Agent': CHROME_UA, Accept: 'text/html' },
            signal: AbortSignal.timeout(7000),
          }
        );
        if (ytPlRes.ok) {
          const html = await ytPlRes.text();
          const initialMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
          if (initialMatch?.[1]) {
            const ytData = JSON.parse(initialMatch[1]);
            const videoRenderers = collectRenderers(ytData, 'playlistVideoRenderer');
            const tracks: MusicTrack[] = [];
            const seen = new Set<string>();
            const artistCount = new Map<string, number>();

            for (const vr of videoRenderers) {
              const videoId = String(vr?.videoId || '').trim();
              const title = parseRunsText(vr?.title).trim();
              if (!videoId || videoId.length !== 11 || !title || seen.has(`ytm-${videoId}`)) continue;
              seen.add(`ytm-${videoId}`);
              const artistName = parseRunsText(vr?.shortBylineText).replace(/\s*-\s*Topic$/i, '').trim() || 'YouTube';
              const cover =
                pickBestThumb(vr?.thumbnail?.thumbnails) ||
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
              const durationSec = Number(vr?.lengthSeconds || 0) || parseDurationLabel(parseRunsText(vr?.lengthText));
              tracks.push({
                id: `ytm-${videoId}`,
                title,
                artist: {
                  id: `ytm-art-${encodeURIComponent(artistName.toLowerCase())}`,
                  name: artistName,
                  picture: cover,
                },
                album: {
                  id: `ytm-alb-trk-${videoId}`,
                  title: 'YouTube Playlist',
                  cover,
                  coverXl: `https://i.ytimg.com/vi/${videoId}/hq720.jpg`,
                },
                durationSec,
                source: 'youtube_music',
                youtubeVideoId: videoId,
              });
              if (artistName !== 'YouTube') {
                artistCount.set(artistName, (artistCount.get(artistName) || 0) + 1);
              }
              if (tracks.length >= 100) break;
            }

            if (tracks.length > 0) {
              const plMetaTitle =
                String(ytData?.metadata?.playlistMetadataRenderer?.title || '').trim() ||
                'YouTube Playlist';
              return {
                ok: true,
                provider: 'youtube_music',
                title: plMetaTitle,
                cover: tracks[0].album.cover,
                tracks,
                topArtists: Array.from(artistCount.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 15)
                  .map(([name]) => name),
              };
            }
          }
        }
      } catch {
        // ignore HTML fallback error
      }

      return {
        ok: false,
        provider: 'youtube_music',
        title: '',
        cover: '',
        tracks: [],
        topArtists: [],
        error: 'No pudimos leer la playlist de YouTube Music. Inicia sesión arriba o verifica que sea Pública/Oculta.',
      };
    }

    if (vId && vId.length === 11) {
      const ytmSingle = await searchYouTubeMusic(vId);
      const hit = ytmSingle.tracks.find((t) => t.youtubeVideoId === vId) || ytmSingle.tracks[0];
      if (hit) {
        return {
          ok: true,
          provider: 'youtube_music',
          title: hit.title,
          cover: hit.album.cover,
          tracks: [hit],
          topArtists: hit.artist.name !== 'YouTube Music' ? [hit.artist.name] : [],
        };
      }
    }

    // Channel / handle public playlists scraping (/channel/... or /@handle)
    const chPath = parsedUrl.pathname.replace(/\/+$/, '');
    if (/^\/(@[^/]+|channel\/UC[^/]+)/.test(chPath)) {
      try {
        const ytRes = await fetch(`https://www.youtube.com${chPath}/playlists`, {
          headers: { 'User-Agent': CHROME_UA, Accept: 'text/html' },
          signal: AbortSignal.timeout(6000),
        });
        const html = ytRes.ok ? await ytRes.text() : '';
        const plIds = Array.from(
          new Set(
            Array.from(html.matchAll(/"playlistId":"(PL[a-zA-Z0-9_-]{12,})"/g)).map((x) => x[1])
          )
        ).slice(0, 3);
        if (plIds.length > 0) {
          const docs = await Promise.all(plIds.map((pid) => ytmBrowse(`VL${pid}`)));
          const allTracks: MusicTrack[] = [];
          const seen = new Set<string>();
          const artistCount = new Map<string, number>();
          for (const doc of docs) {
            if (!doc) continue;
            for (const item of collectRenderers(doc, 'musicResponsiveListItemRenderer')) {
              const parsed = parseYtmTrackFromResponsive(item);
              if (parsed && !seen.has(parsed.id)) {
                seen.add(parsed.id);
                allTracks.push(parsed);
                const art = parsed.artist.name.split(',')[0].trim();
                if (art && art !== 'YouTube Music') {
                  artistCount.set(art, (artistCount.get(art) || 0) + 1);
                }
                if (allTracks.length >= 90) break;
              }
            }
          }
          if (allTracks.length > 0) {
            return {
              ok: true,
              provider: 'youtube_music',
              title: `Canal YouTube ${chPath.replace(/^\//, '')}`,
              cover: allTracks[0]?.album.cover || '',
              tracks: allTracks,
              topArtists: Array.from(artistCount.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15)
                .map(([n]) => n),
            };
          }
        }
      } catch {
        // ignore channel scrape fallback error
      }
    }
  }

  return {
    ok: false,
    provider: 'youtube_music',
    title: '',
    cover: '',
    tracks: [],
    topArtists: [],
    error: 'Enlace no reconocido. Usa Conectar Cuenta arriba o pega open.spotify.com/playlist/... / music.youtube.com/playlist?list=...',
  };
}

export async function matchImportedTracksBatch(
  items: Array<{ title: string; artist: string; album?: string; durationSec?: number }>
): Promise<MusicTrack[]> {
  const cleanItems = items
    .filter((i) => i && typeof i.title === 'string' && i.title.trim())
    .slice(0, 45);

  const results: Array<MusicTrack | null> = new Array(cleanItems.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= cleanItems.length) break;
      const item = cleanItems[idx];
      const title = item.title.trim();
      const artist = String(item.artist || '').trim();
      const query = artist && artist.toLowerCase() !== 'desconocido' ? `${artist} ${title}` : title;

      try {
        // Fast iTunes + Deezer lookup to grab cover art, clean artist/title, and duration
        const [dzRes, itList] = await Promise.all([
          fetch(`https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=3`, {
            signal: AbortSignal.timeout(3500),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          searchItunesMusic(query, 'song', 2, 'ES'),
        ]);

        const dzHit = Array.isArray(dzRes?.data) ? dzRes.data[0] : null;
        if (dzHit?.id) {
          results[idx] = {
            id: `dz-${dzHit.id}`,
            title: String(dzHit.title_short || dzHit.title || title),
            artist: {
              id: String(dzHit.artist?.id || `imp-art-${idx}`),
              name: String(dzHit.artist?.name || artist || 'Artista'),
              picture: String(dzHit.artist?.picture_medium || dzHit.album?.cover_medium || ''),
            },
            album: {
              id: String(dzHit.album?.id || `imp-alb-${idx}`),
              title: String(dzHit.album?.title || item.album || 'Importado'),
              cover: String(dzHit.album?.cover_big || dzHit.album?.cover_medium || ''),
              coverXl: String(dzHit.album?.cover_xl || dzHit.album?.cover_big || ''),
            },
            durationSec: Number(dzHit.duration || item.durationSec || 195),
            explicit: Boolean(dzHit.explicit_lyrics),
            previewUrl: dzHit.preview ? String(dzHit.preview) : undefined,
            isrc: dzHit.isrc ? String(dzHit.isrc) : undefined,
            source: 'deezer',
          };
          continue;
        }

        if (itList[0]) {
          results[idx] = mapItunesSongToTrack(itList[0], 'spotify');
          continue;
        }
      } catch {
        // fallback cleanly to raw imported metadata so song is never lost
      }

      results[idx] = {
        id: `imp-${Buffer.from(`${artist}|${title}`).toString('base64url').slice(0, 18)}`,
        title,
        artist: {
          id: `imp-art-${encodeURIComponent((artist || 'art').toLowerCase())}`,
          name: artist || 'Artista',
        },
        album: {
          id: `imp-alb-${idx}`,
          title: item.album || 'Importado',
          cover: '',
        },
        durationSec: item.durationSec || 200,
        source: 'spotify',
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, cleanItems.length) }, () => worker()));
  return results.filter((t): t is MusicTrack => Boolean(t));
}

