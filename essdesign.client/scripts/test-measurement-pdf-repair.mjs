import assert from 'node:assert/strict';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory = await mkdtemp(join(tmpdir(),'ess-measurement-repair-'));
const script = fileURLToPath(new URL('./repair-measurement-pdf.mjs',import.meta.url));
for (const mode of ['review','apply','conflict','missing-photo']) {
 const log = join(directory,mode+'.json');
 const mock = `
 import {writeFileSync} from 'node:fs';
 const calls=[];
 const row={id:'legacy',builder_id:'builder',project_id:'project',form_type:'handover-certificates',pdf_path:'original.pdf',updated_at:'2020-01-01T00:00:00Z',payload:{id:'legacy',builderId:'builder',projectId:'project',scaffoldLength:'12',inspectionDateTime:'01/01/2020',pdfPath:'original.pdf',photoSlots:${mode==='missing-photo'?"[{slot:0,path:'photo.jpg'}]":"[]"}}};
 globalThis.fetch = async (url,options={})=>{
  const u=new URL(url),method=options.method||'GET';
  calls.push({path:u.pathname,query:u.search,method,body:method==='PATCH'?JSON.parse(options.body):undefined});
  writeFileSync(${JSON.stringify(log)},JSON.stringify(calls));
  if(u.pathname==='/rest/v1/ess_safety_forms') return Response.json(method==='PATCH'?${mode==='conflict'?'[]':'[row]'}:[row]);
  if(u.pathname.includes('/object/sign/')) return Response.json({signedURL:'/missing.jpg'});
  if(u.pathname==='/storage/v1/missing.jpg') return new Response('',{status:404});
  if(u.pathname.startsWith('/storage/v1/object/')) return method==='GET'?new Response('ORIGINAL PDF'):Response.json({});
  throw new Error('Unexpected request '+url);
 };
 `;
 const args=['--import','data:text/javascript;base64,'+Buffer.from(mock).toString('base64'),script,'--id','legacy','--type','handover-certificates','--output',join(directory,mode)];
 if(mode!=='review') args.push('--apply');
 const result=spawnSync(process.execPath,args,{env:{...process.env,SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake-test-key'},encoding:'utf8'});
 assert.equal(result.status,['conflict','missing-photo'].includes(mode)?1:0,result.stderr);
 const calls=JSON.parse(await readFile(log,'utf8'));
 const writes=calls.filter(c=>c.method==='POST'&&!c.path.includes('/sign/'));
 const patches=calls.filter(c=>c.method==='PATCH');
 if(mode==='review'||mode==='missing-photo') {assert.equal(writes.length,0);assert.equal(patches.length,0);}
 else {
  assert.equal(writes.length,1);
  assert.ok(writes[0].path.includes('.metres-v1-'));
  assert.ok(!writes[0].path.endsWith('/original.pdf'));
  assert.equal(patches.length,1);
  const patch=patches[0];
  assert.deepEqual(Object.keys(patch.body).sort(),['payload','pdf_path']);
  assert.equal(patch.body.payload.inspectionDateTime,'01/01/2020');
  assert.equal(patch.body.payload.scaffoldLength,'12');
  assert.ok(new URLSearchParams(patch.query).has('pdf_path'));
  assert.ok(!new URLSearchParams(patch.query).has('payload'),'Signature data is not placed in URLs');
  assert.ok(new URLSearchParams(patch.query).has('updated_at'));
 }
 assert.ok(!calls.some(c=>c.path.includes('qr_labels')||c.path.includes('/rpc/')));
}
console.log('PASS: repair review, versioned apply, concurrent-edit protection and missing-photo protection; no QR writes.');
