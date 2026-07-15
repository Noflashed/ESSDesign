import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import FolderBrowser from './components/FolderBrowser';
import DrawingRegisterPage from './components/DrawingRegisterPage';
import Login from './components/Login';
import SignUp from './components/SignUp';
import RegistrationSuccess from './components/RegistrationSuccess';
import RegistrationConfirmed from './components/RegistrationConfirmed';
import PDFViewer from './components/PDFViewer';
import WebNavDrawer from './components/WebNavDrawer';
import ESSSafetyPage from './components/ESSSafetyPage';
import ESSRosteringPage from './components/ESSRosteringPage';
import EmployeesPage from './components/EmployeesPage';
import WebSafetySwmsPage from './components/WebSafetySwmsPage';
import WebSafetyScaffTagsPage from './components/WebSafetyScaffTagsPage';
import SiteInformationPage from './components/SiteInformationPage';
import LeadingHandRelationshipsPage from './components/LeadingHandRelationshipsPage';
import RosteringTreePage from './components/RosteringTreePage';
import EmployeePortalPage from './components/EmployeePortalPage';
import EmployeeProfilePage from './components/EmployeeProfilePage';
import WebLandingPage from './components/WebLandingPage';
import ESSNewsPage from './components/ESSNewsPage';
import TransportSuitePage from './components/TransportSuitePage';
import MaterialOrderingPage from './components/MaterialOrderingPage';
import LoadingBrandmark from './components/LoadingBrandmark';
import PublicSharedFolderPage from './components/PublicSharedFolderPage';
import { ToastProvider } from './components/Toast';
import { authAPI, preferencesAPI, foldersAPI, usersAPI, rosteringAPI, resolveProfileImageUrl } from './services/api';
import { ClipboardList, Sparkles } from 'lucide-react';
import './App.css';

const ESSAIPage = React.lazy(() => import('./components/ESSAIPage'));
const AIFeedbackDashboard = React.lazy(() => import('./components/AIFeedbackDashboard'));

// Load logo from Supabase Storage
// Replace YOUR_PROJECT with your actual Supabase project ID
const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';
const SIDEBAR_LOGO_URL = '/ESS_logo_clean.svg';
const MALOO_LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/MALOO%20LOGO.png';
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

const SidebarSearchIcon = ({ size = 16, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.8-3.8" />
    </svg>
);

const HomeNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" />
        <path d="M9 21V12h6v9" />
    </svg>
);
const DesignNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
);
const MapNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
    </svg>
);
const ShieldNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
);
const BoxNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
);
const TruckNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7h11v10H3z" />
        <path d="M14 10h4l3 3v4h-7z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
        <path d="M3 17h2M9 17h7M20 17h1" />
    </svg>
);
const CalendarNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);
const UsersNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);
const NewsNavIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l6 6v8a2 2 0 0 1-2 2z" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="13" y2="14" />
    </svg>
);
const NAV_PAGE_ICONS = {
    'employee-home': HomeNavIcon,
    'design': DesignNavIcon,
    'drawing-register': ClipboardList,
    'site-information': MapNavIcon,
    'safety': ShieldNavIcon,
    'material-ordering': BoxNavIcon,
    'truck-schedule': TruckNavIcon,
    'rostering': CalendarNavIcon,
    'employees': UsersNavIcon,
    'ess-news': NewsNavIcon,
    'ess-ai': Sparkles,
    'ai-feedback': Sparkles,
};

function NavPageIcon({ pageKey, size = 18 }) {
    const Icon = NAV_PAGE_ICONS[pageKey] || DesignNavIcon;
    return <Icon size={size} />;
}

const TRANSPORT_PAGE_KEYS = new Set(['transport-dashboard', 'transport-drivers', 'transport-settings', 'transport-fleet', 'transport-trips', 'material-ordering', 'material-ordering-new', 'material-ordering-active', 'material-ordering-archived', 'truck-schedule', 'truck-delivery-schedule', 'truck-tracking']);
const MATERIAL_ORDERING_PAGE_KEYS = new Set(['material-ordering', 'material-ordering-new', 'material-ordering-active', 'material-ordering-archived']);
const DESIGN_PAGE_KEYS = new Set(['landing', 'employee-home', 'profile', 'settings', 'site-information', 'safety', 'safety-scaff-tags', 'safety-swms', 'transport-dashboard', 'transport-drivers', 'transport-settings', 'transport-fleet', 'transport-trips', 'material-ordering', 'material-ordering-new', 'material-ordering-active', 'material-ordering-archived', 'truck-schedule', 'truck-delivery-schedule', 'truck-tracking', 'rostering', 'rostering-tree', 'employees', 'employee-relationships', 'design', 'drawing-register', 'ess-news', 'ess-ai', 'ai-feedback']);
const SCAFFOLD_DESIGNER_ALLOWED_PAGES = new Set(['landing', 'design', 'drawing-register', 'ess-ai', 'profile', 'settings']);
const DESIGN_NAV_ITEM = {
    key: 'design',
    label: 'ESS Design',
    children: [{ key: 'drawing-register', label: 'Drawing Register' }],
};

