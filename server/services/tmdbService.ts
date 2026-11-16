import https from 'node:https';
import zlib from 'node:zlib';
import { ENV } from '../config/env.ts';
import { LruTtlCache, SingleFlightRegistry } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';

export type SupportedCatalogLocale = 'es' | 'ca' | 'en';

const tmdbResponseCache = new LruTtlCache<string, unknown>(400, 5 * 60 * 1000);
const tmdbStaleFallbackCache = new LruTtlCache<string, unknown>(400, 24 * 60 * 60 * 1000);
const tmdbSingleFlight = new SingleFlightRegistry<unknown>();

// Dedicated IPv4 keepAlive agent avoids Node/undici Happy Eyeballs IPv6 stalls
let tmdbIpv4KeepAliveAgent = new https.Agent({
  keepAlive: true,
  family: 4,
  maxSockets: 6,
  keepAliveMsecs: 10_000,
});

function resetTmdbKeepAliveAgent(): void {
  try {
    tmdbIpv4KeepAliveAgent.destroy();
  } catch {
    // ignore
  }
  tmdbIpv4KeepAliveAgent = new https.Agent({
    keepAlive: true,
    family: 4,
    maxSockets: 6,
    keepAliveMsecs: 10_000,
  });
}

// Bound concurrent upstream requests to TMDB to avoid socket bursts / edge timeouts
const MAX_CONCURRENT_TMDB = 4;
let activeTmdbRequests = 0;
const tmdbWaitQueue: Array<() => void> = [];

async function withTmdbSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  if (activeTmdbRequests >= MAX_CONCURRENT_TMDB) {
    await new Promise<void>((resolve) => {
      tmdbWaitQueue.push(resolve);
    });
  }
  activeTmdbRequests += 1;
  try {
    return await fn();
  } finally {
    activeTmdbRequests = Math.max(0, activeTmdbRequests - 1);
    const next = tmdbWaitQueue.shift();
    if (next) next();
  }
}

function tmdbIpv4GetJson<T>(targetUrl: string, timeoutMs = 6_000): Promise<{ status: number; data: T | null }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      targetUrl,
      {
        agent: tmdbIpv4KeepAliveAgent,
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': 'NAIMCINE-Catalog/3.1',
        },
      },
      (res) => {
        const status = res.statusCode || 500;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (status < 200 || status >= 300) {
            resolve({ status, data: null });
            return;
          }
          try {
            let buf = Buffer.concat(chunks);
            const enc = String(res.headers['content-encoding'] || '').toLowerCase();
            if (enc === 'gzip') buf = zlib.gunzipSync(buf);
            else if (enc === 'deflate') buf = zlib.inflateSync(buf);
            else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
            const parsed = JSON.parse(buf.toString('utf8')) as T;
            resolve({ status, data: parsed });
          } catch (parseErr) {
            reject(parseErr);
          }
        });
      }
    );

    req.on('timeout', () => {
      const err = new Error(`TMDB upstream timeout after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      req.destroy(err);
    });
    req.on('error', reject);
  });
}

async function tmdbFreshFetchJson<T>(targetUrl: string, timeoutMs = 7_500): Promise<{ status: number; data: T | null }> {
  const res = await fetch(targetUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'NAIMCINE-Catalog/3.1',
    },
  });
  if (!res.ok) {
    return { status: res.status, data: null };
  }
  const parsed = (await res.json()) as T;
  return { status: res.status, data: parsed };
}

export function resolveTmdbLanguageTag(lang?: string): string {
  const lower = String(lang || 'es').toLowerCase();
  if (lower.startsWith('en')) return 'en-US';
  if (lower.startsWith('ca')) return 'ca-ES';
  return 'es-ES';
}

/**
 * Builds responsive TMDB image URL helpers (`w342`, `w780`, `w1280`, `original`)
 * so clients never load 4K artwork for 140px thumbnails.
 */
export function buildTmdbImageUrl(
  filePath: string | null | undefined,
  size: 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original' = 'w500'
): string {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  const clean = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `https://image.tmdb.org/t/p/${size}${clean}`;
}

export async function fetchTmdbJson<T>(
  endpointPath: string,
  params: Record<string, string | number | boolean | undefined> = {},
  cacheTtlMs = 5 * 60 * 1000
): Promise<T | null> {
  const url = new URL(`https://api.themoviedb.org/3${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`);
  url.searchParams.set('api_key', ENV.tmdbApiKey);

  // Strict language governance: default to es-ES unless caller explicitly sets one
  if (!params.language) {
    url.searchParams.set('language', 'es-ES');
  }

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const cacheKey = url.toString();
  const cached = tmdbResponseCache.get(cacheKey);
  if (cached !== undefined) {
    return cached as T;
  }

  return tmdbSingleFlight.run(cacheKey, () =>
    withTmdbSemaphore(async () => {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const { status, data } =
            attempt === 0
              ? await tmdbIpv4GetJson<T>(cacheKey, 6000)
              : await tmdbFreshFetchJson<T>(cacheKey, 7500);
          if (data !== null) {
            tmdbResponseCache.set(cacheKey, data, cacheTtlMs);
            tmdbStaleFallbackCache.set(cacheKey, data);
            return data;
          }
          if (status >= 400 && status < 500 && status !== 429) {
            logger.info({ status, endpointPath }, 'tmdb_fetch_non_ok');
            return null;
          }
          lastErr = new Error(`TMDB HTTP ${status}`);
        } catch (err) {
          lastErr = err;
          if (attempt === 0) {
            resetTmdbKeepAliveAgent();
          }
        }
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }

      const stale = tmdbStaleFallbackCache.get(cacheKey);
      if (stale !== undefined) {
        logger.info({ endpointPath }, 'tmdb_fetch_served_stale_cache');
        return stale as T;
      }

      const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr || 'unknown');
      logger.info({ endpointPath, reason: errMsg }, 'tmdb_fetch_fallback_null');
      return null;
    })
  ) as Promise<T | null>;
}

