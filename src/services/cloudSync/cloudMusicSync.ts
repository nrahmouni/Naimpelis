import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, isTransientFirestoreError } from '../../firebase';
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

function isPermissionError(err: unknown): boolean {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code || '') : '';
  return code === 'permission-denied';
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

  const ref = doc(db, 'musicLibraries', user.uid);
  const likedTracksJson = capJsonString(payload.likedTracks.slice(0, 180), 215000, (arr: MusicTrack[]) =>
    arr.slice(0, 90)
  );
  const playlistsJson = capJsonString(
    payload.userPlaylists.slice(0, 30),
    215000,
    (pls: UserMusicPlaylist[]) => pls.slice(0, 15).map((p) => ({ ...p, tracks: p.tracks.slice(0, 40) }))
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

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await setDoc(
        ref,
        {
          likedTracksJson,
          playlistsJson,
          collectionsJson,
          tasteJson,
          studioJson,
          statsJson,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(ref, {
        uid: user.uid,
        likedTracksJson,
        playlistsJson,
        collectionsJson,
        tasteJson,
        studioJson,
        statsJson,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (isTransientFirestoreError(error) || isPermissionError(error)) {
      return;
    }
  }
}

export function subscribeCloudMusicLibrary(
  uid: string,
  onRemoteUpdate: (payload: CloudMusicSnapshotPayload) => void
): () => void {
  const ref = doc(db, 'musicLibraries', uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
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
      if (isTransientFirestoreError(error) || isPermissionError(error)) return;
    }
  );
}
