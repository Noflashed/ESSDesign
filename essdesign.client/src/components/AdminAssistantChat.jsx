import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send, User } from 'lucide-react';
import { adminAssistantAPI } from '../services/api';

const STARTER_PROMPTS = [
    'Who is on today?',
    'Who is the site supervisor at 65 Martin Place?',
    'Show active job-sites',
    'Find the latest design for a job-site',
];

function AssistantAvatar({ role = 'assistant' }) {
    const isUser = role === 'user';
    if (!isUser) return null;

    return (
        <div className="admin-assistant-avatar user" aria-hidden="true">
            <User size={16} />
        </div>
    );
}

export default function AdminAssistantChat({ className = '' }) {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: "Ask me natural questions about today's roster, transport schedule, active job-sites, users, or design files.",
            links: [],
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const sendMessage = async (messageText = input) => {
        const text = messageText.trim();
        if (!text || loading) return;

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
            setMessages(current => [
                ...current,
                {
                    role: 'assistant',
                    content: response.reply || 'I could not answer that from the current ESS data.',
                    links: response.links || [],
                },
            ]);
        } catch (error) {
            setMessages(current => [
                ...current,
                {
                    role: 'assistant',
                    content: error.response?.data?.error || error.message || 'The admin assistant is unavailable right now.',
                    links: [],
                    error: true,
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className={`admin-assistant-page-chat ${className}`} aria-label="ESS AI assistant">
            <div className="admin-assistant-page-messages" ref={scrollRef}>
                {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`admin-assistant-message-row ${message.role}`}>
                        <AssistantAvatar role={message.role} />
                        <div className={`admin-assistant-message ${message.role}${message.error ? ' error' : ''}`}>
                            <p>{message.content}</p>
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
                        <AssistantAvatar />
                        <div className="admin-assistant-message assistant loading">
                            <div className="admin-assistant-loading-line">
                                <span>Checking ESS data</span>
                                <span className="admin-assistant-typing" aria-hidden="true">
                                    <i />
                                    <i />
                                    <i />
                                </span>
                            </div>
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
                    disabled={loading}
                />
                <button type="submit" disabled={loading || !input.trim()} aria-label="Send message">
                    {loading ? <Loader2 className="admin-assistant-spin-icon" size={18} /> : <Send size={18} />}
                </button>
            </form>
        </section>
    );
}
