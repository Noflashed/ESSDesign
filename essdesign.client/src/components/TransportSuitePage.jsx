import React, { useMemo } from 'react';
import MaterialOrderingPage from './MaterialOrderingPage';
import TruckSchedulePage from './TruckSchedulePage';
import TruckDeliverySchedulePage from './TruckDeliverySchedulePage';
import TransportSettingsPage from './TransportSettingsPage';
import NativeTransportShell from './transport/NativeTransportShell';
import { getTruckAssignment, isTruckDeviceRole } from './transport/transportUtils';
import '../transportNativeParity.css';

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

export default function TransportSuitePage({ user, currentPage, onNavigate, onExit, onLogout }) {
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
      { key: 'truck-schedule', label: 'Dynamic Schedule', icon: 'dynamic' },
      { key: 'material-ordering-active', label: 'Schedule Management', icon: 'schedule', match: ['material-ordering-active', 'material-ordering-archived'] },
      { key: 'material-ordering-new', label: 'Orders', icon: 'orders', match: ['material-ordering-new', 'material-ordering'] },
      { key: 'transport-trips', label: 'Trips', icon: 'trips' },
      { key: 'transport-fleet', label: 'Fleet', icon: 'fleet' },
      { key: 'transport-drivers', label: 'Drivers', icon: 'drivers' },
      { key: 'transport-clients', label: 'Clients', icon: 'clients' },
      { key: 'transport-inventory', label: 'Inventory', icon: 'inventory' },
      { key: 'transport-yard', label: 'Yard', icon: 'yard' },
      { key: 'transport-reports', label: 'Reports', icon: 'reports' },
      { key: 'transport-alerts', label: 'Alerts', icon: 'alerts', badge: '3' },
      { key: 'transport-settings', label: 'Settings', icon: 'settings' },
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
    if (currentPage === 'transport-settings') {
      return <TransportSettingsPage user={user} onLogout={onLogout} />;
    }
    if (['transport-trips', 'transport-fleet', 'transport-clients', 'transport-inventory', 'transport-yard', 'transport-reports', 'transport-alerts'].includes(currentPage)) {
      const title = currentPage.replace('transport-', '').replace(/^\w/, value => value.toUpperCase());
      return (
        <TransportPlaceholderPage
          eyebrow="ESS Transport"
          title={title}
          description={`${title} will use the same desktop transport shell and can be wired into the live transport data next.`}
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
      return <MaterialOrderingPage user={user} view="form" onNavigate={onNavigate} />;
    }
    if (currentPage === 'material-ordering-active') {
      return <MaterialOrderingPage user={user} view="active" onNavigate={onNavigate} />;
    }
    if (currentPage === 'material-ordering-archived') {
      return <MaterialOrderingPage user={user} view="archived" onNavigate={onNavigate} />;
    }
    return <TruckSchedulePage user={user} onNavigate={onNavigate} />;
  }, [currentPage, onNavigate, user]);

  return (
    <NativeTransportShell
      navItems={navItems}
      currentPage={currentPage}
      content={content}
      user={user}
      isTruckRole={isTruckRole}
      assignedTruck={assignedTruck}
      onNavigate={onNavigate}
      onExit={onExit}
      onLogout={onLogout}
    />
  );
}
