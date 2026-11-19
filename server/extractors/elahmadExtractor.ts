/**
 * @module server/extractors/elahmadExtractor
 * @description Elahmad TV (elahmad.ru/tv/mobile-live-stream/) dynamic live HLS extractor.
 * Decrypts AES-256-CBC `arabic-tv-online.php` & `bein_tv.php` tokenized streams, discovers live
 * category channels (Morocco, Algeria, Egypt, MBC, Rotana, Kids, Arabic Sports), and caches URLs.
 */
import crypto from 'crypto';
import { LruTtlCache } from '../utils/lruCache.ts';
import { curlGetText } from './httpHelpers.ts';

const ELAHMAD_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const ELAHMAD_AES_KEY = Buffer.from('acf40de1dddb1addf66721d1ecfbc5d7', 'utf8');
const ELAHMAD_AES_IV = Buffer.from('b138591ee8715ee0', 'utf8');

export interface ElahmadResolvedStream {
  streamUrl: string;
  referer: string;
  isYoutube?: boolean;
  youtubeId?: string;
}

export interface ElahmadDirectoryChannel {
  id: string;
  elahmadId: string;
  category: string;
  name: string;
  pageUrl: string;
}

const elahmadStreamCache = new LruTtlCache<string, ElahmadResolvedStream>(250, 3 * 60 * 1000);
const elahmadDirectoryCache = new LruTtlCache<string, ElahmadDirectoryChannel[]>(
  40,
  20 * 60 * 1000
);

export function isElahmadUrl(rawUrl: string): boolean {
  return /elahmad\.ru\/tv\//i.test(String(rawUrl || ''));
}

export function decryptElahmadAesPayload(base64Payload: string): string {
  const clean = String(base64Payload || '').trim();
  if (!clean) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', ELAHMAD_AES_KEY, ELAHMAD_AES_IV);
    let decrypted = decipher.update(clean, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted.trim();
  } catch {
    return '';
  }
}

export function parseElahmadDaTaObject(html: string): Record<string, string> | null {
  const match = String(html || '').match(/da_ta\s*=\s*(\{[\s\S]*?\})\s*;/i);
  if (!match) return null;
  const objBody = match[1];
  const result: Record<string, string> = {};
  const pairRegex = /["']([^"']+)["']\s*:\s*["']([^"']*)["']/g;
  let pair: RegExpExecArray | null;
  while ((pair = pairRegex.exec(objBody)) !== null) {
    result[pair[1]] = pair[2];
  }
  return Object.keys(result).length > 0 ? result : null;
}

function normalizeElahmadPageUrl(rawUrl: string): string {
  const s = String(rawUrl || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('/')) return `https://www.elahmad.ru${s}`;
  return `https://www.elahmad.ru/tv/arabic-tv-online.php?id=${encodeURIComponent(s)}`;
}

async function postElahmadDaTa(
  postUrl: string,
  refererUrl: string,
  payload: Record<string, string>
): Promise<{ link_1?: string; link_4?: string } | null> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    body.set(k, v);
  }
  const resp = await fetch(postUrl, {
    method: 'POST',
    headers: {
      'User-Agent': ELAHMAD_MOBILE_UA,
      Referer: refererUrl,
      Origin: 'https://www.elahmad.ru',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(6500),
  });
  if (!resp.ok) return null;
  const text = await resp.text();
  if (!text.trim().startsWith('{')) return null;
  return JSON.parse(text) as { link_1?: string; link_4?: string };
}

