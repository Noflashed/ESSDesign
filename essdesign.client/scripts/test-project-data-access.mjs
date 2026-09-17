import assert from 'node:assert/strict';
import { resolveProjectDataPage, projectDataNavForRole } from '../src/utils/projectDataAccess.js';

const pages = ['safety-handover-register', 'safety-day-labour-register', 'safety-pre-start-register', 'safety-scaff-tag-register', 'safety-qr-code-register', 'safety-scaff-tags', 'safety-swms'];
const nav = [{ key: 'safety', children: pages.map(key => ({ key })) }, { key: 'design', children: [{ key: 'drawing-register' }] }];
for (const role of ['viewer', 'accounts', 'scaffold_designer', 'leading_hand', 'general_scaffolder', 'transport_management', 'truck_ess01', undefined, 'unknown']) {
    for (const page of pages) assert.equal(resolveProjectDataPage(page, role), 'safety');
    assert.equal(resolveProjectDataPage('safety', role), 'safety');
    assert.equal(resolveProjectDataPage('design', role), 'design');
    const filtered = projectDataNavForRole(nav, role);
    assert.deepEqual(filtered[0].children, []);
    assert.deepEqual(filtered[1], nav[1]);
}
for (const page of pages) assert.equal(resolveProjectDataPage(page, 'admin'), page);
assert.deepEqual(projectDataNavForRole(nav, 'admin'), nav);
assert.equal(nav[0].children.length, pages.length);
console.log('PASS: Admin-only Project data register navigation and route resolution');
