import React, { useEffect, useMemo, useState } from 'react';
import { safetyProjectsAPI } from '../services/api';

export default function ESSSafetyPage({ onOpenScaffTags, onOpenSwms }) {
    const [loading, setLoading] = useState(true);
    const [builders, setBuilders] = useState([]);
    const [selectedBuilderId, setSelectedBuilderId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        safetyProjectsAPI.getBuilders()
            .then(nextBuilders => {
                if (!active) {
                    return;
                }
                setBuilders(nextBuilders);
                const firstBuilder = nextBuilders[0] || null;
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
                        <p>Shared builder, project, SWMS, and Scaff-Tag data backed by the same Supabase storage as iOS.</p>
                    </div>
                </div>

                <div className="module-card">
                    <div className="module-toolbar">
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
                    </div>

                    {error ? <div className="module-error">{error}</div> : null}

                    <div className="module-grid module-grid-two">
                        <button
                            className="module-nav-card"
                            disabled={!selectedBuilder || !selectedProject}
                            onClick={() => onOpenScaffTags(selectedBuilder, selectedProject)}
                        >
                            <span className="module-nav-label">Scaff-Tags</span>
                            <span className="module-nav-copy">Inspection forms, QR links, PDF output, and site records.</span>
                        </button>
                        <button
                            className="module-nav-card"
                            disabled={!selectedBuilder || !selectedProject}
                            onClick={() => onOpenSwms(selectedBuilder, selectedProject)}
                        >
                            <span className="module-nav-label">SWMS</span>
                            <span className="module-nav-copy">Shared PDF uploads for the selected project site.</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
