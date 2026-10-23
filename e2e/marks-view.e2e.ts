import { Locator, Page } from "@playwright/test";
import { expect, nav, reveal, test } from "./fixtures";

// Looking at marks without changing them: View on a test (the marking grid, or
// the single-mark list, as plain numbers) and the class markbook.

const background = (l: Locator) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
const rgb = async (l: Locator) => (await background(l)).match(/\d+/g)!.map(Number);

async function openTest(page: Page, title: string, button: "View" | "Enter marks") {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: title }).getByRole("button", { name: button }).click();
  await reveal(page);
}

/** The rank cells (the last of the right-pinned columns) of the students. */
const rankCells = (page: Page) => page.locator(".mark-grid tbody td.sticky-right:not(.second):not(.third):not(.fourth):not(.fifth)");

test("View on a per-question test shows the grid's numbers with nothing to type in", async ({ page }) => {
  await openTest(page, "Forces & energy test", "Enter marks");
  const pct = page.locator(".mark-grid tbody td.sticky-right.third");
  const marking = await pct.allTextContents();
  await page.getByRole("button", { name: "Done" }).click();

  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "View" }).click();
  await reveal(page);
  await expect(page.locator(".top-bar-title")).toContainText("Forces & energy test");
  await expect(page.locator(".mark-grid input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit questions" })).toHaveCount(0);
  expect(await pct.allTextContents()).toEqual(marking);
  // No yellow/grey marking highlight on a read-only page.
  await expect(page.locator(".mark-grid tbody tr.done")).toHaveCount(0);

  await page.getByRole("button", { name: "Back to Marks" }).click();
  await expect(page.getByRole("button", { name: "New assessment" })).toBeVisible();
});

test("View on a single-mark test lists mark, %, level and rank, top rank green", async ({ page }) => {
  await openTest(page, "Mid-term exam", "View");
  await expect(page.locator(".mark-grid input")).toHaveCount(0);
  await expect(page.locator(".mark-grid thead")).toContainText("/80");
  const rows = page.locator(".mark-grid tbody tr");
  const first = rows.first().locator("td");
  const mark = Number(await first.nth(3).textContent());
  expect(Number(await first.nth(4).textContent())).toBe(Math.round((mark / 80) * 100));

  const rank = page.locator(".mark-grid tbody td:nth-child(7)");
  const ranks = (await rank.allTextContents()).map((t) => (t.trim() ? Number(t) : null));
  const [r, g, b] = await rgb(rank.nth(ranks.indexOf(1)));
  expect(g).toBeGreaterThan(r); // green
  expect(g).toBeGreaterThan(b);
});

test("Enter marks from a View goes back to the View when done", async ({ page }) => {
  await openTest(page, "Mid-term exam", "View");
  await page.getByRole("button", { name: "Enter marks" }).click();
  await expect(page.locator("input.mark-input").first()).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".top-bar-title")).toContainText("Mid-term exam");
  await expect(page.locator(".mark-grid input")).toHaveCount(0);
});

test("the markbook shows every test, each student's average and rank, and opens a test", async ({ page }) => {
  await nav(page, "Marks");
  const tests = await page.locator("main table.data tbody tr").count();
  await page.getByRole("button", { name: "Markbook" }).click();
  await reveal(page);
  await expect(page.locator(".mark-grid input")).toHaveCount(0);
  await expect(page.locator(".mark-grid thead th.col-test .test-link")).toHaveCount(tests);

  // Each weighted mark sits within the student's own test percentages.
  const rows = page.locator(".mark-grid tbody tr");
  for (let i = 0; i < 3; i++) {
    const cells = (await rows.nth(i).locator("td.col-test").allTextContents()).filter((t) => t.trim()).map(Number);
    const avg = Number(await rows.nth(i).locator("td.final").textContent());
    expect(avg).toBeGreaterThanOrEqual(Math.min(...cells) - 1);
    expect(avg).toBeLessThanOrEqual(Math.max(...cells) + 1);
  }

  // Rank by average: green for the top student, red for the lowest.
  const rank = rankCells(page);
  const ranks = (await rank.allTextContents()).map((t) => (t.trim() ? Number(t) : null));
  const ranked = ranks.filter((r): r is number => r !== null);
  const [r0, g0, b0] = await rgb(rank.nth(ranks.indexOf(Math.min(...ranked))));
  const [rN, gN, bN] = await rgb(rank.nth(ranks.indexOf(Math.max(...ranked))));
  expect(g0).toBeGreaterThan(r0);
  expect(g0).toBeGreaterThan(b0);
  expect(rN).toBeGreaterThan(gN);
  expect(rN).toBeGreaterThan(bN);

  // A test's heading opens its marks; Back returns to the markbook, then the list.
  await page.locator(".mark-grid thead .test-link", { hasText: "Forces & energy test" }).click();
  await expect(page.locator(".top-bar-title")).toContainText("Forces & energy test");
  await page.getByRole("button", { name: "Back to Marks" }).click();
  await expect(page.locator(".top-bar-title")).toContainText("Markbook");
  await page.getByRole("button", { name: "Back to Marks" }).click();
  await expect(page.getByRole("button", { name: "New assessment" })).toBeVisible();
});

