import { analysisAPI } from '../../services/api';

export const ESS_NAVY = '#102B5C';
export const ESS_ORANGE = '#F47C20';
export const YARD_LOCATION = '130 Gilba Road, Girraween, NSW, Australia';
export const SCREEN_START_HOUR = 6;
export const SCREEN_END_HOUR = 17;
export const BLOCK_LOADING_MINUTES = 30;
export const SCHEDULE_BLOCK_MINUTES = 90;
export const DEFAULT_TRANSIT_MINUTES = 45;
export const LIVE_TIMELINE_MINUTES = 1;
export const SITE_RADIUS_METERS = 1000;
export const ROUTE_FOLLOW_THRESHOLD_METERS = 30000;
export const TRUCK_LANES = [
  { id: 'truck-1', rego: 'ESS01', role: 'truck_ess01' },
  { id: 'truck-2', rego: 'ESS02', role: 'truck_ess02' },
  { id: 'truck-3', rego: 'ESS03', role: 'truck_ess03' },
];

const routeDataCache = new Map();
const routeBetweenDataCache = new Map();
const routeEstimatePromiseCache = new Map();
const routeEstimateValueCache = new Map();
const routeBetweenEstimatePromiseCache = new Map();
const routeBetweenEstimateValueCache = new Map();
let safetyBuildersCache = null;
let safetyBuildersCacheAt = 0;
const SAFETY_BUILDERS_CACHE_MS = 60 * 1000;

export function isTruckDeviceRole(role) {
  return role === 'truck_ess01' || role === 'truck_ess02' || role === 'truck_ess03';
}

