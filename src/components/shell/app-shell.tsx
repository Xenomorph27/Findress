import type { ReactNode } from "react";
import { type RouteAccentKey, routeAccentCss } from "@/lib/theme/route-accents";

// Route tints, plus: the sign-in screen is full-bleed, so it hides the site header and footer.
const CSS =
  routeAccentCss() +
  '[data-app-shell]:has([data-route-accent="login"])>:is(header,footer){display:none}';

/**
 * Root of the app. Sets --screen once for the whole tree (header, page, footer) from the route
 * marker below; the default (landing teal) lives on :root.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div data-app-shell className="flex min-h-dvh flex-col">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

/** Hidden marker a top-level route renders in its layout to pick its accent. */
export function RouteAccent({ route }: { route: RouteAccentKey }) {
  return <span hidden data-route-accent={route || "home"} />;
}
