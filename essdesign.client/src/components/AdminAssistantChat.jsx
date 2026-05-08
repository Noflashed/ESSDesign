import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, User, X } from 'lucide-react';
import { adminAssistantAPI, materialOrderRequestsAPI } from '../services/api';

const STARTER_PROMPTS = [
    'How many men do we have scheduled for work today?',
    'Do we have any trucks scheduled for 7am today?',
    'How many active job-sites do we currently have?',
    'Find the latest design for a job-site or scaffold.',
];

function AssistantAvatar({ role = 'assistant' }) {
    const isUser = role === 'user';
    const Icon = isUser ? User : Bot;

    return (
        <div className={`admin-assistant-avatar ${isUser ? 'user' : 'assistant'}`} aria-hidden="true">
            <Icon size={16} />
        </div>
    );
}

function normalizeQuestion(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isTruckScheduleQuestion(question) {
    const normalized = normalizeQuestion(question);
    const hasTransportIntent = /\b(truck|trucks|delivery|deliveries|transport|material order|material orders|schedule board|dynamic schedule)\b/.test(normalized);
    const hasScheduleIntent = /\b(schedule|scheduled|schedules|today|current|now|run|runs|booked)\b/.test(normalized);
    const isWorkforceQuestion = /\b(roster|men|workers|staff|crew|scaffolders|labour|labor)\b/.test(normalized);

    if (isWorkforceQuestion && !/\b(truck|trucks|delivery|deliveries|transport|material order|material orders)\b/.test(normalized)) {
        return false;
    }

    return (hasTransportIntent && hasScheduleIntent) || /\bwhats? the truck schedule\b/.test(normalized);
}

function getRequestedScheduleHour(question) {
    const normalized = normalizeQuestion(question);
    const match = normalized.match(/\b(1[0-2]|0?[1-9])\s*(am|pm)\b/);
    if (!match) {
        return null;
    }

    const rawHour = Number(match[1]);
    if (!Number.isFinite(rawHour)) {
        return null;
    }

    if (match[2] === 'am') {
        return rawHour === 12 ? 0 : rawHour;
    }
    return rawHour === 12 ? 12 : rawHour + 12;
}

function getSydneyDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function formatDateLabel(dateKey) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) {
        return 'today';
    }

    return new Intl.DateTimeFormat('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function getScheduleMinutes(request) {
    if (typeof request?.scheduledHour !== 'number' || typeof request?.scheduledMinute !== 'number') {
        return null;
    }
    return request.scheduledHour * 60 + request.scheduledMinute;
}

function formatScheduleTime(minutes) {
    if (!Number.isFinite(minutes)) {
        return 'Unscheduled';
    }

    const hour24 = Math.floor(minutes / 60) % 24;
    const minute = Math.floor(minutes % 60);
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatStatusLabel(request) {
    const rawStatus = String(request?.deliveryStatus || 'scheduled').toLowerCase();
    const statusMap = {
        scheduled: 'Scheduled',
        in_transit: 'In transit',
        transit: 'In transit',
        unloading: 'Unloading',
        complete: 'Complete',
        completed: 'Complete',
        return_transit: 'Return transit',
    };
    const label = statusMap[rawStatus] || rawStatus.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
    return request?.archivedAt ? `${label} / archived` : label;
}

function getScheduleDescription(request) {
    if (request?.routeType === 'secondary' && request?.secondaryRoute) {
        return [
            request.secondaryRoute.reason || 'External route',
            request.secondaryRoute.destination,
        ].filter(Boolean).join(' - ');
    }

    return [
        request?.builderName,
        request?.projectName || request?.details || 'Material delivery',
    ].filter(Boolean).join(' - ') || 'Material delivery';
}

function dedupeRequests(requests) {
    const seen = new Set();
    return (requests || []).filter(request => {
        if (!request?.id || seen.has(request.id)) {
            return false;
        }
        seen.add(request.id);
        return true;
    });
}

function buildTruckScheduleReply(question, requests) {
    const todayKey = getSydneyDateKey();
    const todayLabel = formatDateLabel(todayKey);
    const requestedHour = getRequestedScheduleHour(question);
    const scheduledRows = dedupeRequests(requests)
        .filter(request => request?.scheduledDate === todayKey)
        .filter(request => !request?.scheduleRemovedAt)
        .filter(request => Number.isFinite(getScheduleMinutes(request)))
        .filter(request => requestedHour === null || request.scheduledHour === requestedHour)
        .sort((a, b) => getScheduleMinutes(a) - getScheduleMinutes(b));

    if (!scheduledRows.length) {
        const hourLabel = requestedHour === null ? '' : ` for ${formatScheduleTime(requestedHour * 60)}`;
        return `I cannot see any truck deliveries scheduled${hourLabel} today, ${todayLabel}.\n\nSource: live transport schedule.`;
    }

    const truckCount = new Set(scheduledRows.map(request => request.scheduledTruckLabel || request.truckLabel || 'Unassigned truck')).size;
    const heading = requestedHour === null
        ? `For today, ${todayLabel}, I can see ${scheduledRows.length} scheduled ${scheduledRows.length === 1 ? 'delivery' : 'deliveries'} across ${truckCount} ${truckCount === 1 ? 'truck' : 'trucks'}.`
        : `For ${formatScheduleTime(requestedHour * 60)} today, ${todayLabel}, I can see ${scheduledRows.length} scheduled ${scheduledRows.length === 1 ? 'delivery' : 'deliveries'} across ${truckCount} ${truckCount === 1 ? 'truck' : 'trucks'}.`;

    const lines = scheduledRows.map(request => {
        const truck = request.scheduledTruckLabel || request.truckLabel || 'Unassigned truck';
        return `${formatScheduleTime(getScheduleMinutes(request))} - ${truck} - ${getScheduleDescription(request)} (${formatStatusLabel(request)})`;
    });

    return `${heading}\n\n${lines.join('\n')}\n\nSource: live transport schedule.`;
}

async function tryBuildLocalTruckScheduleReply(question) {
    if (!isTruckScheduleQuestion(question)) {
        return null;
    }

    const [active, archived] = await Promise.all([
        materialOrderRequestsAPI.listActiveRequests({ includeArchived: true }).catch(() => []),
        materialOrderRequestsAPI.listArchivedRequests().catch(() => []),
    ]);
    return buildTruckScheduleReply(question, [...active, ...archived]);
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
            const localScheduleReply = await tryBuildLocalTruckScheduleReply(text);
            if (localScheduleReply) {
                setMessages(current => [
                    ...current,
                    {
                        role: 'assistant',
                        content: localScheduleReply,
                        links: [],
                    },
                ]);
                return;
            }

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
