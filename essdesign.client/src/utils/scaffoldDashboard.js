import { makeRegisterItems, resolveScaffoldLifecycle } from './scaffoldRegister.js';

export const STATUS_LABELS = { active: 'Active', 'awaiting-qr': 'Awaiting QR', dismantled: 'Dismantled' };
export const AGE_BUCKETS = [
    { id: '0-7', label: 'Under 7 days', min: 0, max: 7 },
    { id: '7-30', label: '7–29 days', min: 7, max: 30 },
    { id: '30-60', label: '30–59 days', min: 30, max: 60 },
    { id: '60-90', label: '60–89 days', min: 60, max: 90 },
    { id: '90+', label: '90+ days', min: 90, max: Infinity }
];
export const siteKey = (builderId, projectId) => JSON.stringify([builderId || '', projectId || '']);
export function elapsedDays(row, now) {
    if (row.lifecycle.status === 'dismantled' && !row.lifecycle.stoppedAt) return null;
    const start = Date.parse(row.lifecycle.startedAt);
    const end = row.lifecycle.stoppedAt ? Date.parse(row.lifecycle.stoppedAt) : now;
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 86400000) : null;
}
export function ageBucket(row, now) {
    if (row.lifecycle.status !== 'active') return '';
    const days = elapsedDays(row, now);
    return days === null ? 'unknown' : AGE_BUCKETS.find(bucket => days >= bucket.min && days < bucket.max)?.id || '';
}
export function buildDashboardData({ builders, records, tags, handovers, labour, labels }) {
    const sites = new Map();
    const ensureSite = (builderId, projectId, builderName, projectName) => {
        const key = siteKey(builderId, projectId);
        if (!sites.has(key)) sites.set(key, { key, builderId, projectId,
            builderName: builderName || 'Unlisted builder', projectName: projectName || 'Unlisted site',
            records: [], tags: [], handovers: [], labour: [] });
        return sites.get(key);
    };
    builders.forEach(builder => (builder.projects || []).forEach(project => ensureSite(builder.id, project.id, builder.name, project.name)));
    for (const [kind, forms] of Object.entries({ records, tags, handovers, labour })) {
        forms.filter(form => !form.isDeleted).forEach(form => {
            ensureSite(form.builderId, form.projectId, form.builderName, form.projectName)[kind].push(form);
        });
    }
    const qrLabels = new Map();
    labels.forEach(label => {
        const key = JSON.stringify([label.assignedBuilderId, label.assignedProjectId, label.assignedFormId]);
        const previous = qrLabels.get(key);
        if (!['assigned', 'retired'].includes(label.status)) return;
        if (!previous || (label.status === 'assigned' && previous.status !== 'assigned')
            || (label.status === previous.status && String(label.updatedAt).localeCompare(String(previous.updatedAt)) > 0)) qrLabels.set(key, label);
    });
    const rows = [];
    sites.forEach(site => {
        const enrichedTags = site.tags.map(tag => {
            const qr = qrLabels.get(JSON.stringify([site.builderId, site.projectId, tag.id]));
            return { ...tag, qrLabelAssignedAt: qr?.assignedAt || tag.qrLabelAssignedAt || '',
                qrLabelRetiredAt: qr?.retiredAt || tag.qrLabelRetiredAt || '',
                qrLabelNumber: qr?.displayNumber || tag.qrLabelNumber || '',
                qrLabelStatus: qr?.status || tag.qrLabelStatus || '', qrTargetUrl: qr?.publicUrl || tag.qrTargetUrl || '' };
        });
        makeRegisterItems(site.records, enrichedTags, site.handovers).forEach(item => {
            // Older forms may predate the scaffold register. Preserve their retired state.
            const fallback = item.tag?.status === 'retired' || item.tag?.retiredAt || item.tag?.qrLabelStatus === 'retired'
                ? { status: 'dismantled', dismantledAt: item.tag.retiredAt || item.tag.qrLabelRetiredAt } : null;
            const lifecycle = resolveScaffoldLifecycle(item.registerRecord || fallback, item.tag?.qrLabelAssignedAt);
            const drawingSources = [item.registerRecord, ...item.handovers].filter(form => form?.drawingDocumentId && ['ess', 'thirdparty'].includes(form.drawingDocumentType));
            const drawings = [...new Map(drawingSources.map(form => [JSON.stringify([form.drawingDocumentType, form.drawingDocumentId, form.drawingRevisionNumber || '']), form])).values()];
            rows.push({ ...item, id: JSON.stringify([site.key, item.id]), siteKey: site.key,
                builderId: site.builderId, projectId: site.projectId, builderName: site.builderName,
                projectName: site.projectName, lifecycle, drawings,
                missingDocuments: !drawings.length || !item.tags.length || !item.handovers.length });
        });
    });
    return { rows, sites: [...sites.values()] };
}

export function filterDashboardRows(rows, { builder = '', site = '', query = '', status = 'current', age = '', missing = false }, now) {
    const search = query.trim().toLowerCase();
    return rows.filter(row => (!builder || row.builderId === builder)
        && (!site || row.siteKey === site)
        && (!search || [row.scaffoldName, row.location, row.builderName, row.projectName,
            ...row.tags.map(tag => tag.tagNumber || tag.scaffoldNo), ...row.handovers.map(form => form.inspectionNumber),
            ...row.drawings.map(form => form.drawingNumber)].some(value => String(value || '').toLowerCase().includes(search)))
        && (status === 'all' || (status === 'current' ? row.lifecycle.status !== 'dismantled' : row.lifecycle.status === status))
        && (!age || ageBucket(row, now) === age)
        && (!missing || row.missingDocuments));
}