export function getTruckAssignment(role) {
  return TRUCK_LANES.find(lane => lane.role === role) ?? null;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function buildScheduleIso(date, hour, minute) {
  if (!date || typeof hour !== 'number' || typeof minute !== 'number') {
    return null;
  }
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function formatBoardDay(value) {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const prefix = isSameDay(today, target)
    ? 'Today'
    : target.toLocaleDateString('en-AU', { weekday: 'short' });
  return `${prefix}, ${target.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export function formatTimeChip(hour, minute = 0) {
  const h = hour % 12 || 12;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${h}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0 min';
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${totalMinutes} min`;
  }
  if (minutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${minutes} min`;
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) {
    return '0 km';
  }
  const km = meters / 1000;
  return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}

function routeCacheKey(siteLocation, schedule = {}) {
  const location = String(siteLocation || '').trim().toLowerCase();
  if (!location) {
    return '';
  }
  const date = schedule.scheduledDate || schedule.date || '';
  const hour = Number.isFinite(schedule.scheduledHour) ? schedule.scheduledHour : '';
  const minute = Number.isFinite(schedule.scheduledMinute) ? schedule.scheduledMinute : '';
  const enableTolls = schedule.enableTolls ? 'tolls' : 'no-tolls';
  return `${location}|${date}|${hour}|${minute}|${enableTolls}`;
}

function routeBetweenCacheKey(fromLocation, toLocation, schedule = {}) {
  const from = String(fromLocation || '').trim().toLowerCase();
  const to = String(toLocation || '').trim().toLowerCase();
  if (!from || !to) {
    return '';
  }
  const date = schedule.scheduledDate || schedule.date || '';
  const hour = Number.isFinite(schedule.scheduledHour) ? schedule.scheduledHour : '';
  const minute = Number.isFinite(schedule.scheduledMinute) ? schedule.scheduledMinute : '';
  const enableTolls = schedule.enableTolls ? 'tolls' : 'no-tolls';
  return `${from}|${to}|${date}|${hour}|${minute}|${enableTolls}`;
}

export function formatActionTimestamp(isoValue) {
  if (!isoValue) {
    return null;
  }
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function getDeliveryActionRows(request) {
  if (!request) {
    return [];
  }
  return [
    { key: 'started', label: 'Started', value: formatActionTimestamp(request.deliveryStartedAt) },
    { key: 'offloading', label: 'Offloading', value: formatActionTimestamp(request.deliveryUnloadingAt) },
    { key: 'delivered', label: 'Delivered', value: formatActionTimestamp(request.deliveryConfirmedAt) },
  ].filter(row => Boolean(row.value));
}

export function scheduleStatusLabel(status) {
  switch (status) {
    case 'in_transit':
      return 'In transit to site';
    case 'unloading':
      return 'Offloading material';
    case 'return_transit':
      return 'Complete';
    default:
      return 'Scheduled';
  }
}

export function scheduleStatusAppearance(status) {
  switch (status) {
    case 'in_transit':
      return { accent: '#2563EB', background: '#E8F0FF', text: '#1D4ED8', title: '#0F2A62' };
    case 'unloading':
      return { accent: '#F47C20', background: '#FFF0E3', text: '#C25B0E', title: '#0F2A62' };
    case 'return_transit':
      return { accent: '#6B7280', background: '#EEF2F7', text: '#667085', title: '#0F2A62' };
    default:
      return { accent: '#0891B2', background: '#ECFEFF', text: '#0E7490', title: '#0F2A62' };
  }
}

export function deliveredTileAppearance() {
  return { accent: '#16A34A', background: '#ECFDF3', text: '#15803D', title: '#14532D' };
}

export function requestToCalendarEvent(request) {
  if (
    !request?.scheduledDate ||
    typeof request.scheduledHour !== 'number' ||
    typeof request.scheduledMinute !== 'number' ||
    request.archivedAt
  ) {
    return null;
  }

  return {
    id: `remote-${request.id}`,
    date: request.scheduledDate,
    hour: request.scheduledHour,
    minute: request.scheduledMinute,
    builderName: request.builderName,
    projectName: request.projectName,
    scaffoldingSystem: request.scaffoldingSystem,
    orderId: request.id,
    truckId: request.scheduledTruckId ?? request.truckId ?? null,
    truckLabel: request.scheduledTruckLabel ?? request.truckLabel ?? null,
  };
}

export function eventTruckIndex(event) {
  if (event?.truckId) {
    const explicitIndex = TRUCK_LANES.findIndex(lane => lane.id === event.truckId);
    if (explicitIndex >= 0) {
      return explicitIndex;
    }
  }

  const source = event?.orderId || event?.builderName || event?.projectName || event?.id || '';
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash % TRUCK_LANES.length;
}

export function findProjectLocation(builders, request) {
  const byIds = builders
    ?.find(builder => builder.id === request.builderId)
    ?.projects.find(project => project.id === request.projectId)?.siteLocation;
  if (byIds) {
    return byIds;
  }

  const normalizedBuilder = (request.builderName || '').trim().toLowerCase();
  const normalizedProject = (request.projectName || '').trim().toLowerCase();
  return (
    builders
      ?.find(builder => (builder.name || '').trim().toLowerCase() === normalizedBuilder)
      ?.projects.find(project => (project.name || '').trim().toLowerCase() === normalizedProject)?.siteLocation ?? null
  );
}

export async function getSafetyBuildersCached(getBuildersFn) {
  const now = Date.now();
  if (safetyBuildersCache && now - safetyBuildersCacheAt < SAFETY_BUILDERS_CACHE_MS) {
    return safetyBuildersCache;
  }
  const builders = await getBuildersFn({ includeArchived: true }).catch(() => []);
  safetyBuildersCache = builders;
  safetyBuildersCacheAt = now;
  return builders;
}

export async function fetchRouteData(siteLocation, schedule = {}) {
  if (!siteLocation) {
    return null;
  }

  try {
    const preview = await analysisAPI.routePreview(siteLocation, schedule);
    if (!preview?.yard || !preview?.site || !Array.isArray(preview?.pathPoints) || preview.pathPoints.length === 0) {
      return null;
    }

    return {
      yard: {
        lat: Number(preview.yard.lat),
        lon: Number(preview.yard.lon),
      },
      site: {
        lat: Number(preview.site.lat),
        lon: Number(preview.site.lon),
      },
      distanceMeters: Number(preview.distanceMeters) || 0,
      baseDurationSeconds: Number(preview.baseDurationSeconds) || Number(preview.durationSeconds) || 0,
      durationSeconds: Number(preview.durationSeconds) || 0,
      trafficDelaySeconds: Number(preview.trafficDelaySeconds) || 0,
      hasLiveTraffic: Boolean(preview.hasLiveTraffic),
      trafficProvider: preview.trafficProvider || '',
      trafficNote: preview.trafficNote || '',
      pathPoints: preview.pathPoints
        .map(point => ({
          lat: Number(point.lat),
          lon: Number(point.lon),
        }))
        .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon)),
    };
  } catch {
    return null;
  }
}

export async function getCachedRouteData(siteLocation, schedule = {}) {
  const key = routeCacheKey(siteLocation, schedule);
  if (!key) {
    return null;
  }
  if (!routeDataCache.has(key)) {
    routeDataCache.set(
      key,
      fetchRouteData(siteLocation, schedule).then(routeData => {
        if (!routeData) {
          routeDataCache.delete(key);
        }
        return routeData;
      }),
    );
  }
  return routeDataCache.get(key);
}

export async function getCachedRouteEstimate(siteLocation, schedule = {}) {
  const key = routeCacheKey(siteLocation, schedule);
  if (!key) {
    return null;
  }
  if (!routeEstimatePromiseCache.has(key)) {
    routeEstimatePromiseCache.set(
      key,
      getCachedRouteData(siteLocation, schedule).then(routeData => {
        const estimate = routeData
          ? {
              durationMinutes: Math.max(1, routeData.durationSeconds / 60),
              baseDurationMinutes: Math.max(1, (routeData.baseDurationSeconds || routeData.durationSeconds) / 60),
              trafficDelayMinutes: Math.max(0, (routeData.trafficDelaySeconds || 0) / 60),
              distanceMeters: routeData.distanceMeters,
              hasLiveTraffic: routeData.hasLiveTraffic,
              trafficProvider: routeData.trafficProvider,
              trafficNote: routeData.trafficNote,
            }
          : null;
        routeEstimateValueCache.set(key, estimate);
        if (!estimate) {
          routeEstimatePromiseCache.delete(key);
        }
        return estimate;
      }),
    );
  }
  return routeEstimatePromiseCache.get(key);
}

export function getCachedRouteEstimateValue(siteLocation, schedule = {}) {
  const key = routeCacheKey(siteLocation, schedule);
  if (!key) {
    return null;
  }
  return routeEstimateValueCache.has(key) ? routeEstimateValueCache.get(key) : undefined;
}

export async function fetchRouteDataBetween(fromLocation, toLocation, schedule = {}) {
  if (!fromLocation || !toLocation) {
    return null;
  }

  try {
    const preview = await analysisAPI.routePreviewBetween(fromLocation, toLocation, schedule);
    if (!preview?.yard || !preview?.site || !Array.isArray(preview?.pathPoints) || preview.pathPoints.length === 0) {
      return null;
    }

    return {
      yard: {
        lat: Number(preview.yard.lat),
        lon: Number(preview.yard.lon),
      },
      site: {
        lat: Number(preview.site.lat),
        lon: Number(preview.site.lon),
      },
      distanceMeters: Number(preview.distanceMeters) || 0,
      baseDurationSeconds: Number(preview.baseDurationSeconds) || Number(preview.durationSeconds) || 0,
      durationSeconds: Number(preview.durationSeconds) || 0,
      trafficDelaySeconds: Number(preview.trafficDelaySeconds) || 0,
      hasLiveTraffic: Boolean(preview.hasLiveTraffic),
      trafficProvider: preview.trafficProvider || '',
      trafficNote: preview.trafficNote || '',
      pathPoints: preview.pathPoints
        .map(point => ({
          lat: Number(point.lat),
          lon: Number(point.lon),
        }))
        .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon)),
    };
  } catch {
    return null;
  }
}

export async function getCachedRouteDataBetween(fromLocation, toLocation, schedule = {}) {
  const key = routeBetweenCacheKey(fromLocation, toLocation, schedule);
  if (!key) {
    return null;
  }
  if (!routeBetweenDataCache.has(key)) {
    routeBetweenDataCache.set(
      key,
      fetchRouteDataBetween(fromLocation, toLocation, schedule).then(routeData => {
        if (!routeData) {
          routeBetweenDataCache.delete(key);
        }
        return routeData;
      }),
    );
  }
  return routeBetweenDataCache.get(key);
}

export async function getCachedRouteEstimateBetween(fromLocation, toLocation, schedule = {}) {
  const key = routeBetweenCacheKey(fromLocation, toLocation, schedule);
  if (!key) {
    return null;
  }
  if (!routeBetweenEstimatePromiseCache.has(key)) {
    routeBetweenEstimatePromiseCache.set(
      key,
      getCachedRouteDataBetween(fromLocation, toLocation, schedule).then(routeData => {
        const estimate = routeData
          ? {
              durationMinutes: Math.max(1, routeData.durationSeconds / 60),
              baseDurationMinutes: Math.max(1, (routeData.baseDurationSeconds || routeData.durationSeconds) / 60),
              trafficDelayMinutes: Math.max(0, (routeData.trafficDelaySeconds || 0) / 60),
              distanceMeters: routeData.distanceMeters,
              hasLiveTraffic: routeData.hasLiveTraffic,
              trafficProvider: routeData.trafficProvider,
              trafficNote: routeData.trafficNote,
            }
          : null;
        routeBetweenEstimateValueCache.set(key, estimate);
        if (!estimate) {
          routeBetweenEstimatePromiseCache.delete(key);
        }
        return estimate;
      }),
    );
  }
  return routeBetweenEstimatePromiseCache.get(key);
}

export function getCachedRouteEstimateBetweenValue(fromLocation, toLocation, schedule = {}) {
  const key = routeBetweenCacheKey(fromLocation, toLocation, schedule);
  if (!key) {
    return null;
  }
  return routeBetweenEstimateValueCache.has(key) ? routeBetweenEstimateValueCache.get(key) : undefined;
}

export function getPlannedDurationMinutes(routeEstimate) {
  if (!routeEstimate) {
    return SCHEDULE_BLOCK_MINUTES;
  }
  return Math.max(30, routeEstimate.durationMinutes + BLOCK_LOADING_MINUTES + routeEstimate.durationMinutes);
}

export function getTimingProfile(routeEstimate, secondaryRoute = null) {
  const transitMinutes = Math.max(
    15,
    routeEstimate?.durationMinutes ? Math.round(routeEstimate.durationMinutes) : Math.round((SCHEDULE_BLOCK_MINUTES - BLOCK_LOADING_MINUTES) / 2),
  );
  const loadingMinutes = BLOCK_LOADING_MINUTES;
  const secondaryTravelMinutes = Math.max(0, Math.round((secondaryRoute?.travelDurationSeconds || 0) / 60));
  const secondaryServiceMinutes = secondaryRoute ? Math.max(0, Number(secondaryRoute.serviceMinutes) || 0) : 0;
  const returnMinutes = secondaryRoute
    ? Math.max(15, Math.round((secondaryRoute.returnDurationSeconds || 0) / 60))
    : transitMinutes;
  return {
    transitMinutes,
    loadingMinutes,
    secondaryTravelMinutes,
    secondaryServiceMinutes,
    returnMinutes,
    totalMinutes: transitMinutes + loadingMinutes + secondaryTravelMinutes + secondaryServiceMinutes + returnMinutes,
  };
}

export function getPrimaryPhaseMinutes(routeEstimate, secondaryRoute = null) {
  const timing = getTimingProfile(routeEstimate, secondaryRoute);
  return timing.transitMinutes + timing.loadingMinutes;
}

export function minutesFromIsoOnDate(isoValue, dateKey) {
  if (!isoValue) {
    return null;
  }
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime()) || formatDateKey(parsed) !== dateKey) {
    return null;
  }
  return (
    parsed.getHours() * 60 +
    parsed.getMinutes() +
    parsed.getSeconds() / 60 +
    parsed.getMilliseconds() / 60000
  );
}

export function projectRequestWindow(
  request,
  timing,
  dateKey,
  now,
  shiftedScheduledStartMinutes,
  nextActualStartMinutes,
  hasLaterRequest,
) {
  const scheduledStart = (request.scheduledHour ?? SCREEN_START_HOUR) * 60 + (request.scheduledMinute ?? 0);
  const plannedEndMinutes = scheduledStart + timing.totalMinutes;
  const actualStart = minutesFromIsoOnDate(request.deliveryStartedAt, dateKey);
  const unloadingAt = minutesFromIsoOnDate(request.deliveryUnloadingAt, dateKey);
  const confirmedAt = minutesFromIsoOnDate(request.deliveryConfirmedAt, dateKey);
  const nowMinutes =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;

  const startMinutes = Math.max(
    SCREEN_START_HOUR * 60,
    typeof actualStart === 'number' ? actualStart : shiftedScheduledStartMinutes,
  );

  let projectedEnd = startMinutes + timing.totalMinutes;
  let groupedCompletedCycle = false;
  let showReturnTransitTile = false;
  let returnTransitEndMinutes = null;

  if (request.deliveryStatus === 'unloading' && typeof unloadingAt === 'number') {
    projectedEnd = unloadingAt + timing.loadingMinutes + timing.returnMinutes;
  } else if (request.deliveryStatus === 'return_transit' && typeof confirmedAt === 'number') {
    if (typeof nextActualStartMinutes === 'number') {
      projectedEnd = nextActualStartMinutes;
      groupedCompletedCycle = true;
      returnTransitEndMinutes = nextActualStartMinutes;
    } else if (hasLaterRequest) {
      projectedEnd = Math.max(confirmedAt, nowMinutes);
      showReturnTransitTile = true;
      returnTransitEndMinutes = projectedEnd;
    } else {
      projectedEnd = confirmedAt + timing.returnMinutes;
      showReturnTransitTile = true;
      returnTransitEndMinutes = projectedEnd;
    }
  }

  if (request.deliveryStatus === 'in_transit') {
    projectedEnd = Math.max(projectedEnd, nowMinutes + timing.loadingMinutes + timing.returnMinutes);
  } else if (request.deliveryStatus === 'unloading') {
    projectedEnd = Math.max(projectedEnd, nowMinutes + timing.returnMinutes);
  } else if (
    request.deliveryStatus === 'return_transit' &&
    hasLaterRequest &&
    typeof nextActualStartMinutes !== 'number'
  ) {
    projectedEnd = Math.max(projectedEnd, nowMinutes);
    returnTransitEndMinutes = projectedEnd;
  }

  const deliveryCompleteAt =
    request.deliveryStatus === 'return_transit'
      ? groupedCompletedCycle
        ? projectedEnd
        : confirmedAt ?? unloadingAt ?? Math.max(startMinutes + LIVE_TIMELINE_MINUTES, projectedEnd)
      : projectedEnd;

  return {
    startMinutes,
    durationMinutes: Math.max(LIVE_TIMELINE_MINUTES, projectedEnd - startMinutes),
    primaryDurationMinutes: Math.max(LIVE_TIMELINE_MINUTES, deliveryCompleteAt - startMinutes),
    projectedEndMinutes: projectedEnd,
    plannedEndMinutes,
    groupedCompletedCycle,
    showReturnTransitTile,
    returnTransitEndMinutes,
  };
}

export function getEventOffset(startMinutesValue) {
  const total = SCREEN_END_HOUR * 60 - SCREEN_START_HOUR * 60;
  const start = Math.max(SCREEN_START_HOUR * 60, Math.min(SCREEN_END_HOUR * 60, startMinutesValue));
  return (start - SCREEN_START_HOUR * 60) / total;
}

export function getEventFlex(durationMinutes) {
  const total = SCREEN_END_HOUR * 60 - SCREEN_START_HOUR * 60;
  const duration = Math.max(LIVE_TIMELINE_MINUTES, Math.min(total, durationMinutes));
  return duration / total;
}

export function distanceBetweenMeters(a, b) {
  const toRad = value => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return earthRadius * y;
}

function distancePointToSegmentMeters(point, segmentStart, segmentEnd) {
  const latScale = 111320;
  const lonScale = 111320 * Math.cos(((segmentStart.lat + segmentEnd.lat + point.lat) / 3) * Math.PI / 180);
  const px = point.lon * lonScale;
  const py = point.lat * latScale;
  const ax = segmentStart.lon * lonScale;
  const ay = segmentStart.lat * latScale;
  const bx = segmentEnd.lon * lonScale;
  const by = segmentEnd.lat * latScale;
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abLenSq));
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  const dx = px - closestX;
  const dy = py - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function minDistanceToRouteMeters(point, routeData) {
  if (!routeData?.pathPoints?.length) {
    return Infinity;
  }
  let min = Math.min(
    distanceBetweenMeters(point, routeData.yard),
    distanceBetweenMeters(point, routeData.site),
  );
  for (let index = 0; index < routeData.pathPoints.length - 1; index += 1) {
    min = Math.min(
      min,
      distancePointToSegmentMeters(point, routeData.pathPoints[index], routeData.pathPoints[index + 1]),
    );
  }
  return min;
}

function mercatorWorldPoint(lat, lon, zoom) {
  const tileSize = 256;
  const scale = tileSize * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export function buildRouteViewport(routeData, width, height, padding = 32) {
  if (!routeData?.pathPoints?.length || !width || !height) {
    return null;
  }
  const points = [routeData.yard, routeData.site, ...routeData.pathPoints];
  for (let zoom = 16; zoom >= 5; zoom -= 1) {
    const worldPoints = points.map(point => mercatorWorldPoint(point.lat, point.lon, zoom));
    const xs = worldPoints.map(point => point.x);
    const ys = worldPoints.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    if (spanX <= width - padding * 2 && spanY <= height - padding * 2) {
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const topLeftX = centerX - width / 2;
      const topLeftY = centerY - height / 2;
      return { zoom, topLeftX, topLeftY };
    }
  }
  const zoom = 5;
  const worldPoints = points.map(point => mercatorWorldPoint(point.lat, point.lon, zoom));
  const xs = worldPoints.map(point => point.x);
  const ys = worldPoints.map(point => point.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { zoom, topLeftX: centerX - width / 2, topLeftY: centerY - height / 2 };
}

export function projectRoutePoint(point, viewport) {
  const world = mercatorWorldPoint(point.lat, point.lon, viewport.zoom);
  return { x: world.x - viewport.topLeftX, y: world.y - viewport.topLeftY };
}

export function buildRouteSvgPath(routeData, viewport) {
  if (!routeData?.pathPoints?.length || !viewport) {
    return '';
  }
  return routeData.pathPoints
    .map((point, index) => {
      const projected = projectRoutePoint(point, viewport);
      return `${index === 0 ? 'M' : 'L'} ${projected.x.toFixed(2)} ${projected.y.toFixed(2)}`;
    })
    .join(' ');
}

export function getTileCoordinatesForViewport(viewport, width, height) {
  if (!viewport) {
    return [];
  }
  const tileSize = 256;
  const minTileX = Math.floor(viewport.topLeftX / tileSize);
  const minTileY = Math.floor(viewport.topLeftY / tileSize);
  const maxTileX = Math.floor((viewport.topLeftX + width) / tileSize);
  const maxTileY = Math.floor((viewport.topLeftY + height) / tileSize);
  const tiles = [];
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      tiles.push({
        tileX,
        tileY,
        left: tileX * tileSize - viewport.topLeftX,
        top: tileY * tileSize - viewport.topLeftY,
      });
    }
  }
  return tiles;
}

export function cartoTileUrl(zoom, x, y) {
  return `https://a.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${x}/${y}.png`;
}
