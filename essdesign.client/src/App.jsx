import React, { useState, useEffect, useRef, useCallback } from 'react';
import FolderBrowser from './components/FolderBrowser';
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
import WebLandingPage from './components/WebLandingPage';
import SettingsPage from './components/SettingsPage';
import ESSNewsPage from './components/ESSNewsPage';
import TransportSuitePage from './components/TransportSuitePage';
import { ToastProvider } from './components/Toast';
import { authAPI, preferencesAPI, foldersAPI } from './services/api';
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

const SidebarToggleIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
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

function DesktopWindowControls({ className = '' }) {
    const controls = typeof window !== 'undefined' ? window.essDesktop?.windowControls : null;
    if (!controls) {
        return null;
    }

    const classes = ['ess-desktop-window-controls', className].filter(Boolean).join(' ');

    return (
        <div className={classes} aria-label="Window controls">
            <button
                type="button"
                className="ess-desktop-window-btn"
                onClick={() => controls.minimize()}
                aria-label="Minimize window"
                title="Minimize"
                data-action="minimize"
            >
                <span className="ess-desktop-window-icon ess-desktop-window-icon-minimize" aria-hidden="true" />
            </button>
            <button
                type="button"
                className="ess-desktop-window-btn"
                onClick={() => controls.toggleMaximize()}
                aria-label="Maximize window"
                title="Maximize"
                data-action="maximize"
            >
                <span className="ess-desktop-window-icon ess-desktop-window-icon-maximize" aria-hidden="true" />
            </button>
            <button
                type="button"
                className="ess-desktop-window-btn"
                onClick={() => controls.close()}
                aria-label="Close window"
                title="Close"
                data-action="close"
            >
                <span className="ess-desktop-window-icon ess-desktop-window-icon-close" aria-hidden="true">
                    <span className="ess-desktop-window-icon-close-line" />
                    <span className="ess-desktop-window-icon-close-line" />
                </span>
            </button>
        </div>
    );
}

const NAV_PAGE_ICONS = {
    'employee-home': HomeNavIcon,
    'design': DesignNavIcon,
    'site-information': MapNavIcon,
    'safety': ShieldNavIcon,
    'material-ordering': BoxNavIcon,
    'rostering': CalendarNavIcon,
    'employees': UsersNavIcon,
    'ess-news': NewsNavIcon,
};

function NavPageIcon({ pageKey, size = 18 }) {
    const Icon = NAV_PAGE_ICONS[pageKey] || DesignNavIcon;
    return <Icon size={size} />;
}

const TRANSPORT_PAGE_KEYS = new Set(['transport-dashboard', 'transport-drivers', 'material-ordering', 'material-ordering-new', 'material-ordering-active', 'material-ordering-archived', 'truck-schedule', 'truck-delivery-schedule', 'truck-tracking']);
const DESIGN_PAGE_KEYS = new Set(['landing', 'employee-home', 'settings', 'site-information', 'safety', 'safety-scaff-tags', 'safety-swms', 'transport-dashboard', 'transport-drivers', 'material-ordering', 'material-ordering-new', 'material-ordering-active', 'material-ordering-archived', 'truck-schedule', 'truck-delivery-schedule', 'truck-tracking', 'rostering', 'rostering-tree', 'employees', 'employee-relationships', 'design', 'ess-news']);

function isPageActive(itemKey, currentPage) {
    if (itemKey === 'safety') return currentPage === 'safety' || currentPage === 'safety-scaff-tags' || currentPage === 'safety-swms';
    if (itemKey === 'rostering') return currentPage === 'rostering' || currentPage === 'rostering-tree';
    if (itemKey === 'employees') return currentPage === 'employees' || currentPage === 'employee-relationships';
    if (itemKey === 'truck-schedule') return currentPage === 'transport-dashboard' || currentPage === 'transport-drivers' || currentPage === 'truck-schedule' || currentPage === 'truck-delivery-schedule' || currentPage === 'truck-tracking' || currentPage === 'material-ordering' || currentPage === 'material-ordering-new' || currentPage === 'material-ordering-active' || currentPage === 'material-ordering-archived';
    if (itemKey === 'material-ordering-new') return currentPage === 'material-ordering' || currentPage === 'material-ordering-new';
    return currentPage === itemKey;
}

