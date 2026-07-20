import React, { useState } from 'react';
import { authAPI } from '../services/api';
import AuthShell from './AuthShell';
import './Auth.css';

function Login({ onLoginSuccess }) {
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
            await authAPI.signIn(formData.email, formData.password);
            onLoginSuccess();
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid email, device ID, or password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            eyebrow="Welcome back"
            title="Sign in to ESS Design"
            description="Use your work email or assigned device ID to continue."
            size="compact"
            footer={<>Need access? Contact your ESS Design administrator for an invitation.</>}
        >
            <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                    <label htmlFor="login-identifier">Email or device ID</label>
                    <input
                        id="login-identifier"
                        type="text"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="name@erectsafe.com.au"
                        autoComplete="username"
                        required
                        autoFocus
                    />
                </div>

                <div className="auth-field">
                    <div className="auth-label-row">
                        <label htmlFor="login-password">Password</label>
                        <span>Case sensitive</span>
                    </div>
                    <input
                        id="login-password"
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        autoComplete="current-password"
                        required
                    />
                </div>

                {error && <div className="auth-alert auth-alert-error" role="alert">{error}</div>}

                <button type="submit" className="auth-primary-button" disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
        </AuthShell>
    );
}

export default Login;
