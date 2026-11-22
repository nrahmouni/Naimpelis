import fs from 'fs';
import { logger } from '../utils/logger.ts';

/**
 * Distributed Room & Smart TV Pairing Persistence Adapter
 *
 * Uses fast local RAM L1 + /tmp snapshot by default, and transparently replicates
 * rooms, TV pairing codes, and TV auth tokens to Redis/Upstash REST when configured
 * (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` or `REDIS_REST_URL`)
 * so Cloud Run multi-instance autoscaling keeps room & TV pairing state synchronized.
 */
const UPSTASH_URL = String(
  process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || ''
)
  .trim()
  .replace(/\/+$/, '');
const UPSTASH_TOKEN = String(
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || ''
).trim();

const ROOMS_SNAPSHOT_PATH = '/tmp/naimcine-rooms-v1.json';

export function isDistributedStoreEnabled(): boolean {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisRestCommand<T = unknown>(args: Array<string | number>): Promise<T | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const res = await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: T };
    return data.result ?? null;
  } catch (err) {
    logger.debug({ err }, 'distributed_store_redis_rest_error');
    return null;
  }
}

export async function saveDistributedKey(
  key: string,
  value: unknown,
  ttlSeconds = 86400
): Promise<void> {
  if (!isDistributedStoreEnabled()) return;
  await redisRestCommand(['SET', `naimcine:${key}`, JSON.stringify(value), 'EX', ttlSeconds]);
}

export async function loadDistributedKey<T = unknown>(key: string): Promise<T | null> {
  if (!isDistributedStoreEnabled()) return null;
  const raw = await redisRestCommand<string>(['GET', `naimcine:${key}`]);
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadRoomsSnapshotFromDisk<T extends { id: string }>(
  onRoomLoaded: (room: T) => void
): void {
  try {
    if (!fs.existsSync(ROOMS_SNAPSHOT_PATH)) return;
    const raw = fs.readFileSync(ROOMS_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const item of parsed.slice(0, 120)) {
      if (item && typeof item.id === 'string') {
        onRoomLoaded(item as T);
      }
    }
  } catch {
    // ignore corrupted snapshot
  }
}

let snapshotWriteQueue: Promise<void> = Promise.resolve();

export function writeRoomsSnapshotToDisk(serializable: unknown[]): void {
  const payload = JSON.stringify(serializable);
  snapshotWriteQueue = snapshotWriteQueue
    .then(() => fs.promises.writeFile(ROOMS_SNAPSHOT_PATH, payload, 'utf8'))
    .catch(() => {
      // ignore disk write error
    });
}
