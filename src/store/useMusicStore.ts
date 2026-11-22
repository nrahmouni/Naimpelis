import { create } from 'zustand';
import type {
  AiMoodPlaylistResult,
  CustomStudioPreset,
  DownloadJob,
  EqBands10,
  EqBands5,
  EqPresetId,
  ExportBitrate,
  HomeMoodFilterId,
  JamSessionState,
  ListeningStats,
  MusicAlbumRef,
  MusicDetailView,
  MusicNavTab,
  MusicPlaylist,
  MusicRadioStation,
  MusicRepeatMode,
  MusicSearchFilter,
  MusicSearchResultsPayload,
  MusicTrack,
  MusicViewMode,
  PlaybackSourceCandidate,
  ProVibePresetId,
  ResolvedTrackPlayback,
  Spatial8dMode,
  SpatialTrajectory,
  TasteProfile,
  TrackStudioProfile,
  UserMusicPlaylist,
} from '../types/music';
import type { MusicLang } from '../components/music/musicI18n';
import type { CloudMusicSnapshotPayload } from '../services/cloudSync/cloudMusicSync';
import {
  dedupeMusicTracks,
  getTrackDedupeKey,
  isSameMusicTrackVariant,
} from '../utils/musicDedupe';
import {
  getSpatialPresetConfig,
  normalizeSpatialPresetId,
} from '../components/music/spatialPresets';

const STORAGE_KEY = 'riffan_music_library_v2';
const LEGACY_STORAGE_KEY = 'riffan_music_library_v1';

export const EQ_10_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'] as const;

const EQ_BAND_PRESETS_10: Record<EqPresetId, EqBands10> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6.5, 5.5, 4, 1.5, 0, 0, 0.5, 1, 2, 2.5],
  vocal: [-3, -2, -1, 0.5, 2.5, 4.5, 4, 3, 1.5, 0],
  club: [5.5, 4.5, 2.5, 0, -1.5, 0, 2, 3.5, 4.5, 5],
  acoustic: [3, 2, 1.5, 1, 1.5, 2, 3, 2.5, 2, 1.5],
};

function toEq5From10(b: EqBands10): EqBands5 {
  return [
    Number(((b[0] + b[1]) / 2).toFixed(1)),
    Number(((b[2] + b[3]) / 2).toFixed(1)),
    Number(((b[4] + b[5]) / 2).toFixed(1)),
    Number(((b[6] + b[7]) / 2).toFixed(1)),
    Number(((b[8] + b[9]) / 2).toFixed(1)),
  ];
}

function expandEq5To10(b5: EqBands5): EqBands10 {
  return [b5[0], b5[0], b5[1], b5[1], b5[2], b5[2], b5[3], b5[3], b5[4], b5[4]];
}

interface PersistedLibrary {
  likedTracks: MusicTrack[];
  savedAlbums: MusicAlbumRef[];
  savedPlaylists: MusicPlaylist[];
  userPlaylists: UserMusicPlaylist[];
  recentTracks: MusicTrack[];
  searchHistory: string[];
  eqPreset: EqPresetId;
  eqBands: EqBands5;
  eqBands10: EqBands10;
  preservesPitch: boolean;
  pitchSemitones: number;
  bassBoostDb: number;
  reverbMix: number;
  stereoWidth: number;
  exciterMix: number;
  vinylCrackle: number;
  vocalCancel: boolean;
  crossfadeSec: number;
  normalizeAudio: boolean;
  spatial8dSpeedSec: number;
  spatial8dEnabled: boolean;
  spatial8dMode: Spatial8dMode;
  spatialTrajectory: SpatialTrajectory;
  autoDownloadMp3: boolean;
  wifiOnlyAutoDownload: boolean;
  exportBitrate: ExportBitrate;
  perTrackProfilesEnabled: boolean;
  trackProfiles: Record<string, TrackStudioProfile>;
  customPresets: CustomStudioPreset[];
  listeningStats: ListeningStats;
  tasteProfile: TasteProfile;
  autoplaySimilar: boolean;
  autoDjEnabled: boolean;
  volume: number;
  musicLang: MusicLang;
  musicLangV2?: boolean;
}

function isValidMusicLang(val: unknown): val is MusicLang {
  return val === 'es' || val === 'en' || val === 'fr' || val === 'zh' || val === 'ca';
}

function isValidSpatialMode(val: unknown): val is Spatial8dMode {
  return (
    val === 'orbit_drift' ||
    val === 'arena_live' ||
    val === 'deep_3d' ||
    val === 'dynamic_groove' ||
    val === 'intimate_room' ||
    val === 'orbit' ||
    val === 'concert' ||
    val === 'club'
  );
}

function isValidTrajectory(val: unknown): val is SpatialTrajectory {
  return val === 'orbit' || val === 'pendulum' || val === 'figure8' || val === 'elevated';
}

function isValidEqBands5(val: unknown): val is EqBands5 {
  return Array.isArray(val) && val.length === 5 && val.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isValidEqBands10(val: unknown): val is EqBands10 {
  return Array.isArray(val) && val.length === 10 && val.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

const DEFAULT_STATS: ListeningStats = {
  totalPlays: 0,
  totalListenSec: 0,
  trackPlayCounts: {},
  artistPlayCounts: {},
  trackSignals: {},
};

const DEFAULT_TASTE: TasteProfile = {
  favoriteArtists: [],
  favoriteGenres: [],
  importedSources: [],
};

function loadLibrary(): PersistedLibrary {
  const defaults: PersistedLibrary = {
    likedTracks: [],
    savedAlbums: [],
    savedPlaylists: [],
    userPlaylists: [],
    recentTracks: [],
    searchHistory: [],
    eqPreset: 'flat',
    eqBands: [0, 0, 0, 0, 0],
    eqBands10: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preservesPitch: true,
    pitchSemitones: 0,
    bassBoostDb: 0,
    reverbMix: 0,
    stereoWidth: 0.45,
    exciterMix: 0,
    vinylCrackle: 0,
    vocalCancel: false,
    crossfadeSec: 2,
    normalizeAudio: true,
    spatial8dSpeedSec: 11.5,
    spatial8dEnabled: false,
    spatial8dMode: 'orbit_drift',
    spatialTrajectory: 'orbit',
    autoDownloadMp3: false,
    wifiOnlyAutoDownload: true,
    exportBitrate: '320k',
    perTrackProfilesEnabled: true,
    trackProfiles: {},
    customPresets: [],
    listeningStats: DEFAULT_STATS,
    tasteProfile: DEFAULT_TASTE,
    autoplaySimilar: true,
    autoDjEnabled: false,
    volume: 0.85,
    musicLang: 'en',
    musicLangV2: true,
  };
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedLibrary>;
    const eqPreset = parsed.eqPreset && EQ_BAND_PRESETS_10[parsed.eqPreset] ? parsed.eqPreset : 'flat';
    const eqBands10 = isValidEqBands10(parsed.eqBands10)
      ? parsed.eqBands10
      : isValidEqBands5(parsed.eqBands)
      ? expandEq5To10(parsed.eqBands)
      : ([...EQ_BAND_PRESETS_10[eqPreset]] as EqBands10);
    return {
      likedTracks: Array.isArray(parsed.likedTracks) ? parsed.likedTracks : [],
      savedAlbums: Array.isArray(parsed.savedAlbums) ? parsed.savedAlbums : [],
      savedPlaylists: Array.isArray(parsed.savedPlaylists) ? parsed.savedPlaylists : [],
      userPlaylists: Array.isArray(parsed.userPlaylists) ? parsed.userPlaylists : [],
      recentTracks: Array.isArray(parsed.recentTracks) ? parsed.recentTracks : [],
      searchHistory: Array.isArray(parsed.searchHistory) ? parsed.searchHistory.slice(0, 12) : [],
      eqPreset,
      eqBands10,
      eqBands: toEq5From10(eqBands10),
      preservesPitch: typeof parsed.preservesPitch === 'boolean' ? parsed.preservesPitch : true,
      pitchSemitones: typeof parsed.pitchSemitones === 'number' ? clamp(parsed.pitchSemitones, -12, 12) : 0,
      bassBoostDb: typeof parsed.bassBoostDb === 'number' ? clamp(parsed.bassBoostDb, 0, 12) : 0,
      reverbMix: typeof parsed.reverbMix === 'number' ? clamp(parsed.reverbMix, 0, 0.75) : 0,
      stereoWidth: typeof parsed.stereoWidth === 'number' ? clamp(parsed.stereoWidth, 0, 1) : 0.45,
      exciterMix: typeof parsed.exciterMix === 'number' ? clamp(parsed.exciterMix, 0, 1) : 0,
      vinylCrackle: typeof parsed.vinylCrackle === 'number' ? clamp(parsed.vinylCrackle, 0, 1) : 0,
      vocalCancel: Boolean(parsed.vocalCancel),
      crossfadeSec: typeof parsed.crossfadeSec === 'number' ? clamp(parsed.crossfadeSec, 0, 10) : 2,
      normalizeAudio: typeof parsed.normalizeAudio === 'boolean' ? parsed.normalizeAudio : true,
      spatial8dSpeedSec:
        typeof parsed.spatial8dSpeedSec === 'number' ? clamp(parsed.spatial8dSpeedSec, 3, 20) : 9.5,
      autoDownloadMp3: Boolean(parsed.autoDownloadMp3),
      wifiOnlyAutoDownload:
        typeof parsed.wifiOnlyAutoDownload === 'boolean' ? parsed.wifiOnlyAutoDownload : true,
      exportBitrate:
        parsed.exportBitrate === '128k' || parsed.exportBitrate === '192k' ? parsed.exportBitrate : '320k',
      perTrackProfilesEnabled:
        typeof parsed.perTrackProfilesEnabled === 'boolean' ? parsed.perTrackProfilesEnabled : true,
      trackProfiles:
        parsed.trackProfiles && typeof parsed.trackProfiles === 'object' ? parsed.trackProfiles : {},
      customPresets: Array.isArray(parsed.customPresets) ? parsed.customPresets : [],
      listeningStats:
        parsed.listeningStats && typeof parsed.listeningStats === 'object'
          ? {
              totalPlays: Number(parsed.listeningStats.totalPlays || 0),
              totalListenSec: Number(parsed.listeningStats.totalListenSec || 0),
              trackPlayCounts: parsed.listeningStats.trackPlayCounts || {},
              artistPlayCounts: parsed.listeningStats.artistPlayCounts || {},
              trackSignals: parsed.listeningStats.trackSignals || {},
            }
          : DEFAULT_STATS,
      tasteProfile:
        parsed.tasteProfile && typeof parsed.tasteProfile === 'object'
          ? {
              favoriteArtists: Array.isArray(parsed.tasteProfile.favoriteArtists)
                ? parsed.tasteProfile.favoriteArtists
                : [],
              favoriteGenres: Array.isArray(parsed.tasteProfile.favoriteGenres)
                ? parsed.tasteProfile.favoriteGenres
                : [],
              importedSources: Array.isArray(parsed.tasteProfile.importedSources)
                ? parsed.tasteProfile.importedSources
                : [],
            }
          : DEFAULT_TASTE,
      spatial8dEnabled: Boolean(parsed.spatial8dEnabled),
      spatial8dMode: isValidSpatialMode(parsed.spatial8dMode)
        ? normalizeSpatialPresetId(parsed.spatial8dMode)
        : 'orbit_drift',
      spatialTrajectory: isValidTrajectory(parsed.spatialTrajectory) ? parsed.spatialTrajectory : 'orbit',
      autoplaySimilar: typeof parsed.autoplaySimilar === 'boolean' ? parsed.autoplaySimilar : true,
      autoDjEnabled: Boolean(parsed.autoDjEnabled),
      volume: typeof parsed.volume === 'number' ? clamp(parsed.volume, 0, 1) : 0.85,
      musicLang: parsed.musicLangV2 && isValidMusicLang(parsed.musicLang) ? parsed.musicLang : 'en',
      musicLangV2: true,
    };
  } catch {
    return defaults;
  }
}

let cloudSyncHook: ((state: PersistedLibrary) => void) | null = null;
export function registerMusicCloudSyncHook(fn: ((state: PersistedLibrary) => void) | null) {
  cloudSyncHook = fn;
}

let pendingSaveLib: PersistedLibrary | null = null;
let saveLibraryTimer: number | null = null;
let flushListenersAttached = false;

function saveLibraryImmediate(lib: PersistedLibrary) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...lib, musicLangV2: true }));
  } catch {
    // ignore storage quota errors
  }
}

