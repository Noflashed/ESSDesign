import { makeRegisterItems, resolveScaffoldLifecycle, formatElapsedTime } from '../utils/scaffoldRegister';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronDown,
    Clock3,
    HardHat,
    ListTree,
    Link2,
    Plus,
    RefreshCw,
    Search,
    Trash2
} from 'lucide-react';
import {
    handoverCertificatesAPI,
    SAFETY_PROJECTS_CHANGED_EVENT,
    scaffoldRegisterAPI,
    scaffTagsAPI,
    safetyProjectsAPI
} from '../services/api';
import ScaffoldFormEditor from './ScaffoldFormEditor';
import {normalizeCompanyEntityId} from '../scaffoldForms/config/companyEntities';
import DrawingRegisterPickerModal from '../scaffoldForms/components/DrawingRegisterPickerModal';
import {createScaffoldRegisterRecord, setScaffoldRegisterDrawing} from '../scaffoldForms/services/supabaseScaffoldRegister';
import {setHandoverCertificateDrawingLink, setHandoverCertificateScaffoldRecord} from '../scaffoldForms/services/supabaseHandoverCertificates';
import {listDayLabourVariationForms, setDayLabourVariationDrawingLink} from '../scaffoldForms/services/supabaseDayLabourForms';
import {setScaffTagScaffoldRecord} from '../scaffoldForms/services/supabaseScaffTags';
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

