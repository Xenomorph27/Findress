import { NextResponse, type NextRequest } from "next/server";
import { gateDecision } from "@/lib/auth/gate";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * The whole app sits behind the owner login. Pages redirect to /login?next=…; API routes answer
 * 401 JSON (a redirect to an HTML page would break fetch callers). Route handlers re-check the
 * session too. Rules and exceptions live in src/lib/auth/gate.ts.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = await verifySessionToken(token, process.env.AUTH_SECRET);
  const { pathname, search } = request.nextUrl;
  const decision = gateDecision(pathname, search, hasSession);

  if (decision.action === "next") return NextResponse.next();
  if (decision.action === "unauthorized") {
    return NextResponse.json(
      { error: "unauthorized", message: "Log in to FIndress first.", login: "/login" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL(decision.location, request.url));
}

export const config = {
  // Everything except Next's static output and public files (images, fonts, icons, robots).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?|ttf|otf|txt|xml|webmanifest)$).*)",
  ],
};
