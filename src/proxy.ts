import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Owner gate (SPEC §8). Browsing stays public; the workspace, the assistant, notes and
 * bookmarks require the signed owner cookie set by /unlock. Route handlers re-check too.
 * The calendar feed carries its own token, and /api/ingest accepts CRON_SECRET, so both are
 * left to their handlers.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, process.env.AUTH_SECRET)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/workspace/ics") return NextResponse.next();
    return NextResponse.json(
      { error: "unauthorized", message: "Unlock FIndress first." },
      { status: 401 },
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/workspace/:path*", "/api/workspace/:path*", "/api/chat/:path*"],
};
