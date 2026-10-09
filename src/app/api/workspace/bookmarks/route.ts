import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isOwnerRequest } from "@/lib/auth/session";
import { listWorkspace, removeBookmark, targetExists, upsertBookmark } from "@/lib/data/workspace";
import { getDb } from "@/lib/db";
import { bookmarkStatuses } from "@/lib/taxonomy";
import { TargetInput } from "@/lib/workspace/targets";

/**
 * GET    → { items: WorkspaceItem[] }
 * POST   { kind, id, status?, position? } → bookmark / move in the pipeline
 * DELETE { kind, id } → remove
 * kind is "event" | "journal" | "special"; the original { eventId } shape is still accepted.
 */
const Extra = z.object({
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
  const body = await request.json().catch(() => null);
  const target = TargetInput.safeParse(body);
  const extra = Extra.safeParse(body ?? {});
  if (!target.success || !extra.success)
    return Response.json({ error: "bad request" }, { status: 400 });
  const db = getDb()!;
  if (!(await targetExists(db, target.data)))
    return Response.json({ error: "not found" }, { status: 404 });
  await upsertBookmark(db, target.data, extra.data.status ?? "interested", extra.data.position);
  revalidateTag("workspace", { expire: 0 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const target = TargetInput.safeParse(await request.json().catch(() => null));
  if (!target.success) return Response.json({ error: "bad request" }, { status: 400 });
  await removeBookmark(getDb()!, target.data);
  revalidateTag("workspace", { expire: 0 });
  return Response.json({ ok: true });
}
