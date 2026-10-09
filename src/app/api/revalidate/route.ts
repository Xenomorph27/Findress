import { revalidateTag } from "next/cache";
import { hasCronSecret } from "@/lib/auth/cron";

/** POST /api/revalidate — drop cached event data after an out-of-band ingest (CLI). */
export async function POST(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  revalidateTag("events", { expire: 0 });
  revalidateTag("journals", { expire: 0 });
  revalidateTag("sources", { expire: 0 });
  return Response.json({ ok: true });
}
