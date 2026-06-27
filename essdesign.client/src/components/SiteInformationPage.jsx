import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Mail, MoreVertical, Pencil, Phone, PlusCircle, Search, Trash2, UserPlus } from 'lucide-react';
import { analysisAPI, rosteringAPI, safetyProjectsAPI, usersAPI } from '../services/api';

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
        projectManagerUserId: '',
        siteSupervisorUserId: '',
        projectManagerEmployeeId: '',
        siteSupervisorEmployeeId: '',
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

function employeeRole(employee) {
    return employee?.leadingHand ? 'Leading Hand' : 'Employee';
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

function employeeMatchesSearch(employee, query) {
    if (!query) {
        return true;
    }
    return [
        employeeName(employee),
        employeeRole(employee),
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
    return <span className="site-registry-employee-avatar" aria-hidden="true">{appUserInitials(user)}</span>;
}

function RoleUserSelect({ label, helper, role, value, options, onChange }) {
    const selectedUser = options.find(user => user.id === value) || null;
    return (
        <div className="site-registry-role-select">
            <div className="site-registry-role-select-label">
                <label>{label}</label>
                <span>{helper}</span>
            </div>
            <div className={`site-registry-role-select-control${selectedUser ? ' has-user' : ''}`}>
                {selectedUser ? (
                    <>
                        <UserAvatar user={selectedUser} />
                        <span className="site-registry-role-select-person">
                            <strong>{appUserName(selectedUser)}</strong>
                            <small>{selectedUser.email || 'No email recorded'}</small>
                        </span>
                        <span className={`site-registry-role-pill ${role}`}>{roleLabel(role)}</span>
                    </>
                ) : (
                    <span className="site-registry-role-empty">Not assigned</span>
                )}
                <select value={value} onChange={event => onChange(event.target.value)} aria-label={label}>
                    <option value="">Not assigned</option>
                    {options.map(user => (
                        <option key={user.id} value={user.id}>{appUserName(user)}</option>
                    ))}
                </select>
                <ChevronDown size={15} strokeWidth={2.3} aria-hidden="true" />
            </div>
        </div>
    );
}

export default function SiteInformationPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [builders, setBuilders] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [appUsers, setAppUsers] = useState([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [builderLogoUrls, setBuilderLogoUrls] = useState(() => new Map());
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
    const [error, setError] = useState('');

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

        const loadBuilderLogoUrls = async () => {
            const entries = await Promise.all(
                builders.map(async builder => {
                    try {
                        const url = await safetyProjectsAPI.resolveBuilderLogoUrl(builder);
                        return [builder.id, url || ''];
                    } catch {
                        return [builder.id, builder.logoUrl || ''];
                    }
                })
            );
            if (!cancelled) {
                setBuilderLogoUrls(new Map(entries));
            }
        };

        loadBuilderLogoUrls();
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

    const visibleProjects = useMemo(() => {
        const cleanSearchQuery = searchQuery.trim().toLowerCase();
        const sourceBuilders = selectedBuilder ? [selectedBuilder] : builders;
        return sourceBuilders
            .flatMap(builder => builder.projects.map(project => ({ ...project, builder })))
            .filter(project => showArchived || statusFilter === 'archived' || !project.archived)
            .filter(project => statusFilter === 'all' || (statusFilter === 'archived' ? project.archived : !project.archived))
            .filter(project => {
                if (!cleanSearchQuery) {
                    return true;
                }
                return [
                    project.name,
                    project.builder.name,
                    project.siteLocation || 'Not set',
                    project.archived ? 'Archived' : 'Active',
                ].join(' ').toLowerCase().includes(cleanSearchQuery);
            });
    }, [builders, selectedBuilder, showArchived, searchQuery, statusFilter]);

    const hasStatusFilter = statusFilter !== 'all';
    const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
    const appUserById = useMemo(() => new Map(appUsers.map(user => [user.id, user])), [appUsers]);
    const employeeByAuthUserId = useMemo(
        () => new Map(employees.filter(employee => employee.linkedAuthUserId).map(employee => [employee.linkedAuthUserId, employee])),
        [employees]
    );
    const roleUsers = useMemo(() => {
        const byName = (left, right) => appUserName(left).localeCompare(appUserName(right));
        return {
            projectManagers: appUsers.filter(user => user.role === 'project_manager').sort(byName),
            siteSupervisors: appUsers.filter(user => user.role === 'site_supervisor').sort(byName)
        };
    }, [appUsers]);
    const sortedEmployees = useMemo(
        () => [...employees].sort((left, right) => employeeName(left).localeCompare(employeeName(right))),
        [employees]
    );
    const filteredProjectFormEmployees = useMemo(() => {
        const query = projectEmployeeSearch.trim().toLowerCase();
        return sortedEmployees.filter(employee => employeeMatchesSearch(employee, query));
    }, [projectEmployeeSearch, sortedEmployees]);

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
        return projectEmployees.filter(employee => [
            employeeName(employee),
            employeeRole(employee),
            employee.email || '',
            employee.phoneNumber || ''
        ].join(' ').toLowerCase().includes(query));
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
        setProjectForm({
            builderId,
            projectName: project.name,
            siteLocation: project.siteLocation || '',
            siteLocationSourceId: project.siteLocation ? 'existing' : '',
            projectManagerUserId: project.projectManagerUserId || managerEmployee?.linkedAuthUserId || '',
            siteSupervisorUserId: project.siteSupervisorUserId || supervisorEmployee?.linkedAuthUserId || '',
            projectManagerEmployeeId: project.projectManagerEmployeeId || '',
            siteSupervisorEmployeeId: project.siteSupervisorEmployeeId || '',
            inductedEmployeeIds: Array.isArray(project.inductedEmployeeIds)
                ? project.inductedEmployeeIds
                : getProjectEmployees(project).map(employee => employee.id),
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
            const nextBuilders = projectForm.editingProjectId
                ? await safetyProjectsAPI.renameProject(projectForm.builderId, projectForm.editingProjectId, projectForm.projectName, projectForm.siteLocation, {
                    projectManagerUserId: projectForm.projectManagerUserId,
                    siteSupervisorUserId: projectForm.siteSupervisorUserId,
                    projectManagerEmployeeId: projectForm.projectManagerEmployeeId,
                    siteSupervisorEmployeeId: projectForm.siteSupervisorEmployeeId,
                    inductedEmployeeIds: projectForm.inductedEmployeeIds
                })
                : await safetyProjectsAPI.createProject(projectForm.builderId, projectForm.projectName, projectForm.siteLocation, {
                    projectManagerUserId: projectForm.projectManagerUserId,
                    siteSupervisorUserId: projectForm.siteSupervisorUserId,
                    projectManagerEmployeeId: projectForm.projectManagerEmployeeId,
                    siteSupervisorEmployeeId: projectForm.siteSupervisorEmployeeId,
                    inductedEmployeeIds: projectForm.inductedEmployeeIds
                });
            setBuilders(nextBuilders);
            setSelectedBuilderId(projectForm.builderId);
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
                ...(builderForm.logoFile ? { logoFile: builderForm.logoFile } : {})
            };
            const nextBuilders = builderForm.id
                ? await safetyProjectsAPI.renameBuilder(builderForm.id, builderForm.name, logoOptions)
                : await safetyProjectsAPI.createBuilder(builderForm.name, logoOptions);
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
        setSelectedInfoProject(prev => projectSiteKey(prev) === projectSiteKey(project) ? null : project);
        setInductedSearch('');
    };

    const selectBuilderFilter = (builderId) => {
        setSelectedBuilderId(builderId);
        setColumnFilterMenu('');
    };

    const toggleColumnFilterMenu = (menuName) => {
        setColumnFilterMenu(prev => prev === menuName ? '' : menuName);
    };

    const toggleArchiveProject = async (builderId, project) => {
        const isArchiving = !project.archived;
        const confirmed = window.confirm(
            isArchiving
                ? `Archive "${project.name}"? Archived jobs will be hidden from ESS Safety, rostering, and employee preferences until restored.`
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

    return (
        <div className="module-page site-registry-page">
            <div className="module-shell site-registry-shell">
                {error ? <div className="module-error">{error}</div> : null}

                {loading ? (
                    <div className="module-empty">Loading site information...</div>
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
                                            <td colSpan="6" className="site-registry-empty-cell">
                                                {builders.length === 0
                                                    ? 'No builders created yet.'
                                                    : showArchived
                                                        ? 'No projects found.'
                                                        : 'No active projects found.'}
                                            </td>
                                        </tr>
                                    ) : visibleProjects.map(project => {
                                        const rowKey = projectSiteKey(project);
                                        const isExpanded = projectSiteKey(selectedInfoProject) === rowKey;
                                        const projectEmployees = isExpanded ? getProjectEmployees(project) : [];
                                        const filteredProjectEmployees = isExpanded ? getFilteredProjectEmployees(project) : [];
                                        const projectManager = isExpanded ? getProjectManager(project) : null;
                                        const siteSupervisor = isExpanded ? getSiteSupervisor(project) : null;

                                        return (
                                            <React.Fragment key={rowKey}>
                                                <tr
                                                    className={`site-registry-data-row${isExpanded ? ' selected' : ''}`}
                                                    onClick={() => openProjectInfo(project)}
                                                    onContextMenu={event => openProjectMenuFromRow(event, project)}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            openProjectInfo(project);
                                                        }
                                                    }}
                                                    tabIndex={0}
                                                    aria-expanded={isExpanded}
                                                >
                                                    <td className="site-registry-select-col">
                                                        <BuilderLogoMark
                                                            builder={project.builder}
                                                            logoSrc={builderLogoUrls.get(project.builder.id)}
                                                            selected={isExpanded}
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
                                                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${project.name}`}
                                                            >
                                                                {isExpanded ? <ChevronDown size={16} strokeWidth={2.3} aria-hidden="true" /> : <ChevronRight size={16} strokeWidth={2.3} aria-hidden="true" />}
                                                            </button>
                                                            <span>{project.name}</span>
                                                        </div>
                                                    </td>
                                                    <td>{project.builder.name}</td>
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
                                                {isExpanded ? (
                                                    <tr className="site-registry-detail-row">
                                                        <td colSpan="6">
                                                            <div className="site-registry-detail-panel">
                                                                <section className="site-registry-inducted-panel">
                                                                    <div className="site-registry-detail-heading">
                                                                        <div>
                                                                            <h4>Inducted Employees</h4>
                                                                            <span>{employeesLoading ? 'Loading employees...' : `${projectEmployees.length} linked to this site`}</span>
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
                                                                        ) : filteredProjectEmployees.length === 0 ? (
                                                                            <div className="site-registry-detail-empty">
                                                                                {projectEmployees.length === 0 ? 'No inducted employees are linked to this site yet.' : 'No inducted employees match this search.'}
                                                                            </div>
                                                                        ) : filteredProjectEmployees.map(employee => (
                                                                            <div className="site-registry-employee-row" key={employee.id}>
                                                                                <EmployeeAvatar employee={employee} />
                                                                                <div className="site-registry-employee-main">
                                                                                    <strong>{employeeName(employee)}</strong>
                                                                                    <span>{employee.email || 'No email recorded'}</span>
                                                                                </div>
                                                                                <span className="site-registry-employee-role">{employeeRole(employee)}</span>
                                                                                <span className="site-registry-employee-date">{formatProjectDate(employee.verifiedAt || employee.updatedAt)}</span>
                                                                                <span className="site-registry-employee-status">Inducted</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </section>
                                                                <aside className="site-registry-site-panel">
                                                                    <section className="site-registry-map-detail">
                                                                        <div className="site-registry-side-heading">Site Location Map</div>
                                                                        {project.siteLocation ? (
                                                                            <iframe
                                                                                title={`${project.name} map preview`}
                                                                                src={mapPreviewUrl(project.siteLocation)}
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
                                                                            {projectManager ? (
                                                                                <>
                                                                                    <strong>{personDisplayName(projectManager)}</strong>
                                                                                    <small><Mail size={13} aria-hidden="true" /> {personEmail(projectManager)}</small>
                                                                                </>
                                                                            ) : (
                                                                                <strong>Not assigned</strong>
                                                                            )}
                                                                        </div>
                                                                        <div className="site-registry-contact-card">
                                                                            <span>Site Supervisor</span>
                                                                            {siteSupervisor ? (
                                                                                <>
                                                                                    <strong>{personDisplayName(siteSupervisor)}</strong>
                                                                                    <small><Phone size={13} aria-hidden="true" /> {personPhone(siteSupervisor)}</small>
                                                                                </>
                                                                            ) : (
                                                                                <strong>Not assigned</strong>
                                                                            )}
                                                                        </div>
                                                                        <div className="site-registry-contact-card wide">
                                                                            <span>Address</span>
                                                                            <strong>{project.siteLocation || 'Not set'}</strong>
                                                                            <small>Last updated {formatProjectDate(project.updatedAt)}</small>
                                                                        </div>
                                                                    </section>
                                                                </aside>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : null}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>

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
                                            <select value={projectForm.builderId} onChange={e => setProjectForm(prev => ({ ...prev, builderId: e.target.value }))}>
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
                                            onChange={(value) => setProjectForm(prev => ({
                                                ...prev,
                                                siteSupervisorUserId: value,
                                                siteSupervisorEmployeeId: employeeByAuthUserId.get(value)?.id || ''
                                            }))}
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
                                                        <small>{employee.email || employee.phoneNumber || employeeRole(employee)}</small>
                                                    </span>
                                                    <span className="site-registry-inducted-option-role">{employeeRole(employee)}</span>
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
