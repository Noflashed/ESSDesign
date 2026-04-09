import React, { useEffect, useMemo, useState } from 'react';
import { rosteringAPI, safetyProjectsAPI } from '../services/api';

function todayDateString() {
    return new Date().toISOString().slice(0, 10);
}

function formatSiteCountLabel(count) {
    if (count === 1) {
        return '1 active site';
    }
    return `${count} active sites`;
}

function SitePill({ label, tone = 'neutral' }) {
    return <span className={`rostering-pill rostering-pill-${tone}`}>{label}</span>;
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

                const flattenedSites = builders.flatMap((builder) =>
                    builder.projects.map((project) => ({
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

    const activeSites = useMemo(
        () => sites.filter((site) => activeSiteIds.includes(site.id)),
        [sites, activeSiteIds]
    );

    const totalRequiredMen = useMemo(
        () => activeSites.reduce((sum, site) => sum + Math.max(0, Number(requiredMenBySite[site.id] ?? 0)), 0),
        [activeSites, requiredMenBySite]
    );

    const groupedSites = useMemo(() => {
        const byBuilder = new Map();

        sites.forEach((site) => {
            if (!byBuilder.has(site.builderId)) {
                byBuilder.set(site.builderId, {
                    builderId: site.builderId,
                    builderName: site.builderName,
                    sites: []
                });
            }

            byBuilder.get(site.builderId).sites.push(site);
        });

        return Array.from(byBuilder.values()).sort((a, b) => a.builderName.localeCompare(b.builderName));
    }, [sites]);

    const toggleSite = (siteId) => {
        setActiveSiteIds((prev) => (
            prev.includes(siteId)
                ? prev.filter((id) => id !== siteId)
                : [...prev, siteId]
        ));
    };

    const setRequiredMen = (siteId, nextValue) => {
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
            <div className="module-shell rostering-shell">
                <section className="rostering-hero">
                    <div className="rostering-hero-copy">
                        <div className="rostering-eyebrow">ESS Workforce Planning</div>
                        <h2>ESS Rostering</h2>
                        <p>
                            Build a clearer site coverage plan with an interface that shows active jobs,
                            labour demand, and the current day plan in one place.
                        </p>
                    </div>

                    <div className="rostering-hero-stats">
                        <div className="rostering-stat-card">
                            <span className="rostering-stat-label">Plan Date</span>
                            <strong>{planDate}</strong>
                        </div>
                        <div className="rostering-stat-card">
                            <span className="rostering-stat-label">Active Jobs</span>
                            <strong>{activeSiteIds.length}</strong>
                            <span className="rostering-stat-meta">{formatSiteCountLabel(activeSiteIds.length)}</span>
                        </div>
                        <div className="rostering-stat-card">
                            <span className="rostering-stat-label">Required Crew</span>
                            <strong>{totalRequiredMen}</strong>
                            <span className="rostering-stat-meta">Across selected jobs</span>
                        </div>
                    </div>
                </section>

                {!isSupervisor ? (
                    <div className="module-warning">
                        Your account is not assigned the `Site Supervisor` role. You can review the current plan, but only supervisors can develop rostering trees.
                    </div>
                ) : null}

                <section className="rostering-layout">
                    <div className="rostering-panel rostering-panel-selection">
                        <div className="rostering-panel-head">
                            <div>
                                <div className="rostering-panel-eyebrow">Step 1</div>
                                <h3>Choose Active Jobs</h3>
                            </div>
                            <div className="module-field rostering-date-field">
                                <label>Date</label>
                                <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
                            </div>
                        </div>

                        {groupedSites.length === 0 ? (
                            <div className="module-empty-inline">No projects available.</div>
                        ) : (
                            <div className="rostering-builder-columns">
                                {groupedSites.map((group) => (
                                    <section key={group.builderId} className="rostering-builder-card">
                                        <header className="rostering-builder-head">
                                            <h4>{group.builderName}</h4>
                                            <SitePill
                                                label={`${group.sites.filter((site) => activeSiteIds.includes(site.id)).length}/${group.sites.length}`}
                                                tone="accent"
                                            />
                                        </header>

                                        <div className="rostering-site-list">
                                            {group.sites.map((site) => {
                                                const active = activeSiteIds.includes(site.id);
                                                return (
                                                    <button
                                                        key={site.id}
                                                        type="button"
                                                        className={`rostering-site-card ${active ? 'active' : ''}`}
                                                        onClick={() => toggleSite(site.id)}
                                                    >
                                                        <div className="rostering-site-card-top">
                                                            <div className="rostering-site-name">{site.projectName}</div>
                                                            <span className={`rostering-site-toggle ${active ? 'active' : ''}`} aria-hidden="true" />
                                                        </div>
                                                        <div className="rostering-site-card-bottom">
                                                            <span>{site.builderName}</span>
                                                            <SitePill label={active ? 'Included' : 'Standby'} tone={active ? 'success' : 'neutral'} />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rostering-panel rostering-panel-planning">
                        <div className="rostering-panel-head">
                            <div>
                                <div className="rostering-panel-eyebrow">Step 2</div>
                                <h3>Set Labour Targets</h3>
                            </div>
                            <SitePill label={`${totalRequiredMen} total crew`} tone="accent" />
                        </div>

                        {activeSites.length === 0 ? (
                            <div className="rostering-empty-state">
                                <div className="rostering-empty-title">No active jobs selected</div>
                                <p>Select at least one job from the left panel to start building the roster tree.</p>
                            </div>
                        ) : (
                            <div className="rostering-demand-grid">
                                {activeSites.map((site, index) => (
                                    <article key={site.id} className="rostering-demand-card">
                                        <div className="rostering-demand-top">
                                            <div>
                                                <div className="rostering-demand-index">Job {index + 1}</div>
                                                <div className="rostering-demand-title">{site.projectName}</div>
                                                <div className="rostering-demand-sub">{site.builderName}</div>
                                            </div>
                                            <SitePill label={activeSiteIds.includes(site.id) ? 'Active' : 'Inactive'} tone="success" />
                                        </div>

                                        <div className="rostering-demand-input-row">
                                            <label htmlFor={`required-men-${site.id}`}>Required Crew</label>
                                            <input
                                                id={`required-men-${site.id}`}
                                                className="rostering-demand-input"
                                                type="number"
                                                min="0"
                                                value={requiredMenBySite[site.id] ?? 0}
                                                onChange={(e) => setRequiredMen(site.id, e.target.value)}
                                            />
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}

                        {error ? <div className="module-error">{error}</div> : null}

                        <div className="rostering-actions">
                            <div className="rostering-actions-copy">
                                <strong>Planning Summary</strong>
                                <span>{formatSiteCountLabel(activeSiteIds.length)} selected with {totalRequiredMen} workers required.</span>
                            </div>
                            <button className="module-primary-btn rostering-action-btn" onClick={savePlan} disabled={saving || !isSupervisor}>
                                {saving ? 'Developing...' : 'Develop Rostering Tree'}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
