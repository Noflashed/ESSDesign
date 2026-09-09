import test from 'node:test';
import assert from 'node:assert/strict';
import { ageBucket, buildDashboardData, elapsedDays, filterDashboardRows } from './scaffoldDashboard.js';
import { formatElapsedTime } from './scaffoldRegister.js';

const now = Date.parse('2026-09-09T00:00:00Z');
const source = () => ({ builders: [{ id: 'b1', name: 'Builder One', projects: [{ id: 's1', name: 'Site One' }, { id: 's2', name: 'Site Two' }] }], records: [], tags: [], handovers: [], labour: [], labels: [] });
const record = extra => ({ id: 'r1', builderId: 'b1', projectId: 's1', scaffoldName: 'North elevation', status: 'active', activatedAt: '2026-08-01T00:00:00Z', ...extra });

test('keeps identical scaffold names and IDs isolated by site', () => {
    const input = source();
    input.records = [record(), record({ projectId: 's2' })];
    input.tags = [{ id: 't1', builderId: 'b1', projectId: 's1', scaffoldRegisterId: 'r1' }];
    const { rows } = buildDashboardData(input);
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].id, rows[1].id);
    assert.equal(rows.find(row => row.projectId === 's1').tags.length, 1);
    assert.equal(rows.find(row => row.projectId === 's2').tags.length, 0);
});
test('matches legacy names and retains all linked documents without duplicate drawings', () => {
    const input = source();
    const drawing = { drawingDocumentId: 'd1', drawingDocumentType: 'ess', drawingRevisionNumber: 'A' };
    input.records = [record(drawing)];
    input.tags = [{ id: 't1', builderId: 'b1', projectId: 's1', scaffoldNo: 'North-Elevation' }];
    input.handovers = [{ id: 'h1', builderId: 'b1', projectId: 's1', scaffoldRegisterId: 'r1', ...drawing }, { id: 'h2', builderId: 'b1', projectId: 's1', scaffoldRegisterId: 'r1' }];
    const { rows } = buildDashboardData(input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tags.length, 1);
    assert.equal(rows[0].handovers.length, 2);
    assert.equal(rows[0].drawings.length, 1);
    assert.equal(rows[0].missingDocuments, false);
});
test('includes records outside the current registry and excludes deleted forms', () => {
    const input = source();
    input.records = [record({ projectId: 'old', projectName: 'Archived site' }), record({ id: 'deleted', isDeleted: true })];
    const { rows } = buildDashboardData(input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].projectName, 'Archived site');
});
test('QR assignments provide legacy start times and prefer assigned labels over retired ones', () => {
    const input = source();
    input.tags = [{ id: 't1', builderId: 'b1', projectId: 's1', scaffoldNo: 'Tower' }];
    input.labels = [
        { assignedBuilderId: 'b1', assignedProjectId: 's1', assignedFormId: 't1', status: 'assigned', assignedAt: '2026-09-02T00:00:00Z' },
        { assignedBuilderId: 'b1', assignedProjectId: 's1', assignedFormId: 't1', status: 'retired', assignedAt: '2026-08-01T00:00:00Z', updatedAt: '2026-09-08T00:00:00Z' }
    ];
    const { rows } = buildDashboardData(input);
    assert.equal(rows[0].lifecycle.status, 'active');
    assert.equal(elapsedDays(rows[0], now), 7);
    assert.equal(ageBucket(rows[0], now), '7-30');
});
test('dismantled scaffold timers stop and do not enter active age buckets', () => {
    const input = source();
    input.records = [record({ status: 'dismantled', dismantledAt: '2026-08-11T00:00:00Z' })];
    const { rows } = buildDashboardData(input);
    assert.equal(elapsedDays(rows[0], now), 10);
    assert.equal(ageBucket(rows[0], now), '');
    assert.equal(formatElapsedTime(rows[0].lifecycle.startedAt, rows[0].lifecycle.stoppedAt, now), '10d 00h 00m');
    assert.equal(filterDashboardRows(rows, { status: 'current' }, now).length, 0);
});
test('retired legacy tags without an end date never accumulate elapsed days', () => {
    const input = source();
    input.tags = [{ id: 't1', builderId: 'b1', projectId: 's1', status: 'retired', qrLabelAssignedAt: '2026-08-01T00:00:00Z' }];
    const { rows } = buildDashboardData(input);
    assert.equal(rows[0].lifecycle.status, 'dismantled');
    assert.equal(elapsedDays(rows[0], now), null);
});
test('active scaffolds without timestamps remain unknown instead of becoming zero days', () => {
    const input = source(); input.records = [record({ activatedAt: '' })];
    const { rows } = buildDashboardData(input);
    assert.equal(elapsedDays(rows[0], now), null);
    assert.equal(ageBucket(rows[0], now), 'unknown');
});
test('chart age boundaries and combined builder, search and status filters agree', () => {
    const input = source(); input.records = [record(), record({ id: 'r2', scaffoldName: 'South tower', activatedAt: '2026-09-08T00:00:00Z' })];
    const { rows } = buildDashboardData(input);
    assert.equal(filterDashboardRows(rows, { builder: 'b1', status: 'active', age: '30-60', query: 'north', missing: true }, now).length, 1);
    assert.equal(filterDashboardRows(rows, { builder: 'b2', status: 'all' }, now).length, 0);
    assert.equal(filterDashboardRows(rows, { status: 'active', age: '0-7' }, now)[0].scaffoldName, 'South tower');
});
test('site labour forms are kept once per site, not multiplied by scaffold count', () => {
    const input = source(); input.records = [record(), record({ id: 'r2' })];
    input.labour = [{ id: 'l1', builderId: 'b1', projectId: 's1', handoverDocumentId: 'h1' }];
    const data = buildDashboardData(input);
    assert.equal(data.rows.length, 2);
    assert.equal(data.sites.reduce((count, site) => count + site.labour.length, 0), 1);
});
