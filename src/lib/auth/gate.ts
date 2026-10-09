import { safeNextPath } from "./next-path";

/**
 * Whole-app gate (src/proxy.ts). Pure, so the routing rules are unit-tested.
 *
 * Public without a session: /login, /api/auth/*, /api/ingest and /api/revalidate (machine routes
 * that keep their own CRON_SECRET bearer check),
 * and the private calendar feed /api/workspace/ics (calendar apps can't send cookies; it carries
 * its own HMAC token and its handler rejects requests without one). Static assets never reach
 * the proxy (see the matcher).
 */
export type GateDecision =
  { action: "next" } | { action: "redirect"; location: string } | { action: "unauthorized" };

const PUBLIC_PREFIXES = ["/api/auth/"];
const PUBLIC_EXACT = new Set(["/login", "/api/ingest", "/api/revalidate", "/api/workspace/ics"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function gateDecision(pathname: string, search: string, hasSession: boolean): GateDecision {
  // The old gate's URL keeps working.
  if (pathname === "/unlock") {
    const next = new URLSearchParams(search).get("next");
    return { action: "redirect", location: loginUrl(next) };
  }
  if (pathname === "/login" && hasSession) {
    return { action: "redirect", location: safeNextPath(new URLSearchParams(search).get("next")) };
  }
  if (hasSession || isPublicPath(pathname)) return { action: "next" };
  if (pathname.startsWith("/api/")) return { action: "unauthorized" };
  return { action: "redirect", location: loginUrl(pathname + search) };
}

export function loginUrl(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe === "/" ? "/login" : `/login?next=${encodeURIComponent(safe)}`;
}
