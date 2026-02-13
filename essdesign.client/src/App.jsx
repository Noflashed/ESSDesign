import React, { useState, useEffect } from 'react';
import FolderBrowser from './components/FolderBrowser';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import PDFViewer from './components/PDFViewer';
import { authAPI, preferencesAPI } from './services/api';
import './App.css';

// ✅ FIXED: Load logo from Supabase Storage
// Replace YOUR_PROJECT with your actual Supabase project ID
const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
    const [selectedFolderId, setSelectedFolderId] = useState(() => {
        const saved = localStorage.getItem('selectedFolderId');
        return saved && saved !== 'null' ? saved : null;
    });
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarWidth');
        return saved ? parseInt(saved) : 280;
    });
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'grid');
    const [pdfViewer, setPdfViewer] = useState(null);
    const [preferencesLoaded, setPreferencesLoaded] = useState(false);

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

    const checkAuth = () => {
        const authenticated = authAPI.isAuthenticated();
        const currentUser = authAPI.getCurrentUser();
        setIsAuthenticated(authenticated);
        setUser(currentUser);
        setLoading(false);
    };

    const loadPreferences = async () => {
        try {
            const prefs = await preferencesAPI.getPreferences();

            // Update state from backend
            if (prefs.selectedFolderId !== undefined) {
                setSelectedFolderId(prefs.selectedFolderId);
                localStorage.setItem('selectedFolderId', prefs.selectedFolderId || '');
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

    const savePreferencesToBackend = async (updates) => {
        try {
            await preferencesAPI.updatePreferences(updates);
        } catch (error) {
            console.error('Error saving preferences:', error);
        }
    };

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        savePreferencesToBackend({ theme: newTheme });
    };

    const handleLoginSuccess = () => {
        checkAuth();
    };

    const handleLogout = async () => {
        try {
            await authAPI.signOut();
            setIsAuthenticated(false);
            setUser(null);
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const handleFolderSelect = (folderId) => {
        setSelectedFolderId(folderId);

        // Save to localStorage
        if (folderId === null) {
            localStorage.removeItem('selectedFolderId');
        } else {
            localStorage.setItem('selectedFolderId', folderId);
        }

        // Save to backend
        savePreferencesToBackend({ selectedFolderId: folderId });
    };

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

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login onLoginSuccess={handleLoginSuccess} />;
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
                    <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
                        {theme === 'light' ? '🌙' : '☀️'}
                    </button>
                    <div className="user-menu">
                        <span className="user-name">{user?.fullName || user?.email}</span>
                        <button className="logout-button" onClick={handleLogout}>
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <div className="app-body">
                <Sidebar
                    onFolderSelect={handleFolderSelect}
                    currentFolderId={selectedFolderId}
                    width={sidebarWidth}
                    onResize={handleSidebarResize}
                    onDocumentClick={handleDocumentClick}
                />
                <main className="app-main">
                    <FolderBrowser
                        selectedFolderId={selectedFolderId}
                        onFolderChange={handleFolderSelect}
                        viewMode={viewMode}
                        onViewModeChange={handleViewModeChange}
                    />
                </main>
            </div>

            {pdfViewer && (
                <PDFViewer
                    documentId={pdfViewer.documentId}
                    fileName={pdfViewer.fileName}
                    fileType={pdfViewer.fileType}
                    onClose={() => setPdfViewer(null)}
                />
            )}
        </div>
    );
}

export default App;
