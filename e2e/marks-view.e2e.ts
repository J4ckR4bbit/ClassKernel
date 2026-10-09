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
const rankCells = (page: Page) => page.locator(".mark-grid tbody td.sticky-right:not(.second):not(.third):not(.fourth)");

test("View on a per-question test shows the grid's numbers with nothing to type in", async ({ page }) => {
  await openTest(page, "Forces & energy test", "Enter marks");
  const pct = page.locator(".mark-grid tbody td.sticky-right.third");
  const marking = await pct.allTextContents();
  await page.getByRole("button", { name: "Done" }).click();

  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "View" }).click();
  await reveal(page);
  await expect(page.locator(".view-header h1")).toHaveText(/^Forces & energy test/);
  await expect(page.locator(".mark-grid input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit questions" })).toHaveCount(0);
  expect(await pct.allTextContents()).toEqual(marking);
  // No yellow/grey marking highlight on a read-only page.
  await expect(page.locator(".mark-grid tbody tr.done")).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
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
  await expect(page.locator(".view-header h1")).toHaveText(/^Mid-term exam/);
  await expect(page.locator(".mark-grid input")).toHaveCount(0);
});

test("the markbook shows every test, each student's average and rank, and opens a test", async ({ page }) => {
  await nav(page, "Marks");
  const tests = await page.locator("main table.data tbody tr").count();
  await page.getByRole("button", { name: "Markbook" }).click();
  await reveal(page);
  await expect(page.locator(".mark-grid input")).toHaveCount(0);
  await expect(page.locator(".mark-grid thead th.col-test .test-link")).toHaveCount(tests);

  // Each average sits within the student's own test percentages.
  const rows = page.locator(".mark-grid tbody tr");
  for (let i = 0; i < 3; i++) {
    const cells = (await rows.nth(i).locator("td.col-test").allTextContents()).filter((t) => t.trim()).map(Number);
    const avg = Number(await rows.nth(i).locator("td.divider").textContent());
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
  await expect(page.locator(".view-header h1")).toHaveText(/^Forces & energy test/);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.locator(".view-header h1")).toHaveText("Markbook");
  await page.getByRole("button", { name: "Back" }).click();
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
