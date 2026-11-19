import { Timestamp } from 'firebase/firestore';
import { sanitizeItemKey } from '../../utils/storage';

// ============================================================================
// DEFENSIVE PAYLOAD SANITIZERS (SYNCHRONIZED WITH firebase-blueprint.json)
// ============================================================================
export function clampString(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

export function optionalClampedString(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

export function clampNumber(val: unknown, min: number, max: number, fallback = 0): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

export function clampOptionalPositiveInt(
  val: unknown,
  min: number,
  max: number
): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Math.floor(Number(val));
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

export function sanitizeHexColor(raw: unknown): string {
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.trim())) {
    return raw.trim();
  }
  return '#9146FF';
}

export function toMillis(ts: unknown, fallback = Date.now()): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (
    ts &&
    typeof ts === 'object' &&
    'seconds' in ts &&
    typeof (ts as { seconds: unknown }).seconds === 'number'
  ) {
    return (ts as { seconds: number }).seconds * 1000;
  }
  return fallback;
}

export function shouldSkipStaleCloudWrite(params: {
  serverUpdatedMs: number;
  clientUpdatedMs?: number;
  serverResumeSec?: number;
  clientResumeSec?: number;
}): boolean {
  const { serverUpdatedMs, clientUpdatedMs = 0, serverResumeSec, clientResumeSec } = params;
  if (!Number.isFinite(serverUpdatedMs) || serverUpdatedMs <= 0) return false;
  if (!Number.isFinite(clientUpdatedMs) || clientUpdatedMs <= 0) return false;
  if (serverUpdatedMs <= clientUpdatedMs + 5000) return false;
  if (typeof serverResumeSec === 'number' && typeof clientResumeSec === 'number') {
    return serverResumeSec > clientResumeSec;
  }
  return true;
}

export function isNotFoundError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  return (
    code === 'not-found' ||
    msg.includes('No document to update') ||
    msg.includes('not-found')
  );
}

export function normalizePreferLang(raw: unknown): 'ES' | 'LAT' | 'VOSE' | 'EN' {
  const up = String(raw || '').toUpperCase().trim();
  if (up === 'EN' || up === 'LAT' || up === 'VOSE' || up === 'ES') return up;
  return 'ES';
}

// Track which composite document IDs are confirmed to exist in Firestore
export const knownHistoryDocIds = new Set<string>();
export const knownFavoriteDocIds = new Set<string>();
export const knownFavoriteTitleKeys = new Set<string>();
export const favoriteTitleToRawFavIds = new Map<string, Set<string>>();
export const knownSavedRoomDocIds = new Set<string>();
export const knownFriendDocIds = new Set<string>();

// Per-document write queue to eliminate concurrent create/update race conditions
export const pendingDocQueues = new Map<string, Promise<void>>();

export function clearCloudSyncCaches(): void {
  knownHistoryDocIds.clear();
  knownFavoriteDocIds.clear();
  knownSavedRoomDocIds.clear();
  knownFriendDocIds.clear();
  pendingDocQueues.clear();
}

export function enqueueDocWrite(docPath: string, task: () => Promise<void>): Promise<void> {
  const previous = pendingDocQueues.get(docPath) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(task)
    .finally(() => {
      if (pendingDocQueues.get(docPath) === next) {
        pendingDocQueues.delete(docPath);
      }
    });
  pendingDocQueues.set(docPath, next);
  return next;
}

export function buildHistoryDocId(uid: string, rawItemId: string): string {
  return `${uid}_${sanitizeItemKey(rawItemId)}`;
}

export function buildFavoriteDocId(uid: string, rawFavId: string): string {
  return `${uid}_${sanitizeItemKey(rawFavId)}`;
}

export function buildSavedRoomDocId(uid: string, rawRoomCode: string): string {
  const cleanCode = rawRoomCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
  return `${uid}_${cleanCode}`;
}
