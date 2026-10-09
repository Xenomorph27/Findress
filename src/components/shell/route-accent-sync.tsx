"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { accentForPath } from "@/lib/theme/route-accents";

/**
 * Keeps --screen (and the full-bleed /login chrome) right after client-side navigation.
 *
 * The first paint is handled in CSS by the route markers (AppShell). But Next keeps routes you
 * have visited mounted but hidden (React Activity), so their markers stay in the DOM, and after
 * a few navigations several markers match at once. This writes the current route's accent inline
 * on the shell (inline beats the :has() rules) and flags whether the header/footer show.
 */
export function RouteAccentSync() {
  const pathname = usePathname();
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>("[data-app-shell]");
    if (!shell) return;
    shell.style.setProperty("--screen", accentForPath(pathname));
    shell.dataset.chrome = pathname === "/login" ? "hidden" : "visible";
  }, [pathname]);
  return null;
}
