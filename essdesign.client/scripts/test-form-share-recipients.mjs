import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const baseURL=process.env.TEST_BASE_URL || 'http://127.0.0.1:5186';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage();
await page.route('**/*',route=>new URL(route.request().url()).origin===baseURL ? route.continue() : route.abort());
try {
 for(const [entity,label,email] of [['ess','ESS','Safety@erectsafe.com.au'],['maloo','Maloo','Safety@malooaccess.com.au']]) {
  await page.goto(`${baseURL}/tests/fixtures/form-share-recipients.html?entity=${entity}`);
  await page.getByText(email,{exact:true}).waitFor();
  assert.equal(await page.getByText('Duplicate Safety Account',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Share PDF with 1 recipients',exact:true}).click();
  await page.waitForFunction(()=>window.shareSelections.length===1);
  assert.deepEqual(await page.evaluate(()=>window.shareSelections[0].externalEmails),[email]);
  await page.getByRole('button',{name:'Email PDF attachment to 1 recipients',exact:true}).click();
  await page.waitForFunction(()=>window.shareSelections.length===2);
  assert.deepEqual(await page.evaluate(()=>window.shareSelections[1].externalEmails),[email]);
  await page.getByPlaceholder('name@company.com').fill(email.toLowerCase());
  await page.getByRole('button',{name:'Add external email',exact:true}).click();
  await page.getByText('That email is already included.',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:`Remove ${label} Safety`,exact:true}).click();
  await page.getByRole('button',{name:'Add external email',exact:true}).click();
  await page.getByRole('checkbox',{name:`Remove ${label} Safety`,exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Share PDF with 1 recipients',exact:true}).count(),1);
 }
 console.log('PASS: ESS/Maloo share and attachment recipients, case-insensitive deduplication and re-selection. No emails sent.');
} finally {await browser.close();}