function isPageActive(itemKey, currentPage) {
    if (itemKey === 'design') return currentPage === 'design';
    if (itemKey === 'safety') return currentPage === 'safety' || currentPage === 'safety-scaff-tags' || currentPage === 'safety-swms';
    if (itemKey === 'rostering') return currentPage === 'rostering' || currentPage === 'rostering-tree';
    if (itemKey === 'employees') return currentPage === 'employees' || currentPage === 'employee-relationships';
    if (itemKey === 'truck-schedule') return currentPage === 'transport-dashboard' || currentPage === 'transport-drivers' || currentPage === 'transport-settings' || currentPage === 'transport-fleet' || currentPage === 'transport-trips' || currentPage === 'truck-schedule' || currentPage === 'truck-delivery-schedule' || currentPage === 'truck-tracking' || currentPage === 'material-ordering' || currentPage === 'material-ordering-new' || currentPage === 'material-ordering-active' || currentPage === 'material-ordering-archived';
    if (itemKey === 'material-ordering-new') return currentPage === 'material-ordering' || currentPage === 'material-ordering-new';
    return currentPage === itemKey;
}

function getRoleDisplayName(role) {
    switch (role) {
        case 'admin': return 'Admin';
        case 'scaffold_designer': return 'Scaffold Designer';
        case 'site_supervisor': return 'Site Supervisor';
        case 'project_manager': return 'Project Manager';
        case 'leading_hand': return 'Leading Hand';
        case 'general_scaffolder': return 'General Scaffolder';
        case 'transport_management': return 'Transport Management';
        case 'truck_ess01': return 'Truck ESS01';
        case 'truck_ess02': return 'Truck ESS02';
        case 'truck_ess03': return 'Truck ESS03';
        default: return 'Viewer';
    }
}

function getSharedFolderLinkFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const folderId = urlParams.get('sharedFolder');
    const token = urlParams.get('token');

    if (!folderId || !token) {
        return null;
    }

    return { folderId, token };
}

