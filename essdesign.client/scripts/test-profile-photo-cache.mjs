import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5184';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();
let listings = 0;
let downloads = 0;
let version = '2026-09-25T01:00:00Z';
let extension = 'png';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/photo-cache-test') return route.fulfill({ contentType: 'text/html', body: `
        <div id="root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        window.photoAPI = await import('/src/services/api.js');
        const { default: useProfilePhoto } = await import('/src/hooks/useProfilePhoto.js');
        window.mountPhoto = () => {
            function Photo() { const url = useProfilePhoto('user-1'); return React.createElement('output', null, url); }
            ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Photo));
        };
        </script>` });
    if (url.pathname.includes('/storage/v1/object/list/')) {
        listings++;
        return route.fulfill({ json: [{ name: `avatar.${extension}`, updated_at: version }] });
    }
    if (url.pathname === '/api/users/user-1/profile-image') return route.fulfill({ json: { profileImageUrl: `${baseURL}/new-photo.png?v=upload` } });
    if (url.hostname.endsWith('supabase.co')) { downloads++; return route.abort(); }
    return route.continue();
});
const expire = () => page.evaluate(() => {
    const key = window.photoAPI.AVATAR_EXT_CACHE_KEY;
    const cache = JSON.parse(localStorage.getItem(key));
    cache['user-1'].checkedAt = Date.now() - 301000;
    localStorage.setItem(key, JSON.stringify(cache));
});
try {
    await page.goto(`${baseURL}/photo-cache-test`);
    await page.waitForFunction(() => !!window.mountPhoto);
    await page.evaluate(() => {
        localStorage.setItem('ess-avatar-ext-v2', JSON.stringify({ 'user-1': { ext: 'jpg' } }));
        localStorage.setItem('ess-owner-avatar-url-cache-v1', JSON.stringify({ 'user-1': 'https://old/photo.jpg' }));
    });
    const urls = await page.evaluate(() => Promise.all(Array.from({ length: 20 }, () => window.photoAPI.resolveProfileImageUrl('user-1'))));
    assert.equal(listings, 1, 'Concurrent owners share one metadata request');
    assert.ok(urls.every(url => url === urls[0]));
    assert.ok(urls[0].includes('avatar.png') && urls[0].includes('width=256') && urls[0].includes(encodeURIComponent(version)));
    await page.evaluate(() => window.mountPhoto());
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('avatar.png'));
    for (let i = 0; i < 10; i++) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(listings, 1, 'Mount and repeated focus reuse the five-minute metadata cache');
    await expire();
    const unchanged = await page.evaluate(() => window.photoAPI.resolveProfileImageUrl('user-1'));
    assert.equal(unchanged, urls[0], 'Unchanged images keep an identical URL for browser/CDN caching');
    assert.equal(listings, 2);
    version = '2026-09-25T02:00:00Z';
    extension = 'webp';
    await expire();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('avatar.webp'));
    assert.equal(listings, 3, 'A later visit discovers replacement files and new extensions');
    await page.evaluate(() => window.photoAPI.usersAPI.uploadUserProfileImage('user-1', new File(['photo'], 'avatar.png', { type: 'image/png' })));
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('new-photo.png?v=upload'));
    assert.equal(listings, 3, 'Uploads update mounted photos without listing storage again');
    assert.equal(await page.evaluate(() => window.photoAPI.resolveProfileImageUrl('user-1')), `${baseURL}/new-photo.png?v=upload`);
    assert.equal(downloads, 0, 'Resolving photos downloads metadata only');
    assert.deepEqual(errors, []);
    console.log('PASS: legacy cache recovery, concurrent deduplication, five-minute cache, stable URLs, replacement detection, immediate upload refresh');
} finally { await browser.close(); }
