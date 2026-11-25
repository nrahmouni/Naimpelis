import type { CatalogMovie, SpanishTdtChannel } from '../types';
import { mergeAndRankCatalogResults } from '../utils/catalogSearchRank';
import { rankClientChannels } from '../utils/channelQualityRanker';
import {
  filterCatalogItemsSync,
  filterTvChannelsIndicesSync,
  parseM3uTextSync,
  type CatalogWorkerRequest,
  type TvFilterWorkerEntry,
  type TvFilterWorkerOptions,
  type WorkerChannelItem,
} from '../workers/catalogWorker';

let workerInstance: Worker | null = null;
let workerDisabled = false;
let nextRequestId = 1;
const pendingRequests = new Map<
  number,
  { resolve: (val: unknown) => void; reject: (err: unknown) => void }
>();

function getCatalogWorker(): Worker | null {
  if (workerDisabled || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(new URL('../workers/catalogWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerInstance.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result: unknown }>) => {
      const msg = event.data;
      const pending = pendingRequests.get(msg?.id);
      if (!pending) return;
      pendingRequests.delete(msg.id);
      pending.resolve(msg.result);
    };
    workerInstance.onerror = () => {
      workerDisabled = true;
      workerInstance = null;
      for (const pending of pendingRequests.values()) {
        pending.reject(new Error('Catalog worker error'));
      }
      pendingRequests.clear();
    };
    return workerInstance;
  } catch {
    workerDisabled = true;
    return null;
  }
}

export async function filterCatalogOffThread<T extends WorkerChannelItem>(
  items: T[],
  query = '',
  category = 'all'
): Promise<T[]> {
  if (items.length < 150) {
    return filterCatalogItemsSync(items, query, category);
  }
  const worker = getCatalogWorker();
  if (!worker) {
    return filterCatalogItemsSync(items, query, category);
  }

  const id = nextRequestId++;
  return new Promise<T[]>((resolve) => {
    pendingRequests.set(id, {
      resolve: (val) => resolve(Array.isArray(val) ? (val as T[]) : items),
      reject: () => resolve(filterCatalogItemsSync(items, query, category)),
    });
    const req: CatalogWorkerRequest = {
      id,
      type: 'FILTER_ITEMS',
      payload: { items, query, category },
    };
    worker.postMessage(req);
  });
}

export async function parseM3uOffThread(m3uText: string) {
  if (m3uText.length < 8192) {
    return parseM3uTextSync(m3uText);
  }
  const worker = getCatalogWorker();
  if (!worker) {
    return parseM3uTextSync(m3uText);
  }
  const id = nextRequestId++;
  return new Promise<ReturnType<typeof parseM3uTextSync>>((resolve) => {
    pendingRequests.set(id, {
      resolve: (val) => resolve(Array.isArray(val) ? (val as ReturnType<typeof parseM3uTextSync>) : []),
      reject: () => resolve(parseM3uTextSync(m3uText)),
    });
    const req: CatalogWorkerRequest = {
      id,
      type: 'PARSE_M3U',
      payload: { m3uText },
    };
    worker.postMessage(req);
  });
}

export async function rankVodResultsOffThread(
  remoteItems: CatalogMovie[],
  localItems: CatalogMovie[],
  query: string,
  options?: { limit?: number; prefer4k?: boolean; minLocalScore?: number }
): Promise<CatalogMovie[]> {
  if (remoteItems.length + localItems.length < 25) {
    return mergeAndRankCatalogResults(remoteItems, localItems, query, options);
  }
  const worker = getCatalogWorker();
  if (!worker) {
    return mergeAndRankCatalogResults(remoteItems, localItems, query, options);
  }
  const id = nextRequestId++;
  return new Promise<CatalogMovie[]>((resolve) => {
    pendingRequests.set(id, {
      resolve: (val) =>
        resolve(
          Array.isArray(val)
            ? (val as CatalogMovie[])
            : mergeAndRankCatalogResults(remoteItems, localItems, query, options)
        ),
      reject: () => resolve(mergeAndRankCatalogResults(remoteItems, localItems, query, options)),
    });
    const req: CatalogWorkerRequest = {
      id,
      type: 'RANK_VOD_RESULTS',
      payload: { remoteItems, localItems, query, options },
    };
    worker.postMessage(req);
  });
}

export async function mergeAndRankChannelsOffThread(
  channels: SpanishTdtChannel[],
  options?: { preferQualityFirst?: boolean }
): Promise<SpanishTdtChannel[]> {
  if (channels.length < 120) {
    return rankClientChannels(channels, options);
  }
  const worker = getCatalogWorker();
  if (!worker) {
    return rankClientChannels(channels, options);
  }
  const id = nextRequestId++;
  return new Promise<SpanishTdtChannel[]>((resolve) => {
    pendingRequests.set(id, {
      resolve: (val) =>
        resolve(Array.isArray(val) ? (val as SpanishTdtChannel[]) : rankClientChannels(channels, options)),
      reject: () => resolve(rankClientChannels(channels, options)),
    });
    const req: CatalogWorkerRequest = {
      id,
      type: 'MERGE_RANK_CHANNELS',
      payload: { channels, options },
    };
    worker.postMessage(req);
  });
}

export async function filterTvChannelsOffThread(
  entries: TvFilterWorkerEntry[],
  options: TvFilterWorkerOptions
): Promise<number[]> {
  if (entries.length < 160) {
    return filterTvChannelsIndicesSync(entries, options);
  }
  const worker = getCatalogWorker();
  if (!worker) {
    return filterTvChannelsIndicesSync(entries, options);
  }
  const id = nextRequestId++;
  return new Promise<number[]>((resolve) => {
    pendingRequests.set(id, {
      resolve: (val) =>
        resolve(Array.isArray(val) ? (val as number[]) : filterTvChannelsIndicesSync(entries, options)),
      reject: () => resolve(filterTvChannelsIndicesSync(entries, options)),
    });
    const req: CatalogWorkerRequest = {
      id,
      type: 'FILTER_TV_CHANNELS',
      payload: { entries, options },
    };
    worker.postMessage(req);
  });
}
