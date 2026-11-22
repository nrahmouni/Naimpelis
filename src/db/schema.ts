import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const qoeMetrics = pgTable('qoe_metrics', {
  id: serial('id').primaryKey(),
  sampleId: text('sample_id').notNull(),
  platform: text('platform').notNull(), // web | pwa | android-mobile | android-tv | smart-tv | music-app
  vertical: text('vertical').notNull().default('tv'), // cine | futbol | tv | music | kids | juegos | iptv
  startupMs: integer('startup_ms').notNull(),
  rebufferCount: integer('rebuffer_count').notNull().default(0),
  rebufferMs: integer('rebuffer_ms').notNull().default(0),
  resolution: text('resolution'),
  stallFailoverUsed: boolean('stall_failover_used').notNull().default(false),
  failed: boolean('failed').notNull().default(false),
  sourceUrl: text('source_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const channelHealthSnapshots = pgTable('channel_health_snapshots', {
  trackKey: text('track_key').primaryKey(),
  status: text('status').notNull(), // up | degraded | down | unknown
  latencyMs: integer('latency_ms'),
  failCount: integer('fail_count').notNull().default(0),
  hasVideo: boolean('has_video').notNull().default(true),
  audioOnly: boolean('audio_only').notNull().default(false),
  videoCodec: text('video_codec'),
  audioCodec: text('audio_codec'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
});

export const catalogIndexEntries = pgTable('catalog_index_entries', {
  entryKey: text('entry_key').primaryKey(),
  mediaType: text('media_type').notNull(),
  title: text('title').notNull(),
  tmdbId: integer('tmdb_id'),
  year: text('year'),
  sources: jsonb('sources').$type<string[]>().notNull().default([]),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const adminAuditEvents = pgTable('admin_audit_events', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  severity: text('severity').notNull().default('info'), // info | warn | error
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
