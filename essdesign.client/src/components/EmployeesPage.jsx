import React, { useEffect, useMemo, useState } from 'react';
import { authAPI, rosteringAPI, safetyProjectsAPI } from '../services/api';

function emptyForm() {
    return {
        id: null,
        firstName: '',
        lastName: '',
        phoneNumber: '',
        email: '',
        leadingHand: false,
        linkedAuthUserId: null,
        inviteSentAt: null,
        verifiedAt: null,
        currentEmail: '',
        preferredSiteIds: []
    };
}

function normalizePreferredSiteIds(siteIds) {
    return siteIds.filter(Boolean).slice(0, 3);
}

function TreeIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="5.25" r="2.25" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="6" cy="18" r="2.25" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="18" cy="18" r="2.25" stroke="currentColor" strokeWidth="1.8" />
            <path
                d="M12 7.5v4.4M12 11.9H6M12 11.9h6M6 11.9v3.85M18 11.9v3.85"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function EditIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M4 19.75h4.4L18.3 9.86a1.7 1.7 0 0 0 0-2.4L16.54 5.7a1.7 1.7 0 0 0-2.4 0L4 15.85v3.9Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <path d="M12.95 6.9l4.1 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function DeleteIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M5 7h14M9 7V5.9c0-.77.63-1.4 1.4-1.4h3.2c.77 0 1.4.63 1.4 1.4V7M8.1 7l.7 11.1c.04.72.64 1.29 1.36 1.29h3.74c.72 0 1.32-.57 1.36-1.29L15.9 7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M10 10.25v5.5M14 10.25v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function EmployeeActionButton({ title, onClick, children, danger = false }) {
    return (
        <button
            type="button"
            className={`employee-icon-btn ${danger ? 'danger' : ''}`.trim()}
            onClick={onClick}
            aria-label={title}
            title={title}
        >
            {children}
        </button>
    );
}

