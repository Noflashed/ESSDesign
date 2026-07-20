import React from 'react';
import AuthShell from './AuthShell';
import './Auth.css';

function RegistrationSuccess({ email = '', onContinueToLogin }) {
    return (
        <AuthShell
            eyebrow="Profile submitted"
            title="Check your inbox"
            description="Your employee profile is saved. One final step is required to activate access."
            size="compact"
        >
            <div className="auth-status-card">
                <span className="auth-status-icon" aria-hidden="true">✉</span>
                <h3>Confirmation email sent</h3>
                <p>
                    Open the secure link sent to {email ? <strong>{email}</strong> : 'your email address'}.
                    The link will verify your identity and activate your ESS Design account.
                </p>
                <ol className="auth-next-steps">
                    <li><span>1</span> Open the email from ESS Design</li>
                    <li><span>2</span> Select “Confirm account”</li>
                    <li><span>3</span> Return here and sign in</li>
                </ol>
            </div>
            <button type="button" className="auth-primary-button" onClick={onContinueToLogin}>Return to sign in</button>
        </AuthShell>
    );
}

export default RegistrationSuccess;
