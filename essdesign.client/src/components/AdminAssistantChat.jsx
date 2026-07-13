import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Database, ExternalLink, Loader2, Plus, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { assistantAPI } from '../services/api';

const STARTER_PROMPTS = [
    'What is planned across ESS today?',
    'Who manages our active job-sites?',
    'Find the latest revision of a drawing',
    'Summarise current material orders',
];

const WELCOME_MESSAGE = {
    role: 'assistant',
    content: 'Ask me about ESS sites, people, designs, drawings, project documents, rosters, materials, transport, or company activity.',
    sources: [],
    links: [],
    followUps: [],
};

function AssistantAvatar({ role = 'assistant', userAvatarUrl = '', userInitials = 'U', userDisplayName = 'User', onUserAvatarError }) {
    if (role !== 'user') return null;

    return (
        <div className="admin-assistant-avatar user" aria-hidden="true">
            {userAvatarUrl ? (
                <img src={userAvatarUrl} alt="" referrerPolicy="no-referrer" onError={onUserAvatarError} />
            ) : (
                <span>{userInitials || userDisplayName.slice(0, 2).toUpperCase()}</span>
            )}
        </div>
    );
}

function messageKey(message, index) {
    return message.id || `${message.role}-${index}-${message.content.slice(0, 20)}`;
}

