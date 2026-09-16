import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import '../../src/App.css';
import ScaffoldRegisterPage from '../../src/components/ScaffoldRegisterPage';
import {safetyProjectsAPI, scaffoldRegisterAPI, scaffTagsAPI, handoverCertificatesAPI, foldersAPI, authAPI} from '../../src/services/api';
import nativeAPI from '../../src/scaffoldForms/services/apiService';

// Development-only entry point, intentionally excluded from production build inputs.
const project = {id:'sample-project', name:'Burwood North Station', designFolderId:'sample-designs', scaffoldEntity:'Erect Safe Scaffolding'};
const client = {id:'sample-client', name:'ABI CIVIL CONTRACTING', projects:[project]};
const today = new Date();
const ago = days => new Date(today.getTime() - days * 86400000).toISOString();
const dateAgo = days => ago(days).slice(0,10);
const names = ['Sample Scaffold', 'North Elevation', 'Platform Access', 'Southern Stair Tower', 'Loading Bay', 'Western Hoist'];
const locations = ['Station concourse', 'North entrance', 'Platform 1', 'Southern entrance', 'Site compound', 'West boundary'];
const days = [0,12,28,35,0,42];
const base = {builderId:client.id, projectId:project.id, builderName:client.name, projectName:project.name, companyEntityId:'ess'};
const records = names.map((name,i) => ({...base,id:`sample-${i}`, scaffoldName:name, location:locations[i], status:i===4?'awaiting-qr':i===5?'dismantled':'active', activatedAt:i===4?'':ago(days[i]+.1), dismantledAt:i===5?ago(2):'',updatedAt:ago(i/10), createdAt:ago(days[i]), drawingDocumentId:i===0?'':`drawing-${i}`,drawingDocumentType:'ess',drawingNumber:`D${[100,104,108,112,115,99][i]} · Rev ${i%2?'C':'A'}`}));
const tags = records.filter((_,i)=>i!==4).map((r,i)=>({...base,id:`tag-${r.id}`,scaffoldRegisterId:r.id,scaffoldNo:r.scaffoldName,tagNumber:String(21-i).padStart(4,'0'),jobLocation:project.name,status:r.status==='dismantled'?'retired':'active',dateErected:dateAgo(days[names.indexOf(r.scaffoldName)]),inspectionRecords:[{date:dateAgo(days[names.indexOf(r.scaffoldName)]),time:'9:30 am',competentPerson:'Nathan Borg',note:'Scaffold compliant',signatureStrokes:[]}],photoPaths:[],qrLabelStatus:r.status==='dismantled'?'retired':'assigned',qrLabelNumber:`ST000${i+1}`,qrLabelAssignedAt:r.activatedAt,qrTargetUrl:`${location.origin}/tests/fixtures/sample-scaffold-qr.html?name=${encodeURIComponent(r.scaffoldName)}&label=ST000${i+1}`,updatedAt:r.updatedAt,createdAt:r.createdAt,inspectedBy:'Nathan Borg'}));
const handovers = records.filter((_,i)=>i!==4).map((r,i)=>({...base,id:`handover-${r.id}`,scaffoldRegisterId:r.id,formReferenceName:r.scaffoldName,inspectionNumber:String(21-i).padStart(4,'0'),inspectionDateTime:dateAgo(days[i]),updatedAt:r.updatedAt,createdAt:r.createdAt,photoSlots:[]}));
const reports = [0,1,2,3].map(i=>({...handovers[0],id:`inspection-sample-${i}`,inspectionNumber:String(i+1).padStart(4,'0'),documentKind:'inspection-report',sourceHandoverId:handovers[0].id,sourceScaffTagId:tags[0].id,sourceInspectionRowId:`row-${i}`,inspectionDateTime:`16/${String(i+9).padStart(2,'0')}/2026 9:30 am`,photoSlots:[],projectNumberClient:'Burwood North Station / ABI Civil',comments:'Copied handover comments',companyEntityId:i===3?'maloo':'ess'}));
const store = new Map();
window.__sampleSafetyStore = store;
for (const [type,list] of [['scaffold-register',records],['scaff-tags',tags],['handover-certificates',handovers],['inspection-reports',reports]]) list.forEach(form=>store.set(type+':'+form.id,{id:form.id,form_type:type,builder_id:client.id,project_id:project.id,payload:form,updated_at:form.updatedAt}));
safetyProjectsAPI.getBuilders = async()=>[client];
safetyProjectsAPI.resolveBuilderLogoUrl = async()=>'';
authAPI.getCurrentUser = ()=>({id:'sample-user',fullName:'Nathan Borg',email:'sample@example.test'});
localStorage.setItem('access_token','local-preview-only');
localStorage.removeItem('ess-scaffold-register-filters-v1');
for (const [api,type,method] of [[scaffoldRegisterAPI,'scaffold-register','listRecords'],[scaffTagsAPI,'scaff-tags','listForms'],[handoverCertificatesAPI,'handover-certificates','listForms']]) api[method]=async()=>[...store.values()].filter(row=>row.form_type===type).map(row=>row.payload);
foldersAPI.getFolder=async()=>({id:'sample-designs',name:'Sample designs',documents:[],subFolders:[]});
nativeAPI.getFolder=foldersAPI.getFolder;
nativeAPI.getRootFolders=async()=>[];
nativeAPI.fetchSupabase=async(url,options={})=>{
 const path=new URL(url,location.origin);
 const respond=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 if(path.pathname.includes('ess_safety_forms')){
  if(options.method==='POST'){const items=JSON.parse(options.body);items.forEach(row=>store.set(row.form_type+':'+row.id,row));return respond(items);}
  const matches=[...store.values()].filter(row=>[...path.searchParams].every(([k,v])=>!v.startsWith('eq.')||String(row[k])===v.slice(3)));
  if(options.method==='DELETE')matches.forEach(row=>store.delete(row.form_type+':'+row.id));
  return respond(matches);
 }
 if(path.pathname.includes('/rpc/'))return respond('00022');
 if(path.pathname.includes('/storage/')){if(options.headers?.['Content-Type']==='application/pdf')window.__sampleReportPdf=options.body;return respond({forms:[],Key:path.pathname});}
 return respond([]);
};
// Block accidental live requests from editor or document integrations in this preview.
const originalXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
 const target = new URL(url, location.origin);
 if (target.origin !== location.origin || target.pathname.startsWith('/api/')) throw new Error('Live services are disabled in the sample preview.');
 return originalXHROpen.call(this, method, url, ...args);
};
const originalFetch=window.fetch.bind(window);
window.fetch=(url,options)=>new URL(typeof url==='string'?url:url.url,location.origin).origin===location.origin?originalFetch(url,options):Promise.reject(new Error('Live services are disabled in the sample preview.'));
const originalOpen=window.open.bind(window);
window.open=(url,...rest)=>{if(url==='#sample-qr'){window.alert('Sample QR label — the live register opens its linked interactive Scaff-Tag here.');return null;}return (url==='about:blank'||String(url).startsWith(location.origin))?originalOpen(url,...rest):null;};
document.documentElement.dataset.theme='light';
const style=document.createElement('style');style.textContent=`
:root {--bg-primary:#f5f7fa;--bg-secondary:#f5f7fa;--bg-tertiary:#e8edf3;--card-bg:#fff;--text-primary:#142b45;--text-secondary:#647792;--border-color:#e0e7ef;--primary-color:#1769e8;}
body {margin:0;} #root {height:100vh;} .preview-shell {display:flex;height:100vh;} .preview-main{min-width:0;flex:1;display:flex;flex-direction:column;}.preview-banner{font-size:11px;color:#56708b;padding:10px 28px 0;display:flex;justify-content:space-between;}.preview-main .scaffold-register-page{flex:1;height:auto;}
@media(max-width:800px){.preview-banner{padding:8px 16px 0;}}
`;document.head.append(style);
createRoot(document.getElementById('root')).render(<div className="preview-shell"><section className="preview-main"><div className="preview-banner"><span>Projects / Scaffold Register</span><span>LOCAL PREVIEW · SAMPLE DATA</span></div><ScaffoldRegisterPage initialBuilderId={client.id} initialProjectId={project.id} onOpenDrawing={()=>window.alert('Sample design drawing — live records open the linked drawing here.')} /></section></div>);
