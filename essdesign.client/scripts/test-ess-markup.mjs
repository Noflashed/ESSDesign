import { chromium } from "playwright";
import { jsPDF } from "jspdf";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = new URL("../../output/ess-markup-test/", import.meta.url);
await fs.mkdir(output, { recursive: true });
async function saved() {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save drawing" }).click();
  const file = await waiting;
  return JSON.parse(await fs.readFile(await file.path(), "utf8"));
}
try {
  await page.goto(
    `${process.env.TEST_BASE_URL || "http://127.0.0.1:5182"}/tests/fixtures/ess-markup.html`,
  );
  const canvas = page.getByLabel("Scaffold drawing canvas");
  await page.getByRole("button", { name: "Place bay" }).click();
  await canvas.click({ position: { x: 300, y: 220 } });
  let data = await saved();
  assert.equal(data.sheets[0].items.length, 1);
  const original = data.sheets[0].items[0];
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + 310, rect.y + 230);
  await page.mouse.down();
  await page.mouse.move(rect.x + 390, rect.y + 270, { steps: 6 });
  await page.mouse.up();
  data = await saved();
  assert.notEqual(data.sheets[0].items[0].x, original.x);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  data = await saved();
  assert.equal(data.sheets[0].items[0].x, original.x);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  data = await saved();
  assert.notEqual(data.sheets[0].items[0].x, original.x);
  const pdf = new jsPDF({ orientation: "landscape" });
  pdf.setFontSize(24);
  pdf.text("SITE PLAN - REFERENCE 10 m", 30, 30);
  pdf.line(30, 60, 230, 60);
  pdf.rect(60, 90, 150, 70);
  pdf.addPage();
  pdf.text("SECOND SHEET", 30, 30);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "site-plan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdf.output("arraybuffer")),
    });
  await page.getByText("Processing drawing…").waitFor({ state: "hidden" });
  assert.equal(
    await page.getByLabel("Active sheet").locator("option").count(),
    3,
  );
  assert.ok(
    await page
      .getByRole("button", { name: "Scaffold bay", exact: true })
      .isDisabled(),
  );
  await canvas.click({ position: { x: 200, y: 180 } });
  await canvas.click({ position: { x: 500, y: 180 } });
  await page.getByLabel("Actual length (metres)").fill("10");
  await page.getByRole("button", { name: "Apply scale" }).click();
  await page.getByRole("button", { name: "Place bay" }).click();
  await canvas.click({ position: { x: 450, y: 320 } });
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Note text").fill("Access scaffold");
  await canvas.click({ position: { x: 470, y: 420 } });
  data = await saved();
  assert.ok(data.sheets[1].calibrated);
  assert.equal(data.sheets[1].items.length, 2);
  assert.equal(data.sheets[2].calibrated, false);
  await page.screenshot({
    path: fileURLToPath(new URL("workspace.png", output)),
    fullPage: true,
  });
  const exporting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const exported = await exporting;
  await exported.saveAs(fileURLToPath(new URL("drawing.pdf", output)));
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(await exported.path());
  await page.getByText("Processing drawing…").waitFor({ state: "hidden" });
  assert.equal(
    await page.getByLabel("Active sheet").locator("option").count(),
    6,
  );
  await page.screenshot({
    path: fileURLToPath(new URL("export-review.png", output)),
    fullPage: true,
  });
  page.on("dialog", (d) => d.accept());
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "saved.essmarkup",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await page.getByText("Processing drawing…").waitFor({ state: "hidden" });
  assert.deepEqual(await saved(), data);
  await page.evaluate(() => window.showMarkup(false));
  await page.getByText("Another app page").waitFor();
  await page.evaluate(() => window.showMarkup(true));
  await page.getByLabel("Scaffold drawing canvas").waitFor();
  assert.deepEqual(await saved(), data);
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "invalid.essmarkup",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":100}'),
    });
  await page.getByRole("alert").waitFor();
  assert.deepEqual(await saved(), data);
  await page.getByLabel("Dismiss error").click();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Toggle grid", { exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await page.getByLabel("Toggle grid", { exact: true }).click();
  await page.getByLabel("Hide palettes").click();
  assert.equal(await page.locator(".markup-inspector").count(), 0);
  await page.getByLabel("Command line").fill("NOTE");
  await page.getByLabel("Command line").press("Enter");
  await page.getByLabel("Note text").waitFor();
  await page.getByLabel("Command line").fill("SELECT");
  await page.getByLabel("Command line").press("Enter");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Select", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.screenshot({
    path: fileURLToPath(new URL("cad-model-space.png", output)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 850 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: fileURLToPath(new URL("mobile.png", output)),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Passed: placement, drag, undo/redo, PDF import, calibration, notes, PDF export/reimport, editable round trip, mobile layout.",
  );
} finally {
  await browser.close();
}
