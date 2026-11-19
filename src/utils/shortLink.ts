const RESERVED_PATH_SEGMENTS = new Set([
  'api',
  'assets',
  'src',
  'public',
  'dist',
  'ws',
  'favicon',
  'manifest',
  'tv',
  'kids',
  'riffankids',
  'riffan-kids',
  'ads',
  'naimcine-ads',
  'auth-bridge',
]);

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generates a compact, readable 4-character room code (e.g. "k8x4")
 * so invite links on naimcine.ai.studio are ultra-short:
 * https://naimcine.ai.studio/k8x4
 */
export function generateShortRoomCode(length = 4): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Normalizes a user-chosen room slug (e.g. "Cine Viernes!" -> "cine-viernes")
 * matching short URL routes, WS validation, and Firestore savedRooms rules.
 */
export function normalizeCustomRoomSlug(raw: string): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  if (cleaned.length < 3 || RESERVED_PATH_SEGMENTS.has(cleaned)) {
    return '';
  }
  return cleaned;
}

/**
 * Reads room code from either clean short URL path (`/k8x4` or `/s/k8x4`),
 * legacy query parameter (`?room=k8x4`), Smart TV route (`/tv`), or promo page (`/ads`).
 */
export function parseRoomFromWindow(): {
  roomId: string;
  isTvMode: boolean;
  isTvPairLobby: boolean;
  isKidsMode: boolean;
  isAdsPage?: boolean;
  isAuthBridgePage?: boolean;
  authBridgeSessionId?: string;
  gameType?: string;
} {
  if (typeof window === 'undefined') {
    return {
      roomId: '',
      isTvMode: false,
      isTvPairLobby: false,
      isKidsMode: false,
      isAdsPage: false,
      isAuthBridgePage: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const isTvMode = params.get('tv') === '1';
  const rawGame = params.get('game')?.trim().toLowerCase() || '';
  const gameType = /^[a-z0-9_-]{2,24}$/.test(rawGame) ? rawGame : undefined;

  const segments = window.location.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  const firstSegment = segments.length === 1 ? decodeURIComponent(segments[0]).toLowerCase() : '';

  if (
    params.get('authbridge') === '1' ||
    firstSegment === 'auth-bridge'
  ) {
    return {
      roomId: '',
      isTvMode: false,
      isTvPairLobby: false,
      isKidsMode: false,
      isAdsPage: false,
      isAuthBridgePage: true,
      authBridgeSessionId: params.get('session')?.trim() || '',
    };
  }

  if (
    params.get('ads') === '1' ||
    firstSegment === 'ads' ||
    firstSegment === 'naimcine-ads'
  ) {
    return {
      roomId: '',
      isTvMode: false,
      isTvPairLobby: false,
      isKidsMode: false,
      isAdsPage: true,
      gameType,
    };
  }

  if (
    params.get('kids') === '1' ||
    firstSegment === 'kids' ||
    firstSegment === 'riffankids' ||
    firstSegment === 'riffan-kids'
  ) {
    return {
      roomId: '',
      isTvMode: false,
      isTvPairLobby: false,
      isKidsMode: true,
      isAdsPage: false,
      gameType,
    };
  }

  if (params.get('tvpair') === '1' || firstSegment === 'tv') {
    return {
      roomId: '',
      isTvMode: false,
      isTvPairLobby: true,
      isKidsMode: false,
      isAdsPage: false,
    };
  }

  const queryRoom = params.get('room')?.trim().toLowerCase();
  if (queryRoom && /^[a-z0-9-_]{2,32}$/.test(queryRoom)) {
    return {
      roomId: queryRoom,
      isTvMode,
      isTvPairLobby: false,
      isKidsMode: false,
      isAdsPage: false,
      gameType,
    };
  }

  if (segments.length === 1) {
    if (
      !firstSegment.includes('.') &&
      !RESERVED_PATH_SEGMENTS.has(firstSegment) &&
      /^[a-z0-9-_]{2,32}$/.test(firstSegment)
    ) {
      return {
        roomId: firstSegment,
        isTvMode,
        isTvPairLobby: false,
        isKidsMode: false,
        isAdsPage: false,
        gameType,
      };
    }
  } else if (segments.length === 2 && (segments[0] === 's' || segments[0] === 'r')) {
    const candidate = decodeURIComponent(segments[1]).toLowerCase();
    if (!candidate.includes('.') && /^[a-z0-9-_]{2,32}$/.test(candidate)) {
      return {
        roomId: candidate,
        isTvMode,
        isTvPairLobby: false,
        isKidsMode: false,
        isAdsPage: false,
        gameType,
      };
    }
  }

  return {
    roomId: '',
    isTvMode: false,
    isTvPairLobby: false,
    isKidsMode: false,
    isAdsPage: false,
    gameType,
  };
}

/**
 * Parses either a raw code ("k8x4", "#k8x4") or a pasted full invite URL
 * ("https://riffantv.ai.studio/k8x4").
 */
export function extractRoomCodeFromInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    if (
      /^https?:\/\//i.test(trimmed) ||
      trimmed.includes('riffantv.') ||
      trimmed.includes('naimcine.')
    ) {
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const url = new URL(normalized);
      const qRoom = url.searchParams.get('room');
      if (qRoom) {
        return qRoom.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
      }
      const parts = url.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1] || '';
      const cleanLast = last.toLowerCase().replace(/[^a-z0-9-_]/g, '');
      return RESERVED_PATH_SEGMENTS.has(cleanLast) ? '' : cleanLast;
    }
  } catch {
    // fallback to plain code cleanup
  }

  const cleaned = trimmed
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '');
  return RESERVED_PATH_SEGMENTS.has(cleaned) ? '' : cleaned;
}

