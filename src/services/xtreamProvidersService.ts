import {
  DEFAULT_PROVIDERS,
  DEFAULT_PROVIDER_SUMMARIES,
  type PublicProviderSummary,
} from '../config/defaultProviders';
import type {
  ProviderCatalogData,
  ProviderSeriesInfoResult,
} from '../types/providers';
import {
  clearCachedProviderCatalogs,
  readCachedProviderCatalog,
  writeCachedProviderCatalog,
} from './xtreamProvidersDb';

const SINGLE_PROVIDER_FETCH_TIMEOUT_MS = 45_000;

export interface ProgressiveProvidersSyncOptions {
  forceRefresh?: boolean;
  signal?: AbortSignal;
  onProviderResolved: (catalog: ProviderCatalogData) => void;
}

function createEmptyErrorCatalog(summary: PublicProviderSummary): ProviderCatalogData {
  return {
    providerId: summary.id,
    providerName: summary.name,
    syncedAt: Date.now(),
    status: 'error',
    errorMessage: 'No disponible temporalmente',
    counts: { live: 0, movies: 0, series: 0 },
    liveCategories: [],
    vodCategories: [],
    seriesCategories: [],
    liveStreams: [],
    vodStreams: [],
    seriesList: [],
  };
}

export async function syncSingleProviderCatalog(
  providerId: string,
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {}
): Promise<ProviderCatalogData> {
  const summary =
    DEFAULT_PROVIDER_SUMMARIES.find((p) => p.id === providerId) || {
      id: providerId,
      name: 'Proveedor',
      accentColor: '#7C3AED',
      accountCount: 1,
    };

  if (!options.forceRefresh) {
    const cached = await readCachedProviderCatalog(providerId);
    if (
      cached &&
      cached.status === 'ready' &&
      cached.counts.live + cached.counts.movies + cached.counts.series > 0
    ) {
      return cached;
    }
  }

  const reqController = new AbortController();
  const onParentAbort = () => reqController.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      reqController.abort();
    } else {
      options.signal.addEventListener('abort', onParentAbort, { once: true });
    }
  }
  const timeoutHandle =
    typeof globalThis.setTimeout === 'function'
      ? globalThis.setTimeout(() => reqController.abort(), SINGLE_PROVIDER_FETCH_TIMEOUT_MS)
      : null;

  try {
    const res = await fetch('/api/providers/xtream/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId,
        forceRefresh: Boolean(options.forceRefresh),
      }),
      signal: reqController.signal,
    });

    if (!res.ok) {
      return createEmptyErrorCatalog(summary);
    }

    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; catalog?: ProviderCatalogData }
      | null;
    if (!payload?.success || !payload.catalog) {
      return createEmptyErrorCatalog(summary);
    }

    const catalog = payload.catalog;
    if (
      catalog.status === 'ready' &&
      catalog.counts.live + catalog.counts.movies + catalog.counts.series > 0
    ) {
      void writeCachedProviderCatalog(catalog);
    }
    return catalog;
  } catch {
    return createEmptyErrorCatalog(summary);
  } finally {
    if (timeoutHandle !== null) {
      globalThis.clearTimeout(timeoutHandle);
    }
    if (options.signal) {
      options.signal.removeEventListener('abort', onParentAbort);
    }
  }
}

/**
 * Reads DEFAULT_PROVIDERS and synchronizes all active servers concurrently with Promise.allSettled,
 * invoking onProviderResolved immediately as each server responds (or hits 6h IndexedDB cache).
 */
export async function syncAllDefaultProvidersProgressively(
  opts: ProgressiveProvidersSyncOptions
): Promise<ProviderCatalogData[]> {
  if (opts.forceRefresh) {
    await clearCachedProviderCatalogs();
  }

  const tasks = DEFAULT_PROVIDERS.map(async (provider) => {
    const data = await syncSingleProviderCatalog(provider.id, {
      forceRefresh: opts.forceRefresh,
      signal: opts.signal,
    });
    if (!opts.signal?.aborted) {
      opts.onProviderResolved(data);
    }
    return data;
  });

  const settled = await Promise.allSettled(tasks);
  return settled.map((result, idx) => {
    if (result.status === 'fulfilled') return result.value;
    return createEmptyErrorCatalog(DEFAULT_PROVIDER_SUMMARIES[idx]);
  });
}

export async function fetchProviderSeriesEpisodes(
  providerId: string,
  seriesId: string,
  signal?: AbortSignal
): Promise<ProviderSeriesInfoResult | null> {
  try {
    const res = await fetch(
      `/api/providers/series-info/${encodeURIComponent(providerId)}/${encodeURIComponent(seriesId)}`,
      { signal }
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; info?: ProviderSeriesInfoResult }
      | null;
    if (!json?.success || !json.info) return null;
    return json.info;
  } catch {
    return null;
  }
}
