import { Locator, Page, test as base } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ALL_TOOLS, enableTools, expect, nav, openTool, reveal, settingsTab, test } from "../../e2e/fixtures";
import { ReadSheet, readXlsx } from "../../src/lib/xlsxRead";
import { buildXlsx } from "../../src/lib/xlsx";

// Every picture in the user guide. Each test opens a fresh demo class (as the
// browser tests do), walks one chapter of the guide and saves full-screen
// shots and close-ups of the buttons it describes into docs/images/.

const OUT = fileURLToPath(new URL("../../docs/images/", import.meta.url));
const VIEW = { width: 1280, height: 800 };

/** Hide what only the browser demo shows, and keep stray toasts out of the pictures. */
async function prep(page: Page) {
  await page.addStyleTag({
    content: ".demo-banner{display:none!important} html.no-toasts .toast{display:none!important}",
  });
  await toasts(page, false);
}

async function toasts(page: Page, on: boolean) {
  await page.evaluate((show) => document.documentElement.classList.toggle("no-toasts", !show), on);
}

async function settle(page: Page, ms = 300) {
  // Park the pointer in a corner, so no hover styles or chart tooltips show.
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

/** Scroll the page (and any scrolling column on it) back to the top. */
async function toTop(page: Page, selector = ".main-pane") {
  await page.locator(selector).first().evaluate((e) => (e.scrollTop = 0));
}

/** The whole window. */
async function shot(page: Page, name: string, ms?: number) {
  await settle(page, ms);
  await page.screenshot({ path: `${OUT}${name}.png` });
}

/** A close-up: the box around one or more elements, with a margin. */
async function shotOf(page: Page, targets: Locator | Locator[], name: string, pad = 8, ms?: number) {
  const list = Array.isArray(targets) ? targets : [targets];
  await list[0].scrollIntoViewIfNeeded();
  await settle(page, ms);
  const boxes = [];
  for (const l of list) {
    const b = await l.boundingBox();
    if (!b) throw new Error(`${name}: nothing to photograph`);
    boxes.push(b);
  }
  const vp = page.viewportSize() ?? VIEW;
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  await page.screenshot({ path: `${OUT}${name}.png`, clip: { x, y, width: right - x, height: bottom - y } });
}

/** Scroll a heading to the top of the page, then photograph the window. */
async function shotFrom(page: Page, heading: Locator, name: string, ms?: number) {
  await heading.evaluate((e) => e.scrollIntoView({ block: "start" }));
  await shot(page, name, ms);
}

/** Press the open page's Template button and read the workbook it downloads. */
async function downloadTemplate(page: Page): Promise<ReadSheet[]> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Template" }).click()]);
  return readXlsx(new Uint8Array(readFileSync((await download.path())!)));
}

/** The (edited) sheets as an .xlsx, as a teacher saving in Excel would. */
const rebuild = (sheets: ReadSheet[]) => buildXlsx(sheets.map((s) => ({ name: s.name, columns: s.rows[0], rows: s.rows.slice(1) })));

const panel = (page: Page, title: string) => page.locator("main .panel", { has: page.locator("h3", { hasText: title }) }).first();
const seats = (page: Page) => page.locator(".seat-square.occupied");
const modal = (page: Page) => page.locator(".modal");

test.describe.configure({ mode: "parallel" });

base("welcome screen", async ({ page }) => {
  // Pretend to be the desktop app, so the first-run screen shows its folder button.
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: () => Promise.resolve(null),
      transformCallback: () => 0,
    };
  });
  await page.goto("/");
  await expect(page.getByText("Welcome to ClassKernel")).toBeVisible();
  await shot(page, "welcome");
});

