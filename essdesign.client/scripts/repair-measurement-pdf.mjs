import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadMeasurementRenderers} from './load-measurement-renderers.mjs';

// One explicitly identified form per run. Default is a local review, never a live write.
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name)+1];
if (args.includes('--help') || !args.includes('--id') || !args.includes('--type')) {
 console.log('Usage: node scripts/repair-measurement-pdf.mjs --id ID --type handover-certificates|day-labour-variations [--output DIR] [--apply]');
 console.log('Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Without --apply, writes review copies locally only.');
 process.exit(args.includes('--help') ? 0 : 1);
}
const formId = option('--id'), type = option('--type');
if (!['handover-certificates','day-labour-variations'].includes(type)) throw new Error('Unsupported form type');
const base = process.env.SUPABASE_URL?.replace(/\/$/,'');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment');
if (new URL(base).protocol !== 'https:') throw new Error('HTTPS Supabase URL required');
const headers = {apikey:key,Authorization:`Bearer ${key}`};
const bucket = 'project-information';
const nativeFetch = globalThis.fetch;
// The only relative fetch made by the renderers is the bundled Maloo logo.
globalThis.fetch = async (url, options) => url === '/scaffold-forms/maloo-logo.jpg'
 ? new Response(await readFile(new URL('../public/scaffold-forms/maloo-logo.jpg',import.meta.url)))
 : nativeFetch(url, options);
async function request(path, options={}) {
 const response = await nativeFetch(base+path,{...options,headers:{...headers,...options.headers}});
 if (!response.ok) throw new Error(`Request failed (${response.status}) for ${path.split('?')[0]}`);
 return response;
}
const query = new URLSearchParams({select:'*',id:`eq.${formId}`,form_type:`eq.${type}`});
const rows = await (await request('/rest/v1/ess_safety_forms?'+query)).json();
if (rows.length !== 1) throw new Error('Expected exactly one form');
const row = rows[0];
if (!row.pdf_path || !row.payload || row.payload.isDeleted) throw new Error('Missing PDF/payload or deleted form; left untouched');
const fields = type === 'handover-certificates' ? ['scaffoldLength','scaffoldHeight'] : ['scaffoldLength','scaffoldWidth','scaffoldHeight'];
const constants = {supabaseUrl:base,supabaseAnonKey:key,safetyProjectsBucket:bucket};
const renderers = await loadMeasurementRenderers({authToken:key,fetchSupabase:async (url,options)=>{
 if (!url.startsWith(base+'/')) throw new Error('Unexpected renderer destination');
 if (options?.method !== 'GET' && !url.startsWith(base+'/storage/v1/object/sign/')) throw new Error('Renderer attempted a mutation');
 return nativeFetch(url,options);
}},constants);
if (!fields.some(field=>renderers.formatMetres(row.payload[field]) !== String(row.payload[field] ?? '').trim())) {
 console.log('No numeric dimensions needing units; left untouched'); process.exit(0);
}
const getter = type === 'handover-certificates' ? renderers.getHandoverCertificateForm : renderers.getDayLabourVariationForm;
const renderer = type === 'handover-certificates' ? renderers.buildHandoverCertificatePdfBody : renderers.buildDayLabourVariationPdfBody;
const form = await getter(row.builder_id,row.project_id,row.id);
if (!form) throw new Error('Form disappeared');
if ((row.payload.photoSlots || []).length !== form.photoSlots.length) throw new Error('Legacy photo data needs manual review; left untouched');
for (const person of ['essRepresentative','client']) {
 if (form[person+'Signature'] && !form[person+'SignatureStrokes']?.length) throw new Error('Legacy signature needs manual review; left untouched');
}
const body = await renderer(form);
// The legacy generators tolerate missing photos; a repair must never silently drop one.
if ((body.match(/\/Subtype \/Image/g)||[]).length !== 1+form.photoSlots.length) throw new Error('Photo preservation check failed; left untouched');
const bytes = Buffer.from(body,'binary');
const digest = createHash('sha256').update(bytes).digest('hex').slice(0,20);
const newPath = row.pdf_path.replace(/\.pdf$/i, '')+`.metres-v1-${digest}.pdf`;
if (row.pdf_path.includes('.metres-v1-')) {console.log('Already repaired; left untouched');process.exit(0);}
const directory = resolve(args.includes('--output') ? option('--output') : '../output/measurement-pdf-repair');
await mkdir(directory,{recursive:true});
const filePrefix = `${type}-${String(row.id).replace(/[^a-z0-9_-]/gi,'_')}`;
const encoded = path => path.split('/').map(encodeURIComponent).join('/');
const original = await (await request(`/storage/v1/object/${bucket}/${encoded(row.pdf_path)}`)).arrayBuffer();
if (Buffer.from(original).includes(Buffer.from('/ByteRange'))) throw new Error('Digitally signed PDF requires manual review; left untouched');
await writeFile(resolve(directory,filePrefix+'.original.pdf'),Buffer.from(original));
await writeFile(resolve(directory,filePrefix+'.repaired.pdf'),bytes);
await writeFile(resolve(directory,filePrefix+'.json'),JSON.stringify({original:row,newPdfPath:newPath},null,2));
if (!args.includes('--apply')) {console.log('Review PDFs and original row saved to '+directory+'. No remote changes made.');process.exit(0);}
// Preserve the old object; all existing direct links remain valid.
await request(`/storage/v1/object/${bucket}/${encoded(newPath)}`,{method:'POST',headers:{'Content-Type':'application/pdf','x-upsert':'true'},body:bytes});
const guard = new URLSearchParams({id:`eq.${row.id}`,form_type:`eq.${type}`,builder_id:`eq.${row.builder_id}`,project_id:`eq.${row.project_id}`,pdf_path:`eq.${row.pdf_path}`});
// The database BEFORE UPDATE trigger changes updated_at on every row edit.
// Keep the guard compact: full signature payloads can exceed proxy URL limits.
if (!row.updated_at) throw new Error('Missing row revision; reference left untouched');
guard.set('updated_at',`eq.${row.updated_at}`);
const updated = await (await request('/rest/v1/ess_safety_forms?'+guard,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({pdf_path:newPath,payload:{...row.payload,pdfPath:newPath}})})).json();
if (updated.length !== 1) throw new Error('Form changed concurrently. Original reference preserved; review copy is unlinked.');
console.log('PDF reference repaired. Original PDF, form data, inspection dates and QR assignments preserved.');
