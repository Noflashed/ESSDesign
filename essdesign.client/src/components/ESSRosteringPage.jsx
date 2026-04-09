import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rosteringAPI, safetyProjectsAPI } from '../services/api';

function todayDateString() {
    return new Date().toISOString().slice(0, 10);
}

export default function ESSRosteringPage({ user }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showDateEditor, setShowDateEditor] = useState(false);
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

                const flattenedSites = builders.flatMap((builder) =>
                    builder.projects.map((project) => ({
                        id: `${builder.id}:${project.id}`,
                        builderId: builder.id,
                        builderName: builder.name,
                        projectId: project.id,
                        projectName: project.name
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
            .catch((err) => {
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

    const groupedSites = useMemo(() => {
        const grouped = new Map();

        sites.forEach((site) => {
            if (!grouped.has(site.builderId)) {
                grouped.set(site.builderId, {
                    builderId: site.builderId,
                    builderName: site.builderName,
                    sites: []
                });
            }

            grouped.get(site.builderId).sites.push(site);
        });

        return Array.from(grouped.values()).sort((a, b) => a.builderName.localeCompare(b.builderName));
    }, [sites]);

    const activeSites = useMemo(
        () => sites.filter((site) => activeSiteIds.includes(site.id)),
        [sites, activeSiteIds]
    );

    const totalRequiredMen = useMemo(
        () => activeSites.reduce((sum, site) => sum + Math.max(0, Number(requiredMenBySite[site.id] ?? 0)), 0),
        [activeSites, requiredMenBySite]
    );

    const toggleSite = (siteId) => {
        setActiveSiteIds((prev) => (
            prev.includes(siteId)
                ? prev.filter((id) => id !== siteId)
                : [...prev, siteId]
        ));
    };

    const setRequiredMen = (siteId, nextValue) => {
        if (nextValue === '') {
            setRequiredMenBySite((prev) => ({
                ...prev,
                [siteId]: ''
            }));
            return;
        }

        setRequiredMenBySite((prev) => ({
            ...prev,
            [siteId]: Math.max(0, Number(nextValue || 0))
        }));
    };

    const savePlan = async () => {
        if (!isSupervisor) {
            setError('Only Site Supervisors can develop rostering trees.');
            return;
        }

        setSaving(true);
        setError('');

        try {
            await rosteringAPI.savePlan({
                date: planDate,
                activeSiteIds,
                requiredMenBySite: Object.fromEntries(
                    Object.entries(requiredMenBySite).map(([siteId, value]) => [
                        siteId,
                        Math.max(0, Number(value || 0))
                    ])
                ),
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

    const openDatePicker = () => setShowDateEditor(true);

    return (
        <div className="module-page">
            <div className="module-shell rostering-shell">
                <div className="page-header">
                    <div className="header-stats">
                        <div className="stat-card stat-card-date">
                            <button type="button" className="stat-card-date-trigger" onClick={openDatePicker}>
                                <div className="stat-label">Plan Date</div>
                                <div className="stat-val stat-val-date">{planDate}</div>
                                <div className="stat-sub">Click to change</div>
                            </button>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Active Jobs</div>
                            <div className="stat-val">{activeSiteIds.length}</div>
                            <div className="stat-sub">{activeSiteIds.length === 1 ? '1 selected' : `${activeSiteIds.length} selected`}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Required Crew</div>
                            <div className="stat-val">{totalRequiredMen}</div>
                            <div className="stat-sub">Current labour target</div>
                        </div>
                    </div>
                </div>

                {!isSupervisor ? (
                    <div className="module-warning">
                        Your account is not assigned the `Site Supervisor` role. You can view the plan, but you cannot develop rostering trees.
                    </div>
                ) : null}

                <div className="module-grid module-grid-two">
                    <section className="section-card">
                        <div className="module-split-row" style={{ marginBottom: 16, alignItems: 'center' }}>
                            <div>
                                <span className="step-pill">Step 1</span>
                                <div className="page-title" style={{ fontSize: 18, marginTop: 8, marginBottom: 0 }}>Choose Active Jobs</div>
                            </div>
                        </div>

                        {groupedSites.length === 0 ? <div className="module-empty-inline">No projects available.</div> : null}
                        <div className="scroll-area">
                            {groupedSites.map((group) => (
                                <div key={group.builderId} className="client-group">
                                    <div className="client-header">
                                        <div className="client-name">{group.builderName}</div>
                                    </div>

                                    <div className="module-check-list">
                                        {group.sites.map((site) => {
                                            const selected = activeSiteIds.includes(site.id);
                                            return (
                                                <button
                                                    key={site.id}
                                                    type="button"
                                                    className={`job-card ${selected ? 'selected' : ''}`}
                                                    onClick={() => toggleSite(site.id)}
                                                >
                                                    <div>
                                                        <div className="job-client">{site.projectName}</div>
                                                        <div className="job-addr">{site.builderName}</div>
                                                    </div>
                                                    <span className={`badge ${selected ? 'badge-count' : 'badge-standby'}`}>
                                                        {selected ? 'On' : 'Standby'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="section-card">
                        <div className="module-split-row" style={{ marginBottom: 16, alignItems: 'center' }}>
                            <div>
                                <span className="step-pill">Step 2</span>
                                <div className="page-title" style={{ fontSize: 18, marginTop: 8, marginBottom: 0 }}>Set Labour Targets</div>
                            </div>
                            <span className="badge badge-standby">{totalRequiredMen} crew</span>
                        </div>

                        {activeSites.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">+</div>
                                <div className="page-desc">Select at least one job to begin planning.</div>
                            </div>
                        ) : (
                            <div>
                                {activeSites.map((site) => (
                                    <div key={site.id} className="labour-row">
                                        <div>
                                            <div className="job-client">{site.projectName}</div>
                                            <div className="job-addr">{site.builderName}</div>
                                        </div>
                                        <input
                                            className="module-number-input"
                                            type="number"
                                            min="0"
                                            value={requiredMenBySite[site.id] ?? 0}
                                            onChange={(e) => setRequiredMen(site.id, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {error ? <div className="module-error" style={{ marginTop: 12 }}>{error}</div> : null}

                        <div style={{ marginTop: 18 }}>
                            <button className="dev-btn" onClick={savePlan} disabled={saving || !isSupervisor}>
                                {saving ? 'Developing...' : 'Develop Rostering Tree'}
                            </button>
                        </div>
                    </section>
                </div>
            </div>

            {showDateEditor ? (
                <div className="module-modal-backdrop" onClick={() => setShowDateEditor(false)}>
                    <div className="module-modal compact" onClick={(e) => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Choose Plan Date</h3>
                            <button className="nav-drawer-close" onClick={() => setShowDateEditor(false)}>×</button>
                        </div>
                        <div className="module-form">
                            <div className="module-field">
                                <label>Date</label>
                                <input
                                    type="date"
                                    value={planDate}
                                    onChange={(e) => setPlanDate(e.target.value)}
                                />
                            </div>
                            <div className="module-form-actions">
                                <button
                                    type="button"
                                    className="module-primary-btn"
                                    onClick={() => setShowDateEditor(false)}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
