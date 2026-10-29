import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import {
  destructiveStatements,
  directUrl,
  pendingMigrations,
  type JournalEntry,
} from "@/lib/db/deploy-migrations";

// Regression for the ingestion outage after PR #7: production ran code that needed migration
// 0006 on a database still at 0005. Deployments now migrate (additive only) before building.

describe("deploy migration rules", () => {
  it("derives Neon's direct endpoint from the pooled one", () => {
    expect(
      directUrl("postgresql://u:p@ep-x-123-pooler.c-7.us-east-2.aws.neon.tech/db?sslmode=require"),
    ).toBe("postgresql://u:p@ep-x-123.c-7.us-east-2.aws.neon.tech/db?sslmode=require");
    expect(directUrl("postgres://u:p@localhost:5432/db")).toBe("postgres://u:p@localhost:5432/db");
  });

  it("finds pending migrations with drizzle's rule", () => {
    const e = (idx: number, when: number): JournalEntry => ({ idx, when, tag: `000${idx}` });
    const all = [e(0, 100), e(1, 200), e(2, 300)];
    expect(pendingMigrations(all, null).map((m) => m.idx)).toEqual([0, 1, 2]);
    expect(pendingMigrations(all, 200).map((m) => m.idx)).toEqual([2]);
    expect(pendingMigrations(all, 300)).toEqual([]);
  });

  it("flags statements that lose data or break the serving deployment", () => {
    expect(destructiveStatements('DROP TABLE "x";')).toHaveLength(1);
    expect(destructiveStatements('ALTER TABLE "e" DROP COLUMN "c";')).toHaveLength(1);
    expect(destructiveStatements('ALTER TABLE "e" RENAME COLUMN "a" TO "b";')).toHaveLength(1);
    expect(
      destructiveStatements('ALTER TABLE "e" ALTER COLUMN "a" SET DATA TYPE text;'),
    ).toHaveLength(1);
    expect(destructiveStatements("TRUNCATE http_cache;")).toHaveLength(1);
    expect(destructiveStatements("DELETE FROM notes;")).toHaveLength(1);
    // Additive or harmless: allowed.
    expect(destructiveStatements('CREATE TABLE "a" ("id" serial);')).toEqual([]);
    expect(destructiveStatements('ALTER TABLE "e" ADD COLUMN "c" text;')).toEqual([]);
    expect(destructiveStatements('ALTER TABLE "b" DROP CONSTRAINT "b_pkey";')).toEqual([]);
    expect(destructiveStatements('ALTER TABLE "b" ALTER COLUMN "e" DROP NOT NULL;')).toEqual([]);
    expect(destructiveStatements("-- DROP TABLE x\nCREATE INDEX i ON t (c);")).toEqual([]);
  });

  it("every migration in the repo is additive (so a fresh database migrates on deploy)", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: JournalEntry[];
    };
    for (const m of journal.entries)
      expect(destructiveStatements(readFileSync(`drizzle/${m.tag}.sql`, "utf8")), m.tag).toEqual(
        [],
      );
  });
});

describe("scripts/migrate-on-deploy.ts against a database at migration 0005", () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  /** A copy of ./drizzle holding only the first `count` migrations (+ optional extra files). */
  function migrationsCopy(count: number) {
    const dir = mkdtempSync(path.join(tmpdir(), "findress-mig-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    cpSync("drizzle", dir, { recursive: true });
    const journalPath = path.join(dir, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries = journal.entries.slice(0, count);
    writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    return { dir, journal, journalPath };
  }

  async function databaseAt(count: number, port: number) {
    const db = await PGlite.create();
    await migrate(drizzle(db), { migrationsFolder: migrationsCopy(count).dir });
    const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 4 });
    await server.start();
    cleanups.push(async () => {
      await server.stop();
      await db.close();
    });
    return db;
  }

  // Async: the throwaway database is served by this test process, so it must keep running.
  const run = (port: number, dir?: string) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "scripts/migrate-on-deploy.ts"],
        {
          env: {
            ...process.env,
            VERCEL: "1",
            VERCEL_ENV: "production",
            DATABASE_URL: `postgres://postgres:x@127.0.0.1:${port}/postgres`,
            DATABASE_URL_UNPOOLED: "",
            ...(dir ? { MIGRATIONS_DIR: dir } : {}),
          },
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
  const hasLease = async (db: PGlite) =>
    (await db.query<{ t: string | null }>("select to_regclass('public.ingest_lease') as t")).rows[0]
      .t !== null;

  it("applies the missing additive migration, then the ingest lease table exists", async () => {
    const db = await databaseAt(6, 54471); // 0000–0005: production's state after PR #7
    expect(await hasLease(db)).toBe(false);
    const out = await run(54471);
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toMatch(/applying 0006_review_fixes/);
    expect(out.stdout).toMatch(/all \d+ tables present/);
    expect(await hasLease(db)).toBe(true);
    // A second build has nothing to do.
    const again = await run(54471);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toMatch(/schema up to date/);
  }, 120_000);

  it("refuses a destructive pending migration and changes nothing", async () => {
    const db = await databaseAt(7, 54472);
    const { dir, journal, journalPath } = migrationsCopy(7);
    const last = journal.entries.at(-1);
    journal.entries.push({ ...last, idx: 7, when: last.when + 1000, tag: "0007_drop_cache" });
    writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    writeFileSync(path.join(dir, "0007_drop_cache.sql"), 'DROP TABLE "http_cache";');
    cpSync(path.join(dir, "meta/0006_snapshot.json"), path.join(dir, "meta/0007_snapshot.json"));
    const out = await run(54472, dir);
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/not additive.*\n.*0007_drop_cache: DROP TABLE "http_cache"/);
    expect(
      (await db.query<{ t: string | null }>("select to_regclass('public.http_cache') as t")).rows[0]
        .t,
    ).not.toBeNull();
  }, 120_000);

  it("does nothing outside Vercel", () => {
    const out = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/migrate-on-deploy.ts"],
      { encoding: "utf8", env: { ...process.env, VERCEL: "", MIGRATE_ON_BUILD: "" } },
    );
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/not a Vercel build; skipped/);
  }, 60_000);
});
