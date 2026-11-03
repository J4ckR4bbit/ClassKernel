import { Page } from "@playwright/test";
import { expect, settingsTab, test } from "./fixtures";

// The room designer: its toolbar holds still while the room zooms and scrolls
// in its own view (the Adobe keys and mouse, and a touch screen's fingers),
// and a name typed for a template is asked for once.

const level = (page: Page) => page.locator(".zoom-controls .zoom-level");
const view = (page: Page) => page.locator(".layout-viewport");
const scrollOf = (page: Page) => view(page).evaluate((e) => ({ x: e.scrollLeft, y: e.scrollTop }));

test("Enter in a name dialog saves once and doesn't open the dialog again", async ({ page }) => {
  await settingsTab(page, "Room layout");
  const templates = page.getByRole("button", { name: /^Templates/ });
  await templates.click();
  await page.locator(".popover-panel").getByRole("button", { name: "Save as template" }).click();
  await page.locator(".modal input").fill("Lab 1");
  await page.keyboard.press("Enter");
  await expect(page.locator(".modal")).toHaveCount(0);
  // Focus is back on Templates, and the same Enter didn't press it.
  await expect(templates).toBeFocused();
  await expect(page.locator(".popover-panel")).toHaveCount(0);
  await templates.click();
  await expect(page.locator(".popover-panel .template-chip")).toHaveText(["Lab 1"]);

  // A dialog opened straight from a page button (+ Grade) closes on Enter and stays closed.
  await settingsTab(page, "Assessments");
  await page.getByRole("button", { name: "Grade", exact: true }).click();
  await page.locator(".modal input").fill("9");
  await page.keyboard.press("Enter");
  await expect(page.locator(".modal")).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page.locator(".modal")).toHaveCount(0);
});

test("the room zooms and scrolls in its own view while the toolbar holds still", async ({ page }) => {
  await settingsTab(page, "Room layout");
  const fit = await level(page).innerText();
  const toolbarY = (await page.locator(".layout-toolbar").boundingBox())!.y;
  const box = (await view(page).boundingBox())!;

  // Ctrl + wheel zooms in about the pointer...
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -400);
  await page.keyboard.up("Control");
  await expect(level(page)).not.toHaveText(fit);
  // ...and the wheel then scrolls the room, not the page.
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => (await scrollOf(page)).y).toBeGreaterThan(0);
  expect((await page.locator(".layout-toolbar").boundingBox())!.y).toBe(toolbarY);
  expect(await page.locator(".main-pane").evaluate((e) => e.scrollTop)).toBe(0);

  // Ctrl 1 is 100%, Ctrl + and the buttons step, Ctrl 0 fits the room again.
  await page.keyboard.press("Control+1");
  await expect(level(page)).toHaveText("100%");
  await page.keyboard.press("Control+Equal");
  await expect(level(page)).toHaveText("125%");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(level(page)).toHaveText("100%");
  await page.keyboard.press("Control+0");
  await expect(level(page)).toHaveText(fit);
  await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");
});

test("on a zoomed-in room a desk still moves by the grid squares it's dragged over", async ({ page }) => {
  await settingsTab(page, "Room layout");
  await page.keyboard.press("Control+1");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(level(page)).toHaveText("125%");
  const body = page.locator(".room-canvas g.desk").nth(2).locator("rect.desk-body");
  const x0 = Number(await body.getAttribute("x"));
  const y0 = Number(await body.getAttribute("y"));
  const b = (await body.boundingBox())!;
  await page.mouse.move(b.x + 5, b.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + 5 + 40 * 1.25, b.y + 5 + 20 * 1.25, { steps: 5 });
  await page.mouse.up();
  await expect(body).toHaveAttribute("x", String(x0 + 40));
  await expect(body).toHaveAttribute("y", String(y0 + 20));
});

test("dragging the empty floor scrolls; Space + drag pans over a desk without moving it", async ({ page }) => {
  await settingsTab(page, "Room layout");
  await page.keyboard.press("Control+1");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await view(page).evaluate((e) => {
    e.scrollLeft = 100;
    e.scrollTop = 100;
  });

  // The floor: a corner of the room with nothing on it.
  const svg = (await page.locator(".layout-viewport svg.room-canvas").boundingBox())!;
  const vp = (await view(page).boundingBox())!;
  const fx = Math.max(svg.x, vp.x) + 20;
  const fy = Math.max(svg.y, vp.y) + 40;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.mouse.move(fx + 60, fy + 50, { steps: 5 });
  await page.mouse.up();
  expect(await scrollOf(page)).toEqual({ x: 40, y: 50 });

  // Hold Space and drag from a desk: the room pans, the desk stays where it is.
  const body = page.locator(".room-canvas g.desk").nth(2).locator("rect.desk-body");
  const before = [await body.getAttribute("x"), await body.getAttribute("y")];
  const b = (await body.boundingBox())!;
  await view(page).focus();
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(b.x - 10, b.y - 10, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await scrollOf(page)).toEqual({ x: 60, y: 70 });
  expect([await body.getAttribute("x"), await body.getAttribute("y")]).toEqual(before);
});

test("on a touch screen two fingers pinch to zoom, and one finger on the floor scrolls", async ({ page }) => {
  await settingsTab(page, "Room layout");
  const fit = parseInt(await level(page).innerText());
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: number[][]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const box = (await view(page).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await touch("touchStart", [[cx - 50, cy]]);
  await touch("touchStart", [
    [cx - 50, cy],
    [cx + 50, cy],
  ]);
  for (let i = 1; i <= 10; i++) {
    await touch("touchMove", [
      [cx - 50 - i * 5, cy],
      [cx + 50 + i * 5, cy],
    ]);
  }
  await touch("touchEnd", []);
  // The fingers moved twice as far apart: twice the zoom.
  await expect.poll(async () => parseInt(await level(page).innerText())).toBeGreaterThanOrEqual(fit * 2 - 2);

  // One finger on the floor (the room's empty top-left corner) drags the room along.
  await view(page).evaluate((e) => {
    e.scrollLeft = 0;
    e.scrollTop = 0;
  });
  const before = await scrollOf(page);
  const svg = (await page.locator(".layout-viewport svg.room-canvas").boundingBox())!;
  const start = [svg.x + 20, svg.y + 40];
  await touch("touchStart", [start]);
  for (let i = 1; i <= 6; i++) await touch("touchMove", [[start[0] - i * 10, start[1] - i * 8]]);
  await touch("touchEnd", []);
  const after = await scrollOf(page);
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
});
