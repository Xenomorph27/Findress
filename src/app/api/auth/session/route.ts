import { clearedSessionCookie, cookieSecureFor, isOwnerRequest } from "@/lib/auth/session";

/** GET → { owner }   ·   DELETE → log out (clears the cookie; same as POST /api/auth/logout). */
export async function GET(request: Request) {
  return Response.json(
    { owner: await isOwnerRequest(request) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
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
