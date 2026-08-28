import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileText, Printer, QrCode, Search, X } from 'lucide-react';
import {
    dayLabourVariationsAPI,
    handoverCertificatesAPI,
    scaffTagQrLabelsAPI,
    scaffTagsAPI,
    safetyProjectsAPI
} from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';
import { downloadScaffTagLabelPdf } from '../services/scaffTagLabelPdf';
import './ProjectDataRegisterPage.css';

const REGISTER_CONFIG = {
    handovers: {
        title: 'Handover Register',
        noun: 'handover certificates',
        searchPlaceholder: 'Search handovers...',
        api: handoverCertificatesAPI,
        defaultSort: 'inspectionDate',
        linkKey: 'title',
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
        linkKey: 'title',
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
        linkKey: 'reference',
        columns: [
            { key: 'builder', label: 'CLIENT' },
            { key: 'project', label: 'PROJECT' },
            { key: 'reference', label: 'SCAFFOLD NO.' },
            { key: 'location', label: 'LOCATION' },
            { key: 'inspectionDate', label: 'LAST INSPECTION' },
            { key: 'representative', label: 'INSPECTED BY' },
            { key: 'qrLabel', label: 'QR LABEL' },
            { key: 'status', label: 'STATUS' }
        ]
    },
    'qr-labels': {
        title: 'QR Code Register',
        noun: 'QR codes',
        searchPlaceholder: 'Search QR labels...',
        api: scaffTagsAPI,
        defaultSort: 'inspectionDate',
        linkKey: 'reference',
        columns: []
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

const mapRows = (registerType, forms, projectLookup, qrLabels = []) => forms.map(form => {
    const names = resolveProjectNames(form, projectLookup);
    const deletion = {
        deleted: Boolean(form.isDeleted),
        deletedAt: form.deletedAt || null
    };
    if (registerType === 'handovers') {
        return {
            id: `${form.builderId}:${form.projectId}:${form.id}:${form.deletedAt || 'active'}`,
            builderId: form.builderId,
            projectId: form.projectId,
            form,
            ...names,
            ...deletion,
            title: form.formReferenceName || 'Untitled handover',
            reference: form.inspectionNumber || '-',
            inspectionDate: formatDate(form.inspectionDateTime || form.updatedAt, true),
            inspectionDateSort: parseDate(form.inspectionDateTime || form.updatedAt)?.getTime() || 0,
            representative: form.essRepresentativeName || 'Not recorded'
        };
    }
    if (registerType === 'day-labour') {
        return {
            id: `${form.builderId}:${form.projectId}:${form.id}:${form.deletedAt || 'active'}`,
            builderId: form.builderId,
            projectId: form.projectId,
            form,
            ...names,
            ...deletion,
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
    const qrLabel = qrLabels.find(label => (
        label.status === 'assigned'
        && label.assignedBuilderId === form.builderId
        && label.assignedProjectId === form.projectId
        && label.assignedFormId === form.id
    ));
    return {
        id: `${form.builderId}:${form.projectId}:${form.id}:${form.deletedAt || 'active'}`,
        builderId: form.builderId,
        projectId: form.projectId,
        form,
        ...names,
        ...deletion,
        reference: form.scaffoldNo || form.tagNumber || '-',
        location: form.jobLocation || '-',
        inspectionDate: formatDate(latestInspectionDate, true),
        inspectionDateSort: parseDate(latestInspectionDate)?.getTime() || 0,
        representative: latestInspection?.competentPerson || form.erectedBy || 'Not recorded',
        qrLabel: qrLabel?.displayNumber || 'Unassigned',
        status: form.isDeleted ? 'Deleted' : getScaffTagStatus({ ...form, latestInspectionDate })
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

export default function ProjectDataRegisterPage({ registerType }) {
    const config = REGISTER_CONFIG[registerType] || REGISTER_CONFIG.handovers;
    const showingQrRegister = registerType === 'qr-labels';
    const usesScaffTagData = registerType === 'scaff-tags' || showingQrRegister;
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [sortField, setSortField] = useState(config.defaultSort);
    const [sortDirection, setSortDirection] = useState('desc');
    const [openingId, setOpeningId] = useState('');
    const [showDeleted, setShowDeleted] = useState(false);
    const [filterMenu, setFilterMenu] = useState('');
    const [qrLabels, setQrLabels] = useState([]);
    const [showQrGenerator, setShowQrGenerator] = useState(false);
    const [qrQuantity, setQrQuantity] = useState('10');
    const [qrCompany, setQrCompany] = useState('ess');
    const [generatingQr, setGeneratingQr] = useState(false);
    const [printingQr, setPrintingQr] = useState(false);
    const [excludedFilters, setExcludedFilters] = useState({
        builder: new Set(),
        project: new Set()
    });

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        Promise.all([
            safetyProjectsAPI.getBuilders({ includeArchived: true, force: true }),
            config.api.listAllForms({ includeDeleted: true }),
            usesScaffTagData ? scaffTagQrLabelsAPI.list() : Promise.resolve([])
        ]).then(([builders, forms, labels]) => {
            if (!active) return;
            setQrLabels(labels);
            setRows(mapRows(registerType, forms, buildProjectLookup(builders), labels));
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
    }, [config, registerType, usesScaffTagData]);

    useEffect(() => {
        setSortField(config.defaultSort);
        setSortDirection('desc');
        setQuery('');
        setShowDeleted(false);
        setFilterMenu('');
        setExcludedFilters({ builder: new Set(), project: new Set() });
    }, [config]);

    useEffect(() => {
        if (!filterMenu) return undefined;

        const closeFilterMenu = event => {
            if (!event.target.closest?.('.project-register-header-filter')) {
                setFilterMenu('');
            }
        };
        const closeFilterMenuWithKeyboard = event => {
            if (event.key === 'Escape') setFilterMenu('');
        };
        document.addEventListener('pointerdown', closeFilterMenu);
        document.addEventListener('keydown', closeFilterMenuWithKeyboard);
        return () => {
            document.removeEventListener('pointerdown', closeFilterMenu);
            document.removeEventListener('keydown', closeFilterMenuWithKeyboard);
        };
    }, [filterMenu]);

    const filterOptions = useMemo(() => ({
        builder: [...new Set(rows.map(row => row.builder).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
        project: [...new Set(rows.map(row => row.project).filter(Boolean))].sort((left, right) => left.localeCompare(right))
    }), [rows]);

    const filteredRows = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const next = rows.filter(row => (
            (showDeleted || !row.deleted)
            && !excludedFilters.builder.has(row.builder)
            && !excludedFilters.project.has(row.project)
            && (!normalizedQuery || config.columns.some(column => String(row[column.key] || '').toLowerCase().includes(normalizedQuery)))
        ));
        const direction = sortDirection === 'asc' ? 1 : -1;
        return next.sort((left, right) => {
            const leftValue = sortValue(left, sortField);
            const rightValue = sortValue(right, sortField);
            if (leftValue < rightValue) return -1 * direction;
            if (leftValue > rightValue) return 1 * direction;
            return left.id.localeCompare(right.id);
        });
    }, [config.columns, excludedFilters, query, rows, showDeleted, sortDirection, sortField]);

    const qrRegisterRows = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return qrLabels.map(label => {
            const assignedRow = rows.find(row => (
                row.builderId === label.assignedBuilderId
                && row.projectId === label.assignedProjectId
                && row.form?.id === label.assignedFormId
            ));
            const values = [
                label.displayNumber,
                label.companyEntityId === 'maloo' ? 'Maloo Access Group' : 'Erect Safe Scaffolding',
                label.status,
                assignedRow?.reference,
                assignedRow?.builder,
                assignedRow?.project
            ];
            return {
                label,
                assignedRow,
                searchable: values.filter(Boolean).join(' ').toLowerCase()
            };
        }).filter(item => !normalizedQuery || item.searchable.includes(normalizedQuery));
    }, [qrLabels, query, rows]);

    const toggleFilterValue = (key, value) => {
        setExcludedFilters(current => {
            const nextValues = new Set(current[key]);
            if (nextValues.has(value)) {
                nextValues.delete(value);
            } else {
                nextValues.add(value);
            }
            return { ...current, [key]: nextValues };
        });
    };

    const setAllFilterValues = (key, selected) => {
        setExcludedFilters(current => ({
            ...current,
            [key]: selected ? new Set() : new Set(filterOptions[key])
        }));
    };

    const changeSort = key => {
        setFilterMenu('');
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

    const printQrLabels = async labels => {
        if (!labels.length || printingQr) return;
        setPrintingQr(true);
        setError('');
        try {
            await downloadScaffTagLabelPdf([...labels].sort((left, right) => left.labelNumber - right.labelNumber));
        } catch (printError) {
            setError(printError?.message || 'Could not create the QR label PDF.');
        } finally {
            setPrintingQr(false);
        }
    };

    const generateQrLabels = async event => {
        event.preventDefault();
        const quantity = Number(qrQuantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
            setError('Choose a whole number between 1 and 500.');
            return;
        }
        setGeneratingQr(true);
        setError('');
        try {
            const created = await scaffTagQrLabelsAPI.generate(quantity, qrCompany);
            setQrLabels(current => [...created, ...current].sort((left, right) => right.labelNumber - left.labelNumber));
            setShowQrGenerator(false);
            await printQrLabels(created);
        } catch (generateError) {
            setError(generateError?.message || 'Could not generate the QR labels.');
        } finally {
            setGeneratingQr(false);
        }
    };

    const qrStatusText = label => {
        if (label.status === 'unassigned') return 'Ready to link';
        if (label.status === 'retired') return 'Retired';
        const assignedRow = rows.find(row => (
            row.builderId === label.assignedBuilderId
            && row.projectId === label.assignedProjectId
            && row.form?.id === label.assignedFormId
        ));
        return assignedRow ? `Linked to ${assignedRow.reference}` : 'Assigned';
    };

    const unassignedQrLabels = qrLabels.filter(label => label.status === 'unassigned');

    return (
        <main className="project-data-register-page">
            <div className="project-data-register-toolbar">
                <label className="project-register-search">
                    <Search size={18} />
                    <input
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder={showingQrRegister ? 'Search QR labels...' : config.searchPlaceholder}
                    />
                </label>
                <span className="project-register-toolbar-spacer" />
                {showingQrRegister ? (
                    <>
                        {unassignedQrLabels.length ? (
                            <button type="button" className="project-register-secondary-button" disabled={printingQr} onClick={() => printQrLabels(unassignedQrLabels)}>
                                <Printer size={16} />
                                <span>{printingQr ? 'Preparing…' : 'Print ready labels'}</span>
                            </button>
                        ) : null}
                        <button type="button" className="project-register-primary-button" onClick={() => setShowQrGenerator(true)}>
                            <QrCode size={17} />
                            <span>Generate QR labels</span>
                        </button>
                    </>
                ) : null}
                {!showingQrRegister ? (
                    <label className="project-register-deleted-filter">
                        <input type="checkbox" checked={showDeleted} onChange={event => setShowDeleted(event.target.checked)} />
                        <span>Show deleted</span>
                    </label>
                ) : null}
            </div>

            {error ? <div className="project-register-error" role="alert">{error}</div> : null}

            {showingQrRegister ? (
                <section className={`project-data-register-table-wrap project-qr-register-table-wrap${loading ? ' is-loading' : ''}`}>
                    {loading ? (
                        <div className="project-register-loading page-loading-brandmark"><LoadingBrandmark label="Loading QR code register" /></div>
                    ) : (
                        <>
                            <div className="project-qr-register-summary-bar">
                                <span><strong>{unassignedQrLabels.length}</strong> Ready to link</span>
                                <span><strong>{qrLabels.filter(label => label.status === 'assigned').length}</strong> Assigned</span>
                                <span><strong>{qrLabels.filter(label => label.status === 'retired').length}</strong> Retired</span>
                            </div>
                            <div className="project-qr-register-scroll-region">
                                <table className="project-qr-register-table">
                                    <thead><tr><th>LABEL</th><th>COMPANY</th><th>ASSIGNED SCAFF-TAG</th><th>CLIENT</th><th>PROJECT</th><th>GENERATED</th><th>STATUS</th><th /></tr></thead>
                                    <tbody>
                                        {qrRegisterRows.map(({ label, assignedRow }) => (
                                            <tr key={label.id} className={label.status === 'retired' ? 'is-retired' : undefined}>
                                                <td><strong className="project-qr-register-label-number">{label.displayNumber}</strong></td>
                                                <td>{label.companyEntityId === 'maloo' ? 'Maloo Access Group' : 'Erect Safe Scaffolding'}</td>
                                                <td>{assignedRow?.reference || 'Not assigned'}</td>
                                                <td>{assignedRow?.builder || '-'}</td>
                                                <td>{assignedRow?.project || '-'}</td>
                                                <td>{formatDate(label.createdAt)}</td>
                                                <td><span className={`project-qr-label-state is-${label.status}`}>{qrStatusText(label)}</span></td>
                                                <td><button type="button" className="project-qr-label-print" disabled={printingQr} onClick={() => printQrLabels([label])} aria-label={`Print ${label.displayNumber}`}><Printer size={15} /></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    {!loading && qrRegisterRows.length === 0 ? (
                        <div className="project-register-empty"><QrCode size={30} /><strong>{qrLabels.length ? 'No QR labels match your search.' : 'No QR labels have been generated yet.'}</strong>{!qrLabels.length ? <button type="button" onClick={() => setShowQrGenerator(true)}>Generate the first labels</button> : null}</div>
                    ) : null}
                </section>
            ) : (
                <section className={`project-data-register-table-wrap${loading ? ' is-loading' : ''}`}>
                    {loading ? (
                        <div className="project-register-loading page-loading-brandmark"><LoadingBrandmark label={`Loading ${config.title.toLowerCase()}`} /></div>
                    ) : (
                        <table className={`project-data-register-table type-${registerType}`}>
                            <thead>
                                <tr>
                                    {config.columns.map(column => (
                                        <th key={column.key} className={column.key === 'builder' || column.key === 'project' ? 'has-filter-menu' : undefined}>
                                            {column.key === 'builder' || column.key === 'project' ? (
                                                <div className={`project-register-header-filter${filterMenu === column.key ? ' open' : ''}${excludedFilters[column.key].size > 0 ? ' filtered' : ''}`}>
                                                    <button type="button" className="project-register-column-sort project-register-filter-trigger" onClick={event => { event.stopPropagation(); setFilterMenu(current => current === column.key ? '' : column.key); }} aria-haspopup="menu" aria-expanded={filterMenu === column.key}>
                                                        <span>{column.label}</span><ChevronDown aria-hidden="true" />
                                                    </button>
                                                    {filterMenu === column.key ? (
                                                        <div className="project-register-filter-menu" role="menu" onClick={event => event.stopPropagation()}>
                                                            <div className="project-register-filter-menu-actions"><button type="button" onClick={() => setAllFilterValues(column.key, true)}>Select all</button><button type="button" onClick={() => setAllFilterValues(column.key, false)}>Clear</button></div>
                                                            <div className="project-register-filter-options">{filterOptions[column.key].map(value => <label key={value}><input type="checkbox" checked={!excludedFilters[column.key].has(value)} onChange={() => toggleFilterValue(column.key, value)} /><span title={value}>{value}</span></label>)}</div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <button type="button" className={`project-register-column-sort${sortField === column.key ? ' active' : ''}`} onClick={() => changeSort(column.key)}><span>{column.label}</span><ChevronDown className={sortField === column.key && sortDirection === 'asc' ? 'ascending' : ''} aria-hidden="true" /></button>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map(row => (
                                    <tr key={row.id} className={row.deleted ? 'is-deleted' : undefined} title={row.deleted ? `Deleted ${formatDate(row.deletedAt, true)}` : undefined}>
                                        {config.columns.map(column => (
                                            <td key={column.key} title={String(row[column.key] || '')}>
                                                {column.key === 'status' ? <StatusBadge value={row.status} />
                                                    : column.key === 'qrLabel' ? <span className={`project-register-qr-assignment${row.qrLabel === 'Unassigned' ? ' is-unassigned' : ''}`}><QrCode size={12} />{row.qrLabel}</span>
                                                    : column.key === config.linkKey && row.deleted ? <span className="project-register-deleted-title">{row[column.key] || '-'}</span>
                                                    : column.key === config.linkKey ? <button type="button" className={`project-register-pdf-link${openingId === row.id ? ' opening' : ''}`} disabled={Boolean(openingId)} onClick={() => openPdf(row)} title={`Open PDF for ${row[column.key] || row.reference}`}>{row[column.key] || '-'}</button>
                                                    : row[column.key] || '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {!loading && filteredRows.length === 0 ? <div className="project-register-empty"><FileText size={28} /><span>{query || excludedFilters.builder.size || excludedFilters.project.size || showDeleted ? `No ${config.noun} match the current filters.` : `No active ${config.noun} have been created yet.`}</span></div> : null}
                </section>
            )}

            {showQrGenerator ? (
                <div className="project-register-modal-backdrop" onMouseDown={() => !generatingQr && setShowQrGenerator(false)}>
                    <form className="project-register-modal" onSubmit={generateQrLabels} onMouseDown={event => event.stopPropagation()}>
                        <div className="project-register-modal-title"><div><span>PRINT BATCH</span><h2>Generate QR Labels</h2></div><button type="button" onClick={() => setShowQrGenerator(false)} aria-label="Close"><X size={19} /></button></div>
                        <p>Each label receives a permanent number and an exact-size 63 × 100 mm PDF page.</p>
                        <label><span>Number of labels</span><input type="number" min="1" max="500" value={qrQuantity} onChange={event => setQrQuantity(event.target.value)} autoFocus /></label>
                        <label><span>Label branding</span><select value={qrCompany} onChange={event => setQrCompany(event.target.value)}><option value="ess">Erect Safe Scaffolding</option><option value="maloo">Maloo Access Group</option></select></label>
                        <div className="project-register-modal-note"><strong>Print at 100% scale</strong><span>63 mm wide × 100 mm high · one label per PDF page.</span></div>
                        <div className="project-register-modal-actions"><button type="button" onClick={() => setShowQrGenerator(false)} disabled={generatingQr}>Cancel</button><button type="submit" className="primary" disabled={generatingQr}>{generatingQr ? 'Generating…' : `Generate ${qrQuantity || 0} labels`}</button></div>
                    </form>
                </div>
            ) : null}
        </main>
    );
}
