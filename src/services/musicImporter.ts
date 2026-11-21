import type { ImportedTrackInput } from '../types/music';

export interface ParsedMusicImportResult {
  format:
    | 'spotify_library'
    | 'spotify_history'
    | 'spotify_playlist'
    | 'youtube_takeout'
    | 'csv'
    | 'm3u'
    | 'riffan_json'
    | 'text';
  playlistTitle?: string;
  tracks: ImportedTrackInput[];
  topArtists: string[];
  topGenres: string[];
  totalRawEntries: number;
}

function cleanArtistName(raw: string): string {
  return String(raw || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/^VEVO\s*-?\s*/i, '')
    .trim();
}

function cleanTrackTitle(raw: string): string {
  return String(raw || '')
    .replace(/^(Watched|Liked|Reproduciste|Te gustó)\s+/i, '')
    .replace(/\s*\((?:Official\s*(?:Music\s*)?Video|Audio\s*Oficial|Lyric\s*Video|Visualizer|Live|HD|4K)\)/gi, '')
    .replace(/\s*\[(?:Official\s*(?:Music\s*)?Video|Audio\s*Oficial|Lyric\s*Video)\]/gi, '')
    .trim();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function finalizeImport(
  format: ParsedMusicImportResult['format'],
  rawTracks: Array<ImportedTrackInput & { weight?: number }>,
  extraArtists: string[],
  rawGenres: string[],
  playlistTitle?: string
): ParsedMusicImportResult {
  const trackMap = new Map<string, ImportedTrackInput & { weight: number }>();
  const artistWeights = new Map<string, number>();

  for (const a of extraArtists) {
    const cleanA = cleanArtistName(a);
    if (cleanA && cleanA.toLowerCase() !== 'desconocido') {
      artistWeights.set(cleanA, (artistWeights.get(cleanA) || 0) + 5);
    }
  }

  for (const t of rawTracks) {
    const title = cleanTrackTitle(t.title);
    const artist = cleanArtistName(t.artist);
    if (!title || title.length < 2) continue;
    const primaryArtist = artist.split(',')[0].trim();
    const key = `${primaryArtist.toLowerCase()}|${title.toLowerCase()}`;
    const w = t.weight || 1;
    const prev = trackMap.get(key);
    if (prev) {
      prev.weight += w;
    } else {
      trackMap.set(key, {
        title,
        artist: artist || 'Artista',
        album: t.album,
        durationSec: t.durationSec,
        sourceHint: t.sourceHint,
        weight: w,
      });
    }
    if (primaryArtist && primaryArtist.toLowerCase() !== 'artista' && primaryArtist.toLowerCase() !== 'desconocido') {
      artistWeights.set(primaryArtist, (artistWeights.get(primaryArtist) || 0) + w);
    }
  }

  const dedupedTracks = Array.from(trackMap.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 120)
    .map(({ weight: _w, ...rest }) => rest);

  const topArtists = Array.from(artistWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([name]) => name);

  const genreCounts = new Map<string, number>();
  for (const g of rawGenres) {
    const cg = g.trim();
    if (!cg) continue;
    genreCounts.set(cg, (genreCounts.get(cg) || 0) + 1);
  }
  const topGenres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([g]) => g);

  return {
    format,
    playlistTitle,
    tracks: dedupedTracks,
    topArtists,
    topGenres,
    totalRawEntries: rawTracks.length,
  };
}

