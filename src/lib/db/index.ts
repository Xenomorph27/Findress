import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

export class DbUnavailableError extends Error {
  constructor(message = "DATABASE_URL is not configured") {
    super(message);
    this.name = "DbUnavailableError";
  }
}

const globalForDb = globalThis as unknown as { __findressPool?: Pool; __findressDb?: Db };

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Returns the shared Drizzle client, or null when no DATABASE_URL is set (UI then shows empty states). */
export function getDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForDb.__findressDb) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    pool.on("error", (err) => console.error("[db] idle client error", err.message));
    globalForDb.__findressPool = pool;
    globalForDb.__findressDb = drizzle(pool, { schema });
  }
  return globalForDb.__findressDb;
}

export function requireDb(): Db {
  const db = getDb();
  if (!db) throw new DbUnavailableError();
  return db;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__findressPool?.end();
  globalForDb.__findressPool = undefined;
  globalForDb.__findressDb = undefined;
}

export { schema };
