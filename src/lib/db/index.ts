import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle from db.transaction(); query helpers accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

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
      // `pg` already treats require/prefer/verify-ca as verify-full; saying so keeps that behavior
      // when a future major version switches to libpq semantics.
      connectionString: url.replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full"),
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      // Neon's certificates chain to a public CA, so remote connections verify them.
      ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: true },
    });
    pool.on("error", (err) => console.error("[db] idle client error", err.message));
    // Fluid compute: lets Vercel keep the function alive until idle connections have closed.
    // A no-op everywhere except a Vercel deployment.
    attachDatabasePool(pool);
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
