/**
 * Run ingestion locally against DATABASE_URL.
 *
 *   pnpm ingest                         # every step, no time limit
 *   pnpm ingest --steps=ccfddl,huggingface
 *   pnpm ingest --steps=cfp --budget=300 # seconds
 *
 * Prints counts per source, the number of workshops and 10 upcoming deadlines to sanity-check.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to .env.local (or run `pnpm db:local`).");
    process.exit(1);
  }
  const { getDb, closeDb } = await import("../src/lib/db");
  const { runIngestion, parseSteps } = await import("../src/lib/ingest/run");
  const { summarize } = await import("../src/lib/ingest/summary");
  const db = getDb()!;

  const steps = parseSteps(arg("steps") ?? arg("source"));
  const budget = arg("budget");
  const t0 = Date.now();
  const reports = await runIngestion(db, {
    steps,
    budgetMs: budget ? Number(budget) * 1000 : undefined,
    log: (m) => console.log(m),
  });

  console.log("\n=== Steps ===");
  for (const r of reports) {
    const stats = Object.entries(r.stats)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(
      `${r.ok ? "✓" : "✗"} ${r.step.padEnd(12)} ${String(r.items).padStart(5)} items  ${(r.durationMs / 1000).toFixed(1)}s  ${stats}${r.error ? `  ERROR: ${r.error}` : ""}`,
    );
    for (const w of r.warnings.slice(0, 5)) console.log(`    ! ${w}`);
    if (r.warnings.length > 5) console.log(`    … ${r.warnings.length - 5} more warnings`);
  }

  const s = await summarize(db);
  console.log("\n=== Database ===");
  console.log(
    `events: ${s.events}  (conferences ${s.conferences}, workshops ${s.workshops}, other ${s.other})`,
  );
  console.log(
    `with upcoming deadline: ${s.upcoming}   with CFP text: ${s.withCfp}   geocoded: ${s.geocoded}`,
  );
  console.log(
    "by source:",
    Object.entries(s.bySource)
      .map(([k, v]) => `${k}=${v}`)
      .join("  "),
  );
  console.log("\n=== Next 10 submission deadlines ===");
  for (const d of s.nextDeadlines) {
    console.log(
      `${d.dueAtUtc.toISOString().replace("T", " ").slice(0, 16)} UTC  ${d.kind.padEnd(9)} ${d.acronym} ${d.year}  (${d.originalText ?? ""} ${d.originalTz ?? "tz n/a"}) [${d.source}]`,
    );
  }
  console.log(`\nTotal ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // Best effort: tell a running app to drop its cached data.
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && process.env.CRON_SECRET) {
    try {
      await fetch(`${site.replace(/\/$/, "")}/api/revalidate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      /* app not running — fine */
    }
  }
  await closeDb();
  if (reports.some((r) => !r.ok)) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
