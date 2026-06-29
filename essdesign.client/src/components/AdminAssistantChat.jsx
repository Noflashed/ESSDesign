import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, User, X } from 'lucide-react';
import { adminAssistantAPI } from '../services/api';

const STARTER_PROMPTS = [
    'How many men do we have scheduled for work today?',
    'Do we have any trucks scheduled for 7am today?',
    'How many active job-sites do we currently have?',
    'Find the latest design for a job-site or scaffold.',
];

const FLOATING_ASSISTANT_POSITION_KEY = 'ess-admin-assistant-position';
const FLOATING_ASSISTANT_SIZE = 48;
const FLOATING_ASSISTANT_PADDING = 12;

function clampAssistantPosition(position) {
    if (!position || typeof window === 'undefined') return null;

    const maxLeft = Math.max(FLOATING_ASSISTANT_PADDING, window.innerWidth - FLOATING_ASSISTANT_SIZE - FLOATING_ASSISTANT_PADDING);
    const maxTop = Math.max(FLOATING_ASSISTANT_PADDING, window.innerHeight - FLOATING_ASSISTANT_SIZE - FLOATING_ASSISTANT_PADDING);

    return {
        left: Math.min(
            Math.max(FLOATING_ASSISTANT_PADDING, position.left),
            maxLeft
        ),
        top: Math.min(
            Math.max(FLOATING_ASSISTANT_PADDING, position.top),
            maxTop
        )
    };
}

function loadAssistantPosition() {
    if (typeof window === 'undefined') return null;

    try {
        const saved = window.localStorage.getItem(FLOATING_ASSISTANT_POSITION_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        if (!Number.isFinite(parsed?.left) || !Number.isFinite(parsed?.top)) return null;
        return clampAssistantPosition(parsed);
    } catch {
        return null;
    }
}

function AssistantAvatar({ role = 'assistant' }) {
    const isUser = role === 'user';
    const Icon = isUser ? User : Bot;

    return (
        <div className={`admin-assistant-avatar ${isUser ? 'user' : 'assistant'}`} aria-hidden="true">
            <Icon size={16} />
        </div>
    );
}

export default function AdminAssistantChat({ sidebarOpen }) {
    const [open, setOpen] = useState(false);
    const [orbPosition, setOrbPosition] = useState(loadAssistantPosition);
    const [draggingOrb, setDraggingOrb] = useState(false);
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
    const dragRef = useRef(null);

    useEffect(() => {
        if (open && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, open]);

    useEffect(() => {
        if (!orbPosition) return undefined;

        const keepInView = () => {
            setOrbPosition(current => {
                const nextPosition = clampAssistantPosition(current);
                if (!nextPosition) return current;
                if (nextPosition.left === current.left && nextPosition.top === current.top) return current;
                window.localStorage.setItem(FLOATING_ASSISTANT_POSITION_KEY, JSON.stringify(nextPosition));
                return nextPosition;
            });
        };

        window.addEventListener('resize', keepInView);
        return () => window.removeEventListener('resize', keepInView);
    }, [orbPosition]);

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

    const handleOrbPointerDown = (event) => {
        if (event.button !== 0) return;

        const rect = event.currentTarget.getBoundingClientRect();
        dragRef.current = {
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top,
            moved: false,
            suppressClick: false
        };

        const handlePointerMove = (moveEvent) => {
            const dragState = dragRef.current;
            if (!dragState) return;

            const deltaX = moveEvent.clientX - dragState.startClientX;
            const deltaY = moveEvent.clientY - dragState.startClientY;
            const movedFarEnough = Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;
            if (movedFarEnough) {
                dragState.moved = true;
                dragState.suppressClick = true;
                setDraggingOrb(true);
            }

            if (!dragState.moved) return;

            const nextPosition = clampAssistantPosition({
                left: dragState.startLeft + deltaX,
                top: dragState.startTop + deltaY
            });

            if (nextPosition) {
                setOrbPosition(nextPosition);
            }
        };

        const handlePointerUp = (upEvent) => {
            const dragState = dragRef.current;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            setDraggingOrb(false);

            if (dragState?.moved && typeof window !== 'undefined') {
                const nextPosition = clampAssistantPosition({
                    left: dragState.startLeft + (upEvent.clientX - dragState.startClientX),
                    top: dragState.startTop + (upEvent.clientY - dragState.startClientY)
                });
                if (nextPosition) {
                    setOrbPosition(nextPosition);
                    window.localStorage.setItem(FLOATING_ASSISTANT_POSITION_KEY, JSON.stringify(nextPosition));
                }
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    };

    const handleOrbClick = () => {
        if (dragRef.current?.suppressClick) {
            dragRef.current = null;
            return;
        }

        setOpen(prev => !prev);
        dragRef.current = null;
    };

    const assistantStyle = orbPosition
        ? { position: 'fixed', left: `${orbPosition.left}px`, top: `${orbPosition.top}px`, right: 'auto', bottom: 'auto' }
        : undefined;
    const panelOpensRight = orbPosition && typeof window !== 'undefined' && orbPosition.left < 420;
    const panelOpensDown = orbPosition && orbPosition.top < 360;

    return (
        <div
            className={`admin-assistant${open ? ' open' : ''}${sidebarOpen ? '' : ' collapsed-sidebar'}${draggingOrb ? ' dragging-orb' : ''}${panelOpensRight ? ' panel-opens-right' : ''}${panelOpensDown ? ' panel-opens-down' : ''}`}
            style={assistantStyle}
        >
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
                onPointerDown={handleOrbPointerDown}
                onClick={handleOrbClick}
                title="ESS Admin Assistant"
                aria-label="Open ESS admin assistant"
            >
                <span className="admin-assistant-orb-icon"><Sparkles size={15} /></span>
                {sidebarOpen ? <strong>Assistant</strong> : null}
            </button>
        </div>
    );
}
