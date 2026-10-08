import { isOwnerRequest, SESSION_COOKIE } from "@/lib/auth/session";

/** GET → { owner }   ·   DELETE → lock (clears the cookie). */
export async function GET(request: Request) {
  return Response.json(
    { owner: await isOwnerRequest(request) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        "Cache-Control": "no-store",
      },
    },
  );
}
