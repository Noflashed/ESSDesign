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
    const [projectForm, setProjectForm] = useState(emptyProjectForm());
    const [builderForm, setBuilderForm] = useState({ id: null, name: '' });
    const [error, setError] = useState('');

    const loadBuilders = async () => {
        setLoading(true);
        setError('');
        try {
            const nextBuilders = await safetyProjectsAPI.getBuilders();
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
        const confirmed = window.confirm('Delete this project site?');
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

    const removeBuilder = async (builder) => {
        if (!builder) {
            return;
        }
        if (builder.projects.length > 0) {
            window.alert('This builder cannot be deleted while project sites are still attached. Delete or move those project sites first.');
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
                        <h2>Site Information</h2>
                        <p>Manage shared builders and project sites for both the web app and iOS app.</p>
                    </div>
                    <div className="module-list-actions">
                        <button className="module-secondary-btn compact" onClick={openCreateBuilder}>Builders</button>
                        <button className="module-primary-btn compact" onClick={openCreateProject}>Add Project</button>
                    </div>
                </div>

                {error ? <div className="module-error">{error}</div> : null}

                {loading ? (
                    <div className="module-empty">Loading site information...</div>
                ) : (
                    <div className="module-grid module-grid-two">
                        <section className="module-card">
                            <div className="module-card-title">Builders</div>
                            {builders.length === 0 ? (
                                <div className="module-empty-inline">No builders created yet.</div>
                            ) : (
                                <div className="module-list">
                                    {builders.map(builder => (
                                        <button
                                            key={builder.id}
                                            className={`module-file-row ${selectedBuilder?.id === builder.id ? 'active-row' : ''}`}
                                            onClick={() => setSelectedBuilderId(builder.id)}
                                        >
                                            <div>
                                                <div className="module-item-title">{builder.name}</div>
                                                <div className="module-item-sub">{builder.projects.length} site{builder.projects.length === 1 ? '' : 's'}</div>
                                            </div>
                                            <span className="module-link-arrow">Select</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="module-card">
                            <div className="module-list-header">
                                <div className="module-card-title">Project Sites</div>
                                {selectedBuilder ? (
                                    <button className="module-secondary-btn compact" onClick={() => openEditBuilder(selectedBuilder)}>Edit Builder</button>
                                ) : null}
                            </div>
                            {!selectedBuilder ? (
                                <div className="module-empty-inline">Select a builder to manage its project sites.</div>
                            ) : selectedBuilder.projects.length === 0 ? (
                                <div className="module-empty-inline">This builder has no project sites yet.</div>
                            ) : (
                                <div className="module-list">
                                    {selectedBuilder.projects.map(project => (
                                        <div key={project.id} className="module-list-card">
                                            <div className="module-list-header">
                                                <div>
                                                    <div className="module-item-title">{project.name}</div>
                                                    <div className="module-item-sub">{selectedBuilder.name}</div>
                                                </div>
                                                <div className="module-list-actions">
                                                    <button className="module-secondary-btn" onClick={() => openEditProject(selectedBuilder.id, project)}>Edit</button>
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
                            <h3>{projectForm.editingProjectId ? 'Edit Project Site' : 'Add Project Site'}</h3>
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
                                <label>Project Site</label>
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
