import React, { useEffect, useState } from 'react';
import { essNewsAPI } from '../services/api';
import AdminAssistantChat from './AdminAssistantChat';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';
const LANDING_BACKDROP_CACHE_KEY = 'ess-landing-backdrop-url';

function readCachedBackdropUrl() {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        return window.localStorage.getItem(LANDING_BACKDROP_CACHE_KEY) || null;
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

export default function WebLandingPage({
    showAssistant = false,
    userAvatarUrl = '',
    userInitials = 'U',
    userDisplayName = 'User',
    onUserAvatarError,
}) {
    const [backdropUrl, setBackdropUrl] = useState(() => readCachedBackdropUrl());

    useEffect(() => {
        essNewsAPI.getAll()
            .then(items => {
                const imageItems = items.filter(item => item.mediaType === 'image' && item.mediaUrl);
                if (imageItems.length === 0) return;
                const pick = imageItems[Math.floor(Math.random() * imageItems.length)];
                setBackdropUrl(pick.mediaUrl);
                cacheBackdropUrl(pick.mediaUrl);
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
                {showAssistant ? (
                    <AdminAssistantChat
                        userAvatarUrl={userAvatarUrl}
                        userInitials={userInitials}
                        userDisplayName={userDisplayName}
                        onUserAvatarError={onUserAvatarError}
                    />
                ) : null}
            </div>
        </section>
    );
}
