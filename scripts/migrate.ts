/**
 * Apply Drizzle migrations from ./drizzle to DATABASE_URL.
 *   pnpm db:migrate
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (add it to .env.local or run `pnpm db:local`).");
    process.exit(1);
  }
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { getDb, closeDb } = await import("../src/lib/db");
  const db = getDb()!;
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
