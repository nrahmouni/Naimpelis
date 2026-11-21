import { create } from 'zustand';
import type {
  EqPresetId,
  MusicAlbumRef,
  MusicPlaylist,
  MusicRadioStation,
  MusicRepeatMode,
  MusicTrack,
  MusicViewMode,
  ResolvedTrackPlayback,
  UserMusicPlaylist,
} from '../types/music';

const STORAGE_KEY = 'riffan_music_library_v1';

interface PersistedLibrary {
  likedTracks: MusicTrack[];
  savedAlbums: MusicAlbumRef[];
  savedPlaylists: MusicPlaylist[];
  userPlaylists: UserMusicPlaylist[];
  recentTracks: MusicTrack[];
  eqPreset: EqPresetId;
  volume: number;
}

function loadLibrary(): PersistedLibrary {
  const defaults: PersistedLibrary = {
    likedTracks: [],
    savedAlbums: [],
    savedPlaylists: [],
    userPlaylists: [],
    recentTracks: [],
    eqPreset: 'flat',
    volume: 0.85,
  };
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedLibrary>;
    return {
      likedTracks: Array.isArray(parsed.likedTracks) ? parsed.likedTracks : [],
      savedAlbums: Array.isArray(parsed.savedAlbums) ? parsed.savedAlbums : [],
      savedPlaylists: Array.isArray(parsed.savedPlaylists) ? parsed.savedPlaylists : [],
      userPlaylists: Array.isArray(parsed.userPlaylists) ? parsed.userPlaylists : [],
      recentTracks: Array.isArray(parsed.recentTracks) ? parsed.recentTracks : [],
      eqPreset: parsed.eqPreset || 'flat',
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.85,
    };
  } catch {
    return defaults;
  }
}

function saveLibrary(lib: PersistedLibrary) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
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
    volume: state.volume,
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
  setPlaybackRate: (rate: number) => void;
  setViewMode: (mode: MusicViewMode) => void;
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
  playbackRate: 1,
  viewMode: 'audio',
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

  setPlaybackRate: (rate) => set({ playbackRate: rate }),
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

  stopAllMusic: () =>
    set({
      isPlaying: false,
      currentTrack: null,
      activeRadio: null,
      resolvedPlayback: null,
      showNowPlayingModal: false,
    }),
}));
