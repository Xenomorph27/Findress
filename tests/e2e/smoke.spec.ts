import { expect, test } from "@playwright/test";
import { open } from "./open";

/**
 * Smoke tests against a running build (pnpm build && pnpm test:e2e).
 * They assume a populated database; empty-state rendering is accepted where noted.
 */

test("landing renders hero, search and next deadlines", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("FIndress");
  await expect(
    page.getByText("Every AI/ML venue on Earth.").filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next deadlines" })).toBeVisible();
});

test("explore filters sync to the URL and search narrows results", async ({ page, isMobile }) => {
  await open(page, "/explore");
  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search venues" });
  await search.fill("zzzz-no-such-venue");
  await expect(page.getByText("Nothing in orbit")).toBeVisible();
  await expect(page).toHaveURL(/q=zzzz-no-such-venue/);
  if (!isMobile) {
    await search.fill("");
    await page.getByRole("button", { name: /^NLP/ }).first().click();
    await expect(page).toHaveURL(/subfield=nlp/);
  }
});

test("API returns JSON when signed in", async ({ request }) => {
  const res = await request.get("/api/events?limit=3");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(Array.isArray(data.items)).toBe(true);
  expect(data.limit).toBe(3);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("every page redirects to /login with next", async ({ page }) => {
    for (const path of ["/", "/explore?tab=journals", "/c/icml-2026", "/j/jmlr", "/workspace"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login(\?next=|$)/);
    }
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("API routes answer 401; public routes stay open", async ({ request }) => {
    for (const path of [
      "/api/events?limit=1",
      "/api/journals?limit=1",
      "/api/workspace/bookmarks",
    ]) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(401);
    }
    expect((await request.post("/api/chat", { data: { messages: [] } })).status()).toBe(401);
    expect((await request.get("/api/auth/session")).ok()).toBeTruthy();
    expect((await request.get("/api/ingest", { maxRedirects: 0 })).status()).toBe(401);
  });

  test("a wrong password shows an inline error", async ({ page }) => {
    await page.goto("/login?next=/sources");
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-it");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("login-error")).toContainText("didn’t match");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)sources/);
  });
});

test("insights and sources render", async ({ page }) => {
  await open(page, "/insights");
  await expect(page.getByRole("heading", { name: "The shape of the year" })).toBeVisible();
  await open(page, "/sources");
  await expect(page.getByRole("heading", { name: "Sources", level: 1 })).toBeVisible();
});

test("no horizontal overflow on key pages", async ({ page }) => {
  for (const path of [
    "/",
    "/explore",
    "/explore?tab=journals",
    "/j/jmlr",
    "/insights",
    "/sources",
  ]) {
    await open(page, path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("journals tab, special issues tab and a journal page", async ({ page, request }) => {
  await open(page, "/explore?tab=journals");
  await expect(page.getByRole("tab", { name: "Journals" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText(/\d+ journals/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Special issues" }).click();
  await expect(page).toHaveURL(/tab=special/);

  await open(page, "/j/jmlr");
  await expect(page.getByRole("heading", { level: 1, name: "JMLR" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aims & scope" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();

  const res = await request.get("/api/journals?limit=2&jsort=hindex");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.items).toHaveLength(2);
  expect(data.items[0].hIndex).toBeGreaterThanOrEqual(data.items[1].hIndex);
});

test("route tint follows client-side navigation", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop nav");
  const screen = () =>
    page.evaluate(() =>
      getComputedStyle(document.querySelector("[data-app-shell]")!)
        .getPropertyValue("--screen")
        .trim()
        .toLowerCase(),
    );
  await open(page, "/insights");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const [label, color] of [
    ["Sources", "#38bdf8"],
    ["Explore", "#f25bd0"],
    ["Workspace", "#f5b84b"],
    ["Explore", "#f25bd0"],
  ] as const) {
    await nav.getByRole("link", { name: label }).click();
    await page.waitForURL(`**/${label.toLowerCase()}`);
    await expect.poll(screen).toBe(color);
  }
  await expect(page.getByRole("banner")).toBeVisible();
});
