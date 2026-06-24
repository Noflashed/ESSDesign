import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { authAPI, rosteringAPI, safetyProjectsAPI, usersAPI } from '../services/api';

const SUPABASE_BASE_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co';

function emptyEmployeeForm() {
    return {
        id: null,
        firstName: '',
        lastName: '',
        phoneNumber: '',
        email: '',
        leadingHand: false,
        selectedRole: 'general_scaffolder',
        linkedAuthUserId: null,
        inviteSentAt: null,
        verifiedAt: null,
        currentEmail: '',
        preferredSiteIds: [],
        effectiveRole: null
    };
}

function emptyAppUserForm() {
    return { id: '', fullName: '', email: '', role: 'viewer', phoneNumber: '' };
}

function emptyTruckDeviceForm() {
    return { deviceId: '', fullName: '', password: '', role: 'truck_ess01' };
}

function normalizePreferredSiteIds(siteIds) {
    return siteIds.filter(Boolean).slice(0, 3);
}

function getRoleLabel(role) {
    switch (role) {
        case 'admin': return 'Admin';
        case 'scaffold_designer': return 'Scaffold Designer';
        case 'site_supervisor': return 'Site Supervisor';
        case 'project_manager': return 'Project Manager';
        case 'leading_hand': return 'Leading Hand';
        case 'general_scaffolder': return 'Scaffolder';
        case 'transport_management': return 'Transport Mgmt';
        case 'truck_ess01': return 'Truck ESS01';
        case 'truck_ess02': return 'Truck ESS02';
        case 'truck_ess03': return 'Truck ESS03';
        default: return 'Viewer';
    }
}

function getRolePillClass(role) {
    switch (role) {
        case 'admin':
            return 'employee-status-pill-admin';
        case 'project_manager':
            return 'employee-status-pill-project';
        case 'site_supervisor':
        case 'leading_hand':
            return 'employee-status-pill-lh';
        default:
            return 'employee-status-pill-neutral';
    }
}

function getInitials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

function normalizeAvatarSource(value) {
    if (!value || typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return [trimmed];
    }

    const normalizedPath = trimmed.replace(/^\/+/, '');
    if (normalizedPath.startsWith('storage/v1/')) {
        return [`${SUPABASE_BASE_URL}/${normalizedPath}`];
    }

    return [
        `${SUPABASE_BASE_URL}/storage/v1/object/public/${normalizedPath}`,
        `${SUPABASE_BASE_URL}/storage/v1/object/public/public-assets/${normalizedPath}`
    ];
}

function getAvatarCandidates(user) {
    const rawValues = [
        user?.avatarUrl,
        user?.avatar_url,
        user?.picture,
        user?.profileImageUrl,
        user?.profile_image_url,
        user?.profileImage,
        user?.profile_image,
        user?.avatarPath,
        user?.avatar_path
    ].filter(Boolean);

    return [...new Set(rawValues.flatMap(normalizeAvatarSource))];
}

function getAccountStatus(entry) {
    if (entry.type === 'app-user') {
        return { label: 'App Account', className: 'app' };
    }
    if (entry.isVerified) {
        return { label: 'Verified', className: 'verified' };
    }
    if (entry.type === 'employee' && entry.employee?.inviteSentAt) {
        return { label: 'Invite Sent', className: 'invited' };
    }
    if (entry.appUser) {
        return { label: 'App Account', className: 'app' };
    }
    return { label: 'Not Linked', className: 'unlinked' };
}

function formatEmployeeDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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

function CheckCircleIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8.4 12.3l2.25 2.25 4.95-5.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function SortGlyph() {
    return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M5 3.5 8 1l3 2.5M11 12.5 8 15l-3-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function EmployeeColumnFilter({ label, filterKey, active, open, onToggle, children }) {
    return (
        <div className={`employees-column-filter ${active ? 'filtered' : ''} ${open ? 'open' : ''}`}>
            <button type="button" onClick={(event) => { event.stopPropagation(); onToggle(filterKey); }}>
                <span>{label}</span>
                <SortGlyph />
            </button>
            {open ? (
                <div className="employees-column-menu" onClick={(event) => event.stopPropagation()}>
                    {children}
                </div>
            ) : null}
        </div>
    );
}

function EmployeeAvatar({ entry }) {
    const [candidateIndex, setCandidateIndex] = useState(0);
    const avatarCandidates = entry.avatarCandidates || [];
    const avatarUrl = avatarCandidates[candidateIndex] || '';

    useEffect(() => {
        setCandidateIndex(0);
    }, [entry.key, avatarCandidates.join('|')]);

    return (
        <span className={`employees-avatar ${avatarUrl ? 'has-image' : ''}`}>
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt=""
                    onError={() => setCandidateIndex((current) => current + 1 < avatarCandidates.length ? current + 1 : current)}
                />
            ) : getInitials(entry.displayName)}
        </span>
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

export default function EmployeesPage({ currentUserId, onCurrentUserUpdated, onOpenLeadingHandRelationships }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingAppUser, setSavingAppUser] = useState(false);
    const [inviteSending, setInviteSending] = useState(false);
    const [error, setError] = useState('');
    const [inviteMessage, setInviteMessage] = useState('');
    const [employees, setEmployees] = useState([]);
    const [appUsers, setAppUsers] = useState([]);
    const [sites, setSites] = useState([]);
    const [search, setSearch] = useState('');
    const [columnFilterMenu, setColumnFilterMenu] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [accountFilter, setAccountFilter] = useState('all');
    const [leadingHandFilter, setLeadingHandFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(emptyEmployeeForm());
    const [employeePendingDelete, setEmployeePendingDelete] = useState(null);
    const [saveAndInvite, setSaveAndInvite] = useState(false);
    const [showAppUserModal, setShowAppUserModal] = useState(false);
    const [appUserForm, setAppUserForm] = useState(emptyAppUserForm());
    const [appUserPendingDelete, setAppUserPendingDelete] = useState(null);
    const [showTruckDeviceModal, setShowTruckDeviceModal] = useState(false);
    const [truckDeviceForm, setTruckDeviceForm] = useState(emptyTruckDeviceForm());
    const [selectedInfoEntry, setSelectedInfoEntry] = useState(null);

    useEffect(() => {
        let active = true;
        (async () => {
            return Promise.all([safetyProjectsAPI.getBuilders(), rosteringAPI.getEmployees(), usersAPI.getAllUsers()]);
        })()
            .then(([builders, employeeRows, userRows]) => {
                if (!active) return;
                const flattenedSites = builders.flatMap((builder) =>
                    builder.projects.map((project) => ({
                        id: `${builder.id}:${project.id}`,
                        label: `${builder.name} - ${project.name}`,
                        shortLabel: project.name
                    }))
                );
                setSites(flattenedSites);
                setEmployees(employeeRows);
                setAppUsers(userRows || []);
            })
            .catch((err) => {
                if (active) setError(err.message || 'Failed to load employees');
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        authAPI.syncEmployeeLinks()
            .then(async (result) => {
                if (!active || !result?.syncedCount) return;
                const [employeeRows, userRows] = await Promise.all([rosteringAPI.getEmployees(), usersAPI.getAllUsers()]);
                if (!active) return;
                setEmployees(employeeRows);
                setAppUsers(userRows || []);
            })
            .catch((err) => {
                console.error('Failed to sync existing employee links:', err);
            });

        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!columnFilterMenu) {
            return undefined;
        }

        const closeMenu = () => setColumnFilterMenu('');
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [columnFilterMenu]);

    const mergedEntries = useMemo(() => {
        const appUserById = Object.fromEntries(appUsers.map((u) => [u.id, u]));
        const linkedUserIds = new Set();
        const result = [];

        for (const emp of employees) {
            const appUser = emp.linkedAuthUserId ? (appUserById[emp.linkedAuthUserId] ?? null) : null;
            if (appUser) linkedUserIds.add(appUser.id);
            const effectiveRole = appUser?.role || (emp.leadingHand ? 'leading_hand' : 'general_scaffolder');
            result.push({
                key: `emp-${emp.id}`,
                type: 'employee',
                employee: emp,
                appUser,
                displayName: `${emp.firstName} ${emp.lastName}`,
                displayPhone: emp.phoneNumber || null,
                displayEmail: emp.email || null,
                isVerified: !!emp.verifiedAt,
                role: effectiveRole,
                leadingHand: effectiveRole === 'leading_hand',
                preferredSiteIds: emp.preferredSiteIds || [],
                avatarCandidates: getAvatarCandidates(appUser),
            });
        }

        for (const u of appUsers) {
            if (!linkedUserIds.has(u.id)) {
                result.push({
                    key: `user-${u.id}`,
                    type: 'app-user',
                    employee: null,
                    appUser: u,
                    displayName: u.fullName || u.email,
                    displayPhone: u.phoneNumber || null,
                    displayEmail: u.email,
                    isVerified: true,
                    role: u.role,
                    leadingHand: u.role === 'leading_hand',
                    preferredSiteIds: [],
                    avatarCandidates: getAvatarCandidates(u),
                });
            }
        }

        return result;
    }, [employees, appUsers]);

    const roleFilterOptions = useMemo(() => {
        const roles = Array.from(new Set(mergedEntries.map((entry) => entry.role).filter(Boolean)));
        return roles.map((role) => ({ value: role, label: getRoleLabel(role) })).sort((a, b) => a.label.localeCompare(b.label));
    }, [mergedEntries]);

    const filteredEntries = useMemo(() => {
        const q = search.trim().toLowerCase();
        return mergedEntries.filter((entry) => {
            if (roleFilter !== 'all' && entry.role !== roleFilter) return false;
            if (accountFilter !== 'all' && getAccountStatus(entry).className !== accountFilter) return false;
            if (leadingHandFilter !== 'all') {
                const wantsLeadingHand = leadingHandFilter === 'yes';
                if (entry.leadingHand !== wantsLeadingHand) return false;
            }
            if (!q) return true;
            const name = entry.displayName.toLowerCase();
            const phone = (entry.displayPhone || '').toLowerCase();
            const email = (entry.displayEmail || '').toLowerCase();
            const role = getRoleLabel(entry.role).toLowerCase();
            const account = getAccountStatus(entry).label.toLowerCase();
            return name.includes(q) || phone.includes(q) || email.includes(q) || role.includes(q) || account.includes(q);
        });
    }, [mergedEntries, search, roleFilter, accountFilter, leadingHandFilter]);

    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const pagedEntries = useMemo(
        () => filteredEntries.slice((safePage - 1) * pageSize, safePage * pageSize),
        [filteredEntries, safePage]
    );
    const showingStart = filteredEntries.length === 0 ? 0 : ((safePage - 1) * pageSize) + 1;
    const showingEnd = Math.min(safePage * pageSize, filteredEntries.length);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, roleFilter, accountFilter, leadingHandFilter]);

    const openEmployeeEditor = (employee, effectiveRole) => {
        const resolvedRole = effectiveRole || (employee.leadingHand ? 'leading_hand' : 'general_scaffolder');
        setForm({
            ...employee,
            email: employee.email || '',
            linkedAuthUserId: employee.linkedAuthUserId || null,
            inviteSentAt: employee.inviteSentAt || null,
            verifiedAt: employee.verifiedAt || null,
            currentEmail: employee.email || '',
            effectiveRole: resolvedRole,
            selectedRole: resolvedRole
        });
        setError('');
        setInviteMessage('');
        setSaveAndInvite(false);
        setShowModal(true);
    };

    const openAppUserEditor = (appUser) => {
        setAppUserForm({ id: appUser.id, fullName: appUser.fullName || '', email: appUser.email, role: appUser.role || 'viewer', phoneNumber: appUser.phoneNumber || '' });
        setError('');
        setShowAppUserModal(true);
    };

    const openTruckDeviceCreator = () => {
        setTruckDeviceForm(emptyTruckDeviceForm());
        setError('');
        setInviteMessage('');
        setShowTruckDeviceModal(true);
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
            const showPreferredSites = form.selectedRole === 'leading_hand' || form.selectedRole === 'general_scaffolder';
            const saveForm = {
                ...form,
                leadingHand: form.selectedRole === 'leading_hand',
                preferredSiteIds: showPreferredSites ? form.preferredSiteIds : []
            };
            if (form.linkedAuthUserId && form.selectedRole !== form.effectiveRole) {
                await usersAPI.updateUser(form.linkedAuthUserId, { role: form.selectedRole });
            }

            await rosteringAPI.saveEmployee(saveForm);
            const [userRows, employeeRows] = await Promise.all([usersAPI.getAllUsers(), rosteringAPI.getEmployees()]);
            setAppUsers(userRows || []);
            setEmployees(employeeRows);

            if (form.linkedAuthUserId && form.linkedAuthUserId === currentUserId) {
                const refreshedUser = await authAPI.refreshCurrentUser();
                onCurrentUserUpdated?.(refreshedUser);
            }

            if (inviteAfterSave) {
                const normalizedEmail = (form.email || '').trim().toLowerCase();
                if (!normalizedEmail) throw new Error('Enter an email address before sending an invite.');

                const savedEmployee = employeeRows.find((employee) =>
                    (form.id ? employee.id === form.id : true)
                    && (employee.email || '').trim().toLowerCase() === normalizedEmail
                    && (employee.firstName || '').trim() === form.firstName.trim()
                    && (employee.lastName || '').trim() === form.lastName.trim()
                );

                if (!savedEmployee?.id) throw new Error('Employee was saved, but could not be matched for invite sending.');

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
                setForm(emptyEmployeeForm());
                setSaveAndInvite(false);
                return;
            }

            setShowModal(false);
            setForm(emptyEmployeeForm());
            setSaveAndInvite(false);
        } catch (err) {
            setError(err.message || 'Could not save employee');
        } finally {
            setSaving(false);
        }
    };

    const saveAppUser = async (e) => {
        e.preventDefault();
        setSavingAppUser(true);
        setError('');
        try {
            const existingAppUser = appUsers.find((entry) => entry.id === appUserForm.id);
            const nextFullName = appUserForm.fullName || '';
            const nextPhoneNumber = appUserForm.phoneNumber || '';
            const nextRole = appUserForm.role || 'viewer';
            const currentFullName = existingAppUser?.fullName || '';
            const currentPhoneNumber = existingAppUser?.phoneNumber || '';
            const currentRole = existingAppUser?.role || 'viewer';

            if (nextRole !== currentRole) {
                await usersAPI.updateUserRole(appUserForm.id, nextRole);
            }

            if (nextFullName !== currentFullName || nextPhoneNumber !== currentPhoneNumber) {
                await usersAPI.updateUser(appUserForm.id, {
                    fullName: nextFullName,
                    phoneNumber: nextPhoneNumber,
                });
            }

            const [userRows, employeeRows] = await Promise.all([usersAPI.getAllUsers(), rosteringAPI.getEmployees()]);
            setAppUsers(userRows || []);
            setEmployees(employeeRows);
            if (appUserForm.id === currentUserId) {
                const refreshedUser = await authAPI.refreshCurrentUser();
                onCurrentUserUpdated?.(refreshedUser);
            }
            setShowAppUserModal(false);
        } catch (err) {
            setError(err?.response?.data?.error || err.message || 'Could not save user');
        } finally {
            setSavingAppUser(false);
        }
    };

    const saveTruckDevice = async (e) => {
        e.preventDefault();
        setSavingAppUser(true);
        setError('');
        try {
            const normalizedDeviceId = (truckDeviceForm.deviceId || '').trim();
            const normalizedPassword = truckDeviceForm.password || '';
            if (!normalizedDeviceId) {
                throw new Error('Device ID is required.');
            }
            if (normalizedPassword.trim().length < 6) {
                throw new Error('Password must be at least 6 characters.');
            }

            await authAPI.createTruckDeviceUser(truckDeviceForm);
            const userRows = await usersAPI.getAllUsers();
            setAppUsers(userRows || []);
            setShowTruckDeviceModal(false);
            setTruckDeviceForm(emptyTruckDeviceForm());
        } catch (err) {
            setError(err?.response?.data?.error || err.message || 'Could not create truck device');
        } finally {
            setSavingAppUser(false);
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

    const removeAppUser = async (userId) => {
        try {
            await usersAPI.deleteUser(userId);
            const userRows = await usersAPI.getAllUsers();
            setAppUsers(userRows || []);
            setAppUserPendingDelete(null);
        } catch (err) {
            setError(err.message || 'Could not delete user');
        }
    };

    const sendEmployeeInvite = async () => {
        if (!form.id) { setError('Save the employee before sending an invite.'); return; }
        if (!form.email.trim()) { setError('Enter an email address before sending an invite.'); return; }

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
                        <h2>Employee Directory</h2>
                        <div className="employees-search-row">
                            <div className="employees-search-field">
                                <Search size={18} />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees by name, role, email or phone..." />
                            </div>
                        </div>
                    </div>
                    <div className="module-form-actions">
                        <button type="button" className="module-secondary-btn" onClick={openTruckDeviceCreator}>
                            <TreeIcon />
                            Add Truck Device
                        </button>
                        <button className="module-primary-btn" onClick={() => { setForm(emptyEmployeeForm()); setShowModal(true); setInviteMessage(''); setError(''); setSaveAndInvite(false); }}>
                            <Plus size={18} />
                            Add Employee
                        </button>
                    </div>
                </div>

                <div className="module-card employees-card">
                    {error && !showModal && !showAppUserModal && !employeePendingDelete && !appUserPendingDelete ? (
                        <div className="module-error">{error}</div>
                    ) : null}
                    {loading ? (
                        <div className="module-empty-inline">Loading employees...</div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="module-empty-inline">No employees found.</div>
                    ) : (
                        <div className={`employees-table-wrap ${columnFilterMenu ? 'filter-menu-open' : ''}`}>
                            <table className="employees-table">
                                <thead>
                                    <tr>
                                        <th>
                                            <div className="employees-column-label">Employee <SortGlyph /></div>
                                        </th>
                                        <th>
                                            <EmployeeColumnFilter
                                                label="Role"
                                                filterKey="role"
                                                active={roleFilter !== 'all'}
                                                open={columnFilterMenu === 'role'}
                                                onToggle={(key) => setColumnFilterMenu((current) => current === key ? '' : key)}
                                            >
                                                <button type="button" className={roleFilter === 'all' ? 'selected' : ''} onClick={() => { setRoleFilter('all'); setColumnFilterMenu(''); }}>All Roles</button>
                                                {roleFilterOptions.map((option) => (
                                                    <button key={option.value} type="button" className={roleFilter === option.value ? 'selected' : ''} onClick={() => { setRoleFilter(option.value); setColumnFilterMenu(''); }}>
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </EmployeeColumnFilter>
                                        </th>
                                        <th>Phone</th>
                                        <th>Email</th>
                                        <th>
                                            <EmployeeColumnFilter
                                                label="Account Status"
                                                filterKey="account"
                                                active={accountFilter !== 'all'}
                                                open={columnFilterMenu === 'account'}
                                                onToggle={(key) => setColumnFilterMenu((current) => current === key ? '' : key)}
                                            >
                                                <button type="button" className={accountFilter === 'all' ? 'selected' : ''} onClick={() => { setAccountFilter('all'); setColumnFilterMenu(''); }}>All Statuses</button>
                                                <button type="button" className={accountFilter === 'verified' ? 'selected' : ''} onClick={() => { setAccountFilter('verified'); setColumnFilterMenu(''); }}>Verified</button>
                                                <button type="button" className={accountFilter === 'app' ? 'selected' : ''} onClick={() => { setAccountFilter('app'); setColumnFilterMenu(''); }}>App Account</button>
                                                <button type="button" className={accountFilter === 'invited' ? 'selected' : ''} onClick={() => { setAccountFilter('invited'); setColumnFilterMenu(''); }}>Invite Sent</button>
                                                <button type="button" className={accountFilter === 'unlinked' ? 'selected' : ''} onClick={() => { setAccountFilter('unlinked'); setColumnFilterMenu(''); }}>Not Linked</button>
                                            </EmployeeColumnFilter>
                                        </th>
                                        <th>
                                            <EmployeeColumnFilter
                                                label="Leading Hand"
                                                filterKey="leading"
                                                active={leadingHandFilter !== 'all'}
                                                open={columnFilterMenu === 'leading'}
                                                onToggle={(key) => setColumnFilterMenu((current) => current === key ? '' : key)}
                                            >
                                                <button type="button" className={leadingHandFilter === 'all' ? 'selected' : ''} onClick={() => { setLeadingHandFilter('all'); setColumnFilterMenu(''); }}>All</button>
                                                <button type="button" className={leadingHandFilter === 'yes' ? 'selected' : ''} onClick={() => { setLeadingHandFilter('yes'); setColumnFilterMenu(''); }}>Leading Hand</button>
                                                <button type="button" className={leadingHandFilter === 'no' ? 'selected' : ''} onClick={() => { setLeadingHandFilter('no'); setColumnFilterMenu(''); }}>Not Leading Hand</button>
                                            </EmployeeColumnFilter>
                                        </th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedEntries.map((entry) => {
                                        const status = getAccountStatus(entry);
                                        return (
                                            <tr
                                                key={entry.key}
                                                className={`employees-data-row ${selectedInfoEntry?.key === entry.key ? 'selected' : ''}`}
                                                onClick={() => setSelectedInfoEntry(entry)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        setSelectedInfoEntry(entry);
                                                    }
                                                }}
                                                tabIndex={0}
                                            >
                                                <td>
                                                    <div className="employees-identity-cell">
                                                        <EmployeeAvatar entry={entry} />
                                                        <strong>{entry.displayName}</strong>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`employees-role-pill ${getRolePillClass(entry.role)}`}>
                                                        {getRoleLabel(entry.role)}
                                                    </span>
                                                </td>
                                                <td>{entry.displayPhone || '-'}</td>
                                                <td>{entry.displayEmail || '-'}</td>
                                                <td>
                                                    <span className={`employees-account-pill ${status.className}`}>{status.label}</span>
                                                </td>
                                                <td>
                                                    {entry.leadingHand ? (
                                                        <span className="employees-leading-check" aria-label="Leading hand"><CheckCircleIcon /></span>
                                                    ) : (
                                                        <span className="employees-muted-dash">-</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="employees-table-actions">
                                                        <EmployeeActionButton
                                                            title={`Open leading hand relationships for ${entry.displayName}`}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                if (entry.leadingHand && entry.type === 'employee') {
                                                                    onOpenLeadingHandRelationships?.(entry.employee);
                                                                }
                                                            }}
                                                        >
                                                            <TreeIcon />
                                                        </EmployeeActionButton>
                                                        <EmployeeActionButton
                                                            title={`Edit ${entry.displayName}`}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                if (entry.type === 'employee') openEmployeeEditor(entry.employee, entry.role);
                                                                else openAppUserEditor(entry.appUser);
                                                            }}
                                                        >
                                                            <EditIcon />
                                                        </EmployeeActionButton>
                                                        <EmployeeActionButton
                                                            danger
                                                            title={`Delete ${entry.displayName}`}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                if (entry.type === 'employee') setEmployeePendingDelete(entry.employee);
                                                                else setAppUserPendingDelete(entry.appUser);
                                                            }}
                                                        >
                                                            <DeleteIcon />
                                                        </EmployeeActionButton>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="employees-table-footer">
                                <span>Showing {showingStart} to {showingEnd} of {filteredEntries.length} employees</span>
                                <div className="employees-pagination">
                                    <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1}>{'<'}</button>
                                    {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 4).map((page) => (
                                        <button key={page} type="button" className={safePage === page ? 'active' : ''} onClick={() => setCurrentPage(page)}>
                                            {page}
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages}>{'>'}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {selectedInfoEntry && (
                <div className="module-modal-backdrop" onClick={() => setSelectedInfoEntry(null)}>
                    <div className="module-modal compact employees-info-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Employee Information</h3>
                            <button className="nav-drawer-close" onClick={() => setSelectedInfoEntry(null)}>×</button>
                        </div>
                        <div className="employees-info-list">
                            <div className="employees-info-row">
                                <span>Full Name</span>
                                <strong>{selectedInfoEntry.displayName}</strong>
                            </div>
                            <div className="employees-info-row">
                                <span>Role</span>
                                <strong><span className={`employees-role-pill ${getRolePillClass(selectedInfoEntry.role)}`}>{getRoleLabel(selectedInfoEntry.role)}</span></strong>
                            </div>
                            <div className="employees-info-row">
                                <span>Phone Number</span>
                                <strong>{selectedInfoEntry.displayPhone || '-'}</strong>
                            </div>
                            <div className="employees-info-row">
                                <span>Email</span>
                                <strong>{selectedInfoEntry.displayEmail || '-'}</strong>
                            </div>
                            <div className="employees-info-row">
                                <span>Account Status</span>
                                <strong><span className={`employees-account-pill ${getAccountStatus(selectedInfoEntry).className}`}>{getAccountStatus(selectedInfoEntry).label}</span></strong>
                            </div>
                            <div className="employees-info-row">
                                <span>Linked App Account</span>
                                <strong>{selectedInfoEntry.appUser ? `Yes (${selectedInfoEntry.appUser.email})` : 'No'}</strong>
                            </div>
                            <div className="employees-info-row">
                                <span>Invite Sent</span>
                                <strong>{formatEmployeeDate(selectedInfoEntry.employee?.inviteSentAt)}</strong>
                            </div>
                            <div className="employees-info-row">
                                <span>Verified On</span>
                                <strong>{formatEmployeeDate(selectedInfoEntry.employee?.verifiedAt)}</strong>
                            </div>
                            <div className="employees-info-row">
                                <span>Leading Hand</span>
                                <strong>
                                    {selectedInfoEntry.leadingHand ? (
                                        <span className="employees-info-check"><CheckCircleIcon /> Yes</span>
                                    ) : 'No'}
                                </strong>
                            </div>
                            <div className="employees-info-summary">
                                <span>Relationship Summary</span>
                                <strong>{selectedInfoEntry.leadingHand ? 'View relationships from the actions menu.' : 'No leading hand relationships.'}</strong>
                                {selectedInfoEntry.leadingHand ? <small>View full relationships tree from the actions menu.</small> : null}
                            </div>
                        </div>
                        <div className="module-form-actions">
                            <button type="button" className="module-secondary-btn compact" onClick={() => setSelectedInfoEntry(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

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
                            <div className="module-field">
                                <label>Role</label>
                                <select
                                    value={form.selectedRole}
                                    onChange={(e) => setForm((prev) => ({ ...prev, selectedRole: e.target.value }))}
                                >
                                    <option value="general_scaffolder">Scaffolder</option>
                                    <option value="leading_hand">Leading Hand</option>
                                    <option value="scaffold_designer">Scaffold Designer</option>
                                    <option value="site_supervisor">Site Supervisor</option>
                                    <option value="project_manager">Project Manager</option>
                                    <option value="transport_management">Transport Management</option>
                                    <option value="admin">Admin</option>
                                    <option value="viewer">Viewer</option>
                                </select>
                            </div>
                            {(form.selectedRole === 'leading_hand' || form.selectedRole === 'general_scaffolder') ? (
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
                            ) : null}
                            {form.id && form.selectedRole === 'leading_hand' ? (
                                <button
                                    type="button"
                                    className="module-secondary-btn"
                                    onClick={() => { setShowModal(false); onOpenLeadingHandRelationships?.(form); }}
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
                                        onClick={(event) => { setSaveAndInvite(true); saveEmployee(event, { inviteAfterSave: true }); }}
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

            {showAppUserModal && (
                <div className="module-modal-backdrop" onClick={() => setShowAppUserModal(false)}>
                    <div className="module-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Edit User</h3>
                            <button className="nav-drawer-close" onClick={() => setShowAppUserModal(false)}>×</button>
                        </div>
                        <form className="module-form" onSubmit={saveAppUser}>
                            <div className="module-field">
                                <label>Full Name</label>
                                <input
                                    value={appUserForm.fullName}
                                    onChange={(e) => setAppUserForm((prev) => ({ ...prev, fullName: e.target.value }))}
                                    placeholder="Full name"
                                />
                            </div>
                            <div className="module-grid module-grid-two">
                                <div className="module-field">
                                    <label>Email</label>
                                    <input value={appUserForm.email} disabled />
                                </div>
                                <div className="module-field">
                                    <label>Phone Number</label>
                                    <input
                                        value={appUserForm.phoneNumber}
                                        onChange={(e) => setAppUserForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                                        placeholder="e.g. 0400 000 000"
                                    />
                                </div>
                            </div>
                            <div className="module-field">
                                <label>Role</label>
                                <select
                                    value={appUserForm.role}
                                    onChange={(e) => setAppUserForm((prev) => ({ ...prev, role: e.target.value }))}
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="admin">Admin</option>
                                    <option value="scaffold_designer">Scaffold Designer</option>
                                    <option value="site_supervisor">Site Supervisor</option>
                                    <option value="project_manager">Project Manager</option>
                                    <option value="leading_hand">Leading Hand</option>
                                    <option value="general_scaffolder">Scaffolder</option>
                                    <option value="transport_management">Transport Management</option>
                                    <option value="truck_ess01">Truck ESS01</option>
                                    <option value="truck_ess02">Truck ESS02</option>
                                    <option value="truck_ess03">Truck ESS03</option>
                                </select>
                            </div>
                            {error ? <div className="module-error">{error}</div> : null}
                            <div className="module-form-actions">
                                <button type="button" className="module-secondary-btn" onClick={() => setShowAppUserModal(false)}>Cancel</button>
                                <button type="submit" className="module-primary-btn" disabled={savingAppUser}>
                                    {savingAppUser ? 'Saving...' : 'Save User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showTruckDeviceModal && (
                <div className="module-modal-backdrop" onClick={() => setShowTruckDeviceModal(false)}>
                    <div className="module-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Create Truck Device</h3>
                            <button className="nav-drawer-close" onClick={() => setShowTruckDeviceModal(false)}>×</button>
                        </div>
                        <form className="module-form" onSubmit={saveTruckDevice}>
                            <div className="module-grid module-grid-two">
                                <div className="module-field">
                                    <label>Device ID</label>
                                    <input
                                        value={truckDeviceForm.deviceId}
                                        onChange={(e) => setTruckDeviceForm((prev) => ({ ...prev, deviceId: e.target.value }))}
                                        placeholder="ESS01"
                                        required
                                    />
                                </div>
                                <div className="module-field">
                                    <label>Truck Role</label>
                                    <select
                                        value={truckDeviceForm.role}
                                        onChange={(e) => setTruckDeviceForm((prev) => ({ ...prev, role: e.target.value }))}
                                    >
                                        <option value="truck_ess01">Truck ESS01</option>
                                        <option value="truck_ess02">Truck ESS02</option>
                                        <option value="truck_ess03">Truck ESS03</option>
                                    </select>
                                </div>
                            </div>
                            <div className="module-grid module-grid-two">
                                <div className="module-field">
                                    <label>Display Name</label>
                                    <input
                                        value={truckDeviceForm.fullName}
                                        onChange={(e) => setTruckDeviceForm((prev) => ({ ...prev, fullName: e.target.value }))}
                                        placeholder="ESS01 Driver Device"
                                        required
                                    />
                                </div>
                                <div className="module-field">
                                    <label>Password</label>
                                    <input
                                        type="password"
                                        value={truckDeviceForm.password}
                                        onChange={(e) => setTruckDeviceForm((prev) => ({ ...prev, password: e.target.value }))}
                                        placeholder="Minimum 6 characters"
                                        minLength={6}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="module-copy">
                                Truck device accounts do not need a real email address. The backend creates the internal auth identity automatically and the driver signs in with the device ID and password.
                            </div>
                            {error ? <div className="module-error">{error}</div> : null}
                            <div className="module-form-actions">
                                <button type="button" className="module-secondary-btn" onClick={() => setShowTruckDeviceModal(false)}>Cancel</button>
                                <button type="submit" className="module-primary-btn" disabled={savingAppUser}>
                                    {savingAppUser ? 'Creating...' : 'Create Device'}
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
                                <button type="button" className="module-secondary-btn" onClick={() => setEmployeePendingDelete(null)}>Cancel</button>
                                <button type="button" className="module-danger-btn" onClick={() => removeEmployee(employeePendingDelete.id)}>Delete Employee</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {appUserPendingDelete && (
                <div className="module-modal-backdrop" onClick={() => setAppUserPendingDelete(null)}>
                    <div className="module-modal compact" onClick={(e) => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Delete User</h3>
                            <button className="nav-drawer-close" onClick={() => setAppUserPendingDelete(null)}>×</button>
                        </div>
                        <div className="module-form">
                            <p className="module-copy">
                                Delete <strong>{appUserPendingDelete.fullName || appUserPendingDelete.email}</strong> from the application?
                                This will remove their account and cannot be undone.
                            </p>
                            {error ? <div className="module-error">{error}</div> : null}
                            <div className="module-form-actions">
                                <button type="button" className="module-secondary-btn" onClick={() => setAppUserPendingDelete(null)}>Cancel</button>
                                <button type="button" className="module-danger-btn" onClick={() => removeAppUser(appUserPendingDelete.id)}>Delete User</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
