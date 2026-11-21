import { create } from 'zustand';
import type {
  AudioEffectId,
  AudioFxParams,
  EqPresetId,
  MusicAlbumRef,
  MusicPlaylist,
  MusicRadioStation,
  MusicRepeatMode,
  MusicTrack,
  MusicViewMode,
  ResolvedTrackPlayback,
  Spatial8dMode,
  UserMusicPlaylist,
  VocalStemMode,
} from '../types/music';

import {
  AUDIO_8D_LIMITS,
  clamp8dDepth,
  clamp8dReverb,
  clamp8dSpeed,
} from '../hooks/useAudio8D';
import { normalizeMusicLang, type MusicLang } from '../components/music/musicI18n';
import { EQ_PRESETS, normalizeCustomEqBands } from '../components/music/eqPresets';
import {
  AUDIO_EFFECTS,
  DEFAULT_AUDIO_FX_PARAMS,
  normalizeAudioFxParams,
  resolveAudioFxParams,
} from '../components/music/audioEffects';

const STORAGE_KEY = 'riffan_music_library_v1';

export const SPATIAL_8D_PRESETS: Record<
  Spatial8dMode,
  { speed: number; reverbAmount: number; depth: number }
> = {
  orbit: { speed: 10, reverbAmount: 0.25, depth: 1.8 },
  concert: { speed: 13, reverbAmount: 0.42, depth: 2.4 },
  club: { speed: 5.5, reverbAmount: 0.22, depth: 2.1 },
};

interface PersistedLibrary {
  likedTracks: MusicTrack[];
  savedAlbums: MusicAlbumRef[];
  savedPlaylists: MusicPlaylist[];
  userPlaylists: UserMusicPlaylist[];
  recentTracks: MusicTrack[];
  eqPreset: EqPresetId;
  customEqBands: number[];
  fxPreset: AudioEffectId;
  customFxParams: AudioFxParams;
  spatial8dEnabled: boolean;
  spatial8dMode: Spatial8dMode;
  spatial8dSpeed: number;
  spatial8dReverb: number;
  spatial8dDepth: number;
  volume: number;
  musicLang: MusicLang;
  musicLangCustom?: boolean;
  musicLangV2?: boolean;
}

function isValidEqPreset(val: unknown): val is EqPresetId {
  return typeof val === 'string' && val in EQ_PRESETS;
}

function isValidAudioEffect(val: unknown): val is AudioEffectId {
  return typeof val === 'string' && val in AUDIO_EFFECTS;
}

function isValidMusicLang(val: unknown): val is MusicLang {
  return val === 'es' || val === 'en' || val === 'fr' || val === 'zh' || val === 'ca';
}

function isValidSpatialMode(val: unknown): val is Spatial8dMode {
  return val === 'orbit' || val === 'concert' || val === 'club';
}

function readAppDefaultMusicLang(): MusicLang {
  if (typeof localStorage === 'undefined') return 'es';
  try {
    const appLang = localStorage.getItem('riffan_lang') || localStorage.getItem('naim_lang');
    if (appLang) return normalizeMusicLang(appLang);
  } catch {
    // ignore
  }
  return 'es';
}

