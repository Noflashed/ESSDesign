// Matches ESS-Mobile-App ScaffoldRegisterScreen.deleteScaffold and
// supabaseScaffoldRegister.deleteScaffoldRegisterRecord (81218f4).
// Keep the parent when any linked deletion fails so the operation can be retried.
export async function deleteScaffoldRecord(builderId, projectId, recordId, services) {
    const handovers = await services.listHandovers(builderId, projectId);
    const linked = handovers.filter(form =>
        String(form.scaffoldRegisterId || '').trim() === recordId.trim());
    const results = await Promise.allSettled(linked.map(form =>
        services.deleteHandover(builderId, projectId, form.id)));
    const failed = results.filter(result => result.status === 'rejected').length;
    if (failed) {
        throw new Error(`Could not delete ${failed} linked handover ${failed === 1 ? 'form' : 'forms'}.`);
    }
    await services.deleteRecord(builderId, projectId, recordId);
}

export async function deleteScaffoldItem(builderId, projectId, item, services) {
    if (!builderId || !projectId || !item) throw new Error('Select a scaffold and project to delete.');
    const operations = [
        ...(item.tags || []).map(tag => ({
            label: 'Scaff-Tag',
            run: () => services.deleteTag(builderId, projectId, tag.id)
        })),
        ...(item.handovers || []).map(form => ({
            label: `Handover ${form.inspectionNumber || form.formReferenceName || form.id}`,
            run: () => services.deleteHandover(builderId, projectId, form.id)
        }))
    ];
    const results = await Promise.allSettled(operations.map(operation => operation.run()));
    const failures = results.flatMap((result, index) => result.status === 'rejected'
        ? [`${operations[index].label}${result.reason?.message ? ` (${result.reason.message})` : ''}`]
        : []);
    if (!failures.length && item.registerRecord) {
        try {
            // Re-read explicit handover links before deleting the parent, like iOS.
            await deleteScaffoldRecord(builderId, projectId, item.registerRecord.id, services);
        } catch (error) {
            failures.push(`Scaffold Register entry${error?.message ? ` (${error.message})` : ''}`);
        }
    }
    if (failures.length) {
        throw new Error(`Deletion incomplete. The following could not be deleted: ${failures.join(', ')}. Refresh and retry. The design drawing remains untouched.`);
    }
}
