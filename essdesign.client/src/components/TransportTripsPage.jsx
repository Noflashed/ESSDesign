import React, { useEffect, useMemo, useRef, useState } from 'react';
import { analysisAPI, truckLiveLocationsAPI } from '../services/api';
import RouteMapCanvas from './transport/RouteMapCanvas';
import {
  TRUCK_LANES,
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
const ROUTE_TIME_SAME_THRESHOLD_SECONDS = 60;

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

function formatShortDate(value) {
  const date = asDate(value);
  if (!date) return 'Date unavailable';
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCompactDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatSpeed(speedMps) {
  if (!Number.isFinite(speedMps) || speedMps <= 0) return '0 km/h';
  return `${Math.round(speedMps * 3.6)} km/h`;
}

function formatConsumption(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} L/100km` : 'Pending';
}

function formatSignedMinutes(seconds, positiveSuffix = 'faster', negativeSuffix = 'slower') {
  if (!Number.isFinite(seconds)) return 'Pending';
  if (Math.abs(seconds) <= ROUTE_TIME_SAME_THRESHOLD_SECONDS) return 'same time';
  const minutes = Math.max(1, Math.round(Math.abs(seconds) / 60));
  if (seconds > 0) return `${minutes}m ${positiveSuffix}`;
  if (seconds < 0) return `+${minutes}m ${negativeSuffix}`;
  return 'No change';
}

function formatSignedDistance(meters) {
  if (!Number.isFinite(meters)) return 'Pending';
  const km = Math.abs(meters) / 1000;
  const value = km >= 10 ? km.toFixed(0) : km.toFixed(1);
  if (meters > 0) return `+${value} km`;
  if (meters < 0) return `-${value} km`;
  return 'Same';
}

function getDriverLabel(trip) {
  const raw = trip?.driverName || trip?.driverUserId || '';
  if (!raw) return 'Driver not assigned';
  const value = String(raw);
  if (value.includes('@')) return value.split('@')[0].replace(/[._-]+/g, ' ');
  return value.replace(/^auth0\|/i, '').replace(/[._-]+/g, ' ');
}

function getPointCoordinate(point) {
  const lat = Number(point?.latitude ?? point?.lat);
  const lon = Number(point?.longitude ?? point?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function getCoordinateKey(point) {
  const coordinate = getPointCoordinate(point);
  return coordinate ? `${coordinate.lat.toFixed(6)},${coordinate.lon.toFixed(6)}` : '';
}

function getTripEndpointPoints(trip) {
  const historyPoints = Array.isArray(trip?.historyPoints) ? trip.historyPoints : [];
  const firstHistoryPoint = historyPoints[0] || null;
  const lastHistoryPoint = historyPoints[historyPoints.length - 1] || null;
  return {
    startPoint: firstHistoryPoint || trip?.gpsRoute?.yard || null,
    endPoint: lastHistoryPoint || trip?.gpsRoute?.site || null,
  };
}

function formatResolvedAddress(address) {
  if (!address) return '';
  return address.label || address.address || [address.street, address.suburb, address.state].filter(Boolean).join(', ');
}

function stripAddressNoise(value) {
  return String(value || '')
    .replace(/\b(Australia|New South Wales|Queensland|Victoria|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory)\b/gi, '')
    .replace(/\b(NSW|QLD|VIC|SA|WA|TAS|NT|ACT)\b/gi, '')
    .replace(/\b\d{4}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeStreetAddress(value) {
  return /^\d+\b/.test(value)
    || /\b(st|street|rd|road|ave|avenue|dr|drive|ct|court|cct|circuit|cres|crescent|ln|lane|hwy|highway|pde|parade|pl|place|way)\b/i.test(value);
}

function formatCompactAddress(label) {
  const raw = String(label || '').trim();
  if (!raw) return '';
  if (/^(recorded|unknown)/i.test(raw)) return raw;

  const parts = raw.split(',').map(part => stripAddressNoise(part)).filter(Boolean);
  if (!parts.length) return raw;

  const preferred = looksLikeStreetAddress(parts[0]) && parts[1] ? parts[1] : parts[0];
  if (preferred.length <= 28) return preferred;
  return `${preferred.slice(0, 25).trim()}...`;
}

function getTripRouteLabels(trip, addressLabels = {}) {
  const { startPoint, endPoint } = getTripEndpointPoints(trip);
  const startKey = getCoordinateKey(startPoint);
  const endKey = getCoordinateKey(endPoint);
  const startAddress = formatResolvedAddress(addressLabels[startKey]);
  const endAddress = formatResolvedAddress(addressLabels[endKey]);
  const start = startAddress || (startKey ? 'Recorded start location' : 'Unknown start');
  const end = endAddress || (endKey ? 'Recorded finish location' : 'Unknown finish');
  return {
    start,
    end,
    startShort: formatCompactAddress(start),
    endShort: formatCompactAddress(end),
    startKey,
    endKey,
  };
}

function getTripStats(trip) {
  const route = trip?.gpsRoute || buildRouteFromHistory(trip?.historyPoints);
  const distanceMeters = route?.distanceMeters ?? 0;
  const durationSeconds = route?.durationSeconds ?? trip?.actualDurationSeconds ?? 0;
  const trafficSeconds = route?.slowOrIdleSeconds ?? route?.trafficDelaySeconds ?? 0;
  const fuel = calculateFuel(distanceMeters, trafficSeconds);
  const averageSpeedMps = durationSeconds > 0 ? distanceMeters / durationSeconds : 0;
  return {
    route,
    distanceMeters,
    durationSeconds,
    trafficSeconds,
    fuel,
    averageSpeedMps,
    maxSpeedMps: route?.maxSpeedMps ?? 0,
    pointCount: route?.pointCount || trip?.historyPoints?.length || 0,
  };
}

function tripMatchesDateFilter(trip, dateFilter) {
  if (dateFilter === 'all') return true;
  const started = asDate(trip?.startedAt);
  if (!started) return false;
  const now = new Date();
  if (dateFilter === 'today') {
    return started.toDateString() === now.toDateString();
  }
  if (dateFilter === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return started >= weekAgo && started <= now;
  }
  return true;
}

function exportTripsCsv(trips, addressLabels = {}) {
  const header = ['Truck', 'Driver', 'Start', 'Finish', 'Started', 'Ended', 'Duration', 'Distance', 'Fuel', 'Traffic'];
  const rows = trips.map(trip => {
    const labels = getTripRouteLabels(trip, addressLabels);
    const stats = getTripStats(trip);
    return [
      trip.truckLabel,
      getDriverLabel(trip),
      labels.start,
      labels.end,
      formatDateTime(trip.startedAt),
      formatDateTime(trip.completedAt),
      formatDuration(stats.durationSeconds),
      formatDistance(stats.distanceMeters),
      formatFuel(stats.fuel.litres),
      formatDuration(stats.trafficSeconds || 0),
    ];
  });
  const csv = [header, ...rows]
    .map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ess-trips-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
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
    alternatives: validRoutes.length === 1 && Array.isArray(validRoutes[0].alternatives)
      ? validRoutes[0].alternatives
      : [],
  };
}

function routeHasPath(route) {
  return Array.isArray(route?.pathPoints) && route.pathPoints.length > 1;
}

function getRouteAlternatives(route) {
  return Array.isArray(route?.alternatives) ? route.alternatives : [];
}

function routePointKey(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lon = Number(point?.lon ?? point?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)},${lon.toFixed(5)}` : '';
}

function routeSampleKey(route) {
  const points = Array.isArray(route?.pathPoints) ? route.pathPoints : [];
  if (points.length < 2) return '';
  const indexes = [0, Math.floor(points.length / 3), Math.floor((points.length * 2) / 3), points.length - 1];
  return Array.from(new Set(indexes))
    .map(index => routePointKey(points[index]))
    .filter(Boolean)
    .join('|');
}

function routesAreEquivalent(primaryRoute, candidateRoute) {
  if (!routeHasPath(primaryRoute) || !routeHasPath(candidateRoute)) return false;
  if (primaryRoute === candidateRoute) return true;

  const primaryDistance = Number(primaryRoute.distanceMeters || 0);
  const candidateDistance = Number(candidateRoute.distanceMeters || 0);
  const primaryDuration = Number(primaryRoute.durationSeconds || 0);
  const candidateDuration = Number(candidateRoute.durationSeconds || 0);
  const distanceDelta = Math.abs(primaryDistance - candidateDistance);
  const durationDelta = Math.abs(primaryDuration - candidateDuration);

  return routeSampleKey(primaryRoute) === routeSampleKey(candidateRoute)
    && distanceDelta < 100
    && durationDelta < 60;
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

function TripIcon({ type = 'truck' }) {
  if (type === 'search') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>;
  }
  if (type === 'calendar') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
  }
  if (type === 'driver') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  }
  if (type === 'export') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M5 20h14" /></svg>;
  }
  if (type === 'distance') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18c4-11 12-11 16 0" /><path d="M12 18l3-6" /></svg>;
  }
  if (type === 'time') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></svg>;
  }
  if (type === 'fuel') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8v18H7z" /><path d="M15 8h2l2 3v7a2 2 0 0 0 4 0v-6" /><path d="M9 7h4" /></svg>;
  }
  if (type === 'traffic') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17h10l2-5H5l2 5Z" /><circle cx="8" cy="18" r="2" /><circle cx="16" cy="18" r="2" /><path d="M8 12l2-5h4l2 5" /></svg>;
  }
  if (type === 'toll') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.6-1-1.7-1.5-3.1-1.5-1.8 0-3 .8-3 2.1 0 3 6.2 1.3 6.2 4.7 0 1.4-1.2 2.3-3.2 2.3-1.6 0-2.8-.6-3.5-1.8" /><path d="M12 6v12" /></svg>;
  }
  if (type === 'speed') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15a8 8 0 0 1 16 0" /><path d="m12 15 5-5" /><path d="M12 19h.01" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17H4V7h10v10h-2" /><path d="M14 10h4l3 3v4h-3" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>;
}

