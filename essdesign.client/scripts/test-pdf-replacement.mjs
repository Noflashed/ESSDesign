import {chromium} from 'playwright';
import {jsPDF} from 'jspdf';
import assert from 'node:assert/strict';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5189';
const browser = await chromium.launch({headless: true, channel: 'chrome'});
const page = await browser.newPage();
let version = 1, reads = 0, failLookup = false, failDownload = false;
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem('access_token', 'test-token'));
await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/folders/documents/drawing-test/download/ess') {
        reads++;
        return failLookup ? route.fulfill({status: 503, json: {error: 'Unavailable'}}) : route.fulfill({json: {
            url: `${baseURL}/api/folders/documents/drawing-test/public-download/ess?v=${version}`,
            fileName: `Replacement ${version}.pdf`,
        }});
    }
    if (url.pathname === '/api/folders/documents/drawing-test/replace') {
        version++;
        return route.fulfill({json: {document: {id: 'drawing-test'}}});
    }
    if (url.pathname === '/api/folders/documents/drawing-test/public-download/ess') {
        if (failDownload) return route.fulfill({status: 503, body: 'Unavailable'});
        const pdf = new jsPDF(); pdf.text(`Current PDF version ${version}`, 10, 10);
        return route.fulfill({contentType: 'application/pdf', headers: {'Cache-Control': 'no-store'}, body: Buffer.from(pdf.output('arraybuffer'))});
    }
    if (url.origin === baseURL) return route.continue();
    return route.abort();
});
const expectVersion = async expected => {
    await page.locator('.pdf-filename-small').filter({hasText: `Replacement ${expected}.pdf`}).waitFor();
    assert.match(await page.locator('.pdf-iframe').getAttribute('src'), new RegExp(`v=${expected}#`));
};
try {
    await page.goto(`${baseURL}/tests/fixtures/pdf-replacement.html`);
    await page.getByRole('button', {name: 'Open old message'}).click();
    await expectVersion(1);
    await page.getByTitle('Close', {exact: true}).click();
    version = 2;
    await page.getByRole('button', {name: 'Open old message'}).click();
    await expectVersion(2);
    assert.ok(reads >= 2, 'Reopening the same stale message must resolve the current PDF');

    // Exercise the real replacement API notification, with the upload endpoint mocked.
    await page.evaluate(async () => {
        const {foldersAPI} = await import('/src/services/api.js');
        await foldersAPI.replaceDocumentFiles('drawing-test', new File(['test PDF'], 'new.pdf', {type: 'application/pdf'}), null);
    });
    await expectVersion(3);
    version = 4;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expectVersion(4);
    version = 5;
    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('Download', {exact: true}).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'Replacement 5.pdf');
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    assert.match(Buffer.concat(chunks).toString(), /Current PDF version 5/);

    failLookup = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText('Failed to load PDF', {exact: true}).waitFor();
    assert.equal(await page.locator('.pdf-iframe').count(), 0, 'Never show the old PDF as a fallback after lookup fails');
    failLookup = false;
    version = 6;
    await page.getByRole('button', {name: 'Retry'}).click();
    await expectVersion(6);
    failDownload = true;
    await page.getByTitle('Download', {exact: true}).click();
    await page.getByText('Failed to download PDF. Please try again.', {exact: true}).waitFor();
    assert.equal(page.context().pages().length, 1, 'Failed downloads must not fall back to an old PDF in a new tab');
    assert.deepEqual(errors, []);
    console.log('PDF replacement: old message, replacement event, tab return, download bytes/name and failed lookup recovery passed.');
} finally { await browser.close(); }
