import { expect, test as setup } from "@playwright/test";

/** Signs in once through the real form and saves the session for the other projects. */
setup("sign in", async ({ page }) => {
  const password = process.env.APP_PASSWORD;
  expect(password, "APP_PASSWORD must be set (.env.local)").toBeTruthy();
  await page.goto("/login");
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.context().storageState({ path: ".data/e2e-auth.json" });
});
