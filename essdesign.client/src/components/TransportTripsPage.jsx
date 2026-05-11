import React, { useEffect, useMemo, useRef, useState } from 'react';
import { analysisAPI, truckLiveLocationsAPI } from '../services/api';
import RouteMapCanvas from './transport/RouteMapCanvas';
import {
  TRUCK_LANES,
  formatBoardDay,
  formatDistance,
  formatDuration,
} from './transport/transportUtils';

const FUEL_LITRES_PER_100KM = 22;
const TRAFFIC_IDLE_LITRES_PER_MINUTE = 0.035;
const TRIP_WINDOW_DAYS = 45;
const MAX_REASONABLE_GPS_SPEED_MPS = 45;
const GPS_TRIP_END_IDLE_SECONDS = 12 * 60;
const GPS_TRIP_MAX_POINT_GAP_SECONDS = 20 * 60;
const GPS_TRIP_MIN_DURATION_SECONDS = 90;
const GPS_TRIP_MIN_DISTANCE_METERS = 150;
const GPS_TRIP_STOP_RADIUS_METERS = 80;
const GPS_HISTORY_LIMIT_PER_TRUCK = 10000;

const TRIP_STATUS_COPY = {
  gps: 'GPS trip',
  completed: 'Completed',
  return_transit: 'Return transit',
  delivered: 'Delivered',
};

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function secondsBetween(start, end) {
  const startDate = asDate(start);
  const endDate = asDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
}

function scheduleFromIso(iso) {
  const date = asDate(iso);
  if (!date) return {};
  return {
    scheduledDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    scheduledHour: date.getHours(),
    scheduledMinute: date.getMinutes(),
  };
}

