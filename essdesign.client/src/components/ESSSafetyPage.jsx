import React, { useEffect, useMemo, useState } from 'react';
import { safetyProjectsAPI } from '../services/api';

export default function ESSSafetyPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [builders, setBuilders] = useState([]);
    const [selectedBuilderId, setSelectedBuilderId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [newBuilderName, setNewBuilderName] = useState('');
    const [newProjectName, setNewProjectName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        safetyProjectsAPI.getBuilders()
            .then(nextBuilders => {
                if (!active) {
                    return;
                }
                setBuilders(nextBuilders);
                const firstBuilder = nextBuilders[0];
                setSelectedBuilderId(firstBuilder?.id || '');
                setSelectedProjectId(firstBuilder?.projects?.[0]?.id || '');
            })
            .catch(err => {
                if (active) {
                    setError(err.message || 'Failed to load safety projects');
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

    const selectedBuilder = useMemo(
        () => builders.find(builder => builder.id === selectedBuilderId) || builders[0] || null,
        [builders, selectedBuilderId]
    );

    const selectedProject = useMemo(
        () => selectedBuilder?.projects?.find(project => project.id === selectedProjectId) || selectedBuilder?.projects?.[0] || null,
        [selectedBuilder, selectedProjectId]
    );

    const handleCreate = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const nextBuilders = await safetyProjectsAPI.createBuilderAndProject(newBuilderName, newProjectName);
            setBuilders(nextBuilders);
            const matchingBuilder = nextBuilders.find(builder => builder.name.toLowerCase() === newBuilderName.trim().toLowerCase()) || nextBuilders[0];
            setSelectedBuilderId(matchingBuilder?.id || '');
            setSelectedProjectId(matchingBuilder?.projects?.find(project => project.name.toLowerCase() === newProjectName.trim().toLowerCase())?.id || matchingBuilder?.projects?.[0]?.id || '');
            setNewBuilderName('');
            setNewProjectName('');
        } catch (err) {
            setError(err.message || 'Could not save builder/project');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (selectedBuilder && !selectedBuilder.projects.some(project => project.id === selectedProjectId)) {
            setSelectedProjectId(selectedBuilder.projects[0]?.id || '');
        }
    }, [selectedBuilder, selectedProjectId]);

    if (loading) {
        return <div className="module-page"><div className="module-empty">Loading safety data...</div></div>;
    }

    return (
        <div className="module-page">
            <div className="module-shell">
                <div className="module-header">
                    <div>
                        <h2>ESS Safety</h2>
                        <p>Shared builder and project data from the same Supabase storage used by the mobile app.</p>
                    </div>
                </div>

                <div className="module-grid module-grid-two">
                    <section className="module-card">
                        <div className="module-card-title">Project Information</div>
                        <div className="module-field">
                            <label>Builder</label>
                            <select value={selectedBuilder?.id || ''} onChange={e => setSelectedBuilderId(e.target.value)}>
                                {builders.length === 0 ? <option value="">No builders yet</option> : null}
                                {builders.map(builder => <option key={builder.id} value={builder.id}>{builder.name}</option>)}
                            </select>
                        </div>
                        <div className="module-field">
                            <label>Project Site</label>
                            <select value={selectedProject?.id || ''} onChange={e => setSelectedProjectId(e.target.value)} disabled={!selectedBuilder}>
                                {!selectedBuilder ? <option value="">Select builder</option> : null}
                                {selectedBuilder?.projects?.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                            </select>
                        </div>
                        <div className="module-pill-row">
                            <div className="module-pill">
                                <span className="module-pill-label">Scaff-Tags</span>
                                <span className="module-pill-value">{selectedProject ? 'Available on mobile data set' : 'Select a project'}</span>
                            </div>
                            <div className="module-pill">
                                <span className="module-pill-label">SWMS</span>
                                <span className="module-pill-value">{selectedProject ? 'Available on mobile data set' : 'Select a project'}</span>
                            </div>
                        </div>
                    </section>

                    <section className="module-card">
                        <div className="module-card-title">Add Builder / Project</div>
                        <form className="module-form" onSubmit={handleCreate}>
                            <div className="module-field">
                                <label>Builder Name</label>
                                <input value={newBuilderName} onChange={e => setNewBuilderName(e.target.value)} placeholder="Built" />
                            </div>
                            <div className="module-field">
                                <label>Project Site</label>
                                <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="65 Martin Place" />
                            </div>
                            {error ? <div className="module-error">{error}</div> : null}
                            <button type="submit" className="module-primary-btn" disabled={saving}>
                                {saving ? 'Saving...' : 'Save Project'}
                            </button>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    );
}
