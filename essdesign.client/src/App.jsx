import React, { useState, useEffect, useRef, useCallback } from 'react';
import FolderBrowser from './components/FolderBrowser';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import PDFViewer from './components/PDFViewer';
import { authAPI, preferencesAPI, foldersAPI } from './services/api';
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
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [expandedResults, setExpandedResults] = useState(new Set());
    const searchRef = useRef(null);
    const searchTimerRef = useRef(null);

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
                console.error('Search error:', error);
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 300);
    }, []);

    const handleSearchResultClick = (result) => {
        setSearchQuery('');
        setShowSearchResults(false);
        setExpandedResults(new Set());
        handleFolderSelect(result.id);
    };

    const toggleResultExpand = (resultId, e) => {
        e.stopPropagation();
        setExpandedResults(prev => {
            const next = new Set(prev);
            if (next.has(resultId)) next.delete(resultId);
            else next.add(resultId);
            return next;
        });
    };

    const handleSearchViewPDF = (doc, type) => {
        const fileName = type === 'ess' ? doc.essDesignIssueName : doc.thirdPartyDesignName;
        setPdfViewer({
            documentId: doc.id,
            fileName: fileName || 'document.pdf',
            fileType: type
        });
        setSearchQuery('');
        setShowSearchResults(false);
        setExpandedResults(new Set());
    };

    // Close search results when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSearchResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                            <button className="search-clear" onClick={() => { setSearchQuery(''); setShowSearchResults(false); setSearchResults([]); }}>
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
                                        <div className="search-result-header" onClick={() => handleSearchResultClick(result)}>
                                            <span className="search-result-icon">📁</span>
                                            <div className="search-result-info">
                                                <div className="search-result-name">{result.name}</div>
                                                {result.path && <div className="search-result-path">{result.path}</div>}
                                            </div>
                                            {result.documents && result.documents.length > 0 && (
                                                <button
                                                    className="search-result-expand"
                                                    onClick={(e) => toggleResultExpand(result.id, e)}
                                                    title="Show documents"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                                        style={{ transform: expandedResults.has(result.id) ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                                        <polyline points="6 9 12 15 18 9"></polyline>
                                                    </svg>
                                                    <span className="search-doc-count">{result.documents.length}</span>
                                                </button>
                                            )}
                                        </div>
                                        {expandedResults.has(result.id) && result.documents && result.documents.length > 0 && (
                                            <div className="search-result-documents">
                                                {result.documents.map(doc => (
                                                    <div key={doc.id} className="search-doc-item">
                                                        <span className="search-doc-icon">📄</span>
                                                        <span className="search-doc-name">Rev {doc.revisionNumber}</span>
                                                        <div className="search-doc-actions">
                                                            {doc.essDesignIssuePath && (
                                                                <button className="search-doc-btn" onClick={() => handleSearchViewPDF(doc, 'ess')}>
                                                                    ESS Design
                                                                </button>
                                                            )}
                                                            {doc.thirdPartyDesignPath && (
                                                                <button className="search-doc-btn" onClick={() => handleSearchViewPDF(doc, 'thirdparty')}>
                                                                    Third-Party
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
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