export function RegisterDropdown({ label, selectedItem, items, getLabel, getLogoUrl, getLogoName = getLabel, showLogo = true, onSelect, disabled, emptyText }) {
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
    const [builderLogoUrls, setBuilderLogoUrls] = useState(() => new Map());
    const [clockNow, setClockNow] = useState(() => Date.now());
    const requestSequence = useRef(0);
    const [nameDialogOpen, setNameDialogOpen] = useState(false);
    const [scaffoldName, setScaffoldName] = useState('');
    const [nameError, setNameError] = useState('');
    const [mutationBusy, setMutationBusy] = useState(false);
    const mutationLock = useRef(false);
    const [designItem, setDesignItem] = useState(null);
    const [editor, setEditor] = useState(null);
    const promotedRecords = useRef(new Map());
    const nameDialog = useRef(null);

    useEffect(() => {
        if (nameDialogOpen) nameDialog.current?.showModal();
    }, [nameDialogOpen]);
    const [contextMenu, setContextMenu] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const deleteInFlight = useRef(false);
    const menuRef = useRef(null);
    const deleteDialogRef = useRef(null);

    useEffect(() => {
        setContextMenu(null);
        setPendingDelete(null);
    }, [selectedBuilderId, selectedProjectId, query]);

    useEffect(() => {
        if (!contextMenu) return undefined;
        menuRef.current?.querySelector('button')?.focus();
        const close = () => setContextMenu(null);
        const onPointerDown = event => {
            if (!menuRef.current?.contains(event.target)) close();
        };
        const onKeyDown = event => {
            if (event.key === 'Escape' || event.key === 'Tab') close();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [contextMenu]);

    useEffect(() => {
        if (pendingDelete) deleteDialogRef.current?.showModal();
    }, [pendingDelete]);

    const openRowMenu = (event, item) => {
        event.preventDefault();
        if (deleteInFlight.current || mutationLock.current || editor || designItem || nameDialogOpen) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        setContextMenu({
            item,
            x: Math.max(8, Math.min(event.clientX || bounds.left, window.innerWidth - 232)),
            y: Math.max(8, Math.min(event.clientY || bounds.bottom, window.innerHeight - 64))
        });
    };

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
        if (deleteInFlight.current) return;
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

    const deleteScaffold = async () => {
        if (!pendingDelete || deleteInFlight.current || mutationLock.current) return;
        deleteInFlight.current = true;
        mutationLock.current = true;
        requestSequence.current += 1;
        setDeleting(true);
        setDeleteError('');
        try {
            await scaffoldRegisterAPI.deleteScaffold(
                pendingDelete.builderId, pendingDelete.projectId, pendingDelete.item
            );
            promotedRecords.current.delete(`${pendingDelete.builderId}:${pendingDelete.projectId}:${pendingDelete.item.id}`);
            setPendingDelete(null);
        } catch (deleteFailure) {
            setDeleteError(deleteFailure.message || 'Could not delete the scaffold. Please try again.');
        } finally {
            deleteInFlight.current = false;
            mutationLock.current = false;
            setDeleting(false);
            await loadRegister({ silent: true });
        }
    };

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

    useEffect(() => {
        const interval = window.setInterval(() => setClockNow(Date.now()), 30_000);
        return () => window.clearInterval(interval);
    }, []);

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

    const projectParams = {
        builderId: selectedBuilderId, builderName: selectedBuilder?.name || '',
        projectId: selectedProjectId, projectName: selectedProject?.name || '',
    };

    const createScaffold = async event => {
        event.preventDefault();
        if (mutationLock.current) return;
        if (!scaffoldName.trim()) { setNameError('Enter a scaffold name to continue.'); return; }
        mutationLock.current = true; setMutationBusy(true); setNameError('');
        try {
            await createScaffoldRegisterRecord({...projectParams, scaffoldName: scaffoldName.trim()});
            setNameDialogOpen(false); setScaffoldName(''); setQuery('');
            await loadRegister({silent: true});
        } catch (failure) { setNameError(failure.message || 'Could not create the scaffold.'); }
        finally { mutationLock.current = false; setMutationBusy(false); }
    };

    const ensureRegisterRecord = async item => {
        const key = `${selectedBuilderId}:${selectedProjectId}:${item.id}`;
        let record = item.registerRecord || promotedRecords.current.get(key);
        if (!record) {
            record = await createScaffoldRegisterRecord({...projectParams, scaffoldName: item.scaffoldName, location: item.location});
            promotedRecords.current.set(key, record);
        }
        // Promote older forms to an explicit register relationship, keeping their PDFs in sync.
        for (const tag of item.tags) {
            if (tag.scaffoldRegisterId !== record.id) await setScaffTagScaffoldRecord(selectedBuilderId, selectedProjectId, tag.id, {
                scaffoldName: item.scaffoldName, scaffoldRegisterId: record.id,
            });
        }
        for (const handover of item.handovers) {
            if (handover.scaffoldRegisterId !== record.id) await setHandoverCertificateScaffoldRecord(
                selectedBuilderId, selectedProjectId, handover.id, item.scaffoldName, record.id);
        }
        return record;
    };

    const openFormEditor = async (kind, item) => {
        if (mutationLock.current) return;
        mutationLock.current = true; setMutationBusy(true); setError('');
        try {
            const record = await ensureRegisterRecord(item);
            const drawing = record.drawingDocumentId ? record : item.handover;
            const params = {
                ...projectParams, readOnly: false,
                initialScaffoldName: item.scaffoldName, initialLocation: item.location,
                initialScaffoldRegisterId: record.id,
            };
            if (kind === 'handover') {
                Object.assign(params, {
                    formId: item.handover?.id,
                    initialCompanyEntityId: item.handover?.companyEntityId || normalizeCompanyEntityId(selectedProject?.scaffoldEntity),
                    initialScaffTagFormId: item.tag?.id, initialScaffTagId: item.tag?.tagNumber,
                    initialDrawingNumber: drawing?.drawingNumber,
                    initialDrawingDocumentId: drawing?.drawingDocumentId,
                    initialDrawingDocumentType: drawing?.drawingDocumentType || undefined,
                    initialDrawingDocumentName: drawing?.drawingDocumentName,
                    initialDrawingRevisionNumber: drawing?.drawingRevisionNumber,
                    initialDrawingFolderId: drawing?.drawingFolderId,
                });
            } else Object.assign(params, {
                formId: item.tag?.id, initialCompanyEntityId: item.tag?.companyEntityId || normalizeCompanyEntityId(selectedProject?.scaffoldEntity),
                initialHandoverFormId: item.handover?.id,
                initialHandoverInspectionNumber: item.handover?.inspectionNumber,
                initialHandoverReferenceName: item.handover?.formReferenceName,
            });
            setEditor({screen: kind === 'handover' ? 'HandoverCertificateForm' : 'ScaffTagForm', params});
        } catch (failure) { setError(failure.message || 'Could not open the scaffold form.'); }
        finally { mutationLock.current = false; setMutationBusy(false); }
    };

    const linkDrawing = async selection => {
        if (!designItem || mutationLock.current) return;
        mutationLock.current = true; setMutationBusy(true); setError('');
        try {
            const record = await ensureRegisterRecord(designItem);
            await setScaffoldRegisterDrawing({record, ...selection});
            for (const handover of designItem.handovers) await setHandoverCertificateDrawingLink(
                selectedBuilderId, selectedProjectId, handover.id, {...selection, scaffoldRegisterId: record.id});
            if (designItem.handovers.length) {
                const handoverIds = new Set(designItem.handovers.map(handover => handover.id));
                const variations = await listDayLabourVariationForms(selectedBuilderId, selectedProjectId);
                for (const variation of variations.filter(form => handoverIds.has(form.handoverDocumentId))) {
                    await setDayLabourVariationDrawingLink(selectedBuilderId, selectedProjectId, variation.id, selection);
                }
            }
            setDesignItem(null);
            await loadRegister({silent: true});
        } catch (failure) {
            setError(failure.message || 'Could not link the drawing. Select it again to retry.');
            setDesignItem(null);
            await loadRegister({silent: true});
            setError(failure.message || 'Could not finish linking the drawing. Please retry.');
        } finally { mutationLock.current = false; setMutationBusy(false); }
    };

    const addAction = (label, onClick) => <button type="button" className="scaffold-register-add-cell"
        aria-label={label} title={label} disabled={mutationBusy} onClick={onClick}><Link2 size={16} aria-hidden="true" /></button>;

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
            <section className="scaffold-register-toolbar" inert={editor ? "" : undefined} aria-hidden={Boolean(editor)} aria-label="Scaffold Register filters">
                <div className="scaffold-register-dropdowns">
                    <RegisterDropdown
                        label="Builder"
                        selectedItem={selectedBuilder}
                        items={builders}
                        getLabel={builder => builder.name}
                        getLogoUrl={getBuilderLogoUrl}
                        onSelect={handleBuilderChange}
                        disabled={buildersLoading || builders.length === 0 || mutationBusy || Boolean(designItem)}
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
                        disabled={buildersLoading || projects.length === 0 || mutationBusy || Boolean(designItem)}
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
                    <button
                        type="button"
                        className="scaffold-register-refresh"
                        onClick={refresh}
                        disabled={refreshing || buildersLoading}
                        aria-label={refreshing ? 'Refreshing Scaffold Register' : 'Refresh Scaffold Register'}
                        title={refreshing ? 'Refreshing…' : 'Refresh'}
                    >
                        <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} aria-hidden="true" />
                    </button>
                </div>
            </section>

            {error ? <div className="scaffold-register-error" role="alert">{error}</div> : null}

            <section inert={editor ? "" : undefined} aria-hidden={Boolean(editor)} className={`scaffold-register-table-wrap${recordsLoading || buildersLoading ? ' is-loading' : ''}`}>
                {recordsLoading || buildersLoading ? (
                    <div className="scaffold-register-loading page-loading-brandmark"><LoadingBrandmark label="Loading Scaffold Register" /></div>
                ) : !selectedProject ? (
                    <div className="scaffold-register-empty">
                        <HardHat size={24} />
                        <span>Select a builder and project to view the Scaffold Register.</span>
                    </div>
                ) : (
                    <table className="scaffold-register-table" aria-label="Scaffold register">
                        <caption className="scaffold-register-add-row">
                            <button type="button" className="scaffold-register-add" disabled={mutationBusy}
                                onClick={() => {setScaffoldName(''); setNameError(''); setNameDialogOpen(true);}}>
                                <Plus size={18} aria-hidden="true" /><span>Add scaffold</span>
                            </button>
                        </caption>
                        <thead>
                            <tr>
                                <th>SCAFFOLD</th>
                                <th>STATUS</th>
                                <th>ACTIVE TIME</th>
                                <th>DESIGN DRAWING</th>
                                <th>HANDOVER CERTIFICATE</th>
                                <th>SCAFF-TAG</th>
                                <th>QR LABEL</th>
                                <th>LAST UPDATED</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="scaffold-register-empty-cell">
                                        <div className="scaffold-register-empty">
                                            <ListTree size={24} aria-hidden="true" />
                                            <span>{records.length ? 'No scaffolds match the current search.' : 'No scaffold records yet. Add a scaffold to get started.'}</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {filteredRecords.map(item => {
                                const drawing = item.registerRecord?.drawingDocumentId && item.registerRecord?.drawingDocumentType
                                    ? item.registerRecord
                                    : item.handover;
                                const hasDrawing = Boolean(drawing?.drawingDocumentId && drawing?.drawingDocumentType);
                                const handoverNumber = prefixedNumber('H', item.handover?.inspectionNumber);
                                const tagNumber = prefixedNumber('ST', item.tag?.tagNumber || item.tag?.qrLabelNumber);
                                const drawingTitle = drawing?.drawingNumber || drawing?.drawingDocumentName || 'Design drawing';
                                const lifecycle = resolveScaffoldLifecycle(
                                    item.registerRecord,
                                    item.tag?.qrLabelAssignedAt
                                );
                                const hasQrLabel = ['assigned', 'retired'].includes(item.tag?.qrLabelStatus)
                                    && Boolean(item.tag?.qrTargetUrl);
                                const statusLabel = lifecycle.status === 'active'
                                    ? 'Active'
                                    : lifecycle.status === 'dismantled'
                                        ? 'Dismantled'
                                        : 'Awaiting QR';
                                const elapsed = formatElapsedTime(
                                    lifecycle.startedAt,
                                    lifecycle.stoppedAt,
                                    clockNow
                                );
                                return (
                                    <tr key={item.id}
                                        tabIndex={0}
                                        onContextMenu={event => openRowMenu(event, item)}
                                        onKeyDown={event => {
                                            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                                                openRowMenu(event, item);
                                            }
                                        }}
                                    >
                                        <td><span className="scaffold-register-cell-value" title={item.scaffoldName}>{item.scaffoldName}</span></td>
                                        <td>
                                            <span className={`scaffold-register-lifecycle-status is-${lifecycle.status}`}>
                                                <span aria-hidden="true" />
                                                {statusLabel}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className={`scaffold-register-elapsed${lifecycle.status === 'dismantled' ? ' is-stopped' : ''}`}
                                                title={lifecycle.startedAt ? `Active since ${formatUpdatedAt(lifecycle.startedAt)}` : 'Timer starts when a QR label is linked'}
                                            >
                                                <Clock3 size={13} /> {elapsed}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="scaffold-register-document-actions"><LinkedDocumentButton
                                                title={drawingTitle}
                                                linked={hasDrawing}
                                                opening={mutationBusy}
                                                onClick={() => onOpenDrawing?.({
                                                    id: drawing.drawingDocumentId,
                                                    fileType: drawing.drawingDocumentType,
                                                    fileName: drawing.drawingDocumentName || drawing.drawingNumber || 'Design drawing.pdf',
                                                    versionKey: drawing.drawingRevisionNumber || drawing.updatedAt || ''
                                                })}
                                            />
                                            {lifecycle.status !== 'dismantled' && addAction(`Link design for ${item.scaffoldName}`, () => setDesignItem(item))}</div>
                                        </td>
                                        <td>
                                            <div className="scaffold-register-document-actions"><LinkedDocumentButton
                                                title={handoverNumber || item.handover?.formReferenceName || 'Handover certificate'}
                                                linked={Boolean(item.handover)}
                                                opening={mutationBusy}
                                                onClick={() => openFormEditor('handover', item)}
                                            />
                                            {!item.handover && lifecycle.status !== 'dismantled' && addAction(`Create handover for ${item.scaffoldName}`, () => openFormEditor('handover', item))}</div>
                                        </td>
                                        <td>
                                            <div className="scaffold-register-document-actions"><LinkedDocumentButton
                                                title={tagNumber || item.tag?.scaffoldNo || 'Scaff-Tag'}
                                                linked={Boolean(item.tag)}
                                                opening={mutationBusy}
                                                onClick={() => openFormEditor('tag', item)}
                                            />
                                            {!item.tag && lifecycle.status !== 'dismantled' && addAction(`Create Scaff-Tag for ${item.scaffoldName}`, () => openFormEditor('tag', item))}</div>
                                        </td>
                                        <td>
                                            {hasQrLabel ? (
                                                <button
                                                    type="button"
                                                    className="scaffold-register-qr-link"
                                                    onClick={() => window.open(item.tag.qrTargetUrl, '_blank', 'noopener,noreferrer')}
                                                    title={`Open ${item.tag.qrLabelNumber || 'QR label'}`}
                                                >
                                                    {item.tag.qrLabelNumber || 'Open QR'}
                                                </button>
                                            ) : (
                                                <span className="scaffold-register-status-pill">
                                                    {lifecycle.status === 'dismantled' ? 'Dismantled' : 'Awaiting QR'}
                                                </span>
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
            {nameDialogOpen && <dialog ref={nameDialog} className="scaffold-register-name-dialog" onCancel={event => {
                event.preventDefault(); if (!mutationBusy) setNameDialogOpen(false);
            }}>
                <form onSubmit={createScaffold}>
                    <h2>Add scaffold</h2>
                    <p>{selectedBuilder?.name} · {selectedProject?.name}</p>
                    <label htmlFor="new-scaffold-name">Scaffold name</label>
                    <input id="new-scaffold-name" autoFocus value={scaffoldName} disabled={mutationBusy} onChange={event => setScaffoldName(event.target.value)} />
                    {nameError && <p role="alert">{nameError}</p>}
                    <div className="scaffold-register-dialog-actions">
                        <button type="button" disabled={mutationBusy} onClick={() => setNameDialogOpen(false)}>Cancel</button>
                        <button type="submit" disabled={mutationBusy}>{mutationBusy ? 'Adding…' : 'Add scaffold'}</button>
                    </div>
                </form>
            </dialog>}
            {designItem && <DrawingRegisterPickerModal visible {...projectParams} designFolderId={selectedProject?.designFolderId}
                onSelect={linkDrawing} onClose={() => {if (!mutationBusy) setDesignItem(null);}} />}
            {editor && <ScaffoldFormEditor key={`${editor.screen}:${editor.params.formId || editor.params.initialScaffoldRegisterId}`}
                {...editor} onClose={() => {setEditor(null); loadRegister({silent: true});}}
                onSaved={() => loadRegister({silent: true})} />}
            {contextMenu ? createPortal(
                <div ref={menuRef} className="scaffold-register-context-menu" role="menu"
                    aria-label={`Actions for ${contextMenu.item.scaffoldName}`}
                    style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button type="button" role="menuitem" onClick={() => {
                        setDeleteError('');
                        setPendingDelete({ item: contextMenu.item, builderId: selectedBuilderId, projectId: selectedProjectId });
                        setContextMenu(null);
                    }}><Trash2 size={16} aria-hidden="true" />Delete scaffold</button>
                </div>, document.body
            ) : null}
            {pendingDelete ? createPortal(
                <dialog ref={deleteDialogRef} className="scaffold-register-delete-dialog"
                    aria-labelledby="scaffold-delete-title" aria-describedby="scaffold-delete-description"
                    onCancel={event => {
                        event.preventDefault();
                        if (!deleteInFlight.current) setPendingDelete(null);
                    }}>
                    <h3 id="scaffold-delete-title">Delete scaffold?</h3>
                    <p id="scaffold-delete-description">Delete <strong>{pendingDelete.item.scaffoldName}</strong> from the Scaffold Register? This cannot be undone.</p>
                    {deleteError ? <div className="scaffold-register-error" role="alert">{deleteError}</div> : null}
                    <div className="module-form-actions">
                        <button type="button" className="module-secondary-btn" autoFocus disabled={deleting}
                            onClick={() => setPendingDelete(null)}>Cancel</button>
                        <button type="button" className="module-danger-btn" disabled={deleting}
                            onClick={deleteScaffold}>{deleting ? 'Deleting…' : 'Delete scaffold'}</button>
                    </div>
                </dialog>, document.body
            ) : null}
        </main>
    );
}
