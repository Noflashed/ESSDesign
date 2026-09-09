import { safetyProjectsAPI, scaffoldRegisterAPI, scaffTagsAPI, handoverCertificatesAPI, dayLabourVariationsAPI, scaffTagQrLabelsAPI } from './api';
import { buildDashboardData } from '../utils/scaffoldDashboard';

export async function loadScaffoldDashboard() {
    const sources = [
        ['builders', () => safetyProjectsAPI.getBuilders({ includeArchived: true, force: true })],
        ['records', () => scaffoldRegisterAPI.listAllRecords()],
        ['tags', () => scaffTagsAPI.listAllForms()],
        ['handovers', () => handoverCertificatesAPI.listAllForms()],
        ['labour', () => dayLabourVariationsAPI.listAllForms()],
        ['labels', () => scaffTagQrLabelsAPI.listAll()]
    ];
    const results = await Promise.allSettled(sources.map(([, load]) => load()));
    const failed = sources.filter((_, index) => results[index].status === 'rejected').map(([name]) => name);
    // Publish a complete snapshot only; partial sources would undercount accounts totals.
    if (failed.length) throw new Error(`Could not load ${failed.join(', ')}. Please retry.`);
    return buildDashboardData(Object.fromEntries(sources.map(([name], index) => [name, results[index].value])));
}
