import { z } from "zod";
import {
  createSessionToken,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
} from "@/lib/auth/session";

/** POST /api/auth/unlock {password} → sets the signed owner cookie (SPEC §8). */
const Body = z.object({ password: z.string().min(1).max(500) });

// Slow down guessing: a small fixed delay on every failure (per instance).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!process.env.APP_PASSWORD || !secret) {
    return Response.json(
      {
        error: "not-configured",
        message: "Set APP_PASSWORD and AUTH_SECRET to enable the owner gate.",
      },
      { status: 503 },
    );
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !(await passwordMatches(parsed.data.password, process.env.APP_PASSWORD))) {
    await sleep(900);
    return Response.json(
      { error: "wrong-password", message: "That password didn’t match." },
      { status: 401 },
    );
  }
  const token = await createSessionToken(secret);
  const secure = new URL(request.url).protocol === "https:";
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_S}${secure ? "; Secure" : ""}`,
        "Cache-Control": "no-store",
      },
    },
  );
}
