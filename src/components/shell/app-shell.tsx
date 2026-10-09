import { type ReactNode, Suspense } from "react";
import { type RouteAccentKey, routeAccentCss } from "@/lib/theme/route-accents";
import { RouteAccentSync } from "./route-accent-sync";

// First paint: route tints from the markers, and the full-bleed sign-in screen hides the site
// header and footer. After hydration RouteAccentSync owns both (data-chrome + inline --screen),
// because routes kept alive in the background leave their markers in the DOM.
const CSS =
  routeAccentCss() +
  '[data-app-shell]:not([data-chrome]):has([data-route-accent="login"])>:is(header,footer),' +
  '[data-app-shell][data-chrome="hidden"]>:is(header,footer){display:none}';

/**
 * Root of the app. Sets --screen once for the whole tree (header, page, footer) from the route
 * marker below; the default (landing teal) lives on :root.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div data-app-shell className="flex min-h-dvh flex-col">
      <style>{CSS}</style>
      {/* Reads the pathname (request data), so it streams in; it renders nothing. */}
      <Suspense fallback={null}>
        <RouteAccentSync />
      </Suspense>
      {children}
    </div>
  );
}

/** Hidden marker a top-level route renders in its layout to pick its accent. */
export function RouteAccent({ route }: { route: RouteAccentKey }) {
  return <span hidden data-route-accent={route || "home"} />;
}
