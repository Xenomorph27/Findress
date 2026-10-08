import { z } from "zod";
import { isOwnerRequest } from "@/lib/auth/session";
import { eventExists, getNote, saveNote } from "@/lib/data/workspace";
import { getDb } from "@/lib/db";

/** GET ?eventId= → { bodyMd, updatedAt }   ·   PUT { eventId, bodyMd } → autosave */
const Body = z.object({
  eventId: z.number().int().positive(),
  bodyMd: z.string().max(100_000),
});

export async function GET(request: Request) {
  if (!(await isOwnerRequest(request)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: "db-not-configured" }, { status: 503 });
  const eventId = Number(new URL(request.url).searchParams.get("eventId"));
  if (!Number.isInteger(eventId) || eventId <= 0)
    return Response.json({ error: "bad request" }, { status: 400 });
  return Response.json(await getNote(db, eventId), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!(await isOwnerRequest(request)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: "db-not-configured" }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  if (!(await eventExists(db, parsed.data.eventId)))
    return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(await saveNote(db, parsed.data.eventId, parsed.data.bodyMd));
}
