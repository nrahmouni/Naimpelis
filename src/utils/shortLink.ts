import {
  ALL_RESERVED_SLUGS,
  buildCanonicalShareUrl,
  parseAppRoute,
  PUBLIC_PRODUCTION_DOMAIN,
  resolveConfiguredPublicOrigin,
  type AppRouteTarget,
} from '../shared/dedicatedRoutes';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generates a compact, readable 4-character room code (e.g. "k8x4")
 * so invite links on riffan.ai.studio are ultra-short and never collide
 * with reserved dedicated routes.
 */
export function generateShortRoomCode(length = 4): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    let out = '';
    for (let i = 0; i < length; i++) {
      out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!ALL_RESERVED_SLUGS.has(out)) {
      return out;
    }
  }
  return `r${ALPHABET[Math.floor(Math.random() * ALPHABET.length)]}7x`;
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
  if (cleaned.length < 3 || ALL_RESERVED_SLUGS.has(cleaned)) {
    return '';
  }
  return cleaned;
}

/**
 * Reads room code and dedicated semantic link target from the browser URL.
 */
export function parseRoomFromWindow(): {
  roomId: string;
  isTvMode: boolean;
  isTvPairLobby: boolean;
  isAdsPage?: boolean;
  isAdminPage?: boolean;
  isSamsungPage?: boolean;
  isAuthBridgePage?: boolean;
  authBridgeSessionId?: string;
  gameType?: string;
  routeTarget: AppRouteTarget;
  isDedicatedEntry: boolean;
} {
  if (typeof window === 'undefined') {
    return {
      roomId: '',
      isTvMode: false,
      isTvPairLobby: false,
      isAdsPage: false,
      isAdminPage: false,
      isSamsungPage: false,
      isAuthBridgePage: false,
      routeTarget: { kind: 'home' },
      isDedicatedEntry: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const isTvMode = params.get('tv') === '1';
  const rawGame = params.get('game')?.trim().toLowerCase() || '';
  const gameType = /^[a-z0-9_-]{2,24}$/.test(rawGame) ? rawGame : undefined;

  const target = parseAppRoute(window.location.pathname, window.location.search);

  if (target.kind === 'system') {
    if (target.systemType === 'auth-bridge') {
      return {
        roomId: '',
        isTvMode: false,
        isTvPairLobby: false,
        isAdsPage: false,
        isAuthBridgePage: true,
        authBridgeSessionId: params.get('session')?.trim() || '',
        routeTarget: target,
        isDedicatedEntry: false,
      };
    }
    if (target.systemType === 'ads') {
      return {
        roomId: '',
        isTvMode: false,
        isTvPairLobby: false,
        isAdsPage: true,
        gameType,
        routeTarget: target,
        isDedicatedEntry: false,
      };
    }
    if (target.systemType === 'tv') {
      return {
        roomId: '',
        isTvMode: false,
        isTvPairLobby: true,
        isAdsPage: false,
        routeTarget: target,
        isDedicatedEntry: false,
      };
    }
    if (target.systemType === 'admin') {
      return {
        roomId: '',
        isTvMode: false,
        isTvPairLobby: false,
        isAdsPage: false,
        isAdminPage: true,
        isSamsungPage: false,
        routeTarget: target,
        isDedicatedEntry: false,
      };
    }
    if (target.systemType === 'samsung') {
      return {
        roomId: '',
        isTvMode: false,
        isTvPairLobby: false,
        isAdsPage: false,
        isAdminPage: false,
        isSamsungPage: true,
        routeTarget: target,
        isDedicatedEntry: false,
      };
    }
    return {
      roomId: '',
      isTvMode: false,
      isTvPairLobby: false,
      isAdsPage: false,
      isAdminPage: false,
      isSamsungPage: false,
      routeTarget: target,
      isDedicatedEntry: false,
    };
  }

  if (target.kind === 'room') {
    return {
      roomId: target.roomId,
      isTvMode: Boolean(target.isTvMode),
      isTvPairLobby: false,
      isAdsPage: false,
      gameType: target.gameType,
      routeTarget: target,
      isDedicatedEntry: false,
    };
  }

  const isDedicated = target.kind !== 'home';
  const attachedRoom = 'roomId' in target && target.roomId ? target.roomId : '';

  return {
    roomId: attachedRoom,
    isTvMode: Boolean(attachedRoom && isTvMode),
    isTvPairLobby: false,
    isAdsPage: false,
    gameType,
    routeTarget: target,
    isDedicatedEntry: isDedicated,
  };
}

/**
 * Parses either a raw code ("k8x4", "#k8x4") or a pasted full invite URL
 * ("https://riffan.ai.studio/k8x4").
 */
export function extractRoomCodeFromInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    if (
      /^https?:\/\//i.test(trimmed) ||
      trimmed.includes('riffan.') ||
      trimmed.includes('riffantv.') ||
      trimmed.includes('naimcine.')
    ) {
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const url = new URL(normalized);
      const qRoom = url.searchParams.get('room');
      if (qRoom) {
        const cleanQueryRoom = qRoom.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        return ALL_RESERVED_SLUGS.has(cleanQueryRoom) ? '' : cleanQueryRoom;
      }
      const parsed = parseAppRoute(url.pathname, url.search);
      return parsed.kind === 'room' ? parsed.roomId : '';
    }
  } catch {
    // fallback to plain code cleanup
  }

  const cleaned = trimmed
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '');
  return ALL_RESERVED_SLUGS.has(cleaned) ? '' : cleaned;
}