function loadLibrary(): PersistedLibrary {
  const defaultLang = readAppDefaultMusicLang();
  const defaults: PersistedLibrary = {
    likedTracks: [],
    savedAlbums: [],
    savedPlaylists: [],
    userPlaylists: [],
    recentTracks: [],
    eqPreset: 'flat',
    customEqBands: normalizeCustomEqBands(),
    fxPreset: 'none',
    customFxParams: { ...DEFAULT_AUDIO_FX_PARAMS },
    spatial8dEnabled: false,
    spatial8dMode: 'orbit',
    spatial8dSpeed: AUDIO_8D_LIMITS.defaultSpeedSec,
    spatial8dReverb: AUDIO_8D_LIMITS.defaultReverb,
    spatial8dDepth: AUDIO_8D_LIMITS.defaultDepth,
    volume: 0.85,
    musicLang: defaultLang,
    musicLangCustom: false,
    musicLangV2: true,
  };
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedLibrary>;
    const hasCustomLang = Boolean(parsed.musicLangCustom && isValidMusicLang(parsed.musicLang));
    return {
      likedTracks: Array.isArray(parsed.likedTracks) ? parsed.likedTracks : [],
      savedAlbums: Array.isArray(parsed.savedAlbums) ? parsed.savedAlbums : [],
      savedPlaylists: Array.isArray(parsed.savedPlaylists) ? parsed.savedPlaylists : [],
      userPlaylists: Array.isArray(parsed.userPlaylists) ? parsed.userPlaylists : [],
      recentTracks: Array.isArray(parsed.recentTracks) ? parsed.recentTracks : [],
      eqPreset: isValidEqPreset(parsed.eqPreset) ? parsed.eqPreset : 'flat',
      customEqBands: normalizeCustomEqBands(
        Array.isArray(parsed.customEqBands) ? parsed.customEqBands : undefined
      ),
      fxPreset: isValidAudioEffect(parsed.fxPreset) ? parsed.fxPreset : 'none',
      customFxParams: normalizeAudioFxParams(parsed.customFxParams),
      spatial8dEnabled: Boolean(parsed.spatial8dEnabled),
      spatial8dMode: isValidSpatialMode(parsed.spatial8dMode) ? parsed.spatial8dMode : 'orbit',
      spatial8dSpeed:
        typeof parsed.spatial8dSpeed === 'number'
          ? clamp8dSpeed(parsed.spatial8dSpeed)
          : AUDIO_8D_LIMITS.defaultSpeedSec,
      spatial8dReverb:
        typeof parsed.spatial8dReverb === 'number'
          ? clamp8dReverb(parsed.spatial8dReverb)
          : AUDIO_8D_LIMITS.defaultReverb,
      spatial8dDepth:
        typeof parsed.spatial8dDepth === 'number'
          ? clamp8dDepth(parsed.spatial8dDepth)
          : AUDIO_8D_LIMITS.defaultDepth,
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.85,
      musicLang: hasCustomLang ? parsed.musicLang! : defaultLang,
      musicLangCustom: hasCustomLang,
      musicLangV2: true,
    };
  } catch {
    return defaults;
  }
}

function saveLibrary(lib: PersistedLibrary) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...lib, musicLangV2: true }));
  } catch {
    // ignore storage quota errors
  }
}

function syncPersisted(state: PersistedLibrary) {
  saveLibrary({
    likedTracks: state.likedTracks,
    savedAlbums: state.savedAlbums,
    savedPlaylists: state.savedPlaylists,
    userPlaylists: state.userPlaylists,
    recentTracks: state.recentTracks,
    eqPreset: state.eqPreset,
    customEqBands: state.customEqBands,
    fxPreset: state.fxPreset,
    customFxParams: state.customFxParams,
    spatial8dEnabled: state.spatial8dEnabled,
    spatial8dMode: state.spatial8dMode,
    spatial8dSpeed: state.spatial8dSpeed,
    spatial8dReverb: state.spatial8dReverb,
    spatial8dDepth: state.spatial8dDepth,
    volume: state.volume,
    musicLang: state.musicLang,
    musicLangCustom: state.musicLangCustom,
    musicLangV2: true,
  });
}

export interface MusicStoreState extends PersistedLibrary {
  currentTrack: MusicTrack | null;
  activeRadio: MusicRadioStation | null;
  resolvedPlayback: ResolvedTrackPlayback | null;
  isResolvingTrack: boolean;
  playbackError: string | null;

  queue: MusicTrack[];
  queueIndex: number;

  isPlaying: boolean;
  currentTime: number;
  duration: number;
  seekRequestSec: number | null;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: MusicRepeatMode;
  playbackRate: number;
  viewMode: MusicViewMode;
  stemMode: VocalStemMode;
  sleepTimerEndsAt: number | null;

  showNowPlayingModal: boolean;
  nowPlayingTab: 'artwork' | 'lyrics' | 'video';
  showQueueDrawer: boolean;
  showEqModal: boolean;

  playTrack: (track: MusicTrack, contextTracks?: MusicTrack[]) => void;
  playRadio: (station: MusicRadioStation) => void;
  addToQueue: (track: MusicTrack) => void;
  removeFromQueue: (index: number) => void;
  playNext: () => void;
  playPrev: () => void;
  setResolvedPlayback: (resolved: ResolvedTrackPlayback | null) => void;
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
  setCustomEqBand: (bandIdx: number, db: number) => void;
  setCustomEqBands: (bands: number[]) => void;
  resetEqToFlat: () => void;
  setFxPreset: (preset: AudioEffectId) => void;
  setFxParam: <K extends keyof AudioFxParams>(key: K, value: AudioFxParams[K]) => void;
  resetAudioFx: () => void;
  toggleSpatial8d: () => void;
  setSpatial8dEnabled: (enabled: boolean) => void;
  setSpatial8dMode: (mode: Spatial8dMode) => void;
  setSpatial8dSpeed: (speed: number) => void;
  setSpatial8dReverb: (reverb: number) => void;
  setSpatial8dDepth: (depth: number) => void;
  resetSpatial8dControls: () => void;
  setPlaybackRate: (rate: number) => void;
  setViewMode: (mode: MusicViewMode) => void;
  setStemMode: (mode: VocalStemMode) => void;
  setSleepTimerMinutes: (minutes: number | null) => void;

