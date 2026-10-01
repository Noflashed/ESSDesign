import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = new URL(
  "../../output/ess-markup-selection-test/",
  import.meta.url,
);
await fs.mkdir(output, { recursive: true });
async function saved() {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save drawing", exact: true }).click();
  const d = await promise;
  return JSON.parse(await fs.readFile(await d.path(), "utf8")).sheets[0].items;
}
try {
  await page.goto(
    `${process.env.TEST_BASE_URL || "http://127.0.0.1:5182"}/tests/fixtures/ess-markup.html`,
  );
  const items = [
    { id: "a", type: "line", x: 200, y: 200, x2: 400, y2: 200 },
    { id: "b", type: "line", x: 300, y: 100, x2: 300, y2: 450 },
    { id: "c", type: "line", x: 600, y: 100, x2: 800, y2: 300 },
    {
      id: "bay",
      type: "bay",
      x: 700,
      y: 500,
      length: 2.4,
      depth: 1.2,
      rotation: 0,
    },
  ];
  const fixture = {
    version: 1,
    title: "Window and crossing selection",
    sheets: [
      {
        id: "sheet",
        name: "Model",
        width: 1400,
        height: 900,
        image: null,
        pixelsPerMetre: 100,
        calibrated: true,
        items,
      },
    ],
  };
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "selection.essmarkup",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
  await page.getByText("Processing drawing…").waitFor({ state: "hidden" });
  const canvas = page.getByLabel("Scaffold drawing canvas"),
    box = await canvas.boundingBox();
  const zoom = Math.min((box.width - 80) / 1400, (box.height - 80) / 900),
    ox = (box.width - 1400 * zoom) / 2,
    oy = (box.height - 900 * zoom) / 2;
  const move = async (x, y, steps = 1) =>
    page.mouse.move(box.x + ox + x * zoom, box.y + oy + y * zoom, { steps });
  const start = async (x, y) => {
    await move(x, y);
    await page.mouse.down();
  };
  const select = async (x1, y1, x2, y2) => {
    await start(x1, y1);
    await page.mouse.up();
    await move(x2, y2, 5);
    await page.mouse.down();
    await page.mouse.up();
  };
  const escape = async () => {
    await canvas.focus();
    await page.keyboard.press("Escape");
  };
  assert.equal(
    await canvas.evaluate((c) => getComputedStyle(c).cursor),
    "none",
  );
  await start(150, 150);
  await page.mouse.up();
  await move(450, 300, 5);
  assert.equal(
    await page.getByTestId("selection-rectangle").getAttribute("class"),
    "cad-window-rectangle",
  );
  await page.screenshot({
    path: fileURLToPath(new URL("blue-window.png", output)),
  });
  assert.equal(
    await page.locator(".cad-selection-name").innerText(),
    "No selection",
    "first click and hover must not commit selection",
  );
  await page.mouse.down();
  await page.mouse.up();
  assert.equal(
    await page.locator(".cad-selection-name").innerText(),
    "Selected line",
  );
  await page.getByLabel("Delete selected", { exact: true }).click();
  assert.deepEqual(
    (await saved()).map((i) => i.id),
    ["b", "c", "bay"],
  );
  await page.getByLabel("Undo", { exact: true }).click();
  assert.deepEqual(await saved(), items);
  await start(450, 300);
  await page.mouse.up();
  await move(150, 150, 5);
  assert.equal(
    await page.getByTestId("selection-rectangle").getAttribute("class"),
    "cad-crossing-rectangle",
  );
  await page.screenshot({
    path: fileURLToPath(new URL("green-crossing.png", output)),
  });
  await page.mouse.down();
  await page.mouse.up();
  assert.match(
    await page.locator(".cad-selection-name").innerText(),
    /2 objects selected/,
  );
  // Move the selected lines together, and undo as a single operation.
  await start(250, 200);
  await move(350, 300, 5);
  await page.mouse.up();
  let changed = await saved();
  assert.equal(changed[0].x, 300);
  assert.equal(changed[1].x, 400);
  assert.deepEqual(changed[2], items[2]);
  await page.getByLabel("Undo", { exact: true }).click();
  assert.deepEqual(await saved(), items);
  // Shift-click subtracts from the selection, then delete affects only the remaining object.
  await select(450, 300, 150, 150);
  await page.keyboard.down("Shift");
  await move(250, 200);
  await page.mouse.click(box.x + ox + 250 * zoom, box.y + oy + 200 * zoom);
  await page.keyboard.up("Shift");
  assert.equal(
    await page.locator(".cad-selection-name").innerText(),
    "Selected line",
  );
  await page.getByLabel("Delete selected", { exact: true }).click();
  assert.deepEqual(
    (await saved()).map((i) => i.id),
    ["a", "c", "bay"],
  );
  await page.getByLabel("Undo", { exact: true }).click();
  // A crossing rectangle that overlaps a diagonal's bounding box but not the line must not select it.
  await escape();
  await select(650, 300, 590, 250);
  assert.equal(
    await page.locator(".cad-selection-name").innerText(),
    "No selection",
  );
  // Dragging can begin beyond the paper boundary, enclosing everything.
  await select(-20, -20, 1450, 940);
  assert.match(
    await page.locator(".cad-selection-name").innerText(),
    /4 objects selected/,
  );
  await escape();
  await start(450, 300);
  await page.mouse.up();
  await move(150, 150);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.getByTestId("selection-rectangle").count(), 0);
  assert.equal(
    await page.locator(".cad-selection-name").innerText(),
    "No selection",
  );
  assert.deepEqual(await saved(), items);
  // Cancelling a group move restores geometry and does not add an undo operation.
  await select(450, 300, 150, 150);
  await start(250, 200);
  await move(350, 300);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await saved(), items);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await move(500, 500);
  assert.match(
    await page.locator(".cad-crosshair").getAttribute("class"),
    /cad-drawing-cursor/,
  );
  assert.equal(
    await page
      .locator(".cad-crosshair")
      .evaluate((c) => getComputedStyle(c).mixBlendMode),
    "difference",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed: crosshair modes, blue window, green crossing, exact geometry, multi-move/delete, Shift removal, Undo, off-sheet start and Escape cancellation.",
  );
} finally {
  await browser.close();
}
