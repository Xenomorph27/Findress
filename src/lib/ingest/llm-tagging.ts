import { generateText } from "ai";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { aiConfigError, getChatModel } from "@/lib/ai/model";
import type { Db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { SUBFIELDS } from "@/lib/taxonomy";

/**
 * Optional LLM topic tagging (SPEC §5.6): only when ENABLE_LLM_TAGGING=true, only for events
 * the keyword rules left without a subfield, in small batches, and only labels from our fixed
 * taxonomy are accepted (anything else is dropped by validation).
 */
const IDS = SUBFIELDS.map((s) => s.id) as [string, ...string[]];
const Answer = z.array(z.object({ id: z.number().int(), subfields: z.array(z.enum(IDS)).max(3) }));

export async function llmTagUntagged(db: Db, deadlineMs: number, batchSize = 25, maxBatches = 4) {
  if (process.env.ENABLE_LLM_TAGGING !== "true") return { skipped: "disabled", tagged: 0 };
  const configError = aiConfigError();
  if (configError) return { skipped: configError, tagged: 0 };

  const { model } = getChatModel();
  let tagged = 0;
  for (let b = 0; b < maxBatches && Date.now() + 30_000 < deadlineMs; b++) {
    const rows = await db
      .select({
        id: events.id,
        acronym: events.acronym,
        name: events.name,
        description: events.description,
      })
      .from(events)
      .where(sql`cardinality(${events.subfields}) = 0`)
      .limit(batchSize);
    if (rows.length === 0) break;
    const list = rows
      .map(
        (r) =>
          `${r.id}\t${r.acronym}\t${r.name ?? ""}\t${(r.description ?? "").slice(0, 300).replace(/\s+/g, " ")}`,
      )
      .join("\n");
    const { text } = await generateText({
      model,
      maxOutputTokens: 4000,
      system:
        'You classify AI/ML conferences and workshops into research subfields. Reply with JSON only: an array of {"id": number, "subfields": string[]} using at most 3 ids from the allowed list. Use [] when unsure.',
      prompt: `Allowed subfield ids: ${IDS.join(", ")}\n\nEvents (id, acronym, name, description):\n${list}`,
    });
    const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const parsed = Answer.safeParse(JSON.parse(json || "[]"));
    if (!parsed.success) break;
    const ids = new Set(rows.map((r) => r.id));
    for (const a of parsed.data) {
      if (!ids.has(a.id) || a.subfields.length === 0) continue;
      await db.update(events).set({ subfields: a.subfields }).where(eq(events.id, a.id));
      tagged++;
    }
    // Rows the model left empty would be re-sent forever; tag them as general AI only if the
    // keyword rule did (it didn't), so stop after one pass over them.
    if (parsed.data.every((a) => a.subfields.length === 0)) break;
  }
  return { tagged };
}
