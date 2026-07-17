import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Maximize2, Plus, Search, UserPlus, X } from 'lucide-react';
import { authAPI, resolveProfileImageUrls, rosteringAPI, usersAPI } from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';

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
        user?.AvatarUrl,
        user?.picture,
        user?.Picture,
        user?.profileImageUrl,
        user?.profile_image_url,
        user?.ProfileImageUrl,
        user?.profileImage,
        user?.profile_image,
        user?.ProfileImage,
        user?.avatarPath,
        user?.avatar_path,
        user?.AvatarPath
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

function formatEmployeeBirthDate(value) {
    if (!value) return '-';
    const datePart = String(value).split('T')[0];
    const date = new Date(`${datePart}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function formatEmployeeGender(value) {
    if (!value) return '-';
    return String(value)
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatEmployeeAddress(profile) {
    if (!profile) return '-';
    const structuredAddress = [
        profile.addressStreet,
        profile.addressCity,
        profile.addressState,
        profile.addressPostalCode,
        profile.addressCountry
    ].filter(Boolean).join(', ');
    return structuredAddress || profile.personalAddress || '-';
}

const EMPLOYEE_CREDENTIAL_CONFIG = [
    { type: 'white_card', title: 'White Card', numberLabel: 'Card Number', showClasses: false, showIssueDate: true, showExpiry: false },
    { type: 'driver_licence', title: 'Driver Licence', numberLabel: 'Licence Number', showClasses: true, showIssueDate: false, showExpiry: true },
    { type: 'high_risk_work_licence', title: 'High Risk Work Licence', numberLabel: 'Licence Number', showClasses: true, showIssueDate: true, showExpiry: true }
];

const DRIVER_LICENCE_CLASS_LABELS = {
    C: 'C (Car)',
    R: 'R (Rider)',
    LR: 'LR (Light Rigid)',
    MR: 'MR (Medium Rigid)',
    HR: 'HR (Heavy Rigid)',
    HC: 'HC (Heavy Combination)',
    MC: 'MC (Multi Combination)'
};

function formatEmployeeCredentialDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatEmployeeCredentialClass(config, value) {
    if (!value) return '-';
    return config.type === 'driver_licence' ? DRIVER_LICENCE_CLASS_LABELS[value] || value : value;
}

async function loadEmployeeCredentialImage(userId, credential) {
    if (!userId || !credential?.hasFrontImage) return credential;
    try {
        const frontImageUrl = await usersAPI.getCredentialImageUrl(userId, credential.credentialType, credential.updatedAt);
        return { ...credential, frontImageUrl, frontImageLoadFailed: false };
    } catch {
        return { ...credential, frontImageUrl: '', frontImageLoadFailed: true };
    }
}

function EmployeeCredentialImage({ credential, title, onOpen }) {
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageFailed(false);
    }, [credential?.frontImageUrl]);

    if (!credential?.frontImageUrl || imageFailed) {
        return (
            <div className="employee-details-credential-image empty">
                {credential?.hasFrontImage
                    ? credential.frontImageLoadFailed || imageFailed
                        ? 'This image format cannot be previewed in this browser'
                        : 'Loading front image...'
                    : 'Front image not uploaded'}
            </div>
        );
    }

    return (
        <button
            type="button"
            className="employee-details-credential-image"
            onClick={() => onOpen?.({ url: credential.frontImageUrl, title })}
            aria-label={`Enlarge front of ${title}`}
        >
            <img src={credential.frontImageUrl} alt={`Front of ${title}`} loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
            <span><Maximize2 size={11} aria-hidden="true" /> Enlarge</span>
        </button>
    );
}

function EmployeeProfileSections({ profile, readOnly = false }) {
    const readOnlyBadge = readOnly ? <span className="employee-details-section-badge">Read only</span> : null;

    return (
        <>
            <section className="employee-details-section">
                <h3>Personal profile {readOnlyBadge}</h3>
                <div className="employee-details-grid">
                    <div className="employee-details-field">
                        <span>Preferred Name</span>
                        <strong>{profile?.preferredName || '-'}</strong>
                    </div>
                    <div className="employee-details-field">
                        <span>Date of Birth</span>
                        <strong>{formatEmployeeBirthDate(profile?.dateOfBirth)}</strong>
                    </div>
                    <div className="employee-details-field">
                        <span>Gender</span>
                        <strong>{formatEmployeeGender(profile?.gender)}</strong>
                    </div>
                    <div className="employee-details-field employee-details-field-wide">
                        <span>Residential Address</span>
                        <strong>{formatEmployeeAddress(profile)}</strong>
                    </div>
                </div>
            </section>

            <section className="employee-details-section">
                <h3>Emergency contact {readOnlyBadge}</h3>
                <div className="employee-details-grid">
                    <div className="employee-details-field">
                        <span>Contact Name</span>
                        <strong>{profile?.emergencyContactName || '-'}</strong>
                    </div>
                    <div className="employee-details-field">
                        <span>Relationship</span>
                        <strong>{profile?.emergencyRelationship || '-'}</strong>
                    </div>
                    <div className="employee-details-field">
                        <span>Phone</span>
                        <strong>{profile?.emergencyPhoneNumber || '-'}</strong>
                    </div>
                    <div className="employee-details-field">
                        <span>Email</span>
                        <strong>{profile?.emergencyEmail || '-'}</strong>
                    </div>
                    <div className="employee-details-field employee-details-field-wide">
                        <span>Address</span>
                        <strong>{profile?.emergencyAddress || '-'}</strong>
                    </div>
                </div>
            </section>
        </>
    );
}

function EmployeeCredentialsSection({ credentials, loading = false, error = '', readOnly = false }) {
    const [expandedImage, setExpandedImage] = useState(null);

    useEffect(() => {
        if (!expandedImage) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setExpandedImage(null);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [expandedImage]);

    return (
        <section className="employee-details-section employee-details-credentials-section">
            <h3>
                Licences &amp; credentials
                {readOnly ? <span className="employee-details-section-badge">Read only</span> : null}
            </h3>

            {loading ? <div className="employee-details-credentials-message">Loading licence details...</div> : null}
            {!loading && error ? <div className="employee-details-credentials-message error">{error}</div> : null}
            {!loading && !error ? (
                <div className="employee-details-credentials-grid">
                    {EMPLOYEE_CREDENTIAL_CONFIG.map((config) => {
                        const credential = credentials.find((item) => item.credentialType === config.type) || null;
                        return (
                            <article key={config.type} className="employee-details-credential">
                                <div className="employee-details-credential-head">
                                    <strong>{config.title}</strong>
                                </div>
                                <div className="employee-details-credential-values">
                                    <span><small>{config.numberLabel}</small><strong>{credential?.credentialNumber || '-'}</strong></span>
                                    <span><small>Issuing State</small><strong>{credential?.issuingState || '-'}</strong></span>
                                    {config.showClasses ? <span><small>{config.type === 'driver_licence' ? 'Class' : 'Class(es)'}</small><strong>{formatEmployeeCredentialClass(config, credential?.licenceClasses)}</strong></span> : null}
                                    {config.showIssueDate ? <span><small>Issue Date</small><strong>{formatEmployeeCredentialDate(credential?.issueDate)}</strong></span> : null}
                                    {config.showExpiry ? <span><small>Expiry Date</small><strong>{formatEmployeeCredentialDate(credential?.expiryDate)}</strong></span> : null}
                                </div>
                                <EmployeeCredentialImage credential={credential} title={config.title} onOpen={setExpandedImage} />
                            </article>
                        );
                    })}
                </div>
            ) : null}

            {expandedImage ? (
                <div className="employee-credential-viewer" role="presentation">
                    <button
                        type="button"
                        className="employee-credential-viewer-backdrop"
                        aria-label="Close enlarged licence image"
                        onClick={() => setExpandedImage(null)}
                    />
                    <div className="employee-credential-viewer-panel" role="dialog" aria-modal="true" aria-label={`${expandedImage.title} image`}>
                        <div className="employee-credential-viewer-head">
                            <strong>{expandedImage.title}</strong>
                            <button type="button" onClick={() => setExpandedImage(null)} aria-label="Close enlarged licence image">
                                <X size={17} aria-hidden="true" />
                            </button>
                        </div>
                        <img src={expandedImage.url} alt={`Front of ${expandedImage.title}`} decoding="async" />
                    </div>
                </div>
            ) : null}
        </section>
    );
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
                    onError={() => setCandidateIndex((current) => Math.min(current + 1, avatarCandidates.length))}
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
    const selectedCredentialImageUrlsRef = useRef(new Map());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingAppUser, setSavingAppUser] = useState(false);
    const [inviteSending, setInviteSending] = useState(false);
    const [error, setError] = useState('');
    const [inviteMessage, setInviteMessage] = useState('');
    const [employees, setEmployees] = useState([]);
    const [appUsers, setAppUsers] = useState([]);
    const [profileImageUrls, setProfileImageUrls] = useState({});
    const [search, setSearch] = useState('');
    const [columnFilterMenu, setColumnFilterMenu] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [accountFilter, setAccountFilter] = useState('all');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(emptyEmployeeForm());
    const [employeeFullNameInput, setEmployeeFullNameInput] = useState('');
    const [employeePendingDelete, setEmployeePendingDelete] = useState(null);
    const [saveAndInvite, setSaveAndInvite] = useState(false);
    const [showAppUserModal, setShowAppUserModal] = useState(false);
    const [appUserForm, setAppUserForm] = useState(emptyAppUserForm());
    const [appUserPendingDelete, setAppUserPendingDelete] = useState(null);
    const [showTruckDeviceModal, setShowTruckDeviceModal] = useState(false);
    const [truckDeviceForm, setTruckDeviceForm] = useState(emptyTruckDeviceForm());
    const [selectedInfoEntry, setSelectedInfoEntry] = useState(null);
    const [selectedCredentials, setSelectedCredentials] = useState([]);
    const [selectedCredentialsLoading, setSelectedCredentialsLoading] = useState(false);
    const [selectedCredentialsError, setSelectedCredentialsError] = useState('');
    const [employeeMenu, setEmployeeMenu] = useState(null);

    useEffect(() => {
        let active = true;
        (async () => {
            return Promise.all([rosteringAPI.getEmployees(), usersAPI.getAllUsers()]);
        })()
            .then(([employeeRows, userRows]) => {
                if (!active) return;
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

    useEffect(() => {
        if (!employeeMenu) {
            return undefined;
        }

        const closeMenu = () => setEmployeeMenu(null);
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') {
                closeMenu();
            }
        };

        window.addEventListener('click', closeMenu);
        window.addEventListener('keydown', closeOnEscape);
        window.addEventListener('scroll', closeMenu, true);
        return () => {
            window.removeEventListener('click', closeMenu);
            window.removeEventListener('keydown', closeOnEscape);
            window.removeEventListener('scroll', closeMenu, true);
        };
    }, [employeeMenu]);

    useEffect(() => {
        if (!selectedInfoEntry) {
            return undefined;
        }

        const closeOnEscape = (event) => {
            if (event.key === 'Escape' && !document.querySelector('.employee-credential-viewer')) {
                setSelectedInfoEntry(null);
                setShowModal(false);
                setShowAppUserModal(false);
            }
        };

        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [selectedInfoEntry]);

    useEffect(() => {
        const credentialUserId = selectedInfoEntry?.appUser?.id || selectedInfoEntry?.employee?.linkedAuthUserId || '';
        let active = true;

        selectedCredentialImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        selectedCredentialImageUrlsRef.current.clear();
        setSelectedCredentials([]);
        setSelectedCredentialsError('');
        if (!credentialUserId) {
            setSelectedCredentialsLoading(false);
            return () => { active = false; };
        }

        setSelectedCredentialsLoading(true);
        usersAPI.getUserCredentials(credentialUserId)
            .then((rows) => {
                const credentialRows = Array.isArray(rows) ? rows : [];
                if (!active) return;
                setSelectedCredentials(credentialRows);

                credentialRows.forEach((credential) => {
                    if (!credential.hasFrontImage) return;
                    loadEmployeeCredentialImage(credentialUserId, credential).then((loadedCredential) => {
                        const nextUrl = loadedCredential.frontImageUrl;
                        if (!active) {
                            if (nextUrl?.startsWith('blob:')) URL.revokeObjectURL(nextUrl);
                            return;
                        }

                        const previousUrl = selectedCredentialImageUrlsRef.current.get(credential.credentialType);
                        if (previousUrl) URL.revokeObjectURL(previousUrl);
                        if (nextUrl?.startsWith('blob:')) selectedCredentialImageUrlsRef.current.set(credential.credentialType, nextUrl);
                        setSelectedCredentials((current) => current.map((item) => (
                            item.credentialType === credential.credentialType ? loadedCredential : item
                        )));
                    });
                });
            })
            .catch((credentialError) => {
                if (active) {
                    setSelectedCredentialsError(credentialError.response?.data?.error || credentialError.message || 'Unable to load licence details.');
                }
            })
            .finally(() => {
                if (active) setSelectedCredentialsLoading(false);
            });

        return () => { active = false; };
    }, [selectedInfoEntry?.appUser?.id, selectedInfoEntry?.employee?.linkedAuthUserId]);

    useEffect(() => () => {
        selectedCredentialImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        selectedCredentialImageUrlsRef.current.clear();
    }, []);

    useEffect(() => {
        let active = true;
        const userIds = [
            ...appUsers.map(user => user.id),
            ...employees.map(employee => employee.linkedAuthUserId)
        ].filter(Boolean);

        if (userIds.length === 0) {
            setProfileImageUrls({});
            return () => {
                active = false;
            };
        }

        resolveProfileImageUrls(userIds)
            .then(urls => {
                if (active) {
                    setProfileImageUrls(urls);
                }
            })
            .catch(() => {
                if (active) {
                    setProfileImageUrls({});
                }
            });

        return () => {
            active = false;
        };
    }, [appUsers, employees]);

    const mergedEntries = useMemo(() => {
        const appUserById = Object.fromEntries(appUsers.map((u) => [u.id, u]));
        const appUserByEmail = Object.fromEntries(appUsers
            .filter((u) => u.email)
            .map((u) => [u.email.trim().toLowerCase(), u]));
        const linkedUserIds = new Set();
        const result = [];

        for (const emp of employees) {
            const emailKey = (emp.email || '').trim().toLowerCase();
            const linkedAppUser = emp.linkedAuthUserId ? (appUserById[emp.linkedAuthUserId] ?? null) : null;
            const appUser = linkedAppUser ?? appUserByEmail[emailKey] ?? null;
            if (appUser) linkedUserIds.add(appUser.id);
            const effectiveRole = appUser?.role || (emp.leadingHand ? 'leading_hand' : 'general_scaffolder');
            const appUserAvatars = getAvatarCandidates(appUser);
            const linkedProfileImageUrl = profileImageUrls[appUser?.id] || profileImageUrls[emp.linkedAuthUserId] || '';
            const storageAvatars = linkedProfileImageUrl ? [linkedProfileImageUrl] : [];
            result.push({
                key: `emp-${emp.id}`,
                type: 'employee',
                employee: emp,
                appUser,
                displayName: `${emp.firstName} ${emp.lastName}`,
                displayPhone: emp.phoneNumber || appUser?.phoneNumber || null,
                displayEmail: emp.email || appUser?.email || null,
                isVerified: !!emp.verifiedAt,
                role: effectiveRole,
                leadingHand: effectiveRole === 'leading_hand',
                preferredSiteIds: emp.preferredSiteIds || [],
                avatarCandidates: appUserAvatars.length > 0 ? appUserAvatars : [...storageAvatars, ...getAvatarCandidates(emp)],
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
                    avatarCandidates: getAvatarCandidates(u).length > 0 ? getAvatarCandidates(u) : (profileImageUrls[u.id] ? [profileImageUrls[u.id]] : []),
                });
            }
        }

        return result;
    }, [employees, appUsers, profileImageUrls]);

    const roleFilterOptions = useMemo(() => {
        const roles = Array.from(new Set(mergedEntries.map((entry) => entry.role).filter(Boolean)));
        return roles.map((role) => ({ value: role, label: getRoleLabel(role) })).sort((a, b) => a.label.localeCompare(b.label));
    }, [mergedEntries]);

    const filteredEntries = useMemo(() => {
        const q = search.trim().toLowerCase();
        return mergedEntries.filter((entry) => {
            if (roleFilter !== 'all' && entry.role !== roleFilter) return false;
            if (accountFilter !== 'all' && getAccountStatus(entry).className !== accountFilter) return false;
            if (!q) return true;
            const name = entry.displayName.toLowerCase();
            const phone = (entry.displayPhone || '').toLowerCase();
            const email = (entry.displayEmail || '').toLowerCase();
            const role = getRoleLabel(entry.role).toLowerCase();
            const account = getAccountStatus(entry).label.toLowerCase();
            return name.includes(q) || phone.includes(q) || email.includes(q) || role.includes(q) || account.includes(q);
        });
    }, [mergedEntries, search, roleFilter, accountFilter]);

    const pagedEntries = filteredEntries;

    const openEmployeeDetails = (entry) => {
        setSelectedInfoEntry(entry);
    };

    const openEmployeeMenu = (event, entry) => {
        event.preventDefault();
        event.stopPropagation();

        const menuWidth = 224;
        const menuHeight = entry.leadingHand && entry.type === 'employee' ? 206 : 160;
        const viewportPadding = 12;
        const x = Math.min(event.clientX, window.innerWidth - menuWidth - viewportPadding);
        const y = Math.min(event.clientY, window.innerHeight - menuHeight - viewportPadding);

        setColumnFilterMenu('');
        setEmployeeMenu({
            entry,
            x: Math.max(viewportPadding, x),
            y: Math.max(viewportPadding, y)
        });
    };

    const editEntry = (entry) => {
        setSelectedInfoEntry(entry);
        if (entry.type === 'employee') {
            openEmployeeEditor(entry.employee, entry.role);
        } else {
            openAppUserEditor(entry.appUser);
        }
    };

    const deleteEntry = (entry) => {
        if (entry.type === 'employee') {
            setEmployeePendingDelete(entry.employee);
        } else {
            setAppUserPendingDelete(entry.appUser);
        }
    };

    const runEmployeeMenuAction = (action) => {
        const entry = employeeMenu?.entry;
        setEmployeeMenu(null);
        if (entry) {
            action(entry);
        }
    };

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
        setEmployeeFullNameInput(`${employee.firstName || ''} ${employee.lastName || ''}`.trim());
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
                setSelectedInfoEntry(null);
                setForm(emptyEmployeeForm());
                setSaveAndInvite(false);
                return;
            }

            setShowModal(false);
            setSelectedInfoEntry(null);
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
            setSelectedInfoEntry(null);
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
                    currentEmail: refreshed.email || '',
                    effectiveRole: form.effectiveRole,
                    selectedRole: form.selectedRole
                });
                setSelectedInfoEntry((previous) => previous ? ({
                    ...previous,
                    employee: refreshed,
                    displayEmail: refreshed.email || null,
                    isVerified: !!refreshed.verifiedAt
                }) : previous);
            }
            setInviteMessage(`Invite sent to ${form.email.trim()}`);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Could not send employee invite');
        } finally {
            setInviteSending(false);
        }
    };

    const updateEmployeeFullName = (value) => {
        setEmployeeFullNameInput(value);
        setForm((prev) => {
            const parts = value.trim().split(/\s+/).filter(Boolean);
            if (parts.length === 0) {
                return { ...prev, firstName: '', lastName: '' };
            }
            return {
                ...prev,
                firstName: parts[0],
                lastName: parts.slice(1).join(' ')
            };
        });
    };

    const selectedInfoStatus = selectedInfoEntry ? getAccountStatus(selectedInfoEntry) : null;
    const selectedEmployeeProfile = selectedInfoEntry?.appUser || null;

    return (
        <div className="module-page employees-page">
            <div className="module-shell employees-shell">
                <div className="employees-toolbar">
                    <div className="employees-toolbar-copy">
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
                        <button className="module-primary-btn" onClick={() => { setForm(emptyEmployeeForm()); setEmployeeFullNameInput(''); setShowModal(true); setInviteMessage(''); setError(''); setSaveAndInvite(false); }}>
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
                        <div className="employees-loading page-loading-brandmark"><LoadingBrandmark label="Loading employees" /></div>
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
                                        <th>Contact</th>
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
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedEntries.map((entry) => {
                                        const status = getAccountStatus(entry);
                                        const isExpanded = selectedInfoEntry?.key === entry.key;
                                        return (
                                            <React.Fragment key={entry.key}>
                                                <tr
                                                    className={`employees-data-row ${isExpanded ? 'selected' : ''}`}
                                                    onClick={() => openEmployeeDetails(entry)}
                                                    onContextMenu={(event) => openEmployeeMenu(event, entry)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            openEmployeeDetails(entry);
                                                        }
                                                    }}
                                                    aria-expanded={isExpanded}
                                                    aria-haspopup="dialog"
                                                    tabIndex={0}
                                                >
                                                    <td>
                                                        <div className="employees-identity-cell">
                                                            <EmployeeAvatar entry={entry} />
                                                            <strong>{entry.displayName}</strong>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="employees-role-text">
                                                            {getRoleLabel(entry.role)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="employees-contact-cell">
                                                            <span>{entry.displayPhone || '-'}</span>
                                                            <small>{entry.displayEmail || '-'}</small>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`employees-account-pill ${status.className}`}>{status.label}</span>
                                                    </td>
                                                    <td>
                                                        <div className="employees-table-actions">
                                                            {entry.leadingHand && entry.type === 'employee' ? (
                                                                <EmployeeActionButton
                                                                    title={`Open leading hand relationships for ${entry.displayName}`}
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        onOpenLeadingHandRelationships?.(entry.employee);
                                                                    }}
                                                                >
                                                                    <TreeIcon />
                                                                </EmployeeActionButton>
                                                            ) : null}
                                                            <EmployeeActionButton
                                                                title={`Edit ${entry.displayName}`}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    editEntry(entry);
                                                                }}
                                                            >
                                                                <EditIcon />
                                                            </EmployeeActionButton>
                                                            <EmployeeActionButton
                                                                danger
                                                                title={`Delete ${entry.displayName}`}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    deleteEntry(entry);
                                                                }}
                                                            >
                                                                <DeleteIcon />
                                                            </EmployeeActionButton>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="employees-table-footer">
                                <span>{filteredEntries.length} employee{filteredEntries.length === 1 ? '' : 's'}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {employeeMenu ? (
                <div
                    className="employees-context-menu"
                    style={{ top: employeeMenu.y, left: employeeMenu.x }}
                    onClick={(event) => event.stopPropagation()}
                    role="menu"
                    aria-label="Employee actions"
                >
                    <button
                        type="button"
                        className="employees-context-menu-item"
                        onClick={() => runEmployeeMenuAction(openEmployeeDetails)}
                        role="menuitem"
                    >
                        <Info size={15} strokeWidth={2.3} aria-hidden="true" />
                        <span>Open Details</span>
                    </button>
                    {employeeMenu.entry.leadingHand && employeeMenu.entry.type === 'employee' ? (
                        <button
                            type="button"
                            className="employees-context-menu-item"
                            onClick={() => runEmployeeMenuAction((entry) => onOpenLeadingHandRelationships?.(entry.employee))}
                            role="menuitem"
                        >
                            <TreeIcon />
                            <span>Relationships</span>
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="employees-context-menu-item"
                        onClick={() => runEmployeeMenuAction(editEntry)}
                        role="menuitem"
                    >
                        <EditIcon />
                        <span>Edit</span>
                    </button>
                    <div className="employees-context-menu-divider" role="separator"></div>
                    <button
                        type="button"
                        className="employees-context-menu-item danger"
                        onClick={() => runEmployeeMenuAction(deleteEntry)}
                        role="menuitem"
                    >
                        <DeleteIcon />
                        <span>Delete</span>
                    </button>
                </div>
            ) : null}

            {selectedInfoEntry && !showModal && !showAppUserModal ? (
                <div className="module-modal-backdrop employee-details-backdrop" onClick={() => setSelectedInfoEntry(null)}>
                    <section
                        className="module-modal employees-info-modal employee-details-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="employee-details-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="employee-details-header">
                            <div className="employee-details-title-row">
                                <h2 id="employee-details-title">Employee details</h2>
                                <button
                                    type="button"
                                    className="employee-details-close"
                                    onClick={() => setSelectedInfoEntry(null)}
                                    aria-label="Close employee details"
                                >
                                    <X size={16} strokeWidth={2.25} aria-hidden="true" />
                                </button>
                            </div>
                            <div className="employee-details-identity">
                                <div className="employee-details-avatar" aria-hidden="true">
                                    <EmployeeAvatar entry={selectedInfoEntry} />
                                </div>
                                <div className="employee-details-identity-copy">
                                    <strong>{selectedInfoEntry.displayName}</strong>
                                    <span>{getRoleLabel(selectedInfoEntry.role)}</span>
                                    <span className={`employees-account-pill ${selectedInfoStatus.className}`}>{selectedInfoStatus.label}</span>
                                </div>
                            </div>
                        </header>

                        <div className="employee-details-content">
                            <section className="employee-details-section">
                                <h3>Employee information</h3>
                                <div className="employee-details-grid">
                                    <div className="employee-details-field">
                                        <span>Full Name</span>
                                        <strong>{selectedInfoEntry.displayName}</strong>
                                    </div>
                                    <div className="employee-details-field">
                                        <span>Role</span>
                                        <strong>{getRoleLabel(selectedInfoEntry.role)}</strong>
                                    </div>
                                    <div className="employee-details-field">
                                        <span>Phone</span>
                                        <strong>{selectedInfoEntry.displayPhone || '-'}</strong>
                                    </div>
                                    <div className="employee-details-field">
                                        <span>Email</span>
                                        <strong>{selectedInfoEntry.displayEmail || '-'}</strong>
                                    </div>
                                    <div className="employee-details-field">
                                        <span>Account Status</span>
                                        <strong>{selectedInfoStatus.label}</strong>
                                    </div>
                                    <div className="employee-details-field">
                                        <span>Invite Sent</span>
                                        <strong>{formatEmployeeDate(selectedInfoEntry.employee?.inviteSentAt)}</strong>
                                    </div>
                                </div>
                            </section>

                            <EmployeeProfileSections profile={selectedEmployeeProfile} />
                            <EmployeeCredentialsSection
                                credentials={selectedCredentials}
                                loading={selectedCredentialsLoading}
                                error={selectedCredentialsError}
                            />
                        </div>

                        <footer className="employee-details-footer">
                            <button
                                type="button"
                                className="employee-details-primary-btn"
                                onClick={() => editEntry(selectedInfoEntry)}
                            >
                                <EditIcon />
                                Edit Employee
                            </button>
                        </footer>
                    </section>
                </div>
            ) : null}

            {showModal && form.id && selectedInfoEntry ? (
                <div
                    className="module-modal-backdrop employee-details-backdrop"
                    onClick={() => {
                        setShowModal(false);
                        setSelectedInfoEntry(null);
                    }}
                >
                    <section
                        className="module-modal employees-info-modal employee-details-modal employee-details-edit-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="employee-edit-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="employee-details-header">
                            <div className="employee-details-title-row">
                                <h2 id="employee-edit-title">Edit employee</h2>
                                <button
                                    type="button"
                                    className="employee-details-close"
                                    onClick={() => {
                                        setShowModal(false);
                                        setSelectedInfoEntry(null);
                                    }}
                                    aria-label="Close employee editor"
                                >
                                    <X size={16} strokeWidth={2.25} aria-hidden="true" />
                                </button>
                            </div>
                            <div className="employee-details-identity">
                                <div className="employee-details-avatar" aria-hidden="true">
                                    <EmployeeAvatar entry={selectedInfoEntry} />
                                </div>
                                <div className="employee-details-identity-copy">
                                    <strong>{employeeFullNameInput || selectedInfoEntry.displayName}</strong>
                                    <span>{getRoleLabel(form.selectedRole)}</span>
                                    <span className={`employees-account-pill ${selectedInfoStatus.className}`}>{selectedInfoStatus.label}</span>
                                </div>
                            </div>
                        </header>

                        <form className="employee-details-edit-form" onSubmit={(event) => saveEmployee(event, { inviteAfterSave: false })}>
                            <div className="employee-details-content">
                                <section className="employee-details-section">
                                    <h3>Employee information</h3>
                                    <div className="employee-details-grid">
                                    <label className="employee-details-field">
                                        <span>Full Name</span>
                                        <input
                                            value={employeeFullNameInput}
                                            onChange={(event) => updateEmployeeFullName(event.target.value)}
                                            placeholder="Employee name"
                                            autoComplete="name"
                                        />
                                    </label>
                                    <label className="employee-details-field">
                                        <span>Role</span>
                                        <select
                                            value={form.selectedRole}
                                            onChange={(event) => setForm((previous) => ({ ...previous, selectedRole: event.target.value }))}
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
                                    </label>
                                    <label className="employee-details-field">
                                        <span>Phone</span>
                                        <input
                                            value={form.phoneNumber}
                                            onChange={(event) => setForm((previous) => ({ ...previous, phoneNumber: event.target.value }))}
                                            placeholder="0400 000 000"
                                            autoComplete="tel"
                                        />
                                    </label>
                                    <label className="employee-details-field">
                                        <span>Email</span>
                                        <input
                                            type="email"
                                            value={form.email}
                                            onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
                                            placeholder="employee@company.com"
                                            autoComplete="email"
                                        />
                                    </label>
                                    <div className="employee-details-field">
                                        <span>Account Status</span>
                                        <strong>{selectedInfoStatus.label}</strong>
                                    </div>
                                    <div className="employee-details-field">
                                        <span>Invite Sent</span>
                                        <strong>{formatEmployeeDate(form.inviteSentAt)}</strong>
                                    </div>
                                    </div>
                                </section>

                                <EmployeeProfileSections profile={selectedEmployeeProfile} readOnly />
                                <EmployeeCredentialsSection
                                    credentials={selectedCredentials}
                                    loading={selectedCredentialsLoading}
                                    error={selectedCredentialsError}
                                    readOnly
                                />

                                {inviteMessage ? <div className="module-success employee-details-message">{inviteMessage}</div> : null}
                                {error ? <div className="module-error employee-details-message">{error}</div> : null}
                            </div>

                            <footer className="employee-details-footer employee-details-edit-footer">
                                <div className="employee-details-footer-leading">
                                    {form.selectedRole === 'leading_hand' ? (
                                        <button
                                            type="button"
                                            className="employee-details-secondary-btn"
                                            onClick={() => {
                                                setShowModal(false);
                                                setSelectedInfoEntry(null);
                                                onOpenLeadingHandRelationships?.(form);
                                            }}
                                        >
                                            Leading Hand Relationships
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        className="employee-details-invite-btn"
                                        onClick={sendEmployeeInvite}
                                        disabled={inviteSending || !form.email.trim()}
                                    >
                                        {inviteSending ? 'Sending...' : 'Invite User'}
                                    </button>
                                </div>
                                <div className="employee-details-footer-actions">
                                    <button
                                        type="button"
                                        className="employee-details-secondary-btn"
                                        disabled={saving}
                                        onClick={() => {
                                            setShowModal(false);
                                            setSelectedInfoEntry(null);
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="employee-details-primary-btn" disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Employee'}
                                    </button>
                                </div>
                            </footer>
                        </form>
                    </section>
                </div>
            ) : null}

            {showModal && !form.id && (
                <div className="module-modal-backdrop employee-form-backdrop" onClick={() => setShowModal(false)}>
                    <div className="module-modal employee-form-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="employee-form-header">
                            <button type="button" className="employee-form-close" onClick={() => setShowModal(false)}>×</button>
                            <div className="employee-form-icon" aria-hidden="true">
                                <UserPlus size={24} />
                            </div>
                            <h3>{form.id ? 'Edit Employee' : 'Add Employee'}</h3>
                            <p>Complete the form below to {form.id ? 'update this employee.' : 'add a new employee.'}</p>
                        </div>
                        <form className="module-form employee-form" onSubmit={(event) => saveEmployee(event, { inviteAfterSave: saveAndInvite })}>
                            <div className="module-field">
                                <label>Full name</label>
                                <input value={employeeFullNameInput} onChange={(e) => updateEmployeeFullName(e.target.value)} placeholder="Employee name" />
                            </div>
                            <div className="module-field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                                    placeholder="employee@company.com"
                                />
                            </div>
                            <div className="employee-form-grid">
                                <div className="module-field">
                                    <label>Phone Number</label>
                                    <input value={form.phoneNumber} onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))} placeholder="0400 000 000" />
                                </div>
                                <div className="module-field">
                                    <label>Designation</label>
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
                            </div>
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

            {showAppUserModal && selectedInfoEntry ? (
                <div
                    className="module-modal-backdrop employee-details-backdrop"
                    onClick={() => {
                        setShowAppUserModal(false);
                        setSelectedInfoEntry(null);
                    }}
                >
                    <section
                        className="module-modal employees-info-modal employee-details-modal employee-details-edit-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="app-user-edit-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="employee-details-header">
                            <div className="employee-details-title-row">
                                <h2 id="app-user-edit-title">Edit employee</h2>
                                <button
                                    type="button"
                                    className="employee-details-close"
                                    onClick={() => {
                                        setShowAppUserModal(false);
                                        setSelectedInfoEntry(null);
                                    }}
                                    aria-label="Close employee editor"
                                >
                                    <X size={16} strokeWidth={2.25} aria-hidden="true" />
                                </button>
                            </div>
                            <div className="employee-details-identity">
                                <div className="employee-details-avatar" aria-hidden="true">
                                    <EmployeeAvatar entry={selectedInfoEntry} />
                                </div>
                                <div className="employee-details-identity-copy">
                                    <strong>{appUserForm.fullName || selectedInfoEntry.displayName}</strong>
                                    <span>{getRoleLabel(appUserForm.role)}</span>
                                    <span className={`employees-account-pill ${selectedInfoStatus.className}`}>{selectedInfoStatus.label}</span>
                                </div>
                            </div>
                        </header>

                        <form className="employee-details-edit-form" onSubmit={saveAppUser}>
                            <div className="employee-details-content">
                                <section className="employee-details-section">
                                    <h3>Employee information</h3>
                                    <div className="employee-details-grid">
                                    <label className="employee-details-field">
                                        <span>Full Name</span>
                                        <input
                                            value={appUserForm.fullName}
                                            onChange={(event) => setAppUserForm((previous) => ({ ...previous, fullName: event.target.value }))}
                                            placeholder="Full name"
                                            autoComplete="name"
                                        />
                                    </label>
                                    <label className="employee-details-field">
                                        <span>Role</span>
                                        <select
                                            value={appUserForm.role}
                                            onChange={(event) => setAppUserForm((previous) => ({ ...previous, role: event.target.value }))}
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
                                    </label>
                                    <label className="employee-details-field">
                                        <span>Phone</span>
                                        <input
                                            value={appUserForm.phoneNumber}
                                            onChange={(event) => setAppUserForm((previous) => ({ ...previous, phoneNumber: event.target.value }))}
                                            placeholder="0400 000 000"
                                            autoComplete="tel"
                                        />
                                    </label>
                                    <label className="employee-details-field">
                                        <span>Email</span>
                                        <input value={appUserForm.email} disabled />
                                    </label>
                                    <div className="employee-details-field">
                                        <span>Account Status</span>
                                        <strong>{selectedInfoStatus.label}</strong>
                                    </div>
                                    <div className="employee-details-field">
                                        <span>Invite Sent</span>
                                        <strong>{formatEmployeeDate(selectedInfoEntry.employee?.inviteSentAt)}</strong>
                                    </div>
                                    </div>
                                </section>

                                <EmployeeProfileSections profile={selectedEmployeeProfile} readOnly />
                                <EmployeeCredentialsSection
                                    credentials={selectedCredentials}
                                    loading={selectedCredentialsLoading}
                                    error={selectedCredentialsError}
                                    readOnly
                                />

                                {error ? <div className="module-error employee-details-message">{error}</div> : null}
                            </div>

                            <footer className="employee-details-footer employee-details-edit-footer">
                                <div className="employee-details-footer-actions">
                                    <button
                                        type="button"
                                        className="employee-details-secondary-btn"
                                        disabled={savingAppUser}
                                        onClick={() => {
                                            setShowAppUserModal(false);
                                            setSelectedInfoEntry(null);
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="employee-details-primary-btn" disabled={savingAppUser}>
                                        {savingAppUser ? 'Saving...' : 'Save Employee'}
                                    </button>
                                </div>
                            </footer>
                        </form>
                    </section>
                </div>
            ) : null}

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
