import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { truckLiveLocationsAPI } from '../services/api';
import { TRUCK_LANES } from './transport/transportUtils';

const FLEET_REFRESH_MS = 10 * 1000;
const SYDNEY_CENTER = [-33.8688, 151.2093];

const FALLBACK_POSITIONS = {
  'truck-1': { latitude: -33.7047, longitude: 150.9231 },
  'truck-2': { latitude: -33.7986, longitude: 151.2683 },
  'truck-3': { latitude: -33.9328, longitude: 150.9178 },
};

const TRUCK_VISUALS = {
  'truck-1': { color: '#4CAF50', routeColor: '#5DBD56' },
  'truck-2': { color: '#F59A23', routeColor: '#F6A33A' },
  'truck-3': { color: '#2388E9', routeColor: '#2388E9' },
};

function toNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character]));
}

function truckSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7.5h10.1v8.1H4z" />
      <path d="M14.1 10h3.8l2.1 2.7v2.9h-5.9z" />
      <circle cx="7.3" cy="16.3" r="1.7" />
      <circle cx="17.2" cy="16.3" r="1.7" />
    </svg>
  `;
}

function formatLastPing(recordedAt, now) {
  if (!recordedAt) {
    return 'No phone ping yet';
  }
  const timestamp = new Date(recordedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Ping time unknown';
  }
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

function classifyTruck(location, speedKmh, now) {
  if (!location) {
    return { key: 'offline', label: 'Awaiting GPS', color: '#7B8492' };
  }

  const explicitStatus = String(location.status || '').trim().toLowerCase();
  const recordedAt = new Date(location.recordedAt || location.updatedAt || 0).getTime();
  const ageMs = Number.isFinite(recordedAt) ? now - recordedAt : Infinity;

  if (ageMs > 5 * 60 * 1000) {
    return { key: 'stale', label: 'GPS stale', color: '#7B8492' };
  }

  if (explicitStatus.includes('return')) {
    return { key: 'returning', label: 'Returning to yard', color: '#2388E9' };
  }

  if (explicitStatus.includes('route') || explicitStatus.includes('transit')) {
    return { key: 'on-route', label: 'On route', color: '#F59A23' };
  }

  if (speedKmh > 5) {
    return { key: 'moving', label: 'Moving', color: '#4CAF50' };
  }

  return { key: 'idle', label: 'Idle', color: '#F59A23' };
}

function formatSpeed(speedKmh) {
  if (!Number.isFinite(speedKmh) || speedKmh < 1) {
    return '0 km/h';
  }
  return `${Math.round(speedKmh)} km/h`;
}

function formatBattery(value) {
  const percent = toNumber(value);
  if (percent === null) {
    return '--';
  }
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

function markerIcon(truck) {
  const markerClass = `fleet-live-marker is-${truck.status.key}`;
  const color = truck.status.color || truck.visual.color;
  const heading = Number.isFinite(truck.headingDeg) ? truck.headingDeg : 0;
  const headingClass = Number.isFinite(truck.headingDeg) && truck.hasLiveLocation ? ' visible' : '';
  const html = `
    <div class="${markerClass}" style="--truck-color:${escapeHtml(color)};--heading:${heading}deg">
      <span class="fleet-live-marker-pulse"></span>
      <span class="fleet-live-heading${headingClass}"></span>
      <span class="fleet-live-marker-core">${truckSvg()}</span>
      <strong>${escapeHtml(truck.rego)}</strong>
      <span class="fleet-live-marker-chip">
        <i></i><b>${escapeHtml(formatSpeed(truck.speedKmh))}</b>
        <em>${escapeHtml(truck.lastPingLabel)}</em>
      </span>
    </div>
  `;

  return L.divIcon({
    className: 'fleet-live-leaflet-icon',
    html,
    iconSize: [118, 130],
    iconAnchor: [59, 64],
  });
}

function FleetMapController({ trucks, selectedTruckId, followVersion }) {
  const map = useMap();
  const boundsKey = trucks.map(truck => `${truck.id}:${truck.latitude?.toFixed(5)}:${truck.longitude?.toFixed(5)}`).join('|');

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    const selectedTruck = trucks.find(truck => truck.id === selectedTruckId && truck.hasPosition);
    if (selectedTruck) {
      map.setView([selectedTruck.latitude, selectedTruck.longitude], Math.max(map.getZoom(), 13), { animate: true });
      return;
    }

    const points = trucks
      .filter(truck => truck.hasPosition)
      .map(truck => [truck.latitude, truck.longitude]);

    if (points.length === 0) {
      map.setView(SYDNEY_CENTER, 10, { animate: true });
      return;
    }

    map.fitBounds(points, {
      paddingTopLeft: [58, 58],
      paddingBottomRight: [420, 170],
      maxZoom: 12,
      animate: true,
    });
  }, [boundsKey, followVersion, map, selectedTruckId]);

  return null;
}

function FleetControlButton({ label, title, children, onClick }) {
  return (
    <button type="button" className="fleet-live-control" title={title || label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function ControlIcon({ type }) {
  if (type === 'target') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
  }
  if (type === 'layers') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v6h-6" /></svg>;
}

export default function TransportFleetPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedTruckId, setSelectedTruckId] = useState(null);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [followVersion, setFollowVersion] = useState(0);

  const loadLocations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setRefreshing(true);
    }
    try {
      const latest = await truckLiveLocationsAPI.getLatest({ force: true });
      setLocations(latest);
      setLastLoadedAt(new Date());
      setError('');
    } catch (requestError) {
      setError(requestError?.message || 'Could not load live truck locations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = async (silent) => {
      if (!active) return;
      await loadLocations({ silent });
    };
    run(false);
    const interval = window.setInterval(() => run(true), FLEET_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadLocations]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const locationMap = useMemo(() => {
    const map = new Map();
    locations.forEach(location => {
      if (location?.truckId) {
        map.set(location.truckId, location);
      }
      if (location?.truckLabel) {
        map.set(String(location.truckLabel).toUpperCase(), location);
      }
    });
    return map;
  }, [locations]);

  const trucks = useMemo(() => TRUCK_LANES.map(lane => {
    const location = locationMap.get(lane.id) || locationMap.get(lane.rego);
    const fallback = FALLBACK_POSITIONS[lane.id] || { latitude: SYDNEY_CENTER[0], longitude: SYDNEY_CENTER[1] };
    const latitude = toNumber(location?.latitude) ?? fallback.latitude;
    const longitude = toNumber(location?.longitude) ?? fallback.longitude;
    const speedMps = toNumber(location?.speedMps) ?? 0;
    const speedKmh = speedMps * 3.6;
    const status = classifyTruck(location, speedKmh, now);
    const visual = TRUCK_VISUALS[lane.id] || { color: status.color, routeColor: status.color };

    return {
      id: lane.id,
      rego: lane.rego,
      role: lane.role,
      latitude,
      longitude,
      hasPosition: Number.isFinite(latitude) && Number.isFinite(longitude),
      hasLiveLocation: Boolean(location),
      speedKmh,
      headingDeg: toNumber(location?.headingDeg),
      accuracyM: toNumber(location?.accuracyM),
      batteryPercent: toNumber(location?.batteryPercent),
      recordedAt: location?.recordedAt || location?.updatedAt || null,
      updatedAt: location?.updatedAt || null,
      driverUserId: location?.driverUserId || null,
      deliveryRequestId: location?.deliveryRequestId || null,
      routePath: Array.isArray(location?.routePath)
        ? location.routePath
            .map(point => [toNumber(point?.latitude ?? point?.lat), toNumber(point?.longitude ?? point?.lon ?? point?.lng)])
            .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
        : [],
      status,
      visual,
      lastPingLabel: formatLastPing(location?.recordedAt || location?.updatedAt, now),
    };
  }), [locationMap, now]);

  const selectedTruck = selectedTruckId ? trucks.find(truck => truck.id === selectedTruckId) : null;
  const liveCount = trucks.filter(truck => truck.hasLiveLocation && truck.status.key !== 'stale').length;

  return (
    <div className="transport-fleet-live-page">
      <MapContainer
        className="fleet-live-map"
        center={SYDNEY_CENTER}
        zoom={10}
        minZoom={7}
        maxZoom={18}
        zoomControl={false}
        scrollWheelZoom
        dragging
        doubleClickZoom
        touchZoom
        boxZoom
        keyboard
        attributionControl={false}
      >
        <FleetMapController trucks={trucks} selectedTruckId={selectedTruckId} followVersion={followVersion} />
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {trucks.map(truck => truck.routePath.length > 1 ? (
          <Polyline
            key={`${truck.id}-route`}
            positions={truck.routePath}
            pathOptions={{ color: truck.visual.routeColor, weight: 5, opacity: 0.72 }}
          />
        ) : null)}
        {trucks.map(truck => truck.hasPosition ? (
          <Marker
            key={truck.id}
            position={[truck.latitude, truck.longitude]}
            icon={markerIcon(truck)}
            eventHandlers={{ click: () => setSelectedTruckId(truck.id) }}
          >
            <Tooltip direction="top" offset={[0, -44]} opacity={0.96} className="fleet-live-tooltip">
              <strong>{truck.rego}</strong>
              <span>{truck.status.label}</span>
            </Tooltip>
          </Marker>
        ) : null)}
      </MapContainer>

      <div className="fleet-live-controls" aria-label="Fleet map controls">
        <FleetControlButton label="Focus fleet" onClick={() => {
          setSelectedTruckId(null);
          setFollowVersion(value => value + 1);
        }}>
          <ControlIcon type="target" />
        </FleetControlButton>
        <FleetControlButton label="Map layers" title="Map layers placeholder">
          <ControlIcon type="layers" />
        </FleetControlButton>
        <FleetControlButton label="Refresh live locations" onClick={() => loadLocations({ silent: false })}>
          <ControlIcon type="refresh" />
        </FleetControlButton>
      </div>

      <div className="fleet-live-legend" aria-label="Truck status legend">
        <span><i className="moving"></i>Moving</span>
        <span><i className="idle"></i>Idle / on route</span>
        <span><i className="returning"></i>Returning to yard</span>
        <span><i className="stale"></i>GPS stale</span>
      </div>

      <aside className="fleet-live-panel" aria-label="Live truck locations">
        <div className="fleet-live-panel-handle" />
        <div className="fleet-live-panel-summary">
          <div>
            <span>Live fleet</span>
            <strong>{liveCount} of {trucks.length} active</strong>
          </div>
          <small>{lastLoadedAt ? `Updated ${lastLoadedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Waiting for first refresh'}</small>
        </div>

        <div className="fleet-live-list">
          {trucks.map(truck => (
            <button
              type="button"
              key={truck.id}
              className={`fleet-live-card${selectedTruck?.id === truck.id ? ' selected' : ''}`}
              style={{ '--truck-color': truck.status.color || truck.visual.color }}
              onClick={() => setSelectedTruckId(truck.id)}
            >
              <span className="fleet-live-card-avatar">{truckSvg()}</span>
              <span className="fleet-live-card-copy">
                <strong>{truck.rego}</strong>
                <small>{truck.lastPingLabel}</small>
              </span>
              <span className="fleet-live-card-meta">
                <b>{truck.status.label}</b>
                <small>{formatSpeed(truck.speedKmh)}</small>
              </span>
              <span className="fleet-live-card-signal">
                <i></i><i></i><i></i>
                <small>{formatBattery(truck.batteryPercent)}</small>
              </span>
            </button>
          ))}
        </div>

        {selectedTruck ? (
          <div className="fleet-live-detail">
            <div><span>Selected truck</span><strong>{selectedTruck.rego}</strong></div>
            <div><span>Status</span><strong>{selectedTruck.status.label}</strong></div>
            <div><span>Accuracy</span><strong>{Number.isFinite(selectedTruck.accuracyM) ? `${Math.round(selectedTruck.accuracyM)} m` : '--'}</strong></div>
            <div><span>Source</span><strong>{selectedTruck.hasLiveLocation ? 'Phone GPS' : 'Awaiting truck phone'}</strong></div>
          </div>
        ) : null}
      </aside>

      {error ? (
        <div className="fleet-live-error" role="alert">
          <strong>Could not load live locations</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="fleet-live-loading">Loading live fleet...</div>
      ) : null}

      {refreshing ? <div className="fleet-live-refreshing">Refreshing</div> : null}
    </div>
  );
}
