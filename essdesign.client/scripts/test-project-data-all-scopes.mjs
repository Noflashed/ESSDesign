import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const baseURL=process.env.TEST_BASE_URL || 'http://127.0.0.1:5186';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(url.origin!==baseURL) return route.abort();
 if(url.pathname.startsWith('/fixture/')) return route.fulfill({body:'%PDF-1.4\n%%EOF',contentType:'application/pdf'});
 return route.continue();
});
const rows=page.locator('.project-data-table-row');
const count=async expected=>{await page.waitForFunction(n=>document.querySelectorAll('.project-data-table-row').length===n,expected);};
try {
 await page.goto(`${baseURL}/tests/fixtures/register-dropdowns.html?project-data`);
 await count(1);
 await page.locator('.project-data-project-trigger').click();
 await page.getByRole('option',{name:'All Projects',exact:true}).click();
 await count(2);
 await page.locator('.project-data-builder-trigger').click();
 await page.getByRole('option',{name:'All Builders',exact:true}).click();
 await count(3);
 for(const type of ['Handover certificates','Day Labour/Variations','Pre-Starts','SWMS','Design document']) {
  await page.locator('.project-data-kind-trigger').click();
  await page.getByRole('option',{name:type,exact:true}).click();
  await count(3);
 }
 await page.locator('.project-data-kind-trigger').click();
 await page.getByRole('option',{name:'Pre-Starts',exact:true}).click();
 await count(3);
 await page.getByText('West Site form.pdf',{exact:true}).click();
 const preview=page.getByRole('complementary',{name:'Document preview'});
 await preview.waitFor();
 await preview.getByText('Beta Builder',{exact:true}).waitFor();
 await preview.getByText('West Site',{exact:true}).waitFor();
 assert.deepEqual((await page.evaluate(()=>window.__scopeActions)).at(-1),{action:'get',builderId:'beta',projectId:'west',id:'shared-form-id'});
 await page.getByRole('button',{name:'Close preview',exact:true}).click();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download West Site form.pdf',exact:true}).click();
 assert.equal(await (await download).failure(),null);
 await page.getByRole('button',{name:'Open actions for West Site form.pdf',exact:true}).click();
 await page.getByRole('menuitem',{name:'Delete PDF',exact:true}).click();
 assert.match(await page.locator('.project-data-delete-copy').innerText(),/from West Site/);
 await page.locator('.project-data-delete-modal').getByRole('button',{name:'Delete PDF',exact:true}).click();
 await count(2);
 assert.deepEqual((await page.evaluate(()=>window.__scopeActions)).at(-1),{action:'delete',builderId:'beta',projectId:'west',id:'shared-form-id'});
 assert.match(await rows.allTextContents().then(v=>v.join(' ')),/North Site/);
 assert.match(await rows.allTextContents().then(v=>v.join(' ')),/South Site/);
 await page.locator('.project-data-project-trigger').click();
 await page.getByRole('option',{name:'South Site — Alpha Builder',exact:true}).click();
 await count(1);
 await page.screenshot({path:'/tmp/ess-project-data-all-scopes.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: Project Data aggregates all six document types and routes preview, PDF download and deletion to the correct source project, including repeated form IDs.');
} catch(error) {await page.screenshot({path:'/tmp/ess-all-scopes-failure.png'});throw error;}
finally {await browser.close();}
