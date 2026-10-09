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

/**
 * `entry`: a top-level page load that did not come from inside the app (typed URL, bookmark, new
 * tab, link from another site). Every entry starts on /login, signed in or not; a signed-in
 * visitor finds the password field pre-marked and just clicks Sign in. Navigation inside the app
 * (client-side, same-origin) is never sent back to /login.
 */
export function gateDecision(
  pathname: string,
  search: string,
  hasSession: boolean,
  entry = false,
): GateDecision {
  // The old gate's URL keeps working.
  if (pathname === "/unlock") {
    const next = new URLSearchParams(search).get("next");
    return { action: "redirect", location: loginUrl(next) };
  }
  if (isPublicPath(pathname)) return { action: "next" };
  if (entry && !pathname.startsWith("/api/")) {
    return { action: "redirect", location: loginUrl(pathname + search) };
  }
  if (hasSession) return { action: "next" };
  if (pathname.startsWith("/api/")) return { action: "unauthorized" };
  return { action: "redirect", location: loginUrl(pathname + search) };
}

export function loginUrl(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe === "/" ? "/login" : `/login?next=${encodeURIComponent(safe)}`;
}
