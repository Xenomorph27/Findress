import { expect, type Page } from "@playwright/test";

/**
 * Open a page the way the owner does: every fresh visit starts on /login, where the saved
 * sign-in shows as ******** and one click on Sign in resumes it (then the PixelSwap hand-off).
 */
export async function open(page: Page, path: string) {
  await page.goto(path);
  if (new URL(page.url()).pathname === "/login") {
    const field = page.getByLabel("Password", { exact: true });
    await expect(field).toHaveValue("********");
    await page.getByRole("button", { name: "Sign in" }).click();
    const target = new URL(path, "http://x");
    await page.waitForURL((u) => u.pathname === target.pathname, { timeout: 15_000 });
  }
}
