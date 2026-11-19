import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
  var _postgresDb: NodePgDatabase<typeof schema> | undefined;
}

export function isCloudSqlConfigured(): boolean {
  return Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_USER &&
      process.env.SQL_PASSWORD &&
      process.env.SQL_DB_NAME
  );
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (global._postgresDb) return global._postgresDb;

  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      port: Number(process.env.SQL_PORT || 5432),
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      ssl: process.env.SQL_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });

    global._postgresPool.on('error', (err) => {
      console.warn(
        'Unexpected error on idle SQL pool client:',
        err instanceof Error ? err.message : String(err)
      );
    });
  }

  global._postgresDb = drizzle(global._postgresPool, { schema });
  return global._postgresDb;
}
