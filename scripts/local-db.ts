/**
 * Local Postgres for development without Neon: PGlite (Postgres compiled to WASM, no native
 * binaries, no install scripts) served over the Postgres wire protocol.
 *
 *   pnpm db:local          start in the foreground (Ctrl+C stops it); data in .data/pglite
 *   pnpm db:local status   is something listening on the port?
 *
 * Connection string: postgres://postgres:findress@localhost:54329/findress
 * (PGlite serves a single database and does not check the password, so the same URL as before
 * works; run `pnpm db:migrate` once against a fresh data directory.)
 */
import { mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = 54329;
const HOST = "127.0.0.1";
const DATA_DIR = path.resolve(".data/pglite");
const LOCAL_DATABASE_URL = `postgres://postgres:findress@localhost:${PORT}/findress`;
// The app (pg Pool, up to 10 clients) and `next build` workers connect at the same time; the
// server multiplexes them onto the single PGlite connection.
const MAX_CONNECTIONS = 32;

function listening(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function main() {
  const cmd = process.argv[2] ?? "start";
  if (cmd === "status") {
    const up = await listening();
    console.log(up ? `Listening on ${HOST}:${PORT}` : "Not running");
    process.exit(up ? 0 : 3);
  }
  if (cmd !== "start") {
    console.error(`Unknown command "${cmd}". Use: pnpm db:local [start|status]`);
    process.exit(2);
  }
  if (await listening()) {
    console.error(`Port ${PORT} is already in use (already running? try \`pnpm db:local status\`)`);
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const db = await PGlite.create(DATA_DIR);
  const server = new PGLiteSocketServer({
    db,
    host: HOST,
    port: PORT,
    maxConnections: MAX_CONNECTIONS,
  });
  await server.start();
  console.log(`\nLocal Postgres (PGlite) ready:\n  DATABASE_URL=${LOCAL_DATABASE_URL}\n`);
  console.log("Press Ctrl+C to stop.");

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
