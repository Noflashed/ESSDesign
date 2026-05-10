import React, { useEffect, useMemo, useRef } from 'react';
import MaterialOrderingPage from './MaterialOrderingPage';
import TruckSchedulePage from './TruckSchedulePage';
import TruckDeliverySchedulePage from './TruckDeliverySchedulePage';
import TransportSettingsPage from './TransportSettingsPage';
import TransportFleetPage from './TransportFleetPage';
import NativeTransportShell from './transport/NativeTransportShell';
import { getTruckAssignment, isTruckDeviceRole } from './transport/transportUtils';
import { truckLiveLocationsAPI } from '../services/api';
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

function distanceMeters(a, b) {
  if (!a || !b) {
    return Infinity;
  }
  const earthRadius = 6371000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const deltaLat = (b.latitude - a.latitude) * Math.PI / 180;
  const deltaLon = (b.longitude - a.longitude) * Math.PI / 180;
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function useTruckLocationPublisher(isTruckRole, assignedTruck, user) {
  const lastSentRef = useRef(null);
  const sendingRef = useRef(false);
  const warningLoggedRef = useRef(false);

  useEffect(() => {
    if (!isTruckRole || !assignedTruck || typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }

    const publishPosition = async (position) => {
      const { coords } = position;
      const nextLocation = {
        truckId: assignedTruck.id,
        truckLabel: assignedTruck.rego,
        roleName: assignedTruck.role,
        driverUserId: user?.id || user?.email || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyM: coords.accuracy,
        headingDeg: coords.heading,
        speedMps: coords.speed,
        status: coords.speed && coords.speed > 1.4 ? 'moving' : 'idle',
        recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
      };
      const now = Date.now();
      const lastSent = lastSentRef.current;
      const movedMeters = distanceMeters(lastSent, nextLocation);
      const minIntervalMs = nextLocation.speedMps && nextLocation.speedMps > 1.4 ? 8000 : 30000;

      if (
        lastSent
        && now - lastSent.sentAt < minIntervalMs
        && movedMeters < 25
      ) {
        return;
      }
      if (sendingRef.current) {
        return;
      }

      sendingRef.current = true;
      try {
        await truckLiveLocationsAPI.upsertLocation(nextLocation);
        lastSentRef.current = {
          ...nextLocation,
          sentAt: now,
        };
      } catch (error) {
        if (!warningLoggedRef.current) {
          warningLoggedRef.current = true;
          console.warn('Unable to publish truck live location:', error);
        }
      } finally {
        sendingRef.current = false;
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      publishPosition,
      error => {
        if (!warningLoggedRef.current) {
          warningLoggedRef.current = true;
          console.warn('Truck live location permission/error:', error);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [assignedTruck, isTruckRole, user?.email, user?.id]);
}

export default function TransportSuitePage({ user, currentPage, onNavigate, onExit, onLogout }) {
  const isTruckRole = isTruckDeviceRole(user?.role);
  const assignedTruck = getTruckAssignment(user?.role);
  useTruckLocationPublisher(isTruckRole, assignedTruck, user);

  const navItems = useMemo(() => {
    if (isTruckRole) {
      return [
        { key: 'transport-dashboard', label: 'Dashboard', icon: 'dashboard', disabled: true },
        { key: 'truck-schedule', label: 'Dynamic Schedule', icon: 'dynamic' },
        { key: 'truck-delivery-schedule', label: 'Delivery Schedule', icon: 'schedule' },
      ];
    }
    return [
      { key: 'transport-dashboard', label: 'Dashboard', icon: 'dashboard', disabled: true },
      { key: 'truck-schedule', label: 'Dynamic Schedule', icon: 'dynamic' },
      { key: 'material-ordering-active', label: 'Schedule Management', icon: 'schedule', match: ['material-ordering-active', 'material-ordering-archived'] },
      { key: 'material-ordering-new', label: 'Material Orders', icon: 'orders', match: ['material-ordering-new', 'material-ordering'] },
      { key: 'transport-trips', label: 'Trips', icon: 'trips', disabled: true },
      { key: 'transport-fleet', label: 'Fleet', icon: 'fleet' },
      { key: 'transport-drivers', label: 'Drivers', icon: 'drivers', disabled: true },
      { key: 'transport-clients', label: 'Clients', icon: 'clients', disabled: true },
      { key: 'transport-inventory', label: 'Inventory', icon: 'inventory', disabled: true },
      { key: 'transport-yard', label: 'Yard', icon: 'yard', disabled: true },
      { key: 'transport-reports', label: 'Reports', icon: 'reports', disabled: true },
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
    if (currentPage === 'transport-fleet') {
      return <TransportFleetPage user={user} />;
    }
    if (['transport-trips', 'transport-clients', 'transport-inventory', 'transport-yard', 'transport-reports', 'transport-alerts'].includes(currentPage)) {
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
