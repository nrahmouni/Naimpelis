import http from 'http';
import https from 'https';
import zlib from 'zlib';
import { logger } from '../utils/logger.ts';

const tlsRelaxedAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const STREAMING_TLS_RELAX_PATTERNS = [
  /(\.|^)stmify\.com$/i,
  /(\.|^)footunder\.online$/i,
  /(\.|^)movidy\.(work|pw|tv|ws)$/i,
  /(\.|^)bingetrix\.(sc|to|sx|cc)$/i,
  /(\.|^)vidhide/i,
  /(\.|^)embed69/i,
  /(\.|^)filemoon/i,
  /(\.|^)streamwish/i,
  /(\.|^)dood/i,
  /(\.|^)mixdrop/i,
  /(\.|^)lulustream/i,
  /(\.|^)earnvids/i,
  /(\.|^)gnula/i,
  /(\.|^)vest/i,
  /(\.|^)ok\.ru$/i,
  /(\.|^)vk\.com$/i,
  /\.(pw|lat|sbs|cfd|stream|top|xyz|icu|lol|buzz)$/i,
];

const STRICT_TLS_ONLY_HOSTS = [
  /(\.|^)googleapis\.com$/i,
  /(\.|^)google\.com$/i,
  /(\.|^)firebaseio\.com$/i,
  /(\.|^)themoviedb\.org$/i,
  /(\.|^)tmdb\.org$/i,
  /(\.|^)github\.com$/i,
  /(\.|^)githubusercontent\.com$/i,
];

export function shouldRelaxStreamingTls(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/\.$/, '');
  if (STRICT_TLS_ONLY_HOSTS.some((rx) => rx.test(clean))) return false;
  return STREAMING_TLS_RELAX_PATTERNS.some((rx) => rx.test(clean));
}

function isTlsCertificateError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.message} ${String((err as { cause?: { code?: unknown; message?: unknown } }).cause?.code || '')} ${String((err as { cause?: { message?: unknown } }).cause?.message || '')}`
      : String(err || '');
  return /UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|ERR_TLS_CERT_ALTNAME_INVALID|unable to verify the first certificate/i.test(
    msg
  );
}

function relaxedHttpsRequest(
  targetUrl: URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    timeoutMs?: number;
    redirectCount?: number;
  }
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const redirectCount = options.redirectCount ?? 0;

  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request(
      targetUrl,
      {
        method: options.method || 'GET',
        headers: options.headers,
        timeout: timeoutMs,
        ...(isHttps ? { agent: tlsRelaxedAgent } : {}),
      },
      (res) => {
        const status = res.statusCode || 502;
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          res.headers.location &&
          redirectCount < 5
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, targetUrl);
          relaxedHttpsRequest(nextUrl, {
            ...options,
            method: status === 303 ? 'GET' : options.method,
            redirectCount: redirectCount + 1,
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          let buf = Buffer.concat(chunks);
          const enc = String(res.headers['content-encoding'] || '').toLowerCase();
          try {
            if (enc === 'gzip') buf = zlib.gunzipSync(buf);
            else if (enc === 'deflate') buf = zlib.inflateSync(buf);
            else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
          } catch {
            // preserve raw payload if decompression fails
          }
          const respHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (k.toLowerCase() === 'content-encoding' || k.toLowerCase() === 'transfer-encoding') continue;
            if (Array.isArray(v)) respHeaders.set(k, v.join(', '));
            else if (typeof v === 'string') respHeaders.set(k, v);
          }
          resolve(
            new Response(buf, {
              status,
              statusText: res.statusMessage || '',
              headers: respHeaders,
            })
          );
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Upstream timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export interface StreamingFetchOptions extends RequestInit {
  timeoutMs?: number;
  allowTlsFallback?: boolean;
}

/**
 * Performs an HTTP/HTTPS fetch with strict Node TLS verification by default,
 * falling back to relaxed TLS verification ONLY on individual problematic
 * streaming domains (never setting global NODE_TLS_REJECT_UNAUTHORIZED = '0').
 */
export async function streamingFetch(
  rawUrl: string,
  init: StreamingFetchOptions = {}
): Promise<Response> {
  const parsed = new URL(rawUrl);
  const timeoutMs = init.timeoutMs ?? 12_000;
  const signal = init.signal ?? AbortSignal.timeout(timeoutMs);

  const normalizeHeaders = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!init.headers) return out;
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        out[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) out[k] = v;
    } else {
      Object.assign(out, init.headers);
    }
    return out;
  };

  const allowFallback =
    init.allowTlsFallback !== false &&
    parsed.protocol === 'https:' &&
    !STRICT_TLS_ONLY_HOSTS.some((rx) => rx.test(parsed.hostname));

  try {
    return await fetch(parsed.toString(), { ...init, signal });
  } catch (err) {
    if (allowFallback && (shouldRelaxStreamingTls(parsed.hostname) || isTlsCertificateError(err))) {
      logger.debug({ host: parsed.hostname }, 'streaming_tls_relaxed_fallback');
      return relaxedHttpsRequest(parsed, {
        method: init.method || 'GET',
        headers: normalizeHeaders(),
        body: typeof init.body === 'string' || Buffer.isBuffer(init.body) ? init.body : undefined,
        timeoutMs,
      });
    }
    throw err;
  }
}
