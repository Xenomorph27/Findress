import { z } from "zod";
import { isOwnerRequest } from "@/lib/auth/session";
import { getNote, saveNote, targetExists } from "@/lib/data/workspace";
import { getDb } from "@/lib/db";
import { TargetInput, targetFromSearchParams } from "@/lib/workspace/targets";

/**
 * GET ?kind=&id= (or ?eventId=) → { bodyMd, updatedAt }
 * PUT { kind, id, bodyMd } (or { eventId, bodyMd }) → autosave
 */
const Note = z.object({ bodyMd: z.string().max(100_000) });

export async function GET(request: Request) {
  if (!(await isOwnerRequest(request)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: "db-not-configured" }, { status: 503 });
  const target = targetFromSearchParams(new URL(request.url).searchParams);
  if (!target) return Response.json({ error: "bad request" }, { status: 400 });
  return Response.json(await getNote(db, target), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!(await isOwnerRequest(request)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: "db-not-configured" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const target = TargetInput.safeParse(body);
  const note = Note.safeParse(body ?? {});
  if (!target.success || !note.success)
    return Response.json({ error: "bad request" }, { status: 400 });
  if (!(await targetExists(db, target.data)))
    return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(await saveNote(db, target.data, note.data.bodyMd));
}
