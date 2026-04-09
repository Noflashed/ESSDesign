import React, { useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import AuthThemeToggle from './AuthThemeToggle';
import './Auth.css';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

function SignUp({
    onSignUpSuccess,
    onSwitchToLogin,
    theme,
    onThemeChange,
    initialEmail = '',
    initialFirstName = '',
    initialLastName = '',
    employeeId = ''
}) {
    const [formData, setFormData] = useState({
        firstName: initialFirstName,
        lastName: initialLastName,
        email: initialEmail,
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setFormData((current) => ({
            ...current,
            firstName: initialFirstName || current.firstName,
            lastName: initialLastName || current.lastName,
            email: initialEmail
        }));
    }, [initialEmail, initialFirstName, initialLastName]);

    const isEmployeeInvite = Boolean(employeeId && initialEmail && initialFirstName && initialLastName);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.firstName.trim()) {
            setError('Please enter your first name');
            return;
        }

        if (!formData.lastName.trim()) {
            setError('Please enter your last name');
            return;
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`;
            await authAPI.signUp(formData.email, formData.password, fullName, employeeId || null);
            onSignUpSuccess?.(formData.email);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create account. Please try again.');
        } finally {
            setLoading(false);
        }
    };

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
                    <h2>Create Account</h2>
                    <p>{isEmployeeInvite ? 'Set your password to activate your employee account' : 'Sign up to get started'}</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {isEmployeeInvite ? (
                        <div className="auth-prefilled-panel">
                            <div className="auth-prefilled-row">
                                <span className="auth-prefilled-label">Name</span>
                                <span className="auth-prefilled-value">{formData.firstName} {formData.lastName}</span>
                            </div>
                            <div className="auth-prefilled-row">
                                <span className="auth-prefilled-label">Email</span>
                                <span className="auth-prefilled-value">{formData.email}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="auth-form-row">
                            <div className="form-field">
                                <label>First Name</label>
                                <input
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    placeholder="John"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="form-field">
                                <label>Last Name</label>
                                <input
                                    type="text"
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    placeholder="Doe"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    {!isEmployeeInvite ? (
                        <div className="form-field">
                            <label>Email</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="you@example.com"
                                required
                                autoFocus
                            />
                        </div>
                    ) : null}

                    <div className="form-field">
                        <label>Password</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Create a password"
                            required
                        />
                    </div>

                    <div className="form-field">
                        <label>Confirm Password</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            placeholder="Confirm your password"
                            required
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Creating account...' : 'Sign Up'}
                    </button>
                </form>

                <div className="auth-switch">
                    <span>Already have an account?</span>
                    <button type="button" className="switch-button" onClick={onSwitchToLogin}>
                        Sign In
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SignUp;