function TripMetric({ label, value, sublabel = '', icon = 'distance', tone = 'default' }) {
  return (
    <div className={`transport-trip-metric transport-trip-metric-${tone}`}>
      <div className="transport-trip-metric-icon"><TripIcon type={icon} /></div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        {sublabel ? <small>{sublabel}</small> : null}
      </div>
    </div>
  );
}

function TripPill({ children, tone = 'navy' }) {
  return <span className={`transport-trip-pill transport-trip-pill-${tone}`}>{children}</span>;
}

function TripListCard({ trip, selected, onSelect, addressLabels }) {
  const stats = getTripStats(trip);
  const labels = getTripRouteLabels(trip, addressLabels);
  const driverLabel = getDriverLabel(trip);
  const routeTitle = `${labels.start} to ${labels.end}`;
  return (
    <button type="button" className={`transport-trip-card ${selected ? 'selected' : ''}`} onClick={onSelect} title={routeTitle}>
      <div className="transport-trip-card-main">
        <div className="transport-trip-card-identity">
          <span className="transport-trip-truck-avatar"><TripIcon /></span>
          <div>
            <div className="transport-trip-card-title-row">
              <strong>{trip.truckLabel}</strong>
              <span>{formatClock(trip.startedAt)} - {formatClock(trip.completedAt)}</span>
            </div>
            <div className="transport-trip-card-route">
              <span>{labels.startShort}</span>
              <b aria-hidden="true">-&gt;</b>
              <span>{labels.endShort}</span>
            </div>
            <small>{driverLabel}</small>
          </div>
        </div>
      </div>

      <div className="transport-trip-card-snapshot">
        <span><b>{formatCompactDuration(stats.durationSeconds)}</b><small>Time</small></span>
        <span><b>{formatDistance(stats.distanceMeters)}</b><small>Distance</small></span>
        <span><b>{formatFuel(stats.fuel.litres)}</b><small>Fuel</small></span>
      </div>

      <b className="transport-trip-card-chevron" aria-hidden="true">&gt;</b>
    </button>
  );
}

