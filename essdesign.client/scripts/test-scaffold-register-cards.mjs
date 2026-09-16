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
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('heading',{name:'Sample Scaffold',exact:true}).click();
 const dialog = page.getByRole('dialog',{name:'Sample Scaffold details'});
 await dialog.waitFor();
 const box = await dialog.boundingBox();
 assert.ok(box.width > 600);
 assert.ok(Math.abs(box.x + box.width / 2 - 720) < 2, 'Dialog centered horizontally');
 assert.ok(Math.abs(box.y + box.height / 2 - 500) < 2, 'Dialog centered vertically');
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'hidden'});
 const card = page.locator('.scaffold-register-card').first();
 await card.focus();
 await page.keyboard.press('Enter');
 await dialog.waitFor();
 await dialog.getByRole('button',{name:'Close scaffold details'}).click();
 await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Actions for Sample Scaffold',exact:true}).click();
 assert.equal(await page.locator('.scaffold-card-dialog').count(),0);
 await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);
 console.log('PASS: six sample cards, lifecycle counts, overdue state, filtering and responsive widths');
} finally {await browser.close();}
