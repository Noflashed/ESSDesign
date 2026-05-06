import React, { useEffect, useMemo, useState } from 'react';
import {
    WEB_APP_STORAGE_METRICS_EVENT,
    getWebAppStorageMetrics,
    resetWebAppStorageMetrics,
} from '../services/api';

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) {
        return `${value} B`;
    }
    const units = ['KB', 'MB', 'GB', 'TB'];
    let next = value / 1024;
    let unitIndex = 0;
    while (next >= 1024 && unitIndex < units.length - 1) {
        next /= 1024;
        unitIndex += 1;
    }
    return `${next.toFixed(next >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDateTime(value) {
    if (!value) {
        return 'Never';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Never';
    }
    return date.toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    });
}

function numberFormat(value) {
    return new Intl.NumberFormat('en-AU').format(Number(value) || 0);
}

export default function WebAppDebugPage() {
    const [metrics, setMetrics] = useState(() => getWebAppStorageMetrics());

    useEffect(() => {
        const refreshMetrics = (event) => {
            setMetrics(event?.detail?.metrics || getWebAppStorageMetrics());
        };
        const handleStorage = (event) => {
            if (event.key === 'ess-web-app-storage-metrics') {
                setMetrics(getWebAppStorageMetrics());
            }
        };
        window.addEventListener(WEB_APP_STORAGE_METRICS_EVENT, refreshMetrics);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener(WEB_APP_STORAGE_METRICS_EVENT, refreshMetrics);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    const rows = useMemo(() => {
        return Object.entries(metrics.paths || {})
            .map(([path, row]) => ({
                path,
                networkRequests: row.networkRequests || 0,
                cacheHits: row.cacheHits || 0,
                bytesDownloaded: row.bytesDownloaded || 0,
                lastAccessedAt: row.lastAccessedAt,
            }))
            .sort((a, b) => {
                if (b.bytesDownloaded !== a.bytesDownloaded) {
                    return b.bytesDownloaded - a.bytesDownloaded;
                }
                return b.networkRequests - a.networkRequests;
            });
    }, [metrics.paths]);

    const pollingRows = useMemo(() => {
        return Object.entries(metrics.polling || {})
            .map(([source, row]) => ({
                source,
                cycles: row.cycles || 0,
                lastPolledAt: row.lastPolledAt,
            }))
            .sort((a, b) => b.cycles - a.cycles);
    }, [metrics.polling]);

    const totals = metrics.totals || {};
    const totalLookups = (totals.networkRequests || 0) + (totals.cacheHits || 0);
    const cacheHitRatio = totalLookups > 0 ? Math.round(((totals.cacheHits || 0) / totalLookups) * 100) : 0;

    const handleReset = () => {
        setMetrics(resetWebAppStorageMetrics());
    };

    return (
        <div className="module-page web-app-debug-page">
            <div className="module-shell web-app-debug-shell">
                <div className="module-header compact">
                    <div>
                        <h2>Web-App Storage Debug</h2>
                        <p>Client-side estimate for this browser. Supabase remains the source of truth for all-user cached egress.</p>
                    </div>
                    <button type="button" className="module-danger-btn compact" onClick={handleReset}>
                        Reset Metrics
                    </button>
                </div>

                <div className="web-app-debug-notice">
                    This page measures Storage JSON reads made by the web app, estimated downloaded bytes, client cache/coalesced hits, and foreground polling cycles since the last reset.
                </div>

                <div className="web-app-debug-summary">
                    <section className="module-card web-app-debug-stat">
                        <span>Network JSON Reads</span>
                        <strong>{numberFormat(totals.networkRequests)}</strong>
                    </section>
                    <section className="module-card web-app-debug-stat">
                        <span>Estimated Downloaded</span>
                        <strong>{formatBytes(totals.bytesDownloaded)}</strong>
                    </section>
                    <section className="module-card web-app-debug-stat">
                        <span>Client Cache Hit Ratio</span>
                        <strong>{cacheHitRatio}%</strong>
                    </section>
                    <section className="module-card web-app-debug-stat">
                        <span>Foreground Poll Cycles</span>
                        <strong>{numberFormat(totals.foregroundPollingCycles)}</strong>
                    </section>
                </div>

                <section className="module-card web-app-debug-card">
                    <div className="web-app-debug-card-header">
                        <div>
                            <h3>Storage Paths</h3>
                            <p>Sorted by estimated bytes downloaded.</p>
                        </div>
                        <span>Started {formatDateTime(metrics.startedAt)}</span>
                    </div>
                    <div className="web-app-debug-table">
                        <div className="web-app-debug-table-row header">
                            <span>Path</span>
                            <span>Network</span>
                            <span>Cache</span>
                            <span>Downloaded</span>
                            <span>Last Access</span>
                        </div>
                        {rows.length ? rows.map((row) => (
                            <div className="web-app-debug-table-row" key={row.path}>
                                <span className="web-app-debug-path">{row.path}</span>
                                <span>{numberFormat(row.networkRequests)}</span>
                                <span>{numberFormat(row.cacheHits)}</span>
                                <span>{formatBytes(row.bytesDownloaded)}</span>
                                <span>{formatDateTime(row.lastAccessedAt)}</span>
                            </div>
                        )) : (
                            <div className="web-app-debug-empty">No Storage JSON reads recorded yet.</div>
                        )}
                    </div>
                </section>

                <section className="module-card web-app-debug-card">
                    <div className="web-app-debug-card-header">
                        <div>
                            <h3>Foreground Polling</h3>
                            <p>Only counts timer refreshes while the page is visible.</p>
                        </div>
                    </div>
                    <div className="web-app-debug-table compact">
                        <div className="web-app-debug-table-row header">
                            <span>Source</span>
                            <span>Cycles</span>
                            <span>Last Poll</span>
                        </div>
                        {pollingRows.length ? pollingRows.map((row) => (
                            <div className="web-app-debug-table-row" key={row.source}>
                                <span className="web-app-debug-path">{row.source}</span>
                                <span>{numberFormat(row.cycles)}</span>
                                <span>{formatDateTime(row.lastPolledAt)}</span>
                            </div>
                        )) : (
                            <div className="web-app-debug-empty">No foreground polling cycles recorded yet.</div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