/**
 * Convenience wrapper that parses a full `https://api.themoviedb.org/3/...` URL
 * and routes it through `fetchTmdbJson` (IPv4 keepAlive, retries, stale fallback).
 */
export async function fetchTmdbUrlJson<T>(
  fullUrl: string,
  cacheTtlMs = 5 * 60 * 1000
): Promise<T | null> {
  if (!fullUrl) return null;
  try {
    const parsed = new URL(fullUrl);
    const endpointPath = parsed.pathname.replace(/^\/3/, '') || '/';
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      if (key !== 'api_key') {
        params[key] = value;
      }
    });
    return await fetchTmdbJson<T>(endpointPath, params, cacheTtlMs);
  } catch {
    return null;
  }
}

/**
 * Ensures non-Latin / mismatched foreign titles (e.g. Polish "Wśród nocnej ciszy" vs Spanish "Noche de Paz")
 * are resolved consistently to the requested es-ES localized title when TMDB returns a foreign original/fallback.
 */
export async function resolveLocalizedTmdbTitle(params: {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  currentTitle?: string;
  originalTitle?: string;
  lang?: string;
}): Promise<{ title: string; overview?: string }> {
  const langTag = resolveTmdbLanguageTag(params.lang);
  const rawTitle = (params.currentTitle || '').trim();
  const hasExtendedLatinOrCyrillicMismatch =
    langTag === 'es-ES' &&
    /[ąćęłńóśźżěščřžýůďťňăîâșțğışçöüä]|^Wśród/i.test(rawTitle);

  if (!hasExtendedLatinOrCyrillicMismatch && rawTitle) {
    return { title: rawTitle };
  }

  interface TmdbTranslationsRes {
    title?: string;
    name?: string;
    overview?: string;
    translations?: {
      translations?: Array<{
        iso_639_1: string;
        iso_3166_1: string;
        data?: { title?: string; name?: string; overview?: string };
      }>;
    };
  }

  const data = await fetchTmdbJson<TmdbTranslationsRes>(
    `/${params.mediaType}/${params.tmdbId}`,
    {
      language: langTag,
      append_to_response: 'translations',
    },
    12 * 60 * 60 * 1000
  );

  if (!data) {
    return { title: rawTitle || params.originalTitle || 'Título' };
  }

  const esEsTrans = data.translations?.translations?.find(
    (t) => t.iso_639_1 === 'es' && t.iso_3166_1 === 'ES'
  );
  const esAnyTrans = data.translations?.translations?.find((t) => t.iso_639_1 === 'es');
  const enTrans = data.translations?.translations?.find((t) => t.iso_639_1 === 'en');

  const localized =
    esEsTrans?.data?.title ||
    esEsTrans?.data?.name ||
    esAnyTrans?.data?.title ||
    esAnyTrans?.data?.name ||
    data.title ||
    data.name ||
    enTrans?.data?.title ||
    enTrans?.data?.name ||
    rawTitle ||
    params.originalTitle ||
    'Título';

  const overview =
    esEsTrans?.data?.overview || esAnyTrans?.data?.overview || data.overview || undefined;

  return { title: localized, overview };
}

/**
 * Fetches official transparent title logo PNG/SVG from TMDB /images so Hero and Detail headers
 * look like Apple TV+ / Infuse cards with clean typographic fallback when unavailable.
 */
export async function fetchTmdbTitleLogo(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  lang = 'es'
): Promise<string | null> {
  interface TmdbImagesResponse {
    logos?: Array<{
      file_path?: string;
      iso_639_1?: string | null;
      width?: number;
      vote_average?: number;
    }>;
  }

  const data = await fetchTmdbJson<TmdbImagesResponse>(
    `/${mediaType}/${tmdbId}/images`,
    {
      include_image_language: `${lang},es,en,null`,
    },
    24 * 60 * 60 * 1000
  );
  const logos = data?.logos || [];
  if (logos.length === 0) return null;

  const preferredLang = lang === 'ca' ? 'es' : lang;
  const pick =
    logos.find((l) => l.iso_639_1 === preferredLang) ||
    logos.find((l) => l.iso_639_1 === 'es') ||
    logos.find((l) => l.iso_639_1 === 'en') ||
    logos[0];

  return pick?.file_path ? buildTmdbImageUrl(pick.file_path, 'w500') : null;
}

/**
 * Fetches Spanish legal watch providers ("Disponible en...") for Info modal attribution.
 */
export async function fetchTmdbWatchProviders(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  region = 'ES'
): Promise<string[]> {
  interface WatchProviderResponse {
    results?: Record<
      string,
      {
        flatrate?: Array<{ provider_name: string }>;
        free?: Array<{ provider_name: string }>;
      }
    >;
  }
  const data = await fetchTmdbJson<WatchProviderResponse>(
    `/${mediaType}/${tmdbId}/watch/providers`,
    {},
    24 * 60 * 60 * 1000
  );
  const regionData = data?.results?.[region] || data?.results?.ES;
  if (!regionData) return [];
  const names = [
    ...(regionData.flatrate || []).map((p) => p.provider_name),
    ...(regionData.free || []).map((p) => p.provider_name),
  ];
  return Array.from(new Set(names)).slice(0, 5);
}
