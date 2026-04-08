import React, { useEffect, useMemo, useState } from 'react';
import { safetyProjectsAPI } from '../services/api';

function emptyProjectForm(initialBuilderId = '') {
    return {
        builderId: initialBuilderId,
        projectName: '',
        editingProjectId: null
    };
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
    const [error, setError] = useState('');

    const loadBuilders = async () => {
        setLoading(true);
        setError('');
        try {
            const nextBuilders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
            setBuilders(nextBuilders);
            setSelectedBuilderId(prev => prev && nextBuilders.some(builder => builder.id === prev) ? prev : (nextBuilders[0]?.id || ''));
        } catch (err) {
            setError(err.message || 'Failed to load site information');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBuilders().catch(() => {});
    }, []);

    const selectedBuilder = useMemo(
        () => builders.find(builder => builder.id === selectedBuilderId) || builders[0] || null,
        [builders, selectedBuilderId]
    );

    const visibleProjects = useMemo(
        () => (selectedBuilder?.projects || []).filter(project => showArchived || !project.archived),
        [selectedBuilder, showArchived]
    );

    const activeProjectCount = useMemo(
        () => builders.reduce((count, builder) => count + builder.projects.filter(project => !project.archived).length, 0),
        [builders]
    );

    const archivedProjectCount = useMemo(
        () => builders.reduce((count, builder) => count + builder.projects.filter(project => project.archived).length, 0),
        [builders]
    );

    const openCreateProject = () => {
        setProjectForm(emptyProjectForm(selectedBuilder?.id || builders[0]?.id || ''));
        setShowProjectModal(true);
    };

    const openEditProject = (builderId, project) => {
        setProjectForm({
            builderId,
            projectName: project.name,
            editingProjectId: project.id
        });
        setShowProjectModal(true);
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
            const nextBuilders = projectForm.editingProjectId
                ? await safetyProjectsAPI.renameProject(projectForm.builderId, projectForm.editingProjectId, projectForm.projectName)
                : await safetyProjectsAPI.createProject(projectForm.builderId, projectForm.projectName);
            setBuilders(nextBuilders);
            setSelectedBuilderId(projectForm.builderId);
            setShowProjectModal(false);
        } catch (err) {
            setError(err.message || 'Could not save project');
        } finally {
            setSaving(false);
        }
    };

    const saveBuilder = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const nextBuilders = builderForm.id
                ? await safetyProjectsAPI.renameBuilder(builderForm.id, builderForm.name)
                : await safetyProjectsAPI.createBuilder(builderForm.name);
            setBuilders(nextBuilders);
            setSelectedBuilderId(builderForm.id || nextBuilders.find(builder => builder.name.toLowerCase() === builderForm.name.trim().toLowerCase())?.id || nextBuilders[0]?.id || '');
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
            <div className="module-shell">
                <div className="module-header">
                    <div>
                        <h2>Site Registry</h2>
                        <p>Manage shared builders and projects for both the web app and iOS app.</p>
                    </div>
                    <div className="module-list-actions">
                        <button className="module-primary-btn compact" onClick={openCreateBuilder}>Add Builder</button>
                        <button className="module-primary-btn compact" onClick={openCreateProject}>Add Project</button>
                    </div>
                </div>

                {error ? <div className="module-error">{error}</div> : null}

                {loading ? (
                    <div className="module-empty">Loading site information...</div>
                ) : (
                    <div className="module-grid module-grid-two site-registry-grid">
                        <section className="module-card site-registry-card">
                            <div className="module-card-title">Builders</div>
                            {builders.length === 0 ? (
                                <div className="module-empty-inline">No builders created yet.</div>
                            ) : (
                                <div className="module-list site-registry-builder-list">
                                    {builders.map(builder => (
                                        <button
                                            key={builder.id}
                                            className={`module-file-row ${selectedBuilder?.id === builder.id ? 'active-row' : ''}`}
                                            onClick={() => setSelectedBuilderId(builder.id)}
                                        >
                                            <div>
                                                <div className="module-item-title">{builder.name}</div>
                                                <div className="module-item-sub">
                                                    {builder.projects.filter(project => !project.archived).length} active
                                                    {builder.projects.some(project => project.archived) ? ` • ${builder.projects.filter(project => project.archived).length} archived` : ''}
                                                </div>
                                            </div>
                                            <span className="module-link-arrow">Select</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="module-card site-registry-card">
                            <div className="module-list-header">
                                <div>
                                    <div className="module-card-title">Projects</div>
                                    <div className="module-item-sub">{activeProjectCount} active • {archivedProjectCount} archived</div>
                                </div>
                                <div className="module-list-actions">
                                    <button className="module-secondary-btn compact" onClick={() => setShowArchived(prev => !prev)}>
                                        {showArchived ? 'Hide Archived Jobs' : 'Show Archived Jobs'}
                                    </button>
                                    {selectedBuilder ? (
                                        <button className="module-secondary-btn compact" onClick={() => openEditBuilder(selectedBuilder)}>Edit Builder</button>
                                    ) : null}
                                </div>
                            </div>
                            {!selectedBuilder ? (
                                <div className="module-empty-inline">Select a builder to manage its projects.</div>
                            ) : visibleProjects.length === 0 ? (
                                <div className="module-empty-inline">
                                    {showArchived ? 'This builder has no projects yet.' : 'This builder has no active projects.'}
                                </div>
                            ) : (
                                <div className="module-list site-registry-project-list">
                                    {visibleProjects.map(project => (
                                        <div key={project.id} className={`module-list-card ${project.archived ? 'module-list-card-archived' : ''}`}>
                                            <div className="module-list-header">
                                                <div>
                                                    <div className="module-item-title">{project.name}</div>
                                                    <div className="module-item-sub">
                                                        {selectedBuilder.name}{project.archived ? ' • Archived' : ''}
                                                    </div>
                                                </div>
                                                <div className="module-list-actions">
                                                    <button className="module-secondary-btn" onClick={() => openEditProject(selectedBuilder.id, project)}>Edit</button>
                                                    <button className="module-secondary-btn" onClick={() => toggleArchiveProject(selectedBuilder.id, project)}>
                                                        {project.archived ? 'Unarchive' : 'Archive'}
                                                    </button>
                                                    <button className="module-danger-btn" onClick={() => removeProject(selectedBuilder.id, project.id)}>Delete</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </div>

            {showProjectModal && (
                <div className="module-modal-backdrop" onClick={() => setShowProjectModal(false)}>
                    <div className="module-modal compact" onClick={e => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>{projectForm.editingProjectId ? 'Edit Project' : 'Add Project'}</h3>
                            <button className="nav-drawer-close" onClick={() => setShowProjectModal(false)}>×</button>
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
                                <input value={projectForm.projectName} onChange={e => setProjectForm(prev => ({ ...prev, projectName: e.target.value }))} placeholder="65 Martin Place" />
                            </div>
                            <button type="submit" className="module-primary-btn" disabled={saving}>
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
                            <button className="nav-drawer-close" onClick={() => setShowBuilderModal(false)}>×</button>
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
