import React, { useMemo, useState } from 'react';

export default function SettingsPage({ user, isAdmin, onOpenRoleSettings, onOpenInviteUser, onToggleTheme, theme }) {
    const [activeTab, setActiveTab] = useState('general');
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
    const tabs = useMemo(() => ([
        {
            key: 'general',
            label: 'General settings',
            description: 'Theme, account, and workspace basics'
        },
        {
            key: 'roles',
            label: 'User role settings',
            description: 'Manage invites and access permissions'
        }
    ]), []);

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
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                className={`settings-nav-card ${activeTab === tab.key ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                <div className="settings-nav-title">{tab.label}</div>
                                <div className="settings-nav-copy">{tab.description}</div>
                            </button>
                        ))}
                    </aside>

                    <div className="settings-section-stack">
                        {activeTab === 'general' ? (
                            <>
                                <section className="settings-section-card">
                                    <div className="settings-section-head">
                                        <div>
                                            <div className="settings-panel-eyebrow">General settings</div>
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
                            </>
                        ) : (
                            <section className="settings-section-card settings-admin-section">
                                <div className="settings-section-head">
                                    <div>
                                        <div className="settings-panel-eyebrow">User role settings</div>
                                        <h2>Access management</h2>
                                    </div>
                                </div>
                                {isAdmin ? (
                                    <>
                                        <p className="settings-panel-copy">Invite people into ESS Design and manage Admin, Viewer, Scaffolder, or Leading Hand permissions.</p>
                                        <div className="settings-admin-actions">
                                            <button type="button" className="module-secondary-btn" onClick={onOpenInviteUser}>
                                                Invite User
                                            </button>
                                            <button type="button" className="module-primary-btn" onClick={onOpenRoleSettings}>
                                                Manage Roles
                                            </button>
                                        </div>
                                        <div className="settings-role-summary-grid">
                                            <div className="settings-role-summary-card">
                                                <span>Admin</span>
                                                <strong>Full workspace control</strong>
                                            </div>
                                            <div className="settings-role-summary-card">
                                                <span>Viewer</span>
                                                <strong>Standard office access</strong>
                                            </div>
                                            <div className="settings-role-summary-card">
                                                <span>Scaffolder</span>
                                                <strong>ESS App employee access</strong>
                                            </div>
                                            <div className="settings-role-summary-card">
                                                <span>Leading Hand</span>
                                                <strong>Field lead employee access</strong>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="settings-readonly-message">
                                        <strong>Admin access required</strong>
                                        <p>Your account can view current role information, but only admins can invite users or change access.</p>
                                    </div>
                                )}
                                <div className="settings-detail-list">
                                    <div className="settings-detail-row">
                                        <span>Your current role</span>
                                        <strong>{displayRole}</strong>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
