import React, { useState } from 'react';
import { authAPI } from '../services/api';
import './Auth.css';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

function SignUp({ onSignUpSuccess, onSwitchToLogin, theme, onThemeChange }) {
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

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

        // Validation
        if (!formData.fullName.trim()) {
            setError('Please enter your full name');
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
            await authAPI.signUp(formData.email, formData.password, formData.fullName);
            onSignUpSuccess();
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
                <button
                    type="button"
                    className="auth-theme-toggle-btn"
                    onClick={handleThemeToggle}
                    title="Toggle theme"
                    aria-label="Toggle theme"
                >
                    {theme === 'light' ? '🌙' : '☀️'}
                </button>

                <div className="auth-header">
                    <div className="auth-logo">
                        <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="auth-logo-image" />
                    </div>
                    <h2>Create Account</h2>
                    <p>Sign up to get started</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-field">
                        <label>Full Name</label>
                        <input
                            type="text"
                            name="fullName"
                            value={formData.fullName}
                            onChange={handleChange}
                            placeholder="John Doe"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-field">
                        <label>Email</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div className="form-field">
                        <label>Password</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="••••••••"
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
                            placeholder="••••••••"
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
