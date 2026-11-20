import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

const getUserInitials = (user) => {
    const label = user.fullName || user.email || '';
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return label.slice(0, 2).toUpperCase() || 'U';
};

const getUserRoleLabel = (user) => (
    user.employeeTitle
    || user.EmployeeTitle
    || (user.role ? user.role.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '')
);

export function RecipientAvatar({ user, avatarUrls }) {
    const lookupId = user.employeeId || user.EmployeeId || user.id;
    const avatarUrl = user.resolvedAvatarUrl || user.profileImageUrl || user.avatarUrl || user.AvatarUrl || avatarUrls?.[lookupId] || '';
    return (
        <span className={`recipient-avatar${avatarUrl ? ' has-image' : ''}`} aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : getUserInitials(user)}
        </span>
    );
}

export default function DrawingRecipientPicker({ label, users, selected, onToggle, loading, disabled, avatarUrls, showChips = false }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const root = useRef(null);
    const search = useRef(null);
    const id = useId();

    useLayoutEffect(() => {
        if (!open) return;
        const field = root.current;
        const body = field.closest('.drawing-body');
        function positionList() {
            const bounds = body.getBoundingClientRect();
            const anchor = field.getBoundingClientRect();
            const above = anchor.top - bounds.top;
            const below = bounds.bottom - anchor.bottom;
            const flip = below < 190 && above > below;
            field.dataset.flip = String(flip);
            field.style.setProperty('--list-height', Math.max(0, Math.min(190, (flip ? above : below) - 6)) + 'px');
        }
        positionList();
        const observer = new ResizeObserver(positionList);
        observer.observe(body);
        observer.observe(field);
        body.addEventListener('scroll', positionList);
        return () => {
            observer.disconnect();
            body.removeEventListener('scroll', positionList);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function outside(event) {
            if (!root.current.contains(event.target)) setOpen(false);
        }
        document.addEventListener('pointerdown', outside, true);
        return () => document.removeEventListener('pointerdown', outside, true);
    }, [open]);

    const term = query.trim().toLowerCase();
    const matches = users.filter(user => [user.fullName, user.email].some(value => value?.toLowerCase().includes(term)));
    return (
        <div className="upload-field drawing-notify" ref={root}
            onBlur={event => { if (event.relatedTarget && !root.current.contains(event.relatedTarget)) setOpen(false); }}
            onKeyDown={event => {
                if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    event.stopPropagation();
                    search.current.focus();
                    setOpen(false);
                }
                if (event.key === 'Enter' && event.target === search.current) event.preventDefault();
            }}>
            <div className="upload-field-row">
                <label htmlFor={id}>{label}</label>
                {!showChips && selected.length > 0 && <small>{selected.length} selected</small>}
            </div>
            <div className="upload-user-search">
                <span aria-hidden="true"><Search /></span>
                <input ref={search} id={id} type="search" value={query} disabled={disabled}
                    onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
                    onChange={event => { setQuery(event.target.value); setOpen(true); }}
                    placeholder="Search by name or email" />
                <button type="button" disabled={disabled} aria-label="Toggle recipient list" aria-expanded={open}
                    aria-controls={open ? id + '-list' : undefined} onClick={() => setOpen(!open)}><ChevronDown size={16} /></button>
            </div>
            {showChips && selected.length > 0 && <div className="drawing-user-chips">
                {users.filter(user => selected.includes(user.id)).map(user => (
                    <button key={user.id} type="button" disabled={disabled} onClick={() => onToggle(user.id)}
                        aria-label={`Remove ${user.fullName || user.email}`}>
                        <RecipientAvatar user={user} />{user.fullName || user.email}<X size={13} />
                    </button>
                ))}
            </div>}
            {open && <div id={id + '-list'} className="recipient-selection upload-recipient-list" role="group" aria-label={label}>
                {loading || !matches.length ? <div className="recipient-loading">{loading ? 'Loading users…' : 'No matching users'}</div>
                    : matches.map(user => (
                        <button key={user.id} type="button" role="checkbox" className="recipient-checkbox"
                            aria-checked={selected.includes(user.id)} disabled={disabled} onClick={() => onToggle(user.id)}>
                            <span className="drawing-recipient-check" aria-hidden="true"><Check size={12} /></span>
                            <RecipientAvatar user={user} avatarUrls={avatarUrls} />
                            <span><strong>{user.fullName || user.email}</strong><small>{user.email}</small></span>
                            <span className="recipient-role">{getUserRoleLabel(user)}</span>
                        </button>
                    ))}
            </div>}
        </div>
    );
}
