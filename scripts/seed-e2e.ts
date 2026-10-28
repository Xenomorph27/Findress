/**
 * Small offline fixture for the end-to-end smoke suite in CI: the seed journal list (with
 * h-index values) and a few events with upcoming deadlines. No network.
 *
 *   DATABASE_URL=postgres://…@localhost:5432/… pnpm db:seed-e2e
 *
 * Refuses any database that is not on localhost, so it can never write fixtures into Neon.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error(
      "seed-e2e only writes to a local database (DATABASE_URL host must be localhost).",
    );
    process.exit(2);
  }
  const { eq } = await import("drizzle-orm");
  const { getDb, closeDb } = await import("../src/lib/db");
  const { journals } = await import("../src/lib/db/schema");
  const { upsertSeedJournals } = await import("../src/lib/ingest/journals");
  const { mergeEventInputs } = await import("../src/lib/ingest/merge");
  const { writeMergedEvents } = await import("../src/lib/ingest/persist");
  const { emptyEvent } = await import("../src/lib/ingest/types");
  const db = getDb()!;

  await upsertSeedJournals(db);
  const all = await db.select({ id: journals.id }).from(journals).orderBy(journals.id);
  for (const [i, j] of all.entries())
    await db
      .update(journals)
      .set({ hIndex: 400 - i * 7 })
      .where(eq(journals.id, j.id));

  const year = new Date().getUTCFullYear() + 1;
  const events = [
    ["E2ENLP", "nlp", 30],
    ["E2ECV", "cv", 45],
    ["E2EML", "ml", 60],
  ] as const;
  await writeMergedEvents(
    db,
    mergeEventInputs(
      events.map(([acronym, subfield, days]) => ({
        ...emptyEvent({ source: "huggingface", sourceId: acronym, acronym, year }),
        name: `${acronym} fixture conference`,
        type: "conference" as const,
        subfields: [subfield],
        deadlines: [
          {
            kind: "paper" as const,
            label: null,
            dueAtUtc: new Date(Date.now() + days * 86_400_000).toISOString(),
            originalTz: "UTC",
            originalText: null,
            comment: null,
          },
        ],
      })),
    ),
  );
  console.log(`Seeded ${all.length} journals and ${events.length} events.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
