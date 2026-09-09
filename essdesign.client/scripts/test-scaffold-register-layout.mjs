import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5178';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
let empty = false;
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
    localStorage.clear();
});
await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/fixture/forms') {
        const records = empty ? [] : Array.from({ length: 40 }, (_, index) => ({
            id: `record-${index}`, scaffoldName: `North elevation ${index + 1}`,
            updatedAt: '2026-09-09T00:00:00Z',
            drawingDocumentId: index === 0 ? 'drawing-1' : '',
            drawingDocumentType: 'ess',
            drawingNumber: 'D-100 — a very long drawing reference that must truncate',
        }));
        return route.fulfill({ json: url.searchParams.get('type') === 'scaffold-register' ? records : [] });
    }
    if (url.origin === baseURL) return route.continue();
    return route.abort();
});

async function load() {
    await page.goto(`${baseURL}/tests/fixtures/scaffold-register.html`);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.addStyleTag({ content: '#root { height: 100vh; } @media(min-width: 701px) { #root { margin-left:236px; } }' });
    await page.locator('caption .scaffold-register-add').waitFor();
}

async function checkAdd() {
    const add = page.locator('caption .scaffold-register-add');
    const rect = await add.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width);
    assert.ok(rect.y >= 0 && rect.y + rect.height <= viewport.height);
    await add.click({ timeout: 3000 });
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
}

try {
    for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 850 });
        await load();
        await checkAdd();
        if (process.env.TEST_SCREENSHOT_DIR) {
            await page.screenshot({ path: path.join(process.env.TEST_SCREENSHOT_DIR, `scaffold-register-${width}.png`) });
        }
        const actions = page.locator('tbody tr').first().locator('.scaffold-register-add-cell');
        assert.equal(await actions.count(), 3);
        for (const action of await actions.all()) {
            await action.scrollIntoViewIfNeeded();
            const dimensions = await action.evaluate(button => {
                const rect = button.getBoundingClientRect();
                const icon = button.querySelector('svg').getBoundingClientRect();
                const cell = button.closest('td');
                return { iconWidth: icon.width, iconHeight: icon.height,
                    rightGap: cell.getBoundingClientRect().right - rect.right,
                    cellPadding: parseFloat(getComputedStyle(cell).paddingRight) };
            });
            assert.equal(dimensions.iconWidth, 16);
            assert.equal(dimensions.iconHeight, 16);
            assert.ok(Math.abs(dimensions.rightGap - dimensions.cellPadding) <= 1);
            await action.click({ trial: true });
        }
        await page.locator('.scaffold-register-table-wrap').evaluate(el => { el.scrollLeft = el.scrollWidth; el.scrollTop = el.scrollHeight; });
        await checkAdd();
        await page.getByRole('searchbox').fill('no matching scaffold');
        await page.getByText('No scaffolds match the current search.').waitFor();
        await checkAdd();
        await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        await checkAdd();
        console.log(`PASS: ${width}px — icons, alignment, scrolling, filtering, dialog, dark mode`);
    }
    empty = true;
    await load();
    await page.getByText('No scaffold records yet. Add a scaffold to get started.').waitFor();
    await checkAdd();
    assert.deepEqual(errors, []);
    console.log('PASS: empty register retains the in-table Add scaffold action');
} finally {
    await browser.close();
}
