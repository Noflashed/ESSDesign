import React, { useState, useEffect, useRef, useCallback } from 'react';
import FolderBrowser from './components/FolderBrowser';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import SignUp from './components/SignUp';
import RegistrationSuccess from './components/RegistrationSuccess';
import RegistrationConfirmed from './components/RegistrationConfirmed';
import PDFViewer from './components/PDFViewer';
import WebNavDrawer from './components/WebNavDrawer';
import ESSSafetyPage from './components/ESSSafetyPage';
import MaterialOrderingPage from './components/MaterialOrderingPage';
import ESSRosteringPage from './components/ESSRosteringPage';
import EmployeesPage from './components/EmployeesPage';
import WebSafetySwmsPage from './components/WebSafetySwmsPage';
import WebSafetyScaffTagsPage from './components/WebSafetyScaffTagsPage';
import SiteInformationPage from './components/SiteInformationPage';
import LeadingHandRelationshipsPage from './components/LeadingHandRelationshipsPage';
import RosteringTreePage from './components/RosteringTreePage';
import EmployeePortalPage from './components/EmployeePortalPage';
import WebLandingPage from './components/WebLandingPage';
import SettingsPage from './components/SettingsPage';
import { ToastProvider } from './components/Toast';
import { authAPI, preferencesAPI, foldersAPI, usersAPI } from './services/api';
import './App.css';

// Load logo from Supabase Storage
// Replace YOUR_PROJECT with your actual Supabase project ID
const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';
const SUPABASE_BASE_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co';

const getAuthViewFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const auth = urlParams.get('auth');

    if (auth === 'signup-confirmed') {
        return 'signup-confirmed';
    }

    if (auth === 'signup-success') {
        return 'signup-success';
    }

    if (auth === 'signup') {
        return 'signup';
    }

    if (auth === 'login-form') {
        return 'login-form';
    }

    return 'landing';
};

// Professional SVG Icons (Google Drive style)
const FolderIcon = ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" fill="#5F6368" stroke="#5F6368" strokeWidth="0.5"/>
    </svg>
);

const DocumentIcon = ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#EA4335" fillOpacity="0.9"/>
        <path d="M14 2V8H20" fill="#EA4335" fillOpacity="0.7"/>
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="#B71C1C" strokeWidth="0.5"/>
    </svg>
);

const UserProfileIcon = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M20 21C20 17.6863 16.866 15 13 15H11C7.13401 15 4 17.6863 4 21"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
        />
        <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.8" />
    </svg>
);
const ThemeIcon = ({ theme, size = 18, color = 'currentColor' }) => (
    theme === 'light' ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.8" />
            <path
                d="M12 2.75V5.25M12 18.75V21.25M21.25 12H18.75M5.25 12H2.75M18.54 5.46L16.77 7.23M7.23 16.77L5.46 18.54M18.54 18.54L16.77 16.77M7.23 7.23L5.46 5.46"
                stroke={color}
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M20 15.5A7.5 7.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"
                stroke={color}
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    )
);

const SettingsIcon = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M22.205078 2A1.0001 1.0001 0 0 0 21.21875 2.8378906L20.246094 8.7929688C19.076509 9.1331971 17.961243 9.5922728 16.910156 10.164062L11.996094 6.6542969A1.0001 1.0001 0 0 0 10.708984 6.7597656L6.8183594 10.646484A1.0001 1.0001 0 0 0 6.7070312 11.927734L10.164062 16.873047C9.583454 17.930271 9.1142098 19.051824 8.765625 20.232422L2.8359375 21.21875A1.0001 1.0001 0 0 0 2.0019531 22.205078L2.0019531 27.705078A1.0001 1.0001 0 0 0 2.8261719 28.691406L8.7597656 29.742188C9.1064607 30.920739 9.5727226 32.043065 10.154297 33.101562L6.6542969 37.998047A1.0001 1.0001 0 0 0 6.7597656 39.285156L10.648438 43.175781A1.0001 1.0001 0 0 0 11.927734 43.289062L16.882812 39.820312C17.936999 40.39548 19.054994 40.857928 20.228516 41.201172L21.21875 47.164062A1.0001 1.0001 0 0 0 22.205078 48L27.705078 48A1.0001 1.0001 0 0 0 28.691406 47.173828L29.751953 41.1875C30.920633 40.838997 32.033372 40.369697 33.082031 39.791016L38.070312 43.291016A1.0001 1.0001 0 0 0 39.351562 43.179688L43.240234 39.287109A1.0001 1.0001 0 0 0 43.34375 37.996094L39.787109 33.058594C40.355783 32.014958 40.813915 30.908875 41.154297 29.748047L47.171875 28.693359A1.0001 1.0001 0 0 0 47.998047 27.707031L47.998047 22.207031A1.0001 1.0001 0 0 0 47.160156 21.220703L41.152344 20.238281C40.80968 19.078827 40.350281 17.974723 39.78125 16.931641L43.289062 11.933594A1.0001 1.0001 0 0 0 43.177734 10.652344L39.287109 6.7636719A1.0001 1.0001 0 0 0 37.996094 6.6601562L33.072266 10.201172C32.023186 9.6248101 30.909713 9.1579916 29.738281 8.8125L28.691406 2.828125A1.0001 1.0001 0 0 0 27.705078 2H22.205078ZM23.056641 4H26.865234L27.861328 9.6855469A1.0001 1.0001 0 0 0 28.603516 10.484375C30.066026 10.848832 31.439607 11.426549 32.693359 12.185547A1.0001 1.0001 0 0 0 33.794922 12.142578L38.474609 8.7792969L41.167969 11.472656L37.835938 16.220703A1.0001 1.0001 0 0 0 37.796875 17.310547C38.548366 18.561471 39.118333 19.926379 39.482422 21.380859A1.0001 1.0001 0 0 0 40.291016 22.125L45.998047 23.058594L45.998047 26.867188L40.279297 27.871094A1.0001 1.0001 0 0 0 39.482422 28.617188C39.122545 30.069817 38.552234 31.434687 37.800781 32.685547A1.0001 1.0001 0 0 0 37.845703 33.785156L41.224609 38.474609L38.53125 41.169922L33.791016 37.84375A1.0001 1.0001 0 0 0 32.697266 37.808594C31.44975 38.567585 30.074755 39.148028 28.617188 39.517578A1.0001 1.0001 0 0 0 27.876953 40.3125L26.867188 46H23.052734L22.111328 40.337891A1.0001 1.0001 0 0 0 21.365234 39.53125C19.90185 39.170557 18.522094 38.59371 17.259766 37.835938A1.0001 1.0001 0 0 0 16.171875 37.875L11.46875 41.169922L8.7734375 38.470703L12.097656 33.824219A1.0001 1.0001 0 0 0 12.138672 32.724609C11.372652 31.458855 10.793319 30.079213 10.427734 28.609375A1.0001 1.0001 0 0 0 9.6328125 27.867188L4.0019531 26.867188L4.0019531 23.052734L9.6289062 22.117188A1.0001 1.0001 0 0 0 10.435547 21.373047C10.804273 19.898143 11.383325 18.518729 12.146484 17.255859A1.0001 1.0001 0 0 0 12.111328 16.164062L8.8261719 11.46875L11.523438 8.7734375L16.185547 12.105469A1.0001 1.0001 0 0 0 17.28125 12.148438C18.536908 11.394293 19.919867 10.822081 21.384766 10.462891A1.0001 1.0001 0 0 0 22.132812 9.6523438L23.056641 4ZM25 17C20.593567 17 17 20.593567 17 25C17 29.406433 20.593567 33 25 33C29.406433 33 33 29.406433 33 25C33 20.593567 29.406433 17 25 17ZM25 19C28.325553 19 31 21.674447 31 25C31 28.325553 28.325553 31 25 31C21.674447 31 19 28.325553 19 25C19 21.674447 21.674447 19 25 19Z"
            fill={color}
        />
    </svg>
);

