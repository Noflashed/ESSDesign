import React from 'react';
import FolderBrowser from './components/FolderBrowser';
import './App.css';

function App() {
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
                    <div className="user-avatar">👤</div>
                </div>
            </header>
            
            <main className="app-main">
                <FolderBrowser />
            </main>
        </div>
    );
}

export default App;
