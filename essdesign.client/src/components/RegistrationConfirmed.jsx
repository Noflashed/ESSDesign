import React from 'react';
import AuthThemeToggle from './AuthThemeToggle';
import './Auth.css';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

function RegistrationConfirmed({
    email = '',
    theme,
    onThemeChange,
    isAuthenticated,
    onContinue
}) {
    const handleThemeToggle = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        onThemeChange?.(newTheme);
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <AuthThemeToggle theme={theme} onToggle={handleThemeToggle} />

                <div className="auth-header">
                    <div className="auth-logo">
                        <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="auth-logo-image" />
                    </div>
                    <h2>Account Confirmed</h2>
                    <p>Your email has been verified successfully.</p>
                </div>

                <div className="auth-success-panel">
                    <div className="auth-success-message">
                        {email ? (
                            <>The account for <strong>{email}</strong> has been confirmed. You can now access ESS Design.</>
                        ) : (
                            <>Your account has been confirmed. You can now access ESS Design.</>
                        )}
                    </div>
                    <button type="button" className="auth-button" onClick={onContinue}>
                        {isAuthenticated ? 'Continue to ESS Design' : 'Go To Login'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RegistrationConfirmed;
