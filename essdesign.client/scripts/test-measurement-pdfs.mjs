import assert from 'node:assert/strict';
import {loadMeasurementRenderers} from './load-measurement-renderers.mjs';
const raw = {id:'legacy',builderId:'builder',projectId:'project',companyEntityId:'ess',inspectionDateTime:'01/02/2020 9:00 AM',scaffoldLength:'12',scaffoldWidth:'3.5',scaffoldHeight:'8m',workingDecks:'2',baysLong:'4',pdfPath:'original.metres-v1-fixed.pdf',photoSlots:[],essRepresentativeSignatureStrokes:[[{x:0,y:0},{x:1,y:1}]]};
const api = {authToken:'test',fetchSupabase:async (_url, options)=>{
 if (_url.includes('/object/sign/')) {assert.ok(_url.endsWith(raw.pdfPath),'PDF lookup uses the repaired path'); return Response.json({signedURL:'/corrected.pdf'});}
 assert.equal(options.method,'GET','Rendering never writes form data');
 return Response.json([{payload:raw,pdf_path:raw.pdfPath}]);
}};
const r = await loadMeasurementRenderers(api,{supabaseUrl:'https://example.invalid',supabaseAnonKey:'test',safetyProjectsBucket:'test'});
for (const [input,expected] of [[null,''],['',''],['  ',''],[0,'0m'],['12','12m'],['.5','.5m'],['12.50','12.50m'],['16.','16m'],['12m','12m'],['12 m','12 m'],['1200mm','1200mm'],['N/A','N/A'],['3 ft','3 ft']]) assert.equal(r.formatMetres(input),expected);
for (const [get,build] of [[r.getHandoverCertificateForm,r.buildHandoverCertificatePdfBody],[r.getDayLabourVariationForm,r.buildDayLabourVariationPdfBody]]) {
 const form = await get('builder','project','legacy');
 const before = JSON.stringify(form);
 const pdf = await build(form);
 assert.ok(pdf.startsWith('%PDF-1.4'));
 assert.ok(pdf.includes('(12m)'),'Numeric dimension has metres');
 assert.ok(pdf.includes('(8m)'),'Existing metres are retained');
 assert.ok(!pdf.includes('(8mm)'),'Metres never duplicated');
 assert.equal(JSON.stringify(form),before,'Rendering preserves legacy payload, dates and signatures');
}
for (const getUrl of [r.getHandoverCertificatePdfUrl,r.getDayLabourVariationPdfUrl]) assert.equal(await getUrl({builderId:'builder',projectId:'project',formId:'legacy'}),'https://example.invalid/storage/v1/corrected.pdf');
console.log('PASS: measurement formatting and both production PDF generators preserve legacy form data.');

const legacyHandover = await r.getHandoverCertificateForm('builder','project','legacy');
assert.equal(legacyHandover.checklist.upliftDevicesInstalledAndEngaged, undefined);
const upliftPdfs = [];
for (const status of ['', 'YES', 'NO', 'NA']) {
 const form = {...legacyHandover, checklist: {...legacyHandover.checklist, upliftDevicesInstalledAndEngaged: status}};
 const pdf = await r.buildHandoverCertificatePdfBody(form);
 assert.match(pdf, /Have the uplift devices been installed/);
 assert.match(pdf, /where required/);
 upliftPdfs.push(pdf);
}
assert.equal(new Set(upliftPdfs).size, 4, 'Each uplift answer produces a distinct PDF selection');
assert.equal(legacyHandover.checklist.upliftDevicesInstalledAndEngaged, undefined, 'Rendering does not backfill legacy records');
console.log('PASS: uplift PDF supports blank, Yes, No and N/A without altering legacy answers.');
