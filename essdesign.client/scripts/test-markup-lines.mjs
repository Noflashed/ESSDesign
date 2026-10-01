import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = path.resolve("output/ess-markup-line-test");
await fs.mkdir(output, { recursive: true });
async function saved() {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save drawing", exact: true }).click();
  const d = await promise;
  return JSON.parse(await fs.readFile(await d.path(), "utf8")).sheets[0].items;
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);
try {
  await page.goto(
    `${process.env.TEST_BASE_URL || "http://127.0.0.1:5182"}/tests/fixtures/ess-markup.html`,
  );
  const fixture = {
    version: 1,
    title: "LINE and OSNAP verification",
    sheets: [
      {
        id: "test",
        name: "Model",
        width: 1400,
        height: 900,
        image: null,
        pixelsPerMetre: 100,
        calibrated: true,
        items: [
          { id: "a", type: "line", x: 217, y: 223, x2: 617, y2: 223 },
          { id: "b", type: "line", x: 417, y: 100, x2: 417, y2: 400 },
          {
            id: "bay",
            type: "bay",
            x: 800,
            y: 200,
            length: 2.4,
            depth: 1.2,
            rotation: 0,
          },
        ],
      },
    ],
  };
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "test.essmarkup",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
  await page.getByText("Processing drawing…").waitFor({ state: "hidden" });
  const canvas = page.getByLabel("Scaffold drawing canvas");
  const box = await canvas.boundingBox();
  const zoom = Math.min((box.width - 80) / 1400, (box.height - 80) / 900),
    ox = (box.width - 1400 * zoom) / 2,
    oy = (box.height - 900 * zoom) / 2;
  const screen = (x, y) => ({
    x: box.x + ox + x * zoom,
    y: box.y + oy + y * zoom,
  });
  const move = async (x, y) => {
    const p = screen(x, y);
    await page.mouse.move(p.x, p.y);
  };
  const click = async (x, y) => {
    await move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  };
  await page.getByLabel("Toggle snap", { exact: true }).click(); // grid snap off; object snaps stay on
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await click(219, 225); // endpoint is deliberately off grid
  await move(419, 225);
  await page.getByTestId("line-preview").waitFor({ state: "attached" });
  await page.getByTestId("snap-marker").waitFor();
  near(
    Number(await page.getByTestId("line-preview").getAttribute("x2")),
    ox + 417 * zoom,
  );
  assert.equal((await saved()).length, 3, "preview must not create an object");
  await page.screenshot({ path: path.join(output, "dynamic-preview.png") });
  await click(419, 225);
  await click(600, 420);
  let items = await saved();
  assert.equal(items.length, 5);
  near(items[3].x, 217);
  near(items[3].y, 223);
  near(items[3].x2, 417);
  near(items[4].x, 417);
  await canvas.focus();
  await page.keyboard.press("u");
  assert.equal((await saved()).length, 4);
  await canvas.focus();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByTestId("line-preview").count(), 0);
  assert.equal((await saved()).length, 4);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await click(800, 600);
  await click(1000, 600);
  await click(1000, 750);
  await page.keyboard.press("c");
  items = await saved();
  assert.equal(items.length, 7);
  near(items.at(-1).x2, 800);
  near(items.at(-1).y2, 600);
  // Ortho and direct distance entry: cursor direction drives an exact 2.5 m line.
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await click(300, 600);
  await page.keyboard.press("F8");
  await move(600, 630);
  near(
    Number(await page.getByTestId("line-preview").getAttribute("y2")),
    oy + 600 * zoom,
  );
  await page.keyboard.type("2.5");
  await page.keyboard.press("Enter");
  items = await saved();
  near(items.at(-1).x2, 550);
  near(items.at(-1).y2, 600);
  await canvas.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("F8");
  // Running settings are separate from one-point overrides and F3.
  await page.getByLabel("Object snap settings", { exact: true }).click();
  const menu = page.getByRole("menu", {
    name: "Object snap settings",
    exact: true,
  });
  await menu.getByRole("menuitemcheckbox", { name: /Nearest/ }).click();
  assert.equal(
    await menu
      .getByRole("menuitemcheckbox", { name: /Nearest/ })
      .getAttribute("aria-checked"),
    "true",
  );
  await page.screenshot({ path: path.join(output, "snap-settings.png") });
  await menu.getByRole("menuitem", { name: "Done" }).click();
  await page.keyboard.press("F3");
  assert.equal(
    await page
      .getByLabel("Object snap", { exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await page.getByRole("button", { name: "Line", exact: true }).click();
  const p = screen(419, 225);
  await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y, { button: "right" });
  await page.keyboard.up("Shift");
  const overrides = page.getByRole("menu", { name: "Object snap overrides" });
  await overrides.getByRole("menuitem", { name: /Midpoint/ }).click();
  await click(419, 225);
  await click(430, 250);
  await page.keyboard.press("Enter");
  items = await saved();
  near(items.at(-1).x, 417);
  near(items.at(-1).y, 223);
  near(items.at(-1).x2, 430);
  near(items.at(-1).y2, 250);
  // Enter at the first prompt continues the last line, and duplicate endpoints create no segment.
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await canvas.focus();
  await page.keyboard.press("Enter");
  await click(430, 250);
  assert.equal((await saved()).length, items.length);
  await canvas.focus();
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "Passed: live preview, exact snap commits, continuous segments, Undo/Close/Escape/Enter, Ortho, distance input, settings, F3 and one-point overrides.",
  );
} finally {
  await browser.close();
}