function SearchFolderNode({ folder, depth, initialChildren, onNavigate, onViewPDF }) {
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState(initialChildren || null);
    const [loading, setLoading] = useState(false);

    const hasKnownChildren = children
        ? (children.subFolders?.length > 0 || children.documents?.length > 0)
        : true; // assume expandable if we haven't loaded yet

    const handleToggle = async (e) => {
        e.stopPropagation();
        if (expanded) {
            setExpanded(false);
            return;
        }
        if (children) {
            setExpanded(true);
            return;
        }
        // Lazy-load folder contents
        setLoading(true);
        try {
            const data = await foldersAPI.getFolder(folder.id);
            setChildren({ subFolders: data.subFolders || [], documents: data.documents || [] });
            setExpanded(true);
        } catch (error) {
            console.error('Error loading folder contents:', error);
        } finally {
            setLoading(false);
        }
    };

    const paddingLeft = 16 + depth * 24;

    return (
        <div className="search-folder-node">
            <div
                className="search-folder-row"
                style={{ paddingLeft: `${paddingLeft}px` }}
                onClick={() => onNavigate(folder.id)}
            >
                {hasKnownChildren && (
                    <button className="search-folder-toggle" onClick={handleToggle}>
                        {loading ? (
                            <div className="spinner-tiny"></div>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        )}
                    </button>
                )}
                <span className="search-doc-icon"><FolderIcon size={16} /></span>
                <span className="search-doc-name">{folder.name}</span>
            </div>
            {expanded && children && (
                <div className="search-folder-children">
                    {children.subFolders.map(sf => (
                        <SearchFolderNode
                            key={sf.id}
                            folder={sf}
                            depth={depth + 1}
                            onNavigate={onNavigate}
                            onViewPDF={onViewPDF}
                        />
                    ))}
                    {children.documents.map(doc => (
                        <div key={doc.id} className="search-folder-row search-doc-row" style={{ paddingLeft: `${paddingLeft + 24}px` }}>
                            <span className="search-doc-icon"><DocumentIcon size={16} /></span>
                            <span className="search-doc-name">Revision {doc.revisionNumber}</span>
                            <div className="search-doc-actions">
                                {doc.essDesignIssuePath && (
                                    <button className="search-doc-btn" onClick={(e) => { e.stopPropagation(); onViewPDF(doc, 'ess'); }}>
                                        ESS Design
                                    </button>
                                )}
                                {doc.thirdPartyDesignPath && (
                                    <button className="search-doc-btn" onClick={(e) => { e.stopPropagation(); onViewPDF(doc, 'thirdparty'); }}>
                                        Third-Party
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {children.subFolders.length === 0 && children.documents.length === 0 && (
                        <div className="search-folder-row search-empty-folder" style={{ paddingLeft: `${paddingLeft + 24}px` }}>
                            <span className="search-empty-text">Empty folder</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


const normalizeAvatarSource = (value) => {
    if (!value || typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (/^https?:\/\//i.test(trimmed)) {
        return [trimmed];
    }

    const normalizedPath = trimmed.replace(/^\/+/, '');
    const candidates = [];

    if (normalizedPath.startsWith('storage/v1/')) {
        candidates.push(`${SUPABASE_BASE_URL}/${normalizedPath}`);
    } else {
        candidates.push(`${SUPABASE_BASE_URL}/storage/v1/object/public/${normalizedPath}`);
        candidates.push(`${SUPABASE_BASE_URL}/storage/v1/object/public/public-assets/${normalizedPath}`);
    }

    return [...new Set(candidates)];
};

const buildAvatarCandidates = (user) => {
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
};

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authView, setAuthView] = useState(getAuthViewFromUrl);
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
    const [selectedFolderId, setSelectedFolderId] = useState(() => {
        // Honor explicit deep links, otherwise always start from Home on app reopen.
        const urlParams = new URLSearchParams(window.location.search);
        const folderFromUrl = urlParams.get('folder');
        if (folderFromUrl) {
            localStorage.setItem('selectedFolderId', folderFromUrl);
            return folderFromUrl;
        }
        localStorage.removeItem('selectedFolderId');
        return null;
    });
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarWidth');
        return saved ? parseInt(saved) : 280;
    });
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'grid');
    const [pdfViewer, setPdfViewer] = useState(null);
    const [preferencesLoaded, setPreferencesLoaded] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [managedUsers, setManagedUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState('');
    const [updatingUserId, setUpdatingUserId] = useState(null);
    const [inviteEmail, setInviteEmail] = useState(() => new URLSearchParams(window.location.search).get('email') || '');
    const [inviteFirstName, setInviteFirstName] = useState(() => new URLSearchParams(window.location.search).get('firstName') || '');
    const [inviteLastName, setInviteLastName] = useState(() => new URLSearchParams(window.location.search).get('lastName') || '');
    const [inviteEmployeeId, setInviteEmployeeId] = useState(() => new URLSearchParams(window.location.search).get('employeeId') || '');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState('');
    const [inviteSuccess, setInviteSuccess] = useState('');
    const [linkingEmployee, setLinkingEmployee] = useState(false);
    const [employeeLinkAttempted, setEmployeeLinkAttempted] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [currentPage, setCurrentPage] = useState('landing');
    const [showNavDrawer, setShowNavDrawer] = useState(false);
    const [safetyContext, setSafetyContext] = useState({ builder: null, project: null });
    const [employeeContext, setEmployeeContext] = useState({ leadingHand: null });
    const [rosteringContext, setRosteringContext] = useState({ planDate: null });
    const isEmployeePortalRole = user?.role === 'general_scaffolder' || user?.role === 'leading_hand';
    const allowedNavItems = isEmployeePortalRole
        ? [{ key: 'employee-home', label: 'ESS App' }]
        : [
            { key: 'design', label: 'ESS Design' },
            { key: 'site-information', label: 'Site Registry' },
            { key: 'safety', label: 'ESS Safety' },
            { key: 'material-ordering', label: 'ESS Material Ordering' },
            { key: 'rostering', label: 'ESS Rostering' },
            { key: 'employees', label: 'Employees' }
        ];
    const showHeaderSearch = currentPage === 'design';
    const searchRef = useRef(null);
    const userMenuRef = useRef(null);
    const searchTimerRef = useRef(null);
    const avatarCandidates = buildAvatarCandidates(user);
    const [avatarIndex, setAvatarIndex] = useState(0);

    const buildAppUrl = useCallback((folderId, page, nextSafetyContext = { builder: null, project: null }, nextEmployeeContext = { leadingHand: null }, nextRosteringContext = { planDate: null }) => {
        const url = new URL(window.location.href);
        if (folderId) {
            url.searchParams.set('folder', folderId);
        } else {
            url.searchParams.delete('folder');
        }

        if (page && page !== 'landing') {
            url.searchParams.set('page', page);
        } else {
            url.searchParams.delete('page');
        }

        if (nextSafetyContext.builder?.id) {
            url.searchParams.set('builder', nextSafetyContext.builder.id);
        } else {
            url.searchParams.delete('builder');
        }

        if (nextSafetyContext.project?.id) {
            url.searchParams.set('project', nextSafetyContext.project.id);
        } else {
            url.searchParams.delete('project');
        }

        if (nextEmployeeContext.leadingHand?.id) {
            url.searchParams.set('leadingHand', nextEmployeeContext.leadingHand.id);
        } else {
            url.searchParams.delete('leadingHand');
        }

        if (nextRosteringContext.planDate) {
            url.searchParams.set('rosterDate', nextRosteringContext.planDate);
        } else {
            url.searchParams.delete('rosterDate');
        }

        return `${url.pathname}${url.search}`;
    }, []);

    const applyPageState = useCallback((page, nextSafetyContext = { builder: null, project: null }, nextEmployeeContext = { leadingHand: null }, nextRosteringContext = { planDate: null }, { pushHistory = true } = {}) => {
        const resolvedPage = isEmployeePortalRole
            ? (page === 'landing' || page === 'employee-home' || page === 'settings' ? page : 'employee-home')
            : page;
        setCurrentPage(resolvedPage);
        setSafetyContext(nextSafetyContext);
        setEmployeeContext(nextEmployeeContext);
        setRosteringContext(nextRosteringContext);
        const state = {
            folderId: selectedFolderId,
            page: resolvedPage,
            safetyContext: nextSafetyContext,
            employeeContext: nextEmployeeContext,
            rosteringContext: nextRosteringContext
        };
        const targetUrl = buildAppUrl(selectedFolderId, resolvedPage, nextSafetyContext, nextEmployeeContext, nextRosteringContext);
        if (pushHistory) {
            window.history.pushState(state, '', targetUrl);
        } else {
            window.history.replaceState(state, '', targetUrl);
        }
    }, [buildAppUrl, isEmployeePortalRole, selectedFolderId]);

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (isAuthenticated && !preferencesLoaded) {
            loadPreferences();
        }
    }, [isAuthenticated, preferencesLoaded]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        setAuthView(getAuthViewFromUrl());
        setInviteEmail(urlParams.get('email') || '');
        setInviteFirstName(urlParams.get('firstName') || '');
        setInviteLastName(urlParams.get('lastName') || '');
        setInviteEmployeeId(urlParams.get('employeeId') || '');
        setEmployeeLinkAttempted(false);
    }, []);

    useEffect(() => {
        const tryLinkEmployee = async () => {
            if (authView !== 'signup-confirmed' || !isAuthenticated || !inviteEmployeeId || linkingEmployee || employeeLinkAttempted) {
                return;
            }

            setEmployeeLinkAttempted(true);
            setLinkingEmployee(true);
            try {
                await authAPI.linkEmployee(inviteEmployeeId);
            } catch (error) {
                console.error('Error linking employee account:', error);
            } finally {
                setLinkingEmployee(false);
            }
        };

        tryLinkEmployee();
    }, [authView, isAuthenticated, inviteEmployeeId, linkingEmployee, employeeLinkAttempted]);

    useEffect(() => {
        if (!showHeaderSearch) {
            setShowSearchResults(false);
        }
    }, [showHeaderSearch]);

    const checkAuth = async () => {
        const callbackResult = authAPI.consumeAuthCallbackFromUrl?.();
        const authUrlParams = new URLSearchParams(window.location.search);
        const emailFromUrl = authUrlParams.get('email') || '';
        const firstNameFromUrl = authUrlParams.get('firstName') || '';
        const lastNameFromUrl = authUrlParams.get('lastName') || '';
        const employeeIdFromUrl = authUrlParams.get('employeeId') || '';

        if (callbackResult?.hasSession) {
            updateAuthView('signup-confirmed', emailFromUrl, {
                firstName: firstNameFromUrl,
                lastName: lastNameFromUrl,
                employeeId: employeeIdFromUrl
            });
        }

        const authenticated = authAPI.isAuthenticated();
        const currentUser = authAPI.getCurrentUser();

        if (!authenticated) {
            setIsAuthenticated(false);
            setUser(null);
            setLoading(false);
            return;
        }

        setIsAuthenticated(true);
        setUser(currentUser);

        try {
            const restoredUser = await authAPI.restoreSession();
            setUser(restoredUser);
        } catch (restoreError) {
            console.error('Error restoring session:', restoreError);
            try {
                const refreshedUser = await authAPI.refreshCurrentUser();
                setUser(refreshedUser);
                return;
            } catch (error) {
                console.error('Error refreshing current user:', error);
                setIsAuthenticated(false);
                setUser(null);
                updateAuthView('landing');
            }
        } finally {
            setLoading(false);
        }
    };

    const loadPreferences = async () => {
        try {
            const prefs = await preferencesAPI.getPreferences();

            // Keep deep links working, but default normal app launches back to Home.
            const urlParams = new URLSearchParams(window.location.search);
            const folderFromUrl = urlParams.get('folder');
            if (folderFromUrl) {
                setSelectedFolderId(folderFromUrl);
                localStorage.setItem('selectedFolderId', folderFromUrl);
            } else {
                setSelectedFolderId(null);
                localStorage.removeItem('selectedFolderId');
            }
            if (prefs.theme) {
                setTheme(prefs.theme);
                localStorage.setItem('theme', prefs.theme);
            }
            if (prefs.viewMode) {
                setViewMode(prefs.viewMode);
                localStorage.setItem('viewMode', prefs.viewMode);
            }
            if (prefs.sidebarWidth) {
                setSidebarWidth(prefs.sidebarWidth);
                localStorage.setItem('sidebarWidth', prefs.sidebarWidth.toString());
            }

            setPreferencesLoaded(true);
        } catch (error) {
            console.error('Error loading preferences:', error);
            // Continue with localStorage defaults
            setPreferencesLoaded(true);
        }
    };

    const savePreferencesToBackend = useCallback(async (updates) => {
        try {
            await preferencesAPI.updatePreferences(updates);
        } catch (error) {
            console.error('Error saving preferences:', error);
        }
    }, []);

    const applyTheme = (newTheme, persistToBackend = true) => {
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);

        if (persistToBackend && isAuthenticated) {
            savePreferencesToBackend({ theme: newTheme });
        }
    };

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme, true);
    };

    const updateAuthView = (nextView, nextEmail = '', { firstName = null, lastName = null, employeeId = null } = {}) => {
        const url = new URL(window.location.href);
        const resolvedFirstName = firstName ?? url.searchParams.get('firstName') ?? '';
        const resolvedLastName = lastName ?? url.searchParams.get('lastName') ?? '';
        const resolvedEmployeeId = employeeId ?? url.searchParams.get('employeeId') ?? '';

        if (nextView === 'signup') {
            url.searchParams.set('auth', 'signup');
            if (nextEmail) {
                url.searchParams.set('email', nextEmail);
            } else {
                url.searchParams.delete('email');
            }
            if (resolvedFirstName) {
                url.searchParams.set('firstName', resolvedFirstName);
            } else {
                url.searchParams.delete('firstName');
            }
            if (resolvedLastName) {
                url.searchParams.set('lastName', resolvedLastName);
            } else {
                url.searchParams.delete('lastName');
            }
            if (resolvedEmployeeId) {
                url.searchParams.set('employeeId', resolvedEmployeeId);
            } else {
                url.searchParams.delete('employeeId');
            }
        } else if (nextView === 'signup-success' || nextView === 'signup-confirmed') {
            url.searchParams.set('auth', nextView);
            if (nextEmail) {
                url.searchParams.set('email', nextEmail);
            } else {
                url.searchParams.delete('email');
            }
            if (resolvedFirstName) {
                url.searchParams.set('firstName', resolvedFirstName);
            } else {
                url.searchParams.delete('firstName');
            }
            if (resolvedLastName) {
                url.searchParams.set('lastName', resolvedLastName);
            } else {
                url.searchParams.delete('lastName');
            }
            if (resolvedEmployeeId) {
                url.searchParams.set('employeeId', resolvedEmployeeId);
            } else {
                url.searchParams.delete('employeeId');
            }
        } else if (nextView === 'login-form') {
            url.searchParams.set('auth', 'login-form');
            url.searchParams.delete('email');
            url.searchParams.delete('firstName');
            url.searchParams.delete('lastName');
            url.searchParams.delete('employeeId');
        } else {
            url.searchParams.delete('auth');
            url.searchParams.delete('email');
            url.searchParams.delete('firstName');
            url.searchParams.delete('lastName');
            url.searchParams.delete('employeeId');
        }

        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
        setAuthView(nextView);
        setInviteEmail(nextEmail);
        setInviteFirstName(url.searchParams.get('firstName') || '');
        setInviteLastName(url.searchParams.get('lastName') || '');
        setInviteEmployeeId(url.searchParams.get('employeeId') || '');
        setEmployeeLinkAttempted(false);
    };

    const handleLoginSuccess = () => {
        updateAuthView('landing');
        applyPageState(isEmployeePortalRole ? 'employee-home' : 'landing', { builder: null, project: null }, { leadingHand: null }, { planDate: null }, { pushHistory: false });
        checkAuth();
    };

    const handleSignUpSuccess = (email = '') => {
        updateAuthView('signup-success', email);
    };

    const handleConfirmationContinue = () => {
        if (isAuthenticated) {
            updateAuthView('landing');
            return;
        }

        updateAuthView('landing');
    };

    const handleSwitchToSignUp = (email = '') => {
        updateAuthView('signup', email);
    };

    const handleSwitchToLogin = () => {
        updateAuthView('login-form');
    };

    const closeInviteModal = () => {
        setShowInviteModal(false);
        setInviteError('');
        setInviteSuccess('');
        setInviteEmail('');
    };

    const closeSettingsModal = () => {
        setShowSettingsModal(false);
        setUsersError('');
        setUpdatingUserId(null);
    };

    const loadManagedUsers = async () => {
        setUsersLoading(true);
        setUsersError('');
        try {
            const users = await usersAPI.getAllUsers();
            setManagedUsers(users);
        } catch (error) {
            if (error.response?.status === 403) {
                setUsersError('Admin access is required to manage users.');
            } else {
                setUsersError(error.response?.data?.error || 'Failed to load users');
            }
        } finally {
            setUsersLoading(false);
        }
    };

    const openSettingsModal = async () => {
        setShowUserMenu(false);
        setShowSettingsModal(true);
        await loadManagedUsers();
    };

    const handleUserRoleChange = async (targetUserId, nextRole) => {
        setUpdatingUserId(targetUserId);
        setUsersError('');

        try {
            const updatedUser = await usersAPI.updateUserRole(targetUserId, nextRole);
            setManagedUsers((prev) => prev.map((managedUser) => (
                managedUser.id === targetUserId ? updatedUser : managedUser
            )));

            if (user?.id === targetUserId) {
                const nextUser = { ...user, role: updatedUser.role };
                setUser(nextUser);
                localStorage.setItem('user', JSON.stringify(nextUser));

                if (updatedUser.role !== 'admin') {
                    setShowSettingsModal(false);
                    setShowInviteModal(false);
                    setShowUserMenu(false);
                }
            }
        } catch (error) {
            if (error.response?.status === 403) {
                setUsersError('Admin access is required to update roles.');
            } else {
                setUsersError(error.response?.data?.error || 'Failed to update role');
            }
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleInviteUser = async (e) => {
        e.preventDefault();
        setInviteError('');
        setInviteSuccess('');

        if (!inviteEmail.trim()) {
            setInviteError('Please enter an email address');
            return;
        }

        setInviteLoading(true);
        try {
            await authAPI.inviteUser(inviteEmail.trim());
            setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}`);
        } catch (error) {
            if (error.response?.status === 401) {
                setInviteError('Your session has expired. Please sign in again and resend the invite.');
                setShowInviteModal(false);
                setIsAuthenticated(false);
                setUser(null);
                updateAuthView('landing');
            } else {
                setInviteError(error.response?.data?.error || 'Failed to send invitation');
            }
        } finally {
            setInviteLoading(false);
        }
    };

    const openInviteModal = () => {
        setShowUserMenu(false);
        setInviteError('');
        setInviteSuccess('');
        setInviteEmail('');
        setShowInviteModal(true);
    };

    const handleLogout = async () => {
        try {
            setShowUserMenu(false);
            await authAPI.signOut();
            setIsAuthenticated(false);
            setUser(null);
            updateAuthView('landing');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const handleFolderSelect = useCallback((folderId, { pushHistory = true } = {}) => {
        setSelectedFolderId(folderId);

        // Save to localStorage
        if (folderId === null) {
            localStorage.removeItem('selectedFolderId');
        } else {
            localStorage.setItem('selectedFolderId', folderId);
        }

        // Push browser history so back/forward buttons work
        if (pushHistory) {
            window.history.pushState(
                { folderId, page: currentPage, safetyContext, employeeContext },
                '',
                buildAppUrl(folderId, currentPage, safetyContext, employeeContext)
            );
        }

        // Save to backend
        savePreferencesToBackend({ selectedFolderId: folderId });
    }, [buildAppUrl, currentPage, safetyContext, employeeContext, savePreferencesToBackend]);

    const handleSidebarResize = (newWidth) => {
        setSidebarWidth(newWidth);
        localStorage.setItem('sidebarWidth', newWidth.toString());
        savePreferencesToBackend({ sidebarWidth: newWidth });
    };

    const handleViewModeChange = (newViewMode) => {
        setViewMode(newViewMode);
        localStorage.setItem('viewMode', newViewMode);
        savePreferencesToBackend({ viewMode: newViewMode });
    };

    const triggerRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const handleSearch = useCallback((query) => {
        setSearchQuery(query);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

        if (query.trim().length < 2) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        setShowSearchResults(true);
        setSearchLoading(true);

        searchTimerRef.current = setTimeout(async () => {
            try {
                const results = await foldersAPI.search(query.trim());
                setSearchResults(results);
            } catch (error) {
                if (error.name === 'CanceledError' || error.name === 'AbortError') return;
                console.error('Search error:', error);
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 300);
    }, []);

    const closeSearch = () => {
        setSearchQuery('');
        setShowSearchResults(false);
        setSearchResults([]);
    };

    const handleSearchNavigate = (folderId) => {
        closeSearch();
        handleFolderSelect(folderId);
    };

    const handleSearchViewPDF = (doc, type) => {
        const fileName = type === 'ess' ? doc.essDesignIssueName : doc.thirdPartyDesignName;
        setPdfViewer({
            documentId: doc.id,
            fileName: fileName || 'document.pdf',
            fileType: type
        });
        closeSearch();
    };

    // Browser back/forward button support
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const pageFromUrl = urlParams.get('page') || (isEmployeePortalRole ? 'employee-home' : 'landing');
        const builderFromUrl = urlParams.get('builder');
        const projectFromUrl = urlParams.get('project');
        const leadingHandFromUrl = urlParams.get('leadingHand');
        const rosterDateFromUrl = urlParams.get('rosterDate');
        const initialSafetyContext = {
            builder: builderFromUrl ? { id: builderFromUrl } : null,
            project: projectFromUrl ? { id: projectFromUrl } : null
        };
        const initialEmployeeContext = {
            leadingHand: leadingHandFromUrl ? { id: leadingHandFromUrl } : null
        };
        const initialRosteringContext = {
            planDate: rosterDateFromUrl || null
        };

        setCurrentPage(pageFromUrl);
        setSafetyContext(initialSafetyContext);
        setEmployeeContext(initialEmployeeContext);
        setRosteringContext(initialRosteringContext);
        window.history.replaceState(
            { folderId: selectedFolderId, page: pageFromUrl, safetyContext: initialSafetyContext, employeeContext: initialEmployeeContext, rosteringContext: initialRosteringContext },
            '',
            buildAppUrl(selectedFolderId, pageFromUrl, initialSafetyContext, initialEmployeeContext, initialRosteringContext)
        );

        const handlePopState = (e) => {
            const folderId = e.state?.folderId ?? null;
            const page = e.state?.page ?? (isEmployeePortalRole ? 'employee-home' : 'landing');
            const nextSafetyContext = e.state?.safetyContext ?? { builder: null, project: null };
            const nextEmployeeContext = e.state?.employeeContext ?? { leadingHand: null };
            const nextRosteringContext = e.state?.rosteringContext ?? { planDate: null };
            setCurrentPage(page);
            setSafetyContext(nextSafetyContext);
            setEmployeeContext(nextEmployeeContext);
            setRosteringContext(nextRosteringContext);
            handleFolderSelect(folderId, { pushHistory: false });
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [buildAppUrl, isEmployeePortalRole]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close search results and user menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSearchResults(false);
            }
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const isAdmin = user?.role === 'admin';
    const userDisplayName = user?.fullName || user?.email || 'User';
    const userTitle = user?.employeeTitle
        || (user?.role === 'leading_hand'
            ? 'Leading Hand'
            : user?.role === 'general_scaffolder'
                ? 'General Scaffolder'
                : user?.role === 'admin'
                    ? 'Admin'
                    : 'Viewer');
    const userInitials = user?.fullName
        ? user.fullName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join('')
        : (user?.email?.[0]?.toUpperCase() || 'U');
    const userAvatarUrl = avatarCandidates[avatarIndex] || null;

    useEffect(() => {
        setAvatarIndex(0);
    }, [user?.id, user?.avatarUrl, user?.avatar_url, user?.picture, user?.profileImageUrl, user?.profile_image_url, user?.avatarPath, user?.avatar_path]);

    const handleDocumentClick = (document) => {
        // Determine which PDF to show (prioritize ESS Design Issue)
        const hasEssDesign = document.essDesignIssuePath;
        const hasThirdParty = document.thirdPartyDesignPath;

        if (hasEssDesign) {
            setPdfViewer({
                documentId: document.id,
                fileName: document.essDesignIssueName || 'document.pdf',
                fileType: 'ess'
            });
        } else if (hasThirdParty) {
            setPdfViewer({
                documentId: document.id,
                fileName: document.thirdPartyDesignName || 'document.pdf',
                fileType: 'thirdparty'
            });
        }
    };

    const renderCurrentPage = () => {
        if (currentPage === 'landing') {
            return <WebLandingPage onOpenDirectory={() => setShowNavDrawer(true)} />;
        }

        if (currentPage === 'employee-home' && isEmployeePortalRole) {
            return <EmployeePortalPage user={user} />;
        }

        if (currentPage === 'settings') {
            return (
                <SettingsPage
                    user={user}
                    isAdmin={isAdmin}
                    onOpenRoleSettings={openSettingsModal}
                    onOpenInviteUser={openInviteModal}
                    onToggleTheme={(value) => applyTheme(value, true)}
                    theme={theme}
                />
            );
        }

        if (currentPage === 'site-information') {
            return <SiteInformationPage />;
        }
        if (currentPage === 'safety') {
            return (
                <ESSSafetyPage
                    onOpenScaffTags={(builder, project) => {
                        applyPageState('safety-scaff-tags', { builder, project });
                    }}
                    onOpenSwms={(builder, project) => {
                        applyPageState('safety-swms', { builder, project });
                    }}
                />
            );
        }
        if (currentPage === 'safety-scaff-tags' && safetyContext.builder && safetyContext.project) {
            return (
                <WebSafetyScaffTagsPage
                    builder={safetyContext.builder}
                    project={safetyContext.project}
                    onBack={() => window.history.back()}
                />
            );
        }
        if (currentPage === 'safety-swms' && safetyContext.builder && safetyContext.project) {
            return (
                <WebSafetySwmsPage
                    builder={safetyContext.builder}
                    project={safetyContext.project}
                    onBack={() => window.history.back()}
                />
            );
        }
        if (currentPage === 'material-ordering') {
            return <MaterialOrderingPage user={user} />;
        }
        if (currentPage === 'rostering') {
            return <ESSRosteringPage user={user} onViewTree={(planDate) => applyPageState('rostering-tree', { builder: null, project: null }, { leadingHand: null }, { planDate })} />;
        }
        if (currentPage === 'rostering-tree') {
            return (
                <RosteringTreePage
                    planDate={rosteringContext.planDate}
                    onBack={() => window.history.back()}
                />
            );
        }
        if (currentPage === 'employees') {
            return <EmployeesPage onOpenLeadingHandRelationships={(leadingHand) => applyPageState('employee-relationships', { builder: null, project: null }, { leadingHand })} />;
        }
        if (currentPage === 'employee-relationships' && employeeContext.leadingHand) {
            return (
                <LeadingHandRelationshipsPage
                    leadingHand={employeeContext.leadingHand}
                    onBack={() => window.history.back()}
                />
            );
        }

        return (
            <div className="app-body">
                <Sidebar
                    onFolderSelect={handleFolderSelect}
                    currentFolderId={selectedFolderId}
                    refreshTrigger={refreshTrigger}
                    width={sidebarWidth}
                    onResize={handleSidebarResize}
                    onDocumentClick={handleDocumentClick}
                    canManage={isAdmin}
                />
                <main className="app-main">
                    <FolderBrowser
                        selectedFolderId={selectedFolderId}
                        onFolderChange={handleFolderSelect}
                        viewMode={viewMode}
                        onViewModeChange={handleViewModeChange}
                        onRefreshNeeded={triggerRefresh}
                        canManage={isAdmin}
                    />
                </main>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-brandmark" aria-hidden="true">
                    <div className="loading-ring"></div>
                    <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="loading-logo" />
                </div>
            </div>
        );
    }

    if (authView === 'signup-confirmed') {
        return (
            <RegistrationConfirmed
                email={inviteEmail}
                theme={theme}
                onThemeChange={(value) => applyTheme(value, false)}
                isAuthenticated={isAuthenticated}
                onContinue={handleConfirmationContinue}
            />
        );
    }

    if (!isAuthenticated) {
        if (authView === 'signup') {
            return (
                <SignUp
                    onSignUpSuccess={handleSignUpSuccess}
                    onSwitchToLogin={handleSwitchToLogin}
                    theme={theme}
                    onThemeChange={(value) => applyTheme(value, false)}
                    initialEmail={inviteEmail}
                    initialFirstName={inviteFirstName}
                    initialLastName={inviteLastName}
                    employeeId={inviteEmployeeId}
                />
            );
        }
        if (authView === 'signup-success') {
            return (
                <RegistrationSuccess
                    email={inviteEmail}
                    theme={theme}
                    onThemeChange={(value) => applyTheme(value, false)}
                    onContinueToLogin={handleSwitchToLogin}
                />
            );
        }
        if (authView === 'login-form') {
            return (
                <Login
                    onLoginSuccess={handleLoginSuccess}
                    theme={theme}
                    onThemeChange={(value) => applyTheme(value, false)}
                />
            );
        }
        return (
            <div className="App">
                <header className="app-header">
                    <div className="header-left">
                        <div className="logo">
                            <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="logo-icon" />
                        </div>
                    </div>
                    <div className="header-right">
                        <WebNavDrawer
                            open={showNavDrawer}
                            currentPage="landing"
                            items={[{ key: 'login-form', label: 'Sign In' }]}
                            onToggle={() => setShowNavDrawer(prev => !prev)}
                            onClose={() => setShowNavDrawer(false)}
                            onSelect={() => {
                                setShowNavDrawer(false);
                                handleSwitchToLogin();
                            }}
                        />
                        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
                            <ThemeIcon theme={theme} size={18} />
                        </button>
                        <button type="button" className="module-primary-btn compact" onClick={handleSwitchToLogin}>
                            Sign In
                        </button>
                    </div>
                </header>
                <WebLandingPage onOpenDirectory={() => setShowNavDrawer(true)} />
            </div>
        );
    }

    return (
        <ToastProvider>
            <div className="App">
            <header className="app-header">
                <div className="header-left">
                    <button
                        type="button"
                        className="logo logo-home-btn"
                        onClick={() => applyPageState('landing', { builder: null, project: null }, { leadingHand: null })}
                        aria-label="Go to home page"
                        title="Home"
                    >
                        <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="logo-icon" />
                    </button>
                </div>
                {showHeaderSearch ? (
                    <div className="header-center" ref={searchRef}>
                        <div className="search-bar">
                            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search folders..."
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                onFocus={() => { if (searchQuery.trim().length >= 2) setShowSearchResults(true); }}
                            />
                            {searchQuery && (
                                <button className="search-clear" onClick={closeSearch}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            )}
                        </div>
                        {showSearchResults && (
                            <div className="search-results-dropdown">
                                {searchLoading ? (
                                    <div className="search-loading">
                                        <div className="spinner-small"></div>
                                        Searching...
                                    </div>
                                ) : searchResults.length === 0 ? (
                                    <div className="search-empty">No folders found for "{searchQuery}"</div>
                                ) : (
                                    searchResults.map(result => (
                                        <div key={result.id} className="search-result-item">
                                            <div className="search-result-header" onClick={() => handleSearchNavigate(result.id)}>
                                                <span className="search-result-icon"><FolderIcon size={18} /></span>
                                                <div className="search-result-info">
                                                    <div className="search-result-name">{result.name}</div>
                                                    {result.path && <div className="search-result-path">{result.path}</div>}
                                                </div>
                                            </div>
                                            <div className="search-result-contents">
                                                <div className="search-folder-row" style={{ paddingLeft: '40px' }}>
                                                    <span className="search-doc-name">
                                                        {result.subFolderCount || 0} subfolder{(result.subFolderCount || 0) === 1 ? '' : 's'}
                                                        {' - '}
                                                        {result.documentCount || 0} document{(result.documentCount || 0) === 1 ? '' : 's'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                ) : null}
                <div className="header-right">
                    <WebNavDrawer
                        open={showNavDrawer}
                        currentPage={currentPage}
                        items={allowedNavItems}
                        onToggle={() => setShowNavDrawer(prev => !prev)}
                        onClose={() => setShowNavDrawer(false)}
                        onSelect={(page) => {
                            applyPageState(page, { builder: null, project: null }, { leadingHand: null });
                            setShowNavDrawer(false);
                        }}
                    />
                    <button
                        className="icon-action-button"
                        onClick={() => {
                            setShowUserMenu(false);
                            applyPageState('settings', { builder: null, project: null }, { leadingHand: null }, { planDate: null });
                        }}
                        title="Open settings"
                        aria-label="Open settings"
                    >
                            <SettingsIcon size={18} />
                    </button>
                    <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
                        <ThemeIcon theme={theme} size={18} />
                    </button>
                    <div className="user-menu" ref={userMenuRef}>
                        <button
                            className="profile-button"
                            onClick={() => setShowUserMenu((prev) => !prev)}
                            title="Open user menu"
                            aria-label="Open user menu"
                            aria-expanded={showUserMenu}
                        >
                            {userAvatarUrl ? (
                                <img src={userAvatarUrl} alt={userDisplayName} className="profile-avatar-image" onError={() => setAvatarIndex((current) => current + 1 < avatarCandidates.length ? current + 1 : current)} />
                            ) : (
                                <span className="profile-button-initials" aria-hidden="true">{userInitials}</span>
                            )}
                            <span className="profile-button-icon" aria-hidden="true">
                                <UserProfileIcon size={16} />
                            </span>
                        </button>
                        {showUserMenu && (
                            <div className="user-menu-dropdown">
                                <div className="user-menu-summary">
                                    <div className="user-menu-avatar" aria-hidden="true">
                                        {userAvatarUrl ? (
                                            <img src={userAvatarUrl} alt={userDisplayName} className="profile-avatar-image" onError={() => setAvatarIndex((current) => current + 1 < avatarCandidates.length ? current + 1 : current)} />
                                        ) : (
                                            userInitials
                                        )}
                                    </div>
                                    <div className="user-menu-details">
                                        <div className="user-name">{userDisplayName}</div>
                                        <div className="user-email">{user?.email}</div>
                                        <div className="user-title">{userTitle}</div>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <button className="user-menu-action" onClick={openInviteModal}>
                                        Invite user
                                    </button>
                                )}
                                <button className="logout-button" onClick={handleLogout}>
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {renderCurrentPage()}

            {showSettingsModal && (
                <div className="settings-modal-overlay" onClick={closeSettingsModal}>
                    <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="settings-modal-header">
                            <div>
                                <h3>User Roles</h3>
                                <p>Assign Admin, Viewer, Scaffolder, and Leading Hand access from one place.</p>
                            </div>
                            <button type="button" className="settings-close-btn" onClick={closeSettingsModal} aria-label="Close user role settings">
                                x
                            </button>
                        </div>

                        {usersError && <div className="invite-message invite-error">{usersError}</div>}

                        <div className="settings-user-list">
                            {usersLoading ? (
                                <div className="settings-empty-state">Loading users...</div>
                            ) : managedUsers.length === 0 ? (
                                <div className="settings-empty-state">No users found.</div>
                            ) : (
                                managedUsers.map((managedUser) => (
                                    <div key={managedUser.id} className="settings-user-row">
                                        <div className="settings-user-info">
                                            <div className="settings-user-name">{managedUser.fullName || managedUser.email}</div>
                                            <div className="settings-user-email">{managedUser.email}</div>
                                        </div>
                                        <select
                                            className="settings-role-select"
                                            value={managedUser.role || 'viewer'}
                                            onChange={(e) => handleUserRoleChange(managedUser.id, e.target.value)}
                                            disabled={updatingUserId === managedUser.id}
                                        >
                                            <option value="viewer">Viewer</option>
                                            <option value="general_scaffolder">Scaffolder</option>
                                            <option value="leading_hand">Leading Hand</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showInviteModal && (
                <div className="invite-modal-overlay" onClick={closeInviteModal}>
                    <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="invite-modal-header">
                            <h3>Invite User</h3>
                            <p>Send an email with a direct button to the ESS Design sign-up page.</p>
                        </div>
                        <form onSubmit={handleInviteUser} className="invite-form">
                            <label className="invite-label" htmlFor="invite-email">Email address</label>
                            <input
                                id="invite-email"
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="name@company.com"
                                className="invite-input"
                                autoFocus
                            />
                            {inviteError && <div className="invite-message invite-error">{inviteError}</div>}
                            {inviteSuccess && <div className="invite-message invite-success">{inviteSuccess}</div>}
                            <div className="invite-actions">
                                <button type="button" className="invite-secondary-btn" onClick={closeInviteModal}>
                                    Close
                                </button>
                                <button type="submit" className="invite-primary-btn" disabled={inviteLoading}>
                                    {inviteLoading ? 'Sending...' : 'Send invite'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {pdfViewer && (
                <PDFViewer
                    documentId={pdfViewer.documentId}
                    fileName={pdfViewer.fileName}
                    fileType={pdfViewer.fileType}
                    onClose={() => setPdfViewer(null)}
                />
            )}
        </div>
        </ToastProvider>
    );
}

export default App;
