import { expect, nav, settingsTab, test } from "./fixtures";

// The frame around every page: the navigation rail, the class menu in the top
// bar, Settings, and the class colour.

test("the navigation rail expands into a drawer and back", async ({ page }) => {
  await page.getByRole("button", { name: "Expand the menu" }).click();
  await expect(page.locator(".nav-rail.expanded")).toBeVisible();
  await expect(page.locator(".nav-rail .nav-label", { hasText: "Seating plans" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse the menu" }).click();
  await expect(page.locator(".nav-rail.expanded")).toHaveCount(0);
});

test("every place in the rail opens its page", async ({ page }) => {
  const titles: Record<string, string> = {
    Attendance: "Attendance",
    Seating: "Seating plans",
    Lesson: "Live lesson",
    Behaviour: "Behaviour log",
    Marks: "Marks",
    Notes: "Class notes",
    Settings: "Settings",
    Home: "ClassKernel",
  };
  for (const [label, title] of Object.entries(titles)) {
    await nav(page, label);
    await expect(page.locator(".top-bar-title")).toHaveText(title);
  }
});

test("the class menu lists the classes, closes on Escape, and creates a class", async ({ page }) => {
  const menuButton = page.locator(".top-bar .class-picker-btn");
  await menuButton.click();
  await expect(page.locator(".top-bar .menu .menu-item", { hasText: "7B-Science" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".top-bar .menu")).toHaveCount(0);

  await menuButton.click();
  await page.locator(".top-bar .menu .menu-item", { hasText: "New class" }).click();
  await page.locator(".modal input").first().fill("9A-Physics");
  await page.locator(".modal button.primary").click();
  await expect(page.locator(".top-bar .class-picker-name")).toHaveText("9A-Physics");

  await menuButton.click();
  await page.locator(".top-bar .menu .menu-item", { hasText: "7B-Science" }).click();
  await expect(page.locator(".top-bar .class-picker-name")).toHaveText("7B-Science");
});

test("every Settings tab opens", async ({ page }) => {
  for (const tab of ["General", "Assessments", "Tools", "Export", "Students", "Room layout", "Seating rules"]) {
    await settingsTab(page, tab);
    await expect(page.locator(".md-tabs .md-tab.active")).toContainText(tab);
  }
});

test("the display size is a segmented button", async ({ page }) => {
  await settingsTab(page, "General");
  const size = page.getByRole("group", { name: "Text and button size" });
  await size.getByRole("button", { name: "125%" }).click();
  await expect(size.locator("button.on")).toHaveText("125%");
  await size.getByRole("button", { name: "100%" }).click();
  await expect(size.locator("button.on")).toHaveText("100%");
});

test("a class colour shows on its Home card and under the top bar", async ({ page }) => {
  await nav(page, "Notes");
  await page.locator("main button.swatch[title*='Purple']").click();
  await nav(page, "Home");
  await expect(page.locator(".class-card").first()).toHaveClass(/coloured/);
  await nav(page, "Attendance");
  const underline = await page.locator(".top-bar").evaluate((e) => getComputedStyle(e).borderBottomColor);
  expect(underline).not.toBe("rgba(0, 0, 0, 0)");
});

test("Export saves a spreadsheet", async ({ page }) => {
  await settingsTab(page, "Export");
  const download = page.waitForEvent("download");
  await page.locator("main button.primary", { hasText: "Export" }).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
});
