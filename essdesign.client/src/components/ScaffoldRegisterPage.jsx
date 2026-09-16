import MonthlyInspectionReports from './MonthlyInspectionReports';
import {formatScaffoldDate, nextScaffoldInspectionDueDate, scaffoldInspectionCountdown} from '../scaffoldForms/utils/scaffoldDateDisplay';
import { makeRegisterItems, resolveScaffoldLifecycle, formatElapsedTime } from '../utils/scaffoldRegister';
import {ALL_SCOPE, ALL_BUILDERS, projectScopeOptions, resolveProjectScope} from '../utils/projectDataScope';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronDown,
    FileText,
    Tag,
    QrCode,
    MoreVertical,
    X,
    Clock3,
    HardHat,
    ListTree,
    Link2,
    CirclePlus,
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
import QRCode from 'qrcode';

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

function ScaffoldQrThumbnail({url, number, scaffoldName}) {
    const [image, setImage] = useState('');
    useEffect(() => {
        let active = true;
        setImage('');
        if (url) QRCode.toDataURL(url, {width:160, margin:2, errorCorrectionLevel:'M'})
            .then(value => { if (active) setImage(value); })
            .catch(() => { if (active) setImage(''); });
        return () => { active = false; };
    }, [url]);
    const content = <>{image ? <img src={image} alt="" /> : <QrCode size={42} aria-hidden="true" />}<span>{number || (url ? 'View QR' : 'No QR')}</span></>;
    return url ? <a className="scaffold-card-qr" href={url}
        aria-label={`Open QR webpage for ${scaffoldName}`} title={`Open ${number || 'linked QR webpage'}`}>{content}</a>
        : <span className="scaffold-card-qr is-unassigned" title="No QR label assigned">{content}</span>;
}

