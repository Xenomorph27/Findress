import { describe, expect, it } from "vitest";
import { accentForPath, accentForSegment, ROUTE_ACCENTS, routeAccentCss } from "./route-accents";

describe("route accents", () => {
  it("maps each route to its accent", () => {
    expect(accentForPath("/")).toBe("#2EE6C5");
    expect(accentForPath("/explore")).toBe("#F25BD0");
    expect(accentForPath("/c/icml-2026")).toBe("#38BDF8");
    expect(accentForPath("/j/jmlr")).toBe("#A78BFA");
    expect(accentForPath("/insights")).toBe("#2EE6C5");
    expect(accentForPath("/workspace")).toBe("#F5B84B");
    expect(accentForPath("/sources")).toBe("#38BDF8");
    expect(accentForPath("/login")).toBe("#F25BD0");
  });

  it("falls back to the landing teal", () => {
    expect(accentForSegment(null)).toBe(ROUTE_ACCENTS[""]);
    expect(accentForSegment("styleguide")).toBe(ROUTE_ACCENTS[""]);
  });

  it("emits one :has() rule per route", () => {
    const css = routeAccentCss();
    expect(css).toContain('[data-app-shell]:has([data-route-accent="home"]){--screen:#2EE6C5}');
    expect(css).toContain('[data-route-accent="workspace"]){--screen:#F5B84B}');
    expect(css.match(/:has\(/g)).toHaveLength(Object.keys(ROUTE_ACCENTS).length);
  });
});
