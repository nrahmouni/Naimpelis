import dns from 'dns';
import net from 'net';
import { LruTtlCache } from './lruCache.ts';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
]);

// Cache validated public hostnames for 60s so high-throughput TS segment proxying has near-zero DNS overhead
const validatedPublicHostCache = new LruTtlCache<string, boolean>(500, 60_000);

export function isPrivateOrMetadataIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 ("this host")
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918 private)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918 private)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918 private)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT / internal VPC)
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export function isPrivateOrMetadataIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!ip) return true;

  if (net.isIPv4(ip)) {
    return isPrivateOrMetadataIpv4(ip);
  }

  if (net.isIPv6(ip)) {
    // Handle IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1 or ::ffff:169.254.169.254
    const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4Mapped) {
      return isPrivateOrMetadataIpv4(v4Mapped[1]);
    }
    if (ip === '::' || ip === '::1') return true; // unspecified / loopback
    if (ip.startsWith('fe80:')) return true; // link-local
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // ULA fc00::/7
    if (ip.startsWith('ff')) return true; // multicast
    return false;
  }

  return true;
}

export async function assertSafeProxyUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL inválida');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Protocolo no permitido');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw new Error('Destino privado o de metadatos bloqueado');
  }

  // Literal IP (e.g. TDT 90.163.85.113:8093 passes immediately; 127.0.0.1 / 169.254.169.254 / 10.x blocked)
  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrMetadataIp(hostname)) {
      throw new Error(`IP privada o reservada bloqueada: ${hostname}`);
    }
    return parsed;
  }

  if (validatedPublicHostCache.get(hostname)) {
    return parsed;
  }

  try {
    const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    for (const rec of records) {
      if (isPrivateOrMetadataIp(rec.address)) {
        throw new Error(`Resolución DNS hacia red privada bloqueada: ${hostname}`);
      }
    }
    if (records.length > 0) {
      validatedPublicHostCache.set(hostname, true);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('bloquead')) {
      throw err;
    }
    // Transient DNS lookup glitches must not break public CDN retries unless explicit private hostname
  }

  return parsed;
}
