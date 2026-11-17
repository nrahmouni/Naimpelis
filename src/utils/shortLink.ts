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
  'ads',
  'naimcine-ads',
]);

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generates a compact, readable 4-character room code (e.g. "k8x4")
 * so invite links on riffantv.ai.studio are ultra-short:
 * https://riffantv.ai.studio/k8x4
 */
export function generateShortRoomCode(length = 4): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Reads room code from either clean short URL path (`/k8x4` or `/s/k8x4`),
 * legacy query parameter (`?room=k8x4`), Smart TV route (`/tv`), Kids route (`/kids`), or promo page (`/ads`).
 */
export function parseRoomFromWindow(): {
  roomId: string;
  isTvMode: boolean;
  isTvPairLobby: boolean;
  isKidsMode?: boolean;
  isAdsPage?: boolean;
  gameType?: string;
} {
  if (typeof window === 'undefined') {
    return { roomId: '', isTvMode: false, isTvPairLobby: false, isKidsMode: false, isAdsPage: false };
  }

  const params = new URLSearchParams(window.location.search);
  const isTvMode = params.get('tv') === '1';
  const rawGame = params.get('game')?.trim().toLowerCase() || '';
  const gameType = /^[a-z0-9_-]{2,24}$/.test(rawGame) ? rawGame : undefined;

  const segments = window.location.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (
    params.get('ads') === '1' ||
    (segments.length === 1 &&
      (decodeURIComponent(segments[0]).toLowerCase() === 'ads' ||
        decodeURIComponent(segments[0]).toLowerCase() === 'naimcine-ads'))
  ) {
    return { roomId: '', isTvMode: false, isTvPairLobby: false, isKidsMode: false, isAdsPage: true, gameType };
  }

  if (
    params.get('kids') === '1' ||
    (segments.length === 1 &&
      (decodeURIComponent(segments[0]).toLowerCase() === 'kids' ||
        decodeURIComponent(segments[0]).toLowerCase() === 'riffankids'))
  ) {
    return { roomId: '', isTvMode: false, isTvPairLobby: false, isKidsMode: true, isAdsPage: false, gameType };
  }

  if (
    params.get('tvpair') === '1' ||
    (segments.length === 1 && decodeURIComponent(segments[0]).toLowerCase() === 'tv')
  ) {
    return { roomId: '', isTvMode: false, isTvPairLobby: true, isKidsMode: false, isAdsPage: false };
  }

  const queryRoom = params.get('room')?.trim().toLowerCase();
  if (queryRoom && /^[a-z0-9-_]{2,32}$/.test(queryRoom)) {
    return { roomId: queryRoom, isTvMode, isTvPairLobby: false, isKidsMode: false, isAdsPage: false, gameType };
  }

  if (segments.length === 1) {
    const candidate = decodeURIComponent(segments[0]).toLowerCase();
    if (
      !candidate.includes('.') &&
      !RESERVED_PATH_SEGMENTS.has(candidate) &&
      /^[a-z0-9-_]{2,32}$/.test(candidate)
    ) {
      return { roomId: candidate, isTvMode, isTvPairLobby: false, isKidsMode: false, isAdsPage: false, gameType };
    }
  } else if (segments.length === 2 && (segments[0] === 's' || segments[0] === 'r')) {
    const candidate = decodeURIComponent(segments[1]).toLowerCase();
    if (!candidate.includes('.') && /^[a-z0-9-_]{2,32}$/.test(candidate)) {
      return { roomId: candidate, isTvMode, isTvPairLobby: false, isKidsMode: false, isAdsPage: false, gameType };
    }
  }

  return { roomId: '', isTvMode: false, isTvPairLobby: false, isKidsMode: false, isAdsPage: false, gameType };
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
      return cleanLast === 'tv' || cleanLast === 'kids' ? '' : cleanLast;
    }
  } catch {
    // fallback to plain code cleanup
  }

  const cleaned = trimmed
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '');
  return cleaned === 'tv' || cleaned === 'kids' ? '' : cleaned;
}

/**
 * Builds a clean, ultra-short invite URL (e.g. https://riffantv.ai.studio/k8x4)
 */
export function buildShortInviteUrl(roomId: string, tvMode = false): string {
  if (typeof window === 'undefined') return '';
  const cleanId = encodeURIComponent(roomId.trim().toLowerCase());
  const base = `${getPublicOriginForDisplay()}/${cleanId}`;
  return tvMode ? `${base}?tv=1` : base;
}

/**
 * Builds a direct invite link that opens the guest straight into the chosen game.
 */
export function buildGameInviteUrl(roomId: string, gameType: string): string {
  if (typeof window === 'undefined') return '';
  const cleanId = encodeURIComponent(roomId.trim().toLowerCase());
  const cleanGame = encodeURIComponent(gameType.trim().toLowerCase());
  return `${getPublicOriginForDisplay()}/${cleanId}?game=${cleanGame}`;
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

/**
 * Returns the clean public https origin for UI copy/paste instructions
 * (prefers https://riffantv.ai.studio over private ais-dev preview URLs).
 */
export function getPublicOriginForDisplay(): string {
  if (typeof window === 'undefined') return `https://${PUBLIC_PRODUCTION_DOMAIN}`;
  if (isPrivateDevPreviewHost()) {
    return `https://${PUBLIC_PRODUCTION_DOMAIN}`;
  }
  return window.location.origin || `https://${PUBLIC_PRODUCTION_DOMAIN}`;
}

/**
 * Builds the clean Smart TV 4-digit quick pairing URL using the active host or configured public host.
 */
export function buildTvPairingUrl(): string {
  return `${getPublicOriginForDisplay()}/tv`;
}

/**
 * Builds the clean Riffan Kids URL (/kids).
 */
export function buildKidsUrl(): string {
  return `${getPublicOriginForDisplay()}/kids`;
}

/**
 * Builds the IPTV M3U playlist URL & EPG XML URL for Smart TV apps.
 */
export function buildM3uPlaylistUrl(download = false): string {
  const base = `${getPublicOriginForDisplay()}/riffantv.m3u`;
  return download ? `${base}?download=1` : base;
}

export function buildEpgXmlUrl(download = false): string {
  const base = `${getPublicOriginForDisplay()}/epg.xml`;
  return download ? `${base}?download=1` : base;
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

