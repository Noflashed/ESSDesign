import React from 'react';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';
const BACKGROUND_VIDEO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/Background%20image.mp4';

export default function WebLandingPage({ onOpenDirectory }) {
    return (
        <section className="web-landing-page">
            <video
                className="web-landing-backdrop"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-hidden="true"
            >
                <source src={BACKGROUND_VIDEO_URL} type="video/mp4" />
            </video>
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
