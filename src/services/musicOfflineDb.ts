const DB_NAME = 'riffan_music_offline_v1';
const STORE_NAME = 'tracks';
const DB_VERSION = 1;

export interface OfflineTrackMeta {
  trackId: string;
  sizeBytes: number;
  mimeType: string;
  savedAt: number;
}

interface OfflineTrackRecord extends OfflineTrackMeta {
  blob: Blob;
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'trackId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveOfflineTrackAudio(trackId: string, blob: Blob): Promise<boolean> {
  const db = await openOfflineDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: OfflineTrackRecord = {
        trackId,
        blob,
        sizeBytes: blob.size,
        mimeType: blob.type || 'audio/mpeg',
        savedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function getOfflineTrackBlob(trackId: string): Promise<Blob | null> {
  const db = await openOfflineDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(trackId);
      req.onsuccess = () => {
        db.close();
        const rec = req.result as OfflineTrackRecord | undefined;
        resolve(rec?.blob || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function deleteOfflineTrackAudio(trackId: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(trackId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function listOfflineTrackMeta(): Promise<OfflineTrackMeta[]> {
  const db = await openOfflineDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        db.close();
        const items = Array.isArray(req.result) ? (req.result as OfflineTrackRecord[]) : [];
        resolve(
          items.map((r) => ({
            trackId: r.trackId,
            sizeBytes: r.sizeBytes,
            mimeType: r.mimeType,
            savedAt: r.savedAt,
          }))
        );
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}

export async function clearAllOfflineTracks(): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
