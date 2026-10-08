/**
 * Local Postgres for development without Neon, using the embedded-postgres binaries.
 *
 *   pnpm db:local          start (initialises .data/pg on first run)
 *   pnpm db:local stop     stop
 *   pnpm db:local status
 *
 * Connection string: postgres://postgres:findress@localhost:54329/findress
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Client } from "pg";

const PORT = 54329;
const PASSWORD = "findress";
const DATA_DIR = path.resolve(".data/pg");
const LOCAL_DATABASE_URL = `postgres://postgres:${PASSWORD}@localhost:${PORT}/findress`;

function binDir(): string {
  const require = createRequire(import.meta.url);
  const platformPkg = {
    win32: "@embedded-postgres/windows-x64",
    darwin:
      process.arch === "arm64"
        ? "@embedded-postgres/darwin-arm64"
        : "@embedded-postgres/darwin-x64",
    linux:
      process.arch === "arm64" ? "@embedded-postgres/linux-arm64" : "@embedded-postgres/linux-x64",
  }[process.platform as "win32" | "darwin" | "linux"];
  if (!platformPkg) throw new Error(`Unsupported platform ${process.platform}`);
  // embedded-postgres does not export package.json; walk up from its entry to its node_modules
  // folder, where pnpm/npm place the platform binary package as a sibling.
  let dir = path.dirname(require.resolve("embedded-postgres"));
  while (path.basename(dir) !== "embedded-postgres" && path.dirname(dir) !== dir)
    dir = path.dirname(dir);
  for (const candidate of [
    path.join(path.dirname(dir), platformPkg),
    path.resolve("node_modules", platformPkg),
  ]) {
    const bin = path.join(candidate, "native", "bin");
    if (existsSync(bin)) return bin;
  }
  throw new Error(`Could not find ${platformPkg} binaries — run pnpm install`);
}

function run(bin: string, args: string[]) {
  const exe = path.join(binDir(), process.platform === "win32" ? `${bin}.exe` : bin);
  const res = spawnSync(exe, args, { stdio: ["ignore", "inherit", "inherit"] });
  return res.status ?? 1;
}

async function ensureDatabase() {
  const client = new Client({
    connectionString: LOCAL_DATABASE_URL.replace("/findress", "/postgres"),
  });
  await client.connect();
  const exists = await client.query("select 1 from pg_database where datname = 'findress'");
  if (exists.rowCount === 0) await client.query("create database findress");
  await client.end();
}

async function main() {
  const cmd = process.argv[2] ?? "start";
  if (cmd === "stop") process.exit(run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "stop"]));
  if (cmd === "status") process.exit(run("pg_ctl", ["-D", DATA_DIR, "status"]));

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    mkdirSync(DATA_DIR, { recursive: true });
    const pwFile = path.resolve(".data/.pgpass-init");
    writeFileSync(pwFile, PASSWORD);
    const code = run("initdb", [
      "-D",
      DATA_DIR,
      "-U",
      "postgres",
      `--pwfile=${pwFile}`,
      "-A",
      "scram-sha-256",
      "-E",
      "UTF8",
      "--locale=C",
    ]);
    rmSync(pwFile, { force: true });
    if (code !== 0) process.exit(code);
  }
  const code = run("pg_ctl", [
    "-D",
    DATA_DIR,
    "-o",
    `-p ${PORT}`,
    "-l",
    path.resolve(".data/pg.log"),
    "-w",
    "start",
  ]);
  if (code !== 0) {
    console.error("pg_ctl start failed (already running? try `pnpm db:local status`)");
    process.exit(code);
  }
  await ensureDatabase();
  console.log(`\nLocal Postgres ready:\n  DATABASE_URL=${LOCAL_DATABASE_URL}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
