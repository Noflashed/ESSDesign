import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {getProjectDataStatus, getFormSharingStatus} from '../src/utils/projectDataStatus.js';
import {getScaffTagStatus} from '../src/utils/scaffTagStatus.js';

const register = await readFile(new URL('../src/components/ProjectDataRegisterPage.jsx', import.meta.url), 'utf8');
const projectData = (await readFile(new URL('../src/utils/projectDataDocuments.js', import.meta.url), 'utf8')).replaceAll('export ', '');
const context = vm.createContext({getProjectDataStatus, getFormSharingStatus, getScaffTagStatus, makeFileRef: () => 'TAG'});
vm.runInContext(register.slice(register.indexOf('const parseDate ='), register.indexOf('function StatusBadge('))
    + projectData.slice(projectData.indexOf('function mapScaffTagRows('), projectData.indexOf('function mapHandoverRows('))
    + '\nglobalThis.mapRegisterRows = mapRows;', context);
const base = {id:'existing',builderId:'builder',projectId:'project',status:'active'};
for (const [fields, expected] of [
    [{},'Active'],
    [{latestInspectionDate:'2000-01-01',expiresAt:'2000-04-01'},'Active'],
    [{latestInspectionDate:'invalid'},'Active'],
    [{status:'retired',retiredAt:'2026-09-14',retiredReason:'Scaffold dismantled'},'Expired'],
    [{retiredAt:'2026-09-14'},'Expired'],
    [{status:'dismantled'},'Expired'],
    [{dismantledAt:'2026-09-14'},'Expired'],
    [{scaffoldStatus:'Dismantled',completedAt:'2026-09-14'},'Expired'],
    [{scaffoldStatus:'Active',completedAt:'2026-09-14'},'Active'],
    [{isDeleted:true,status:'retired'},'Deleted'],
]) {
    const form = {...base,...fields};
    assert.equal(context.mapScaffTagRows([form])[0].status,expected,'Project Data follows lifecycle');
    assert.equal(context.mapRegisterRows('scaff-tags',[form],new Map())[0].status,expected,'Register agrees with Project Data');
}
assert.equal(context.mapScaffTagRows([{...base,latestInspectionDate:'2000-01-01'}])[0].expiresAt,'',
    'No calendar expiry is invented for an active scaffold');
console.log('PASS: both Scaff-Tag screens use scaffold lifecycle, ignoring missing, old and invalid inspection dates.');