function flushPendingSaveLibrary() {
  if (saveLibraryTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(saveLibraryTimer);
    saveLibraryTimer = null;
  }
  if (pendingSaveLib) {
    const lib = pendingSaveLib;
    pendingSaveLib = null;
    saveLibraryImmediate(lib);
  }
}

function scheduleSaveLibrary(lib: PersistedLibrary) {
  if (typeof localStorage === 'undefined') return;
  if (typeof window === 'undefined') {
    saveLibraryImmediate(lib);
    return;
  }
  pendingSaveLib = lib;
  if (!flushListenersAttached) {
    flushListenersAttached = true;
    window.addEventListener('pagehide', flushPendingSaveLibrary);
    window.addEventListener('beforeunload', flushPendingSaveLibrary);
  }
  if (saveLibraryTimer !== null) {
    window.clearTimeout(saveLibraryTimer);
  }
  saveLibraryTimer = window.setTimeout(() => {
    saveLibraryTimer = null;
    if (pendingSaveLib) {
      const target = pendingSaveLib;
      pendingSaveLib = null;
      saveLibraryImmediate(target);
    }
  }, 400);
}

function pruneRecordByTimestamp<T>(
  map: Record<string, T> | undefined,
  maxEntries: number,
  getTs: (v: T) => number
): Record<string, T> {
  const src = map || {};
  const entries = Object.entries(src);
  if (entries.length <= maxEntries) return src;
  entries.sort((a, b) => getTs(b[1]) - getTs(a[1]));
  return Object.fromEntries(entries.slice(0, maxEntries));
}

function buildShuffledOrder(queue: MusicTrack[], currentTrackId?: string | null): string[] {
  const ids = queue.map((t) => t.id).filter(Boolean);
  if (ids.length <= 1) return ids;
  const rest = currentTrackId ? ids.filter((id) => id !== currentTrackId) : [...ids];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return currentTrackId && ids.includes(currentTrackId) ? [currentTrackId, ...rest] : rest;
}

function extractPersisted(state: PersistedLibrary): PersistedLibrary {
  return {
    likedTracks: state.likedTracks,
    savedAlbums: state.savedAlbums,
    savedPlaylists: state.savedPlaylists,
    userPlaylists: state.userPlaylists,
    recentTracks: state.recentTracks,
    searchHistory: state.searchHistory,
    eqPreset: state.eqPreset,
    eqBands: state.eqBands,
    eqBands10: state.eqBands10,
    preservesPitch: state.preservesPitch,
    pitchSemitones: state.pitchSemitones,
    bassBoostDb: state.bassBoostDb,
    reverbMix: state.reverbMix,
    stereoWidth: state.stereoWidth,
    exciterMix: state.exciterMix,
    vinylCrackle: state.vinylCrackle,
    vocalCancel: state.vocalCancel,
    crossfadeSec: state.crossfadeSec,
    normalizeAudio: state.normalizeAudio,
    spatial8dSpeedSec: state.spatial8dSpeedSec,
    autoDownloadMp3: state.autoDownloadMp3,
    wifiOnlyAutoDownload: state.wifiOnlyAutoDownload,
    exportBitrate: state.exportBitrate,
    perTrackProfilesEnabled: state.perTrackProfilesEnabled,
    trackProfiles: state.trackProfiles,
    customPresets: state.customPresets,
    listeningStats: state.listeningStats,
    tasteProfile: state.tasteProfile,
    autoplaySimilar: state.autoplaySimilar,
    autoDjEnabled: state.autoDjEnabled,
    spatial8dEnabled: state.spatial8dEnabled,
    spatial8dMode: state.spatial8dMode,
    spatialTrajectory: state.spatialTrajectory,
    volume: state.volume,
    musicLang: state.musicLang,
    musicLangV2: true,
  };
}

function syncPersisted(state: PersistedLibrary, skipCloud = false) {
  const snap = extractPersisted(state);
  scheduleSaveLibrary(snap);
  if (!skipCloud && cloudSyncHook) {
    cloudSyncHook(snap);
  }
}

export interface MusicStoreState extends PersistedLibrary {
  currentTrack: MusicTrack | null;
  activeRadio: MusicRadioStation | null;
  resolvedPlayback: ResolvedTrackPlayback | null;
  isResolvingTrack: boolean;
  playbackError: string | null;

  queue: MusicTrack[];
  queueIndex: number;
  shuffledOrder: string[];
  prevHistory: MusicTrack[];
  preResolvedByTrackId: Record<string, ResolvedTrackPlayback>;
  jamSession: JamSessionState;
  lastAiMoodMix: AiMoodPlaylistResult | null;

  isPlaying: boolean;
  currentTime: number;
  duration: number;
  seekRequestSec: number | null;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: MusicRepeatMode;
  playbackRate: number;
  viewMode: MusicViewMode;
  sleepTimerEndsAt: number | null;
  activeProVibe: ProVibePresetId | null;

  trimStartSec: number;
  trimEndSec: number;
  fadeSec: number;

  showNowPlayingModal: boolean;
  nowPlayingTab: 'artwork' | 'lyrics' | 'video';
  showQueueDrawer: boolean;
  showEqModal: boolean;
  driveModeOpen: boolean;
  showImportModal: boolean;
  showDownloadDrawer: boolean;
  playlistPickerTrack: MusicTrack | null;
  showCreatePlaylistModal: boolean;
  setPlaylistPickerTrack: (track: MusicTrack | null) => void;
  setShowCreatePlaylistModal: (open: boolean) => void;

  downloadJobs: DownloadJob[];
  offlineTrackIds: string[];
  radioReconnectAttempt: number;
  seedTrack: MusicTrack | null;
  seedGenre: string | null;
  isFetchingRelated: boolean;
  musicToast: string | null;

  // Persistent Music World UI & Back-stack Navigation State (survives world exit/re-entry)
  musicNavTab: MusicNavTab;
  musicActiveMood: HomeMoodFilterId;
  musicDetailStack: MusicDetailView[];
  musicSearchQuery: string;
  musicSearchFilter: MusicSearchFilter;
  musicSearchResults: MusicSearchResultsPayload | null;
  musicRadioFilterId: string;
  setMusicNavTab: (tab: MusicNavTab) => void;
  setMusicActiveMood: (mood: HomeMoodFilterId) => void;
  pushMusicDetail: (view: MusicDetailView) => void;
  replaceTopMusicDetail: (updater: (prev: MusicDetailView | undefined) => MusicDetailView | undefined) => void;
  popMusicDetail: () => void;
  clearMusicDetailStack: () => void;
  setMusicSearchQuery: (q: string) => void;
  setMusicSearchFilter: (filter: MusicSearchFilter) => void;
  setMusicSearchResults: (results: MusicSearchResultsPayload | null) => void;
  setMusicRadioFilterId: (id: string) => void;

  playTrack: (
    track: MusicTrack,
    contextTracks?: MusicTrack[],
    opts?: { preserveSeed?: boolean; preserveHistory?: boolean; fromHistory?: boolean }
  ) => void;
  playRadio: (station: MusicRadioStation) => void;
  addToQueue: (track: MusicTrack) => void;
  playTrackNext: (track: MusicTrack) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  saveQueueAsPlaylist: (name?: string) => string;
  removeFromQueue: (index: number) => void;
  playNext: () => void;
  advanceAfterTrackEnd: () => void;
  playPrev: () => void;
  setAutoplaySimilar: (enabled: boolean) => void;
  toggleAutoDj: () => void;
  toggleJamSession: (roomId?: string, hostName?: string) => void;
  startSeedRadio: (seed: MusicTrack) => Promise<void>;
  generateAiMoodPlaylist: (
    prompt: string,
    opts?: { playImmediately?: boolean; saveAsPlaylist?: boolean }
  ) => Promise<AiMoodPlaylistResult | null>;
  setPreResolvedBatch: (batch: Record<string, ResolvedTrackPlayback>) => void;
  clearPreResolvedTrack: (trackId: string) => void;
  fetchAndEnqueueRelatedTracks: (seed: MusicTrack, opts?: { autoAdvance?: boolean }) => Promise<void>;
  showMusicToast: (msg: string) => void;
  setResolvedPlayback: (resolved: ResolvedTrackPlayback | null, expectedTrackId?: string) => void;
  switchPlaybackSource: (candidate: PlaybackSourceCandidate) => void;
  switchYoutubeVersion: (videoId: string, label?: string) => void;
  setResolvingTrack: (loading: boolean) => void;
  setPlaybackError: (err: string | null) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayPause: () => void;
  setProgress: (currentTime: number, duration?: number) => void;
  requestSeek: (sec: number) => void;
  clearSeekRequest: () => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;