export default function AdminAssistantChat({
    className = '',
    userId = '',
    userAvatarUrl = '',
    userInitials = 'U',
    userDisplayName = 'User',
    onUserAvatarError,
    pageContext = null,
}) {
    const storageKey = useMemo(() => `ess-assistant-conversation:${userId || 'current-user'}`, [userId]);
    const [messages, setMessages] = useState([WELCOME_MESSAGE]);
    const [conversationId, setConversationId] = useState(() => {
        try {
            return window.localStorage.getItem(storageKey) || null;
        } catch {
            return null;
        }
    });
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState({});
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(storageKey);
            setConversationId(saved || null);
        } catch {
            setConversationId(null);
        }
    }, [storageKey]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const startNewConversation = () => {
        setMessages([WELCOME_MESSAGE]);
        setConversationId(null);
        setFeedback({});
        try {
            window.localStorage.removeItem(storageKey);
        } catch {
            // The conversation still resets if browser storage is unavailable.
        }
        window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    const sendMessage = async (messageText = input) => {
        const text = messageText.trim();
        if (!text || loading) return;

        const userMessage = { id: crypto.randomUUID(), role: 'user', content: text, sources: [], links: [], followUps: [] };
        const priorMessages = messages;
        setMessages(current => [...current, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const history = priorMessages
                .filter(item => item.role === 'user' || (item.role === 'assistant' && item !== WELCOME_MESSAGE))
                .slice(-20)
                .map(item => ({ role: item.role, content: item.content }));
            const response = await assistantAPI.chat(text, {
                conversationId,
                history,
                pageContext,
            });
            const nextConversationId = response.conversationId || conversationId;
            setConversationId(nextConversationId);
            if (nextConversationId) {
                try {
                    window.localStorage.setItem(storageKey, nextConversationId);
                } catch {
                    // Server-side conversation continuity still works for this page session.
                }
            }
            setMessages(current => [...current, {
                id: crypto.randomUUID(),
                persistedMessageId: response.messageId || null,
                role: 'assistant',
                content: response.reply || 'I could not produce an answer from the available ESS records.',
                grounded: Boolean(response.grounded),
                sources: response.sources || [],
                links: response.links || [],
                followUps: response.followUps || [],
            }]);
        } catch (error) {
            setMessages(current => [...current, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: error.response?.data?.error || error.message || 'ESS Assistant is unavailable right now.',
                sources: [],
                links: [],
                followUps: [],
                error: true,
            }]);
        } finally {
            setLoading(false);
        }
    };

    const rateMessage = async (message, rating) => {
        if (!conversationId || feedback[message.id]) return;
        setFeedback(current => ({ ...current, [message.id]: rating }));
        try {
            await assistantAPI.feedback({
                conversationId,
                messageId: message.persistedMessageId || null,
                rating,
            });
        } catch {
            setFeedback(current => {
                const next = { ...current };
                delete next[message.id];
                return next;
            });
        }
    };

    const hasStarted = messages.length > 1;
    const chatStateClass = hasStarted ? 'is-active' : 'is-pristine';

    return (
        <section className={`admin-assistant-page-chat ${chatStateClass} ${className}`} aria-label="ESS AI assistant">
            {hasStarted ? (
                <button
                    type="button"
                    className="admin-assistant-new-chat"
                    onClick={startNewConversation}
                    aria-label="Start a new conversation"
                    title="New conversation"
                >
                    <Plus size={17} aria-hidden="true" />
                </button>
            ) : null}

            <div className="admin-assistant-page-messages" ref={scrollRef} aria-live="polite">
                {messages.map((message, index) => (
                    <div key={messageKey(message, index)} className={`admin-assistant-message-row ${message.role}`}>
                        <AssistantAvatar
                            role={message.role}
                            userAvatarUrl={userAvatarUrl}
                            userInitials={userInitials}
                            userDisplayName={userDisplayName}
                            onUserAvatarError={onUserAvatarError}
                        />
                        <div className={`admin-assistant-message ${message.role}${message.error ? ' error' : ''}`}>
                            <p>{message.content}</p>

                            {message.sources?.length ? (
                                <div className="admin-assistant-sources" aria-label="ESS sources">
                                    <span className="admin-assistant-sources-label"><Database size={13} aria-hidden="true" /> ESS sources</span>
                                    <div className="admin-assistant-source-list">
                                        {message.sources.map((source, sourceIndex) => source.url ? (
                                            <a key={source.id} href={source.url} target="_blank" rel="noreferrer" title={source.detail || source.label}>
                                                <span>{sourceIndex + 1}</span>{source.label}<ExternalLink size={12} aria-hidden="true" />
                                            </a>
                                        ) : (
                                            <span key={source.id} className="admin-assistant-source" title={source.detail || source.label}>
                                                <b>{sourceIndex + 1}</b>{source.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {message.links?.length ? (
                                <div className="admin-assistant-links">
                                    {message.links.map(link => (
                                        <a key={`${link.url}-${link.label}`} href={link.url} target="_blank" rel="noreferrer">
                                            {link.label}<ExternalLink size={13} aria-hidden="true" />
                                        </a>
                                    ))}
                                </div>
                            ) : null}

                            {message.role === 'assistant' && index > 0 && !message.error ? (
                                <div className="admin-assistant-feedback" aria-label="Rate this answer">
                                    <button
                                        type="button"
                                        className={feedback[message.id] === 1 ? 'selected' : ''}
                                        onClick={() => rateMessage(message, 1)}
                                        aria-label="Helpful answer"
                                        title="Helpful"
                                    >
                                        <ThumbsUp size={13} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className={feedback[message.id] === -1 ? 'selected' : ''}
                                        onClick={() => rateMessage(message, -1)}
                                        aria-label="Unhelpful answer"
                                        title="Not helpful"
                                    >
                                        <ThumbsDown size={13} aria-hidden="true" />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ))}
                {loading ? (
                    <div className="admin-assistant-message-row assistant">
                        <div className="admin-assistant-thinking" aria-label="ESS Assistant is investigating" role="status">
                            <span aria-hidden="true" />
                        </div>
                    </div>
                ) : null}
            </div>

            {!hasStarted ? (
                <div className="admin-assistant-prompts">
                    {STARTER_PROMPTS.map(prompt => (
                        <button key={prompt} type="button" onClick={() => sendMessage(prompt)}>{prompt}</button>
                    ))}
                </div>
            ) : messages.at(-1)?.followUps?.length ? (
                <div className="admin-assistant-follow-ups">
                    {messages.at(-1).followUps.map(prompt => (
                        <button key={prompt} type="button" onClick={() => sendMessage(prompt)} disabled={loading}>{prompt}</button>
                    ))}
                </div>
            ) : <div />}

            <form className="admin-assistant-form" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask anything about ESS..."
                    disabled={loading}
                    maxLength={4000}
                />
                <button type="submit" disabled={loading || !input.trim()} aria-label="Send message" title="Send">
                    {loading ? <Loader2 className="admin-assistant-spin-icon" size={18} /> : <Send size={18} />}
                </button>
            </form>
        </section>
    );
}
