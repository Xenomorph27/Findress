import { clearedSessionCookie, cookieSecureFor } from "@/lib/auth/session";

/** POST /api/auth/logout → clears the session cookie. */
export async function POST(request: Request) {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearedSessionCookie(cookieSecureFor(request.url)),
        "Cache-Control": "no-store",
      },
    },
  );
}
