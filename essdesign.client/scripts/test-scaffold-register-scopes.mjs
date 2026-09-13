import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5181';
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage();
const errors = [], deletes = [];
page.on('pageerror', error => errors.push(error.message));
const records = [
 ['builder-test','project-test','First scaffold'],
 ['builder-test','project-second','Second scaffold'],
 ['builder-other','project-test','Other scaffold'],
].map(([builderId,projectId,scaffoldName]) => ({id:projectId,builderId,projectId,scaffoldName,status:'active',updatedAt:'2026-09-14'}));
await page.addInitScript(() => {
 localStorage.setItem('access_token','test');
 localStorage.setItem('user',JSON.stringify({id:'test',fullName:'Test User'}));
});
await page.route('**/*', async route => {
 const url = new URL(route.request().url());
 if (url.pathname === '/fixture/forms') return route.fulfill({json:url.searchParams.get('type') === 'scaffold-register' ? records : []});
 if (url.hostname.endsWith('.supabase.co')) {
  if (url.pathname.includes('/rest/v1/ess_safety_forms')) {
   const builderId = url.searchParams.get('builder_id')?.slice(3), projectId = url.searchParams.get('project_id')?.slice(3);
   if (route.request().method() === 'DELETE') {
    deletes.push({builderId,projectId});
    const index = records.findIndex(row => row.builderId === builderId && row.projectId === projectId);
    if (index >= 0) records.splice(index,1);
    return route.fulfill({json:[]});
   }
   return route.fulfill({json:records.filter(row => row.builderId === builderId && row.projectId === projectId)
    .map(row => ({form_type:'scaffold-register',id:row.id,builder_id:row.builderId,project_id:row.projectId,payload:row}))});
  }
  if (url.pathname.includes('/storage/')) return route.fulfill({json:{forms:[]}});
 }
 if (url.origin === baseURL) return route.continue();
 return route.abort();
});
const choose = async (label, name) => {
 await page.getByRole('button',{name:label,exact:true}).click();
 await page.getByRole('option',{name,exact:true}).click();
};
const visible = async names => {
 await page.getByRole('button',{name:'Add scaffold',exact:true}).waitFor();
 await page.waitForFunction(expected => {
  const names = [...document.querySelectorAll('tbody .scaffold-register-cell-value')].map(el => el.textContent).sort();
  return JSON.stringify(names) === JSON.stringify([...expected].sort());
 }, names);
};
try {
 await page.goto(baseURL+'/tests/fixtures/scaffold-register.html?scope=1');
 await visible(['First scaffold']);
 await choose('Project','All Sites');
 await visible(['First scaffold','Second scaffold']);
 assert.equal(await page.getByRole('button',{name:'Add scaffold',exact:true}).isDisabled(),true);
 await page.reload();
 await visible(['First scaffold','Second scaffold']);
 await page.getByRole('button',{name:'Refresh Scaffold Register',exact:true}).click();
 await page.getByRole('button',{name:'Refresh Scaffold Register',exact:true}).waitFor();
 await visible(['First scaffold','Second scaffold']);
 await choose('Builder','All Builders');
 await visible(['First scaffold','Second scaffold','Other scaffold']);
 assert.equal(await page.locator('.scaffold-register-site-context').count(),3);
 await choose('Project','Test Project — Other Builder');
 await visible(['Other scaffold']);
 assert.equal(await page.getByRole('button',{name:'Add scaffold',exact:true}).isEnabled(),true);
 await choose('Project','All Sites');
 await visible(['First scaffold','Second scaffold','Other scaffold']);
 await page.reload();
 await visible(['First scaffold','Second scaffold','Other scaffold']);
 await page.locator('tbody tr').filter({hasText:'Other scaffold'}).click({button:'right'});
 await page.getByRole('menuitem',{name:'Delete scaffold',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Delete scaffold',exact:true}).click();
 await visible(['First scaffold','Second scaffold']);
 assert.deepEqual(deletes,[{builderId:'builder-other',projectId:'project-test'}],'Delete targets the row, not the broad scope or a same-ID site');
 await choose('Builder','Test Builder');
 await visible(['First scaffold','Second scaffold']);
 await choose('Project','Empty Site');
 await visible([]);
 await choose('Project','Test Project');
 await visible(['First scaffold']);
 assert.deepEqual(errors,[]);
 console.log('PASS: all builders/sites, individual and empty sites, reload, refresh, duplicate site IDs and scoped deletion.');
} finally {await browser.close();}
