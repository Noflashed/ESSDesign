import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rosteringAPI, safetyProjectsAPI } from '../services/api';

function todayDateString() {
    return new Date().toISOString().slice(0, 10);
}

export default function ESSRosteringPage({ user }) {
    const dateInputRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showJobPicker, setShowJobPicker] = useState(false);
    const [isSupervisor, setIsSupervisor] = useState(false);
    const [sites, setSites] = useState([]);
    const [planDate, setPlanDate] = useState(todayDateString());
    const [activeSiteIds, setActiveSiteIds] = useState([]);
    const [requiredMenBySite, setRequiredMenBySite] = useState({});
    const [pickerSiteIds, setPickerSiteIds] = useState([]);

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

    const removeActiveSite = (siteId) => {
        setActiveSiteIds((prev) => prev.filter((id) => id !== siteId));
    };

    const togglePickerSite = (siteId) => {
        setPickerSiteIds((prev) => (
            prev.includes(siteId)
                ? prev.filter((id) => id !== siteId)
                : [...prev, siteId]
        ));
    };

    const openJobPicker = () => {
        setPickerSiteIds(activeSiteIds);
        setShowJobPicker(true);
    };

    const confirmJobPicker = () => {
        setActiveSiteIds(pickerSiteIds);
        setShowJobPicker(false);
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

    const openDatePicker = () => {
        const input = dateInputRef.current;
        if (!input) {
            return;
        }

        if (typeof input.showPicker === 'function') {
            input.showPicker();
            return;
        }

        input.focus();
        input.click();
    };

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
                            <input
                                ref={dateInputRef}
                                className="stat-card-date-input"
                                type="date"
                                value={planDate}
                                onChange={(e) => setPlanDate(e.target.value)}
                                tabIndex={-1}
                                aria-label="Choose plan date"
                            />
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

                <section className="section-card rostering-plan-card">
                    <div className="module-split-row rostering-plan-header">
                        <div>
                            <span className="step-pill">Planner</span>
                            <div className="page-title" style={{ fontSize: 18, marginTop: 8, marginBottom: 0 }}>Active Jobs</div>
                        </div>
                        <button
                            type="button"
                            className="module-secondary-btn rostering-add-jobs-btn"
                            onClick={openJobPicker}
                        >
                            Add Jobs
                        </button>
                    </div>

                    {activeSites.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">+</div>
                            <div className="page-desc">Add one or more jobs to start building the plan.</div>
                        </div>
                    ) : (
                        <div className="rostering-plan-list">
                            {activeSites.map((site) => (
                                <div key={site.id} className="labour-row rostering-plan-row">
                                    <div>
                                        <div className="job-client">{site.projectName}</div>
                                    </div>
                                    <div className="rostering-plan-actions">
                                        <input
                                            className="module-number-input"
                                            type="number"
                                            min="0"
                                            value={requiredMenBySite[site.id] ?? 0}
                                            onChange={(e) => setRequiredMen(site.id, e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="rostering-remove-btn"
                                            onClick={() => removeActiveSite(site.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
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

            {showJobPicker ? (
                <div className="module-modal-backdrop" onClick={() => setShowJobPicker(false)}>
                    <div className="module-modal rostering-job-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Add Active Jobs</h3>
                            <button className="nav-drawer-close" onClick={() => setShowJobPicker(false)}>×</button>
                        </div>
                        <div className="rostering-job-modal-body">
                            {groupedSites.length === 0 ? <div className="module-empty-inline">No projects available.</div> : null}
                            <div className="scroll-area rostering-job-picker-scroll">
                                {groupedSites.map((group) => (
                                    <div key={group.builderId} className="client-group">
                                        <div className="client-header">
                                            <div className="client-name">{group.builderName}</div>
                                        </div>
                                        <div className="module-check-list">
                                            {group.sites.map((site) => {
                                                const selected = pickerSiteIds.includes(site.id);
                                                return (
                                                    <button
                                                        key={site.id}
                                                        type="button"
                                                        className={`job-card ${selected ? 'selected' : ''}`}
                                                        onClick={() => togglePickerSite(site.id)}
                                                    >
                                                        <div>
                                                            <div className="job-client">{site.projectName}</div>
                                                            <div className="job-addr">{site.builderName}</div>
                                                        </div>
                                                        <span className={`badge ${selected ? 'badge-count' : 'badge-standby'}`}>
                                                            {selected ? 'On' : 'Add'}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="module-form-actions">
                            <button type="button" className="module-secondary-btn" onClick={() => setShowJobPicker(false)}>
                                Cancel
                            </button>
                            <button type="button" className="module-primary-btn" onClick={confirmJobPicker}>
                                Add Selected Jobs
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
