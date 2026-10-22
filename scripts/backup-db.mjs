/**
 * Manual backup of the Neon database with the official postgres Docker image (no local Postgres
 * install needed). Writes .data/backups/neon-production-<timestamp>.dump (custom format, restore
 * with pg_restore) and checks that it lists every table.
 *
 *   pnpm backup:neon                      # production, from .env.neon (DATABASE_URL_UNPOOLED)
 *   node scripts/backup-db.mjs .env.other # another env file
 *
 * Needs Docker Desktop running. Uses the direct (non-pooled) connection, as pg_dump requires.
 * Read-only: it never writes to the database. The dump may contain secrets-adjacent data (notes,
 * chats): keep it out of git (.data/ is ignored).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const envFile = process.argv[2] ?? ".env.neon";
const vars = parseEnv(readFileSync(envFile, "utf8"));
const url = vars.DATABASE_URL_UNPOOLED ?? vars.DATABASE_URL;
if (!url) {
  console.error(`No DATABASE_URL_UNPOOLED/DATABASE_URL in ${envFile}`);
  process.exit(2);
}
if (/-pooler\./.test(url)) {
  console.error(
    "Refusing a pooled URL: pg_dump needs the direct connection (DATABASE_URL_UNPOOLED).",
  );
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const dir = path.resolve(".data/backups");
mkdirSync(dir, { recursive: true });
const name = `neon-production-${stamp}.dump`;
const env = { ...process.env, NEON_DIRECT: url, MSYS_NO_PATHCONV: "1" };
const mount = `${dir}:/backups`;

const dump = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-e",
    "NEON_DIRECT",
    "-v",
    mount,
    "postgres:18",
    "sh",
    "-c",
    `pg_dump "$NEON_DIRECT" -Fc --no-owner --no-privileges -f /backups/${name}`,
  ],
  { env, stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" },
);
if (dump.status !== 0) {
  console.error((dump.stderr ?? "").replace(/postgres(ql)?:\/\/\S+/g, "<hidden>"));
  console.error("Backup FAILED (is Docker Desktop running?)");
  process.exit(1);
}
const list = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${dir}:/backups:ro`,
    "postgres:18",
    "pg_restore",
    "-l",
    `/backups/${name}`,
  ],
  { encoding: "utf8" },
);
const tables = (list.stdout ?? "").split("\n").filter((l) => l.includes("TABLE DATA")).length;
const mb = (statSync(path.join(dir, name)).size / 1e6).toFixed(1);
console.log(`Backup OK: .data/backups/${name} (${mb} MB, ${tables} tables)`);
if (tables < 16) {
  console.error("Warning: fewer tables than expected (16). Check the backup before relying on it.");
  process.exit(1);
}
