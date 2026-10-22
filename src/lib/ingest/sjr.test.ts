import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "@/lib/db";
import { journals } from "@/lib/db/schema";
import { parseScimagoCsv } from "@/lib/sources/scimago";
import { fixture } from "@/lib/sources/test-utils";
import { applySjr } from "./sjr";
import { createTestDb } from "./test-db";

let pg: PGlite;
let db: Db;

beforeAll(async () => {
  ({ pg, db } = await createTestDb());
  const base = { publisher: "x" };
  await db.insert(journals).values([
    {
      slug: "jmlr",
      name: "JMLR",
      abbreviation: "JMLR",
      issnPrint: "1532-4435",
      issnOnline: "1533-7928",
      issns: ["1532-4435", "1533-7928"],
      ...base,
    },
    {
      slug: "nn",
      name: "Neural Networks",
      abbreviation: "NN",
      issnPrint: "0893-6080",
      issnOnline: null,
      issns: [],
      ...base,
    },
    {
      slug: "noq",
      name: "No quartile",
      abbreviation: "NOQ",
      issnPrint: "2222-3333",
      issnOnline: null,
      issns: [],
      ...base,
    },
    // Not in the SCImago file, and already has a value from an earlier import: must be left alone.
    {
      slug: "absent",
      name: "Absent",
      abbreviation: "ABS",
      issnPrint: "1111-2222",
      issnOnline: null,
      issns: [],
      sjrQuartile: "Q2",
      sjrScore: 1.5,
      sjrYear: 2023,
      ...base,
    },
  ]);
}, 60_000);

afterAll(async () => {
  await pg.close();
});

describe("applySjr", () => {
  it("matches journals by ISSN and stores score, quartile, year and provenance", async () => {
    const out = await applySjr(db, parseScimagoCsv(fixture("scimago", "sample-synthetic.csv")));
    expect(out.matched).toBe(3);
    expect(out.noQuartile).toBe(1);
    expect(out.unmatched).toEqual(["absent"]);

    const by = async (slug: string) =>
      (await db.select().from(journals).where(eq(journals.slug, slug)))[0];
    const jmlr = await by("jmlr");
    expect(jmlr).toMatchObject({ sjrQuartile: "Q1", sjrScore: 2.5, sjrYear: 2024 });
    expect(jmlr.fieldProvenance).toMatchObject({ sjrQuartile: "scimago", sjrScore: "scimago" });
    expect(jmlr.sources).toContain("scimago");
    expect(await by("nn")).toMatchObject({ sjrQuartile: "Q1", sjrScore: 1.8 }); // matched by the print ISSN only
    expect(await by("noq")).toMatchObject({ sjrQuartile: null, sjrScore: 0.15 });
  });

  it("never erases a value for a journal the file does not list", async () => {
    const absent = (await db.select().from(journals).where(eq(journals.slug, "absent")))[0];
    expect(absent).toMatchObject({ sjrQuartile: "Q2", sjrScore: 1.5, sjrYear: 2023 });
  });

  it("lets the caller override the data year", async () => {
    await applySjr(db, parseScimagoCsv(fixture("scimago", "sample-synthetic.csv")), 2025);
    const jmlr = (await db.select().from(journals).where(eq(journals.slug, "jmlr")))[0];
    expect(jmlr.sjrYear).toBe(2025);
  });
});
