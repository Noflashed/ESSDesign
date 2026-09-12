// Synthetic model evaluation. No speech requests and no credentials written to disk.
import assert from 'node:assert/strict';
if (!process.argv.includes('--live')) {
  console.log('Set ESS_API_URL and ESS_API_TOKEN, then run node scripts/evaluate-prestart.mjs --live. This uses OpenAI interpretation only; no ElevenLabs synthesis.');
  process.exit(0);
}
const base = process.env.ESS_API_URL;
const token = process.env.ESS_API_TOKEN;
assert(base && token, 'ESS_API_URL and ESS_API_TOKEN are required.');
const empty = {previousIssues: null, previousIssuesDetails: '', plannedActivities: '', swmsInPlace: null, permitDetails: '', permitConditionsChanged: null, hazardousSubstances: null, hazardousSubstancesDetails: '', areaForeman: '', risks: '', workGroupCount: '', cleanupWorkerCount: '', generalNotes: '', attendees: ''};
for (const key of ['dailyRiskAssessment','qualifications','plantAndEquipment','equipmentSafe','workAreaSafe','ppe','weather','consulted']) empty[`checklist.${key}`] = null;
const cases = [
  {name:'non-adjacent answers', key:'previousIssues', text:'No issues yesterday. Today we are erecting an alloy stair and there are four of us.', fields:{}, check:r=>r.patches.some(p=>p.key==='previousIssues'&&p.value===false)&&r.patches.some(p=>p.key==='workGroupCount'&&p.value==='4')&&r.patches.some(p=>p.key==='plannedActivities'&&/alloy stair/i.test(p.value))},
  {name:'remembered addition', key:'permitDetails', text:'Also add the delayed delivery to the previous day issues.', fields:{previousIssues:true,previousIssuesDetails:'Damaged board.'}, check:r=>r.patches.some(p=>p.key==='previousIssuesDetails'&&/damaged board/i.test(p.value)&&/delay/i.test(p.value))},
  {name:'unknown is not no', key:'swmsInPlace', text:'I am not sure whether every activity is covered.', fields:{}, check:r=>!r.patches.some(p=>p.key==='swmsInPlace'&&p.value!==null)&&['clarify','defer','continue'].includes(r.action)},
  {name:'partial permit', key:'permitDetails', text:'It is an access permit but I do not have the number.', fields:{}, check:r=>r.patches.some(p=>p.key==='permitDetails'&&/access/i.test(p.value)&&p.status==='partial')},
  {name:'targeted risk action', key:'generalNotes', text:'For the falling objects risk, add the exclusion zone below as the agreed action.', fields:{risks:'Falling objects\nVehicle movements — Spotter'}, check:r=>r.patches.some(p=>p.key==='risks'&&/exclusion/i.test(p.value)&&/Vehicle movements — Spotter/.test(p.value))},
  {name:'no fabricated checks', key:'plannedActivities', text:'We will erect a loading bay today.', fields:{}, check:r=>r.patches.some(p=>p.key==='plannedActivities')&&!r.patches.some(p=>p.key.startsWith('checklist.')||p.key==='swmsInPlace')},
  {name:'explain without filling', key:'swmsInPlace', text:'What does SWMS mean?', fields:{}, check:r=>r.action==='clarify'&&!r.patches.some(p=>p.key==='swmsInPlace'&&p.value!==null)&&r.speech.length>0},
];
let failed=0; const times=[];
for (let run=0;run<3;run++) for (const test of cases) {
  const start=performance.now();
  try {
    const response=await fetch(`${base.replace(/\/$/,'')}/pre-start/conversation-turn`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({formId:'synthetic-evaluation',currentKey:test.key,question:test.key,transcript:test.text,fields:{...empty,...test.fields},history:[],statuses:{},context:{}}),signal:AbortSignal.timeout(60000)});
    assert(response.ok,`HTTP ${response.status}`);
    const result=await response.json(); assert(test.check(result),'Expected behaviour not observed');
    times.push(performance.now()-start); console.log(`PASS ${run+1}: ${test.name}`);
  } catch(error) { failed++; console.log(`FAIL ${run+1}: ${test.name}: ${error.message}`); }
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({runs:cases.length*3,failed,p50Ms:times[Math.floor(times.length*.5)],p90Ms:times[Math.floor(times.length*.9)]}));
process.exitCode=failed?1:0;
