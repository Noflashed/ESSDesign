import React from 'react';
import './Auth.css';

const LOGO_URL = '/logo.png';
const AUTH_IMAGE_URL = '/login-scaffold.png';

function AuthShell({ eyebrow, title, description, children, footer, size = 'standard' }) {
    return (
        <div className="auth-page">
            <aside className="auth-brand-panel" aria-label="ESS Design introduction">
                <img className="auth-brand-image" src={AUTH_IMAGE_URL} alt="Scaffold structure at an ErectSafe project" />
                <div className="auth-brand-shade" />
                <div className="auth-brand-content">
                    <span className="auth-brand-kicker">ESS DESIGN</span>
                    <h1>One workforce.<br />One source of truth.</h1>
                    <p>Employee information, project delivery and safety workflows—connected across ErectSafe.</p>
                    <div className="auth-brand-proof" aria-label="Platform benefits">
                        <span><i aria-hidden="true">✓</i> Secure employee records</span>
                        <span><i aria-hidden="true">✓</i> Role-based access</span>
                        <span><i aria-hidden="true">✓</i> Built for field teams</span>
                    </div>
                </div>
                <span className="auth-brand-caption">ErectSafe Scaffolding</span>
            </aside>

            <main className="auth-main">
                <section className={`auth-workspace auth-workspace-${size}`}>
                    <header className="auth-topbar">
                        <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="auth-wordmark" />
                        <span className="auth-secure-label"><i aria-hidden="true" /> Secure access</span>
                    </header>

                    <div className="auth-heading">
                        {eyebrow ? <span className="auth-eyebrow">{eyebrow}</span> : null}
                        <h2>{title}</h2>
                        {description ? <p>{description}</p> : null}
                    </div>

                    {children}
                    {footer ? <footer className="auth-footer">{footer}</footer> : null}
                </section>
            </main>
        </div>
    );
}

export default AuthShell;
