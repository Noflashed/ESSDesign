import React, { useEffect, useRef, useState } from 'react';
import AuthShell from './AuthShell';
import { authAPI } from '../services/api';

export default function PasswordRecovery({ reset = false }) {
    // Keep recovery credentials separate from the normal app session and persistent storage.
    const recoveryAccessToken = useRef(null);
    const [tokenHash] = useState(() => {
        const token = new URLSearchParams(window.location.hash.slice(1)).get('token_hash') || '';
        return token;
    });
    useEffect(() => {
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }, []);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const invalid = reset && !tokenHash;

    async function submit(event) {
        event.preventDefault();
        if (busy) return;
        setError('');
        if (reset && password !== confirmation) {
            setError('Your passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            if (reset) {
                if (!recoveryAccessToken.current) {
                    const session = await authAPI.verifyPasswordRecovery(tokenHash);
                    if (!session.accessToken) throw new Error('Missing recovery session');
                    recoveryAccessToken.current = session.accessToken;
                }
                await authAPI.resetPassword(recoveryAccessToken.current, password);
                recoveryAccessToken.current = null;
            }
            else await authAPI.forgotPassword(email.trim());
            setPassword('');
            setConfirmation('');
            setDone(true);
        } catch (err) {
            setError(err.response?.status === 429
                ? 'Too many attempts. Please wait a minute and try again.'
                : err.response?.data?.error || 'Unable to continue. Please try again.');
        } finally { setBusy(false); }
    }

    return <AuthShell eyebrow="Account recovery" size="compact"
        title={done ? (reset ? 'Password updated' : 'Check your inbox') : (reset ? 'Choose a new password' : 'Forgot your password?')}
        description={done ? (reset ? 'Your password has been changed. Sign in to continue.' : 'If an account exists for that email, a password reset link will arrive shortly. Check your spam folder too.') : (reset ? 'Use at least 8 characters and choose a password you have not used before.' : 'Enter your work email and we’ll send you a link to reset your password.')}
        footer={<>Device accounts: contact your ESS Design administrator for help.</>}>
        {invalid && !done && <div className="auth-alert auth-alert-error" role="alert">This reset link is missing or no longer available. Request a new link to continue.</div>}
        {!done && !invalid && <form className="auth-form" onSubmit={submit}>
            {reset ? <>
                <div className="auth-field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></div>
                <div className="auth-field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></div>
            </> : <div className="auth-field"><label htmlFor="recovery-email">Work email</label><input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@erectsafe.com.au" disabled={busy} /></div>}
            {error && <div className="auth-alert auth-alert-error" role="alert">{error}</div>}
            <button className="auth-primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : reset ? 'Update password' : 'Send reset link'}</button>
        </form>}
        <div className="auth-recovery-links">
            <a href="/?auth=login-form">Back to sign in</a>
            {(reset || done) && <a href="/?auth=forgot-password">Request a new reset link</a>}
        </div>
    </AuthShell>;
}
