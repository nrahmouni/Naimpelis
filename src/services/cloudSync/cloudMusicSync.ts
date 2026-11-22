import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isTransientFirestoreError,
  OperationType,
} from '../../firebase';
import type {
  CustomStudioPreset,
  EqBands10,
  ExportBitrate,
  ListeningStats,
  MusicAlbumRef,
  MusicPlaylist,
  MusicTrack,
  Spatial8dMode,
  SpatialTrajectory,
  TasteProfile,
  TrackStudioProfile,
  UserMusicPlaylist,
} from '../../types/music';
import type { MusicLang } from '../../components/music/musicI18n';
import { enqueueDocWrite, isNotFoundError } from './cloudSyncSanitizers';

export interface CloudMusicSnapshotPayload {
  likedTracks: MusicTrack[];
  userPlaylists: UserMusicPlaylist[];
  savedAlbums: MusicAlbumRef[];
  savedPlaylists: MusicPlaylist[];
  customPresets: CustomStudioPreset[];
  tasteProfile: TasteProfile;
  listeningStats: ListeningStats;
  studioSettings: {
    eqBands10?: EqBands10;
    spatial8dEnabled?: boolean;
    spatial8dMode?: Spatial8dMode;
    spatialTrajectory?: SpatialTrajectory;
    spatial8dSpeedSec?: number;
    bassBoostDb?: number;
    reverbMix?: number;
    stereoWidth?: number;
    exciterMix?: number;
    vinylCrackle?: number;
    vocalCancel?: boolean;
    crossfadeSec?: number;
    normalizeAudio?: boolean;
    exportBitrate?: ExportBitrate;
    wifiOnlyAutoDownload?: boolean;
    musicLang?: MusicLang;
    trackProfiles?: Record<string, TrackStudioProfile>;
  };
}

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function compactTrackForCloud(t: MusicTrack): MusicTrack {
  const cover = t.album?.cover || t.album?.coverXl || '';
  const coverXl = t.album?.coverXl && t.album.coverXl !== cover ? t.album.coverXl : undefined;
  return {
    id: t.id,
    title: String(t.title || '').slice(0, 140),
    artist: {
      id: t.artist?.id || '',
      name: String(t.artist?.name || 'Artista').slice(0, 120),
    },
    album: {
      id: t.album?.id || '',
      title: String(t.album?.title || '').slice(0, 120),
      cover,
      ...(coverXl ? { coverXl } : {}),
    },
    durationSec: t.durationSec || 0,
    ...(t.source ? { source: t.source } : {}),
    ...(t.youtubeVideoId ? { youtubeVideoId: t.youtubeVideoId } : {}),
    ...(t.spotifyId ? { spotifyId: t.spotifyId } : {}),
    ...(t.isrc ? { isrc: t.isrc } : {}),
  };
}

export function buildCloudMusicPayload(lib: {
  likedTracks: MusicTrack[];
  userPlaylists: UserMusicPlaylist[];
  savedAlbums: MusicAlbumRef[];
  savedPlaylists: MusicPlaylist[];
  customPresets: CustomStudioPreset[];
  tasteProfile: TasteProfile;
  listeningStats: ListeningStats;
  eqBands10?: EqBands10;
  spatial8dEnabled?: boolean;
  spatial8dMode?: Spatial8dMode;
  spatialTrajectory?: SpatialTrajectory;
  spatial8dSpeedSec?: number;
  bassBoostDb?: number;
  reverbMix?: number;
  stereoWidth?: number;
  exciterMix?: number;
  vinylCrackle?: number;
  vocalCancel?: boolean;
  crossfadeSec?: number;
  normalizeAudio?: boolean;
  exportBitrate?: ExportBitrate;
  wifiOnlyAutoDownload?: boolean;
  musicLang?: MusicLang;
  trackProfiles?: Record<string, TrackStudioProfile>;
}): CloudMusicSnapshotPayload {
  return {
    likedTracks: lib.likedTracks,
    userPlaylists: lib.userPlaylists,
    savedAlbums: lib.savedAlbums,
    savedPlaylists: lib.savedPlaylists,
    customPresets: lib.customPresets,
    tasteProfile: lib.tasteProfile,
    listeningStats: lib.listeningStats,
    studioSettings: {
      eqBands10: lib.eqBands10,
      spatial8dEnabled: lib.spatial8dEnabled,
      spatial8dMode: lib.spatial8dMode,
      spatialTrajectory: lib.spatialTrajectory,
      spatial8dSpeedSec: lib.spatial8dSpeedSec,
      bassBoostDb: lib.bassBoostDb,
      reverbMix: lib.reverbMix,
      stereoWidth: lib.stereoWidth,
      exciterMix: lib.exciterMix,
      vinylCrackle: lib.vinylCrackle,
      vocalCancel: lib.vocalCancel,
      crossfadeSec: lib.crossfadeSec,
      normalizeAudio: lib.normalizeAudio,
      exportBitrate: lib.exportBitrate,
      wifiOnlyAutoDownload: lib.wifiOnlyAutoDownload,
      musicLang: lib.musicLang,
      trackProfiles: lib.trackProfiles,
    },
  };
}

