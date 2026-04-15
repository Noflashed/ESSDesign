import React from 'react';

export default function SettingsPage({ user, isAdmin, onOpenRoleSettings, onOpenInviteUser, onToggleTheme, theme }) {
    const displayName = user?.fullName || user?.email || 'User';
    const displayRole = user?.employeeTitle
        || (user?.role === 'leading_hand'
            ? 'Leading Hand'
            : user?.role === 'general_scaffolder'
                ? 'Scaffolder'
                : user?.role === 'admin'
                    ? 'Admin'
                    : 'Viewer');

    return (
        <div className="module-page">
            <div className="module-shell settings-page-shell">
                <section className="settings-hero-card">
                    <div className="settings-hero-copy">
                        <div className="settings-hero-eyebrow">ESS Design Settings</div>
                        <h1>Workspace settings</h1>
                        <p>Manage account preferences, appearance, and user access from one place.</p>
                    </div>
                    <div className="settings-hero-summary">
                        <div className="settings-summary-label">Signed in as</div>
                        <div className="settings-summary-name">{displayName}</div>
                        <div className="settings-summary-role">{displayRole}</div>
                    </div>
                </section>

                <div className="settings-page-grid">
                    <section className="settings-panel-card">
                        <div className="settings-panel-head">
                            <div>
                                <div className="settings-panel-eyebrow">Appearance</div>
                                <h2>Theme</h2>
                            </div>
                        </div>
                        <p className="settings-panel-copy">Choose the interface mode that feels right for your workflow.</p>
                        <div className="settings-theme-row">
                            <button
                                type="button"
                                className={`settings-theme-chip ${theme === 'light' ? 'active' : ''}`}
                                onClick={() => onToggleTheme('light')}
                            >
                                Light
                            </button>
                            <button
                                type="button"
                                className={`settings-theme-chip ${theme === 'dark' ? 'active' : ''}`}
                                onClick={() => onToggleTheme('dark')}
                            >
                                Dark
                            </button>
                        </div>
                    </section>

                    <section className="settings-panel-card">
                        <div className="settings-panel-head">
                            <div>
                                <div className="settings-panel-eyebrow">Account</div>
                                <h2>Your profile</h2>
                            </div>
                        </div>
                        <div className="settings-detail-list">
                            <div className="settings-detail-row">
                                <span>Name</span>
                                <strong>{displayName}</strong>
                            </div>
                            <div className="settings-detail-row">
                                <span>Email</span>
                                <strong>{user?.email || 'Not available'}</strong>
                            </div>
                            <div className="settings-detail-row">
                                <span>Role</span>
                                <strong>{displayRole}</strong>
                            </div>
                        </div>
                    </section>
                </div>

                {isAdmin ? (
                    <section className="settings-admin-card">
                        <div className="settings-panel-head">
                            <div>
                                <div className="settings-panel-eyebrow">Administration</div>
                                <h2>User access</h2>
                                <p className="settings-panel-copy">Open the role manager to assign Admin, Viewer, Scaffolder, or Leading Hand access.</p>
                            </div>
                            <div className="settings-admin-actions">
                                <button type="button" className="module-secondary-btn" onClick={onOpenInviteUser}>
                                    Invite User
                                </button>
                                <button type="button" className="module-primary-btn" onClick={onOpenRoleSettings}>
                                    Manage Roles
                                </button>
                            </div>
                        </div>
                    </section>
                ) : null}
            </div>
        </div>
    );
}
