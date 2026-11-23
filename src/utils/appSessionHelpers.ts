import type { CloudSavedRoom, VideoState } from '../types';
import type { RoomGameInviteType } from '../shared/protocol';

export type MobileNavTab =
  | 'home'
  | 'movies'
  | 'tdt'
  | 'sports'
  | 'youtube'
  | 'games'
  | 'chat'
  | 'room';

export const CINEMA_MODE_SESSION_KEY = 'naim_cinema_mode_session';
export const SAVED_ROOMS_CACHE_KEY = 'naim_cached_saved_rooms_v1';
export const ROOM_PINS_SESSION_KEY = 'naim_room_pins_session_v1';

export const INITIAL_VIDEO_STATE: VideoState = {
  mode: 'idle',
  url: '',
  rawSourceUrl: '',
  title: 'RiffanTV · Elige película, serie, partido o YouTube',
  subtitle: 'Proyección sincronizada en alta definición sin anuncios',
  currentTime: 0,
  isPlaying: false,
  isLive: false,
  tracks: [],
  activeTrackIndex: 0,
  lastUpdated: Date.now(),
};

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export function normalizeDeepLinkGameType(raw?: string): RoomGameInviteType | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  const aliasMap: Record<string, RoomGameInviteType> = {
    billar: 'pool',
    penaltis: 'penalty',
    'penaltis-mundial': 'penalty',
    coches: 'racing3d',
    'coches-3d': 'racing3d',
    racing: 'racing3d',
    'nitro-gp': 'racing3d',
    f1: 'racing3d',
  };
  const mapped = aliasMap[trimmed] || trimmed;
  const allowed: RoomGameInviteType[] = [
    'pool',
    'chapas',
    'headsoccer',
    'penalty',
    'racing3d',
    'poker',
    'blackjack',
    'parchis',
    'uno',
    'pinturillo',
    'chess',
    'checkers',
    'connect4',
  ];
  return allowed.includes(mapped as RoomGameInviteType)
    ? (mapped as RoomGameInviteType)
    : null;
}

export function loadCachedSavedRooms(): CloudSavedRoom[] {
  try {
    const raw = localStorage.getItem(SAVED_ROOMS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadSessionRoomPins(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(ROOM_PINS_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function checkIsNestedSandboxFrame(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
