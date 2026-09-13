import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {getProjectDataStatus} from '../src/utils/projectDataStatus.js';
import {getScaffTagStatus} from '../src/utils/scaffTagStatus.js';

const source = await readFile(new URL('../src/components/ProjectDataRegisterPage.jsx', import.meta.url), 'utf8');
const context = vm.createContext({getProjectDataStatus, getScaffTagStatus});
vm.runInContext(source.slice(source.indexOf('const parseDate ='), source.indexOf('function StatusBadge('))
    + '\nglobalThis.mapRegisterRows = mapRows;', context);
const tag = {id:'existing-tag',builderId:'builder',projectId:'project',erectedBy:'Scaffold Builder',
    inspectedBy:'Original Inspector',latestInspectionDate:'01/09/2026',
    inspectionRecords:[{date:'01/09/2026',competentPerson:'Inspection Record Person'}]};
const display = form => context.mapRegisterRows('scaff-tags',[form],new Map())[0];
assert.equal(display(tag).representative,'Original Inspector','Use the actual Inspected by field');
assert.equal(display({...tag,inspectionRecords:[]}).representative,'Original Inspector','Initial tags use the named inspector');
assert.equal(display({...tag,inspectedBy:' '}).representative,'Inspection Record Person','Legacy tags can use a recorded inspection');
assert.equal(display({...tag,inspectedBy:'',inspectionRecords:[]}).representative,'Not recorded','Never substitute the builder');
assert.equal(display({...tag,isDeleted:true}).representative,'Original Inspector','Archived tags use the same inspector mapping');
assert.equal(tag.erectedBy,'Scaffold Builder','Reading does not alter the tag');
console.log('PASS: Scaff-Tag register uses Inspected by for existing, initial and archived tags, without substituting Erected by.');
