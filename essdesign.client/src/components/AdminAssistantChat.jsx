import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, User, X } from 'lucide-react';
import { adminAssistantAPI } from '../services/api';

const STARTER_PROMPTS = [
    'How many men do we have scheduled for work today?',
    'Do we have any trucks scheduled for 7am today?',
    'How many active job-sites do we currently have?',
    'Find the latest design for a job-site or scaffold.',
];

function AssistantAvatar({ role = 'assistant', loading = false }) {
    const isUser = role === 'user';
    const Icon = isUser ? User : Bot;

    return (
        <div className={`admin-assistant-avatar ${isUser ? 'user' : 'assistant'}${loading ? ' loading' : ''}`} aria-hidden="true">
            <Icon size={16} />
        </div>
    );
}

export default function AdminAssistantChat({ sidebarOpen }) {
    const [open, setOpen] = useState(false);
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
        if (open && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, open]);

    const sendMessage = async (messageText = input) => {
        const text = messageText.trim();
        if (!text || loading) return;

        const nextMessages = [...messages, { role: 'user', content: text, links: [] }];
        setMessages(nextMessages);
        setInput('');
        setOpen(true);
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
        <div className={`admin-assistant${open ? ' open' : ''}${sidebarOpen ? '' : ' collapsed-sidebar'}`}>
            {open ? (
                <section className="admin-assistant-panel" aria-label="ESS admin assistant">
                    <div className="admin-assistant-head">
                        <div className="admin-assistant-head-title">
                            <div className="admin-assistant-head-avatar" aria-hidden="true">
                                <Bot size={18} />
                            </div>
                            <div>
                                <span>ESS Intelligence</span>
                                <strong>Admin Assistant</strong>
                            </div>
                        </div>
                        <button type="button" onClick={() => setOpen(false)} aria-label="Close admin assistant">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="admin-assistant-messages" ref={scrollRef}>
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
                                <AssistantAvatar loading />
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
                            placeholder="Ask about ESS operations..."
                            disabled={loading}
                        />
                        <button type="submit" disabled={loading || !input.trim()}>
                            {loading ? <Loader2 className="admin-assistant-spin-icon" size={16} /> : <Send size={16} />}
                            <span>Send</span>
                        </button>
                    </form>
                </section>
            ) : null}

            <button
                type="button"
                className="admin-assistant-orb"
                onClick={() => setOpen(prev => !prev)}
                title="ESS Admin Assistant"
                aria-label="Open ESS admin assistant"
            >
                <span className="admin-assistant-orb-icon"><Sparkles size={15} /></span>
                {sidebarOpen ? <strong>Assistant</strong> : null}
            </button>
        </div>
    );
}
