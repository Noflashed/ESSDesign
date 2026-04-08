import React from 'react';
import AuthThemeToggle from './AuthThemeToggle';
import './Auth.css';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

function RegistrationSuccess({ email = '', theme, onThemeChange, onContinueToLogin }) {
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
                    <h2>Check Your Email</h2>
                    <p>Your registration was successful.</p>
                </div>

                <div className="auth-success-panel">
                    <div className="auth-success-message">
                        {email ? (
                            <>Your account has been created for <strong>{email}</strong>. We&apos;ve sent a confirmation email. Open that link to activate your account, then sign in.</>
                        ) : (
                            <>Your account has been created successfully. We&apos;ve sent a confirmation email. Open that link to activate your account, then sign in.</>
                        )}
                    </div>
                    <button type="button" className="auth-button" onClick={onContinueToLogin}>
                        Go To Login
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RegistrationSuccess;
