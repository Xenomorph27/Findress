/**
 * Screenshot review helper (DESIGN.md quality checks): captures each route in dark + light
 * at 390px and 1440px.
 *
 *   pnpm screenshots / /explore /c/icml-2026          (against http://localhost:3100)
 *   SHOT_BASE=http://localhost:3000 SHOT_OUT=docs/screenshots pnpm screenshots /
 *
 * Options via env: SHOT_BASE, SHOT_OUT (default .data/screenshots), SHOT_FULL=1 for full-page.
 * Pages sit behind the login: the session saved by the e2e setup (.data/e2e-auth.json, written by
 * pnpm test:e2e) is reused when present; /login is always shot signed out.
 * SHOT_MOTION=1 allows motion (WebGL scenes run; the pointer is nudged so deferred scenes start);
 * otherwise shots use prefers-reduced-motion and show the static fallbacks.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = (process.env.SHOT_BASE ?? "http://localhost:3100").replace(/\/$/, "");
const OUT = path.resolve(process.env.SHOT_OUT ?? ".data/screenshots");
const FULL = process.env.SHOT_FULL === "1";
const MOTION = process.env.SHOT_MOTION === "1";
const WIDTHS = [
  { width: 390, height: 844, label: "390" },
  { width: 1440, height: 900, label: "1440" },
];
const THEMES = ["dark", "light"] as const;
const AUTH_STATE = ".data/e2e-auth.json";

function nameFor(route: string) {
  const clean = route.replace(/^\/+/, "").replace(/[/?&=]+/g, "_") || "home";
  return clean.slice(0, 80);
}

async function main() {
  const routes = process.argv.slice(2);
  if (routes.length === 0) routes.push("/");
  mkdirSync(OUT, { recursive: true });
  // With motion on, use the GPU: headless Chrome otherwise rasterises WebGL in software, and the
  // app shows its static fallbacks there on purpose.
  const browser = await chromium.launch(
    MOTION ? { args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] } : {},
  );
  for (const route of routes) {
    for (const theme of THEMES) {
      for (const vp of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
          deviceScaleFactor: 1,
          reducedMotion: MOTION ? "no-preference" : "reduce",
          storageState:
            route.startsWith("/login") || !existsSync(AUTH_STATE) ? undefined : AUTH_STATE,
        });
        const page = await context.newPage();
        // next-themes reads localStorage first; pin the theme explicitly.
        await page.addInitScript((t) => {
          try {
            localStorage.setItem("theme", t);
          } catch {}
        }, theme);
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => {
          if (m.type() === "error") errors.push(m.text());
        });
        await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 60_000 });
        if (MOTION) await page.mouse.move(vp.width / 2, 200);
        await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? (MOTION ? 3500 : 1500)));
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        const file = path.join(OUT, `${nameFor(route)}-${theme}-${vp.label}.png`);
        await page.screenshot({ path: file, fullPage: FULL });
        console.log(
          `${file}${overflow > 0 ? `  ⚠ horizontal overflow ${overflow}px` : ""}${
            errors.length
              ? `  ⚠ ${errors.length} console error(s): ${errors.slice(0, 2).join(" | ")}`
              : ""
          }`,
        );
        await context.close();
      }
    }
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