export default function EmployeesPage({ onOpenLeadingHandRelationships }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [inviteSending, setInviteSending] = useState(false);
    const [error, setError] = useState('');
    const [inviteMessage, setInviteMessage] = useState('');
    const [employees, setEmployees] = useState([]);
    const [sites, setSites] = useState([]);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [employeePendingDelete, setEmployeePendingDelete] = useState(null);
    const [saveAndInvite, setSaveAndInvite] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                await authAPI.syncEmployeeLinks();
            } catch (err) {
                console.error('Failed to sync existing employee links:', err);
            }

            return Promise.all([safetyProjectsAPI.getBuilders(), rosteringAPI.getEmployees()]);
        })()
            .then(([builders, employeeRows]) => {
                if (!active) {
                    return;
                }
                const flattenedSites = builders.flatMap((builder) =>
                    builder.projects.map((project) => ({
                        id: `${builder.id}:${project.id}`,
                        label: `${builder.name} — ${project.name}`
                    }))
                );
                setSites(flattenedSites);
                setEmployees(employeeRows);
            })
            .catch((err) => {
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
        () => Object.fromEntries(sites.map((site) => [site.id, site.label])),
        [sites]
    );

    const filteredEmployees = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) {
            return employees;
        }

        return employees.filter((employee) => {
            const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
            const phone = (employee.phoneNumber || '').toLowerCase();
            const email = (employee.email || '').toLowerCase();
            const lh = employee.leadingHand ? 'leading hand lh verified' : 'verified';
            const prefs = employee.preferredSiteIds.map((id) => (siteLabelById[id] || '').toLowerCase()).join(' ');
            return fullName.includes(q) || phone.includes(q) || email.includes(q) || prefs.includes(q) || lh.includes(q);
        });
    }, [employees, search, siteLabelById]);

    const openEmployeeEditor = (employee) => {
        setForm({
            ...employee,
            email: employee.email || '',
            linkedAuthUserId: employee.linkedAuthUserId || null,
            inviteSentAt: employee.inviteSentAt || null,
            verifiedAt: employee.verifiedAt || null,
            currentEmail: employee.email || ''
        });
        setError('');
        setInviteMessage('');
        setSaveAndInvite(false);
        setShowModal(true);
    };

    const updatePreferredSite = (index, siteId) => {
        setForm((prev) => {
            const next = [...prev.preferredSiteIds];
            next[index] = siteId || '';
            return { ...prev, preferredSiteIds: normalizePreferredSiteIds(next) };
        });
    };

    const saveEmployee = async (event, { inviteAfterSave = false } = {}) => {
        event?.preventDefault?.();
        setSaving(true);
        setError('');
        setInviteMessage('');
        try {
            const next = await rosteringAPI.saveEmployee(form);
            setEmployees(next);

            if (inviteAfterSave) {
                const normalizedEmail = (form.email || '').trim().toLowerCase();
                if (!normalizedEmail) {
                    throw new Error('Enter an email address before sending an invite.');
                }

                const savedEmployee = next.find((employee) =>
                    (form.id ? employee.id === form.id : true)
                    && (employee.email || '').trim().toLowerCase() === normalizedEmail
                    && (employee.firstName || '').trim() === form.firstName.trim()
                    && (employee.lastName || '').trim() === form.lastName.trim()
                );

                if (!savedEmployee?.id) {
                    throw new Error('Employee was saved, but could not be matched for invite sending.');
                }

                await authAPI.inviteEmployee({
                    employeeId: savedEmployee.id,
                    email: normalizedEmail,
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim()
                });

                const refreshedEmployees = await rosteringAPI.getEmployees();
                setEmployees(refreshedEmployees);
                setInviteMessage(`Invite sent to ${normalizedEmail}`);
                setShowModal(false);
                setForm(emptyForm());
                setSaveAndInvite(false);
                return;
            }

            setShowModal(false);
            setForm(emptyForm());
            setSaveAndInvite(false);
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
            setEmployeePendingDelete(null);
        } catch (err) {
            setError(err.message || 'Could not delete employee');
        }
    };

    const sendEmployeeInvite = async () => {
        if (!form.id) {
            setError('Save the employee before sending an invite.');
            return;
        }
        if (!form.email.trim()) {
            setError('Enter an email address before sending an invite.');
            return;
        }

        setInviteSending(true);
        setError('');
        setInviteMessage('');
        try {
            await authAPI.inviteEmployee({
                employeeId: form.id,
                email: form.email.trim(),
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim()
            });
            const nextEmployees = await rosteringAPI.getEmployees();
            setEmployees(nextEmployees);
            const refreshed = nextEmployees.find((employee) => employee.id === form.id);
            if (refreshed) {
                setForm({
                    ...refreshed,
                    email: refreshed.email || '',
                    linkedAuthUserId: refreshed.linkedAuthUserId || null,
                    inviteSentAt: refreshed.inviteSentAt || null,
                    verifiedAt: refreshed.verifiedAt || null,
                    currentEmail: refreshed.email || ''
                });
            }
            setInviteMessage(`Invite sent to ${form.email.trim()}`);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Could not send employee invite');
        } finally {
            setInviteSending(false);
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
                    <button className="module-primary-btn" onClick={() => { setForm(emptyForm()); setShowModal(true); setInviteMessage(''); setError(''); setSaveAndInvite(false); }}>
                        Add Employee
                    </button>
                </div>

                <div className="module-card employees-card">
                    <div className="employees-search-row">
                        <div className="module-field employees-search-field">
                            <label>Search</label>
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email, or preferred site" />
                        </div>
                        <div className="employees-search-stats">
                            <div className="employees-stat">
                                <span className="employees-stat-value">{employees.length}</span>
                                <span className="employees-stat-label">Total</span>
                            </div>
                            <div className="employees-stat">
                                <span className="employees-stat-value">{employees.filter((employee) => employee.leadingHand).length}</span>
                                <span className="employees-stat-label">Leading Hands</span>
                            </div>
                            <div className="employees-stat">
                                <span className="employees-stat-value">{filteredEmployees.length}</span>
                                <span className="employees-stat-label">Visible</span>
                            </div>
                        </div>
                    </div>
                    {error && !showModal && !employeePendingDelete ? <div className="module-error">{error}</div> : null}
                    {loading ? (
                        <div className="module-empty-inline">Loading employees...</div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="module-empty-inline">No employees found.</div>
                    ) : (
                        <div className="employee-cluster-grid">
                            {filteredEmployees.map((employee) => (
                                <div key={employee.id} className="module-list-card employee-cluster-card">
                                    <div className="employee-card-icon-rail">
                                        {employee.leadingHand ? (
                                            <EmployeeActionButton
                                                title={`Open leading hand relationships for ${employee.firstName} ${employee.lastName}`}
                                                onClick={() => onOpenLeadingHandRelationships?.(employee)}
                                            >
                                                <TreeIcon />
                                            </EmployeeActionButton>
                                        ) : null}
                                        <EmployeeActionButton
                                            title={`Edit ${employee.firstName} ${employee.lastName}`}
                                            onClick={() => openEmployeeEditor(employee)}
                                        >
                                            <EditIcon />
                                        </EmployeeActionButton>
                                        <EmployeeActionButton
                                            danger
                                            title={`Delete ${employee.firstName} ${employee.lastName}`}
                                            onClick={() => setEmployeePendingDelete(employee)}
                                        >
                                            <DeleteIcon />
                                        </EmployeeActionButton>
                                    </div>

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
                                            {!employee.verified && employee.inviteSentAt ? (
                                                <div className="employee-status-pill employee-status-pill-invited">Invited</div>
                                            ) : null}
                                            {employee.verified ? (
                                                <div className="employee-status-pill employee-status-pill-verified">Verified</div>
                                            ) : null}
                                            {employee.leadingHand ? (
                                                <div className="employee-status-pill employee-status-pill-lh">Leading Hand</div>
                                            ) : (
                                                <div className="employee-status-pill employee-status-pill-neutral">Crew Member</div>
                                            )}
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
                    <div className="module-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>{form.id ? 'Edit Employee' : 'Add Employee'}</h3>
                            <button className="nav-drawer-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <form className="module-form" onSubmit={(event) => saveEmployee(event, { inviteAfterSave: saveAndInvite })}>
                            <div className="module-grid module-grid-two">
                                <div className="module-field">
                                    <label>First Name</label>
                                    <input value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                                </div>
                                <div className="module-field">
                                    <label>Last Name</label>
                                    <input value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                                </div>
                            </div>
                            <div className="module-grid module-grid-two">
                                <div className="module-field">
                                    <label>Phone Number</label>
                                    <input value={form.phoneNumber} onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))} />
                                </div>
                                <div className="module-field">
                                    <label>Email Address</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                                        placeholder="employee@company.com"
                                    />
                                </div>
                            </div>
                            <label className="module-check-row employee-leading-hand-row">
                                <input
                                    type="checkbox"
                                    checked={form.leadingHand}
                                    onChange={(e) => setForm((prev) => ({ ...prev, leadingHand: e.target.checked }))}
                                />
                                <span>Leading Hand</span>
                            </label>
                            <div className="employee-preferences-grid">
                                {[0, 1, 2].map((index) => (
                                    <div key={index} className="module-field">
                                        <label>{index + 1}</label>
                                        <select
                                            value={form.preferredSiteIds[index] || ''}
                                            onChange={(e) => updatePreferredSite(index, e.target.value)}
                                        >
                                            <option value="">Select active job site</option>
                                            {sites.map((site) => (
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
                            {form.id ? (
                                <div className="employee-account-link-panel">
                                    <div className="employee-account-link-copy">
                                        <div className="employee-account-link-title">Employee Account</div>
                                        <div className="employee-account-link-sub">
                                            Send an account setup email using the stored name and email. The invite page will only ask for password and confirmation.
                                        </div>
                                    </div>
                                    <div className="employee-account-link-actions">
                                        {form.verifiedAt ? (
                                            <div className="employee-status-pill employee-status-pill-verified">Verified</div>
                                        ) : null}
                                        <button
                                            type="button"
                                            className="module-primary-btn compact"
                                            onClick={sendEmployeeInvite}
                                            disabled={inviteSending || !form.email.trim()}
                                        >
                                            {inviteSending ? 'Sending...' : 'Invite User'}
                                        </button>
                                    </div>
                                    {inviteMessage ? <div className="module-success">{inviteMessage}</div> : null}
                                </div>
                            ) : null}
                            {error ? <div className="module-error">{error}</div> : null}
                            <div className="module-form-actions">
                                {!form.id ? (
                                    <button
                                        type="button"
                                        className="module-secondary-btn"
                                        disabled={saving}
                                        onClick={(event) => {
                                            setSaveAndInvite(true);
                                            saveEmployee(event, { inviteAfterSave: true });
                                        }}
                                    >
                                        {saving && saveAndInvite ? 'Saving...' : 'Save & Invite'}
                                    </button>
                                ) : null}
                                <button
                                    type="submit"
                                    className="module-primary-btn"
                                    disabled={saving}
                                    onClick={() => setSaveAndInvite(false)}
                                >
                                    {saving && !saveAndInvite ? 'Saving...' : 'Save Employee'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {employeePendingDelete && (
                <div className="module-modal-backdrop" onClick={() => setEmployeePendingDelete(null)}>
                    <div className="module-modal compact" onClick={(e) => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Delete Employee</h3>
                            <button className="nav-drawer-close" onClick={() => setEmployeePendingDelete(null)}>×</button>
                        </div>
                        <div className="module-form">
                            <p className="module-copy">
                                Delete <strong>{employeePendingDelete.firstName} {employeePendingDelete.lastName}</strong> from the employee directory?
                                This action cannot be undone.
                            </p>
                            {error ? <div className="module-error">{error}</div> : null}
                            <div className="module-form-actions">
                                <button
                                    type="button"
                                    className="module-secondary-btn"
                                    onClick={() => setEmployeePendingDelete(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="module-danger-btn"
                                    onClick={() => removeEmployee(employeePendingDelete.id)}
                                >
                                    Delete Employee
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
