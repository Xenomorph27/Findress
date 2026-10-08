import { expect, test } from "@playwright/test";

/**
 * Smoke tests against a running build (pnpm build && pnpm test:e2e).
 * They assume a populated database; empty-state rendering is accepted where noted.
 */

test("landing renders hero, search and next deadlines", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every AI/ML");
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next deadlines" })).toBeVisible();
});

test("explore filters sync to the URL and search narrows results", async ({ page, isMobile }) => {
  await page.goto("/explore");
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

test("public API returns JSON", async ({ request }) => {
  const res = await request.get("/api/events?limit=3");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(Array.isArray(data.items)).toBe(true);
  expect(data.limit).toBe(3);
});

test("owner-only routes are protected", async ({ page, request }) => {
  const chat = await request.post("/api/chat", { data: { messages: [] } });
  expect(chat.status()).toBe(401);
  const ws = await request.get("/api/workspace/bookmarks");
  expect(ws.status()).toBe(401);
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/unlock\?next=/);
  await expect(page.getByRole("heading", { name: "Unlock FIndress" })).toBeVisible();
});

test("insights and sources render", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "The shape of the year" })).toBeVisible();
  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: "Sources", level: 1 })).toBeVisible();
});

test("no horizontal overflow on key pages", async ({ page }) => {
  for (const path of ["/", "/explore", "/insights", "/sources"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
