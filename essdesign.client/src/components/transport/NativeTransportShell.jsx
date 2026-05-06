import React, { useMemo, useState } from 'react';
import TransportUserMenu from './TransportUserMenu';

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
  if (type === 'home') {
    return <svg {...common}><path d="m3 10 9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
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

export default function NativeTransportShell({
  navItems,
  currentPage,
  content,
  user,
  isTruckRole,
  assignedTruck,
  onNavigate,
  onExit,
  onLogout,
}) {
  const [navSearch, setNavSearch] = useState('');
  const goHome = onExit || (() => window.history.back());
  const showTransportSettingsShortcut = !isTruckRole;
  const normalizedSearch = navSearch.trim().toLowerCase();
  const groupedNavItems = useMemo(() => {
    const primaryKeys = ['transport-dashboard'];
    const operationsKeys = ['truck-schedule', 'truck-delivery-schedule', 'material-ordering-active', 'material-ordering-new'];
    const matchesSearch = (item) => !normalizedSearch || item.label.toLowerCase().includes(normalizedSearch);
    const take = (keys) => navItems.filter(item => keys.includes(item.key) && matchesSearch(item));
    const usedKeys = new Set([...primaryKeys, ...operationsKeys]);
    const groups = [
      { title: '', items: take(primaryKeys) },
      { title: 'Operations', items: take(operationsKeys) },
      { title: 'Resources', items: navItems.filter(item => !usedKeys.has(item.key) && matchesSearch(item)) },
    ];
    return groups.filter(group => group.items.length > 0);
  }, [navItems, normalizedSearch]);

  return (
    <div className="transport-desktop-shell">
      <aside className="transport-desktop-rail">
        <div className="transport-desktop-rail-top">
          <div className="transport-desktop-brand">
            <TransportUserMenu
              user={user}
              isTruckRole={isTruckRole}
              assignedTruck={assignedTruck}
              onLogout={onLogout}
              onExit={goHome}
              variant="rail"
            />
          </div>
          <label className="transport-desktop-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={navSearch}
              onChange={(event) => setNavSearch(event.target.value)}
              placeholder="Search"
              aria-label="Search transport pages"
            />
            {navSearch ? (
              <button type="button" onClick={() => setNavSearch('')} aria-label="Clear transport page search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </label>
          <nav className="transport-desktop-nav" aria-label="ESS Transport">
            {groupedNavItems.map(group => (
              <div className="transport-desktop-nav-group" key={group.title || 'primary'}>
                {group.title ? <div className="transport-desktop-nav-heading">{group.title}</div> : null}
                {group.items.map(item => {
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
              </div>
            ))}
            {groupedNavItems.length === 0 ? (
              <div className="transport-desktop-nav-empty">No pages found</div>
            ) : null}
          </nav>
        </div>

        <div className="transport-desktop-rail-bottom">
          <div className="transport-desktop-nav-group">
            <div className="transport-desktop-nav-heading">Workspace</div>
            {showTransportSettingsShortcut ? (
              <button
                type="button"
                className={`transport-desktop-nav-item transport-desktop-settings-button${currentPage === 'transport-settings' ? ' active' : ''}`}
                onClick={() => onNavigate('transport-settings')}
                title="Transport settings"
                aria-label="Transport settings"
              >
                <TransportIcon type="settings" />
                <span>Settings</span>
              </button>
            ) : null}
            <button
              type="button"
              className="transport-desktop-nav-item transport-desktop-home-button"
              onClick={goHome}
              title="Back to ESS app home"
              aria-label="Back to ESS app home"
            >
              <TransportIcon type="home" />
              <span>Home</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="transport-desktop-workspace" data-transport-role={isTruckRole ? assignedTruck?.rego || 'truck' : 'management'}>
        {content}
      </main>
    </div>
  );
}