function TripTimeline({ trip, stats, addressLabels }) {
  const labels = getTripRouteLabels(trip, addressLabels);
  const movingEnd = new Date((asDate(trip.startedAt)?.getTime() || 0) + Math.max(0, (stats.durationSeconds || 0) - (stats.trafficSeconds || 0)) * 1000);
  const trafficStart = new Date((asDate(trip.completedAt)?.getTime() || 0) - Math.max(0, stats.trafficSeconds || 0) * 1000);
  return (
    <div className="transport-trip-timeline-list">
      <div className="transport-trip-timeline-item is-start">
        <span className="transport-trip-timeline-dot"><TripIcon type="truck" /></span>
        <div>
          <strong>{formatClock(trip.startedAt)}</strong>
          <b>Start</b>
          <small title={labels.start}>{labels.startShort}</small>
        </div>
      </div>
      <div className="transport-trip-timeline-item is-moving">
        <span className="transport-trip-timeline-dot"><TripIcon type="truck" /></span>
        <div>
          <strong>{formatClock(trip.startedAt)} - {stats.trafficSeconds ? formatClock(trafficStart) : formatClock(movingEnd)}</strong>
          <b>Moving</b>
          <small>{formatDistance(stats.distanceMeters)} - Avg {formatSpeed(stats.averageSpeedMps)}</small>
        </div>
      </div>
      <div className="transport-trip-timeline-item is-traffic">
        <span className="transport-trip-timeline-dot"><TripIcon type="traffic" /></span>
        <div>
          <strong>{stats.trafficSeconds ? `${formatClock(trafficStart)} - ${formatClock(trip.completedAt)}` : 'No major delay'}</strong>
          <b>Traffic delay</b>
          <small>{formatCompactDuration(stats.trafficSeconds || 0)}</small>
        </div>
      </div>
      <div className="transport-trip-timeline-item is-end">
        <span className="transport-trip-timeline-dot"><TripIcon type="driver" /></span>
        <div>
          <strong>{formatClock(trip.completedAt)}</strong>
          <b>End</b>
          <small title={labels.end}>{labels.endShort}</small>
        </div>
      </div>
    </div>
  );
}

