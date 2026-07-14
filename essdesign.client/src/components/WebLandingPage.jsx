import React, { useEffect, useState } from 'react';
import { essNewsAPI } from '../services/api';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';
const LANDING_BACKDROP_CACHE_KEY = 'ess-landing-backdrop-url';

function optimizedBackdropUrl(url) {
    if (!url || !url.includes('/storage/v1/object/public/')) {
        return url || null;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}${separator}width=1920&quality=78`;
}

function readCachedBackdropUrl() {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        return optimizedBackdropUrl(window.localStorage.getItem(LANDING_BACKDROP_CACHE_KEY));
    } catch {
        return null;
    }
}

function cacheBackdropUrl(url) {
    if (typeof window === 'undefined' || !url) {
        return;
    }
    try {
        window.localStorage.setItem(LANDING_BACKDROP_CACHE_KEY, url);
    } catch {
        // Ignore storage failures; the image still loads for this visit.
    }
}

export default function WebLandingPage() {
    const [backdropUrl, setBackdropUrl] = useState(() => readCachedBackdropUrl());

    useEffect(() => {
        essNewsAPI.getAll()
            .then(items => {
                const imageItems = items.filter(item => item.mediaType === 'image' && item.mediaUrl);
                if (imageItems.length === 0) return;
                const pick = imageItems[Math.floor(Math.random() * imageItems.length)];
                const optimizedUrl = optimizedBackdropUrl(pick.mediaUrl);
                setBackdropUrl(optimizedUrl);
                cacheBackdropUrl(optimizedUrl);
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
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                />
            )}
            <div className="web-landing-overlay" aria-hidden="true" />
            <div className="web-landing-grid" aria-hidden="true" />

            <div className="web-landing-content">
                <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="web-landing-logo" loading="eager" decoding="async" fetchPriority="high" />
            </div>
        </section>
    );
}
