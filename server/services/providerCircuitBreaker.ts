/**
 * @module server/services/providerCircuitBreaker
 * @description Twitch/Netflix-style Content Steering, EWMA latency scoring, and Circuit Breaker
 * per upstream provider/CDN bucket. Quarantines dead servers automatically so every live channel
 * resolves from fast, healthy mirrors in <= 5s.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface ProviderBucketStats {
  bucket: string;
  state: CircuitState;
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
  ewmaLatencyMs: number;
  lastOutcomeAt: number;
  openUntil: number;
  halfOpenProbing: boolean;
}

const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;
const EWMA_ALPHA = 0.35;

/**
 * Empirical baseline steering priors (ms-equivalent penalty) when a bucket has no fresh EWMA yet.
 * Lower = faster/more reliable native HLS edge.
 */
const BASELINE_PROVIDER_PRIOR_MS: Record<string, number> = {
  ottera: 120,
  'ultra-vip': 320,
  '24tv': 650,
  vod4k: 720,
  octopus: 820,
  primary: 860,
  belix: 920,
  'sult-vo': 1600,
  adtupac: 1700,
  '2m2h-alt': 1750,
  dana4k: 2100,
  '2m2h': 2200,
  activecdns: 2300,
  dvb: 2800,
  sports_scraper: 3400,
};

const buckets = new Map<string, ProviderBucketStats>();

