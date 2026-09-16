import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadMeasurementRenderers} from './load-measurement-renderers.mjs';
let raw;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async url=>url==='/scaffold-forms/maloo-logo.jpg'
 ? new Response(await readFile(new URL('../public/scaffold-forms/maloo-logo.jpg',import.meta.url)))
 : nativeFetch(url);
const r=await loadMeasurementRenderers({authToken:'test',fetchSupabase:async()=>Response.json([{id:'sample',payload:raw}])},{supabaseUrl:'https://example.invalid',supabaseAnonKey:'test',safetyProjectsBucket:'test'});
for(const companyEntityId of ['ess','maloo']) {
 for(const kind of ['handover','inspection-report','day-labour']) {
  raw={id:'sample',companyEntityId,documentKind:kind,photoSlots:[],inspectionDateTime:'16/09/2026 9:30 am'};
  const day=kind==='day-labour';
  const form=await(day?r.getDayLabourVariationForm('b','p','sample'):r.getHandoverCertificateForm('b','p','sample',kind==='inspection-report'));
  const pdf=await(day?r.buildDayLabourVariationPdfBody(form):r.buildHandoverCertificatePdfBody(form));
  assert.ok(!pdf.includes('PH:')&&!pdf.includes('FAX:'),`${companyEntityId} ${kind} removes phone/fax`);
  assert.ok(pdf.includes('ABN:')&&pdf.includes('Office Address:'),'Company identifiers remain');
 }
}
console.log('PASS: ESS and Maloo company details retained without phone/fax in all three document types');