function NavSidebar({
    open,
    navItems,
    currentPage,
    onNavigate,
    userDisplayName,
    userEmail,
    userTitle,
    userAvatarUrl,
    userInitials,
    onAvatarError,
    showUserMenu,
    onToggleUserMenu,
    onOpenProfile,
    userMenuRef,
    isAdmin,
    onInviteUser,
    onLogout,
}) {
    const [expandedKeys, setExpandedKeys] = useState({});
    const [navSearchQuery, setNavSearchQuery] = useState('');

    const visibleNavItems = useMemo(() => {
        const query = navSearchQuery.trim().toLowerCase();

        if (!query) {
            return navItems;
        }

        return navItems
            .map((item) => {
                const children = Array.isArray(item.children) ? item.children : [];
                const matchingChildren = children.filter((child) => child.label.toLowerCase().includes(query));
                const itemMatches = item.label.toLowerCase().includes(query);

                if (!itemMatches && matchingChildren.length === 0) {
                    return null;
                }

                return {
                    ...item,
                    children: itemMatches ? children : matchingChildren,
                };
            })
            .filter(Boolean);
    }, [navItems, navSearchQuery]);

    return (
        <aside className="app-nav-sidebar">
            <div className="app-nav-sidebar-brand">
                <button
                    type="button"
                    className="app-nav-sidebar-brand-button"
                    onClick={() => onNavigate('landing')}
                    title="Home"
                    aria-label="Go to home"
                >
                    <span className="app-nav-sidebar-logo-pair">
                        <img
                            src={SIDEBAR_LOGO_URL}
                            alt="ErectSafe Scaffolding"
                            className="app-nav-sidebar-logo"
                        />
                        <img
                            src={MALOO_LOGO_URL}
                            alt="Maloo"
                            className="app-nav-sidebar-logo app-nav-sidebar-logo-maloo"
                        />
                    </span>
                </button>
            </div>

            <div className="app-nav-sidebar-search">
                <SidebarSearchIcon size={16} />
                <input
                    type="search"
                    value={navSearchQuery}
                    onChange={(event) => setNavSearchQuery(event.target.value)}
                    placeholder="Search"
                    aria-label="Search navigation"
                />
            </div>

            <nav className="app-nav-sidebar-nav">
                {visibleNavItems.map(item => {
                    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                    const hasActiveChild = hasChildren && item.children.some((child) => child.key === currentPage);
                    const expanded = navSearchQuery.trim()
                        ? true
                        : (expandedKeys[item.key] ?? (hasActiveChild || currentPage === item.key));
                    const submenuId = `app-nav-sidebar-submenu-${item.key}`;
                    return (
                        <div key={item.key} className={`app-nav-sidebar-group${isPageActive(item.key, currentPage) ? ' active' : ''}`}>
                            <button
                                className={`app-nav-sidebar-item${isPageActive(item.key, currentPage) ? ' active' : ''}`}
                                onClick={() => {
                                    if (hasChildren) {
                                        setExpandedKeys({ [item.key]: true });
                                    } else {
                                        setExpandedKeys({});
                                    }
                                    onNavigate(item.key);
                                }}
                                title={!open ? item.label : undefined}
                                aria-expanded={hasChildren ? expanded : undefined}
                                aria-controls={hasChildren ? submenuId : undefined}
                            >
                                <span className="app-nav-sidebar-icon"><NavPageIcon pageKey={item.key} size={18} /></span>
                                {open && <span className="app-nav-sidebar-label">{item.label}</span>}
                            </button>
                            {open && hasChildren && expanded ? (
                                <div id={submenuId} className="app-nav-sidebar-submenu">
                                    {item.children.map((child) => (
                                        <button
                                            key={child.key}
                                            className={`app-nav-sidebar-subitem${currentPage === child.key ? ' active' : ''}`}
                                            onClick={() => onNavigate(child.key)}
                                        >
                                            <span className="app-nav-sidebar-subicon"><NavPageIcon pageKey={child.key} size={15} /></span>
                                            <span>{child.label}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </nav>

            <div className="app-nav-sidebar-bottom">
                <div className="app-nav-sidebar-profile" ref={userMenuRef}>
                    <button
                        type="button"
                        className={`app-nav-sidebar-profile-button${currentPage === 'profile' ? ' active' : ''}`}
                        onClick={onOpenProfile}
                        title="Open profile"
                        aria-label="Open profile"
                        aria-expanded={false}
                    >
                        <span className="app-nav-sidebar-profile-avatar" aria-hidden="true">
                            {userAvatarUrl ? (
                                <img src={userAvatarUrl} alt="" referrerPolicy="no-referrer" onError={onAvatarError} />
                            ) : (
                                userInitials
                            )}
                            <span className="app-nav-sidebar-profile-status" />
                        </span>
                        {open ? (
                            <>
                                <span className="app-nav-sidebar-profile-copy">
                                    <strong>{userDisplayName}</strong>
                                    <span>{userEmail || userTitle}</span>
                                </span>
                                <span className="app-nav-sidebar-profile-caret" aria-hidden="true">⌄</span>
                            </>
                        ) : null}
                    </button>
                    {showUserMenu && (
                        <div className="user-menu-dropdown app-nav-sidebar-user-menu">
                            <div className="user-menu-summary">
                                <div className="user-menu-avatar" aria-hidden="true">
                                    {userAvatarUrl ? (
                                        <img src={userAvatarUrl} alt={userDisplayName} className="profile-avatar-image" referrerPolicy="no-referrer" onError={onAvatarError} />
                                    ) : (
                                        userInitials
                                    )}
                                </div>
                                <div className="user-menu-details">
                                    <div className="user-name">{userDisplayName}</div>
                                    <div className="user-email">{userEmail}</div>
                                    <div className="user-title">{userTitle}</div>
                                </div>
                            </div>
                            <button className="user-menu-action" onClick={onOpenProfile}>
                                Open profile
                            </button>
                            {isAdmin && (
                                <button className="user-menu-action" onClick={onInviteUser}>
                                    Invite user
                                </button>
                            )}
                            <button className="logout-button" onClick={onLogout}>
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}

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

    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
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
        user?.resolvedAvatarUrl,
        user?.resolved_avatar_url,
        user?.ResolvedAvatarUrl,
        user?.avatarUrl,
        user?.avatar_url,
        user?.AvatarUrl,
        user?.employeeAvatarUrl,
        user?.employee_avatar_url,
        user?.EmployeeAvatarUrl,
        user?.picture,
        user?.Picture,
        user?.profileImageUrl,
        user?.profile_image_url,
        user?.ProfileImageUrl,
        user?.employeeProfileImageUrl,
        user?.employee_profile_image_url,
        user?.EmployeeProfileImageUrl,
        user?.profileImage,
        user?.profile_image,
        user?.ProfileImage,
        user?.avatarPath,
        user?.avatar_path,
        user?.AvatarPath,
        user?.employeeAvatarPath,
        user?.employee_avatar_path,
        user?.EmployeeAvatarPath
    ].filter(Boolean);

    return [...new Set(rawValues.flatMap(normalizeAvatarSource))];
};

const isAvatarDebugEnabled = () => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('debugAvatar') || localStorage.getItem('debugAvatar') === 'true';
};

const summarizeAvatarRecord = (record) => {
    if (!record) return null;
    return {
        id: record.id || record.Id || null,
        userId: record.userId || record.user_id || record.sub || null,
        employeeId: record.employeeId || record.EmployeeId || record.employee_id || null,
        linkedAuthUserId: record.linkedAuthUserId || record.linked_auth_user_id || record.LinkedAuthUserId || null,
        email: record.email || null,
        fullName: record.fullName || record.full_name || null,
        avatarUrl: record.avatarUrl || record.avatar_url || record.AvatarUrl || null,
        profileImageUrl: record.profileImageUrl || record.profile_image_url || record.ProfileImageUrl || null,
        avatarPath: record.avatarPath || record.avatar_path || record.AvatarPath || null
    };
};

function App() {
    const sharedFolderLink = getSharedFolderLinkFromUrl();
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
    const [pdfViewer, setPdfViewer] = useState(null);
    const [preferencesLoaded, setPreferencesLoaded] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [navSidebarOpen, setNavSidebarOpen] = useState(true);
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
    const [avatarProfileUser, setAvatarProfileUser] = useState(null);
    const [avatarDebugEvents, setAvatarDebugEvents] = useState([]);
    const [resolvedDisplayAvatarUrl, setResolvedDisplayAvatarUrl] = useState('');
    const avatarDebugEnabled = useMemo(() => isAvatarDebugEnabled(), []);

    useEffect(() => {
        if (DESIGN_PAGE_KEYS.has(currentPage) && !TRANSPORT_PAGE_KEYS.has(currentPage)) {
            setNavSidebarOpen(true);
        }
    }, [currentPage]);
    const [safetyContext, setSafetyContext] = useState({ builder: null, project: null });
    const [employeeContext, setEmployeeContext] = useState({ leadingHand: null });
    const [rosteringContext, setRosteringContext] = useState({ planDate: null });
    const isEmployeePortalRole = user?.role === 'general_scaffolder'
        || user?.role === 'leading_hand';
    const isScaffoldDesigner = user?.role === 'scaffold_designer';
    const isTransportManagement = user?.role === 'transport_management';
    const isTruckDeviceUser = user?.role === 'truck_ess01' || user?.role === 'truck_ess02' || user?.role === 'truck_ess03';
    const hasTransportSuiteAccess = user?.role === 'admin' || isTransportManagement || isTruckDeviceUser;
    const showRosteringAndEmployees = user?.role === 'admin' || user?.role === 'viewer';
    const allowedNavItems = isEmployeePortalRole
        ? [{ key: 'employee-home', label: 'ESS App' }, { key: 'ess-ai', label: 'ESS AI' }]
        : isScaffoldDesigner
        ? [
            DESIGN_NAV_ITEM,
            { key: 'ess-ai', label: 'ESS AI' },
        ]
        : isTruckDeviceUser
        ? [{ key: 'truck-schedule', label: 'ESS Transport' }, { key: 'ess-ai', label: 'ESS AI' }]
        : isTransportManagement
        ? [{ key: 'truck-schedule', label: 'ESS Transport' }, { key: 'ess-ai', label: 'ESS AI' }]
        : [
            DESIGN_NAV_ITEM,
            { key: 'ess-ai', label: 'ESS AI' },
            { key: 'site-information', label: 'Site Registry' },
            ...(showRosteringAndEmployees ? [{ key: 'employees', label: 'Employees' }] : []),
            ...(hasTransportSuiteAccess
                ? [{ key: 'truck-schedule', label: 'ESS Transport' }]
                : [{ key: 'material-ordering-new', label: 'New Materials List' }]),
            ...(showRosteringAndEmployees ? [
                { key: 'rostering', label: 'ESS Rostering' },
                { key: 'safety', label: 'Project data' },
            ] : [
                { key: 'safety', label: 'Project data' },
            ]),
            ...(user?.role === 'admin' ? [
                { key: 'ess-news', label: 'ESS News' },
                { key: 'ai-feedback', label: 'AI Feedback' },
            ] : []),
        ];
    const showHeaderSearch = false;
    const searchRef = useRef(null);
    const userMenuRef = useRef(null);
    const searchTimerRef = useRef(null);
    const avatarSourceUser = useMemo(() => (
        avatarProfileUser ? { ...user, ...avatarProfileUser } : user
    ), [avatarProfileUser, user]);
    const avatarCandidates = useMemo(() => buildAvatarCandidates(avatarSourceUser), [avatarSourceUser]);
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
        const transportPages = TRANSPORT_PAGE_KEYS;
        const resolvedPage = isEmployeePortalRole
            ? (page === 'landing' || page === 'employee-home' || page === 'profile' || page === 'settings' ? page : 'employee-home')
            : isScaffoldDesigner
            ? (SCAFFOLD_DESIGNER_ALLOWED_PAGES.has(page) ? page : 'landing')
            : isTruckDeviceUser
            ? (transportPages.has(page) ? page : 'truck-schedule')
            : isTransportManagement
            ? (transportPages.has(page) ? page : 'truck-schedule')
            : (!hasTransportSuiteAccess && transportPages.has(page) && !MATERIAL_ORDERING_PAGE_KEYS.has(page))
            ? 'material-ordering-new'
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
    }, [buildAppUrl, hasTransportSuiteAccess, isEmployeePortalRole, isScaffoldDesigner, isTransportManagement, isTruckDeviceUser, selectedFolderId]);

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

    useEffect(() => {
        let active = true;

        const loadAvatarProfile = async () => {
            if (!isAuthenticated || !user) {
                setAvatarProfileUser(null);
                return;
            }

            try {
                const [usersResult, employeesResult] = await Promise.allSettled([
                    usersAPI.getAllUsers(),
                    rosteringAPI.getEmployees()
                ]);
                if (!active) return;

                const userIds = [
                    user?.id,
                    user?.Id,
                    user?.userId,
                    user?.user_id,
                    user?.sub
                ].filter(Boolean).map(String);
                const userIdSet = new Set(userIds);
                const employeeId = user?.employeeId || user?.EmployeeId || user?.employee_id || '';
                const email = (user?.email || '').trim().toLowerCase();
                const users = usersResult.status === 'fulfilled' && Array.isArray(usersResult.value)
                    ? usersResult.value
                    : [];
                const employees = employeesResult.status === 'fulfilled' && Array.isArray(employeesResult.value)
                    ? employeesResult.value
                    : [];
                const match = users.find(candidate => (
                    [candidate.id, candidate.Id, candidate.userId, candidate.user_id, candidate.sub]
                        .filter(Boolean)
                        .some(candidateId => userIdSet.has(String(candidateId)))
                    || (email && (candidate.email || '').trim().toLowerCase() === email)
                ));
                const matchedUserIds = new Set([
                    ...userIds,
                    match?.id,
                    match?.Id,
                    match?.userId,
                    match?.user_id,
                    match?.sub
                ].filter(Boolean).map(String));
                const employeeMatch = employees.find(candidate => (
                    (employeeId && String(candidate.id) === String(employeeId))
                    || [candidate.linkedAuthUserId, candidate.linked_auth_user_id, candidate.LinkedAuthUserId]
                        .filter(Boolean)
                        .some(candidateId => matchedUserIds.has(String(candidateId)))
                    || (email && (candidate.email || '').trim().toLowerCase() === email)
                ));
                const avatarIdsToVerify = [
                    employeeMatch?.id,
                    employeeId,
                    employeeMatch?.linkedAuthUserId,
                    employeeMatch?.linked_auth_user_id,
                    match?.id,
                    match?.Id,
                    user?.id,
                    user?.Id
                ].filter(Boolean);
                let resolvedAvatarUrl = null;
                for (const candidateId of [...new Set(avatarIdsToVerify.map(String))]) {
                    resolvedAvatarUrl = await resolveProfileImageUrl(candidateId);
                    if (resolvedAvatarUrl) break;
                }
                const nextAvatarProfile = match || employeeMatch ? {
                    ...(employeeMatch || {}),
                    ...(match || {}),
                    resolvedAvatarUrl,
                    employeeId: employeeMatch?.id || employeeId || match?.employeeId || match?.EmployeeId || null,
                    linkedAuthUserId: employeeMatch?.linkedAuthUserId
                        || employeeMatch?.linked_auth_user_id
                        || match?.id
                        || user?.id
                        || null,
                    employeeAvatarUrl: employeeMatch?.avatarUrl || employeeMatch?.avatar_url || employeeMatch?.AvatarUrl,
                    employeeProfileImageUrl: employeeMatch?.profileImageUrl || employeeMatch?.profile_image_url || employeeMatch?.ProfileImageUrl,
                    employeeAvatarPath: employeeMatch?.avatarPath || employeeMatch?.avatar_path || employeeMatch?.AvatarPath
                } : null;

                if (avatarDebugEnabled) {
                    console.groupCollapsed('[ESS Avatar] profile lookup');
                    console.log('current auth user', summarizeAvatarRecord(user));
                    console.log('users result', {
                        status: usersResult.status,
                        count: users.length,
                        reason: usersResult.status === 'rejected' ? usersResult.reason : null
                    });
                    console.log('employees result', {
                        status: employeesResult.status,
                        count: employees.length,
                        reason: employeesResult.status === 'rejected' ? employeesResult.reason : null
                    });
                    console.log('matched app user', summarizeAvatarRecord(match));
                    console.log('matched employee', summarizeAvatarRecord(employeeMatch));
                    console.log('merged avatar profile', summarizeAvatarRecord(nextAvatarProfile));
                    console.groupEnd();
                }

                setAvatarProfileUser(nextAvatarProfile);
            } catch (error) {
                if (avatarDebugEnabled) {
                    console.warn('[ESS Avatar] profile lookup failed', error);
                }
                if (active) {
                    setAvatarProfileUser(null);
                }
            }
        };

        loadAvatarProfile();

        return () => {
            active = false;
        };
    }, [avatarDebugEnabled, isAuthenticated, user?.id, user?.Id, user?.userId, user?.user_id, user?.sub, user?.employeeId, user?.EmployeeId, user?.employee_id, user?.email]);

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
            localStorage.setItem('viewMode', 'list');
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
        applyPageState(
            isEmployeePortalRole
                ? 'employee-home'
                : isScaffoldDesigner
                ? 'landing'
                : (isTruckDeviceUser || isTransportManagement)
                ? 'truck-schedule'
                : 'landing',
            { builder: null, project: null },
            { leadingHand: null },
            { planDate: null },
            { pushHistory: false },
        );
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

    const handleOpenDesignFolder = useCallback((folderId) => {
        const emptySafetyContext = { builder: null, project: null };
        const emptyEmployeeContext = { leadingHand: null };
        const emptyRosteringContext = { planDate: null };
        setSelectedFolderId(folderId);
        setCurrentPage('design');
        setSafetyContext(emptySafetyContext);
        setEmployeeContext(emptyEmployeeContext);
        setRosteringContext(emptyRosteringContext);
        localStorage.setItem('selectedFolderId', folderId);
        window.history.pushState(
            { folderId, page: 'design', safetyContext: emptySafetyContext, employeeContext: emptyEmployeeContext, rosteringContext: emptyRosteringContext },
            '',
            buildAppUrl(folderId, 'design', emptySafetyContext, emptyEmployeeContext, emptyRosteringContext)
        );
        savePreferencesToBackend({ selectedFolderId: folderId });
    }, [buildAppUrl, savePreferencesToBackend]);

    const handleSidebarResize = (newWidth) => {
        setSidebarWidth(newWidth);
        localStorage.setItem('sidebarWidth', newWidth.toString());
        savePreferencesToBackend({ sidebarWidth: newWidth });
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

    const handleSearchViewPDF = (doc, type = 'ess') => {
        const fileName = doc.essDesignIssueName;
        setPdfViewer({
            documentId: doc.id,
            fileName: fileName || 'document.pdf',
            fileType: type || 'ess',
            versionKey: type === 'thirdparty'
                ? doc.thirdPartyDesignFileFingerprint || doc.thirdPartyDesignPath || doc.updatedAt || ''
                : doc.essDesignFileFingerprint || doc.essDesignIssuePath || doc.updatedAt || ''
        });
        closeSearch();
    };

    // Browser back/forward button support
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const fallbackPage = isEmployeePortalRole
            ? 'employee-home'
            : isScaffoldDesigner
            ? 'landing'
            : (isTruckDeviceUser || isTransportManagement)
            ? 'truck-schedule'
            : 'landing';
        const pageFromUrl = urlParams.get('page') || fallbackPage;
        const resolvedPageFromUrl = isScaffoldDesigner && !SCAFFOLD_DESIGNER_ALLOWED_PAGES.has(pageFromUrl)
            ? 'landing'
            : (!hasTransportSuiteAccess && TRANSPORT_PAGE_KEYS.has(pageFromUrl) && !MATERIAL_ORDERING_PAGE_KEYS.has(pageFromUrl))
            ? 'material-ordering-new'
            : pageFromUrl;
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

        setCurrentPage(resolvedPageFromUrl);
        setSafetyContext(initialSafetyContext);
        setEmployeeContext(initialEmployeeContext);
        setRosteringContext(initialRosteringContext);
        window.history.replaceState(
            { folderId: selectedFolderId, page: resolvedPageFromUrl, safetyContext: initialSafetyContext, employeeContext: initialEmployeeContext, rosteringContext: initialRosteringContext },
            '',
            buildAppUrl(selectedFolderId, resolvedPageFromUrl, initialSafetyContext, initialEmployeeContext, initialRosteringContext)
        );

        const handlePopState = (e) => {
            const folderId = e.state?.folderId ?? null;
            const page = e.state?.page ?? fallbackPage;
            const resolvedPage = isScaffoldDesigner && !SCAFFOLD_DESIGNER_ALLOWED_PAGES.has(page)
                ? 'landing'
                : (!hasTransportSuiteAccess && TRANSPORT_PAGE_KEYS.has(page) && !MATERIAL_ORDERING_PAGE_KEYS.has(page))
                ? 'material-ordering-new'
                : page;
            const nextSafetyContext = e.state?.safetyContext ?? { builder: null, project: null };
            const nextEmployeeContext = e.state?.employeeContext ?? { leadingHand: null };
            const nextRosteringContext = e.state?.rosteringContext ?? { planDate: null };
            setCurrentPage(resolvedPage);
            setSafetyContext(nextSafetyContext);
            setEmployeeContext(nextEmployeeContext);
            setRosteringContext(nextRosteringContext);
            handleFolderSelect(folderId, { pushHistory: false });
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [buildAppUrl, hasTransportSuiteAccess, isEmployeePortalRole, isScaffoldDesigner, isTruckDeviceUser, isTransportManagement]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const isTransportPage = TRANSPORT_PAGE_KEYS.has(currentPage)
        && (hasTransportSuiteAccess || !MATERIAL_ORDERING_PAGE_KEYS.has(currentPage));
    const isAdmin = user?.role === 'admin';
    const canManageEssDesign = isAdmin || isScaffoldDesigner;
    const isIntegratedSidebarPage = isAuthenticated && !isTransportPage && DESIGN_PAGE_KEYS.has(currentPage);
    const userDisplayName = user?.fullName || user?.email || 'User';
    const userTitle = getRoleDisplayName(user?.role);
    const userInitials = user?.fullName
        ? user.fullName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join('')
        : (user?.email?.[0]?.toUpperCase() || 'U');
    const probingAvatarUrl = avatarIndex < avatarCandidates.length ? avatarCandidates[avatarIndex] : null;
    const userAvatarUrl = resolvedDisplayAvatarUrl || null;
    const avatarDebugSnapshot = useMemo(() => ({
        authUser: summarizeAvatarRecord(user),
        matchedProfile: summarizeAvatarRecord(avatarProfileUser),
        mergedProfile: summarizeAvatarRecord(avatarSourceUser),
        avatarIndex,
        currentAvatarUrl: probingAvatarUrl,
        displayAvatarUrl: userAvatarUrl,
        candidateCount: avatarCandidates.length,
        avatarCandidates,
        failures: avatarDebugEvents
    }), [avatarCandidates, avatarDebugEvents, avatarIndex, avatarProfileUser, avatarSourceUser, probingAvatarUrl, user, userAvatarUrl]);

    useEffect(() => {
        setAvatarIndex(0);
        setAvatarDebugEvents([]);
        setResolvedDisplayAvatarUrl('');
    }, [avatarCandidates.join('|')]);

    useEffect(() => {
        let cancelled = false;
        const candidates = [...new Set(avatarCandidates.filter(Boolean))];

        setResolvedDisplayAvatarUrl('');
        if (candidates.length === 0) {
            return undefined;
        }

        const probeCandidate = (index) => {
            if (cancelled) return;
            if (index >= candidates.length) {
                setAvatarIndex(index);
                return;
            }

            const url = candidates[index];
            setAvatarIndex(index);
            const image = new Image();
            image.referrerPolicy = 'no-referrer';
            image.onload = () => {
                if (cancelled) return;
                setResolvedDisplayAvatarUrl(url);
                if (avatarDebugEnabled) {
                    console.info('[ESS Avatar] image candidate loaded', { loadedIndex: index, loadedUrl: url });
                }
            };
            image.onerror = () => {
                if (cancelled) return;
                const failure = {
                    failedIndex: index,
                    failedUrl: url,
                    nextUrl: candidates[index + 1] || null
                };
                if (avatarDebugEnabled) {
                    setAvatarDebugEvents((current) => [...current.slice(-7), failure]);
                    console.warn('[ESS Avatar] image candidate failed', failure);
                }
                probeCandidate(index + 1);
            };
            image.src = url;
        };

        probeCandidate(0);

        return () => {
            cancelled = true;
        };
    }, [avatarCandidates, avatarDebugEnabled]);

    useEffect(() => {
        if (!avatarDebugEnabled) return;

        window.__essAvatarDebug = avatarDebugSnapshot;

        console.info('[ESS Avatar] debug enabled', avatarDebugSnapshot);
    }, [avatarDebugEnabled, avatarDebugSnapshot]);

    const handleAvatarImageError = useCallback((event) => {
        const failedUrl = event.currentTarget?.currentSrc || event.currentTarget?.src || userAvatarUrl;
        if (avatarDebugEnabled) {
            const failure = {
                failedIndex: avatarIndex,
                failedUrl,
                nextUrl: avatarCandidates[avatarIndex + 1] || null
            };
            setAvatarDebugEvents((current) => [...current.slice(-7), failure]);
            console.warn('[ESS Avatar] image candidate failed', failure);
        }
        setResolvedDisplayAvatarUrl('');
    }, [avatarCandidates, avatarDebugEnabled, avatarIndex, userAvatarUrl]);

    const handleCurrentUserUpdated = useCallback((updatedUser) => {
        if (!updatedUser) return;
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setAvatarProfileUser(null);
    }, []);

    const handleDocumentClick = (document) => {
        if (document.essDesignIssuePath || document.fileType === 'thirdparty') {
            setPdfViewer({
                documentId: document.id,
                fileName: document.essDesignIssueName || 'document.pdf',
                fileType: document.fileType || 'ess',
                versionKey: document.fileType === 'thirdparty'
                    ? document.thirdPartyDesignFileFingerprint || document.thirdPartyDesignPath || document.updatedAt || ''
                    : document.essDesignFileFingerprint || document.essDesignIssuePath || document.updatedAt || ''
            });
        }
    };

    const renderCurrentPage = () => {
        if (currentPage === 'landing') {
            return <WebLandingPage />;
        }

        if (currentPage === 'employee-home' && isEmployeePortalRole) {
            return (
                <EmployeePortalPage
                    user={user}
                    userAvatarUrl={userAvatarUrl}
                    userInitials={userInitials}
                    userDisplayName={userDisplayName}
                    onUserAvatarError={handleAvatarImageError}
                />
            );
        }

        if (currentPage === 'profile' || currentPage === 'settings') {
            return (
                <EmployeeProfilePage
                    user={user}
                    onUserUpdated={handleCurrentUserUpdated}
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
        if (MATERIAL_ORDERING_PAGE_KEYS.has(currentPage) && !hasTransportSuiteAccess) {
            const materialOrderingView = currentPage === 'material-ordering-active'
                ? 'active'
                : currentPage === 'material-ordering-archived'
                ? 'archived'
                : 'form';
            return <MaterialOrderingPage user={user} view={materialOrderingView} onNavigate={(page) => applyPageState(page, { builder: null, project: null }, { leadingHand: null }, { planDate: null })} />;
        }
        if (TRANSPORT_PAGE_KEYS.has(currentPage)) {
            return <TransportSuitePage user={user} currentPage={currentPage} onNavigate={(page) => applyPageState(page, { builder: null, project: null }, { leadingHand: null }, { planDate: null })} onExit={() => applyPageState(isEmployeePortalRole ? 'employee-home' : 'landing', { builder: null, project: null }, { leadingHand: null }, { planDate: null })} onLogout={handleLogout} />;
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
            return (
                <EmployeesPage
                    currentUserId={user?.id}
                    onCurrentUserUpdated={setUser}
                    onOpenLeadingHandRelationships={(leadingHand) => applyPageState('employee-relationships', { builder: null, project: null }, { leadingHand })}
                />
            );
        }
        if (currentPage === 'employee-relationships' && employeeContext.leadingHand) {
            return (
                <LeadingHandRelationshipsPage
                    leadingHand={employeeContext.leadingHand}
                    onBack={() => window.history.back()}
                />
            );
        }

        if (currentPage === 'ess-news' && isAdmin) {
            return <ESSNewsPage />;
        }

        if (currentPage === 'drawing-register') {
            return <DrawingRegisterPage onBack={() => applyPageState('design', { builder: null, project: null }, { leadingHand: null }, { planDate: null })} onOpenDocument={handleDocumentClick} canEdit={canManageEssDesign} />;
        }

        if (currentPage === 'ess-ai') {
            return (
                <React.Suspense fallback={<div className="ess-ai-route-loading"><LoadingBrandmark label="Loading ESS AI" /></div>}>
                    <ESSAIPage
                        userId={user?.id || ''}
                        userAvatarUrl={userAvatarUrl}
                        userInitials={userInitials}
                        userDisplayName={userDisplayName}
                        onUserAvatarError={handleAvatarImageError}
                    />
                </React.Suspense>
            );
        }

        if (currentPage === 'ai-feedback' && isAdmin) {
            return (
                <React.Suspense fallback={<div className="ess-ai-route-loading"><LoadingBrandmark label="Loading AI feedback" /></div>}>
                    <AIFeedbackDashboard />
                </React.Suspense>
            );
        }

        return (
            <div className="module-page">
                <FolderBrowser
                    selectedFolderId={selectedFolderId}
                    onFolderChange={handleFolderSelect}
                    onRefreshNeeded={triggerRefresh}
                    canManage={canManageEssDesign}
                    onOpenDrawingRegister={() => applyPageState('drawing-register', { builder: null, project: null }, { leadingHand: null }, { planDate: null })}
                />
            </div>
        );
    };

    if (sharedFolderLink) {
        return (
            <div className="App public-share-app">
                <PublicSharedFolderPage folderId={sharedFolderLink.folderId} token={sharedFolderLink.token} />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="loading-screen">
                <LoadingBrandmark label="Loading ESS Design" />
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
                        <button type="button" className="module-primary-btn compact" onClick={handleSwitchToLogin}>
                            Sign In
                        </button>
                    </div>
                </header>
                <WebLandingPage />
            </div>
        );
    }

    return (
        <ToastProvider>
            <div className={`App${isIntegratedSidebarPage ? ` app-integrated-sidebar-shell ${navSidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}` : ''}`}>
            {!isTransportPage && !isIntegratedSidebarPage ? (
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
                    {!DESIGN_PAGE_KEYS.has(currentPage) && (
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
                    )}
                    {!DESIGN_PAGE_KEYS.has(currentPage) && (
                        <button
                            className="icon-action-button"
                            onClick={() => {
                                setShowUserMenu(false);
                                applyPageState('profile', { builder: null, project: null }, { leadingHand: null }, { planDate: null });
                            }}
                            title="Open profile"
                            aria-label="Open profile"
                        >
                            <SettingsIcon size={18} />
                        </button>
                    )}
                    {!isIntegratedSidebarPage && (
                    <div className="user-menu" ref={userMenuRef}>
                        <button
                            className="profile-button"
                            onClick={() => setShowUserMenu((prev) => !prev)}
                            title="Open user menu"
                            aria-label="Open user menu"
                            aria-expanded={showUserMenu}
                        >
                            {userAvatarUrl ? (
                                <img src={userAvatarUrl} alt={userDisplayName} className="profile-avatar-image" referrerPolicy="no-referrer" onError={handleAvatarImageError} />
                            ) : (
                                <span className="profile-button-initials" aria-hidden="true">{userInitials}</span>
                            )}
                        </button>
                        {showUserMenu && (
                            <div className="user-menu-dropdown">
                                <div className="user-menu-summary">
                                    <div className="user-menu-avatar" aria-hidden="true">
                                        {userAvatarUrl ? (
                                            <img src={userAvatarUrl} alt={userDisplayName} className="profile-avatar-image" referrerPolicy="no-referrer" onError={handleAvatarImageError} />
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
                                <button
                                    className="user-menu-action"
                                    onClick={() => {
                                        setShowUserMenu(false);
                                        applyPageState('profile', { builder: null, project: null }, { leadingHand: null }, { planDate: null });
                                    }}
                                >
                                    Open profile
                                </button>
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
                    )}
                </div>
            </header>
            ) : null}

            {DESIGN_PAGE_KEYS.has(currentPage) ? (
                isTransportPage ? (
                    <div className="transport-page-frame transport-page-frame-full">
                        {renderCurrentPage()}
                    </div>
                ) : (
                    <div className="app-content-wrapper">
                        <NavSidebar
                            open={true}
                            navItems={allowedNavItems}
                            currentPage={currentPage}
                            onNavigate={(page) => {
                                applyPageState(page, { builder: null, project: null }, { leadingHand: null });
                            }}
                            userDisplayName={userDisplayName}
                            userEmail={user?.email}
                            userTitle={userTitle}
                            userAvatarUrl={userAvatarUrl}
                            userInitials={userInitials}
                            onAvatarError={handleAvatarImageError}
                            showUserMenu={showUserMenu}
                            onToggleUserMenu={() => setShowUserMenu((prev) => !prev)}
                            onOpenProfile={() => {
                                setShowUserMenu(false);
                                applyPageState('profile', { builder: null, project: null }, { leadingHand: null }, { planDate: null });
                            }}
                            userMenuRef={userMenuRef}
                            isAdmin={isAdmin}
                            onInviteUser={openInviteModal}
                            onLogout={handleLogout}
                        />
                        <div className="app-page-content">
                            {renderCurrentPage()}
                        </div>
                    </div>
                )
            ) : (
                renderCurrentPage()
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

            {avatarDebugEnabled && (
                <aside className="avatar-debug-panel" aria-label="Avatar debug panel">
                    <div className="avatar-debug-header">
                        <strong>Avatar Debug</strong>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard?.writeText(JSON.stringify(avatarDebugSnapshot, null, 2));
                            }}
                        >
                            Copy
                        </button>
                    </div>
                    <dl>
                        <div>
                            <dt>Auth ID</dt>
                            <dd>{avatarDebugSnapshot.authUser?.id || avatarDebugSnapshot.authUser?.userId || '-'}</dd>
                        </div>
                        <div>
                            <dt>Employee ID</dt>
                            <dd>{avatarDebugSnapshot.mergedProfile?.employeeId || '-'}</dd>
                        </div>
                        <div>
                            <dt>Linked Auth</dt>
                            <dd>{avatarDebugSnapshot.mergedProfile?.linkedAuthUserId || '-'}</dd>
                        </div>
                        <div>
                            <dt>Candidates</dt>
                            <dd>{avatarDebugSnapshot.candidateCount} total, trying {avatarDebugSnapshot.avatarIndex + 1}</dd>
                        </div>
                    </dl>
                    <div className="avatar-debug-url">
                        <span>Current URL</span>
                        <code>{avatarDebugSnapshot.currentAvatarUrl || 'No current avatar URL'}</code>
                    </div>
                    <div className="avatar-debug-url">
                        <span>Last failure</span>
                        <code>{avatarDebugSnapshot.failures.at(-1)?.failedUrl || 'No failures recorded yet'}</code>
                    </div>
                </aside>
            )}

            {pdfViewer && (
                <PDFViewer
                    documentId={pdfViewer.documentId}
                    fileName={pdfViewer.fileName}
                    fileType={pdfViewer.fileType}
                    versionKey={pdfViewer.versionKey}
                    onClose={() => setPdfViewer(null)}
                />
            )}
        </div>
        </ToastProvider>
    );
}

export default App;
