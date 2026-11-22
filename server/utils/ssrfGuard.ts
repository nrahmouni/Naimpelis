import dns from 'node:dns/promises';
import net from 'node:net';

export function isPrivateIpAddress(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!ip) return true;

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (net.isIPv4(mapped)) {
      return isPrivateIpAddress(mapped);
    }
    const hexMatch = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16);
      const lo = parseInt(hexMatch[2], 16);
      const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateIpAddress(v4);
    }
    return true;
  }

  const ver = net.isIP(ip);
  if (ver === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 169 && b === 254) return true; // link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (ver === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // ULA fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(ip) || ip.startsWith('fe80')) return true; // link-local fe80::/10
    if (/^fe[cdef][0-9a-f]:/.test(ip) || ip.startsWith('fec0')) return true; // deprecated site-local fec0::/10
    if (ip.startsWith('ff')) return true; // multicast
    if (ip.startsWith('64:ff9b:') || ip.startsWith('0064:ff9b:')) return true; // NAT64 RFC 6052 / RFC 8215
    if (ip.startsWith('100::') || ip.startsWith('0100::')) return true; // discard-only 100::/64
    if (ip.startsWith('2001:0:') || ip.startsWith('2001:0000:')) return true; // Teredo
    if (ip.startsWith('2001:db8:') || ip.startsWith('2001:0db8:')) return true; // documentation
    if (ip.startsWith('2001:2:') || ip.startsWith('2001:0002:')) return true; // benchmarking
    if (ip.startsWith('2002:')) return true; // 6to4 potentially wrapping private IPv4
    return false;
  }

  return true;
}

export const isPrivateOrMetadataIp = isPrivateIpAddress;
export const isPrivateOrMetadataIpv4 = isPrivateIpAddress;

export function isDisallowedHostnameSyntax(hostname: string): boolean {
  const low = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !low ||
    low === 'localhost' ||
    low.endsWith('.localhost') ||
    low.endsWith('.local') ||
    low.endsWith('.internal') ||
    low.endsWith('.arpa')
  ) {
    return true;
  }
  if (net.isIP(low)) {
    return isPrivateIpAddress(low);
  }
  return false;
}

const PUBLIC_DNS_HOST_CACHE = new Map<string, number>();
const PUBLIC_DNS_TTL_MS = 90_000;

export async function validateSafeOutboundUrl(
  rawUrl: string
): Promise<{ safe: true; url: URL } | { safe: false; status: number; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, status: 400, reason: 'Invalid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, status: 403, reason: 'Unsupported URL scheme' };
  }
  if (parsed.username || parsed.password) {
    return { safe: false, status: 403, reason: 'Credentials in URL are forbidden' };
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isDisallowedHostnameSyntax(host)) {
    return { safe: false, status: 403, reason: 'Forbidden private or local host' };
  }

  if (!net.isIP(host)) {
    const lowHost = host.toLowerCase();
    const cachedUntil = PUBLIC_DNS_HOST_CACHE.get(lowHost);
    if (cachedUntil && cachedUntil > Date.now()) {
      return { safe: true, url: parsed };
    }
    try {
      const records = await dns.lookup(host, { all: true });
      if (!records || records.length === 0) {
        return { safe: false, status: 403, reason: 'Unresolvable upstream host' };
      }
      for (const rec of records) {
        if (isPrivateIpAddress(rec.address)) {
          return { safe: false, status: 403, reason: 'Host resolves to private or disallowed IP' };
        }
      }
      if (PUBLIC_DNS_HOST_CACHE.size >= 500) {
        const firstKey = PUBLIC_DNS_HOST_CACHE.keys().next().value;
        if (firstKey) PUBLIC_DNS_HOST_CACHE.delete(firstKey);
      }
      PUBLIC_DNS_HOST_CACHE.set(lowHost, Date.now() + PUBLIC_DNS_TTL_MS);
    } catch {
      return { safe: false, status: 502, reason: 'DNS resolution failed for upstream host' };
    }
  }

  return { safe: true, url: parsed };
}

export async function assertSafeProxyUrl(rawUrl: string): Promise<URL> {
  const check = await validateSafeOutboundUrl(rawUrl);
  if (!check.safe) {
    const err = new Error(check.reason) as Error & { statusCode?: number };
    err.statusCode = check.status;
    throw err;
  }
  return check.url;
}

export async function safeFetchFollowingRedirects(
  initialUrl: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await validateSafeOutboundUrl(currentUrl);
    if (!check.safe) {
      const err = new Error(check.reason) as Error & { statusCode?: number };
      err.statusCode = check.status;
      throw err;
    }

    const res = await fetch(check.url.toString(), {
      ...init,
      redirect: 'manual',
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      void res.body?.cancel().catch(() => {});
      if (!location) {
        return { response: res, finalUrl: check.url.toString() };
      }
      currentUrl = new URL(location, check.url).toString();
      continue;
    }

    return { response: res, finalUrl: check.url.toString() };
  }

  const err = new Error('Too many redirects') as Error & { statusCode?: number };
  err.statusCode = 502;
  throw err;
}
