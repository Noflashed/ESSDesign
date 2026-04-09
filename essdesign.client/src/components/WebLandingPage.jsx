import React from 'react';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

export default function WebLandingPage({ onOpenDirectory }) {
    return (
        <section className="web-landing-page">
            <div className="web-landing-backdrop" aria-hidden="true" />
            <div className="web-landing-overlay" aria-hidden="true" />
            <div className="web-landing-grid" aria-hidden="true" />

            <div className="web-landing-content">
                <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="web-landing-logo" />
                <button type="button" className="web-landing-button" onClick={onOpenDirectory}>
                    Open Directory
                </button>
            </div>
        </section>
    );
}