function getRoleDisplayName(role) {
    switch (role) {
        case 'admin': return 'Admin';
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

function NavSidebar({ open, onToggle, navItems, currentPage, onNavigate, onGoSettings }) {
    const [expandedKeys, setExpandedKeys] = useState(() => ({ 'material-ordering': false }));

    const toggleGroup = (key) => {
        setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <aside className={`app-nav-sidebar${open ? '' : ' collapsed'}`}>
            <button
                className="app-nav-sidebar-toggle"
                onClick={onToggle}
                title={open ? 'Collapse sidebar' : 'Expand sidebar'}
                aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
            >
                <SidebarToggleIcon size={18} />
            </button>

            <nav className="app-nav-sidebar-nav">
                {navItems.map(item => {
                    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                    const expanded = expandedKeys[item.key];
                    return (
                        <div key={item.key} className={`app-nav-sidebar-group${isPageActive(item.key, currentPage) ? ' active' : ''}`}>
                            <button
                                className={`app-nav-sidebar-item${isPageActive(item.key, currentPage) ? ' active' : ''}`}
                                onClick={() => onNavigate(item.key)}
                                title={!open ? item.label : undefined}
                            >
                                <span className="app-nav-sidebar-icon"><NavPageIcon pageKey={item.key} size={18} /></span>
                                {open && <span className="app-nav-sidebar-label">{item.label}</span>}
                            </button>
                            {open && hasChildren ? (
                                <button
                                    type="button"
                                    className={`app-nav-sidebar-subtoggle${expanded ? ' open' : ''}`}
                                    onClick={() => toggleGroup(item.key)}
                                    aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                                >
                                    <span className={`app-nav-sidebar-caret${expanded ? ' open' : ''}`}>▾</span>
                                </button>
                            ) : null}
                            {open && hasChildren && expanded ? (
                                <div className="app-nav-sidebar-submenu">
                                    {item.children.map((child) => (
                                        <button
                                            key={child.key}
                                            className={`app-nav-sidebar-subitem${currentPage === child.key ? ' active' : ''}`}
                                            onClick={() => onNavigate(child.key)}
                                        >
                                            <span className="app-nav-sidebar-subdot" />
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
                <div className="app-nav-sidebar-divider" />
                <button
                    className={`app-nav-sidebar-item app-nav-sidebar-settings${currentPage === 'settings' ? ' active' : ''}`}
                    onClick={onGoSettings}
                    title={!open ? 'Settings' : undefined}
                >
                    <span className="app-nav-sidebar-icon"><SettingsIcon size={18} /></span>
                    {open && <span className="app-nav-sidebar-label">Settings</span>}
                </button>
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
                                {doc.thirdPartyDesignPath && (
                                    <button className="search-doc-btn" onClick={(e) => { e.stopPropagation(); onViewPDF(doc, 'thirdparty'); }}>
                                        Third-Party
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function App() {
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteFirstName, setInviteFirstName] = useState('');
    const [inviteLastName, setInviteLastName] = useState('');
    const [inviteEmployeeId, setInviteEmployeeId] = useState('');
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [viewMode, setViewMode] = useState('grid');
    const [showNavDrawer, setShowNavDrawer] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState('');
    const [inviteSuccess, setInviteSuccess] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [pdfViewer, setPdfViewer] = useState(null);
    const [authView, setAuthView] = useState(getAuthViewFromUrl);
    const [theme, setTheme] = useState('light');
    const [currentPage, setCurrentPage] = useState('landing');
    const [safetyContext, setSafetyContext] = useState({ builder: null, project: null });
    const [employeeContext, setEmployeeContext] = useState({ leadingHand: null });
    const [rosteringContext, setRosteringContext] = useState({ planDate: null });
    const [navSidebarOpen, setNavSidebarOpen] = useState(true);
    const [avatarIndex, setAvatarIndex] = useState(0);
    const userMenuRef = useRef(null);
    const searchRef = useRef(null);
    const searchAbortRef = useRef(null);
    const authViewRef = useRef(authView);
    const currentPageRef = useRef(currentPage);
    const isDesktopApp = typeof window !== 'undefined' && Boolean(window.essDesktop?.isDesktop);

    const isTransportPage = TRANSPORT_PAGE_KEYS.has(currentPage);
    const isEmployeePortalRole = ['leading_hand', 'general_scaffolder'].includes(user?.role);
    const isAdmin = user?.role === 'admin';

    const avatarCandidates = [
        user?.avatarUrl,
        user?.avatar_url,
        user?.picture,
        user?.profileImageUrl,
        user?.profile_image_url,
        user?.avatarPath ? `${SUPABASE_BASE_URL}/storage/v1/object/public/avatars/${String(user.avatarPath).replace(/^\/+/, '')}` : null,
        user?.avatar_path ? `${SUPABASE_BASE_URL}/storage/v1/object/public/avatars/${String(user.avatar_path).replace(/^\/+/, '')}` : null,
    ].filter(Boolean);

    useEffect(() => {
        authViewRef.current = authView;
    }, [authView]);

    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = theme;
    }, [theme]);

    useEffect(() => {
        let active = true;

        const initializeTheme = async () => {
            let nextTheme = 'light';

            try {
                const storedTheme = window.localStorage.getItem('essdesign-theme');
                if (storedTheme === 'light' || storedTheme === 'dark') {
                    nextTheme = storedTheme;
                } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    nextTheme = 'dark';
                }
            } catch (error) {
                console.error('Error loading saved theme:', error);
            }

            if (active) {
                setTheme(nextTheme);
            }
        };

        initializeTheme();

        return () => {
            active = false;
        };
    }, []);

    const applyTheme = useCallback(async (nextTheme, persistToServer = true) => {
        setTheme(nextTheme);
        try {
            window.localStorage.setItem('essdesign-theme', nextTheme);
        } catch (error) {
            console.error('Error saving theme preference locally:', error);
        }

        if (persistToServer && isAuthenticated) {
            try {
                await preferencesAPI.updatePreferences({ theme: nextTheme });
            } catch (error) {
                console.error('Error saving theme preference to server:', error);
            }
        }
    }, [isAuthenticated]);

    const toggleTheme = () => {
        applyTheme(theme === 'light' ? 'dark' : 'light', isAuthenticated);
    };

    const loadUserPreferences = useCallback(async () => {
        try {
            const preferences = await preferencesAPI.getPreferences();
            if (preferences?.theme === 'light' || preferences?.theme === 'dark') {
                await applyTheme(preferences.theme, false);
            }
        } catch (error) {
            console.error('Error loading user preferences:', error);
        }
    }, [applyTheme]);

    const applyPageState = useCallback((page, nextSafetyContext = { builder: null, project: null }, nextEmployeeContext = { leadingHand: null }, nextRosteringContext = { planDate: null }) => {
        setCurrentPage(page);
        setSafetyContext(nextSafetyContext);
        setEmployeeContext(nextEmployeeContext);
        setRosteringContext(nextRosteringContext);
        setShowUserMenu(false);
        window.history.pushState({ page, safetyContext: nextSafetyContext, employeeContext: nextEmployeeContext, rosteringContext: nextRosteringContext }, '', window.location.pathname);
    }, []);

    useEffect(() => {
        const handlePopState = (event) => {
            const state = event.state;
            if (state?.page) {
                setCurrentPage(state.page);
                setSafetyContext(state.safetyContext || { builder: null, project: null });
                setEmployeeContext(state.employeeContext || { leadingHand: null });
                setRosteringContext(state.rosteringContext || { planDate: null });
                setShowUserMenu(false);
                return;
            }
            const fallbackPage = currentPageRef.current === 'landing' ? 'landing' : (isEmployeePortalRole ? 'employee-home' : 'landing');
            setCurrentPage(fallbackPage);
            setSafetyContext({ builder: null, project: null });
            setEmployeeContext({ leadingHand: null });
            setRosteringContext({ planDate: null });
            setShowUserMenu(false);
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isEmployeePortalRole]);

    const checkAuth = useCallback(async () => {
        const callbackResult = authAPI.consumeAuthCallbackFromUrl?.();
        const authUrlParams = new URLSearchParams(window.location.search);
        const emailFromUrl = authUrlParams.get('email') || '';

        if (callbackResult?.hasSession) {
            setAuthView('signup-confirmed');
            setInviteEmail(emailFromUrl);
            setInviteFirstName(authUrlParams.get('firstName') || '');
            setInviteLastName(authUrlParams.get('lastName') || '');
            setInviteEmployeeId(authUrlParams.get('employeeId') || '');
        }

        try {
            if (!authAPI.isAuthenticated()) {
                setIsAuthenticated(false);
                setUser(null);
                return;
            }

            let currentUser = authAPI.getCurrentUser();
            setIsAuthenticated(true);

            try {
                currentUser = await authAPI.restoreSession();
            } catch (restoreError) {
                console.error('Error restoring session:', restoreError);
                currentUser = await authAPI.refreshCurrentUser();
            }

            setUser(currentUser);
            const initialPage = ['leading_hand', 'general_scaffolder'].includes(currentUser?.role) ? 'employee-home' : 'landing';
            setCurrentPage(initialPage);
            window.history.replaceState({ page: initialPage, safetyContext: { builder: null, project: null }, employeeContext: { leadingHand: null }, rosteringContext: { planDate: null } }, '', window.location.pathname);
            await loadUserPreferences();
        } catch (error) {
            console.error('Error checking auth:', error);
            setIsAuthenticated(false);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, [loadUserPreferences]);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        const handleUrlChange = () => {
            const nextView = getAuthViewFromUrl();
            setAuthView(nextView);
            if (nextView === 'signup' || nextView === 'signup-success' || nextView === 'signup-confirmed') {
                const params = new URLSearchParams(window.location.search);
                setInviteEmail(params.get('email') || '');
                setInviteFirstName(params.get('firstName') || '');
                setInviteLastName(params.get('lastName') || '');
                setInviteEmployeeId(params.get('employeeId') || '');
            }
        };

        handleUrlChange();
        window.addEventListener('popstate', handleUrlChange);
        return () => window.removeEventListener('popstate', handleUrlChange);
    }, []);

    useEffect(() => {
        const handleDocumentClick = (event) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSearchResults(false);
            }
        };

        document.addEventListener('mousedown', handleDocumentClick);
        return () => document.removeEventListener('mousedown', handleDocumentClick);
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            return undefined;
        }

        if (searchQuery.trim().length < 2) {
            setSearchResults([]);
            setSearchLoading(false);
            setShowSearchResults(false);
            if (searchAbortRef.current) {
                searchAbortRef.current.abort();
                searchAbortRef.current = null;
            }
            return undefined;
        }

        const controller = new AbortController();
        searchAbortRef.current = controller;
        setSearchLoading(true);

        const timer = setTimeout(async () => {
            try {
                const response = await foldersAPI.searchFolders(searchQuery, { signal: controller.signal });
                if (!controller.signal.aborted) {
                    setSearchResults(response?.folders || []);
                    setShowSearchResults(true);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.error('Error searching folders:', error);
                    setSearchResults([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setSearchLoading(false);
                }
            }
        }, 250);

        return () => {
            clearTimeout(timer);
            controller.abort();
            if (searchAbortRef.current === controller) {
                searchAbortRef.current = null;
            }
        };
    }, [searchQuery, isAuthenticated]);

    const handleLoginSuccess = async (response) => {
        const signedInUser = response?.user || authAPI.getCurrentUser();
        setUser(signedInUser);
        setIsAuthenticated(true);
        setShowNavDrawer(false);
        setAuthView('landing');
        window.history.replaceState({}, '', window.location.pathname);
        await loadUserPreferences();
        const initialPage = ['leading_hand', 'general_scaffolder'].includes(signedInUser?.role) ? 'employee-home' : 'landing';
        applyPageState(initialPage, { builder: null, project: null }, { leadingHand: null }, { planDate: null });
    };

    const handleLogout = async () => {
        try {
            await authAPI.signOut();
        } catch (error) {
            console.error('Error logging out:', error);
        } finally {
            setUser(null);
            setIsAuthenticated(false);
            setSelectedFolderId(null);
            setSearchQuery('');
            setSearchResults([]);
            setShowSearchResults(false);
            setShowUserMenu(false);
            setShowInviteModal(false);
            setInviteError('');
            setInviteSuccess('');
            setCurrentPage('landing');
            setSafetyContext({ builder: null, project: null });
            setEmployeeContext({ leadingHand: null });
            setRosteringContext({ planDate: null });
            setAuthView('landing');
            window.history.replaceState({}, '', window.location.pathname);
        }
    };

    const handleSwitchToLogin = () => {
        setAuthView('login-form');
        const url = new URL(window.location.href);
        url.searchParams.set('auth', 'login-form');
        window.history.pushState({}, '', url.toString());
    };

    const handleSignUpSuccess = (email) => {
        setInviteEmail(email);
        setAuthView('signup-success');
        const url = new URL(window.location.href);
        url.searchParams.set('auth', 'signup-success');
        if (email) {
            url.searchParams.set('email', email);
        }
        window.history.pushState({}, '', url.toString());
    };

    const handleConfirmationContinue = () => {
        handleSwitchToLogin();
    };

    const handleFolderSelect = (folderId) => {
        setSelectedFolderId(folderId);
    };

    const handleViewModeChange = (mode) => {
        setViewMode(mode);
    };

    const triggerRefresh = () => {
        setRefreshKey(current => current + 1);
    };

    const handleSearch = (value) => {
        setSearchQuery(value);
    };

    const closeSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
        setShowSearchResults(false);
        setSearchLoading(false);
    };

    const handleSearchNavigate = (folderId) => {
        setSelectedFolderId(folderId);
        closeSearch();
    };

    const openInviteModal = () => {
        setShowInviteModal(true);
        setInviteEmail('');
        setInviteError('');
        setInviteSuccess('');
    };

    const closeInviteModal = () => {
        setShowInviteModal(false);
        setInviteLoading(false);
        setInviteError('');
        setInviteSuccess('');
    };

    const handleInviteUser = async (event) => {
        event.preventDefault();
        setInviteError('');
        setInviteSuccess('');

        if (!inviteEmail.trim()) {
            setInviteError('Please enter an email address.');
            return;
        }

        setInviteLoading(true);
        try {
            await authAPI.inviteUser(inviteEmail.trim());
            setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`);
            setInviteEmail('');
        } catch (error) {
            console.error('Error inviting user:', error);
            setInviteError(error?.response?.data?.message || 'Unable to send invite right now.');
        } finally {
            setInviteLoading(false);
        }
    };

    const allowedNavItems = (() => {
        const shared = [
            { key: 'design', label: 'Design' },
            { key: 'site-information', label: 'Site Information' },
            {
                key: 'safety',
                label: 'Safety',
                children: [
                    { key: 'safety-scaff-tags', label: 'Scaff Tags' },
                    { key: 'safety-swms', label: 'SWMS' },
                ],
            },
            { key: 'rostering', label: 'Rostering', children: [{ key: 'rostering-tree', label: 'Rostering Tree' }] },
            { key: 'employees', label: 'Employees', children: [{ key: 'employee-relationships', label: 'Leading Hands' }] },
        ];

        if (user?.role === 'transport_management') {
            return [
                { key: 'transport-dashboard', label: 'Transport Dashboard' },
                { key: 'truck-schedule', label: 'Truck Schedule' },
                { key: 'truck-delivery-schedule', label: 'Delivery Schedule' },
                { key: 'material-ordering-new', label: 'Material Ordering' },
            ];
        }

        if (['truck_ess01', 'truck_ess02', 'truck_ess03'].includes(user?.role)) {
            return [
                { key: 'transport-dashboard', label: 'Transport Dashboard' },
                { key: 'truck-schedule', label: 'Truck Schedule' },
                { key: 'truck-delivery-schedule', label: 'Delivery Schedule' },
            ];
        }

        return isAdmin
            ? [...shared, { key: 'ess-news', label: 'ESS News' }]
            : shared;
    })();

    const showHeaderSearch = isAuthenticated && !DESIGN_PAGE_KEYS.has(currentPage);
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
            return <WebLandingPage onOpenDirectory={() => setNavSidebarOpen(true)} />;
        }

        if (currentPage === 'employee-home' && isEmployeePortalRole) {
            return <EmployeePortalPage user={user} />;
        }

        if (currentPage === 'settings') {
            return (
                <SettingsPage
                    user={user}
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
        if (currentPage === 'transport-dashboard' || currentPage === 'transport-drivers' || currentPage === 'material-ordering' || currentPage === 'material-ordering-new' || currentPage === 'material-ordering-active' || currentPage === 'material-ordering-archived' || currentPage === 'truck-schedule' || currentPage === 'truck-delivery-schedule' || currentPage === 'truck-tracking') {
            return <TransportSuitePage user={user} currentPage={currentPage} onNavigate={(page) => applyPageState(page, { builder: null, project: null }, { leadingHand: null }, { planDate: null })} onExit={() => applyPageState(isEmployeePortalRole ? 'employee-home' : 'landing', { builder: null, project: null }, { leadingHand: null }, { planDate: null })} />;
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

        return (
            <div className="module-page">
                <FolderBrowser
                    selectedFolderId={selectedFolderId}
                    onFolderChange={handleFolderSelect}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    onRefreshNeeded={triggerRefresh}
                    canManage={isAdmin}
                />
            </div>
        );
    };

    if (loading) {
        return (
            <div className="loading-screen">
                {isDesktopApp ? <DesktopWindowControls className="ess-desktop-window-controls-overlay" /> : null}
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
                <header className={`app-header${isDesktopApp ? ' ess-desktop-header-has-controls' : ''}`}>
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
                    {isDesktopApp ? <DesktopWindowControls className="ess-desktop-window-controls-header" /> : null}
                </header>
                <WebLandingPage onOpenDirectory={() => setShowNavDrawer(true)} />
            </div>
        );
    }

    return (
        <ToastProvider>
            <div className="App">
            {!isTransportPage ? (
            <header className={`app-header${isDesktopApp ? ' ess-desktop-header-has-controls' : ''}`}>
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
                                applyPageState('settings', { builder: null, project: null }, { leadingHand: null }, { planDate: null });
                            }}
                            title="Open settings"
                            aria-label="Open settings"
                        >
                            <SettingsIcon size={18} />
                        </button>
                    )}
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
                {isDesktopApp ? <DesktopWindowControls className="ess-desktop-window-controls-header" /> : null}
            </header>
            ) : null}

            {DESIGN_PAGE_KEYS.has(currentPage) ? (
                isTransportPage ? (
                    <div className={`transport-page-frame transport-page-frame-full${isDesktopApp ? ' transport-page-frame-desktop' : ''}`}>
                        {isDesktopApp ? (
                            <div className="transport-desktop-titlebar">
                                <DesktopWindowControls className="ess-desktop-window-controls-transport" />
                            </div>
                        ) : null}
                        {renderCurrentPage()}
                    </div>
                ) : (
                    <div className="app-content-wrapper">
                        <NavSidebar
                            open={navSidebarOpen}
                            onToggle={() => setNavSidebarOpen(prev => !prev)}
                            navItems={allowedNavItems}
                            currentPage={currentPage}
                            onNavigate={(page) => {
                                applyPageState(page, { builder: null, project: null }, { leadingHand: null });
                            }}
                            onGoSettings={() => {
                                setShowUserMenu(false);
                                applyPageState('settings', { builder: null, project: null }, { leadingHand: null }, { planDate: null });
                            }}
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
