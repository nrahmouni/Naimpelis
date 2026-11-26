import type { ProviderCatalogData } from '../types/providers';

export const XTREAM_IDB_NAME = 'riffantv_xtream_catalog_v1';
export const XTREAM_IDB_STORE = 'provider_catalogs';
export const XTREAM_IDB_VERSION = 1;
export const XTREAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

export interface CachedProviderRecord {
  providerId: string;
  syncedAt: number;
  data: ProviderCatalogData;
}

const memoryFallbackStore = new Map<string, CachedProviderRecord>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openCatalogDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) {
        if (db) {
          try {
            db.close();
          } catch {
            // ignore
          }
        }
        return;
      }
      settled = true;
      resolve(db);
    };

    const timer =
      typeof globalThis.setTimeout === 'function'
        ? globalThis.setTimeout(() => finish(null), 2000)
        : null;

    try {
      const req = indexedDB.open(XTREAM_IDB_NAME, XTREAM_IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(XTREAM_IDB_STORE)) {
          db.createObjectStore(XTREAM_IDB_STORE, { keyPath: 'providerId' });
        }
      };
      req.onsuccess = () => {
        if (timer !== null) globalThis.clearTimeout(timer);
        finish(req.result);
      };
      req.onerror = () => {
        if (timer !== null) globalThis.clearTimeout(timer);
        finish(null);
      };
      req.onblocked = () => {
        if (timer !== null) globalThis.clearTimeout(timer);
        finish(null);
      };
    } catch {
      if (timer !== null) globalThis.clearTimeout(timer);
      finish(null);
    }
  });
}

export function isCachedProviderFresh(syncedAt: number, now = Date.now()): boolean {
  return Number.isFinite(syncedAt) && syncedAt > 0 && now - syncedAt < XTREAM_CACHE_TTL_MS;
}

export async function readCachedProviderCatalog(
  providerId: string,
  now = Date.now()
): Promise<ProviderCatalogData | null> {
  const mem = memoryFallbackStore.get(providerId);
  if (mem && isCachedProviderFresh(mem.syncedAt, now)) {
    return mem.data;
  }

  const db = await openCatalogDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(XTREAM_IDB_STORE, 'readonly');
      const store = tx.objectStore(XTREAM_IDB_STORE);
      const req = store.get(providerId);
      req.onsuccess = () => {
        const record = req.result as CachedProviderRecord | undefined;
        db.close();
        if (record && record.data && isCachedProviderFresh(record.syncedAt, now)) {
          memoryFallbackStore.set(providerId, record);
          resolve(record.data);
          return;
        }
        resolve(null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      try {
        db.close();
      } catch {
        // ignore
      }
      resolve(null);
    }
  });
}

export async function writeCachedProviderCatalog(data: ProviderCatalogData): Promise<void> {
  const record: CachedProviderRecord = {
    providerId: data.providerId,
    syncedAt: data.syncedAt || Date.now(),
    data,
  };
  memoryFallbackStore.set(data.providerId, record);

  const db = await openCatalogDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(XTREAM_IDB_STORE, 'readwrite');
      const store = tx.objectStore(XTREAM_IDB_STORE);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      try {
        db.close();
      } catch {
        // ignore
      }
      resolve();
    }
  });
}

export async function clearCachedProviderCatalogs(): Promise<void> {
  memoryFallbackStore.clear();
  const db = await openCatalogDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(XTREAM_IDB_STORE, 'readwrite');
      const store = tx.objectStore(XTREAM_IDB_STORE);
      store.clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      try {
        db.close();
      } catch {
        // ignore
      }
      resolve();
    }
  });
}
