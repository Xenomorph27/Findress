import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { ingestLease } from "@/lib/db/schema";

/**
 * A run lease: at most one ingestion run at a time across every entry point (Vercel cron,
 * GitHub Action, "Refresh now", a local `pnpm ingest`). One atomic upsert takes the lease only
 * when it is free or expired, so two runs can never both get it. The expiry covers a run that
 * died without releasing it (a killed function, a closed terminal).
 */
export async function acquireLease(
  db: Db,
  name: string,
  holder: string,
  ttlMs: number,
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlMs);
  const rows = await db
    .insert(ingestLease)
    .values({ name, holder, expiresAt })
    .onConflictDoUpdate({
      target: ingestLease.name,
      set: { holder, expiresAt },
      setWhere: sql`${ingestLease.expiresAt} < now()`,
    })
    .returning({ holder: ingestLease.holder });
  return rows[0]?.holder === holder;
}

/** Release the lease if (and only if) this holder still has it. */
export async function releaseLease(db: Db, name: string, holder: string): Promise<void> {
  await db
    .delete(ingestLease)
    .where(and(eq(ingestLease.name, name), eq(ingestLease.holder, holder)));
}
