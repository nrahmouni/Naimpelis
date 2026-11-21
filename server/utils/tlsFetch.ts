import http from 'http';
import https from 'https';
import { PassThrough, Readable } from 'stream';
import zlib from 'zlib';
import { logger } from '../utils/logger.ts';
import { LruTtlCache } from './lruCache.ts';

const tlsRelaxedAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 15_000,
  maxSockets: 48,
});

const plainHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 15_000,
  maxSockets: 48,
});

const STREAMING_TLS_RELAX_PATTERNS = [
  /(\.|^)stmify\.com$/i,
  /(\.|^)footunder\.online$/i,
  /(\.|^)7odxv0l067ka\.net$/i,
  /(\.|^)futlivehd\.com$/i,
  /(\.|^)streamxhd\.(sbs|st)$/i,
  /(\.|^)rojadirectv\.live$/i,
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

const DIRECT_IPV4_HTTPS_HOSTS = new LruTtlCache<string, true>(400, 6 * 60 * 60 * 1000);

const PROACTIVE_DIRECT_IPV4_PATTERNS = [
  /(\.|^)footunder\.online$/i,
  /(\.|^)7odxv0l067ka\.net$/i,
  /(\.|^)futlivehd\.com$/i,
  /(\.|^)streamxhd\.(sbs|st)$/i,
  /(\.|^)rojadirectv\.live$/i,
  /(\.|^)tilinhd\.lol$/i,
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

function shouldUseDirectIpv4Http(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/\.$/, '');
  if (STRICT_TLS_ONLY_HOSTS.some((rx) => rx.test(clean))) return false;
  if (DIRECT_IPV4_HTTPS_HOSTS.has(clean)) return true;
  return PROACTIVE_DIRECT_IPV4_PATTERNS.some((rx) => rx.test(clean));
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

function isUndiciTimeoutOrConnectError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.name} ${err.message} ${String((err as { cause?: { code?: unknown } }).cause?.code || '')}`
      : String(err || '');
  return /TimeoutError|AbortError|aborted due to timeout|ETIMEDOUT|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT/i.test(
    msg
  );
}

function createDecompressedWebStream(
  res: http.IncomingMessage,
  contentEncoding: string,
  onAbortCleanup: () => void
): ReadableStream<Uint8Array> | null {
  let stream: Readable = res;
  if (contentEncoding === 'gzip') {
    const gz = zlib.createGunzip();
    res.pipe(gz);
    gz.on('error', () => {
      res.destroy();
    });
    stream = gz;
  } else if (contentEncoding === 'deflate') {
    const inf = zlib.createInflate();
    res.pipe(inf);
    inf.on('error', () => {
      res.destroy();
    });
    stream = inf;
  } else if (contentEncoding === 'br') {
    const br = zlib.createBrotliDecompress();
    res.pipe(br);
    br.on('error', () => {
      res.destroy();
    });
    stream = br;
  }

  // Wrap in PassThrough if needed or convert directly to Web ReadableStream
  const pass = new PassThrough();
  stream.pipe(pass);
  stream.once('error', (err) => {
    if (!pass.destroyed) pass.destroy(err);
  });
  res.once('close', () => {
    onAbortCleanup();
  });

  return Readable.toWeb(pass) as unknown as ReadableStream<Uint8Array>;
}

function relaxedHttpsRequest(
  targetUrl: URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    timeoutMs?: number;
    redirectCount?: number;
    signal?: AbortSignal;
    rejectUnauthorized?: boolean;
  }
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const redirectCount = options.redirectCount ?? 0;

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const isHttps = targetUrl.protocol === 'https:';
    const mod = isHttps ? https : http;
    let settled = false;
    let req: http.ClientRequest | null = null;

    const onExternalAbort = () => {
      if (req && !req.destroyed) {
        req.destroy(new DOMException('The operation was aborted.', 'AbortError'));
      }
      if (!settled) {
        settled = true;
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      }
    };

    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    const cleanupSignal = () => {
      options.signal?.removeEventListener('abort', onExternalAbort);
    };

    req = mod.request(
      targetUrl,
      {
        method: options.method || 'GET',
        headers: options.headers,
        family: 4,
        timeout: timeoutMs,
        agent: isHttps
          ? options.rejectUnauthorized === false
            ? tlsRelaxedAgent
            : undefined
          : plainHttpAgent,
        ...(isHttps && options.rejectUnauthorized === false ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const status = res.statusCode || 502;
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          res.headers.location &&
          redirectCount < 5
        ) {
          res.resume();
          cleanupSignal();
          settled = true;
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

        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        const respHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          const lowerK = k.toLowerCase();
          if (lowerK === 'content-encoding' || lowerK === 'transfer-encoding') continue;
          if (Array.isArray(v)) respHeaders.set(k, v.join(', '));
          else if (typeof v === 'string') respHeaders.set(k, v);
        }

        settled = true;
        const bodyStream =
          options.method === 'HEAD'
            ? null
            : createDecompressedWebStream(res, enc, cleanupSignal);
        if (options.method === 'HEAD') {
          res.resume();
          cleanupSignal();
        }

        const response = new Response(bodyStream, {
          status,
          statusText: res.statusMessage || '',
          headers: respHeaders,
        });
        try {
          Object.defineProperty(response, 'url', { value: targetUrl.toString() });
        } catch {
          // ignore readonly property
        }
        resolve(response);
      }
    );

    req.on('timeout', () => {
      req?.destroy(new Error(`Upstream timeout after ${timeoutMs}ms`));
    });
    req.on('error', (err) => {
      cleanupSignal();
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
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
 * bypassing undici on streaming hosts where Happy-Eyeballs/HTTP2 stalls and
 * streaming responses immediately over IPv4 keep-alive Node HTTP/HTTPS.
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

  // Fast path: skip undici fetch() completely for hosts known to stall undici HTTP/2 or IPv6
  if (shouldUseDirectIpv4Http(parsed.hostname)) {
    return relaxedHttpsRequest(parsed, {
      method: init.method || 'GET',
      headers: normalizeHeaders(),
      body: typeof init.body === 'string' || Buffer.isBuffer(init.body) ? init.body : undefined,
      timeoutMs,
      signal,
      rejectUnauthorized: !shouldRelaxStreamingTls(parsed.hostname),
    });
  }

  try {
    return await fetch(parsed.toString(), { ...init, signal });
  } catch (err) {
    if (init.signal?.aborted) {
      throw err;
    }
    if (
      allowFallback &&
      (shouldRelaxStreamingTls(parsed.hostname) ||
        isTlsCertificateError(err) ||
        isUndiciTimeoutOrConnectError(err))
    ) {
      DIRECT_IPV4_HTTPS_HOSTS.set(parsed.hostname.toLowerCase().replace(/\.$/, ''), true);
      logger.debug({ host: parsed.hostname }, 'streaming_tls_relaxed_fallback');
      return relaxedHttpsRequest(parsed, {
        method: init.method || 'GET',
        headers: normalizeHeaders(),
        body: typeof init.body === 'string' || Buffer.isBuffer(init.body) ? init.body : undefined,
        timeoutMs,
        signal,
        rejectUnauthorized: false,
      });
    }
    throw err;
  }
}
