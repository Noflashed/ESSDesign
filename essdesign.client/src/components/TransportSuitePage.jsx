import React, { useMemo } from 'react';
import MaterialOrderingPage from './MaterialOrderingPage';
import TruckSchedulePage from './TruckSchedulePage';
import TruckDeliverySchedulePage from './TruckDeliverySchedulePage';
import { ESS_NAVY, getTruckAssignment, isTruckDeviceRole } from './transport/transportUtils';

function SidebarIcon({ type, active }) {
  const color = active ? '#FFFFFF' : '#B7C4DD';
  const wrapClass = `transport-suite-nav-icon${type === 'dynamic' ? ' live' : ''}${active ? ' active' : ''}`;
  if (type === 'dashboard') {
    return (
      <span className={wrapClass}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </span>
    );
  }
  if (type === 'drivers') {
    return (
      <span className={wrapClass}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 4.13a4 4 0 0 1 0 7.75" />
        </svg>
      </span>
    );
  }
  if (type === 'dynamic') {
    return (
      <span className={wrapClass}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="transport-suite-nav-live-dot" />
      </span>
    );
  }
  if (type === 'tracking') {
    return (
      <span className={wrapClass}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      </span>
    );
  }
  if (type === 'schedule') {
    return (
      <span className={wrapClass}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12l4-2 4 2 4-2 4 2V7a2 2 0 0 0-2-2h-2" />
          <rect x="8" y="3" width="8" height="4" rx="1" />
        </svg>
      </span>
    );
  }
  if (type === 'materials') {
    return (
      <span className={wrapClass}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      </span>
    );
  }
  return (
    <span className={wrapClass}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h18" />
        <path d="M12 3v18" />
      </svg>
    </span>
  );
}

function TransportPlaceholderPage({ eyebrow, title, description }) {
  return (
    <div className="ts2-page transport-placeholder-page">
      <div className="transport-placeholder-card transport-placeholder-card-shell">
        <span className="transport-placeholder-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function TransportSuitePage({ user, currentPage, onNavigate, onExit }) {
  const isTruckRole = isTruckDeviceRole(user?.role);
  const assignedTruck = getTruckAssignment(user?.role);

  const navItems = useMemo(() => {
    if (isTruckRole) {
      return [
        { key: 'transport-dashboard', label: 'Dashboard', icon: 'dashboard' },
        { key: 'truck-schedule', label: 'Dynamic Schedule', icon: 'dynamic' },
        { key: 'truck-delivery-schedule', label: 'Delivery Schedule', icon: 'schedule' },
      ];
    }
    return [
      { key: 'transport-dashboard', label: 'Dashboard', icon: 'dashboard' },
      { key: 'transport-drivers', label: 'Drivers', icon: 'drivers' },
      { key: 'truck-schedule', label: 'Dynamic Schedule', icon: 'dynamic' },
      { key: 'truck-tracking', label: 'Truck Tracking', icon: 'tracking' },
      { key: 'material-ordering-active', label: 'Schedule Management', icon: 'schedule' },
      { key: 'material-ordering-new', label: 'Material Ordering', icon: 'materials' },
    ];
  }, [isTruckRole]);

  const content = useMemo(() => {
    if (currentPage === 'transport-dashboard') {
      return (
        <TransportPlaceholderPage
          eyebrow="ESS Transport"
          title="Dashboard"
          description="This dashboard shell now matches the iOS transport workspace. We can wire the live management summary into this page next."
        />
      );
    }
    if (currentPage === 'transport-drivers') {
      return (
        <TransportPlaceholderPage
          eyebrow="ESS Transport"
          title="Drivers"
          description="This page is reserved for the transport driver management view. The shell and navigation now match the iOS transport suite."
        />
      );
    }
    if (currentPage === 'truck-tracking') {
      return (
        <TransportPlaceholderPage
          eyebrow="ESS Transport"
          title="Truck Tracking"
          description="This page is reserved for live truck tracking. The transport suite shell is now aligned to the iOS app, and the live telemetry can be wired in next."
        />
      );
    }
    if (currentPage === 'truck-delivery-schedule') {
      return <TruckDeliverySchedulePage user={user} />;
    }
    if (currentPage === 'material-ordering-new' || currentPage === 'material-ordering') {
      return <MaterialOrderingPage user={user} view="form" />;
    }
    if (currentPage === 'material-ordering-active') {
      return <MaterialOrderingPage user={user} view="active" />;
    }
    if (currentPage === 'material-ordering-archived') {
      return <MaterialOrderingPage user={user} view="archived" />;
    }
    return <TruckSchedulePage user={user} onNavigate={onNavigate} />;
  }, [currentPage, onNavigate, user]);

  return (
    <div className="transport-suite-shell">
      <aside className="transport-suite-sidebar">
        <div className="transport-side-rail-top">
          <div className="transport-side-rail-brand">
            <div className="transport-side-rail-logo">
              <span className="transport-side-rail-logo-text">ESS</span>
            </div>
            <span className="transport-side-rail-brand-text">Transport</span>
          </div>
          <div className="transport-suite-nav-list transport-side-rail-nav">
            {navItems.map(item => {
              const active = currentPage === item.key || (item.key === 'material-ordering-new' && currentPage === 'material-ordering');
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`transport-suite-nav-item${active ? ' active' : ''}`}
                  onClick={() => onNavigate(item.key)}
                >
                  <SidebarIcon type={item.icon} active={active} />
                  <span className={`transport-suite-nav-label${active ? ' active' : ''}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="transport-side-rail-back"
          onClick={() => {
            if (onExit) {
              onExit();
              return;
            }
            window.history.back();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B7C4DD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back</span>
        </button>
      </aside>
      <section className="transport-suite-content" data-transport-role={isTruckRole ? assignedTruck?.rego || 'truck' : 'management'}>
        {content}
      </section>
    </div>
  );
}