test("home, the class menu and setting up a class", async ({ page }) => {
  await prep(page);
  await shotOf(page, page.locator(".nav-rail"), "nav-rail", 0);

  // Two more classes, so Home and the class menu look like a real timetable.
  await page.locator("main button", { hasText: "New class" }).click();
  const fields = modal(page).locator("input");
  await fields.nth(0).fill("10A Physical Sciences");
  await fields.nth(1).fill("10");
  await fields.nth(2).fill("Physical Sciences");
  await fields.nth(3).fill("Lab 3");
  await shotOf(page, modal(page), "new-class-dialog", 2);
  await modal(page).locator("button.primary").click();
  await nav(page, "Notes");
  await page.locator("main button.swatch[title*='Green']").first().click();

  await page.locator(".top-bar .class-picker-btn").click();
  await page.locator(".top-bar .menu .menu-item", { hasText: "New class" }).click();
  await fields.nth(0).fill("12B Physical Sciences");
  await fields.nth(1).fill("12");
  await fields.nth(2).fill("Physical Sciences");
  await fields.nth(3).fill("Lab 3");
  await modal(page).locator("button.primary").click();
  await nav(page, "Notes");
  await page.locator("main button.swatch[title*='Purple']").first().click();

  await page.locator(".top-bar .class-picker-btn").click();
  await page.locator(".top-bar .menu .menu-item", { hasText: "7B-Science" }).click();
  await nav(page, "Home");
  await shot(page, "home");
  await shotOf(page, page.locator(".class-card").first(), "class-card", 10);

  await page.locator(".top-bar .class-picker-btn").click();
  await shotOf(page, [page.locator(".top-bar .class-picker-btn"), page.locator(".top-bar .menu")], "class-menu", 4);
  await page.keyboard.press("Escape");

  // Class notes: details, colour and free notes.
  await nav(page, "Notes");
  await shot(page, "class-notes");

  // Settings → Students: the privacy cover, then the roster and the import dialog.
  await settingsTab(page, "Students");
  await shot(page, "privacy-cover");
  await reveal(page);
  await page.locator("main tbody tr").nth(3).locator("input").nth(5).fill("Extra time in tests");
  await shot(page, "students");

  // The class list as a spreadsheet: change one note, add a student, and a row for another class.
  const roster = await downloadTemplate(page);
  const sheet = roster.find((s) => s.name === "Students")!;
  sheet.rows[2][6] = "Wears glasses";
  sheet.rows.push(["", "Ndlovu", "Sipho", "30561", "M", "SEN", "", ""]);
  sheet.rows.push(["9C-Maths", "Mokoena", "Thandi", "", "F", "", "", ""]);
  await page.getByTestId("roster-import-file").setInputFiles({ name: "7B-Science.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from(rebuild(roster)) });
  await shotOf(page, modal(page), "roster-import-preview", 2);
  await modal(page).getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Import list…" }).click();
  await modal(page).locator("textarea").fill("Thandi Mokoena\nLiam van der Merwe\nNaidoo, Priya\nSipho Dlamini");
  await shotOf(page, modal(page), "import-students", 2);
  await modal(page).getByRole("button", { name: "Cancel" }).click();

  // Settings → Room layout, with a desk selected.
  await settingsTab(page, "Room layout");
  await page.locator(".room-canvas g.desk").nth(2).click();
  await shot(page, "room-layout");
  await shotOf(page, page.locator("main .palette").nth(0), "layout-add-buttons", 6);
  await shotOf(page, page.locator("main .palette").nth(1), "layout-desk-toolbar", 6);
  await shotOf(page, page.locator("main .palette.layout-tools"), "layout-text-and-templates", 6);
  await page.getByRole("button", { name: "Set view crop" }).click();
  await shot(page, "room-layout-crop");

  // Settings → Seating rules, with one keep-apart pair.
  await settingsTab(page, "Seating rules");
  const pickers = page.locator("main .panel select");
  await pickers.nth(0).selectOption({ index: 1 });
  await pickers.nth(1).selectOption({ index: 2 });
  await page.getByRole("button", { name: "Keep apart" }).click();
  await shot(page, "seating-rules");
});

test("attendance", async ({ page }) => {
  await prep(page);
  await nav(page, "Attendance");
  await page.getByRole("button", { name: "All present" }).click();
  const rows = page.locator(".att-seg");
  await rows.nth(1).locator(".att-btn.A").click();
  await rows.nth(4).locator(".att-btn.L").click();
  await shot(page, "attendance");
  await shotOf(page, page.locator("main .view-header"), "attendance-header", 6);
  await shotOf(page, page.locator("main tbody tr").nth(1), "attendance-row", 4);
  await page.getByRole("button", { name: "Show details" }).click();
  await toTop(page);
  await shot(page, "attendance-details");
});

test("seats", async ({ page }) => {
  await prep(page);
  await nav(page, "Seats");
  await shot(page, "seats");
  await shotOf(page, page.locator("main .view-header"), "seats-toolbar", 6);

  // Pick a student up off their seat to move them.
  await seats(page).nth(5).click({ force: true });
  await shot(page, "seats-move");
  await page.locator(".seat-square.drop-target").first().click({ force: true });

  await page.locator("main button", { hasText: "Randomise" }).click();
  await shot(page, "seats-randomising", 350);
  await expect(page.locator(".shuffle-overlay")).toHaveCount(0, { timeout: 10_000 });
  await shotOf(page, page.locator("main .view-header"), "seats-toolbar-locked", 6);

  await page.locator("main button", { hasText: "Reseat" }).click();
  await shotOf(page, modal(page), "reseat-pin-create", 2);
  await modal(page).getByRole("button", { name: "Cancel" }).click();
});

test("lesson", async ({ page }) => {
  await prep(page);
  await nav(page, "Lesson");
  await shot(page, "lesson");
  await shotOf(page, [page.locator("main .lesson-head"), page.locator("main .lesson-toolbar")], "lesson-toolbar", 6);

  // A seat's pop-up, and the toast with Undo after logging from it.
  await seats(page).nth(4).click({ force: true });
  const pop = page.locator(".behaviour-popover");
  await expect(pop).toBeVisible();
  await shotOf(page, pop, "seat-popover", 10);
  await toasts(page, true);
  await pop.locator(".bh-btn").first().click();
  await shotOf(page, page.locator(".toast"), "toast-undo", 10);
  await toasts(page, false);

  // A bathroom trip under way.
  await seats(page).nth(9).click({ force: true });
  await page.locator(".behaviour-popover .bathroom-btn").click();
  await page.waitForTimeout(2200);
  await shotOf(page, page.locator(".bathroom-bar"), "bathroom-bar", 6);
  await page.locator(".bathroom-chip").click();

  // Pick a student.
  await toTop(page);
  await page.getByRole("button", { name: "Pick a student" }).click();
  await expect(page.locator(".picker-answer button").first()).toBeVisible({ timeout: 10_000 });
  await shot(page, "pick-a-student");
  await page.locator(".picker-actions button", { hasText: "Close" }).click();

  // Batch entry: choose the behaviour, then tap students.
  await page.getByRole("button", { name: "Batch entry" }).click();
  await shotOf(page, page.locator(".batch-panel"), "batch-choose", 6);
  await page.locator(".batch-panel .bh-btn", { hasText: "Missing homework" }).click();
  for (const i of [2, 7, 13]) await seats(page).nth(i).click({ force: true });
  await toTop(page);
  await shot(page, "batch-selecting");
  await page.locator(".batch-panel button.primary", { hasText: "Save" }).click();
  await page.locator(".batch-panel").getByRole("button", { name: "Done", exact: true }).click();

  // Teaching mode: the full-screen room plan, then the side panel.
  await page.getByRole("button", { name: "Teaching mode" }).click();
  await shot(page, "teaching-room-plan");
  await page.getByRole("button", { name: "Exit teaching mode" }).click();
  await page.getByRole("button", { name: "Side panel" }).click();
  await shotOf(page, page.locator(".strip"), "teaching-side-panel", 0);
  await page.getByTitle("Colour the tables").click();
  await shotOf(page, page.locator(".strip"), "teaching-side-panel-colours", 0);
  await page.locator(".strip-colour-hint button", { hasText: "Done" }).click();
  await page.getByTitle("Exit teaching mode (Esc)").click();

  await page.getByRole("button", { name: "Start lesson" }).click();
  await page.getByRole("button", { name: "End lesson" }).click();
  await shotOf(page, modal(page), "end-lesson-dialog", 2);
  await modal(page).locator("button.primary").click();
});

test("behaviour log", async ({ page }) => {
  await prep(page);
  await nav(page, "Behaviour");
  await reveal(page);
  await shot(page, "behaviour-log");
  await page.locator("main .view-header select").first().selectOption({ index: 1 });
  await shot(page, "behaviour-log-student");
  await page.locator("main .view-header select").first().selectOption({ index: 0 });
  await shotFrom(page, page.locator("main h2", { hasText: "Bathroom log" }), "bathroom-log");
});

test("marks", async ({ page }) => {
  await prep(page);
  await nav(page, "Marks");
  await shot(page, "marks-list");

  // A new test marked per question.
  await page.getByRole("button", { name: "New assessment" }).click();
  const form = modal(page);
  await form.locator("input").nth(0).fill("Waves & sound test");
  await form.locator("select").first().selectOption("Physics");
  await form.locator("input[type=number]").first().fill("4");
  await shotOf(page, form, "new-assessment", 2);
  await form.locator("button.primary").click();
  const rows = page.locator("main tbody tr");
  const setup: Array<[string, string, string]> = [
    ["Energy", "6", "L1"],
    ["Energy", "8", "L2"],
    ["Forces", "10", "L3"],
    ["Electricity", "6", "L4"],
  ];
  for (const [i, [topic, marks, level]] of setup.entries()) {
    await rows.nth(i).locator("input").nth(0).fill(topic);
    await rows.nth(i).locator("input").nth(1).fill(marks);
    await rows.nth(i).locator("select").selectOption(level);
  }
  await shot(page, "question-setup");
  await page.getByRole("button", { name: "Back to Marks" }).click();

  // The per-question grid of the demo test, mid-way through a row.
  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
  await page.locator(".mark-grid tbody tr").nth(4).locator("input.grid-input").nth(2).focus();
  await shot(page, "marking-grid");
  await page.getByRole("button", { name: "Done" }).click();

  // One mark per student.
  await page.locator("tr", { hasText: "Mid-term exam" }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
  await page.locator(".quick-mark-row input.mark-input").nth(2).focus();
  await shot(page, "quick-marking");

  // The calculator beside the marks, adding up the paper still to enter.
  await page.locator(".quick-mark-row input.mark-input").nth(9).focus();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await page.getByRole("textbox", { name: "Sum" }).fill("18+15+14,5");
  await shot(page, "marking-calculator");
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();

  // View: the same test read-only, with its spreadsheet buttons.
  await page.locator("tr", { hasText: "Mid-term exam" }).getByRole("button", { name: "View" }).click();
  await reveal(page);
  await shot(page, "marks-view");
  await shotOf(page, page.locator("main .view-header"), "marks-view-toolbar", 6);

  // Its template, filled in: one new mark, one changed, one too big.
  const sheets = await downloadTemplate(page);
  const sheetRows = sheets[0].rows;
  const blank = sheetRows.findIndex((r, i) => i > 0 && !r[3]);
  const [changed, tooBig] = [1, 2, 3].filter((i) => i !== blank);
  sheetRows[blank][3] = "61,5";
  sheetRows[changed][3] = "79";
  sheetRows[changed][4] = "Re-marked";
  sheetRows[tooBig][3] = "95";
  await page.getByTestId("mark-import-file").first().setInputFiles({ name: "Marks - Mid-term exam.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from(rebuild(sheets)) });
  await shotOf(page, modal(page), "mark-import-preview", 2);
  await modal(page).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Back to Marks" }).click();

  // The markbook: every test at once, with the weighted mark.
  await page.getByRole("button", { name: "Markbook" }).click();
  await reveal(page);
  await shot(page, "markbook");
});

test("tools: switching on, dashboards and parent reports", async ({ page }) => {
  await prep(page);
  await settingsTab(page, "General");
  await page.locator("#report-school").fill("St Benedict's College");
  await page.locator("#report-teacher").fill("Mr K. Hilder");
  await page.locator("#report-teacher").blur();

  await enableTools(page, ALL_TOOLS);
  await page.setViewportSize({ width: 1280, height: 1180 });
  await shot(page, "settings-tools");
  await page.setViewportSize(VIEW);

  await nav(page, "Home");
  await shot(page, "home-tools");
  await page.getByRole("button", { name: "Expand the menu" }).click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await shotOf(page, page.locator(".nav-rail"), "nav-drawer", 0);
  await page.setViewportSize(VIEW);
  await page.getByRole("button", { name: "Collapse the menu" }).click();

  // Class dashboard, section by section.
  await openTool(page, "Class & student dashboards");
  await reveal(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, "dashboard-class", 1200);
  await shotFrom(page, page.locator("main h2.section-heading", { hasText: /^Students$/ }), "dashboard-class-students");
  await shotFrom(page, page.locator("main h2.section-heading", { hasText: /^Marks$/ }), "dashboard-class-marks", 1200);
  await shotFrom(page, page.locator("main h2.section-heading", { hasText: "Seating insights" }), "dashboard-seating-insights");

  // Student dashboard.
  await page.locator("main .md-tab", { hasText: "Student" }).click();
  await reveal(page);
  await page.getByRole("button", { name: "Next student" }).click();
  await shot(page, "dashboard-student", 1200);
  await shotFrom(page, page.locator("main h2.section-heading", { hasText: /^Marks$/ }), "dashboard-student-marks", 1200);
  await shotFrom(page, page.locator("main h2.section-heading", { hasText: /^Behaviour$/ }), "dashboard-student-behaviour", 1200);
  await page.setViewportSize(VIEW);

  // Print report from the dashboard, then the Parent reports tool itself.
  await page.getByRole("button", { name: "Print report" }).click();
  await expect(page.locator(".report-page")).toHaveCount(1);
  await shot(page, "parent-report-preview", 600);
  await page.locator(".report-actions button", { hasText: "Close" }).click();

  await openTool(page, "Parent reports");
  await reveal(page);
  await shot(page, "parent-reports-tool", 600);
  await shotOf(page, page.locator(".report-options"), "parent-report-options", 0);
  await page.locator(".report-actions button", { hasText: "Home" }).click();
});

test("teaching tools", async ({ page }) => {
  await prep(page);
  await enableTools(page, ["test-timer", "clock", "stopwatch", "graph-paper", "practical-graph", "motion-graph", "noise-meter"]);

  await openTool(page, "Test timer");
  await shot(page, "test-timer-setup");
  await page.locator("main button.primary", { hasText: "Start" }).click();
  await page.waitForTimeout(2500);
  await shot(page, "test-timer-running");
  await nav(page, "Home");
  await shotOf(page, page.locator(".mini-stack .timer-mini"), "timer-mini", 4);
  await page.locator(".timer-mini").getByRole("button", { name: "Open the test timer" }).click();
  await page.locator("main button", { hasText: "Stop" }).click();

  await openTool(page, "Clock");
  await page.locator(".clock-toolbar button", { hasText: "Analog" }).click();
  await shot(page, "clock-analog");
  await page.locator(".clock-toolbar button", { hasText: "Digital" }).click();
  await shot(page, "clock-digital", 800);

  await openTool(page, "Stopwatch");
  await page.locator("main .sw-main").click();
  await page.waitForTimeout(1300);
  await page.locator("main button", { hasText: "Lap" }).click();
  await page.waitForTimeout(1100);
  await page.locator("main button", { hasText: "Lap" }).click();
  await page.waitForTimeout(1500);
  await page.locator("main button", { hasText: "Lap" }).click();
  await page.waitForTimeout(600);
  await page.locator("main .sw-main").click();
  await shot(page, "stopwatch");

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

  await openTool(page, "Class noise meter");
  await page.locator("main button.primary", { hasText: "Start" }).click();
  await expect(page.locator(".nm-reading")).toContainText(/\d/, { timeout: 10_000 });
  await page.waitForTimeout(3000);
  await shot(page, "noise-meter");
  await page.getByRole("button", { name: "Show to class" }).click();
  await shot(page, "noise-meter-class-view", 600);
  await page.getByRole("button", { name: "Back to the controls" }).click();
  await nav(page, "Home");
  await shotOf(page, page.locator(".mini-stack .noise-mini"), "noise-mini", 4);
  await page.locator(".noise-mini").getByRole("button", { name: "Stop listening" }).click();
});

test("settings", async ({ page }) => {
  await prep(page);
  await settingsTab(page, "General");
  await shot(page, "settings-general");
  await page.setViewportSize({ width: 1280, height: 1100 });
  await shotOf(page, panel(page, "Classes and students from a spreadsheet"), "settings-classes-spreadsheet", 0);
  // The demo's in-memory folder, shown as a teacher's real one would be.
  await panel(page, "Data")
    .locator("code")
    .first()
    .evaluate((e) => (e.textContent = "C:\\Users\\teacher\\OneDrive\\ClassroomData"));
  await shotOf(page, panel(page, "Data"), "settings-data", 0);

  await settingsTab(page, "Teaching mode");
  await shotOf(page, panel(page, "Teaching mode"), "settings-teaching-mode", 0);
  await settingsTab(page, "Behaviour");
  await shotOf(page, panel(page, "Behaviour buttons"), "settings-behaviour-buttons", 0);

  await settingsTab(page, "Assessments");
  await shotOf(page, [panel(page, "Mark entry"), panel(page, "Show results as")], "settings-mark-entry-and-results", 0);
  await shotOf(page, panel(page, "Weighting"), "settings-weighting", 0);
  // A second grade sharing the demo grade's topics, so the picture shows Same topics as and its note.
  await page.getByRole("button", { name: "Grade", exact: true }).click();
  await modal(page).locator("input").fill("8");
  await modal(page).locator("button.primary").click();
  await page.getByLabel("Same topics as:").selectOption("7");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "settings-assessments");

  await settingsTab(page, "Export");
  await shot(page, "settings-export");

  // Colours: the setting, then the teaching room plan in Dark.
  await settingsTab(page, "General");
  await shotOf(page, panel(page, "Display"), "settings-display", 0);
  await page.getByRole("group", { name: "Colours" }).getByRole("button", { name: "Dark" }).click();
  await nav(page, "Lesson");
  await shot(page, "lesson-dark");
});

test("your data: when the data folder isn't ready", async ({ page }) => {
  const realDir = "G:\\My Drive\\ClassroomData";
  // The demo's in-memory folder, shown as a teacher's Google Drive one would be.
  const asDrive = async () =>
    page.locator(".waiting-panel code, .folder-banner code").evaluateAll((els, dir) => els.forEach((e) => (e.textContent = dir)), realDir);
  await page.goto("/?simulate=folder-missing&wait=30");
  await prep(page);
  await expect(page.getByRole("heading", { name: "Waiting for your data folder…" })).toBeVisible();
  await asDrive();
  await shotOf(page, page.locator(".waiting-panel"), "folder-waiting", 0);

  await page.getByRole("button", { name: "Open this computer's copy now" }).click();
  await nav(page, "Attendance");
  await page.locator(".att-seg").first().locator(".att-btn.A").click();
  await asDrive();
  await shotOf(page, page.locator(".folder-banner"), "folder-working-from-copy", 0);

  // Another computer recorded a register meanwhile, so the two are joined.
  await page.evaluate(async () => {
    const rel = "classes/7B-Science/attendance.csv";
    const drive = (await window.__ckDemo!.readOnDrive(rel)) ?? "date,student_id,status,note\r\n";
    await window.__ckDemo!.editOnDrive(rel, `${drive}2001-01-01,elsewhere,L,\r\n`);
    await window.__ckDemo!.folderBack();
  });
  await expect(page.locator(".folder-banner")).toContainText("back in your data folder", { timeout: 15_000 });
  await shotOf(page, page.locator(".folder-banner"), "folder-copied-back", 0);
});
