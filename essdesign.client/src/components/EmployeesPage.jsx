import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Info, Mail, MapPin, Maximize2, MoreHorizontal, Phone, Plus, Search, User, UserPlus, X } from 'lucide-react';
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

const INDIVIDUAL_ROLE_OPTIONS = [
    { value: 'general_scaffolder', label: 'Scaffolder' },
    { value: 'leading_hand', label: 'Leading Hand' },
    { value: 'scaffold_designer', label: 'Scaffold Designer' },
    { value: 'site_supervisor', label: 'Site Supervisor' },
    { value: 'project_manager', label: 'Project Manager' },
    { value: 'transport_management', label: 'Transport Management' },
    { value: 'admin', label: 'Admin' },
    { value: 'viewer', label: 'Viewer' }
];

const INDIVIDUAL_ROLE_VALUES = new Set(INDIVIDUAL_ROLE_OPTIONS.map((option) => option.value));
const TRUCK_ROLE_VALUES = new Set(['truck_ess01', 'truck_ess02', 'truck_ess03']);

function isTruckRole(role) {
    return TRUCK_ROLE_VALUES.has(role);
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
    if (entry.type === 'app-user' || entry.isVerified || entry.appUser) {
        return { label: 'Verified', className: 'verified' };
    }
    if (entry.type === 'employee' && entry.employee?.inviteSentAt) {
        return { label: 'Invited', className: 'invited' };
    }
    return { label: 'Not Verified', className: 'unverified' };
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
    const [roleFilter, setRoleFilter] = useState('all');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(emptyEmployeeForm());
    const [employeeFullNameInput, setEmployeeFullNameInput] = useState('');
    const [employeePendingDelete, setEmployeePendingDelete] = useState(null);
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
        const closeOnEscape = (event) => {
            if (event.key === 'Escape' && (showModal || showAppUserModal) && !document.querySelector('.employee-credential-viewer')) {
                setShowModal(false);
                setShowAppUserModal(false);
            }
        };

        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [showModal, showAppUserModal]);

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
        const roles = Array.from(new Set(mergedEntries
            .map((entry) => entry.role)
            .filter((role) => role && !isTruckRole(role))));
        return roles.map((role) => ({ value: role, label: getRoleLabel(role) })).sort((a, b) => a.label.localeCompare(b.label));
    }, [mergedEntries]);

    const filteredEntries = useMemo(() => {
        const q = search.trim().toLowerCase();
        return mergedEntries.filter((entry) => {
            if (roleFilter !== 'all' && entry.role !== roleFilter) return false;
            if (!q) return true;
            const name = entry.displayName.toLowerCase();
            const phone = (entry.displayPhone || '').toLowerCase();
            const email = (entry.displayEmail || '').toLowerCase();
            const role = getRoleLabel(entry.role).toLowerCase();
            const account = getAccountStatus(entry).label.toLowerCase();
            return name.includes(q) || phone.includes(q) || email.includes(q) || role.includes(q) || account.includes(q);
        });
    }, [mergedEntries, search, roleFilter]);

    useEffect(() => {
        if (loading || mergedEntries.length === 0) {
            if (!loading) setSelectedInfoEntry(null);
            return;
        }

        setSelectedInfoEntry((current) => {
            const refreshedSelection = current
                ? mergedEntries.find((entry) => entry.key === current.key)
                : null;

            if (filteredEntries.length === 0) {
                return refreshedSelection || mergedEntries[0];
            }

            return filteredEntries.find((entry) => entry.key === current?.key) || filteredEntries[0];
        });
    }, [filteredEntries, loading, mergedEntries]);

    const pagedEntries = filteredEntries;

    const openEmployeeDetails = (entry) => {
        if (entry.key !== selectedInfoEntry?.key) {
            setShowModal(false);
            setShowAppUserModal(false);
            setError('');
            setInviteMessage('');
        }
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
        const requestedRole = effectiveRole || (employee.leadingHand ? 'leading_hand' : 'general_scaffolder');
        const resolvedRole = INDIVIDUAL_ROLE_VALUES.has(requestedRole) ? requestedRole : 'general_scaffolder';
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

    const saveEmployee = async (event) => {
        event?.preventDefault?.();
        setSaving(true);
        setError('');
        setInviteMessage('');
        try {
            const inviteAfterSave = !form.id;
            const normalizedEmail = (form.email || '').trim().toLowerCase();
            if (inviteAfterSave && !normalizedEmail) {
                throw new Error('Enter an email address to start employee registration.');
            }
            if (!INDIVIDUAL_ROLE_VALUES.has(form.selectedRole)) {
                throw new Error('Truck roles can only be assigned through Add Truck Device.');
            }
            const showPreferredSites = form.selectedRole === 'leading_hand' || form.selectedRole === 'general_scaffolder';
            const existingEmployee = inviteAfterSave
                ? employees.find((employee) => (
                    (employee.email || '').trim().toLowerCase() === normalizedEmail
                    && (employee.firstName || '').trim() === form.firstName.trim()
                    && (employee.lastName || '').trim() === form.lastName.trim()
                ))
                : null;
            const saveForm = {
                ...form,
                id: form.id || existingEmployee?.id || null,
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
                const savedEmployee = employeeRows.find((employee) =>
                    (saveForm.id ? employee.id === saveForm.id : true)
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
                return;
            }

            setShowModal(false);
            setForm(emptyEmployeeForm());
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

            if (isTruckRole(currentRole) ? nextRole !== currentRole : !INDIVIDUAL_ROLE_VALUES.has(nextRole)) {
                throw new Error('Truck roles can only be assigned through Add Truck Device.');
            }

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
    const selectedAppUserIsTruckDevice = isTruckRole(selectedInfoEntry?.appUser?.role);
    const isEditingEmployee = selectedInfoEntry?.type === 'employee' && showModal && !!form.id;
    const isEditingAppUser = selectedInfoEntry?.type === 'app-user' && showAppUserModal;
    const isInlineEditing = isEditingEmployee || isEditingAppUser;
    const inlineEditorName = isEditingEmployee ? employeeFullNameInput : appUserForm.fullName;
    const inlineEditorRole = isEditingEmployee ? form.selectedRole : appUserForm.role;
    const inlineEditorPhone = isEditingEmployee ? form.phoneNumber : appUserForm.phoneNumber;
    const inlineEditorEmail = isEditingEmployee ? form.email : appUserForm.email;

    const cancelInlineEdit = () => {
        setShowModal(false);
        setShowAppUserModal(false);
        setError('');
        setInviteMessage('');
    };

    const submitInlineEdit = (event) => {
        if (isEditingEmployee) {
            saveEmployee(event);
            return;
        }
        if (isEditingAppUser) {
            saveAppUser(event);
            return;
        }
        event.preventDefault();
    };

    return (
        <div className="module-page employees-page">
            <div className={`employees-workspace ${selectedInfoEntry ? '' : 'no-selection'}`.trim()}>
                {error && !showModal && !showAppUserModal && !employeePendingDelete && !appUserPendingDelete ? (
                    <div className="module-error employees-workspace-error">{error}</div>
                ) : null}

                {loading ? (
                    <div className="employees-loading page-loading-brandmark"><LoadingBrandmark label="Loading employees" /></div>
                ) : mergedEntries.length === 0 ? (
                    <div className="employees-empty-state">
                        <UserPlus size={24} aria-hidden="true" />
                        <strong>No employees yet</strong>
                        <span>Add your first employee to begin their registration.</span>
                        <button type="button" onClick={() => { setForm(emptyEmployeeForm()); setEmployeeFullNameInput(''); setShowModal(true); setInviteMessage(''); setError(''); }}>
                            <Plus size={16} aria-hidden="true" />
                            Add employee
                        </button>
                    </div>
                ) : (
                    <>
                        {selectedInfoEntry ? (
                            <aside className="employee-profile-summary" aria-label="Selected employee summary">
                                {selectedInfoEntry.leadingHand && selectedInfoEntry.type === 'employee' ? (
                                    <div className="employee-profile-summary-actions">
                                        <EmployeeActionButton
                                            title={`Open leading hand relationships for ${selectedInfoEntry.displayName}`}
                                            onClick={() => onOpenLeadingHandRelationships?.(selectedInfoEntry.employee)}
                                        >
                                            <TreeIcon />
                                        </EmployeeActionButton>
                                    </div>
                                ) : null}

                                <div className="employee-profile-summary-identity">
                                    <div className="employee-profile-summary-avatar"><EmployeeAvatar entry={selectedInfoEntry} /></div>
                                    <h2>{selectedInfoEntry.displayName}</h2>
                                    <p>{getRoleLabel(selectedInfoEntry.role)}</p>
                                    <span className={`employee-profile-status ${selectedInfoStatus.className}`}>
                                        <i aria-hidden="true" />
                                        {selectedInfoStatus.label}
                                    </span>
                                </div>

                                <dl className="employee-profile-summary-list">
                                    <div>
                                        <dt><Phone size={15} aria-hidden="true" /> Mobile</dt>
                                        <dd>{selectedInfoEntry.displayPhone || '-'}</dd>
                                    </div>
                                    <div>
                                        <dt><Mail size={15} aria-hidden="true" /> Email</dt>
                                        <dd>{selectedInfoEntry.displayEmail || '-'}</dd>
                                    </div>
                                    <div>
                                        <dt><Calendar size={15} aria-hidden="true" /> Date of birth</dt>
                                        <dd>{formatEmployeeBirthDate(selectedEmployeeProfile?.dateOfBirth)}</dd>
                                    </div>
                                    <div>
                                        <dt><MapPin size={15} aria-hidden="true" /> Residential address</dt>
                                        <dd>{formatEmployeeAddress(selectedEmployeeProfile)}</dd>
                                    </div>
                                </dl>
                            </aside>
                        ) : null}

                        {selectedInfoEntry ? (
                            <main className="employee-profile-main">
                                <form className={`employee-profile-inline-form ${isInlineEditing ? 'is-editing' : ''}`} onSubmit={submitInlineEdit}>
                                    <header className="employee-profile-main-header">
                                        <div className="employee-profile-heading">
                                            <span>Employees</span>
                                            <h1>{isInlineEditing ? 'Edit employee profile' : 'Employee profile'}</h1>
                                        </div>
                                        <div className="employee-profile-header-actions">
                                            {isInlineEditing ? (
                                                <>
                                                    <button type="button" className="employee-profile-cancel-btn" onClick={cancelInlineEdit} disabled={saving || savingAppUser}>
                                                        Cancel
                                                    </button>
                                                    <button type="submit" className="employee-profile-edit-btn" disabled={saving || savingAppUser}>
                                                        {saving || savingAppUser ? 'Saving...' : 'Save employee'}
                                                    </button>
                                                </>
                                            ) : (
                                                <button type="button" className="employee-profile-edit-btn" onClick={() => editEntry(selectedInfoEntry)}>
                                                    <EditIcon />
                                                    Edit employee
                                                </button>
                                            )}
                                        </div>
                                    </header>

                                    <div className="employee-profile-detail-grid">
                                        <section className="employee-profile-card">
                                            <h3><User size={17} aria-hidden="true" /> Personal details</h3>
                                            {isInlineEditing ? (
                                                <div className="employee-profile-fields employee-profile-edit-fields">
                                                    <label className="employee-profile-edit-field wide">
                                                        <span>Full name</span>
                                                        <input
                                                            value={inlineEditorName}
                                                            onChange={(event) => isEditingEmployee
                                                                ? updateEmployeeFullName(event.target.value)
                                                                : setAppUserForm((previous) => ({ ...previous, fullName: event.target.value }))}
                                                            autoComplete="name"
                                                        />
                                                    </label>
                                                    <label className="employee-profile-edit-field">
                                                        <span>Role</span>
                                                        <select
                                                            value={inlineEditorRole}
                                                            onChange={(event) => isEditingEmployee
                                                                ? setForm((previous) => ({ ...previous, selectedRole: event.target.value }))
                                                                : setAppUserForm((previous) => ({ ...previous, role: event.target.value }))}
                                                            disabled={selectedAppUserIsTruckDevice}
                                                        >
                                                            {selectedAppUserIsTruckDevice ? (
                                                                <option value={inlineEditorRole}>{getRoleLabel(inlineEditorRole)} (device only)</option>
                                                            ) : INDIVIDUAL_ROLE_OPTIONS.map((option) => (
                                                                <option key={option.value} value={option.value}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="employee-profile-edit-field">
                                                        <span>Mobile</span>
                                                        <input
                                                            value={inlineEditorPhone}
                                                            onChange={(event) => isEditingEmployee
                                                                ? setForm((previous) => ({ ...previous, phoneNumber: event.target.value }))
                                                                : setAppUserForm((previous) => ({ ...previous, phoneNumber: event.target.value }))}
                                                            autoComplete="tel"
                                                        />
                                                    </label>
                                                    <label className="employee-profile-edit-field wide">
                                                        <span>Email</span>
                                                        <input
                                                            type="email"
                                                            value={inlineEditorEmail}
                                                            onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
                                                            disabled={isEditingAppUser}
                                                            autoComplete="email"
                                                        />
                                                    </label>
                                                    <div><span>Date of birth</span><strong>{formatEmployeeBirthDate(selectedEmployeeProfile?.dateOfBirth)}</strong></div>
                                                    <div><span>Gender</span><strong>{formatEmployeeGender(selectedEmployeeProfile?.gender)}</strong></div>
                                                    <div className="wide"><span>Residential address</span><strong>{formatEmployeeAddress(selectedEmployeeProfile)}</strong></div>
                                                </div>
                                            ) : (
                                                <dl className="employee-profile-fields">
                                                    <div><dt>Date of birth</dt><dd>{formatEmployeeBirthDate(selectedEmployeeProfile?.dateOfBirth)}</dd></div>
                                                    <div><dt>Gender</dt><dd>{formatEmployeeGender(selectedEmployeeProfile?.gender)}</dd></div>
                                                    <div><dt>Mobile</dt><dd>{selectedInfoEntry.displayPhone || '-'}</dd></div>
                                                    <div><dt>Email</dt><dd>{selectedInfoEntry.displayEmail || '-'}</dd></div>
                                                    <div className="wide"><dt>Residential address</dt><dd>{formatEmployeeAddress(selectedEmployeeProfile)}</dd></div>
                                                </dl>
                                            )}
                                        </section>

                                        <section className="employee-profile-card">
                                            <h3><Phone size={17} aria-hidden="true" /> Emergency contact</h3>
                                            <dl className="employee-profile-fields">
                                                <div><dt>Contact name</dt><dd>{selectedEmployeeProfile?.emergencyContactName || '-'}</dd></div>
                                                <div><dt>Relationship</dt><dd>{selectedEmployeeProfile?.emergencyRelationship || '-'}</dd></div>
                                                <div><dt>Phone</dt><dd>{selectedEmployeeProfile?.emergencyPhoneNumber || '-'}</dd></div>
                                                <div><dt>Email</dt><dd>{selectedEmployeeProfile?.emergencyEmail || '-'}</dd></div>
                                                <div className="wide"><dt>Address</dt><dd>{selectedEmployeeProfile?.emergencyAddress || '-'}</dd></div>
                                            </dl>
                                        </section>

                                        {isInlineEditing ? (
                                            <div className="employee-profile-inline-tools">
                                                <div>
                                                    {isEditingEmployee && form.selectedRole === 'leading_hand' ? (
                                                        <button type="button" onClick={() => onOpenLeadingHandRelationships?.(form)}>Leading Hand Relationships</button>
                                                    ) : null}
                                                    {isEditingEmployee ? (
                                                        <button type="button" onClick={sendEmployeeInvite} disabled={inviteSending || !form.email.trim()}>
                                                            {inviteSending ? 'Sending...' : 'Invite user'}
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {inviteMessage ? <span className="employee-profile-inline-success">{inviteMessage}</span> : null}
                                                {error ? <span className="employee-profile-inline-error">{error}</span> : null}
                                            </div>
                                        ) : null}

                                        <EmployeeCredentialsSection
                                            credentials={selectedCredentials}
                                            loading={selectedCredentialsLoading}
                                            error={selectedCredentialsError}
                                        />
                                    </div>
                                </form>
                            </main>
                        ) : (
                            <main className="employee-profile-main employee-profile-main-empty">
                                <User size={28} aria-hidden="true" />
                                <strong>Select an employee</strong>
                                <span>Choose an employee from the directory to view their profile.</span>
                            </main>
                        )}

                        <aside className="employees-directory-panel" aria-label="Employee directory">
                            <header className="employees-directory-header">
                                <div>
                                    <span>Directory</span>
                                    <h2>Employees</h2>
                                </div>
                            </header>

                            <div className="employees-directory-tools">
                                <div className="employees-directory-search">
                                    <Search size={16} aria-hidden="true" />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Search employees..."
                                        aria-label="Search employees"
                                    />
                                </div>
                                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter employees by role">
                                    <option value="all">All roles</option>
                                    {roleFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                                <button
                                    type="button"
                                    className="employees-directory-add"
                                    onClick={() => { setForm(emptyEmployeeForm()); setEmployeeFullNameInput(''); setShowModal(true); setInviteMessage(''); setError(''); }}
                                >
                                    <Plus size={16} aria-hidden="true" />
                                    Add employee
                                </button>
                            </div>

                            <div className="employees-directory-list">
                                {pagedEntries.length === 0 ? (
                                    <div className="employees-directory-empty">No employees match your search.</div>
                                ) : pagedEntries.map((entry) => {
                                    const status = getAccountStatus(entry);
                                    const isSelected = selectedInfoEntry?.key === entry.key;
                                    return (
                                        <div
                                            key={entry.key}
                                            className={`employees-directory-row ${isSelected ? 'selected' : ''}`}
                                            onContextMenu={(event) => openEmployeeMenu(event, entry)}
                                        >
                                            <button
                                                type="button"
                                                className="employees-directory-person"
                                                onClick={() => openEmployeeDetails(entry)}
                                                aria-pressed={isSelected}
                                            >
                                                <EmployeeAvatar entry={entry} />
                                                <span className="employees-directory-person-copy">
                                                    <strong>{entry.displayName}</strong>
                                                    <small>{getRoleLabel(entry.role)}</small>
                                                    <small>{entry.displayEmail || entry.displayPhone || 'No contact details'}</small>
                                                </span>
                                                <span className={`employees-directory-status ${status.className}`} title={status.label}>
                                                    <i aria-hidden="true" />
                                                    {status.label}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                className="employees-directory-more"
                                                aria-label={`Open actions for ${entry.displayName}`}
                                                onClick={(event) => openEmployeeMenu(event, entry)}
                                            >
                                                <MoreHorizontal size={17} aria-hidden="true" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <footer className="employees-directory-footer">
                                <span>Showing {pagedEntries.length} of {mergedEntries.length}</span>
                                <button type="button" onClick={openTruckDeviceCreator}><TreeIcon /> Add truck device</button>
                            </footer>
                        </aside>
                    </>
                )}
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

            {showModal && form.id && selectedInfoEntry && !isInlineEditing ? (
                <div
                    className="module-modal-backdrop employee-details-backdrop"
                    onClick={() => {
                        setShowModal(false);
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

                        <form className="employee-details-edit-form" onSubmit={saveEmployee}>
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
                                            {INDIVIDUAL_ROLE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
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
                            <h3>Add Employee</h3>
                            <p>Save the employee to send their registration email automatically.</p>
                        </div>
                        <form className="module-form employee-form" onSubmit={saveEmployee}>
                            <div className="module-field">
                                <label>Full name</label>
                                <input value={employeeFullNameInput} onChange={(e) => updateEmployeeFullName(e.target.value)} placeholder="Employee name" required />
                            </div>
                            <div className="module-field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                                    placeholder="employee@company.com"
                                    required
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
                                        {INDIVIDUAL_ROLE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {error ? <div className="module-error">{error}</div> : null}
                            <div className="module-form-actions">
                                <button
                                    type="submit"
                                    className="module-primary-btn"
                                    disabled={saving}
                                >
                                    {saving ? 'Saving & sending invite...' : 'Save Employee'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showAppUserModal && selectedInfoEntry && !isInlineEditing ? (
                <div
                    className="module-modal-backdrop employee-details-backdrop"
                    onClick={() => {
                        setShowAppUserModal(false);
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
                                            disabled={selectedAppUserIsTruckDevice}
                                        >
                                            {selectedAppUserIsTruckDevice ? (
                                                <option value={appUserForm.role}>{getRoleLabel(appUserForm.role)} (device only)</option>
                                            ) : INDIVIDUAL_ROLE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
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
