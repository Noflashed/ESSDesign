import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown,
    HardHat,
    ListTree,
    RefreshCw,
    Search
} from 'lucide-react';
import {
    handoverCertificatesAPI,
    SAFETY_PROJECTS_CHANGED_EVENT,
    scaffoldRegisterAPI,
    scaffTagsAPI,
    safetyProjectsAPI
} from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';
import './ScaffoldRegisterPage.css';

const AUTO_REFRESH_MS = 30_000;
const FILTER_STORAGE_KEY = 'ess-scaffold-register-filters-v1';

function readStoredFilters() {
    try {
        const saved = JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) || '{}');
        return {
            builderId: String(saved.builderId || ''),
            projectId: String(saved.projectId || ''),
            query: String(saved.query || '')
        };
    } catch {
        return { builderId: '', projectId: '', query: '' };
    }
}

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
function makeRegisterItems(registerEntries, tags, handovers) {
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

function prefixedNumber(prefix, value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)
        ? trimmed
        : `${prefix}-${trimmed}`;
}

function formatUpdatedAt(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Not recorded';
    return new Intl.DateTimeFormat('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function builderInitials(name) {
    return String(name || 'Builder')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || 'B';
}

function BuilderLogo({ src, name }) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [src]);

    return (
        <span className={`scaffold-register-builder-logo${src && !failed ? ' has-image' : ''}`} aria-hidden="true">
            {src && !failed
                ? <img src={src} alt="" loading="eager" decoding="async" onError={() => setFailed(true)} />
                : builderInitials(name)}
        </span>
    );
}

