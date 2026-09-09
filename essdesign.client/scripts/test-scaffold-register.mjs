import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5178';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
page.setDefaultTimeout(10000);
const rows = new Map(), objects = new Map(), errors = [];
let failNextSave = false;
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
 localStorage.setItem('access_token', 'test.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.test');
 localStorage.setItem('user', JSON.stringify({id:'user-test',fullName:'Test Inspector',email:'test@example.com'}));
});
await page.route('**/*', async route => {
 const request = route.request(), url = new URL(request.url());
 const json = body => route.fulfill({json:body});
 if (url.pathname === '/fixture/forms') return json([...rows.values()].filter(row=>row.form_type===url.searchParams.get('type')).map(row=>({...row.payload,pdfPath:row.pdf_path,updatedAt:row.updated_at})));
 if (url.hostname.endsWith('.supabase.co')) {
  if (url.pathname.includes('/rpc/')) return json(url.pathname.includes('scaff_tag')?'ST-00001':'H-00001');
  if (url.pathname.includes('/rest/v1/ess_scaff_tag_qr_labels')) return json([]);
  if (url.pathname.includes('/rest/v1/ess_safety_forms')) {
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
 await page.goto(baseURL+'/tests/fixtures/scaffold-register.html');
 await page.getByRole('button',{name:'Add scaffold',exact:true}).click();
 await page.locator('dialog').getByRole('button',{name:'Add scaffold',exact:true}).click();
 await page.getByText('Enter a scaffold name to continue.').waitFor();
 await page.getByLabel('Scaffold name',{exact:true}).fill(' North Elevation ');
 failNextSave=true;
 await page.locator('dialog').getByRole('button',{name:'Add scaffold',exact:true}).click();
 await page.locator('dialog [role=alert]').waitFor();
 assert.equal(rows.size,0);
 await page.locator('dialog').getByRole('button',{name:'Add scaffold',exact:true}).click();
 await page.getByRole('button',{name:'Link design for North Elevation'}).waitFor();
 assert.equal(rows.size,1);
 const register = [...rows.values()][0].payload;
 assert.equal(register.scaffoldName,'North Elevation');
 await page.getByRole('button',{name:'Link design for North Elevation'}).click();
 await page.getByText('D-100 REV A',{exact:true}).click();
 await page.getByRole('button',{name:'D-100 REV A'}).waitFor();
 await page.getByRole('button',{name:'Create handover for North Elevation'}).click();
 await page.locator('[data-testid="ess-handover-stable-scroll-page-1"]').waitFor();
 await page.getByLabel('Intended use',{exact:true}).fill('Facade access');
 await page.getByRole('checkbox',{name:/^YES:/}).first().click();
 await page.getByLabel('ESS REPRESENTATIVE signature',{exact:true}).click();
 const signatureCanvas = page.getByText('Sign here',{exact:true}).locator('..');
 const box = await signatureCanvas.boundingBox();
 await page.mouse.move(box.x+30,box.y+100); await page.mouse.down();
 await page.mouse.move(box.x+140,box.y+60,{steps:12});
 await page.mouse.move(box.x+260,box.y+160,{steps:12}); await page.mouse.up();
 await page.getByRole('button',{name:'Use Signature',exact:true}).click();
 await page.getByLabel('Add photo 1',{exact:true}).click();
 const chooser = page.waitForEvent('filechooser');
 await page.locator('.scaffold-browser-alert').getByRole('button',{name:'Choose Existing'}).click();
 await (await chooser).setFiles('public/scaffold-forms/logo.png');
 await page.getByLabel('Replace photo 1',{exact:true}).waitFor();
 await page.getByLabel('Intended use',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/ess-handover-web.png'});
 await page.getByRole('button',{name:'Save handover certificate'}).click();
 await page.waitForFunction(()=>document.querySelector('.scaffold-browser-alert') || document.querySelector('[aria-label="Share handover certificate"]'));
 if (await page.locator('.scaffold-browser-alert').count()) console.log('Handover alert:',await page.locator('.scaffold-browser-alert').innerText());
 await page.getByRole('button',{name:'Share handover certificate'}).waitFor();
 const handover = [...rows.values()].find(row=>row.form_type==='handover-certificates')?.payload;
 assert.ok(handover, 'Handover persisted');
 assert.equal(handover.photoSlots.length, 1);
 assert.ok(handover.essRepresentativeSignatureStrokes[0].length > 2, 'Signature captured');
 assert.equal(handover.scaffoldRegisterId, register.id);
 assert.equal(handover.formReferenceName, 'North Elevation');
 assert.equal(handover.drawingDocumentId, 'design-1');
 await page.getByLabel('Go back',{exact:true}).click();
 await page.getByRole('button',{name:'Create Scaff-Tag for North Elevation'}).click();
 await page.locator('[data-testid="ess-scaff-tag-stable-scroll-sheet"]').first().waitFor();
 await page.screenshot({path:'/tmp/ess-scaff-tag-web.png'});
 
 await page.getByRole('button',{name:'Save scaffold tag',exact:true}).click();
 await page.locator('.scaffold-form-editor').waitFor({state:'detached'});
 const tag = [...rows.values()].find(row=>row.form_type==='scaff-tags')?.payload;
 assert.ok(tag, 'Scaff-Tag persisted');
 assert.equal(tag.scaffoldRegisterId, register.id);
 assert.equal(tag.handoverFormId, handover.id);
 assert.equal([...rows.values()].find(row=>row.form_type==='handover-certificates').payload.scaffTagFormId,tag.id);
 assert.ok([...objects.keys()].filter(path=>path.endsWith('.pdf')).length >= 2, 'Both PDFs uploaded');
 await page.reload();
 await page.getByRole('button',{name:'H-00001',exact:true}).click();
 await page.getByLabel('Intended use',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Intended use',{exact:true}).inputValue(),'Facade access');
 await page.getByRole('button',{name:'Zoom in'}).first().click();
 await page.getByRole('button',{name:'Fit page'}).first().getByText('150%',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Fit page'}).first().click();
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Intended use',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/ess-handover-web-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: name validation, save retry, design linking, form creation, signatures, photos, PDF uploads, cross-links, reload, zoom and mobile viewport.');
} catch(error) {
 await page.screenshot({path:'/tmp/ess-scaffold-test-failure.png'});
 console.error('Browser errors:',errors);
 console.error((await page.locator('body').innerText()).slice(-4000));
 throw error;
} finally { await browser.close(); }
