import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    MessageSquareText,
    Maximize2,
    Minus,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import AdminAssistantChat from './AdminAssistantChat';
import { assistantAPI } from '../services/api';

const MAX_HISTORY = 100;

function compactTitle(value) {
    const title = String(value || 'New conversation').replace(/\s+/g, ' ').trim();
    return title.length <= 80 ? title : `${title.slice(0, 77)}...`;
}

function conversationDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function ESSAIPage({
    userId = '',
    userAvatarUrl = '',
    userInitials = 'U',
    userDisplayName = 'User',
    onUserAvatarError,
}) {
    const conversationCache = useRef(new Map());
    const requestSequence = useRef(0);
    const [conversations, setConversations] = useState([]);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const [activeConversation, setActiveConversation] = useState(null);
    const [chatInstance, setChatInstance] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [chatLoading, setChatLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [historyMinimized, setHistoryMinimized] = useState(false);
    const [menuConversationId, setMenuConversationId] = useState(null);
    const [deletingConversationId, setDeletingConversationId] = useState(null);

    const openConversation = useCallback(async (conversationId) => {
        if (!conversationId) return;
        setMenuConversationId(null);
        setActiveConversationId(conversationId);
        setError('');

        const cached = conversationCache.current.get(conversationId);
        if (cached) {
            setActiveConversation(cached);
            setChatLoading(false);
            setChatInstance(current => current + 1);
            return;
        }

        const requestId = ++requestSequence.current;
        setChatLoading(true);
        try {
            const conversation = await assistantAPI.getConversation(conversationId);
            if (requestId !== requestSequence.current) return;
            conversationCache.current.set(conversationId, conversation);
            setActiveConversation(conversation);
            setChatInstance(current => current + 1);
        } catch (loadError) {
            if (requestId !== requestSequence.current) return;
            setError(loadError.response?.data?.error || loadError.message || 'This chat could not be loaded.');
            setActiveConversation(null);
        } finally {
            if (requestId === requestSequence.current) setChatLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        requestSequence.current += 1;
        conversationCache.current.clear();
        setActiveConversationId(null);
        setActiveConversation(null);
        setChatLoading(false);
        setHistoryLoading(true);
        setError('');
        assistantAPI.listConversations(MAX_HISTORY)
            .then(items => {
                if (cancelled) return;
                setConversations(items);
            })
            .catch(loadError => {
                if (!cancelled) setError(loadError.response?.data?.error || loadError.message || 'Saved chats could not be loaded.');
            })
            .finally(() => {
                if (!cancelled) setHistoryLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    useEffect(() => {
        const closeMenu = () => setMenuConversationId(null);
        document.addEventListener('click', closeMenu);
        return () => document.removeEventListener('click', closeMenu);
    }, []);

    const startNewConversation = useCallback(() => {
        requestSequence.current += 1;
        setActiveConversationId(null);
        setActiveConversation(null);
        setChatLoading(false);
        setError('');
        setMenuConversationId(null);
        setChatInstance(current => current + 1);
    }, []);

    const handleConversationChange = useCallback((conversationId, details) => {
        if (!conversationId) return;
        const now = new Date().toISOString();
        const title = compactTitle(details?.firstMessage);
        setActiveConversationId(conversationId);
        setConversations(current => {
            const existing = current.find(item => item.id === conversationId);
            const next = existing
                ? current.map(item => item.id === conversationId ? { ...item, updatedAt: now } : item)
                : [{ id: conversationId, title, createdAt: now, updatedAt: now }, ...current];
            return [...next].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
        });
    }, []);

    const handleConversationSnapshot = useCallback((conversationId, messages) => {
        if (!conversationId) return;
        const existing = conversationCache.current.get(conversationId) || {};
        const snapshot = { ...existing, id: conversationId, messages };
        conversationCache.current.set(conversationId, snapshot);
    }, []);

    const renameConversation = async (conversation) => {
        const title = window.prompt('Rename chat', conversation.title);
        if (!title?.trim() || title.trim() === conversation.title) return;
        const nextTitle = compactTitle(title);
        try {
            await assistantAPI.renameConversation(conversation.id, nextTitle);
            setConversations(current => current.map(item => item.id === conversation.id ? { ...item, title: nextTitle } : item));
            const cached = conversationCache.current.get(conversation.id);
            if (cached) conversationCache.current.set(conversation.id, { ...cached, title: nextTitle });
            if (activeConversationId === conversation.id) setActiveConversation(current => current ? { ...current, title: nextTitle } : current);
            setError('');
        } catch (renameError) {
            setError(renameError.response?.data?.error || renameError.message || 'This chat could not be renamed.');
        }
    };

    const deleteConversation = async (conversation) => {
        if (!conversation?.id || deletingConversationId) return;
        setMenuConversationId(null);
        setDeletingConversationId(conversation.id);
        try {
            await assistantAPI.deleteConversation(conversation.id);
            conversationCache.current.delete(conversation.id);
            setConversations(current => current.filter(item => item.id !== conversation.id));
            if (activeConversationId === conversation.id) startNewConversation();
            setError('');
        } catch (deleteError) {
            setError(deleteError.response?.data?.error || deleteError.message || 'This chat could not be deleted.');
        } finally {
            setDeletingConversationId(null);
        }
    };

    const filteredConversations = useMemo(() => {
        const query = search.trim().toLowerCase();
        return query
            ? conversations.filter(item => item.title.toLowerCase().includes(query))
            : conversations;
    }, [conversations, search]);

    const activeTitle = conversations.find(item => item.id === activeConversationId)?.title
        || activeConversation?.title
        || 'New chat';

    return (
        <section className="ess-ai-page">
            <aside className={`ess-ai-history${historyMinimized ? ' is-minimized' : ''}`} aria-label="Chat history">
                <div className="ess-ai-history-header">
                    <div className="ess-ai-history-brand">
                        <MessageSquareText size={19} aria-hidden="true" />
                        <strong>Chats</strong>
                    </div>
                    <div className="ess-ai-history-actions">
                        <button type="button" onClick={startNewConversation} title="New chat" aria-label="New chat"><Plus size={18} /></button>
                        <button
                            type="button"
                            onClick={() => {
                                setHistoryMinimized(current => !current);
                                setMenuConversationId(null);
                            }}
                            title={historyMinimized ? 'Restore chat history' : 'Minimize chat history'}
                            aria-label={historyMinimized ? 'Restore chat history' : 'Minimize chat history'}
                            aria-expanded={!historyMinimized}
                            aria-controls="ess-ai-history-content"
                        >
                            {historyMinimized ? <Maximize2 size={16} aria-hidden="true" /> : <Minus size={18} aria-hidden="true" />}
                        </button>
                    </div>
                </div>

                <div
                    id="ess-ai-history-content"
                    className="ess-ai-history-content"
                    aria-hidden={historyMinimized}
                    inert={historyMinimized ? '' : undefined}
                >
                    <label className="ess-ai-history-search">
                        <Search size={15} aria-hidden="true" />
                        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search chats" />
                        {search ? <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button> : null}
                    </label>

                    <div className="ess-ai-history-list">
                        {historyLoading ? (
                            <div className="ess-ai-history-state">Loading chats...</div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="ess-ai-history-state">{search ? 'No matching chats' : 'Your chats will appear here'}</div>
                        ) : filteredConversations.map(conversation => (
                            <div key={conversation.id} className={`ess-ai-history-item${activeConversationId === conversation.id ? ' active' : ''}`}>
                                <button type="button" className="ess-ai-history-select" onClick={() => openConversation(conversation.id)}>
                                    <span>{conversation.title}</span>
                                    <small>{conversationDate(conversation.updatedAt)}</small>
                                </button>
                                <button
                                    type="button"
                                    className="ess-ai-history-menu-button"
                                    onClick={event => { event.stopPropagation(); setMenuConversationId(current => current === conversation.id ? null : conversation.id); }}
                                    aria-label={`Actions for ${conversation.title}`}
                                    title="Chat actions"
                                >
                                    <MoreHorizontal size={16} />
                                </button>
                                {menuConversationId === conversation.id ? (
                                    <div className="ess-ai-history-menu" onClick={event => event.stopPropagation()}>
                                        <button type="button" onClick={() => renameConversation(conversation)}><Pencil size={14} /> Rename</button>
                                        <button
                                            type="button"
                                            className="danger"
                                            onClick={() => deleteConversation(conversation)}
                                            disabled={Boolean(deletingConversationId)}
                                        >
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            <main className="ess-ai-workspace">
                <header className="ess-ai-workspace-header">
                    <div>
                        <h1>ESS AI</h1>
                        <span>{activeTitle}</span>
                    </div>
                    <button type="button" className="ess-ai-header-new" onClick={startNewConversation} title="New chat" aria-label="New chat"><Plus size={18} /></button>
                </header>

                {error ? <div className="ess-ai-error" role="alert">{error}</div> : null}
                {chatLoading ? (
                    <div className="ess-ai-chat-loading" role="status"><span /> Loading conversation...</div>
                ) : (
                    <AdminAssistantChat
                        key={chatInstance}
                        className="ess-ai-chat"
                        initialConversationId={activeConversationId}
                        initialMessages={activeConversation?.messages || []}
                        userAvatarUrl={userAvatarUrl}
                        userInitials={userInitials}
                        userDisplayName={userDisplayName}
                        onUserAvatarError={onUserAvatarError}
                        pageContext={{ page: 'ess-ai' }}
                        showNewChatButton={false}
                        onStartNewConversation={startNewConversation}
                        onConversationChange={handleConversationChange}
                        onConversationSnapshot={handleConversationSnapshot}
                    />
                )}
            </main>
        </section>
    );
}
