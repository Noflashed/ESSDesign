import React from 'react';

export default function EmployeePortalPage({ user }) {
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
            </div>
        </div>
    );
}
