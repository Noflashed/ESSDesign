import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5188, https: false, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
    const page = await browser.newPage();
    const requests = [];
    let resetAttempts = 0;
    await page.route('**/api/auth/password/**', async route => {
        requests.push(route.request().postDataJSON());
        if (route.request().url().endsWith('/verify')) {
            await route.fulfill({ json: { accessToken: 'verified-recovery-session' } });
            return;
        }
        if (route.request().url().endsWith('/reset') && ++resetAttempts === 1) {
            await route.fulfill({ status: 400, json: { error: 'Choose a password different from your current password, then try again.' } });
            return;
        }
        await route.fulfill({ json: { message: 'OK' } });
    });
    await page.goto('http://localhost:5188/?auth=login-form');
    await page.getByRole('link', { name: 'Forgot password?' }).waitFor();
    await page.screenshot({ path: '../output/login-recovery-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '../output/login-recovery-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByLabel('Work email').fill('test@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await page.getByRole('heading', { name: 'Check your inbox' }).waitFor();
    assert.deepEqual(requests[0], { email: 'test@example.com' });
    await page.goto('http://localhost:5188/?auth=reset-password#token_hash=fake-recovery-token');
    await page.getByLabel('New password', { exact: true }).fill('test-password-123');
    await page.getByLabel('Confirm new password').fill('different-password');
    await page.getByRole('button', { name: 'Update password' }).click();
    await page.getByRole('alert').filter({ hasText: 'do not match' }).waitFor();
    assert.equal(requests.length, 1);
    assert.equal(new URL(page.url()).hash, '');
    await page.getByLabel('Confirm new password').fill('test-password-123');
    await page.getByRole('button', { name: 'Update password' }).click();
    await page.getByRole('alert').filter({ hasText: 'different from your current password' }).waitFor();
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[1], { tokenHash: 'fake-recovery-token' });
    assert.deepEqual(requests[2], { accessToken: 'verified-recovery-session', password: 'test-password-123' });
    assert.equal(await page.evaluate(() => localStorage.getItem('access_token')), null);
    await page.getByLabel('New password', { exact: true }).fill('better-password-456');
    await page.getByLabel('Confirm new password').fill('better-password-456');
    await page.getByRole('button', { name: 'Update password' }).click();
    await page.getByRole('heading', { name: 'Password updated' }).waitFor();
    assert.equal(requests.length, 4);
    assert.deepEqual(requests[3], { accessToken: 'verified-recovery-session', password: 'better-password-456' });
    await page.goto('http://localhost:5188/?auth=reset-password');
    await page.getByRole('alert').filter({ hasText: 'missing' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Update password' }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5188/?auth=forgot-password');
    await page.getByLabel('Work email').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: '../output/password-recovery-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: '../output/password-recovery-desktop.png', fullPage: true });
    console.log('Recovery navigation, request, mismatch, token handling, success, missing link and mobile layout passed.');
} finally {
    await browser.close();
    await server.close();
}
