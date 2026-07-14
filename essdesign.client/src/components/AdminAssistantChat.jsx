import React, { useEffect, useRef, useState } from 'react';
import { Database, ExternalLink, Loader2, Plus, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { assistantAPI } from '../services/api';

const STARTER_PROMPTS = [
    'What is planned across ESS today?',
    'Who manages our active job-sites?',
    'Find the latest revision of a drawing',
    'Summarise current material orders',
];

const WELCOME_MESSAGE = {
    id: 'ess-ai-welcome',
    role: 'assistant',
    content: 'What can I help you with?',
    sources: [],
    links: [],
    followUps: [],
};

function buildInitialMessages(savedMessages) {
    if (!savedMessages?.length) return [WELCOME_MESSAGE];
    return savedMessages.map(message => ({
        id: message.id || crypto.randomUUID(),
        persistedMessageId: message.id || null,
        role: message.role,
        content: message.content,
        sources: message.sources || [],
        links: message.links || [],
        followUps: [],
    }));
}

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

function AssistantMessageContent({ content, role }) {
    if (role === 'user') return <p>{content}</p>;

    return (
        <div className="admin-assistant-content">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                    img: () => null,
                    table: ({ children }) => (
                        <div className="admin-assistant-table-wrap">
                            <table>{children}</table>
                        </div>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

export default function AdminAssistantChat({
    className = '',
    initialConversationId = null,
    initialMessages = [],
    userAvatarUrl = '',
    userInitials = 'U',
    userDisplayName = 'User',
    onUserAvatarError,
    pageContext = null,
    showNewChatButton = true,
    onStartNewConversation,
    onConversationChange,
    onConversationSnapshot,
}) {
    const [messages, setMessages] = useState(() => buildInitialMessages(initialMessages));
    const [conversationId, setConversationId] = useState(initialConversationId);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [streamStatus, setStreamStatus] = useState('');
    const [streamingReplyVisible, setStreamingReplyVisible] = useState(false);
    const [feedback, setFeedback] = useState({});
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    useEffect(() => {
        if (conversationId && onConversationSnapshot) {
            onConversationSnapshot(conversationId, messages.filter(message => message.id !== WELCOME_MESSAGE.id));
        }
    }, [conversationId, messages, onConversationSnapshot]);

    const startNewConversation = () => {
        if (onStartNewConversation) {
            onStartNewConversation();
            return;
        }
        setMessages([WELCOME_MESSAGE]);
        setConversationId(null);
        setFeedback({});
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
        setStreamStatus('Thinking...');
        setStreamingReplyVisible(false);

        try {
            const history = priorMessages
                .filter(item => item.role === 'user' || (item.role === 'assistant' && item !== WELCOME_MESSAGE))
                .slice(-20)
                .map(item => ({ role: item.role, content: item.content }));
            const streamingId = crypto.randomUUID();
            let hasDelta = false;
            let completed = false;
            await assistantAPI.chatStream(text, {
                conversationId,
                history,
                pageContext,
            }, (event) => {
                if (event.type === 'status') {
                    setStreamStatus(event.message || 'Checking ESS...');
                    return;
                }
                if (event.type === 'delta' && event.delta) {
                    setStreamingReplyVisible(true);
                    if (!hasDelta) {
                        hasDelta = true;
                        setMessages(current => [...current, {
                            id: streamingId,
                            role: 'assistant',
                            content: event.delta,
                            sources: [],
                            links: [],
                            followUps: [],
                            streaming: true,
                        }]);
                    } else {
                        setMessages(current => current.map(item => item.id === streamingId
                            ? { ...item, content: `${item.content}${event.delta}` }
                            : item));
                    }
                    return;
                }
                if (event.type === 'complete' && event.response) {
                    completed = true;
                    const response = event.response;
                    const nextConversationId = response.conversationId || conversationId;
                    setConversationId(nextConversationId);
                    onConversationChange?.(nextConversationId, { firstMessage: text, response });
                    setMessages(current => {
                        const existing = current.some(item => item.id === streamingId);
                        const finalMessage = {
                            id: streamingId,
                            persistedMessageId: response.messageId || null,
                            role: 'assistant',
                            content: response.reply || 'I could not produce an answer from the available ESS records.',
                            grounded: Boolean(response.grounded),
                            sources: response.sources || [],
                            links: response.links || [],
                            followUps: response.followUps || [],
                            streaming: false,
                        };
                        return existing
                            ? current.map(item => item.id === streamingId ? finalMessage : item)
                            : [...current, finalMessage];
                    });
                }
            });
            if (!completed) {
                throw new Error('The assistant stream ended before the answer was completed.');
            }
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
            setStreamStatus('');
            setStreamingReplyVisible(false);
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
            {showNewChatButton && hasStarted ? (
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
                        <div className={`admin-assistant-message ${message.role}${message.error ? ' error' : ''}${message.streaming ? ' streaming' : ''}`}>
                            <AssistantMessageContent content={message.content} role={message.role} />

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
                {loading && !streamingReplyVisible ? (
                    <div className="admin-assistant-message-row assistant">
                        <div className="admin-assistant-thinking" aria-label="ESS Assistant is investigating" role="status">
                            <span aria-hidden="true" />
                            {streamStatus ? <small>{streamStatus}</small> : null}
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
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            sendMessage();
                        }
                    }}
                    placeholder="Ask anything about ESS..."
                    disabled={loading}
                    maxLength={4000}
                    rows={1}
                />
                <button type="submit" disabled={loading || !input.trim()} aria-label="Send message" title="Send">
                    {loading ? <Loader2 className="admin-assistant-spin-icon" size={18} /> : <Send size={18} />}
                </button>
            </form>
        </section>
    );
}
