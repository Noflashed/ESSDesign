import React, { useMemo } from 'react';
import MaterialOrderingPage from './MaterialOrderingPage';
import TruckSchedulePage from './TruckSchedulePage';
import TruckDeliverySchedulePage from './TruckDeliverySchedulePage';
import { ESS_NAVY, ESS_ORANGE, getTruckAssignment, isTruckDeviceRole } from './transport/transportUtils';

function SidebarIcon({ type, active }) {
  const color = active ? '#FFFFFF' : ESS_NAVY;
  const wrapClass = `transport-suite-nav-icon${type === 'dynamic' ? ' live' : ''}${active ? ' active' : ''}`;
  return (
    <span className={wrapClass}>
      {type === 'dynamic' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ) : type === 'tracking' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      ) : type === 'schedule' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12l4-2 4 2 4-2 4 2V7a2 2 0 0 0-2-2h-2" />
          <rect x="8" y="3" width="8" height="4" rx="1" />
        </svg>
      ) : type === 'materials' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ) : type === 'archive' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z" />
          <path d="M10 12h4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18" />
          <path d="M12 3v18" />
        </svg>
      )}
      {type === 'dynamic' ? <span className="transport-suite-nav-live-dot" /> : null}
    </span>
  );
}

function TrackingPlaceholder() {
  return (
    <div className="transport-placeholder-card">
      <span className="transport-placeholder-eyebrow">ESS Transport</span>
      <h2>Truck Tracking</h2>
      <p>
        This view is reserved for live truck tracking. The transport suite shell is in place on the web app now, and we can wire the live telemetry into this page next.
      </p>
      <div className="transport-placeholder-pill">Coming soon</div>
    </div>
  );
}

export default function TransportSuitePage({ user, currentPage, onNavigate }) {
  const isTruckRole = isTruckDeviceRole(user?.role);
  const assignedTruck = getTruckAssignment(user?.role);
  const isManagement = user?.role === 'admin' || user?.role === 'transport_management';

  const navItems = useMemo(() => {
    if (isTruckRole) {
      return [
        { key: 'truck-schedule', label: 'Dynamic Schedule', icon: 'dynamic' },
        { key: 'truck-delivery-schedule', label: 'Delivery Schedule', icon: 'schedule' },
        { key: 'truck-tracking', label: 'Truck Tracking', icon: 'tracking' },
      ];
    }
    return [
      { key: 'truck-schedule', label: 'Dynamic Schedule', icon: 'dynamic' },
      { key: 'truck-tracking', label: 'Truck Tracking', icon: 'tracking' },
      { key: 'material-ordering-active', label: 'Schedule Management', icon: 'schedule' },
      { key: 'material-ordering-new', label: 'Material Ordering', icon: 'materials' },
      { key: 'material-ordering-archived', label: 'Archived Orders', icon: 'archive' },
    ];
  }, [isTruckRole]);

  const content = useMemo(() => {
    if (currentPage === 'truck-tracking') {
      return <TrackingPlaceholder />;
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
        <div className="transport-suite-sidebar-head">
          <span className="transport-suite-eyebrow">ESS Transport</span>
          <strong>{isTruckRole ? assignedTruck?.rego || 'Truck Device' : isManagement ? 'Management Suite' : 'Materials'}</strong>
          <p>
            {isTruckRole
              ? 'Driver-facing live delivery tools only.'
              : 'Dynamic scheduling, delivery coordination, and transport status in one place.'}
          </p>
        </div>
        <div className="transport-suite-nav-list">
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
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>
      <section className="transport-suite-content">
        {content}
      </section>
    </div>
  );
}
