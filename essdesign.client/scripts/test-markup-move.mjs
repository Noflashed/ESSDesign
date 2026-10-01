import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const out = new URL("../../output/ess-markup-move-test/", import.meta.url);
await fs.mkdir(out, { recursive: true });
async function saved() {
  const pending = page.waitForEvent("download");
  await page.getByLabel("Save drawing", { exact: true }).click();
  const d = await pending;
  return JSON.parse(await fs.readFile(await d.path(), "utf8")).sheets[0].items;
}
try {
  await page.goto(
    `${process.env.TEST_BASE_URL || "http://127.0.0.1:5182"}/tests/fixtures/ess-markup.html`,
  );
  const initial = [
    { id: "a", type: "line", x: 200, y: 200, x2: 400, y2: 200 },
    {
      id: "b",
      type: "bay",
      x: 600,
      y: 400,
      length: 2.4,
      depth: 1.2,
      rotation: 0,
    },
  ];
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "move.essmarkup",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          title: "MOVE verification",
          sheets: [
            {
              id: "test",
              name: "Model",
              width: 1400,
              height: 900,
              pixelsPerMetre: 100,
              image: null,
              calibrated: true,
              items: initial,
            },
          ],
        }),
      ),
    });
  await page.getByText("Processing drawing…").waitFor({ state: "hidden" });
  const canvas = page.getByLabel("Scaffold drawing canvas"),
    box = await canvas.boundingBox(),
    z = Math.min((box.width - 80) / 1400, (box.height - 80) / 900),
    ox = (box.width - 1400 * z) / 2,
    oy = (box.height - 900 * z) / 2;
  const move = async (x, y) =>
    page.mouse.move(box.x + ox + x * z, box.y + oy + y * z);
  const click = async (x, y) => {
    await move(x, y);
    await page.mouse.down();
    await page.mouse.up();
  };
  const menu = async (x, y) => {
    await move(x, y);
    await page.mouse.click(box.x + ox + x * z, box.y + oy + y * z, {
      button: "right",
    });
    return page.getByRole("menu", { name: "Drawing quick actions" });
  };
  // Command-first selection must not drag the object.
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await click(250, 200);
  await canvas.press("Enter");
  await click(200, 200);
  await move(300, 300);
  await page.getByTestId("move-preview-vector").waitFor({ state: "attached" });
  assert.deepEqual(
    await saved(),
    initial,
    "preview must not modify saved objects",
  );
  await page.screenshot({
    path: fileURLToPath(new URL("move-preview.png", out)),
  });
  await click(300, 300);
  let items = await saved();
  assert.equal(items[0].x, 300);
  assert.equal(items[0].y, 300);
  assert.deepEqual(items[1], initial[1]);
  await page.getByLabel("Undo", { exact: true }).click();
  assert.deepEqual(await saved(), initial);
  // Preselection through context menu supports moving mixed objects together.
  let quick = await menu(100, 100);
  await quick
    .getByRole("menuitem", { name: "Select all", exact: true })
    .click();
  quick = await menu(100, 100);
  await page.screenshot({
    path: fileURLToPath(new URL("quick-actions.png", out)),
  });
  await quick.getByRole("menuitem", { name: "Move", exact: true }).click();
  await click(200, 200);
  await move(350, 250);
  await click(350, 250);
  items = await saved();
  assert.equal(items[0].x, 350);
  assert.equal(items[1].x, 750);
  assert.equal(items[1].y, 450);
  await page.getByLabel("Undo", { exact: true }).click();
  assert.deepEqual(await saved(), initial);
  // Escape cancels live movement without a history entry.
  await click(250, 200);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await click(200, 200);
  await move(350, 350);
  await canvas.press("Escape");
  assert.deepEqual(await saved(), initial);
  // Context-menu completion of the select phase, then typed relative displacement.
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await click(250, 200);
  quick = await menu(100, 100);
  await quick
    .getByRole("menuitem", { name: "Enter · finish selection" })
    .click();
  await click(200, 200);
  await page.getByLabel("Command line").fill("@1,-1");
  await page.getByLabel("Command line").press("Enter");
  items = await saved();
  assert.equal(items[0].x, 300);
  assert.equal(items[0].y, 300);
  await page.getByLabel("Undo", { exact: true }).click();
  // LINE right-click opens actions without ending the command or adding geometry.
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await click(200, 600);
  await move(400, 600);
  quick = await menu(400, 600);
  assert.equal(await page.getByTestId("line-preview").count(), 1);
  await quick.getByRole("menuitem", { name: "Cancel command" }).click();
  assert.equal(await page.getByTestId("line-preview").count(), 0);
  assert.deepEqual(await saved(), initial);
  // Context erase is undoable.
  await click(250, 200);
  quick = await menu(100, 100);
  await quick.getByRole("menuitem", { name: "Erase", exact: true }).click();
  assert.deepEqual(
    (await saved()).map((i) => i.id),
    ["b"],
  );
  quick = await menu(100, 100);
  await quick.getByRole("menuitem", { name: "Undo", exact: true }).click();
  assert.deepEqual(await saved(), initial);
  assert.deepEqual(errors, []);
  console.log(
    "Passed: command-first and preselected MOVE, live preview, grouped move, typed displacement, cancel, undo, contextual selection/line/erase actions.",
  );
} finally {
  await browser.close();
}
