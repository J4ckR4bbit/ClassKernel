import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The website itself: the list of tools, each at an address of its own, and
// the browser's Back and Forward between them.

const TOOL_IDS = ["chemistry-reference", "titration", "galvanic-cell", "practical-graph", "motion-graph", "graph-paper"];

const title = (page: Page) => page.locator(".top-bar-title");
const hash = (page: Page) => page.evaluate(() => location.hash);

test("lists the science tools, and nothing of ClassKernel's class pages or classroom tools", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tool-card")).toHaveCount(TOOL_IDS.length);
  for (const name of ["dashboards", "Parent reports", "Test timer", "Clock", "Stopwatch", "noise meter"]) {
    await expect(page.locator(".tool-card", { hasText: name })).toHaveCount(0);
  }
  await expect(page.locator(".nav-rail")).toHaveCount(0);
  await expect(page).toHaveTitle("ClassKernel Science");
});

test("every tool opens at its own address", async ({ page }) => {
  await page.goto("/");
  const names = await page.locator(".tool-card b").allInnerTexts();
  for (const [i, name] of names.entries()) {
    await page.locator(".tool-card").nth(i).click();
    await expect(title(page)).toHaveText(name);
    expect(await hash(page)).toBe(`#/${TOOL_IDS[i]}`);
    await expect(page.locator(".plugin-loading")).toHaveCount(0);
    await expect(page.getByText("stopped working")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to all tools" }).click();
    await expect(page.locator(".tool-card")).toHaveCount(TOOL_IDS.length);
    expect(await hash(page)).toBe("");
  }
});

test("a tool's address opens it directly, and Back and Forward move between the list and the tool", async ({ page }) => {
  await page.goto("/#/galvanic-cell");
  await expect(title(page)).toHaveText("Galvanic cell animator");
  await expect(page).toHaveTitle("Galvanic cell animator — ClassKernel Science");
  await page.getByRole("button", { name: "Back to all tools" }).click();
  await expect(title(page)).toHaveText("ClassKernel Science");
  await page.goBack();
  await expect(title(page)).toHaveText("Galvanic cell animator");
  await page.goForward();
  await expect(title(page)).toHaveText("ClassKernel Science");
});

test("arriving by a tool's address adds nothing to the history: Back leaves the site", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto("/#/titration");
  await expect(title(page)).toHaveText("Titration simulator");
  await page.goBack();
  expect(page.url()).toBe("about:blank");
});

test("an address that names no tool, or one that stayed in ClassKernel, shows the list", async ({ page }) => {
  await page.goto("/#/test-timer");
  await expect(page.locator(".tool-card")).toHaveCount(TOOL_IDS.length);
  await page.goto("/#/no-such-tool");
  await expect(page.locator(".tool-card")).toHaveCount(TOOL_IDS.length);
});

test("the colours follow the choice at the foot of the list, and the browser remembers it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Colours" }).getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
