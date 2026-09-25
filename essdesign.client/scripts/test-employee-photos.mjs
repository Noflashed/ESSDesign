import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5184';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const userId = '11111111-1111-1111-1111-111111111111';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=', 'base64');
let uploads = 0;
let proxyDownloads = 0;
let rejectUpload = false;
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const json = body => route.fulfill({ json: body });
    if (url.pathname === '/employee-photo-test') return route.fulfill({ contentType: 'text/html', body: `
        <div id="root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { default: EmployeesPage } = await import('/src/components/EmployeesPage.jsx');
        await import('/src/App.css');
        localStorage.setItem('access_token', 'test-token');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(EmployeesPage));
        </script>` });
    if (url.pathname === '/api/users') return json([{ id: userId, fullName: 'Photo Test', email: 'test@example.com', role: 'general_scaffolder', avatarUrl: `${baseURL}/provider-avatar.png`, profileImageUrl: `${baseURL}/old-avatar.png` }]);
    if (url.pathname.endsWith('/sync-employee-links')) return json({ syncedCount: 0 });
    if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/storage/v1/object/list/')) return json([]);
    if (url.pathname.endsWith('/credentials')) return json(['white_card', 'driver_licence', 'high_risk_work_licence'].map(credentialType => ({
        credentialType, credentialNumber: '12345', hasFrontImage: true,
        frontImageUrl: `${baseURL}/licence.png?type=${credentialType}`, updatedAt: '2026-09-25T00:00:00Z'
    })));
    if (url.pathname.endsWith('/front-image')) { proxyDownloads++; return route.fulfill({ contentType: 'image/png', body: png }); }
    if (url.pathname.endsWith('/profile-image')) {
        uploads++;
        assert.equal(url.pathname, `/api/users/${userId}/profile-image`);
        assert.ok(route.request().postDataBuffer().includes(Buffer.from('avatar.png')));
        return rejectUpload ? route.fulfill({ status: 500, json: { error: 'Upload failed for test' } }) : json({ profileImageUrl: `${baseURL}/new-avatar.png?v=2` });
    }
    if (url.hostname.endsWith('supabase.co') || url.pathname.endsWith('.png')) return route.fulfill({ contentType: 'image/png', body: png });
    return route.continue();
});
try {
    await page.goto(`${baseURL}/employee-photo-test`);
    const images = page.locator('.employee-details-credential-image img');
    await images.first().waitFor();
    assert.equal(await images.count(), 3);
    assert.equal(proxyDownloads, 0, 'Signed images avoid the application image proxy');
    assert.equal(await images.first().locator('..').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    await images.first().click();
    assert.equal(await page.locator('.employee-credential-viewer-panel > img').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    const input = page.getByLabel('Change employee profile photo');
    await input.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
    await page.getByText('Choose a JPEG, PNG or WebP photo up to 5 MB.').waitFor();
    assert.equal(uploads, 0);
    await input.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
    await page.locator('.employee-profile-main-avatar img[src*="new-avatar.png"]').waitFor();
    assert.equal(uploads, 1);
    rejectUpload = true;
    await input.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
    await page.getByText('Upload failed for test').waitFor();
    assert.equal(await page.locator('.employee-profile-main-avatar img').getAttribute('src'), `${baseURL}/new-avatar.png?v=2`);
    assert.equal(uploads, 2);
    assert.deepEqual(errors, []);
    console.log('PASS: direct licence loading, transparent previews, validation, profile update and failed-upload recovery');
} catch (error) {
    console.error(await page.locator('body').innerText());
    throw error;
} finally {
    await browser.close();
}
