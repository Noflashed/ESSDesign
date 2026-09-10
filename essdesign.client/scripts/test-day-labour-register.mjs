import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5178';
const companyEntity = process.env.TEST_COMPANY_ENTITY || 'ess';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
page.setDefaultTimeout(10000);
const rows = new Map(), objects = new Map(), errors = [];
let failNextSave = false;
let failNextDelete = false;
async function checkFormZoom() {
 const viewport = page.locator('.scaffold-zoom-viewport').filter({visible:true}).first();
 await viewport.scrollIntoViewIfNeeded();
 const fit = viewport.locator('..').getByRole('button',{name:'Fit page',exact:true});
 await fit.click();
 await fit.getByText('100%',{exact:true}).waitFor();
 const initial = await viewport.boundingBox();
 await viewport.hover();
 await page.mouse.wheel(0,60);
 assert.equal(await fit.textContent(),'100%','Ordinary scrolling does not zoom');
 await page.keyboard.down('Control');
 await page.mouse.wheel(0,-100);
 await page.keyboard.up('Control');
 await fit.getByText('135%',{exact:true}).waitFor();
 const after = await viewport.boundingBox();
 assert.ok(Math.abs(initial.width-after.width)<1,'Gesture zooms canvas, not browser viewport');
 await viewport.focus();
 await page.keyboard.press('Control+0');
 await fit.getByText('100%',{exact:true}).waitFor();
 await page.keyboard.press('Control+=');
 await fit.getByText('125%',{exact:true}).waitFor();
 await page.keyboard.press('Control+-');
 await fit.getByText('100%',{exact:true}).waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.keyboard.press('Control+=');
 assert.equal(await fit.textContent(),'125%','Reduced motion applies zoom immediately');
 await page.keyboard.press('Control+0');
 await page.emulateMedia({reducedMotion:'no-preference'});
}
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
 window.companyLabels = [];
 new MutationObserver(() => {
  document.querySelectorAll('[aria-label^="Change company. Currently"]').forEach(element => {
   if (element.getBoundingClientRect().width) window.companyLabels.push(element.getAttribute('aria-label'));
  });
 }).observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:['aria-label']});
 localStorage.setItem('access_token', 'test.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.test');
 localStorage.setItem('user', JSON.stringify({id:'user-test',fullName:'Test Inspector',email:'test@example.com'}));
});
await page.route('**/*', async route => {
 const request = route.request(), url = new URL(request.url());
 const json = body => route.fulfill({json:body});
 if (url.pathname === '/fixture/forms') return json([...rows.values()].filter(row=>row.form_type===url.searchParams.get('type')).map(row=>({...row.payload,pdfPath:row.pdf_path,updatedAt:row.updated_at})));
 if (url.hostname.endsWith('.supabase.co')) {
  if (url.pathname.includes('/rpc/')) return json(url.pathname.includes('scaff_tag')?'ST-00001':'00001');
  if (url.pathname.includes('/rest/v1/ess_scaff_tag_qr_labels')) return json([]);
  if (url.pathname.includes('/rest/v1/ess_safety_forms')) {
   if (request.method()==='DELETE') {
    if (failNextDelete) { failNextDelete=false; return route.fulfill({status:500,json:{message:'Test delete failure'}}); }
    for (const [key,row] of rows) {
     if ([...url.searchParams].every(([field,value])=>!value.startsWith('eq.')||String(row[field])===value.slice(3))) rows.delete(key);
    }
    return json([]);
   }
   if (request.method()==='POST') {
    if (failNextSave) { failNextSave=false; return route.fulfill({status:500,json:{message:'Test save failure'}}); }
    const records = request.postDataJSON(); records.forEach(row=>rows.set(row.form_type+':'+row.id,row)); return json(records);
   }
   return json([...rows.values()].filter(row=>[...url.searchParams].every(([key,val])=>!val.startsWith('eq.')||String(row[key])===val.slice(3))));
  }
  if (url.pathname.includes('/storage/v1/object/sign/')) return json({signedURL:url.pathname.replace('/storage/v1', '').replace('/sign/', '/')});
  if (url.pathname.includes('/storage/v1/object/') && ['POST','PUT'].includes(request.method())) {
   objects.set(url.pathname, request.postDataBuffer()); return json({Key:url.pathname});
  }
  if (objects.has(url.pathname)) return route.fulfill({body:objects.get(url.pathname),contentType:url.pathname.endsWith('.pdf')?'application/pdf':'image/jpeg'});
  if (url.pathname.includes('/storage/v1/object/')) return json({forms:[]});
  throw new Error('Unmocked Supabase request: '+url.pathname);
 }
 if (url.origin === baseURL) return route.continue();
 return route.abort(); // The fixture can never read or write a live service.
});
try {
 await page.goto(baseURL+'/tests/fixtures/day-labour-register.html?entity='+companyEntity);
 const add = page.getByRole('button',{name:'Add Day Labour',exact:true});
 await add.waitFor();
 assert.equal(await page.locator('thead .project-register-header-filter').count(),0,'Day Labour uses toolbar filters only');
 assert.equal(await add.isEnabled(),true,'First project is selected automatically');
 await page.getByRole('button',{name:'Builder',exact:true}).click();
 assert.equal(await page.getByRole('option',{name:'All builders',exact:true}).count(),0);
 await page.getByRole('option',{name:'Test Builder',exact:true}).locator('img').waitFor();
 await page.getByRole('option',{name:'Test Builder',exact:true}).click();
 await page.getByRole('button',{name:'Builder',exact:true}).locator('img').waitFor();
 await page.getByRole('button',{name:'Project',exact:true}).click();
 assert.equal(await page.getByRole('option',{name:'All projects',exact:true}).count(),0);
 assert.equal(await page.getByRole('option',{name:'Test Project',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('option',{name:'Test Project',exact:true}).click();
 await add.click();
 await page.getByTestId('ess-day-labour-stable-scroll-page').waitFor();
 const field = label => page.getByText(label,{exact:true}).locator('..').locator('input').first();
 await field('FORM REFERENCE NAME:').fill('North elevation variation');
 await field('REQUESTED BY:').fill('Site Manager');
 rows.set('handover-test',{id:'handover-test',form_type:'handover-certificates',builder_id:'builder-test',project_id:'project-test',payload:{id:'handover-test',builderId:'builder-test',projectId:'project-test',inspectionNumber:'H-00234',formReferenceName:'North handover'}});
 await page.getByRole('button',{name:'Search handover documents',exact:true}).click();
 await page.getByText('North handover',{exact:true}).click();
 await field('MEN:').fill('3');
 await field('HOURS:').fill('8');
 assert.equal(await field('TOTAL:').inputValue(),'24');
 await page.getByRole('button',{name:'Add labour row',exact:true}).click();
 assert.equal(await page.getByText('MEN:',{exact:true}).count(),2);
 await page.getByRole('button',{name:'Remove labour row 2',exact:true}).click();
 await page.getByRole('button',{name:'Add material',exact:true}).click();
 await page.getByPlaceholder('0',{exact:true}).first().fill('5');
 await page.getByText('Save materials',{exact:true}).click();
 await checkFormZoom();
 await page.getByText('Tap to sign',{exact:true}).first().click();
 const canvas = page.getByText('Sign here',{exact:true}).locator('..');
 const box = await canvas.boundingBox();
 await page.mouse.move(box.x+80,box.y+70); await page.mouse.down();
 await page.mouse.move(box.x+160,box.y+120,{steps:12}); await page.mouse.up();
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 const chooser = page.waitForEvent('filechooser');
 await page.getByLabel('Add photo 1',{exact:true}).click();
 await (await chooser).setFiles('public/scaffold-forms/logo.png');
 await page.getByLabel('Replace photo 1',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/ess-day-labour-web.png'});
 failNextSave = true;
 await page.getByRole('button',{name:'Save day labour form'}).click();
 await page.getByText('Save failed',{exact:true}).waitFor();
 await page.locator('.scaffold-browser-alert').getByRole('button',{name:'OK',exact:true}).click();
 await page.getByRole('button',{name:'Save day labour form'}).click();
 await page.getByRole('button',{name:'Share day labour form'}).waitFor();
 const saved = [...rows.values()].find(row=>row.form_type==='day-labour-variations')?.payload;
 assert.ok(saved);
 assert.equal(saved.companyEntityId,companyEntity);
 assert.equal(saved.photoSlots.length,1);
 assert.equal(saved.labourRows[0].total,'24');
 assert.ok(saved.materialList.includes('5'));
 assert.equal(saved.handoverDocumentId,'handover-test');
 assert.equal(saved.formReferenceName,'North elevation variation');
 assert.ok(saved.essRepresentativeSignatureStrokes[0].length>2);
 assert.ok([...objects.keys()].some(path=>path.endsWith('.pdf')));
 await page.getByLabel('Go back',{exact:true}).click();
 await page.getByRole('button',{name:'North elevation variation',exact:true}).click();
 await page.getByRole('button',{name:'Share day labour form'}).waitFor();
 assert.equal(await field('REQUESTED BY:').inputValue(),'Site Manager');
 await page.getByLabel('Go back',{exact:true}).click();
 const savedRow = page.getByRole('button',{name:'North elevation variation',exact:true}).locator('xpath=ancestor::tr');
 await savedRow.click({button:'right'});
 await page.getByRole('menuitem',{name:'Delete Day Labour form',exact:true}).click();
 await page.getByRole('dialog',{name:'Delete Day Labour form?',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
 assert.ok([...rows.values()].some(row=>row.form_type==='day-labour-variations'),'Cancel preserves form');
 await savedRow.focus();
 await page.keyboard.press('Shift+F10');
 await page.getByRole('menuitem',{name:'Delete Day Labour form',exact:true}).click();
 failNextDelete=true;
 await page.getByRole('dialog').getByRole('button',{name:'Delete form',exact:true}).click();
 await page.getByRole('dialog').getByRole('alert').waitFor();
 assert.ok([...rows.values()].some(row=>row.form_type==='day-labour-variations'),'Failed delete preserves form');
 await page.getByRole('dialog').getByRole('button',{name:'Delete form',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.ok(![...rows.values()].some(row=>row.form_type==='day-labour-variations'),'Successful delete removes form');
 assert.ok(rows.has('handover-test'),'Linked handover is retained');
 await page.getByRole('button',{name:'Add Day Labour',exact:true}).waitFor();
 await page.getByRole('button',{name:'Project',exact:true}).click();
 await page.getByRole('option',{name:'Empty Project',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'North elevation variation',exact:true}).count(),0);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/ess-day-labour-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: Day Labour creation, branding, signature, PDF save, reopen and project filtering.');
} catch(error) { console.log(await page.locator('body').innerText()); throw error; }
finally { await browser.close(); }
