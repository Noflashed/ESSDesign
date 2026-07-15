import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Mail, MoreVertical, Pencil, Phone, PlusCircle, Search, Trash2, UserPlus } from 'lucide-react';
import { analysisAPI, foldersAPI, resolveProfileImageUrl, rosteringAPI, safetyProjectsAPI, usersAPI } from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';

const SCAFFOLD_ENTITY_OPTIONS = ['Erect Safe Scaffolding', 'Maloo Access Group', 'Scaff-Technic'];
const DEFAULT_SCAFFOLD_ENTITY = SCAFFOLD_ENTITY_OPTIONS[0];

const SiteRegistryLocationIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
    </svg>
);

function emptyProjectForm(initialBuilderId = '') {
    return {
        builderId: initialBuilderId,
        projectName: '',
        siteLocation: '',
        siteLocationSourceId: '',
        designFolderId: '',
        designFolderPath: '',
        scaffoldEntity: DEFAULT_SCAFFOLD_ENTITY,
        projectManagerUserId: '',
        siteSupervisorUserId: '',
        leadingHandUserId: '',
        projectManagerEmployeeId: '',
        siteSupervisorEmployeeId: '',
        leadingHandEmployeeId: '',
        inductedEmployeeIds: [],
        editingProjectId: null
    };
}

function mapPreviewUrl(location) {
    if (!location) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`;
}

function emptyBuilderForm() {
    return {
        id: null,
        name: '',
        logoUrl: '',
        logoPath: '',
        designFolderId: '',
        designFolderPath: '',
        logoPreviewUrl: '',
        logoFile: null,
        removeLogo: false
    };
}

function builderToForm(builder, resolvedLogoUrl = '') {
    return {
        id: builder?.id || null,
        name: builder?.name || '',
        logoUrl: builder?.logoUrl || '',
        logoPath: builder?.logoPath || '',
        designFolderId: builder?.designFolderId || '',
        designFolderPath: builder?.designFolderPath || '',
        logoPreviewUrl: resolvedLogoUrl || builder?.logoUrl || '',
        logoFile: null,
        removeLogo: false
    };
}

function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error || new Error('Could not read builder logo'));
        reader.readAsDataURL(file);
    });
}

function BuilderLogoMark({ builder, logoSrc = '', selected = false, header = false }) {
    const logoUrl = logoSrc || builder?.logoUrl || '';
    return (
        <span className={`site-registry-row-location${selected ? ' selected' : ''}${header ? ' header' : ''}${logoUrl ? ' has-logo' : ''}`} aria-hidden="true">
            {logoUrl ? <img src={logoUrl} alt="" loading="eager" decoding="async" /> : <SiteRegistryLocationIcon size={header ? 16 : 17} />}
        </span>
    );
}

function projectSiteKey(project) {
    return project?.builder?.id && project?.id ? `${project.builder.id}:${project.id}` : '';
}

function normalizeScaffoldEntity(value) {
    const clean = String(value || '').trim();
    return SCAFFOLD_ENTITY_OPTIONS.find(entity => entity.toLowerCase() === clean.toLowerCase()) || DEFAULT_SCAFFOLD_ENTITY;
}

function designFolderLabel(folder) {
    return folder?.path || folder?.name || 'Unnamed folder';
}

function compactDesignFolderLabel(folder) {
    return folder?.scaffoldName || folder?.projectName || folder?.name || 'Unnamed folder';
}

function selectedDesignFolderPayload(folderId, folders) {
    const folder = folders.find(item => item.id === folderId);
    return {
        designFolderId: folderId || '',
        designFolderPath: folder ? designFolderLabel(folder) : ''
    };
}

function selectedProjectDesignFolderPayload(folderId, folders, fallbackPath = '') {
    if (!folderId) {
        return { designFolderId: '', designFolderPath: '' };
    }
    const folder = folders.find(item => item.id === folderId && Number(item.depth || 0) >= 2);
    if (!folder && !folders.length) {
        return {
            designFolderId: folderId,
            designFolderPath: fallbackPath
        };
    }
    return {
        designFolderId: folder?.id || '',
        designFolderPath: folder ? designFolderLabel(folder) : ''
    };
}

function employeeName(employee) {
    if (typeof employee === 'string') {
        return employee.trim() || 'Unnamed employee';
    }
    return `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || employee?.email || 'Unnamed employee';
}

function employeeInitials(employee) {
    const name = employeeName(employee);
    const parts = name.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)).toUpperCase();
}

function employeeFallbackRoleKey(employee) {
    return employee?.leadingHand ? 'leading_hand' : 'general_scaffolder';
}

function roleLabel(role) {
    switch (role) {
        case 'project_manager': return 'Project Manager';
        case 'site_supervisor': return 'Site Supervisor';
        case 'leading_hand': return 'Leading Hand';
        case 'general_scaffolder': return 'Scaffolder';
        case 'admin': return 'Admin';
        case 'viewer': return 'Viewer';
        default: return 'Employee';
    }
}

function appUserName(user) {
    return user?.fullName || user?.name || user?.email || 'Unnamed user';
}

function appUserInitials(user) {
    const name = appUserName(user);
    const parts = name.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)).toUpperCase();
}

function personDisplayName(person) {
    return person?.fullName || person?.name || employeeName(person);
}

function personEmail(person) {
    return person?.email || 'No email recorded';
}

function personPhone(person) {
    return person?.phoneNumber || 'No phone recorded';
}

function employeeMatchesSearchText(employee, roleText, query) {
    if (!query) {
        return true;
    }
    return [
        employeeName(employee),
        roleText,
        employee?.email || '',
        employee?.phoneNumber || ''
    ].join(' ').toLowerCase().includes(query);
}

function formatProjectDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function EmployeeAvatar({ employee }) {
    return <span className="site-registry-employee-avatar" aria-hidden="true">{employeeInitials(employee)}</span>;
}

function UserAvatar({ user }) {
    const avatarUrl = user?.avatarUrl || '';
    return (
        <span className={`site-registry-employee-avatar${avatarUrl ? ' has-image' : ''}`} aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : appUserInitials(user)}
        </span>
    );
}

function roleOptionValue(user) {
    return user?.value || user?.id || '';
}

function getRoleAvatarLookupId(user) {
    if (!user) {
        return '';
    }
    if (user.employeeId || user.EmployeeId) {
        return user.employeeId || user.EmployeeId;
    }
    if (user.authUserId) {
        return user.authUserId;
    }
    const id = user.id || '';
    return String(id).startsWith('employee:') ? '' : id;
}

function withRoleAvatar(user, avatarUrls) {
    const lookupId = getRoleAvatarLookupId(user);
    return lookupId && avatarUrls?.[lookupId] ? { ...user, avatarUrl: avatarUrls[lookupId] } : user;
}

const roleAvatarUrlCache = new Map();

