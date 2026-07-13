import React from 'react';
import AdminAssistantChat from './AdminAssistantChat';

export default function EmployeePortalPage({
    user,
    userAvatarUrl = '',
    userInitials = 'U',
    userDisplayName = 'User',
    onUserAvatarError,
}) {
    const displayName = user?.employeeFirstName || user?.employeeLastName
        ? `${user?.employeeFirstName || ''} ${user?.employeeLastName || ''}`.trim()
        : user?.fullName || user?.email || 'Employee';

    return (
        <div className="module-page">
            <div className="employee-portal-shell">
                <div className="employee-portal-card">
                    <div className="employee-portal-eyebrow">ESS App</div>
                    <h2>{displayName}</h2>
                    <div className="employee-portal-role">{user?.employeeTitle || 'General Scaffolder'}</div>
                    <div className="employee-portal-grid">
                        <div className="employee-portal-field">
                            <span className="employee-portal-label">Email</span>
                            <strong>{user?.email || 'Not available'}</strong>
                        </div>
                        <div className="employee-portal-field">
                            <span className="employee-portal-label">Phone</span>
                            <strong>{user?.employeePhoneNumber || 'Not provided'}</strong>
                        </div>
                        <div className="employee-portal-field">
                            <span className="employee-portal-label">First Name</span>
                            <strong>{user?.employeeFirstName || 'Not provided'}</strong>
                        </div>
                        <div className="employee-portal-field">
                            <span className="employee-portal-label">Last Name</span>
                            <strong>{user?.employeeLastName || 'Not provided'}</strong>
                        </div>
                    </div>
                </div>
                <div className="employee-portal-assistant">
                    <AdminAssistantChat
                        userId={user?.id || ''}
                        userAvatarUrl={userAvatarUrl}
                        userInitials={userInitials}
                        userDisplayName={userDisplayName}
                        onUserAvatarError={onUserAvatarError}
                        pageContext={{ page: 'employee-home' }}
                    />
                </div>
            </div>
        </div>
    );
}
