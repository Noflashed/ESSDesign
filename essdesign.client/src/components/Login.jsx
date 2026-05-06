import React, { useState } from 'react';
import { authAPI } from '../services/api';
import './Auth.css';

const LOGIN_IMAGE_URL = '/login-scaffold.png';

function Login({ onLoginSuccess, onSwitchToSignUp }) {
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

    const handleSignUpClick = () => {
        onSwitchToSignUp?.(formData.email);
    };

    return (
        <div className="auth-container login-auth-container">
            <div className="auth-card login-auth-shell">
                <section className="login-auth-left">
                    <div className="login-auth-brand" aria-label="Brand">
                        <span className="login-auth-brand-mark" aria-hidden="true" />
                        <span>Brand</span>
                    </div>

                    <div className="login-auth-panel">
                        <div className="auth-header login-auth-header">
                            <h2>Login to your account</h2>
                            <p>Enter your email below to login to your account</p>
                        </div>

                        <form onSubmit={handleSubmit} className="auth-form login-auth-form">
                            <div className="form-field login-auth-field">
                                <label>Email</label>
                                <input
                                    type="text"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="email@example.com"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="form-field login-auth-field">
                                <div className="login-auth-label-row">
                                    <label>Password</label>
                                    <button type="button" className="login-auth-text-link">
                                        Forgot your password?
                                    </button>
                                </div>
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            {error && <div className="error-message login-auth-error">{error}</div>}

                            <button type="submit" className="auth-button login-auth-submit" disabled={loading}>
                                {loading ? 'Signing in...' : 'Login'}
                            </button>
                        </form>

                        <div className="login-auth-footer">
                            <span>Don&apos;t have an account?</span>
                            <button type="button" className="login-auth-text-link" onClick={handleSignUpClick}>
                                Sign up
                            </button>
                        </div>
                    </div>
                </section>

                <section className="login-auth-visual" aria-label="Scaffold project image">
                    <img src={LOGIN_IMAGE_URL} alt="Scaffold structure" />
                </section>
            </div>
        </div>
    );
}

export default Login;