  setShowNowPlayingModal: (open: boolean) => void;
  setNowPlayingTab: (tab: 'artwork' | 'lyrics' | 'video') => void;
  setShowQueueDrawer: (open: boolean) => void;
  setShowEqModal: (open: boolean) => void;

  toggleLikeTrack: (track: MusicTrack) => void;
  toggleSaveAlbum: (album: MusicAlbumRef) => void;
  toggleSavePlaylist: (playlist: MusicPlaylist) => void;
  createUserPlaylist: (name: string, initialTrack?: MusicTrack) => string;
  deleteUserPlaylist: (id: string) => void;
  addTrackToUserPlaylist: (playlistId: string, track: MusicTrack) => void;
  removeTrackFromUserPlaylist: (playlistId: string, trackId: string) => void;
  setMusicLang: (lang: MusicLang, isUserSelection?: boolean) => void;
  syncMusicLangWithApp: (appLang: string) => void;
  stopAllMusic: () => void;
}

const initial = loadLibrary();

export const useMusicStore = create<MusicStoreState>((set, get) => ({
  ...initial,

  currentTrack: null,
  activeRadio: null,
  resolvedPlayback: null,
  isResolvingTrack: false,
  playbackError: null,

  queue: [],
  queueIndex: -1,

  isPlaying: false,
  currentTime: 0,
  duration: 0,
  seekRequestSec: null,
  isMuted: false,
  shuffle: false,
  repeatMode: 'off',
  playbackRate: resolveAudioFxParams(initial.fxPreset, initial.customFxParams).playbackRate,
  viewMode: 'audio',
  stemMode: 'both',
  sleepTimerEndsAt: null,

  showNowPlayingModal: false,
  nowPlayingTab: 'artwork',
  showQueueDrawer: false,
  showEqModal: false,

  playTrack: (track, contextTracks) => {
    const state = get();
    const list = contextTracks && contextTracks.length > 0 ? contextTracks : [track];
    const idx = Math.max(
      0,
      list.findIndex((t) => t.id === track.id)
    );
    const updatedRecent = [track, ...state.recentTracks.filter((t) => t.id !== track.id)].slice(0, 30);

    set((prev) => {
      const next = {
        ...prev,
        activeRadio: null,
        currentTrack: track,
        resolvedPlayback: null,
        isResolvingTrack: true,
        playbackError: null,
        queue: list,
        queueIndex: idx,
        isPlaying: true,
        currentTime: 0,
        duration: track.durationSec || 0,
        recentTracks: updatedRecent,
      };
      syncPersisted(next);
      return next;
    });
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
    });
  },

  addToQueue: (track) => {
    set((prev) => {
      const exists = prev.queue.some((t) => t.id === track.id);
      if (exists) return prev;
      return { queue: [...prev.queue, track] };
    });
  },

  removeFromQueue: (index) => {
    set((prev) => {
      if (index < 0 || index >= prev.queue.length) return prev;
      const nextQueue = prev.queue.filter((_, idx) => idx !== index);
      let nextIdx = prev.queueIndex;
      if (index < prev.queueIndex) nextIdx = Math.max(0, nextIdx - 1);
      else if (index === prev.queueIndex) nextIdx = Math.min(nextIdx, nextQueue.length - 1);
      return { queue: nextQueue, queueIndex: nextIdx };
    });
  },

  playNext: () => {
    const state = get();
    if (state.queue.length === 0) return;
    if (state.repeatMode === 'one' && state.currentTrack) {
      set({ seekRequestSec: 0, isPlaying: true, currentTime: 0 });
      return;
    }

    let nextIdx = state.queueIndex + 1;
    if (state.shuffle && state.queue.length > 1) {
      let rand = Math.floor(Math.random() * state.queue.length);
      if (rand === state.queueIndex) rand = (rand + 1) % state.queue.length;
      nextIdx = rand;
    } else if (nextIdx >= state.queue.length) {
      if (state.repeatMode === 'all') {
        nextIdx = 0;
      } else {
        set({ isPlaying: false });
        return;
      }
    }

    const nextTrack = state.queue[nextIdx];
    if (!nextTrack) return;
    const updatedRecent = [nextTrack, ...state.recentTracks.filter((t) => t.id !== nextTrack.id)].slice(0, 30);

    set((prev) => {
      const next = {
        ...prev,
        activeRadio: null,
        currentTrack: nextTrack,
        resolvedPlayback: null,
        isResolvingTrack: true,
        playbackError: null,
        queueIndex: nextIdx,
        isPlaying: true,
        currentTime: 0,
        duration: nextTrack.durationSec || 0,
        recentTracks: updatedRecent,
      };
      syncPersisted(next);
      return next;
    });
  },

  playPrev: () => {
    const state = get();
    if (state.currentTime > 3) {
      set({ seekRequestSec: 0, currentTime: 0 });
      return;
    }
    if (state.queue.length === 0) return;
    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) prevIdx = state.repeatMode === 'all' ? state.queue.length - 1 : 0;
    const prevTrack = state.queue[prevIdx];
    if (!prevTrack) return;

    set({
      activeRadio: null,
      currentTrack: prevTrack,
      resolvedPlayback: null,
      isResolvingTrack: true,
      playbackError: null,
      queueIndex: prevIdx,
      isPlaying: true,
      currentTime: 0,
      duration: prevTrack.durationSec || 0,
    });
  },

  setResolvedPlayback: (resolved) => set({ resolvedPlayback: resolved, isResolvingTrack: false }),
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
    const clamped = Math.max(0, Math.min(1, vol));
    set((prev) => {
      const next = { ...prev, volume: clamped, isMuted: clamped === 0 };
      syncPersisted(next);
      return next;
    });
  },

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({
      repeatMode: s.repeatMode === 'off' ? 'all' : s.repeatMode === 'all' ? 'one' : 'off',
    })),

  setEqPreset: (preset) =>
    set((prev) => {
      const next = { ...prev, eqPreset: preset };
      syncPersisted(next);
      return next;
    }),

  setCustomEqBand: (bandIdx, db) =>
    set((prev) => {
      const baseBands =
        prev.eqPreset === 'custom'
          ? normalizeCustomEqBands(prev.customEqBands)
          : normalizeCustomEqBands(EQ_PRESETS[prev.eqPreset]?.gains);
      if (bandIdx >= 0 && bandIdx < baseBands.length) {
        baseBands[bandIdx] = normalizeCustomEqBands([db])[0];
        baseBands[bandIdx] = Math.round(Math.max(-12, Math.min(12, Number.isFinite(db) ? db : 0)) * 2) / 2;
      }
      const next = { ...prev, eqPreset: 'custom' as EqPresetId, customEqBands: baseBands };
      syncPersisted(next);
      return next;
    }),

  setCustomEqBands: (bands) =>
    set((prev) => {
      const next = {
        ...prev,
        eqPreset: 'custom' as EqPresetId,
        customEqBands: normalizeCustomEqBands(bands),
      };
      syncPersisted(next);
      return next;
    }),

  resetEqToFlat: () =>
    set((prev) => {
      const next = {
        ...prev,
        eqPreset: 'flat' as EqPresetId,
        customEqBands: normalizeCustomEqBands(),
      };
      syncPersisted(next);
      return next;
    }),

  setFxPreset: (preset) =>
    set((prev) => {
      const resolved = resolveAudioFxParams(preset, prev.customFxParams);
      const next = {
        ...prev,
        fxPreset: preset,
        playbackRate: resolved.playbackRate,
      };
      syncPersisted(next);
      return next;
    }),

  setFxParam: (key, value) =>
    set((prev) => {
      const base = resolveAudioFxParams(prev.fxPreset, prev.customFxParams);
      const updated = normalizeAudioFxParams({
        ...base,
        [key]: value,
      });
      const next = {
        ...prev,
        fxPreset: 'custom' as AudioEffectId,
        customFxParams: updated,
        playbackRate: updated.playbackRate,
      };
      syncPersisted(next);
      return next;
    }),

  resetAudioFx: () =>
    set((prev) => {
      const next = {
        ...prev,
        fxPreset: 'none' as AudioEffectId,
        customFxParams: { ...DEFAULT_AUDIO_FX_PARAMS },
        playbackRate: 1,
      };
      syncPersisted(next);
      return next;
    }),

  toggleSpatial8d: () =>
    set((prev) => {
      const next = { ...prev, spatial8dEnabled: !prev.spatial8dEnabled };
      syncPersisted(next);
      return next;
    }),

  setSpatial8dEnabled: (enabled) =>
    set((prev) => {
      const next = { ...prev, spatial8dEnabled: enabled };
      syncPersisted(next);
      return next;
    }),

  setSpatial8dMode: (mode) =>
    set((prev) => {
      const preset = SPATIAL_8D_PRESETS[mode] || SPATIAL_8D_PRESETS.orbit;
      const next = {
        ...prev,
        spatial8dMode: mode,
        spatial8dSpeed: preset.speed,
        spatial8dReverb: preset.reverbAmount,
        spatial8dDepth: preset.depth,
      };
      syncPersisted(next);
      return next;
    }),

  setSpatial8dSpeed: (speed) =>
    set((prev) => {
      const next = { ...prev, spatial8dSpeed: clamp8dSpeed(speed) };
      syncPersisted(next);
      return next;
    }),

  setSpatial8dReverb: (reverb) =>
    set((prev) => {
      const next = { ...prev, spatial8dReverb: clamp8dReverb(reverb) };
      syncPersisted(next);
      return next;
    }),

  setSpatial8dDepth: (depth) =>
    set((prev) => {
      const next = { ...prev, spatial8dDepth: clamp8dDepth(depth) };
      syncPersisted(next);
      return next;
    }),

  resetSpatial8dControls: () =>
    set((prev) => {
      const next = {
        ...prev,
        spatial8dMode: 'orbit' as Spatial8dMode,
        spatial8dSpeed: AUDIO_8D_LIMITS.defaultSpeedSec,
        spatial8dReverb: AUDIO_8D_LIMITS.defaultReverb,
        spatial8dDepth: AUDIO_8D_LIMITS.defaultDepth,
      };
      syncPersisted(next);
      return next;
    }),

  setPlaybackRate: (rate) =>
    set((prev) => {
      const base = resolveAudioFxParams(prev.fxPreset, prev.customFxParams);
      const updated = normalizeAudioFxParams({ ...base, playbackRate: rate });
      const next = {
        ...prev,
        playbackRate: updated.playbackRate,
        fxPreset: 'custom' as AudioEffectId,
        customFxParams: updated,
      };
      syncPersisted(next);
      return next;
    }),
  setViewMode: (mode) =>
    set({
      viewMode: mode,
      nowPlayingTab: mode === 'video' ? 'video' : 'artwork',
    }),
  setStemMode: (stemMode) => set({ stemMode }),

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

  toggleLikeTrack: (track) =>
    set((prev) => {
      const exists = prev.likedTracks.some((t) => t.id === track.id);
      const likedTracks = exists
        ? prev.likedTracks.filter((t) => t.id !== track.id)
        : [track, ...prev.likedTracks];
      const next = { ...prev, likedTracks };
      syncPersisted(next);
      return next;
    }),

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
    const newPl: UserMusicPlaylist = {
      id,
      name: name.trim() || 'Mi Playlist',
      description: 'Creada en Riffan Music',
      createdAt: Date.now(),
      tracks: initialTrack ? [initialTrack] : [],
    };
    set((prev) => {
      const next = { ...prev, userPlaylists: [newPl, ...prev.userPlaylists] };
      syncPersisted(next);
      return next;
    });
    return id;
  },

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
      const userPlaylists = prev.userPlaylists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.tracks.some((t) => t.id === track.id)) return pl;
        return { ...pl, tracks: [...pl.tracks, track] };
      });
      const next = { ...prev, userPlaylists };
      syncPersisted(next);
      return next;
    }),

  removeTrackFromUserPlaylist: (playlistId, trackId) =>
    set((prev) => {
      const userPlaylists = prev.userPlaylists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        return { ...pl, tracks: pl.tracks.filter((t) => t.id !== trackId) };
      });
      const next = { ...prev, userPlaylists };
      syncPersisted(next);
      return next;
    }),

  setMusicLang: (musicLang, isUserSelection = true) =>
    set((prev) => {
      const next = {
        ...prev,
        musicLang,
        musicLangCustom: isUserSelection ? true : prev.musicLangCustom,
      };
      syncPersisted(next);
      return next;
    }),

  syncMusicLangWithApp: (appLang) =>
    set((prev) => {
      if (prev.musicLangCustom) return prev;
      const normalized = normalizeMusicLang(appLang);
      if (prev.musicLang === normalized) return prev;
      const next = { ...prev, musicLang: normalized };
      syncPersisted(next);
      return next;
    }),

  stopAllMusic: () =>
    set({
      isPlaying: false,
      currentTrack: null,
      activeRadio: null,
      resolvedPlayback: null,
      showNowPlayingModal: false,
    }),
}));
