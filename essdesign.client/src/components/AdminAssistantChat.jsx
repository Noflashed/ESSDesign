import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { adminAssistantAPI } from '../services/api';

const STARTER_PROMPTS = [
    'Who is on today?',
    'Who is the site supervisor at 65 Martin Place?',
    'Show active job-sites',
    'Find the latest design for a job-site',
];

const TYPEWRITER_DELAY_MS = 14;
const MAX_TYPEWRITER_STEPS = 220;

function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function AssistantAvatar({ role = 'assistant', userAvatarUrl = '', userInitials = 'U', userDisplayName = 'User', onUserAvatarError }) {
    const isUser = role === 'user';
    if (!isUser) return null;

    return (
        <div className="admin-assistant-avatar user" aria-hidden="true">
            {userAvatarUrl ? (
                <img
                    src={userAvatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={onUserAvatarError}
                />
            ) : (
                <span>{userInitials || userDisplayName.slice(0, 2).toUpperCase()}</span>
            )}
        </div>
    );
}

export default function AdminAssistantChat({
    className = '',
    userAvatarUrl = '',
    userInitials = 'U',
    userDisplayName = 'User',
    onUserAvatarError,
}) {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: "Ask me natural questions about today's roster, transport schedule, active job-sites, users, or design files.",
            links: [],
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [typing, setTyping] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const scrollRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const typeAssistantMessage = async ({ content, links = [], error = false }) => {
        const fullText = content || 'I could not answer that from the current ESS data.';
        const messageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const stepSize = Math.max(1, Math.ceil(fullText.length / MAX_TYPEWRITER_STEPS));
        setTyping(true);

        setMessages(current => [
            ...current,
            {
                id: messageId,
                role: 'assistant',
                content: '',
                links: [],
                error,
                typing: true,
            },
        ]);

        for (let index = stepSize; index < fullText.length; index += stepSize) {
            if (!mountedRef.current) return;
            const partialText = fullText.slice(0, index);
            setMessages(current => current.map(message =>
                message.id === messageId
                    ? { ...message, content: partialText }
                    : message
            ));
            await wait(TYPEWRITER_DELAY_MS);
        }

        if (!mountedRef.current) return;
        setMessages(current => current.map(message =>
            message.id === messageId
                ? { ...message, content: fullText, links, typing: false }
                : message
        ));
        setTyping(false);
    };

    const sendMessage = async (messageText = input) => {
        const text = messageText.trim();
        if (!text || loading || typing) return;

        setHasStarted(true);
        const nextMessages = [...messages, { role: 'user', content: text, links: [] }];
        setMessages(nextMessages);
        setInput('');
        setLoading(true);

        try {
            const history = nextMessages
                .filter(item => item.role === 'user' || item.role === 'assistant')
                .slice(-10)
                .map(item => ({ role: item.role, content: item.content }));
            const response = await adminAssistantAPI.chat(text, history);
            setLoading(false);
            await typeAssistantMessage({
                content: response.reply,
                links: response.links || [],
            });
        } catch (error) {
            setLoading(false);
            await typeAssistantMessage({
                content: error.response?.data?.error || error.message || 'The admin assistant is unavailable right now.',
                links: [],
                error: true,
            });
        } finally {
            setLoading(false);
        }
    };

    const chatStateClass = hasStarted ? 'is-active' : 'is-pristine';

    return (
        <section className={`admin-assistant-page-chat ${chatStateClass} ${className}`} aria-label="ESS AI assistant">
            <div className="admin-assistant-page-messages" ref={scrollRef}>
                {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`admin-assistant-message-row ${message.role}`}>
                        <AssistantAvatar
                            role={message.role}
                            userAvatarUrl={userAvatarUrl}
                            userInitials={userInitials}
                            userDisplayName={userDisplayName}
                            onUserAvatarError={onUserAvatarError}
                        />
                        <div className={`admin-assistant-message ${message.role}${message.error ? ' error' : ''}`}>
                            <p>
                                {message.content}
                                {message.typing ? <span className="admin-assistant-caret" aria-hidden="true" /> : null}
                            </p>
                            {message.links?.length ? (
                                <div className="admin-assistant-links">
                                    {message.links.map(link => (
                                        <a key={`${link.url}-${link.label}`} href={link.url} target="_blank" rel="noreferrer">
                                            {link.label}
                                        </a>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ))}
                {loading ? (
                    <div className="admin-assistant-message-row assistant">
                        <AssistantAvatar
                            userAvatarUrl={userAvatarUrl}
                            userInitials={userInitials}
                            userDisplayName={userDisplayName}
                            onUserAvatarError={onUserAvatarError}
                        />
                        <div className="admin-assistant-thinking" aria-label="AI is thinking" role="status">
                            <span aria-hidden="true" />
                        </div>
                    </div>
                ) : null}
            </div>

            {messages.length <= 1 ? (
                <div className="admin-assistant-prompts">
                    {STARTER_PROMPTS.map(prompt => (
                        <button key={prompt} type="button" onClick={() => sendMessage(prompt)}>
                            {prompt}
                        </button>
                    ))}
                </div>
            ) : null}

            <form
                className="admin-assistant-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    sendMessage();
                }}
            >
                <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask anything about ESS operations..."
                    disabled={loading || typing}
                />
                <button type="submit" disabled={loading || typing || !input.trim()} aria-label="Send message">
                    {loading ? <Loader2 className="admin-assistant-spin-icon" size={18} /> : <Send size={18} />}
                </button>
            </form>
        </section>
    );
}
