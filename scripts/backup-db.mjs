/**
 * Manual backup of the Neon database with the official postgres Docker image (no local Postgres
 * install needed). Writes .data/backups/neon-production-<timestamp>.dump (custom format, restore
 * with pg_restore) and checks it by table name: the dump must hold the data of every table the
 * database has. Tables the latest migration snapshot defines but the database lacks are reported
 * as pending migrations (expected for the backup taken just before applying one).
 *
 *   pnpm backup:neon                      # production, from .env.neon (DATABASE_URL_UNPOOLED)
 *   node scripts/backup-db.mjs .env.other # another env file
 *
 * Needs Docker Desktop running. Uses the direct (non-pooled) connection, as pg_dump requires.
 * Read-only: it never writes to the database. The dump may contain secrets-adjacent data (notes,
 * chats): keep it out of git (.data/ is ignored).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
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
if (list.status !== 0) {
  console.error("Backup written, but pg_restore could not read it. Do not rely on it.");
  process.exit(1);
}
// "1234; 0 16400 TABLE DATA public events owner" → "public.events"
const dumped = new Set(
  (list.stdout ?? "")
    .split("\n")
    .map((l) => /TABLE DATA (\S+) (\S+)/.exec(l))
    .filter(Boolean)
    .map((m) => `${m[1]}.${m[2]}`),
);
const live = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-e",
    "NEON_DIRECT",
    "postgres:18",
    "sh",
    "-c",
    `psql "$NEON_DIRECT" -Atc "select schemaname || '.' || tablename from pg_tables where schemaname = 'public' order by 1"`,
  ],
  { env, encoding: "utf8" },
);
if (live.status !== 0) {
  console.error(
    "Backup written, but the table list could not be read to check it. Do not rely on it.",
  );
  process.exit(1);
}
const inDatabase = (live.stdout ?? "")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);
const missing = inDatabase.filter((t) => !dumped.has(t));
const mb = (statSync(path.join(dir, name)).size / 1e6).toFixed(1);
if (!inDatabase.length || missing.length) {
  console.error(
    `Backup INCOMPLETE: .data/backups/${name} has no data for ${missing.join(", ") || "any table"}. Do not rely on it.`,
  );
  process.exit(1);
}
console.log(`Backup OK: .data/backups/${name} (${mb} MB, all ${inDatabase.length} tables)`);

const snapshot = readdirSync("drizzle/meta")
  .filter((n) => /^\d+_snapshot\.json$/.test(n))
  .sort()
  .at(-1);
const pending = Object.keys(
  JSON.parse(readFileSync(`drizzle/meta/${snapshot}`, "utf8")).tables,
).filter((t) => !inDatabase.includes(t));
if (pending.length)
  console.log(`Note: not in the database yet (pending migrations): ${pending.join(", ")}`);
