import React, { useEffect, useMemo, useState } from 'react';
import { rosteringAPI, safetyProjectsAPI } from '../services/api';

function todayDateString() {
    return new Date().toISOString().slice(0, 10);
}

export default function ESSRosteringPage({ user }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [isSupervisor, setIsSupervisor] = useState(false);
    const [sites, setSites] = useState([]);
    const [planDate, setPlanDate] = useState(todayDateString());
    const [activeSiteIds, setActiveSiteIds] = useState([]);
    const [requiredMenBySite, setRequiredMenBySite] = useState({});

    useEffect(() => {
        let active = true;
        Promise.all([
            safetyProjectsAPI.getBuilders(),
            rosteringAPI.getPlan(),
            rosteringAPI.isUserSiteSupervisor(user?.id, user?.email)
        ])
            .then(([builders, plan, supervisor]) => {
                if (!active) {
                    return;
                }
                const flattenedSites = builders.flatMap(builder =>
                    builder.projects.map(project => ({
                        id: `${builder.id}:${project.id}`,
                        builderId: builder.id,
                        builderName: builder.name,
                        projectId: project.id,
                        projectName: project.name,
                        label: `${builder.name} — ${project.name}`
                    }))
                );
                setSites(flattenedSites);
                setIsSupervisor(supervisor);

                if (plan) {
                    setPlanDate(plan.date || todayDateString());
                    setActiveSiteIds(plan.activeSiteIds || []);
                    setRequiredMenBySite(plan.requiredMenBySite || {});
                }
            })
            .catch(err => {
                if (active) {
                    setError(err.message || 'Failed to load rostering data');
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
    }, [user?.email, user?.id]);

    const activeSites = useMemo(
        () => sites.filter(site => activeSiteIds.includes(site.id)),
        [sites, activeSiteIds]
    );

    const toggleSite = (siteId) => {
        setActiveSiteIds(prev => prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId]);
    };

    const savePlan = async () => {
        if (!isSupervisor) {
            setError('Only Site Supervisors can save roster plans.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await rosteringAPI.savePlan({
                date: planDate,
                activeSiteIds,
                requiredMenBySite,
                updatedByUserId: user?.id
            });
        } catch (err) {
            setError(err.message || 'Could not save roster plan');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="module-page"><div className="module-empty">Loading rostering data...</div></div>;
    }

    return (
        <div className="module-page">
            <div className="module-shell">
                <div className="module-header">
                    <div>
                        <h2>ESS Rostering</h2>
                        <p>Uses the same Supabase rostering tables as the mobile app.</p>
                    </div>
                </div>
                {!isSupervisor ? <div className="module-warning">Your account is not assigned the `Site Supervisor` role. You can still view the plan, but you cannot save changes.</div> : null}
                <div className="module-grid module-grid-two">
                    <section className="module-card">
                        <div className="module-card-title">Roster Date</div>
                        <div className="module-field">
                            <label>Date</label>
                            <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} />
                        </div>
                        <div className="module-card-title minor">Active Job Sites</div>
                        <div className="module-check-list">
                            {sites.length === 0 ? <div className="module-empty-inline">No project sites available.</div> : null}
                            {sites.map(site => (
                                <label key={site.id} className="module-check-row">
                                    <input type="checkbox" checked={activeSiteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />
                                    <span>{site.builderName} — {site.projectName}</span>
                                </label>
                            ))}
                        </div>
                    </section>

                    <section className="module-card">
                        <div className="module-card-title">Required Men</div>
                        {activeSites.length === 0 ? (
                            <div className="module-empty-inline">Select at least one active site.</div>
                        ) : activeSites.map(site => (
                            <div key={site.id} className="module-split-row">
                                <div>
                                    <div className="module-item-title">{site.projectName}</div>
                                    <div className="module-item-sub">{site.builderName}</div>
                                </div>
                                <input
                                    className="module-number-input"
                                    type="number"
                                    min="0"
                                    value={requiredMenBySite[site.id] ?? 0}
                                    onChange={e => setRequiredMenBySite(prev => ({
                                        ...prev,
                                        [site.id]: Math.max(0, Number(e.target.value || 0))
                                    }))}
                                />
                            </div>
                        ))}
                        {error ? <div className="module-error">{error}</div> : null}
                        <button className="module-primary-btn" onClick={savePlan} disabled={saving || !isSupervisor}>
                            {saving ? 'Saving...' : 'Save Rostering Plan'}
                        </button>
                    </section>
                </div>
            </div>
        </div>
    );
}
