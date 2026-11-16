import { Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { openTool, test } from "../../e2e/fixtures";

// The user guide's pictures of the science tools (docs/user-guide), taken from
// the built website. Run with `npm run docs:screenshots` here; the pictures
// land in docs/images/ at the top of the repository, beside ClassKernel's.

const OUT = fileURLToPath(new URL("../../../../docs/images/", import.meta.url));

async function settle(page: Page, ms = 300) {
  // Park the pointer in a corner, so no hover styles show.
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

/** Scroll a column back to the top. */
async function toTop(page: Page, selector: string) {
  await page.locator(selector).first().evaluate((e) => (e.scrollTop = 0));
}

/** The whole window. */
async function shot(page: Page, name: string, ms?: number) {
  await settle(page, ms);
  await page.screenshot({ path: `${OUT}${name}.png` });
}

test("the website's list of tools", async ({ page }) => {
  await page.goto("/");
  await shot(page, "science-home");
});

test("science tools", async ({ page }) => {
  await openTool(page, "Graph paper generator");
  await shot(page, "graph-paper", 800);

  await openTool(page, "Practical graph plotter");
  await page.getByLabel("Title", { exact: true }).fill("Force vs extension of a spring");
  await page.getByLabel("x-axis", { exact: true }).fill("Extension");
  await page.getByLabel("x unit", { exact: true }).fill("m");
  await page.getByLabel("y-axis", { exact: true }).fill("Force");
  await page.getByLabel("y unit", { exact: true }).fill("N");
  const readings: Array<[string, string]> = [
    ["0", "0"],
    ["0,02", "1,1"],
    ["0,04", "2,0"],
    ["0,06", "3,1"],
    ["0,08", "3,9"],
    ["0,10", "5,1"],
  ];
  const rows = page.locator("main .pg-table tbody tr");
  for (const [i, [x, y]] of readings.entries()) {
    await rows.nth(i).locator("input").nth(0).fill(x);
    await rows.nth(i).locator("input").nth(1).fill(y);
  }
  await toTop(page, ".pg-controls");
  await shot(page, "practical-graph", 800);

  await openTool(page, "Motion graph builder");
  await shot(page, "motion-graph", 800);

  await openTool(page, "Galvanic cell animator");
  await page.waitForTimeout(1500);
  await shot(page, "galvanic-cell", 800);

  await openTool(page, "Chemistry reference");
  await shot(page, "periodic-table", 400);
  await page.locator(".pt-cell[data-z='26']").click();
  await shot(page, "periodic-table-element", 400);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.locator("main .md-tab", { hasText: "Substances & bonds" }).click();
  await page.locator("main .seg button", { hasText: /^Organic$/ }).click();
  await page.getByRole("option", { name: "CH₃COOH Ethanoic acid", exact: true }).click();
  await shot(page, "substances", 400);
  await page.locator("main .md-tab", { hasText: "Polyatomic ions" }).click();
  await page.locator(".ion-card[data-ion='nitrate']").click();
  await shot(page, "polyatomic-ions", 400);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.locator("main .md-tab", { hasText: "Equations" }).click();
  await page.locator("main .chip", { hasText: "Permanganate and iron(II)" }).click();
  await shot(page, "equations", 400);

  await openTool(page, "Titration simulator");
  await page.getByLabel("Solution in the flask").selectOption("ch3cooh");
  for (let i = 0; i < 5; i++) await page.locator(".ti-add button", { hasText: "+5,00" }).click();
  await page.locator(".ti-add button", { hasText: "+0,50" }).click();
  await page.waitForTimeout(600);
  await shot(page, "titration", 600);
});
