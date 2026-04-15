import React, { useEffect, useMemo, useState } from 'react';

export default function SettingsPage({
    user,
    isAdmin,
    onToggleTheme,
    theme,
    managedUsers,
    usersLoading,
    usersError,
    updatingUserId,
    onRoleChange,
    onLoadRoleSettings,
    onOpenInviteUser
}) {
    const [activeTab, setActiveTab] = useState('general');
    const [rolesLoaded, setRolesLoaded] = useState(false);
    const displayName = user?.fullName || user?.email || 'User';
    const displayRole = user?.employeeTitle
        || (user?.role === 'leading_hand'
            ? 'Leading Hand'
            : user?.role === 'general_scaffolder'
                ? 'Scaffolder'
                : user?.role === 'admin'
                    ? 'Admin'
                    : 'Viewer');

    useEffect(() => {
        if (activeTab === 'roles' && isAdmin && !rolesLoaded) {
            onLoadRoleSettings?.();
            setRolesLoaded(true);
        }
    }, [activeTab, isAdmin, onLoadRoleSettings, rolesLoaded]);

    const tabs = useMemo(() => ([
        { key: 'general', label: 'General settings' },
        { key: 'roles', label: 'User role settings' }
    ]), []);

    return (
        <div className="module-page settings-page">
            <div className="settings-layout">
                <aside className="settings-sidebar">
                    <div className="settings-sidebar-title">Settings</div>
                    <div className="settings-sidebar-list">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                className={`settings-sidebar-item ${activeTab === tab.key ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </aside>

                <section className="settings-content">
                    {activeTab === 'general' ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <div className="settings-section-header">
                                <div className="settings-section-kicker">User role settings</div>
                                <h1>Manage user access and permissions</h1>
                                <p>Assign Admin, Viewer, Scaffolder, and Leading Hand access directly from this page.</p>
                            </div>

                            <div className="settings-divider" />

                            {isAdmin ? (
                                <>
                                    <div className="settings-role-toolbar">
                                        <button type="button" className="module-secondary-btn" onClick={onOpenInviteUser}>
                                            Invite User
                                        </button>
                                    </div>

                                    {usersError ? <div className="settings-inline-message error">{usersError}</div> : null}

                                    <div className="settings-role-list">
                                        {usersLoading ? (
                                            <div className="settings-role-empty">Loading users...</div>
                                        ) : managedUsers.length === 0 ? (
                                            <div className="settings-role-empty">No users found.</div>
                                        ) : (
                                            managedUsers.map((managedUser) => (
                                                <div key={managedUser.id} className="settings-role-row">
                                                    <div className="settings-role-user">
                                                        <strong>{managedUser.fullName || managedUser.email}</strong>
                                                        <span>{managedUser.email}</span>
                                                    </div>
                                                    <select
                                                        className="settings-role-select"
                                                        value={managedUser.role || 'viewer'}
                                                        onChange={(e) => onRoleChange(managedUser.id, e.target.value)}
                                                        disabled={updatingUserId === managedUser.id}
                                                    >
                                                        <option value="viewer">Viewer</option>
                                                        <option value="general_scaffolder">Scaffolder</option>
                                                        <option value="leading_hand">Leading Hand</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="settings-inline-message">
                                    Your account can view role information, but only admins can change user permissions.
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
