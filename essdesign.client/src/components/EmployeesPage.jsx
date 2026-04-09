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

export default function EmployeesPage() {
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

    const toggleSite = (siteId) => {
        setForm(prev => {
            if (prev.preferredSiteIds.includes(siteId)) {
                return { ...prev, preferredSiteIds: prev.preferredSiteIds.filter(id => id !== siteId) };
            }
            if (prev.preferredSiteIds.length >= 3) {
                return prev;
            }
            return { ...prev, preferredSiteIds: [...prev.preferredSiteIds, siteId] };
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
            <div className="module-shell">
                <div className="module-header">
                    <div>
                        <h2>Employees</h2>
                        <p>Shared employee register backed by the same Supabase tables as mobile.</p>
                    </div>
                    <button className="module-primary-btn" onClick={() => { setForm(emptyForm()); setShowModal(true); }}>
                        Add Employee
                    </button>
                </div>

                <div className="module-card">
                    <div className="module-field">
                        <label>Search</label>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, or preferred site" />
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
                                    <div className="module-list-header">
                                        <div>
                                            <div className="employee-card-heading">
                                                <div className="module-item-title">{employee.firstName} {employee.lastName}</div>
                                                {employee.leadingHand ? <span className="employee-lh-badge">LH</span> : null}
                                            </div>
                                            <div className="module-item-sub">{employee.phoneNumber || 'No phone number'}</div>
                                        </div>
                                        <div className="module-list-actions">
                                            <button className="module-secondary-btn" onClick={() => { setForm(employee); setShowModal(true); }}>Edit</button>
                                            <button className="module-danger-btn" onClick={() => removeEmployee(employee.id)}>Delete</button>
                                        </div>
                                    </div>
                                    <div className="module-preferences">
                                        <div className="module-card-title minor">Preferred Sites</div>
                                        {employee.preferredSiteIds.length === 0 ? (
                                            <div className="module-item-sub">No preferred sites selected.</div>
                                        ) : employee.preferredSiteIds.map((siteId, index) => (
                                            <div key={siteId} className="module-preference-row">{index + 1}. {siteLabelById[siteId] || siteId}</div>
                                        ))}
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
                            <div className="module-card-title minor">Preferred Sites (up to 3)</div>
                            <div className="module-check-list limited">
                                {sites.map(site => (
                                    <label key={site.id} className="module-check-row">
                                        <input type="checkbox" checked={form.preferredSiteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />
                                        <span>{site.label}</span>
                                    </label>
                                ))}
                            </div>
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
