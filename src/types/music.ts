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

export interface UserMusicPlaylist {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  tracks: MusicTrack[];
}

export type EqPresetId = 'flat' | 'bass' | 'vocal' | 'club' | 'acoustic';
export type MusicRepeatMode = 'off' | 'all' | 'one';
export type MusicViewMode = 'audio' | 'video';
