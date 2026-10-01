import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canAccessEssMarkup, resolveMarkupPage, designNavigationFor } from '../src/utils/markupAccess.js';
for (const role of ['viewer','accounts','scaffold_designer','leading_hand','general_scaffolder','transport_management','truck_ess01','truck_ess02','truck_ess03','unknown',undefined]) {
    const user = role ? { role } : null;
    assert.equal(canAccessEssMarkup(user),false);
    assert.equal(resolveMarkupPage('ess-markup',user),'landing');
    assert.ok(!designNavigationFor(user).children.some(i=>i.key==='ess-markup'));
    assert.equal(resolveMarkupPage('drawing-register',user),'drawing-register');
}
assert.equal(canAccessEssMarkup({role:'admin'}),true);
assert.equal(resolveMarkupPage('ess-markup',{role:'admin'}),'ess-markup');
assert.ok(designNavigationFor({role:'admin'}).children.some(i=>i.key==='ess-markup'));
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
assert.match(app,/const currentPage = resolveMarkupPage\(/);
assert.match(app,/currentPage === 'ess-markup' && canAccessEssMarkup\(user\)/);
assert.equal((app.match(/designNavigationFor\(user\)/g)||[]).length,2);
console.log('Admin-only Markup navigation and page access passed for all roles.');
