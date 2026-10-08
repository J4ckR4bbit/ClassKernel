import { Page, expect, test as base } from "@playwright/test";

/**
 * Every test opens the app fresh (a new demo class) and fails if anything
 * reaches the browser console as an error, even when its own checks pass.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/");
    await expect(page.locator(".nav-rail")).toBeVisible();
    await use(page);
    expect(errors, "errors in the browser console").toEqual([]);
  },
});

export { expect };

/** Go to a place in the navigation rail by its label. */
export async function nav(page: Page, label: string) {
  await page.locator(".nav-rail .nav-item", { hasText: label }).click();
}

/**
 * Lift the privacy cover (on by default) if the page puts one up. Tools load
 * lazily, so give it a moment to appear before deciding there isn't one.
 */
export async function reveal(page: Page) {
  const show = page.locator(".privacy-gate-btn").first();
  try {
    await show.waitFor({ state: "visible", timeout: 2_000 });
  } catch {
    return;
  }
  await show.click();
  await expect(show).toHaveCount(0);
}

/** Open a Settings tab by its label. */
export async function settingsTab(page: Page, label: string) {
  await nav(page, "Settings");
  await page.locator(".md-tabs .md-tab", { hasText: label }).click();
}

/** Switch tools on in Settings → Tools, by their ids in src/plugins/registry.ts. */
export async function enableTools(page: Page, ids: string[]) {
  await settingsTab(page, "Tools");
  for (const id of ids) await page.locator(`#plugin-${id}`).check();
}

/** Open a tool from its card on Home. */
export async function openTool(page: Page, name: string) {
  await nav(page, "Home");
  await page.locator(".tool-card", { hasText: name }).click();
  await expect(page.locator(".top-bar-title")).toHaveText(name);
}

/** Every tool, in catalogue order. */
export const ALL_TOOLS = [
  "class-dashboards",
  "parent-reports",
  "test-timer",
  "clock",
  "stopwatch",
  "graph-paper",
  "practical-graph",
  "motion-graph",
  "noise-meter",
];