function RoleUserSelect({ label, helper, role, value, options, avatarUrls, onChange }) {
    const [open, setOpen] = useState(false);
    const selectedUser = withRoleAvatar(options.find(user => roleOptionValue(user) === value) || null, avatarUrls);
    const chooseUser = (nextValue, option = null) => {
        onChange(nextValue, option);
        setOpen(false);
    };

    return (
        <div
            className={`site-registry-role-select${open ? ' open' : ''}`}
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setOpen(false);
                }
            }}
        >
            <div className="site-registry-role-select-label">
                <label>{label}</label>
                <span>{helper}</span>
            </div>
            <button
                type="button"
                className={`site-registry-role-select-control${selectedUser ? ' has-user' : ''}`}
                onClick={() => setOpen(prev => !prev)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                {selectedUser ? (
                    <>
                        <span className="site-registry-role-select-person">
                            <strong>{appUserName(selectedUser)}</strong>
                            <small>{selectedUser.email || 'No email recorded'}</small>
                        </span>
                        <span className={`site-registry-role-pill ${role}`}>{roleLabel(role)}</span>
                        <UserAvatar user={selectedUser} />
                    </>
                ) : (
                    <span className="site-registry-role-empty">Not assigned</span>
                )}
                <ChevronDown className="site-registry-role-chevron" size={15} strokeWidth={2.3} aria-hidden="true" />
            </button>
            {open ? (
                <div className="site-registry-role-menu" role="listbox" aria-label={label}>
                    <button
                        type="button"
                        className={`site-registry-role-menu-option empty${!selectedUser ? ' selected' : ''}`}
                        onClick={() => chooseUser('')}
                        role="option"
                        aria-selected={!selectedUser}
                    >
                        <span className="site-registry-role-menu-empty">Not assigned</span>
                    </button>
                    {options.length === 0 ? (
                        <div className="site-registry-role-menu-note">No matching users found.</div>
                    ) : options.map(user => {
                        const hydratedUser = withRoleAvatar(user, avatarUrls);
                        const optionValue = roleOptionValue(user);
                        const isSelected = optionValue === value;
                        return (
                            <button
                                key={optionValue}
                                type="button"
                                className={`site-registry-role-menu-option${isSelected ? ' selected' : ''}`}
                                onClick={() => chooseUser(optionValue, user)}
                                role="option"
                                aria-selected={isSelected}
                            >
                                <span className="site-registry-role-menu-person">
                                    <strong>{appUserName(hydratedUser)}</strong>
                                    <small>{hydratedUser.email || 'No email recorded'}</small>
                                </span>
                                <span className={`site-registry-role-pill ${role}`}>{roleLabel(role)}</span>
                                <UserAvatar user={hydratedUser} />
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

export default function SiteInformationPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [builders, setBuilders] = useState([]);
    const [designFolders, setDesignFolders] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [appUsers, setAppUsers] = useState([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [builderLogoUrls, setBuilderLogoUrls] = useState(() => new Map());
    const [roleAvatarUrls, setRoleAvatarUrls] = useState(() => ({}));
    const [selectedBuilderId, setSelectedBuilderId] = useState('');
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showBuilderModal, setShowBuilderModal] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [projectForm, setProjectForm] = useState(emptyProjectForm());
    const [projectEmployeeSearch, setProjectEmployeeSearch] = useState('');
    const [builderForm, setBuilderForm] = useState(emptyBuilderForm);
    const [siteAddressSuggestions, setSiteAddressSuggestions] = useState([]);
    const [siteAddressLoading, setSiteAddressLoading] = useState(false);
    const [selectedInfoProject, setSelectedInfoProject] = useState(null);
    const [columnFilterMenu, setColumnFilterMenu] = useState('');
    const [projectMenu, setProjectMenu] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [inductedSearch, setInductedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [scaffoldEntityFilter, setScaffoldEntityFilter] = useState('all');
    const [error, setError] = useState('');
    const autoLinkAttemptedRef = useRef(false);

    const loadBuilders = async () => {
        setLoading(true);
        setError('');
        try {
            const nextBuilders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
            setBuilders(nextBuilders);
            setSelectedBuilderId(prev => prev && nextBuilders.some(builder => builder.id === prev) ? prev : '');
        } catch (err) {
            setError(err.message || 'Failed to load site information');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBuilders().catch(() => {});
    }, []);

    useEffect(() => {
        let active = true;
        foldersAPI.getDesignFolderOptions()
            .then(options => {
                if (active) {
                    setDesignFolders(Array.isArray(options) ? options : []);
                }
            })
            .catch(() => {
                if (active) {
                    setDesignFolders([]);
                }
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (autoLinkAttemptedRef.current || loading || !builders.length || !designFolders.length) {
            return;
        }

        autoLinkAttemptedRef.current = true;
        safetyProjectsAPI.autoLinkDesignFolders(designFolders)
            .then(async nextBuilders => {
                if (Array.isArray(nextBuilders)) {
                    setBuilders(nextBuilders);
                }
                const nextOptions = await foldersAPI.getDesignFolderOptions();
                setDesignFolders(Array.isArray(nextOptions) ? nextOptions : []);
            })
            .catch(() => {});
    }, [builders.length, designFolders, loading]);

    useEffect(() => {
        let active = true;
        setEmployeesLoading(true);
        Promise.all([
            rosteringAPI.getEmployees(),
            usersAPI.getAllUsers()
        ])
            .then(([employeeRows, userRows]) => {
                if (active) {
                    setEmployees(employeeRows);
                    setAppUsers(Array.isArray(userRows) ? userRows : []);
                }
            })
            .catch(() => {
                if (active) {
                    setEmployees([]);
                    setAppUsers([]);
                }
            })
            .finally(() => {
                if (active) {
                    setEmployeesLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        setBuilderLogoUrls(prev => {
            const next = new Map();
            builders.forEach(builder => {
                next.set(builder.id, prev.get(builder.id) || builder.logoUrl || '');
            });
            return next;
        });

        builders.forEach(builder => {
            safetyProjectsAPI.resolveBuilderLogoUrl(builder)
                .then(url => {
                    if (!cancelled) {
                        setBuilderLogoUrls(prev => {
                            if (prev.get(builder.id) === (url || '')) {
                                return prev;
                            }
                            const next = new Map(prev);
                            next.set(builder.id, url || '');
                            return next;
                        });
                    }
                })
                .catch(() => {});
        });

        return () => {
            cancelled = true;
        };
    }, [builders]);

    useEffect(() => {
        if (!columnFilterMenu) {
            return undefined;
        }

        const closeMenu = () => {
            setColumnFilterMenu('');
        };
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [columnFilterMenu]);

    useEffect(() => {
        if (!projectMenu) {
            return undefined;
        }

        const closeMenu = () => setProjectMenu(null);
        const closeOnEscape = event => {
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
    }, [projectMenu]);

    const selectedBuilder = useMemo(
        () => builders.find(builder => builder.id === selectedBuilderId) || null,
        [builders, selectedBuilderId]
    );
    const projectFormBuilder = useMemo(
        () => builders.find(builder => builder.id === projectForm.builderId) || null,
        [builders, projectForm.builderId]
    );
    const builderDesignFolderOptions = useMemo(
        () => designFolders.filter(folder => folder.depth <= 1),
        [designFolders]
    );
    const projectDesignFolderOptions = useMemo(
        () => {
            const projectFolders = designFolders.filter(folder => Number(folder.depth || 0) >= 2);
            if (!projectFormBuilder) {
                return [];
            }

            if (projectFormBuilder.designFolderPath) {
                const prefix = `${projectFormBuilder.designFolderPath} /`;
                return projectFolders.filter(folder => folder.path?.startsWith(prefix));
            }

            const cleanBuilderName = projectFormBuilder.name.trim().toLowerCase();
            return projectFolders.filter(folder => String(folder.builderName || '').trim().toLowerCase() === cleanBuilderName);
        },
        [designFolders, projectFormBuilder]
    );

    const visibleProjects = useMemo(() => {
        const cleanSearchQuery = searchQuery.trim().toLowerCase();
        const sourceBuilders = selectedBuilder ? [selectedBuilder] : builders;
        return sourceBuilders
            .flatMap(builder => builder.projects.map(project => ({ ...project, builder })))
            .filter(project => showArchived || statusFilter === 'archived' || !project.archived)
            .filter(project => statusFilter === 'all' || (statusFilter === 'archived' ? project.archived : !project.archived))
            .filter(project => scaffoldEntityFilter === 'all' || normalizeScaffoldEntity(project.scaffoldEntity) === scaffoldEntityFilter)
            .filter(project => {
                if (!cleanSearchQuery) {
                    return true;
                }
                return [
                    project.name,
                    project.builder.name,
                    project.siteLocation || 'Not set',
                    project.designFolderPath || '',
                    normalizeScaffoldEntity(project.scaffoldEntity),
                    project.archived ? 'Archived' : 'Active',
                ].join(' ').toLowerCase().includes(cleanSearchQuery);
            });
    }, [builders, selectedBuilder, showArchived, searchQuery, statusFilter, scaffoldEntityFilter]);

    const hasStatusFilter = statusFilter !== 'all';
    const hasScaffoldEntityFilter = scaffoldEntityFilter !== 'all';
    const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
    const appUserById = useMemo(() => new Map(appUsers.map(user => [user.id, user])), [appUsers]);
    const employeeByAuthUserId = useMemo(
        () => new Map(employees.filter(employee => employee.linkedAuthUserId).map(employee => [employee.linkedAuthUserId, employee])),
        [employees]
    );
    const roleUsers = useMemo(() => {
        const byName = (left, right) => appUserName(left).localeCompare(appUserName(right));
        const leadingHandOptions = new Map();
        employees.forEach(employee => {
            const appUser = employee.linkedAuthUserId ? appUserById.get(employee.linkedAuthUserId) : null;
            const effectiveRole = appUser?.role || employeeFallbackRoleKey(employee);
            if (effectiveRole !== 'leading_hand') {
                return;
            }
            const optionValue = appUser?.id || `employee:${employee.id}`;
            leadingHandOptions.set(optionValue, {
                ...(appUser || {}),
                id: optionValue,
                value: optionValue,
                authUserId: appUser?.id || '',
                employeeId: employee.id,
                fullName: appUserName(appUser) !== 'Unnamed user' ? appUserName(appUser) : employeeName(employee),
                email: appUser?.email || employee.email || '',
                phoneNumber: appUser?.phoneNumber || employee.phoneNumber || '',
                role: 'leading_hand'
            });
        });
        appUsers
            .filter(user => user.role === 'leading_hand')
            .forEach(user => {
                if (!leadingHandOptions.has(user.id)) {
                    leadingHandOptions.set(user.id, {
                        ...user,
                        value: user.id,
                        authUserId: user.id,
                        employeeId: employeeByAuthUserId.get(user.id)?.id || ''
                    });
                }
            });
        return {
            projectManagers: appUsers.filter(user => user.role === 'project_manager').sort(byName),
            siteSupervisors: appUsers.filter(user => user.role === 'site_supervisor').sort(byName),
            leadingHands: Array.from(leadingHandOptions.values()).sort(byName)
        };
    }, [appUserById, appUsers, employeeByAuthUserId, employees]);

    useEffect(() => {
        if (!showProjectModal) {
            return undefined;
        }

        let cancelled = false;
        const roleOptions = [
            ...roleUsers.projectManagers,
            ...roleUsers.siteSupervisors,
            ...roleUsers.leadingHands
        ];
        const lookupIds = Array.from(new Set(roleOptions.map(getRoleAvatarLookupId).filter(Boolean)));

        lookupIds.forEach(lookupId => {
            if (roleAvatarUrls[lookupId]) {
                return;
            }
            const cached = roleAvatarUrlCache.get(lookupId);
            if (cached !== undefined) {
                if (cached) {
                    setRoleAvatarUrls(prev => prev[lookupId] ? prev : { ...prev, [lookupId]: cached });
                }
                return;
            }
            resolveProfileImageUrl(lookupId)
                .then(url => {
                    roleAvatarUrlCache.set(lookupId, url || '');
                    if (!cancelled && url) {
                        setRoleAvatarUrls(prev => prev[lookupId] ? prev : { ...prev, [lookupId]: url });
                    }
                })
                .catch(() => {
                    roleAvatarUrlCache.set(lookupId, '');
                });
        });

        return () => {
            cancelled = true;
        };
    }, [roleAvatarUrls, roleUsers, showProjectModal]);

    const getEmployeeRoleKey = (employee) => appUserById.get(employee?.linkedAuthUserId)?.role || employeeFallbackRoleKey(employee);
    const getEmployeeRoleLabel = (employee) => roleLabel(getEmployeeRoleKey(employee));
    const isInductableWorker = (employee) => ['general_scaffolder', 'leading_hand'].includes(getEmployeeRoleKey(employee));
    const sortedEmployees = useMemo(
        () => [...employees].sort((left, right) => employeeName(left).localeCompare(employeeName(right))),
        [employees]
    );
    const filteredProjectFormEmployees = useMemo(() => {
        const query = projectEmployeeSearch.trim().toLowerCase();
        return sortedEmployees
            .filter(isInductableWorker)
            .filter(employee => employeeMatchesSearchText(employee, getEmployeeRoleLabel(employee), query));
    }, [appUserById, projectEmployeeSearch, sortedEmployees]);

    const getProjectEmployees = (project) => {
        const siteKey = projectSiteKey(project);
        const savedIds = Array.isArray(project?.inductedEmployeeIds) ? project.inductedEmployeeIds : null;
        if (savedIds) {
            return savedIds
                .map(employeeId => employeeById.get(employeeId))
                .filter(Boolean)
                .sort((left, right) => employeeName(left).localeCompare(employeeName(right)));
        }
        if (!siteKey) {
            return [];
        }
        return employees
            .filter(employee => Array.isArray(employee.preferredSiteIds) && employee.preferredSiteIds.includes(siteKey))
            .sort((left, right) => employeeName(left).localeCompare(employeeName(right)));
    };

    const getFilteredProjectEmployees = (project) => {
        const query = inductedSearch.trim().toLowerCase();
        const projectEmployees = getProjectEmployees(project);
        if (!query) {
            return projectEmployees;
        }
        return projectEmployees.filter(employee => employeeMatchesSearchText(employee, getEmployeeRoleLabel(employee), query));
    };

    const getProjectManager = (project) => {
        if (project?.projectManager) {
            return project.projectManager;
        }
        return appUserById.get(project?.projectManagerUserId) || employeeById.get(project?.projectManagerEmployeeId) || null;
    };

    const getSiteSupervisor = (project) => {
        if (project?.siteSupervisor) {
            return project.siteSupervisor;
        }
        return appUserById.get(project?.siteSupervisorUserId) || employeeById.get(project?.siteSupervisorEmployeeId) || getProjectEmployees(project).find(employee => employee.leadingHand) || null;
    };

    const getLeadingHand = (project) => {
        if (project?.leadingHand) {
            return project.leadingHand;
        }
        return appUserById.get(project?.leadingHandUserId) || employeeById.get(project?.leadingHandEmployeeId) || null;
    };

    const openCreateProject = () => {
        setProjectForm(emptyProjectForm(selectedBuilder?.id || builders[0]?.id || ''));
        setProjectEmployeeSearch('');
        setSiteAddressSuggestions([]);
        setSiteAddressLoading(false);
        setShowProjectModal(true);
    };

    const openEditProject = (builderId, project) => {
        const managerEmployee = employeeById.get(project.projectManagerEmployeeId);
        const supervisorEmployee = employeeById.get(project.siteSupervisorEmployeeId);
        const leadingHandEmployee = employeeById.get(project.leadingHandEmployeeId);
        const existingInductedEmployees = Array.isArray(project.inductedEmployeeIds)
            ? project.inductedEmployeeIds.map(employeeId => employeeById.get(employeeId)).filter(Boolean)
            : getProjectEmployees(project);
        setProjectForm({
            builderId,
            projectName: project.name,
            siteLocation: project.siteLocation || '',
            siteLocationSourceId: project.siteLocation ? 'existing' : '',
            designFolderId: project.designFolderId || '',
            designFolderPath: project.designFolderPath || '',
            scaffoldEntity: normalizeScaffoldEntity(project.scaffoldEntity),
            projectManagerUserId: project.projectManagerUserId || managerEmployee?.linkedAuthUserId || '',
            siteSupervisorUserId: project.siteSupervisorUserId || supervisorEmployee?.linkedAuthUserId || '',
            leadingHandUserId: project.leadingHandUserId || leadingHandEmployee?.linkedAuthUserId || '',
            projectManagerEmployeeId: project.projectManagerEmployeeId || '',
            siteSupervisorEmployeeId: project.siteSupervisorEmployeeId || '',
            leadingHandEmployeeId: project.leadingHandEmployeeId || '',
            inductedEmployeeIds: existingInductedEmployees.filter(isInductableWorker).map(employee => employee.id),
            editingProjectId: project.id
        });
        setProjectEmployeeSearch('');
        setSiteAddressSuggestions([]);
        setSiteAddressLoading(false);
        setShowProjectModal(true);
    };

    const closeProjectModal = () => {
        setShowProjectModal(false);
        setProjectEmployeeSearch('');
        setSiteAddressSuggestions([]);
        setSiteAddressLoading(false);
    };

    const toggleProjectInductedEmployee = (employeeId) => {
        setProjectForm(prev => {
            const existingIds = new Set(prev.inductedEmployeeIds || []);
            if (existingIds.has(employeeId)) {
                existingIds.delete(employeeId);
            } else {
                existingIds.add(employeeId);
            }
            return {
                ...prev,
                inductedEmployeeIds: Array.from(existingIds)
            };
        });
    };

    const openCreateBuilder = () => {
        setBuilderForm(emptyBuilderForm());
        setShowBuilderModal(true);
    };

    const handleBuilderSelectionChange = (event) => {
        const builderId = event.target.value;
        if (!builderId) {
            setBuilderForm(emptyBuilderForm());
            return;
        }
        const builder = builders.find(item => item.id === builderId);
        setBuilderForm(builderToForm(builder, builderLogoUrls.get(builderId)));
    };

    const handleBuilderLogoChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        if (!file.type.startsWith('image/')) {
            setError('Builder logo must be an image file.');
            event.target.value = '';
            return;
        }
        if (file.size > 1_500_000) {
            setError('Builder logo must be smaller than 1.5 MB.');
            event.target.value = '';
            return;
        }

        readImageFileAsDataUrl(file)
            .then(previewUrl => {
                setBuilderForm(prev => ({
                    ...prev,
                    logoFile: file,
                    logoPreviewUrl: previewUrl,
                    removeLogo: false
                }));
                setError('');
            })
            .catch(() => {
                setError('Could not load builder logo preview.');
                event.target.value = '';
            });
    };

    const saveProject = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            if (projectForm.siteLocation.trim() && !projectForm.siteLocationSourceId) {
                throw new Error('Select a valid suggested site address before saving.');
            }
            const inductedWorkerIds = (projectForm.inductedEmployeeIds || [])
                .filter(employeeId => {
                    const employee = employeeById.get(employeeId);
                    return employee && isInductableWorker(employee);
                });
            const projectDesignFolder = selectedProjectDesignFolderPayload(projectForm.designFolderId, designFolders, projectForm.designFolderPath);
            let nextBuilders = projectForm.editingProjectId
                ? await safetyProjectsAPI.renameProject(projectForm.builderId, projectForm.editingProjectId, projectForm.projectName, projectForm.siteLocation, {
                    projectManagerUserId: projectForm.projectManagerUserId,
                    siteSupervisorUserId: projectForm.siteSupervisorUserId,
                    leadingHandUserId: projectForm.leadingHandUserId,
                    projectManagerEmployeeId: projectForm.projectManagerEmployeeId,
                    siteSupervisorEmployeeId: projectForm.siteSupervisorEmployeeId,
                    leadingHandEmployeeId: projectForm.leadingHandEmployeeId,
                    designFolderId: projectDesignFolder.designFolderId,
                    designFolderPath: projectDesignFolder.designFolderPath,
                    scaffoldEntity: projectForm.scaffoldEntity,
                    inductedEmployeeIds: inductedWorkerIds
                })
                : await safetyProjectsAPI.createProject(projectForm.builderId, projectForm.projectName, projectForm.siteLocation, {
                    projectManagerUserId: projectForm.projectManagerUserId,
                    siteSupervisorUserId: projectForm.siteSupervisorUserId,
                    leadingHandUserId: projectForm.leadingHandUserId,
                    projectManagerEmployeeId: projectForm.projectManagerEmployeeId,
                    siteSupervisorEmployeeId: projectForm.siteSupervisorEmployeeId,
                    leadingHandEmployeeId: projectForm.leadingHandEmployeeId,
                    designFolderId: projectDesignFolder.designFolderId,
                    designFolderPath: projectDesignFolder.designFolderPath,
                    scaffoldEntity: projectForm.scaffoldEntity,
                    inductedEmployeeIds: inductedWorkerIds
                });
            const savedProjectId = projectForm.editingProjectId
                || nextBuilders
                    .find(builder => builder.id === projectForm.builderId)
                    ?.projects
                    .find(project => project.name.trim().toLowerCase() === projectForm.projectName.trim().toLowerCase())
                    ?.id
                || '';
            if (designFolders.length || savedProjectId) {
                try {
                    nextBuilders = await safetyProjectsAPI.autoLinkDesignFolders(designFolders, {
                        createMissing: !projectForm.editingProjectId,
                        createMissingProjectId: !projectForm.editingProjectId ? savedProjectId : ''
                    });
                    const nextOptions = await foldersAPI.getDesignFolderOptions();
                    setDesignFolders(Array.isArray(nextOptions) ? nextOptions : []);
                } catch {
                    // Manual linking remains available if ESS Design folder creation is not permitted.
                }
            }
            setBuilders(nextBuilders);
            if (projectForm.editingProjectId) {
                const updatedBuilder = nextBuilders.find(builder => builder.id === projectForm.builderId);
                const updatedProject = updatedBuilder?.projects.find(project => project.id === projectForm.editingProjectId);
                if (updatedProject && projectSiteKey(selectedInfoProject) === `${projectForm.builderId}:${projectForm.editingProjectId}`) {
                    setSelectedInfoProject({ ...updatedProject, builder: updatedBuilder });
                }
            }
            closeProjectModal();
        } catch (err) {
            setError(err.message || 'Could not save project');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        const query = projectForm.siteLocation.trim();
        if (!showProjectModal || projectForm.siteLocationSourceId || query.length < 3) {
            setSiteAddressSuggestions([]);
            setSiteAddressLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setSiteAddressLoading(true);
            analysisAPI.addressSuggestions(query, { signal: controller.signal })
                .then(remoteResults => {
                    const suggestions = (Array.isArray(remoteResults) ? remoteResults : [])
                        .map((item, index) => ({
                            id: `tomtom-${item.address || item.label || index}`,
                            label: item.label || item.address,
                            address: item.address || item.label,
                            source: 'TomTom',
                        }))
                        .filter(item => item.address);
                    setSiteAddressSuggestions(suggestions.slice(0, 6));
                })
                .catch(addressError => {
                    if (addressError?.name !== 'CanceledError' && addressError?.code !== 'ERR_CANCELED') {
                        setSiteAddressSuggestions([]);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setSiteAddressLoading(false);
                    }
                });
        }, 80);

        setSiteAddressLoading(true);
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [projectForm.siteLocation, projectForm.siteLocationSourceId, showProjectModal]);

    const saveBuilder = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const logoOptions = {
                removeLogo: builderForm.removeLogo,
                designFolderId: builderForm.designFolderId,
                designFolderPath: builderForm.designFolderPath,
                ...(builderForm.logoFile ? { logoFile: builderForm.logoFile } : {})
            };
            let nextBuilders = builderForm.id
                ? await safetyProjectsAPI.renameBuilder(builderForm.id, builderForm.name, logoOptions)
                : await safetyProjectsAPI.createBuilder(builderForm.name, logoOptions);
            const savedBuilderId = builderForm.id
                || nextBuilders.find(builder => builder.name.trim().toLowerCase() === builderForm.name.trim().toLowerCase())?.id
                || '';
            if (designFolders.length || savedBuilderId) {
                try {
                    nextBuilders = await safetyProjectsAPI.autoLinkDesignFolders(designFolders, {
                        createMissing: !builderForm.id,
                        createMissingBuilderId: !builderForm.id ? savedBuilderId : ''
                    });
                    const nextOptions = await foldersAPI.getDesignFolderOptions();
                    setDesignFolders(Array.isArray(nextOptions) ? nextOptions : []);
                } catch {
                    // Manual linking remains available if ESS Design folder creation is not permitted.
                }
            }
            setBuilders(nextBuilders);
            setSelectedBuilderId(builderForm.id || nextBuilders.find(builder => builder.name.toLowerCase() === builderForm.name.trim().toLowerCase())?.id || '');
            setShowBuilderModal(false);
        } catch (err) {
            setError(err.message || 'Could not save builder');
        } finally {
            setSaving(false);
        }
    };

    const removeProject = async (builderId, projectId) => {
        const confirmed = window.confirm('Delete this project?');
        if (!confirmed) {
            return;
        }
        try {
            const nextBuilders = await safetyProjectsAPI.deleteProject(builderId, projectId);
            setBuilders(nextBuilders);
        } catch (err) {
            setError(err.message || 'Could not delete project');
        }
    };

    const openProjectInfo = (project) => {
        setSelectedInfoProject(project);
        setInductedSearch('');
    };

    const selectBuilderFilter = (builderId) => {
        setSelectedBuilderId(builderId);
        setColumnFilterMenu('');
    };

    const selectScaffoldEntityFilter = (entity) => {
        setScaffoldEntityFilter(entity);
        setColumnFilterMenu('');
    };

    const toggleColumnFilterMenu = (menuName) => {
        setColumnFilterMenu(prev => prev === menuName ? '' : menuName);
    };

    const toggleArchiveProject = async (builderId, project) => {
        const isArchiving = !project.archived;
        const confirmed = window.confirm(
            isArchiving
                ? `Archive "${project.name}"? Archived jobs will be hidden from Project data, rostering, and employee preferences until restored.`
                : `Unarchive "${project.name}"?`
        );
        if (!confirmed) {
            return;
        }

        try {
            const nextBuilders = isArchiving
                ? await safetyProjectsAPI.archiveProject(builderId, project.id)
                : await safetyProjectsAPI.unarchiveProject(builderId, project.id);
            setBuilders(nextBuilders);
        } catch (err) {
            setError(err.message || `Could not ${isArchiving ? 'archive' : 'unarchive'} project`);
        }
    };

    const getProjectMenuPosition = (x, y) => {
        const menuWidth = 224;
        const menuHeight = 146;
        const margin = 12;
        return {
            x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - menuWidth - margin)),
            y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - menuHeight - margin))
        };
    };

    const openProjectMenuFromButton = (event, project) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const position = getProjectMenuPosition(rect.right - 224, rect.bottom + 6);
        setProjectMenu({ project, ...position });
    };

    const openProjectMenuFromRow = (event, project) => {
        event.preventDefault();
        const position = getProjectMenuPosition(event.clientX, event.clientY);
        setProjectMenu({ project, ...position });
    };

    const runProjectMenuAction = (action) => {
        const activeProject = projectMenu?.project;
        setProjectMenu(null);
        if (activeProject) {
            action(activeProject);
        }
    };

    const removeBuilder = async (builder) => {
        if (!builder) {
            return;
        }
        if (builder.projects.length > 0) {
            window.alert('This builder cannot be deleted while projects are still attached. Delete, move, or archive those projects first.');
            return;
        }
        const confirmed = window.confirm(`Delete builder "${builder.name}"?`);
        if (!confirmed) {
            return;
        }
        try {
            const nextBuilders = await safetyProjectsAPI.deleteBuilder(builder.id);
            setBuilders(nextBuilders);
            setSelectedBuilderId(nextBuilders[0]?.id || '');
            setShowBuilderModal(false);
        } catch (err) {
            setError(err.message || 'Could not delete builder');
        }
    };

    const infoProject = selectedInfoProject;
    const infoProjectEmployees = infoProject ? getProjectEmployees(infoProject) : [];
    const filteredInfoProjectEmployees = infoProject ? getFilteredProjectEmployees(infoProject) : [];
    const infoProjectManager = infoProject ? getProjectManager(infoProject) : null;
    const infoSiteSupervisor = infoProject ? getSiteSupervisor(infoProject) : null;
    const infoLeadingHand = infoProject ? getLeadingHand(infoProject) : null;

    return (
        <div className="module-page site-registry-page">
            <div className="module-shell site-registry-shell">
                {error ? <div className="module-error">{error}</div> : null}

                {loading ? (
                    <div className="page-loading-brandmark"><LoadingBrandmark label="Loading site information" /></div>
                ) : (
                    <section className="site-registry-table-section">
                        <div className="site-registry-toolbar">
                            <label className="site-registry-search-field">
                                <Search size={16} strokeWidth={2.2} aria-hidden="true" />
                                <input
                                    type="search"
                                    value={searchQuery}
                                    onChange={event => setSearchQuery(event.target.value)}
                                    placeholder="Search projects, builders, locations..."
                                    aria-label="Search site registry"
                                />
                            </label>
                            <label className="site-registry-toggle">
                                <input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />
                                <span className="site-registry-toggle-track" aria-hidden="true">
                                    <span className="site-registry-toggle-thumb" />
                                </span>
                                <span>Show Archived</span>
                            </label>
                            <div className="site-registry-toolbar-actions">
                                <button className="module-secondary-btn compact site-registry-outline-action" onClick={openCreateBuilder}>
                                    <UserPlus size={15} strokeWidth={2.2} aria-hidden="true" />
                                    <span>Add/Edit Builder</span>
                                </button>
                                <button className="module-primary-btn compact site-registry-primary-action" onClick={openCreateProject}>
                                    <PlusCircle size={15} strokeWidth={2.2} aria-hidden="true" />
                                    <span>Add Project</span>
                                </button>
                            </div>
                        </div>

                        <div className="site-registry-table-wrap">
                            <table className="site-registry-table">
                                <thead>
                                    <tr>
                                        <th className="site-registry-select-col">
                                            <BuilderLogoMark header />
                                        </th>
                                        <th>Project</th>
                                        <th>
                                            <div className={`site-registry-column-filter ${selectedBuilderId ? 'filtered' : ''} ${columnFilterMenu === 'builder' ? 'open' : ''}`}>
                                                <button type="button" onClick={event => {
                                                    event.stopPropagation();
                                                    toggleColumnFilterMenu('builder');
                                                }}>
                                                    <span>Builder</span>
                                                </button>
                                                {columnFilterMenu === 'builder' ? (
                                                    <div className="site-registry-column-menu site-registry-column-menu-list" onClick={event => event.stopPropagation()}>
                                                        <button type="button" className={selectedBuilderId === '' ? 'selected' : ''} onClick={() => selectBuilderFilter('')}>All Builders</button>
                                                        {builders.map(builder => (
                                                            <button
                                                                key={builder.id}
                                                                type="button"
                                                                className={selectedBuilderId === builder.id ? 'selected' : ''}
                                                                onClick={() => selectBuilderFilter(builder.id)}
                                                            >
                                                                {builder.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </th>
                                        <th>
                                            <div className={`site-registry-column-filter ${hasScaffoldEntityFilter ? 'filtered' : ''} ${columnFilterMenu === 'scaffoldEntity' ? 'open' : ''}`}>
                                                <button type="button" onClick={event => {
                                                    event.stopPropagation();
                                                    toggleColumnFilterMenu('scaffoldEntity');
                                                }}>
                                                    <span>Scaffold Entity</span>
                                                </button>
                                                {columnFilterMenu === 'scaffoldEntity' ? (
                                                    <div className="site-registry-column-menu site-registry-column-menu-list" onClick={event => event.stopPropagation()}>
                                                        <button type="button" className={scaffoldEntityFilter === 'all' ? 'selected' : ''} onClick={() => selectScaffoldEntityFilter('all')}>All Entities</button>
                                                        {SCAFFOLD_ENTITY_OPTIONS.map(entity => (
                                                            <button
                                                                key={entity}
                                                                type="button"
                                                                className={scaffoldEntityFilter === entity ? 'selected' : ''}
                                                                onClick={() => selectScaffoldEntityFilter(entity)}
                                                            >
                                                                {entity}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </th>
                                        <th>Site Location</th>
                                        <th>
                                            <div className={`site-registry-column-filter ${hasStatusFilter ? 'filtered' : ''} ${columnFilterMenu === 'status' ? 'open' : ''}`}>
                                                <button type="button" onClick={event => {
                                                    event.stopPropagation();
                                                    toggleColumnFilterMenu('status');
                                                }}>
                                                    <span>Status</span>
                                                </button>
                                                {columnFilterMenu === 'status' ? (
                                                    <div className="site-registry-column-menu site-registry-column-menu-list" onClick={event => event.stopPropagation()}>
                                                        <button type="button" className={statusFilter === 'all' ? 'selected' : ''} onClick={() => {
                                                            setStatusFilter('all');
                                                            setColumnFilterMenu('');
                                                        }}>All</button>
                                                        <button type="button" className={statusFilter === 'active' ? 'selected' : ''} onClick={() => {
                                                            setStatusFilter('active');
                                                            setColumnFilterMenu('');
                                                        }}>Active</button>
                                                        <button type="button" className={statusFilter === 'archived' ? 'selected' : ''} onClick={() => {
                                                            setStatusFilter('archived');
                                                            setColumnFilterMenu('');
                                                        }}>Archived</button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleProjects.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="site-registry-empty-cell">
                                                {builders.length === 0
                                                    ? 'No builders created yet.'
                                                    : showArchived
                                                        ? 'No projects found.'
                                                        : 'No active projects found.'}
                                            </td>
                                        </tr>
                                    ) : visibleProjects.map(project => {
                                        const rowKey = projectSiteKey(project);
                                        const isSelected = projectSiteKey(selectedInfoProject) === rowKey;

                                        return (
                                            <React.Fragment key={rowKey}>
                                                <tr
                                                    className={`site-registry-data-row${isSelected ? ' selected' : ''}${project.archived ? ' archived' : ''}`}
                                                    onClick={() => openProjectInfo(project)}
                                                    onContextMenu={event => openProjectMenuFromRow(event, project)}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            openProjectInfo(project);
                                                        }
                                                    }}
                                                    tabIndex={0}
                                                >
                                                    <td className="site-registry-select-col">
                                                        <BuilderLogoMark
                                                            builder={project.builder}
                                                            logoSrc={builderLogoUrls.get(project.builder.id)}
                                                            selected={isSelected}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div className="site-registry-project-cell">
                                                            <button
                                                                type="button"
                                                                className="site-registry-expand-btn"
                                                                onClick={event => {
                                                                    event.stopPropagation();
                                                                    openProjectInfo(project);
                                                                }}
                                                                aria-label={`View ${project.name}`}
                                                            >
                                                                <ChevronRight size={16} strokeWidth={2.3} aria-hidden="true" />
                                                            </button>
                                                            <span>{project.name}</span>
                                                        </div>
                                                    </td>
                                                    <td>{project.builder.name}</td>
                                                    <td>{normalizeScaffoldEntity(project.scaffoldEntity)}</td>
                                                    <td>{project.siteLocation || 'Not set'}</td>
                                                    <td>
                                                        <span className={`site-registry-status ${project.archived ? 'archived' : 'active'}`}>
                                                            {project.archived ? 'Archived' : 'Active'}
                                                        </span>
                                                    </td>
                                                    <td className="site-registry-actions-cell">
                                                        <button
                                                            type="button"
                                                            className="site-registry-row-menu-btn"
                                                            onClick={event => openProjectMenuFromButton(event, project)}
                                                            aria-label={`Open actions for ${project.name}`}
                                                            title="More actions"
                                                        >
                                                            <MoreVertical size={16} strokeWidth={2.3} aria-hidden="true" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>

            {infoProject ? (
                <div className="module-modal-backdrop site-registry-info-backdrop" onClick={() => setSelectedInfoProject(null)}>
                    <div className="module-modal compact site-registry-info-modal" onClick={event => event.stopPropagation()}>
                        <div className="site-registry-info-header">
                            <div>
                                <span>{infoProject.builder?.name || 'Site Registry'}</span>
                                <h3>{infoProject.name}</h3>
                                <small>{infoProject.siteLocation || 'No site location set'}</small>
                            </div>
                            <button type="button" className="site-registry-project-close" onClick={() => setSelectedInfoProject(null)} aria-label="Close site information">x</button>
                        </div>
                        <div className="site-registry-detail-panel site-registry-detail-modal-panel">
                            <section className="site-registry-inducted-panel">
                                <div className="site-registry-detail-heading">
                                    <div>
                                        <h4>Inducted Workers</h4>
                                        <span>{employeesLoading ? 'Loading employees...' : `${infoProjectEmployees.length} linked to this site`}</span>
                                    </div>
                                    <label className="site-registry-inducted-search">
                                        <Search size={15} strokeWidth={2.2} aria-hidden="true" />
                                        <input
                                            type="search"
                                            value={inductedSearch}
                                            onChange={event => setInductedSearch(event.target.value)}
                                            onClick={event => event.stopPropagation()}
                                            placeholder="Search inducted employees..."
                                            aria-label="Search inducted employees"
                                        />
                                    </label>
                                </div>
                                <div className="site-registry-employee-list">
                                    {employeesLoading ? (
                                        <div className="site-registry-detail-empty">Loading inducted employees...</div>
                                    ) : filteredInfoProjectEmployees.length === 0 ? (
                                        <div className="site-registry-detail-empty">
                                            {infoProjectEmployees.length === 0 ? 'No inducted employees are linked to this site yet.' : 'No inducted employees match this search.'}
                                        </div>
                                    ) : filteredInfoProjectEmployees.map(employee => (
                                        <div className="site-registry-employee-row" key={employee.id}>
                                            <EmployeeAvatar employee={employee} />
                                            <div className="site-registry-employee-main">
                                                <strong>{employeeName(employee)}</strong>
                                                <span>{employee.email || 'No email recorded'}</span>
                                            </div>
                                            <span className={`site-registry-employee-role ${getEmployeeRoleKey(employee)}`}>{getEmployeeRoleLabel(employee)}</span>
                                            <span className="site-registry-employee-date">{formatProjectDate(employee.verifiedAt || employee.updatedAt)}</span>
                                            <span className="site-registry-employee-status">Inducted</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                            <aside className="site-registry-site-panel">
                                <section className="site-registry-map-detail">
                                    <div className="site-registry-side-heading">Site Location Map</div>
                                    {infoProject.siteLocation ? (
                                        <iframe
                                            title={`${infoProject.name} map preview`}
                                            src={mapPreviewUrl(infoProject.siteLocation)}
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    ) : (
                                        <div className="site-registry-map-placeholder compact">No site location set.</div>
                                    )}
                                </section>
                                <section className="site-registry-contact-grid">
                                    <div className="site-registry-contact-card">
                                        <span>Project Manager</span>
                                        {infoProjectManager ? (
                                            <>
                                                <strong>{personDisplayName(infoProjectManager)}</strong>
                                                <small><Mail size={13} aria-hidden="true" /> {personEmail(infoProjectManager)}</small>
                                            </>
                                        ) : (
                                            <strong>Not assigned</strong>
                                        )}
                                    </div>
                                    <div className="site-registry-contact-card">
                                        <span>Site Supervisor</span>
                                        {infoSiteSupervisor ? (
                                            <>
                                                <strong>{personDisplayName(infoSiteSupervisor)}</strong>
                                                <small><Phone size={13} aria-hidden="true" /> {personPhone(infoSiteSupervisor)}</small>
                                            </>
                                        ) : (
                                            <strong>Not assigned</strong>
                                        )}
                                    </div>
                                    <div className="site-registry-contact-card">
                                        <span>Leading Hand</span>
                                        {infoLeadingHand ? (
                                            <>
                                                <strong>{personDisplayName(infoLeadingHand)}</strong>
                                                <small><Phone size={13} aria-hidden="true" /> {personPhone(infoLeadingHand)}</small>
                                            </>
                                        ) : (
                                            <strong>Not assigned</strong>
                                        )}
                                    </div>
                                    <div className="site-registry-contact-card wide">
                                        <span>Address</span>
                                        <strong>{infoProject.siteLocation || 'Not set'}</strong>
                                        <small>Last updated {formatProjectDate(infoProject.updatedAt)}</small>
                                    </div>
                                    <div className="site-registry-contact-card wide">
                                        <span>Scaffold Entity</span>
                                        <strong>{normalizeScaffoldEntity(infoProject.scaffoldEntity)}</strong>
                                        <small>Stored against this site for company reporting and AI lookup</small>
                                    </div>
                                    <div className="site-registry-contact-card wide">
                                        <span>Design Folder</span>
                                        <strong>{infoProject.designFolderPath || 'Not linked'}</strong>
                                        <small>ESS Design project or scaffold folder linked to this site</small>
                                    </div>
                                </section>
                            </aside>
                        </div>
                    </div>
                </div>
            ) : null}

            {projectMenu ? (
                <div
                    className="site-registry-context-menu"
                    style={{ top: projectMenu.y, left: projectMenu.x }}
                    onClick={event => event.stopPropagation()}
                    role="menu"
                    aria-label="Project actions"
                >
                    <button
                        type="button"
                        className="site-registry-context-menu-item"
                        onClick={() => runProjectMenuAction(project => openEditProject(project.builder.id, project))}
                        role="menuitem"
                    >
                        <Pencil size={15} strokeWidth={2.3} aria-hidden="true" />
                        <span>Edit</span>
                    </button>
                    <button
                        type="button"
                        className="site-registry-context-menu-item"
                        onClick={() => runProjectMenuAction(project => toggleArchiveProject(project.builder.id, project))}
                        role="menuitem"
                    >
                        <Archive size={15} strokeWidth={2.2} aria-hidden="true" />
                        <span>{projectMenu.project.archived ? 'Unarchive' : 'Archive'}</span>
                    </button>
                    <div className="site-registry-context-menu-divider" role="separator"></div>
                    <button
                        type="button"
                        className="site-registry-context-menu-item danger"
                        onClick={() => runProjectMenuAction(project => removeProject(project.builder.id, project.id))}
                        role="menuitem"
                    >
                        <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                        <span>Delete</span>
                    </button>
                </div>
            ) : null}

            {showProjectModal && (
                <div className="module-modal-backdrop" onClick={closeProjectModal}>
                    <div className="module-modal compact site-registry-project-modal" onClick={e => e.stopPropagation()}>
                        <button type="button" className="site-registry-project-close" onClick={closeProjectModal} aria-label="Close project form">x</button>
                        <form className="module-form site-registry-project-form" onSubmit={saveProject}>
                            <div className="site-registry-project-form-body">
                                <section className="site-registry-form-section">
                                    <div className="site-registry-form-section-head">
                                        <h4>Project Details</h4>
                                    </div>
                                    <div className="site-registry-project-details-grid">
                                        <div className="module-field">
                                            <label>Builder <span aria-hidden="true">*</span></label>
                                            <select value={projectForm.builderId} onChange={e => setProjectForm(prev => ({
                                                ...prev,
                                                builderId: e.target.value,
                                                designFolderId: '',
                                                designFolderPath: ''
                                            }))}>
                                                <option value="">Select a builder</option>
                                                {builders.map(builder => <option key={builder.id} value={builder.id}>{builder.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="module-field">
                                            <label>Project <span aria-hidden="true">*</span></label>
                                            <input value={projectForm.projectName} onChange={e => setProjectForm(prev => ({ ...prev, projectName: e.target.value }))} placeholder="Enter project name" />
                                        </div>
                                        <div className="module-field site-registry-project-location-field">
                                            <label>Site Location <span aria-hidden="true">*</span></label>
                                            <div className="site-registry-address-autocomplete transport-address-autocomplete">
                                                <input
                                                    value={projectForm.siteLocation}
                                                    onChange={e => setProjectForm(prev => ({
                                                        ...prev,
                                                        siteLocation: e.target.value,
                                                        siteLocationSourceId: '',
                                                    }))}
                                                    placeholder="Type to search for an address..."
                                                    autoComplete="off"
                                                />
                                                {(siteAddressLoading || siteAddressSuggestions.length > 0) ? (
                                                    <div className="site-registry-address-suggestions transport-address-suggestions" role="listbox">
                                                        {siteAddressSuggestions.map(suggestion => (
                                                            <button
                                                                key={suggestion.id}
                                                                type="button"
                                                                className="site-registry-address-suggestion transport-address-suggestion"
                                                                onClick={() => {
                                                                    setProjectForm(prev => ({
                                                                        ...prev,
                                                                        siteLocation: suggestion.address,
                                                                        siteLocationSourceId: suggestion.id,
                                                                    }));
                                                                    setSiteAddressSuggestions([]);
                                                                    setSiteAddressLoading(false);
                                                                }}
                                                                role="option"
                                                            >
                                                                <strong>{suggestion.address}</strong>
                                                                <span>{suggestion.source}{suggestion.label && suggestion.label !== suggestion.address ? ` - ${suggestion.label}` : ''}</span>
                                                            </button>
                                                        ))}
                                                        {siteAddressLoading ? <div className="site-registry-address-suggestion transport-address-suggestion loading">Searching addresses...</div> : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                            {projectForm.siteLocation.trim() && !projectForm.siteLocationSourceId ? (
                                                <p className="site-registry-address-hint">Select a suggested address so transport routing can validate it.</p>
                                            ) : null}
                                        </div>
                                        <div className="module-field">
                                            <label>Scaffold Entity <span aria-hidden="true">*</span></label>
                                            <select
                                                value={projectForm.scaffoldEntity}
                                                onChange={event => setProjectForm(prev => ({
                                                    ...prev,
                                                    scaffoldEntity: normalizeScaffoldEntity(event.target.value)
                                                }))}
                                            >
                                                {SCAFFOLD_ENTITY_OPTIONS.map(entity => (
                                                    <option key={entity} value={entity}>{entity}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="module-field">
                                            <label>Design Folder</label>
                                            <select
                                                value={projectForm.designFolderId}
                                                onChange={event => setProjectForm(prev => ({
                                                    ...prev,
                                                    ...selectedProjectDesignFolderPayload(event.target.value, designFolders)
                                                }))}
                                            >
                                                <option value="">Create Design Folder</option>
                                                {projectForm.designFolderId && projectForm.designFolderPath.includes(' / ') && !designFolders.some(folder => folder.id === projectForm.designFolderId) ? (
                                                    <option value={projectForm.designFolderId}>{projectForm.designFolderPath || 'Linked folder'}</option>
                                                ) : null}
                                                {projectDesignFolderOptions.map(folder => (
                                                    <option key={folder.id} value={folder.id}>{compactDesignFolderLabel(folder)}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </section>

                                <section className="site-registry-form-section">
                                    <div className="site-registry-form-section-head">
                                        <h4>Site Roles</h4>
                                    </div>
                                    <div className="site-registry-personnel-grid">
                                        <RoleUserSelect
                                            label="Project Manager"
                                            helper="Only Project Manager users appear here"
                                            role="project_manager"
                                            value={projectForm.projectManagerUserId}
                                            options={roleUsers.projectManagers}
                                            avatarUrls={roleAvatarUrls}
                                            onChange={(value) => setProjectForm(prev => ({
                                                ...prev,
                                                projectManagerUserId: value,
                                                projectManagerEmployeeId: employeeByAuthUserId.get(value)?.id || ''
                                            }))}
                                        />
                                        <RoleUserSelect
                                            label="Site Supervisor"
                                            helper="Only Site Supervisor users appear here"
                                            role="site_supervisor"
                                            value={projectForm.siteSupervisorUserId}
                                            options={roleUsers.siteSupervisors}
                                            avatarUrls={roleAvatarUrls}
                                            onChange={(value) => setProjectForm(prev => ({
                                                ...prev,
                                                siteSupervisorUserId: value,
                                                siteSupervisorEmployeeId: employeeByAuthUserId.get(value)?.id || ''
                                            }))}
                                        />
                                        <RoleUserSelect
                                            label="Leading Hand"
                                            helper="Only Leading Hand users appear here"
                                            role="leading_hand"
                                            value={projectForm.leadingHandUserId || (projectForm.leadingHandEmployeeId ? `employee:${projectForm.leadingHandEmployeeId}` : '')}
                                            options={roleUsers.leadingHands}
                                            avatarUrls={roleAvatarUrls}
                                            onChange={(value, option) => {
                                                const selectedEmployeeId = option?.employeeId || employeeByAuthUserId.get(value)?.id || '';
                                                setProjectForm(prev => ({
                                                    ...prev,
                                                    leadingHandUserId: option?.authUserId || (!value.startsWith('employee:') ? value : ''),
                                                    leadingHandEmployeeId: selectedEmployeeId
                                                }));
                                            }}
                                        />
                                    </div>
                                </section>

                                <section className="site-registry-form-section site-registry-form-section-last">
                                    <div className="site-registry-inducted-editor-head">
                                        <label>Inducted Workers</label>
                                        <span>{projectForm.inductedEmployeeIds.length} selected</span>
                                    </div>
                                    <label className="site-registry-inducted-search site-registry-inducted-editor-search">
                                        <Search size={15} strokeWidth={2.2} aria-hidden="true" />
                                        <input
                                            type="search"
                                            value={projectEmployeeSearch}
                                            onChange={event => setProjectEmployeeSearch(event.target.value)}
                                            placeholder="Search employees..."
                                            aria-label="Search employees to induct"
                                        />
                                    </label>
                                    <div className="site-registry-inducted-editor-list">
                                        {employeesLoading ? (
                                            <div className="site-registry-detail-empty">Loading employees...</div>
                                        ) : filteredProjectFormEmployees.length === 0 ? (
                                            <div className="site-registry-detail-empty">No employees match this search.</div>
                                        ) : filteredProjectFormEmployees.map(employee => {
                                            const checked = projectForm.inductedEmployeeIds.includes(employee.id);
                                            return (
                                                <label key={employee.id} className="site-registry-inducted-option">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleProjectInductedEmployee(employee.id)}
                                                    />
                                                    <EmployeeAvatar employee={employee} />
                                                    <span>
                                                        <strong>{employeeName(employee)}</strong>
                                                        <small>{employee.email || employee.phoneNumber || getEmployeeRoleLabel(employee)}</small>
                                                    </span>
                                                    <span className={`site-registry-inducted-option-role ${getEmployeeRoleKey(employee)}`}>{getEmployeeRoleLabel(employee)}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </section>
                            </div>
                            <div className="module-form-actions site-registry-project-actions">
                                <button type="button" className="module-secondary-btn" onClick={closeProjectModal} disabled={saving}>
                                    Cancel
                                </button>
                                <button type="submit" className="module-primary-btn" disabled={saving || Boolean(projectForm.siteLocation.trim() && !projectForm.siteLocationSourceId)}>
                                    {saving ? 'Saving...' : 'Save Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showBuilderModal && (
                <div className="module-modal-backdrop" onClick={() => setShowBuilderModal(false)}>
                    <div className="module-modal compact site-registry-builder-modal" onClick={e => e.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>Add/Edit Builder</h3>
                            <button className="nav-drawer-close" onClick={() => setShowBuilderModal(false)}>x</button>
                        </div>
                        <form className="module-form site-registry-builder-form" onSubmit={saveBuilder}>
                            <div className="module-field">
                                <label>Builder</label>
                                <select value={builderForm.id || ''} onChange={handleBuilderSelectionChange}>
                                    <option value="">Add new builder</option>
                                    {builders.map(builder => (
                                        <option key={builder.id} value={builder.id}>{builder.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="module-field">
                                <label>Builder Name</label>
                                <input value={builderForm.name} onChange={e => setBuilderForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Built" />
                            </div>
                            <div className="module-field">
                                <label>Design Folder</label>
                                <select
                                    value={builderForm.designFolderId}
                                    onChange={event => setBuilderForm(prev => ({
                                        ...prev,
                                        ...selectedDesignFolderPayload(event.target.value, designFolders)
                                    }))}
                                >
                                    <option value="">Create Design Folder</option>
                                    {builderForm.designFolderId && !designFolders.some(folder => folder.id === builderForm.designFolderId) ? (
                                        <option value={builderForm.designFolderId}>{builderForm.designFolderPath || 'Linked folder'}</option>
                                    ) : null}
                                    {builderDesignFolderOptions.map(folder => (
                                        <option key={folder.id} value={folder.id}>{compactDesignFolderLabel(folder)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="module-field">
                                <label>Builder Logo</label>
                                <label className="site-registry-logo-upload">
                                    <span className={`site-registry-logo-preview${builderForm.logoPreviewUrl && !builderForm.removeLogo ? ' has-logo' : ''}`}>
                                        {builderForm.logoPreviewUrl && !builderForm.removeLogo ? (
                                            <img src={builderForm.logoPreviewUrl} alt="" />
                                        ) : (
                                            <SiteRegistryLocationIcon size={24} />
                                        )}
                                    </span>
                                    <span className="site-registry-logo-upload-copy">
                                        <strong>Upload builder logo</strong>
                                        <small>PNG, JPG, WEBP or SVG up to 1.5 MB</small>
                                    </span>
                                    <input type="file" accept="image/*" onChange={handleBuilderLogoChange} />
                                </label>
                                {builderForm.logoPreviewUrl && !builderForm.removeLogo ? (
                                    <button
                                        type="button"
                                        className="site-registry-logo-remove"
                                        onClick={() => setBuilderForm(prev => ({
                                            ...prev,
                                            logoFile: null,
                                            logoPreviewUrl: '',
                                            logoUrl: '',
                                            logoPath: '',
                                            removeLogo: true
                                        }))}
                                    >
                                        Remove logo
                                    </button>
                                ) : null}
                            </div>
                            <div className="site-registry-builder-actions">
                                <button type="button" className="module-secondary-btn" onClick={() => setShowBuilderModal(false)} disabled={saving}>
                                    Cancel
                                </button>
                                <button type="submit" className="module-primary-btn" disabled={saving}>
                                    {saving ? 'Saving...' : 'Save Builder'}
                                </button>
                            </div>
                            {builderForm.id ? (
                                <button type="button" className="module-danger-btn" onClick={() => removeBuilder(builders.find(builder => builder.id === builderForm.id))}>
                                    Delete Builder
                                </button>
                            ) : null}
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
