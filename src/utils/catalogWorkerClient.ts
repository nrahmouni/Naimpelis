import {
  filterCatalogItemsSync,
  parseM3uTextSync,
  type CatalogWorkerRequest,
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
