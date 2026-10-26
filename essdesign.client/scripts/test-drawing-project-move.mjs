import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/components/DrawingRegisterPage.jsx', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('    const updateRowClient ='), source.indexOf('    const deleteRow ='));
const original = { id: 'drawing', builderId: 'a', client: 'A', projectId: 'old', project: 'Old', design: 'SCAFFOLD' };
function harness(move) {
    const context = {
        canEdit: true,
        rows: [{ ...original }],
        builders: [
            { id: 'a', name: 'A', projects: [{ id: 'old', name: 'Old', designFolderId: 'old-folder' }, { id: 'new', name: 'New', designFolderId: 'new-folder' }, { id: 'missing', name: 'Missing' }] },
            { id: 'b', name: 'B', projects: [{ id: 'other', name: 'Other', designFolderId: 'other-folder' }] }
        ],
        originalProjectRowsRef: { current: new Map() },
        originalDesignNamesRef: { current: new Map() },
        movingProjectRowIdsRef: { current: new Set() },
        dirtyRowIdsRef: { current: new Set() },
        syncing: new Set(),
        error: '',
        normalizeFolderId: value => value || '',
        drawingFolderLookup: row => ({ projectFolderId: row.projectId === 'old' ? 'old-folder' : null, designName: row.design }),
        foldersAPI: { moveDrawingRegisterFolder: move }
    };
    context.setRows = update => { context.rows = update(context.rows); };
    context.setFolderSyncingRowIds = update => { context.syncing = update(context.syncing); };
    context.setSiteLinkError = value => { context.error = value; };
    vm.createContext(context);
    vm.runInContext(`${handlers}\nthis.changeProject = updateRowProject; this.changeClient = updateRowClient;`, context);
    return context;
}

let finish;
const calls = [];
const successful = harness(request => { calls.push(request); return new Promise(resolve => { finish = resolve; }); });
const pending = successful.changeProject('drawing', 'New');
assert.equal(successful.rows[0].projectId, 'old', 'Keep original project until files have moved');
assert.equal(successful.syncing.has('drawing'), true);
await successful.changeProject('drawing', 'New');
assert.equal(calls.length, 1, 'Ignore duplicate changes while moving');
finish({ folderId: 'drawing-folder' });
await pending;
assert.equal(successful.rows[0].projectId, 'new');
assert.equal(successful.dirtyRowIdsRef.current.has('drawing'), true);
assert.equal(successful.syncing.size, 0);

const failed = harness(async () => { throw new Error('Destination already exists'); });
await failed.changeProject('drawing', 'New');
assert.equal(failed.rows[0].projectId, 'old');
assert.equal(failed.dirtyRowIdsRef.current.size, 0);
assert.match(failed.error, /Destination already exists/);

const missing = harness(async () => assert.fail('Must not move without a linked destination'));
await missing.changeProject('drawing', 'Missing');
assert.equal(missing.rows[0].projectId, 'old');
assert.match(missing.error, /Site Registry/);

let crossClientRequest;
const crossClient = harness(async request => { crossClientRequest = request; });
crossClient.changeClient('drawing', 'B');
assert.equal(crossClient.dirtyRowIdsRef.current.size, 0, 'Do not save an incomplete client/project change');
await crossClient.changeProject('drawing', 'Other');
assert.equal(crossClientRequest.projectFolderId, 'old-folder', 'Resolve files using the original client and project');
assert.equal(crossClientRequest.targetProjectFolderId, 'other-folder');
assert.equal(crossClient.rows[0].builderId, 'b');

const crossClientFailure = harness(async () => { throw new Error('Move failed'); });
crossClientFailure.changeClient('drawing', 'B');
await crossClientFailure.changeProject('drawing', 'Other');
assert.equal(crossClientFailure.rows[0].builderId, 'a');
assert.equal(crossClientFailure.rows[0].projectId, 'old');
console.log('Drawing project move checks passed: pending, success, failure, missing directory, duplicate requests and client changes.');