export function parseMusicImportText(content: string, fileName = ''): ParsedMusicImportResult {
  const trimmed = content.trim();
  const lowerName = fileName.toLowerCase();

  // 1. JSON formats (Spotify Privacy Export, Google Takeout, Riffan JSON)
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || lowerName.endsWith('.json')) {
    try {
      const json = JSON.parse(trimmed);

      // 1a. Riffan Music exported playlist JSON
      if (json && typeof json === 'object' && Array.isArray(json.tracks) && typeof json.name === 'string') {
        const tracks: ImportedTrackInput[] = json.tracks
          .filter((t: any) => t && t.title)
          .map((t: any) => ({
            title: String(t.title),
            artist: String(t.artist?.name || t.artist || ''),
            album: String(t.album?.title || t.album || ''),
            durationSec: Number(t.durationSec || 0) || undefined,
          }));
        return finalizeImport('riffan_json', tracks, [], [], json.name);
      }

      // 1b. Spotify YourLibrary.json ({ tracks: [{ artist, album, track }], artists: [{ name }] })
      if (json && typeof json === 'object' && (Array.isArray(json.tracks) || Array.isArray(json.artists))) {
        const tracks: ImportedTrackInput[] = Array.isArray(json.tracks)
          ? json.tracks.map((t: any) => ({
              title: String(t.track || t.name || ''),
              artist: String(t.artist || ''),
              album: String(t.album || ''),
              sourceHint: 'spotify',
            }))
          : [];
        const artists: string[] = Array.isArray(json.artists)
          ? json.artists.map((a: any) => String(a?.name || a || '')).filter(Boolean)
          : [];
        return finalizeImport('spotify_library', tracks, artists, [], 'Spotify Your Library');
      }

      // 1c. Spotify Playlist1.json ({ playlists: [{ name, items: [{ track: { trackName, artistName, albumName } }] }] })
      if (json && typeof json === 'object' && Array.isArray(json.playlists)) {
        const firstPl = json.playlists[0];
        const tracks: ImportedTrackInput[] = [];
        for (const pl of json.playlists) {
          for (const item of pl?.items || []) {
            const tr = item?.track || item;
            if (tr?.trackName || tr?.name) {
              tracks.push({
                title: String(tr.trackName || tr.name),
                artist: String(tr.artistName || tr.artist || ''),
                album: String(tr.albumName || tr.album || ''),
                sourceHint: 'spotify',
              });
            }
          }
        }
        return finalizeImport(
          'spotify_playlist',
          tracks,
          [],
          [],
          firstPl?.name ? String(firstPl.name) : 'Spotify Playlists'
        );
      }

      // 1d. Array JSON: Spotify StreamingHistory_music_*.json / endsong_*.json OR Google Takeout watch-history.json
      if (Array.isArray(json)) {
        const isYtmTakeout = json.some(
          (row: any) =>
            row &&
            (String(row.header || '').toLowerCase().includes('youtube') ||
              Array.isArray(row.subtitles) ||
              typeof row.titleUrl === 'string')
        );

        if (isYtmTakeout) {
          const tracks: Array<ImportedTrackInput & { weight?: number }> = [];
          for (const row of json) {
            const header = String(row?.header || '');
            const url = String(row?.titleUrl || '');
            const isMusicRow =
              header.toLowerCase().includes('music') ||
              url.includes('music.youtube.com') ||
              Array.isArray(row?.subtitles);
            if (!isMusicRow) continue;
            const rawTitle = String(row?.title || '').trim();
            if (!rawTitle || rawTitle.includes('Watched a video that has been removed')) continue;
            const cleanTitle = cleanTrackTitle(rawTitle);
            const artistFromSub = row?.subtitles?.[0]?.name ? cleanArtistName(String(row.subtitles[0].name)) : '';
            // Fallback split "Artist - Title" if artist is missing
            let finalArtist = artistFromSub;
            let finalTitle = cleanTitle;
            if (!finalArtist && cleanTitle.includes(' - ')) {
              const parts = cleanTitle.split(' - ');
              finalArtist = cleanArtistName(parts[0]);
              finalTitle = cleanTrackTitle(parts.slice(1).join(' - '));
            }
            if (finalTitle) {
              tracks.push({
                title: finalTitle,
                artist: finalArtist || 'YouTube Music',
                sourceHint: 'youtube_music',
                weight: 1,
              });
            }
          }
          return finalizeImport('youtube_takeout', tracks, [], [], 'YouTube Music Takeout');
        }

        // Spotify StreamingHistory / Extended History
        const tracks: Array<ImportedTrackInput & { weight?: number }> = [];
        for (const row of json) {
          const title = String(
            row?.trackName || row?.master_metadata_track_name || ''
          ).trim();
          const artist = String(
            row?.artistName || row?.master_metadata_album_artist_name || ''
          ).trim();
          const msPlayed = Number(row?.msPlayed ?? row?.ms_played ?? 60000);
          if (!title || !artist || msPlayed < 20000) continue;
          tracks.push({
            title,
            artist,
            album: row?.master_metadata_album_album_name ? String(row.master_metadata_album_album_name) : undefined,
            sourceHint: 'spotify',
            weight: Math.max(1, Math.round(msPlayed / 120000)),
          });
        }
        return finalizeImport('spotify_history', tracks, [], [], 'Spotify Streaming History');
      }
    } catch {
      // fall through to CSV / M3U / plain text parsers
    }
  }

  // 2. M3U / M3U8 Playlists
  if (trimmed.includes('#EXTM3U') || trimmed.includes('#EXTINF:') || lowerName.endsWith('.m3u') || lowerName.endsWith('.m3u8')) {
    const tracks: ImportedTrackInput[] = [];
    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^#EXTINF:-?\d+,(.*)$/);
      if (!m) continue;
      const body = m[1].trim();
      const dash = body.indexOf(' - ');
      if (dash > 0) {
        tracks.push({
          artist: body.slice(0, dash).trim(),
          title: body.slice(dash + 3).trim(),
        });
      } else if (body) {
        tracks.push({ artist: '', title: body });
      }
    }
    if (tracks.length > 0) {
      return finalizeImport('m3u', tracks, [], [], fileName.replace(/\.(m3u8?|txt)$/i, '') || 'M3U Playlist');
    }
  }

  // 3. CSV (Exportify, TuneMyMusic, Soundiiz, Google Takeout CSV)
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length >= 2 && lines[0].includes(',')) {
    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idxTitle = headers.findIndex((h) =>
      /track name|title|song|cancion|canción|name/.test(h)
    );
    const idxArtist = headers.findIndex((h) => /artist|artista/.test(h));
    const idxAlbum = headers.findIndex((h) => /album|álbum/.test(h));
    const idxGenres = headers.findIndex((h) => /genre|género/.test(h));
    const idxDur = headers.findIndex((h) => /duration|length|duración/.test(h));

    if (idxTitle !== -1 || idxArtist !== -1) {
      const tracks: ImportedTrackInput[] = [];
      const rawGenres: string[] = [];
      for (const rowLine of lines.slice(1)) {
        const cols = parseCsvLine(rowLine);
        const title = idxTitle !== -1 ? cols[idxTitle] || '' : '';
        const artist = idxArtist !== -1 ? cols[idxArtist] || '' : '';
        const album = idxAlbum !== -1 ? cols[idxAlbum] || '' : '';
        if (idxGenres !== -1 && cols[idxGenres]) {
          cols[idxGenres].split(/[;,]/).forEach((g) => rawGenres.push(g));
        }
        const durMs = idxDur !== -1 ? Number(cols[idxDur] || 0) : 0;
        const durationSec = durMs > 1000 ? Math.round(durMs / 1000) : durMs > 0 ? durMs : undefined;
        if (title) {
          tracks.push({ title, artist, album, durationSec });
        }
      }
      if (tracks.length > 0) {
        return finalizeImport(
          'csv',
          tracks,
          [],
          rawGenres,
          fileName.replace(/\.csv$/i, '') || 'Playlist Importada'
        );
      }
    }
  }

  // 4. Plain text "Artist - Title" lines
  const textTracks: ImportedTrackInput[] = [];
  for (const line of lines) {
    const clean = line.replace(/^\d+[.)]\s*/, '').trim();
    if (!clean || clean.startsWith('#')) continue;
    const parts = clean.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
      textTracks.push({
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim(),
      });
    } else {
      textTracks.push({ artist: '', title: clean });
    }
  }
  return finalizeImport('text', textTracks, [], [], fileName || 'Lista de Canciones');
}

export function buildM3u8FromTracks(name: string, tracks: Array<{ title: string; artist: { name: string }; durationSec: number; streamUrl?: string; previewUrl?: string }>): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${name}`];
  for (const t of tracks) {
    const dur = Math.max(0, Math.round(t.durationSec || 180));
    lines.push(`#EXTINF:${dur},${t.artist.name} - ${t.title}`);
    lines.push(t.streamUrl || t.previewUrl || `riffan://track/${encodeURIComponent(`${t.artist.name} - ${t.title}`)}`);
  }
  return lines.join('\n');
}
