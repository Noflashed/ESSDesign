import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteScaffoldItem, deleteScaffoldRecord } from './scaffoldDeletion.js';

function fixture() {
    const calls = [];
    const services = {
        listHandovers: async (...args) => { calls.push(['list', ...args]); return []; },
        deleteTag: async (...args) => { calls.push(['tag', ...args]); },
        deleteHandover: async (...args) => { calls.push(['handover', ...args]); },
        deleteRecord: async (...args) => { calls.push(['record', ...args]); }
    };
    return { calls, services };
}

test('deletes every linked version before the parent, scoped to the selected project', async () => {
    const { calls, services } = fixture();
    await deleteScaffoldItem('b', 'p', {
        registerRecord: { id: 'r', drawingDocumentId: 'drawing-retained' },
        tags: [{ id: 't1' }, { id: 't2' }], handovers: [{ id: 'h1' }, { id: 'h2' }]
    }, services);
    assert.deepEqual(calls, [
        ['tag', 'b', 'p', 't1'], ['tag', 'b', 'p', 't2'],
        ['handover', 'b', 'p', 'h1'], ['handover', 'b', 'p', 'h2'],
        ['list', 'b', 'p'], ['record', 'b', 'p', 'r']
    ]);
});

test('retains the parent on partial failure and waits for the other linked deletions', async () => {
    const { calls, services } = fixture();
    services.deleteTag = async () => { throw new Error('Tag permission denied'); };
    await assert.rejects(deleteScaffoldItem('b', 'p', {
        registerRecord: { id: 'r' }, tags: [{ id: 't' }], handovers: [{ id: 'h' }]
    }, services), /Deletion incomplete.*Tag permission denied/);
    assert.deepEqual(calls, [['handover', 'b', 'p', 'h']]);
});

test('rechecks explicit links including whitespace and excludes unrelated/name-only handovers', async () => {
    const { calls, services } = fixture();
    services.listHandovers = async () => [
        { id: 'new-link', scaffoldRegisterId: ' r ' },
        { id: 'other', scaffoldRegisterId: 'other' },
        { id: 'legacy', formReferenceName: 'r' },
        { id: 'empty', scaffoldRegisterId: '' }
    ];
    await deleteScaffoldRecord('b', 'p', 'r', services);
    assert.deepEqual(calls, [['handover', 'b', 'p', 'new-link'], ['record', 'b', 'p', 'r']]);
});

test('keeps the parent when a newly found linked handover fails', async () => {
    const { calls, services } = fixture();
    services.listHandovers = async () => [{ id: 'h', scaffoldRegisterId: 'r' }];
    services.deleteHandover = async () => { throw new Error('offline'); };
    await assert.rejects(deleteScaffoldRecord('b', 'p', 'r', services), /Could not delete 1 linked handover form/);
    assert.deepEqual(calls, []);
});

test('supports legacy tag-only and handover-only register rows', async () => {
    const { calls, services } = fixture();
    await deleteScaffoldItem('b', 'p', { tags: [{ id: 't' }], handovers: [] }, services);
    await deleteScaffoldItem('b', 'p', { tags: [], handovers: [{ id: 'h' }] }, services);
    assert.deepEqual(calls, [['tag', 'b', 'p', 't'], ['handover', 'b', 'p', 'h']]);
});

test('surfaces parent deletion failures and does not delete outside the supplied scope', async () => {
    const { services } = fixture();
    services.deleteRecord = async () => { throw new Error('network unavailable'); };
    await assert.rejects(deleteScaffoldItem('b', 'p', { registerRecord: { id: 'r' } }, services),
        /Scaffold Register entry \(network unavailable\)/);
    await assert.rejects(deleteScaffoldItem('', 'p', {}, services), /Select a scaffold/);
});
