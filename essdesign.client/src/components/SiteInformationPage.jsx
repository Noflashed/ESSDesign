import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Pencil, Search, Trash2 } from 'lucide-react';
import { analysisAPI, safetyProjectsAPI } from '../services/api';

function emptyProjectForm(initialBuilderId = '') {
    return {
        builderId: initialBuilderId,
        projectName: '',
        siteLocation: '',
        siteLocationSourceId: '',
        editingProjectId: null
    };
}

function mapPreviewUrl(location) {
    if (!location) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`;
}

export default function SiteInformationPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [builders, setBuilders] = useState([]);
    const [selectedBuilderId, setSelectedBuilderId] = useState('');
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showBuilderModal, setShowBuilderModal] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [projectForm, setProjectForm] = useState(emptyProjectForm());
    const [builderForm, setBuilderForm] = useState({ id: null, name: '' });
    const [siteAddressSuggestions, setSiteAddressSuggestions] = useState([]);
    const [siteAddressLoading, setSiteAddressLoading] = useState(false);
    const [selectedInfoProject, setSelectedInfoProject] = useState(null);
    const [columnFilterMenu, setColumnFilterMenu] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [error, setError] = useState('');

    const loadBuilders = async () => {
        setLoading(true);
        setError('');
        try {
            const nextBuilders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
            setBuilders(nextBuilders);
            setSelectedBuilderId(prev => prev && nextBuilders.some(builder => builder.id === prev) ? prev : '');
        } catch (err) {
            setError(err.message || 'Failed to load site information');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBuilders().catch(() => {});
    }, []);

    useEffect(() => {
        if (!columnFilterMenu) {
            return undefined;
        }

        const closeMenu = () => {
            setColumnFilterMenu('');
        };
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [columnFilterMenu]);

    const selectedBuilder = useMemo(
        () => builders.find(builder => builder.id === selectedBuilderId) || null,
        [builders, selectedBuilderId]
    );

    const visibleProjects = useMemo(() => {
        const cleanSearchQuery = searchQuery.trim().toLowerCase();
        const sourceBuilders = selectedBuilder ? [selectedBuilder] : builders;
        return sourceBuilders
            .flatMap(builder => builder.projects.map(project => ({ ...project, builder })))
            .filter(project => showArchived || statusFilter === 'archived' || !project.archived)
            .filter(project => statusFilter === 'all' || (statusFilter === 'archived' ? project.archived : !project.archived))
            .filter(project => {
                if (!cleanSearchQuery) {
                    return true;
                }
                return [
                    project.name,
                    project.builder.name,
                    project.siteLocation || 'Not set',
                    project.archived ? 'Archived' : 'Active',
                ].join(' ').toLowerCase().includes(cleanSearchQuery);
            });
    }, [builders, selectedBuilder, showArchived, searchQuery, statusFilter]);

    const hasStatusFilter = statusFilter !== 'all';

    const openCreateProject = () => {
        setProjectForm(emptyProjectForm(selectedBuilder?.id || builders[0]?.id || ''));
        setSiteAddressSuggestions([]);
        setSiteAddressLoading(false);
        setShowProjectModal(true);
    };

    const openEditProject = (builderId, project) => {
        setProjectForm({
            builderId,
            projectName: project.name,
            siteLocation: project.siteLocation || '',
            siteLocationSourceId: project.siteLocation ? 'existing' : '',
            editingProjectId: project.id
        });
        setSiteAddressSuggestions([]);
        setSiteAddressLoading(false);
        setShowProjectModal(true);
    };

    const closeProjectModal = () => {
        setShowProjectModal(false);
        setSiteAddressSuggestions([]);
        setSiteAddressLoading(false);
    };

    const openCreateBuilder = () => {
        setBuilderForm({ id: null, name: '' });
        setShowBuilderModal(true);
    };

    const openEditBuilder = (builder) => {
        setBuilderForm({ id: builder.id, name: builder.name });
        setShowBuilderModal(true);
    };

    const saveProject = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            if (projectForm.siteLocation.trim() && !projectForm.siteLocationSourceId) {
                throw new Error('Select a valid suggested site address before saving.');
            }
            const nextBuilders = projectForm.editingProjectId
                ? await safetyProjectsAPI.renameProject(projectForm.builderId, projectForm.editingProjectId, projectForm.projectName, projectForm.siteLocation)
                : await safetyProjectsAPI.createProject(projectForm.builderId, projectForm.projectName, projectForm.siteLocation);
            setBuilders(nextBuilders);
            setSelectedBuilderId(projectForm.builderId);
            closeProjectModal();
        } catch (err) {
            setError(err.message || 'Could not save project');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        const query = projectForm.siteLocation.trim();
        if (!showProjectModal || projectForm.siteLocationSourceId || query.length < 3) {
            setSiteAddressSuggestions([]);
            setSiteAddressLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setSiteAddressLoading(true);
            analysisAPI.addressSuggestions(query, { signal: controller.signal })
                .then(remoteResults => {
                    const suggestions = (Array.isArray(remoteResults) ? remoteResults : [])
                        .map((item, index) => ({
                            id: `tomtom-${item.address || item.label || index}`,
                            label: item.label || item.address,
                            address: item.address || item.label,
                            source: 'TomTom',
                        }))
                        .filter(item => item.address);
                    setSiteAddressSuggestions(suggestions.slice(0, 6));
                })
                .catch(addressError => {
                    if (addressError?.name !== 'CanceledError' && addressError?.code !== 'ERR_CANCELED') {
                        setSiteAddressSuggestions([]);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setSiteAddressLoading(false);
                    }
                });
        }, 250);

        setSiteAddressLoading(true);
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [projectForm.siteLocation, projectForm.siteLocationSourceId, showProjectModal]);

    const saveBuilder = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const nextBuilders = builderForm.id
                ? await safetyProjectsAPI.renameBuilder(builderForm.id, builderForm.name)
                : await safetyProjectsAPI.createBuilder(builderForm.name);
            setBuilders(nextBuilders);
            setSelectedBuilderId(builderForm.id || nextBuilders.find(builder => builder.name.toLowerCase() === builderForm.name.trim().toLowerCase())?.id || '');
            setShowBuilderModal(false);
        } catch (err) {
            setError(err.message || 'Could not save builder');
        } finally {
            setSaving(false);
        }
    };

    const removeProject = async (builderId, projectId) => {
        const confirmed = window.confirm('Delete this project?');
        if (!confirmed) {
            return;
        }
        try {
            const nextBuilders = await safetyProjectsAPI.deleteProject(builderId, projectId);
            setBuilders(nextBuilders);
        } catch (err) {
            setError(err.message || 'Could not delete project');
        }
    };

    const openProjectInfo = (project) => {
        setSelectedInfoProject(project);
    };

    const closeProjectInfo = () => {
        setSelectedInfoProject(null);
    };

    const selectBuilderFilter = (builderId) => {
        setSelectedBuilderId(builderId);
        setColumnFilterMenu('');
    };

    const toggleColumnFilterMenu = (menuName) => {
        setColumnFilterMenu(prev => prev === menuName ? '' : menuName);
    };

    const toggleArchiveProject = async (builderId, project) => {
        const isArchiving = !project.archived;
        const confirmed = window.confirm(
            isArchiving
                ? `Archive "${project.name}"? Archived jobs will be hidden from ESS Safety, rostering, and employee preferences until restored.`
                : `Unarchive "${project.name}"?`
        );
        if (!confirmed) {
            return;
        }

        try {
            const nextBuilders = isArchiving
                ? await safetyProjectsAPI.archiveProject(builderId, project.id)
                : await safetyProjectsAPI.unarchiveProject(builderId, project.id);
            setBuilders(nextBuilders);
        } catch (err) {
            setError(err.message || `Could not ${isArchiving ? 'archive' : 'unarchive'} project`);
        }
    };

    const removeBuilder = async (builder) => {
        if (!builder) {
            return;
        }
        if (builder.projects.length > 0) {
            window.alert('This builder cannot be deleted while projects are still attached. Delete, move, or archive those projects first.');
            return;
        }
        const confirmed = window.confirm(`Delete builder "${builder.name}"?`);
        if (!confirmed) {
            return;
        }
        try {
            const nextBuilders = await safetyProjectsAPI.deleteBuilder(builder.id);
            setBuilders(nextBuilders);
            setSelectedBuilderId(nextBuilders[0]?.id || '');
            setShowBuilderModal(false);
        } catch (err) {
            setError(err.message || 'Could not delete builder');
        }
    };

    return (
        <div className="module-page">
            <div className="module-shell site-registry-shell">
                {error ? <div className="module-error">{error}</div> : null}

                {loading ? (
                    <div className="module-empty">Loading site information...</div>
                ) : (
                    <section className="site-registry-table-section">
                        <div className="site-registry-toolbar">
                            <label className="site-registry-search-field">
                                <Search size={16} strokeWidth={2.2} aria-hidden="true" />
                                <input
                                    type="search"
                                    value={searchQuery}
                                    onChange={event => setSearchQuery(event.target.value)}
                                    placeholder="Search projects, builders, locations..."
                                    aria-label="Search site registry"
                                />
                            </label>
                            <label className="site-registry-toggle">
                                <input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />
                                <span className="site-registry-toggle-track" aria-hidden="true">
                                    <span className="site-registry-toggle-thumb" />
                                </span>
                                <span>Show Archived</span>
                            </label>
                            {selectedBuilder ? (
                                <button className="module-secondary-btn compact site-registry-edit-builder" onClick={() => openEditBuilder(selectedBuilder)}>Edit Builder</button>
                            ) : null}
                            <div className="site-registry-toolbar-actions">
                                <button className="module-secondary-btn compact site-registry-outline-action" onClick={openCreateBuilder}>Add Builder</button>
                                <button className="module-primary-btn compact site-registry-primary-action" onClick={openCreateProject}>Add Project</button>
                            </div>
                        </div>

                        <div className={`site-registry-table-wrap ${columnFilterMenu ? 'filter-menu-open' : ''}`}>
                            <table className="site-registry-table">
                                <thead>
                                    <tr>
                                        <th>Project</th>
                                        <th>
                                            <div className={`site-registry-column-filter ${selectedBuilderId ? 'filtered' : ''} ${columnFilterMenu === 'builder' ? 'open' : ''}`}>
                                                <button type="button" onClick={event => {
                                                    event.stopPropagation();
                                                    toggleColumnFilterMenu('builder');
                                                }}>
                                                    <span>Builder</span>
                                                </button>
                                                {columnFilterMenu === 'builder' ? (
                                                    <div className="site-registry-column-menu site-registry-column-menu-list" onClick={event => event.stopPropagation()}>
                                                        <button type="button" className={selectedBuilderId === '' ? 'selected' : ''} onClick={() => selectBuilderFilter('')}>All Builders</button>
                                                        {builders.map(builder => (
                                                            <button
                                                                key={builder.id}
                                                                type="button"
                                                                className={selectedBuilderId === builder.id ? 'selected' : ''}
                                                                onClick={() => selectBuilderFilter(builder.id)}
                                                            >
                                                                {builder.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </th>
                                        <th>Site Location</th>
                                        <th>
                                            <div className={`site-registry-column-filter ${hasStatusFilter ? 'filtered' : ''} ${columnFilterMenu === 'status' ? 'open' : ''}`}>
                                                <button type="button" onClick={event => {
                                                    event.stopPropagation();
                                                    toggleColumnFilterMenu('status');
                                                }}>
                                                    <span>Status</span>
                                                </button>
                                                {columnFilterMenu === 'status' ? (
                                                    <div className="site-registry-column-menu site-registry-column-menu-list" onClick={event => event.stopPropagation()}>
                                                        <button type="button" className={statusFilter === 'all' ? 'selected' : ''} onClick={() => {
                                                            setStatusFilter('all');
                                                            setColumnFilterMenu('');
                                                        }}>All</button>
                                                        <button type="button" className={statusFilter === 'active' ? 'selected' : ''} onClick={() => {
                                                            setStatusFilter('active');
                                                            setColumnFilterMenu('');
                                                        }}>Active</button>
                                                        <button type="button" className={statusFilter === 'archived' ? 'selected' : ''} onClick={() => {
                                                            setStatusFilter('archived');
                                                            setColumnFilterMenu('');
                                                        }}>Archived</button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleProjects.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="site-registry-empty-cell">
                                                {builders.length === 0
                                                    ? 'No builders created yet.'
                                                    : showArchived
                                                        ? 'No projects found.'
                                                        : 'No active projects found.'}
                                            </td>
                                        </tr>
                                    ) : visibleProjects.map(project => (
                                        <tr
                                            key={`${project.builder.id}-${project.id}`}
                                            className="site-registry-data-row"
                                            onClick={() => openProjectInfo(project)}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    openProjectInfo(project);
                                                }
                                            }}
                                            tabIndex={0}
                                        >
                                            <td>{project.name}</td>
                                            <td>{project.builder.name}</td>
                                            <td>{project.siteLocation || 'Not set'}</td>
                                            <td>
                                                <span className={`site-registry-status ${project.archived ? 'archived' : 'active'}`}>
                                                    {project.archived ? 'Archived' : 'Active'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="site-registry-table-actions">
                                                    <button className="site-registry-action-btn edit" onClick={event => {
                                                        event.stopPropagation();
                                                        openEditProject(project.builder.id, project);
                                                    }}>
                                                        <Pencil size={14} strokeWidth={2.4} />
                                                        <span>Edit</span>
                                                    </button>
                                                    <button className="site-registry-action-btn archive" onClick={event => {
                                                        event.stopPropagation();
                                                        toggleArchiveProject(project.builder.id, project);
                                                    }}>
                                                        <Archive size={14} strokeWidth={2.2} />
                                                        <span>{project.archived ? 'Unarchive' : 'Archive'}</span>
                                                    </button>
                                                    <button className="site-registry-action-btn delete" onClick={event => {
                                                        event.stopPropagation();
                                                        removeProject(project.builder.id, project.id);
                                                    }}>
                                                        <Trash2 size={14} strokeWidth={2.2} />
                                                        <span>Delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>

            {selectedInfoProject && (
                <div className="module-modal-backdrop" onClick={closeProjectInfo}>
                    <div className="module-modal compact site-registry-info-modal" onClick={e => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Site Information</h3>
                            <button className="nav-drawer-close" onClick={closeProjectInfo}>x</button>
                        </div>
                        <div className="site-registry-info-list">
                            <div className="site-registry-info-row">
                                <span>Project</span>
                                <strong>{selectedInfoProject.name}</strong>
                            </div>
                            <div className="site-registry-info-row">
                                <span>Builder</span>
                                <strong>{selectedInfoProject.builder.name}</strong>
                            </div>
                            <div className="site-registry-info-row">
                                <span>Site Location</span>
                                <strong>{selectedInfoProject.siteLocation || 'Not set'}</strong>
                            </div>
                            <div className="site-registry-info-row">
                                <span>Status</span>
                                <strong>{selectedInfoProject.archived ? 'Archived' : 'Active'}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showProjectModal && (
                <div className="module-modal-backdrop" onClick={closeProjectModal}>
                    <div className="module-modal compact" onClick={e => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>{projectForm.editingProjectId ? 'Edit Project' : 'Add Project'}</h3>
                            <button className="nav-drawer-close" onClick={closeProjectModal}>x</button>
                        </div>
                        <form className="module-form" onSubmit={saveProject}>
                            <div className="module-field">
                                <label>Builder</label>
                                <select value={projectForm.builderId} onChange={e => setProjectForm(prev => ({ ...prev, builderId: e.target.value }))}>
                                    <option value="">Select builder</option>
                                    {builders.map(builder => <option key={builder.id} value={builder.id}>{builder.name}</option>)}
                                </select>
                            </div>
                            <div className="module-field">
                                <label>Project</label>
                                <input value={projectForm.projectName} onChange={e => setProjectForm(prev => ({ ...prev, projectName: e.target.value }))} placeholder="Crown Sydney Hotel Resort" />
                            </div>
                            <div className="module-field">
                                <label>Site Location</label>
                                <div className="site-registry-address-autocomplete transport-address-autocomplete">
                                    <input
                                        value={projectForm.siteLocation}
                                        onChange={e => setProjectForm(prev => ({
                                            ...prev,
                                            siteLocation: e.target.value,
                                            siteLocationSourceId: '',
                                        }))}
                                        placeholder="1 Barangaroo Ave, Barangaroo NSW 2000"
                                        autoComplete="off"
                                    />
                                    {(siteAddressLoading || siteAddressSuggestions.length > 0) ? (
                                        <div className="site-registry-address-suggestions transport-address-suggestions" role="listbox">
                                            {siteAddressSuggestions.map(suggestion => (
                                                <button
                                                    key={suggestion.id}
                                                    type="button"
                                                    className="site-registry-address-suggestion transport-address-suggestion"
                                                    onClick={() => {
                                                        setProjectForm(prev => ({
                                                            ...prev,
                                                            siteLocation: suggestion.address,
                                                            siteLocationSourceId: suggestion.id,
                                                        }));
                                                        setSiteAddressSuggestions([]);
                                                        setSiteAddressLoading(false);
                                                    }}
                                                    role="option"
                                                >
                                                    <strong>{suggestion.address}</strong>
                                                    <span>{suggestion.source}{suggestion.label && suggestion.label !== suggestion.address ? ` - ${suggestion.label}` : ''}</span>
                                                </button>
                                            ))}
                                            {siteAddressLoading ? <div className="site-registry-address-suggestion transport-address-suggestion loading">Searching addresses...</div> : null}
                                        </div>
                                    ) : null}
                                </div>
                                {projectForm.siteLocation.trim() && !projectForm.siteLocationSourceId ? (
                                    <p className="site-registry-address-hint">Select a suggested address so transport routing can validate it.</p>
                                ) : null}
                            </div>
                            {projectForm.siteLocation.trim() && projectForm.siteLocationSourceId ? (
                                <div className="site-registry-map-preview">
                                    <div className="site-registry-map-preview-label">Map Preview</div>
                                    <iframe
                                        title="Site location preview"
                                        src={mapPreviewUrl(projectForm.siteLocation.trim())}
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                    />
                                </div>
                            ) : null}
                            <button type="submit" className="module-primary-btn" disabled={saving || Boolean(projectForm.siteLocation.trim() && !projectForm.siteLocationSourceId)}>
                                {saving ? 'Saving...' : 'Save Project'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showBuilderModal && (
                <div className="module-modal-backdrop" onClick={() => setShowBuilderModal(false)}>
                    <div className="module-modal compact" onClick={e => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>{builderForm.id ? 'Edit Builder' : 'Add Builder'}</h3>
                            <button className="nav-drawer-close" onClick={() => setShowBuilderModal(false)}>x</button>
                        </div>
                        <form className="module-form" onSubmit={saveBuilder}>
                            <div className="module-field">
                                <label>Builder Name</label>
                                <input value={builderForm.name} onChange={e => setBuilderForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Built" />
                            </div>
                            <button type="submit" className="module-primary-btn" disabled={saving}>
                                {saving ? 'Saving...' : 'Save Builder'}
                            </button>
                            {builderForm.id ? (
                                <button type="button" className="module-danger-btn" onClick={() => removeBuilder(builders.find(builder => builder.id === builderForm.id))}>
                                    Delete Builder
                                </button>
                            ) : null}
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
