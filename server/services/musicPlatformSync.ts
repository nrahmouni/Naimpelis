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

function parseYtmTrackFromResponsive(item: any): MusicTrack | null {
  const flexCols = Array.isArray(item?.flexColumns) ? item.flexColumns : [];
  const titleRun = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text;
  const subRun = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text;
  const title = parseRunsText(titleRun).trim();

  const videoId =
    item?.playlistItemData?.videoId ||
    item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
      ?.watchEndpoint?.videoId ||
    titleRun?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
    '';

  if (!title || !videoId || typeof videoId !== 'string' || videoId.length !== 11) return null;

  const subParts = parseRunsText(subRun)
    .split('•')
    .map((s) => s.trim())
    .filter((s) => s && !/^(song|canción|video|vídeo|single|ep)$/i.test(s));

  const artistName = subParts[0] || 'YouTube Music';
  const albumTitle = subParts[1] || 'YouTube Music';
  const durPart = subParts.find((p) => /^\d+:\d{2}/.test(p)) || '';
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
    (p) => !/^(album|álbum|single|ep|song|canción|video|vídeo)$/i.test(p)
  );
  const artistName = cleanedParts[0] || parts[parts.length - 1] || 'YouTube Music';

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
        genres: parts[0] && /^(album|álbum|single|ep)$/i.test(parts[0]) ? [parts[0]] : ['Álbum'],
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
      body: JSON.stringify({ context: YTM_CONTEXT, query }),
      signal: AbortSignal.timeout(8500),
    });
    if (!res.ok) return { tracks: [], albums: [] };
    const doc = await res.json();
    const tracks: MusicTrack[] = [];
    const albums: MusicAlbumRef[] = [];
    const seenT = new Set<string>();
    const seenA = new Set<string>();

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
          .filter((s) => s && !/^(album|álbum|single|ep)$/i.test(s));
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
    return { tracks: tracks.slice(0, 18), albums: albums.slice(0, 10) };
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
