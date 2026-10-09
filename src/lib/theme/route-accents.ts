/**
 * One accent per route (docs/DESIGN.md → Lighting system). AppShell writes it to --screen once,
 * and every tint, glow and header hairline reads that variable, so the app re-tints on navigation
 * with no prop threading.
 *
 * Keyed by the first URL segment. Each top-level route renders a hidden <RouteAccent> marker in
 * its layout, and AppShell picks the accent with :has(), so the right tint is already in the
 * prerendered HTML. (Reading the URL in the shell would need a Suspense boundary under
 * cacheComponents.) Nav neighbours are >= 49° apart in OKLCH hue:
 * Explore 233° · Insights 177° · Workspace 79° · Sources (near-grey).
 */
export const ROUTE_ACCENTS = {
  "": "#2EE6C5", // landing — teal
  explore: "#38BDF8", // cyan
  c: "#38BDF8", // conference detail — cyan, same family as explore
  j: "#A78BFA", // journals — violet
  insights: "#2EE6C5", // teal
  workspace: "#F5B84B", // amber
  sources: "#8A94A6", // grey
  login: "#F25BD0", // pink, matches the crystal ball
} as const;

export type RouteAccentKey = keyof typeof ROUTE_ACCENTS;

const DEFAULT_ACCENT = ROUTE_ACCENTS[""];

/** Accent for a route's first segment (null = "/"). Unknown routes get the landing teal. */
export function accentForSegment(segment: string | null | undefined): string {
  const key = (segment ?? "") as RouteAccentKey;
  return ROUTE_ACCENTS[key] ?? DEFAULT_ACCENT;
}

/** Accent for a full pathname ("/c/icml-2026" → cyan). */
export function accentForPath(pathname: string): string {
  return accentForSegment(pathname.split("/")[1] ?? "");
}

/** CSS that sets --screen on the shell from whichever route marker is on the page. */
export function routeAccentCss(): string {
  return Object.entries(ROUTE_ACCENTS)
    .map(
      ([key, accent]) =>
        `[data-app-shell]:has([data-route-accent="${key || "home"}"]){--screen:${accent}}`,
    )
    .join("");
}