/**
 * Builds a clean, ultra-short invite URL (e.g. https://riffantv.ai.studio/k8x4)
 */
export function buildShortInviteUrl(roomId: string, tvMode = false): string {
  if (typeof window === 'undefined') return '';
  const cleanId = encodeURIComponent(roomId.trim().toLowerCase());
  const base = `${window.location.origin}/${cleanId}`;
  return tvMode ? `${base}?tv=1` : base;
}

/**
 * Builds a direct invite link that opens the guest straight into the chosen game.
 */
export function buildGameInviteUrl(roomId: string, gameType: string): string {
  if (typeof window === 'undefined') return '';
  const cleanId = encodeURIComponent(roomId.trim().toLowerCase());
  const cleanGame = encodeURIComponent(gameType.trim().toLowerCase());
  return `${window.location.origin}/${cleanId}?game=${cleanGame}`;
}

export const PUBLIC_PRODUCTION_DOMAIN =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_PUBLIC_APP_HOST as string | undefined)) ||
  'riffantv.ai.studio';

/**
 * Returns true when running inside a private preview hostname that requires auth cookies.
 */
export function isPrivateDevPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  return /^ais-dev-/i.test(window.location.hostname || '');
}

function resolvePublicLinkOrigin(): string {
  if (typeof window === 'undefined' || isPrivateDevPreviewHost()) {
    return `https://${PUBLIC_PRODUCTION_DOMAIN}`;
  }
  return window.location.origin || `https://${PUBLIC_PRODUCTION_DOMAIN}`;
}

/**
 * Builds the clean Smart TV 4-digit quick pairing URL using the active host or configured public host.
 */
export function buildTvPairingUrl(): string {
  return `${resolvePublicLinkOrigin()}/tv`;
}

export function buildKidsUrl(): string {
  return `${resolvePublicLinkOrigin()}/kids`;
}

/**
 * Returns the public host (without protocol) for UI display on phones & TVs.
 */
export function getDisplayAppHost(): string {
  if (typeof window === 'undefined') return PUBLIC_PRODUCTION_DOMAIN;
  if (isPrivateDevPreviewHost()) {
    return PUBLIC_PRODUCTION_DOMAIN;
  }
  return window.location.host || PUBLIC_PRODUCTION_DOMAIN;
}

/**
 * Returns the clean public /tv path label without protocol.
 */
export function getDisplayTvPairingLabel(): string {
  return `${getDisplayAppHost()}/tv`;
}

/**
 * Detects Samsung Tizen Browser, LG webOS, Android TV, Vidaa, Viera & Sony Bravia browsers
 */
export function isSmartTvBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /SMART-TV|SmartTV|Tizen|Web0S|WebOS|NetCast|BRAVIA|Viera|VIDAA|HbbTV|AFTB|AFTT|AFTM|GoogleTV/i.test(
    ua
  );
}

export function buildEpgXmlUrl(download = false): string {
  const base = `${resolvePublicLinkOrigin()}/epg.xml`;
  return download ? `${base}?download=1` : base;
}

export function buildM3uPlaylistUrl(download = false): string {
  const base = `${resolvePublicLinkOrigin()}/riffantv.m3u`;
  return download ? `${base}?download=1` : base;
}

export function buildM3uTvPlayerUrl(): string {
  return `${resolvePublicLinkOrigin()}/tv`;
}

