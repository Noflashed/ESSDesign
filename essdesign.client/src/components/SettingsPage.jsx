import React from 'react';

export default function SettingsPage({ user, onToggleTheme, theme }) {
    const displayName = user?.fullName || user?.email || 'User';
    const displayRole = user?.employeeTitle
        || (user?.role === 'leading_hand' ? 'Leading Hand'
            : user?.role === 'general_scaffolder' ? 'Scaffolder'
            : user?.role === 'site_supervisor' ? 'Site Supervisor'
            : user?.role === 'project_manager' ? 'Project Manager'
            : user?.role === 'transport_management' ? 'Transport Management'
            : user?.role === 'admin' ? 'Admin'
            : 'Viewer');

    return (
        <div className="module-page settings-page">
            <div className="settings-layout">
                <section className="settings-content">
                    <div className="settings-section-header">
                        <div className="settings-section-kicker">General settings</div>
                        <h1>Choose how ESS Design looks and feels</h1>
                        <p>Signed in as {user?.email || 'Not available'}</p>
                    </div>

                    <div className="settings-divider" />

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h2>Appearance</h2>
                            <p>Choose your preferred interface mode.</p>
                        </div>
                        <div className="settings-row-control">
                            <div className="settings-theme-toggle">
                                <button
                                    type="button"
                                    className={`settings-theme-option ${theme === 'light' ? 'active' : ''}`}
                                    onClick={() => onToggleTheme('light')}
                                >
                                    Light
                                </button>
                                <button
                                    type="button"
                                    className={`settings-theme-option ${theme === 'dark' ? 'active' : ''}`}
                                    onClick={() => onToggleTheme('dark')}
                                >
                                    Dark
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="settings-divider" />

                    <div className="settings-row">
                        <div className="settings-row-label">
                            <h2>Account</h2>
                            <p>Your current ESS Design account details.</p>
                        </div>
                        <div className="settings-row-control settings-account-stack">
                            <div className="settings-account-line">
                                <span>Name</span>
                                <strong>{displayName}</strong>
                            </div>
                            <div className="settings-account-line">
                                <span>Email</span>
                                <strong>{user?.email || 'Not available'}</strong>
                            </div>
                            <div className="settings-account-line">
                                <span>Role</span>
                                <strong>{displayRole}</strong>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
