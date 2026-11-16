import { Page } from "@playwright/test";
import { expect, settingsTab, test } from "./fixtures";

// Light, Dark and Match Windows, and the green or navy-and-gold colour scheme:
// chosen in Settings › General, kept on this computer, and printing always light.

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const colours = (page: Page) => page.getByRole("group", { name: "Light or dark" });
const scheme = (page: Page) => page.getByRole("group", { name: "Colour scheme" });

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

test("navy and gold replace the green, in Light and Dark, and are remembered on this computer", async ({ page }) => {
  expect(await token(page, "--md-primary")).toBe("#2b6a46");
  await settingsTab(page, "General");
  await scheme(page).getByRole("button", { name: "Navy and gold" }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.palette)).toBe("navy");
  expect(await token(page, "--md-primary")).toBe("#323276");
  // The navigation's "you are here" is the school's gold.
  await expect(page.locator(".nav-item.active .nav-indicator")).toHaveCSS("background-color", "rgb(209, 173, 83)");

  await colours(page).getByRole("button", { name: "Dark" }).click();
  expect(await token(page, "--md-surface")).toBe("#111317");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(30, 32, 35)");
  // The meanings keep their own dark colours.
  expect(await token(page, "--away")).toBe("#f0bf6b");

  await page.reload();
  await expect(page.locator(".nav-rail")).toBeVisible();
  expect(await token(page, "--md-primary")).toBe("#c1c1ff");

  // Printed in the light navy colours.
  await page.emulateMedia({ media: "print" });
  expect(await token(page, "--md-primary")).toBe("#323276");
  await page.emulateMedia({ media: "screen" });

  await settingsTab(page, "General");
  await scheme(page).getByRole("button", { name: "Green" }).click();
  expect(await token(page, "--md-primary")).toBe("#94d5a9");
});
