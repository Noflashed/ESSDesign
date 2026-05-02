import React, { useEffect, useMemo, useState } from 'react';

const ESS_LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';
const SUPABASE_BASE_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co';

function normalizeAvatarSource(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return [trimmed];
  }

  const normalizedPath = trimmed.replace(/^\/+/, '');
  if (normalizedPath.startsWith('storage/v1/')) {
    return [`${SUPABASE_BASE_URL}/${normalizedPath}`];
  }

  return [
    `${SUPABASE_BASE_URL}/storage/v1/object/public/${normalizedPath}`,
    `${SUPABASE_BASE_URL}/storage/v1/object/public/public-assets/${normalizedPath}`,
  ];
}

function buildAvatarCandidates(user) {
  const rawValues = [
    user?.avatarUrl,
    user?.avatar_url,
    user?.picture,
    user?.profileImageUrl,
    user?.profile_image_url,
    user?.profileImage,
    user?.profile_image,
    user?.avatarPath,
    user?.avatar_path,
  ].filter(Boolean);

  return [...new Set(rawValues.flatMap(normalizeAvatarSource))];
}

function getInitials(user, fallback = 'U') {
  const name = user?.fullName || user?.name || '';
  if (name.trim()) {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('');
  }
  return user?.email?.[0]?.toUpperCase() || fallback;
}

function getRoleDisplayName(role) {
  switch (role) {
    case 'admin': return 'Admin';
    case 'scaffold_designer': return 'Scaffold Designer';
    case 'site_supervisor': return 'Site Supervisor';
    case 'project_manager': return 'Project Manager';
    case 'leading_hand': return 'Leading Hand';
    case 'general_scaffolder': return 'General Scaffolder';
    case 'transport_management': return 'Transport Management';
    case 'truck_ess01': return 'Truck ESS01';
    case 'truck_ess02': return 'Truck ESS02';
    case 'truck_ess03': return 'Truck ESS03';
    default: return 'Viewer';
  }
}

function TransportIcon({ type }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (type === 'dashboard') {
    return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  }
  if (type === 'dynamic') {
    return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h3M8 18h6" /></svg>;
  }
  if (type === 'schedule') {
    return <svg {...common}><path d="M9 5H7a2 2 0 0 0-2 2v12l4-2 4 2 4-2 4 2V7a2 2 0 0 0-2-2h-2" /><rect x="8" y="3" width="8" height="4" rx="1" /></svg>;
  }
  if (type === 'orders') {
    return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></svg>;
  }
  if (type === 'trips') {
    return <svg {...common}><path d="M4 17 10 5l4 12 3-6 3 6" /></svg>;
  }
  if (type === 'fleet') {
    return <svg {...common}><path d="M10 17H4V7h10v10h-2" /><path d="M14 10h4l3 3v4h-3" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>;
  }
  if (type === 'drivers' || type === 'clients') {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.8M16 3.2a4 4 0 0 1 0 7.6" /></svg>;
  }
  if (type === 'inventory') {
    return <svg {...common}><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>;
  }
  if (type === 'yard') {
    return <svg {...common}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>;
  }
  if (type === 'reports') {
    return <svg {...common}><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 3v6h6M8 17v-4M12 17V9M16 17v-2" /></svg>;
  }
  if (type === 'alerts') {
    return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
  }
  if (type === 'settings') {
    return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.35.43.7.6 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-.5 1Z" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
}

function ExitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default function NativeTransportShell({
  navItems,
  currentPage,
  content,
  user,
  isTruckRole,
  assignedTruck,
  onNavigate,
  onExit,
}) {
  const avatarCandidates = useMemo(() => buildAvatarCandidates(user), [user]);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const avatarUrl = avatarCandidates[avatarIndex] || null;
  const displayName = user?.fullName || user?.name || user?.email || assignedTruck?.rego || 'User';
  const displayRole = getRoleDisplayName(user?.role);
  const initials = getInitials(user, isTruckRole ? (assignedTruck?.rego || 'TR').slice(-2) : 'U');

  useEffect(() => {
    setAvatarIndex(0);
  }, [user?.id, user?.avatarUrl, user?.avatar_url, user?.picture, user?.profileImageUrl, user?.profile_image_url, user?.avatarPath, user?.avatar_path]);

  return (
    <div className={`transport-desktop-shell${railCollapsed ? ' rail-collapsed' : ''}`}>
      <aside className="transport-desktop-rail">
        <div className="transport-desktop-rail-top">
          <div className="transport-desktop-brand">
            <img src={ESS_LOGO_URL} alt="ESS Transport" className="transport-desktop-brand-logo" />
            <button
              type="button"
              className="transport-desktop-collapse"
              onClick={() => setRailCollapsed(current => !current)}
              aria-label={railCollapsed ? 'Expand transport sidebar' : 'Collapse transport sidebar'}
              aria-expanded={!railCollapsed}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <nav className="transport-desktop-nav" aria-label="ESS Transport">
            {navItems.map(item => {
              const active = currentPage === item.key || item.match?.includes(currentPage);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`transport-desktop-nav-item${active ? ' active' : ''}`}
                  onClick={() => onNavigate(item.key)}
                  title={item.label}
                >
                  <TransportIcon type={item.icon} />
                  <span>{item.label}</span>
                  {item.badge ? <b>{item.badge}</b> : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="transport-desktop-user">
          <div className="transport-desktop-avatar" aria-hidden="true">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                onError={() => setAvatarIndex(current => (current + 1 < avatarCandidates.length ? current + 1 : current))}
              />
            ) : (
              initials
            )}
          </div>
          <div>
            <strong title={displayName}>{displayName}</strong>
            <span title={displayRole}>{displayRole}</span>
          </div>
          <button type="button" onClick={onExit || (() => window.history.back())} aria-label="Back to ESS app">
            <ExitIcon />
          </button>
        </div>
      </aside>

      <main className="transport-desktop-workspace" data-transport-role={isTruckRole ? assignedTruck?.rego || 'truck' : 'management'}>
        {content}
      </main>
    </div>
  );
}