function ExpandedScaffoldCard({name, children, onClose}) {
    const dialog = useRef(null);
    useEffect(() => {
        const node = dialog.current;
        node.showModal();
        return () => { if (node.open) node.close(); };
    }, []);
    return createPortal(<dialog ref={dialog} className="scaffold-card-dialog" aria-label={`${name} details`}
        onCancel={event => { event.preventDefault(); onClose(); }}
        onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="scaffold-card-dialog-panel">
            <button type="button" className="scaffold-card-dialog-close" aria-label="Close scaffold details" onClick={onClose}><X size={20} /></button>
            <div onClickCapture={event => { if (event.target.closest('button, a')) onClose(); }} onContextMenuCapture={onClose}>{children}</div>
        </div>
    </dialog>, document.body);
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

export function RegisterDropdown({ label, selectedItem, items, getLabel, getLogoUrl, getLogoName = getLabel, showLogo = true, onSelect, disabled, emptyText, open: controlledOpen, onOpenChange, dropdownRef }) {
    const [localOpen, setLocalOpen] = useState(false);
    const open = controlledOpen ?? localOpen;
    const setOpen = value => {
        const next = typeof value === 'function' ? value(open) : value;
        if (onOpenChange) onOpenChange(next);
        else setLocalOpen(next);
    };
    const localRef = useRef(null);
    const rootRef = dropdownRef || localRef;
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
        return null;
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
    const [expandedCard, setExpandedCard] = useState(null);
    const [reportsItem, setReportsItem] = useState(null);
    useEffect(() => { setReportsItem(null); }, [selectedBuilderId, selectedProjectId]);
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
        () => selectedBuilderId === ALL_SCOPE ? ALL_BUILDERS : builders.find(builder => builder.id === selectedBuilderId) || null,
        [builders, selectedBuilderId]
    );
    const projects = useMemo(() => projectScopeOptions(builders, selectedBuilderId)
        .map(project => project.isAll ? {...project, name: 'All Sites'} : project), [builders, selectedBuilderId]);
    const selectedProject = useMemo(
        () => projects.find(project => project.id === selectedProjectId) || null,
        [projects, selectedProjectId]
    );
    const scopeProjects = useMemo(() => projects.filter(project => !project.isAll
        && (selectedProject?.isAll || project.id === selectedProject?.id)), [projects, selectedProject]);
    const hasSpecificSite = Boolean(selectedProject && !selectedProject.isAll);
    const [statusFilter, setStatusFilter] = useState('all');
    const paramsForProject = project => ({
        builderId: project?.builderId || '',
        builderName: builders.find(builder => builder.id === project?.builderId)?.name || '',
        projectId: project?.projectId || '',
        projectName: builders.find(builder => builder.id === project?.builderId)?.projects
            ?.find(candidate => candidate.id === project?.projectId)?.name || '',
    });

    const loadBuilders = useCallback(async () => {
        setBuildersLoading(true);
        try {
            const nextBuilders = await safetyProjectsAPI.getBuilders({ force: true });
            setBuilders(nextBuilders);
            setError('');

            const scope = resolveProjectScope(nextBuilders, {builderId: selectedBuilderId, projectId: selectedProjectId});
            setSelectedBuilderId(scope.builderId);
            setSelectedProjectId(scope.projectId);
        } catch (loadError) {
            setBuilders([]);
            setSelectedBuilderId('');
            setSelectedProjectId('');
            setError(loadError.message || 'Could not load builders and projects.');
        } finally {
            setBuildersLoading(false);
        }
    }, [selectedBuilderId, selectedProjectId]);

    useEffect(() => {
        loadBuilders().catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!builders.length || (!initialBuilderId && !initialProjectId)) return;
        const scope = resolveProjectScope(builders, {builderId: initialBuilderId, projectId: initialProjectId});
        setSelectedBuilderId(scope.builderId);
        setSelectedProjectId(scope.projectId);
    }, [initialBuilderId, initialProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (!scopeProjects.length) {
            setRecords([]);
            setRecordsLoading(false);
            setRefreshing(false);
            return;
        }

        const requestId = ++requestSequence.current;
        if (!silent) setRecordsLoading(true);
        try {
            const nextRecords = [];
            for (let offset = 0; offset < scopeProjects.length; offset += 4) {
                const groups = await Promise.all(scopeProjects.slice(offset, offset + 4).map(async project => {
                    const [registerEntries, tags, handovers] = await Promise.all([
                        scaffoldRegisterAPI.listRecords(project.builderId, project.projectId),
                        scaffTagsAPI.listForms(project.builderId, project.projectId),
                        handoverCertificatesAPI.listForms(project.builderId, project.projectId)
                    ]);
                    const builder = builders.find(candidate => candidate.id === project.builderId);
                    return makeRegisterItems(registerEntries, tags, handovers).map(item => ({...item,
                        builderId: project.builderId, builderName: builder?.name || '',
                        projectId: project.projectId,
                        projectName: builder?.projects?.find(candidate => candidate.id === project.projectId)?.name || project.name,
                        project,
                    }));
                }));
                if (requestId !== requestSequence.current) return;
                nextRecords.push(...groups.flat());
            }
            if (requestId !== requestSequence.current) return;
            setRecords(nextRecords.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))));
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
    }, [scopeProjects, builders]);

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
        const project = {id: ALL_SCOPE, name: 'All Sites', isAll: true};
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

    const projectParams = paramsForProject(selectedProject);
    const paramsForItem = item => ({builderId: item.builderId, builderName: item.builderName,
        projectId: item.projectId, projectName: item.projectName});

    const createScaffold = async event => {
        event.preventDefault();
        if (mutationLock.current || !hasSpecificSite) return;
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
        const {builderId, projectId} = item;
        const key = `${builderId}:${projectId}:${item.id}`;
        let record = item.registerRecord || promotedRecords.current.get(key);
        if (!record) {
            record = await createScaffoldRegisterRecord({...paramsForItem(item), scaffoldName: item.scaffoldName, location: item.location});
            promotedRecords.current.set(key, record);
        }
        // Promote older forms to an explicit register relationship, keeping their PDFs in sync.
        for (const tag of item.tags) {
            if (tag.scaffoldRegisterId !== record.id) await setScaffTagScaffoldRecord(builderId, projectId, tag.id, {
                scaffoldName: item.scaffoldName, scaffoldRegisterId: record.id,
            });
        }
        for (const handover of item.handovers) {
            if (handover.scaffoldRegisterId !== record.id) await setHandoverCertificateScaffoldRecord(
                builderId, projectId, handover.id, item.scaffoldName, record.id);
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
                ...paramsForItem(item), readOnly: false,
                initialScaffoldName: item.scaffoldName, initialLocation: item.location,
                initialScaffoldRegisterId: record.id,
            };
            if (kind === 'handover') {
                Object.assign(params, {
                    formId: item.handover?.id,
                    initialCompanyEntityId: item.handover?.companyEntityId || normalizeCompanyEntityId(item.project?.scaffoldEntity),
                    initialScaffTagFormId: item.tag?.id, initialScaffTagId: item.tag?.tagNumber,
                    initialDrawingNumber: drawing?.drawingNumber,
                    initialDrawingDocumentId: drawing?.drawingDocumentId,
                    initialDrawingDocumentType: drawing?.drawingDocumentType || undefined,
                    initialDrawingDocumentName: drawing?.drawingDocumentName,
                    initialDrawingRevisionNumber: drawing?.drawingRevisionNumber,
                    initialDrawingFolderId: drawing?.drawingFolderId,
                });
            } else Object.assign(params, {
                formId: item.tag?.id, initialCompanyEntityId: item.tag?.companyEntityId || normalizeCompanyEntityId(item.project?.scaffoldEntity),
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
            const {builderId, projectId} = designItem;
            await setScaffoldRegisterDrawing({record, ...selection});
            for (const handover of designItem.handovers) await setHandoverCertificateDrawingLink(
                builderId, projectId, handover.id, {...selection, scaffoldRegisterId: record.id});
            if (designItem.handovers.length) {
                const handoverIds = new Set(designItem.handovers.map(handover => handover.id));
                const variations = await listDayLabourVariationForms(builderId, projectId);
                for (const variation of variations.filter(form => handoverIds.has(form.handoverDocumentId))) {
                    await setDayLabourVariationDrawingLink(builderId, projectId, variation.id, selection);
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

    const addAction = (label, onClick, linked = false) => <button type="button" className={`scaffold-register-add-cell${linked ? " is-linked" : " is-empty"}`}
        aria-label={label} title={label} disabled={mutationBusy} onClick={onClick}>{linked ? <Link2 size={16} aria-hidden="true" /> : <CirclePlus size={16} aria-hidden="true" />}</button>;

    const filteredRecords = useMemo(() => {
        const search = query.trim().toLowerCase();
        if (!search) return records;
        return records.filter(item => {
            const drawing = item.registerRecord?.drawingDocumentId
                ? item.registerRecord
                : item.handover;
            return [
                item.scaffoldName,
                item.builderName,
                item.projectName,
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

    const lifecycleStatus = item => resolveScaffoldLifecycle(item.registerRecord, item.tag?.qrLabelAssignedAt).status;
    const statusTabs = [['all', 'All'], ['active', 'Active'], ['awaiting-qr', 'Awaiting QR'], ['dismantled', 'Dismantled']];
    const visibleRecords = filteredRecords.filter(item => statusFilter === 'all' || lifecycleStatus(item) === statusFilter);

    const getBuilderLogoUrl = builder => builderLogoUrls.get(builder?.id) || builder?.logoUrl || '';
    const selectedBuilderLogoUrl = getBuilderLogoUrl(selectedBuilder);

    const renderCard = (item, expanded = false) => {
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
                                const inspectionDueDate = item.tag ? nextScaffoldInspectionDueDate(item.tag.dateErected || '', item.tag.inspectionRecords || []) : '';
                                const inspectionReminder = lifecycle.status !== 'dismantled' && item.tag?.status !== 'retired'
                                    ? scaffoldInspectionCountdown(inspectionDueDate, clockNow) : null;
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
                                const lastInspection = [...(item.tag?.inspectionRecords || [])].reverse().find(row => row.date);
                                const lastDate = lastInspection?.date || item.tag?.dateErected || '';
                                const lastDateLabel = lastDate ? formatScaffoldDate(lastDate) : '—';
                                return (
                                    <article key={JSON.stringify([item.builderId, item.projectId, item.id])}
                                        className={`scaffold-register-card is-${lifecycle.status}${expanded ? ' is-expanded' : ''}`} aria-label={item.scaffoldName}
                                        tabIndex={expanded ? undefined : 0} aria-haspopup={expanded ? undefined : 'dialog'}
                                        onClick={event => { if (!expanded && !event.target.closest('button, a')) setExpandedCard(item); }}
                                        onKeyDown={event => { if (!expanded && event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setExpandedCard(item); } }}
                                        onContextMenu={event => openRowMenu(event, item)}>
                                        <div className="scaffold-card-heading">
                                            <ScaffoldQrThumbnail url={hasQrLabel ? item.tag.qrTargetUrl : ''} number={hasQrLabel ? item.tag.qrLabelNumber : ''} scaffoldName={item.scaffoldName} />
                                            <div className="scaffold-card-name"><h2 title={item.scaffoldName}>{item.scaffoldName}</h2>
                                                <p>{item.builderName}</p>
                                                <p>{item.projectName}</p>
                                            </div>
                                            <span className={`scaffold-register-lifecycle-status is-${lifecycle.status}`}>{statusLabel}</span>
                                            <button type="button" className="scaffold-card-menu" aria-label={`Actions for ${item.scaffoldName}`} aria-haspopup="menu" onClick={event => openRowMenu(event, item)}><MoreVertical size={18} /></button>
                                        </div>
                                        <dl className="scaffold-card-metadata">
                                            <div><dt>Active time</dt><dd>{elapsed}</dd></div>
                                            <div><dt>Last inspection</dt><dd>{lastDateLabel}</dd></div>
                                        </dl>
                                        <p className={`scaffold-card-reminder ${inspectionReminder?.overdue ? 'is-overdue' : lifecycle.status === 'active' ? 'is-active' : ''}`} title={inspectionDueDate ? `Inspection due ${inspectionDueDate}` : undefined}>
                                            <Clock3 size={16} aria-hidden="true" />
                                            {lifecycle.status === 'dismantled' ? 'Dismantled' : inspectionReminder?.label || 'Assign a QR label to activate'}
                                        </p>
                                        <div className="scaffold-card-documents">
                                            <div className="scaffold-card-document">
                                                <FileText size={16} aria-hidden="true" /><span>Design drawing</span>
                                                {lifecycle.status !== 'dismantled' && addAction(`Link design for ${item.scaffoldName}`, () => setDesignItem(item), hasDrawing)}
                                                <LinkedDocumentButton title={drawingTitle} linked={hasDrawing} opening={mutationBusy}
                                                    onClick={() => onOpenDrawing?.({id:drawing.drawingDocumentId, fileType:drawing.drawingDocumentType, fileName:drawing.drawingDocumentName || drawing.drawingNumber || 'Design drawing.pdf', versionKey:drawing.drawingRevisionNumber || drawing.updatedAt || ''})} />
                                            </div>
                                            <div className="scaffold-card-document">
                                                <FileText size={16} aria-hidden="true" /><span>Handover certificate</span>
                                                <LinkedDocumentButton title={handoverNumber || 'Handover'} linked={Boolean(item.handover)} opening={mutationBusy} onClick={() => openFormEditor('handover', item)} />
                                                {!item.handover && lifecycle.status !== 'dismantled' && addAction(`Create handover for ${item.scaffoldName}`, () => openFormEditor('handover', item))}
                                            </div>
                                            <div className="scaffold-card-document">
                                                <Tag size={16} aria-hidden="true" /><span>Scaff-Tag</span>
                                                <LinkedDocumentButton title={tagNumber || 'Scaff-Tag'} linked={Boolean(item.tag)} opening={mutationBusy} onClick={() => openFormEditor('tag', item)} />
                                                {!item.tag && lifecycle.status !== 'dismantled' && addAction(`Create Scaff-Tag for ${item.scaffoldName}`, () => openFormEditor('tag', item))}
                                            </div>
                                            <button type="button" className="monthly-reports-link" onClick={() => setReportsItem(item)}>
                                                <FileText size={16} /><span>Monthly Inspection Reports</span><span aria-hidden="true">›</span>
                                            </button>
                                        </div>

                                        <time className="scaffold-card-updated" dateTime={item.updatedAt}>Updated {formatUpdatedAt(item.updatedAt)}</time>
                                    </article>
                                );

    };

    return (
        <main className="scaffold-register-page">
            {!reportsItem && <>
            <section className="scaffold-register-toolbar" inert={editor ? "" : undefined} aria-hidden={Boolean(editor)} aria-label="Scaffold Register filters">
                <div className="scaffold-register-dropdowns">
                    <RegisterDropdown
                        label="Client"
                        selectedItem={selectedBuilder}
                        items={[ALL_BUILDERS, ...builders]}
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

            <div className="scaffold-register-action-bar" inert={editor ? "" : undefined}>
                        <div className="scaffold-register-tabs" aria-label="Filter scaffolds by status">
                            {statusTabs.map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value}
                                className={statusFilter === value ? 'is-selected' : ''} onClick={() => setStatusFilter(value)}>
                                {label}<span>{filteredRecords.filter(item => value === 'all' || lifecycleStatus(item) === value).length}</span>
                            </button>)}
                        </div>
                <button type="button" className="scaffold-register-add" disabled={mutationBusy || !hasSpecificSite}
                    title={hasSpecificSite ? 'Add scaffold' : 'Select a specific site to add a scaffold'}
                    onClick={() => {setScaffoldName(''); setNameError(''); setNameDialogOpen(true);}}>
                    <CirclePlus size={15} strokeWidth={2.2} aria-hidden="true" /><span>Add scaffold</span>
                </button>
            </div>

            </>}
            {error ? <div className="scaffold-register-error" role="alert">{error}</div> : null}

            <section inert={editor ? "" : undefined} aria-hidden={Boolean(editor)} className={`scaffold-register-cards-wrap${recordsLoading || buildersLoading ? ' is-loading' : ''}`}>
                {reportsItem ? <MonthlyInspectionReports item={reportsItem} revision={Boolean(editor)}
                    onBack={() => setReportsItem(null)} onOpen={report => setEditor({screen:'HandoverCertificateForm', params:{...paramsForItem(reportsItem), formId:report.id, inspectionReport:true}})} /> : recordsLoading || buildersLoading ? (
                    <div className="scaffold-register-loading page-loading-brandmark"><LoadingBrandmark label="Loading Scaffold Register" /></div>
                ) : !selectedProject ? (
                    <div className="scaffold-register-empty">
                        <HardHat size={24} />
                        <span>Select a builder and project to view the Scaffold Register.</span>
                    </div>
                ) : (
                    <>
                        {visibleRecords.length === 0 && <div className="scaffold-register-empty">
                            <ListTree size={24} aria-hidden="true" />
                            <span>{records.length ? 'No scaffolds match the current search or status.' : 'No scaffold records yet. Add a scaffold to get started.'}</span>
                            {records.length > 0 && <button type="button" onClick={() => {setQuery(''); setStatusFilter('all');}}>Clear filters</button>}
                        </div>}
                        <div className="scaffold-register-card-grid">
                            {visibleRecords.map(item => renderCard(item))}
                        </div>
                        <p className="scaffold-register-count">{visibleRecords.length} {visibleRecords.length === 1 ? 'scaffold' : 'scaffolds'}</p>
                    </>
                )}
            </section>
            {expandedCard && <ExpandedScaffoldCard name={expandedCard.scaffoldName} onClose={() => setExpandedCard(null)}>
                {renderCard(records.find(item => item.id === expandedCard.id && item.builderId === expandedCard.builderId && item.projectId === expandedCard.projectId) || expandedCard, true)}
            </ExpandedScaffoldCard>}
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
            {designItem && <DrawingRegisterPickerModal visible {...paramsForItem(designItem)} designFolderId={designItem.project?.designFolderId}
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
                        setPendingDelete({ item: contextMenu.item, builderId: contextMenu.item.builderId, projectId: contextMenu.item.projectId });
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
