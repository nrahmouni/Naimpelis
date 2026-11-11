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
 * Reads room code from either clean short URL path (`/k8x4` or `/s/k8x4`),
 * legacy query parameter (`?room=k8x4`), or the Smart TV 4-digit pairing route (`/tv`).
 */
export function parseRoomFromWindow(): {
  roomId: string;
  isTvMode: boolean;
  isTvPairLobby: boolean;
} {
  if (typeof window === 'undefined') {
    return { roomId: '', isTvMode: false, isTvPairLobby: false };
  }

  const params = new URLSearchParams(window.location.search);
  const isTvMode = params.get('tv') === '1';

  const segments = window.location.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (
    params.get('tvpair') === '1' ||
    (segments.length === 1 && decodeURIComponent(segments[0]).toLowerCase() === 'tv')
  ) {
    return { roomId: '', isTvMode: false, isTvPairLobby: true };
  }

  const queryRoom = params.get('room')?.trim().toLowerCase();
  if (queryRoom && /^[a-z0-9-_]{2,32}$/.test(queryRoom)) {
    return { roomId: queryRoom, isTvMode, isTvPairLobby: false };
  }

  if (segments.length === 1) {
    const candidate = decodeURIComponent(segments[0]).toLowerCase();
    if (
      !candidate.includes('.') &&
      !RESERVED_PATH_SEGMENTS.has(candidate) &&
      /^[a-z0-9-_]{2,32}$/.test(candidate)
    ) {
      return { roomId: candidate, isTvMode, isTvPairLobby: false };
    }
  } else if (segments.length === 2 && (segments[0] === 's' || segments[0] === 'r')) {
    const candidate = decodeURIComponent(segments[1]).toLowerCase();
    if (!candidate.includes('.') && /^[a-z0-9-_]{2,32}$/.test(candidate)) {
      return { roomId: candidate, isTvMode, isTvPairLobby: false };
    }
  }

  return { roomId: '', isTvMode: false, isTvPairLobby: false };
}

/**
 * Parses either a raw code ("k8x4", "#k8x4") or a pasted full invite URL
 * ("https://naimcine.ai.studio/k8x4").
 */
export function extractRoomCodeFromInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    if (/^https?:\/\//i.test(trimmed) || trimmed.includes('naimcine.')) {
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const url = new URL(normalized);
      const qRoom = url.searchParams.get('room');
      if (qRoom) {
        return qRoom.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
      }
      const parts = url.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1] || '';
      const cleanLast = last.toLowerCase().replace(/[^a-z0-9-_]/g, '');
      return cleanLast === 'tv' ? '' : cleanLast;
    }
  } catch {
    // fallback to plain code cleanup
  }

  const cleaned = trimmed
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '');
  return cleaned === 'tv' ? '' : cleaned;
}

/**
 * Builds a clean, ultra-short invite URL (e.g. https://naimcine.ai.studio/k8x4)
 */
export function buildShortInviteUrl(roomId: string, tvMode = false): string {
  if (typeof window === 'undefined') return '';
  const cleanId = encodeURIComponent(roomId.trim().toLowerCase());
  const base = `${window.location.origin}/${cleanId}`;
  return tvMode ? `${base}?tv=1` : base;
}

const PUBLIC_PRODUCTION_DOMAIN = 'naimcine.ai.studio';

/**
 * Returns true when running inside the private AI Studio editor container (ais-dev-*),
 * which requires Google Sign-In and cannot be opened on external Smart TVs.
 */
export function isPrivateDevPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  return /^ais-dev-/i.test(window.location.hostname || '');
}

/**
 * Builds the clean Smart TV 4-digit quick pairing URL (never returning a private ais-dev login URL)
 */
export function buildTvPairingUrl(): string {
  if (typeof window === 'undefined') return `https://${PUBLIC_PRODUCTION_DOMAIN}/tv`;
  if (isPrivateDevPreviewHost()) {
    return `https://${PUBLIC_PRODUCTION_DOMAIN}/tv`;
  }
  return `${window.location.origin}/tv`;
}

/**
 * Returns the public host (without protocol) for UI display on phones & TVs
 */
export function getDisplayAppHost(): string {
  if (typeof window === 'undefined') return PUBLIC_PRODUCTION_DOMAIN;
  if (isPrivateDevPreviewHost()) {
    return PUBLIC_PRODUCTION_DOMAIN;
  }
  return window.location.host || PUBLIC_PRODUCTION_DOMAIN;
}

/**
 * Returns the clean public /tv URL without protocol (e.g. naimcine.ai.studio/tv)
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

