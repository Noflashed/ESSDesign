import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { truckLiveLocationsAPI } from '../services/api';
import { TRUCK_LANES } from './transport/transportUtils';

const FLEET_REFRESH_MS = 3 * 1000;
const FLEET_HIDDEN_REFRESH_MS = 30 * 1000;
const ROUTE_HISTORY_LOOKBACK_HOURS = 8;
const ROUTE_HISTORY_REFRESH_MS = 20 * 1000;
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

const addressRequestCache = new Map();

function addressCacheKey(latitude, longitude) {
  return `${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}`;
}

function readCachedAddress(key) {
  try {
    const raw = window.localStorage.getItem(`ess-fleet-stationary-address:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.address || !parsed?.cachedAt) return null;
    if (Date.now() - Number(parsed.cachedAt) > 30 * 24 * 60 * 60 * 1000) return null;
    return parsed.address;
  } catch {
    return null;
  }
}

function writeCachedAddress(key, address) {
  try {
    window.localStorage.setItem(`ess-fleet-stationary-address:${key}`, JSON.stringify({
      address,
      cachedAt: Date.now(),
    }));
  } catch {
    // Address display is optional; ignore storage failures.
  }
}

async function reverseGeocodeStationaryAddress(latitude, longitude) {
  const key = addressCacheKey(latitude, longitude);
  const cached = readCachedAddress(key);
  if (cached) return cached;
  if (addressRequestCache.has(key)) return addressRequestCache.get(key);

  const request = fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`, {
    headers: { Accept: 'application/json' },
  })
    .then(response => response.ok ? response.json() : null)
    .then(payload => {
      const address = payload?.address || {};
      const road = address.road || address.pedestrian || address.neighbourhood || address.suburb;
      const suburb = address.suburb || address.town || address.city || address.municipality;
      const state = address.state || address.region;
      const displayAddress = [road, suburb, state].filter(Boolean).join(', ') || payload?.display_name || '';
      if (displayAddress) {
        writeCachedAddress(key, displayAddress);
      }
      return displayAddress || null;
    })
    .catch(() => null);

  addressRequestCache.set(key, request);
  return request;
}

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

function truckSvgMarkup() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7.5h10.1v8.1H4z" />
      <path d="M14.1 10h3.8l2.1 2.7v2.9h-5.9z" />
      <circle cx="7.3" cy="16.3" r="1.7" />
      <circle cx="17.2" cy="16.3" r="1.7" />
    </svg>
  `;
}

function previousLocationIcon(truck) {
  return L.divIcon({
    className: 'fleet-live-previous-icon',
    html: `<span style="--truck-color:${escapeHtml(truck.status.color || truck.visual.color)}"><b>Previous</b></span>`,
    iconSize: [92, 30],
    iconAnchor: [46, 15],
  });
}

function TruckIconSvg() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7.5h10.1v8.1H4z" />
      <path d="M14.1 10h3.8l2.1 2.7v2.9h-5.9z" />
      <circle cx="7.3" cy="16.3" r="1.7" />
      <circle cx="17.2" cy="16.3" r="1.7" />
    </svg>
  );
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

function formatStationaryDuration(recordedAt, now) {
  if (!recordedAt) return 'Stationary';
  const timestamp = new Date(recordedAt).getTime();
  if (!Number.isFinite(timestamp)) return 'Stationary';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'Stationary just now';
  if (minutes < 60) return `Stationary for ${minutes} min`;
  return `Stationary for ${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function classifyTruck(location, speedKmh, now) {
  if (!location) {
    return { key: 'offline', label: 'Awaiting GPS', color: '#7B8492' };
  }

  const explicitStatus = String(location.status || '').trim().toLowerCase();
  const recordedAt = new Date(location.recordedAt || location.updatedAt || 0).getTime();
  const ageMs = Number.isFinite(recordedAt) ? now - recordedAt : Infinity;

  if (explicitStatus.includes('stationary')) {
    return { key: 'stationary', label: 'Stationary', color: '#6B7280' };
  }

  if (ageMs > 10 * 60 * 1000) {
    return { key: 'offline', label: 'GPS offline', color: '#7B8492' };
  }

  if (ageMs > 2 * 60 * 1000) {
    return { key: 'stale', label: 'GPS stale', color: '#7B8492' };
  }

  if (explicitStatus.includes('return')) {
    return { key: 'returning', label: 'Returning to yard', color: '#2388E9' };
  }

  if (explicitStatus === 'idle') {
    return { key: 'idle', label: 'Idle', color: '#F59A23' };
  }

  if (explicitStatus.includes('route') || explicitStatus.includes('transit')) {
    return { key: 'on-route', label: 'On route', color: '#F59A23' };
  }

  if (speedKmh > 5 || explicitStatus.includes('moving')) {
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
      <span class="fleet-live-marker-core">${truckSvgMarkup()}</span>
      <strong>${escapeHtml(truck.rego)}</strong>
      <span class="fleet-live-marker-chip">
        <i></i><b>${escapeHtml(truck.status.key === 'stationary' ? 'Stationary' : formatSpeed(truck.speedKmh))}</b>
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

function fleetPoints(trucks) {
  return trucks
    .filter(truck => truck.hasPosition)
    .map(truck => [truck.latitude, truck.longitude]);
}

function fitFleet(map, trucks, animate = true) {
  const points = fleetPoints(trucks);

  if (points.length === 0) {
    map.setView(SYDNEY_CENTER, 10, { animate });
    return;
  }

  map.fitBounds(points, {
    paddingTopLeft: [58, 58],
    paddingBottomRight: [420, 170],
    maxZoom: 12,
    animate,
  });
}

function FleetMapController({ trucks, selectedTruckId, followVersion }) {
  const map = useMap();
  const initialFitDoneRef = useRef(false);
  const latestTrucksRef = useRef(trucks);
  const lastFollowVersionRef = useRef(followVersion);

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    latestTrucksRef.current = trucks;
  }, [trucks]);

  useEffect(() => {
    if (initialFitDoneRef.current || fleetPoints(trucks).length === 0) {
      return;
    }
    initialFitDoneRef.current = true;
    fitFleet(map, trucks, false);
  }, [map, trucks]);

  useEffect(() => {
    if (!selectedTruckId) {
      return;
    }
    const selectedTruck = latestTrucksRef.current.find(truck => truck.id === selectedTruckId && truck.hasPosition);
    if (selectedTruck) {
      map.setView([selectedTruck.latitude, selectedTruck.longitude], Math.max(map.getZoom(), 13), { animate: true });
    }
  }, [map, selectedTruckId]);

  useEffect(() => {
    if (followVersion === lastFollowVersionRef.current) {
      return;
    }
    lastFollowVersionRef.current = followVersion;
    fitFleet(map, latestTrucksRef.current, true);
  }, [followVersion, map]);

  return null;
}

function easeInOut(value) {
  return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function FleetLiveMarker({ truck, onSelect }) {
  const map = useMap();
  const markerRef = useRef(null);
  const animationRef = useRef(null);
  const currentPositionRef = useRef([truck.latitude, truck.longitude]);
  const onSelectRef = useRef(onSelect);
  const targetKey = `${truck.latitude?.toFixed(6)}:${truck.longitude?.toFixed(6)}`;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!truck.hasPosition) {
      return undefined;
    }

    const marker = L.marker([truck.latitude, truck.longitude], {
      icon: markerIcon(truck),
      riseOnHover: true,
      zIndexOffset: truck.status.key === 'moving' ? 40 : 0,
    }).addTo(map);
    marker.bindTooltip(`<strong>${escapeHtml(truck.rego)}</strong><span>${escapeHtml(truck.status.label)}</span>`, {
      direction: 'top',
      offset: [0, -44],
      opacity: 0.96,
      className: 'fleet-live-tooltip',
    });
    const handleClick = () => onSelectRef.current?.();
    marker.on('click', handleClick);
    markerRef.current = marker;
    currentPositionRef.current = [truck.latitude, truck.longitude];

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      marker.off('click', handleClick);
      marker.remove();
      markerRef.current = null;
    };
  }, [map, truck.hasPosition, truck.id]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) {
      return;
    }
    marker.setIcon(markerIcon(truck));
    marker.setZIndexOffset(truck.status.key === 'moving' ? 40 : 0);
    marker.setTooltipContent(`<strong>${escapeHtml(truck.rego)}</strong><span>${escapeHtml(truck.status.label)}</span>`);
  }, [truck]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !truck.hasPosition) {
      return undefined;
    }

    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const from = currentPositionRef.current || [truck.latitude, truck.longitude];
    const to = [truck.latitude, truck.longitude];
    const ageMs = truck.recordedAt ? Date.now() - new Date(truck.recordedAt).getTime() : Infinity;
    const shouldJump = truck.status.key === 'offline' || truck.status.key === 'stale' || ageMs > 60 * 1000;
    const duration = shouldJump ? 0 : Math.min(4800, Math.max(1200, FLEET_REFRESH_MS * 0.9));

    if (!duration || (Math.abs(from[0] - to[0]) < 0.000001 && Math.abs(from[1] - to[1]) < 0.000001)) {
      marker.setLatLng(to);
      currentPositionRef.current = to;
      return undefined;
    }

    const startedAt = performance.now();
    const animate = (frameTime) => {
      const progress = Math.min(1, (frameTime - startedAt) / duration);
      const eased = easeInOut(progress);
      const next = [
        from[0] + (to[0] - from[0]) * eased,
        from[1] + (to[1] - from[1]) * eased,
      ];
      marker.setLatLng(next);
      currentPositionRef.current = next;
      if (progress < 1) {
        animationRef.current = window.requestAnimationFrame(animate);
      } else {
        currentPositionRef.current = to;
        animationRef.current = null;
      }
    };
    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [targetKey, truck.hasPosition, truck.recordedAt, truck.status.key]);

  return null;
}

