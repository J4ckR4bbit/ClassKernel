import { readFileSync } from "node:fs";
import { Page } from "@playwright/test";
import { expect, reveal, settingsTab, test } from "./fixtures";
import { ReadSheet, readXlsx } from "../src/lib/xlsxRead";
import { buildXlsx } from "../src/lib/xlsx";

// Classes and students from a spreadsheet: one class from its Students page,
// every class from Settings › General.

async function downloadWorkbook(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Template" }).click()]);
  return { name: download.suggestedFilename(), sheets: await readXlsx(new Uint8Array(readFileSync((await download.path())!))) };
}

/** Write the (edited) sheets back to an .xlsx, as a teacher saving in Excel would. */
const rebuild = (sheets: ReadSheet[]) => buildXlsx(sheets.map((s) => ({ name: s.name, columns: s.rows[0], rows: s.rows.slice(1) })));

test("one class: its students download, and the import adds, updates and skips with reasons", async ({ page }) => {
  await settingsTab(page, "Students");
  await reveal(page); // the Students page sits behind the privacy cover
  const count = await page.locator("main table.data tbody tr").count();
  const { name, sheets } = await downloadWorkbook(page);
  expect(name).toBe("Students - 7B-Science.xlsx");
  const students = sheets.find((s) => s.name === "Students")!;
  expect(students.rows[0]).toEqual(["Class", "Surname", "Name", "Adam number", "Gender", "Flags", "Notes", "Student ID"]);
  expect(students.rows.length - 1).toBe(count);
  expect(sheets.find((s) => s.name === "Classes")!.rows).toHaveLength(2); // heading + this class

  students.rows[1][6] = "Sits near the front"; // update a note
  students.rows.push(["", "Ndlovu", "Sipho", "30561", "M", "SEN, Medical", "", ""]); // a new student, class left blank
  students.rows.push(["9C-Maths", "Other", "Class", "", "", "", "", ""]); // another class: skipped
  await page.getByTestId("roster-import-file").setInputFiles({ name: "students.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from(rebuild(sheets)) });

  const dialog = page.getByRole("dialog", { name: "Import spreadsheet" });
  await expect(dialog.locator(".stat-tile").nth(0)).toContainText("1"); // new
  await expect(dialog.locator(".stat-tile").nth(1)).toContainText("1"); // updated
  await expect(dialog.locator(".import-problems")).toContainText("isn't this class");
  await dialog.getByRole("button", { name: "Import" }).click();

  await expect(page.locator("main table.data tbody tr")).toHaveCount(count + 1);
  const sipho = page.locator("main table.data tbody tr").filter({ has: page.locator('input[value="Ndlovu"]') });
  await expect(sipho.locator("td").nth(2).locator("input")).toHaveValue("30561"); // Adam no.
  await expect(sipho.locator("td").nth(4).locator("input")).toHaveValue("SEN;Medical");
  await expect(page.locator("main table.data tbody tr").first().locator("td").nth(5).locator("input")).toHaveValue("Sits near the front");
});

test("every class: the workbook creates a new class with its students", async ({ page }) => {
  await settingsTab(page, "General");
  const { name, sheets } = await downloadWorkbook(page);
  expect(name).toBe("Classes and students.xlsx");
  const classes = sheets.find((s) => s.name === "Classes")!;
  const students = sheets.find((s) => s.name === "Students")!;
  expect(classes.rows[0]).toEqual(["Class", "Grade", "Subject", "Room"]);

  classes.rows.push(["G12 - Key C", "12", "Physical Science", "M6"]);
  students.rows.push(["G12 - Key C", "Mokoena", "Lebo", "", "M", "", "", ""], ["G12 - Key C", "Pillay", "Anika", "", "F", "", "", ""]);
  await page.getByTestId("classes-import-file").setInputFiles({ name: "all.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from(rebuild(sheets)) });

  const dialog = page.getByRole("dialog", { name: "Import classes and students" });
  await expect(dialog).toContainText("New class G12 - Key C, grade 12");
  await expect(dialog.locator(".stat-tile").nth(1)).toContainText("2"); // new students
  await dialog.getByRole("button", { name: "Import" }).click();

  // The new class is in the class menu; open it and its students are there.
  await page.locator(".top-bar").getByRole("button").last().click();
  await page.getByText("G12 - Key C").first().click();
  await settingsTab(page, "Students");
  await reveal(page);
  await expect(page.locator("main table.data tbody tr")).toHaveCount(2);
});

test("a student renamed in the sheet is still recognised by Adam number", async ({ page }) => {
  await settingsTab(page, "Students");
  await reveal(page);
  const count = await page.locator("main table.data tbody tr").count();
  // Only Surname, Name and Adam number, as from the school's own list: the first student's surname corrected.
  const first = page.locator("main table.data tbody tr").first().locator("input");
  const adam = await first.nth(2).inputValue();
  expect(adam).not.toBe("");
  const csv = `Surname;Name;Adam number\r\nAdams-Ngcobo;${await first.nth(0).inputValue()};${adam}\r\n`;
  await page.getByTestId("roster-import-file").setInputFiles({ name: "adam.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const dialog = page.getByRole("dialog", { name: "Import spreadsheet" });
  await expect(dialog.locator(".stat-tile").nth(0)).toContainText("0"); // no new students
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(page.locator("main table.data tbody tr")).toHaveCount(count);
  await expect(page.locator('input[value="Adams-Ngcobo"]')).toHaveCount(1);
});
