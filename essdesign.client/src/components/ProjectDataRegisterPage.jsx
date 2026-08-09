import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ExternalLink, FileText, Search } from 'lucide-react';
import {
    dayLabourVariationsAPI,
    handoverCertificatesAPI,
    scaffTagsAPI,
    safetyProjectsAPI
} from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';
import './ProjectDataRegisterPage.css';

const REGISTER_CONFIG = {
    handovers: {
        title: 'Handover Register',
        noun: 'handover certificates',
        searchPlaceholder: 'Search handovers...',
        api: handoverCertificatesAPI,
        defaultSort: 'inspectionDate',
        columns: [
            { key: 'builder', label: 'CLIENT' },
            { key: 'project', label: 'PROJECT' },
            { key: 'title', label: 'SCAFFOLD / FORM' },
            { key: 'reference', label: 'CERTIFICATE NO.' },
            { key: 'inspectionDate', label: 'INSPECTION DATE' },
            { key: 'representative', label: 'INSPECTED BY' }
        ]
    },
    'day-labour': {
        title: 'Day Labour Register',
        noun: 'day labour forms',
        searchPlaceholder: 'Search day labour forms...',
        api: dayLabourVariationsAPI,
        defaultSort: 'formDate',
        columns: [
            { key: 'builder', label: 'CLIENT' },
            { key: 'project', label: 'PROJECT' },
            { key: 'title', label: 'FORM REFERENCE' },
            { key: 'reference', label: 'VARIATION NO.' },
            { key: 'formDate', label: 'FORM DATE' },
            { key: 'requestedBy', label: 'REQUESTED BY' },
            { key: 'handoverNumber', label: 'HANDOVER NO.' }
        ]
    },
    'scaff-tags': {
        title: 'Scaff-Tag Register',
        noun: 'scaff-tags',
        searchPlaceholder: 'Search scaff-tags...',
        api: scaffTagsAPI,
        defaultSort: 'inspectionDate',
        columns: [
            { key: 'builder', label: 'CLIENT' },
            { key: 'project', label: 'PROJECT' },
            { key: 'reference', label: 'SCAFFOLD NO.' },
            { key: 'location', label: 'LOCATION' },
            { key: 'inspectionDate', label: 'LAST INSPECTION' },
            { key: 'representative', label: 'INSPECTED BY' },
            { key: 'status', label: 'STATUS' }
        ]
    }
};

