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
  trackId?: string;
  sourceType: 'audio-hls' | 'audio-mp3' | 'youtube' | 'preview';
  sourceLabel: string;
  streamUrl?: string;
  proxiedUrl?: string;
  youtubeVideoId?: string;
  youtubeMvId?: string;
  previewUrl?: string;
  fullLength: boolean;
  spatial8dYtFallback?: boolean;
  bitrateKbps?: number;
  provider?: string;
  alternatives?: PlaybackSourceCandidate[];
}

export interface UserMusicPlaylist {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  tracks: MusicTrack[];
}

export type EqPresetId = 'flat' | 'bass' | 'vocal' | 'club' | 'acoustic';
export type Spatial8dMode = 'orbit' | 'concert' | 'club';
export type SpatialTrajectory = 'orbit' | 'pendulum' | 'figure8' | 'elevated';
export type MusicRepeatMode = 'off' | 'all' | 'one';
export type MusicViewMode = 'audio' | 'video';
export type ExportBitrate = '128k' | '192k' | '320k';
export type VocalStemMode = 'both' | 'vocals' | 'instrumental';

export type AudioEffectId =
  | 'none'
  | 'slowed_reverb'
  | 'nightcore'
  | 'bass_boost'
  | 'lofi_vinyl'
  | 'underwater'
  | 'stadium_echo'
  | 'vaporwave'
  | 'radio_vintage'
  | 'club_pingpong'
  | 'custom';

export interface AudioFxParams {
  playbackRate: number;
  preservePitch: boolean;
  reverbMix: number;
  echoMix: number;
  echoTimeMs: number;
  lowpassHz: number;
  highpassHz: number;
  saturation: number;
  chorusMix: number;
  bassBoostDb: number;
  trebleBoostDb: number;
}

export type EqBands5 = [number, number, number, number, number];
export type EqBands10 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type ProVibePresetId =
  | 'original'
  | '8d_ultra'
  | 'slowed_reverb'
  | 'nightcore'
  | 'bass_extreme'
  | 'lofi_warmth';

export interface CustomStudioPreset {
  id: string;
  name: string;
  createdAt: number;
  eqBands10: EqBands10;
  spatial8dEnabled: boolean;
  spatial8dMode: Spatial8dMode;
  spatialTrajectory: SpatialTrajectory;
  spatial8dSpeedSec: number;
  bassBoostDb: number;
  reverbMix: number;
  stereoWidth: number;
  exciterMix: number;
  vinylCrackle: number;
  vocalCancel: boolean;
  pitchSemitones: number;
  playbackRate: number;
  preservesPitch: boolean;
}

export interface TrackStudioProfile {
  trackId: string;
  eqBands10?: EqBands10;
  spatial8dEnabled?: boolean;
  spatialTrajectory?: SpatialTrajectory;
  spatial8dSpeedSec?: number;
  bassBoostDb?: number;
  reverbMix?: number;
  stereoWidth?: number;
  exciterMix?: number;
  vinylCrackle?: number;
  vocalCancel?: boolean;
  pitchSemitones?: number;
  playbackRate?: number;
  preservesPitch?: boolean;
  trimStartSec?: number;
  trimEndSec?: number;
  fadeSec?: number;
}

export interface DownloadJob {
  id: string;
  track: MusicTrack;
  mode: string;
  bitrate: ExportBitrate;
  status: 'queued' | 'downloading' | 'done' | 'error' | 'cancelled';
  progressPct: number;
  loadedBytes: number;
  totalBytes: number;
  error?: string;
  createdAt: number;
}

export interface ListeningTrackStat {
  count: number;
  title: string;
  artist: string;
  cover: string;
  lastPlayedAt: number;
}

export interface ListeningArtistStat {
  count: number;
  name: string;
  picture?: string;
}

export interface ListeningStats {
  totalPlays: number;
  totalListenSec: number;
  trackPlayCounts: Record<string, ListeningTrackStat>;
  artistPlayCounts: Record<string, ListeningArtistStat>;
}

export interface ImportedTasteSource {
  id: string;
  provider: 'spotify' | 'youtube_music' | 'file';
  label: string;
  trackCount: number;
  importedAt: number;
}

export interface TasteProfile {
  favoriteArtists: string[];
  favoriteGenres: string[];
  importedSources: ImportedTasteSource[];
}

export interface ImportedTrackInput {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  sourceHint?: string;
}

export interface MusicHomePayload {
  topTracks: MusicTrack[];
  youtubeMusicHits: MusicTrack[];
  youtubeMusicAlbums: MusicAlbumRef[];
  spotifyHits: MusicTrack[];
  spotifyAlbums: MusicAlbumRef[];
  spainHits: MusicTrack[];
  moroccoMix: MusicTrack[];
  arabMix: MusicTrack[];
  africaMix: MusicTrack[];
  russiaMix: MusicTrack[];
  romaniaMix: MusicTrack[];
  chinaMix: MusicTrack[];
  usaMix: MusicTrack[];
  urbanoMix: MusicTrack[];
  popMix: MusicTrack[];
  electronicMix: MusicTrack[];
  rockIndieMix: MusicTrack[];
  latinSalsaMix: MusicTrack[];
  rnbSoulMix: MusicTrack[];
  chillLofiMix: MusicTrack[];
  flamencoAcousticMix: MusicTrack[];
  soundtrackMix: MusicTrack[];
  classicsMix: MusicTrack[];
  audiusTrending: MusicTrack[];
  topAlbums: MusicAlbumRef[];
  newReleases: MusicAlbumRef[];
  topArtists: MusicArtistRef[];
  editorialPlaylists: MusicPlaylist[];
  genres: MusicGenre[];
  radios: MusicRadioStation[];
}

export type MusicNavTab = 'home' | 'search' | 'library' | 'radios';

export type MusicSearchFilter = 'all' | 'tracks' | 'artists' | 'albums' | 'playlists' | 'radios';

export type HomeMoodFilterId =
  | 'all'
  | 'youtube_music'
  | 'spotify'
  | 'morocco'
  | 'arab'
  | 'africa'
  | 'russia'
  | 'romania'
  | 'china'
  | 'usa'
  | 'latin'
  | 'spain'
  | 'urbano'
  | 'pop'
  | 'electronic'
  | 'rock'
  | 'chill'
  | 'flamenco'
  | 'rnb'
  | 'soundtrack'
  | 'classics'
  | 'audius';

export type MusicDetailView =
  | { kind: 'album'; id: string; album?: MusicAlbumRef; tracks: MusicTrack[]; loading: boolean }
  | {
      kind: 'artist';
      id: string;
      artist?: MusicArtistRef;
      topTracks: MusicTrack[];
      albums: MusicAlbumRef[];
      related: MusicArtistRef[];
      loading: boolean;
    }
  | { kind: 'playlist'; id: string; playlist?: MusicPlaylist; tracks: MusicTrack[]; loading: boolean }
  | { kind: 'genre'; genre: MusicGenre; artists: MusicArtistRef[]; tracks: MusicTrack[]; loading: boolean }
  | { kind: 'liked' }
  | { kind: 'curated'; title: string; subtitle: string; cover: string; tracks: MusicTrack[] }
  | { kind: 'user_playlist'; playlistId: string };

export interface MusicSearchResultsPayload {
  tracks: MusicTrack[];
  albums: MusicAlbumRef[];
  artists: MusicArtistRef[];
  playlists: MusicPlaylist[];
  radios: MusicRadioStation[];
}

