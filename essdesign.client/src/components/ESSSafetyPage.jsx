import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Building2,
    CheckCircle,
    ChevronDown,
    ClipboardCheck,
    ExternalLink,
    FileCheck,
    FileText,
    HardHat,
    MoreVertical,
    Shield,
    Tag,
    Users,
    X
} from 'lucide-react';
import { handoverCertificatesAPI, scaffTagsAPI, safetyFilesAPI, safetyProjectsAPI } from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';

const PROJECT_DATA_TABS = [
    {
        key: 'scaff-tags',
        label: 'Scaff-tags',
        noun: 'scaffold tags',
        refLabel: 'Tag / Ref No.',
        storageKind: 'scaff-tags',
        icon: Tag
    },
    {
        key: 'swms',
        label: 'SWMS',
        noun: 'SWMS documents',
        refLabel: 'SWMS / Ref No.',
        storageKind: 'swms',
        icon: Shield
    },
    {
        key: 'handover-certificates',
        label: 'Handover certificates',
        noun: 'handover certificates',
        refLabel: 'Certificate / Ref No.',
        storageKind: 'handover-certificates',
        icon: ClipboardCheck
    },
    {
        key: 'day-labour-forms',
        label: 'Day Labour forms',
        noun: 'day labour forms',
        refLabel: 'Form / Ref No.',
        storageKind: 'day-labour-forms',
        icon: Users
    },
    {
        key: 'design-document',
        label: 'Design document',
        noun: 'design documents',
        refLabel: 'Drawing / Ref No.',
        storageKind: 'design-document',
        icon: FileText
    }
];

const STATUS_META = {
    Current: { className: 'current', icon: CheckCircle },
    Expired: { className: 'expired', icon: AlertTriangle },
    Draft: { className: 'draft', icon: FileText }
};

const toDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
    const date = toDate(value);
    if (!date) return '-';
    return new Intl.DateTimeFormat('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(date);
};

