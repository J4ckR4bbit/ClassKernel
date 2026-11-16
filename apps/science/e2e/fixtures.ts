import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Fails a test if anything reaches the browser console as an error, even when its own checks pass. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await use(page);
    expect(errors, "errors in the browser console").toEqual([]);
  },
});

export { expect };

/** Open a tool from its card on the home page. */
export async function openTool(page: Page, name: string) {
  await page.goto("/");
  await page.locator(".tool-card", { hasText: name }).click();
  await expect(page.locator(".top-bar-title")).toHaveText(name);
}
