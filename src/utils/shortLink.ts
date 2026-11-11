const RESERVED_PATH_SEGMENTS = new Set([
  'api',
  'assets',
  'src',
  'public',
  'dist',
  'ws',
  'favicon',
  'manifest',
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
 * Reads room code from either clean short URL path (`/k8x4` or `/s/k8x4`)
 * or legacy query parameter (`?room=k8x4`).
 */
export function parseRoomFromWindow(): { roomId: string; isTvMode: boolean } {
  if (typeof window === 'undefined') {
    return { roomId: '', isTvMode: false };
  }

  const params = new URLSearchParams(window.location.search);
  const isTvMode = params.get('tv') === '1';

  const queryRoom = params.get('room')?.trim().toLowerCase();
  if (queryRoom && /^[a-z0-9-_]{2,32}$/.test(queryRoom)) {
    return { roomId: queryRoom, isTvMode };
  }

  const segments = window.location.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 1) {
    const candidate = decodeURIComponent(segments[0]).toLowerCase();
    if (
      !candidate.includes('.') &&
      !RESERVED_PATH_SEGMENTS.has(candidate) &&
      /^[a-z0-9-_]{2,32}$/.test(candidate)
    ) {
      return { roomId: candidate, isTvMode };
    }
  } else if (segments.length === 2 && (segments[0] === 's' || segments[0] === 'r')) {
    const candidate = decodeURIComponent(segments[1]).toLowerCase();
    if (!candidate.includes('.') && /^[a-z0-9-_]{2,32}$/.test(candidate)) {
      return { roomId: candidate, isTvMode };
    }
  }

  return { roomId: '', isTvMode };
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
      return last.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    }
  } catch {
    // fallback to plain code cleanup
  }

  return trimmed
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '');
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
