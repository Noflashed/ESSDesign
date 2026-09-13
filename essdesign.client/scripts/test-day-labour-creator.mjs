import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {getProjectDataStatus, getFormSharingStatus} from '../src/utils/projectDataStatus.js';
import {getScaffTagStatus} from '../src/utils/scaffTagStatus.js';

const apiSource = await readFile(new URL('../src/services/api.js', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../src/components/ESSSafetyPage.jsx', import.meta.url), 'utf8');
const registerSource = await readFile(new URL('../src/components/ProjectDataRegisterPage.jsx', import.meta.url), 'utf8');
const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const original = {form_type:'day-labour-variations', id:'existing', builder_id:'builder', project_id:'project',
    created_by_user_id:'creator', requested_by:'Site Manager', created_at:'2020-01-01', updated_at:'2020-01-02',
    payload:{formReferenceName:'Existing variation', createdByUserId:'wrong-payload-account'}};
const records = [original, {...original,id:'missing',created_by_user_id:null},
    {...original,id:'removed',created_by_user_id:'removed-account'},
    {...original,id:'email',created_by_user_id:'email-account'}];
let lookupCalls = 0;
const context = vm.createContext({
    getProjectDataStatus, getFormSharingStatus,
    getScaffTagStatus,
    handoverCertificatesAPI:{}, preStartsAPI:{}, scaffTagsAPI:{},
    safetyModulePrefix: () => 'test', safetyFormPhotoPaths: () => [], nowIso: () => 'now',
    SAFETY_FORMS_TABLE:'ess_safety_forms', DELETED_SAFETY_FORMS_TABLE:'ess_deleted_safety_forms',
    withPdfExtension: title => `${title}.pdf`, formatBytes: () => '', makeFileRef: () => 'fallback',
    readRestRows: async (table, query) => {
        if (table === 'user_names') {
            lookupCalls++;
            const params = new URLSearchParams(query);
            assert.equal(params.get('select'),'id,full_name,email');
            assert.equal(params.get('id'),'in.("creator","removed-account","email-account")');
            return [{id:'creator',full_name:'Original Creator',email:'creator@example.com'},
                {id:'email-account',full_name:' ',email:'email@example.com'}];
        }
        if (table === 'ess_deleted_safety_forms') return [{...original,id:'archived',deleted_at:'2020-02-01'}];
        assert.equal(table,'ess_safety_forms');
        return records;
    }
});
vm.runInContext([
    section(apiSource,'function mapSafetyFormRow(', 'function legacySafetyFormIndexPath('),
    section(apiSource,'async function listSafetyFormRecords(', 'async function getSafetyFormRecord('),
    section(apiSource,'async function resolveSafetyFormCreators(', 'export const scaffTagsAPI').replace('export const dayLabourVariationsAPI','globalThis.dayLabourVariationsAPI'),
    section(pageSource,'function mapDayLabourVariationRows(', 'function mapFileRows('),
    section(registerSource,'const REGISTER_CONFIG =', 'function StatusBadge('),
    'globalThis.registerConfig = REGISTER_CONFIG; globalThis.mapRegisterRows = mapRows; globalThis.registerSortValue = sortValue;'
].join('\n'), context);
for (const forms of [await context.dayLabourVariationsAPI.listForms('builder','project'),
    await context.dayLabourVariationsAPI.listAllForms({includeDeleted:true})]) {
    const display = context.mapDayLabourVariationRows(forms);
    const byId = new Map(display.map(row => [row.id,row]));
    assert.equal(byId.get('existing').uploadedBy,'Original Creator');
    assert.equal(byId.get('existing').raw.requestedBy,'Site Manager');
    assert.equal(byId.get('existing').raw.createdAt,'2020-01-01');
    assert.equal(byId.get('missing').uploadedBy,'Not recorded');
    assert.equal(byId.get('removed').uploadedBy,'Not recorded');
    assert.equal(byId.get('email').uploadedBy,'email@example.com');
    if (display.length === 5) assert.equal(byId.get('archived').uploadedBy,'Original Creator');
    const columns = context.registerConfig['day-labour'].columns;
    assert.equal(columns.find(column => column.key === 'uploadedBy').label,'UPLOADED BY');
    assert.ok(!columns.some(column => column.key === 'requestedBy'));
    const registerRows = context.mapRegisterRows('day-labour', forms, new Map());
    for (const row of registerRows) {
        assert.equal(row.uploadedBy, byId.get(row.form.id).uploadedBy);
        assert.equal(row.form.requestedBy,'Site Manager','Requester remains available in the form');
        assert.equal(context.registerSortValue(row,'uploadedBy'),row.uploadedBy.toLowerCase());
    }
}
assert.equal(lookupCalls,2,'Creator names are fetched once per list, not once per form');
assert.equal(original.payload.createdByUserId,'wrong-payload-account','Reading preserves original records');
console.log('PASS: existing and archived forms use the account creator, keep the requester separate, and handle missing accounts.');
