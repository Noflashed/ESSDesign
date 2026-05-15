import React, { useEffect, useState } from 'react';
import { essNewsAPI } from '../services/api';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

export default function WebLandingPage({ onOpenDirectory }) {
    const [backdropUrl, setBackdropUrl] = useState(null);

    useEffect(() => {
        essNewsAPI.getAll()
            .then(items => {
                const imageItems = items.filter(item => item.mediaType === 'image' && item.mediaUrl);
                if (imageItems.length === 0) return;
                const pick = imageItems[Math.floor(Math.random() * imageItems.length)];
                setBackdropUrl(pick.mediaUrl);
            })
            .catch(() => { /* fall back to gradient background */ });
    }, []);

    return (
        <section className="web-landing-page">
            {backdropUrl && (
                <img
                    src={backdropUrl}
                    className="web-landing-backdrop"
                    aria-hidden="true"
                    alt=""
                />
            )}
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
