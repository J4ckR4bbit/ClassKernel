import { readFileSync } from "node:fs";
import { Page } from "@playwright/test";
import { expect, nav, reveal, test } from "./fixtures";
import { readXlsx } from "../src/lib/xlsxRead";
import { buildXlsx } from "../src/lib/xlsx";

// Marks templates: download a test's spreadsheet, fill it in, import it back.

async function openView(page: Page, title: string) {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: title }).getByRole("button", { name: "View" }).click();
  await reveal(page);
}

/** Download the template from the open page and read its sheets back. */
async function downloadTemplate(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Template" }).click()]);
  const sheets = await readXlsx(new Uint8Array(readFileSync((await download.path())!)));
  return { name: download.suggestedFilename(), sheets };
}

/** Give the filled-in file to Import marks. */
async function importFile(page: Page, name: string, bytes: Uint8Array | string, mimeType: string) {
  await page.getByTestId("mark-import-file").first().setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) });
  await expect(page.getByRole("dialog", { name: "Import marks" })).toBeVisible();
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

test("a single-mark template downloads with the class, and imports back what was typed", async ({ page }) => {
  await openView(page, "Mid-term exam");
  const { name, sheets } = await downloadTemplate(page);
  expect(name).toBe("Marks - Mid-term exam.xlsx");
  const [marks, about] = sheets;
  expect(marks.rows[0]).toEqual(["No", "Surname", "Name", "Mark (out of 80)", "Comment", "Student ID"]);
  expect(about.rows.some((r) => r[0] === "Assessment" && r[1] === "Mid-term exam")).toBe(true);

  // The demo leaves one student without a mark: fill it in, change another, and type one too big.
  const rows = marks.rows.slice(1);
  const blank = rows.findIndex((r) => !r[3]);
  expect(blank).toBeGreaterThanOrEqual(0);
  rows[blank][3] = "61,5";
  const other = blank === 0 ? 1 : 0;
  rows[other][3] = "79";
  rows[other][4] = "Re-marked";
  const tooBig = [0, 1, 2].find((i) => i !== blank && i !== other)!;
  rows[tooBig][3] = "95";
  const filled = buildXlsx([{ name: "Marks", columns: marks.rows[0], rows }, { name: "About", columns: about.rows[0], rows: about.rows.slice(1) }]);

  await importFile(page, "filled.xlsx", filled, XLSX);
  const dialog = page.getByRole("dialog", { name: "Import marks" });
  await expect(dialog.locator(".stat-tile").nth(0)).toContainText("1"); // new
  await expect(dialog.locator(".stat-tile").nth(1)).toContainText("1"); // changed
  await expect(dialog.locator(".import-problems")).toContainText("95 is more than 80");
  await dialog.getByRole("button", { name: "Import" }).click();

  const row = (i: number) => page.locator(".mark-grid tbody tr").nth(i).locator("td");
  await expect(row(blank).nth(3)).toHaveText("61,5");
  await expect(row(other).nth(3)).toHaveText("79");
  await expect(row(other).nth(7)).toHaveText("Re-marked");
  expect(await row(tooBig).nth(3).textContent()).not.toBe("95");
});

test("a per-question template has a column per question, and its import recomputes totals", async ({ page }) => {
  await openView(page, "Forces & energy test");
  const { sheets } = await downloadTemplate(page);
  const header = sheets[0].rows[0];
  expect(header.slice(3, 9)).toEqual(["Q1 (/6)", "Q2 (/10)", "Q3 (/8)", "Q4 (/12)", "Q5 (/4)", "Q6 (/10)"]);

  // Mark the first student, who has nothing yet, on every question: 6 + 10 + 8 + 12 + 4 + 10 = 50.
  const rows = sheets[0].rows.slice(1);
  expect(rows[0].slice(3, 9).every((c) => !c)).toBe(true);
  rows[0].splice(3, 6, "6", "10", "8", "12", "4", "10");
  await importFile(page, "filled.xlsx", buildXlsx([{ name: "Marks", columns: header, rows }]), XLSX);
  await expect(page.getByRole("dialog", { name: "Import marks" }).locator(".stat-tile").nth(0)).toContainText("6");
  await page.getByRole("dialog", { name: "Import marks" }).getByRole("button", { name: "Import" }).click();

  const first = page.locator(".mark-grid tbody tr").first();
  await expect(first.locator("td.sticky-right.fourth")).toHaveText("50"); // total
  await expect(first.locator("td.sticky-right.third")).toHaveText("100"); // %
});

test("a semicolon .csv with decimal commas imports too, matched by name", async ({ page }) => {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: "Cells test" }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
  const csv = "Surname;Name;Mark\r\nAdams;Amelia;33,5\r\nNobody;Some;12\r\n";
  await importFile(page, "marks.csv", csv, "text/csv");
  const dialog = page.getByRole("dialog", { name: "Import marks" });
  await expect(dialog.locator(".import-problems")).toContainText("no such student");
  await dialog.getByRole("button", { name: "Import" }).click();
  // The marking list re-reads its boxes after an import.
  await expect(page.locator(".quick-mark-row", { hasText: "Amelia Adams" }).locator("input.mark-input")).toHaveValue("33,5");
});