  setEqPreset: (preset: EqPresetId) => void;
  setEqBand: (index: number, gainDb: number) => void;
  setEqBand10: (index: number, gainDb: number) => void;
  setPreservesPitch: (preserve: boolean) => void;
  setPitchSemitones: (semitones: number) => void;
  setBassBoostDb: (db: number) => void;
  setReverbMix: (mix: number) => void;
  setStereoWidth: (width: number) => void;
  setExciterMix: (mix: number) => void;
  setVinylCrackle: (level: number) => void;
  setVocalCancel: (enabled: boolean) => void;
  setCrossfadeSec: (sec: number) => void;
  setNormalizeAudio: (enabled: boolean) => void;
  setSpatial8dSpeedSec: (sec: number) => void;
  setSpatialTrajectory: (traj: SpatialTrajectory) => void;
  setTrimRange: (startSec: number, endSec: number) => void;
  setFadeSec: (sec: number) => void;
  setExportBitrate: (bitrate: ExportBitrate) => void;
  setAutoDownloadMp3: (enabled: boolean) => void;
  setWifiOnlyAutoDownload: (enabled: boolean) => void;
  setPerTrackProfilesEnabled: (enabled: boolean) => void;
  saveCurrentTrackStudioProfile: () => void;
  saveCustomStudioPreset: (name: string) => string;
  applyCustomStudioPreset: (presetId: string) => void;
  deleteCustomStudioPreset: (presetId: string) => void;
  applyProVibe: (vibe: ProVibePresetId) => void;
  resetProEditor: () => void;
  toggleSpatial8d: () => void;
  setSpatial8dEnabled: (enabled: boolean) => void;
  setSpatial8dMode: (mode: Spatial8dMode) => void;
  setPlaybackRate: (rate: number) => void;
  setViewMode: (mode: MusicViewMode) => void;
  setSleepTimerMinutes: (minutes: number | null) => void;

  setShowNowPlayingModal: (open: boolean) => void;
  setNowPlayingTab: (tab: 'artwork' | 'lyrics' | 'video') => void;
  setShowQueueDrawer: (open: boolean) => void;
  setShowEqModal: (open: boolean) => void;
  setDriveModeOpen: (open: boolean) => void;
  setShowImportModal: (open: boolean) => void;
  setShowDownloadDrawer: (open: boolean) => void;

  enqueueDownloadJob: (track: MusicTrack, mode: string, bitrate?: ExportBitrate) => string;
  updateDownloadJob: (id: string, patch: Partial<DownloadJob>) => void;
  removeDownloadJob: (id: string) => void;
  setOfflineTrackIds: (ids: string[]) => void;
  markOfflineTrackSaved: (trackId: string) => void;
  markOfflineTrackRemoved: (trackId: string) => void;

  toggleLikeTrack: (track: MusicTrack) => void;
  importTracksIntoLikes: (tracks: MusicTrack[]) => number;
  importTracksIntoPlaylist: (name: string, description: string, tracks: MusicTrack[]) => string;
  mergeTasteProfile: (opts: {
    artists?: string[];
    genres?: string[];
    source?: { provider: 'spotify' | 'youtube_music' | 'file'; label: string; trackCount: number };
  }) => void;
  removeFavoriteArtist: (artist: string) => void;
  removeFavoriteGenre: (genre: string) => void;

  addSearchHistory: (query: string) => void;
  removeSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
  recordListeningTick: (track: MusicTrack, deltaSec: number) => void;
  recordTrackComplete: (track: MusicTrack) => void;
  recordTrackSkip: (track: MusicTrack, elapsedSec?: number) => void;
  dislikeTrack: (track: MusicTrack) => void;

  toggleSaveAlbum: (album: MusicAlbumRef) => void;
  toggleSavePlaylist: (playlist: MusicPlaylist) => void;
  createUserPlaylist: (name: string, initialTrack?: MusicTrack) => string;
  renameUserPlaylist: (playlistId: string, name: string, description?: string) => void;
  deleteUserPlaylist: (id: string) => void;
  addTrackToUserPlaylist: (playlistId: string, track: MusicTrack) => void;
  removeTrackFromUserPlaylist: (playlistId: string, trackId: string) => void;
  moveTrackInUserPlaylist: (playlistId: string, fromIndex: number, toIndex: number) => void;
  setMusicLang: (lang: MusicLang) => void;
  setRadioReconnectAttempt: (attempt: number) => void;
  hydrateFromCloud: (payload: CloudMusicSnapshotPayload) => void;
  getPersistedSnapshot: () => PersistedLibrary;
  stopAllMusic: () => void;
}

const initial = loadLibrary();
let relatedInFlightKey: string | null = null;
let musicToastTimer: number | null = null;

function applyProfileToTrackChange(state: MusicStoreState, track: MusicTrack): Partial<MusicStoreState> {
  if (!state.perTrackProfilesEnabled) {
    return { trimStartSec: 0, trimEndSec: 0, fadeSec: 0 };
  }
  const prof = state.trackProfiles[track.id];
  if (!prof) {
    return { trimStartSec: 0, trimEndSec: 0, fadeSec: 0 };
  }
  const eq10 = prof.eqBands10 || state.eqBands10;
  return {
    eqBands10: eq10,
    eqBands: toEq5From10(eq10),
    spatial8dEnabled: prof.spatial8dEnabled ?? state.spatial8dEnabled,
    spatialTrajectory: prof.spatialTrajectory ?? state.spatialTrajectory,
    spatial8dSpeedSec: prof.spatial8dSpeedSec ?? state.spatial8dSpeedSec,
    bassBoostDb: prof.bassBoostDb ?? state.bassBoostDb,
    reverbMix: prof.reverbMix ?? state.reverbMix,
    stereoWidth: prof.stereoWidth ?? state.stereoWidth,
    exciterMix: prof.exciterMix ?? state.exciterMix,
    vinylCrackle: prof.vinylCrackle ?? state.vinylCrackle,
    vocalCancel: prof.vocalCancel ?? state.vocalCancel,
    pitchSemitones: prof.pitchSemitones ?? state.pitchSemitones,
    playbackRate: prof.playbackRate ?? state.playbackRate,
    preservesPitch: prof.preservesPitch ?? state.preservesPitch,
    trimStartSec: prof.trimStartSec ?? 0,
    trimEndSec: prof.trimEndSec ?? 0,
    fadeSec: prof.fadeSec ?? 0,
  };
}

