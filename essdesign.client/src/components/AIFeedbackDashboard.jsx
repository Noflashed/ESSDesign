import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, RefreshCw, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { assistantAPI } from '../services/api';
import './AIFeedbackDashboard.css';

function formatDate(value) {
    if (!value) return 'Unknown date';
    return new Intl.DateTimeFormat('en-AU', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function feedbackLabel(rating) {
    return rating === 1 ? 'LIKE' : 'DISLIKE';
}

function formatFeedbackEntry(item, index) {
    return [
        `FEEDBACK ${index + 1} — ${feedbackLabel(item.rating)}`,
        `Date: ${formatDate(item.createdAt)}`,
        `User: ${item.userName || 'ESS user'}`,
        `Conversation: ${item.conversationTitle || 'New conversation'}`,
        '',
        'QUESTION:',
        item.question || '(Question unavailable)',
        '',
        'AI RESPONSE:',
        item.response || '(Response unavailable)',
        '',
        'COMMENT:',
        item.comment || '(No comment supplied)',
    ].join('\n');
}

function formatFeedbackExport(items) {
    return [
        'ESS AI FEEDBACK EXPORT',
        `Generated: ${formatDate(new Date().toISOString())}`,
        `Entries: ${items.length}`,
        '',
        items.map(formatFeedbackEntry).join('\n\n' + '='.repeat(72) + '\n\n'),
    ].join('\n');
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

export default function AIFeedbackDashboard() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState(false);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [copied, setCopied] = useState('');

    const loadFeedback = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await assistantAPI.listFeedback(500);
            setItems(Array.isArray(data) ? data : []);
        } catch (loadError) {
            setError(loadError.response?.data?.error || loadError.message || 'Feedback logs could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadFeedback();
    }, [loadFeedback]);

    const filteredItems = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return items.filter(item => {
            if (filter === 'likes' && item.rating !== 1) return false;
            if (filter === 'dislikes' && item.rating !== -1) return false;
            if (!normalizedQuery) return true;
            return [item.question, item.response, item.comment, item.userName, item.conversationTitle]
                .some(value => String(value || '').toLowerCase().includes(normalizedQuery));
        });
    }, [filter, items, query]);

    const likes = items.filter(item => item.rating === 1).length;
    const dislikes = items.filter(item => item.rating === -1).length;

    const handleCopy = async (text, key) => {
        try {
            await copyText(text);
            setCopied(key);
            window.setTimeout(() => setCopied(current => current === key ? '' : current), 1800);
        } catch {
            setError('The feedback could not be copied to the clipboard.');
        }
    };

    const clearLogs = async () => {
        if (!items.length || clearing) return;
        if (!window.confirm('Clear all ESS AI feedback logs? Saved chat conversations will not be deleted.')) return;
        setClearing(true);
        setError('');
        try {
            await assistantAPI.clearFeedback();
            setItems([]);
        } catch (clearError) {
            setError(clearError.response?.data?.error || clearError.message || 'Feedback logs could not be cleared.');
        } finally {
            setClearing(false);
        }
    };

    return (
        <main className="ai-feedback-page">
            <div className="ai-feedback-shell">
                <header className="ai-feedback-header">
                    <div>
                        <span className="ai-feedback-eyebrow">Admin dashboard</span>
                        <h1>ESS AI Feedback</h1>
                        <p>Review what users asked, how ESS AI answered, and why the response helped or missed the mark.</p>
                    </div>
                    <div className="ai-feedback-header-actions">
                        <button type="button" onClick={loadFeedback} disabled={loading}>
                            <RefreshCw size={16} className={loading ? 'spinning' : ''} /> Refresh
                        </button>
                        <button
                            type="button"
                            className="primary"
                            onClick={() => handleCopy(formatFeedbackExport(filteredItems), 'all')}
                            disabled={!filteredItems.length}
                        >
                            <Clipboard size={16} /> {copied === 'all' ? 'Copied' : 'Copy visible logs'}
                        </button>
                        <button type="button" className="danger" onClick={clearLogs} disabled={!items.length || clearing}>
                            <Trash2 size={16} /> {clearing ? 'Clearing...' : 'Clear logs'}
                        </button>
                    </div>
                </header>

                <section className="ai-feedback-stats" aria-label="Feedback summary">
                    <div><span>Total feedback</span><strong>{items.length}</strong></div>
                    <div className="positive"><span>Likes</span><strong>{likes}</strong></div>
                    <div className="negative"><span>Dislikes</span><strong>{dislikes}</strong></div>
                    <div><span>Approval rate</span><strong>{items.length ? `${Math.round((likes / items.length) * 100)}%` : '—'}</strong></div>
                </section>

                <section className="ai-feedback-toolbar">
                    <div className="ai-feedback-filters" aria-label="Filter feedback">
                        {[
                            ['all', 'All'],
                            ['likes', 'Likes'],
                            ['dislikes', 'Dislikes'],
                        ].map(([key, label]) => (
                            <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
                        ))}
                    </div>
                    <label className="ai-feedback-search">
                        <Search size={16} />
                        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search questions, answers or comments" />
                    </label>
                </section>

                {error ? <div className="ai-feedback-error" role="alert">{error}</div> : null}
                {loading ? <div className="ai-feedback-state">Loading feedback logs...</div> : null}
                {!loading && !filteredItems.length ? (
                    <div className="ai-feedback-state">
                        <strong>{items.length ? 'No feedback matches these filters.' : 'No feedback has been recorded yet.'}</strong>
                        <span>User likes and dislikes will appear here with their question, AI response, and comment.</span>
                    </div>
                ) : null}

                {!loading && filteredItems.length ? (
                    <div className="ai-feedback-list">
                        {filteredItems.map((item, index) => (
                            <article key={item.id} className={`ai-feedback-card ${item.rating === 1 ? 'positive' : 'negative'}`}>
                                <div className="ai-feedback-card-head">
                                    <div className="ai-feedback-rating">
                                        {item.rating === 1 ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}
                                        {item.rating === 1 ? 'Liked' : 'Disliked'}
                                    </div>
                                    <div className="ai-feedback-meta">
                                        <span>{item.userName || 'ESS user'}</span>
                                        <span>{formatDate(item.createdAt)}</span>
                                    </div>
                                    <button type="button" onClick={() => handleCopy(formatFeedbackEntry(item, 0), item.id)}>
                                        <Clipboard size={15} /> {copied === item.id ? 'Copied' : 'Copy entry'}
                                    </button>
                                </div>
                                <div className="ai-feedback-block question">
                                    <span>Question</span>
                                    <p>{item.question || 'Question unavailable'}</p>
                                </div>
                                <div className="ai-feedback-block response">
                                    <span>AI response</span>
                                    <p>{item.response || 'Response unavailable'}</p>
                                </div>
                                <div className="ai-feedback-block comment">
                                    <span>User comment</span>
                                    <p>{item.comment || 'No comment supplied'}</p>
                                </div>
                                <footer>Conversation: {item.conversationTitle || 'New conversation'} · Log {index + 1}</footer>
                            </article>
                        ))}
                    </div>
                ) : null}
            </div>
        </main>
    );
}
