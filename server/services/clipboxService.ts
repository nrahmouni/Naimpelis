import { LruTtlCache } from '../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA } from '../extractors/httpHelpers.ts';
import {
  parseClipboxInventory,
  type ClipboxHostEntry,
} from './clipbox/clipboxParser.ts';
export {
  resolveClipboxTitleStreams,
  searchClipboxCatalog,
  type ClipboxPlayerTrack,
  type ClipboxSearchItem,
  type ClipboxSearchScope,
  type ClipboxTitleStreamsResult,
} from './clipbox/clipboxCatalogService.ts';

export interface ClipboxProbeResult {
  host: string;
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  contentType: string;
  error?: string;
}

const probeCache = new LruTtlCache<string, ClipboxProbeResult>(500, 2 * 60 * 1000);

function getAllowedClipboxHostSet(): Set<string> {
  const inv = parseClipboxInventory();
  const set = new Set<string>();
  for (const h of inv.hosts) {
    if (h.probeAllowed) {
      set.add(h.host.toLowerCase());
      for (const u of h.urls) {
        try {
          set.add(new URL(u).hostname.toLowerCase());
        } catch {
          // ignore
        }
      }
    }
  }
  return set;
}

export async function probeClipboxUrl(targetInput: {
  host?: string;
  url?: string;
}): Promise<ClipboxProbeResult> {
  const inv = parseClipboxInventory();
  const allowedHosts = getAllowedClipboxHostSet();

  let targetUrl = String(targetInput.url || '').trim();
  const requestedHost = String(targetInput.host || '').trim().toLowerCase();

  if (!targetUrl && requestedHost) {
    const matched = inv.hosts.find((h) => h.host.toLowerCase() === requestedHost);
    if (!matched) {
      return {
        host: requestedHost,
        url: '',
        ok: false,
        status: 400,
        latencyMs: 0,
        finalUrl: '',
        contentType: '',
        error: 'Host no pertenece al inventario ClipBox',
      };
    }
    if (!matched.probeAllowed) {
      return {
        host: matched.host,
        url: matched.urls[0] || '',
        ok: false,
        status: 403,
        latencyMs: 0,
        finalUrl: '',
        contentType: '',
        error: 'Host técnico o local excluido de comprobación remota',
      };
    }
    targetUrl = matched.urls.find((u) => /^https?:\/\/[a-z0-9]/i.test(u)) || `https://${matched.host}`;
  }

  if (!targetUrl) {
    return {
      host: requestedHost,
      url: '',
      ok: false,
      status: 400,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: 'URL o host requerido',
    };
  }

  let parsed: URL;
  try {
    parsed = await assertSafeProxyUrl(targetUrl);
  } catch (err) {
    return {
      host: requestedHost || targetUrl,
      url: targetUrl,
      ok: false,
      status: 403,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: err instanceof Error ? err.message : 'Destino bloqueado',
    };
  }

  const hostLower = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(hostLower) && !allowedHosts.has(`www.${hostLower}`)) {
    return {
      host: hostLower,
      url: targetUrl,
      ok: false,
      status: 403,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: 'Solo se permite comprobar hosts presentes en ClipBox',
    };
  }

  const cached = probeCache.get(targetUrl);
  if (cached) return cached;

  const t0 = Date.now();
  try {
    let res = await streamingFetch(targetUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/json,*/*;q=0.8',
      },
      timeoutMs: 4200,
    });
    if (res.status === 405 || res.status === 501) {
      res = await streamingFetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': CHROME_UA,
          Range: 'bytes=0-1023',
          Accept: 'text/html,application/json,*/*;q=0.8',
        },
        timeoutMs: 4200,
      });
    }
    const latencyMs = Date.now() - t0;
    const status = res.status;
    const ok = status >= 200 && status < 400;
    const result: ClipboxProbeResult = {
      host: hostLower,
      url: targetUrl,
      ok,
      status,
      latencyMs,
      finalUrl: res.url || targetUrl,
      contentType: String(res.headers.get('content-type') || '').split(';')[0],
    };
    probeCache.set(targetUrl, result);
    return result;
  } catch (err) {
    const result: ClipboxProbeResult = {
      host: hostLower,
      url: targetUrl,
      ok: false,
      status: 0,
      latencyMs: Date.now() - t0,
      finalUrl: targetUrl,
      contentType: '',
      error: err instanceof Error ? err.message : 'Timeout o error de red',
    };
    probeCache.set(targetUrl, result);
    return result;
  }
}

export interface ClipboxDecodeResponse {
  input: string;
  detectedType: string;
  matchedHost?: ClipboxHostEntry;
  extractorFamily?: string;
  base64Decoded?: Array<{ token: string; text: string; json?: unknown }>;
  urlBreakdown?: {
    protocol: string;
    host: string;
    pathname: string;
    queryParams: Record<string, string>;
  };
  notes: string[];
  liveKeysPreview?: unknown;
}

