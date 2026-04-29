import React, { useState } from 'react';
import { authAPI } from '../services/api';
import AuthThemeToggle from './AuthThemeToggle';
import './Auth.css';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

function Login({ onLoginSuccess, theme, onThemeChange }) {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
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
        setLoading(true);

        try {
            const session = await authAPI.signIn(formData.email, formData.password);
            onLoginSuccess(session);
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid email, device ID, or password');
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
                    <h2>Welcome Back</h2>
                    <p>Sign in to continue</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-field">
                        <label>Email or Device ID</label>
                        <input
                            type="text"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="you@example.com or ESS01"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-field">
                        <label>Password</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;
