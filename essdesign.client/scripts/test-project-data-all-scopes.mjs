import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:5190";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== baseURL) return route.abort();
  if (url.pathname.startsWith("/fixture/"))
    return route.fulfill({
      body: "%PDF-1.4\n%%EOF",
      contentType: "application/pdf",
    });
  return route.continue();
});
const rows = page.locator(".pf-table-row");
const count = async (expected) => {
  await page.waitForFunction(
    (n) => document.querySelectorAll(".pf-table-row").length === n,
    expected,
  );
};
try {
  await page.goto(
    `${baseURL}/tests/fixtures/register-dropdowns.html?project-data&slow-load`,
  );
  const loader = page.locator(".pf-initial-loading");
  await loader.waitFor();
  assert.equal(
    await loader.evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(255, 255, 255)",
  );
  const bounds = await loader.boundingBox();
  const logo = await loader.locator(".loading-brandmark").boundingBox();
  assert.ok(
    Math.abs(logo.x + logo.width / 2 - bounds.x - bounds.width / 2) < 2,
  );
  assert.ok(
    Math.abs(logo.y + logo.height / 2 - bounds.y - bounds.height / 2) < 2,
  );
  await count(3);
  await page.waitForFunction(
    () => document.querySelector(".pf-avatar img")?.naturalWidth > 0,
  );

  await page.getByRole("button", { name: "Builder", exact: true }).click();
  await page
    .getByRole("option", { name: "Alpha Builder", exact: true })
    .click();
  await count(2);
  await page.waitForFunction(
    () =>
      document.querySelector(
        ".pf-scope .scaffold-register-dropdown-trigger img",
      )?.naturalWidth > 0,
  );
  await page.getByRole("button", { name: "Builder", exact: true }).click();
  assert.equal(
    await page
      .getByRole("option", { name: "Alpha Builder", exact: true })
      .locator("img")
      .count(),
    1,
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .locator(".project-files-page")
      .evaluate((e) => getComputedStyle(e).fontFamily),
    '"Google Sans", Roboto, Arial, sans-serif',
  );
  assert.equal(
    await page
      .locator(".pf-document strong")
      .first()
      .evaluate((e) => getComputedStyle(e).fontWeight),
    "500",
  );
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: "North Site", exact: true }).click();
  await count(1);
  assert.equal(await page.locator(".loading-brandmark").count(), 0);
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        ".pf-scope .scaffold-register-dropdown-trigger img",
      ).length === 2,
  );

  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: "All Projects", exact: true }).click();
  await count(2);
  await page.getByRole("button", { name: "Builder", exact: true }).click();
  await page.getByRole("option", { name: "All Builders", exact: true }).click();
  await count(3);
  for (const type of ["Handovers", "Day Labour / Variations", "Pre-starts"]) {
    await page.getByRole("button", { name: type, exact: true }).click();
    await count(3);
  }
  assert.equal(
    await page
      .getByRole("columnheader", { name: "Status", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Handovers", exact: true }).click();
  assert.equal(
    await page
      .getByRole("columnheader", { name: "Status", exact: true })
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Pre-starts", exact: true }).click();
  const popupEvent = page.waitForEvent("popup");
  await page
    .getByRole("table")
    .getByRole("button", {
      name: "West Site form.pdf west · West Site",
      exact: true,
    })
    .click();
  const popup = await popupEvent;
  await popup.waitForURL("**/fixture/west.pdf");
  await popup.close();
  assert.deepEqual((await page.evaluate(() => window.__scopeActions)).at(-1), {
    action: "get",
    builderId: "beta",
    projectId: "west",
    id: "shared-form-id",
  });
  await page
    .getByRole("checkbox", {
      name: "Select all files on this page",
      exact: true,
    })
    .check();
  assert.equal(await page.getByText("3 selected", { exact: true }).count(), 1);
  await rows.last().click({ button: "right" });
  assert.equal(
    await page
      .getByRole("menuitem", { name: "Download selected (3)", exact: true })
      .count(),
    1,
  );
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Download selected (3)", exact: true })
    .click();
  const archive = await downloadEvent;
  assert.equal(await archive.failure(), null);
  const entries = unzipSync(
    new Uint8Array(await readFile(await archive.path())),
  );
  assert.equal(Object.keys(entries).length, 3);
  assert.ok(
    Object.values(entries).every((bytes) =>
      new TextDecoder().decode(bytes).startsWith("%PDF"),
    ),
  );
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search documents", exact: true })
    .fill("West Site");
  await count(1);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await count(3);
  await page
    .getByRole("button", {
      name: "Open actions for West Site form.pdf",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Delete PDF", exact: true }).click();
  const modal = page.getByRole("dialog", {
    name: "Delete Project Data PDF?",
    exact: true,
  });
  assert.match(await modal.innerText(), /from West Site/);
  await modal.getByRole("button", { name: "Delete PDF", exact: true }).click();
  await count(2);
  assert.deepEqual((await page.evaluate(() => window.__scopeActions)).at(-1), {
    action: "delete",
    builderId: "beta",
    projectId: "west",
    id: "shared-form-id",
  });
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByRole("option", { name: "South Site — Alpha Builder", exact: true })
    .click();
  await count(1);
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: "All Projects", exact: true }).click();
  await page
    .getByRole("button", { name: "New Day Labour/Variation", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "New Day Labour/Variation", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "New Pre-Start", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "New Pre-Start", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto(
    `${baseURL}/tests/fixtures/register-dropdowns.html?project-data&many-forms`,
  );
  await count(7);
  await page
    .getByRole("checkbox", {
      name: "Select all files on this page",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await count(7);
  assert.equal(await page.getByText("7 selected", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "Last page", exact: true }).click();
  await count(4);
  await page.getByRole("button", { name: "First page", exact: true }).click();
  await count(7);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 672, height: 920 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    assert.equal(
      await page
        .locator(".project-files-page")
        .evaluate(
          (e) =>
            e.scrollHeight <= e.clientHeight && e.scrollWidth <= e.clientWidth,
        ),
      true,
    );
    assert.equal(
      await page
        .locator(".pf-table-area")
        .evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
      true,
      JSON.stringify(
        await page.locator(".pf-table-area").evaluate((e) => ({
          h: e.clientHeight,
          scroll: e.scrollHeight,
          rows: [...e.querySelectorAll("tr")].map(
            (r) => r.getBoundingClientRect().height,
          ),
        })),
      ),
    );
  }
  await page.getByRole("button", { name: "Builder", exact: true }).click();
  await page
    .getByRole("option", { name: "Alpha Builder", exact: true })
    .click();
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: "North Site", exact: true }).click();
  for (const [button, dialog] of [
    ["New Day Labour/Variation", "Day Labour form"],
    ["New Pre-Start", "Pre-Start form"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.getByRole("dialog", { name: dialog, exact: true }).waitFor();
    assert.equal(
      await page.getByRole("dialog", { name: dialog, exact: true }).isVisible(),
      true,
    );
    await page.goto(
      baseURL + "/tests/fixtures/register-dropdowns.html?project-data",
    );
    await count(3);
    await page.getByRole("button", { name: "Builder", exact: true }).click();
    await page
      .getByRole("option", { name: "Alpha Builder", exact: true })
      .click();
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByRole("option", { name: "North Site", exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Live Project Data scope, PDF routing, ZIP contents, selection, search, deletion, creation dialogs and viewport fit.",
  );
} finally {
  await browser.close();
}
