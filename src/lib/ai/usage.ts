import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { chats, chatUsage } from "@/lib/db/schema";

/** Messages allowed per rolling hour (cost guard, SPEC §6). */
export function hourlyLimit(): number {
  const n = Number(process.env.CHAT_RATE_LIMIT_PER_HOUR ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function checkRateLimit(
  db: Db,
): Promise<{ ok: boolean; used: number; limit: number }> {
  const since = new Date(Date.now() - 3600_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatUsage)
    .where(gte(chatUsage.createdAt, since));
  const used = Number(row?.n ?? 0);
  const limit = hourlyLimit();
  return { ok: used < limit, used, limit };
}

export async function recordUsageStart(db: Db, scope: string): Promise<number> {
  const [row] = await db.insert(chatUsage).values({ scope }).returning({ id: chatUsage.id });
  return row.id;
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

export async function saveChat(db: Db, scope: string, eventId: number | null, messages: unknown[]) {
  await db
    .insert(chats)
    .values({ scope, eventId, messages, updatedAt: new Date() })
    .onConflictDoUpdate({ target: chats.scope, set: { messages, updatedAt: new Date() } });
}

export async function clearChat(db: Db, scope: string) {
  await db.delete(chats).where(and(eq(chats.scope, scope)));
}