function formatClock(value) {
  const date = asDate(value);
  if (!date) return 'Not recorded';
  return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(value) {
  const date = asDate(value);
  if (!date) return 'Not recorded';
  return date.toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return 'Unavailable';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
}

function formatFuel(litres) {
  if (!Number.isFinite(litres)) return 'Pending route';
  if (litres < 10) return `${litres.toFixed(1)} L`;
  return `${Math.round(litres)} L`;
}

function combineRoutes(routes) {
  const validRoutes = routes.filter(route => route && Array.isArray(route.pathPoints) && route.pathPoints.length > 0);
  if (!validRoutes.length) return null;
  const points = validRoutes.flatMap((route, index) => {
    const path = route.pathPoints || [];
    return index === 0 ? path : path.slice(1);
  });
  return {
    ...validRoutes[0],
    yard: validRoutes[0].yard,
    site: validRoutes[validRoutes.length - 1].site,
    pathPoints: points,
    distanceMeters: validRoutes.reduce((sum, route) => sum + Number(route.distanceMeters || 0), 0),
    durationSeconds: validRoutes.reduce((sum, route) => sum + Number(route.durationSeconds || 0), 0),
    baseDurationSeconds: validRoutes.reduce((sum, route) => sum + Number(route.baseDurationSeconds || 0), 0),
    trafficDelaySeconds: validRoutes.reduce((sum, route) => sum + Number(route.trafficDelaySeconds || 0), 0),
    hasLiveTraffic: validRoutes.some(route => route.hasLiveTraffic),
    trafficProvider: validRoutes.map(route => route.trafficProvider).filter(Boolean).join(', '),
    trafficNote: validRoutes.map(route => route.trafficNote).filter(Boolean).join(' '),
  };
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function distanceBetweenPoints(a, b) {
  const lat1 = Number(a?.latitude ?? a?.lat);
  const lon1 = Number(a?.longitude ?? a?.lon);
  const lat2 = Number(b?.latitude ?? b?.lat);
  const lon2 = Number(b?.longitude ?? b?.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function cleanHistoryPoints(points) {
  const sorted = (points || [])
    .filter(point => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) && asDate(point.recordedAt))
    .filter(point => point.accuracyM == null || Number(point.accuracyM) <= 200)
    .sort((a, b) => asDate(a.recordedAt).getTime() - asDate(b.recordedAt).getTime());
  const cleaned = [];
  sorted.forEach(point => {
    const previous = cleaned[cleaned.length - 1];
    if (!previous) {
      cleaned.push(point);
      return;
    }
    const seconds = secondsBetween(previous.recordedAt, point.recordedAt);
    const distance = distanceBetweenPoints(previous, point);
    if (seconds > 0 && distance / seconds > MAX_REASONABLE_GPS_SPEED_MPS) {
      return;
    }
    if (seconds === 0 && distance < 1) {
      return;
    }
    cleaned.push(point);
  });
  return cleaned;
}

function buildRouteFromHistory(points) {
  const cleaned = cleanHistoryPoints(points);
  if (cleaned.length < 2) return null;
  let distanceMeters = 0;
  let movingSeconds = 0;
  let slowOrIdleSeconds = 0;
  let maxSpeedMps = 0;

  for (let index = 1; index < cleaned.length; index += 1) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];
    const intervalSeconds = secondsBetween(previous.recordedAt, current.recordedAt);
    if (intervalSeconds <= 0 || intervalSeconds > 180) {
      continue;
    }
    const segmentMeters = distanceBetweenPoints(previous, current);
    distanceMeters += segmentMeters;
    const recordedSpeed = Number(current.speedMps);
    const calculatedSpeed = segmentMeters / intervalSeconds;
    const speed = Number.isFinite(recordedSpeed) && recordedSpeed >= 0 ? recordedSpeed : calculatedSpeed;
    maxSpeedMps = Math.max(maxSpeedMps, speed);
    if (speed >= 2.2 || segmentMeters >= 20) {
      movingSeconds += intervalSeconds;
    } else {
      slowOrIdleSeconds += intervalSeconds;
    }
  }

  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  const durationSeconds = secondsBetween(first.recordedAt, last.recordedAt);
  return {
    yard: { lat: Number(first.latitude), lon: Number(first.longitude) },
    site: { lat: Number(last.latitude), lon: Number(last.longitude) },
    pathPoints: cleaned.map(point => ({ lat: Number(point.latitude), lon: Number(point.longitude) })),
    distanceMeters,
    durationSeconds,
    baseDurationSeconds: movingSeconds,
    trafficDelaySeconds: slowOrIdleSeconds,
    trafficProvider: 'GPS breadcrumbs',
    trafficNote: `${cleaned.length} recorded GPS points`,
    pointCount: cleaned.length,
    movingSeconds,
    slowOrIdleSeconds,
    maxSpeedMps,
    startedAt: first.recordedAt,
    endedAt: last.recordedAt,
  };
}

function formatCoordinateLocation(point) {
  const lat = Number(point?.latitude ?? point?.lat);
  const lon = Number(point?.longitude ?? point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}

function formatEstimatedLocation(point) {
  const lat = Number(point?.latitude ?? point?.lat);
  const lon = Number(point?.longitude ?? point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Unknown location';
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function isMovingSegment(previous, current) {
  if (!previous || !current) return false;
  const intervalSeconds = secondsBetween(previous.recordedAt, current.recordedAt);
  if (intervalSeconds <= 0 || intervalSeconds > GPS_TRIP_MAX_POINT_GAP_SECONDS) return false;
  const segmentMeters = distanceBetweenPoints(previous, current);
  const recordedSpeed = Number(current.speedMps);
  const calculatedSpeed = segmentMeters / intervalSeconds;
  const speed = Number.isFinite(recordedSpeed) && recordedSpeed >= 0 ? recordedSpeed : calculatedSpeed;
  return speed >= 2.2 || segmentMeters >= 20;
}

function buildGpsTripFromPoints(points, lane, sequence) {
  const route = buildRouteFromHistory(points);
  if (!route) return null;
  if (Number(route.durationSeconds || 0) < GPS_TRIP_MIN_DURATION_SECONDS) return null;
  if (Number(route.distanceMeters || 0) < GPS_TRIP_MIN_DISTANCE_METERS) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const startedAt = route.startedAt || first?.recordedAt;
  const completedAt = route.endedAt || last?.recordedAt;
  const fromLocation = formatCoordinateLocation(first);
  const toLocation = formatCoordinateLocation(last);
  if (!startedAt || !completedAt || !fromLocation || !toLocation) return null;
  const scheduledDate = scheduleFromIso(startedAt).scheduledDate;
  return {
    id: `gps-${lane.id || lane.rego}-${startedAt}-${completedAt}-${sequence}`,
    source: 'gps',
    truckId: lane.id,
    truckLabel: lane.rego,
    title: `${lane.rego} GPS trip`,
    subtitle: `${formatDateTime(startedAt)} to ${formatDateTime(completedAt)}`,
    startLocationEstimate: formatEstimatedLocation(first),
    endLocationEstimate: formatEstimatedLocation(last),
    siteLocation: toLocation,
    startedAt,
    unloadingAt: null,
    completedAt,
    cycleEndedAt: completedAt,
    scheduledDate,
    status: 'gps',
    actualDurationSeconds: route.durationSeconds,
    serviceMinutes: 0,
    legs: [{
      id: 'gps',
      label: 'Recorded truck movement',
      from: fromLocation,
      to: toLocation,
      departureAt: startedAt,
      tollsEnabled: false,
      kind: 'gps',
    }],
    tollsEnabled: false,
    gpsRoute: route,
    historyPoints: points,
  };
}

function segmentGpsHistoryIntoTrips(points, lane) {
  const cleaned = cleanHistoryPoints(points);
  const trips = [];
  let activePoints = [];
  let stationarySince = null;
  let stationaryPoint = null;
  let sequence = 0;

  const finishActiveTrip = (endAt = null) => {
    if (activePoints.length < 2) {
      activePoints = [];
      stationarySince = null;
      stationaryPoint = null;
      return;
    }
    const finalPoints = endAt
      ? activePoints.filter(point => asDate(point.recordedAt) && asDate(point.recordedAt) <= asDate(endAt))
      : activePoints;
    const trip = buildGpsTripFromPoints(finalPoints, lane, sequence);
    if (trip) {
      trips.push(trip);
      sequence += 1;
    }
    activePoints = [];
    stationarySince = null;
    stationaryPoint = null;
  };

  for (let index = 1; index < cleaned.length; index += 1) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];
    const gapSeconds = secondsBetween(previous.recordedAt, current.recordedAt);
    const moving = isMovingSegment(previous, current);

    if (activePoints.length && gapSeconds > GPS_TRIP_MAX_POINT_GAP_SECONDS) {
      finishActiveTrip(previous.recordedAt);
      if (!moving) continue;
    }

    if (!activePoints.length) {
      if (!moving) continue;
      activePoints = [previous, current];
      stationarySince = null;
      stationaryPoint = null;
      continue;
    }

    activePoints.push(current);
    if (moving) {
      stationarySince = null;
      stationaryPoint = null;
      continue;
    }

    if (!stationarySince) {
      stationarySince = previous.recordedAt;
      stationaryPoint = previous;
      continue;
    }

    const stationarySeconds = secondsBetween(stationarySince, current.recordedAt);
    const stationaryDriftMeters = distanceBetweenPoints(stationaryPoint, current);
    if (stationarySeconds >= GPS_TRIP_END_IDLE_SECONDS && stationaryDriftMeters <= GPS_TRIP_STOP_RADIUS_METERS) {
      finishActiveTrip(stationarySince);
    }
  }

  if (activePoints.length) {
    const lastPoint = activePoints[activePoints.length - 1];
    const lastPointAgeSeconds = secondsBetween(lastPoint?.recordedAt, new Date().toISOString());
    if (stationarySince || lastPointAgeSeconds >= GPS_TRIP_END_IDLE_SECONDS) {
      finishActiveTrip(stationarySince || lastPoint?.recordedAt);
    }
  }
  return trips;
}

async function fetchGpsTripsFromHistory() {
  const toIso = new Date().toISOString();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - TRIP_WINDOW_DAYS);
  const fromIso = fromDate.toISOString();
  const perTruckTrips = await Promise.all(TRUCK_LANES.map(async lane => {
    try {
      const points = await truckLiveLocationsAPI.getHistory({
        truckId: lane.id,
        truckLabel: lane.rego,
        fromIso,
        toIso,
        limit: GPS_HISTORY_LIMIT_PER_TRUCK,
        order: 'recorded_at.desc',
        force: true,
      });
      return segmentGpsHistoryIntoTrips(points, lane);
    } catch {
      return [];
    }
  }));
  return perTruckTrips.flat();
}

function calculateFuel(distanceMeters, trafficDelaySeconds) {
  const distanceKm = Number(distanceMeters || 0) / 1000;
  if (!distanceKm) return { litres: null, consumption: null };
  const baseLitres = (distanceKm * FUEL_LITRES_PER_100KM) / 100;
  const trafficLitres = (Number(trafficDelaySeconds || 0) / 60) * TRAFFIC_IDLE_LITRES_PER_MINUTE;
  const litres = baseLitres + trafficLitres;
  return {
    litres,
    consumption: (litres / distanceKm) * 100,
  };
}

function estimateTollFees(route, tollsUsed) {
  if (!tollsUsed || !route) return 0;
  const distanceKm = Number(route.distanceMeters || 0) / 1000;
  if (!distanceKm) return null;
  return Math.min(65, Math.max(6.5, distanceKm * 0.55 + 4.8));
}

function routeComparisonAgainstActual(actualSeconds, candidate) {
  if (!Number.isFinite(actualSeconds) || actualSeconds <= 0 || !candidate?.combined) return null;
  const deltaSeconds = actualSeconds - Number(candidate.combined.durationSeconds || 0);
  return { deltaSeconds };
}

async function fetchRouteBundle(trip, mode) {
  const legs = await Promise.all(trip.legs.map(async leg => {
    const enableTolls = mode === 'tolls'
      ? true
      : mode === 'avoid-tolls'
        ? false
        : leg.tollsEnabled;
    try {
      const route = await analysisAPI.routePreviewBetween(leg.from, leg.to, {
        ...scheduleFromIso(leg.departureAt || trip.startedAt),
        enableTolls,
      });
      return { ...leg, enableTolls, route };
    } catch (error) {
      return { ...leg, enableTolls, route: null, error: error?.message || 'Route unavailable' };
    }
  }));
  return {
    mode,
    legs,
    combined: combineRoutes(legs.map(leg => leg.route)),
  };
}

async function fetchTripHistory(trip) {
  if (trip?.source === 'gps' && Array.isArray(trip.historyPoints) && trip.historyPoints.length) {
    return {
      points: trip.historyPoints,
      route: trip.gpsRoute || buildRouteFromHistory(trip.historyPoints),
      error: '',
    };
  }

  return { points: [], route: null, error: 'This trip does not have GPS breadcrumb history.' };
}

function TripMetric({ label, value, tone = 'default' }) {
  return (
    <div className={`transport-trip-metric transport-trip-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TripPill({ children, tone = 'navy' }) {
  return <span className={`transport-trip-pill transport-trip-pill-${tone}`}>{children}</span>;
}

function TripListCard({ trip, selected, onSelect }) {
  const statusLabel = TRIP_STATUS_COPY[trip.status] || TRIP_STATUS_COPY.completed;
  const route = trip.gpsRoute || buildRouteFromHistory(trip.historyPoints);
  const fuel = calculateFuel(route?.distanceMeters, route?.slowOrIdleSeconds);
  return (
    <button type="button" className={`transport-trip-card transport-trip-card-analysis ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="transport-trip-card-head">
        <div className="transport-trip-card-badges">
          <TripPill tone="green">{statusLabel}</TripPill>
          <TripPill>{trip.truckLabel}</TripPill>
        </div>
        <span className="transport-trip-card-time">{formatDateTime(trip.startedAt)}</span>
      </div>

      <div className="transport-trip-card-route">
        <div>
          <span>Estimated start location</span>
          <strong>{trip.startLocationEstimate || trip.legs?.[0]?.from || 'Unknown location'}</strong>
        </div>
        <div>
          <span>Estimated end location</span>
          <strong>{trip.endLocationEstimate || trip.legs?.[0]?.to || 'Unknown location'}</strong>
        </div>
      </div>

      <div className="transport-trip-card-analysis-grid">
        <div><span>Duration</span><strong>{route?.durationSeconds ? formatDuration(route.durationSeconds) : 'Pending'}</strong></div>
        <div><span>Distance</span><strong>{route?.distanceMeters ? formatDistance(route.distanceMeters) : 'Pending'}</strong></div>
        <div><span>Slow / idle</span><strong>{route?.slowOrIdleSeconds != null ? formatDuration(route.slowOrIdleSeconds || 0) : 'Pending'}</strong></div>
        <div><span>Fuel est.</span><strong>{formatFuel(fuel.litres)}</strong></div>
      </div>

      <div className="transport-trip-card-foot">
        <span>{route?.pointCount || trip.historyPoints?.length || 0} GPS breadcrumbs</span>
        <b>Open analysis</b>
      </div>
    </button>
  );
}

export default function TransportTripsPage() {
  const [gpsTrips, setGpsTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [truckFilter, setTruckFilter] = useState('all');
  const [loadVersion, setLoadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const analysisCacheRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    async function loadTrips() {
      setLoading(true);
      setError('');
      try {
        const gpsTripRows = await fetchGpsTripsFromHistory();
        if (cancelled) return;
        setGpsTrips(gpsTripRows || []);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Unable to load driven GPS trips.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTrips();
    return () => { cancelled = true; };
  }, [loadVersion]);

  const trips = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TRIP_WINDOW_DAYS);
    return gpsTrips
      .filter(trip => {
        const start = asDate(trip.startedAt);
        return start && start >= cutoff;
      })
      .sort((a, b) => (asDate(b.startedAt)?.getTime() || 0) - (asDate(a.startedAt)?.getTime() || 0));
  }, [gpsTrips]);

  const filteredTrips = useMemo(() => {
    if (truckFilter === 'all') return trips;
    return trips.filter(trip => trip.truckLabel === truckFilter);
  }, [trips, truckFilter]);

  useEffect(() => {
    if (selectedTripId && !filteredTrips.some(trip => trip.id === selectedTripId)) {
      setSelectedTripId(null);
    }
  }, [filteredTrips, selectedTripId]);

  const selectedTrip = useMemo(
    () => filteredTrips.find(trip => trip.id === selectedTripId) || null,
    [filteredTrips, selectedTripId],
  );

  useEffect(() => {
    if (!selectedTrip || !selectedTrip.legs.length) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    const cacheKey = `${selectedTrip.id}:${selectedTrip.startedAt}:${selectedTrip.completedAt || ''}:${selectedTrip.cycleEndedAt || ''}:${selectedTrip.legs.map(leg => `${leg.from}|${leg.to}|${leg.tollsEnabled}`).join('>')}`;
    const cached = analysisCacheRef.current.get(cacheKey);
    if (cached) {
      setAnalysis(cached);
      setAnalysisLoading(false);
      setAnalysisError('');
      return;
    }

    async function loadAnalysis() {
      setAnalysisLoading(true);
      setAnalysisError('');
      setAnalysis(null);
      try {
        const allTolls = selectedTrip.legs.every(leg => leg.tollsEnabled);
        const noTolls = selectedTrip.legs.every(leg => !leg.tollsEnabled);
        const [current, history] = await Promise.all([
          fetchRouteBundle(selectedTrip, 'current'),
          fetchTripHistory(selectedTrip),
        ]);
        const [tolls, avoidTolls] = await Promise.all([
          allTolls ? Promise.resolve(current) : fetchRouteBundle(selectedTrip, 'tolls'),
          noTolls ? Promise.resolve(current) : fetchRouteBundle(selectedTrip, 'avoid-tolls'),
        ]);
        if (cancelled) return;
        const next = { current, tolls, avoidTolls, history };
        analysisCacheRef.current.set(cacheKey, next);
        setAnalysis(next);
      } catch (routeError) {
        if (!cancelled) setAnalysisError(routeError?.message || 'Unable to calculate route analysis.');
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    }

    loadAnalysis();
    return () => { cancelled = true; };
  }, [selectedTrip]);

  const plannedRoute = analysis?.current?.combined || null;
  const gpsRoute = analysis?.history?.route || null;
  const displayRoute = gpsRoute || plannedRoute;
  const usingGpsBreadcrumbs = Boolean(gpsRoute);
  const statsDistanceMeters = gpsRoute?.distanceMeters ?? plannedRoute?.distanceMeters;
  const statsDurationSeconds = gpsRoute?.durationSeconds ?? selectedTrip?.actualDurationSeconds ?? plannedRoute?.durationSeconds;
  const statsTrafficSeconds = gpsRoute?.slowOrIdleSeconds ?? plannedRoute?.trafficDelaySeconds;
  const fuel = calculateFuel(statsDistanceMeters, statsTrafficSeconds);
  const tollEstimate = estimateTollFees(displayRoute, selectedTrip?.tollsEnabled);
  const tollComparison = routeComparisonAgainstActual(statsDurationSeconds, analysis?.tolls);
  const avoidTollComparison = routeComparisonAgainstActual(statsDurationSeconds, analysis?.avoidTolls);
  const avgActualSeconds = trips.length
    ? trips.reduce((sum, trip) => sum + Number(trip.actualDurationSeconds || 0), 0) / trips.length
    : 0;
  const todayKey = scheduleFromIso(new Date().toISOString()).scheduledDate;
  const todayTripCount = trips.filter(trip => trip.scheduledDate === todayKey).length;

  return (
    <div className="transport-trips-page">
      <div className="transport-trips-toolbar">
        <div>
          <h1>Trip Analysis</h1>
          <p>Actual completed driven trips generated from truck GPS breadcrumbs only.</p>
        </div>
        <div className="transport-trips-actions">
          <select
            value={truckFilter}
            onChange={event => {
              setTruckFilter(event.target.value);
              setSelectedTripId(null);
            }}
          >
            <option value="all">All trucks</option>
            {TRUCK_LANES.map(lane => <option key={lane.rego} value={lane.rego}>{lane.rego}</option>)}
          </select>
          <button type="button" onClick={() => setLoadVersion(value => value + 1)} disabled={loading}>Refresh</button>
        </div>
      </div>

      {error ? <div className="transport-trips-error">{error}</div> : null}

      <div className="transport-trips-queue-tools">
        <div className="transport-trips-queue-chip-row">
          <button type="button" className="material-ordering-queue-chip">
            Filter: {truckFilter === 'all' ? 'All trucks' : truckFilter}
          </button>
          <button type="button" className="material-ordering-queue-chip">
            GPS only
          </button>
        </div>
        <div className="material-ordering-queue-meta">
          <span>Total {loading ? '...' : filteredTrips.length} {filteredTrips.length === 1 ? 'driven trip' : 'driven trips'}</span>
          <span>Today: {todayTripCount}</span>
          <span>Average: {avgActualSeconds ? formatDuration(avgActualSeconds) : 'Pending'}</span>
        </div>
      </div>

      <div className={`transport-trips-layout ${selectedTrip ? 'transport-trips-layout-open' : 'transport-trips-layout-list-only'}`}>
        <aside className="transport-trips-list">
          <div className="transport-trips-list-head">
            <div>
              <strong>Recent trips</strong>
              <small>Click a trip to open its recorded information.</small>
            </div>
            <span>Last {TRIP_WINDOW_DAYS} days</span>
          </div>
          {loading ? (
            <div className="transport-trips-empty">Loading completed trips...</div>
          ) : filteredTrips.length ? (
            filteredTrips.map(trip => (
              <TripListCard
                key={trip.id}
                trip={trip}
                selected={selectedTrip?.id === trip.id}
                onSelect={() => setSelectedTripId(trip.id)}
              />
            ))
          ) : (
            <div className="transport-trips-empty">No completed trips found for this truck.</div>
          )}
        </aside>

        {selectedTrip ? (
          <section className="transport-trips-detail">
            <>
              <div className="transport-trip-detail-head">
                <div>
                  <div className="transport-trip-detail-kicker">
                    <TripPill>{selectedTrip.truckLabel}</TripPill>
                    <span>{selectedTrip.scheduledDate ? formatBoardDay(selectedTrip.scheduledDate) : 'Date unavailable'}</span>
                  </div>
                  <h2>{selectedTrip.title}</h2>
                  <p>{selectedTrip.subtitle}</p>
                </div>
                <div className="transport-trip-detail-actions">
                  <TripPill tone="green">GPS recorded</TripPill>
                  <button type="button" onClick={() => setSelectedTripId(null)}>Close</button>
                </div>
              </div>

              <div className="transport-trip-stat-grid transport-trip-stat-grid-hero">
                <TripMetric label={usingGpsBreadcrumbs ? 'GPS trip time' : 'Time taken'} value={statsDurationSeconds ? formatDuration(statsDurationSeconds) : 'Not confirmed'} />
                <TripMetric label="Distance travelled" value={statsDistanceMeters ? formatDistance(statsDistanceMeters) : 'Calculating'} />
                <TripMetric label={usingGpsBreadcrumbs ? 'GPS slow / idle time' : 'Traffic encountered'} value={statsTrafficSeconds != null ? formatDuration(statsTrafficSeconds || 0) : 'Calculating'} tone="orange" />
                <TripMetric label="Route source" value={usingGpsBreadcrumbs ? `${gpsRoute.pointCount} GPS breadcrumbs` : (plannedRoute?.trafficProvider || 'TomTom route preview')} />
              </div>

              <div className="transport-trip-detail-grid">
                <div className="transport-trip-route-card">
                  <RouteMapCanvas
                    routeData={displayRoute}
                    loading={analysisLoading}
                    siteLocation={selectedTrip.siteLocation}
                    className="transport-trip-route-map"
                    interactive
                    expandable
                    viewerTitle={`${selectedTrip.truckLabel} trip route`}
                    originLabel="Start"
                    destinationLabel="Finish"
                  />
                  {analysisError ? <div className="transport-trip-route-error">{analysisError}</div> : null}
                  {!analysisLoading && analysis?.history?.error ? (
                    <div className="transport-trip-route-warning">{analysis.history.error}</div>
                  ) : null}
                  {!analysisLoading && !analysis?.history?.error && !usingGpsBreadcrumbs ? (
                    <div className="transport-trip-route-warning">No GPS breadcrumbs were recorded for this trip window yet, so this map is using the TomTom planned route fallback.</div>
                  ) : null}
                </div>

                <div className="transport-trip-stat-grid">
                  <TripMetric label="TomTom planned time" value={plannedRoute ? formatDuration(plannedRoute.durationSeconds) : 'Calculating'} />
                  <TripMetric label="Fuel used estimate" value={formatFuel(fuel.litres)} tone="green" />
                  <TripMetric label="Consumption estimate" value={fuel.consumption ? `${fuel.consumption.toFixed(1)} L/100km` : 'Pending route'} tone="green" />
                  <TripMetric label="Toll fees estimate" value={tollEstimate ? formatCurrency(tollEstimate) : 'Not mapped'} tone="orange" />
                </div>
              </div>

              <div className="transport-trip-panels">
                <div className="transport-trip-panel">
                  <h3>Trip timeline</h3>
                  <div className="transport-trip-timeline">
                    <div><span>Started</span><strong>{formatClock(selectedTrip.startedAt)}</strong></div>
                    <div><span>Ended</span><strong>{formatClock(selectedTrip.completedAt)}</strong></div>
                    <div><span>Total time</span><strong>{statsDurationSeconds ? formatDuration(statsDurationSeconds) : 'Pending'}</strong></div>
                  </div>
                </div>

                <div className="transport-trip-panel">
                  <h3>Estimated locations</h3>
                  <div className="transport-trip-timeline transport-trip-location-pair">
                    <div><span>Start location</span><strong>{selectedTrip.startLocationEstimate || selectedTrip.legs?.[0]?.from || 'Unknown location'}</strong></div>
                    <div><span>End location</span><strong>{selectedTrip.endLocationEstimate || selectedTrip.legs?.[0]?.to || 'Unknown location'}</strong></div>
                  </div>
                </div>

                <div className="transport-trip-panel">
                  <h3>GPS breadcrumb playback</h3>
                  <div className="transport-trip-timeline">
                    <div><span>Points</span><strong>{analysis?.history?.points?.length ?? 0}</strong></div>
                    <div><span>Max speed</span><strong>{gpsRoute?.maxSpeedMps ? `${Math.round(gpsRoute.maxSpeedMps * 3.6)} km/h` : 'Pending'}</strong></div>
                    <div><span>Moving time</span><strong>{gpsRoute?.movingSeconds ? formatDuration(gpsRoute.movingSeconds) : 'Pending'}</strong></div>
                  </div>
                </div>

                <div className="transport-trip-panel">
                  <h3>Recorded movement</h3>
                  <div className="transport-trip-legs">
                    {selectedTrip.legs.map((leg, index) => {
                      const analysedLeg = analysis?.current?.legs?.[index];
                      return (
                        <div key={`${leg.id}-${index}`} className="transport-trip-leg">
                          <div>
                            <strong>{leg.label}</strong>
                            <span>{leg.from} to {leg.to}</span>
                          </div>
                          <div>
                            <b>{analysedLeg?.route ? formatDuration(analysedLeg.route.durationSeconds) : 'Calculating'}</b>
                            <small>GPS start/end estimate</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="transport-trip-panel transport-trip-alternatives">
                  <h3>Alternative routes</h3>
                  <div className="transport-trip-alt-row">
                    <div>
                      <strong>Tolls enabled</strong>
                      <span>{analysis?.tolls?.combined ? `${formatDuration(analysis.tolls.combined.durationSeconds)} - ${formatDistance(analysis.tolls.combined.distanceMeters)}` : 'Calculating'}</span>
                    </div>
                    <b>{tollComparison ? (tollComparison.deltaSeconds > 0 ? `${formatDuration(tollComparison.deltaSeconds)} saved` : `${formatDuration(Math.abs(tollComparison.deltaSeconds))} slower`) : 'Pending'}</b>
                  </div>
                  <div className="transport-trip-alt-row">
                    <div>
                      <strong>Avoid toll roads</strong>
                      <span>{analysis?.avoidTolls?.combined ? `${formatDuration(analysis.avoidTolls.combined.durationSeconds)} - ${formatDistance(analysis.avoidTolls.combined.distanceMeters)}` : 'Calculating'}</span>
                    </div>
                    <b>{avoidTollComparison ? (avoidTollComparison.deltaSeconds > 0 ? `${formatDuration(avoidTollComparison.deltaSeconds)} saved` : `${formatDuration(Math.abs(avoidTollComparison.deltaSeconds))} slower`) : 'Pending'}</b>
                  </div>
                  <p>Alternative timings are recalculated against the trip departure time so traffic assumptions match the scheduled time of day.</p>
                </div>

                <div className="transport-trip-panel transport-trip-assumptions">
                  <h3>Calculation assumptions</h3>
                  <p>Distance, trip time and slow/idle delay are calculated from the actual iOS GPS breadcrumb trail, not from scheduled orders.</p>
                  <p>Start and end locations are estimated from the first and last accepted GPS points in the trip.</p>
                  <p>Fuel is estimated for a 7.5 tonne diesel truck at {FUEL_LITRES_PER_100KM} L/100km with a traffic idle uplift of {TRAFFIC_IDLE_LITRES_PER_MINUTE.toFixed(3)} L/min.</p>
                  <p>Toll fees require route matching against toll roads, so GPS-only trips show toll data only when the route estimate can infer it.</p>
                </div>
              </div>
            </>
          </section>
        ) : null}
      </div>
    </div>
  );
}