export const useMusicStore = create<MusicStoreState>((set, get) => ({
  ...initial,

  currentTrack: null,
  activeRadio: null,
  resolvedPlayback: null,
  isResolvingTrack: false,
  playbackError: null,

  queue: [],
  queueIndex: -1,
  shuffledOrder: [],
  prevHistory: [],
  preResolvedByTrackId: {},
  jamSession: { active: false, listeners: 1 },
  lastAiMoodMix: null,

  isPlaying: false,
  currentTime: 0,
  duration: 0,
  seekRequestSec: null,
  isMuted: false,
  shuffle: false,
  repeatMode: 'off',
  playbackRate: 1,
  viewMode: 'audio',
  sleepTimerEndsAt: null,
  activeProVibe: null,

  trimStartSec: 0,
  trimEndSec: 0,
  fadeSec: 0,

  showNowPlayingModal: false,
  nowPlayingTab: 'artwork',
  showQueueDrawer: false,
  showEqModal: false,
  driveModeOpen: false,
  showImportModal: false,
  showDownloadDrawer: false,
  playlistPickerTrack: null,
  showCreatePlaylistModal: false,
  setPlaylistPickerTrack: (playlistPickerTrack) => set({ playlistPickerTrack }),
  setShowCreatePlaylistModal: (showCreatePlaylistModal) => set({ showCreatePlaylistModal }),

  downloadJobs: [],
  offlineTrackIds: [],
  radioReconnectAttempt: 0,
  seedTrack: null,
  seedGenre: null,
  isFetchingRelated: false,
  musicToast: null,

  musicNavTab: 'home',
  musicActiveMood: 'all',
  musicDetailStack: [],
  musicSearchQuery: '',
  musicSearchFilter: 'all',
  musicSearchResults: null,
  musicRadioFilterId: 'all',

  setMusicNavTab: (musicNavTab) => set({ musicNavTab }),
  setMusicActiveMood: (musicActiveMood) => set({ musicActiveMood }),
  pushMusicDetail: (view) =>
    set((prev) => ({
      musicDetailStack: [...prev.musicDetailStack.slice(-7), view],
    })),
  replaceTopMusicDetail: (updater) =>
    set((prev) => {
      if (prev.musicDetailStack.length === 0) return prev;
      const top = prev.musicDetailStack[prev.musicDetailStack.length - 1];
      const nextTop = updater(top);
      if (!nextTop) return prev;
      return {
        musicDetailStack: [...prev.musicDetailStack.slice(0, -1), nextTop],
      };
    }),
  popMusicDetail: () =>
    set((prev) => ({
      musicDetailStack: prev.musicDetailStack.length > 0 ? prev.musicDetailStack.slice(0, -1) : [],
    })),
  clearMusicDetailStack: () => set({ musicDetailStack: [] }),
  setMusicSearchQuery: (musicSearchQuery) => set({ musicSearchQuery }),
  setMusicSearchFilter: (musicSearchFilter) => set({ musicSearchFilter }),
  setMusicSearchResults: (musicSearchResults) => set({ musicSearchResults }),
  setMusicRadioFilterId: (musicRadioFilterId) => set({ musicRadioFilterId }),

  showMusicToast: (msg) => {
    set({ musicToast: msg });
    if (typeof window !== 'undefined') {
      if (musicToastTimer) window.clearTimeout(musicToastTimer);
      musicToastTimer = window.setTimeout(() => {
        set({ musicToast: null });
      }, 3600);
    }
  },

  setAutoplaySimilar: (enabled) => {
    set((prev) => {
      const next = { ...prev, autoplaySimilar: enabled };
      syncPersisted(next);
      return next;
    });
    if (enabled) {
      const st = get();
      const seed = st.seedTrack || st.currentTrack;
      if (seed && !st.activeRadio && st.queue.length - st.queueIndex <= 2) {
        void st.fetchAndEnqueueRelatedTracks(seed);
      }
    }
  },

  fetchAndEnqueueRelatedTracks: async (seed, opts) => {
    if (!seed) return;
    const reqKey = `${seed.id}:${Boolean(opts?.autoAdvance)}`;
    if (relatedInFlightKey === reqKey) return;
    relatedInFlightKey = reqKey;
    set({ isFetchingRelated: true });
    try {
      const st = get();
      const excludeList = st.queue
        .slice(-40)
        .map((t) => t.id)
        .filter(Boolean);
      const excludeIds = excludeList.join(',');
      const qs = new URLSearchParams({
        trackId: seed.id,
        title: seed.title,
        artist: seed.artist.name,
        album: seed.album?.title || '',
        limit: '18',
      });
      if (excludeIds) qs.set('exclude', excludeIds);

      const hasTasteSignals =
        st.likedTracks.length > 0 ||
        st.tasteProfile.favoriteArtists.length > 0 ||
        st.tasteProfile.favoriteGenres.length > 0;

      const tasteReq = hasTasteSignals
        ? fetch('/api/music/recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topArtists: [
                ...st.tasteProfile.favoriteArtists.slice(0, 4).map((name) => ({ name, weight: 8 })),
                ...Object.values(st.listeningStats.artistPlayCounts || {})
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 4)
                  .map((a) => ({ name: a.name, weight: a.count })),
              ],
              favoriteGenres: st.tasteProfile.favoriteGenres.slice(0, 4),
              likedSeeds: st.likedTracks.slice(0, 3).map((t) => ({ id: t.id, title: t.title, artist: t.artist.name })),
              recentSeeds: [{ id: seed.id, title: seed.title, artist: seed.artist.name }],
              excludeIds: excludeList,
              limit: 12,
            }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const [res, tasteData] = await Promise.all([fetch(`/api/music/related?${qs.toString()}`), tasteReq]);
      if (!res.ok && !tasteData?.tracks?.length) {
        if (opts?.autoAdvance) set({ isPlaying: false, isResolvingTrack: false });
        return;
      }
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      const relatedList: MusicTrack[] = Array.isArray(data?.tracks) ? data.tracks : [];
      const tasteList: MusicTrack[] = Array.isArray(tasteData?.tracks) ? tasteData.tracks : [];
      const incoming: MusicTrack[] = [];
      const maxMix = Math.max(relatedList.length, tasteList.length);
      for (let i = 0; i < maxMix; i++) {
        if (relatedList[i]) incoming.push(relatedList[i]);
        if (tasteList[i]) incoming.push(tasteList[i]);
      }
      const genreName = typeof data?.genreName === 'string' && data.genreName ? data.genreName : null;

      let firstNewTrack: MusicTrack | null = null;
      let updatedQueue: MusicTrack[] = [];

      set((prev) => {
        const existingIds = new Set(prev.queue.map((t) => t.id));
        const existingKeys = new Set(prev.queue.map((t) => getTrackDedupeKey(t)));
        const added: MusicTrack[] = [];
        for (const t of incoming) {
          const dk = getTrackDedupeKey(t);
          if (!existingIds.has(t.id) && !existingKeys.has(dk)) {
            existingIds.add(t.id);
            existingKeys.add(dk);
            added.push(t);
          }
        }
        firstNewTrack = added[0] || null;
        updatedQueue = added.length > 0 ? [...prev.queue, ...added] : prev.queue;
        let nextShuffledOrder = prev.shuffledOrder;
        if (prev.shuffle && added.length > 0) {
          const addedShuffled = added.map((t) => t.id).sort(() => Math.random() - 0.5);
          nextShuffledOrder = [...prev.shuffledOrder, ...addedShuffled];
        }
        return {
          queue: updatedQueue,
          shuffledOrder: nextShuffledOrder,
          seedGenre: genreName || prev.seedGenre,
        };
      });

      if (opts?.autoAdvance) {
        const latest = get();
        if (firstNewTrack) {
          latest.playTrack(firstNewTrack, updatedQueue, { preserveSeed: true });
        } else if (latest.queueIndex + 1 < latest.queue.length) {
          latest.playTrack(latest.queue[latest.queueIndex + 1], latest.queue, { preserveSeed: true });
        } else {
          set({ isPlaying: false, isResolvingTrack: false });
        }
      }
    } catch {
      if (opts?.autoAdvance) set({ isPlaying: false, isResolvingTrack: false });
    } finally {
      if (relatedInFlightKey === reqKey) relatedInFlightKey = null;
      set({ isFetchingRelated: false });
    }
  },

  playTrack: (track, contextTracks, opts) => {
    const state = get();
    const preserveSeed = Boolean(opts?.preserveSeed);
    const list = contextTracks && contextTracks.length > 0 ? contextTracks : [track];
    const idx = Math.max(
      0,
      list.findIndex((t) => t.id === track.id)
    );
    const updatedRecent = [track, ...state.recentTracks.filter((t) => t.id !== track.id)].slice(0, 35);
    const profilePatch = applyProfileToTrackChange(state, track);

    // Record play count immediately on track start (LRU-pruned to 400 tracks)
    const stats = state.listeningStats;
    const prevT = stats.trackPlayCounts[track.id];
    const primaryArtist = track.artist.name.split(',')[0].trim() || track.artist.name;
    const prevA = stats.artistPlayCounts[primaryArtist];
    const nextTrackPlayCounts = pruneRecordByTimestamp(
      {
        ...stats.trackPlayCounts,
        [track.id]: {
          count: (prevT?.count || 0) + 1,
          title: track.title,
          artist: track.artist.name,
          cover: track.album.coverXl || track.album.cover || '',
          lastPlayedAt: Date.now(),
        },
      },
      400,
      (v) => v.lastPlayedAt || 0
    );
    const nextStats: ListeningStats = {
      ...stats,
      totalPlays: stats.totalPlays + 1,
      trackPlayCounts: nextTrackPlayCounts,
      artistPlayCounts: primaryArtist
        ? {
            ...stats.artistPlayCounts,
            [primaryArtist]: {
              count: (prevA?.count || 0) + 1,
              name: primaryArtist,
              picture: track.artist.picture || track.album.cover || prevA?.picture,
            },
          }
        : stats.artistPlayCounts,
    };

    const cachedPlayback = state.preResolvedByTrackId[track.id] || null;

    set((prev) => {
      const sameQueue =
        prev.queue.length === list.length &&
        prev.queue.every((q, qIdx) => q.id === list[qIdx]?.id);
      const nextShuffledOrder =
        prev.shuffle
          ? sameQueue && prev.shuffledOrder.includes(track.id)
            ? prev.shuffledOrder
            : buildShuffledOrder(list, track.id)
          : [];
      const nextPrevHistory = opts?.fromHistory
        ? prev.prevHistory
        : opts?.preserveHistory && prev.currentTrack && prev.currentTrack.id !== track.id
        ? [prev.currentTrack, ...prev.prevHistory.filter((t) => t.id !== prev.currentTrack!.id)].slice(0, 40)
        : prev.currentTrack && prev.currentTrack.id !== track.id && preserveSeed
        ? [prev.currentTrack, ...prev.prevHistory.filter((t) => t.id !== prev.currentTrack!.id)].slice(0, 40)
        : sameQueue
        ? prev.prevHistory
        : [];

      const next = {
        ...prev,
        ...profilePatch,
        activeRadio: null,
        currentTrack: track,
        resolvedPlayback: cachedPlayback ? { ...cachedPlayback, trackId: track.id } : null,
        isResolvingTrack: !cachedPlayback,
        playbackError: null,
        queue: list,
        queueIndex: idx,
        shuffledOrder: nextShuffledOrder,
        prevHistory: nextPrevHistory,
        isPlaying: true,
        currentTime: 0,
        duration: track.durationSec || 0,
        seedTrack: preserveSeed ? prev.seedTrack || track : track,
        seedGenre: preserveSeed ? prev.seedGenre : null,
        recentTracks: updatedRecent,
        listeningStats: nextStats,
      };
      syncPersisted(next);
      return next;
    });

    if (!preserveSeed && state.autoplaySimilar && list.length <= 2) {
      void get().fetchAndEnqueueRelatedTracks(track);
    }
  },

  playRadio: (station) => {
    set({
      activeRadio: station,
      currentTrack: null,
      resolvedPlayback: null,
      isResolvingTrack: false,
      playbackError: null,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      viewMode: 'audio',
      nowPlayingTab: 'artwork',
      radioReconnectAttempt: 0,
    });
  },

  addToQueue: (track) => {
    set((prev) => {
      const exists = prev.queue.some((t) => isSameMusicTrackVariant(t, track));
      if (exists) return prev;
      return {
        queue: [...prev.queue, track],
        shuffledOrder: prev.shuffle ? [...prev.shuffledOrder, track.id] : prev.shuffledOrder,
      };
    });
  },

  playTrackNext: (track) => {
    const state = get();
    if (state.queue.length === 0 || state.queueIndex < 0) {
      state.playTrack(track);
      return;
    }
    set((prev) => {
      const currentAtIdx = prev.queue[prev.queueIndex];
      if (currentAtIdx && isSameMusicTrackVariant(currentAtIdx, track)) {
        return prev;
      }
      let nextQueueIndex = prev.queueIndex;
      const filtered: MusicTrack[] = [];
      prev.queue.forEach((item, idx) => {
        if (idx !== prev.queueIndex && isSameMusicTrackVariant(item, track)) {
          if (idx < prev.queueIndex) nextQueueIndex = Math.max(0, nextQueueIndex - 1);
          return;
        }
        filtered.push(item);
      });
      const insertAt = Math.min(filtered.length, Math.max(0, nextQueueIndex + 1));
      filtered.splice(insertAt, 0, track);
      return { queue: filtered, queueIndex: nextQueueIndex };
    });
  },

  moveQueueItem: (fromIndex, toIndex) => {
    set((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.queue.length ||
        toIndex >= prev.queue.length
      ) {
        return prev;
      }
      const nextQueue = [...prev.queue];
      const [moved] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, moved);

      let nextIdx = prev.queueIndex;
      if (fromIndex === prev.queueIndex) {
        nextIdx = toIndex;
      } else if (fromIndex < prev.queueIndex && toIndex >= prev.queueIndex) {
        nextIdx = prev.queueIndex - 1;
      } else if (fromIndex > prev.queueIndex && toIndex <= prev.queueIndex) {
        nextIdx = prev.queueIndex + 1;
      }
      return { queue: nextQueue, queueIndex: nextIdx };
    });
  },

  clearQueue: () => {
    set((prev) => {
      if (prev.currentTrack) {
        return { queue: [prev.currentTrack], queueIndex: 0 };
      }
      return { queue: [], queueIndex: -1 };
    });
  },

  saveQueueAsPlaylist: (name) => {
    const state = get();
    const tracksToSave = dedupeMusicTracks(state.queue);
    const id = `upl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const cleanName =
      name?.trim() ||
      (state.seedGenre ? `Cola · ${state.seedGenre}` : `Cola (${tracksToSave.length} temas)`);
    const newPl: UserMusicPlaylist = {
      id,
      name: cleanName,
      description: `Guardada desde cola · ${tracksToSave.length} canciones`,
      createdAt: now,
      updatedAt: now,
      tracks: tracksToSave,
    };
    set((prev) => {
      const next = { ...prev, userPlaylists: [newPl, ...prev.userPlaylists] };
      syncPersisted(next);
      return next;
    });
    return id;
  },

  removeFromQueue: (index) => {
    set((prev) => {
      if (index < 0 || index >= prev.queue.length) return prev;
      const removedId = prev.queue[index]?.id;
      const nextQueue = prev.queue.filter((_, idx) => idx !== index);
      let nextIdx = prev.queueIndex;
      if (index < prev.queueIndex) nextIdx = Math.max(0, nextIdx - 1);
      else if (index === prev.queueIndex) nextIdx = Math.min(nextIdx, nextQueue.length - 1);
      return {
        queue: nextQueue,
        queueIndex: nextIdx,
        shuffledOrder: removedId
          ? prev.shuffledOrder.filter((id) => id !== removedId)
          : prev.shuffledOrder,
      };
    });
  },

  playNext: () => {
    const state = get();
    if (
      state.currentTrack &&
      state.currentTime > 1 &&
      state.currentTime < Math.min(20, (state.duration || 60) * 0.45)
    ) {
      state.recordTrackSkip(state.currentTrack, state.currentTime);
    }
    if (state.queue.length === 0) return;
    if (state.repeatMode === 'one' && state.currentTrack) {
      set({ seekRequestSec: 0, isPlaying: true, currentTime: 0 });
      return;
    }

    let nextTrack: MusicTrack | undefined;
    if (state.shuffle && state.queue.length > 1) {
      const order =
        state.shuffledOrder.length > 0
          ? state.shuffledOrder
          : buildShuffledOrder(state.queue, state.currentTrack?.id);
      const pos = state.currentTrack ? order.indexOf(state.currentTrack.id) : -1;
      const nextOrderPos = pos + 1;
      if (nextOrderPos < order.length) {
        nextTrack = state.queue.find((t) => t.id === order[nextOrderPos]);
      } else if (state.repeatMode === 'all') {
        nextTrack = state.queue.find((t) => t.id === order[0]);
      } else if (state.autoplaySimilar && (state.seedTrack || state.currentTrack)) {
        const seed = state.seedTrack || state.currentTrack!;
        set({ isResolvingTrack: true });
        void get().fetchAndEnqueueRelatedTracks(seed, { autoAdvance: true });
        return;
      } else {
        set({ isPlaying: false });
        return;
      }
    } else {
      let nextIdx = state.queueIndex + 1;
      if (nextIdx >= state.queue.length) {
        if (state.repeatMode === 'all') {
          nextIdx = 0;
        } else if (state.autoplaySimilar && (state.seedTrack || state.currentTrack)) {
          const seed = state.seedTrack || state.currentTrack!;
          set({ isResolvingTrack: true });
          void get().fetchAndEnqueueRelatedTracks(seed, { autoAdvance: true });
          return;
        } else {
          set({ isPlaying: false });
          return;
        }
      }
      nextTrack = state.queue[nextIdx];
    }

    if (!nextTrack) return;
    get().playTrack(nextTrack, state.queue, { preserveSeed: true, preserveHistory: true });
  },

  advanceAfterTrackEnd: () => {
    const state = get();
    if (state.currentTrack) {
      state.recordTrackComplete(state.currentTrack);
    }
    if (state.queue.length === 0) return;
    if (state.repeatMode === 'one' && state.currentTrack) {
      set({ seekRequestSec: 0, isPlaying: true, currentTime: 0 });
      return;
    }

    let nextTrack: MusicTrack | undefined;
    if (state.shuffle && state.queue.length > 1) {
      const order =
        state.shuffledOrder.length > 0
          ? state.shuffledOrder
          : buildShuffledOrder(state.queue, state.currentTrack?.id);
      const pos = state.currentTrack ? order.indexOf(state.currentTrack.id) : -1;
      const nextOrderPos = pos + 1;
      if (nextOrderPos < order.length) {
        nextTrack = state.queue.find((t) => t.id === order[nextOrderPos]);
      } else if (state.repeatMode === 'all') {
        nextTrack = state.queue.find((t) => t.id === order[0]);
      } else if (state.autoplaySimilar && (state.seedTrack || state.currentTrack)) {
        const seed = state.seedTrack || state.currentTrack!;
        set({ isResolvingTrack: true });
        void get().fetchAndEnqueueRelatedTracks(seed, { autoAdvance: true });
        return;
      } else {
        set({ isPlaying: false });
        return;
      }
    } else {
      let nextIdx = state.queueIndex + 1;
      if (nextIdx >= state.queue.length) {
        if (state.repeatMode === 'all') {
          nextIdx = 0;
        } else if (state.autoplaySimilar && (state.seedTrack || state.currentTrack)) {
          const seed = state.seedTrack || state.currentTrack!;
          set({ isResolvingTrack: true });
          void get().fetchAndEnqueueRelatedTracks(seed, { autoAdvance: true });
          return;
        } else {
          set({ isPlaying: false });
          return;
        }
      }
      nextTrack = state.queue[nextIdx];
    }

    if (!nextTrack) return;
    get().playTrack(nextTrack, state.queue, { preserveSeed: true, preserveHistory: true });
  },

  playPrev: () => {
    const state = get();
    if (state.currentTime > 3) {
      set({ seekRequestSec: 0, currentTime: 0 });
      return;
    }
    if (state.prevHistory.length > 0) {
      const [prevTrack, ...restHistory] = state.prevHistory;
      set({ prevHistory: restHistory });
      get().playTrack(prevTrack, state.queue.length > 0 ? state.queue : [prevTrack], {
        preserveSeed: true,
        fromHistory: true,
      });
      return;
    }
    if (state.queue.length === 0) return;
    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) prevIdx = state.repeatMode === 'all' ? state.queue.length - 1 : 0;
    const prevTrack = state.queue[prevIdx];
    if (!prevTrack) return;
    get().playTrack(prevTrack, state.queue, { preserveSeed: true, fromHistory: true });
  },

  toggleAutoDj: () =>
    set((prev) => {
      const next = { ...prev, autoDjEnabled: !prev.autoDjEnabled };
      syncPersisted(next);
      return next;
    }),

  toggleJamSession: (roomId, hostName) =>
    set((prev) => {
      const nextActive = !prev.jamSession.active;
      return {
        jamSession: {
          active: nextActive,
          roomId: nextActive ? roomId || prev.jamSession.roomId : undefined,
          hostName: nextActive ? hostName || prev.jamSession.hostName : undefined,
          listeners: nextActive ? Math.max(1, prev.jamSession.listeners) : 1,
        },
      };
    }),

  startSeedRadio: async (seed) => {
    if (!seed) return;
    set({ isFetchingRelated: true });
    try {
      const qs = new URLSearchParams({
        trackId: seed.id,
        title: seed.title,
        artist: seed.artist.name,
        limit: '22',
      });
      const res = await fetch(`/api/music/radio-seed?${qs.toString()}`);
      const data = await res.json().catch(() => null);
      const tracks: MusicTrack[] = Array.isArray(data?.tracks) && data.tracks.length > 0 ? data.tracks : [seed];
      get().playTrack(tracks[0], tracks);
      if (typeof data?.genreName === 'string') {
        set({ seedGenre: data.genreName });
      }
      get().showMusicToast(`Radio · ${seed.title}`);
    } catch {
      get().playTrack(seed, [seed]);
    } finally {
      set({ isFetchingRelated: false });
    }
  },

  generateAiMoodPlaylist: async (prompt, opts) => {
    const clean = prompt.trim();
    if (!clean) return null;
    try {
      const res = await fetch('/api/ai/mood-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: clean,
          favoriteArtists: get().tasteProfile.favoriteArtists.slice(0, 6),
          limit: 20,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AiMoodPlaylistResult & { success?: boolean };
      if (!Array.isArray(data?.tracks) || data.tracks.length === 0) return null;
      const result: AiMoodPlaylistResult = {
        title: data.title || `Mix IA · ${clean}`,
        subtitle: data.subtitle || clean,
        moodTags: Array.isArray(data.moodTags) ? data.moodTags : [],
        tracks: data.tracks,
      };
      set({ lastAiMoodMix: result });
      if (opts?.saveAsPlaylist) {
        get().importTracksIntoPlaylist(result.title, result.subtitle, result.tracks);
      }
      if (opts?.playImmediately) {
        get().playTrack(result.tracks[0], result.tracks);
      }
      return result;
    } catch {
      return null;
    }
  },

  setPreResolvedBatch: (batch) =>
    set((prev) => {
      if (!batch || Object.keys(batch).length === 0) return prev;
      const merged = { ...prev.preResolvedByTrackId, ...batch };
      const keys = Object.keys(merged);
      const capped =
        keys.length > 16
          ? Object.fromEntries(keys.slice(-16).map((k) => [k, merged[k]]))
          : merged;
      return { preResolvedByTrackId: capped };
    }),

  clearPreResolvedTrack: (trackId) =>
    set((prev) => {
      if (!prev.preResolvedByTrackId[trackId]) return prev;
      const next = { ...prev.preResolvedByTrackId };
      delete next[trackId];
      return { preResolvedByTrackId: next };
    }),

  setResolvedPlayback: (resolved, expectedTrackId) => {
    const activeId = get().currentTrack?.id;
    if (expectedTrackId && activeId !== expectedTrackId) {
      return;
    }
    const stamped = resolved
      ? {
          ...resolved,
          trackId: resolved.trackId || expectedTrackId || activeId,
        }
      : null;
    set({ resolvedPlayback: stamped, isResolvingTrack: false });
  },

  switchPlaybackSource: (candidate) =>
    set((prev) => {
      if (!prev.resolvedPlayback) return prev;
      return {
        resolvedPlayback: {
          ...prev.resolvedPlayback,
          sourceType: candidate.sourceType,
          sourceLabel: candidate.sourceLabel,
          streamUrl: candidate.streamUrl,
          proxiedUrl: candidate.proxiedUrl,
          bitrateKbps: candidate.bitrateKbps,
          provider: candidate.provider,
          fullLength: candidate.fullLength,
        },
        playbackError: null,
        isPlaying: true,
      };
    }),

  switchYoutubeVersion: (videoId, label) =>
    set((prev) => {
      const cleanId = String(videoId || '').trim();
      if (!cleanId) return prev;
      const base: ResolvedTrackPlayback = prev.resolvedPlayback || {
        trackId: prev.currentTrack?.id,
        sourceType: 'youtube',
        sourceLabel: label || 'YouTube Audio',
        fullLength: true,
      };
      return {
        resolvedPlayback: {
          ...base,
          sourceType: 'youtube',
          youtubeVideoId: cleanId,
          sourceLabel: label || 'Versión YouTube',
          provider: 'YouTube',
          fullLength: true,
        },
        playbackError: null,
        isPlaying: true,
      };
    }),

  setResolvingTrack: (loading) => set({ isResolvingTrack: loading }),
  setPlaybackError: (err) => set({ playbackError: err }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlayPause: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setProgress: (currentTime, duration) =>
    set((s) => ({
      currentTime,
      duration: typeof duration === 'number' && duration > 0 ? duration : s.duration,
    })),
  requestSeek: (sec) => set({ seekRequestSec: Math.max(0, sec) }),
  clearSeekRequest: () => set({ seekRequestSec: null }),

  setVolume: (vol) => {
    const clamped = clamp(vol, 0, 1);
    set((prev) => {
      const next = { ...prev, volume: clamped, isMuted: clamped === 0 };
      syncPersisted(next);
      return next;
    });
  },

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleShuffle: () =>
    set((s) => {
      const nextShuffle = !s.shuffle;
      return {
        shuffle: nextShuffle,
        shuffledOrder: nextShuffle ? buildShuffledOrder(s.queue, s.currentTrack?.id) : [],
      };
    }),
  cycleRepeat: () =>
    set((s) => ({
      repeatMode: s.repeatMode === 'off' ? 'all' : s.repeatMode === 'all' ? 'one' : 'off',
    })),

  setEqPreset: (preset) =>
    set((prev) => {
      const bands10 = EQ_BAND_PRESETS_10[preset]
        ? ([...EQ_BAND_PRESETS_10[preset]] as EqBands10)
        : ([0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as EqBands10);
      const next = {
        ...prev,
        eqPreset: preset,
        eqBands10: bands10,
        eqBands: toEq5From10(bands10),
        activeProVibe: null,
      };
      syncPersisted(next);
      return next;
    }),

  setEqBand: (index, gainDb) =>
    set((prev) => {
      if (index < 0 || index > 4) return prev;
      const g = clamp(gainDb, -12, 12);
      const next10 = [...prev.eqBands10] as EqBands10;
      next10[index * 2] = g;
      next10[index * 2 + 1] = g;
      const next = {
        ...prev,
        eqBands10: next10,
        eqBands: toEq5From10(next10),
        activeProVibe: null,
      };
      syncPersisted(next);
      return next;
    }),

  setEqBand10: (index, gainDb) =>
    set((prev) => {
      if (index < 0 || index > 9) return prev;
      const next10 = [...prev.eqBands10] as EqBands10;
      next10[index] = clamp(gainDb, -12, 12);
      const next = {
        ...prev,
        eqBands10: next10,
        eqBands: toEq5From10(next10),
        activeProVibe: null,
      };
      syncPersisted(next);
      return next;
    }),

  setPreservesPitch: (preservesPitch) =>
    set((prev) => {
      const next = { ...prev, preservesPitch, activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setPitchSemitones: (pitchSemitones) =>
    set((prev) => {
      const next = {
        ...prev,
        pitchSemitones: clamp(pitchSemitones, -12, 12),
        activeProVibe: null,
      };
      syncPersisted(next);
      return next;
    }),

  setBassBoostDb: (db) =>
    set((prev) => {
      const next = { ...prev, bassBoostDb: clamp(db, 0, 12), activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setReverbMix: (mix) =>
    set((prev) => {
      const next = { ...prev, reverbMix: clamp(mix, 0, 0.75), activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setStereoWidth: (width) =>
    set((prev) => {
      const next = { ...prev, stereoWidth: clamp(width, 0, 1), activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setExciterMix: (mix) =>
    set((prev) => {
      const next = { ...prev, exciterMix: clamp(mix, 0, 1), activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setVinylCrackle: (level) =>
    set((prev) => {
      const next = { ...prev, vinylCrackle: clamp(level, 0, 1), activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setVocalCancel: (vocalCancel) =>
    set((prev) => {
      const next = { ...prev, vocalCancel, activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setCrossfadeSec: (sec) =>
    set((prev) => {
      const next = { ...prev, crossfadeSec: clamp(sec, 0, 10) };
      syncPersisted(next);
      return next;
    }),

  setNormalizeAudio: (normalizeAudio) =>
    set((prev) => {
      const next = { ...prev, normalizeAudio };
      syncPersisted(next);
      return next;
    }),

  setSpatial8dSpeedSec: (sec) =>
    set((prev) => {
      const next = { ...prev, spatial8dSpeedSec: clamp(sec, 3, 20), activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setSpatialTrajectory: (spatialTrajectory) =>
    set((prev) => {
      const next = { ...prev, spatialTrajectory, activeProVibe: null };
      syncPersisted(next);
      return next;
    }),

  setTrimRange: (startSec, endSec) =>
    set({
      trimStartSec: Math.max(0, startSec),
      trimEndSec: Math.max(0, endSec),
    }),

  setFadeSec: (sec) => set({ fadeSec: clamp(sec, 0, 10) }),

  setExportBitrate: (exportBitrate) =>
    set((prev) => {
      const next = { ...prev, exportBitrate };
      syncPersisted(next);
      return next;
    }),

  setAutoDownloadMp3: (autoDownloadMp3) =>
    set((prev) => {
      const next = { ...prev, autoDownloadMp3 };
      syncPersisted(next);
      return next;
    }),

  setWifiOnlyAutoDownload: (wifiOnlyAutoDownload) =>
    set((prev) => {
      const next = { ...prev, wifiOnlyAutoDownload };
      syncPersisted(next);
      return next;
    }),

  setPerTrackProfilesEnabled: (perTrackProfilesEnabled) =>
    set((prev) => {
      const next = { ...prev, perTrackProfilesEnabled };
      syncPersisted(next);
      return next;
    }),

  saveCurrentTrackStudioProfile: () =>
    set((prev) => {
      if (!prev.currentTrack) return prev;
      const profile: TrackStudioProfile = {
        trackId: prev.currentTrack.id,
        eqBands10: prev.eqBands10,
        spatial8dEnabled: prev.spatial8dEnabled,
        spatialTrajectory: prev.spatialTrajectory,
        spatial8dSpeedSec: prev.spatial8dSpeedSec,
        bassBoostDb: prev.bassBoostDb,
        reverbMix: prev.reverbMix,
        stereoWidth: prev.stereoWidth,
        exciterMix: prev.exciterMix,
        vinylCrackle: prev.vinylCrackle,
        vocalCancel: prev.vocalCancel,
        pitchSemitones: prev.pitchSemitones,
        playbackRate: prev.playbackRate,
        preservesPitch: prev.preservesPitch,
        trimStartSec: prev.trimStartSec,
        trimEndSec: prev.trimEndSec,
        fadeSec: prev.fadeSec,
      };
      const entries = Object.entries(prev.trackProfiles).slice(-39);
      const next = {
        ...prev,
        trackProfiles: {
          ...Object.fromEntries(entries),
          [prev.currentTrack.id]: profile,
        },
      };
      syncPersisted(next);
      return next;
    }),

  saveCustomStudioPreset: (name) => {
    const id = `cp-${Date.now().toString(36)}`;
    const state = get();
    const preset: CustomStudioPreset = {
      id,
      name: name.trim().slice(0, 32) || 'Mi Ajuste',
      createdAt: Date.now(),
      eqBands10: [...state.eqBands10] as EqBands10,
      spatial8dEnabled: state.spatial8dEnabled,
      spatial8dMode: state.spatial8dMode,
      spatialTrajectory: state.spatialTrajectory,
      spatial8dSpeedSec: state.spatial8dSpeedSec,
      bassBoostDb: state.bassBoostDb,
      reverbMix: state.reverbMix,
      stereoWidth: state.stereoWidth,
      exciterMix: state.exciterMix,
      vinylCrackle: state.vinylCrackle,
      vocalCancel: state.vocalCancel,
      pitchSemitones: state.pitchSemitones,
      playbackRate: state.playbackRate,
      preservesPitch: state.preservesPitch,
    };
    set((prev) => {
      const next = { ...prev, customPresets: [preset, ...prev.customPresets].slice(0, 16) };
      syncPersisted(next);
      return next;
    });
    return id;
  },

  applyCustomStudioPreset: (presetId) =>
    set((prev) => {
      const p = prev.customPresets.find((x) => x.id === presetId);
      if (!p) return prev;
      const next = {
        ...prev,
        activeProVibe: null,
        eqBands10: p.eqBands10,
        eqBands: toEq5From10(p.eqBands10),
        spatial8dEnabled: p.spatial8dEnabled,
        spatial8dMode: p.spatial8dMode,
        spatialTrajectory: p.spatialTrajectory,
        spatial8dSpeedSec: p.spatial8dSpeedSec,
        bassBoostDb: p.bassBoostDb,
        reverbMix: p.reverbMix,
        stereoWidth: p.stereoWidth,
        exciterMix: p.exciterMix,
        vinylCrackle: p.vinylCrackle,
        vocalCancel: p.vocalCancel,
        pitchSemitones: p.pitchSemitones,
        playbackRate: p.playbackRate,
        preservesPitch: p.preservesPitch,
      };
      syncPersisted(next);
      return next;
    }),

  deleteCustomStudioPreset: (presetId) =>
    set((prev) => {
      const next = {
        ...prev,
        customPresets: prev.customPresets.filter((p) => p.id !== presetId),
      };
      syncPersisted(next);
      return next;
    }),

  applyProVibe: (vibe) =>
    set((prev) => {
      let patch: Partial<MusicStoreState> = { activeProVibe: vibe };
      if (vibe === 'original') {
        const b10: EqBands10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        patch = {
          activeProVibe: 'original',
          spatial8dEnabled: false,
          playbackRate: 1,
          preservesPitch: true,
          pitchSemitones: 0,
          bassBoostDb: 0,
          reverbMix: 0,
          stereoWidth: 0.45,
          exciterMix: 0,
          vinylCrackle: 0,
          vocalCancel: false,
          spatial8dSpeedSec: 9.5,
          eqPreset: 'flat',
          eqBands10: b10,
          eqBands: toEq5From10(b10),
        };
      } else if (vibe === '8d_ultra') {
        const b10: EqBands10 = [4, 3.5, 2, 1, 0.5, 0.5, 1.5, 2.5, 3, 3];
        const cfg = getSpatialPresetConfig('deep_3d');
        patch = {
          activeProVibe: '8d_ultra',
          spatial8dEnabled: true,
          spatial8dMode: cfg.id,
          spatialTrajectory: cfg.trajectory,
          playbackRate: 1,
          preservesPitch: true,
          pitchSemitones: 0,
          bassBoostDb: cfg.warmthDb,
          reverbMix: cfg.reverbWetMix,
          stereoWidth: cfg.stereoWidth,
          exciterMix: 0.2,
          spatial8dSpeedSec: cfg.orbitPeriodSec,
          eqPreset: 'bass',
          eqBands10: b10,
          eqBands: toEq5From10(b10),
        };
      } else if (vibe === 'slowed_reverb') {
        const b10: EqBands10 = [4, 3.5, 2, 1.5, 0, 0, 0.5, 1, -0.5, -1.5];
        patch = {
          activeProVibe: 'slowed_reverb',
          spatial8dEnabled: false,
          playbackRate: 0.85,
          preservesPitch: false,
          pitchSemitones: 0,
          bassBoostDb: 3.5,
          reverbMix: 0.44,
          stereoWidth: 0.52,
          eqPreset: 'acoustic',
          eqBands10: b10,
          eqBands: toEq5From10(b10),
        };
      } else if (vibe === 'nightcore') {
        const b10: EqBands10 = [2.5, 2, 1, 1, 1, 1.5, 3, 3.5, 4.5, 5];
        patch = {
          activeProVibe: 'nightcore',
          spatial8dEnabled: false,
          playbackRate: 1.22,
          preservesPitch: false,
          pitchSemitones: 0,
          bassBoostDb: 2,
          reverbMix: 0.12,
          stereoWidth: 0.5,
          exciterMix: 0.35,
          eqPreset: 'club',
          eqBands10: b10,
          eqBands: toEq5From10(b10),
        };
      } else if (vibe === 'bass_extreme') {
        const b10: EqBands10 = [9.5, 8.5, 6, 4.5, -1, -0.5, 1, 2, 3, 3];
        patch = {
          activeProVibe: 'bass_extreme',
          playbackRate: 1,
          preservesPitch: true,
          bassBoostDb: 9.5,
          reverbMix: 0.08,
          eqPreset: 'bass',
          eqBands10: b10,
          eqBands: toEq5From10(b10),
        };
      } else if (vibe === 'lofi_warmth') {
        const b10: EqBands10 = [3.5, 3, 2.5, 2, 1.5, 0.5, -2, -3, -5.5, -7];
        patch = {
          activeProVibe: 'lofi_warmth',
          spatial8dEnabled: false,
          playbackRate: 0.94,
          preservesPitch: false,
          pitchSemitones: 0,
          bassBoostDb: 3,
          reverbMix: 0.34,
          vinylCrackle: 0.35,
          eqPreset: 'acoustic',
          eqBands10: b10,
          eqBands: toEq5From10(b10),
        };
      }
      const next = { ...prev, ...patch };
      syncPersisted(next);
      return next;
    }),

  resetProEditor: () =>
    set((prev) => {
      const b10: EqBands10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const next = {
        ...prev,
        activeProVibe: null,
        spatial8dEnabled: false,
        spatial8dMode: 'orbit_drift' as Spatial8dMode,
        spatialTrajectory: 'orbit' as SpatialTrajectory,
        playbackRate: 1,
        preservesPitch: true,
        pitchSemitones: 0,
        bassBoostDb: 0,
        reverbMix: 0,
        stereoWidth: 0.52,
        exciterMix: 0,
        vinylCrackle: 0,
        vocalCancel: false,
        spatial8dSpeedSec: 11.5,
        trimStartSec: 0,
        trimEndSec: 0,
        fadeSec: 0,
        eqPreset: 'flat' as EqPresetId,
        eqBands10: b10,
        eqBands: [0, 0, 0, 0, 0] as EqBands5,
      };
      syncPersisted(next);
      return next;
    }),

  toggleSpatial8d: () =>
    set((prev) => {
      const nextEnabled = !prev.spatial8dEnabled;
      const cfg = getSpatialPresetConfig(prev.spatial8dMode);
      const nextReverb = nextEnabled && prev.reverbMix < 0.08 ? cfg.reverbWetMix : prev.reverbMix;
      const next = {
        ...prev,
        spatial8dEnabled: nextEnabled,
        spatial8dMode: cfg.id,
        reverbMix: nextReverb,
      };
      syncPersisted(next);
      return next;
    }),

  setSpatial8dEnabled: (enabled) =>
    set((prev) => {
      const cfg = getSpatialPresetConfig(prev.spatial8dMode);
      const nextReverb = enabled && prev.reverbMix < 0.08 ? cfg.reverbWetMix : prev.reverbMix;
      const next = {
        ...prev,
        spatial8dEnabled: enabled,
        spatial8dMode: cfg.id,
        reverbMix: nextReverb,
      };
      syncPersisted(next);
      return next;
    }),

  setSpatial8dMode: (mode) =>
    set((prev) => {
      const cfg = getSpatialPresetConfig(mode);
      const next = {
        ...prev,
        spatial8dMode: cfg.id,
        spatialTrajectory: cfg.trajectory,
        spatial8dSpeedSec: cfg.orbitPeriodSec,
        reverbMix: cfg.reverbWetMix,
        stereoWidth: cfg.stereoWidth,
      };
      syncPersisted(next);
      return next;
    }),

  setPlaybackRate: (rate) => set({ playbackRate: clamp(rate, 0.65, 1.45), activeProVibe: null }),
  setViewMode: (mode) =>
    set({
      viewMode: mode,
      nowPlayingTab: mode === 'video' ? 'video' : 'artwork',
    }),

  setSleepTimerMinutes: (minutes) =>
    set({
      sleepTimerEndsAt: minutes ? Date.now() + minutes * 60 * 1000 : null,
    }),

  setShowNowPlayingModal: (open) => set({ showNowPlayingModal: open }),
  setNowPlayingTab: (tab) =>
    set({
      nowPlayingTab: tab,
      viewMode: tab === 'video' ? 'video' : 'audio',
    }),
  setShowQueueDrawer: (open) => set({ showQueueDrawer: open }),
  setShowEqModal: (open) => set({ showEqModal: open }),
  setDriveModeOpen: (open) => set({ driveModeOpen: open }),
  setShowImportModal: (open) => set({ showImportModal: open }),
  setShowDownloadDrawer: (open) => set({ showDownloadDrawer: open }),

  enqueueDownloadJob: (track, mode, bitrate) => {
    const id = `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const job: DownloadJob = {
      id,
      track,
      mode,
      bitrate: bitrate || get().exportBitrate || '320k',
      status: 'queued',
      progressPct: 0,
      loadedBytes: 0,
      totalBytes: 0,
      createdAt: Date.now(),
    };
    set((prev) => ({
      downloadJobs: [job, ...prev.downloadJobs.slice(0, 19)],
    }));
    return id;
  },

  updateDownloadJob: (id, patch) =>
    set((prev) => ({
      downloadJobs: prev.downloadJobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    })),

  removeDownloadJob: (id) =>
    set((prev) => ({
      downloadJobs: prev.downloadJobs.filter((j) => j.id !== id),
    })),

  setOfflineTrackIds: (ids) => set({ offlineTrackIds: ids }),
  markOfflineTrackSaved: (trackId) =>
    set((prev) => ({
      offlineTrackIds: prev.offlineTrackIds.includes(trackId)
        ? prev.offlineTrackIds
        : [trackId, ...prev.offlineTrackIds],
    })),
  markOfflineTrackRemoved: (trackId) =>
    set((prev) => ({
      offlineTrackIds: prev.offlineTrackIds.filter((id) => id !== trackId),
    })),

  toggleLikeTrack: (track) =>
    set((prev) => {
      const exists = prev.likedTracks.some((t) => isSameMusicTrackVariant(t, track));
      const likedTracks = exists
        ? prev.likedTracks.filter((t) => !isSameMusicTrackVariant(t, track))
        : dedupeMusicTracks([track, ...prev.likedTracks]);
      const next = { ...prev, likedTracks };
      syncPersisted(next);
      return next;
    }),

  importTracksIntoLikes: (tracks) => {
    let added = 0;
    set((prev) => {
      const dedupedIncoming = dedupeMusicTracks(tracks);
      const toAdd: MusicTrack[] = [];
      for (const tr of dedupedIncoming) {
        if (!prev.likedTracks.some((existing) => isSameMusicTrackVariant(existing, tr))) {
          toAdd.push(tr);
        }
      }
      added = toAdd.length;
      if (added === 0) return prev;
      const next = {
        ...prev,
        likedTracks: dedupeMusicTracks([...toAdd, ...prev.likedTracks]).slice(0, 1000),
      };
      syncPersisted(next);
      return next;
    });
    return added;
  },

  importTracksIntoPlaylist: (name, description, tracks) => {
    const cleanName = name.trim() || 'Playlist Importada';
    const normName = cleanName.toLowerCase();
    let resolvedId = `upl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const dedupIncoming = dedupeMusicTracks(tracks);
    const now = Date.now();

    set((prev) => {
      // Incremental smart merge if an imported playlist with the same name already exists
      const existingIdx = prev.userPlaylists.findIndex((p) => p.name.trim().toLowerCase() === normName);
      if (existingIdx >= 0) {
        const existing = prev.userPlaylists[existingIdx];
        resolvedId = existing.id;
        const fresh = dedupIncoming.filter(
          (t) => !existing.tracks.some((ex) => isSameMusicTrackVariant(ex, t))
        );
        if (fresh.length === 0) return prev;
        const updatedPlaylists = [...prev.userPlaylists];
        updatedPlaylists[existingIdx] = {
          ...existing,
          updatedAt: now,
          tracks: dedupeMusicTracks([...existing.tracks, ...fresh]),
        };
        const next = { ...prev, userPlaylists: updatedPlaylists };
        syncPersisted(next);
        return next;
      }

      const newPl: UserMusicPlaylist = {
        id: resolvedId,
        name: cleanName,
        description: description || 'Importada en Riffan Music',
        createdAt: now,
        updatedAt: now,
        tracks: dedupIncoming,
      };
      const next = { ...prev, userPlaylists: [newPl, ...prev.userPlaylists] };
      syncPersisted(next);
      return next;
    });
    return resolvedId;
  },

  mergeTasteProfile: (opts) =>
    set((prev) => {
      const artistSet = new Set(prev.tasteProfile.favoriteArtists);
      for (const a of opts.artists || []) {
        const clean = a.trim();
        if (clean) artistSet.add(clean);
      }
      const genreSet = new Set(prev.tasteProfile.favoriteGenres);
      for (const g of opts.genres || []) {
        const clean = g.trim();
        if (clean) genreSet.add(clean);
      }
      const sources = [...prev.tasteProfile.importedSources];
      if (opts.source) {
        sources.unshift({
          id: `imp-src-${Date.now().toString(36)}`,
          provider: opts.source.provider,
          label: opts.source.label,
          trackCount: opts.source.trackCount,
          importedAt: Date.now(),
        });
      }
      const next = {
        ...prev,
        tasteProfile: {
          favoriteArtists: Array.from(artistSet).slice(0, 40),
          favoriteGenres: Array.from(genreSet).slice(0, 20),
          importedSources: sources.slice(0, 20),
        },
      };
      syncPersisted(next);
      return next;
    }),

  removeFavoriteArtist: (artist) =>
    set((prev) => {
      const next = {
        ...prev,
        tasteProfile: {
          ...prev.tasteProfile,
          favoriteArtists: prev.tasteProfile.favoriteArtists.filter((a) => a !== artist),
        },
      };
      syncPersisted(next);
      return next;
    }),

  removeFavoriteGenre: (genre) =>
    set((prev) => {
      const next = {
        ...prev,
        tasteProfile: {
          ...prev.tasteProfile,
          favoriteGenres: prev.tasteProfile.favoriteGenres.filter((g) => g !== genre),
        },
      };
      syncPersisted(next);
      return next;
    }),

  addSearchHistory: (query) =>
    set((prev) => {
      const clean = query.trim();
      if (!clean) return prev;
      const nextHist = [clean, ...prev.searchHistory.filter((q) => q.toLowerCase() !== clean.toLowerCase())].slice(0, 12);
      const next = { ...prev, searchHistory: nextHist };
      syncPersisted(next);
      return next;
    }),

  removeSearchHistory: (query) =>
    set((prev) => {
      const next = {
        ...prev,
        searchHistory: prev.searchHistory.filter((q) => q !== query),
      };
      syncPersisted(next);
      return next;
    }),

  clearSearchHistory: () =>
    set((prev) => {
      const next = { ...prev, searchHistory: [] };
      syncPersisted(next);
      return next;
    }),

  recordListeningTick: (_track, deltaSec) =>
    set((prev) => {
      if (deltaSec <= 0) return prev;
      const nextStats: ListeningStats = {
        ...prev.listeningStats,
        totalListenSec: prev.listeningStats.totalListenSec + deltaSec,
      };
      const next = { ...prev, listeningStats: nextStats };
      scheduleSaveLibrary(extractPersisted(next));
      return next;
    }),

  recordTrackComplete: (track) =>
    set((prev) => {
      const prevSignals = prev.listeningStats.trackSignals || {};
      const cur = prevSignals[track.id] || {};
      const nextStats: ListeningStats = {
        ...prev.listeningStats,
        trackSignals: pruneRecordByTimestamp(
          {
            ...prevSignals,
            [track.id]: {
              ...cur,
              completions: (cur.completions || 0) + 1,
              lastSignalAt: Date.now(),
              artist: track.artist.name,
            },
          },
          300,
          (v) => v.lastSignalAt || 0
        ),
      };
      const next = { ...prev, listeningStats: nextStats };
      syncPersisted(next);
      return next;
    }),

  recordTrackSkip: (track, elapsedSec = 0) =>
    set((prev) => {
      if (elapsedSec > 25) return prev;
      const prevSignals = prev.listeningStats.trackSignals || {};
      const cur = prevSignals[track.id] || {};
      const nextStats: ListeningStats = {
        ...prev.listeningStats,
        trackSignals: pruneRecordByTimestamp(
          {
            ...prevSignals,
            [track.id]: {
              ...cur,
              skips: (cur.skips || 0) + 1,
              lastSignalAt: Date.now(),
              artist: track.artist.name,
            },
          },
          300,
          (v) => v.lastSignalAt || 0
        ),
      };
      const next = { ...prev, listeningStats: nextStats };
      syncPersisted(next);
      return next;
    }),

  dislikeTrack: (track) => {
    const wasCurrent = get().currentTrack?.id === track.id;
    set((prev) => {
      const prevSignals = prev.listeningStats.trackSignals || {};
      const cur = prevSignals[track.id] || {};
      const nextStats: ListeningStats = {
        ...prev.listeningStats,
        trackSignals: pruneRecordByTimestamp(
          {
            ...prevSignals,
            [track.id]: {
              ...cur,
              completions: 0,
              skips: Math.max(3, (cur.skips || 0) + 3),
              lastSignalAt: Date.now(),
              artist: track.artist.name,
            },
          },
          300,
          (v) => v.lastSignalAt || 0
        ),
      };
      const nextLiked = prev.likedTracks.filter((t) => t.id !== track.id);
      const next = {
        ...prev,
        likedTracks: nextLiked,
        listeningStats: nextStats,
      };
      syncPersisted(next);
      return next;
    });
    if (wasCurrent) {
      get().playNext();
    }
  },

  toggleSaveAlbum: (album) =>
    set((prev) => {
      const exists = prev.savedAlbums.some((a) => a.id === album.id);
      const savedAlbums = exists
        ? prev.savedAlbums.filter((a) => a.id !== album.id)
        : [album, ...prev.savedAlbums];
      const next = { ...prev, savedAlbums };
      syncPersisted(next);
      return next;
    }),

  toggleSavePlaylist: (playlist) =>
    set((prev) => {
      const exists = prev.savedPlaylists.some((p) => p.id === playlist.id);
      const savedPlaylists = exists
        ? prev.savedPlaylists.filter((p) => p.id !== playlist.id)
        : [playlist, ...prev.savedPlaylists];
      const next = { ...prev, savedPlaylists };
      syncPersisted(next);
      return next;
    }),

  createUserPlaylist: (name, initialTrack) => {
    const id = `upl-${Date.now().toString(36)}`;
    const now = Date.now();
    const newPl: UserMusicPlaylist = {
      id,
      name: name.trim() || 'Mi Playlist',
      description: 'Creada en Riffan Music',
      createdAt: now,
      updatedAt: now,
      tracks: initialTrack ? [initialTrack] : [],
    };
    set((prev) => {
      const next = { ...prev, userPlaylists: [newPl, ...prev.userPlaylists] };
      syncPersisted(next);
      return next;
    });
    return id;
  },

  renameUserPlaylist: (playlistId, name, description) =>
    set((prev) => {
      const cleanName = name.trim();
      if (!cleanName) return prev;
      const now = Date.now();
      const userPlaylists = prev.userPlaylists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        return {
          ...pl,
          name: cleanName.slice(0, 80),
          description:
            typeof description === 'string' ? description.trim().slice(0, 240) : pl.description,
          updatedAt: now,
        };
      });
      const next = { ...prev, userPlaylists };
      syncPersisted(next);
      return next;
    }),

  deleteUserPlaylist: (id) =>
    set((prev) => {
      const next = {
        ...prev,
        userPlaylists: prev.userPlaylists.filter((p) => p.id !== id),
      };
      syncPersisted(next);
      return next;
    }),

  addTrackToUserPlaylist: (playlistId, track) =>
    set((prev) => {
      const now = Date.now();
      const userPlaylists = prev.userPlaylists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.tracks.some((t) => isSameMusicTrackVariant(t, track))) return pl;
        return { ...pl, updatedAt: now, tracks: [...pl.tracks, track] };
      });
      const next = { ...prev, userPlaylists };
      syncPersisted(next);
      return next;
    }),

  removeTrackFromUserPlaylist: (playlistId, trackId) =>
    set((prev) => {
      const now = Date.now();
      const userPlaylists = prev.userPlaylists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        return {
          ...pl,
          updatedAt: now,
          tracks: pl.tracks.filter((t) => t.id !== trackId),
        };
      });
      const next = { ...prev, userPlaylists };
      syncPersisted(next);
      return next;
    }),

  moveTrackInUserPlaylist: (playlistId, fromIndex, toIndex) =>
    set((prev) => {
      const now = Date.now();
      const userPlaylists = prev.userPlaylists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= pl.tracks.length ||
          toIndex >= pl.tracks.length
        ) {
          return pl;
        }
        const reordered = [...pl.tracks];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        return { ...pl, updatedAt: now, tracks: reordered };
      });
      const next = { ...prev, userPlaylists };
      syncPersisted(next);
      return next;
    }),

  setMusicLang: (musicLang) =>
    set((prev) => {
      const next = { ...prev, musicLang };
      syncPersisted(next);
      return next;
    }),

  setRadioReconnectAttempt: (attempt) => set({ radioReconnectAttempt: attempt }),

  hydrateFromCloud: (payload) =>
    set((prev) => {
      const mergedLiked = dedupeMusicTracks([
        ...prev.likedTracks,
        ...(payload.likedTracks || []),
      ]).slice(0, 600);

      const playlistMap = new Map<string, UserMusicPlaylist>();
      for (const lp of prev.userPlaylists) {
        playlistMap.set(lp.id, lp);
      }
      for (const cp of payload.userPlaylists || []) {
        const local = playlistMap.get(cp.id);
        if (!local) {
          playlistMap.set(cp.id, cp);
        } else {
          const remoteTs = cp.updatedAt || cp.createdAt || 0;
          const localTs = local.updatedAt || local.createdAt || 0;
          const remoteNewer = remoteTs > localTs;
          const mergedTracks = remoteNewer
            ? dedupeMusicTracks([...cp.tracks, ...local.tracks])
            : dedupeMusicTracks([...local.tracks, ...cp.tracks]);
          playlistMap.set(cp.id, {
            ...local,
            name: remoteNewer ? cp.name || local.name : local.name,
            description: remoteNewer ? cp.description ?? local.description : local.description,
            updatedAt: Math.max(remoteTs, localTs) || Date.now(),
            tracks:
              remoteNewer && cp.tracks.length === 0
                ? cp.tracks
                : remoteNewer
                ? cp.tracks.length >= local.tracks.length
                  ? cp.tracks
                  : mergedTracks
                : local.tracks,
          });
        }
      }
      const mergedPlaylists = Array.from(playlistMap.values()).slice(0, 60);

      const mergedArtists = Array.from(
        new Set([
          ...(prev.tasteProfile?.favoriteArtists || []),
          ...(payload.tasteProfile?.favoriteArtists || []),
        ])
      ).slice(0, 40);
      const mergedGenres = Array.from(
        new Set([
          ...(prev.tasteProfile?.favoriteGenres || []),
          ...(payload.tasteProfile?.favoriteGenres || []),
        ])
      ).slice(0, 20);

      const remoteStats = payload.listeningStats;
      const mergedTrackCounts = { ...prev.listeningStats.trackPlayCounts };
      for (const [tid, stat] of Object.entries(remoteStats?.trackPlayCounts || {})) {
        const loc = mergedTrackCounts[tid];
        if (!loc || stat.count > loc.count) {
          mergedTrackCounts[tid] = stat;
        }
      }
      const mergedArtistCounts = { ...prev.listeningStats.artistPlayCounts };
      for (const [aid, stat] of Object.entries(remoteStats?.artistPlayCounts || {})) {
        const loc = mergedArtistCounts[aid];
        if (!loc || stat.count > loc.count) {
          mergedArtistCounts[aid] = stat;
        }
      }
      const mergedStats: ListeningStats = {
        totalPlays: Math.max(prev.listeningStats.totalPlays || 0, remoteStats?.totalPlays || 0),
        totalListenSec: Math.max(
          prev.listeningStats.totalListenSec || 0,
          remoteStats?.totalListenSec || 0
        ),
        trackPlayCounts: mergedTrackCounts,
        artistPlayCounts: mergedArtistCounts,
        trackSignals: {
          ...(remoteStats?.trackSignals || {}),
          ...(prev.listeningStats.trackSignals || {}),
        },
      };

      const s = payload.studioSettings || {};
      const nextEq10 = isValidEqBands10(s.eqBands10) ? s.eqBands10 : prev.eqBands10;

      const next = {
        ...prev,
        likedTracks: mergedLiked,
        userPlaylists: mergedPlaylists,
        savedAlbums:
          payload.savedAlbums?.length > 0 && prev.savedAlbums.length === 0
            ? payload.savedAlbums
            : prev.savedAlbums,
        savedPlaylists:
          payload.savedPlaylists?.length > 0 && prev.savedPlaylists.length === 0
            ? payload.savedPlaylists
            : prev.savedPlaylists,
        customPresets:
          payload.customPresets?.length > 0 && prev.customPresets.length === 0
            ? payload.customPresets
            : prev.customPresets,
        tasteProfile: {
          favoriteArtists: mergedArtists,
          favoriteGenres: mergedGenres,
          importedSources:
            (prev.tasteProfile?.importedSources?.length || 0) >=
            (payload.tasteProfile?.importedSources?.length || 0)
              ? prev.tasteProfile.importedSources
              : payload.tasteProfile.importedSources || [],
        },
        listeningStats: mergedStats,
        eqBands10: nextEq10,
        eqBands: toEq5From10(nextEq10),
        crossfadeSec:
          typeof s.crossfadeSec === 'number' ? clamp(s.crossfadeSec, 0, 10) : prev.crossfadeSec,
        normalizeAudio:
          typeof s.normalizeAudio === 'boolean' ? s.normalizeAudio : prev.normalizeAudio,
        musicLang: isValidMusicLang(s.musicLang) ? s.musicLang : prev.musicLang,
      };
      syncPersisted(next, true);
      return next;
    }),

  getPersistedSnapshot: () => extractPersisted(get()),

  stopAllMusic: () =>
    set({
      isPlaying: false,
      currentTrack: null,
      activeRadio: null,
      resolvedPlayback: null,
      showNowPlayingModal: false,
      driveModeOpen: false,
    }),
}));
