/**
 * Runs before `next build` on Vercel (package.json "vercel-build", set as the build command in
 * vercel.json): brings the deployment's database up to the schema of the code being deployed.
 *
 * - Pending ADDITIVE migrations are applied (one transaction, drizzle's own migrator).
 * - A pending migration that drops, truncates, deletes, renames or retypes is refused: the build
 *   fails with instructions, and the previous deployment keeps serving. Apply such a migration by
 *   hand after a backup (`pnpm backup:neon && pnpm db:migrate:neon`), then redeploy.
 * - Afterwards every table of the latest schema snapshot must exist, or the build fails.
 * - Concurrent builds against the same database are serialized with an advisory lock.
 *
 * Any failure fails the build, so new code never goes live on an older schema.
 * Outside Vercel (local `pnpm build`, CI) it does nothing unless MIGRATE_ON_BUILD=1.
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import {
  destructiveStatements,
  directUrl,
  pendingMigrations,
  snapshotTables,
  type JournalEntry,
} from "../src/lib/db/deploy-migrations";

const LOCK_KEY = 726_003;
/** Tests point this at a copy; deployments always use ./drizzle. */
const DIR = process.env.MIGRATIONS_DIR || "drizzle";
const log = (m: string) => console.log(`[migrate-on-deploy] ${m}`);
const fail = (m: string): never => {
  console.error(`[migrate-on-deploy] FAILED: ${m}`);
  process.exit(1);
};
const hide = (m: string) => m.replace(/postgres(ql)?:\/\/\S+/g, "<connection string>");

async function main() {
  if (!process.env.VERCEL && process.env.MIGRATE_ON_BUILD !== "1") {
    log("not a Vercel build; skipped");
    return;
  }
  const env = process.env.VERCEL_ENV || "unknown";
  const pooled = process.env.DATABASE_URL;
  const url = process.env.DATABASE_URL_UNPOOLED || (pooled ? directUrl(pooled) : null);
  if (!url) {
    // A production deployment without a database would serve empty pages: refuse it.
    if (env === "production") fail("DATABASE_URL is not set for production");
    log(`no DATABASE_URL (${env}); skipped`);
    return;
  }

  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new pg.Client({
    connectionString: url,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: true },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);

    const journal = JSON.parse(readFileSync(`${DIR}/meta/_journal.json`, "utf8")) as {
      entries: JournalEntry[];
    };
    const exists = await client.query(
      "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
    );
    const last = exists.rows[0].present
      ? await client.query("select max(created_at)::bigint as at from drizzle.__drizzle_migrations")
      : null;
    const lastAt = last?.rows[0]?.at != null ? Number(last.rows[0].at) : null;
    const pending = pendingMigrations(journal.entries, lastAt);

    if (pending.length === 0) {
      log(`${env}: schema up to date (${journal.entries.length} migrations)`);
    } else {
      const refused = pending
        .map((m) => ({
          tag: m.tag,
          bad: destructiveStatements(readFileSync(`${DIR}/${m.tag}.sql`, "utf8")),
        }))
        .filter((m) => m.bad.length > 0);
      if (refused.length) {
        fail(
          `pending migration(s) are not additive and must be applied by hand after a backup ` +
            `(pnpm backup:neon && pnpm db:migrate:neon), then redeploy:\n` +
            refused.map((m) => `  ${m.tag}: ${m.bad.join(" | ")}`).join("\n"),
        );
      }
      log(`${env}: applying ${pending.map((m) => m.tag).join(", ")}`);
      await migrate(drizzle(client), { migrationsFolder: DIR });
      log(`${env}: applied ${pending.length} migration(s)`);
    }

    const latest = journal.entries.at(-1)!;
    const snapshot = JSON.parse(
      readFileSync(`${DIR}/meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`, "utf8"),
    ) as { tables: Record<string, unknown> };
    const expected = snapshotTables(snapshot);
    const found = await client.query(
      "select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'p') and n.nspname = 'public'",
    );
    const have = new Set(found.rows.map((r: { t: string }) => r.t));
    const missing = expected.filter((t) => !have.has(t));
    if (missing.length) fail(`tables missing after migrating: ${missing.join(", ")}`);
    log(`${env}: all ${expected.length} tables present`);
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch((err) => fail(hide(err instanceof Error ? err.message : String(err))));
