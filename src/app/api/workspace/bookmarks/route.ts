import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isOwnerRequest } from "@/lib/auth/session";
import { listWorkspace, eventExists, removeBookmark, upsertBookmark } from "@/lib/data/workspace";
import { getDb } from "@/lib/db";
import { bookmarkStatuses } from "@/lib/taxonomy";

/**
 * GET    → { items: WorkspaceItem[] }
 * POST   { eventId, status?, position? } → bookmark / move in the pipeline
 * DELETE { eventId } → remove
 */
const Body = z.object({
  eventId: z.number().int().positive(),
  status: z.enum(bookmarkStatuses).nullable().optional(),
  position: z.number().int().min(0).max(100_000).optional(),
});

async function guard(request: Request) {
  if (!(await isOwnerRequest(request)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!getDb()) return Response.json({ error: "db-not-configured" }, { status: 503 });
  return null;
}

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const items = await listWorkspace(getDb()!);
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const db = getDb()!;
  if (!(await eventExists(db, parsed.data.eventId)))
    return Response.json({ error: "not found" }, { status: 404 });
  await upsertBookmark(
    db,
    parsed.data.eventId,
    parsed.data.status ?? "interested",
    parsed.data.position,
  );
  revalidateTag("workspace", { expire: 0 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const parsed = Body.pick({ eventId: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  await removeBookmark(getDb()!, parsed.data.eventId);
  revalidateTag("workspace", { expire: 0 });
  return Response.json({ ok: true });
}