export function extractProviderBucket(sourceOrProviderId: string, explicitProviderId?: string): string {
  const pid = String(explicitProviderId || '').trim().toLowerCase();
  if (pid) return pid;

  const raw = String(sourceOrProviderId || '').trim();
  if (!raw) return 'unknown';

  if (/^[a-z0-9_-]{2,24}$/i.test(raw) && !raw.includes('/') && !raw.includes('.')) {
    return raw.toLowerCase();
  }

  if (raw.startsWith('/api/belix/')) return 'belix';
  if (raw.startsWith('/api/dvb-live/')) return 'dvb';

  if (/^\/api\/(?:xtream\/stream\/|providers\/stream\/|stream\b)/i.test(raw)) {
    const provMatch = raw.match(/^\/api\/providers\/stream\/([^/]+)\//i);
    if (provMatch?.[1]) return decodeURIComponent(provMatch[1]).toLowerCase();
    try {
      const u = new URL(raw, 'http://localhost');
      const p = (u.searchParams.get('provider') || 'primary').trim().toLowerCase();
      return p || 'primary';
    } catch {
      return 'primary';
    }
  }

  const target = (() => {
    if (raw.startsWith('/api/hls-proxy') || raw.startsWith('/api/ts-proxy')) {
      try {
        return new URL(raw, 'http://localhost').searchParams.get('url') || raw;
      } catch {
        return raw;
      }
    }
    return raw;
  })();

  if (target.includes('90.163.85.113')) return 'dvb';
  if (/ottera\.tv|rtve/i.test(target)) return 'ottera';
  if (/footunder\.online|streamxhd\.|tilinhd\.|rojadirectv/i.test(target)) return 'sports_scraper';

  try {
    if (/^https?:\/\//i.test(target)) {
      return new URL(target).hostname.toLowerCase();
    }
  } catch {
    // ignore
  }
  return 'direct_hls';
}

function getOrCreateBucket(bucket: string): ProviderBucketStats {
  let entry = buckets.get(bucket);
  if (!entry) {
    entry = {
      bucket,
      state: 'closed',
      consecutiveFailures: 0,
      successCount: 0,
      failureCount: 0,
      ewmaLatencyMs: BASELINE_PROVIDER_PRIOR_MS[bucket] ?? 1200,
      lastOutcomeAt: 0,
      openUntil: 0,
      halfOpenProbing: false,
    };
    buckets.set(bucket, entry);
  }
  return entry;
}

export function getProviderCircuitState(
  sourceOrProviderId: string,
  explicitProviderId?: string
): CircuitState {
  const bucket = extractProviderBucket(sourceOrProviderId, explicitProviderId);
  const entry = buckets.get(bucket);
  if (!entry) return 'closed';

  if (entry.state === 'open') {
    if (Date.now() >= entry.openUntil) {
      entry.state = 'half_open';
      entry.halfOpenProbing = false;
      return 'half_open';
    }
    return 'open';
  }
  return entry.state;
}

export function isProviderCircuitOpen(
  sourceOrProviderId: string,
  explicitProviderId?: string
): boolean {
  const bucket = extractProviderBucket(sourceOrProviderId, explicitProviderId);
  const state = getProviderCircuitState(bucket);
  if (state !== 'open') return false;
  return true;
}

export function tryAcquireHalfOpenProbe(
  sourceOrProviderId: string,
  explicitProviderId?: string
): boolean {
  const bucket = extractProviderBucket(sourceOrProviderId, explicitProviderId);
  const entry = getOrCreateBucket(bucket);
  const state = getProviderCircuitState(bucket);
  if (state === 'closed') return true;
  if (state === 'open') return false;
  if (entry.halfOpenProbing) return false;
  entry.halfOpenProbing = true;
  return true;
}

export function recordProviderOutcome(
  sourceOrProviderId: string,
  outcome: { ok: boolean; latencyMs?: number; explicitProviderId?: string }
): void {
  const bucket = extractProviderBucket(sourceOrProviderId, outcome.explicitProviderId);
  if (!bucket || bucket === 'unknown') return;
  const entry = getOrCreateBucket(bucket);
  const now = Date.now();
  entry.lastOutcomeAt = now;
  entry.halfOpenProbing = false;

  if (outcome.ok) {
    entry.successCount += 1;
    entry.consecutiveFailures = 0;
    entry.state = 'closed';
    entry.openUntil = 0;
    const sample = Math.max(30, Math.min(8000, outcome.latencyMs ?? entry.ewmaLatencyMs));
    entry.ewmaLatencyMs =
      entry.successCount === 1
        ? sample
        : Math.round(entry.ewmaLatencyMs * (1 - EWMA_ALPHA) + sample * EWMA_ALPHA);
    scheduleCircuitPersist();
    return;
  }

  entry.failureCount += 1;
  entry.consecutiveFailures += 1;
  const total = entry.successCount + entry.failureCount;
  const failRatio = total > 0 ? entry.failureCount / total : 1;

  // Trip circuit OPEN on repeated consecutive failures or overwhelming failure rate (never trip 'dvb' permanently)
  const tripThreshold = bucket === 'dvb' ? 6 : 3;
  if (
    entry.state === 'half_open' ||
    entry.consecutiveFailures >= tripThreshold ||
    (total >= 5 && failRatio >= 0.85 && entry.consecutiveFailures >= 2)
  ) {
    entry.state = 'open';
    entry.openUntil = now + CIRCUIT_COOLDOWN_MS;
  }
  scheduleCircuitPersist();
}

export function getProviderSteeringPenaltyMs(
  sourceOrProviderId: string,
  explicitProviderId?: string
): number {
  const bucket = extractProviderBucket(sourceOrProviderId, explicitProviderId);
  const state = getProviderCircuitState(bucket);
  const entry = buckets.get(bucket);
  const baseEwma = entry?.ewmaLatencyMs ?? BASELINE_PROVIDER_PRIOR_MS[bucket] ?? 1200;

  if (state === 'open') {
    return 120_000 + baseEwma;
  }
  if (state === 'half_open') {
    return 15_000 + baseEwma;
  }
  const prior = BASELINE_PROVIDER_PRIOR_MS[bucket] ?? 1100;
  return Math.round(baseEwma * 0.7 + prior * 0.3);
}

import fs from 'fs';
import { loadDistributedKey, saveDistributedKey } from './distributedStore.ts';

const CIRCUIT_SNAPSHOT_PATH = '/tmp/naimcine-circuit-v1.json';
let circuitPersistTimer: ReturnType<typeof setTimeout> | null = null;

export function exportProviderCircuitBuckets(): ProviderBucketStats[] {
  return Array.from(buckets.values()).map((b) => ({ ...b }));
}

export function importProviderCircuitBuckets(items: ProviderBucketStats[]): void {
  if (!Array.isArray(items)) return;
  const now = Date.now();
  for (const item of items) {
    if (!item || typeof item.bucket !== 'string' || !item.bucket) continue;
    if (item.lastOutcomeAt && now - item.lastOutcomeAt > 6 * 60 * 60 * 1000) continue;
    const state: CircuitState =
      item.state === 'open' && now < (item.openUntil || 0)
        ? 'open'
        : item.state === 'open'
        ? 'half_open'
        : 'closed';
    buckets.set(item.bucket, {
      bucket: item.bucket,
      state,
      consecutiveFailures: Number(item.consecutiveFailures || 0),
      successCount: Number(item.successCount || 0),
      failureCount: Number(item.failureCount || 0),
      ewmaLatencyMs: Number(item.ewmaLatencyMs || BASELINE_PROVIDER_PRIOR_MS[item.bucket] || 1200),
      lastOutcomeAt: Number(item.lastOutcomeAt || now),
      openUntil: Number(item.openUntil || 0),
      halfOpenProbing: false,
    });
  }
}

export function scheduleCircuitPersist(): void {
  if (process.env.VITEST || circuitPersistTimer) return;
  circuitPersistTimer = setTimeout(() => {
    circuitPersistTimer = null;
    const snapshot = exportProviderCircuitBuckets();
    if (snapshot.length === 0) return;
    void fs.promises
      .writeFile(CIRCUIT_SNAPSHOT_PATH, JSON.stringify(snapshot), 'utf8')
      .catch(() => {});
    void saveDistributedKey('circuit:v1', snapshot, 6 * 3600).catch(() => {});
  }, 15_000);
  circuitPersistTimer.unref?.();
}

export function hydrateProviderCircuitFromDisk(): void {
  if (process.env.VITEST) return;
  try {
    if (fs.existsSync(CIRCUIT_SNAPSHOT_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CIRCUIT_SNAPSHOT_PATH, 'utf8'));
      importProviderCircuitBuckets(parsed);
    }
  } catch {
    // ignore corrupt snapshot
  }
  void loadDistributedKey<ProviderBucketStats[]>('circuit:v1')
    .then((remote) => {
      if (remote && remote.length > 0 && buckets.size === 0) {
        importProviderCircuitBuckets(remote);
      }
    })
    .catch(() => {});
}

hydrateProviderCircuitFromDisk();

export function getProviderCircuitSnapshot(): Array<{
  bucket: string;
  state: CircuitState;
  ewmaLatencyMs: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
}> {
  const out: Array<{
    bucket: string;
    state: CircuitState;
    ewmaLatencyMs: number;
    successCount: number;
    failureCount: number;
    consecutiveFailures: number;
  }> = [];
  for (const entry of buckets.values()) {
    const state = getProviderCircuitState(entry.bucket);
    out.push({
      bucket: entry.bucket,
      state,
      ewmaLatencyMs: entry.ewmaLatencyMs,
      successCount: entry.successCount,
      failureCount: entry.failureCount,
      consecutiveFailures: entry.consecutiveFailures,
    });
  }
  return out.sort((a, b) => a.ewmaLatencyMs - b.ewmaLatencyMs);
}

export function resetProviderCircuitBreakers(): void {
  buckets.clear();
}
