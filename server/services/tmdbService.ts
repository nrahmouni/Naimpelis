import { ENV } from '../config/env.ts';
import { LruTtlCache, SingleFlightRegistry } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';

export type SupportedCatalogLocale = 'es' | 'ca' | 'en';

const tmdbResponseCache = new LruTtlCache<string, unknown>(400, 5 * 60 * 1000);
const tmdbSingleFlight = new SingleFlightRegistry<unknown>();

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

  return tmdbSingleFlight.run(cacheKey, async () => {
    try {
      const response = await fetch(cacheKey, {
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) {
        logger.warn({ status: response.status, endpointPath }, 'tmdb_fetch_non_ok');
        return null;
      }
      const data = (await response.json()) as T;
      tmdbResponseCache.set(cacheKey, data, cacheTtlMs);
      return data;
    } catch (err) {
      logger.warn({ err, endpointPath }, 'tmdb_fetch_error');
      return null;
    }
  }) as Promise<T | null>;
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
