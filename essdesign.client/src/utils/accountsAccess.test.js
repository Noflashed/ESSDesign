import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS_NAV_ITEMS, resolveAccountsPage } from './accountsAccess.js';

test('Accounts navigation includes exactly the five requested modules', () => {
    assert.deepEqual(ACCOUNTS_NAV_ITEMS.map(item => item.key), [
        'scaffold-dashboard', 'site-information', 'safety', 'design', 'ess-ai',
    ]);
});

test('Accounts can navigate to every module and its registers', () => {
    for (const item of ACCOUNTS_NAV_ITEMS.flatMap(item => [item, ...(item.children || [])])) {
        assert.equal(resolveAccountsPage(item.key), item.key);
    }
    for (const page of ['safety-swms', 'safety-scaff-tags', 'profile', 'settings', 'landing']) {
        assert.equal(resolveAccountsPage(page), page);
    }
});

test('Accounts direct URLs and history targets cannot open unrelated modules', () => {
    for (const page of ['employees', 'employee-relationships', 'employee-home', 'rostering', 'rostering-tree',
        'scaffold-register', 'truck-schedule', 'transport-dashboard', 'transport-settings', 'truck-tracking',
        'material-ordering-new', 'material-ordering-active', 'ess-news', 'ai-feedback', 'unknown', '', null]) {
        assert.equal(resolveAccountsPage(page), 'scaffold-dashboard', page);
    }
});
