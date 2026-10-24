import { Page } from "@playwright/test";
import { expect, settingsTab, test } from "./fixtures";

// Light, Dark and Match Windows: chosen in Settings › General, kept on this
// computer, and never used for printing.

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const colours = (page: Page) => page.getByRole("group", { name: "Colours" });

test("the app starts light; Dark darkens it and is remembered on this computer", async ({ page }) => {
  expect(await theme(page)).toBe("light");
  expect(await token(page, "--md-surface")).toBe("#f6fbf4");

  await settingsTab(page, "General");
  await colours(page).getByRole("button", { name: "Dark" }).click();
  expect(await theme(page)).toBe("dark");
  expect(await token(page, "--md-surface")).toBe("#0f1511");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(28, 33, 29)");

  await page.reload();
  await expect(page.locator(".nav-rail")).toBeVisible();
  expect(await theme(page)).toBe("dark");
});

test("printing uses the light colours even in Dark", async ({ page }) => {
  await settingsTab(page, "General");
  await colours(page).getByRole("button", { name: "Dark" }).click();
  await page.emulateMedia({ media: "print" });
  expect(await token(page, "--md-surface")).toBe("#f6fbf4");
  expect(await token(page, "--md-on-surface")).toBe("#181d19");
});

test("Match Windows follows Windows' own light or dark setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await settingsTab(page, "General");
  await colours(page).getByRole("button", { name: "Match Windows" }).click();
  expect(await theme(page)).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => theme(page)).toBe("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => theme(page)).toBe("light");
});
