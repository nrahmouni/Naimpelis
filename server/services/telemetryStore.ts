import fs from 'fs';
import path from 'path';
import { desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { adminAuditEvents, qoeMetrics } from '../../src/db/schema.ts';
import { logger } from '../utils/logger.ts';
import {
  isDistributedStoreEnabled,
  loadDistributedKey,
  saveDistributedKey,
} from './distributedStore.ts';
import type { QoeSample } from '../routes/health.ts';

export type PersistenceDriver = 'postgres-drizzle' | 'redis-rest' | 'memory-disk';

export interface StoredAuditEvent {
  eventId: string;
  actor: string;
  action: string;
  target: string;
  severity: 'info' | 'warn' | 'error';
  details: Record<string, unknown>;
  createdAt: number;
}

const AUDIT_DISK_PATH = '/tmp/riffantv-admin-audit-v1.json';

let pgPool: pg.Pool | null = null;
let drizzleDb: ReturnType<typeof drizzle> | null = null;
let postgresReady = false;
let postgresInitError: string | null = null;
const memoryAuditLog: StoredAuditEvent[] = [];

function resolvePostgresConnectionString(): string | null {
  const directUrl = String(process.env.DATABASE_URL || '').trim();
  if (directUrl) return directUrl;
  const host = String(process.env.SQL_HOST || '').trim();
  const dbName = String(process.env.SQL_DB_NAME || '').trim();
  const user = String(process.env.SQL_USER || '').trim();
  const password = String(process.env.SQL_PASSWORD || '').trim();
  const port = Number(process.env.SQL_PORT || 5432);
  if (host && dbName && user) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(dbName)}`;
  }
  return null;
}

export async function initializeTelemetryStore(): Promise<void> {
  // Hydrate disk audit fallback first so startup is instant
  try {
    if (fs.existsSync(AUDIT_DISK_PATH)) {
      const raw = await fs.promises.readFile(AUDIT_DISK_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed.slice(0, 100)) {
          if (item && typeof item.eventId === 'string') {
            memoryAuditLog.push(item as StoredAuditEvent);
          }
        }
      }
    }
  } catch {
    // ignore corrupted /tmp audit cache
  }

  const connStr = resolvePostgresConnectionString();
  if (!connStr) return;

  try {
    pgPool = new pg.Pool({
      connectionString: connStr,
      max: 6,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 3_500,
    });
    await pgPool.query('SELECT 1');
    drizzleDb = drizzle(pgPool);
    postgresReady = true;
    postgresInitError = null;
    logger.info('postgres_drizzle_telemetry_store_connected');
  } catch (err) {
    postgresReady = false;
    postgresInitError = err instanceof Error ? err.message : 'Postgres connection failed';
    logger.warn({ err }, 'postgres_drizzle_unavailable_using_fallback');
    try {
      await pgPool?.end();
    } catch {
      // ignore
    }
    pgPool = null;
    drizzleDb = null;
  }
}

export async function closeTelemetryStore(): Promise<void> {
  if (pgPool) {
    try {
      await pgPool.end();
    } catch {
      // ignore
    }
    pgPool = null;
    drizzleDb = null;
    postgresReady = false;
  }
}

export function getTelemetryStorageStatus() {
  const activeDriver: PersistenceDriver = postgresReady
    ? 'postgres-drizzle'
    : isDistributedStoreEnabled()
      ? 'redis-rest'
      : 'memory-disk';

  return {
    activeDriver,
    postgresConfigured: Boolean(resolvePostgresConnectionString()),
    postgresReady,
    postgresInitError,
    redisRestConfigured: isDistributedStoreEnabled(),
    diskFallbackPath: path.basename(AUDIT_DISK_PATH),
    auditLogCount: memoryAuditLog.length,
  };
}

export async function persistQoeSample(
  sample: QoeSample & { vertical?: string }
): Promise<void> {
  if (drizzleDb && postgresReady) {
    try {
      await drizzleDb.insert(qoeMetrics).values({
        sampleId: sample.id,
        platform: sample.platform,
        vertical: sample.vertical || 'tv',
        startupMs: sample.startupMs,
        rebufferCount: sample.rebufferCount,
        rebufferMs: sample.rebufferMs,
        resolution: sample.resolution || null,
        stallFailoverUsed: Boolean(sample.stallFailoverUsed),
        failed: Boolean(sample.failed),
        sourceUrl: sample.sourceUrl || null,
      });
      return;
    } catch (err) {
      logger.debug({ err }, 'qoe_postgres_insert_fallback');
    }
  }

  if (isDistributedStoreEnabled()) {
    await saveDistributedKey(`qoe:latest:${sample.platform}`, sample, 3600).catch(() => {});
  }
}

export async function persistAdminAuditEvent(
  evt: Omit<StoredAuditEvent, 'eventId' | 'createdAt'>
): Promise<StoredAuditEvent> {
  const full: StoredAuditEvent = {
    eventId: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    ...evt,
  };

  memoryAuditLog.unshift(full);
  if (memoryAuditLog.length > 150) memoryAuditLog.pop();

  if (drizzleDb && postgresReady) {
    try {
      await drizzleDb.insert(adminAuditEvents).values({
        eventId: full.eventId,
        actor: full.actor,
        action: full.action,
        target: full.target,
        severity: full.severity,
        details: full.details,
      });
    } catch (err) {
      logger.debug({ err }, 'admin_audit_postgres_insert_error');
    }
  }

  if (isDistributedStoreEnabled()) {
    void saveDistributedKey('admin:audit-recent', memoryAuditLog.slice(0, 50), 86400).catch(() => {});
  }

  void fs.promises
    .writeFile(AUDIT_DISK_PATH, JSON.stringify(memoryAuditLog.slice(0, 100)), 'utf8')
    .catch(() => {});

  return full;
}

export async function loadRecentAdminAuditEvents(limit = 60): Promise<StoredAuditEvent[]> {
  if (drizzleDb && postgresReady) {
    try {
      const rows = await drizzleDb
        .select()
        .from(adminAuditEvents)
        .orderBy(desc(adminAuditEvents.createdAt))
        .limit(limit);
      return rows.map((r) => ({
        eventId: r.eventId,
        actor: r.actor,
        action: r.action,
        target: r.target,
        severity: (r.severity as 'info' | 'warn' | 'error') || 'info',
        details: (r.details || {}) as Record<string, unknown>,
        createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Date.now(),
      }));
    } catch {
      // fall back cleanly
    }
  }

  if (memoryAuditLog.length === 0 && isDistributedStoreEnabled()) {
    const remote = await loadDistributedKey<StoredAuditEvent[]>('admin:audit-recent');
    if (Array.isArray(remote)) {
      memoryAuditLog.push(...remote);
    }
  }

  return memoryAuditLog.slice(0, limit);
}