function capJsonString(value: unknown, maxBytes: number, trimFn?: (v: any) => any): string {
  let str = JSON.stringify(value);
  if (str.length <= maxBytes) return str;
  if (trimFn) {
    const trimmed = trimFn(value);
    str = JSON.stringify(trimmed);
  }
  return str.length <= maxBytes ? str : JSON.stringify(Array.isArray(value) ? [] : {});
}

export async function pushCloudMusicLibrary(payload: CloudMusicSnapshotPayload): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.isAnonymous) return;

  const path = `musicLibraries/${user.uid}`;
  const ref = doc(db, 'musicLibraries', user.uid);

  const compactedLikes = payload.likedTracks.slice(0, 320).map(compactTrackForCloud);
  const likedTracksJson = capJsonString(compactedLikes, 215000, (arr: MusicTrack[]) =>
    arr.slice(0, 180)
  );
  const compactedPlaylists = payload.userPlaylists.slice(0, 36).map((pl) => ({
    ...pl,
    tracks: pl.tracks.slice(0, 260).map(compactTrackForCloud),
  }));
  const playlistsJson = capJsonString(
    compactedPlaylists,
    215000,
    (pls: UserMusicPlaylist[]) => pls.slice(0, 20).map((p) => ({ ...p, tracks: p.tracks.slice(0, 120) }))
  );
  const collectionsJson = capJsonString(
    {
      savedAlbums: payload.savedAlbums.slice(0, 60),
      savedPlaylists: payload.savedPlaylists.slice(0, 60),
      customPresets: payload.customPresets.slice(0, 20),
    },
    115000,
    (obj) => ({
      savedAlbums: (obj.savedAlbums || []).slice(0, 30),
      savedPlaylists: (obj.savedPlaylists || []).slice(0, 30),
      customPresets: (obj.customPresets || []).slice(0, 10),
    })
  );
  const tasteJson = capJsonString(payload.tasteProfile, 75000, (tp: TasteProfile) => ({
    favoriteArtists: tp.favoriteArtists.slice(0, 40),
    favoriteGenres: tp.favoriteGenres.slice(0, 20),
    importedSources: tp.importedSources.slice(0, 20),
  }));
  const studioJson = capJsonString(payload.studioSettings, 38000);
  const statsJson = capJsonString(payload.listeningStats, 75000);

  const updateFields = {
    likedTracksJson,
    playlistsJson,
    collectionsJson,
    tasteJson,
    studioJson,
    statsJson,
    updatedAt: serverTimestamp(),
  };

  return enqueueDocWrite(path, async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

    let existsOnServer = false;
    try {
      const existingSnap = await getDoc(ref);
      existsOnServer = existingSnap.exists();
    } catch (error) {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.GET, path);
    }

    if (existsOnServer) {
      try {
        await updateDoc(ref, updateFields);
        return;
      } catch (error) {
        if (!isNotFoundError(error)) {
          if (isTransientFirestoreError(error)) return;
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    }

    try {
      await setDoc(ref, {
        uid: user.uid,
        ...updateFields,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  });
}

export function subscribeCloudMusicLibrary(
  uid: string,
  onRemoteUpdate: (payload: CloudMusicSnapshotPayload) => void,
  onMissingRemote?: () => void
): () => void {
  const path = `musicLibraries/${uid}`;
  const ref = doc(db, 'musicLibraries', uid);
  let missingReported = false;
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        if (!missingReported) {
          missingReported = true;
          onMissingRemote?.();
        }
        return;
      }
      const d = snap.data();
      const likedTracks = safeJsonParse<MusicTrack[]>(d.likedTracksJson, []);
      const userPlaylists = safeJsonParse<UserMusicPlaylist[]>(d.playlistsJson, []);
      const collections = safeJsonParse<{
        savedAlbums?: MusicAlbumRef[];
        savedPlaylists?: MusicPlaylist[];
        customPresets?: CustomStudioPreset[];
      }>(d.collectionsJson, {});
      const tasteProfile = safeJsonParse<TasteProfile>(d.tasteJson, {
        favoriteArtists: [],
        favoriteGenres: [],
        importedSources: [],
      });
      const studioSettings = safeJsonParse<CloudMusicSnapshotPayload['studioSettings']>(
        d.studioJson,
        {}
      );
      const listeningStats = safeJsonParse<ListeningStats>(d.statsJson, {
        totalPlays: 0,
        totalListenSec: 0,
        trackPlayCounts: {},
        artistPlayCounts: {},
      });
      onRemoteUpdate({
        likedTracks: Array.isArray(likedTracks) ? likedTracks : [],
        userPlaylists: Array.isArray(userPlaylists) ? userPlaylists : [],
        savedAlbums: Array.isArray(collections.savedAlbums) ? collections.savedAlbums : [],
        savedPlaylists: Array.isArray(collections.savedPlaylists) ? collections.savedPlaylists : [],
        customPresets: Array.isArray(collections.customPresets) ? collections.customPresets : [],
        tasteProfile,
        listeningStats,
        studioSettings,
      });
    },
    (error) => {
      if (isTransientFirestoreError(error)) return;
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}
