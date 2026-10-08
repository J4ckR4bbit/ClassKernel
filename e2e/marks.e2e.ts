import { Locator } from "@playwright/test";
import { expect, nav, reveal, test } from "./fixtures";

// Marks: creating an assessment, entering marks, and the row highlighting —
// yellow for the student being marked, grey once all their marks are in.

const YELLOW = "rgb(255, 241, 168)"; // --mark-current
const GREY = "rgb(226, 228, 226)"; // --mark-done
const background = (l: Locator) => l.evaluate((e) => getComputedStyle(e).backgroundColor);

test("create an assessment and enter marks; it joins the list", async ({ page }) => {
  await nav(page, "Marks");
  await page.getByRole("button", { name: "New assessment" }).click();
  await page.locator(".modal input").first().fill("E2E quiz");
  await page.locator(".modal button.primary").click();
  await reveal(page);
  const marks = page.locator(".quick-mark-row input.mark-input");
  await marks.nth(0).fill("15");
  await marks.nth(0).press("Enter");
  await expect(marks.nth(1)).toBeFocused();
  await marks.nth(1).fill("18");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("main td", { hasText: "E2E quiz" })).toBeVisible();
});

test("one mark per student: yellow while typing, grey once entered", async ({ page }) => {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: "Mid-term exam" }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
  const rows = page.locator(".quick-mark-row");
  // Marking opens with the cursor in the first row, so that one is yellow.
  expect(await background(rows.nth(0))).toBe(YELLOW);
  // The demo leaves one student without a mark; the rest are grey.
  const i = await rows.evaluateAll((els) => els.findIndex((e) => !e.classList.contains("done")));
  expect(i).toBeGreaterThan(0);
  const row = rows.nth(i);
  expect(await background(rows.nth(i === 1 ? 2 : 1))).toBe(GREY);

  await row.locator("input.mark-input").focus();
  expect(await background(row)).toBe(YELLOW);
  await row.locator("input.mark-input").fill("50");
  await row.locator("input.mark-input").press("Enter");
  await expect(row).toHaveClass(/\bdone\b/);
  expect(await background(row)).toBe(GREY);
  await expect(page.locator(".view-header")).toContainText(`${await rows.count()}/${await rows.count()} entered`);
});

test("marks per question: yellow while typing, grey once every question has a mark", async ({ page }) => {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
  const rows = page.locator(".mark-grid tbody tr");
  const i = await rows.evaluateAll((els) => els.findIndex((e) => !e.classList.contains("done")));
  expect(i).toBeGreaterThanOrEqual(0);
  const row = rows.nth(i);
  const cells = row.locator("input.grid-input");

  await cells.first().focus();
  // The whole row, including the pinned first-name column (the surname keeps its position tint).
  expect(await background(row.locator("td").nth(2))).toBe(YELLOW);
  const n = await cells.count();
  for (let c = 0; c < n - 1; c++) await cells.nth(c).fill("1");
  await expect(row).not.toHaveClass(/\bdone\b/); // one question still blank
  await cells.nth(n - 1).fill("1");
  await expect(row).toHaveClass(/\bdone\b/);
  await page.locator("h1").first().click(); // leave the row
  expect(await background(row.locator("td").nth(2))).toBe(GREY);
});

test("only the students scroll: the headings and average rows stay put", async ({ page }) => {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
  const top = (sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top);
  const before = {
    title: await top(".marking-view .view-header"),
    heading: await top(".mark-grid thead tr:first-child th"),
    average: await top(".mark-grid tfoot tr:last-child th"),
    student: await top(".mark-grid tbody tr:first-child td"),
  };
  await page.locator(".mark-grid-wrap").evaluate((e) => (e.scrollTop = 150));
  expect(await top(".marking-view .view-header")).toBe(before.title);
  expect(await top(".mark-grid thead tr:first-child th")).toBe(before.heading);
  expect(await top(".mark-grid tfoot tr:last-child th")).toBe(before.average);
  expect(await top(".mark-grid tbody tr:first-child td")).toBeLessThan(before.student);
  expect(await page.locator(".main-pane").evaluate((e) => e.scrollTop)).toBe(0);
});

test("the surname column is tinted blue at the top of the list to red at the bottom", async ({ page }) => {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
  const surname = page.locator(".mark-grid tbody td.col-name.second");
  const rgb = async (i: number) => (await background(surname.nth(i))).match(/\d+/g)!.map(Number);
  const [r0, , b0] = await rgb(0);
  const [rN, , bN] = await rgb((await surname.count()) - 1);
  expect(b0).toBeGreaterThan(r0); // blue
  expect(rN).toBeGreaterThan(bN); // red
});
