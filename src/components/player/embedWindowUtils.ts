export type EmbedServerStatus = 'inline_ok' | 'window_required';

const EMBED_SERVER_STATUS_KEY = 'naim_embed_server_status_v1';

/**
 * Unwraps `/api/embed-proxy?url=...` into the direct provider HTTPS URL so
 * top-level external windows (`cineplayer`) and top-level iframes load the real
 * upstream embed page directly without proxy breakage.
 */
export function unwrapEmbedUrl(rawUrl: string): string {
  const input = (rawUrl || '').trim();
  if (!input) return '';
  try {
    if (
      input.startsWith('/api/embed-proxy') ||
      /^https?:\/\/[^/]+\/api\/embed-proxy/i.test(input)
    ) {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const parsed = new URL(input, origin);
      const inner = parsed.searchParams.get('url');
      if (inner && /^https?:\/\//i.test(inner)) {
        return inner;
      }
    }
  } catch {
    // fallback to rawUrl
  }
  return input;
}

/**
 * Normalizes a provider URL to its lowercase hostname (without `www.`) for
 * per-server localStorage persistence.
 */
export function getEmbedHostKey(rawUrl: string): string {
  const direct = unwrapEmbedUrl(rawUrl);
  if (!direct) return '';
  try {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const parsed = new URL(direct, origin);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return direct.slice(0, 64).toLowerCase();
  }
}

function readServerStatusMap(): Record<string, EmbedServerStatus> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(EMBED_SERVER_STATUS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getEmbedServerStatus(rawUrl: string): EmbedServerStatus | null {
  const host = getEmbedHostKey(rawUrl);
  if (!host) return null;
  const map = readServerStatusMap();
  const val = map[host];
  return val === 'inline_ok' || val === 'window_required' ? val : null;
}

export function setEmbedServerStatus(
  rawUrl: string,
  status: EmbedServerStatus
): void {
  if (typeof window === 'undefined') return;
  const host = getEmbedHostKey(rawUrl);
  if (!host) return;
  try {
    const map = readServerStatusMap();
    map[host] = status;
    window.localStorage.setItem(EMBED_SERVER_STATUS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Checks whether the current browser is running on a mobile / coarse-pointer
 * viewport where `window.open` opens an external tab instead of a popup window.
 */
export function isMobileExternalTabContext(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const coarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    );
    return coarse || mobileUa || window.innerWidth < 768;
  } catch {
    return false;
  }
}
