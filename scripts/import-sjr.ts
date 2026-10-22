/**
 * Import SCImago SJR data (once a year) into journals, matching by ISSN.
 *
 *   pnpm sjr:import path/to/scimagojr-2024.csv [--year=2024]      # DATABASE_URL (local)
 *   pnpm sjr:import:neon path/to/scimagojr-2024.csv               # Neon (.env.neon)
 *
 * Download the CSV yourself from https://www.scimagojr.com/journalrank.php ("Download data"),
 * after reading its terms. The app shows "Data: SCImago Journal & Country Rank, source Scopus®".
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const yearArg = process.argv.find((a) => a.startsWith("--year="))?.split("=")[1];
  if (!file) {
    console.error("usage: pnpm sjr:import <scimago.csv> [--year=2024]");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const { parseScimagoCsv } = await import("../src/lib/sources/scimago");
  const { applySjr } = await import("../src/lib/ingest/sjr");
  const { getDb, closeDb } = await import("../src/lib/db");

  const records = parseScimagoCsv(readFileSync(file, "utf8"));
  const fileYear = /\b(20\d{2})\b/.exec(file)?.[1];
  const year = yearArg
    ? Number(yearArg)
    : (records.find((r) => r.year)?.year ?? (fileYear ? Number(fileYear) : null));
  console.log(`read ${records.length} SCImago rows from ${file} (data year ${year ?? "unknown"})`);
  const out = await applySjr(getDb()!, records, year);
  console.log(
    `matched ${out.matched} of ${out.total} journals by ISSN (${out.noQuartile} without a quartile)`,
  );
  if (out.unmatched.length) console.log(`not in the file: ${out.unmatched.join(", ")}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
