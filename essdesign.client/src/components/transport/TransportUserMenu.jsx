import React, { useEffect, useMemo, useRef, useState } from 'react';

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

export function getTransportUserInitials(user, fallback = 'U') {
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

export function getTransportRoleDisplayName(role) {
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

function UserProfileIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 21C20 17.6863 16.866 15 13 15H11C7.13401 15 4 17.6863 4 21"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="8"
        r="4"
        stroke={color}
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function UserAvatar({ className, user, avatarUrl, initials, displayName, onAvatarError, showProfileGlyph = false }) {
  return (
    <div className={className} aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt={displayName} className="profile-avatar-image" onError={onAvatarError} />
      ) : (
        initials
      )}
      {showProfileGlyph ? (
        <span className="transport-account-profile-glyph" aria-hidden="true">
          <UserProfileIcon size={12} />
        </span>
      ) : null}
    </div>
  );
}

export default function TransportUserMenu({
  user,
  assignedTruck = null,
  isTruckRole = false,
  onLogout,
  onExit,
  variant = 'topbar',
}) {
  const menuRef = useRef(null);
  const avatarCandidates = useMemo(() => buildAvatarCandidates(user), [user]);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const avatarUrl = avatarCandidates[avatarIndex] || null;
  const displayName = user?.fullName || user?.name || user?.email || assignedTruck?.rego || 'User';
  const displayRole = getTransportRoleDisplayName(user?.role);
  const initials = getTransportUserInitials(user, isTruckRole ? (assignedTruck?.rego || 'TR').slice(-2) : 'U');

  useEffect(() => {
    setAvatarIndex(0);
  }, [user?.id, user?.avatarUrl, user?.avatar_url, user?.picture, user?.profileImageUrl, user?.profile_image_url, user?.avatarPath, user?.avatar_path]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleAvatarError = () => {
    setAvatarIndex(current => (current + 1 < avatarCandidates.length ? current + 1 : current));
  };

  const handleLogout = () => {
    setOpen(false);
    onLogout?.();
  };

  const handleExit = () => {
    setOpen(false);
    onExit?.();
  };

  return (
    <div className={`transport-account-menu transport-account-menu-${variant}`} ref={menuRef}>
      {variant === 'rail' ? (
        <button
          type="button"
          className="transport-desktop-user transport-desktop-profile-trigger"
          onClick={() => setOpen(current => !current)}
          title="Open user menu"
          aria-label="Open user menu"
          aria-expanded={open}
        >
          <UserAvatar
            className="transport-desktop-avatar transport-account-avatar"
            user={user}
            avatarUrl={avatarUrl}
            initials={initials}
            displayName={displayName}
            onAvatarError={handleAvatarError}
            showProfileGlyph
          />
          <div className="transport-desktop-user-copy">
            <strong title={displayName}>{displayName}</strong>
            <span title={displayRole}>{displayRole}</span>
          </div>
          <ChevronDownIcon />
        </button>
      ) : (
        <button
          type="button"
          className="profile-button transport-account-profile-button"
          onClick={() => setOpen(current => !current)}
          title="Open user menu"
          aria-label="Open user menu"
          aria-expanded={open}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="profile-avatar-image" onError={handleAvatarError} />
          ) : (
            <span className="profile-button-initials" aria-hidden="true">{initials}</span>
          )}
          <span className="profile-button-icon" aria-hidden="true">
            <UserProfileIcon size={16} />
          </span>
        </button>
      )}

      {open ? (
        <div className="user-menu-dropdown transport-account-dropdown">
          <div className="user-menu-summary">
            <UserAvatar
              className="user-menu-avatar"
              user={user}
              avatarUrl={avatarUrl}
              initials={initials}
              displayName={displayName}
              onAvatarError={handleAvatarError}
            />
            <div className="user-menu-details">
              <div className="user-name">{displayName}</div>
              <div className="user-email">{user?.email}</div>
              <div className="user-title">{displayRole}</div>
            </div>
          </div>
          {onExit ? (
            <button type="button" className="user-menu-action transport-account-exit-action" onClick={handleExit}>
              Back to ESS app
            </button>
          ) : null}
          <button type="button" className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
