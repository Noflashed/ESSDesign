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
    const quickStats = [
        { label: 'Theme', value: theme === 'dark' ? 'Dark mode' : 'Light mode' },
        { label: 'Access', value: displayRole },
        { label: 'Account', value: user?.email || 'Not available' }
    ];

    return (
        <div className="module-page">
            <div className="module-shell settings-page-shell">
                <section className="settings-topbar">
                    <div>
                        <div className="settings-page-kicker">Settings</div>
                        <h1>Workspace controls</h1>
                        <p>Adjust appearance, review account details, and manage access without leaving the app.</p>
                    </div>
                    <div className="settings-profile-chip">
                        <div className="settings-profile-chip-label">Signed in as</div>
                        <div className="settings-profile-chip-name">{displayName}</div>
                        <div className="settings-profile-chip-role">{displayRole}</div>
                    </div>
                </section>

                <div className="settings-stats-strip">
                    {quickStats.map((item) => (
                        <div key={item.label} className="settings-stat-card">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                        </div>
                    ))}
                </div>

                <div className="settings-layout-grid">
                    <aside className="settings-nav-rail">
                        <div className="settings-nav-card active">
                            <div className="settings-nav-title">Appearance</div>
                            <div className="settings-nav-copy">Theme and interface feel</div>
                        </div>
                        <div className="settings-nav-card">
                            <div className="settings-nav-title">Profile</div>
                            <div className="settings-nav-copy">Your account details</div>
                        </div>
                        {isAdmin ? (
                            <div className="settings-nav-card">
                                <div className="settings-nav-title">Administration</div>
                                <div className="settings-nav-copy">Invites and role access</div>
                            </div>
                        ) : null}
                    </aside>

                    <div className="settings-section-stack">
                        <section className="settings-section-card">
                            <div className="settings-section-head">
                                <div>
                                    <div className="settings-panel-eyebrow">Appearance</div>
                                    <h2>Theme mode</h2>
                                </div>
                            </div>
                            <p className="settings-panel-copy">Pick the interface mode that suits how you work.</p>
                            <div className="settings-theme-row">
                                <button
                                    type="button"
                                    className={`settings-theme-chip ${theme === 'light' ? 'active' : ''}`}
                                    onClick={() => onToggleTheme('light')}
                                >
                                    <span className="settings-theme-chip-title">Light</span>
                                    <span className="settings-theme-chip-copy">Bright, crisp workspace</span>
                                </button>
                                <button
                                    type="button"
                                    className={`settings-theme-chip ${theme === 'dark' ? 'active' : ''}`}
                                    onClick={() => onToggleTheme('dark')}
                                >
                                    <span className="settings-theme-chip-title">Dark</span>
                                    <span className="settings-theme-chip-copy">Lower-glare late sessions</span>
                                </button>
                            </div>
                        </section>

                        <section className="settings-section-card">
                            <div className="settings-section-head">
                                <div>
                                    <div className="settings-panel-eyebrow">Account</div>
                                    <h2>Profile details</h2>
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

                        {isAdmin ? (
                            <section className="settings-section-card settings-admin-section">
                                <div className="settings-section-head">
                                    <div>
                                        <div className="settings-panel-eyebrow">Administration</div>
                                        <h2>User access</h2>
                                    </div>
                                </div>
                                <p className="settings-panel-copy">Control invites and assign Admin, Viewer, Scaffolder, or Leading Hand permissions.</p>
                                <div className="settings-admin-actions">
                                    <button type="button" className="module-secondary-btn" onClick={onOpenInviteUser}>
                                        Invite User
                                    </button>
                                    <button type="button" className="module-primary-btn" onClick={onOpenRoleSettings}>
                                        Manage Roles
                                    </button>
                                </div>
                            </section>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