function FleetControlButton({ label, title, children, onClick, active = false }) {
  return (
    <button type="button" className={`fleet-live-control${active ? ' active' : ''}`} title={title || label} aria-label={label} onClick={onClick}>
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
  if (type === 'history') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c4-7 8 4 12-3 1.7-3 2.9-4.8 5-5" /><circle cx="4" cy="17" r="2" /><circle cx="20" cy="9" r="2" /></svg>;
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
  const [routeHistoryEnabled, setRouteHistoryEnabled] = useState(false);
  const [routeHistoryByTruck, setRouteHistoryByTruck] = useState({});
  const [stationaryAddresses, setStationaryAddresses] = useState({});
  const lastRouteHistoryLoadRef = useRef(0);

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
    let timer = null;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        await run(true);
        if (active) {
          schedule();
        }
      }, document.visibilityState === 'hidden' ? FLEET_HIDDEN_REFRESH_MS : FLEET_REFRESH_MS);
    };
    const handleVisibility = () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      run(true);
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
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
    const recordedAt = location?.recordedAt || location?.updatedAt || null;
    const recordedAtMs = recordedAt ? new Date(recordedAt).getTime() : NaN;
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
      recordedAt,
      ageMs: Number.isFinite(recordedAtMs) ? Math.max(0, now - recordedAtMs) : Infinity,
      updatedAt: location?.updatedAt || null,
      driverUserId: location?.driverUserId || null,
      deliveryRequestId: location?.deliveryRequestId || null,
      stationaryAddress: stationaryAddresses[lane.id] || '',
      routePath: Array.isArray(location?.routePath)
        ? location.routePath
            .map(point => [toNumber(point?.latitude ?? point?.lat), toNumber(point?.longitude ?? point?.lon ?? point?.lng)])
            .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
        : [],
      status,
      visual,
      lastPingLabel: formatLastPing(location?.recordedAt || location?.updatedAt, now),
    };
  }), [locationMap, now, stationaryAddresses]);

  const selectedTruck = selectedTruckId ? trucks.find(truck => truck.id === selectedTruckId) : null;
  const liveCount = trucks.filter(truck => truck.hasLiveLocation && truck.status.key !== 'stale').length;

  const stationaryAddressKey = useMemo(() => trucks
    .filter(truck => truck.status.key === 'stationary' && truck.hasLiveLocation)
    .map(truck => `${truck.id}:${truck.latitude.toFixed(5)}:${truck.longitude.toFixed(5)}`)
    .join('|'), [trucks]);

  useEffect(() => {
    if (!stationaryAddressKey) return undefined;
    let cancelled = false;
    trucks
      .filter(truck => truck.status.key === 'stationary' && truck.hasLiveLocation)
      .forEach(truck => {
        reverseGeocodeStationaryAddress(truck.latitude, truck.longitude).then(address => {
          if (!cancelled && address) {
            setStationaryAddresses(current => ({ ...current, [truck.id]: address }));
          }
        });
      });
    return () => {
      cancelled = true;
    };
  }, [stationaryAddressKey]);

  useEffect(() => {
    lastRouteHistoryLoadRef.current = 0;
  }, [routeHistoryEnabled, selectedTruckId]);

  useEffect(() => {
    if (!routeHistoryEnabled) {
      setRouteHistoryByTruck(current => Object.keys(current).length ? {} : current);
      return undefined;
    }
    const nowMs = Date.now();
    if (nowMs - lastRouteHistoryLoadRef.current < ROUTE_HISTORY_REFRESH_MS) {
      return undefined;
    }
    lastRouteHistoryLoadRef.current = nowMs;
    let cancelled = false;
    const targets = (selectedTruck ? [selectedTruck] : trucks).filter(truck => truck.hasLiveLocation);
    const toIso = new Date(nowMs + 60 * 1000).toISOString();
    const fromIso = new Date(nowMs - ROUTE_HISTORY_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

    Promise.all(targets.map(async truck => {
      const points = await truckLiveLocationsAPI.getHistory({
        truckId: truck.id,
        truckLabel: truck.rego,
        fromIso,
        toIso,
        limit: 900,
        force: true,
      }).catch(() => []);
      return [truck.id, points];
    })).then(entries => {
      if (cancelled) return;
      setRouteHistoryByTruck(current => {
        const next = selectedTruck ? { ...current } : {};
        entries.forEach(([id, points]) => {
          next[id] = Array.isArray(points) ? points : [];
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [routeHistoryEnabled, selectedTruck, trucks]);

  const visibleRouteHistories = useMemo(() => {
    if (!routeHistoryEnabled) return [];
    return (selectedTruck ? [selectedTruck] : trucks)
      .map(truck => ({ truck, points: routeHistoryByTruck[truck.id] || [] }))
      .filter(entry => entry.points.length > 0);
  }, [routeHistoryByTruck, routeHistoryEnabled, selectedTruck, trucks]);

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
        {visibleRouteHistories.map(({ truck, points }) => points.length > 1 ? (
          <Polyline
            key={`${truck.id}-history`}
            positions={points.map(point => [point.latitude, point.longitude])}
            pathOptions={{ color: truck.status.color || truck.visual.routeColor, weight: 5, opacity: 0.72 }}
          />
        ) : null)}
        {visibleRouteHistories.map(({ truck, points }) => {
          const first = points[0];
          return first ? (
            <Marker
              key={`${truck.id}-previous`}
              position={[first.latitude, first.longitude]}
              icon={previousLocationIcon(truck)}
              interactive={false}
            />
          ) : null;
        })}
        {!routeHistoryEnabled && trucks.map(truck => truck.routePath.length > 1 ? (
          <Polyline
            key={`${truck.id}-route`}
            positions={truck.routePath}
            pathOptions={{ color: truck.visual.routeColor, weight: 5, opacity: 0.72 }}
          />
        ) : null)}
	        {trucks.map(truck => truck.hasPosition ? (
	          <FleetLiveMarker
	            key={truck.id}
	            truck={truck}
	            onSelect={() => setSelectedTruckId(truck.id)}
	          />
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
        <FleetControlButton
          label={routeHistoryEnabled ? 'Hide route history' : 'Show route history'}
          title={routeHistoryEnabled ? 'Hide previous GPS breadcrumb route' : 'Show previous GPS breadcrumb route'}
          onClick={() => setRouteHistoryEnabled(value => !value)}
          active={routeHistoryEnabled}
        >
          <ControlIcon type="history" />
        </FleetControlButton>
        <FleetControlButton label="Refresh live locations" onClick={() => loadLocations({ silent: false })}>
          <ControlIcon type="refresh" />
        </FleetControlButton>
      </div>

      <div className="fleet-live-legend" aria-label="Truck status legend">
        <span><i className="moving"></i>Moving</span>
        <span><i className="stationary"></i>Stationary</span>
        <span><i className="idle"></i>Idle / on route</span>
        <span><i className="returning"></i>Returning to yard</span>
	        <span><i className="stale"></i>GPS stale / offline</span>
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
              <span className="fleet-live-card-avatar"><TruckIconSvg /></span>
              <span className="fleet-live-card-copy">
                <strong>{truck.rego}</strong>
                <small>{truck.status.key === 'stationary' ? formatStationaryDuration(truck.recordedAt, now) : truck.lastPingLabel}</small>
                {truck.status.key === 'stationary' ? <em>{truck.stationaryAddress || 'Finding stationary address...'}</em> : null}
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
            {selectedTruck.status.key === 'stationary' ? (
              <div><span>Stationed at</span><strong>{selectedTruck.stationaryAddress || 'Finding address...'}</strong></div>
            ) : null}
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
