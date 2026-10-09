import { z } from "zod";
import {
  attemptsLeft,
  clientIp,
  formatLockRemaining,
  lockRemainingMs,
  MAX_ATTEMPTS,
} from "@/lib/auth/lockout";
import { clearAttempts, readAttempts, recordFailure } from "@/lib/auth/lockout-store";
import { safeNextPath } from "@/lib/auth/next-path";
import {
  cookieSecureFor,
  createSessionToken,
  passwordMatches,
  SESSION_MAX_AGE_S,
  SESSION_ONLY_TOKEN_S,
  sessionCookie,
} from "@/lib/auth/session";
import { getDb } from "@/lib/db";

/**
 * POST /api/auth/login { password, remember, next } → sets the signed session cookie.
 * 5 wrong passwords per IP → 429 for 15 minutes (state in Postgres). The password is never
 * logged or echoed.
 */
const Body = z.object({
  password: z.string().min(1).max(500),
  remember: z.boolean().optional().default(false),
  next: z.string().max(2000).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noStore = { "Cache-Control": "no-store" };

function locked(ms: number) {
  return Response.json(
    {
      error: "locked",
      retryAfterS: Math.ceil(ms / 1000),
      message: `Too many wrong passwords. Try again in ${formatLockRemaining(ms)}.`,
    },
    { status: 429, headers: { ...noStore, "Retry-After": String(Math.ceil(ms / 1000)) } },
  );
}

export async function POST(request: Request) {
  const secret = process.env.AUTH_SECRET;
  const expected = process.env.APP_PASSWORD;
  if (!expected || !secret) {
    return Response.json(
      { error: "not-configured", message: "Set APP_PASSWORD and AUTH_SECRET to enable login." },
      { status: 503, headers: noStore },
    );
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "bad-request", message: "Enter your password." },
      { status: 400, headers: noStore },
    );
  }

  const db = getDb();
  const ip = clientIp(request.headers);
  const now = new Date();
  const record = db ? await readAttempts(db, ip) : null;
  const remaining = lockRemainingMs(record, now);
  if (remaining > 0) return locked(remaining);

  if (!(await passwordMatches(parsed.data.password, expected))) {
    const next = db ? await recordFailure(db, ip, record, now) : null;
    await sleep(600);
    const lockMs = lockRemainingMs(next, now);
    if (lockMs > 0) return locked(lockMs);
    const left = next ? attemptsLeft(next) : MAX_ATTEMPTS;
    return Response.json(
      {
        error: "wrong-password",
        attemptsLeft: left,
        message:
          left <= 2
            ? `That password didn’t match. ${left} ${left === 1 ? "try" : "tries"} left before a 15-minute lockout.`
            : "That password didn’t match.",
      },
      { status: 401, headers: noStore },
    );
  }

  if (db) await clearAttempts(db, ip);
  const remember = parsed.data.remember;
  const token = await createSessionToken(
    secret,
    remember ? SESSION_MAX_AGE_S : SESSION_ONLY_TOKEN_S,
  );
  return Response.json(
    { ok: true, next: safeNextPath(parsed.data.next) },
    {
      headers: {
        ...noStore,
        "Set-Cookie": sessionCookie(token, { remember, secure: cookieSecureFor(request.url) }),
      },
    },
  );
}
