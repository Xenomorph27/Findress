import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { chats, chatUsage } from "@/lib/db/schema";

/** Messages allowed per rolling hour (cost guard, SPEC §6). */
export function hourlyLimit(): number {
  const n = Number(process.env.CHAT_RATE_LIMIT_PER_HOUR ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** Serializes reservations, so concurrent messages cannot all pass the same count. */
const RESERVE_LOCK_KEY = 726_002;

/**
 * Check the hourly limit and record the message in one step (one transaction under a
 * transaction-scoped advisory lock, which works through Neon's pooler). Background extraction
 * requests (scope "extract") have their own daily cap and do not count here.
 */
export async function reserveChatUsage(
  db: Db,
  scope: string,
  limit = hourlyLimit(),
): Promise<{ ok: true; id: number } | { ok: false; used: number; limit: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${RESERVE_LOCK_KEY})`);
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(chatUsage)
      .where(
        sql`${chatUsage.createdAt} >= now() - interval '1 hour' and ${chatUsage.scope} <> 'extract'`,
      );
    const used = Number(row?.n ?? 0);
    if (used >= limit) return { ok: false as const, used, limit };
    const [ins] = await tx.insert(chatUsage).values({ scope }).returning({ id: chatUsage.id });
    return { ok: true as const, id: ins.id };
  });
}

export async function recordUsageEnd(
  db: Db,
  id: number,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
) {
  await db
    .update(chatUsage)
    .set({ inputTokens: inputTokens ?? null, outputTokens: outputTokens ?? null })
    .where(eq(chatUsage.id, id));
}

export async function loadChat(db: Db, scope: string): Promise<unknown[]> {
  const [row] = await db
    .select({ messages: chats.messages })
    .from(chats)
    .where(eq(chats.scope, scope))
    .limit(1);
  return row?.messages ?? [];
}

export async function saveChat(
  db: Db,
  scope: string,
  target: { eventId?: number | null; journalId?: number | null },
  messages: unknown[],
) {
  await db
    .insert(chats)
    .values({
      scope,
      eventId: target.eventId ?? null,
      journalId: target.journalId ?? null,
      messages,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({ target: chats.scope, set: { messages, updatedAt: new Date() } });
}

export async function clearChat(db: Db, scope: string) {
  await db.delete(chats).where(and(eq(chats.scope, scope)));
}
