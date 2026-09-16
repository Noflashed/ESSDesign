import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5182';
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(`${base}/tests/fixtures/scaffold-register-cards.html`);
 await page.locator('.scaffold-register-card').first().waitFor();
 assert.equal(await page.locator('.scaffold-register-card').count(),6);
 assert.equal(await page.locator('.scaffold-register-card.is-active').count(),4);
 assert.equal(await page.locator('.scaffold-card-reminder.is-overdue').count(),1);
 await page.getByRole('button',{name:/Awaiting QR\s*1/,exact:true}).click();
 assert.equal(await page.locator('.scaffold-register-card').count(),1);
 await page.getByRole('button',{name:/All\s*6/,exact:true}).click();
 await page.getByRole('searchbox').fill('North Elevation');
 assert.equal(await page.locator('.scaffold-register-card').count(),1);
 await page.getByRole('searchbox').fill('');
 for(const width of [1440,1024,390]) {
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: six sample cards, lifecycle counts, overdue state, filtering and responsive widths');
} finally {await browser.close();}
