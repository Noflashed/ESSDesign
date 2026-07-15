import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { essNewsAPI } from '../services/api';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';
const MALOO_LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/MALOO%20LOGO.png';
const LEGACY_BACKDROP_CACHE_KEY = 'ess-landing-backdrop-url';
const LANDING_PHOTOS_CACHE_KEY = 'ess-landing-photos-v2';
const LANDING_PHOTOS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SLIDE_DURATION_MS = 8000;
const CROSSFADE_DURATION_MS = 1400;
const MAX_LANDING_PHOTOS = 6;
const imagePreloadCache = new Map();

function preferredImageDimensions() {
    if (typeof window === 'undefined') return { width: 1920, height: 1080 };
    const requestedWidth = window.innerWidth * Math.min(window.devicePixelRatio || 1, 1.5);
    const width = requestedWidth <= 720
        ? 720
        : requestedWidth <= 1280
            ? 1280
            : requestedWidth <= 1600
                ? 1600
                : 1920;
    const landingHeight = Math.max(480, window.innerHeight - 62);
    const height = Math.min(1600, Math.ceil(((landingHeight / window.innerWidth) * width) / 20) * 20);
    return { width, height };
}

function optimizedLandingImageUrl(url, dimensions) {
    if (!url || !url.includes('/storage/v1/object/public/')) {
        return url || null;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}${separator}width=${dimensions.width}&height=${dimensions.height}&resize=cover&quality=72`;
}

function validPhoto(item) {
    return item && typeof item.mediaUrl === 'string' && item.mediaUrl.length > 0;
}

function readCachedLandingPhotos() {
    if (typeof window === 'undefined') {
        return { items: [], cachedAt: 0 };
    }
    try {
        const cached = JSON.parse(window.localStorage.getItem(LANDING_PHOTOS_CACHE_KEY) || 'null');
        const items = Array.isArray(cached?.items) ? cached.items.filter(validPhoto).slice(0, MAX_LANDING_PHOTOS) : [];
        if (items.length > 0) {
            return { items, cachedAt: Number(cached.cachedAt) || 0 };
        }

        const legacyUrl = window.localStorage.getItem(LEGACY_BACKDROP_CACHE_KEY);
        return legacyUrl
            ? { items: [{ id: 'cached-backdrop', title: '', subtitle: '', mediaUrl: legacyUrl }], cachedAt: 0 }
            : { items: [], cachedAt: 0 };
    } catch {
        return { items: [], cachedAt: 0 };
    }
}

function cacheLandingPhotos(items) {
    if (typeof window === 'undefined' || items.length === 0) {
        return;
    }
    try {
        window.localStorage.setItem(LANDING_PHOTOS_CACHE_KEY, JSON.stringify({
            cachedAt: Date.now(),
            items: items.slice(0, MAX_LANDING_PHOTOS)
        }));
    } catch {
        // The browser HTTP cache still protects repeat image requests.
    }
}

function loadImageUrl(url) {
    if (!url) return Promise.resolve(false);
    if (imagePreloadCache.has(url)) return imagePreloadCache.get(url);

    const request = new Promise(resolve => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = url;
    });
    imagePreloadCache.set(url, request);
    return request;
}

async function preloadPhoto(photo) {
    if (!photo) return false;
    if (await loadImageUrl(photo.displayUrl)) return true;
    return photo.displayUrl !== photo.mediaUrl ? loadImageUrl(photo.mediaUrl) : false;
}

function useLandingPointerEffects(pageRef, canvasRef, enabled) {
    useEffect(() => {
        const page = pageRef.current;
        const canvas = canvasRef.current;
        const finePointer = window.matchMedia('(pointer: fine)');
        if (!page || !canvas || !enabled || !finePointer.matches) return undefined;

        const context = canvas.getContext('2d');
        if (!context) return undefined;

        let points = [];
        let drawFrame = 0;
        let pointerFrame = 0;
        let width = 0;
        let height = 0;
        let latestPointer = null;

        const resize = () => {
            const rect = page.getBoundingClientRect();
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
            width = Math.max(1, Math.round(rect.width));
            height = Math.max(1, Math.round(rect.height));
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        };

        const drawTrail = now => {
            context.clearRect(0, 0, width, height);
            points = points.filter(point => now - point.time < 560);

            context.lineCap = 'round';
            context.lineJoin = 'round';
            for (let index = 1; index < points.length; index += 1) {
                const from = points[index - 1];
                const to = points[index];
                const life = Math.max(0, 1 - ((now - to.time) / 560));
                context.beginPath();
                context.moveTo(from.x, from.y);
                context.lineTo(to.x, to.y);
                context.lineWidth = 0.7 + (life * 1.35);
                context.strokeStyle = `rgba(24, 145, 219, ${life * 0.72})`;
                context.stroke();

                if (index % 5 === 0) {
                    const dx = to.x - from.x;
                    const dy = to.y - from.y;
                    const length = Math.hypot(dx, dy) || 1;
                    const tickX = (-dy / length) * 3.5;
                    const tickY = (dx / length) * 3.5;
                    context.beginPath();
                    context.moveTo(to.x - tickX, to.y - tickY);
                    context.lineTo(to.x + tickX, to.y + tickY);
                    context.lineWidth = 0.8;
                    context.strokeStyle = `rgba(255, 255, 255, ${life * 0.62})`;
                    context.stroke();
                }
            }

            drawFrame = points.length > 1 ? window.requestAnimationFrame(drawTrail) : 0;
        };

        const applyPointerPosition = () => {
            pointerFrame = 0;
            if (!latestPointer) return;
            page.style.setProperty('--landing-photo-x', `${latestPointer.normalX * -10}px`);
            page.style.setProperty('--landing-photo-y', `${latestPointer.normalY * -8}px`);
            page.style.setProperty('--landing-content-x', `${latestPointer.normalX * 4}px`);
            page.style.setProperty('--landing-content-y', `${latestPointer.normalY * 3}px`);
        };

        const handlePointerMove = event => {
            if (event.pointerType && event.pointerType !== 'mouse') return;
            const rect = page.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

            latestPointer = {
                normalX: (x / rect.width) * 2 - 1,
                normalY: (y / rect.height) * 2 - 1
            };
            if (!pointerFrame) pointerFrame = window.requestAnimationFrame(applyPointerPosition);

            const lastPoint = points[points.length - 1];
            if (!lastPoint || Math.hypot(x - lastPoint.x, y - lastPoint.y) >= 4) {
                points.push({ x, y, time: performance.now() });
                if (points.length > 30) points.shift();
                if (!drawFrame) drawFrame = window.requestAnimationFrame(drawTrail);
            }
        };

        const resetPointer = () => {
            latestPointer = null;
            page.style.setProperty('--landing-photo-x', '0px');
            page.style.setProperty('--landing-photo-y', '0px');
            page.style.setProperty('--landing-content-x', '0px');
            page.style.setProperty('--landing-content-y', '0px');
        };

        const handleVisibility = () => {
            if (document.hidden) {
                points = [];
                context.clearRect(0, 0, width, height);
                resetPointer();
            }
        };

        resize();
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(page);
        page.addEventListener('pointermove', handlePointerMove, { passive: true });
        page.addEventListener('pointerleave', resetPointer);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            resizeObserver.disconnect();
            page.removeEventListener('pointermove', handlePointerMove);
            page.removeEventListener('pointerleave', resetPointer);
            document.removeEventListener('visibilitychange', handleVisibility);
            if (drawFrame) window.cancelAnimationFrame(drawFrame);
            if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
            context.clearRect(0, 0, width, height);
            resetPointer();
        };
    }, [canvasRef, enabled, pageRef]);
}

export default function WebLandingPage() {
    const initialCacheRef = useRef(null);
    if (!initialCacheRef.current) initialCacheRef.current = readCachedLandingPhotos();

    const pageRef = useRef(null);
    const trailCanvasRef = useRef(null);
    const transitionTimerRef = useRef(null);
    const transitioningRef = useRef(false);
    const mountedRef = useRef(true);
    const [photos, setPhotos] = useState(initialCacheRef.current.items);
    const [activeIndex, setActiveIndex] = useState(0);
    const [previousPhoto, setPreviousPhoto] = useState(null);
    const [transitionToken, setTransitionToken] = useState(0);
    const [imageDimensions, setImageDimensions] = useState(preferredImageDimensions);
    const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
    const [reduceMotion, setReduceMotion] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ));
    const saveData = typeof navigator !== 'undefined' && navigator.connection?.saveData === true;

    const displayPhotos = useMemo(() => photos.map(photo => ({
        ...photo,
        displayUrl: optimizedLandingImageUrl(photo.mediaUrl, imageDimensions)
    })), [imageDimensions, photos]);
    const activePhoto = displayPhotos[activeIndex] || displayPhotos[0] || null;
    const canAnimate = pageVisible && !reduceMotion && !saveData && displayPhotos.length > 1;

    useLandingPointerEffects(pageRef, trailCanvasRef, !reduceMotion && !saveData);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
        };
    }, []);

    useEffect(() => {
        const cachedAt = initialCacheRef.current.cachedAt;
        const cacheIsFresh = photos.length > 0 && Date.now() - cachedAt < LANDING_PHOTOS_CACHE_TTL_MS;
        if (cacheIsFresh) return undefined;

        let cancelled = false;
        essNewsAPI.getLandingImages(MAX_LANDING_PHOTOS)
            .then(items => {
                const imageItems = items.filter(validPhoto).slice(0, MAX_LANDING_PHOTOS);
                if (cancelled || imageItems.length === 0) return;
                cacheLandingPhotos(imageItems);
                setPhotos(imageItems);
                setActiveIndex(0);
            })
            .catch(() => { /* Keep the cached image or the local visual fallback. */ });
        return () => { cancelled = true; };
    }, []); // The cached manifest controls refresh frequency across page mounts.

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleMotionPreference = event => setReduceMotion(event.matches);
        const handleVisibility = () => setPageVisible(!document.hidden);
        mediaQuery.addEventListener?.('change', handleMotionPreference);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            mediaQuery.removeEventListener?.('change', handleMotionPreference);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    useEffect(() => {
        let resizeTimer = null;
        const handleResize = () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                const nextDimensions = preferredImageDimensions();
                setImageDimensions(current => (
                    current.width === nextDimensions.width ? current : nextDimensions
                ));
            }, 300);
        };
        window.addEventListener('resize', handleResize, { passive: true });
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
            window.clearTimeout(resizeTimer);
        };
    }, []);

    useEffect(() => {
        if (!canAnimate || !activePhoto) return undefined;
        const nextPhoto = displayPhotos[(activeIndex + 1) % displayPhotos.length];
        preloadPhoto(nextPhoto);
        return undefined;
    }, [activeIndex, activePhoto, canAnimate, displayPhotos]);

    const selectPhoto = useCallback(async nextIndex => {
        if (transitioningRef.current || nextIndex === activeIndex || !displayPhotos[nextIndex]) return;
        transitioningRef.current = true;
        const nextPhoto = displayPhotos[nextIndex];
        const loaded = await preloadPhoto(nextPhoto);
        if (!mountedRef.current || !loaded) {
            transitioningRef.current = false;
            return;
        }

        setPreviousPhoto(activePhoto);
        setActiveIndex(nextIndex);
        setTransitionToken(token => token + 1);
        if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = window.setTimeout(() => {
            setPreviousPhoto(null);
            transitioningRef.current = false;
        }, CROSSFADE_DURATION_MS);
    }, [activeIndex, activePhoto, displayPhotos]);

    useEffect(() => {
        if (!canAnimate) return undefined;
        const timer = window.setTimeout(() => {
            selectPhoto((activeIndex + 1) % displayPhotos.length);
        }, SLIDE_DURATION_MS);
        return () => window.clearTimeout(timer);
    }, [activeIndex, canAnimate, displayPhotos.length, selectPhoto]);

    const stepPhoto = direction => {
        if (displayPhotos.length < 2) return;
        const nextIndex = (activeIndex + direction + displayPhotos.length) % displayPhotos.length;
        selectPhoto(nextIndex);
    };

    const handleImageError = event => {
        if (activePhoto?.mediaUrl && event.currentTarget.src !== activePhoto.mediaUrl) {
            event.currentTarget.src = activePhoto.mediaUrl;
        }
    };

    return (
        <section ref={pageRef} className={`web-landing-page${activePhoto ? ' has-photo' : ''}`}>
            <div className="web-landing-photo-stage" aria-hidden="true">
                {previousPhoto ? (
                    <div className="web-landing-photo-frame is-previous">
                        <img src={previousPhoto.displayUrl} alt="" decoding="async" />
                    </div>
                ) : null}
                {activePhoto ? (
                    <div key={`${activePhoto.id}-${transitionToken}`} className="web-landing-photo-frame is-active">
                        <img
                            src={activePhoto.displayUrl}
                            alt=""
                            loading="eager"
                            decoding="async"
                            fetchpriority="high"
                            onError={handleImageError}
                        />
                    </div>
                ) : null}
            </div>
            <div className="web-landing-overlay" aria-hidden="true" />
            <div className="web-landing-grid" aria-hidden="true" />
            <canvas ref={trailCanvasRef} className="web-landing-cursor-trail" aria-hidden="true" />

            <div className="web-landing-content">
                <div className="web-landing-logo-pair">
                    <img src={LOGO_URL} alt="ErectSafe Scaffolding" className="web-landing-logo web-landing-logo-ess" loading="eager" decoding="async" fetchpriority="high" />
                    <img src={MALOO_LOGO_URL} alt="Maloo Access Group" className="web-landing-logo web-landing-logo-maloo" loading="eager" decoding="async" />
                </div>
            </div>

            {activePhoto?.title ? (
                <div className="web-landing-caption" aria-live="polite">
                    <strong>{activePhoto.title}</strong>
                    {activePhoto.subtitle ? <span>{activePhoto.subtitle}</span> : null}
                </div>
            ) : null}

            {displayPhotos.length > 1 && !saveData ? (
                <div className="web-landing-carousel-controls">
                    <button type="button" onClick={() => stepPhoto(-1)} aria-label="Previous photograph">
                        <ChevronLeft size={18} strokeWidth={2} />
                    </button>
                    <div className="web-landing-progress" role="group" aria-label="Choose photograph">
                        {displayPhotos.map((photo, index) => (
                            <button
                                key={photo.id || photo.mediaUrl}
                                type="button"
                                className={index === activeIndex ? 'is-active' : ''}
                                onClick={() => selectPhoto(index)}
                                aria-label={`Show photograph ${index + 1}`}
                                aria-current={index === activeIndex ? 'true' : undefined}
                            />
                        ))}
                    </div>
                    <button type="button" onClick={() => stepPhoto(1)} aria-label="Next photograph">
                        <ChevronRight size={18} strokeWidth={2} />
                    </button>
                </div>
            ) : null}
        </section>
    );
}