export async function resolveElahmadChannelToHls(
  rawSourceUrl: string
): Promise<ElahmadResolvedStream | null> {
  const pageUrl = normalizeElahmadPageUrl(rawSourceUrl);
  if (!pageUrl) return null;

  const cached = elahmadStreamCache.get(pageUrl);
  if (cached) return cached;

  try {
    const pageHeaders = {
      'User-Agent': ELAHMAD_MOBILE_UA,
      Referer: 'https://www.elahmad.ru/tv/mobile-live-stream/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    let html = '';
    try {
      const r = await fetch(pageUrl, { headers: pageHeaders, signal: AbortSignal.timeout(6500) });
      if (r.ok) html = await r.text();
    } catch {
      // fallback to curlGetText below
    }
    if (!html) {
      const fb = await curlGetText(pageUrl, pageHeaders, 6).catch(() => ({ text: '' }));
      html = fb.text;
    }
    if (!html) return null;

    // 1. Check direct embedded YouTube ID (e.g. kids_tv / youtube_live handlers)
    const ytMatch = html.match(
      /(?:youtube\.com\/embed\/|youtube_id\s*[:=]\s*["'])([a-zA-Z0-9_-]{11})/i
    );
    if (ytMatch && /youtube\.php/i.test(pageUrl)) {
      const ytRes: ElahmadResolvedStream = {
        streamUrl: ytMatch[1],
        referer: pageUrl,
        isYoutube: true,
        youtubeId: ytMatch[1],
      };
      elahmadStreamCache.set(pageUrl, ytRes);
      return ytRes;
    }

    // 2. Decrypt `da_ta` POST endpoint (arabic-tv-online.php / bein_tv.php)
    // CRITICAL: POST must hit pathname WITHOUT `?id=...` query string
    const daTa = parseElahmadDaTaObject(html);
    if (daTa) {
      const parsed = new URL(pageUrl);
      const postTarget = `${parsed.origin}${parsed.pathname}`;
      const json = await postElahmadDaTa(postTarget, pageUrl, daTa);
      const encrypted = json?.link_1 || json?.link_4 || '';
      if (encrypted) {
        const decrypted = decryptElahmadAesPayload(encrypted);
        if (
          /^https?:\/\//i.test(decrypted) &&
          !/\/tv\/playlist\.m3u8$/i.test(decrypted)
        ) {
          const out: ElahmadResolvedStream = {
            streamUrl: decrypted,
            referer: 'https://www.elahmad.ru/',
          };
          elahmadStreamCache.set(pageUrl, out);
          return out;
        }
      }
    }

    // 3. Direct embedded m3u8 fallback in page HTML (excluding fake geo placeholder)
    const directM3u8 = html.match(
      /https?:\/\/(?!raw\.githubusercontent\.com\/elahmad\/geo)[^"'\s<>]+\.m3u8[^"'\s<>]*/i
    );
    if (directM3u8) {
      const out: ElahmadResolvedStream = {
        streamUrl: directM3u8[0],
        referer: 'https://www.elahmad.ru/',
      };
      elahmadStreamCache.set(pageUrl, out);
      return out;
    }
  } catch {
    // non-fatal
  }
  return null;
}

export async function fetchElahmadCategoryDirectory(
  category: string
): Promise<ElahmadDirectoryChannel[]> {
  const cleanCat = String(category || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
  if (!cleanCat) return [];

  const cached = elahmadDirectoryCache.get(cleanCat);
  if (cached) return cached;

  const url = `https://www.elahmad.ru/tv/mobile-live-stream/?id=${encodeURIComponent(cleanCat)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': ELAHMAD_MOBILE_UA,
        Referer: 'https://www.elahmad.ru/tv/mobile-live-stream/',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const buf = Buffer.from(await res.arrayBuffer());
    const html = new TextDecoder('windows-1256').decode(buf);

    const channels: ElahmadDirectoryChannel[] = [];
    const seenIds = new Set<string>();
    const linkRegex =
      /href=["'](\/tv\/arabic-tv-online\.php\?id=([^"'&]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      const elahmadId = String(m[2] || '').trim();
      const name = String(m[3] || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!elahmadId || !name || seenIds.has(elahmadId)) continue;
      seenIds.add(elahmadId);
      channels.push({
        id: `elahmad-${elahmadId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`,
        elahmadId,
        category: cleanCat,
        name,
        pageUrl: `https://www.elahmad.ru${m[1]}`,
      });
    }

    if (channels.length > 0) {
      elahmadDirectoryCache.set(cleanCat, channels);
    }
    return channels;
  } catch {
    return [];
  }
}