export async function decodeClipboxInput(
  rawInput: string,
  fetchLiveSample = false
): Promise<ClipboxDecodeResponse> {
  const input = rawInput.trim();
  const inv = parseClipboxInventory();
  const notes: string[] = [];
  const base64Decoded: Array<{ token: string; text: string; json?: unknown }> = [];

  let urlBreakdown: ClipboxDecodeResponse['urlBreakdown'];
  let matchedHost: ClipboxHostEntry | undefined;

  if (/^https?:\/\//i.test(input)) {
    try {
      const u = new URL(input);
      const qp: Record<string, string> = {};
      u.searchParams.forEach((v, k) => {
        qp[k] = v;
      });
      urlBreakdown = {
        protocol: u.protocol,
        host: u.hostname,
        pathname: u.pathname,
        queryParams: qp,
      };
      matchedHost = inv.hosts.find(
        (h) =>
          h.host.toLowerCase() === u.hostname.toLowerCase() ||
          `www.${h.host.toLowerCase()}` === u.hostname.toLowerCase()
      );
      if (matchedHost) {
        notes.push(`Host identificado en ClipBox: ${matchedHost.categoryLabel} (${matchedHost.role}).`);
        if (matchedHost.decodedNote) notes.push(matchedHost.decodedNote);
      }
    } catch {
      // ignore invalid URL parse
    }
  } else {
    matchedHost = inv.hosts.find((h) => h.host.toLowerCase() === input.toLowerCase());
  }

  // Extract Base64 / Base64URL tokens cleanly from path segments, query params, or raw strings
  const candidates = new Set<string>();
  if (!/\s/.test(input) && input.length >= 8 && /^[A-Za-z0-9+/=_-]+$/.test(input)) {
    candidates.add(input);
  }
  if (/^https?:\/\//i.test(input)) {
    try {
      const u = new URL(input);
      for (const seg of u.pathname.split('/')) {
        if (seg.length >= 12) candidates.add(seg);
      }
      u.searchParams.forEach((v) => {
        if (v.length >= 12) candidates.add(v);
      });
      if (u.hash.length > 12) candidates.add(u.hash.slice(1));
    } catch {
      // ignore
    }
  }
  const matches = input.match(/[A-Za-z0-9+_-]{16,}={0,2}/g) || [];
  for (const m of matches) candidates.add(m);

  for (const tok of candidates) {
    const norm = tok.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (norm.length < 8) continue;
    const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
    try {
      const buf = Buffer.from(norm + pad, 'base64');
      const txt = buf.toString('utf8').trim();
      // Heuristic: ensure decoded text has high printable ASCII/UTF-8 ratio
      const printableCount = (txt.match(/[\x20-\x7E\u00A0-\u024F\u4E00-\u9FFF]/g) || []).length;
      if (txt.length >= 4 && printableCount / txt.length >= 0.78) {
        let parsedJson: unknown;
        if ((txt.startsWith('{') && txt.endsWith('}')) || (txt.startsWith('[') && txt.endsWith(']'))) {
          try {
            parsedJson = JSON.parse(txt);
          } catch {
            // not JSON
          }
        }
        base64Decoded.push({ token: tok, text: txt, json: parsedJson });
      }
    } catch {
      // not valid base64
    }
  }

  // Identify extractor family from Smali/ClipBox patterns
  let extractorFamily: string | undefined;
  if (/wish|\.sbs$|hlswish|playerwish|embedwish|swiftplayers/i.test(input)) {
    extractorFamily = 'StreamWishExtractor (packer/jwplayer -> HLS m3u8)';
  } else if (/vidhide|filelions|dhtpre|dhcplay|guccihide/i.test(input)) {
    extractorFamily = 'VidHide / EarnVids Extractor (eval packer -> sources)';
  } else if (/dood|d000d|do7go|dsvplay|myvidplay/i.test(input)) {
    extractorFamily = 'DoodStream Extractor (/pass_md5/ + token)';
  } else if (/mixdrop|m1xdrop|miixdrop|mxdrop/i.test(input)) {
    extractorFamily = 'MixDrop Extractor (MDCore.wurl)';
  } else if (/voe\./i.test(input)) {
    extractorFamily = 'VoeExtractor (redirect + HLS/MP4 cipher)';
  } else if (/filemoon/i.test(input)) {
    extractorFamily = 'FilemoonExtractor (packed jwplayer script)';
  } else if (/enc-dec\.app/i.test(input)) {
    extractorFamily = 'EncDec API Bridge (videasy / megaplay / cinejoy / kisskh / meowtv / nexa)';
  } else if (/fkplayer\.xyz/i.test(input)) {
    extractorFamily = 'FKPlayer Token Decoding API (/api/decoding)';
  } else if (/sibnet/i.test(input)) {
    extractorFamily = 'VideoSibNetExtractor (MP4 player.src)';
  } else if (/mp4upload/i.test(input)) {
    extractorFamily = 'Mp4UploadExtractor (direct MP4 player.src)';
  }

  if (extractorFamily) {
    notes.push(`Familia de extractor ClipBox detectada: ${extractorFamily}`);
  }

  let liveKeysPreview: unknown;
  if (fetchLiveSample) {
    try {
      const targetKeyUrl =
        input.includes('multi-keys')
          ? 'https://raw.githubusercontent.com/Rowdy-Avocado/multi-keys/keys/index.html'
          : input.includes('clipbox.mov')
          ? 'https://clipbox.mov/api/go/zoog/app-settings'
          : 'https://raw.githubusercontent.com/Ciarands/vidsrc-keys/main/keys.json';
      await assertSafeProxyUrl(targetKeyUrl);
      const r = await streamingFetch(targetKeyUrl, {
        headers: { 'User-Agent': CHROME_UA },
        timeoutMs: 4000,
      });
      if (r.ok) {
        const bodyText = await r.text();
        try {
          liveKeysPreview = JSON.parse(bodyText);
        } catch {
          liveKeysPreview = bodyText.slice(0, 1200);
        }
      }
    } catch {
      // ignore fetch failures
    }
  }

  return {
    input,
    detectedType: base64Decoded.some((b) => b.json)
      ? 'Base64 JSON Config'
      : base64Decoded.length > 0
      ? 'Base64 Payload'
      : extractorFamily
      ? 'ClipBox Extractor / API'
      : urlBreakdown
      ? 'URL Estructurada'
      : 'Texto / Patrón',
    matchedHost,
    extractorFamily,
    base64Decoded: base64Decoded.length > 0 ? base64Decoded : undefined,
    urlBreakdown,
    notes,
    liveKeysPreview,
  };
}