const formatDateTime = (value) => {
    const date = toDate(value);
    if (!date) return '-';
    return new Intl.DateTimeFormat('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const addMonths = (value, months) => {
    const date = toDate(value);
    if (!date) return null;
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
};

const formatBytes = (value) => {
    if (!Number.isFinite(value)) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const makeFileRef = (prefix, index) => `${prefix}-${String(index + 1).padStart(5, '0')}`;

const normaliseFileName = (name) => String(name || 'document.pdf').replace(/^\d+-/, '');

const withPdfExtension = (value) => {
    const name = String(value || 'Handover certificate').trim() || 'Handover certificate';
    return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
};

function getScaffTagStatus(item) {
    const expiry = item.expiresAt || addMonths(item.latestInspectionDate, 3);
    if (!item.latestInspectionDate) return 'Draft';
    return expiry && expiry.getTime() < Date.now() ? 'Expired' : 'Current';
}

function mapScaffTagRows(items) {
    return items.map((item, index) => {
        const tagNo = item.scaffoldNo || item.tagNumber || makeFileRef('TAG', index);
        const expiry = item.expiresAt || addMonths(item.latestInspectionDate, 3);
        return {
            id: item.id,
            kind: 'scaff-tags',
            name: `${tagNo}.pdf`,
            ref: tagNo,
            status: getScaffTagStatus(item),
            uploadedAt: item.updatedAt || item.latestInspectionDate || '',
            expiresAt: expiry ? expiry.toISOString() : '',
            uploadedBy: item.inspectedBy || item.competentPerson || 'Site team',
            location: item.jobLocation || '',
            size: '',
            raw: item
        };
    });
}

function mapHandoverRows(items) {
    return items.map((item, index) => {
        const ref = item.inspectionNumber || item.formReferenceName || makeFileRef('HOC', index);
        return {
            id: item.id,
            kind: 'handover-certificates',
            name: withPdfExtension(item.formReferenceName || `Handover certificate ${ref}`),
            ref,
            status: 'Current',
            uploadedAt: item.updatedAt || item.inspectionDateTime || '',
            expiresAt: '',
            uploadedBy: item.essRepresentativeName || 'Site team',
            location: item.projectNumberClient || '',
            size: '',
            raw: item
        };
    });
}

function mapFileRows(files, tab) {
    const refPrefix = tab.key === 'swms'
        ? 'SWMS'
        : tab.key === 'handover-certificates'
            ? 'HOC'
            : tab.key === 'day-labour-forms'
                ? 'DLF'
                : 'DES';

    return files.map((file, index) => ({
        id: file.path,
        kind: tab.key,
        name: normaliseFileName(file.name),
        ref: makeFileRef(refPrefix, index),
        status: 'Current',
        uploadedAt: file.updatedAt,
        expiresAt: '',
        uploadedBy: 'Project data',
        location: '',
        size: formatBytes(file.size),
        raw: file
    }));
}

function StatusChip({ status }) {
    const meta = STATUS_META[status] || STATUS_META.Draft;
    const Icon = meta.icon;
    return (
        <span className={`project-data-status ${meta.className}`}>
            <Icon size={13} />
            {status}
        </span>
    );
}

function BuilderLogo({ builder, logoUrl }) {
    if (logoUrl) {
        return <img src={logoUrl} alt="" className="project-data-builder-logo" />;
    }

    return (
        <span className="project-data-builder-logo fallback" aria-hidden="true">
            <Building2 size={17} />
        </span>
    );
}

function BuilderDropdown({ builders, selectedBuilder, logoUrls, open, onToggle, onSelect, dropdownRef }) {
    return (
        <div className="project-data-builder-dropdown" ref={dropdownRef}>
            <button
                type="button"
                className="project-data-select-shell project-data-builder-trigger"
                onClick={onToggle}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <BuilderLogo builder={selectedBuilder} logoUrl={selectedBuilder ? logoUrls[selectedBuilder.id] : ''} />
                <span>{selectedBuilder?.name || 'No builders yet'}</span>
                <ChevronDown size={18} />
            </button>
            {open ? (
                <div className="project-data-builder-menu" role="listbox" aria-label="Builder">
                    {builders.length === 0 ? (
                        <div className="project-data-builder-option empty">No builders yet</div>
                    ) : builders.map(builder => (
                        <button
                            key={builder.id}
                            type="button"
                            className={`project-data-builder-option${builder.id === selectedBuilder?.id ? ' selected' : ''}`}
                            onClick={() => onSelect(builder.id)}
                            role="option"
                            aria-selected={builder.id === selectedBuilder?.id}
                        >
                            <BuilderLogo builder={builder} logoUrl={logoUrls[builder.id]} />
                            <span>{builder.name}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function ProjectDropdown({ projects, selectedProject, open, onToggle, onSelect, disabled, dropdownRef }) {
    return (
        <div className="project-data-project-dropdown" ref={dropdownRef}>
            <button
                type="button"
                className="project-data-select-shell project-data-project-trigger"
                onClick={onToggle}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
            >
                <HardHat size={19} />
                <span>{selectedProject?.name || (disabled ? 'Select builder first' : 'No active projects')}</span>
                <ChevronDown size={18} />
            </button>
            {open ? (
                <div className="project-data-project-menu" role="listbox" aria-label="Project">
                    {projects.length === 0 ? (
                        <div className="project-data-project-option empty">No active projects</div>
                    ) : projects.map(project => (
                        <button
                            key={project.id}
                            type="button"
                            className={`project-data-project-option${project.id === selectedProject?.id ? ' selected' : ''}`}
                            onClick={() => onSelect(project.id)}
                            role="option"
                            aria-selected={project.id === selectedProject?.id}
                        >
                            <HardHat size={17} />
                            <span>{project.name}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function DataTypeDropdown({ tabs, activeTab, open, onToggle, onSelect, dropdownRef }) {
    const ActiveIcon = activeTab.icon;
    return (
        <div className="project-data-kind-dropdown" ref={dropdownRef}>
            <button
                type="button"
                className="project-data-select-shell project-data-kind-trigger"
                onClick={onToggle}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <ActiveIcon size={19} />
                <span>{activeTab.label}</span>
                <ChevronDown size={18} />
            </button>
            {open ? (
                <div className="project-data-kind-menu" role="listbox" aria-label="Project data type">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                className={`project-data-kind-option${tab.key === activeTab.key ? ' selected' : ''}`}
                                onClick={() => onSelect(tab.key)}
                                role="option"
                                aria-selected={tab.key === activeTab.key}
                            >
                                <Icon size={17} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

function TableHeaderFilter({ label, active, open, onToggle, children }) {
    return (
        <div className={`project-data-column-filter${active ? ' filtered' : ''}${open ? ' open' : ''}`}>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                }}
            >
                <span>{label}</span>
                <ChevronDown size={13} />
            </button>
            {open ? (
                <div className="project-data-column-menu" onClick={event => event.stopPropagation()}>
                    {children}
                </div>
            ) : null}
        </div>
    );
}

function getPreviewDetails(doc, tab, builder, project) {
    const baseDetails = [
        ['Builder', builder?.name || '-'],
        ['Project', project?.name || '-'],
        ['Uploaded by', doc.uploadedBy || '-'],
        ['Date uploaded', formatDateTime(doc.uploadedAt)],
        ['Status', doc.status || '-']
    ];

    if (tab.key === 'scaff-tags') {
        return [
            ['Scaffold reference', doc.raw?.scaffoldNo || doc.raw?.tagNumber || doc.ref],
            ['Tag / Ref No.', doc.ref],
            ['Structure location', doc.location || project?.siteLocation || '-'],
            ['Last inspection', formatDateTime(doc.raw?.latestInspectionDate || doc.uploadedAt)],
            ...baseDetails
        ];
    }

    if (tab.key === 'handover-certificates') {
        return [
            ['Form reference', doc.raw?.formReferenceName || doc.name],
            ['Inspection no.', doc.raw?.inspectionNumber || doc.ref],
            ['ESS representative', doc.raw?.essRepresentativeName || doc.uploadedBy || '-'],
            ['Inspection date', formatDateTime(doc.raw?.inspectionDateTime || doc.uploadedAt)],
            ['Client project no.', doc.raw?.projectNumberClient || '-'],
            ...baseDetails
        ];
    }

    return [
        ['Document name', doc.name],
        [tab.refLabel, doc.ref],
        ['File size', doc.size || '-'],
        ...baseDetails
    ];
}

function ProjectDataPreview({ doc, tab, builder, project, previewUrl, previewLoading, previewError, onClose, onOpen }) {
    const previewSrc = previewUrl ? `${previewUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH` : '';
    const details = getPreviewDetails(doc, tab, builder, project);

    return (
        <aside className="project-data-preview-panel" aria-label="Document preview">
            <div className="project-data-preview-titlebar">
                <strong title={doc.name}>{doc.name}</strong>
                <div className="project-data-preview-actions">
                    <button type="button" onClick={onOpen} aria-label="Open document" title="Open document">
                        <ExternalLink size={17} />
                    </button>
                    <button type="button" onClick={onClose} aria-label="Close preview" title="Close preview">
                        <X size={18} />
                    </button>
                </div>
            </div>
            <div className="project-data-preview-content">
                <div className={`project-data-paper${previewSrc ? ' is-clickable' : ''}`}>
                    {previewLoading ? (
                        <div className="project-data-preview-state">
                            <LoadingBrandmark label="Loading preview" />
                        </div>
                    ) : previewSrc ? (
                        <>
                            <iframe
                                src={previewSrc}
                                title={`${doc.name} preview`}
                                className="project-data-preview-frame"
                                scrolling="no"
                            />
                            <button
                                type="button"
                                className="project-data-preview-open-hitarea"
                                onClick={onOpen}
                                aria-label={`Open ${doc.name} in a new tab`}
                                title="Open PDF in a new tab"
                            >
                                <span><ExternalLink size={15} /> Open PDF</span>
                            </button>
                        </>
                    ) : (
                        <div className="project-data-preview-state">
                            <FileText size={36} />
                            <strong>Preview unavailable</strong>
                            <span>{previewError || 'This document can still be opened in a new tab.'}</span>
                            <button type="button" onClick={onOpen}>Open document</button>
                        </div>
                    )}
                </div>
                <section className="project-data-preview-details" aria-label="General details">
                    <h3>General details</h3>
                    <dl>
                        {details.map(([label, value]) => (
                            <div key={label} className={label === 'Document name' ? 'document-name' : ''}>
                                <dt>{label}</dt>
                                <dd>{value || '-'}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </div>
        </aside>
    );
}

export default function ESSSafetyPage() {
    const [loading, setLoading] = useState(true);
    const [builders, setBuilders] = useState([]);
    const [selectedBuilderId, setSelectedBuilderId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [builderLogoUrls, setBuilderLogoUrls] = useState({});
    const [builderDropdownOpen, setBuilderDropdownOpen] = useState(false);
    const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
    const [kindDropdownOpen, setKindDropdownOpen] = useState(false);
    const [activeTabKey, setActiveTabKey] = useState('scaff-tags');
    const [columnFilterMenu, setColumnFilterMenu] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [uploadedByFilter, setUploadedByFilter] = useState('all');
    const [documentsLoading, setDocumentsLoading] = useState(false);
    const [documents, setDocuments] = useState([]);
    const [selectedDocumentId, setSelectedDocumentId] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewPdfUrl, setPreviewPdfUrl] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [error, setError] = useState('');
    const builderDropdownRef = useRef(null);
    const projectDropdownRef = useRef(null);
    const kindDropdownRef = useRef(null);

    useEffect(() => {
        let active = true;
        safetyProjectsAPI.getBuilders()
            .then(nextBuilders => {
                if (!active) return;
                setBuilders(nextBuilders);
                const firstBuilder = nextBuilders[0] || null;
                setSelectedBuilderId(firstBuilder?.id || '');
                setSelectedProjectId(firstBuilder?.projects?.[0]?.id || '');
            })
            .catch(err => {
                if (active) {
                    setError(err.message || 'Failed to load project data');
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        const logoBuilders = builders.filter(builder => builder.logoPath || builder.logoUrl || builder.logo_url);

        if (logoBuilders.length === 0) {
            setBuilderLogoUrls({});
            return () => {
                active = false;
            };
        }

        Promise.all(
            logoBuilders.map(builder => (
                safetyProjectsAPI.resolveBuilderLogoUrl(builder)
                    .then(url => [builder.id, url])
                    .catch(() => [builder.id, builder.logoUrl || builder.logo_url || ''])
            ))
        ).then(entries => {
            if (!active) return;
            setBuilderLogoUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
        });

        return () => {
            active = false;
        };
    }, [builders]);

    useEffect(() => {
        if (!builderDropdownOpen && !projectDropdownOpen && !kindDropdownOpen && !columnFilterMenu) return undefined;

        const handlePointerDown = (event) => {
            if (!builderDropdownRef.current?.contains(event.target)) {
                setBuilderDropdownOpen(false);
            }
            if (!projectDropdownRef.current?.contains(event.target)) {
                setProjectDropdownOpen(false);
            }
            if (!kindDropdownRef.current?.contains(event.target)) {
                setKindDropdownOpen(false);
            }
            if (!event.target.closest?.('.project-data-column-filter')) {
                setColumnFilterMenu('');
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setBuilderDropdownOpen(false);
                setProjectDropdownOpen(false);
                setKindDropdownOpen(false);
                setColumnFilterMenu('');
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [builderDropdownOpen, projectDropdownOpen, kindDropdownOpen, columnFilterMenu]);

    const selectedBuilder = useMemo(
        () => builders.find(builder => builder.id === selectedBuilderId) || builders[0] || null,
        [builders, selectedBuilderId]
    );

    const selectedProject = useMemo(
        () => selectedBuilder?.projects?.find(project => project.id === selectedProjectId) || selectedBuilder?.projects?.[0] || null,
        [selectedBuilder, selectedProjectId]
    );

    const activeTab = useMemo(
        () => PROJECT_DATA_TABS.find(tab => tab.key === activeTabKey) || PROJECT_DATA_TABS[0],
        [activeTabKey]
    );

    useEffect(() => {
        if (selectedBuilder && !selectedBuilder.projects.some(project => project.id === selectedProjectId)) {
            setSelectedProjectId(selectedBuilder.projects[0]?.id || '');
        }
    }, [selectedBuilder, selectedProjectId]);

    const handleSelectBuilder = (builderId) => {
        setSelectedBuilderId(builderId);
        setBuilderDropdownOpen(false);
        setProjectDropdownOpen(false);
        setKindDropdownOpen(false);
        setPreviewOpen(false);
        setSelectedDocumentId('');
    };

    const handleSelectProject = (projectId) => {
        setSelectedProjectId(projectId);
        setProjectDropdownOpen(false);
        closeDocumentPreview();
    };

    const handleSelectKind = (tabKey) => {
        setActiveTabKey(tabKey);
        setKindDropdownOpen(false);
        setStatusFilter('all');
        setUploadedByFilter('all');
        setColumnFilterMenu('');
        closeDocumentPreview();
    };

    const loadDocuments = async () => {
        if (!selectedBuilder || !selectedProject) {
            setDocuments([]);
            setSelectedDocumentId('');
            return;
        }

        setDocumentsLoading(true);
        setError('');
        try {
            let rows;
            if (activeTab.key === 'scaff-tags') {
                rows = mapScaffTagRows(await scaffTagsAPI.listForms(selectedBuilder.id, selectedProject.id));
            } else if (activeTab.key === 'handover-certificates') {
                rows = mapHandoverRows(await handoverCertificatesAPI.listForms(selectedBuilder.id, selectedProject.id));
            } else {
                rows = mapFileRows(await safetyFilesAPI.listModuleFiles(selectedBuilder.id, selectedProject.id, activeTab.storageKind), activeTab);
            }

            setDocuments(rows);
            setSelectedDocumentId('');
            setPreviewOpen(false);
        } catch (err) {
            setDocuments([]);
            setSelectedDocumentId('');
            setPreviewOpen(false);
            setError(err.message || `Failed to load ${activeTab.noun}`);
        } finally {
            setDocumentsLoading(false);
        }
    };

    useEffect(() => {
        loadDocuments().catch(() => {});
    }, [selectedBuilder?.id, selectedProject?.id, activeTab.key]);

    const selectedDocument = useMemo(
        () => documents.find(document => document.id === selectedDocumentId) || null,
        [documents, selectedDocumentId]
    );

    const filteredDocuments = useMemo(() => {
        return documents.filter(document => (
            (statusFilter === 'all' || document.status === statusFilter)
            && (uploadedByFilter === 'all' || document.uploadedBy === uploadedByFilter)
        ));
    }, [documents, statusFilter, uploadedByFilter]);

    const statusOptions = useMemo(
        () => [...new Set(documents.map(document => document.status).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [documents]
    );

    const uploadedByOptions = useMemo(
        () => [...new Set(documents.map(document => document.uploadedBy).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [documents]
    );

    const toggleColumnFilterMenu = (key) => {
        setColumnFilterMenu(current => current === key ? '' : key);
    };

    const openDocumentPreview = (documentId) => {
        setSelectedDocumentId(documentId);
        setPreviewOpen(true);
    };

    const closeDocumentPreview = () => {
        setPreviewOpen(false);
        setSelectedDocumentId('');
        setPreviewPdfUrl('');
        setPreviewError('');
    };

    const resolveDocumentPdfUrl = async (doc) => {
        if (!doc || !selectedBuilder || !selectedProject) return '';
        if (doc.kind === 'scaff-tags') {
            const form = await scaffTagsAPI.getForm(selectedBuilder.id, selectedProject.id, doc.id);
            if (!form) throw new Error('Scaff-tag form not found');
            return scaffTagsAPI.getPdfUrl(form);
        }
        if (doc.kind === 'handover-certificates') {
            const form = await handoverCertificatesAPI.getForm(selectedBuilder.id, selectedProject.id, doc.id);
            if (!form) throw new Error('Handover certificate not found');
            return handoverCertificatesAPI.getPdfUrl(form);
        }
        return safetyFilesAPI.getSignedModuleFileUrl(doc.raw.path);
    };

    useEffect(() => {
        let active = true;

        if (!previewOpen || !selectedDocument || !selectedBuilder || !selectedProject) {
            setPreviewPdfUrl('');
            setPreviewError('');
            setPreviewLoading(false);
            return () => {
                active = false;
            };
        }

        setPreviewPdfUrl('');
        setPreviewError('');
        setPreviewLoading(true);
        resolveDocumentPdfUrl(selectedDocument)
            .then(url => {
                if (active) {
                    setPreviewPdfUrl(url);
                }
            })
            .catch(err => {
                if (active) {
                    setPreviewError(err.message || 'Failed to load preview');
                }
            })
            .finally(() => {
                if (active) {
                    setPreviewLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [previewOpen, selectedDocument?.id, selectedDocument?.kind, selectedBuilder?.id, selectedProject?.id]);

    const openSelectedDocument = async (doc = selectedDocument) => {
        if (!doc || !selectedBuilder || !selectedProject) return;
        try {
            const url = await resolveDocumentPdfUrl(doc);
            if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        } catch (err) {
            setError(err.message || 'Failed to open document');
        }
    };

    const downloadDocumentPdf = async (doc) => {
        if (!doc || !selectedBuilder || !selectedProject) return;
        try {
            const url = await resolveDocumentPdfUrl(doc);
            if (!url) return;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to download document');

            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = doc.name || 'document.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(objectUrl);
        } catch (err) {
            setError(err.message || 'Failed to download document');
        }
    };

    const handlePdfIconKeyDown = (event, document) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        downloadDocumentPdf(document);
    };

    if (loading) {
        return <div className="module-page"><div className="page-loading-brandmark"><LoadingBrandmark label="Loading project data" /></div></div>;
    }

    return (
        <div className="module-page project-data-page">
            <div className="project-data-shell">
                <section className="project-data-selector-row" aria-label="Project selector">
                    <label className="project-data-select-field">
                        <span>Builder</span>
                        <BuilderDropdown
                            builders={builders}
                            selectedBuilder={selectedBuilder}
                            logoUrls={builderLogoUrls}
                            open={builderDropdownOpen}
                            onToggle={() => {
                                setBuilderDropdownOpen(prev => !prev);
                                setProjectDropdownOpen(false);
                                setKindDropdownOpen(false);
                            }}
                            onSelect={handleSelectBuilder}
                            dropdownRef={builderDropdownRef}
                        />
                    </label>
                    <label className="project-data-select-field">
                        <span>Project</span>
                        <ProjectDropdown
                            projects={selectedBuilder?.projects || []}
                            selectedProject={selectedProject}
                            open={projectDropdownOpen}
                            onToggle={() => {
                                if (!selectedBuilder) return;
                                setProjectDropdownOpen(prev => !prev);
                                setBuilderDropdownOpen(false);
                                setKindDropdownOpen(false);
                            }}
                            onSelect={handleSelectProject}
                            disabled={!selectedBuilder}
                            dropdownRef={projectDropdownRef}
                        />
                    </label>
                    <label className="project-data-select-field">
                        <span>Document type</span>
                        <DataTypeDropdown
                            tabs={PROJECT_DATA_TABS}
                            activeTab={activeTab}
                            open={kindDropdownOpen}
                            onToggle={() => {
                                setKindDropdownOpen(prev => !prev);
                                setBuilderDropdownOpen(false);
                                setProjectDropdownOpen(false);
                            }}
                            onSelect={handleSelectKind}
                            dropdownRef={kindDropdownRef}
                        />
                    </label>
                </section>

                {error ? <div className="module-error project-data-error">{error}</div> : null}

                <section className="project-data-workspace">
                    <div className="project-data-main-panel">
                        <div className="project-data-table-card">
                            <div className="project-data-table-head">
                                <span className="project-data-checkbox" aria-hidden="true" />
                                <span>Document name</span>
                                <span>{activeTab.refLabel}</span>
                                <span>
                                    <TableHeaderFilter
                                        label="Status"
                                        active={statusFilter !== 'all'}
                                        open={columnFilterMenu === 'status'}
                                        onToggle={() => toggleColumnFilterMenu('status')}
                                    >
                                        <button type="button" className={statusFilter === 'all' ? 'selected' : ''} onClick={() => {
                                            setStatusFilter('all');
                                            setColumnFilterMenu('');
                                        }}>All statuses</button>
                                        {statusOptions.map(status => (
                                            <button type="button" key={status} className={statusFilter === status ? 'selected' : ''} onClick={() => {
                                                setStatusFilter(status);
                                                setColumnFilterMenu('');
                                            }}>{status}</button>
                                        ))}
                                    </TableHeaderFilter>
                                </span>
                                <span>Uploaded</span>
                                <span>
                                    <TableHeaderFilter
                                        label="Uploaded by"
                                        active={uploadedByFilter !== 'all'}
                                        open={columnFilterMenu === 'uploadedBy'}
                                        onToggle={() => toggleColumnFilterMenu('uploadedBy')}
                                    >
                                        <button type="button" className={uploadedByFilter === 'all' ? 'selected' : ''} onClick={() => {
                                            setUploadedByFilter('all');
                                            setColumnFilterMenu('');
                                        }}>All uploaders</button>
                                        {uploadedByOptions.map(uploadedBy => (
                                            <button type="button" key={uploadedBy} className={uploadedByFilter === uploadedBy ? 'selected' : ''} onClick={() => {
                                                setUploadedByFilter(uploadedBy);
                                                setColumnFilterMenu('');
                                            }}>{uploadedBy}</button>
                                        ))}
                                    </TableHeaderFilter>
                                </span>
                                <span />
                            </div>

                            {documentsLoading ? (
                                <div className="project-data-table-state">
                                    <LoadingBrandmark label={`Loading ${activeTab.noun}`} />
                                </div>
                            ) : filteredDocuments.length === 0 ? (
                                <div className="project-data-empty-state">
                                    <FileCheck size={34} />
                                    <strong>No {activeTab.noun} yet</strong>
                                    <span>{selectedProject ? `${selectedProject.name} is ready for its first upload.` : 'Select a builder and project to begin.'}</span>
                                </div>
                            ) : (
                                <div className="project-data-table-body">
                                    {filteredDocuments.map(document => (
                                        <button
                                            key={document.id}
                                            type="button"
                                            className={`project-data-table-row${previewOpen && selectedDocument?.id === document.id ? ' selected' : ''}`}
                                            onClick={() => openDocumentPreview(document.id)}
                                            onDoubleClick={() => openSelectedDocument(document)}
                                        >
                                            <span className="project-data-checkbox" aria-hidden="true" />
                                            <span className="project-data-doc-name">
                                                <span
                                                    className="project-data-pdf-icon"
                                                    role="button"
                                                    tabIndex={0}
                                                    title="Download PDF"
                                                    aria-label={`Download ${document.name}`}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        downloadDocumentPdf(document);
                                                    }}
                                                    onDoubleClick={(event) => event.stopPropagation()}
                                                    onKeyDown={(event) => handlePdfIconKeyDown(event, document)}
                                                >
                                                    <FileText size={15} />
                                                </span>
                                                <span title={document.name}>{document.name}</span>
                                            </span>
                                            <span>{document.ref}</span>
                                            <span><StatusChip status={document.status} /></span>
                                            <span>{formatDate(document.uploadedAt)}</span>
                                            <span>{document.uploadedBy}</span>
                                            <span className="project-data-row-actions">
                                                <MoreVertical size={17} />
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                        </div>
                    </div>

                    {previewOpen && selectedDocument ? (
                        <>
                            <button
                                type="button"
                                className="project-data-preview-backdrop"
                                aria-label="Close document preview"
                                onClick={closeDocumentPreview}
                            />
                            <ProjectDataPreview
                                doc={selectedDocument}
                                tab={activeTab}
                                builder={selectedBuilder}
                                project={selectedProject}
                                previewUrl={previewPdfUrl}
                                previewLoading={previewLoading}
                                previewError={previewError}
                                onClose={closeDocumentPreview}
                                onOpen={() => openSelectedDocument()}
                            />
                        </>
                    ) : null}
                </section>
            </div>
        </div>
    );
}
