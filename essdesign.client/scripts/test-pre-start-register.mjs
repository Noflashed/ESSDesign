import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5186';
const company = process.env.TEST_COMPANY_ENTITY || 'ess';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(10000);
const rows = new Map(), deleted = [], objects = new Map(), errors = [];
let allocations = 0, failSave = false, failDelete = false;
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
 Object.defineProperty(navigator, 'canShare', {value:()=>true, configurable:true});
 Object.defineProperty(navigator, 'share', {value:async()=>{throw new DOMException('Cancelled','AbortError');}, configurable:true});
 localStorage.setItem('access_token', 'test.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.test');
 localStorage.setItem('user', JSON.stringify({id:'user-test',fullName:'Test Inspector',email:'test@example.com'}));
});
await page.route('**/*', async route => {
 const request = route.request(), url = new URL(request.url());
 const json = body => route.fulfill({json:body});
 if (url.pathname.endsWith('/notifications/project-data-form-shared')) return route.fulfill({status:500,json:{message:'Test share failure'}});
 if (url.pathname.endsWith('/users/notification-recipients')) return json([]);
 const matches = row => [...url.searchParams].every(([key,value])=>!value.startsWith('eq.') || String(row[key]) === value.slice(3));
 if (url.hostname.endsWith('.supabase.co')) {
  if (url.pathname.endsWith('/rpc/preview_pre_start_number')) return json(String(allocations+1).padStart(4,'0'));
  if (url.pathname.endsWith('/rpc/allocate_pre_start_number')) return json(String(++allocations).padStart(4,'0'));
  if (url.pathname.includes('/rest/v1/ess_deleted_safety_forms')) return json(deleted.filter(matches));
  if (url.pathname.includes('/rest/v1/ess_safety_forms')) {
   if (request.method()==='PATCH') {
    const updated=[]; for (const [id,row] of rows) if (matches(row)) {const next={...row,...request.postDataJSON()}; rows.set(id,next); updated.push(next);} return json(updated);
   }
   if (request.method()==='POST') {
    if (failSave) { failSave=false; return route.fulfill({status:500,json:{message:'Test save failure'}}); }
    const records=request.postDataJSON(); records.forEach(row=>rows.set(row.id,row)); return json(records);
   }
   if (request.method()==='DELETE') {
    if (failDelete) { failDelete=false; return route.fulfill({status:500,json:{message:'Test delete failure'}}); }
    for (const [id,row] of rows) if (matches(row)) { deleted.push({...row,deleted_at:new Date().toISOString()}); rows.delete(id); }
    return json([]);
   }
   return json([...rows.values()].filter(matches));
  }
  if (url.pathname.includes('/rest/v1/ess_scaff_tag_qr_labels')) return json([]);
  if (url.pathname.includes('/storage/v1/object/sign/')) return json({signedURL:url.pathname.replace('/storage/v1','').replace('/sign/','/')});
  if (url.pathname.includes('/storage/v1/object/')) {
   if (request.method()==='POST') { objects.set(url.pathname,request.postDataBuffer()); return json({Key:url.pathname}); }
   if (request.method()==='DELETE') { objects.delete(url.pathname); return json({}); }
   if (objects.has(url.pathname)) return route.fulfill({body:objects.get(url.pathname),contentType:url.pathname.endsWith('.pdf')?'application/pdf':'image/jpeg'});
   return json({forms:[]});
  }
  throw new Error('Unmocked Supabase request: '+url.pathname);
 }
 if (url.origin===baseURL) return route.continue();
 return route.abort();
});
const ok = () => page.locator('.scaffold-browser-alert').getByRole('button',{name:'OK',exact:true}).click();
try {
 await page.goto(baseURL+'/tests/fixtures/pre-start-register.html?entity='+company);
 await page.getByRole('button',{name:'Add Pre-Start',exact:true}).click();
 await page.getByTestId('ess-pre-start-stable-scroll-page-1').waitFor();
 assert.match(await page.getByLabel('Subject',{exact:true}).inputValue(), /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{2}\/\d{2}\/\d{4} Daily Pre-Start$/);
 assert.equal(allocations,0,'Opening previews numbering without consuming it');
 await page.getByLabel('Area foreman',{exact:true}).fill('Site Foreman');
 for (let i=1;i<=6;i++) await page.getByLabel(`Identified risk ${i}`,{exact:true}).fill(`Risk ${i}`);
 await page.getByRole('button',{name:'Mark every checklist item as Yes'}).click();
 await page.getByLabel('People in work group',{exact:true}).fill('12');
 const firstPage=page.getByTestId('ess-pre-start-stable-scroll-page-1');
 await firstPage.getByRole('button',{name:'Zoom in',exact:true}).click();
 await page.getByLabel('Area foreman',{exact:true}).fill('Updated Foreman');
 await firstPage.getByRole('button',{name:'Fit page',exact:true}).click();
 await page.getByLabel('Attendee 1 name',{exact:true}).fill('Worker One');
 await page.getByLabel('Initial for attendee 1',{exact:true}).click();
 const canvas=page.getByText('Sign here',{exact:true}).locator('..');
 const bounds=await canvas.boundingBox();
 await page.mouse.move(bounds.x+60,bounds.y+60); await page.mouse.down();
 await page.mouse.move(bounds.x+160,bounds.y+105,{steps:12}); await page.mouse.up();
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 const chooser=page.waitForEvent('filechooser');
 await page.getByLabel('Site photo 1',{exact:true}).click();
 assert.equal(await page.locator('dialog.scaffold-browser-alert').count(),0,'Photo slots open the file picker directly');
 await (await chooser).setFiles('public/scaffold-forms/logo.png');
 await page.getByLabel('Site photo 1',{exact:true}).locator('img').waitFor();
 failSave=true;
 await page.getByRole('button',{name:'Save pre-start form'}).click();
 await page.getByText('Save failed',{exact:true}).waitFor(); await ok();
 assert.equal(rows.size,0,'Failed save creates no record');
 await page.getByRole('button',{name:'Save pre-start form'}).click();
 await page.getByText('Pre-start saved',{exact:true}).waitFor(); await ok();
 const saved=[...rows.values()][0];
 assert.equal(saved.form_type,'pre-starts');
 assert.equal(saved.payload.clientProjectName,'Test Builder - Test Project');
 assert.equal(saved.project_label,'Test Builder - Test Project');
 assert.equal(saved.payload.companyEntityId,company);
 assert.equal(saved.payload.areaForeman,'Updated Foreman');
 assert.equal(saved.payload.risks,'Risk 1\nRisk 2\nRisk 3\nRisk 4\nRisk 5\nRisk 6');
 assert.equal(Object.values(saved.payload.checklist).filter(v=>v===true).length,8);
 assert.equal(saved.payload.photoSlots.length,1);
 assert.ok(saved.payload.attendees[0].signatureStrokes[0].length>2);
 const pdf=objects.get('/storage/v1/object/ess-safety-projects/'+saved.pdf_path) || [...objects.entries()].find(([path])=>path.endsWith(saved.pdf_path))?.[1];
 assert.ok(pdf?.toString().startsWith('%PDF-1.4'),'A real PDF was generated and uploaded');
 const subject=saved.payload.subject, number=saved.payload.preStartNumber;
 await page.getByRole('button',{name:'Share pre-start form'}).click();
 await page.getByText('Share PDF',{exact:true}).waitFor();
 await page.getByText(company === 'maloo' ? 'Safety@malooaccess.com.au' : 'Safety@erectsafe.com.au',{exact:true}).waitFor();
 await page.getByLabel('Close share',{exact:true}).click();
 assert.equal(rows.get(saved.id).payload.completedAt,undefined,'Opening/closing Share leaves the form unshared');
 await page.getByRole('button',{name:'Share pre-start form'}).click();
 await page.getByRole('button',{name:'Email PDF attachment to 1 recipients',exact:true}).click();
 await page.waitForFunction(() => !document.querySelector('[aria-label="Close share"]')?.disabled);
 await page.getByLabel('Close share',{exact:true}).click();
 assert.ok(rows.get(saved.id).payload.completedAt,'External action records Form Shared even when the external share is cancelled');
 const completedAt=rows.get(saved.id).payload.completedAt;
 await page.getByRole('button',{name:'Share pre-start form'}).click();
 await page.getByRole('button',{name:'Share PDF with 1 recipients',exact:true}).click();
 await page.getByText('Share failed',{exact:true}).waitFor(); await ok();
 assert.equal(rows.get(saved.id).payload.completedAt,completedAt,'A failed send does not undo sharing history');
 await page.getByLabel('Close share',{exact:true}).click();
 await page.getByLabel('Go back',{exact:true}).click();
 await page.getByRole('checkbox',{name:'Form Shared',checked:true}).waitFor();
 await page.getByRole('button',{name:'Form Shared',exact:true}).click();
 await page.getByRole('option',{name:'Not Shared',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:subject,exact:true}).count(),0);
 await page.getByRole('button',{name:'Form Shared',exact:true}).click();
 await page.getByRole('option',{name:'Form Shared',exact:true}).click();
 await page.getByRole('button',{name:subject,exact:true}).waitFor();
 await page.getByRole('button',{name:'Form Shared',exact:true}).click();
 await page.getByRole('option',{name:'All forms',exact:true}).click();
 await page.getByRole('button',{name:subject,exact:true}).click();
 assert.equal(await page.getByLabel('Area foreman',{exact:true}).inputValue(),'Updated Foreman');
 await page.getByLabel('Identified risk 3',{exact:true}).fill('Updated risk');
 const priorAllocations=allocations;
 await page.getByRole('button',{name:'Save pre-start form'}).click();
 await page.getByText('Pre-start saved',{exact:true}).waitFor(); await ok();
 assert.equal(allocations,priorAllocations,'Editing preserves the saved number');
 assert.equal(rows.get(saved.id).payload.preStartNumber,number);
 assert.equal(rows.get(saved.id).payload.completedAt,completedAt,'Saving preserves Form Shared');
 await page.getByTestId('ess-pre-start-stable-scroll-page-1').scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/ess-pre-start-web-form.png'});
 await page.getByLabel('Go back',{exact:true}).click();
 await page.getByPlaceholder('Search pre-starts...').fill('absent');
 assert.equal(await page.getByRole('button',{name:subject,exact:true}).count(),0);
 await page.getByPlaceholder('Search pre-starts...').fill('');
 await page.getByRole('button',{name:'Project',exact:true}).click();
 await page.getByRole('option',{name:'Empty Project',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:'Add Pre-Start',exact:true}).waitFor();
 assert.match(await page.getByRole('button',{name:'Project',exact:true}).innerText(),/Empty Project/);
 await page.getByRole('button',{name:'Project',exact:true}).click();
 await page.getByRole('option',{name:'Test Project',exact:true}).click();
 assert.equal(await page.getByRole('cell',{name:saved.payload.date,exact:true}).count(),1,'Register preserves the four-digit year');
 const statusBox = await page.getByRole('checkbox',{name:'Form Shared',checked:true}).locator('..').boundingBox();
 assert.ok(statusBox.width > 60 && statusBox.x + statusBox.width <= 1440, 'Form Shared checkbox has a visible register column');
 await page.screenshot({path:'/tmp/ess-pre-start-web-register.png'});
 const row=page.getByRole('button',{name:subject,exact:true}).locator('xpath=ancestor::tr');
 await row.click({button:'right'});
 await page.getByRole('menuitem',{name:'Delete Pre-Start form',exact:true}).click();
 await page.getByRole('dialog',{name:'Delete Pre-Start form?',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(rows.size,1);
 await row.click({button:'right'});
 await page.getByRole('menuitem',{name:'Delete Pre-Start form',exact:true}).click();
 failDelete=true;
 await page.getByRole('dialog').getByRole('button',{name:'Delete form',exact:true}).click();
 await page.getByRole('dialog').getByRole('alert').waitFor();
 assert.equal(rows.size,1);
 await page.getByRole('dialog').getByRole('button',{name:'Delete form',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(rows.size,0);
 await page.getByLabel('Show deleted',{exact:true}).check();
 await page.getByText(subject,{exact:true}).waitFor();
 // Reintroduce the fixture's saved row to verify the Project Data document surface.
 rows.set(saved.id,{...saved,payload:{...saved.payload,completedAt}});
 await page.goto(baseURL+'/tests/fixtures/pre-start-register.html?project-data');
 await page.getByRole('button',{name:'Pre-starts',exact:true}).click();
 const table=page.getByRole('table');
 await table.getByText(subject+'.pdf',{exact:true}).waitFor();
 await table.getByText('Shared',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Filters',exact:true}).click();
 await page.getByRole('combobox',{name:'Form Shared filter',exact:true}).selectOption('false');
 assert.equal(await table.getByText(subject+'.pdf',{exact:true}).count(),0);
 await page.getByRole('combobox',{name:'Form Shared filter',exact:true}).selectOption('true');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await table.getByText(subject+'.pdf',{exact:true}).waitFor();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Open actions for '+subject+'.pdf',exact:true}).click();
 await page.getByRole('menuitem',{name:'Download PDF',exact:true}).click();
 const download=await downloadPromise;
 assert.equal(await download.failure(),null,'Project Data downloads its saved PDF');
 const openedPdf=page.waitForEvent('popup');
 await table.getByText(subject+'.pdf',{exact:true}).click();
 const pdfTab=await openedPdf;
 await pdfTab.waitForURL(url=>url.href!=='about:blank');
 await pdfTab.close();
 assert.equal(await page.getByRole('complementary',{name:'Document preview'}).count(),0);
 await page.screenshot({path:'/tmp/ess-pre-start-web-project-data.png'});
 assert.deepEqual(errors,[]);
 console.log('Pre-start register: create, edit, risks, checklist, signature, photo, PDF download/share controls, failed-save retry, numbering, filters, remembered project, delete retry, archive and Project Data passed.');
} catch(error) {
 console.error(errors);
 await page.screenshot({path:'/tmp/ess-pre-start-web-failure.png'});
 throw error;
} finally { await browser.close(); }