function AlternativeRouteRow({ title, via, route, baselineSeconds, baselineDistance, tolls }) {
  const duration = route?.durationSeconds;
  const distance = route?.distanceMeters;
  const deltaSeconds = Number.isFinite(baselineSeconds) && Number.isFinite(duration) ? baselineSeconds - duration : null;
  const deltaMeters = Number.isFinite(baselineDistance) && Number.isFinite(distance) ? distance - baselineDistance : null;
  const isFaster = Number.isFinite(deltaSeconds) && deltaSeconds > 0;
  const timeTone = !Number.isFinite(deltaSeconds) || Math.abs(deltaSeconds) <= ROUTE_TIME_SAME_THRESHOLD_SECONDS
    ? 'neutral'
    : isFaster ? 'positive' : 'negative';
  return (
    <div className="transport-trip-alt-row">
      <div className="transport-trip-alt-main">
        <strong>{title}</strong>
        <TripPill>{via}</TripPill>
      </div>
      <div><b>{duration ? formatCompactDuration(duration) : 'Pending'}</b><span>ETA</span></div>
      <div className={timeTone}><b>{formatSignedMinutes(deltaSeconds)}</b><span>Time diff</span></div>
      <div><b>{distance ? formatDistance(distance) : 'Pending'}</b><span>Distance</span></div>
      <div className={Number(deltaMeters) <= 0 ? 'positive' : 'negative'}><b>{formatSignedDistance(deltaMeters)}</b><span>Distance diff</span></div>
      <div><b>{formatCurrency(tolls || 0)}</b><span>Tolls</span></div>
      <button type="button">View route</button>
    </div>
  );
}