const parseDate = value => {
    const text = String(value || '').trim();
    if (!text) return null;

    const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
    if (localMatch) {
        const [, day, month, yearText, hourText = '0', minuteText = '0', period = ''] = localMatch;
        const year = Number(yearText) < 100 ? 2000 + Number(yearText) : Number(yearText);
        let hour = Number(hourText);
        if (period.toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
        const candidate = new Date(year, Number(month) - 1, Number(day), hour, Number(minuteText));
        return Number.isNaN(candidate.getTime()) ? null : candidate;
    }

    const candidate = new Date(text);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const formatDate = (value, includeTime = false) => {
    const date = parseDate(value);
    if (!date) return '-';
    return new Intl.DateTimeFormat('en-AU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {})
    }).format(date);
};

const getScaffTagStatus = form => {
    const latestInspection = parseDate(form.latestInspectionDate);
    if (!latestInspection) return 'Draft';
    const expiry = parseDate(form.expiresAt) || new Date(latestInspection);
    if (!form.expiresAt) expiry.setMonth(expiry.getMonth() + 3);
    return expiry && expiry.getTime() < Date.now() ? 'Expired' : 'Current';
};

const latestScaffTagInspection = form => (
    [...(Array.isArray(form.inspectionRecords) ? form.inspectionRecords : [])]
        .filter(record => parseDate(record?.date))
        .sort((left, right) => parseDate(right.date).getTime() - parseDate(left.date).getTime())[0]
    || null
);

const buildProjectLookup = builders => {
    const lookup = new Map();
    builders.forEach(builder => {
        (builder.projects || []).forEach(project => {
            lookup.set(`${builder.id}:${project.id}`, { builder, project });
        });
    });
    return lookup;
};

const resolveProjectNames = (form, projectLookup) => {
    const match = projectLookup.get(`${form.builderId}:${form.projectId}`);
    return {
        builder: match?.builder?.name || form.builderName || 'Unknown client',
        project: match?.project?.name || form.projectName || form.clientProjectName || 'Unknown project'
    };
};

const mapRows = (registerType, forms, projectLookup) => forms.map(form => {
    const names = resolveProjectNames(form, projectLookup);
    if (registerType === 'handovers') {
        return {
            id: `${form.builderId}:${form.projectId}:${form.id}`,
            builderId: form.builderId,
            projectId: form.projectId,
            form,
            ...names,
            title: form.formReferenceName || 'Untitled handover',
            reference: form.inspectionNumber || '-',
            inspectionDate: formatDate(form.inspectionDateTime || form.updatedAt, true),
            inspectionDateSort: parseDate(form.inspectionDateTime || form.updatedAt)?.getTime() || 0,
            representative: form.essRepresentativeName || 'Not recorded'
        };
    }
    if (registerType === 'day-labour') {
        return {
            id: `${form.builderId}:${form.projectId}:${form.id}`,
            builderId: form.builderId,
            projectId: form.projectId,
            form,
            ...names,
            title: form.formReferenceName || 'Untitled day labour form',
            reference: form.variationNumber || '-',
            formDate: formatDate(form.date || form.updatedAt),
            formDateSort: parseDate(form.date || form.updatedAt)?.getTime() || 0,
            requestedBy: form.requestedBy || 'Not recorded',
            handoverNumber: form.handoverDocumentNumber || '-'
        };
    }
    const latestInspection = latestScaffTagInspection(form);
    const latestInspectionDate = form.latestInspectionDate || latestInspection?.date || form.updatedAt;
    return {
        id: `${form.builderId}:${form.projectId}:${form.id}`,
        builderId: form.builderId,
        projectId: form.projectId,
        form,
        ...names,
        reference: form.scaffoldNo || form.tagNumber || '-',
        location: form.jobLocation || '-',
        inspectionDate: formatDate(latestInspectionDate, true),
        inspectionDateSort: parseDate(latestInspectionDate)?.getTime() || 0,
        representative: latestInspection?.competentPerson || form.erectedBy || 'Not recorded',
        status: getScaffTagStatus({ ...form, latestInspectionDate })
    };
});

const sortValue = (row, key) => {
    if (key === 'inspectionDate') return row.inspectionDateSort || 0;
    if (key === 'formDate') return row.formDateSort || 0;
    const value = row[key];
    const numericText = String(value || '').replace(/\D/g, '');
    const numericValue = Number(numericText);
    if ((key === 'reference' || key === 'handoverNumber') && numericText && Number.isFinite(numericValue)) {
        return numericValue;
    }
    return String(value || '').trim().toLowerCase();
};

function StatusBadge({ value }) {
    return <span className={`project-register-status ${String(value || '').toLowerCase()}`}>{value || 'Draft'}</span>;
}

export default function ProjectDataRegisterPage({ registerType, onBack }) {
    const config = REGISTER_CONFIG[registerType] || REGISTER_CONFIG.handovers;
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [sortField, setSortField] = useState(config.defaultSort);
    const [sortDirection, setSortDirection] = useState('desc');
    const [openingId, setOpeningId] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        Promise.all([
            safetyProjectsAPI.getBuilders({ includeArchived: true, force: true }),
            config.api.listAllForms()
        ]).then(([builders, forms]) => {
            if (!active) return;
            setRows(mapRows(registerType, forms, buildProjectLookup(builders)));
        }).catch(loadError => {
            if (!active) return;
            setRows([]);
            setError(loadError?.message || `Could not load the ${config.title.toLowerCase()}.`);
        }).finally(() => {
            if (active) setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [config, registerType]);

    useEffect(() => {
        setSortField(config.defaultSort);
        setSortDirection('desc');
        setQuery('');
    }, [config]);

    const filteredRows = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const next = normalizedQuery
            ? rows.filter(row => config.columns.some(column => String(row[column.key] || '').toLowerCase().includes(normalizedQuery)))
            : [...rows];
        const direction = sortDirection === 'asc' ? 1 : -1;
        return next.sort((left, right) => {
            const leftValue = sortValue(left, sortField);
            const rightValue = sortValue(right, sortField);
            if (leftValue < rightValue) return -1 * direction;
            if (leftValue > rightValue) return 1 * direction;
            return left.id.localeCompare(right.id);
        });
    }, [config.columns, query, rows, sortDirection, sortField]);

    const changeSort = key => {
        if (sortField === key) {
            setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
            return;
        }
        setSortField(key);
        setSortDirection(key.toLowerCase().includes('date') ? 'desc' : 'asc');
    };

    const openPdf = async row => {
        if (openingId) return;
        const popup = window.open('about:blank', '_blank');
        if (popup) {
            popup.opener = null;
            popup.document.title = 'Loading PDF...';
        }
        setOpeningId(row.id);
        setError('');
        try {
            const url = await config.api.getPdfUrl(row.form);
            if (!url) throw new Error('The PDF is unavailable.');
            if (popup) {
                popup.location.replace(url);
            } else {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        } catch (openError) {
            popup?.close();
            setError(openError?.message || 'Could not open the PDF.');
        } finally {
            setOpeningId('');
        }
    };

    return (
        <main className="project-data-register-page">
            <div className="project-data-register-toolbar">
                <button type="button" className="project-register-icon-button project-register-back-button" onClick={onBack} title="Back to Project Data" aria-label="Back to Project Data">
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <div className="project-data-register-heading">
                    <h1>{config.title}</h1>
                </div>
                <label className="project-register-search">
                    <Search size={17} />
                    <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={config.searchPlaceholder} />
                </label>
            </div>

            {error ? <div className="project-register-error" role="alert">{error}</div> : null}

            <section className={`project-data-register-table-wrap${loading ? ' is-loading' : ''}`}>
                {loading ? (
                    <div className="project-register-loading page-loading-brandmark">
                        <LoadingBrandmark label={`Loading ${config.title.toLowerCase()}`} />
                    </div>
                ) : (
                    <table className={`project-data-register-table type-${registerType}`}>
                        <thead>
                            <tr>
                                {config.columns.map(column => (
                                    <th key={column.key}>
                                        <button type="button" className={`project-register-column-sort${sortField === column.key ? ' active' : ''}`} onClick={() => changeSort(column.key)}>
                                            <span>{column.label}</span>
                                            <ChevronDown className={sortField === column.key && sortDirection === 'asc' ? 'ascending' : ''} aria-hidden="true" />
                                        </button>
                                    </th>
                                ))}
                                <th className="project-register-open-column" aria-label="Open PDF" />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map(row => (
                                <tr key={row.id} onDoubleClick={() => openPdf(row)}>
                                    {config.columns.map(column => (
                                        <td key={column.key} title={String(row[column.key] || '')}>
                                            {column.key === 'status'
                                                ? <StatusBadge value={row.status} />
                                                : row[column.key] || '-'}
                                        </td>
                                    ))}
                                    <td className="project-register-open-column">
                                        <button type="button" className="project-register-open-button" disabled={Boolean(openingId)} onClick={() => openPdf(row)} title="Open PDF" aria-label={`Open PDF for ${row.title || row.reference}`}>
                                            {openingId === row.id ? <span className="project-register-button-spinner" /> : <><FileText size={15} /><ExternalLink size={12} /></>}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && filteredRows.length === 0 ? (
                    <div className="project-register-empty">
                        <FileText size={28} />
                        <span>{query ? `No ${config.noun} match your search.` : `No ${config.noun} have been created yet.`}</span>
                    </div>
                ) : null}
            </section>
        </main>
    );
}
