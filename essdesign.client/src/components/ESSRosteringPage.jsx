import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Minus, Plus, Trash2, X } from 'lucide-react';
import { rosteringAPI, safetyProjectsAPI } from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';
import './ESSRosteringPage.css';

const PAGE_SIZE = 8;

function todayDateString() {
    return formatDateValue(new Date());
}

function parseDateValue(value) {
    const [year, month, day] = String(value || '').split('-').map(Number);
    return year && month && day ? new Date(year, month - 1, day) : new Date();
}

function formatDateValue(value) {
    const date = value instanceof Date ? value : parseDateValue(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function moveDate(value, days) {
    const date = parseDateValue(value);
    date.setDate(date.getDate() + days);
    return formatDateValue(date);
}

function getWeekDays(value) {
    const selected = parseDateValue(value);
    const mondayOffset = selected.getDay() === 0 ? -6 : 1 - selected.getDay();
    const monday = new Date(selected);
    monday.setDate(selected.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return date;
    });
}

function getInitials(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase();
    return String(words[0] || 'ESS').slice(0, 3).toUpperCase();
}

function getBuilderTone(value) {
    const sum = Array.from(String(value || '')).reduce((total, character) => total + character.charCodeAt(0), 0);
    return `tone-${sum % 4}`;
}

export default function ESSRosteringPage({ user }) {
    const dateInputRef = useRef(null);
    const hydratedRef = useRef(false);
    const dirtyRef = useRef(false);
    const saveTimeoutRef = useRef(null);
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
    const [tablePage, setTablePage] = useState(1);

    const applyPlanState = (plan) => {
        if (plan) {
            setActiveSiteIds(plan.activeSiteIds || []);
            setRequiredMenBySite(plan.requiredMenBySite || {});
            return;
        }

        setActiveSiteIds([]);
        setRequiredMenBySite({});
    };

    const buildPlanSnapshot = (date, siteIds, menMap) => JSON.stringify({
        date,
        activeSiteIds: [...siteIds].sort(),
        requiredMenBySite: Object.fromEntries(
            Object.entries(menMap || {})
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([siteId, value]) => [siteId, value === '' ? '' : Math.max(0, Number(value || 0))])
        )
    });

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
                        siteLocation: project.siteLocation || ''
                    }))
                );

                setSites(flattenedSites);
                setIsSupervisor(supervisor);

                if (plan) {
                    setPlanDate(plan.date || todayDateString());
                    applyPlanState(plan);
                }

                hydratedRef.current = true;
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

    useEffect(() => {
        if (!hydratedRef.current) {
            return undefined;
        }

        let active = true;
        setError('');

        rosteringAPI.getPlan(planDate)
            .then((plan) => {
                if (!active) {
                    return;
                }
                applyPlanState(plan);
                dirtyRef.current = false;
            })
            .catch((err) => {
                if (active) {
                    setError(err.message || 'Failed to load rostering data');
                }
            });

        return () => {
            active = false;
        };
    }, [planDate]);

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

    const weekDays = useMemo(() => getWeekDays(planDate), [planDate]);
    const selectedDate = useMemo(() => parseDateValue(planDate), [planDate]);
    const totalPages = Math.max(1, Math.ceil(activeSites.length / PAGE_SIZE));
    const visibleSites = useMemo(
        () => activeSites.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE),
        [activeSites, tablePage]
    );

    useEffect(() => {
        setTablePage((current) => Math.min(current, totalPages));
    }, [totalPages]);

    const currentSnapshot = useMemo(
        () => buildPlanSnapshot(planDate, activeSiteIds, requiredMenBySite),
        [planDate, activeSiteIds, requiredMenBySite]
    );

    const setRequiredMen = (siteId, nextValue) => {
        dirtyRef.current = true;
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

    const adjustRequiredMen = (siteId, amount) => {
        const current = Math.max(0, Number(requiredMenBySite[siteId] || 0));
        setRequiredMen(siteId, current + amount);
    };

    const removeActiveSite = (siteId) => {
        dirtyRef.current = true;
        setActiveSiteIds((prev) => prev.filter((id) => id !== siteId));
    };

    const clearPlan = () => {
        if (!isSupervisor) return;
        dirtyRef.current = true;
        setActiveSiteIds([]);
        setRequiredMenBySite({});
        setTablePage(1);
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
        dirtyRef.current = true;
        setActiveSiteIds(pickerSiteIds);
        setShowJobPicker(false);
    };

    const persistPlan = async (dateToSave, siteIdsToSave, menBySiteToSave, userIdToSave) => {
        await rosteringAPI.savePlan({
            date: dateToSave,
            activeSiteIds: siteIdsToSave,
            requiredMenBySite: Object.fromEntries(
                Object.entries(menBySiteToSave).map(([siteId, value]) => [
                    siteId,
                    Math.max(0, Number(value || 0))
                ])
            ),
            updatedByUserId: userIdToSave
        });
    };

    const handlePlanDateChange = async (nextDate) => {
        if (!nextDate || nextDate === planDate) {
            return;
        }

        if (dirtyRef.current && isSupervisor) {
            setSaving(true);
            setError('');

            try {
                await persistPlan(planDate, activeSiteIds, requiredMenBySite, user?.id);
                dirtyRef.current = false;
            } catch (err) {
                setError(err.message || 'Could not save roster plan');
                setSaving(false);
                return;
            }

            setSaving(false);
        }

        setPlanDate(nextDate);
    };

    const savePlan = async () => {
        if (!isSupervisor) {
            setError('Only Site Supervisors can edit job requirements.');
            return;
        }

        setSaving(true);
        setError('');

        try {
            await persistPlan(planDate, activeSiteIds, requiredMenBySite, user?.id);
            dirtyRef.current = false;
        } catch (err) {
            setError(err.message || 'Could not save roster plan');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (!hydratedRef.current || !isSupervisor) {
            return undefined;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(async () => {
            if (!dirtyRef.current) {
                return;
            }

            setSaving(true);
            setError('');

            try {
                await persistPlan(planDate, activeSiteIds, requiredMenBySite, user?.id);
                dirtyRef.current = false;
            } catch (err) {
                setError(err.message || 'Could not save roster plan');
            } finally {
                setSaving(false);
            }
        }, 700);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [planDate, activeSiteIds, requiredMenBySite, isSupervisor, user?.id]);

    useEffect(() => {
        if (!hydratedRef.current) {
            return undefined;
        }

        const interval = window.setInterval(async () => {
            if (dirtyRef.current || saving) {
                return;
            }

            try {
                const remotePlan = await rosteringAPI.getPlan(planDate);
                const remoteSnapshot = buildPlanSnapshot(
                    planDate,
                    remotePlan?.activeSiteIds || [],
                    remotePlan?.requiredMenBySite || {}
                );

                if (remoteSnapshot !== currentSnapshot) {
                    applyPlanState(remotePlan);
                }
            } catch {
                // Keep existing state if background sync fails.
            }
        }, 10000);

        return () => window.clearInterval(interval);
    }, [planDate, currentSnapshot, saving]);

    if (loading) {
        return <div className="module-page"><div className="page-loading-brandmark"><LoadingBrandmark label="Loading rostering data" /></div></div>;
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
        <div className="module-page rostering-landing-page">
            <div className="module-shell rostering-shell rostering-landing-shell">
                <section className="rostering-calendar" aria-label="Roster plan date">
                    <div className="rostering-calendar-heading">
                        <h1>Employee Rostering</h1>
                        <div className="rostering-date-control">
                            <button type="button" onClick={() => handlePlanDateChange(moveDate(planDate, -1))} aria-label="Previous day">
                                <ChevronLeft aria-hidden="true" />
                            </button>
                            <button type="button" className="rostering-date-trigger" onClick={openDatePicker}>
                                <CalendarDays aria-hidden="true" />
                                <span>{selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                            </button>
                            <button type="button" onClick={() => handlePlanDateChange(moveDate(planDate, 1))} aria-label="Next day">
                                <ChevronRight aria-hidden="true" />
                            </button>
                            <input
                                ref={dateInputRef}
                                className="rostering-date-input"
                                type="date"
                                value={planDate}
                                onChange={(event) => handlePlanDateChange(event.target.value)}
                                tabIndex={-1}
                                aria-label="Choose plan date"
                            />
                        </div>
                    </div>

                    <div className="rostering-week-strip">
                        <button type="button" className="rostering-week-arrow" onClick={() => handlePlanDateChange(moveDate(planDate, -7))} aria-label="Previous week">
                            <ChevronLeft aria-hidden="true" />
                        </button>
                        {weekDays.map((date) => {
                            const dateValue = formatDateValue(date);
                            const selected = dateValue === planDate;
                            return (
                                <button
                                    type="button"
                                    key={dateValue}
                                    className={`rostering-week-day${selected ? ' is-selected' : ''}`}
                                    onClick={() => handlePlanDateChange(dateValue)}
                                    aria-pressed={selected}
                                >
                                    <span>{date.toLocaleDateString('en-AU', { weekday: 'short' })}</span>
                                    <strong>{date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</strong>
                                </button>
                            );
                        })}
                        <button type="button" className="rostering-week-arrow" onClick={() => handlePlanDateChange(moveDate(planDate, 7))} aria-label="Next week">
                            <ChevronRight aria-hidden="true" />
                        </button>
                    </div>
                </section>

                {!isSupervisor ? (
                    <div className="module-warning rostering-view-warning">
                        Your account is not assigned the Site Supervisor role. You can view requirements, but you cannot edit them.
                    </div>
                ) : null}

                <section className="rostering-requirements-card">
                    <header className="rostering-requirements-header">
                        <div className="rostering-requirements-copy">
                            <h2>Job Requirements</h2>
                            <p>Select jobs and set the required workforce for each site.</p>
                        </div>
                        <div className="rostering-requirements-summary">
                            <div><strong>{activeSites.length}</strong><span>Jobs Selected</span></div>
                            <div><strong>{totalRequiredMen}</strong><span>People Required</span></div>
                            <button type="button" className="rostering-add-job" onClick={openJobPicker} disabled={!isSupervisor}>
                                <Plus aria-hidden="true" /> Add Job
                            </button>
                        </div>
                    </header>

                    <div className="rostering-table-scroll">
                        <table className="rostering-requirements-table">
                            <thead>
                                <tr>
                                    <th>Builder</th>
                                    <th>Project / Jobsite</th>
                                    <th>Site Location</th>
                                    <th>People Required</th>
                                    <th><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleSites.length ? visibleSites.map((site) => {
                                    const requiredMen = Math.max(0, Number(requiredMenBySite[site.id] || 0));
                                    return (
                                        <tr key={site.id}>
                                            <td>
                                                <div className="rostering-builder-cell">
                                                    <span className={`rostering-builder-mark ${getBuilderTone(site.builderName)}`}>{getInitials(site.builderName)}</span>
                                                    <span>{site.builderName}</span>
                                                </div>
                                            </td>
                                            <td><strong className="rostering-project-name">{site.projectName}</strong></td>
                                            <td>
                                                <span className={`rostering-location${site.siteLocation ? '' : ' is-empty'}`}>
                                                    <MapPin aria-hidden="true" /> {site.siteLocation || 'Site location not set'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="rostering-people-stepper">
                                                    <button type="button" onClick={() => adjustRequiredMen(site.id, -1)} disabled={!isSupervisor || requiredMen === 0} aria-label={`Decrease people required for ${site.projectName}`}>
                                                        <Minus aria-hidden="true" />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={requiredMenBySite[site.id] ?? 0}
                                                        onChange={(event) => setRequiredMen(site.id, event.target.value)}
                                                        disabled={!isSupervisor}
                                                        aria-label={`People required for ${site.projectName}`}
                                                    />
                                                    <button type="button" onClick={() => adjustRequiredMen(site.id, 1)} disabled={!isSupervisor} aria-label={`Increase people required for ${site.projectName}`}>
                                                        <Plus aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="rostering-actions-cell">
                                                <button type="button" className="rostering-delete-job" onClick={() => removeActiveSite(site.id)} disabled={!isSupervisor} aria-label={`Remove ${site.projectName}`}>
                                                    <Trash2 aria-hidden="true" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="5" className="rostering-table-empty">
                                            <div><Plus aria-hidden="true" /></div>
                                            <strong>No jobs selected for this date</strong>
                                            <span>Add a job to begin setting workforce requirements.</span>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {error ? <div className="module-error rostering-save-error">{error}</div> : null}

                    <footer className="rostering-requirements-footer">
                        <span>{activeSites.length} {activeSites.length === 1 ? 'job' : 'jobs'} in this plan</span>
                        <nav className="rostering-pagination" aria-label="Job requirement pages">
                            <button type="button" onClick={() => setTablePage(1)} disabled={tablePage === 1} aria-label="First page">«</button>
                            <button type="button" onClick={() => setTablePage((page) => Math.max(1, page - 1))} disabled={tablePage === 1} aria-label="Previous page"><ChevronLeft aria-hidden="true" /></button>
                            <span>{tablePage}</span>
                            <button type="button" onClick={() => setTablePage((page) => Math.min(totalPages, page + 1))} disabled={tablePage === totalPages} aria-label="Next page"><ChevronRight aria-hidden="true" /></button>
                            <button type="button" onClick={() => setTablePage(totalPages)} disabled={tablePage === totalPages} aria-label="Last page">»</button>
                        </nav>
                        <div className="rostering-footer-actions">
                            <strong>Total required: {totalRequiredMen} people</strong>
                            <button type="button" className="rostering-clear-plan" onClick={clearPlan} disabled={!isSupervisor || activeSites.length === 0}>Clear plan</button>
                            <button type="button" className="rostering-save-requirements" onClick={savePlan} disabled={saving || !isSupervisor}>
                                {saving ? 'Saving...' : 'Save Requirements'}
                            </button>
                        </div>
                    </footer>
                </section>
            </div>

            {showJobPicker ? (
                <div className="module-modal-backdrop" onClick={() => setShowJobPicker(false)}>
                    <div className="module-modal rostering-job-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="rostering-add-jobs-title">
                        <div className="module-modal-header rostering-job-modal-header">
                            <div>
                                <h3 id="rostering-add-jobs-title">Add Jobs to Plan</h3>
                                <p>Select every jobsite that requires a workforce target.</p>
                            </div>
                            <button type="button" className="rostering-modal-close" onClick={() => setShowJobPicker(false)} aria-label="Close job picker"><X aria-hidden="true" /></button>
                        </div>
                        <div className="rostering-job-modal-body">
                            {groupedSites.length === 0 ? <div className="module-empty-inline">No projects available.</div> : null}
                            <div className="scroll-area rostering-job-picker-scroll">
                                {groupedSites.map((group) => (
                                    <div key={group.builderId} className="client-group">
                                        <div className="client-header"><div className="client-name">{group.builderName}</div></div>
                                        <div className="module-check-list">
                                            {group.sites.map((site) => {
                                                const selected = pickerSiteIds.includes(site.id);
                                                return (
                                                    <button key={site.id} type="button" className={`job-card${selected ? ' selected' : ''}`} onClick={() => togglePickerSite(site.id)} aria-pressed={selected}>
                                                        <div className="rostering-picker-site">
                                                            <span className={`rostering-builder-mark ${getBuilderTone(site.builderName)}`}>{getInitials(site.builderName)}</span>
                                                            <span><strong>{site.projectName}</strong><small>{site.siteLocation || 'Site location not set'}</small></span>
                                                        </div>
                                                        <span className={`rostering-picker-status${selected ? ' is-selected' : ''}`}>{selected ? 'Selected' : 'Add'}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="module-form-actions">
                            <button type="button" className="module-secondary-btn" onClick={() => setShowJobPicker(false)}>Cancel</button>
                            <button type="button" className="module-primary-btn" onClick={confirmJobPicker}>Update Selected Jobs</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
