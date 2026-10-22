import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { journals } from "@/lib/db/schema";
import { indexByIssn, matchSjr, type SjrRecord } from "@/lib/sources/scimago";
import { mergeSources } from "./journals";

export interface SjrImportResult {
  total: number;
  matched: number;
  /** Journals with an ISSN match whose quartile SCImago left blank ("-"): score still stored. */
  noQuartile: number;
  unmatched: string[];
}

/**
 * Store SJR score and best quartile on every journal whose ISSN (print, online or any known)
 * appears in the SCImago file. Journals the file does not list keep whatever they had: an import
 * never erases data.
 */
export async function applySjr(
  db: Db,
  records: SjrRecord[],
  yearOverride?: number | null,
): Promise<SjrImportResult> {
  const idx = indexByIssn(records);
  const rows = await db
    .select({
      id: journals.id,
      slug: journals.slug,
      issns: journals.issns,
      issnPrint: journals.issnPrint,
      issnOnline: journals.issnOnline,
    })
    .from(journals);
  const result: SjrImportResult = { total: rows.length, matched: 0, noQuartile: 0, unmatched: [] };
  for (const j of rows) {
    const rec = matchSjr([j.issnPrint, j.issnOnline, ...j.issns], idx);
    if (!rec || (rec.sjr == null && rec.quartile == null)) {
      result.unmatched.push(j.slug);
      continue;
    }
    await db
      .update(journals)
      .set({
        sjrScore: rec.sjr,
        sjrQuartile: rec.quartile,
        sjrYear: yearOverride ?? rec.year,
      })
      .where(eq(journals.id, j.id));
    await mergeSources(db, j.id, "scimago", { sjrQuartile: "scimago", sjrScore: "scimago" });
    result.matched++;
    if (!rec.quartile) result.noQuartile++;
  }
  return result;
}
