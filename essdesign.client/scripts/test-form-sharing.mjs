import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5188';
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors = [], writes = [], rows = [];
page.on('pageerror', error => errors.push(error.message));
const record = (type,id,payload) => ({form_type:type,id,builder_id:'builder-test',project_id:'project-test',title:payload.formReferenceName || payload.scaffoldNo || payload.subject || '',payload,updated_at:'2026-09-14T00:00:00Z'});
rows.push(record('scaffold-register','scaffold-a',{scaffoldName:'North',status:'active'}));
rows.push(record('scaffold-register','scaffold-b',{scaffoldName:'South',status:'dismantled',dismantledAt:'2026-09-14T00:00:00Z'}));
for (const type of ['pre-starts','day-labour-variations','handover-certificates','scaff-tags']) {
 for (const [index,name,shared,scaffold] of [[1,'North',false,'scaffold-a'],[2,'South',true,'scaffold-b'],[3,'West',true,'scaffold-a']]) {
  rows.push(record(type,type+'-'+index,{subject:name,formReferenceName:name,scaffoldNo:name,scaffoldRegisterId:scaffold,
   date:'14/09/2026',inspectionDateTime:'14/09/2026 10:00 AM',latestInspectionDate:'2026-09-14T00:00:00Z',
   inspectionNumber:String(index),preStartNumber:String(index),variationNumber:String(index),
   completedAt:shared ? '2026-09-14T00:00:00Z' : undefined}));
 }
}
await page.addInitScript(() => {
 localStorage.setItem('access_token','test.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.test');
 localStorage.setItem('user',JSON.stringify({id:'user-test',fullName:'Test User'}));
});
await page.route('**/*', async route => {
 const req=route.request(),url=new URL(req.url());
 if(url.hostname.endsWith('.supabase.co')) {
  if(req.method()!=='GET') writes.push(req.url());
  if(url.pathname.endsWith('/ess_safety_forms')) {
   return route.fulfill({json:rows.filter(row => [...url.searchParams].every(([key,value]) => !value.startsWith('eq.') || String(row[key])===value.slice(3)))});
  }
  if(url.pathname.includes('/rest/v1/')) return route.fulfill({json:[]});
  return route.fulfill({json:{}});
 }
 if(url.origin===baseURL) return route.continue();
 return route.abort();
});
try {
 for(const type of ['pre-starts','day-labour','handovers','scaff-tags']) {
  await page.goto(baseURL+'/tests/fixtures/form-sharing.html?type='+type);
  const checks=page.getByRole('checkbox',{name:'Form Shared',exact:true});
  await checks.first().waitFor();
  assert.equal(await checks.count(),3);
  assert.equal(await page.getByRole('checkbox',{name:'Form Shared',checked:true}).count(),2);
  assert.equal(await page.getByRole('checkbox',{name:'Form Shared',checked:false}).count(),1);
  for(const check of await checks.all()) assert.equal(await check.getAttribute('aria-disabled'),'true');
  assert.equal(await page.getByRole('columnheader',{name:'FORM SHARED',exact:true}).count(),1);
  assert.equal(await page.locator('thead th').last().innerText(),'FORM SHARED');
  const lifecycle=['handovers','scaff-tags'].includes(type);
  assert.equal(await page.getByRole('columnheader',{name:'STATUS',exact:true}).count(),lifecycle?1:0);
  assert.equal(await page.getByText('Completed',{exact:true}).count(),0);
  if(lifecycle) {
   const south=page.locator('tbody tr').filter({hasText:'South'});
   assert.equal(await south.getByText(type==='scaff-tags' ? 'Expired' : 'Dismantled',{exact:true}).count(),1);
   assert.equal(await south.getByRole('checkbox',{name:'Form Shared'}).getAttribute('aria-checked'),'true');
  }
  if(type==='handovers') {
   const west=page.locator('tbody tr').filter({hasText:'West'});
   assert.equal(await west.getByText('Active',{exact:true}).count(),1,'Sharing never completes the handover lifecycle');
   rows[0].payload.status='dismantled'; rows[0].payload.dismantledAt='2026-09-14T01:00:00Z';
   await page.reload(); await page.getByRole('checkbox',{name:'Form Shared'}).first().waitFor();
   assert.equal(await page.getByRole('cell',{name:'Dismantled',exact:true}).count(),3,'A dismantle from iOS updates all linked handovers');
   rows[0].payload.status='active'; delete rows[0].payload.dismantledAt;
   await page.reload(); await checks.first().waitFor();
  }
  await page.getByRole('button',{name:'Form Shared',exact:true}).click();
  await page.getByRole('option',{name:'Not Shared',exact:true}).click();
  assert.equal(await checks.count(),1);
  await page.getByRole('button',{name:'Form Shared',exact:true}).click();
  await page.getByRole('option',{name:'Form Shared',exact:true}).click();
  assert.equal(await checks.count(),2);
  await page.getByRole('button',{name:'Form Shared',exact:true}).click();
  await page.getByRole('option',{name:'All forms',exact:true}).click();
  for(const check of await checks.all()) {const box=await check.boundingBox();assert.ok(box.x+box.width<=1440,'Checkbox visible without clipping');}
  if (process.env.TEST_SCREENSHOTS === "1") await page.screenshot({path:'/tmp/ess-form-shared-'+type+'.png'});
 }
 await page.goto(baseURL+'/tests/fixtures/form-sharing.html?project-data');
 for(const type of ['Scaff-tags','Handovers','Pre-starts','Day Labour / Variations']) {
  await page.getByRole('button',{name:type,exact:true}).click();
  const table=page.getByRole('table');
  await table.getByText('Not shared',{exact:true}).waitFor();
  assert.equal(await table.getByText('Shared',{exact:true}).count(),2);
  assert.equal(await table.getByText('Not shared',{exact:true}).count(),1);
  assert.equal(await page.getByRole('columnheader',{name:'Status',exact:true}).count(),['Scaff-tags','Handovers'].includes(type)?1:0);
  await page.getByRole('button',{name:'Filters',exact:true}).click();
  await page.getByRole('combobox',{name:'Form Shared filter',exact:true}).selectOption('false');
  assert.equal(await page.locator('tbody tr').count(),1);
  await page.getByRole('combobox',{name:'Form Shared filter',exact:true}).selectOption('true');
  assert.equal(await page.locator('tbody tr').count(),2);
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
 }
 assert.deepEqual(writes,[],'Viewing and filtering automatic checkboxes never writes form state');
 assert.deepEqual(errors,[]);
 console.log('Form Shared: all four registers, automatic checked states, filters, linked dismantling, separate lifecycle, Project Data and column layout passed.');
} finally {await browser.close();}
