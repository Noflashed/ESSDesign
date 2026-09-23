import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {loadMeasurementRenderers} from './load-measurement-renderers.mjs';

const jpeg = readFileSync(new URL('../public/scaffold-forms/maloo-logo.jpg', import.meta.url));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(jpeg);
try {
 const strokes = [[{x:0.1,y:0.3},{x:0.4,y:0.8},{x:0.8,y:0.2}]];
 const raw = {
  id:'seven-rows', companyEntityId:'maloo', clientProjectName:'BUILT - 65 Martin Place', date:'24/09/2026',
  locationLevelGridLine:'North elevation - Level 5', descriptionOfWork:'Erect and modify scaffold for facade works.',
  labourRows:Array.from({length:7},(_,i)=>({date:`${24+i}/09/2026`,men:'3',hours:String(i+2),total:String((i+2)*3),overtime:i%2===0})),
  materialList:Array.from({length:16},(_,i)=>`- ${i+1} x Material ${i+1}`).join('\n'),
  photoSlots:[0,1,2].map(slot=>({slot,path:`photo-${slot}.jpg`})),
  essRepresentativeName:'Maloo Representative', clientName:'Client Representative',
  essRepresentativeSignatureStrokes:strokes, clientSignatureStrokes:strokes,
 };
 const api = {authToken:'fixture',fetchSupabase:async url=>url.includes('/object/sign/')
  ? Response.json({signedURL:'https://example.invalid/photo.jpg'}) : Response.json([{payload:raw}])};
 const r = await loadMeasurementRenderers(api,{supabaseUrl:'https://example.invalid',supabaseAnonKey:'fixture',safetyProjectsBucket:'fixture'});
 const form = await r.getDayLabourVariationForm('builder','project','seven-rows');
 assert.equal(form.labourRows.length,7,'Loading preserves all seven rows');
 for (let count=1;count<=7;count++) {
  const selected = {...form,labourRows:form.labourRows.slice(0,count)};
  const before = JSON.stringify(selected);
  const pdf = await r.buildDayLabourVariationPdfBody(selected);
  assert.equal(JSON.stringify(selected),before,'Export preserves form data');
  assert.equal((pdf.match(/\/Type \/Page\b/g)||[]).length,1);
  for (const row of selected.labourRows) assert.ok(pdf.includes(`(${row.total}${row.overtime?' OT':''})`));
  for (const slot of [1,2,3]) assert.ok(pdf.includes(`/Photo${slot} Do`));
  const stream = pdf.split('stream\n')[1].split('\nendstream')[0];
  const transform = stream.match(/^q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/);
  assert.ok(transform);
  const [,sx,sy,tx,ty] = transform.map(Number);
  for (const match of stream.matchAll(/(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+) re/g)) {
   const [,x,y,w,h] = match.map(Number);
   assert.ok(x*sx+tx>=0 && (x+w)*sx+tx<=768,`Row count ${count}: horizontal bounds`);
   assert.ok(y*sy+ty>=19.9 && (y+h)*sy+ty<=1072.1,`Row count ${count}: vertical bounds`);
  }
  if (count===7 && process.env.PDF_PREVIEW_PATH) writeFileSync(process.env.PDF_PREVIEW_PATH,pdf,'binary');
 }
 console.log('PASS: 1–7 rows retain all totals, photos and form data on a single page within its margins.');
} finally {
 globalThis.fetch = originalFetch;
}
