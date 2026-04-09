import React, { useEffect, useMemo, useState } from 'react';
import { rosteringAPI, safetyProjectsAPI } from '../services/api';

function emptyForm() {
    return {
        id: null,
        firstName: '',
        lastName: '',
        phoneNumber: '',
        leadingHand: false,
        preferredSiteIds: []
    };
}

function normalizePreferredSiteIds(siteIds) {
    return siteIds.filter(Boolean).slice(0, 3);
}

function TreeIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M12 3.25a4.1 4.1 0 0 1 4.1 4.1c0 .37-.05.73-.15 1.08a3.6 3.6 0 0 1 2.8 3.52 3.6 3.6 0 0 1-3.6 3.6H13.2v2.35h3.15a.9.9 0 1 1 0 1.8H13.2v2.05a.9.9 0 1 1-1.8 0V19.7H8.25a.9.9 0 1 1 0-1.8h3.15v-2.35H8.85a3.6 3.6 0 0 1-3.6-3.6 3.6 3.6 0 0 1 2.8-3.52 4.1 4.1 0 0 1-.15-1.08A4.1 4.1 0 0 1 12 3.25Z"
                fill="currentColor"
            />
        </svg>
    );
}

export default function EmployeesPage({ onOpenLeadingHandRelationships }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [employees, setEmployees] = useState([]);
    const [sites, setSites] = useState([]);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(emptyForm());

    useEffect(() => {
        let active = true;
        Promise.all([safetyProjectsAPI.getBuilders(), rosteringAPI.getEmployees()])
            .then(([builders, employeeRows]) => {
                if (!active) {
                    return;
                }
                const flattenedSites = builders.flatMap(builder =>
                    builder.projects.map(project => ({
                        id: `${builder.id}:${project.id}`,
                        label: `${builder.name} — ${project.name}`
                    }))
                );
                setSites(flattenedSites);
                setEmployees(employeeRows);
            })
            .catch(err => {
                if (active) {
                    setError(err.message || 'Failed to load employees');
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

    const siteLabelById = useMemo(
        () => Object.fromEntries(sites.map(site => [site.id, site.label])),
        [sites]
    );

    const filteredEmployees = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) {
            return employees;
        }

        return employees.filter(employee => {
            const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
            const phone = (employee.phoneNumber || '').toLowerCase();
            const lh = employee.leadingHand ? 'leading hand lh' : '';
            const prefs = employee.preferredSiteIds.map(id => (siteLabelById[id] || '').toLowerCase()).join(' ');
            return fullName.includes(q) || phone.includes(q) || prefs.includes(q) || lh.includes(q);
        });
    }, [employees, search, siteLabelById]);

    const updatePreferredSite = (index, siteId) => {
        setForm(prev => {
            const next = [...prev.preferredSiteIds];
            next[index] = siteId || '';
            return { ...prev, preferredSiteIds: normalizePreferredSiteIds(next) };
        });
    };

    const saveEmployee = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const next = await rosteringAPI.saveEmployee(form);
            setEmployees(next);
            setShowModal(false);
            setForm(emptyForm());
        } catch (err) {
            setError(err.message || 'Could not save employee');
        } finally {
            setSaving(false);
        }
    };

    const removeEmployee = async (employeeId) => {
        try {
            const next = await rosteringAPI.deleteEmployee(employeeId);
            setEmployees(next);
        } catch (err) {
            setError(err.message || 'Could not delete employee');
        }
    };

    return (
        <div className="module-page">
            <div className="module-shell employees-shell">
                <div className="employees-toolbar">
                    <div className="employees-toolbar-copy">
                        <div className="employees-toolbar-eyebrow">ESS Workforce</div>
                        <h2>Employee Directory</h2>
                        <p>Manage employee details, preferred projects, and leading hand relationships from one place.</p>
                    </div>
                    <button className="module-primary-btn" onClick={() => { setForm(emptyForm()); setShowModal(true); }}>
                        Add Employee
                    </button>
                </div>

                <div className="module-card employees-card">
                    <div className="employees-search-row">
                        <div className="module-field employees-search-field">
                            <label>Search</label>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, or preferred site" />
                        </div>
                        <div className="employees-search-stats">
                            <div className="employees-stat">
                                <span className="employees-stat-value">{employees.length}</span>
                                <span className="employees-stat-label">Total</span>
                            </div>
                            <div className="employees-stat">
                                <span className="employees-stat-value">{employees.filter(employee => employee.leadingHand).length}</span>
                                <span className="employees-stat-label">Leading Hands</span>
                            </div>
                            <div className="employees-stat">
                                <span className="employees-stat-value">{filteredEmployees.length}</span>
                                <span className="employees-stat-label">Visible</span>
                            </div>
                        </div>
                    </div>
                    {error ? <div className="module-error">{error}</div> : null}
                    {loading ? (
                        <div className="module-empty-inline">Loading employees...</div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="module-empty-inline">No employees found.</div>
                    ) : (
                        <div className="employee-cluster-grid">
                            {filteredEmployees.map(employee => (
                                <div key={employee.id} className="module-list-card employee-cluster-card">
                                    {employee.leadingHand ? (
                                        <button
                                            className="employee-graph-icon-btn"
                                            onClick={() => onOpenLeadingHandRelationships?.(employee)}
                                            aria-label={`Open leading hand relationships for ${employee.firstName} ${employee.lastName}`}
                                            title="Leading Hand Relationships"
                                        >
                                            <TreeIcon />
                                        </button>
                                    ) : null}
                                    <div className="employee-card-top">
                                        <div className="employee-card-identity">
                                            <div className="employee-card-heading">
                                                <div className="module-item-title">{employee.firstName} {employee.lastName}</div>
                                                {employee.leadingHand ? <span className="employee-lh-badge">LH</span> : null}
                                            </div>
                                            <div className="module-item-sub employee-phone">{employee.phoneNumber || 'No phone number'}</div>
                                        </div>
                                        <div className="employee-card-statuses">
                                            <div className="employee-status-pill">
                                                <span className="employee-status-dot employee-status-dot-phone" />
                                                Contact Ready
                                            </div>
                                            {employee.leadingHand ? (
                                                <div className="employee-status-pill employee-status-pill-lh">Leading Hand</div>
                                            ) : (
                                                <div className="employee-status-pill employee-status-pill-neutral">Crew Member</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="employee-card-actions">
                                        <div className="employee-card-spacer" />
                                        <div className="employee-card-action-group">
                                            <button className="module-secondary-btn" onClick={() => { setForm(employee); setShowModal(true); }}>Edit</button>
                                            <button className="module-danger-btn" onClick={() => removeEmployee(employee.id)}>Delete</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showModal && (
                <div className="module-modal-backdrop" onClick={() => setShowModal(false)}>
                    <div className="module-modal" onClick={e => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>{form.id ? 'Edit Employee' : 'Add Employee'}</h3>
                            <button className="nav-drawer-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <form className="module-form" onSubmit={saveEmployee}>
                            <div className="module-grid module-grid-two">
                                <div className="module-field">
                                    <label>First Name</label>
                                    <input value={form.firstName} onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))} />
                                </div>
                                <div className="module-field">
                                    <label>Last Name</label>
                                    <input value={form.lastName} onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))} />
                                </div>
                            </div>
                            <div className="module-field">
                                <label>Phone Number</label>
                                <input value={form.phoneNumber} onChange={e => setForm(prev => ({ ...prev, phoneNumber: e.target.value }))} />
                            </div>
                            <label className="module-check-row employee-leading-hand-row">
                                <input
                                    type="checkbox"
                                    checked={form.leadingHand}
                                    onChange={e => setForm(prev => ({ ...prev, leadingHand: e.target.checked }))}
                                />
                                <span>Leading Hand</span>
                            </label>
                            <div className="employee-preferences-grid">
                                {[0, 1, 2].map(index => (
                                    <div key={index} className="module-field">
                                        <label>{index + 1}</label>
                                        <select
                                            value={form.preferredSiteIds[index] || ''}
                                            onChange={e => updatePreferredSite(index, e.target.value)}
                                        >
                                            <option value="">Select active job site</option>
                                            {sites.map(site => (
                                                <option
                                                    key={site.id}
                                                    value={site.id}
                                                    disabled={form.preferredSiteIds.includes(site.id) && form.preferredSiteIds[index] !== site.id}
                                                >
                                                    {site.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            {form.id && form.leadingHand ? (
                                <button
                                    type="button"
                                    className="module-secondary-btn"
                                    onClick={() => {
                                        setShowModal(false);
                                        onOpenLeadingHandRelationships?.(form);
                                    }}
                                >
                                    Leading Hand Relationships
                                </button>
                            ) : null}
                            {error ? <div className="module-error">{error}</div> : null}
                            <button type="submit" className="module-primary-btn" disabled={saving}>
                                {saving ? 'Saving...' : 'Save Employee'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
