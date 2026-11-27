import { streamingFetch } from '../../utils/tlsFetch.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { detectStreamLanguage } from '../../utils/streamMetaParser.ts';
import { inferStreamQualityTag } from '../../../src/utils/channelQualityRanker.ts';
import { sanitizeProviderArtworkUrl } from './xtreamMultiProviderService.ts';
import type { ProviderCatalogItemPublic, ProviderMediaKind } from './xtreamProvidersTypes.ts';

const ADULT_RE = /\b(?:xxx|porn|adult|18\+|erotic|sex\s*tv|playboy|hustler|brazzers)\b/i;

export function isDisallowedAdultItem(name: string, categoryName: string): boolean {
  return ADULT_RE.test(`${name} ${categoryName}`);
}

export function sanitizeExtension(ext: unknown, fallback = 'mp4'): string {
  const clean = String(ext || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!clean || clean.length > 6) return fallback;
  return clean;
}

export function sanitizePublicImageUrl(raw: unknown): string {
  return sanitizeProviderArtworkUrl(raw);
}

export function extractYearHint(name: string, fallbackRaw?: unknown): string | undefined {
  const m = String(name || '').match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return m[1];
  const fb = String(fallbackRaw || '').match(/\b(19\d{2}|20\d{2})\b/);
  return fb ? fb[1] : undefined;
}

export function detectProviderItemLangAndQuality(
  name: string,
  categoryName: string,
  kind: ProviderMediaKind,
  ext?: string
): { lang: string; langLabel: string; quality: string; qualityTier: number } {
  const meta = detectStreamLanguage(name, categoryName, kind === 'series' ? 'series' : kind === 'movie' ? 'movie' : 'live');
  const q = inferStreamQualityTag(ext, `${name} ${categoryName}`);
  const langLabel =
    meta.lang === 'ES'
      ? 'Castellano'
      : meta.lang === 'LAT'
      ? 'Latino'
      : meta.lang === 'VOSE'
      ? 'VOSE'
      : meta.lang === 'EN'
      ? 'Inglés'
      : meta.lang;
  return {
    lang: meta.lang,
    langLabel,
    quality: q.label,
    qualityTier: q.tier,
  };
}

export function buildProviderStreamUrl(
  providerId: string,
  kind: 'live' | 'movie' | 'series',
  streamId: string,
  ext: string
): string {
  const pid = encodeURIComponent(providerId);
  const sid = encodeURIComponent(streamId);
  const cleanExt = sanitizeExtension(ext, kind === 'live' ? 'm3u8' : 'mp4');
  return `/api/providers/stream/${pid}/${kind}/${sid}.${cleanExt}`;
}

export async function fetchProviderJsonWithFallback(
  url: string,
  timeoutMs = 12_000,
  _opts?: { largeCatalog?: boolean }
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    await assertSafeProxyUrl(url);
    const resp = await streamingFetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'IPTVSmartersPlayer',
        Accept: 'application/json, text/plain, */*',
      },
      timeoutMs,
    });
    if (!resp.ok) {
      await resp.body?.cancel?.().catch(() => {});
      return { ok: false, status: resp.status, data: null };
    }
    const text = await resp.text();
    try {
      return { ok: true, status: resp.status, data: JSON.parse(text) };
    } catch {
      return { ok: false, status: resp.status, data: null };
    }
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

export async function fetchProviderPlaylistText(
  url: string,
  referer: string,
  timeoutMs = 3000
): Promise<{ text: string; baseUrl: string } | null> {
  try {
    await assertSafeProxyUrl(url);
    const resp = await streamingFetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'IPTVSmartersPlayer',
        Accept: '*/*',
        Referer: referer,
      },
      timeoutMs,
    });
    if (!resp.ok) {
      await resp.body?.cancel?.().catch(() => {});
      return null;
    }
    const text = await resp.text();
    if (!text.includes('#EXTM3U')) return null;
    return { text, baseUrl: resp.url || url };
  } catch {
    return null;
  }
}

const fallbackOpaqueTokenStore = new Map<string, { url: string; referer: string; ts: number }>();

export function rewriteProviderPlaylistWithOpaqueTokens(
  text: string,
  baseUrl: string,
  referer: string,
  originPrefix: string,
  opaqueTokenStore: Map<string, { url: string; referer: string; ts: number }> = fallbackOpaqueTokenStore
): string {
  const now = Date.now();
  const lines = String(text || '').split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) {
      out.push(line);
      continue;
    }
    try {
      const absUrl = new URL(t, baseUrl).href;
      const token = Buffer.from(`${now}:${absUrl}`).toString('base64url').slice(0, 48);
      opaqueTokenStore.set(token, { url: absUrl, referer, ts: now });
      out.push(`${originPrefix}/api/providers/seg/${token}.ts`);
    } catch {
      out.push(line);
    }
  }
  return out.join('\n');
}

export interface ParsedM3uEntry {
  streamId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  poster: string;
  ext: string;
}

export function parseM3uPlusIntoCatalog(text: string): {
  live: ParsedM3uEntry[];
  movies: ParsedM3uEntry[];
} {
  const live: ParsedM3uEntry[] = [];
  const movies: ParsedM3uEntry[] = [];
  const lines = String(text || '').split(/\r?\n/);
  let currentName = '';
  let currentCat = 'General';
  let currentLogo = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const comma = line.indexOf(',');
      currentName = comma >= 0 ? line.slice(comma + 1).trim() : 'Canal';
      const grp = line.match(/group-title="([^"]*)"/i);
      currentCat = grp?.[1]?.trim() || 'General';
      const logo = line.match(/tvg-logo="([^"]*)"/i);
      currentLogo = logo?.[1]?.trim() || '';
      continue;
    }
    if (line.startsWith('#')) continue;
    const isMovie = /\/movie\//i.test(line);
    const idMatch = line.match(/\/([^/?.]+)(?:\.([a-z0-9]{2,5}))?(?:\?.*)?$/i);
    if (!idMatch) continue;
    const entry: ParsedM3uEntry = {
      streamId: idMatch[1],
      name: currentName || idMatch[1],
      categoryId: currentCat.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'general',
      categoryName: currentCat,
      poster: sanitizePublicImageUrl(currentLogo),
      ext: sanitizeExtension(idMatch[2], isMovie ? 'mp4' : 'm3u8'),
    };
    if (isMovie) movies.push(entry);
    else live.push(entry);
  }
  return { live, movies };
}

export function sortCatalogItemsForDisplay(
  items: ProviderCatalogItemPublic[]
): ProviderCatalogItemPublic[] {
  return [...items].sort((a, b) => {
    const langA = a.lang === 'ES' ? 0 : a.lang === 'LAT' ? 1 : 2;
    const langB = b.lang === 'ES' ? 0 : b.lang === 'LAT' ? 1 : 2;
    if (langA !== langB) return langA - langB;
    return a.qualityTier - b.qualityTier;
  });
}