export default function TransportTripsPage() {
  const [gpsTrips, setGpsTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [selectionCleared, setSelectionCleared] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('week');
  const [truckFilter, setTruckFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [loadVersion, setLoadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [mapOpenSignal, setMapOpenSignal] = useState(0);
  const [showAlternativeRoutes, setShowAlternativeRoutes] = useState(true);
  const [addressLabels, setAddressLabels] = useState({});
  const analysisCacheRef = useRef(new Map());
  const addressCacheRef = useRef(new Map());

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

  const driverOptions = useMemo(() => {
    const labels = new Set();
    trips.forEach(trip => labels.add(getDriverLabel(trip)));
    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [trips]);

  const filteredTrips = useMemo(() => {
      const query = searchTerm.trim().toLowerCase();
    return trips.filter(trip => {
      if (truckFilter !== 'all' && trip.truckLabel !== truckFilter) return false;
      if (driverFilter !== 'all' && getDriverLabel(trip) !== driverFilter) return false;
      if (!tripMatchesDateFilter(trip, dateFilter)) return false;
      if (!query) return true;
      const labels = getTripRouteLabels(trip, addressLabels);
      const haystack = [
        trip.truckLabel,
        getDriverLabel(trip),
        labels.start,
        labels.end,
        formatShortDate(trip.startedAt),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [trips, truckFilter, driverFilter, dateFilter, searchTerm, addressLabels]);

  useEffect(() => {
    if (selectedTripId && !filteredTrips.some(trip => trip.id === selectedTripId)) {
      setSelectedTripId(null);
    }
    if (!selectedTripId && !selectionCleared && filteredTrips.length) {
      setSelectedTripId(filteredTrips[0].id);
    }
  }, [filteredTrips, selectedTripId, selectionCleared]);

  const selectedTrip = useMemo(
    () => filteredTrips.find(trip => trip.id === selectedTripId) || null,
    [filteredTrips, selectedTripId],
  );

  useEffect(() => {
    let cancelled = false;
    const targetsByKey = new Map();
    const addTripTargets = (trip) => {
      if (!trip) return;
      const { startPoint, endPoint } = getTripEndpointPoints(trip);
      [startPoint, endPoint].forEach(point => {
        const coordinate = getPointCoordinate(point);
        const key = getCoordinateKey(point);
        if (!key || targetsByKey.has(key) || addressCacheRef.current.has(key)) {
          return;
        }
        targetsByKey.set(key, coordinate);
      });
    };

    addTripTargets(selectedTrip);
    filteredTrips.slice(0, 12).forEach(addTripTargets);
    const targets = Array.from(targetsByKey.entries()).slice(0, 24);
    if (!targets.length) {
      return () => { cancelled = true; };
    }

    async function loadAddresses() {
      const resolved = {};
      await Promise.all(targets.map(async ([key, coordinate]) => {
        try {
          const address = await analysisAPI.reverseGeocode(coordinate);
          const nextAddress = address || {};
          addressCacheRef.current.set(key, nextAddress);
          resolved[key] = nextAddress;
        } catch {
          const fallback = { label: '' };
          addressCacheRef.current.set(key, fallback);
          resolved[key] = fallback;
        }
      }));
      if (!cancelled && Object.keys(resolved).length) {
        setAddressLabels(previous => ({ ...previous, ...resolved }));
      }
    }

    loadAddresses();
    return () => { cancelled = true; };
  }, [filteredTrips, selectedTrip]);

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
  const roadRoute = plannedRoute || gpsRoute;
  const displayRoute = roadRoute;
  const selectedStats = selectedTrip ? getTripStats(selectedTrip) : null;
  const selectedLabels = selectedTrip ? getTripRouteLabels(selectedTrip, addressLabels) : { start: '', end: '' };
  const usingGpsBreadcrumbs = Boolean(gpsRoute);
  const statsDistanceMeters = roadRoute?.distanceMeters ?? selectedStats?.distanceMeters;
  const statsDurationSeconds = gpsRoute?.durationSeconds ?? selectedTrip?.actualDurationSeconds ?? plannedRoute?.durationSeconds ?? selectedStats?.durationSeconds;
  const statsTrafficSeconds = gpsRoute?.slowOrIdleSeconds ?? plannedRoute?.trafficDelaySeconds ?? selectedStats?.trafficSeconds;
  const fuel = calculateFuel(statsDistanceMeters, statsTrafficSeconds);
  const tollEstimate = estimateTollFees(displayRoute, selectedTrip?.tollsEnabled);
  const tollRoute = analysis?.tolls?.combined || null;
  const avoidTollRoute = analysis?.avoidTolls?.combined || null;
  const alternativeRouteItems = useMemo(() => {
    if (!routeHasPath(plannedRoute)) return [];

    const candidates = [];
    const addCandidate = (candidate) => {
      candidates.push({
        ...candidate,
        tolls: estimateTollFees(candidate.route, candidate.tollsUsed),
      });
    };

    if (tollRoute?.usesTolls) {
      addCandidate({
        id: 'alternative-tolls',
        via: 'via toll roads',
        route: tollRoute,
        tollsUsed: true,
      });
    }

    getRouteAlternatives(tollRoute)
      .filter(route => route?.usesTolls)
      .forEach((route, index) => {
        addCandidate({
          id: `alternative-tolls-provider-${index}`,
          via: 'via toll roads',
          route,
          tollsUsed: true,
        });
      });

    getRouteAlternatives(plannedRoute).forEach((route, index) => {
      const usesTolls = Boolean(route?.usesTolls);
      addCandidate({
        id: `alternative-provider-${index}`,
        via: usesTolls ? 'via toll roads' : 'road alternative',
        route,
        tollsUsed: usesTolls,
      });
    });

    addCandidate({
      id: 'alternative-avoid-tolls',
      via: 'avoid tolls',
      route: avoidTollRoute,
      tollsUsed: false,
    });

    getRouteAlternatives(avoidTollRoute)
      .filter(route => !route?.usesTolls)
      .forEach((route, index) => {
        addCandidate({
          id: `alternative-avoid-tolls-provider-${index}`,
          via: 'avoid tolls',
          route,
          tollsUsed: false,
        });
      });

    const distinctCandidates = [];
    candidates.forEach(candidate => {
      if (!routeHasPath(candidate.route) || routesAreEquivalent(plannedRoute, candidate.route)) {
        return;
      }

      if (distinctCandidates.some(existing => routesAreEquivalent(existing.route, candidate.route))) {
        return;
      }

      distinctCandidates.push(candidate);
    });

    return distinctCandidates
      .map((candidate, index) => ({
        ...candidate,
        title: `Alternative ${index + 1}`,
        mapLabel: `Alt ${index + 1}`,
        legendClassName: index === 0 ? 'alternate-one' : 'alternate-two',
        routeData: candidate.route,
      }));
  }, [plannedRoute, tollRoute, avoidTollRoute]);
  const visibleAlternativeRouteItems = useMemo(
    () => showAlternativeRoutes ? alternativeRouteItems : [],
    [showAlternativeRoutes, alternativeRouteItems],
  );
  const alternativeMapRoutes = useMemo(
    () => visibleAlternativeRouteItems.map(item => ({ id: item.id, routeData: item.routeData })),
    [visibleAlternativeRouteItems],
  );
  const avgActualSeconds = filteredTrips.length
    ? filteredTrips.reduce((sum, trip) => sum + Number(getTripStats(trip).durationSeconds || 0), 0) / filteredTrips.length
    : 0;
  const todayKey = scheduleFromIso(new Date().toISOString()).scheduledDate;
  const todayTripCount = trips.filter(trip => trip.scheduledDate === todayKey).length;
  const summary = filteredTrips.reduce((total, trip) => {
    const stats = getTripStats(trip);
    total.distanceMeters += Number(stats.distanceMeters || 0);
    total.fuelLitres += Number(stats.fuel.litres || 0);
    total.trafficSeconds += Number(stats.trafficSeconds || 0);
    return total;
  }, { distanceMeters: 0, fuelLitres: 0, trafficSeconds: 0 });
  const trafficPercent = statsDurationSeconds ? Math.round((Number(statsTrafficSeconds || 0) / statsDurationSeconds) * 100) : 0;
  const selectedTitle = selectedTrip
    ? `${selectedTrip.truckLabel} Trip`
    : 'Select a trip';
  const selectedRouteFullTitle = selectedTrip
    ? `${selectedLabels.start} to ${selectedLabels.end}`
    : '';

  return (
    <div className="transport-trips-page">
      <div className="transport-trips-toolbar">
        <h1>Trip Analysis</h1>
        <button type="button" className="transport-trip-export" onClick={() => exportTripsCsv(filteredTrips, addressLabels)} disabled={!filteredTrips.length}>
          <TripIcon type="export" />
          <span>Export</span>
        </button>
      </div>

      <div className="transport-trip-control-bar">
        <label className="transport-trip-search">
          <input
            value={searchTerm}
            onChange={event => {
              setSearchTerm(event.target.value);
              setSelectionCleared(false);
            }}
            placeholder="Search trips, truck, driver or location..."
          />
          <TripIcon type="search" />
        </label>

        <div className="transport-trip-filter-shell">
          <TripIcon type="calendar" />
          <select value={dateFilter} onChange={event => {
            setDateFilter(event.target.value);
            setSelectionCleared(false);
          }}>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="all">Last {TRIP_WINDOW_DAYS} days</option>
          </select>
        </div>

        <div className="transport-trip-filter-shell">
          <TripIcon type="truck" />
          <select
            value={truckFilter}
            onChange={event => {
              setTruckFilter(event.target.value);
              setSelectedTripId(null);
              setSelectionCleared(false);
            }}
          >
            <option value="all">Truck</option>
            {TRUCK_LANES.map(lane => <option key={lane.rego} value={lane.rego}>{lane.rego}</option>)}
          </select>
        </div>

        <div className="transport-trip-filter-shell">
          <TripIcon type="driver" />
          <select value={driverFilter} onChange={event => {
            setDriverFilter(event.target.value);
            setSelectionCleared(false);
          }}>
            <option value="all">Driver</option>
            {driverOptions.map(driver => <option key={driver} value={driver}>{driver}</option>)}
          </select>
        </div>

        <button type="button" className="transport-trip-filter-button" onClick={() => setLoadVersion(value => value + 1)} disabled={loading}>
          <TripIcon type="calendar" />
          <span>{loading ? 'Loading' : 'Refresh'}</span>
        </button>
      </div>

      {error ? <div className="transport-trips-error">{error}</div> : null}

      <div className="transport-trips-layout">
        <aside className="transport-trips-list">
          <div className="transport-trips-list-head">
            <strong>Trips</strong>
            <span>{loading ? '...' : filteredTrips.length} trips</span>
          </div>
          {loading ? (
            <div className="transport-trips-empty">Loading completed trips...</div>
          ) : filteredTrips.length ? (
            filteredTrips.map(trip => (
              <TripListCard
                key={trip.id}
                trip={trip}
                selected={selectedTrip?.id === trip.id}
                addressLabels={addressLabels}
                onSelect={() => {
                  setSelectionCleared(false);
                  setSelectedTripId(trip.id);
                }}
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
                  <h2>{selectedTitle}</h2>
                  <div className="transport-trip-detail-route-title" title={selectedRouteFullTitle}>
                    <span>{selectedLabels.startShort}</span>
                    <b aria-hidden="true">-&gt;</b>
                    <span>{selectedLabels.endShort}</span>
                  </div>
                  <div className="transport-trip-detail-meta">
                    <span><TripIcon type="calendar" /> {formatShortDate(selectedTrip.startedAt)}</span>
                    <span><TripIcon type="truck" /> {selectedTrip.truckLabel}</span>
                    <span><TripIcon type="driver" /> {getDriverLabel(selectedTrip)}</span>
                  </div>
                </div>
                <div className="transport-trip-detail-actions">
                  <TripPill tone="green">Complete</TripPill>
                  <button type="button" className="transport-trip-map-button" onClick={() => setMapOpenSignal(value => value + 1)}>Open map</button>
                  <button
                    type="button"
                    className="transport-trip-close-button"
                    onClick={() => {
                      setSelectionCleared(true);
                      setSelectedTripId(null);
                    }}
                    aria-label="Close trip analysis"
                  >
                    x
                  </button>
                </div>
              </div>

              <div className="transport-trip-overview-grid">
                <div className="transport-trip-route-card">
                  <RouteMapCanvas
                    routeData={displayRoute}
                    loading={analysisLoading}
                    siteLocation={selectedLabels.end}
                    className="transport-trip-route-map"
                    interactive
                    expandable
                    openSignal={mapOpenSignal}
                    viewerTitle={`${selectedTrip.truckLabel} trip route`}
                    originLabel="Start"
                    destinationLabel="Finish"
                    alternativeRoutes={alternativeMapRoutes}
                  />
                  <div className="transport-trip-map-legend">
                    <span><i className="actual" /> Road route</span>
                    {visibleAlternativeRouteItems.map(item => (
                      <span key={item.id}><i className={item.legendClassName} /> {item.mapLabel}</span>
                    ))}
                    {alternativeRouteItems.length ? (
                      <label className={`transport-trip-alt-toggle ${showAlternativeRoutes ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={showAlternativeRoutes}
                          onChange={event => setShowAlternativeRoutes(event.target.checked)}
                        />
                        <span>Alternatives</span>
                      </label>
                    ) : null}
                  </div>
                  {analysisError ? <div className="transport-trip-route-error">{analysisError}</div> : null}
                  {!analysisLoading && analysis?.history?.error ? (
                    <div className="transport-trip-route-warning">{analysis.history.error}</div>
                  ) : null}
                  {!analysisLoading && !analysis?.history?.error && !usingGpsBreadcrumbs ? (
                    <div className="transport-trip-route-warning">No GPS breadcrumbs were recorded for this trip window yet, so this map is using the TomTom planned route fallback.</div>
                  ) : null}
                </div>

                <div className="transport-trip-overview-side">
                  <div className="transport-trip-address-strip">
                    <div>
                      <span>Start</span>
                      <strong title={selectedLabels.start}>{selectedLabels.start}</strong>
                      <small>{formatClock(selectedTrip.startedAt)}</small>
                    </div>
                    <div>
                      <span>Finish</span>
                      <strong title={selectedLabels.end}>{selectedLabels.end}</strong>
                      <small>{formatClock(selectedTrip.completedAt)}</small>
                    </div>
                  </div>

                  <div className="transport-trip-stat-grid transport-trip-stat-grid-hero">
                    <TripMetric icon="distance" label="Road distance" value={statsDistanceMeters ? formatDistance(statsDistanceMeters) : 'Calculating'} />
                    <TripMetric icon="time" label="Time taken" value={statsDurationSeconds ? formatCompactDuration(statsDurationSeconds) : 'Pending'} sublabel={`${formatClock(selectedTrip.startedAt)} - ${formatClock(selectedTrip.completedAt)}`} />
                    <TripMetric icon="fuel" label="Fuel estimate" value={formatFuel(fuel.litres)} sublabel={formatConsumption(fuel.consumption)} />
                    <TripMetric icon="traffic" label="Traffic delay" value={statsTrafficSeconds != null ? formatCompactDuration(statsTrafficSeconds || 0) : 'Pending'} sublabel={`${trafficPercent}% of trip`} tone="orange" />
                    <TripMetric icon="toll" label="Toll fees" value={tollEstimate ? formatCurrency(tollEstimate) : formatCurrency(0)} sublabel={selectedTrip.tollsEnabled ? 'Tolls used' : 'No toll flag'} />
                    <TripMetric icon="speed" label="Avg speed" value={formatSpeed((statsDistanceMeters && statsDurationSeconds) ? statsDistanceMeters / statsDurationSeconds : selectedStats?.averageSpeedMps)} sublabel={`Top ${formatSpeed(gpsRoute?.maxSpeedMps || selectedStats?.maxSpeedMps)}`} />
                  </div>
                </div>
              </div>

              <div className={`transport-trip-panels ${visibleAlternativeRouteItems.length ? '' : 'transport-trip-panels-single'}`}>
                <div className="transport-trip-panel">
                  <h3>Trip timeline</h3>
                  <TripTimeline trip={selectedTrip} stats={{
                    distanceMeters: statsDistanceMeters,
                    durationSeconds: statsDurationSeconds,
                    trafficSeconds: statsTrafficSeconds,
                    averageSpeedMps: (statsDistanceMeters && statsDurationSeconds) ? statsDistanceMeters / statsDurationSeconds : selectedStats?.averageSpeedMps,
                  }} addressLabels={addressLabels} />
                </div>

                {visibleAlternativeRouteItems.length ? (
                  <div className="transport-trip-panel transport-trip-alternatives">
                    <h3>Alternative routes</h3>
                    <small>Routes calculated at trip start time</small>
                    {visibleAlternativeRouteItems.map(item => (
                      <AlternativeRouteRow
                        key={item.id}
                        title={item.title}
                        via={item.via}
                        route={item.route}
                        baselineSeconds={plannedRoute?.durationSeconds ?? statsDurationSeconds}
                        baselineDistance={plannedRoute?.distanceMeters ?? statsDistanceMeters}
                        tolls={item.tolls}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          </section>
        ) : (
          <section className="transport-trips-detail transport-trips-no-selection">
            <strong>Select a driven trip</strong>
            <span>The analysis panel will open here using the actual GPS breadcrumb dataset.</span>
          </section>
        )}
      </div>

      <div className="transport-trip-hidden-summary" aria-hidden="true">
        <span>Actual driven trips: {filteredTrips.length}</span>
        <span>Today: {todayTripCount}</span>
        <span>Average: {avgActualSeconds ? formatDuration(avgActualSeconds) : 'Pending'}</span>
        <span>Distance: {formatDistance(summary.distanceMeters)}</span>
        <span>Fuel used: {formatFuel(summary.fuelLitres)}</span>
        <span>Traffic delay: {formatDuration(summary.trafficSeconds)}</span>
      </div>
    </div>
  );
}
