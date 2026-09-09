function normalizedLinkValue(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function valuesMatch(left, right) {
    const normalizedLeft = normalizedLinkValue(left);
    const normalizedRight = normalizedLinkValue(right);
    return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

function handoverMatchesTag(handover, tag) {
    return handover.id === tag.handoverFormId
        || handover.scaffTagFormId === tag.id
        || valuesMatch(handover.scaffTagId, tag.id)
        || valuesMatch(handover.scaffTagId, tag.tagNumber)
        || valuesMatch(handover.scaffTagId, tag.qrLabelNumber);
}

function newest(items) {
    return [...items].sort((left, right) => (
        new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    ))[0] || null;
}

// Keep this matching behavior aligned with the mobile Scaffold Register. Explicit
// register IDs win, while name matching preserves forms created before IDs existed.
export function makeRegisterItems(registerEntries, tags, handovers) {
    const matchedTagIds = new Set();
    const matchedHandoverIds = new Set();
    const records = registerEntries.map(registerRecord => {
        const registerName = normalizedLinkValue(registerRecord.scaffoldName);
        const linkedTags = tags.filter(tag => (
            tag.scaffoldRegisterId === registerRecord.id
            || (!tag.scaffoldRegisterId && normalizedLinkValue(tag.scaffoldNo) === registerName)
        ));
        linkedTags.forEach(tag => matchedTagIds.add(tag.id));
        const linkedHandovers = handovers.filter(handover => (
            handover.scaffoldRegisterId === registerRecord.id
            || (!handover.scaffoldRegisterId && normalizedLinkValue(handover.formReferenceName) === registerName)
            || linkedTags.some(tag => handoverMatchesTag(handover, tag))
        ));
        linkedHandovers.forEach(handover => matchedHandoverIds.add(handover.id));
        const tag = newest(linkedTags);
        const handover = newest(linkedHandovers);

        return {
            id: `register:${registerRecord.id}`,
            scaffoldName: registerRecord.scaffoldName,
            location: registerRecord.location,
            registerRecord,
            tag,
            tags: linkedTags,
            handover,
            handovers: linkedHandovers,
            updatedAt: [registerRecord.updatedAt, tag?.updatedAt || '', handover?.updatedAt || '']
                .sort()
                .reverse()[0]
        };
    });

    tags.forEach(tag => {
        if (matchedTagIds.has(tag.id)) return;
        const linkedHandovers = handovers.filter(handover => handoverMatchesTag(handover, tag));
        linkedHandovers.forEach(handover => matchedHandoverIds.add(handover.id));
        const handover = newest(linkedHandovers);
        records.push({
            id: `tag:${tag.id}`,
            scaffoldName: tag.scaffoldNo || handover?.formReferenceName || 'Untitled Scaffold',
            location: tag.jobLocation || handover?.sectionLocation || '',
            registerRecord: null,
            tag,
            tags: [tag],
            handover,
            handovers: linkedHandovers,
            updatedAt: [tag.updatedAt, handover?.updatedAt || ''].sort().reverse()[0]
        });
    });

    handovers.forEach(handover => {
        if (matchedHandoverIds.has(handover.id)) return;
        records.push({
            id: `handover:${handover.id}`,
            scaffoldName: handover.formReferenceName || 'Untitled Scaffold',
            location: handover.sectionLocation || '',
            registerRecord: null,
            tag: null,
            tags: [],
            handover,
            handovers: [handover],
            updatedAt: handover.updatedAt
        });
    });

    return records.sort((left, right) => (
        new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    ));
}

function validTimestamp(value) {
    const trimmed = String(value || '').trim();
    return trimmed && Number.isFinite(Date.parse(trimmed)) ? trimmed : '';
}

export function resolveScaffoldLifecycle(record, qrAssignedAt) {
    const startedAt = validTimestamp(record?.activatedAt) || validTimestamp(qrAssignedAt);
    const stoppedAt = validTimestamp(record?.dismantledAt);
    if (record?.status === 'dismantled' || stoppedAt) {
        return { status: 'dismantled', startedAt, stoppedAt };
    }
    if (record?.status === 'active' || startedAt) {
        return { status: 'active', startedAt, stoppedAt: '' };
    }
    return { status: 'awaiting-qr', startedAt: '', stoppedAt: '' };
}

export function formatElapsedTime(startedAt, stoppedAt, nowMs) {
    const startMs = Date.parse(startedAt);
    if (!Number.isFinite(startMs)) return 'Not started';
    const parsedStopMs = Date.parse(stoppedAt);
    const endMs = Number.isFinite(parsedStopMs) ? parsedStopMs : nowMs;
    const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
    const days = Math.floor(totalMinutes / 1_440);
    const hours = Math.floor((totalMinutes % 1_440) / 60);
    const minutes = totalMinutes % 60;
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}