function RegisterDropdown({ label, selectedItem, items, getLabel, getLogoUrl, getLogoName = getLabel, showLogo = true, onSelect, disabled, emptyText }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const menuId = `scaffold-register-${label.toLowerCase()}-options`;
    const selectedLabel = selectedItem ? getLabel(selectedItem) : `Select ${label.toLowerCase()}`;

    useEffect(() => {
        if (!open) return undefined;
        const closeOnOutsideClick = event => {
            if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        const closeOnEscape = event => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div className={`scaffold-register-dropdown ${showLogo ? 'has-logo' : 'no-logo'}${open ? ' is-open' : ''}`} ref={rootRef}>
            <button
                type="button"
                className="scaffold-register-dropdown-trigger"
                onClick={() => setOpen(current => !current)}
                onKeyDown={event => {
                    if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
                disabled={disabled}
                title={selectedLabel}
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={menuId}
            >
                {showLogo ? <BuilderLogo src={selectedItem ? getLogoUrl(selectedItem) : ''} name={selectedItem ? getLogoName(selectedItem) : selectedLabel} /> : null}
                <span>{selectedLabel}</span>
                <ChevronDown size={15} aria-hidden="true" />
            </button>
            {open ? (
                <div className="scaffold-register-dropdown-menu" id={menuId} role="listbox" aria-label={label}>
                    {items.length ? items.map(item => {
                        const itemLabel = getLabel(item);
                        const selected = item.id === selectedItem?.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={selected ? 'is-selected' : ''}
                                role="option"
                                aria-selected={selected}
                                title={itemLabel}
                                onClick={() => {
                                    onSelect(item);
                                    setOpen(false);
                                }}
                            >
                                {showLogo ? <BuilderLogo src={getLogoUrl(item)} name={getLogoName(item)} /> : null}
                                <span>{itemLabel}</span>
                            </button>
                        );
                    }) : <div className="scaffold-register-dropdown-empty">{emptyText}</div>}
                </div>
            ) : null}
        </div>
    );
}

function LinkedDocumentButton({ title, linked, opening, onClick }) {
    if (!linked) {
        return <span className="scaffold-register-missing-link">Not linked</span>;
    }

    return (
        <button
            type="button"
            className="scaffold-register-document-link"
            onClick={onClick}
            disabled={opening}
            title={`Open ${title}`}
        >
            {opening ? 'Opening…' : title}
        </button>
    );
}

export default function ScaffoldRegisterPage({
    initialBuilderId = '',
    initialProjectId = '',
    onSelectionChange,
    onOpenDrawing
}) {
    const storedFilters = useMemo(readStoredFilters, []);
    const [builders, setBuilders] = useState([]);
    const [selectedBuilderId, setSelectedBuilderId] = useState(() => initialBuilderId || storedFilters.builderId);
    const [selectedProjectId, setSelectedProjectId] = useState(() => initialProjectId || storedFilters.projectId);
    const [buildersLoading, setBuildersLoading] = useState(true);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [records, setRecords] = useState([]);
    const [query, setQuery] = useState(() => storedFilters.query);
    const [error, setError] = useState('');
    const [openingKey, setOpeningKey] = useState('');
    const [builderLogoUrls, setBuilderLogoUrls] = useState(() => new Map());
    const requestSequence = useRef(0);

    const selectedBuilder = useMemo(
        () => builders.find(builder => builder.id === selectedBuilderId) || null,
        [builders, selectedBuilderId]
    );
    const projects = selectedBuilder?.projects || [];
    const selectedProject = useMemo(
        () => projects.find(project => project.id === selectedProjectId) || null,
        [projects, selectedProjectId]
    );

    const loadBuilders = useCallback(async () => {
        setBuildersLoading(true);
        try {
            const nextBuilders = await safetyProjectsAPI.getBuilders({ force: true });
            setBuilders(nextBuilders);
            setError('');

            const requestedBuilder = nextBuilders.find(builder => builder.id === initialBuilderId);
            const nextBuilder = requestedBuilder
                || nextBuilders.find(builder => builder.id === selectedBuilderId)
                || nextBuilders[0]
                || null;
            const requestedProject = nextBuilder?.projects?.find(project => project.id === initialProjectId);
            const nextProject = requestedProject
                || nextBuilder?.projects?.find(project => project.id === selectedProjectId)
                || nextBuilder?.projects?.[0]
                || null;
            setSelectedBuilderId(nextBuilder?.id || '');
            setSelectedProjectId(nextProject?.id || '');
        } catch (loadError) {
            setBuilders([]);
            setSelectedBuilderId('');
            setSelectedProjectId('');
            setError(loadError.message || 'Could not load builders and projects.');
        } finally {
            setBuildersLoading(false);
        }
    }, [initialBuilderId, initialProjectId, selectedBuilderId, selectedProjectId]);

    useEffect(() => {
        loadBuilders().catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!builders.length || (!initialBuilderId && !initialProjectId)) return;
        const nextBuilder = builders.find(builder => builder.id === initialBuilderId);
        if (!nextBuilder) return;
        const nextProject = nextBuilder.projects?.find(project => project.id === initialProjectId)
            || nextBuilder.projects?.[0]
            || null;
        setSelectedBuilderId(nextBuilder.id);
        setSelectedProjectId(nextProject?.id || '');
    }, [builders, initialBuilderId, initialProjectId]);

    useEffect(() => {
        try {
            window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
                builderId: selectedBuilderId,
                projectId: selectedProjectId,
                query
            }));
        } catch {
            // Filter persistence is a convenience; storage can be unavailable.
        }
    }, [query, selectedBuilderId, selectedProjectId]);

    useEffect(() => {
        let cancelled = false;

        setBuilderLogoUrls(previous => {
            const next = new Map();
            builders.forEach(builder => {
                next.set(builder.id, previous.get(builder.id) || builder.logoUrl || '');
            });
            return next;
        });

        builders.forEach(builder => {
            safetyProjectsAPI.resolveBuilderLogoUrl(builder)
                .then(url => {
                    if (cancelled) return;
                    setBuilderLogoUrls(previous => {
                        if (previous.get(builder.id) === (url || '')) return previous;
                        const next = new Map(previous);
                        next.set(builder.id, url || '');
                        return next;
                    });
                })
                .catch(() => {});
        });

        return () => {
            cancelled = true;
        };
    }, [builders]);

    const loadRegister = useCallback(async ({ silent = false } = {}) => {
        if (!selectedBuilderId || !selectedProjectId) {
            setRecords([]);
            setRecordsLoading(false);
            setRefreshing(false);
            return;
        }

        const requestId = ++requestSequence.current;
        if (!silent) setRecordsLoading(true);
        try {
            const [registerEntries, tags, handovers] = await Promise.all([
                scaffoldRegisterAPI.listRecords(selectedBuilderId, selectedProjectId),
                scaffTagsAPI.listForms(selectedBuilderId, selectedProjectId),
                handoverCertificatesAPI.listForms(selectedBuilderId, selectedProjectId)
            ]);
            if (requestId !== requestSequence.current) return;
            setRecords(makeRegisterItems(registerEntries, tags, handovers));
            setError('');
        } catch (loadError) {
            if (requestId !== requestSequence.current) return;
            setRecords([]);
            setError(loadError.message || 'Could not load the Scaffold Register.');
        } finally {
            if (requestId === requestSequence.current) {
                setRecordsLoading(false);
                setRefreshing(false);
            }
        }
    }, [selectedBuilderId, selectedProjectId]);

    useEffect(() => {
        loadRegister().catch(() => {});
        const refreshSilently = () => loadRegister({ silent: true }).catch(() => {});
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') refreshSilently();
        };
        const interval = window.setInterval(refreshSilently, AUTO_REFRESH_MS);
        window.addEventListener('focus', refreshSilently);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            requestSequence.current += 1;
            window.clearInterval(interval);
            window.removeEventListener('focus', refreshSilently);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [loadRegister]);

    useEffect(() => {
        const handleProjectsChanged = () => loadBuilders().catch(() => {});
        window.addEventListener(SAFETY_PROJECTS_CHANGED_EVENT, handleProjectsChanged);
        return () => window.removeEventListener(SAFETY_PROJECTS_CHANGED_EVENT, handleProjectsChanged);
    }, [loadBuilders]);

    const handleBuilderChange = builder => {
        const project = builder?.projects?.[0] || null;
        setSelectedBuilderId(builder?.id || '');
        setSelectedProjectId(project?.id || '');
        setQuery('');
        onSelectionChange?.(builder, project);
    };

    const handleProjectChange = project => {
        setSelectedProjectId(project?.id || '');
        setQuery('');
        onSelectionChange?.(selectedBuilder, project);
    };

    const refresh = () => {
        setRefreshing(true);
        Promise.all([loadBuilders(), loadRegister({ silent: true })]).catch(() => {
            setRefreshing(false);
        });
    };

    const openPdf = async (kind, form) => {
        if (!form || openingKey) return;
        const key = `${kind}:${form.id}`;
        setOpeningKey(key);
        setError('');
        try {
            const url = kind === 'handover'
                ? await handoverCertificatesAPI.getPdfUrl(form)
                : await scaffTagsAPI.getPdfUrl(form);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (openError) {
            setError(openError.message || `Could not open the ${kind === 'handover' ? 'handover certificate' : 'Scaff-Tag'}.`);
        } finally {
            setOpeningKey('');
        }
    };

    const filteredRecords = useMemo(() => {
        const search = query.trim().toLowerCase();
        if (!search) return records;
        return records.filter(item => {
            const drawing = item.registerRecord?.drawingDocumentId
                ? item.registerRecord
                : item.handover;
            return [
                item.scaffoldName,
                item.location,
                drawing?.drawingNumber,
                drawing?.drawingDocumentName,
                item.handover?.inspectionNumber,
                item.handover?.formReferenceName,
                item.tag?.tagNumber,
                item.tag?.qrLabelNumber
            ].some(value => String(value || '').toLowerCase().includes(search));
        });
    }, [query, records]);

    const getBuilderLogoUrl = builder => builderLogoUrls.get(builder?.id) || builder?.logoUrl || '';
    const selectedBuilderLogoUrl = getBuilderLogoUrl(selectedBuilder);

    return (
        <main className="scaffold-register-page">
            <section className="scaffold-register-toolbar" aria-label="Scaffold Register filters">
                <div className="scaffold-register-dropdowns">
                    <RegisterDropdown
                        label="Builder"
                        selectedItem={selectedBuilder}
                        items={builders}
                        getLabel={builder => builder.name}
                        getLogoUrl={getBuilderLogoUrl}
                        onSelect={handleBuilderChange}
                        disabled={buildersLoading || builders.length === 0}
                        emptyText="No builders available"
                    />
                    <RegisterDropdown
                        label="Project"
                        selectedItem={selectedProject}
                        items={projects}
                        getLabel={project => project.name}
                        getLogoUrl={() => selectedBuilderLogoUrl}
                        getLogoName={() => selectedBuilder?.name || 'Builder'}
                        showLogo={false}
                        onSelect={handleProjectChange}
                        disabled={buildersLoading || projects.length === 0}
                        emptyText="No active projects"
                    />
                </div>
                <div className="scaffold-register-toolbar-actions">
                    <label className="scaffold-register-search">
                        <Search size={18} aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search this register…"
                            aria-label="Search Scaffold Register"
                        />
                    </label>
                    <button type="button" className="scaffold-register-refresh" onClick={refresh} disabled={refreshing || buildersLoading}>
                        <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} />
                        <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
                    </button>
                </div>
            </section>

            {error ? <div className="scaffold-register-error" role="alert">{error}</div> : null}

            <section className={`scaffold-register-table-wrap${recordsLoading || buildersLoading ? ' is-loading' : ''}`}>
                {recordsLoading || buildersLoading ? (
                    <div className="scaffold-register-loading page-loading-brandmark"><LoadingBrandmark label="Loading Scaffold Register" /></div>
                ) : !selectedProject ? (
                    <div className="scaffold-register-empty">
                        <HardHat size={24} />
                        <span>Select a builder and project to view the Scaffold Register.</span>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div className="scaffold-register-empty">
                        <ListTree size={24} />
                        <span>{records.length ? 'No scaffolds match the current search.' : 'No scaffold records yet.'}</span>
                    </div>
                ) : (
                    <table className="scaffold-register-table">
                        <thead>
                            <tr>
                                <th>SCAFFOLD</th>
                                <th>DESIGN DRAWING</th>
                                <th>HANDOVER CERTIFICATE</th>
                                <th>SCAFF-TAG</th>
                                <th>QR LABEL</th>
                                <th>LAST UPDATED</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map(item => {
                                const drawing = item.registerRecord?.drawingDocumentId && item.registerRecord?.drawingDocumentType
                                    ? item.registerRecord
                                    : item.handover;
                                const hasDrawing = Boolean(drawing?.drawingDocumentId && drawing?.drawingDocumentType);
                                const handoverNumber = prefixedNumber('H', item.handover?.inspectionNumber);
                                const tagNumber = prefixedNumber('ST', item.tag?.tagNumber || item.tag?.qrLabelNumber);
                                const drawingTitle = drawing?.drawingNumber || drawing?.drawingDocumentName || 'Design drawing';
                                return (
                                    <tr key={item.id}>
                                        <td><span className="scaffold-register-cell-value" title={item.scaffoldName}>{item.scaffoldName}</span></td>
                                        <td>
                                            <LinkedDocumentButton
                                                title={drawingTitle}
                                                linked={hasDrawing}
                                                opening={openingKey === `drawing:${item.id}`}
                                                onClick={() => onOpenDrawing?.({
                                                    id: drawing.drawingDocumentId,
                                                    fileType: drawing.drawingDocumentType,
                                                    fileName: drawing.drawingDocumentName || drawing.drawingNumber || 'Design drawing.pdf',
                                                    versionKey: drawing.drawingRevisionNumber || drawing.updatedAt || ''
                                                })}
                                            />
                                        </td>
                                        <td>
                                            <LinkedDocumentButton
                                                title={handoverNumber || item.handover?.formReferenceName || 'Handover certificate'}
                                                linked={Boolean(item.handover)}
                                                opening={openingKey === `handover:${item.handover?.id}`}
                                                onClick={() => openPdf('handover', item.handover)}
                                            />
                                        </td>
                                        <td>
                                            <LinkedDocumentButton
                                                title={tagNumber || item.tag?.scaffoldNo || 'Scaff-Tag'}
                                                linked={Boolean(item.tag)}
                                                opening={openingKey === `tag:${item.tag?.id}`}
                                                onClick={() => openPdf('tag', item.tag)}
                                            />
                                        </td>
                                        <td>
                                            {item.tag?.qrLabelStatus === 'assigned' && item.tag?.qrTargetUrl ? (
                                                <button
                                                    type="button"
                                                    className="scaffold-register-qr-link"
                                                    onClick={() => window.open(item.tag.qrTargetUrl, '_blank', 'noopener,noreferrer')}
                                                    title={`Open ${item.tag.qrLabelNumber || 'QR label'}`}
                                                >
                                                    {item.tag.qrLabelNumber || 'Open QR'}
                                                </button>
                                            ) : (
                                                <span className="scaffold-register-status-pill">Awaiting QR</span>
                                            )}
                                        </td>
                                        <td><time dateTime={item.updatedAt}>{formatUpdatedAt(item.updatedAt)}</time></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </section>
        </main>
    );
}
