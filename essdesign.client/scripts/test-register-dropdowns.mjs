import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror', error=>errors.push(error.message));
await page.addInitScript(()=> {
 localStorage.setItem('user', JSON.stringify({id:'dropdown-test',fullName:'Test User'}));
});
await page.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
try {
 for (const type of ['handovers','scaff-tags','day-labour','pre-starts']) {
  await page.goto(`${baseURL}/tests/fixtures/register-dropdowns.html?type=${type}`);
  const builder=page.getByRole('button',{name:'Builder',exact:true});
  const project=page.getByRole('button',{name:'Project',exact:true});
  await builder.waitFor();
  assert.match(await builder.innerText(),/Alpha Builder/,'Each register starts with its own default');
  assert.match(await project.innerText(),/North Site/);
  assert.equal(await page.locator('tbody tr').count(),1);
  assert.equal(await page.locator('thead .project-register-header-filter').count(),0);
  await builder.locator('img').waitFor();
  await project.click();
  await page.getByRole('option',{name:'South Site',exact:true}).click();
  assert.match(await page.locator('tbody').innerText(),/South Site/);
  assert.doesNotMatch(await page.locator('tbody').innerText(),/North Site/);
  await page.reload();
  await project.waitFor();
  assert.match(await project.innerText(),/South Site/);
  await builder.click();
  await page.getByRole('option',{name:'Beta Builder',exact:true}).click();
  assert.match(await project.innerText(),/West Site/,'Changing builder selects a valid site');
  assert.match(await page.locator('tbody').innerText(),/West Site/);
  await page.getByRole('searchbox').fill('missing');
  assert.equal(await page.locator('tbody tr').count(),0);
  await page.getByRole('searchbox').fill('');
  await page.reload();
  await builder.waitFor();
  assert.match(await builder.innerText(),/Beta Builder/);
  assert.match(await project.innerText(),/West Site/);
  if (type==='handovers'||type==='scaff-tags') {
   assert.equal(await page.getByRole('button',{name:/^Add /}).count(),0,'Existing form actions are preserved');
   await page.screenshot({path:`/tmp/ess-${type}-dropdowns.png`});
  }
  await builder.click();
  await page.getByRole('option',{name:'Alpha Builder',exact:true}).click();
  await project.click();
  await page.getByRole('option',{name:'All Projects',exact:true}).click();
  assert.equal(await page.locator('tbody tr').count(),2,'Builder-wide view includes both sites');
  await builder.click();
  await page.getByRole('option',{name:'All Builders',exact:true}).click();
  assert.equal(await page.locator('tbody tr').count(),3,'All builders/projects includes all forms');
  if(type==='day-labour'||type==='pre-starts') assert.equal(await page.getByRole('button',{name:/^Add /}).isDisabled(),true);
  await page.reload();
  await builder.waitFor();
  assert.match(await builder.innerText(),/All Builders/);
  assert.match(await project.innerText(),/All Projects/);
  assert.equal(await page.locator('tbody tr').count(),3);
  await project.click();
  await page.getByRole('option',{name:'West Site — Beta Builder',exact:true}).click();
  assert.equal(await page.locator('tbody tr').count(),1,'A project remains selectable across all builders');
  assert.match(await page.locator('tbody').innerText(),/West Site/);
  await builder.click();
  await page.getByRole('option',{name:'Empty Builder',exact:true}).click();
  assert.equal(await project.isDisabled(),false);
  assert.match(await project.innerText(),/All Projects/);
  assert.equal(await page.locator('tbody tr').count(),0);
  await page.evaluate(type => localStorage.setItem(`ess-${type}-selection-v1:dropdown-test`,JSON.stringify({builderId:'removed',projectId:'removed'})),type);
  await page.reload();
  await builder.waitFor();
  assert.match(await builder.innerText(),/Alpha Builder/,'Stale selections fall back to a valid builder');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: all four registers share builder/site filters, logos, account-specific persistence, valid site fallback, empty states and search.');
} finally {await browser.close();}