test("the markbook keeps its headings and class average in place while the students scroll", async ({ page }) => {
  await nav(page, "Marks");
  await page.getByRole("button", { name: "Markbook" }).click();
  await reveal(page);
  const top = (sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top);
  const before = { heading: await top(".mark-grid thead th"), average: await top(".mark-grid tfoot th") };
  await page.locator(".mark-grid-wrap").evaluate((e) => (e.scrollTop = 150));
  expect(await top(".mark-grid thead th")).toBe(before.heading);
  expect(Math.abs((await top(".mark-grid tfoot th")) - before.average)).toBeLessThan(1); // sub-pixel rounding
  // Its one average row sits right on the bottom edge, with no students showing under it.
  const gap = await page.locator(".mark-grid-wrap").evaluate((wrap) => {
    const row = wrap.querySelector("tfoot th")!.getBoundingClientRect();
    return wrap.getBoundingClientRect().top + wrap.clientTop + wrap.clientHeight - row.bottom;
  });
  expect(Math.abs(gap)).toBeLessThan(2);
});

/** The markbook's cells for one student row, by column. */
async function markbookRow(page: Page, surname: string) {
  const row = page.locator(".mark-grid tbody tr", { hasText: surname });
  const num = async (sel: string) => {
    const t = (await row.locator(sel).textContent())?.trim() ?? "";
    return t ? Number(t) : null;
  };
  return { informal: await num("td.fifth"), exam: await num("td.fourth"), mark: await num("td.final") };
}

test("the markbook blends informal tasks and exams by the grade's split from Settings", async ({ page }) => {
  // The demo's Mid-term exam counts as an examination; the rest are informal, all at weight 1.
  await nav(page, "Settings");
  await page.getByText("Assessments", { exact: true }).first().click();
  const examShare = page.getByLabel(/Examinations' share/);
  await examShare.fill("75");
  await examShare.press("Enter");
  await expect(page.locator(".weighting-table tbody td").nth(1)).toHaveText("25%");

  await nav(page, "Marks");
  await page.getByRole("button", { name: "Markbook" }).click();
  await reveal(page);
  await expect(page.locator(".stat-tiles")).toContainText("25 / 75");
  await expect(page.locator(".mark-grid thead th.col-test", { hasText: "Mid-term exam" })).toContainText("Exam · 75%");
  const { informal, exam, mark } = await markbookRow(page, "Clark");
  expect(informal).not.toBeNull();
  expect(exam).not.toBeNull();
  expect(Math.abs(mark! - (informal! * 0.25 + exam! * 0.75))).toBeLessThanOrEqual(1); // the columns are rounded
});

test("a task's kind and weight are set in the list, and its share follows", async ({ page }) => {
  await nav(page, "Marks");
  const row = page.locator("main table.data tbody tr", { hasText: "Cells test" });
  await expect(row).toContainText("16,7%"); // three informal tasks share 50%
  await row.getByLabel("Weight").fill("2");
  await expect(row).toContainText("25%"); // 50% × 2/4
  await row.getByLabel("Counts as").selectOption("exam");
  await expect(row).toContainText("33,3%"); // two exams at weights 1 and 2 share 50%
});

test("marks take a decimal comma and show one", async ({ page }) => {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
  const row = page.locator(".mark-grid tbody tr").nth(1);
  await row.locator("input.grid-input").first().fill("3,5");
  await expect(row.locator("td.sticky-right.fourth")).toHaveText(/,5$/); // the total
  await page.getByRole("button", { name: "Done" }).click();
  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "View" }).click();
  await expect(page.locator(".mark-grid tbody tr").nth(1).locator("td.col-q").first()).toHaveText("3,5");
  await expect(page.locator(".mark-grid tfoot")).not.toContainText(".");
});

test("students tied for first both rank 1, and the next is 3rd", async ({ page }) => {
  await openTest(page, "Mid-term exam", "Enter marks");
  const marks = page.locator(".quick-mark-row input.mark-input");
  await marks.nth(0).fill("80");
  await marks.nth(1).fill("80");
  await page.getByRole("button", { name: "Done" }).click();
  await page.locator("tr", { hasText: "Mid-term exam" }).getByRole("button", { name: "View" }).click();
  const ranks = (await page.locator(".mark-grid tbody td:nth-child(7)").allTextContents()).map((t) => t.trim());
  expect(ranks.slice(0, 2)).toEqual(["1", "1"]);
  expect(ranks).toContain("3");
  expect(ranks).not.toContain("2");
});

test("a screen within Marks is named in the top bar, with its Back, even under the privacy cover", async ({ page }) => {
  await nav(page, "Marks");
  await page.getByRole("button", { name: "Markbook" }).click();
  await expect(page.locator(".top-bar-title")).toHaveText("Marks›Markbook");
  // Back works whether or not the marks have been shown.
  await page.getByRole("button", { name: "Back to Marks" }).click();
  await expect(page.getByRole("button", { name: "New assessment" })).toBeVisible();
  await expect(page.locator(".top-bar-title")).toHaveText("Marks");
});