export { PUBLIC_PRODUCTION_DOMAIN };

/**
 * Returns true when running inside a private preview hostname that requires auth cookies.
 */
export function isPrivateDevPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname || '';
  return (
    /^(ais-dev-|ais-pre-)/i.test(host) ||
    /^localhost$/i.test(host) ||
    /^127\.0\.0\.1$/.test(host)
  );
}

export function resolvePublicLinkOrigin(): string {
  const envHost =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_PUBLIC_APP_HOST as string | undefined)
      : undefined;
  if (envHost && envHost.trim()) {
    return `https://${envHost.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`;
  }
  return resolveConfiguredPublicOrigin();
}

/**
 * Builds a clean, ultra-short invite URL (e.g. https://riffan.ai.studio/k8x4)
 */
export function buildShortInviteUrl(roomId: string, tvMode = false): string {
  if (!roomId?.trim()) {
    return buildCanonicalShareUrl({ kind: 'home' }, { origin: resolvePublicLinkOrigin() });
  }
  return buildCanonicalShareUrl(
    { kind: 'room', roomId, tvMode },
    { origin: resolvePublicLinkOrigin() }
  );
}

/**
 * Builds a direct invite link that opens the guest straight into the chosen game.
 */
export function buildGameInviteUrl(roomId: string, gameType: string): string {
  if (!roomId?.trim()) {
    return buildCanonicalShareUrl(
      { kind: 'game', gameId: gameType },
      { origin: resolvePublicLinkOrigin() }
    );
  }
  return buildCanonicalShareUrl(
    { kind: 'room', roomId, gameType },
    { origin: resolvePublicLinkOrigin() }
  );
}

/**
 * Builds the clean Smart TV 4-digit quick pairing URL using the active host or configured public host.
 */
export function buildTvPairingUrl(): string {
  return `${resolvePublicLinkOrigin()}/tv`;
}

/**
 * Returns the public host (without protocol) for UI display on phones & TVs.
 */
export function getDisplayAppHost(): string {
  const envHost =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_PUBLIC_APP_HOST as string | undefined)
      : undefined;
  if (envHost && envHost.trim()) {
    return envHost.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
  if (typeof window === 'undefined') return PUBLIC_PRODUCTION_DOMAIN;
  const host = (window.location.hostname || '').toLowerCase();
  if (host === PUBLIC_PRODUCTION_DOMAIN || host.endsWith(`.${PUBLIC_PRODUCTION_DOMAIN}`)) {
    return window.location.host || PUBLIC_PRODUCTION_DOMAIN;
  }
  return PUBLIC_PRODUCTION_DOMAIN;
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

