import React, { useEffect, useMemo, useRef, useState } from 'react';
import { analysisAPI, materialOrderRequestsAPI, safetyProjectsAPI } from '../services/api';
import RouteMapCanvas from './transport/RouteMapCanvas';
import {
  TRUCK_LANES,
  YARD_LOCATION,
  formatBoardDay,
  formatDistance,
  formatDuration,
} from './transport/transportUtils';

const FUEL_LITRES_PER_100KM = 22;
const TRAFFIC_IDLE_LITRES_PER_MINUTE = 0.035;
const DEFAULT_SERVICE_MINUTES = 20;
const TRIP_WINDOW_DAYS = 45;

const TRIP_STATUS_COPY = {
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

function addSeconds(iso, seconds) {
  const date = asDate(iso);
  if (!date) return null;
  return new Date(date.getTime() + seconds * 1000).toISOString();
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

function normaliseText(value) {
  return String(value || '').trim().toLowerCase();
}

function findBuilder(builders, request) {
  const builderId = request.builderId || request.builder_id;
  const builderName = normaliseText(request.builderName || request.builder || request.clientName);
  return builders.find(builder => {
    if (builderId && builder.id === builderId) return true;
    return builderName && normaliseText(builder.name) === builderName;
  }) || null;
}

function findProjectLocation(builders, request) {
  const builder = findBuilder(builders, request);
  const projectId = request.projectId || request.project_id;
  const projectName = normaliseText(request.projectName || request.project || request.siteName);
  const project = builder?.projects?.find(item => {
    if (projectId && item.id === projectId) return true;
    return projectName && normaliseText(item.name) === projectName;
  });

  return [
    request.siteLocation,
    request.deliveryAddress,
    request.projectLocation,
    request.address,
    request.location,
    project?.siteLocation,
    project?.projectLocation,
    project?.deliveryAddress,
    project?.address,
    project?.location,
    builder?.siteLocation,
    builder?.address,
  ].find(value => String(value || '').trim()) || '';
}

function isSecondaryRouteRequest(request) {
  return request?.routeType === 'secondary_route' || request?.scheduleType === 'secondary_route';
}

function getTruckLabel(request) {
  const truckId = request.scheduledTruckId || request.truckId || request.truck_id;
  const lane = TRUCK_LANES.find(item => item.id === truckId || item.rego === truckId);
  return request.scheduledTruckLabel || request.truckLabel || lane?.rego || truckId || 'Unassigned';
}

function getTollsEnabled(request, key = 'primary') {
  const values = request.itemValues || {};
  if (key === 'secondary') {
    return Boolean(request.secondaryTollsEnabled ?? values.__secondaryTollsEnabled ?? request.tollsEnabled ?? values.__tollsEnabled);
  }
  if (key === 'return') {
    return Boolean(request.returnTollsEnabled ?? values.__returnTollsEnabled ?? request.tollsEnabled ?? values.__tollsEnabled);
  }
  return Boolean(request.tollsEnabled ?? values.__tollsEnabled);
}

function getServiceMinutes(request) {
  const value = Number(request.secondaryRoute?.serviceMinutes ?? request.serviceMinutes ?? request.unloadMinutes);
  if (Number.isFinite(value) && value >= 0) return value;
  return DEFAULT_SERVICE_MINUTES;
}

function makeLeg(id, label, from, to, departureAt, tollsEnabled, kind) {
  if (!String(from || '').trim() || !String(to || '').trim()) return null;
  return {
    id,
    label,
    from: String(from).trim(),
    to: String(to).trim(),
    departureAt,
    tollsEnabled: Boolean(tollsEnabled),
    kind,
  };
}

function buildTripFromRequest(request, builders) {
  const truckLabel = getTruckLabel(request);
  if (!truckLabel || truckLabel === 'Unassigned') return null;

  const startedAt = request.deliveryStartedAt || request.actualStartAt || request.startedAt || request.scheduledAtIso || request.scheduledAt;
  const unloadingAt = request.deliveryUnloadingAt || request.unloadingStartedAt || request.arrivedAt;
  const completedAt = request.deliveryConfirmedAt || request.deliveredAt || request.completedAt || request.archivedAt;
  const status = request.deliveryStatus || (completedAt ? 'completed' : 'scheduled');
  const hasCompletedMovement = Boolean(completedAt || status === 'return_transit' || status === 'delivered');
  if (!hasCompletedMovement || !startedAt) return null;

  const siteLocation = isSecondaryRouteRequest(request)
    ? request.secondaryRoute?.destination || request.secondaryRoute?.linkedRequestSiteLocation || findProjectLocation(builders, request)
    : findProjectLocation(builders, request);

  const serviceMinutes = getServiceMinutes(request);
  const projectedSecondaryDeparture = unloadingAt
    ? addSeconds(unloadingAt, serviceMinutes * 60)
    : addSeconds(startedAt, 60 * 60);
  const returnDeparture = completedAt || projectedSecondaryDeparture || startedAt;
  const secondary = request.secondaryRoute || null;
  const legs = [];

  if (isSecondaryRouteRequest(request)) {
    const secondaryStart = secondary?.startingLocation || YARD_LOCATION;
    const secondaryEnd = secondary?.destination || secondary?.linkedRequestSiteLocation || siteLocation;
    const secondaryLeg = makeLeg('secondary', 'Secondary route', secondaryStart, secondaryEnd, startedAt, getTollsEnabled(request, 'secondary'), 'secondary');
    if (secondaryLeg) legs.push(secondaryLeg);
    const returnLeg = request.returnTransitToYard === false
      ? null
      : makeLeg('return', 'Return to yard', secondaryEnd, YARD_LOCATION, returnDeparture, getTollsEnabled(request, 'return'), 'return');
    if (returnLeg) legs.push(returnLeg);
  } else {
    const primaryLeg = makeLeg('primary', 'Yard to site', YARD_LOCATION, siteLocation, startedAt, getTollsEnabled(request, 'primary'), 'primary');
    if (primaryLeg) legs.push(primaryLeg);

    const secondaryEnd = secondary?.destination || secondary?.linkedRequestSiteLocation;
    if (secondaryEnd) {
      const secondaryStart = secondary?.startingLocation || siteLocation || YARD_LOCATION;
      const secondaryLeg = makeLeg('secondary', secondary?.label || 'Secondary route', secondaryStart, secondaryEnd, projectedSecondaryDeparture, getTollsEnabled(request, 'secondary'), 'secondary');
      if (secondaryLeg) legs.push(secondaryLeg);
      const returnLeg = request.returnTransitToYard === false
        ? null
        : makeLeg('return', 'Return to yard', secondaryEnd, YARD_LOCATION, returnDeparture, getTollsEnabled(request, 'return'), 'return');
      if (returnLeg) legs.push(returnLeg);
    } else if (request.returnTransitToYard !== false && siteLocation) {
      const returnLeg = makeLeg('return', 'Return to yard', siteLocation, YARD_LOCATION, returnDeparture, getTollsEnabled(request, 'return'), 'return');
      if (returnLeg) legs.push(returnLeg);
    }
  }

  const scheduledDate = request.scheduledDate || (asDate(startedAt) ? scheduleFromIso(startedAt).scheduledDate : null);
  const actualDurationSeconds = completedAt ? secondsBetween(startedAt, completedAt) : 0;
  const orderTitle = request.builderName || request.clientName || request.projectName || request.secondaryRoute?.label || 'Transport trip';

  return {
    id: request.id,
    request,
    truckLabel,
    title: orderTitle,
    subtitle: request.projectName || request.secondaryRoute?.reason || request.scaffoldType || 'Completed transport movement',
    siteLocation,
    startedAt,
    unloadingAt,
    completedAt,
    scheduledDate,
    status,
    actualDurationSeconds,
    serviceMinutes,
    legs,
    tollsEnabled: legs.some(leg => leg.tollsEnabled),
  };
}

function uniqueRequests(requests) {
  const map = new Map();
  requests.filter(Boolean).forEach(request => map.set(request.id, request));
  return Array.from(map.values());
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

function routeComparison(current, candidate) {
  if (!current?.combined || !candidate?.combined) return null;
  const deltaSeconds = Number(current.combined.durationSeconds || 0) - Number(candidate.combined.durationSeconds || 0);
  const deltaDistance = Number(current.combined.distanceMeters || 0) - Number(candidate.combined.distanceMeters || 0);
  return { deltaSeconds, deltaDistance };
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
  return (
    <button type="button" className={`transport-trip-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="transport-trip-card-head">
        <strong>{trip.truckLabel}</strong>
        <TripPill tone={trip.tollsEnabled ? 'orange' : 'green'}>{trip.tollsEnabled ? 'Tolls enabled' : 'No tolls'}</TripPill>
      </div>
      <h3>{trip.title}</h3>
      <p>{trip.subtitle}</p>
      <div className="transport-trip-card-meta">
        <span>{formatDateTime(trip.startedAt)}</span>
        <span>{formatDuration(trip.actualDurationSeconds || trip.legs.length * 1800)}</span>
      </div>
      <div className="transport-trip-card-foot">
        <span>{statusLabel}</span>
        <span>{trip.legs.length} leg{trip.legs.length === 1 ? '' : 's'}</span>
      </div>
    </button>
  );
}

export default function TransportTripsPage() {
  const [requests, setRequests] = useState([]);
  const [builders, setBuilders] = useState([]);
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
        const [active, archived, builderRows] = await Promise.all([
          materialOrderRequestsAPI.listActiveRequests({ includeArchived: true, force: true }),
          materialOrderRequestsAPI.listArchivedRequests({ force: true }).catch(() => []),
          safetyProjectsAPI.getBuilders({ includeArchived: true, force: true }).catch(() => []),
        ]);
        if (cancelled) return;
        setRequests(uniqueRequests([...(active || []), ...(archived || [])]));
        setBuilders(builderRows || []);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Unable to load completed trips.');
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
    return requests
      .map(request => buildTripFromRequest(request, builders))
      .filter(Boolean)
      .filter(trip => {
        const start = asDate(trip.startedAt);
        return start && start >= cutoff;
      })
      .sort((a, b) => (asDate(b.startedAt)?.getTime() || 0) - (asDate(a.startedAt)?.getTime() || 0));
  }, [builders, requests]);

  const filteredTrips = useMemo(() => {
    if (truckFilter === 'all') return trips;
    return trips.filter(trip => trip.truckLabel === truckFilter);
  }, [trips, truckFilter]);

  useEffect(() => {
    if (!filteredTrips.length) {
      setSelectedTripId(null);
      return;
    }
    if (!selectedTripId || !filteredTrips.some(trip => trip.id === selectedTripId)) {
      setSelectedTripId(filteredTrips[0].id);
    }
  }, [filteredTrips, selectedTripId]);

  const selectedTrip = useMemo(
    () => filteredTrips.find(trip => trip.id === selectedTripId) || filteredTrips[0] || null,
    [filteredTrips, selectedTripId],
  );

  useEffect(() => {
    if (!selectedTrip || !selectedTrip.legs.length) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    const cacheKey = `${selectedTrip.id}:${selectedTrip.startedAt}:${selectedTrip.completedAt || ''}:${selectedTrip.legs.map(leg => `${leg.from}|${leg.to}|${leg.tollsEnabled}`).join('>')}`;
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
        const current = await fetchRouteBundle(selectedTrip, 'current');
        const [tolls, avoidTolls] = await Promise.all([
          allTolls ? Promise.resolve(current) : fetchRouteBundle(selectedTrip, 'tolls'),
          noTolls ? Promise.resolve(current) : fetchRouteBundle(selectedTrip, 'avoid-tolls'),
        ]);
        if (cancelled) return;
        const next = { current, tolls, avoidTolls };
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

  const currentRoute = analysis?.current?.combined || null;
  const fuel = calculateFuel(currentRoute?.distanceMeters, currentRoute?.trafficDelaySeconds);
  const tollEstimate = estimateTollFees(currentRoute, selectedTrip?.tollsEnabled);
  const tollComparison = routeComparison(analysis?.current, analysis?.tolls);
  const avoidTollComparison = routeComparison(analysis?.current, analysis?.avoidTolls);
  const avgActualSeconds = trips.length
    ? trips.reduce((sum, trip) => sum + Number(trip.actualDurationSeconds || 0), 0) / trips.length
    : 0;
  const tollTripCount = trips.filter(trip => trip.tollsEnabled).length;
  const todayKey = scheduleFromIso(new Date().toISOString()).scheduledDate;
  const todayTripCount = trips.filter(trip => trip.scheduledDate === todayKey).length;

  return (
    <div className="transport-trips-page">
      <div className="transport-trips-toolbar">
        <div>
          <h1>Trips</h1>
          <p>Completed truck movements with traffic, fuel, toll and alternative-route analysis.</p>
        </div>
        <div className="transport-trips-actions">
          <select value={truckFilter} onChange={event => setTruckFilter(event.target.value)}>
            <option value="all">All trucks</option>
            {TRUCK_LANES.map(lane => <option key={lane.rego} value={lane.rego}>{lane.rego}</option>)}
          </select>
          <button type="button" onClick={() => setLoadVersion(value => value + 1)} disabled={loading}>Refresh</button>
        </div>
      </div>

      {error ? <div className="transport-trips-error">{error}</div> : null}

      <div className="transport-trips-summary">
        <TripMetric label="Completed trips" value={loading ? 'Loading' : filteredTrips.length} />
        <TripMetric label="Trips today" value={loading ? 'Loading' : todayTripCount} />
        <TripMetric label="Average actual time" value={avgActualSeconds ? formatDuration(avgActualSeconds) : 'Pending'} />
        <TripMetric label="Trips with tolls" value={loading ? 'Loading' : tollTripCount} tone="orange" />
      </div>

      <div className="transport-trips-layout">
        <aside className="transport-trips-list">
          <div className="transport-trips-list-head">
            <strong>Recent trips</strong>
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

        <section className="transport-trips-detail">
          {selectedTrip ? (
            <>
              <div className="transport-trip-detail-head">
                <div>
                  <div className="transport-trip-detail-kicker">
                    <TripPill>{selectedTrip.truckLabel}</TripPill>
                    <span>{selectedTrip.scheduledDate ? formatBoardDay(selectedTrip.scheduledDate) : 'Date unavailable'}</span>
                  </div>
                  <h2>{selectedTrip.title}</h2>
                  <p>{selectedTrip.siteLocation || selectedTrip.subtitle}</p>
                </div>
                <TripPill tone={selectedTrip.tollsEnabled ? 'orange' : 'green'}>{selectedTrip.tollsEnabled ? 'Tolls used' : 'No tolls recorded'}</TripPill>
              </div>

              <div className="transport-trip-detail-grid">
                <div className="transport-trip-route-card">
                  <RouteMapCanvas
                    routeData={currentRoute}
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
                </div>

                <div className="transport-trip-stat-grid">
                  <TripMetric label="Time taken" value={selectedTrip.actualDurationSeconds ? formatDuration(selectedTrip.actualDurationSeconds) : 'Not confirmed'} />
                  <TripMetric label="Route duration" value={currentRoute ? formatDuration(currentRoute.durationSeconds) : 'Calculating'} />
                  <TripMetric label="Distance travelled" value={currentRoute ? formatDistance(currentRoute.distanceMeters) : 'Calculating'} />
                  <TripMetric label="Traffic encountered" value={currentRoute ? formatDuration(currentRoute.trafficDelaySeconds || 0) : 'Calculating'} tone="orange" />
                  <TripMetric label="Fuel used estimate" value={formatFuel(fuel.litres)} tone="green" />
                  <TripMetric label="Consumption estimate" value={fuel.consumption ? `${fuel.consumption.toFixed(1)} L/100km` : 'Pending route'} tone="green" />
                  <TripMetric label="Toll fees estimate" value={formatCurrency(tollEstimate)} tone="orange" />
                  <TripMetric label="Route source" value={currentRoute?.trafficProvider || 'TomTom route preview'} />
                </div>
              </div>

              <div className="transport-trip-panels">
                <div className="transport-trip-panel">
                  <h3>Trip timeline</h3>
                  <div className="transport-trip-timeline">
                    <div><span>Started</span><strong>{formatClock(selectedTrip.startedAt)}</strong></div>
                    <div><span>Arrived / unloading</span><strong>{formatClock(selectedTrip.unloadingAt)}</strong></div>
                    <div><span>Completed</span><strong>{formatClock(selectedTrip.completedAt)}</strong></div>
                  </div>
                </div>

                <div className="transport-trip-panel">
                  <h3>Route legs</h3>
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
                            <small>{leg.tollsEnabled ? 'Tolls enabled' : 'Avoid tolls'}</small>
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
                  <p>Fuel is estimated for a 7.5 tonne diesel truck at {FUEL_LITRES_PER_100KM} L/100km with a traffic idle uplift of {TRAFFIC_IDLE_LITRES_PER_MINUTE.toFixed(3)} L/min.</p>
                  <p>Toll fees are labelled as estimates because the current stored route response records toll preference and route time, not the exact toll gantry charges.</p>
                </div>
              </div>
            </>
          ) : (
            <div className="transport-trips-no-selection">
              <h2>No trip selected</h2>
              <p>Completed transport trips will appear here once drivers have started and completed deliveries.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
