import React from 'react';
import AuthShell from './AuthShell';
import './Auth.css';

function RegistrationConfirmed({
    email = '',
    isAuthenticated,
    onContinue
}) {
    return (
        <AuthShell
            eyebrow="Verification complete"
            title="Your account is ready"
            description="Your email and employee access have been verified successfully."
            size="compact"
        >
            <div className="auth-status-card auth-status-success">
                <span className="auth-status-icon" aria-hidden="true">✓</span>
                <h3>Welcome to ESS Design</h3>
                <p>
                    {email ? <>The account for <strong>{email}</strong> is active.</> : <>Your account is active.</>}
                    {' '}Your assigned access will be available when you continue.
                </p>
            </div>
            <button type="button" className="auth-primary-button" onClick={onContinue}>
                {isAuthenticated ? 'Continue to ESS Design' : 'Go to sign in'}
            </button>
        </AuthShell>
    );
}

export default RegistrationConfirmed;
