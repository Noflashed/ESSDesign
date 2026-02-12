import React, { useState, useEffect } from 'react';
import FolderBrowser from './components/FolderBrowser';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import { authAPI } from './services/api';
import './App.css';

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState('light');
    const [selectedFolderId, setSelectedFolderId] = useState(null);

    useEffect(() => {
        checkAuth();
        loadTheme();
    }, []);

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

    const loadTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'light';
        setTheme(savedTheme);
    };

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
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
                        <span className="logo-icon">📐</span>
                        <span className="logo-text">ESS Design</span>
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
                />
                <main className="app-main">
                    <FolderBrowser 
                        selectedFolderId={selectedFolderId}
                        onFolderChange={handleFolderSelect}
                    />
                </main>
            </div>
        </div>
    );
}

export default App;
