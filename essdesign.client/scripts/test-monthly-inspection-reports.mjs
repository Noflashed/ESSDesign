import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
 await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:5182'}/tests/fixtures/scaffold-register-cards.html`);
 await page.locator('.monthly-reports-link').first().click();
 await page.locator('.monthly-report-card').first().waitFor();
 assert.equal(await page.locator('.monthly-report-card').count(),4);
 for(const width of [1440,1024,390]) {
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Report list fits viewport');
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:/December 16\/12\/2026 Inspection Report/}).click();
 const editor=page.getByRole('dialog',{name:'Inspection Report form',exact:true});
 await editor.waitFor();
 await editor.getByText('Maloo Inspection Report',{exact:true}).first().waitFor();
 const input=editor.locator('textarea').filter({hasText:'Copied handover comments'});
 await input.fill('Edited inspection report only');
 await editor.getByRole('button',{name:'Save inspection report',exact:true}).click();
 await page.waitForFunction(()=>window.__sampleSafetyStore.get('inspection-reports:inspection-sample-3')?.payload.comments==='Edited inspection report only');
 await editor.getByRole('button',{name:'Share Inspection Report',exact:true}).waitFor();
 const pdf=await page.evaluate(()=>window.__sampleReportPdf);
 assert.ok(pdf?.includes('Maloo Inspection Report'),'Saved PDF uses inspection report title');
 const state=await page.evaluate(()=>({report:window.__sampleSafetyStore.get('inspection-reports:inspection-sample-3').payload,source:window.__sampleSafetyStore.get('handover-certificates:handover-sample-0').payload}));
 assert.equal(state.report.inspectionDateTime,'16/12/2026 9:30 am');
 assert.equal(state.report.sourceInspectionRowId,'row-3');
 assert.equal(state.report.reportTitle,'December 16/12/2026 Inspection Report');
 assert.deepEqual(state.report.photoSlots,[]);
 assert.notEqual(state.source.comments,'Edited inspection report only');
 assert.deepEqual(errors,[]);
 console.log('PASS: four reports, month/date labels, Maloo title, independent edit/save, preserved provenance/date and no photos');
} finally {await browser.close();}
