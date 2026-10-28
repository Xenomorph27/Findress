import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";

/** deadlines.source for rows that come from the AI extraction (shown as "AI-extracted"). */
export const AI_DEADLINE_SOURCE = "ai-cfp";
/** field_provenance value for mode/description taken from the AI extraction. */
export const AI_PROVENANCE = "ai-cfp";

/**
 * Make the events table reflect the `extractions` audit table, without ever overriding a source:
 *   - deadlines: an extracted deadline is added only when no real source gives a deadline of the
 *     same kind for that event; stale or superseded AI rows are removed;
 *   - mode / description: filled while the event has none, and kept in step with the latest
 *     extraction while the value is still the AI's own (a newer extraction replaces it); cleared
 *     again if the extraction is gone (the CFP page changed and was re-read). A value from a real
 *     source is never touched.
 * Safe to run any number of times, and after every merge (the merge rewrites these columns).
 */
export async function applyExtractions(db: DbOrTx): Promise<void> {
  // 1) deadlines: drop AI rows that are no longer extracted or that a source now covers
  await db.execute(sql`
    delete from deadlines d
    where d.source = ${AI_DEADLINE_SOURCE}
      and (
        not exists (
          select 1 from extractions x
          where x.event_id = d.event_id and x.field = 'deadline'
            and x.kind = d.kind and x.due_at_utc = d.due_at_utc
        )
        or exists (
          select 1 from deadlines o
          where o.event_id = d.event_id and o.kind = d.kind and o.source <> ${AI_DEADLINE_SOURCE}
        )
      )`);

  // 2) deadlines: add the extracted ones nobody else provides
  await db.execute(sql`
    insert into deadlines (event_id, kind, label, due_at_utc, original_tz, original_text, comment, source)
    select x.event_id, x.kind, x.label, x.due_at_utc, x.original_tz, x.original_text,
           'AI-extracted from the official CFP page (' || x.model || '). Quote: "' || x.quote || '"'
             || case when x.zone_assumed then ' Time zone not stated on the page; shown as end of day Anywhere on Earth.' else '' end,
           ${AI_DEADLINE_SOURCE}
    from extractions x
    where x.field = 'deadline' and x.due_at_utc is not null and x.kind is not null
      and not exists (
        select 1 from deadlines o
        where o.event_id = x.event_id and o.kind = x.kind and o.source <> ${AI_DEADLINE_SOURCE}
      )
      and not exists (
        select 1 from deadlines a
        where a.event_id = x.event_id and a.kind = x.kind and a.due_at_utc = x.due_at_utc
          and a.source = ${AI_DEADLINE_SOURCE}
      )`);

  // 3) mode and description: give back what is no longer extracted, then fill what is empty
  for (const field of ["mode", "description"] as const) {
    const col = sql.raw(field);
    await db.execute(sql`
      update events set ${col} = null, field_provenance = field_provenance - ${field}
      where field_provenance ->> ${field} = ${AI_PROVENANCE}
        and not exists (select 1 from extractions x where x.event_id = events.id and x.field = ${field})`);
    await db.execute(sql`
      update events e
      set ${col} = x.value,
          field_provenance = e.field_provenance || jsonb_build_object(${field}::text, ${AI_PROVENANCE}::text)
      from extractions x
      where x.event_id = e.id and x.field = ${field} and x.value is not null
        and (e.${col} is null or e.${col} = ''
             or (e.field_provenance ->> ${field} = ${AI_PROVENANCE} and e.${col} is distinct from x.value))`);
  }
}
