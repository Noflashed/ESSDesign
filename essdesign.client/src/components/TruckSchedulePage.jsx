import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MATERIAL_ORDER_REQUESTS_CHANGED_EVENT,
  analysisAPI,
  getJitteredPollingDelay,
  materialOrderRequestsAPI,
  recordForegroundPollingCycle,
  safetyProjectsAPI,
} from '../services/api';
import RouteMapCanvas from './transport/RouteMapCanvas';
import {
  ESS_NAVY,
  ESS_ORANGE,
  SCREEN_END_HOUR,
  SCREEN_START_HOUR,
  TRUCK_LANES,
  YARD_LOCATION,
  buildScheduleIso,
  eventTruckIndex,
  findProjectLocation,
  formatActionTimestamp,
  formatBoardDay,
  formatDistance,
  formatDuration,
  formatTimeChip,
  getCachedRouteDataBetween,
  getCachedRouteEstimate,
  getCachedRouteEstimateBetween,
  getCachedRouteEstimateBetweenValue,
  getCachedRouteEstimateValue,
  getDeliveryActionRows,
  getEventFlex,
  getEventOffset,
  getPrimaryPhaseMinutes,
  getSafetyBuildersCached,
  getTimingProfile,
  getTruckAssignment,
  isSameDay,
  isTruckDeviceRole,
  projectRequestWindow,
  readTransportStatusColors,
  requestToCalendarEvent,
  scheduleStatusAppearance,
  scheduleStatusLabel,
  startOfDay,
  TRANSPORT_STATUS_COLOR_PREF_EVENT,
  formatDateKey,
} from './transport/transportUtils';

const SCALE_MODES = {
  standard: { label: 'Hourly', pxPerHour: 150, tickMinutes: 60, labelEveryMinutes: 60 },
  detailed: { label: '10 min', pxPerHour: 260, tickMinutes: 10, labelEveryMinutes: 30 },
  fine: { label: '5 min', pxPerHour: 360, tickMinutes: 5, labelEveryMinutes: 30 },
  ultraFine: { label: '1 min', pxPerHour: 720, tickMinutes: 1, labelEveryMinutes: 30 },
};
const SCALE_ORDER = ['standard', 'detailed', 'fine', 'ultraFine'];
const LIVE_REFRESH_MS = 15000;
const LANE_META_WIDTH = 154;
const TRACK_GUTTER = 14;
const TRACK_OFFSET = LANE_META_WIDTH + TRACK_GUTTER;
const TIME_PICKER_MINUTE_STEP = 15;
const DRAG_SCHEDULE_MINUTE_STEP = 1;
const SNAP_EDGE_THRESHOLD_MINUTES = 10;
const UNLINK_PARENT_RESNAP_THRESHOLD_MINUTES = 2;
const OPTIMISTIC_OVERRIDE_TTL_MS = 60000;
const ROUTE_LOADING_MIN_MS = 180;
const SCALE_PREF_KEY = 'transport_web_schedule_scale_v1';
const SNAP_PREF_KEY = 'transport_web_schedule_snap_v1';
const TIMESTAMP_PREF_KEY = 'transport_web_schedule_timestamps_v1';
const TOLLS_PREF_KEY = 'transport_web_schedule_tolls_v1';
const RETURN_TOLL_KEY_SUFFIX = '__return';
const RETURN_TRANSIT_PREF_KEY = 'transport_web_schedule_return_transit_v1';
const DEBUG_SPEED_OPTIONS = [
  { value: 0, label: 'Paused' },
  { value: 1, label: '1x' },
  { value: 5, label: '5x' },
  { value: 15, label: '15x' },
  { value: 60, label: '60x' },
];
const DEBUG_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'unloading', label: 'Unloading' },
  { value: 'return_transit', label: 'Complete' },
];
const SECONDARY_ROUTE_REASON_OPTIONS = [
  { value: 'secondary_drop_off', label: 'Secondary material drop off' },
  { value: 'material_pick_up', label: 'Material order' },
  { value: 'yard_collection', label: 'Yard collection' },
  { value: 'other', label: 'Other route task' },
];
const SECONDARY_ROUTE_SERVICE_MINUTES = 30;
const DEFAULT_SERVICE_MINUTES = 30;

function normalizeServiceMinutes(value, fallback = DEFAULT_SERVICE_MINUTES) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) {
    return fallback;
  }
  return Math.max(0, Math.min(240, Math.round(minutes)));
}

function getRequestServiceMinutes(request) {
  const direct = Number(request?.serviceMinutes);
  if (Number.isFinite(direct) && direct >= 0) {
    return normalizeServiceMinutes(direct);
  }
  const stored = Number(request?.itemValues?.__serviceMinutes);
  if (Number.isFinite(stored) && stored >= 0) {
    return normalizeServiceMinutes(stored);
  }
  return DEFAULT_SERVICE_MINUTES;
}

function getSecondaryRouteServiceMinutes(secondaryRoute) {
  return normalizeServiceMinutes(secondaryRoute?.serviceMinutes, SECONDARY_ROUTE_SERVICE_MINUTES);
}

function getRequestSegmentServiceMinutes(request, segment = 'primary') {
  if (segment === 'secondary' || isSecondaryRouteRequest(request)) {
    return getSecondaryRouteServiceMinutes(request?.secondaryRoute);
  }
  return getRequestServiceMinutes(request);
}

function applyServiceMinutesToRequest(request, serviceMinutes, segment = 'primary') {
  if (!request) {
    return request;
  }
  const normalizedMinutes = normalizeServiceMinutes(serviceMinutes);
  if (segment === 'secondary' || isSecondaryRouteRequest(request)) {
    return {
      ...request,
      secondaryRoute: request.secondaryRoute
        ? {
            ...request.secondaryRoute,
            serviceMinutes: normalizedMinutes,
          }
        : request.secondaryRoute,
    };
  }
  return {
    ...request,
    serviceMinutes: normalizedMinutes,
    itemValues: {
      ...(request.itemValues || {}),
      __serviceMinutes: normalizedMinutes,
    },
  };
}

function hasRequestReturnTransitToYardSetting(request) {
  if (!request) {
    return false;
  }
  if (request.hasReturnTransitToYardSetting === true) {
    return true;
  }
  return Boolean(
    request.itemValues
      && typeof request.itemValues === 'object'
      && Object.prototype.hasOwnProperty.call(request.itemValues, '__returnTransitToYard'),
  );
}

function getRequestReturnTransitToYard(request) {
  if (!request) {
    return false;
  }
  if (typeof request.returnTransitToYard === 'boolean') {
    return request.returnTransitToYard;
  }
  const stored = request.itemValues?.__returnTransitToYard;
  if (typeof stored === 'boolean') {
    return stored;
  }
  if (typeof stored === 'string') {
    return stored.toLowerCase() === 'true';
  }
  return stored === 1;
}

function applyReturnTransitToRequest(request, enabled) {
  if (!request) {
    return request;
  }
  const returnTransitToYard = Boolean(enabled);
  return {
    ...request,
    returnTransitToYard,
    hasReturnTransitToYardSetting: true,
    itemValues: {
      ...(request.itemValues || {}),
      __returnTransitToYard: returnTransitToYard,
    },
  };
}

function buildReturnTransitMapForRequests(requests = [], fallbackMap = {}) {
  const next = {};
  Object.entries(fallbackMap || {}).forEach(([requestId, enabled]) => {
    if (requestId && requestId !== '__legacy' && enabled) {
      next[requestId] = true;
    }
  });
  (requests || []).forEach(request => {
    if (!request?.id) {
      return;
    }
    if (getRequestReturnTransitToYard(request)) {
      next[request.id] = true;
    } else if (hasRequestReturnTransitToYardSetting(request)) {
      delete next[request.id];
    }
  });
  return next;
}

function areReturnTransitMapsEqual(left = {}, right = {}) {
  const leftKeys = Object.keys(left || {}).filter(key => key !== '__legacy' && left[key]);
  const rightKeys = Object.keys(right || {}).filter(key => key !== '__legacy' && right[key]);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(key => Boolean(right?.[key]));
}

function getSecondaryRouteReasonLabel(reason) {
  return SECONDARY_ROUTE_REASON_OPTIONS.find(option => option.value === reason)?.label || 'Secondary route';
}

function getReturnSegmentKey(requestId) {
  return requestId ? `${requestId}${RETURN_TOLL_KEY_SUFFIX}` : '';
}

function getTollStorageKey(requestId, segment = 'primary') {
  return segment === 'return' ? getReturnSegmentKey(requestId) : requestId;
}

function getRouteLoadingKey(requestId, segment = 'primary') {
  return requestId ? `${requestId}:${segment || 'primary'}` : '';
}

function getLinkedSecondaryRequestFields(option) {
  if (!option) {
    return {
      linkedRequestId: '',
      linkedRequestLabel: '',
      linkedRequestSiteLocation: '',
    };
  }

  return {
    linkedRequestId: option.id || '',
    linkedRequestLabel: option.displayLabel || option.label || '',
    linkedRequestSiteLocation: option.siteLocation || '',
  };
}

function getDeliveryTypePill(request, segment = 'primary') {
  const secondaryRoute = request?.secondaryRoute || null;
  const isSecondarySegment = segment === 'secondary' || isSecondaryRouteRequest(request);

  if (!isSecondarySegment) {
    return { label: 'Material order', tone: 'material' };
  }

  if (secondaryRoute?.reason === 'material_pick_up') {
    return { label: 'Material order', tone: 'pickup' };
  }

  if (secondaryRoute?.reason === 'yard_collection') {
    return { label: 'Yard pick-up', tone: 'yard' };
  }

  if (secondaryRoute?.reason === 'other') {
    return { label: 'Route task', tone: 'task' };
  }

  return { label: 'Secondary route', tone: 'secondary' };
}

function dedupeRequests(items) {
  const map = new Map();
  (items || []).forEach(item => {
    if (item?.id) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

function isSecondaryRouteRequest(request) {
  return request?.routeType === 'secondary_route' && Boolean(request?.secondaryRoute);
}

function isLinkedSecondaryMaterialOrderRequest(request) {
  return isSecondaryRouteRequest(request)
    && request.secondaryRoute?.reason === 'material_pick_up'
    && Boolean(request.secondaryRoute?.linkedRequestId);
}

function getRunBreakSiteLocation(request) {
  return isLinkedSecondaryMaterialOrderRequest(request)
    ? request.secondaryRoute?.linkedRequestSiteLocation || request.secondaryRoute?.destination || ''
    : '';
}

function breakRequestRunLink(request) {
  if (!request) {
    return request;
  }
  const shouldRestoreMaterialOrder = isLinkedSecondaryMaterialOrderRequest(request);
  return {
    ...request,
    sourceOrderId: null,
    connectedParentStartMinutes: null,
    connectedParentSegment: null,
    ...(shouldRestoreMaterialOrder ? {
      routeType: null,
      secondaryRoute: null,
    } : {}),
  };
}

function getConnectedParentSegment(request) {
  return request?.connectedParentSegment === 'return' || request?.connectedParentSegment === 'primary'
    ? request.connectedParentSegment
    : null;
}

function isCompletedMaterialOrderRequest(request, cycleState = null) {
  return Boolean(
    request &&
    !isSecondaryRouteRequest(request) &&
    (request.deliveryStatus === 'return_transit' || request.deliveryConfirmedAt || cycleState?.groupedCompletedCycle),
  );
}

function getRouteEstimateMinutes(estimateMinutes, fallbackSeconds = 0, minimumMinutes = 1) {
  const rawMinutes = Number.isFinite(estimateMinutes)
    ? estimateMinutes
    : Number(fallbackSeconds || 0) / 60;
  return Math.max(minimumMinutes, Math.round(rawMinutes || 0));
}

function buildSecondaryRouteTimingEstimate(outboundEstimate = null, returnEstimate = null) {
  if (!outboundEstimate) {
    return null;
  }
  return {
    ...outboundEstimate,
    returnEstimate: returnEstimate || null,
    returnDurationMinutes: returnEstimate?.durationMinutes,
    returnBaseDurationMinutes: returnEstimate?.baseDurationMinutes,
    returnTrafficDelayMinutes: returnEstimate?.trafficDelayMinutes,
    returnDistanceMeters: returnEstimate?.distanceMeters,
  };
}

function buildPrimaryRouteTimingEstimate(outboundEstimate = null, returnEstimate = null) {
  if (!outboundEstimate) {
    return null;
  }
  return {
    ...outboundEstimate,
    returnEstimate: returnEstimate || null,
    returnDurationMinutes: returnEstimate?.durationMinutes,
    returnBaseDurationMinutes: returnEstimate?.baseDurationMinutes,
    returnTrafficDelayMinutes: returnEstimate?.trafficDelayMinutes,
    returnDistanceMeters: returnEstimate?.distanceMeters,
  };
}

function getSecondaryRouteTiming(secondaryRoute, includeReturnTransitToYard = true, routeEstimate = null) {
  const transitMinutes = getRouteEstimateMinutes(routeEstimate?.durationMinutes, secondaryRoute?.travelDurationSeconds, 1);
  const loadingMinutes = Math.max(0, Number(secondaryRoute?.serviceMinutes) || 0);
  const returnEstimateMinutes = routeEstimate?.returnDurationMinutes ?? routeEstimate?.returnEstimate?.durationMinutes;
  const returnMinutes = getRouteEstimateMinutes(returnEstimateMinutes, secondaryRoute?.returnDurationSeconds, 1);
  const includedReturnMinutes = includeReturnTransitToYard ? returnMinutes : 0;
  return {
    transitMinutes,
    loadingMinutes,
    secondaryTravelMinutes: 0,
    secondaryServiceMinutes: 0,
    returnMinutes,
    totalMinutes: transitMinutes + loadingMinutes + includedReturnMinutes,
  };
}

function removeReturnLegFromTiming(timing) {
  return {
    ...timing,
    returnMinutes: 0,
    totalMinutes:
      (timing?.transitMinutes || 0) +
      (timing?.loadingMinutes || 0) +
      (timing?.secondaryTravelMinutes || 0) +
      (timing?.secondaryServiceMinutes || 0),
  };
}

function applyReturnEstimateToTiming(timing, returnRouteEstimate = null) {
  if (!timing || !returnRouteEstimate?.durationMinutes) {
    return timing;
  }
  const returnMinutes = Math.max(15, Math.round(returnRouteEstimate.durationMinutes));
  return {
    ...timing,
    returnMinutes,
    totalMinutes:
      (timing.transitMinutes || 0) +
      (timing.loadingMinutes || 0) +
      (timing.secondaryTravelMinutes || 0) +
      (timing.secondaryServiceMinutes || 0) +
      returnMinutes,
  };
}

function isBackToBackContinuation(parentRequest, continuationRequest, truckId) {
  if (!parentRequest || !continuationRequest) {
    return false;
  }
  if (continuationRequest.sourceOrderId !== parentRequest.id) {
    return false;
  }
  const continuationTruckId = continuationRequest.scheduledTruckId ?? continuationRequest.truckId ?? null;
  if (continuationTruckId !== truckId) {
    return false;
  }
  return true;
}

function isReturnTransitContinuation(parentRequest, continuationRequest, truckId, includeReturnTransitToYard, timing) {
  if (!isBackToBackContinuation(parentRequest, continuationRequest, truckId) || !includeReturnTransitToYard) {
    return false;
  }
  const segment = getConnectedParentSegment(continuationRequest);
  if (segment === 'return') {
    return true;
  }
  if (segment === 'primary') {
    return false;
  }
  if (typeof continuationRequest.connectedParentStartMinutes !== 'number' || !timing?.returnMinutes) {
    return false;
  }
  const parentStart = getRequestScheduledStartMinutes(parentRequest);
  const fullReturnEnd = parentStart + Math.max(1, timing.totalMinutes || 0);
  return Math.abs(continuationRequest.connectedParentStartMinutes - fullReturnEnd) <= SNAP_EDGE_THRESHOLD_MINUTES;
}

function getRequestDeliveryHandoffMinutes(request, routeEstimate = null) {
  if (isSecondaryRouteRequest(request)) {
    return removeReturnLegFromTiming(getSecondaryRouteTiming(request.secondaryRoute, true, routeEstimate)).totalMinutes || 0;
  }
  return getPrimaryPhaseMinutes(routeEstimate, request?.secondaryRoute || null, getRequestServiceMinutes(request));
}

function findFollowOnRequestForInsertion(requestId, scheduleEvent, dayEvents = [], requestLookup = {}, cycleStateMap = {}, allRequests = []) {
  if (!requestId || !scheduleEvent) {
    return null;
  }

  const sameTruckEvents = dayEvents
    .filter(event => event.truckId === scheduleEvent.truckId && event.orderId !== requestId)
    .sort((left, right) => (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute));
  const currentStart = scheduleEvent.hour * 60 + scheduleEvent.minute;
  const followOnEvent = sameTruckEvents.find(event => {
    const eventStart = event.hour * 60 + event.minute;
    if (eventStart < currentStart) {
      return false;
    }
    const cycleState = cycleStateMap[event.orderId] || null;
    const request = requestLookup[event.orderId] || allRequests.find(item => item.id === event.orderId) || null;
    return (
      cycleState?.followsPreviousRun &&
      (cycleState.routeFromRequestId === requestId || cycleState.runSourceOrderId === requestId || request?.sourceOrderId === requestId)
    );
  });

  return followOnEvent
    ? requestLookup[followOnEvent.orderId] || allRequests.find(item => item.id === followOnEvent.orderId) || null
    : null;
}

function getRequestScheduledStartMinutes(request, fallbackMinutes = SCREEN_START_HOUR * 60) {
  if (typeof request?.scheduledHour === 'number' && typeof request?.scheduledMinute === 'number') {
    return request.scheduledHour * 60 + request.scheduledMinute;
  }

  return fallbackMinutes;
}

function getDateAtScheduleMinutes(dateKey, minutes) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setMinutes(Math.max(0, Math.round(minutes)));
  return date;
}

function getFirstLinkedContinuation(requestId, requests = [], segment = 'primary') {
  if (!requestId) {
    return null;
  }
  return (requests || [])
    .filter(item =>
      item?.sourceOrderId === requestId
      && !item.archivedAt
      && ((getConnectedParentSegment(item) || 'primary') === segment)
    )
    .sort((left, right) => getRequestScheduledStartMinutes(left) - getRequestScheduledStartMinutes(right))[0] || null;
}

function buildContinuationSegmentUpdate(continuationRequest, parentRequest, segment, connectedParentStartMinutes, parentSiteLocation = '') {
  if (!continuationRequest || !parentRequest) {
    return null;
  }
  const nextSecondaryRoute = isSecondaryRouteRequest(continuationRequest)
    ? {
        ...continuationRequest.secondaryRoute,
        startingLocation: segment === 'return'
          ? YARD_LOCATION
          : parentSiteLocation || continuationRequest.secondaryRoute?.startingLocation || '',
      }
    : continuationRequest.secondaryRoute;
  return {
    ...continuationRequest,
    sourceOrderId: parentRequest.id,
    connectedParentStartMinutes: typeof connectedParentStartMinutes === 'number'
      ? Math.round(connectedParentStartMinutes)
      : null,
    connectedParentSegment: segment,
    secondaryRoute: nextSecondaryRoute,
  };
}

function applyOptimisticRequestOverrides(requests, overrides, now = Date.now()) {
  const map = new Map((requests || []).filter(item => item?.id).map(item => [item.id, item]));
  overrides.forEach((entry, requestId) => {
    if (!entry || entry.expiresAt <= now) {
      overrides.delete(requestId);
      return;
    }
    if (entry.deleted) {
      map.delete(requestId);
      return;
    }
    if (entry.request) {
      map.set(requestId, { ...(map.get(requestId) || {}), ...entry.request });
    }
  });
  return Array.from(map.values());
}

function buildTimelineMarkers(mode) {
  const config = SCALE_MODES[mode] || SCALE_MODES.standard;
  const totalMinutes = (SCREEN_END_HOUR - SCREEN_START_HOUR) * 60;
  const markers = [];
  for (let minutes = 0; minutes <= totalMinutes; minutes += config.tickMinutes) {
    const absoluteMinutes = SCREEN_START_HOUR * 60 + minutes;
    const hour = Math.floor(absoluteMinutes / 60);
    const minute = absoluteMinutes % 60;
    const isHour = minute === 0;
    const isHalfHour = minute === 30;
    const showLabel = mode === 'standard' ? isHour : minute % config.labelEveryMinutes === 0;
    markers.push({
      minutes: absoluteMinutes,
      isHour,
      isHalfHour,
      showLabel,
      label: showLabel ? formatTimeChip(hour, minute) : '',
    });
  }
  return markers;
}

function getTimelineWidth(mode) {
  return (SCREEN_END_HOUR - SCREEN_START_HOUR) * (SCALE_MODES[mode] || SCALE_MODES.standard).pxPerHour;
}

function cycleScaleMode(mode) {
  const index = SCALE_ORDER.indexOf(mode);
  return SCALE_ORDER[(index + 1) % SCALE_ORDER.length];
}

function parseManualScheduleTime(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }
  const compact = raw.replace(/\s+/g, '');
  const match = compact.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
  if (!match) {
    return null;
  }
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const suffix = match[3];
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }
  if (suffix) {
    if (hour < 1 || hour > 12) {
      return null;
    }
    if (suffix === 'pm' && hour !== 12) {
      hour += 12;
    }
    if (suffix === 'am' && hour === 12) {
      hour = 0;
    }
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

function formatManualTimeInput(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatManualTimeText(minutes) {
  const hour24 = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')}`;
}

function getManualTimeMeridiem(minutes) {
  return Math.floor(minutes / 60) >= 12 ? 'PM' : 'AM';
}

function parseManualScheduleEditorTime(value, meridiem) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  return parseManualScheduleTime(/\b(?:am|pm)\b/i.test(raw) ? raw : `${raw} ${meridiem || 'AM'}`);
}

function formatDebugMinutes(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/a';
  }
  return formatTimeChip(Math.floor(value / 60), Math.floor(value % 60));
}

function getScaffoldDetailText(request, event) {
  return (
    request?.details ||
    request?.itemValues?.__details ||
    request?.item_values?.__details ||
    event?.scaffoldingSystem ||
    request?.scaffoldingSystem ||
    'Scaffold details pending'
  );
}

function getEffectiveDeliveryStatus(request, cycleState = null) {
  const status = request?.deliveryStatus || 'scheduled';
  return cycleState?.presumedInTransitFromParent && status === 'scheduled'
    ? 'in_transit'
    : status;
}

function orderTruckRequestsWithContinuations(truckRequests, truckId) {
  const sorted = [...truckRequests].sort((left, right) => {
    const leftStart = (left.scheduledHour ?? SCREEN_START_HOUR) * 60 + (left.scheduledMinute ?? 0);
    const rightStart = (right.scheduledHour ?? SCREEN_START_HOUR) * 60 + (right.scheduledMinute ?? 0);
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }
    return String(left.submittedAt || '').localeCompare(String(right.submittedAt || ''));
  });
  const bySourceId = new Map();
  sorted.forEach(request => {
    if (request.sourceOrderId && !request.archivedAt) {
      const existing = bySourceId.get(request.sourceOrderId);
      if (!existing || getRequestScheduledStartMinutes(request) < getRequestScheduledStartMinutes(existing)) {
        bySourceId.set(request.sourceOrderId, request);
      }
    }
  });

  const usedIds = new Set();
  const ordered = [];
  sorted.forEach(request => {
    if (usedIds.has(request.id)) {
      return;
    }

    ordered.push(request);
    usedIds.add(request.id);

    const continuation = bySourceId.get(request.id);
    if (!continuation || usedIds.has(continuation.id)) {
      return;
    }

    if (isBackToBackContinuation(request, continuation, truckId)) {
      ordered.push(continuation);
      usedIds.add(continuation.id);
    }
  });

  return ordered;
}

function buildBoardState(requestsForDay, routeMap, nowOverride = null, returnTransitByRequestId = {}, options = {}) {
  const dateKey = requestsForDay[0]?.scheduledDate || formatDateKey(new Date());
  const flowRouteMap = options.flowRouteMap || routeMap;
  const groupedByTruck = new Map();
  const now = nowOverride instanceof Date && !Number.isNaN(nowOverride.getTime()) ? nowOverride : new Date();
  const dayEvents = [];
  const durationMap = {};
  const startMap = {};
  const primaryDurationMap = {};
  const cycleStateMap = {};
  const primaryContinuationBySourceId = new Map();
  const returnContinuationBySourceId = new Map();

  requestsForDay.forEach(request => {
    if (request.sourceOrderId && request.scheduledDate === dateKey && !request.archivedAt) {
      const segment = getConnectedParentSegment(request) === 'return' ? 'return' : 'primary';
      const targetMap = segment === 'return' ? returnContinuationBySourceId : primaryContinuationBySourceId;
      const existing = targetMap.get(request.sourceOrderId);
      if (!existing || getRequestScheduledStartMinutes(request) < getRequestScheduledStartMinutes(existing)) {
        targetMap.set(request.sourceOrderId, request);
      }
    }
  });

  requestsForDay.forEach(request => {
    const event = requestToCalendarEvent(request);
    const truckId = request.scheduledTruckId ?? request.truckId ?? event?.truckId ?? TRUCK_LANES[0].id;
    const list = groupedByTruck.get(truckId) ?? [];
    list.push(request);
    groupedByTruck.set(truckId, list);
  });

  groupedByTruck.forEach((truckRequests, truckId) => {
    let laneCursorMinutes = SCREEN_START_HOUR * 60;
    let previousRunLink = null;
    orderTruckRequestsWithContinuations(truckRequests, truckId)
      .forEach((request, index, ordered) => {
        const scheduledStart = (request.scheduledHour ?? SCREEN_START_HOUR) * 60 + (request.scheduledMinute ?? 0);
        const primaryContinuation = primaryContinuationBySourceId.get(request.id) || null;
        const returnContinuation = returnContinuationBySourceId.get(request.id) || null;
        const includeReturnTransitToYard = Boolean(returnTransitByRequestId?.[request.id]);
        const baseTiming = isSecondaryRouteRequest(request)
          ? getSecondaryRouteTiming(request.secondaryRoute, includeReturnTransitToYard, routeMap[request.id] ?? null)
          : getTimingProfile(routeMap[request.id] ?? null, null, getRequestServiceMinutes(request));
        const flowBaseTiming = isSecondaryRouteRequest(request)
          ? getSecondaryRouteTiming(request.secondaryRoute, includeReturnTransitToYard, flowRouteMap[request.id] ?? routeMap[request.id] ?? null)
          : getTimingProfile(flowRouteMap[request.id] ?? routeMap[request.id] ?? null, null, getRequestServiceMinutes(request));
        const hasReturnTransitContinuation = isReturnTransitContinuation(
          request,
          returnContinuation,
          truckId,
          includeReturnTransitToYard,
          flowBaseTiming,
        );
        const hasSecondaryContinuation = isBackToBackContinuation(request, primaryContinuation, truckId);
        const hasEffectiveReturnBreak = includeReturnTransitToYard && !hasSecondaryContinuation;
        const embedsReturnTransitInTile = hasEffectiveReturnBreak;
        const timing = hasSecondaryContinuation || !includeReturnTransitToYard
          ? removeReturnLegFromTiming(baseTiming)
          : baseTiming;
        const flowTiming = hasSecondaryContinuation || !includeReturnTransitToYard
          ? removeReturnLegFromTiming(flowBaseTiming)
          : flowBaseTiming;
        const hasExplicitRunLink = Boolean(request.sourceOrderId);
        const hasAdjacentRunLink = Boolean(
          !request.sourceOrderId &&
          Math.abs(scheduledStart - previousRunLink?.plannedEndMinutes) <= SNAP_EDGE_THRESHOLD_MINUTES,
        );
        const followsPreviousRun = Boolean(
          previousRunLink &&
          (hasExplicitRunLink || hasAdjacentRunLink),
        );
        const requestStatus = request.deliveryStatus || 'scheduled';
        const presumedInTransitFromParent = Boolean(
          followsPreviousRun &&
          !previousRunLink?.includeReturnTransitToYard &&
          previousRunLink?.completed &&
          requestStatus === 'scheduled',
        );
        const shiftedScheduledStart = followsPreviousRun
          ? Math.max(SCREEN_START_HOUR * 60, previousRunLink.projectedEndMinutes)
          : Math.max(
            SCREEN_START_HOUR * 60,
            scheduledStart,
            laneCursorMinutes,
          );
        const nextStartedRequest = ordered.slice(index + 1).find(nextRequest => {
          const parsed = nextRequest.deliveryStartedAt ? new Date(nextRequest.deliveryStartedAt) : null;
          return parsed && !Number.isNaN(parsed.getTime()) && formatDateKey(parsed) === dateKey;
        });
        const nextActualStartMinutes = nextStartedRequest?.deliveryStartedAt
          ? (() => {
              const parsed = new Date(nextStartedRequest.deliveryStartedAt);
              return parsed.getHours() * 60 + parsed.getMinutes() + parsed.getSeconds() / 60 + parsed.getMilliseconds() / 60000;
            })()
          : null;
        const projected = projectRequestWindow(
          presumedInTransitFromParent
            ? { ...request, deliveryStatus: 'in_transit' }
            : request,
          timing,
          dateKey,
          now,
          shiftedScheduledStart,
          nextActualStartMinutes,
          { preferShiftedStart: followsPreviousRun },
        );
        const flowProjected = projectRequestWindow(
          presumedInTransitFromParent
            ? { ...request, deliveryStatus: 'in_transit' }
            : request,
          flowTiming,
          dateKey,
          now,
          shiftedScheduledStart,
          nextActualStartMinutes,
          { preferShiftedStart: followsPreviousRun },
        );
        const startMinutes = projected.startMinutes;
        const durationMinutes = projected.durationMinutes;
        const primaryDurationMinutesValue = projected.primaryDurationMinutes;
        const runHandoffMinutes = startMinutes + primaryDurationMinutesValue;
        const flowRunHandoffMinutes = flowProjected.startMinutes + flowProjected.primaryDurationMinutes;
        const flowLinkEndMinutes = hasEffectiveReturnBreak
          ? flowProjected.projectedEndMinutes
          : flowRunHandoffMinutes;
        const plannedRunEndMinutes = scheduledStart + flowTiming.totalMinutes;
        const routeFromRequestId = followsPreviousRun ? request.sourceOrderId || previousRunLink?.requestId || null : null;
        laneCursorMinutes = followsPreviousRun
          ? flowLinkEndMinutes
          : Math.max(laneCursorMinutes, projected.projectedEndMinutes, projected.plannedEndMinutes);
        previousRunLink = {
          requestId: request.id,
          includeReturnTransitToYard: hasEffectiveReturnBreak,
          completed: requestStatus === 'return_transit',
          plannedEndMinutes: plannedRunEndMinutes,
          projectedEndMinutes: flowLinkEndMinutes,
        };
        startMap[request.id] = startMinutes;
        durationMap[request.id] = durationMinutes;
        primaryDurationMap[request.id] = primaryDurationMinutesValue;
        cycleStateMap[request.id] = {
          groupedCompletedCycle: projected.groupedCompletedCycle,
          showReturnTransitTile: projected.showReturnTransitTile,
          returnTransitEndMinutes: projected.returnTransitEndMinutes,
          isLastScheduledForDay: index === ordered.length - 1,
          hasSecondaryContinuation,
          hasReturnTransitContinuation,
          followsPreviousRun,
          presumedInTransitFromParent,
          routeFromRequestId,
          runHandoffMinutes: flowLinkEndMinutes,
          runSourceOrderId: request.sourceOrderId || null,
          runLinkReason: hasExplicitRunLink ? 'explicit' : hasAdjacentRunLink ? 'adjacent' : 'none',
          effectiveReturnBreak: hasEffectiveReturnBreak,
          embedsReturnTransitInTile,
        };
        dayEvents.push({
          id: `remote-${request.id}`,
          date: dateKey,
          hour: Math.floor(startMinutes / 60),
          minute: Math.floor(startMinutes % 60),
          builderName: isSecondaryRouteRequest(request) ? request.secondaryRoute.destination : request.builderName,
          projectName: isSecondaryRouteRequest(request) ? getSecondaryRouteReasonLabel(request.secondaryRoute.reason) : request.projectName,
          scaffoldingSystem: isSecondaryRouteRequest(request) ? request.secondaryRoute.label : request.scaffoldingSystem,
          orderId: request.id,
          truckId,
          truckLabel: request.scheduledTruckLabel ?? request.truckLabel ?? TRUCK_LANES.find(lane => lane.id === truckId)?.rego ?? null,
        });
      });
  });

  dayEvents.sort((left, right) => (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute));

  return {
    dayEvents,
    durationMap,
    startMap,
    primaryDurationMap,
    cycleStateMap,
  };
}

function getRouteTollsEnabledForRequest(request, tollsMode = false, segment = 'primary') {
  if (!request?.id) {
    return false;
  }
  if (typeof tollsMode === 'function') {
    return Boolean(tollsMode(request.id, request, segment));
  }
  if (tollsMode && typeof tollsMode === 'object') {
    return Boolean(tollsMode[getTollStorageKey(request.id, segment)]);
  }
  return Boolean(tollsMode);
}

function buildRouteScheduleWithOffset(schedule = {}, offsetMinutes = 0) {
  const dateKey = schedule.scheduledDate || schedule.date || '';
  const hour = Number.isFinite(schedule.scheduledHour) ? schedule.scheduledHour : SCREEN_START_HOUR;
  const minute = Number.isFinite(schedule.scheduledMinute) ? schedule.scheduledMinute : 0;
  if (!dateKey) {
    return schedule;
  }

  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return schedule;
  }

  date.setMinutes(hour * 60 + minute + Math.round(offsetMinutes || 0));
  return applyRouteMode({
    scheduledDate: formatDateKey(date),
    scheduledHour: date.getHours(),
    scheduledMinute: date.getMinutes(),
  }, schedule.enableTolls);
}

function buildSecondaryRouteReturnSchedule(routeContext, outboundEstimate = null) {
  const secondaryRoute = routeContext?.secondaryRoute || {};
  const transitMinutes = getRouteEstimateMinutes(outboundEstimate?.durationMinutes, secondaryRoute.travelDurationSeconds, 1);
  const serviceMinutes = Math.max(0, Number(secondaryRoute.serviceMinutes) || 0);
  return buildRouteScheduleWithOffset(routeContext?.schedule || {}, transitMinutes + serviceMinutes);
}

function buildPrimaryRouteReturnSchedule(routeContext, outboundEstimate = null) {
  const phaseTiming = getTimingProfile(
    outboundEstimate,
    routeContext?.request?.secondaryRoute || null,
    getRequestServiceMinutes(routeContext?.request),
  );
  const departureOffsetMinutes =
    (phaseTiming.transitMinutes || 0) +
    (phaseTiming.loadingMinutes || 0) +
    (phaseTiming.secondaryTravelMinutes || 0) +
    (phaseTiming.secondaryServiceMinutes || 0);
  return buildRouteScheduleWithOffset(routeContext?.schedule || {}, departureOffsetMinutes);
}

function getBoardRouteContextForRequest(request, requestLookup = null, siteLocationMap = {}, fallbackDate, tollsMode = false, returnTransitByRequestId = {}) {
  if (!request) {
    return null;
  }

  if (isSecondaryRouteRequest(request)) {
    const secondaryRoute = request.secondaryRoute || {};
    const fromLocation = getConnectedParentSegment(request) === 'return'
      ? YARD_LOCATION
      : secondaryRoute.startingLocation || siteLocationMap[request.id] || YARD_LOCATION;
    const toLocation = secondaryRoute.destination || secondaryRoute.linkedRequestSiteLocation || '';
    if (!fromLocation || !toLocation) {
      return null;
    }
    return {
      segment: 'standalone-secondary',
      fromLocation,
      toLocation,
      secondaryRoute,
      includeReturnTransitToYard: Boolean(returnTransitByRequestId?.[request.id]),
      returnTollsEnabled: getRouteTollsEnabledForRequest(request, tollsMode, 'return'),
      schedule: applyRouteMode(buildRouteScheduleFromRequest(request, fallbackDate), getRouteTollsEnabledForRequest(request, tollsMode, 'primary')),
    };
  }

  const toLocation = siteLocationMap[request.id] || '';
  if (!toLocation) {
    return null;
  }

  const sourceRequest = request.sourceOrderId
    ? getRequestFromLookup(request.sourceOrderId, requestLookup)
    : null;
  const scheduledStart = getRequestScheduledStartMinutes(request);
  const connectedStart = request.connectedParentStartMinutes;
  const connectedSegment = getConnectedParentSegment(request);
  const requestTruckId = request.scheduledTruckId ?? request.truckId ?? null;
  const sourceTruckId = sourceRequest?.scheduledTruckId ?? sourceRequest?.truckId ?? null;
  const hasCompatibleSource = Boolean(
    sourceRequest &&
    requestTruckId &&
    sourceTruckId &&
    requestTruckId === sourceTruckId &&
    sourceRequest.scheduledDate === request.scheduledDate &&
    connectedSegment !== 'return',
  );
  const shouldUseConnectedOrigin = Boolean(
    hasCompatibleSource &&
    (
      typeof connectedStart !== 'number' ||
      Math.abs(scheduledStart - connectedStart) <= SNAP_EDGE_THRESHOLD_MINUTES
    ),
  );
  const connectedOrigin = sourceRequest && shouldUseConnectedOrigin
    ? getRequestSiteLocation(sourceRequest, siteLocationMap, []) || siteLocationMap[sourceRequest.id] || ''
    : '';
  const fromLocation = connectedOrigin || YARD_LOCATION;

  return {
    fromLocation: fromLocation && toLocation ? fromLocation : '',
    toLocation,
    request,
    includeReturnTransitToYard: Boolean(returnTransitByRequestId?.[request.id]),
    returnTollsEnabled: getRouteTollsEnabledForRequest(request, tollsMode, 'return'),
    schedule: applyRouteMode(buildRouteScheduleFromRequest(request, fallbackDate), getRouteTollsEnabledForRequest(request, tollsMode, 'primary')),
  };
}

function getCachedBoardRouteEstimate(routeContext) {
  if (!routeContext?.toLocation) {
    return null;
  }
  if (routeContext.segment === 'standalone-secondary') {
    const outboundEstimate = getCachedRouteEstimateBetweenValue(routeContext.fromLocation, routeContext.toLocation, routeContext.schedule);
    if (outboundEstimate === undefined) {
      return undefined;
    }
    if (!routeContext.includeReturnTransitToYard || !outboundEstimate) {
      return buildSecondaryRouteTimingEstimate(outboundEstimate, null);
    }
    const returnSchedule = applyRouteMode(
      buildSecondaryRouteReturnSchedule(routeContext, outboundEstimate),
      routeContext.returnTollsEnabled,
    );
    const returnEstimate = getCachedRouteEstimateBetweenValue(routeContext.toLocation, YARD_LOCATION, returnSchedule);
    if (returnEstimate === undefined) {
      return undefined;
    }
    return buildSecondaryRouteTimingEstimate(outboundEstimate, returnEstimate);
  }
  const outboundEstimate = routeContext.fromLocation
    ? getCachedRouteEstimateBetweenValue(routeContext.fromLocation, routeContext.toLocation, routeContext.schedule)
    : getCachedRouteEstimateValue(routeContext.toLocation, routeContext.schedule);
  if (outboundEstimate === undefined) {
    return undefined;
  }
  if (!routeContext.includeReturnTransitToYard || routeContext.request?.secondaryRoute || !outboundEstimate) {
    return outboundEstimate;
  }
  const returnSchedule = applyRouteMode(
    buildPrimaryRouteReturnSchedule(routeContext, outboundEstimate),
    routeContext.returnTollsEnabled,
  );
  const returnEstimate = getCachedRouteEstimateBetweenValue(routeContext.toLocation, YARD_LOCATION, returnSchedule);
  if (returnEstimate === undefined) {
    return undefined;
  }
  return buildPrimaryRouteTimingEstimate(outboundEstimate, returnEstimate);
}

function getBoardRouteLoadingSegment(routeContext) {
  if (!routeContext?.toLocation) {
    return null;
  }
  if (routeContext.segment === 'standalone-secondary') {
    const outboundEstimate = getCachedRouteEstimateBetweenValue(routeContext.fromLocation, routeContext.toLocation, routeContext.schedule);
    if (outboundEstimate === undefined) {
      return 'primary';
    }
    if (!routeContext.includeReturnTransitToYard || !outboundEstimate) {
      return null;
    }
    const returnSchedule = applyRouteMode(
      buildSecondaryRouteReturnSchedule(routeContext, outboundEstimate),
      routeContext.returnTollsEnabled,
    );
    return getCachedRouteEstimateBetweenValue(routeContext.toLocation, YARD_LOCATION, returnSchedule) === undefined ? 'return' : null;
  }

  const outboundEstimate = routeContext.fromLocation
    ? getCachedRouteEstimateBetweenValue(routeContext.fromLocation, routeContext.toLocation, routeContext.schedule)
    : getCachedRouteEstimateValue(routeContext.toLocation, routeContext.schedule);
  if (outboundEstimate === undefined) {
    return 'primary';
  }
  if (!routeContext.includeReturnTransitToYard || routeContext.request?.secondaryRoute || !outboundEstimate) {
    return null;
  }
  const returnSchedule = applyRouteMode(
    buildPrimaryRouteReturnSchedule(routeContext, outboundEstimate),
    routeContext.returnTollsEnabled,
  );
  return getCachedRouteEstimateBetweenValue(routeContext.toLocation, YARD_LOCATION, returnSchedule) === undefined ? 'return' : null;
}

async function resolveBoardRouteEstimate(routeContext) {
  if (!routeContext?.toLocation) {
    return null;
  }
  if (routeContext.segment === 'standalone-secondary') {
    if (!routeContext.fromLocation) {
      return null;
    }
    const outboundEstimate = await getCachedRouteEstimateBetween(routeContext.fromLocation, routeContext.toLocation, routeContext.schedule);
    if (!routeContext.includeReturnTransitToYard || !outboundEstimate) {
      return buildSecondaryRouteTimingEstimate(outboundEstimate, null);
    }
    const returnSchedule = applyRouteMode(
      buildSecondaryRouteReturnSchedule(routeContext, outboundEstimate),
      routeContext.returnTollsEnabled,
    );
    const returnEstimate = await getCachedRouteEstimateBetween(routeContext.toLocation, YARD_LOCATION, returnSchedule);
    return buildSecondaryRouteTimingEstimate(outboundEstimate, returnEstimate);
  }
  const outboundEstimate = await (routeContext.fromLocation
    ? getCachedRouteEstimateBetween(routeContext.fromLocation, routeContext.toLocation, routeContext.schedule)
    : getCachedRouteEstimate(routeContext.toLocation, routeContext.schedule));
  if (!routeContext.includeReturnTransitToYard || routeContext.request?.secondaryRoute || !outboundEstimate) {
    return outboundEstimate;
  }
  const returnSchedule = applyRouteMode(
    buildPrimaryRouteReturnSchedule(routeContext, outboundEstimate),
    routeContext.returnTollsEnabled,
  );
  const returnEstimate = await getCachedRouteEstimateBetween(routeContext.toLocation, YARD_LOCATION, returnSchedule);
  return buildPrimaryRouteTimingEstimate(outboundEstimate, returnEstimate);
}

function buildCachedRouteMapForRequests(requestsForDay, siteLocationMap, fallbackDate, tollsMode = false, returnTransitByRequestId = {}, fallbackRouteMap = {}) {
  const requestLookup = new Map((requestsForDay || []).map(request => [request.id, request]));
  return Object.fromEntries(
    requestsForDay.map(request => {
      const routeContext = getBoardRouteContextForRequest(request, requestLookup, siteLocationMap, fallbackDate, tollsMode, returnTransitByRequestId);
      const cachedEstimate = getCachedBoardRouteEstimate(routeContext);
      const hasFallbackEstimate = Object.prototype.hasOwnProperty.call(fallbackRouteMap || {}, request.id);
      return [
        request.id,
        cachedEstimate === undefined && hasFallbackEstimate
          ? fallbackRouteMap[request.id]
          : cachedEstimate,
      ];
    }),
  );
}

function getBoardProjectionSignature(board) {
  return JSON.stringify({
    events: board.dayEvents.map(event => [
      event.orderId,
      event.truckId,
      event.date,
      event.hour,
      event.minute,
      event.builderName,
      event.projectName,
    ]),
    durationMap: board.durationMap,
    startMap: board.startMap,
    primaryDurationMap: board.primaryDurationMap,
    cycleStateMap: board.cycleStateMap,
  });
}

function getRequestListSignature(requests) {
  return JSON.stringify((requests || []).map(request => [
    request?.id,
    request?.updatedAt,
    request?.submittedAt,
    request?.scheduledDate,
    request?.scheduledHour,
    request?.scheduledMinute,
    request?.scheduledTruckId,
    request?.deliveryStatus,
    request?.archivedAt,
    request?.scheduleRemovedAt,
    request?.routeType,
    request?.sourceOrderId,
    request?.builderName,
    request?.projectName,
    request?.scaffoldingSystem,
    request?.serviceMinutes,
    request?.itemValues?.__serviceMinutes,
    request?.returnTransitToYard,
    request?.itemValues?.__returnTransitToYard,
    request?.hasReturnTransitToYardSetting,
    request?.secondaryRoute ? [
      request.secondaryRoute.reason,
      request.secondaryRoute.startingLocation,
      request.secondaryRoute.destination,
      request.secondaryRoute.serviceMinutes,
      request.secondaryRoute.travelDurationSeconds,
      request.secondaryRoute.returnDurationSeconds,
      request.secondaryRoute.linkedRequestId,
      request.secondaryRoute.linkedRequestLabel,
      request.secondaryRoute.linkedRequestSiteLocation,
    ] : null,
  ]));
}

function getSuggestedStartTime({ truckId, selectedDate, dayEvents, startMap, durationMap }) {
  const laneEvents = dayEvents
    .filter(event => event.truckId === truckId)
    .sort((left, right) => {
      const leftStart = startMap[left.orderId] ?? left.hour * 60 + left.minute;
      const rightStart = startMap[right.orderId] ?? right.hour * 60 + right.minute;
      return leftStart - rightStart;
    });
  const now = new Date();
  const currentMinutes = isSameDay(now, selectedDate) ? now.getHours() * 60 + now.getMinutes() : SCREEN_START_HOUR * 60;
  const latestEnd = laneEvents.reduce((max, event) => {
    const startMinutes = startMap[event.orderId] ?? event.hour * 60 + event.minute;
    const durationMinutes = durationMap[event.orderId] ?? 90;
    return Math.max(max, startMinutes + durationMinutes);
  }, SCREEN_START_HOUR * 60);
  const base = Math.max(currentMinutes, latestEnd, SCREEN_START_HOUR * 60);
  const rounded = Math.ceil(base / TIME_PICKER_MINUTE_STEP) * TIME_PICKER_MINUTE_STEP;
  return {
    hour: Math.floor(rounded / 60),
    minute: rounded % 60,
  };
}

function clampScheduleMinutes(minutes, durationMinutes = TIME_PICKER_MINUTE_STEP) {
  const min = SCREEN_START_HOUR * 60;
  const max = SCREEN_END_HOUR * 60 - Math.max(TIME_PICKER_MINUTE_STEP, durationMinutes);
  return Math.max(min, Math.min(max, minutes));
}

function roundScheduleMinutes(minutes, step = TIME_PICKER_MINUTE_STEP) {
  return Math.round(minutes / step) * step;
}

function getDropMinutesFromPointer(clientX, trackElement, { durationMinutes = 90, pointerOffsetMinutes = 0, step = DRAG_SCHEDULE_MINUTE_STEP } = {}) {
  const rect = trackElement.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
  const rangeMinutes = (SCREEN_END_HOUR - SCREEN_START_HOUR) * 60;
  const pointerMinutes = SCREEN_START_HOUR * 60 + ratio * rangeMinutes;
  return clampScheduleMinutes(roundScheduleMinutes(pointerMinutes - pointerOffsetMinutes, step), durationMinutes);
}

function getPointerMinutesFromTrack(clientX, trackElement) {
  const rect = trackElement.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
  return SCREEN_START_HOUR * 60 + ratio * ((SCREEN_END_HOUR - SCREEN_START_HOUR) * 60);
}

function getScheduleCollision({ requestId, truckId, startMinutes, durationMinutes, dayEvents, startMap, durationMap }) {
  const endMinutes = startMinutes + durationMinutes;
  return dayEvents.find(event => {
    if (event.truckId !== truckId || event.orderId === requestId) {
      return false;
    }
    const existingStart = startMap[event.orderId] ?? event.hour * 60 + event.minute;
    const existingEnd = existingStart + (durationMap[event.orderId] ?? 90);
    return startMinutes < existingEnd && endMinutes > existingStart;
  }) || null;
}

function getCollisionMessage(event, startMap, durationMap) {
  if (!event) {
    return 'That time overlaps another delivery.';
  }
  const startMinutes = startMap[event.orderId] ?? event.hour * 60 + event.minute;
  const endMinutes = startMinutes + (durationMap[event.orderId] ?? 90);
  return `That slot overlaps ${event.builderName || 'another delivery'} (${formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} - ${formatTimeChip(Math.floor(endMinutes / 60), Math.floor(endMinutes % 60))}).`;
}

function getEdgeSnapCandidate({
  requestId,
  truckId,
  startMinutes,
  durationMinutes,
  dayEvents,
  startMap,
  durationMap,
  primaryDurationMap = {},
  returnTransitByRequestId = {},
  cycleStateMap = {},
  currentLinkedParentId = '',
  thresholdMinutes = SNAP_EDGE_THRESHOLD_MINUTES,
}) {
  const endMinutes = startMinutes + durationMinutes;
  let best = null;
  dayEvents.forEach(event => {
    if (event.truckId !== truckId || event.orderId === requestId) {
      return;
    }
    const existingStart = startMap[event.orderId] ?? event.hour * 60 + event.minute;
    const existingDuration = durationMap[event.orderId] ?? 90;
    const existingEnd = existingStart + existingDuration;
    const existingPrimaryDuration = primaryDurationMap[event.orderId] ?? existingDuration;
    const hasReturnSnapSegment = Boolean(
      returnTransitByRequestId?.[event.orderId]
      && !cycleStateMap?.[event.orderId]?.hasSecondaryContinuation
      && existingDuration - existingPrimaryDuration > 0.5
    );
    const eventThresholdMinutes = currentLinkedParentId && event.orderId === currentLinkedParentId
      ? UNLINK_PARENT_RESNAP_THRESHOLD_MINUTES
      : thresholdMinutes;
    const beforeDistance = Math.abs(endMinutes - existingStart);
    const afterDistance = Math.abs(startMinutes - existingEnd);
    if (beforeDistance <= eventThresholdMinutes && (!best || beforeDistance < best.distance)) {
      best = {
        event,
        side: 'before',
        minutes: clampScheduleMinutes(existingStart - durationMinutes, durationMinutes),
        distance: beforeDistance,
      };
    }
    if (afterDistance <= eventThresholdMinutes && (!best || afterDistance < best.distance)) {
      best = {
        event,
        side: 'after',
        linkSegment: hasReturnSnapSegment ? 'return' : undefined,
        minutes: clampScheduleMinutes(existingEnd, durationMinutes),
        distance: afterDistance,
      };
    }
  });
  return best;
}

function getAfterSnapCandidateForEvent(scheduleEvent, startMap, durationMap, durationMinutes) {
  if (!scheduleEvent) {
    return null;
  }
  const existingStart = startMap[scheduleEvent.orderId] ?? scheduleEvent.hour * 60 + scheduleEvent.minute;
  const existingEnd = existingStart + (durationMap[scheduleEvent.orderId] ?? 90);
  return {
    event: scheduleEvent,
    side: 'after',
    minutes: clampScheduleMinutes(existingEnd, durationMinutes),
    distance: 0,
  };
}

function getReturnSegmentSnapState({
  scheduleEvent,
  eventTarget,
  probeMinutes,
  tileStartMinutes,
  startMap,
  durationMap,
  primaryDurationMap,
  returnTransitByRequestId,
  cycleStateMap,
  currentLinkedParentId = '',
  durationMinutes,
}) {
  const requestId = scheduleEvent?.orderId;
  const targetOrderId = eventTarget?.closest?.('[data-order-id]')?.dataset?.orderId || null;
  const returnEnabled = Boolean(requestId && returnTransitByRequestId?.[requestId]);
  const hasSecondaryContinuation = Boolean(requestId && cycleStateMap?.[requestId]?.hasSecondaryContinuation);
  const hasReturnTransitContinuation = Boolean(requestId && cycleStateMap?.[requestId]?.hasReturnTransitContinuation);
  const directlyOnReturnCard = Boolean(eventTarget?.closest?.('.ts2-return-card'))
    && (!targetOrderId || targetOrderId === requestId);
  const baseState = {
    candidate: null,
    requestId,
    returnEnabled,
    hasSecondaryContinuation,
    hasReturnTransitContinuation,
    existingStart: null,
    existingEnd: null,
    returnStart: null,
    directlyOnReturnCard,
    pointerOverReturnTime: false,
    probeMinutes,
  };
  if (!requestId || !returnEnabled || hasSecondaryContinuation) {
    return baseState;
  }

  const existingStart = startMap[requestId] ?? scheduleEvent.hour * 60 + scheduleEvent.minute;
  const existingDuration = durationMap[requestId] ?? 90;
  const existingEnd = existingStart + existingDuration;
  const primaryDuration = Math.max(1, Math.min(existingDuration - 1, primaryDurationMap[requestId] ?? existingDuration));
  const returnStart = existingStart + primaryDuration;
  const pointerOverReturnTime = typeof probeMinutes === 'number'
    && probeMinutes >= returnStart
    && probeMinutes <= existingEnd + (
      currentLinkedParentId && requestId === currentLinkedParentId
        ? UNLINK_PARENT_RESNAP_THRESHOLD_MINUTES
        : SNAP_EDGE_THRESHOLD_MINUTES
    );
  // Also snap when the tile's calculated left-edge position is near the return end,
  // even if the pointer is past it (right-to-left drag with large pointer offset).
  const returnSnapThresholdMinutes = currentLinkedParentId && requestId === currentLinkedParentId
    ? UNLINK_PARENT_RESNAP_THRESHOLD_MINUTES
    : SNAP_EDGE_THRESHOLD_MINUTES;
  const tileNearReturnEnd = typeof tileStartMinutes === 'number'
    && Math.abs(tileStartMinutes - existingEnd) <= returnSnapThresholdMinutes;

  if (!directlyOnReturnCard && !pointerOverReturnTime && !tileNearReturnEnd) {
    return {
      ...baseState,
      existingStart,
      existingEnd,
      returnStart,
      directlyOnReturnCard,
      pointerOverReturnTime,
    };
  }

  return {
    ...baseState,
    existingStart,
    existingEnd,
    returnStart,
    directlyOnReturnCard,
    pointerOverReturnTime,
    candidate: {
      event: scheduleEvent,
      side: 'after',
      linkSegment: 'return',
      minutes: clampScheduleMinutes(existingEnd, durationMinutes),
      distance: 0,
    },
  };
}

function getReturnSegmentSnapStateForLane({
  requestId,
  truckId,
  eventTarget,
  probeMinutes,
  tileStartMinutes,
  dayEvents,
  startMap,
  durationMap,
  primaryDurationMap,
  returnTransitByRequestId,
  cycleStateMap,
  currentLinkedParentId = '',
  durationMinutes,
}) {
  let bestState = null;
  (dayEvents || []).forEach(scheduleEvent => {
    if (scheduleEvent.truckId !== truckId || scheduleEvent.orderId === requestId) {
      return;
    }
    const state = getReturnSegmentSnapState({
      scheduleEvent,
      eventTarget,
      probeMinutes,
      tileStartMinutes,
      startMap,
      durationMap,
      primaryDurationMap,
      returnTransitByRequestId,
      cycleStateMap,
      currentLinkedParentId,
      durationMinutes,
    });
    if (!state.candidate) {
      return;
    }
    const distance = typeof probeMinutes === 'number'
      ? Math.min(
        Math.abs(probeMinutes - state.returnStart),
        Math.abs(probeMinutes - state.existingEnd),
      )
      : 0;
    if (!bestState || distance < bestState.distance) {
      bestState = { ...state, distance };
    }
  });
  return bestState || { candidate: null };
}

function sameDropPreview(left, right) {
  return Boolean(left)
    && left.truckId === right.truckId
    && left.minutes === right.minutes
    && left.durationMinutes === right.durationMinutes
    && Boolean(left.blocked) === Boolean(right.blocked)
    && left.snapOrderId === right.snapOrderId
    && left.snapSide === right.snapSide
    && (left.snapSegment || '') === (right.snapSegment || '');
}

function intersectRects(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function sameDropPreviewGroup(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    return other
      && item.orderId === other.orderId
      && item.truckId === other.truckId
      && item.minutes === other.minutes
      && item.durationMinutes === other.durationMinutes
      && Boolean(item.blocked) === Boolean(other.blocked);
  });
}

function setScheduleDragImage(event, request, options = {}) {
  if (!event.dataTransfer || typeof document === 'undefined') {
    return;
  }
  const ghost = document.createElement('div');
  ghost.className = 'transport-drag-ghost';
  if (options.width) {
    ghost.style.width = `${Math.max(96, options.width)}px`;
  }
  if (options.height) {
    ghost.style.minHeight = `${Math.max(58, options.height)}px`;
  }
  if (options.backgroundColor) {
    ghost.style.background = options.backgroundColor;
  }
  if (options.color) {
    ghost.style.color = options.color;
  }
  const label = document.createElement('span');
  label.textContent = options.label || 'Drop to schedule';
  const title = document.createElement('strong');
  title.textContent = request?.builderName || 'Material Order';
  const subtitle = document.createElement('small');
  subtitle.textContent = request?.projectName || 'Scheduled delivery';
  const status = document.createElement('em');
  const dot = document.createElement('i');
  status.appendChild(dot);
  status.appendChild(document.createTextNode('Scheduled'));
  ghost.append(label, title, subtitle, status);
  document.body.appendChild(ghost);
  const offsetX = typeof options.imageOffsetX === 'number'
    ? Math.max(0, Math.min(options.width || 148, options.imageOffsetX))
    : Math.min(32, Math.max(16, (options.width || 148) / 5));
  const offsetY = typeof options.imageOffsetY === 'number'
    ? Math.max(0, Math.min(options.height || 78, options.imageOffsetY))
    : 18;
  event.dataTransfer.setDragImage(ghost, offsetX, offsetY);
  window.setTimeout(() => ghost.remove(), 0);
}

function buildEstimateSummary(selectedDate, hour, minute, routeEstimate, hasSiteLocation, secondaryRoute = null, includeReturnTransitToYard = true, returnRouteEstimate = null, serviceMinutes = DEFAULT_SERVICE_MINUTES) {
  const transitMinutes = routeEstimate?.durationMinutes ? Math.round(routeEstimate.durationMinutes) : 0;
  const loadingMinutes = normalizeServiceMinutes(serviceMinutes);
  const secondaryTravelMinutes = secondaryRoute?.travelDurationSeconds ? Math.round(secondaryRoute.travelDurationSeconds / 60) : 0;
  const secondaryServiceMinutes = secondaryRoute ? Math.max(0, Number(secondaryRoute.serviceMinutes) || 0) : 0;
  const returnMinutes = secondaryRoute?.returnDurationSeconds
    ? Math.round(secondaryRoute.returnDurationSeconds / 60)
    : returnRouteEstimate?.durationMinutes
      ? Math.round(returnRouteEstimate.durationMinutes)
      : routeEstimate?.durationMinutes ? Math.round(routeEstimate.durationMinutes) : 0;
  const includedReturnMinutes = includeReturnTransitToYard ? returnMinutes : 0;
  const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hour, minute, 0, 0);
  const arrival = new Date(start.getTime() + transitMinutes * 60 * 1000);
  const loadingComplete = new Date(arrival.getTime() + loadingMinutes * 60 * 1000);
  const secondaryComplete = new Date(loadingComplete.getTime() + (secondaryTravelMinutes + secondaryServiceMinutes) * 60 * 1000);
  const returned = new Date(secondaryComplete.getTime() + includedReturnMinutes * 60 * 1000);
  if (!hasSiteLocation) {
    return {
      deliveryFromYard: 'Pending site location',
      siteLoading: `${loadingMinutes} min`,
      secondaryRoute: secondaryRoute ? 'Pending secondary route' : null,
      returnTransit: includeReturnTransitToYard ? 'Pending site location' : null,
      overall: `${loadingMinutes + secondaryTravelMinutes + secondaryServiceMinutes} min onsite`,
      aestTime: formatTimeChip(hour, minute),
      arrivalTime: 'Pending',
      loadingCompleteTime: formatTimeChip(loadingComplete.getHours(), loadingComplete.getMinutes()),
      secondaryCompleteTime: secondaryRoute ? formatTimeChip(secondaryComplete.getHours(), secondaryComplete.getMinutes()) : null,
      returnTime: includeReturnTransitToYard ? 'Pending' : null,
    };
  }
  if (!routeEstimate) {
    return {
      deliveryFromYard: 'Calculating route',
      siteLoading: `${loadingMinutes} min`,
      secondaryRoute: secondaryRoute ? 'Calculating route' : null,
      returnTransit: includeReturnTransitToYard ? 'Calculating route' : null,
      overall: `${loadingMinutes + secondaryTravelMinutes + secondaryServiceMinutes} min onsite`,
      aestTime: formatTimeChip(hour, minute),
      arrivalTime: 'Calculating',
      loadingCompleteTime: formatTimeChip(loadingComplete.getHours(), loadingComplete.getMinutes()),
      secondaryCompleteTime: secondaryRoute ? formatTimeChip(secondaryComplete.getHours(), secondaryComplete.getMinutes()) : null,
      returnTime: includeReturnTransitToYard ? 'Calculating' : null,
    };
  }
  return {
    deliveryFromYard: `${transitMinutes} min`,
    siteLoading: `${loadingMinutes} min`,
    secondaryRoute: secondaryRoute ? `${secondaryTravelMinutes + secondaryServiceMinutes} min` : null,
    returnTransit: includeReturnTransitToYard ? `${returnMinutes} min` : null,
    overall: `${transitMinutes + loadingMinutes + secondaryTravelMinutes + secondaryServiceMinutes + includedReturnMinutes} min`,
    aestTime: formatTimeChip(hour, minute),
    arrivalTime: formatTimeChip(arrival.getHours(), arrival.getMinutes()),
    loadingCompleteTime: formatTimeChip(loadingComplete.getHours(), loadingComplete.getMinutes()),
    secondaryCompleteTime: secondaryRoute ? formatTimeChip(secondaryComplete.getHours(), secondaryComplete.getMinutes()) : null,
    returnTime: includeReturnTransitToYard ? formatTimeChip(returned.getHours(), returned.getMinutes()) : null,
  };
}

function buildRouteScheduleFromRequest(request, fallbackDate) {
  if (!request) {
    return {};
  }
  return {
    scheduledDate: request.scheduledDate || (fallbackDate ? formatDateKey(fallbackDate) : undefined),
    scheduledHour: typeof request.scheduledHour === 'number' ? request.scheduledHour : undefined,
    scheduledMinute: typeof request.scheduledMinute === 'number' ? request.scheduledMinute : undefined,
  };
}

function buildRouteScheduleFromEvent(event) {
  if (!event) {
    return {};
  }
  return {
    scheduledDate: event.date,
    scheduledHour: event.hour,
    scheduledMinute: event.minute,
  };
}

function getRequestSiteLocation(request, siteLocationMap = {}, builders = []) {
  if (!request) {
    return '';
  }
  if (isSecondaryRouteRequest(request)) {
    return request.secondaryRoute?.destination || request.secondaryRoute?.linkedRequestSiteLocation || siteLocationMap[request.id] || '';
  }
  return siteLocationMap[request.id] ?? findProjectLocation(builders, request);
}

function getRequestFromLookup(requestId, requestLookup = null) {
  if (!requestId || !requestLookup) {
    return null;
  }
  if (requestLookup instanceof Map) {
    return requestLookup.get(requestId) || null;
  }
  if (Array.isArray(requestLookup)) {
    return requestLookup.find(request => request?.id === requestId) || null;
  }
  return requestLookup[requestId] || null;
}

function getConnectedRouteOrigin(cycleState = null, siteLocationMap = {}, builders = [], requestLookup = null, request = null) {
  if (getConnectedParentSegment(request) === 'return') {
    return '';
  }
  const sourceRequestId = cycleState?.routeFromRequestId || cycleState?.runSourceOrderId || null;
  if (!cycleState?.followsPreviousRun || !sourceRequestId) {
    return '';
  }
  const sourceRequest = getRequestFromLookup(sourceRequestId, requestLookup);
  return getRequestSiteLocation(sourceRequest, siteLocationMap, builders) || siteLocationMap[sourceRequestId] || '';
}

function getReturnRouteOrigin(request, siteLocationMap = {}, builders = []) {
  if (!request) {
    return '';
  }
  const secondaryRoute = request.secondaryRoute || null;
  if (isSecondaryRouteRequest(request)) {
    return secondaryRoute?.destination
      || secondaryRoute?.linkedRequestSiteLocation
      || getRequestSiteLocation(request, siteLocationMap, builders)
      || '';
  }
  return secondaryRoute?.destination || getRequestSiteLocation(request, siteLocationMap, builders) || '';
}

function applyRouteMode(schedule = {}, enableTolls = false) {
  return {
    ...schedule,
    enableTolls,
  };
}

function buildRequestRouteContext(request, event, siteLocationMap = {}, builders = [], tollsMode = false, segment = 'primary', options = {}) {
  const schedule = applyRouteMode(buildRouteScheduleFromEvent(event), getRouteTollsEnabledForRequest(request, tollsMode, segment));
  if (!request || !event) {
    return {
      segment: 'primary',
      fromLocation: '',
      toLocation: '',
      siteLocation: '',
      schedule,
      title: 'Selected Delivery Route',
    };
  }

  if (isSecondaryRouteRequest(request)) {
    const route = request.secondaryRoute || {};
    const toLocation = route.destination || route.linkedRequestSiteLocation || getRequestSiteLocation(request, siteLocationMap, builders);
    return {
      segment: 'secondary',
      fromLocation: getConnectedParentSegment(request) === 'return' ? YARD_LOCATION : route.startingLocation || YARD_LOCATION,
      toLocation,
      siteLocation: toLocation,
      schedule,
      title: 'Selected Secondary Route',
    };
  }

  if (segment === 'secondary' && request.secondaryRoute) {
    const route = request.secondaryRoute || {};
    return {
      segment: 'secondary',
      fromLocation: route.startingLocation || getRequestSiteLocation(request, siteLocationMap, builders) || YARD_LOCATION,
      toLocation: route.destination || '',
      siteLocation: route.destination || '',
      schedule,
      title: 'Selected Secondary Route',
    };
  }

  const toLocation = getRequestSiteLocation(request, siteLocationMap, builders);
  const connectedFromLocation = getConnectedRouteOrigin(
    options.cycleState,
    siteLocationMap,
    builders,
    options.requestLookup,
    request,
  );
  if (connectedFromLocation && toLocation) {
    return {
      segment: 'secondary',
      fromLocation: connectedFromLocation,
      toLocation,
      siteLocation: toLocation,
      schedule,
      title: 'Selected Connected Route',
    };
  }

  return {
    segment: 'primary',
    fromLocation: YARD_LOCATION,
    toLocation,
    siteLocation: toLocation,
    schedule,
    title: 'Selected Delivery Route',
  };
}

function getCachedRouteEstimateForContext(context) {
  if (!context?.toLocation) {
    return null;
  }
  const fromLocation = context.fromLocation || (context.segment === 'primary' ? YARD_LOCATION : '');
  return fromLocation
    ? getCachedRouteEstimateBetweenValue(fromLocation, context.toLocation, context.schedule) ?? null
    : null;
}

function fetchRouteDataForContext(context) {
  if (!context?.toLocation) {
    return Promise.resolve(null);
  }
  const fromLocation = context.fromLocation || (context.segment === 'primary' ? YARD_LOCATION : '');
  return fromLocation
    ? getCachedRouteDataBetween(fromLocation, context.toLocation, context.schedule)
    : Promise.resolve(null);
}

function buildEstimateFromRouteData(routeData) {
  return routeData
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
}

function getTrafficPanelCopy(routeData, loading) {
  if (loading) {
    return { title: 'Checking traffic', detail: 'Live ETA loading' };
  }
  if (!routeData) {
    return { title: 'Traffic pending', detail: 'Add route details' };
  }
  const delayMinutes = Math.max(0, Math.round((routeData.trafficDelaySeconds || 0) / 60));
  const title = delayMinutes >= 15
    ? 'Heavy traffic'
    : delayMinutes >= 6
      ? 'Moderate traffic'
      : 'Light traffic';
  const provider = routeData.hasLiveTraffic ? 'Live' : 'Estimated';
  const detail = routeData.trafficNote || (delayMinutes > 0 ? `ETA impact +${delayMinutes} min` : 'No extra delay');
  return {
    title: `${provider} ${title.toLowerCase()}`,
    detail,
  };
}

function getTrafficDelayMinutes(routeEstimate) {
  const delay = Number(routeEstimate?.trafficDelayMinutes);
  return Number.isFinite(delay) ? Math.max(0, Math.round(delay)) : 0;
}

function getTrafficDelayMinutesFromRouteData(routeData) {
  const delaySeconds = Number(routeData?.trafficDelaySeconds);
  return Number.isFinite(delaySeconds) ? Math.max(0, Math.round(delaySeconds / 60)) : 0;
}

function TrafficDelayBadge({ minutes }) {
  const delay = Math.max(0, Math.round(Number(minutes) || 0));
  return delay > 0 ? <em className="transport-traffic-delay-badge">+{delay} min</em> : null;
}

function TruckLaneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#102B5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 17H4V6h11v11h-2" />
      <path d="M15 9h3l2 3v5h-2" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </svg>
  );
}

function ToolbarIcon({ type }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (type === 'chevron-left') {
    return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
  }
  if (type === 'chevron-right') {
    return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  }
  if (type === 'calendar') {
    return <svg {...common}><path d="M8 2v4M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></svg>;
  }
  if (type === 'refresh') {
    return <svg {...common}><path d="M20 11a8 8 0 1 0 2.3 5.7" /><path d="M20 4v7h-7" /></svg>;
  }
  if (type === 'analysis') {
    return <svg {...common}><path d="M4 19h16" /><path d="M7 15V9" /><path d="M12 15V5" /><path d="M17 15v-3" /></svg>;
  }
  if (type === 'filter') {
    return <svg {...common}><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></svg>;
  }
  if (type === 'more') {
    return <svg {...common}><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" /></svg>;
  }
  return null;
}

function InspectorIcon({ type }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (type === 'truck') {
    return <svg {...common}><path d="M10 17H4V7h10v10h-2" /><path d="M14 10h4l3 3v4h-3" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>;
  }
  if (type === 'unload') {
    return <svg {...common}><path d="M6 4v16" /><path d="M18 4v16" /><path d="M9 8h6M9 12h6M9 16h6" /></svg>;
  }
  if (type === 'return') {
    return <svg {...common}><path d="M9 14 4 9l5-5" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>;
  }
  if (type === 'clock') {
    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  }
  if (type === 'sun') {
    return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>;
  }
  if (type === 'traffic') {
    return <svg {...common}><path d="M12 22a9 9 0 0 0 9-9" /><path d="M12 22a9 9 0 0 1-9-9" /><path d="M12 2v10l5 5" /><circle cx="12" cy="12" r="2" /></svg>;
  }
  if (type === 'spark') {
    return <svg {...common}><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>;
  }
  if (type === 'file') {
    return <svg {...common}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></svg>;
  }
  if (type === 'map') {
    return <svg {...common}><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
}

function ScheduleLegend({ statusColors = null }) {
  const scheduled = scheduleStatusAppearance('scheduled', statusColors);
  const inTransit = scheduleStatusAppearance('in_transit', statusColors);
  const unloading = scheduleStatusAppearance('unloading', statusColors);
  const complete = scheduleStatusAppearance('return_transit', statusColors);
  const pillStyle = appearance => ({
    '--transport-legend-bg': appearance.background,
    '--transport-legend-text': appearance.text,
    '--transport-legend-border': appearance.accent,
  });
  return (
    <div className="transport-reference-legend">
      <span className="transport-reference-legend-label">Legend:</span>
      <span className="transport-reference-legend-icon-item"><InspectorIcon type="truck" />Travel</span>
      <span className="transport-reference-legend-icon-item"><InspectorIcon type="unload" />Unload</span>
      <span className="transport-reference-legend-icon-item"><InspectorIcon type="return" />Return</span>
      <span className="transport-reference-legend-pill scheduled" style={pillStyle(scheduled)}>Scheduled</span>
      <span className="transport-reference-legend-pill in-transit" style={pillStyle(inTransit)}>In Transit</span>
      <span className="transport-reference-legend-pill unloading" style={pillStyle(unloading)}>Unloading</span>
      <span className="transport-reference-legend-pill complete" style={pillStyle(complete)}>Complete</span>
    </div>
  );
}

function formatLastRefreshTime() {
  return new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatNativeDateValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getActualDurationMinutes(startIso, endIso) {
  if (!startIso || !endIso) {
    return null;
  }
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return null;
  }
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function formatActualDuration(minutes) {
  if (typeof minutes !== 'number') {
    return 'Pending';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

function getActualMarkerMinutes(isoValue, dateKey) {
  if (!isoValue) {
    return null;
  }
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime()) || formatDateKey(parsed) !== dateKey) {
    return null;
  }
  return parsed.getHours() * 60 + parsed.getMinutes() + parsed.getSeconds() / 60 + parsed.getMilliseconds() / 60000;
}

function CurrentTimeMarker({ selectedDate, timelineWidth, laneOffset = 0, nowOverride = null, debugActive = false }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (nowOverride) {
      return undefined;
    }
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [nowOverride]);

  const markerNow = nowOverride || now;

  if (!isSameDay(markerNow, selectedDate)) {
    return null;
  }
  const currentMinutes = markerNow.getHours() * 60 + markerNow.getMinutes() + markerNow.getSeconds() / 60;
  const totalMinutes = (SCREEN_END_HOUR - SCREEN_START_HOUR) * 60;
  const left = laneOffset + ((currentMinutes - SCREEN_START_HOUR * 60) / totalMinutes) * timelineWidth;
  if (left < laneOffset || left > laneOffset + timelineWidth) {
    return null;
  }
  return (
    <div className={`ts2-now-marker${debugActive ? ' debug' : ''}`} style={{ left }}>
      <span>{markerNow.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}</span>
    </div>
  );
}

function MiniScheduleStrip({
  laneEvents,
  lanes,
  selectedTruckId,
  selectedHour,
  selectedMinute,
  dayEvents,
  startMap,
  durationMap,
  currentDurationMinutes,
  onSelectSlot,
  selectedDate,
}) {
  const totalMinutes = (SCREEN_END_HOUR - SCREEN_START_HOUR) * 60;
  const now = new Date();
  const showPastOverlay = isSameDay(now, selectedDate);
  const pastMinutes = showPastOverlay ? Math.max(0, now.getHours() * 60 + now.getMinutes() - SCREEN_START_HOUR * 60) : 0;

  const pickStartAfter = (event) => {
    const start = startMap[event.orderId] ?? event.hour * 60 + event.minute;
    const duration = durationMap[event.orderId] ?? 90;
    const next = Math.ceil((start + duration) / TIME_PICKER_MINUTE_STEP) * TIME_PICKER_MINUTE_STEP;
    onSelectSlot(event.truckId, Math.floor(next / 60), next % 60);
  };

  const pickStartBefore = (event) => {
    const start = startMap[event.orderId] ?? event.hour * 60 + event.minute;
    const next = Math.max(SCREEN_START_HOUR * 60, Math.floor((start - currentDurationMinutes) / TIME_PICKER_MINUTE_STEP) * TIME_PICKER_MINUTE_STEP);
    onSelectSlot(event.truckId, Math.floor(next / 60), next % 60);
  };

  return (
    <div className="ts2-mini">
      <div className="ts2-mini-axis">
        <div className="ts2-mini-axis-pad" />
        <div className="ts2-mini-axis-track">
          {Array.from({ length: SCREEN_END_HOUR - SCREEN_START_HOUR + 1 }).map((_, index) => (
            <span key={index}>{formatTimeChip(SCREEN_START_HOUR + index, 0)}</span>
          ))}
        </div>
      </div>
      <div className="ts2-mini-table">
        {lanes.map((lane, laneIndex) => {
          const eventsForLane = laneEvents[laneIndex] || [];
          const selected = selectedTruckId === lane.id;
          return (
            <div key={lane.id} className={`ts2-mini-row${selected ? ' selected' : ''}`}>
              <div className="ts2-mini-label">{lane.rego}</div>
              <div className="ts2-mini-track" onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientX - rect.left) / rect.width;
                const absoluteMinutes = SCREEN_START_HOUR * 60 + Math.max(0, Math.min(1, ratio)) * totalMinutes;
                const rounded = Math.round(absoluteMinutes / TIME_PICKER_MINUTE_STEP) * TIME_PICKER_MINUTE_STEP;
                onSelectSlot(lane.id, Math.floor(rounded / 60), rounded % 60);
              }}>
                {showPastOverlay ? <div className="ts2-mini-past" style={{ width: `${(pastMinutes / totalMinutes) * 100}%` }} /> : null}
                {eventsForLane.map(event => {
                  const left = ((startMap[event.orderId] ?? event.hour * 60 + event.minute) - SCREEN_START_HOUR * 60) / totalMinutes * 100;
                  const width = (Math.max(15, durationMap[event.orderId] ?? 90) / totalMinutes) * 100;
                  return (
                    <React.Fragment key={event.id}>
                      <button type="button" className="ts2-mini-insert before" style={{ left: `${left}%` }} onClick={e => { e.stopPropagation(); pickStartBefore(event); }}>+</button>
                      <div className="ts2-mini-block" style={{ left: `${left}%`, width: `${width}%` }}>
                        <span>{formatTimeChip(event.hour, event.minute)}</span>
                      </div>
                      <button type="button" className="ts2-mini-insert after" style={{ left: `${left + width}%` }} onClick={e => { e.stopPropagation(); pickStartAfter(event); }}>+</button>
                    </React.Fragment>
                  );
                })}
                {selectedTruckId === lane.id ? (
                  <div
                    className="ts2-mini-ghost"
                    style={{
                      left: `${(((selectedHour * 60 + selectedMinute) - SCREEN_START_HOUR * 60) / totalMinutes) * 100}%`,
                      width: `${(Math.max(15, currentDurationMinutes) / totalMinutes) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TruckSchedulePage({ user, onNavigate }) {
  const isTruckRole = isTruckDeviceRole(user?.role);
  const assignedTruck = getTruckAssignment(user?.role);
  const toolbarDateInputRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const selectedDateKey = formatDateKey(selectedDate);
  const [transportStatusColors, setTransportStatusColors] = useState(() => readTransportStatusColors(user));
  const [allRequests, setAllRequests] = useState([]);
  const [dayEvents, setDayEvents] = useState([]);
  const [requestMetaMap, setRequestMetaMap] = useState({});
  const [requestSiteLocationMap, setRequestSiteLocationMap] = useState({});
  const [eventDurationMinutesMap, setEventDurationMinutesMap] = useState({});
  const [eventPrimaryDurationMinutesMap, setEventPrimaryDurationMinutesMap] = useState({});
  const [eventStartMinutesMap, setEventStartMinutesMap] = useState({});
  const [eventCycleStateMap, setEventCycleStateMap] = useState({});
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [error, setError] = useState('');
  const [showPendingPanel, setShowPendingPanel] = useState(true);
  const [timelineScaleMode, setTimelineScaleMode] = useState(() => {
    const saved = localStorage.getItem(`${SCALE_PREF_KEY}:${user?.id || user?.role || 'anon'}`);
    return saved && SCALE_MODES[saved] ? saved : 'standard';
  });
  const [snapToTimeMarks, setSnapToTimeMarks] = useState(() => {
    const saved = localStorage.getItem(`${SNAP_PREF_KEY}:${user?.id || user?.role || 'anon'}`);
    return saved === 'true';
  });
  const [showScheduleTimestamps, setShowScheduleTimestamps] = useState(() => {
    const saved = localStorage.getItem(`${TIMESTAMP_PREF_KEY}:${user?.id || user?.role || 'anon'}`);
    return saved === null ? true : saved === 'true';
  });
  const [tollsByRequestId, setTollsByRequestId] = useState(() => {
    const saved = localStorage.getItem(`${TOLLS_PREF_KEY}:${user?.id || user?.role || 'anon'}`);
    if (!saved) {
      return {};
    }
    try {
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });
  const [returnTransitByRequestId, setReturnTransitByRequestId] = useState(() => {
    const saved = localStorage.getItem(`${RETURN_TRANSIT_PREF_KEY}:${user?.id || user?.role || 'anon'}`);
    if (!saved) {
      return {};
    }
    try {
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return saved === 'true' ? { __legacy: true } : {};
    }
  });
  const [requestModal, setRequestModal] = useState(null);
  const [requestModalLoading, setRequestModalLoading] = useState(false);
  const [requestModalRouteData, setRequestModalRouteData] = useState(null);
  const [requestModalRouteLoading, setRequestModalRouteLoading] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState(assignedTruck?.id || TRUCK_LANES[0].id);
  const [selectedHour, setSelectedHour] = useState(SCREEN_START_HOUR);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedRouteEstimate, setSelectedRouteEstimate] = useState(null);
  const [selectedReturnRouteEstimate, setSelectedReturnRouteEstimate] = useState(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [eventOverviewModal, setEventOverviewModal] = useState(null);
  const [eventOverviewLoading, setEventOverviewLoading] = useState(false);
  const [eventOverviewRouteLoading, setEventOverviewRouteLoading] = useState(false);
  const [eventOverviewRouteData, setEventOverviewRouteData] = useState(null);
  const [selectedScheduleRouteLoading, setSelectedScheduleRouteLoading] = useState(false);
  const [selectedScheduleRouteData, setSelectedScheduleRouteData] = useState(null);
  const [selectedScheduleReturnRouteEstimate, setSelectedScheduleReturnRouteEstimate] = useState(null);
  const [selectedScheduleEventId, setSelectedScheduleEventId] = useState('');
  const [selectedScheduleEventIds, setSelectedScheduleEventIds] = useState([]);
  const [selectedScheduleSegment, setSelectedScheduleSegment] = useState('primary');
  const [scheduleInspectorOpen, setScheduleInspectorOpen] = useState(false);
  const selectedScheduleRouteRequestKeyRef = useRef('');
  const selectedScheduleRouteDataKeyRef = useRef('');
  const [draggedRequestId, setDraggedRequestId] = useState('');
  const [draggedScheduledOrderId, setDraggedScheduledOrderId] = useState('');
  const [dragPreviewDurationMinutes, setDragPreviewDurationMinutes] = useState(90);
  const [dropPreview, setDropPreview] = useState(null);
  const [dropPreviewGroup, setDropPreviewGroup] = useState([]);
  const [dragSchedulingId, setDragSchedulingId] = useState('');
  const [routeLoadingKeys, setRouteLoadingKeys] = useState(() => new Set());
  const [tileMenu, setTileMenu] = useState(null);
  const [manualTimeModal, setManualTimeModal] = useState(null);
  const [serviceTimeModal, setServiceTimeModal] = useState(null);
  const [secondaryRouteModal, setSecondaryRouteModal] = useState(null);
  const [secondaryRouteSaving, setSecondaryRouteSaving] = useState(false);
  const [secondaryAddressSuggestions, setSecondaryAddressSuggestions] = useState([]);
  const [secondaryAddressLoading, setSecondaryAddressLoading] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugNowMs, setDebugNowMs] = useState(() => Date.now());
  const [debugSpeed, setDebugSpeed] = useState(1);
  const [debugStatusSavingId, setDebugStatusSavingId] = useState('');
  const [snapDebugInfo, setSnapDebugInfo] = useState(null);
  const [returnTransitReprojectingId, setReturnTransitReprojectingId] = useState('');
  const boardScrollRef = useRef(null);
  const boardBodyRef = useRef(null);
  const scaleAnchorRef = useRef(null);
  const loadPromiseRef = useRef(null);
  const optimisticRequestOverridesRef = useRef(new Map());
  const requestSiteLocationMapRef = useRef({});
  const stableRouteEstimateMapRef = useRef({});
  const returnTransitSharedMigrationRef = useRef(new Set());
  const boardProjectionSignatureRef = useRef('');
  const requestMetaSignatureRef = useRef('');
  const dragPointerOffsetMinutesRef = useRef(0);
  const selectionDragContextRef = useRef(null);
  const selectionStateRef = useRef(null);
  const [selectionBox, setSelectionBox] = useState(null);
  const debugNow = useMemo(() => new Date(debugNowMs), [debugNowMs]);
  const debugNowRef = useRef(debugNow);

  useEffect(() => {
    debugNowRef.current = debugNow;
  }, [debugNow]);

  useEffect(() => {
    const refreshStatusColors = () => setTransportStatusColors(readTransportStatusColors(user));
    refreshStatusColors();
    window.addEventListener(TRANSPORT_STATUS_COLOR_PREF_EVENT, refreshStatusColors);
    window.addEventListener('storage', refreshStatusColors);
    return () => {
      window.removeEventListener(TRANSPORT_STATUS_COLOR_PREF_EVENT, refreshStatusColors);
      window.removeEventListener('storage', refreshStatusColors);
    };
  }, [user]);

  const setRouteLoading = useCallback((requestId, loading, segment = 'primary') => {
    if (!requestId) {
      return;
    }
    const loadingKey = getRouteLoadingKey(requestId, segment);
    setRouteLoadingKeys(current => {
      const hasRequest = current.has(loadingKey);
      if (loading === hasRequest) {
        return current;
      }
      const next = new Set(current);
      if (loading) {
        next.add(loadingKey);
      } else {
        next.delete(loadingKey);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    requestSiteLocationMapRef.current = requestSiteLocationMap;
  }, [requestSiteLocationMap]);

  const getReturnTransitEnabled = useCallback((requestId) => Boolean(returnTransitByRequestId?.[requestId]), [returnTransitByRequestId]);
  const getTollsEnabled = useCallback((requestOrId, requestOrSegment = null, segment = 'primary') => {
    const requestId = typeof requestOrId === 'string' ? requestOrId : requestOrId?.id;
    const resolvedSegment = typeof requestOrSegment === 'string' ? requestOrSegment : segment;
    const storageKey = getTollStorageKey(requestId, resolvedSegment);
    return Boolean(storageKey && tollsByRequestId?.[storageKey]);
  }, [tollsByRequestId]);
  const getCurrentLinkedParentIdForDrag = useCallback((requestId) => {
    if (!requestId || draggedScheduledOrderId !== requestId) {
      return '';
    }
    const request = requestMetaMap[requestId] || allRequests.find(item => item.id === requestId) || null;
    return request?.sourceOrderId || '';
  }, [allRequests, draggedScheduledOrderId, requestMetaMap]);

  const mergeRequestSiteLocationMap = useCallback((patch) => {
    const entries = Object.entries(patch || {});
    if (entries.length === 0) {
      return requestSiteLocationMapRef.current;
    }

    let changed = false;
    const next = { ...requestSiteLocationMapRef.current };
    entries.forEach(([key, value]) => {
      if (next[key] !== value) {
        next[key] = value;
        changed = true;
      }
    });

    if (changed) {
      requestSiteLocationMapRef.current = next;
      setRequestSiteLocationMap(next);
    }

    return requestSiteLocationMapRef.current;
  }, []);

  const rememberStableRouteEstimates = useCallback((routeMap = {}) => {
    const entries = Object.entries(routeMap || {});
    if (entries.length === 0) {
      return;
    }

    stableRouteEstimateMapRef.current = {
      ...stableRouteEstimateMapRef.current,
      ...Object.fromEntries(entries.filter(([, estimate]) => estimate !== undefined)),
    };
  }, []);

  const applyBoardProjection = useCallback((requestsForDay, board, options = {}) => {
    const signature = getBoardProjectionSignature(board);
    if (options.force || signature !== boardProjectionSignatureRef.current) {
      boardProjectionSignatureRef.current = signature;
      setDayEvents(board.dayEvents);
      setEventDurationMinutesMap(board.durationMap);
      setEventStartMinutesMap(board.startMap);
      setEventPrimaryDurationMinutesMap(board.primaryDurationMap);
      setEventCycleStateMap(board.cycleStateMap);
    }
    const metaSignature = getRequestListSignature(requestsForDay);
    if (options.force || metaSignature !== requestMetaSignatureRef.current) {
      requestMetaSignatureRef.current = metaSignature;
      setRequestMetaMap(Object.fromEntries(requestsForDay.map(request => [request.id, request])));
    }
  }, []);

  const projectRequestsToBoard = useCallback((requests, siteLocationMapOverride, fallbackDate = selectedDate, options = {}) => {
    const dateKey = typeof fallbackDate === 'string' ? fallbackDate : formatDateKey(fallbackDate || selectedDate);
    const siteLocationMap = siteLocationMapOverride || requestSiteLocationMapRef.current;
    const requestsForDay = (requests || []).filter(request => request.scheduledDate === dateKey && !request.scheduleRemovedAt);
    const effectiveReturnTransitByRequestId = buildReturnTransitMapForRequests(requestsForDay, returnTransitByRequestId);
    const routeMap = buildCachedRouteMapForRequests(
      requestsForDay,
      siteLocationMap,
      fallbackDate || selectedDate,
      getTollsEnabled,
      effectiveReturnTransitByRequestId,
      stableRouteEstimateMapRef.current,
    );
    rememberStableRouteEstimates(routeMap);
    const flowRouteMap = routeMap;
    const board = buildBoardState(requestsForDay, routeMap, debugMode ? debugNowRef.current : null, effectiveReturnTransitByRequestId, { flowRouteMap });
    applyBoardProjection(requestsForDay, board, options);
    return { requestsForDay, board };
  }, [applyBoardProjection, debugMode, getTollsEnabled, rememberStableRouteEstimates, returnTransitByRequestId, selectedDate]);

  const visibleTruckLanes = useMemo(() => {
    if (isTruckRole && assignedTruck) {
      return TRUCK_LANES.filter(lane => lane.id === assignedTruck.id);
    }
    return TRUCK_LANES;
  }, [assignedTruck, isTruckRole]);

  const loadBoard = useCallback(async () => {
    const dateKey = formatDateKey(selectedDate);
    const loadKey = `${dateKey}:${JSON.stringify(tollsByRequestId || {})}:${JSON.stringify(returnTransitByRequestId || {})}`;
    if (loadPromiseRef.current?.loadKey === loadKey) {
      return loadPromiseRef.current.promise;
    }
    const task = (async () => {
      const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
      const [active, archived] = await Promise.all([
        materialOrderRequestsAPI.listActiveRequests({ includeArchived: true }).catch(() => []),
        materialOrderRequestsAPI.listArchivedRequests().catch(() => []),
      ]);
      const merged = applyOptimisticRequestOverrides(
        dedupeRequests([...active, ...archived]),
        optimisticRequestOverridesRef.current,
      );
      const effectiveReturnTransitByRequestId = buildReturnTransitMapForRequests(merged, returnTransitByRequestId);
      setReturnTransitByRequestId(current => (
        areReturnTransitMapsEqual(current, effectiveReturnTransitByRequestId)
          ? current
          : effectiveReturnTransitByRequestId
      ));
      const returnTransitMigrations = merged.filter(request =>
        request?.id
        && returnTransitByRequestId?.[request.id]
        && !hasRequestReturnTransitToYardSetting(request)
        && !returnTransitSharedMigrationRef.current.has(request.id)
      );
      if (returnTransitMigrations.length > 0) {
        returnTransitMigrations.forEach(request => returnTransitSharedMigrationRef.current.add(request.id));
        Promise.all(returnTransitMigrations.map(request =>
          materialOrderRequestsAPI.setReturnTransitToYard(request.id, true).catch(() => null),
        )).then(savedRequests => {
          const updates = savedRequests.filter(Boolean);
          if (updates.length === 0) {
            return;
          }
          updates.forEach(savedRequest => {
            optimisticRequestOverridesRef.current.set(savedRequest.id, {
              request: savedRequest,
              expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
            });
          });
          setAllRequests(currentRequests => currentRequests.map(request =>
            updates.find(savedRequest => savedRequest.id === request.id) || request,
          ));
        });
      }
      setAllRequests(current => getRequestListSignature(current) === getRequestListSignature(merged) ? current : merged);
      const requestsForDay = merged.filter(request => request.scheduledDate === dateKey && !request.scheduleRemovedAt);
      const siteLocationMap = Object.fromEntries(
        requestsForDay.map(request => [
          request.id,
          isSecondaryRouteRequest(request)
            ? getConnectedParentSegment(request) === 'return'
              ? YARD_LOCATION
              : request.secondaryRoute.startingLocation || requestSiteLocationMapRef.current[request.id] || ''
            : requestSiteLocationMapRef.current[request.id] ?? findProjectLocation(builders, request),
        ]),
      );
      const nextSiteLocationMap = mergeRequestSiteLocationMap(siteLocationMap);
      const cachedRouteMap = buildCachedRouteMapForRequests(
        requestsForDay,
        nextSiteLocationMap,
        selectedDate,
        getTollsEnabled,
        effectiveReturnTransitByRequestId,
        stableRouteEstimateMapRef.current,
      );
      rememberStableRouteEstimates(cachedRouteMap);
      const initialBoard = buildBoardState(requestsForDay, cachedRouteMap, debugMode ? debugNowRef.current : null, effectiveReturnTransitByRequestId, { flowRouteMap: cachedRouteMap });
      applyBoardProjection(requestsForDay, initialBoard);
      setLoadingBoard(false);
      const requestLookup = new Map(requestsForDay.map(request => [request.id, request]));
      const resolvedRouteEntries = await Promise.all(
        requestsForDay.map(async request => {
          const routeContext = getBoardRouteContextForRequest(request, requestLookup, nextSiteLocationMap, selectedDate, getTollsEnabled, effectiveReturnTransitByRequestId);
          if (!routeContext) {
            return [request.id, null];
          }
          const cachedEstimate = getCachedBoardRouteEstimate(routeContext);
          const loadingSegment = cachedEstimate === undefined
            ? getBoardRouteLoadingSegment(routeContext) || 'primary'
            : null;
          if (loadingSegment) {
            setRouteLoading(request.id, true, loadingSegment);
          }
          try {
            const resolvedEstimate = cachedEstimate !== undefined
              ? cachedEstimate
              : await resolveBoardRouteEstimate(routeContext);
            return [
              request.id,
              resolvedEstimate,
            ];
          } finally {
            if (loadingSegment) {
              setRouteLoading(request.id, false, loadingSegment);
            }
          }
        }),
      );
      const resolvedRouteMap = Object.fromEntries(resolvedRouteEntries.map(([id, estimate]) => [id, estimate]));
      rememberStableRouteEstimates(resolvedRouteMap);
      const nextBoard = buildBoardState(requestsForDay, resolvedRouteMap, debugMode ? debugNowRef.current : null, effectiveReturnTransitByRequestId, { flowRouteMap: resolvedRouteMap });
      applyBoardProjection(requestsForDay, nextBoard);
      setError('');
    })().catch(err => {
      setError(err?.message || 'Failed to load truck schedule.');
      setLoadingBoard(false);
    }).finally(() => {
      if (loadPromiseRef.current?.promise === task) {
        loadPromiseRef.current = null;
      }
    });
    loadPromiseRef.current = { loadKey, promise: task };
    return task;
  }, [applyBoardProjection, debugMode, getTollsEnabled, mergeRequestSiteLocationMap, rememberStableRouteEstimates, returnTransitByRequestId, selectedDate, setRouteLoading, tollsByRequestId]);

  useEffect(() => {
    loadBoard().catch(() => {});
  }, [loadBoard]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      loadBoard().catch(() => {});
    };
    const refreshFromPolling = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      recordForegroundPollingCycle('transport-schedule-board');
      loadBoard().catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadBoard().catch(() => {});
      }
    };
    let pollingTimeout = null;
    let disposed = false;
    const queueNextPoll = () => {
      pollingTimeout = window.setTimeout(() => {
        if (disposed) {
          return;
        }
        refreshFromPolling();
        queueNextPoll();
      }, getJitteredPollingDelay(LIVE_REFRESH_MS));
    };
    queueNextPoll();
    window.addEventListener(MATERIAL_ORDER_REQUESTS_CHANGED_EVENT, refreshWhenVisible);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      disposed = true;
      window.clearTimeout(pollingTimeout);
      window.removeEventListener(MATERIAL_ORDER_REQUESTS_CHANGED_EVENT, refreshWhenVisible);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadBoard]);

  useEffect(() => {
    if (!debugMode || debugSpeed <= 0) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      setDebugNowMs(current => current + 1000 * debugSpeed);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [debugMode, debugSpeed]);

  useEffect(() => {
    if (!debugMode) {
      return;
    }
    projectRequestsToBoard(allRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
  }, [allRequests, debugMode, debugNowMs, projectRequestsToBoard, returnTransitByRequestId, selectedDate]);

  useEffect(() => {
    localStorage.setItem(`${SCALE_PREF_KEY}:${user?.id || user?.role || 'anon'}`, timelineScaleMode);
  }, [timelineScaleMode, user?.id, user?.role]);

  useEffect(() => {
    localStorage.setItem(`${SNAP_PREF_KEY}:${user?.id || user?.role || 'anon'}`, String(snapToTimeMarks));
  }, [snapToTimeMarks, user?.id, user?.role]);

  useEffect(() => {
    localStorage.setItem(`${TIMESTAMP_PREF_KEY}:${user?.id || user?.role || 'anon'}`, String(showScheduleTimestamps));
  }, [showScheduleTimestamps, user?.id, user?.role]);
  useEffect(() => {
    localStorage.setItem(`${TOLLS_PREF_KEY}:${user?.id || user?.role || 'anon'}`, JSON.stringify(tollsByRequestId || {}));
  }, [tollsByRequestId, user?.id, user?.role]);
  useEffect(() => {
    localStorage.setItem(`${RETURN_TRANSIT_PREF_KEY}:${user?.id || user?.role || 'anon'}`, JSON.stringify(returnTransitByRequestId || {}));
  }, [returnTransitByRequestId, user?.id, user?.role]);

  useEffect(() => {
    if (!returnTransitReprojectingId) {
      return undefined;
    }
    setRouteLoading(returnTransitReprojectingId, true, 'return');
    const timeout = window.setTimeout(() => {
      setReturnTransitReprojectingId('');
      setRouteLoading(returnTransitReprojectingId, false, 'return');
    }, ROUTE_LOADING_MIN_MS);
    return () => {
      window.clearTimeout(timeout);
      setRouteLoading(returnTransitReprojectingId, false, 'return');
    };
  }, [returnTransitReprojectingId, setRouteLoading]);

  const setReturnTransitForRequest = useCallback((requestId, checked) => {
    if (!requestId) {
      return;
    }
    const parentRequest = allRequests.find(item => item.id === requestId) || requestMetaMap[requestId] || null;
    if (!parentRequest) {
      return;
    }
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;
    const previousReturnTransitByRequestId = returnTransitByRequestId;
    const parentEvent = dayEvents.find(item => item.orderId === requestId) || null;
    const parentStartMinutes = eventStartMinutesMap[requestId] ?? (parentEvent ? parentEvent.hour * 60 + parentEvent.minute : getRequestScheduledStartMinutes(parentRequest));
    const primaryEndMinutes = parentStartMinutes + Math.max(1, eventPrimaryDurationMinutesMap[requestId] ?? getRequestDeliveryHandoffMinutes(parentRequest));
    const returnEndMinutes = parentStartMinutes + Math.max(
      eventPrimaryDurationMinutesMap[requestId] ?? getRequestDeliveryHandoffMinutes(parentRequest),
      eventDurationMinutesMap[requestId] ?? getRequestDeliveryHandoffMinutes(parentRequest),
    );
    const sourceSegment = checked ? 'primary' : 'return';
    const targetSegment = checked ? 'return' : 'primary';
    const continuation = getFirstLinkedContinuation(requestId, allRequests, sourceSegment);
    const parentSiteLocation = requestSiteLocationMapRef.current[requestId] || getRequestSiteLocation(parentRequest, requestSiteLocationMapRef.current, []);
    const updatedContinuation = continuation
      ? buildContinuationSegmentUpdate(
          continuation,
          parentRequest,
          targetSegment,
          checked ? returnEndMinutes : primaryEndMinutes,
          parentSiteLocation,
        )
      : null;
    const updatedParentRequest = applyReturnTransitToRequest(parentRequest, checked);
    const nextRequests = previousRequests.map(item => {
      if (item.id === requestId) {
        return updatedParentRequest;
      }
      if (updatedContinuation && item.id === updatedContinuation.id) {
        return updatedContinuation;
      }
      return item;
    });

    setReturnTransitReprojectingId(requestId);
    setReturnTransitByRequestId(current => {
      const next = { ...(current || {}) };
      if (checked) {
        next[requestId] = true;
      } else {
        delete next[requestId];
      }
      delete next.__legacy;
      return next;
    });
    setTileMenu(null);
    setSelectedScheduleEventId(requestId);
    setSelectedScheduleEventIds([requestId]);
    setSelectedScheduleSegment(checked ? 'return' : 'primary');
    setScheduleInspectorOpen(true);
    setAllRequests(nextRequests);
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
    optimisticRequestOverridesRef.current.set(requestId, {
      request: updatedParentRequest,
      expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
    });
    if (updatedContinuation) {
      optimisticRequestOverridesRef.current.set(updatedContinuation.id, {
        request: updatedContinuation,
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
      setRouteLoading(updatedContinuation.id, true, 'primary');
    }
    Promise.all([
      materialOrderRequestsAPI.setReturnTransitToYard(requestId, checked),
      updatedContinuation ? materialOrderRequestsAPI.setRunLink(updatedContinuation.id, {
        sourceOrderId: requestId,
        connectedParentStartMinutes: updatedContinuation.connectedParentStartMinutes,
        connectedParentSegment: targetSegment,
        secondaryRoute: updatedContinuation.secondaryRoute,
      }) : Promise.resolve(null),
    ])
      .then(([savedParent, savedContinuation]) => {
        if (savedParent) {
          optimisticRequestOverridesRef.current.set(savedParent.id, {
            request: savedParent,
            expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
          });
        }
        if (savedContinuation) {
          optimisticRequestOverridesRef.current.set(savedContinuation.id, {
            request: savedContinuation,
            expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
          });
        }
        setError('');
      })
      .catch(err => {
        optimisticRequestOverridesRef.current.delete(requestId);
        if (updatedContinuation) {
          optimisticRequestOverridesRef.current.delete(updatedContinuation.id);
        }
        boardProjectionSignatureRef.current = '';
        requestMetaSignatureRef.current = '';
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setEventCycleStateMap(previousCycleStateMap);
        setReturnTransitByRequestId(previousReturnTransitByRequestId);
        setError(err?.message || 'Failed to update return-to-yard link.');
      })
      .finally(() => {
        if (updatedContinuation) {
          setRouteLoading(updatedContinuation.id, false, 'primary');
        }
      });
  }, [allRequests, dayEvents, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, projectRequestsToBoard, requestMetaMap, returnTransitByRequestId, selectedDate, setRouteLoading]);

  const handleReturnTransitToggle = useCallback((event) => {
    const requestId = selectedScheduleEventId || selectedScheduleEventIds[0] || '';
    setReturnTransitForRequest(requestId, event.target.checked);
  }, [selectedScheduleEventId, selectedScheduleEventIds, setReturnTransitForRequest]);

  const handleTollsToggle = useCallback((event) => {
    const requestId = selectedScheduleEventId || selectedScheduleEventIds[0] || '';
    if (!requestId) {
      return;
    }
    const storageKey = getTollStorageKey(requestId, selectedScheduleSegment === 'return' ? 'return' : 'primary');
    const checked = event.target.checked;
    setTollsByRequestId(current => {
      const next = { ...(current || {}) };
      if (checked) {
        next[storageKey] = true;
      } else {
        delete next[storageKey];
      }
      return next;
    });
  }, [selectedScheduleEventId, selectedScheduleEventIds, selectedScheduleSegment]);

  useEffect(() => {
    if (scaleAnchorRef.current == null || !boardScrollRef.current) {
      return;
    }
    const ratio = scaleAnchorRef.current;
    const node = boardScrollRef.current;
    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
      node.scrollLeft = ratio * maxScroll;
      scaleAnchorRef.current = null;
    });
  }, [timelineScaleMode]);

  useEffect(() => {
    if (!tileMenu) {
      return undefined;
    }
    const close = () => {
      setTileMenu(null);
      setManualTimeModal(null);
      setServiceTimeModal(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [tileMenu]);

  const updateSelectionFromBox = useCallback((boxRect) => {
    if (!boardBodyRef.current) {
      return;
    }
    const nodes = Array.from(boardBodyRef.current.querySelectorAll('.ts2-event-wrap[data-order-id]'));
    const nextIds = nodes
      .filter(node => intersectRects(boxRect, node.getBoundingClientRect()))
      .map(node => node.getAttribute('data-order-id'))
      .filter(Boolean);
    setSelectedScheduleEventIds(current => {
      if (current.length === nextIds.length && current.every((value, index) => value === nextIds[index])) {
        return current;
      }
      return nextIds;
    });
    if (nextIds.length > 0) {
      setSelectedScheduleEventId(current => (nextIds.includes(current) ? current : nextIds[0]));
    }
  }, []);

  const finishSelectionBox = useCallback(() => {
    const state = selectionStateRef.current;
    selectionStateRef.current = null;
    setSelectionBox(null);
    if (!state?.active) {
      return;
    }
    if (selectedScheduleEventIds.length === 0) {
      setSelectedScheduleEventId('');
    }
  }, [selectedScheduleEventIds.length]);

  useEffect(() => {
    const handleMove = (event) => {
      const state = selectionStateRef.current;
      if (!state) {
        return;
      }
      const width = Math.abs(event.clientX - state.startClientX);
      const height = Math.abs(event.clientY - state.startClientY);
      if (!state.active && Math.max(width, height) < 6) {
        return;
      }
      if (!boardBodyRef.current) {
        return;
      }
      const bodyRect = boardBodyRef.current.getBoundingClientRect();
      state.active = true;
      const left = Math.max(bodyRect.left, Math.min(state.startClientX, event.clientX));
      const top = Math.max(bodyRect.top, Math.min(state.startClientY, event.clientY));
      const right = Math.min(bodyRect.right, Math.max(state.startClientX, event.clientX));
      const bottom = Math.min(bodyRect.bottom, Math.max(state.startClientY, event.clientY));
      const boxRect = { left, top, right, bottom };
      setSelectionBox({
        left: left - bodyRect.left,
        top: top - bodyRect.top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      });
      updateSelectionFromBox(boxRect);
    };

    const handleUp = () => {
      finishSelectionBox();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [finishSelectionBox, updateSelectionFromBox]);

  useEffect(() => {
    const query = secondaryRouteModal?.destination?.trim() || '';
    if (!secondaryRouteModal || secondaryRouteModal.selectedAddressSourceId || query.length < 3) {
      setSecondaryAddressSuggestions([]);
      setSecondaryAddressLoading(false);
      return undefined;
    }

    const normalizedQuery = query.toLowerCase();
    const localMatches = (secondaryRouteModal.addressOptions || [])
      .filter(option => {
        const address = (option.siteLocation || '').toLowerCase();
        const label = (option.label || '').toLowerCase();
        return address.includes(normalizedQuery) || label.includes(normalizedQuery);
      })
      .map(option => ({
        id: `${option.source || 'local'}-${option.id}`,
        label: option.displayLabel || option.label,
        address: option.siteLocation,
        source: option.source === 'pending' ? 'Pending request' : 'Saved project',
        linkedRequestId: option.source === 'pending' ? option.id : '',
        linkedRequestLabel: option.source === 'pending' ? (option.displayLabel || option.label) : '',
        linkedRequestSiteLocation: option.source === 'pending' ? option.siteLocation : '',
      }))
      .slice(0, 4);

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSecondaryAddressLoading(true);
      analysisAPI.addressSuggestions(query, { signal: controller.signal })
        .then(remoteResults => {
          const remoteMatches = (Array.isArray(remoteResults) ? remoteResults : [])
            .map((item, index) => ({
              id: `tomtom-${item.address || item.label || index}`,
              label: item.label || item.address,
              address: item.address || item.label,
              source: 'TomTom',
            }))
            .filter(item => item.address);
          const seen = new Set();
          const merged = [...localMatches, ...remoteMatches].filter(item => {
            const key = item.address.trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setSecondaryAddressSuggestions(merged.slice(0, 6));
        })
        .catch(error => {
          if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') {
            setSecondaryAddressSuggestions(localMatches);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSecondaryAddressLoading(false);
          }
        });
    }, 250);

    setSecondaryAddressSuggestions(localMatches);
    setSecondaryAddressLoading(localMatches.length === 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [secondaryRouteModal?.addressOptions, secondaryRouteModal?.destination, secondaryRouteModal?.selectedAddressSourceId]);

  const timelineMarkers = useMemo(() => buildTimelineMarkers(timelineScaleMode), [timelineScaleMode]);
  const timelineWidth = useMemo(() => getTimelineWidth(timelineScaleMode), [timelineScaleMode]);
  const timelineScaleIndex = Math.max(0, SCALE_ORDER.indexOf(timelineScaleMode));
  const timelineSnapStep = snapToTimeMarks
    ? SCALE_MODES[timelineScaleMode]?.tickMinutes || DRAG_SCHEDULE_MINUTE_STEP
    : DRAG_SCHEDULE_MINUTE_STEP;
  const scheduleNow = debugMode ? debugNow : new Date();
  const pendingRequests = useMemo(
    () => allRequests.filter(request =>
      !request.scheduledDate
      && !request.archivedAt
      && (!isSecondaryRouteRequest(request) || isLinkedSecondaryMaterialOrderRequest(request))
    ),
    [allRequests],
  );
  const selectedScheduleEventIdSet = useMemo(
    () => new Set(selectedScheduleEventIds),
    [selectedScheduleEventIds],
  );
  const tileMenuRequest = tileMenu
    ? requestMetaMap[tileMenu.orderId] || allRequests.find(request => request.id === tileMenu.orderId) || null
    : null;
  const tileMenuSelectionIds = useMemo(() => {
    if (!tileMenu?.orderId) {
      return [];
    }
    if (tileMenu.segment === 'return') {
      return [tileMenu.orderId];
    }
    if (selectedScheduleEventIdSet.has(tileMenu.orderId) && selectedScheduleEventIds.length > 1) {
      return selectedScheduleEventIds;
    }
    return [tileMenu.orderId];
  }, [selectedScheduleEventIdSet, selectedScheduleEventIds, tileMenu]);
  const tileMenuIsReturnSegment = tileMenu?.segment === 'return';
  const tileMenuIsDeleteOnlySecondaryRoute = isSecondaryRouteRequest(tileMenuRequest)
    && !isLinkedSecondaryMaterialOrderRequest(tileMenuRequest);
  const tileMenuIsCompletedMaterialOrder = isCompletedMaterialOrderRequest(
    tileMenuRequest,
    tileMenu?.orderId ? eventCycleStateMap[tileMenu.orderId] : null,
  );
  const tileMenuIsDeleteOnly = !tileMenuIsReturnSegment && (
    tileMenuIsDeleteOnlySecondaryRoute || (tileMenuIsCompletedMaterialOrder && !debugMode)
  );
  const tileMenuCanEditService = Boolean(tileMenuRequest)
    && !tileMenuIsReturnSegment
    && !(tileMenuIsCompletedMaterialOrder && !debugMode);
  const tileMenuServiceLabel = tileMenu?.segment === 'secondary' || isSecondaryRouteRequest(tileMenuRequest)
    ? 'Set service time'
    : 'Set unload time';
  const groupedEventsByTruck = useMemo(
    () => visibleTruckLanes.map(lane => dayEvents.filter(event => event.truckId === lane.id)),
    [dayEvents, visibleTruckLanes],
  );
  const clearSelectedScheduleEvents = useCallback(() => {
    setSelectedScheduleEventIds([]);
    setSelectionBox(null);
    setScheduleInspectorOpen(false);
  }, []);
  useEffect(() => {
    if (selectedScheduleEventId && dayEvents.some(event => event.orderId === selectedScheduleEventId)) {
      return;
    }
    setSelectedScheduleEventId(dayEvents[0]?.orderId || '');
  }, [dayEvents, selectedScheduleEventId]);
  useEffect(() => {
    setSelectedScheduleEventIds(current => current.filter(orderId => dayEvents.some(event => event.orderId === orderId)));
  }, [dayEvents]);
  useEffect(() => {
    if (selectedScheduleEventIds.length === 0) {
      setScheduleInspectorOpen(false);
    }
  }, [selectedScheduleEventIds.length]);
  const handleSelectScheduleEvent = useCallback((orderId, segment = 'primary', options = {}) => {
    const additive = Boolean(options.additive);
    if (additive) {
      const nextSelectedIds = selectedScheduleEventIds.includes(orderId)
        ? selectedScheduleEventIds.filter(id => id !== orderId)
        : [...selectedScheduleEventIds, orderId];
      setSelectedScheduleEventId(orderId);
      setSelectedScheduleEventIds(nextSelectedIds);
      setSelectedScheduleSegment(segment);
      if (nextSelectedIds.length === 0) {
        setScheduleInspectorOpen(false);
      }
      return;
    }

    setSelectedScheduleEventId(orderId);
    setSelectedScheduleEventIds([orderId]);
    setSelectedScheduleSegment(segment);
    setScheduleInspectorOpen(true);
  }, [selectedScheduleEventIds]);
  const getScheduleChainOrderIds = useCallback((orderId) => {
    const visibleIds = new Set(dayEvents.map(event => event.orderId));
    if (!orderId || !visibleIds.has(orderId)) {
      return orderId ? [orderId] : [];
    }
    const requestLookup = new Map(allRequests.map(request => [request.id, request]));
    Object.entries(requestMetaMap).forEach(([requestId, request]) => {
      if (request) {
        requestLookup.set(requestId, request);
      }
    });
    const adjacency = new Map(Array.from(visibleIds).map(id => [id, new Set()]));
    const link = (leftId, rightId) => {
      if (!leftId || !rightId || leftId === rightId || !adjacency.has(leftId) || !adjacency.has(rightId)) {
        return;
      }
      adjacency.get(leftId).add(rightId);
      adjacency.get(rightId).add(leftId);
    };

    visibleIds.forEach(visibleId => {
      const request = requestLookup.get(visibleId);
      if (request?.sourceOrderId) {
        link(visibleId, request.sourceOrderId);
      }
      const cycleState = eventCycleStateMap[visibleId];
      if (cycleState?.followsPreviousRun) {
        link(visibleId, cycleState.routeFromRequestId || cycleState.runSourceOrderId);
      }
    });

    const visited = new Set([orderId]);
    const stack = [orderId];
    while (stack.length) {
      const currentId = stack.pop();
      adjacency.get(currentId)?.forEach(nextId => {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          stack.push(nextId);
        }
      });
    }

    return dayEvents
      .filter(event => visited.has(event.orderId))
      .sort((left, right) => {
        const leftStart = eventStartMinutesMap[left.orderId] ?? left.hour * 60 + left.minute;
        const rightStart = eventStartMinutesMap[right.orderId] ?? right.hour * 60 + right.minute;
        if (left.truckId !== right.truckId) {
          return left.truckId.localeCompare(right.truckId);
        }
        return leftStart - rightStart;
      })
      .map(event => event.orderId);
  }, [allRequests, dayEvents, eventCycleStateMap, eventStartMinutesMap, requestMetaMap]);
  const handleSelectScheduleChain = useCallback((orderId, segment = 'primary') => {
    const chainIds = getScheduleChainOrderIds(orderId);
    if (!chainIds.length) {
      return;
    }
    setTileMenu(null);
    setManualTimeModal(null);
    setSelectedScheduleEventId(chainIds.includes(orderId) ? orderId : chainIds[0]);
    setSelectedScheduleEventIds(chainIds);
    setSelectedScheduleSegment(segment);
    setScheduleInspectorOpen(true);
  }, [getScheduleChainOrderIds]);
  const selectedScheduleChainOutlines = useMemo(() => {
    if (selectedScheduleEventIds.length <= 1) {
      return [];
    }
    const selectedIds = new Set(selectedScheduleEventIds);
    return visibleTruckLanes
      .map(lane => {
        const selectedLaneEvents = dayEvents.filter(event => event.truckId === lane.id && selectedIds.has(event.orderId));
        if (!selectedLaneEvents.length) {
          return null;
        }
        const starts = selectedLaneEvents.map(event => eventStartMinutesMap[event.orderId] ?? event.hour * 60 + event.minute);
        const ends = selectedLaneEvents.map((event, index) => starts[index] + (eventDurationMinutesMap[event.orderId] ?? 90));
        const startMinutes = Math.min(...starts);
        const endMinutes = Math.max(...ends);
        return {
          truckId: lane.id,
          startMinutes,
          durationMinutes: Math.max(1, endMinutes - startMinutes),
        };
      })
      .filter(Boolean);
  }, [dayEvents, eventDurationMinutesMap, eventStartMinutesMap, selectedScheduleEventIds, visibleTruckLanes]);
  useEffect(() => {
    if (!selectedScheduleEventIds.length) {
      return undefined;
    }

    const handlePointerDownOutsideSelection = (event) => {
      if (event.button !== 0) {
        return;
      }
      if (
        event.target.closest('.ts2-event-wrap')
        || event.target.closest('.transport-tile-menu')
        || event.target.closest('.transport-schedule-inspector')
        || event.target.closest('.ts2-modal-root')
      ) {
        return;
      }
      clearSelectedScheduleEvents();
    };

    document.addEventListener('pointerdown', handlePointerDownOutsideSelection, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutsideSelection, true);
    };
  }, [clearSelectedScheduleEvents, selectedScheduleEventIds.length]);
  const selectedScheduleEvent = useMemo(
    () => dayEvents.find(event => event.orderId === selectedScheduleEventId) || dayEvents[0] || null,
    [dayEvents, selectedScheduleEventId],
  );
  const selectedScheduleRequest = selectedScheduleEvent ? requestMetaMap[selectedScheduleEvent.orderId] : null;
  const selectedScheduleIsReturnSegment = selectedScheduleSegment === 'return' && Boolean(selectedScheduleRequest);
  const selectedSchedulePrimaryTollsEnabled = selectedScheduleRequest ? getTollsEnabled(selectedScheduleRequest.id, 'primary') : false;
  const selectedScheduleReturnTollsEnabled = selectedScheduleRequest ? getTollsEnabled(selectedScheduleRequest.id, 'return') : false;
  const selectedScheduleTollsEnabled = selectedScheduleRequest
    ? getTollsEnabled(selectedScheduleRequest.id, selectedScheduleIsReturnSegment ? 'return' : 'primary')
    : false;
  const selectedScheduleCycleState = selectedScheduleEvent ? eventCycleStateMap[selectedScheduleEvent.orderId] : null;
  const selectedScheduleEffectiveStatus = getEffectiveDeliveryStatus(selectedScheduleRequest, selectedScheduleCycleState);
  const selectedDebugStatus = selectedScheduleRequest?.deliveryStatus || 'scheduled';
  const selectedScheduleSiteLocation = selectedScheduleRequest ? requestSiteLocationMap[selectedScheduleRequest.id] : '';
  const selectedScheduleRouteSchedule = useMemo(
    () => applyRouteMode(buildRouteScheduleFromEvent(selectedScheduleEvent), selectedSchedulePrimaryTollsEnabled),
    [selectedScheduleEvent?.date, selectedScheduleEvent?.hour, selectedScheduleEvent?.minute, selectedSchedulePrimaryTollsEnabled],
  );
  const selectedSchedulePrimaryRouteEstimate = selectedScheduleRequest
    ? isSecondaryRouteRequest(selectedScheduleRequest)
      ? null
      : getCachedRouteEstimateBetweenValue(
          getConnectedParentSegment(selectedScheduleRequest) === 'return'
            ? YARD_LOCATION
            : getConnectedRouteOrigin(
                selectedScheduleCycleState,
                requestSiteLocationMap,
                [],
                requestMetaMap,
                selectedScheduleRequest,
              ) || YARD_LOCATION,
          selectedScheduleSiteLocation,
          selectedScheduleRouteSchedule,
        ) ?? null
    : null;
  const selectedScheduleSecondaryRoute = selectedScheduleRequest?.secondaryRoute || null;
  const selectedScheduleIsStandaloneSecondary = isSecondaryRouteRequest(selectedScheduleRequest);
  const selectedScheduleIsSecondarySegment = !selectedScheduleIsReturnSegment && (
    selectedScheduleIsStandaloneSecondary || (selectedScheduleSegment === 'secondary' && Boolean(selectedScheduleSecondaryRoute))
  );
  const selectedScheduleHasSecondaryContinuation = Boolean(
    selectedScheduleCycleState?.hasSecondaryContinuation,
  );
  const selectedScheduleHasReturnTransitContinuation = Boolean(
    selectedScheduleCycleState?.hasReturnTransitContinuation,
  );
  const selectedScheduleReturnRouteSchedule = useMemo(() => {
    if (!selectedScheduleEvent || !selectedScheduleRequest) {
      return {};
    }

    const start = eventStartMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleEvent.hour * 60 + selectedScheduleEvent.minute;
    const fallbackPrimaryMinutes = getRequestDeliveryHandoffMinutes(selectedScheduleRequest, selectedSchedulePrimaryRouteEstimate);
    const primaryMinutes = eventPrimaryDurationMinutesMap[selectedScheduleEvent.orderId] ?? fallbackPrimaryMinutes;
    const departure = getDateAtScheduleMinutes(selectedScheduleEvent.date, start + Math.max(0, primaryMinutes || 0));
    return applyRouteMode({
      scheduledDate: formatDateKey(departure),
      scheduledHour: departure.getHours(),
      scheduledMinute: departure.getMinutes(),
    }, selectedScheduleReturnTollsEnabled);
  }, [
    eventPrimaryDurationMinutesMap,
    eventStartMinutesMap,
    selectedScheduleEvent,
    selectedSchedulePrimaryRouteEstimate,
    selectedScheduleRequest,
    selectedScheduleReturnTollsEnabled,
  ]);
  const selectedScheduleSecondaryRouteSchedule = useMemo(() => {
    if (!selectedScheduleEvent || !selectedScheduleSecondaryRoute) {
      return {};
    }

    if (selectedScheduleIsStandaloneSecondary) {
      return selectedScheduleRouteSchedule;
    }

    const start = eventStartMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleEvent.hour * 60 + selectedScheduleEvent.minute;
    const primaryMinutes = getPrimaryPhaseMinutes(
      selectedSchedulePrimaryRouteEstimate,
      selectedScheduleSecondaryRoute,
      getRequestServiceMinutes(selectedScheduleRequest),
    );
    const departureMinutes = start + primaryMinutes;
    return {
      scheduledDate: selectedScheduleEvent.date,
      scheduledHour: Math.floor(departureMinutes / 60),
      scheduledMinute: Math.floor(departureMinutes % 60),
    };
  }, [
    eventStartMinutesMap,
    selectedScheduleEvent,
    selectedScheduleIsStandaloneSecondary,
    selectedSchedulePrimaryRouteEstimate,
    selectedScheduleRequest,
    selectedScheduleRouteSchedule,
    selectedScheduleSecondaryRoute,
  ]);
  const selectedScheduleRouteContext = useMemo(() => {
    if (selectedScheduleIsReturnSegment) {
      const fromLocation = getReturnRouteOrigin(selectedScheduleRequest, requestSiteLocationMap, []);
      return {
        segment: 'return',
        fromLocation,
        toLocation: YARD_LOCATION,
        siteLocation: YARD_LOCATION,
        schedule: selectedScheduleReturnRouteSchedule,
        title: 'Selected Return to Yard',
      };
    }

    const context = buildRequestRouteContext(
      selectedScheduleRequest,
      selectedScheduleEvent,
      requestSiteLocationMap,
      [],
      selectedScheduleTollsEnabled,
      selectedScheduleIsSecondarySegment ? 'secondary' : 'primary',
      {
        cycleState: selectedScheduleCycleState,
        requestLookup: requestMetaMap,
      },
    );
    return selectedScheduleIsSecondarySegment
      ? { ...context, schedule: applyRouteMode(selectedScheduleSecondaryRouteSchedule, selectedScheduleTollsEnabled) }
      : context;
  }, [
    requestSiteLocationMap,
    selectedScheduleEvent,
    selectedScheduleCycleState,
    selectedScheduleIsReturnSegment,
    selectedScheduleIsSecondarySegment,
    selectedScheduleRequest,
    selectedScheduleRouteSchedule,
    selectedScheduleReturnRouteSchedule,
    selectedScheduleSecondaryRoute,
    selectedScheduleSecondaryRouteSchedule,
    selectedScheduleTollsEnabled,
    requestMetaMap,
  ]);
  const selectedScheduleRouteKey = useMemo(
    () => [
      selectedScheduleRouteContext.segment,
      selectedScheduleRouteContext.fromLocation || '',
      selectedScheduleRouteContext.toLocation || '',
      selectedScheduleRouteContext.schedule.scheduledDate || '',
      selectedScheduleRouteContext.schedule.scheduledHour ?? '',
      selectedScheduleRouteContext.schedule.scheduledMinute ?? '',
      selectedScheduleRouteContext.schedule.enableTolls ? 'tolls' : 'no-tolls',
    ].join('|'),
    [
      selectedScheduleRouteContext,
    ],
  );
  const selectedScheduleContextRouteEstimate = useMemo(
    () => getCachedRouteEstimateForContext(selectedScheduleRouteContext)
      || (selectedScheduleRouteDataKeyRef.current === selectedScheduleRouteKey ? buildEstimateFromRouteData(selectedScheduleRouteData) : null),
    [selectedScheduleRouteContext, selectedScheduleRouteData, selectedScheduleRouteKey],
  );
  const selectedScheduleOutboundEstimate = selectedScheduleIsReturnSegment
    ? selectedSchedulePrimaryRouteEstimate
    : selectedScheduleContextRouteEstimate;
  const selectedScheduleReturnEstimate = selectedScheduleIsReturnSegment
    ? selectedScheduleContextRouteEstimate
    : selectedScheduleReturnRouteEstimate;
  const selectedScheduleSecondaryTimingEstimate = useMemo(
    () => selectedScheduleIsStandaloneSecondary
      ? buildSecondaryRouteTimingEstimate(selectedScheduleOutboundEstimate, selectedScheduleReturnEstimate)
      : null,
    [selectedScheduleIsStandaloneSecondary, selectedScheduleOutboundEstimate, selectedScheduleReturnEstimate],
  );
  const selectedSchedulePrimaryTimingEstimate = useMemo(
    () => !selectedScheduleIsStandaloneSecondary
      ? buildPrimaryRouteTimingEstimate(selectedScheduleOutboundEstimate || selectedSchedulePrimaryRouteEstimate, selectedScheduleReturnEstimate)
      : null,
    [selectedScheduleIsStandaloneSecondary, selectedScheduleOutboundEstimate, selectedSchedulePrimaryRouteEstimate, selectedScheduleReturnEstimate],
  );
  const selectedScheduleReturnTransitEnabled = getReturnTransitEnabled(selectedScheduleEventId);
  const selectedScheduleEffectiveReturnTransit = selectedScheduleReturnTransitEnabled
    && (
      selectedScheduleIsReturnSegment
      || (!selectedScheduleHasSecondaryContinuation && !selectedScheduleHasReturnTransitContinuation)
    );
  const selectedScheduleReturnTransitToggleActive = selectedScheduleReturnTransitEnabled
    && !selectedScheduleHasSecondaryContinuation;
  const selectedScheduleCanToggleReturnTransit = Boolean(selectedScheduleRequest)
    && (selectedScheduleIsReturnSegment || !selectedScheduleHasReturnTransitContinuation);
  const selectedSchedulePrimaryTimingSource = selectedSchedulePrimaryTimingEstimate || selectedScheduleOutboundEstimate || selectedSchedulePrimaryRouteEstimate;
  const selectedScheduleTiming = selectedScheduleRequest
    ? isSecondaryRouteRequest(selectedScheduleRequest)
      ? getSecondaryRouteTiming(selectedScheduleRequest.secondaryRoute, selectedScheduleEffectiveReturnTransit, selectedScheduleSecondaryTimingEstimate)
      : !selectedScheduleEffectiveReturnTransit
        ? removeReturnLegFromTiming(applyReturnEstimateToTiming(
          getTimingProfile(selectedSchedulePrimaryTimingSource, null, getRequestServiceMinutes(selectedScheduleRequest)),
          selectedScheduleRouteContext.segment === 'secondary' ? selectedSchedulePrimaryRouteEstimate : null,
        ))
        : applyReturnEstimateToTiming(
          getTimingProfile(selectedSchedulePrimaryTimingSource, null, getRequestServiceMinutes(selectedScheduleRequest)),
          selectedScheduleRouteContext.segment === 'secondary' ? selectedSchedulePrimaryRouteEstimate : null,
        )
    : null;
  const selectedScheduleActualTiming = useMemo(() => {
    if (!selectedScheduleRequest) {
      return null;
    }
    const travelMinutes = getActualDurationMinutes(
      selectedScheduleRequest.deliveryStartedAt,
      selectedScheduleRequest.deliveryUnloadingAt,
    );
    const unloadMinutes = getActualDurationMinutes(
      selectedScheduleRequest.deliveryUnloadingAt,
      selectedScheduleRequest.deliveryConfirmedAt,
    );
    const hasActualTiming =
      selectedScheduleRequest.deliveryStartedAt ||
      selectedScheduleRequest.deliveryUnloadingAt ||
      selectedScheduleRequest.deliveryConfirmedAt;

    if (!hasActualTiming) {
      return null;
    }

    return {
      travelMinutes,
      unloadMinutes,
      startedAt: formatActionTimestamp(selectedScheduleRequest.deliveryStartedAt),
      unloadingAt: formatActionTimestamp(selectedScheduleRequest.deliveryUnloadingAt),
      confirmedAt: formatActionTimestamp(selectedScheduleRequest.deliveryConfirmedAt),
    };
  }, [selectedScheduleRequest]);
  const snapDebugLines = useMemo(() => {
    if (!snapDebugInfo) {
      return ['No snap activity yet. Drag a tile over a return-to-yard segment.'];
    }
    return [
      `source=${snapDebugInfo.source}`,
      `drag=${snapDebugInfo.dragRequestId || 'none'}`,
      `target=${snapDebugInfo.targetOrderId || 'none'}`,
      `pointer=${formatDebugMinutes(snapDebugInfo.probeMinutes)}`,
      `returnEnabled=${snapDebugInfo.returnEnabled ? 'yes' : 'no'}`,
      `hasSecondary=${snapDebugInfo.hasSecondaryContinuation ? 'yes' : 'no'}`,
      `hasReturnLink=${snapDebugInfo.hasReturnTransitContinuation ? 'yes' : 'no'}`,
      `onReturnCard=${snapDebugInfo.directlyOnReturnCard ? 'yes' : 'no'}`,
      `overReturnTime=${snapDebugInfo.pointerOverReturnTime ? 'yes' : 'no'}`,
      `returnWindow=${formatDebugMinutes(snapDebugInfo.returnStart)}-${formatDebugMinutes(snapDebugInfo.existingEnd)}`,
      `generic=${snapDebugInfo.genericSide || 'none'}:${snapDebugInfo.genericSegment || 'none'}@${formatDebugMinutes(snapDebugInfo.genericMinutes)}`,
      `chosen=${snapDebugInfo.chosenSource || 'none'}:${snapDebugInfo.chosenSide || 'none'}@${formatDebugMinutes(snapDebugInfo.chosenMinutes)}`,
      `linkTo=${snapDebugInfo.linkToRequestId || 'none'}`,
      `segment=${snapDebugInfo.linkSegment || 'none'}`,
      `blocked=${snapDebugInfo.blocked ? 'yes' : 'no'}`,
    ];
  }, [snapDebugInfo]);
  const selectedScheduleActionRows = getDeliveryActionRows(selectedScheduleRequest);
  const selectedScheduleWindowLabel = useMemo(() => {
    if (!selectedScheduleEvent) return 'No delivery selected';
    const startMinutes = (eventStartMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleEvent.hour * 60 + selectedScheduleEvent.minute);
    if (selectedScheduleIsReturnSegment) {
      const totalDuration = eventDurationMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleTiming?.totalMinutes ?? 90;
      const primaryDuration = eventPrimaryDurationMinutesMap[selectedScheduleEvent.orderId] ?? Math.max(0, totalDuration - (selectedScheduleTiming?.returnMinutes || 0));
      const returnStart = startMinutes + primaryDuration;
      const returnEnd = startMinutes + totalDuration;
      return `${formatTimeChip(Math.floor(returnStart / 60), Math.floor(returnStart % 60))} - ${formatTimeChip(Math.floor(returnEnd / 60), Math.floor(returnEnd % 60))}`;
    }
    if (selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute) {
      if (selectedScheduleIsStandaloneSecondary) {
        const secondaryEnd = startMinutes + (selectedScheduleTiming?.transitMinutes || 0) + (selectedScheduleTiming?.loadingMinutes || 0);
        return `${formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} - ${formatTimeChip(Math.floor(secondaryEnd / 60), Math.floor(secondaryEnd % 60))}`;
      }
      const secondaryStart = startMinutes + getPrimaryPhaseMinutes(
        selectedSchedulePrimaryRouteEstimate,
        selectedScheduleSecondaryRoute,
        getRequestServiceMinutes(selectedScheduleRequest),
      );
      const secondaryDuration = Math.max(
        1,
        Math.round((selectedScheduleSecondaryRoute.travelDurationSeconds || 0) / 60)
        + Math.max(0, Number(selectedScheduleSecondaryRoute.serviceMinutes) || 0),
      );
      const secondaryEnd = secondaryStart + secondaryDuration;
      return `${formatTimeChip(Math.floor(secondaryStart / 60), Math.floor(secondaryStart % 60))} - ${formatTimeChip(Math.floor(secondaryEnd / 60), Math.floor(secondaryEnd % 60))}`;
    }
    const durationMinutes = selectedScheduleTiming?.totalMinutes
      ?? eventPrimaryDurationMinutesMap[selectedScheduleEvent.orderId]
      ?? eventDurationMinutesMap[selectedScheduleEvent.orderId]
      ?? 90;
    const endMinutes = startMinutes + durationMinutes;
    return `${formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} - ${formatTimeChip(Math.floor(endMinutes / 60), Math.floor(endMinutes % 60))}`;
  }, [
    eventDurationMinutesMap,
    eventPrimaryDurationMinutesMap,
    eventStartMinutesMap,
    selectedScheduleEvent,
    selectedScheduleIsStandaloneSecondary,
    selectedScheduleIsReturnSegment,
    selectedScheduleIsSecondarySegment,
    selectedSchedulePrimaryRouteEstimate,
    selectedScheduleRequest,
    selectedScheduleSecondaryRoute,
    selectedScheduleTiming?.loadingMinutes,
    selectedScheduleTiming?.returnMinutes,
    selectedScheduleTiming?.transitMinutes,
    selectedScheduleTiming?.totalMinutes,
  ]);
  useEffect(() => {
    if (
      !scheduleInspectorOpen ||
      !selectedScheduleEventId ||
      !selectedScheduleRouteContext.toLocation ||
      ((selectedScheduleRouteContext.segment === 'secondary' || selectedScheduleRouteContext.segment === 'return') && !selectedScheduleRouteContext.fromLocation)
    ) {
      selectedScheduleRouteRequestKeyRef.current = '';
      selectedScheduleRouteDataKeyRef.current = '';
      setSelectedScheduleRouteData(null);
      setSelectedScheduleReturnRouteEstimate(null);
      setSelectedScheduleRouteLoading(false);
      return undefined;
    }

    let active = true;
    const routeKey = selectedScheduleRouteKey;
    const shouldResolveSelectedReturn = selectedScheduleRouteContext.segment !== 'return' && selectedScheduleEffectiveReturnTransit && (
      selectedScheduleIsStandaloneSecondary || !selectedScheduleRequest?.secondaryRoute
    );
    if (selectedScheduleRouteDataKeyRef.current === routeKey && (!shouldResolveSelectedReturn || selectedScheduleReturnRouteEstimate)) {
      setSelectedScheduleRouteLoading(false);
      return undefined;
    }

    selectedScheduleRouteRequestKeyRef.current = routeKey;
    setSelectedScheduleRouteLoading(true);
    setSelectedScheduleReturnRouteEstimate(null);

    const routeRequest = fetchRouteDataForContext(selectedScheduleRouteContext);

    routeRequest
      .then(async data => {
        let returnEstimate = null;
        if (shouldResolveSelectedReturn) {
          const outboundEstimate = getCachedRouteEstimateForContext(selectedScheduleRouteContext)
            || (data ? buildEstimateFromRouteData(data) : null);
          if (outboundEstimate) {
            const returnSchedule = applyRouteMode(selectedScheduleIsStandaloneSecondary
              ? buildSecondaryRouteReturnSchedule({
                schedule: selectedScheduleRouteContext.schedule,
                secondaryRoute: selectedScheduleSecondaryRoute,
              }, outboundEstimate)
              : buildPrimaryRouteReturnSchedule({
                schedule: selectedScheduleRouteContext.schedule,
                request: selectedScheduleRequest,
              }, outboundEstimate), selectedScheduleReturnTollsEnabled);
            returnEstimate = await getCachedRouteEstimateBetween(selectedScheduleRouteContext.toLocation, YARD_LOCATION, returnSchedule);
          }
        }
        if (active && selectedScheduleRouteRequestKeyRef.current === routeKey) {
          selectedScheduleRouteDataKeyRef.current = data ? routeKey : '';
          setSelectedScheduleRouteData(data);
          setSelectedScheduleReturnRouteEstimate(returnEstimate || null);
        }
      })
      .catch(() => {
        if (active && selectedScheduleRouteRequestKeyRef.current === routeKey) {
          selectedScheduleRouteDataKeyRef.current = '';
          setSelectedScheduleRouteData(null);
          setSelectedScheduleReturnRouteEstimate(null);
        }
      })
      .finally(() => {
        if (active && selectedScheduleRouteRequestKeyRef.current === routeKey) {
          setSelectedScheduleRouteLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [scheduleInspectorOpen, selectedScheduleEffectiveReturnTransit, selectedScheduleEventId, selectedScheduleIsStandaloneSecondary, selectedScheduleRequest, selectedScheduleReturnRouteEstimate, selectedScheduleReturnTollsEnabled, selectedScheduleRouteContext, selectedScheduleRouteKey, selectedScheduleSecondaryRoute]);
  const selectedRouteDurationMinutes = useMemo(() => {
    const requestModalReturnTransitEnabled = getReturnTransitEnabled(requestModal?.request?.id);
    if (isSecondaryRouteRequest(requestModal?.request)) {
      return Math.max(30, getSecondaryRouteTiming(
        requestModal.request.secondaryRoute,
        requestModalReturnTransitEnabled,
        buildSecondaryRouteTimingEstimate(selectedRouteEstimate, selectedReturnRouteEstimate),
      ).totalMinutes || 90);
    }
    const timing = applyReturnEstimateToTiming(
      getTimingProfile(
        selectedRouteEstimate,
        requestModal?.request?.secondaryRoute || null,
        getRequestServiceMinutes(requestModal?.request),
      ),
      requestModal?.routeContext?.segment === 'secondary' ? selectedReturnRouteEstimate : null,
    );
    const preferredTiming = requestModalReturnTransitEnabled ? timing : removeReturnLegFromTiming(timing);
    return Math.max(30, preferredTiming.totalMinutes || 90);
  }, [getReturnTransitEnabled, requestModal?.request, requestModal?.routeContext?.segment, selectedReturnRouteEstimate, selectedRouteEstimate]);
  const selectedScheduleTrafficCopy = useMemo(
    () => getTrafficPanelCopy(selectedScheduleRouteData, selectedScheduleRouteLoading),
    [selectedScheduleRouteData, selectedScheduleRouteLoading],
  );
  const selectedScheduleTravelTrafficDelayMinutes = selectedScheduleRouteData
    ? getTrafficDelayMinutesFromRouteData(selectedScheduleRouteData)
    : getTrafficDelayMinutes(selectedScheduleContextRouteEstimate);
  const requestModalSummary = useMemo(
    () => buildEstimateSummary(
      selectedDate,
      selectedHour,
      selectedMinute,
      selectedRouteEstimate,
      Boolean(requestModal?.siteLocation),
      requestModal?.request?.secondaryRoute || null,
      getReturnTransitEnabled(requestModal?.request?.id),
      requestModal?.routeContext?.segment === 'secondary' ? selectedReturnRouteEstimate : null,
      getRequestServiceMinutes(requestModal?.request),
    ),
    [getReturnTransitEnabled, requestModal?.request, requestModal?.routeContext?.segment, requestModal?.siteLocation, selectedDate, selectedHour, selectedMinute, selectedReturnRouteEstimate, selectedRouteEstimate],
  );
  const requestModalActionRows = useMemo(() => getDeliveryActionRows(requestModal?.request), [requestModal]);

  const debugTimeValue = useMemo(() => {
    const minutes = debugNow.getHours() * 60 + debugNow.getMinutes();
    return formatManualTimeInput(minutes);
  }, [debugNow]);

  const handleDebugTimeChange = useCallback((event) => {
    const minutes = parseManualScheduleTime(event.target.value);
    if (minutes == null) {
      return;
    }
    const next = new Date(selectedDate);
    next.setHours(Math.floor(minutes / 60), minutes % 60, debugNow.getSeconds(), 0);
    setDebugNowMs(next.getTime());
  }, [debugNow, selectedDate]);

  const resetDebugClock = useCallback(() => {
    const now = new Date();
    const next = isSameDay(now, selectedDate)
      ? now
      : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), SCREEN_START_HOUR, 0, 0, 0);
    setDebugNowMs(next.getTime());
  }, [selectedDate]);

  const updateDebugDeliveryStatus = useCallback((status) => {
    if (!selectedScheduleRequest?.id) {
      return;
    }
    const requestId = selectedScheduleRequest.id;
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;
    const stamp = debugNow.toISOString();
    const startedAt = status === 'scheduled'
      ? null
      : selectedScheduleRequest.deliveryStartedAt || stamp;
    const unloadingAt = status === 'unloading' || status === 'return_transit'
      ? selectedScheduleRequest.deliveryUnloadingAt || stamp
      : null;
    const confirmedAt = status === 'return_transit' ? stamp : null;
    const isSecondaryStatusRoute = isSecondaryRouteRequest(selectedScheduleRequest);
    const shouldArchiveOnComplete = status === 'return_transit' && !isSecondaryStatusRoute;
    const updatedRequest = {
      ...selectedScheduleRequest,
      deliveryStatus: status,
      deliveryStartedAt: startedAt,
      deliveryUnloadingAt: unloadingAt,
      deliveryConfirmedAt: confirmedAt,
      archivedAt: isSecondaryStatusRoute ? null : shouldArchiveOnComplete ? selectedScheduleRequest.archivedAt || stamp : selectedScheduleRequest.archivedAt,
    };
    const nextRequests = previousRequests.map(item => item.id === requestId ? updatedRequest : item);
    setDebugStatusSavingId(requestId);
    setAllRequests(nextRequests);
    setRequestMetaMap(current => ({ ...current, [requestId]: updatedRequest }));
    optimisticRequestOverridesRef.current.set(requestId, {
      request: updatedRequest,
      expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
    });
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });

    materialOrderRequestsAPI.updateDeliveryStatus(requestId, {
      status,
      startedAt,
      unloadingAt,
      confirmedAt,
    })
      .then(() => {
        setError('');
      })
      .catch(err => {
        optimisticRequestOverridesRef.current.delete(requestId);
        boardProjectionSignatureRef.current = '';
        requestMetaSignatureRef.current = '';
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setEventCycleStateMap(previousCycleStateMap);
        setError(err?.message || 'Failed to apply debug delivery status.');
      })
      .finally(() => {
        setDebugStatusSavingId('');
      });
  }, [
    allRequests,
    dayEvents,
    debugNow,
    eventCycleStateMap,
    eventDurationMinutesMap,
    eventPrimaryDurationMinutesMap,
    eventStartMinutesMap,
    projectRequestsToBoard,
    requestMetaMap,
    selectedDate,
    selectedScheduleRequest,
  ]);

  useEffect(() => {
    if (!requestModal?.request) {
      setSelectedRouteEstimate(null);
      setSelectedReturnRouteEstimate(null);
      setRequestModalRouteData(null);
      setRequestModalRouteLoading(false);
      return undefined;
    }

    let active = true;
    const requestTollsEnabled = getTollsEnabled(requestModal.request.id, 'primary');
    const requestReturnTollsEnabled = getTollsEnabled(requestModal.request.id, 'return');
    const schedule = {
      scheduledDate: formatDateKey(selectedDate),
      scheduledHour: selectedHour,
      scheduledMinute: selectedMinute,
      enableTolls: requestTollsEnabled,
    };
    const baseContext = requestModal.routeContext || buildRequestRouteContext(
      requestModal.request,
      {
        date: formatDateKey(selectedDate),
        hour: selectedHour,
        minute: selectedMinute,
      },
      requestSiteLocationMap,
      [],
      requestTollsEnabled,
      isSecondaryRouteRequest(requestModal.request) ? 'secondary' : 'primary',
      {
        cycleState: eventCycleStateMap[requestModal.request.id] || null,
        requestLookup: requestMetaMap,
      },
    );
    const routeContext = {
      ...baseContext,
      schedule,
    };

    if (!routeContext.toLocation || (routeContext.segment === 'secondary' && !routeContext.fromLocation)) {
      setSelectedRouteEstimate(null);
      setSelectedReturnRouteEstimate(null);
      setRequestModalRouteData(null);
      setRequestModalRouteLoading(false);
      return undefined;
    }

    setRequestModalRouteLoading(true);
    Promise.all([
      Promise.resolve(getCachedRouteEstimateForContext(routeContext)),
      fetchRouteDataForContext(routeContext),
    ])
      .then(async ([estimate, routeData]) => {
        if (!active) {
          return;
        }
        const outboundEstimate = estimate || (routeData ? buildEstimateFromRouteData(routeData) : null);
        const returnEstimate = routeContext.segment === 'secondary' && outboundEstimate
          ? await getCachedRouteEstimateBetween(
            routeContext.toLocation,
            YARD_LOCATION,
            applyRouteMode(buildSecondaryRouteReturnSchedule({
              schedule: routeContext.schedule,
              secondaryRoute: requestModal.request?.secondaryRoute,
            }, outboundEstimate), requestReturnTollsEnabled),
          )
          : null;
        if (!active) {
          return;
        }
        setSelectedRouteEstimate(outboundEstimate);
        setSelectedReturnRouteEstimate(returnEstimate || null);
        setRequestModalRouteData(routeData);
      })
      .finally(() => {
        if (active) {
          setRequestModalRouteLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [eventCycleStateMap, getTollsEnabled, requestMetaMap, requestModal, requestSiteLocationMap, selectedDate, selectedHour, selectedMinute]);
  const setTimelineScaleWithAnchor = useCallback((nextMode) => {
    if (!SCALE_MODES[nextMode]) {
      return;
    }
    if (boardScrollRef.current) {
      const node = boardScrollRef.current;
      const maxScroll = Math.max(1, node.scrollWidth - node.clientWidth);
      scaleAnchorRef.current = node.scrollLeft / maxScroll;
    }
    setTimelineScaleMode(nextMode);
  }, []);
  const overviewActionRows = useMemo(() => getDeliveryActionRows(eventOverviewModal?.request), [eventOverviewModal]);
  const overviewSummary = useMemo(() => {
    if (!eventOverviewModal?.request) {
      return null;
    }
    return buildEstimateSummary(
      new Date(`${eventOverviewModal.event.date}T00:00:00`),
      eventOverviewModal.event.hour,
      eventOverviewModal.event.minute,
      eventOverviewModal.routeEstimate,
      Boolean(eventOverviewModal.siteLocation),
      eventOverviewModal.request.secondaryRoute || null,
      getReturnTransitEnabled(eventOverviewModal.event?.orderId),
      eventOverviewModal.returnRouteEstimate || null,
      getRequestServiceMinutes(eventOverviewModal.request),
    );
  }, [eventOverviewModal, getReturnTransitEnabled]);
  const manualTimeEvent = useMemo(
    () => manualTimeModal ? dayEvents.find(event => event.orderId === manualTimeModal.requestId) || null : null,
    [dayEvents, manualTimeModal],
  );
  const manualTimeRequest = manualTimeEvent ? requestMetaMap[manualTimeEvent.orderId] : null;
  const serviceTimeEvent = useMemo(
    () => serviceTimeModal ? dayEvents.find(event => event.orderId === serviceTimeModal.requestId) || null : null,
    [dayEvents, serviceTimeModal],
  );
  const serviceTimeRequest = serviceTimeEvent ? requestMetaMap[serviceTimeEvent.orderId] : null;

  const openRequestModal = useCallback(async requestId => {
    setRequestModalLoading(true);
    setRequestModal(null);
    setSelectedRouteEstimate(null);
    setSelectedReturnRouteEstimate(null);
    setRequestModalRouteData(null);
    setRequestModalRouteLoading(false);
    const request = allRequests.find(item => item.id === requestId) ?? await materialOrderRequestsAPI.getRequest(requestId);
    if (!request) {
      setRequestModalLoading(false);
      return;
    }
    const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
    const nextTruckId = request.scheduledTruckId ?? request.truckId ?? selectedTruckId ?? TRUCK_LANES[0].id;
    let nextHour = selectedHour;
    let nextMinute = selectedMinute;
    setSelectedTruckId(nextTruckId);
    if (typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number') {
      nextHour = request.scheduledHour;
      nextMinute = request.scheduledMinute;
    } else {
      const suggested = getSuggestedStartTime({
        truckId: nextTruckId,
        selectedDate,
        dayEvents,
        startMap: eventStartMinutesMap,
        durationMap: eventDurationMinutesMap,
      });
      nextHour = suggested.hour;
      nextMinute = suggested.minute;
    }
    setSelectedHour(nextHour);
    setSelectedMinute(nextMinute);
    const routeContext = buildRequestRouteContext(
      request,
      {
        date: formatDateKey(selectedDate),
        hour: nextHour,
        minute: nextMinute,
      },
      requestSiteLocationMap,
      builders,
      getTollsEnabled(request.id, 'primary'),
      isSecondaryRouteRequest(request) ? 'secondary' : 'primary',
      {
        cycleState: eventCycleStateMap[request.id] || null,
        requestLookup: requestMetaMap,
      },
    );
    setRequestModal({ request, siteLocation: routeContext.siteLocation, routeContext });
    setRequestModalLoading(false);
  }, [allRequests, dayEvents, eventCycleStateMap, eventDurationMinutesMap, eventStartMinutesMap, getTollsEnabled, requestMetaMap, requestSiteLocationMap, selectedDate, selectedHour, selectedMinute, selectedTruckId]);

  const closeRequestModal = useCallback(() => {
    setRequestModal(null);
    setRequestModalLoading(false);
    setSelectedRouteEstimate(null);
    setSelectedReturnRouteEstimate(null);
    setRequestModalRouteData(null);
    setRequestModalRouteLoading(false);
    setTimePickerVisible(false);
  }, []);

  const openEventOverview = useCallback(async event => {
    setEventOverviewLoading(true);
    setEventOverviewModal(null);
    setEventOverviewRouteData(null);
    const request = requestMetaMap[event.orderId] ?? await materialOrderRequestsAPI.getRequest(event.orderId);
    if (!request) {
      setEventOverviewLoading(false);
      return;
    }
    const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
    const routeContext = buildRequestRouteContext(
      request,
      event,
      requestSiteLocationMap,
      builders,
      getTollsEnabled(request.id, 'primary'),
      isSecondaryRouteRequest(request) ? 'secondary' : 'primary',
      {
        cycleState: eventCycleStateMap[event.orderId] || null,
        requestLookup: requestMetaMap,
      },
    );
    const siteLocation = routeContext.siteLocation;
    const routeEstimate = getCachedRouteEstimateForContext(routeContext);
    const returnTollsEnabled = getTollsEnabled(request.id, 'return');
    const returnRouteEstimate = routeContext.segment === 'secondary' && routeEstimate
      ? getCachedRouteEstimateBetweenValue(
        routeContext.toLocation,
        YARD_LOCATION,
        applyRouteMode(buildSecondaryRouteReturnSchedule({
          schedule: routeContext.schedule,
          secondaryRoute: request.secondaryRoute,
        }, routeEstimate), returnTollsEnabled),
      ) ?? null
      : null;
    const cycleState = eventCycleStateMap[event.orderId] ?? null;
    const modalState = { event, request, siteLocation, routeEstimate, returnRouteEstimate, cycleState, routeContext };
    setEventOverviewModal(modalState);
    setEventOverviewLoading(false);
    if (routeContext.toLocation && ((routeContext.segment !== 'secondary' && routeContext.segment !== 'return') || routeContext.fromLocation)) {
      setEventOverviewRouteLoading(true);
      fetchRouteDataForContext(routeContext)
        .then(async data => {
          const outboundEstimate = routeEstimate || (data ? buildEstimateFromRouteData(data) : null);
          const resolvedReturnEstimate = routeContext.segment === 'secondary' && outboundEstimate
            ? await getCachedRouteEstimateBetween(
              routeContext.toLocation,
              YARD_LOCATION,
              applyRouteMode(buildSecondaryRouteReturnSchedule({
                schedule: routeContext.schedule,
                secondaryRoute: request.secondaryRoute,
              }, outboundEstimate), returnTollsEnabled),
            )
            : null;
          setEventOverviewRouteData(data);
          if (data || resolvedReturnEstimate) {
            setEventOverviewModal(current => current ? {
              ...current,
              routeEstimate: current.routeEstimate || outboundEstimate,
              returnRouteEstimate: current.returnRouteEstimate || resolvedReturnEstimate || null,
            } : current);
          }
        })
        .finally(() => setEventOverviewRouteLoading(false));
    }
  }, [eventCycleStateMap, getTollsEnabled, requestMetaMap, requestSiteLocationMap]);

  const closeEventOverview = useCallback(() => {
    setEventOverviewModal(null);
    setEventOverviewLoading(false);
    setEventOverviewRouteLoading(false);
    setEventOverviewRouteData(null);
  }, []);

  const handleSchedule = useCallback(() => {
    if (!requestModal?.request || !selectedTruckId) {
      return;
    }
    const scheduleDateIso = buildScheduleIso(formatDateKey(selectedDate), selectedHour, selectedMinute);
    if (!scheduleDateIso || new Date(scheduleDateIso).getTime() <= Date.now()) {
      window.alert('Please choose a future time for this delivery.');
      return;
    }
    const collision = getScheduleCollision({
      requestId: requestModal.request.id,
      truckId: selectedTruckId,
      startMinutes: selectedHour * 60 + selectedMinute,
      durationMinutes: selectedRouteDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
    });
    if (collision) {
      const message = getCollisionMessage(collision, eventStartMinutesMap, eventDurationMinutesMap);
      setError(message);
      window.alert(message);
      return;
    }
    setScheduleSaving(true);
    const requestId = requestModal.request.id;
    const truck = TRUCK_LANES.find(lane => lane.id === selectedTruckId);
    const dateKey = formatDateKey(selectedDate);
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;
    const updatedRequest = {
      ...requestModal.request,
      scheduledDate: dateKey,
      scheduledHour: selectedHour,
      scheduledMinute: selectedMinute,
      scheduledAtIso: scheduleDateIso,
      scheduledTruckId: truck?.id ?? selectedTruckId,
      scheduledTruckLabel: truck?.rego ?? null,
      truckId: truck?.id ?? selectedTruckId,
      truckLabel: truck?.rego ?? null,
      deliveryStatus: 'scheduled',
      deliveryStartedAt: null,
      deliveryUnloadingAt: null,
      deliveryConfirmedAt: null,
    };
    const nextRequests = previousRequests.some(item => item.id === requestId)
      ? previousRequests.map(item => item.id === requestId ? updatedRequest : item)
      : dedupeRequests([...previousRequests, updatedRequest]);
    setAllRequests(nextRequests);
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
    setSelectedScheduleEventId(requestId);
    setSelectedScheduleEventIds([requestId]);
    setScheduleInspectorOpen(true);
    closeRequestModal();
    optimisticRequestOverridesRef.current.set(requestId, {
      request: updatedRequest,
      expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
    });

    materialOrderRequestsAPI.setSchedule(requestId, {
        date: formatDateKey(selectedDate),
        hour: selectedHour,
        minute: selectedMinute,
        truckId: truck?.id ?? selectedTruckId,
        truckLabel: truck?.rego ?? requestModal.request.scheduledTruckLabel ?? null,
      })
      .then(() => {
        setError('');
      })
      .catch(err => {
        optimisticRequestOverridesRef.current.delete(requestId);
        boardProjectionSignatureRef.current = '';
        requestMetaSignatureRef.current = '';
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setEventCycleStateMap(previousCycleStateMap);
        setError(err?.message || 'Failed to schedule request.');
      })
      .finally(() => {
        setScheduleSaving(false);
      });
  }, [allRequests, closeRequestModal, dayEvents, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, projectRequestsToBoard, requestMetaMap, requestModal, selectedDate, selectedHour, selectedMinute, selectedRouteDurationMinutes, selectedTruckId]);

  const scheduleRequestAt = useCallback((requestId, truckId, startMinutes, durationMinutes = 90, options = {}) => {
    if (!requestId || !truckId) {
      return;
    }
    const roundedStart = options.exact
      ? Math.round(startMinutes)
      : roundScheduleMinutes(startMinutes, options.step || DRAG_SCHEDULE_MINUTE_STEP);
    const safeMinutes = clampScheduleMinutes(roundedStart, durationMinutes);
    const hour = Math.floor(safeMinutes / 60);
    const minute = safeMinutes % 60;
    const truck = TRUCK_LANES.find(lane => lane.id === truckId);
    const dateKey = formatDateKey(selectedDate);
    const collision = getScheduleCollision({
      requestId,
      truckId: truck?.id ?? truckId,
      startMinutes: safeMinutes,
      durationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
    });
    if (collision) {
      setError(getCollisionMessage(collision, eventStartMinutesMap, eventDurationMinutesMap));
      setDropPreview(null);
      return;
    }
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;
    const sourceRequest = allRequests.find(item => item.id === requestId) || requestMetaMap[requestId] || null;
    const shouldBreakRunLinks = Boolean(options.breakRunLinks);
    const directContinuationRequests = shouldBreakRunLinks
      ? allRequests.filter(item => item.id !== requestId && item.sourceOrderId === requestId && !item.archivedAt)
      : [];
    const directContinuationIds = new Set(directContinuationRequests.map(item => item.id));
    const requestedSourceOrderId = options.linkToRequestId || null;
    const requestedSourceRequest = requestedSourceOrderId
      ? allRequests.find(item => item.id === requestedSourceOrderId) || requestMetaMap[requestedSourceOrderId] || null
      : null;
    const nextSourceOrderId = requestedSourceRequest
      ? requestedSourceOrderId
      : null;
    const nextConnectedParentSegment = nextSourceOrderId
      ? options.linkToSegment === 'return' ? 'return' : 'primary'
      : null;
    const shouldUpdateRunLink = shouldBreakRunLinks || Boolean(nextSourceOrderId);
    const sourceAfterRunBreak = shouldBreakRunLinks ? breakRequestRunLink(sourceRequest) : sourceRequest;
    const runBreakSiteLocationPatch = {};
    if (shouldBreakRunLinks) {
      const movedSiteLocation = getRunBreakSiteLocation(sourceRequest);
      if (movedSiteLocation) {
        runBreakSiteLocationPatch[requestId] = movedSiteLocation;
      }
      directContinuationRequests.forEach(continuationRequest => {
        const continuationSiteLocation = getRunBreakSiteLocation(continuationRequest);
        if (continuationSiteLocation) {
          runBreakSiteLocationPatch[continuationRequest.id] = continuationSiteLocation;
        }
      });
    }
    const moveSiteLocationMap = Object.keys(runBreakSiteLocationPatch).length
      ? mergeRequestSiteLocationMap(runBreakSiteLocationPatch)
      : requestSiteLocationMapRef.current;
    const updatedRequest = sourceRequest ? {
      ...sourceAfterRunBreak,
      ...(shouldUpdateRunLink ? {
        sourceOrderId: nextSourceOrderId,
        connectedParentStartMinutes: nextSourceOrderId ? safeMinutes : null,
        connectedParentSegment: nextConnectedParentSegment,
      } : {}),
      scheduledDate: dateKey,
      scheduledHour: hour,
      scheduledMinute: minute,
      scheduledAtIso: buildScheduleIso(dateKey, hour, minute),
      scheduledTruckId: truck?.id ?? truckId,
      scheduledTruckLabel: truck?.rego ?? null,
      truckId: truck?.id ?? truckId,
      truckLabel: truck?.rego ?? null,
      deliveryStatus: 'scheduled',
      deliveryStartedAt: null,
      deliveryUnloadingAt: null,
      deliveryConfirmedAt: null,
    } : null;

    if (updatedRequest) {
      const nextRequests = previousRequests.some(item => item.id === requestId)
        ? previousRequests.map(item => {
          if (item.id === requestId) {
            return updatedRequest;
          }
          if (directContinuationIds.has(item.id)) {
            return breakRequestRunLink(item);
          }
          return item;
        })
        : dedupeRequests([...previousRequests, updatedRequest]);
      const routeRefreshIds = [
        requestId,
        ...Array.from(directContinuationIds),
      ].filter(id => {
        const routeRequest = nextRequests.find(item => item.id === id);
        return Boolean(routeRequest);
      });
      setAllRequests(nextRequests);
      projectRequestsToBoard(nextRequests, moveSiteLocationMap, selectedDate, { force: true });
      if (routeRefreshIds.length > 0) {
        const activeRouteLoadingSegments = new Map();
        (async () => {
          const loadingStartedAt = Date.now();
          let nextSiteLocationMap = moveSiteLocationMap;
          const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
          const requestLookup = new Map(nextRequests.map(request => [request.id, request]));
          await Promise.all(routeRefreshIds.map(async routeRequestId => {
            const routeRequest = requestLookup.get(routeRequestId);
            if (!routeRequest) {
              return;
            }
            let siteLocation = nextSiteLocationMap[routeRequestId] || '';
            if (!siteLocation) {
              siteLocation = findProjectLocation(builders, routeRequest);
              if (siteLocation) {
                nextSiteLocationMap = mergeRequestSiteLocationMap({ [routeRequestId]: siteLocation });
              }
            }
            if (!siteLocation && !isSecondaryRouteRequest(routeRequest)) {
              return;
            }
            const routeContext = getBoardRouteContextForRequest(routeRequest, requestLookup, nextSiteLocationMap, selectedDate, getTollsEnabled, returnTransitByRequestId);
            if (getCachedBoardRouteEstimate(routeContext) === undefined) {
              const loadingSegment = getBoardRouteLoadingSegment(routeContext) || 'primary';
              activeRouteLoadingSegments.set(routeRequestId, loadingSegment);
              setRouteLoading(routeRequestId, true, loadingSegment);
              await resolveBoardRouteEstimate(routeContext);
            }
          }));
          projectRequestsToBoard(nextRequests, nextSiteLocationMap, selectedDate, { force: true });
          const remainingLoadingMs = ROUTE_LOADING_MIN_MS - (Date.now() - loadingStartedAt);
          if (remainingLoadingMs > 0) {
            await new Promise(resolve => window.setTimeout(resolve, remainingLoadingMs));
          }
        })()
          .catch(() => {})
          .finally(() => {
            activeRouteLoadingSegments.forEach((segment, id) => setRouteLoading(id, false, segment));
          });
      }
    }

    setSelectedScheduleEventId(requestId);
    clearSelectedScheduleEvents();
    setScheduleInspectorOpen(true);
    setDraggedRequestId('');
    setDraggedScheduledOrderId('');
    setDragPreviewDurationMinutes(90);
    dragPointerOffsetMinutesRef.current = 0;
    setDropPreview(null);
    if (updatedRequest) {
      optimisticRequestOverridesRef.current.set(requestId, {
        request: updatedRequest,
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
      directContinuationIds.forEach(continuationId => {
        const continuationRequest = allRequests.find(item => item.id === continuationId) || requestMetaMap[continuationId] || null;
        if (continuationRequest) {
          optimisticRequestOverridesRef.current.set(continuationId, {
            request: breakRequestRunLink(continuationRequest),
            expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
          });
        }
      });
    }

    materialOrderRequestsAPI.setSchedule(requestId, {
        date: formatDateKey(selectedDate),
        hour,
        minute,
        truckId: truck?.id ?? truckId,
        truckLabel: truck?.rego ?? null,
        clearRunLink: shouldUpdateRunLink,
        sourceOrderId: nextSourceOrderId,
        connectedParentStartMinutes: nextSourceOrderId ? safeMinutes : null,
        connectedParentSegment: nextConnectedParentSegment,
      })
      .then(() => Array.from(directContinuationIds).reduce(
        (promise, continuationId) => promise.then(() => materialOrderRequestsAPI.clearRunLink(continuationId)),
        Promise.resolve(),
      ))
      .then(() => {
        setError('');
      })
      .catch(err => {
        optimisticRequestOverridesRef.current.delete(requestId);
        directContinuationIds.forEach(continuationId => optimisticRequestOverridesRef.current.delete(continuationId));
        boardProjectionSignatureRef.current = '';
        requestMetaSignatureRef.current = '';
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setEventCycleStateMap(previousCycleStateMap);
        setError(err?.message || 'Failed to schedule request.');
      });
  }, [allRequests, clearSelectedScheduleEvents, dayEvents, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, getReturnTransitEnabled, getTollsEnabled, mergeRequestSiteLocationMap, projectRequestsToBoard, requestMetaMap, returnTransitByRequestId, selectedDate, setRouteLoading]);

  const getProjectedDurationForGroupMove = useCallback((request, startMinutes, dateKey, fallbackDurationMinutes = 90) => {
    if (!request) {
      return fallbackDurationMinutes;
    }
    const cycleState = eventCycleStateMap[request.id] || null;
    const includeReturnTransitToYard = getReturnTransitEnabled(request.id)
      && !cycleState?.hasSecondaryContinuation;
    if (isSecondaryRouteRequest(request)) {
      const secondaryRoute = request.secondaryRoute || {};
      const schedule = {
        scheduledDate: dateKey,
        scheduledHour: Math.floor(startMinutes / 60),
        scheduledMinute: Math.round(startMinutes % 60),
        enableTolls: getTollsEnabled(request.id, 'primary'),
      };
      const secondaryStartLocation = getConnectedParentSegment(request) === 'return' ? YARD_LOCATION : secondaryRoute.startingLocation;
      const outboundEstimate = secondaryStartLocation && secondaryRoute.destination
        ? getCachedRouteEstimateBetweenValue(secondaryStartLocation, secondaryRoute.destination, schedule)
        : null;
      if (outboundEstimate === undefined) {
        return Math.max(30, Math.round(fallbackDurationMinutes || eventDurationMinutesMap[request.id] || 90));
      }
      const returnSchedule = applyRouteMode(
        buildSecondaryRouteReturnSchedule({ schedule, secondaryRoute }, outboundEstimate),
        getTollsEnabled(request.id, 'return'),
      );
      const returnEstimate = includeReturnTransitToYard && outboundEstimate
        ? getCachedRouteEstimateBetweenValue(secondaryRoute.destination, YARD_LOCATION, returnSchedule)
        : null;
      if (returnEstimate === undefined) {
        return Math.max(30, Math.round(fallbackDurationMinutes || eventDurationMinutesMap[request.id] || 90));
      }
      return getSecondaryRouteTiming(
        secondaryRoute,
        includeReturnTransitToYard,
        buildSecondaryRouteTimingEstimate(outboundEstimate, returnEstimate),
      ).totalMinutes;
    }

    const siteLocation = requestSiteLocationMapRef.current[request.id] || '';
    const schedule = {
      scheduledDate: dateKey,
      scheduledHour: Math.floor(startMinutes / 60),
      scheduledMinute: Math.round(startMinutes % 60),
      enableTolls: getTollsEnabled(request.id, 'primary'),
    };
    const estimate = siteLocation ? getCachedRouteEstimateBetweenValue(YARD_LOCATION, siteLocation, schedule) : null;
    if (estimate === undefined) {
      return Math.max(30, Math.round(fallbackDurationMinutes || eventDurationMinutesMap[request.id] || 90));
    }
    let routeEstimate = estimate;
    if (includeReturnTransitToYard && estimate && !request.secondaryRoute) {
      const returnSchedule = applyRouteMode(
        buildPrimaryRouteReturnSchedule({ schedule, request }, estimate),
        getTollsEnabled(request.id, 'return'),
      );
      const returnEstimate = getCachedRouteEstimateBetweenValue(siteLocation, YARD_LOCATION, returnSchedule);
      if (returnEstimate === undefined) {
        return Math.max(30, Math.round(fallbackDurationMinutes || eventDurationMinutesMap[request.id] || 90));
      }
      routeEstimate = buildPrimaryRouteTimingEstimate(estimate, returnEstimate);
    }
    const timing = getTimingProfile(routeEstimate, null, getRequestServiceMinutes(request));
    return (includeReturnTransitToYard ? timing : removeReturnLegFromTiming(timing)).totalMinutes;
  }, [eventCycleStateMap, eventDurationMinutesMap, getReturnTransitEnabled, getTollsEnabled]);

  const createScheduleSelectionContext = useCallback((anchorOrderId, selectionIds = []) => {
    const ids = Array.from(new Set([anchorOrderId, ...(selectionIds || [])].filter(Boolean)));
    const anchorEvent = dayEvents.find(event => event.orderId === anchorOrderId)
      || dayEvents.find(event => ids.includes(event.orderId));
    if (!anchorEvent) {
      return null;
    }
    const anchorTruckIndex = TRUCK_LANES.findIndex(lane => lane.id === anchorEvent.truckId);
    if (anchorTruckIndex < 0) {
      return null;
    }
    const anchorStartMinutes = eventStartMinutesMap[anchorEvent.orderId] ?? anchorEvent.hour * 60 + anchorEvent.minute;
    return {
      anchorOrderId: anchorEvent.orderId,
      anchorTruckId: anchorEvent.truckId,
      anchorTruckIndex,
      anchorStartMinutes,
      items: ids
        .map(orderId => {
          const sourceEvent = dayEvents.find(item => item.orderId === orderId);
          if (!sourceEvent) {
            return null;
          }
          const sourceTruckIndex = TRUCK_LANES.findIndex(lane => lane.id === sourceEvent.truckId);
          const sourceStartMinutes = eventStartMinutesMap[orderId] ?? sourceEvent.hour * 60 + sourceEvent.minute;
          return {
            orderId,
            truckId: sourceEvent.truckId,
            durationMinutes: eventDurationMinutesMap[orderId] ?? 90,
            minuteOffset: sourceStartMinutes - anchorStartMinutes,
            laneOffset: sourceTruckIndex - anchorTruckIndex,
            sourceStartMinutes,
            sourceEndMinutes: sourceStartMinutes + (eventDurationMinutesMap[orderId] ?? 90),
          };
        })
        .filter(Boolean),
    };
  }, [dayEvents, eventDurationMinutesMap, eventStartMinutesMap]);

  const scheduleRequestGroupAt = useCallback((selectionContext, targetTruckId, anchorMinutes) => {
    if (!selectionContext?.items?.length || !targetTruckId) {
      return;
    }

    const targetTruckIndex = TRUCK_LANES.findIndex(lane => lane.id === targetTruckId);
    if (targetTruckIndex < 0) {
      return;
    }

    const selectedIds = new Set(selectionContext.items.map(item => item.orderId));
    const updates = [];
    let blockedMessage = '';
    const laneState = new Map();
    const orderedItems = [...selectionContext.items].sort((left, right) => {
      const leftLane = targetTruckIndex + left.laneOffset;
      const rightLane = targetTruckIndex + right.laneOffset;
      if (leftLane !== rightLane) {
        return leftLane - rightLane;
      }
      return left.sourceStartMinutes - right.sourceStartMinutes;
    });

    for (const item of orderedItems) {
      const nextTruckIndex = targetTruckIndex + item.laneOffset;
      if (nextTruckIndex < 0 || nextTruckIndex >= TRUCK_LANES.length) {
        blockedMessage = 'Selection cannot be moved outside the available truck lanes.';
        break;
      }
      const nextTruck = TRUCK_LANES[nextTruckIndex];
      const baseStartMinutes = anchorMinutes + item.minuteOffset;
      const previousLaneState = laneState.get(nextTruckIndex);
      const originalGapMinutes = previousLaneState
        ? Math.max(0, item.sourceStartMinutes - previousLaneState.sourceEndMinutes)
        : 0;
      const nextStartMinutes = previousLaneState
        ? previousLaneState.projectedEndMinutes + originalGapMinutes
        : baseStartMinutes;
      const durationForBounds = item.durationMinutes || 90;
      if (clampScheduleMinutes(nextStartMinutes, durationForBounds) !== nextStartMinutes) {
        blockedMessage = 'Selection extends outside the available schedule window.';
        break;
      }
      const request = requestMetaMap[item.orderId] || allRequests.find(entry => entry.id === item.orderId) || null;
      const projectedDurationMinutes = getProjectedDurationForGroupMove(
        request,
        nextStartMinutes,
        formatDateKey(selectedDate),
        item.durationMinutes || 90,
      );
      const collision = getScheduleCollision({
        requestId: item.orderId,
        truckId: nextTruck.id,
        startMinutes: nextStartMinutes,
        durationMinutes: projectedDurationMinutes,
        dayEvents: dayEvents.filter(event => !selectedIds.has(event.orderId)),
        startMap: eventStartMinutesMap,
        durationMap: eventDurationMinutesMap,
      });
      if (collision) {
        blockedMessage = getCollisionMessage(collision, eventStartMinutesMap, eventDurationMinutesMap);
        break;
      }
      updates.push({
        requestId: item.orderId,
        truckId: nextTruck.id,
        truckLabel: nextTruck.rego,
        startMinutes: nextStartMinutes,
        hour: Math.floor(nextStartMinutes / 60),
        minute: nextStartMinutes % 60,
      });
      laneState.set(nextTruckIndex, {
        sourceEndMinutes: item.sourceEndMinutes,
        projectedEndMinutes: nextStartMinutes + projectedDurationMinutes,
      });
    }

    if (blockedMessage) {
      setError(blockedMessage);
      setDropPreview(null);
      setDropPreviewGroup([]);
      return;
    }

    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;
    const dateKey = formatDateKey(selectedDate);
    const nextRequests = allRequests.map(request => {
      const update = updates.find(entry => entry.requestId === request.id);
      if (!update) {
        return request;
      }
      return {
        ...request,
        scheduledDate: dateKey,
        scheduledHour: update.hour,
        scheduledMinute: update.minute,
        scheduledAtIso: buildScheduleIso(dateKey, update.hour, update.minute),
        scheduledTruckId: update.truckId,
        scheduledTruckLabel: update.truckLabel,
        truckId: update.truckId,
        truckLabel: update.truckLabel,
      };
    });

    setAllRequests(nextRequests);
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
    clearSelectedScheduleEvents();
    setSelectedScheduleEventId(selectionContext.anchorOrderId);
    setSelectedScheduleSegment('primary');
    setScheduleInspectorOpen(true);
    setDraggedRequestId('');
    setDraggedScheduledOrderId('');
    setDragPreviewDurationMinutes(90);
    dragPointerOffsetMinutesRef.current = 0;
    setDropPreview(null);
    setDropPreviewGroup([]);
    selectionDragContextRef.current = null;

    updates.forEach(update => {
      const request = nextRequests.find(item => item.id === update.requestId);
      if (request) {
        optimisticRequestOverridesRef.current.set(update.requestId, {
          request,
          expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
        });
      }
    });

    (async () => {
      const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
      let nextSiteLocationMap = requestSiteLocationMapRef.current;
      const requestLookup = new Map(nextRequests.map(request => [request.id, request]));
      await Promise.all(
        updates.map(async update => {
          const request = nextRequests.find(item => item.id === update.requestId);
          if (!request) {
            return;
          }
          let siteLocation = nextSiteLocationMap[update.requestId] || '';
          if (!siteLocation) {
            siteLocation = findProjectLocation(builders, request);
            if (siteLocation) {
              nextSiteLocationMap = mergeRequestSiteLocationMap({ [update.requestId]: siteLocation });
            }
          }
          if (!siteLocation && !isSecondaryRouteRequest(request)) {
            return;
          }
          const routeContext = getBoardRouteContextForRequest(request, requestLookup, nextSiteLocationMap, selectedDate, getTollsEnabled, returnTransitByRequestId);
          if (getCachedBoardRouteEstimate(routeContext) === undefined) {
            await resolveBoardRouteEstimate(routeContext);
          }
        }),
      );
      projectRequestsToBoard(nextRequests, nextSiteLocationMap, selectedDate, { force: true });
    })().catch(() => {});

    Promise.all(
      updates.map(update => materialOrderRequestsAPI.setSchedule(update.requestId, {
        date: dateKey,
        hour: update.hour,
        minute: update.minute,
        truckId: update.truckId,
        truckLabel: update.truckLabel,
      })),
    )
      .then(() => {
        setError('');
      })
      .catch(err => {
        updates.forEach(update => optimisticRequestOverridesRef.current.delete(update.requestId));
        boardProjectionSignatureRef.current = '';
        requestMetaSignatureRef.current = '';
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setEventCycleStateMap(previousCycleStateMap);
        setError(err?.message || 'Failed to move selected deliveries.');
      });
  }, [allRequests, clearSelectedScheduleEvents, dayEvents, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, getProjectedDurationForGroupMove, getTollsEnabled, mergeRequestSiteLocationMap, projectRequestsToBoard, requestMetaMap, returnTransitByRequestId, selectedDate]);

  const openManualScheduleTime = useCallback((requestId, selectionIds = []) => {
    const requestedIds = Array.from(new Set((selectionIds?.length ? selectionIds : [requestId]).filter(Boolean)));
    const selectedEvents = requestedIds
      .map(id => dayEvents.find(event => event.orderId === id))
      .filter(Boolean)
      .sort((left, right) => {
        const leftStart = eventStartMinutesMap[left.orderId] ?? left.hour * 60 + left.minute;
        const rightStart = eventStartMinutesMap[right.orderId] ?? right.hour * 60 + right.minute;
        if (left.truckId !== right.truckId) {
          return left.truckId.localeCompare(right.truckId);
        }
        return leftStart - rightStart;
      });
    const scheduleEvent = selectedEvents[0] || dayEvents.find(event => event.orderId === requestId);
    if (!scheduleEvent) {
      setTileMenu(null);
      return;
    }
    const anchorId = scheduleEvent.orderId;
    const currentStart = eventStartMinutesMap[anchorId] ?? scheduleEvent.hour * 60 + scheduleEvent.minute;
    setServiceTimeModal(null);
    setManualTimeModal({
      requestId: anchorId,
      requestIds: selectedEvents.length ? selectedEvents.map(event => event.orderId) : [anchorId],
      value: formatManualTimeText(currentStart),
      meridiem: getManualTimeMeridiem(currentStart),
      error: '',
    });
  }, [dayEvents, eventStartMinutesMap]);

  const closeManualScheduleTime = useCallback(() => {
    setManualTimeModal(null);
  }, []);

  const openServiceTimeEditor = useCallback((requestId, segment = 'primary') => {
    const request = requestMetaMap[requestId] || allRequests.find(item => item.id === requestId) || null;
    if (!request || segment === 'return') {
      setServiceTimeModal(null);
      return;
    }
    const serviceSegment = segment === 'secondary' || isSecondaryRouteRequest(request) ? 'secondary' : 'primary';
    setManualTimeModal(null);
    setServiceTimeModal({
      requestId,
      segment: serviceSegment,
      value: String(getRequestSegmentServiceMinutes(request, serviceSegment)),
      error: '',
    });
  }, [allRequests, requestMetaMap]);

  const closeServiceTimeEditor = useCallback(() => {
    setServiceTimeModal(null);
  }, []);

  const handleServiceTimeSave = useCallback((event) => {
    event.preventDefault();
    if (!serviceTimeModal?.requestId) {
      return;
    }

    const requestId = serviceTimeModal.requestId;
    const serviceSegment = serviceTimeModal.segment === 'secondary' ? 'secondary' : 'primary';
    const parsedMinutes = Number(serviceTimeModal.value);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes < 0 || parsedMinutes > 240) {
      setServiceTimeModal(current => current ? { ...current, error: 'Enter a service time between 0 and 240 minutes.' } : current);
      return;
    }

    const serviceMinutes = normalizeServiceMinutes(parsedMinutes);
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;
    const targetRequest = requestMetaMap[requestId] || allRequests.find(item => item.id === requestId) || null;
    if (!targetRequest) {
      setServiceTimeModal(null);
      return;
    }

    const updatedRequest = applyServiceMinutesToRequest(targetRequest, serviceMinutes, serviceSegment);
    const nextRequests = allRequests.map(request => request.id === requestId ? updatedRequest : request);
    setServiceTimeModal(null);
    setTileMenu(null);
    setAllRequests(nextRequests);
    setRouteLoading(requestId, true, 'primary');
    optimisticRequestOverridesRef.current.set(requestId, {
      request: updatedRequest,
      expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
    });
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });

    const loadingStartedAt = Date.now();
    materialOrderRequestsAPI.setServiceMinutes(requestId, {
      serviceMinutes,
      segment: serviceSegment,
    })
      .then(savedRequest => {
        const normalizedSavedRequest = savedRequest || updatedRequest;
        optimisticRequestOverridesRef.current.set(requestId, {
          request: normalizedSavedRequest,
          expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
        });
        setError('');
      })
      .catch(err => {
        optimisticRequestOverridesRef.current.delete(requestId);
        boardProjectionSignatureRef.current = '';
        requestMetaSignatureRef.current = '';
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setEventCycleStateMap(previousCycleStateMap);
        setError(err?.message || 'Failed to update service time.');
      })
      .finally(() => {
        const remainingLoadingMs = ROUTE_LOADING_MIN_MS - (Date.now() - loadingStartedAt);
        window.setTimeout(() => setRouteLoading(requestId, false, 'primary'), Math.max(0, remainingLoadingMs));
      });
  }, [
    allRequests,
    dayEvents,
    eventCycleStateMap,
    eventDurationMinutesMap,
    eventPrimaryDurationMinutesMap,
    eventStartMinutesMap,
    projectRequestsToBoard,
    requestMetaMap,
    selectedDate,
    serviceTimeModal,
    setRouteLoading,
  ]);

  const handleManualScheduleTime = useCallback((event) => {
    event.preventDefault();
    if (!manualTimeModal?.requestId) {
      return;
    }
    const requestId = manualTimeModal.requestId;
    const scheduleEvent = dayEvents.find(item => item.orderId === requestId);
    if (!scheduleEvent) {
      setManualTimeModal(null);
      return;
    }
    const selectionIds = manualTimeModal.requestIds?.length ? manualTimeModal.requestIds : [requestId];
    const selectionContext = selectionIds.length > 1
      ? createScheduleSelectionContext(requestId, selectionIds)
      : null;
    const selectionSpanMinutes = selectionContext?.items?.length
      ? selectionContext.items.reduce((max, item) => Math.max(max, item.minuteOffset + (item.durationMinutes || 90)), 0)
      : 0;
    const durationMinutes = eventDurationMinutesMap[requestId] ?? 90;
    const durationForBounds = Math.max(durationMinutes, selectionSpanMinutes || durationMinutes);
    const parsedMinutes = parseManualScheduleEditorTime(manualTimeModal.value, manualTimeModal.meridiem);
    if (parsedMinutes === null) {
      setManualTimeModal(current => current ? { ...current, error: 'Enter a valid time, for example 8:30 or 2:15.' } : current);
      return;
    }
    const earliest = SCREEN_START_HOUR * 60;
    const latest = SCREEN_END_HOUR * 60 - durationForBounds;
    if (parsedMinutes < earliest || parsedMinutes > latest) {
      setManualTimeModal(current => current ? {
        ...current,
        error: `Choose a time between ${formatTimeChip(SCREEN_START_HOUR, 0)} and ${formatTimeChip(Math.floor(latest / 60), latest % 60)}.`,
      } : current);
      return;
    }
    if (selectionContext?.items?.length > 1) {
      setManualTimeModal(null);
      setTileMenu(null);
      scheduleRequestGroupAt(selectionContext, scheduleEvent.truckId, parsedMinutes);
      return;
    }
    const collision = getScheduleCollision({
      requestId,
      truckId: scheduleEvent.truckId,
      startMinutes: parsedMinutes,
      durationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
    });
    if (collision) {
      setManualTimeModal(current => current ? {
        ...current,
        error: getCollisionMessage(collision, eventStartMinutesMap, eventDurationMinutesMap),
      } : current);
      return;
    }
    setManualTimeModal(null);
    setTileMenu(null);
    scheduleRequestAt(requestId, scheduleEvent.truckId, parsedMinutes, durationMinutes, { exact: true });
  }, [createScheduleSelectionContext, dayEvents, eventDurationMinutesMap, eventStartMinutesMap, manualTimeModal, scheduleRequestAt, scheduleRequestGroupAt]);

  const openSecondaryRouteModal = useCallback(async (requestId, segment = 'primary') => {
    const scheduleEvent = dayEvents.find(event => event.orderId === requestId);
    const request = requestMetaMap[requestId] || allRequests.find(item => item.id === requestId) || null;
    if (!scheduleEvent || !request) {
      setTileMenu(null);
      return;
    }

    const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
    const cycleState = eventCycleStateMap[requestId] || null;
    const addAfterReturnSegment = segment === 'return';
    const startsAfterReturnTransit = addAfterReturnSegment && getReturnTransitEnabled(requestId);
    const primarySiteLocation = startsAfterReturnTransit
      ? YARD_LOCATION
      : getRequestSiteLocation(request, requestSiteLocationMap, builders);
    const existingSecondaryContinuation = allRequests.find(item =>
      isSecondaryRouteRequest(item) &&
      item.sourceOrderId === requestId &&
      !item.archivedAt &&
      ((getConnectedParentSegment(item) || 'primary') === (startsAfterReturnTransit ? 'return' : 'primary')) &&
      item.scheduledDate === scheduleEvent.date
    );
    const existingReturnContinuation = !startsAfterReturnTransit
      ? getFirstLinkedContinuation(requestId, allRequests, 'return')
      : null;
    const insertBeforeRequest = existingSecondaryContinuation || existingReturnContinuation || findFollowOnRequestForInsertion(
      requestId,
      scheduleEvent,
      dayEvents,
      requestMetaMap,
      eventCycleStateMap,
      allRequests,
    );
    const projectAddressOptions = (builders || [])
      .flatMap(builder => (builder.projects || []).map(project => ({
        id: `${builder.id || builder.name}:${project.id || project.name}`,
        label: `${builder.name || 'Builder'} - ${project.name || 'Project'}`,
        siteLocation: project.siteLocation || '',
      })))
      .filter(item => item.siteLocation);
    const pendingOptions = pendingRequests
      .filter(item => item.id !== requestId)
      .map(item => {
        const siteLocation = requestSiteLocationMap[item.id] ?? findProjectLocation(builders, item);
        return {
          id: item.id,
          label: `${item.builderName || 'Material Order'} - ${item.projectName || 'Pending request'}`,
          displayLabel: `${item.builderName || 'Material Order'} - ${item.projectName || 'Pending request'}`,
          siteLocation: siteLocation || '',
        };
      })
      .filter(item => item.siteLocation);

    const existingSecondaryRoute = request.secondaryRoute || null;
    setTileMenu(null);
    setSecondaryRouteModal({
      requestId,
      segment: startsAfterReturnTransit ? 'return' : 'primary',
      primarySiteLocation: primarySiteLocation || '',
      startsAfterReturnTransit,
      insertBeforeRequest,
      parentRouteContext: buildRequestRouteContext(
        request,
        scheduleEvent,
        requestSiteLocationMap,
        builders,
        getTollsEnabled(request.id, 'primary'),
        isSecondaryRouteRequest(request) ? 'secondary' : 'primary',
        {
          cycleState,
          requestLookup: requestMetaMap,
        },
      ),
      reason: existingSecondaryRoute?.reason || 'secondary_drop_off',
      destination: existingSecondaryRoute?.destination || '',
      serviceMinutes: String(existingSecondaryRoute?.serviceMinutes || SECONDARY_ROUTE_SERVICE_MINUTES),
      selectedAddressSourceId: '',
      linkedRequestId: existingSecondaryRoute?.linkedRequestId || '',
      linkedRequestLabel: existingSecondaryRoute?.linkedRequestLabel || '',
      linkedRequestSiteLocation: existingSecondaryRoute?.linkedRequestSiteLocation || '',
      pendingOptions,
      addressOptions: [
        ...pendingOptions.map(item => ({ ...item, source: 'pending' })),
        ...projectAddressOptions.map(item => ({ ...item, source: 'project' })),
      ],
      error: '',
    });
  }, [allRequests, dayEvents, eventCycleStateMap, getReturnTransitEnabled, getTollsEnabled, pendingRequests, requestMetaMap, requestSiteLocationMap]);

  const closeSecondaryRouteModal = useCallback(() => {
    if (secondaryRouteSaving) {
      return;
    }
    setSecondaryRouteModal(null);
    setSecondaryAddressSuggestions([]);
    setSecondaryAddressLoading(false);
  }, [secondaryRouteSaving]);

  const handleSecondaryRouteSave = useCallback(async (event) => {
    event.preventDefault();
    if (!secondaryRouteModal?.requestId) {
      return;
    }

    const request = requestMetaMap[secondaryRouteModal.requestId] || allRequests.find(item => item.id === secondaryRouteModal.requestId) || null;
    const scheduleEvent = dayEvents.find(item => item.orderId === secondaryRouteModal.requestId);
    if (!request || !scheduleEvent) {
      setSecondaryRouteModal(current => current ? { ...current, error: 'Scheduled delivery not found.' } : current);
      return;
    }
    if (!secondaryRouteModal.primarySiteLocation) {
      setSecondaryRouteModal(current => current ? { ...current, error: 'Primary site location is missing for this delivery.' } : current);
      return;
    }

    const destination = (secondaryRouteModal.destination || '').trim();
    if (!destination) {
      setSecondaryRouteModal(current => current ? { ...current, error: 'Select or enter the secondary route destination.' } : current);
      return;
    }
    const secondaryServiceMinutes = Math.max(0, Math.round(Number(secondaryRouteModal.serviceMinutes)));
    if (!Number.isFinite(secondaryServiceMinutes) || secondaryServiceMinutes < 0 || secondaryServiceMinutes > 240) {
      setSecondaryRouteModal(current => current ? { ...current, error: 'Enter a service time between 0 and 240 minutes.' } : current);
      return;
    }

    setSecondaryRouteSaving(true);
    try {
      const requestTollsEnabled = getTollsEnabled(request.id, 'primary');
      const requestReturnTollsEnabled = getTollsEnabled(request.id, 'return');
      const parentRouteContext = secondaryRouteModal.parentRouteContext || buildRequestRouteContext(
        request,
        scheduleEvent,
        requestSiteLocationMapRef.current,
        [],
        requestTollsEnabled,
        isSecondaryRouteRequest(request) ? 'secondary' : 'primary',
        {
          cycleState: eventCycleStateMap[request.id] || null,
          requestLookup: requestMetaMap,
        },
      );
      const parentRouteEstimate = getCachedRouteEstimateForContext(parentRouteContext)
        || buildEstimateFromRouteData(await fetchRouteDataForContext(parentRouteContext));
      const primaryPhaseMinutes = getRequestDeliveryHandoffMinutes(request, parentRouteEstimate);
      const startsAfterReturnTransit = secondaryRouteModal.startsAfterReturnTransit === true
        || secondaryRouteModal.segment === 'return';
      let parentTimingEstimate = parentRouteEstimate;
      if (startsAfterReturnTransit && parentRouteEstimate && parentRouteContext.toLocation) {
        const parentReturnSchedule = applyRouteMode(isSecondaryRouteRequest(request)
          ? buildSecondaryRouteReturnSchedule({
            schedule: parentRouteContext.schedule,
            secondaryRoute: request.secondaryRoute,
          }, parentRouteEstimate)
          : buildPrimaryRouteReturnSchedule({
            schedule: parentRouteContext.schedule,
            request,
          }, parentRouteEstimate), requestReturnTollsEnabled);
        const parentReturnEstimate = await getCachedRouteEstimateBetween(parentRouteContext.toLocation, YARD_LOCATION, parentReturnSchedule);
        parentTimingEstimate = isSecondaryRouteRequest(request)
          ? buildSecondaryRouteTimingEstimate(parentRouteEstimate, parentReturnEstimate)
          : buildPrimaryRouteTimingEstimate(parentRouteEstimate, parentReturnEstimate);
      }
      const parentTiming = isSecondaryRouteRequest(request)
        ? getSecondaryRouteTiming(request.secondaryRoute, getReturnTransitEnabled(request.id), parentTimingEstimate)
        : getTimingProfile(parentTimingEstimate, null, getRequestServiceMinutes(request));
      const parentTotalMinutes = Math.max(primaryPhaseMinutes, Math.round(parentTiming.totalMinutes || primaryPhaseMinutes || 0));
      const visibleParentDurationMinutes = eventDurationMinutesMap[request.id] ?? parentTotalMinutes;
      const secondaryDepartureOffsetMinutes = startsAfterReturnTransit
        ? Math.max(primaryPhaseMinutes, Math.round(visibleParentDurationMinutes || parentTotalMinutes))
        : primaryPhaseMinutes;
      const persistedDepartureOffsetMinutes = startsAfterReturnTransit
        ? parentTotalMinutes
        : primaryPhaseMinutes;
      const secondaryRouteStartLocation = startsAfterReturnTransit
        ? YARD_LOCATION
        : secondaryRouteModal.primarySiteLocation;
      const secondaryConnectedParentSegment = startsAfterReturnTransit ? 'return' : 'primary';
      const visibleParentStartMinutes = eventStartMinutesMap[request.id] ?? (scheduleEvent.hour * 60 + scheduleEvent.minute);
      const plannedParentStartMinutes = getRequestScheduledStartMinutes(request, scheduleEvent.hour * 60 + scheduleEvent.minute);
      const visibleBaseStart = getDateAtScheduleMinutes(scheduleEvent.date, visibleParentStartMinutes);
      const plannedBaseStart = getDateAtScheduleMinutes(request.scheduledDate || scheduleEvent.date, plannedParentStartMinutes);
      const outboundDeparture = new Date(visibleBaseStart.getTime() + secondaryDepartureOffsetMinutes * 60 * 1000);
      const persistedSecondaryDeparture = new Date(plannedBaseStart.getTime() + persistedDepartureOffsetMinutes * 60 * 1000);
      const outboundRouteSchedule = {
        scheduledDate: formatDateKey(outboundDeparture),
        scheduledHour: outboundDeparture.getHours(),
        scheduledMinute: outboundDeparture.getMinutes(),
      };
      const persistedSecondarySchedule = {
        scheduledDate: formatDateKey(persistedSecondaryDeparture),
        scheduledHour: persistedSecondaryDeparture.getHours(),
        scheduledMinute: persistedSecondaryDeparture.getMinutes(),
      };
      const outbound = await getCachedRouteDataBetween(
        secondaryRouteStartLocation,
        destination,
        { ...outboundRouteSchedule, enableTolls: requestTollsEnabled },
      );
      if (!outbound) {
        throw new Error('Secondary route could not be calculated for that destination.');
      }

      const returnDeparture = new Date(
        outboundDeparture.getTime()
        + Math.round(outbound.durationSeconds / 60) * 60 * 1000
        + secondaryServiceMinutes * 60 * 1000,
      );
      const returnSchedule = {
        scheduledDate: formatDateKey(returnDeparture),
        scheduledHour: returnDeparture.getHours(),
        scheduledMinute: returnDeparture.getMinutes(),
      };
      const returnRoute = await getCachedRouteDataBetween(destination, YARD_LOCATION, { ...returnSchedule, enableTolls: requestReturnTollsEnabled });
      if (!returnRoute) {
        throw new Error('Return-to-yard timing could not be calculated for that secondary route.');
      }

      const linkedMaterialOrder = secondaryRouteModal.reason === 'material_pick_up' && secondaryRouteModal.linkedRequestId
        ? allRequests.find(item => item.id === secondaryRouteModal.linkedRequestId)
          || (secondaryRouteModal.pendingOptions || []).find(item => item.id === secondaryRouteModal.linkedRequestId)
          || null
        : null;
      const linkedRequestId = linkedMaterialOrder ? linkedMaterialOrder.id : '';
      const linkedRequestLabel = linkedRequestId
        ? secondaryRouteModal.linkedRequestLabel
          || [linkedMaterialOrder.builderName, linkedMaterialOrder.projectName].filter(Boolean).join(' - ')
          || 'Selected material order'
        : '';
      const secondaryRoute = {
        reason: secondaryRouteModal.reason,
        startingLocation: secondaryRouteStartLocation,
        destination,
        label: getSecondaryRouteReasonLabel(secondaryRouteModal.reason),
        linkedRequestId: linkedRequestId || null,
        linkedRequestLabel,
        linkedRequestSiteLocation: linkedRequestId ? (secondaryRouteModal.linkedRequestSiteLocation || destination) : '',
        travelDistanceMeters: outbound.distanceMeters,
        travelDurationSeconds: outbound.durationSeconds,
        travelBaseDurationSeconds: outbound.baseDurationSeconds,
        travelTrafficDelaySeconds: outbound.trafficDelaySeconds,
        travelTrafficProvider: outbound.trafficProvider,
        travelTrafficNote: outbound.trafficNote,
        returnDistanceMeters: returnRoute.distanceMeters,
        returnDurationSeconds: returnRoute.durationSeconds,
        returnBaseDurationSeconds: returnRoute.baseDurationSeconds,
        returnTrafficDelaySeconds: returnRoute.trafficDelaySeconds,
        returnTrafficProvider: returnRoute.trafficProvider,
        returnTrafficNote: returnRoute.trafficNote,
        serviceMinutes: secondaryServiceMinutes,
      };
      const continuationToRelink = !linkedRequestId && secondaryRouteModal.insertBeforeRequest
        ? secondaryRouteModal.insertBeforeRequest
        : null;
      const shouldMoveReturnBreakToSecondary = Boolean(
        !startsAfterReturnTransit
        && getReturnTransitEnabled(request.id)
      );
      let relinkedContinuation = null;
      if (continuationToRelink?.id) {
        const relinkDestination = getRequestSiteLocation(continuationToRelink, requestSiteLocationMapRef.current, []);
        if (relinkDestination) {
          const relinkParentSegment = shouldMoveReturnBreakToSecondary ? 'return' : 'primary';
          const relinkOrigin = shouldMoveReturnBreakToSecondary ? YARD_LOCATION : destination;
          const relinkDeparture = shouldMoveReturnBreakToSecondary
            ? new Date(returnDeparture.getTime() + Math.round(returnRoute.durationSeconds / 60) * 60 * 1000)
            : new Date(
                outboundDeparture.getTime()
                + Math.round(outbound.durationSeconds / 60) * 60 * 1000
                + secondaryServiceMinutes * 60 * 1000,
              );
          const relinkSchedule = {
            scheduledDate: formatDateKey(relinkDeparture),
            scheduledHour: relinkDeparture.getHours(),
            scheduledMinute: relinkDeparture.getMinutes(),
          };
          const relinkOutbound = await getCachedRouteDataBetween(relinkOrigin, relinkDestination, { ...relinkSchedule, enableTolls: getTollsEnabled(continuationToRelink.id) });
          if (!relinkOutbound) {
            throw new Error('Follow-on route could not be recalculated from the external route destination.');
          }
          let relinkReturn = null;
          if (isSecondaryRouteRequest(continuationToRelink)) {
            const relinkReturnDeparture = new Date(
              relinkDeparture.getTime()
              + Math.round(relinkOutbound.durationSeconds / 60) * 60 * 1000
              + Math.max(0, Number(continuationToRelink.secondaryRoute?.serviceMinutes) || 0) * 60 * 1000,
            );
            const relinkReturnSchedule = {
              scheduledDate: formatDateKey(relinkReturnDeparture),
              scheduledHour: relinkReturnDeparture.getHours(),
              scheduledMinute: relinkReturnDeparture.getMinutes(),
            };
            relinkReturn = await getCachedRouteDataBetween(relinkDestination, YARD_LOCATION, { ...relinkReturnSchedule, enableTolls: getTollsEnabled(continuationToRelink.id, 'return') });
            if (!relinkReturn) {
              throw new Error('Follow-on return-to-yard timing could not be recalculated.');
            }
          }
          relinkedContinuation = {
            ...continuationToRelink,
            scheduledDate: relinkSchedule.scheduledDate,
            scheduledHour: relinkSchedule.scheduledHour,
            scheduledMinute: relinkSchedule.scheduledMinute,
            scheduledAtIso: `${relinkSchedule.scheduledDate}T${String(relinkSchedule.scheduledHour).padStart(2, '0')}:${String(relinkSchedule.scheduledMinute).padStart(2, '0')}:00`,
            connectedParentStartMinutes: relinkSchedule.scheduledHour * 60 + relinkSchedule.scheduledMinute,
            connectedParentSegment: relinkParentSegment,
            scheduledTruckId: scheduleEvent.truckId,
            scheduledTruckLabel: scheduleEvent.truckLabel,
            truckId: scheduleEvent.truckId,
            truckLabel: scheduleEvent.truckLabel,
            sourceOrderId: '__pending_external_route__',
            ...(isSecondaryRouteRequest(continuationToRelink) ? { secondaryRoute: {
              ...continuationToRelink.secondaryRoute,
              startingLocation: relinkOrigin,
              destination: relinkDestination,
              travelDistanceMeters: relinkOutbound.distanceMeters,
              travelDurationSeconds: relinkOutbound.durationSeconds,
              travelBaseDurationSeconds: relinkOutbound.baseDurationSeconds,
              travelTrafficDelaySeconds: relinkOutbound.trafficDelaySeconds,
              travelTrafficProvider: relinkOutbound.trafficProvider,
              travelTrafficNote: relinkOutbound.trafficNote,
              returnDistanceMeters: relinkReturn?.distanceMeters || 0,
              returnDurationSeconds: relinkReturn?.durationSeconds || 0,
              returnBaseDurationSeconds: relinkReturn?.baseDurationSeconds || 0,
              returnTrafficDelaySeconds: relinkReturn?.trafficDelaySeconds || 0,
              returnTrafficProvider: relinkReturn?.trafficProvider || '',
              returnTrafficNote: relinkReturn?.trafficNote || '',
            } } : {}),
          };
        }
      }

      const updatedRequest = await materialOrderRequestsAPI.setSecondaryRoute(secondaryRouteModal.requestId, secondaryRoute, {
        ...persistedSecondarySchedule,
        truckId: scheduleEvent.truckId,
        truckLabel: scheduleEvent.truckLabel,
        connectedParentSegment: secondaryConnectedParentSegment,
        relinkedContinuation,
      });
      const chainedUpdatedRequestBase = {
        ...updatedRequest,
        connectedParentStartMinutes: persistedSecondarySchedule.scheduledHour * 60 + persistedSecondarySchedule.scheduledMinute,
        connectedParentSegment: secondaryConnectedParentSegment,
      };
      const chainedUpdatedRequest = shouldMoveReturnBreakToSecondary
        ? applyReturnTransitToRequest(chainedUpdatedRequestBase, true)
        : chainedUpdatedRequestBase;
      const relinkedUpdatedContinuation = relinkedContinuation
        ? {
            ...relinkedContinuation,
            sourceOrderId: chainedUpdatedRequest.id,
          }
        : null;
      const parentRequestBase = isSecondaryRouteRequest(request)
        ? request
        : { ...request, secondaryRoute: null };
      const parentRequest = shouldMoveReturnBreakToSecondary
        ? applyReturnTransitToRequest(parentRequestBase, false)
        : parentRequestBase;
      const nextRequests = dedupeRequests([
        ...allRequests
          .map(item => item.id === parentRequest.id ? parentRequest : item)
          .map(item => relinkedUpdatedContinuation && item.id === relinkedUpdatedContinuation.id ? relinkedUpdatedContinuation : item)
          .filter(item =>
            item.id !== chainedUpdatedRequest.id
            && item.id !== relinkedUpdatedContinuation?.id
            && !(isSecondaryRouteRequest(item) && item.sourceOrderId === parentRequest.id && item.id !== chainedUpdatedRequest.id && item.id !== relinkedUpdatedContinuation?.id)
          ),
        chainedUpdatedRequest,
        ...(relinkedUpdatedContinuation ? [relinkedUpdatedContinuation] : []),
      ]);
      const nextSiteLocationMap = {
        ...requestSiteLocationMapRef.current,
        [parentRequest.id]: secondaryRouteModal.primarySiteLocation,
        [chainedUpdatedRequest.id]: secondaryRoute.startingLocation,
        ...(relinkedUpdatedContinuation && isSecondaryRouteRequest(relinkedUpdatedContinuation)
          ? { [relinkedUpdatedContinuation.id]: relinkedUpdatedContinuation.secondaryRoute.startingLocation }
          : {}),
      };
      const dateKey = scheduleEvent.date || formatDateKey(selectedDate);
      mergeRequestSiteLocationMap(nextSiteLocationMap);
      setAllRequests(nextRequests);
      if (shouldMoveReturnBreakToSecondary || relinkedUpdatedContinuation) {
        setReturnTransitByRequestId(current => {
          if (
            !shouldMoveReturnBreakToSecondary
            && !current?.[chainedUpdatedRequest.id]
            && !current?.__legacy
          ) {
            return current;
          }
          const next = { ...(current || {}) };
          if (shouldMoveReturnBreakToSecondary) {
            delete next[parentRequest.id];
            next[chainedUpdatedRequest.id] = true;
          } else {
            delete next[chainedUpdatedRequest.id];
          }
          delete next.__legacy;
          return next;
        });
        if (shouldMoveReturnBreakToSecondary) {
          setTollsByRequestId(current => {
            if (!current?.[getTollStorageKey(parentRequest.id, 'return')]) {
              return current;
            }
            const next = { ...(current || {}) };
            delete next[getTollStorageKey(parentRequest.id, 'return')];
            next[getTollStorageKey(chainedUpdatedRequest.id, 'return')] = true;
            return next;
          });
        }
      }
      if (shouldMoveReturnBreakToSecondary) {
        await Promise.all([
          materialOrderRequestsAPI.setReturnTransitToYard(parentRequest.id, false),
          materialOrderRequestsAPI.setReturnTransitToYard(chainedUpdatedRequest.id, true),
        ]);
      } else if (relinkedUpdatedContinuation) {
        await materialOrderRequestsAPI.setReturnTransitToYard(chainedUpdatedRequest.id, false);
      }
      optimisticRequestOverridesRef.current.set(parentRequest.id, {
        request: parentRequest,
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
      optimisticRequestOverridesRef.current.set(chainedUpdatedRequest.id, {
        request: chainedUpdatedRequest,
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
      if (relinkedUpdatedContinuation) {
        optimisticRequestOverridesRef.current.set(relinkedUpdatedContinuation.id, {
          request: relinkedUpdatedContinuation,
          expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
        });
      }
      projectRequestsToBoard(nextRequests, nextSiteLocationMap, dateKey, { force: true });
      setSelectedScheduleEventId(chainedUpdatedRequest.id);
      setSelectedScheduleSegment('primary');
      setScheduleInspectorOpen(true);
      setSecondaryRouteModal(null);
      setError('');
    } catch (err) {
      setSecondaryRouteModal(current => current ? { ...current, error: err?.message || 'Failed to save secondary route.' } : current);
    } finally {
      setSecondaryRouteSaving(false);
    }
  }, [allRequests, dayEvents, eventCycleStateMap, eventStartMinutesMap, getReturnTransitEnabled, getTollsEnabled, mergeRequestSiteLocationMap, projectRequestsToBoard, requestMetaMap, secondaryRouteModal, selectedDate]);

  const handlePendingDragStart = useCallback((event, request) => {
    const requestId = request?.id;
    if (!requestId || (isSecondaryRouteRequest(request) && !isLinkedSecondaryMaterialOrderRequest(request))) {
      return;
    }
    setDraggedRequestId(requestId);
    setDraggedScheduledOrderId('');
    const durationMinutes = isLinkedSecondaryMaterialOrderRequest(request)
      ? 90
      : isSecondaryRouteRequest(request)
        ? getSecondaryRouteTiming(request.secondaryRoute, getReturnTransitEnabled(request.id)).totalMinutes
        : 90;
    setDragPreviewDurationMinutes(durationMinutes);
    dragPointerOffsetMinutesRef.current = 0;
    setDropPreview(null);
    setManualTimeModal(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', requestId);
    setScheduleDragImage(event, request, {
      width: getEventFlex(durationMinutes) * timelineWidth,
      height: 78,
    });
  }, [getReturnTransitEnabled, timelineWidth]);

  const handlePendingDragEnd = useCallback(() => {
    setDraggedRequestId('');
    setDraggedScheduledOrderId('');
    setDragPreviewDurationMinutes(90);
    dragPointerOffsetMinutesRef.current = 0;
    setDropPreview(null);
    setDropPreviewGroup([]);
    selectionDragContextRef.current = null;
  }, []);

  const handleLanePointerDown = useCallback((event) => {
    if (event.button !== 0 || draggedRequestId || dragSchedulingId) {
      return;
    }
    if (event.target.closest('.ts2-event-wrap, .transport-drop-preview, .transport-snap-hover')) {
      return;
    }
    event.preventDefault();
    selectionStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      active: false,
    };
    clearSelectedScheduleEvents();
  }, [clearSelectedScheduleEvents, dragSchedulingId, draggedRequestId]);

  const handleScheduledDragStart = useCallback((event, scheduleEvent, request, durationMinutes, palette) => {
    if (!scheduleEvent?.orderId) {
      return;
    }
    if (isCompletedMaterialOrderRequest(request, eventCycleStateMap[scheduleEvent.orderId] || null)) {
      event.preventDefault();
      return;
    }
    const selectedIds = selectedScheduleEventIdSet.has(scheduleEvent.orderId) && selectedScheduleEventIds.length > 1
      ? selectedScheduleEventIds
      : [scheduleEvent.orderId];
    selectionDragContextRef.current = createScheduleSelectionContext(scheduleEvent.orderId, selectedIds);
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    setDraggedRequestId(scheduleEvent.orderId);
    setDraggedScheduledOrderId(scheduleEvent.orderId);
    setDragPreviewDurationMinutes(durationMinutes || 90);
    dragPointerOffsetMinutesRef.current = pointerRatio * (durationMinutes || 90);
    setDropPreview(null);
    setDropPreviewGroup([]);
    setTileMenu(null);
    setManualTimeModal(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', scheduleEvent.orderId);
    setScheduleDragImage(event, request || scheduleEvent, {
      width: rect.width,
      height: rect.height,
      imageOffsetX: event.clientX - rect.left,
      imageOffsetY: event.clientY - rect.top,
      backgroundColor: palette?.background,
      color: palette?.text,
      label: 'Move schedule',
    });
  }, [createScheduleSelectionContext, eventCycleStateMap, selectedScheduleEventIdSet, selectedScheduleEventIds]);

  const handleScheduledDragEnd = useCallback(() => {
    setDraggedRequestId('');
    setDraggedScheduledOrderId('');
    setDragPreviewDurationMinutes(90);
    dragPointerOffsetMinutesRef.current = 0;
    setDropPreview(null);
    setDropPreviewGroup([]);
    selectionDragContextRef.current = null;
  }, []);

  const handleLaneDragOver = useCallback((event, truckId) => {
    if (!draggedRequestId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const selectionContext = selectionDragContextRef.current;
    const minutes = getDropMinutesFromPointer(event.clientX, event.currentTarget, {
      durationMinutes: dragPreviewDurationMinutes,
      pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
      step: timelineSnapStep,
    });
    if (selectionContext?.items?.length > 1) {
      const targetTruckIndex = TRUCK_LANES.findIndex(lane => lane.id === truckId);
      const selectedIds = new Set(selectionContext.items.map(item => item.orderId));
      const nextGroup = selectionContext.items.map(item => {
        const nextTruckIndex = targetTruckIndex + item.laneOffset;
        const nextTruck = TRUCK_LANES[nextTruckIndex];
        const nextMinutes = minutes + item.minuteOffset;
        const blockedByBounds = !nextTruck || clampScheduleMinutes(nextMinutes, item.durationMinutes) !== nextMinutes;
        const collision = !blockedByBounds && getScheduleCollision({
          requestId: item.orderId,
          truckId: nextTruck.id,
          startMinutes: nextMinutes,
          durationMinutes: item.durationMinutes,
          dayEvents: dayEvents.filter(entry => !selectedIds.has(entry.orderId)),
          startMap: eventStartMinutesMap,
          durationMap: eventDurationMinutesMap,
        });
        return {
          orderId: item.orderId,
          truckId: nextTruck?.id || '',
          minutes: nextMinutes,
          durationMinutes: item.durationMinutes,
          blocked: blockedByBounds || Boolean(collision),
        };
      });
      setDropPreview(null);
      setDropPreviewGroup(current => sameDropPreviewGroup(current, nextGroup) ? current : nextGroup);
      return;
    }
    const probeMinutes = getPointerMinutesFromTrack(event.clientX, event.currentTarget);
    const currentLinkedParentId = getCurrentLinkedParentIdForDrag(draggedRequestId);
    const returnSnapState = getReturnSegmentSnapStateForLane({
      requestId: draggedRequestId,
      truckId,
      eventTarget: event.target,
      probeMinutes,
      tileStartMinutes: minutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
      currentLinkedParentId,
      durationMinutes: dragPreviewDurationMinutes,
    });
    const genericSnapCandidate = getEdgeSnapCandidate({
      requestId: draggedRequestId,
      truckId,
      startMinutes: minutes,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
      currentLinkedParentId,
    });
    const snapCandidate = returnSnapState.candidate || genericSnapCandidate;
    const previewMinutes = snapCandidate?.minutes ?? minutes;
    const collision = getScheduleCollision({
      requestId: draggedRequestId,
      truckId,
      startMinutes: previewMinutes,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
    });
    const nextPreview = {
      truckId,
      minutes: previewMinutes,
      durationMinutes: dragPreviewDurationMinutes,
      blocked: Boolean(collision),
      snapOrderId: snapCandidate?.event?.orderId,
      snapSide: snapCandidate?.side,
      snapSegment: snapCandidate?.linkSegment || null,
    };
    setDropPreview(current => sameDropPreview(current, nextPreview) ? current : nextPreview);
    setDropPreviewGroup([]);
  }, [dayEvents, dragPreviewDurationMinutes, draggedRequestId, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, getCurrentLinkedParentIdForDrag, returnTransitByRequestId, timelineSnapStep]);

  const handleLaneDragLeave = useCallback((event, truckId) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDropPreview(current => current?.truckId === truckId ? null : current);
    setDropPreviewGroup(current => current.some(item => item.truckId === truckId) ? [] : current);
  }, []);

  const handleLaneDrop = useCallback((event, truckId) => {
    const requestId = event.dataTransfer.getData('text/plain') || draggedRequestId;
    console.log('[lane-drop]', { requestId, truckId, target: event.target?.className });
    if (!requestId) {
      return;
    }
    event.preventDefault();
    const selectionContext = selectionDragContextRef.current;
    const minutes = getDropMinutesFromPointer(event.clientX, event.currentTarget, {
      durationMinutes: dragPreviewDurationMinutes,
      pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
      step: timelineSnapStep,
    });
    if (selectionContext?.items?.length > 1) {
      scheduleRequestGroupAt(selectionContext, truckId, minutes);
      return;
    }
    const probeMinutes = getPointerMinutesFromTrack(event.clientX, event.currentTarget);
    const currentLinkedParentId = getCurrentLinkedParentIdForDrag(requestId);
    const returnSnapState = getReturnSegmentSnapStateForLane({
      requestId,
      truckId,
      eventTarget: event.target,
      probeMinutes,
      tileStartMinutes: minutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
      currentLinkedParentId,
      durationMinutes: dragPreviewDurationMinutes,
    });
    const previewSnapCandidate = !returnSnapState.candidate && dropPreview?.truckId === truckId && dropPreview.snapOrderId && !dropPreview.blocked
      ? dropPreview
      : null;
    const snapCandidate = previewSnapCandidate ? null : getEdgeSnapCandidate({
      requestId,
      truckId,
      startMinutes: minutes,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
      currentLinkedParentId,
    });
    const linkedSnapSide = returnSnapState.candidate?.side || previewSnapCandidate?.snapSide || snapCandidate?.side || null;
    const linkedSnapOrderId = returnSnapState.candidate?.event?.orderId || previewSnapCandidate?.snapOrderId || snapCandidate?.event?.orderId || '';
    const linkedSnapSegment = returnSnapState.candidate?.linkSegment || previewSnapCandidate?.snapSegment || snapCandidate?.linkSegment || null;
    const snapMinutes = returnSnapState.candidate?.minutes ?? previewSnapCandidate?.minutes ?? snapCandidate?.minutes ?? minutes;
    scheduleRequestAt(requestId, truckId, snapMinutes, dragPreviewDurationMinutes, linkedSnapOrderId ? {
      exact: true,
      breakRunLinks: Boolean(draggedScheduledOrderId),
      linkToRequestId: linkedSnapSide === 'after' ? linkedSnapOrderId : '',
      linkToSegment: linkedSnapSide === 'after' ? linkedSnapSegment || 'primary' : null,
    } : {
      step: timelineSnapStep,
      breakRunLinks: Boolean(draggedScheduledOrderId),
    });
  }, [dayEvents, dragPreviewDurationMinutes, draggedRequestId, draggedScheduledOrderId, dropPreview, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, getCurrentLinkedParentIdForDrag, returnTransitByRequestId, scheduleRequestAt, scheduleRequestGroupAt, timelineSnapStep]);

  const handleEventSnapDragOver = useCallback((event, scheduleEvent) => {
    const requestId = event.dataTransfer.getData('text/plain') || draggedRequestId;
    if (selectionDragContextRef.current?.items?.length > 1) {
      return;
    }
    if (!requestId || !scheduleEvent?.truckId || requestId === scheduleEvent.orderId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const laneTrack = event.currentTarget.closest('.ts2-lane-track');
    if (!laneTrack) {
      return;
    }
    const probeMinutes = getPointerMinutesFromTrack(event.clientX, laneTrack);
    const freeStart = getDropMinutesFromPointer(event.clientX, laneTrack, {
      durationMinutes: dragPreviewDurationMinutes,
      pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
      step: timelineSnapStep,
    });
    const currentLinkedParentId = getCurrentLinkedParentIdForDrag(requestId);
    const returnSnapState = getReturnSegmentSnapState({
      scheduleEvent,
      eventTarget: event.target,
      probeMinutes,
      tileStartMinutes: freeStart,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
      currentLinkedParentId,
      durationMinutes: dragPreviewDurationMinutes,
    });
    const genericSnapCandidate = getEdgeSnapCandidate({
      requestId,
      truckId: scheduleEvent.truckId,
      startMinutes: freeStart,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
      currentLinkedParentId,
      thresholdMinutes: SNAP_EDGE_THRESHOLD_MINUTES * 2,
    });
    const snapCandidate = returnSnapState.candidate || genericSnapCandidate;
    if (!snapCandidate) {
      if (debugMode) {
        setSnapDebugInfo({
          ...returnSnapState,
          source: 'drag-over',
          dragRequestId: requestId,
          targetOrderId: scheduleEvent.orderId,
          genericSide: null,
          genericSegment: null,
          genericMinutes: null,
          chosenSource: 'none',
          chosenSide: null,
          chosenMinutes: null,
          linkToRequestId: '',
          linkSegment: null,
          blocked: false,
        });
      }
      setDropPreview(current => current?.snapOrderId === scheduleEvent.orderId ? null : current);
      return;
    }
    const collision = getScheduleCollision({
      requestId,
      truckId: scheduleEvent.truckId,
      startMinutes: snapCandidate.minutes,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
    });
    if (debugMode) {
      setSnapDebugInfo({
        ...returnSnapState,
        source: 'drag-over',
        dragRequestId: requestId,
        targetOrderId: scheduleEvent.orderId,
        genericSide: genericSnapCandidate?.side || null,
        genericSegment: genericSnapCandidate?.linkSegment || null,
        genericMinutes: genericSnapCandidate?.minutes ?? null,
        chosenSource: returnSnapState.candidate ? 'return-segment' : 'generic',
        chosenSide: snapCandidate.side,
        chosenMinutes: snapCandidate.minutes,
        linkToRequestId: snapCandidate.side === 'after' ? snapCandidate.event.orderId : '',
        linkSegment: snapCandidate.side === 'after' ? snapCandidate.linkSegment || 'primary' : null,
        blocked: Boolean(collision),
      });
    }
    const nextPreview = {
      truckId: scheduleEvent.truckId,
      minutes: snapCandidate.minutes,
      durationMinutes: dragPreviewDurationMinutes,
      blocked: Boolean(collision),
      snapOrderId: snapCandidate.event.orderId,
      snapSide: snapCandidate.side,
      snapSegment: snapCandidate.linkSegment || null,
    };
    setDropPreview(current => sameDropPreview(current, nextPreview) ? current : nextPreview);
  }, [dayEvents, debugMode, dragPreviewDurationMinutes, draggedRequestId, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, getCurrentLinkedParentIdForDrag, returnTransitByRequestId, timelineSnapStep]);

  const handleEventSnapDrop = useCallback((event, scheduleEvent) => {
    const requestId = event.dataTransfer.getData('text/plain') || draggedRequestId;
    console.log('[event-snap-drop] entry', { requestId, scheduleEventId: scheduleEvent?.orderId, target: event.target?.className });
    if (selectionDragContextRef.current?.items?.length > 1) {
      return;
    }
    if (!requestId || !scheduleEvent?.truckId) {
      console.log('[event-snap-drop] early exit - missing ids');
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const laneTrack = event.currentTarget.closest('.ts2-lane-track');
    if (!laneTrack) {
      return;
    }
    const probeMinutes = getPointerMinutesFromTrack(event.clientX, laneTrack);
    const currentLinkedParentId = getCurrentLinkedParentIdForDrag(requestId);
    // Self-drop: tile was positioned right after a return segment so the pointer
    // lands on its own wrapper. Scan adjacent tiles for a return segment snap
    // instead of bailing out entirely.
    if (requestId === scheduleEvent.orderId) {
      console.log('[event-snap-drop] self-drop - scanning for adjacent return segment');
      const selfDropFreeStart = getDropMinutesFromPointer(event.clientX, laneTrack, {
        durationMinutes: dragPreviewDurationMinutes,
        pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
        step: timelineSnapStep,
      });
      const returnSnapState = getReturnSegmentSnapStateForLane({
        requestId,
        truckId: scheduleEvent.truckId,
        eventTarget: event.target,
        probeMinutes,
        tileStartMinutes: selfDropFreeStart,
        dayEvents,
        startMap: eventStartMinutesMap,
        durationMap: eventDurationMinutesMap,
        primaryDurationMap: eventPrimaryDurationMinutesMap,
        returnTransitByRequestId,
        cycleStateMap: eventCycleStateMap,
        currentLinkedParentId,
        durationMinutes: dragPreviewDurationMinutes,
      });
      const snapCandidate = returnSnapState.candidate || dropPreview?.snapOrderId && dropPreview.snapOrderId !== requestId && !dropPreview.blocked ? {
        event: { orderId: dropPreview.snapOrderId },
        side: dropPreview.snapSide,
        linkSegment: dropPreview.snapSegment,
        minutes: dropPreview.minutes,
      } : null;
      console.log('[event-snap-drop] self-drop scan result', { hasCandidate: Boolean(snapCandidate), snapCandidate });
      if (!snapCandidate) {
        return;
      }
      const collision = getScheduleCollision({
        requestId,
        truckId: scheduleEvent.truckId,
        startMinutes: snapCandidate.minutes,
        durationMinutes: dragPreviewDurationMinutes,
        dayEvents,
        startMap: eventStartMinutesMap,
        durationMap: eventDurationMinutesMap,
      });
      if (collision) {
        return;
      }
      const linkedSnapSegment = returnSnapState.candidate?.linkSegment || dropPreview?.snapSegment || null;
      console.log('[event-snap-drop] self-drop scheduling', { linkedSnapSegment, snapCandidate });
      scheduleRequestAt(requestId, scheduleEvent.truckId, snapCandidate.minutes, dragPreviewDurationMinutes, {
        exact: true,
        breakRunLinks: Boolean(draggedScheduledOrderId),
        linkToRequestId: snapCandidate.side === 'after' ? snapCandidate.event.orderId : '',
        linkToSegment: snapCandidate.side === 'after' ? linkedSnapSegment || 'primary' : null,
      });
      return;
    }
    const freeStart = getDropMinutesFromPointer(event.clientX, laneTrack, {
      durationMinutes: dragPreviewDurationMinutes,
      pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
      step: timelineSnapStep,
    });
    const returnSnapState = getReturnSegmentSnapState({
      scheduleEvent,
      eventTarget: event.target,
      probeMinutes,
      tileStartMinutes: freeStart,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
      currentLinkedParentId,
      durationMinutes: dragPreviewDurationMinutes,
    });
    const genericSnapCandidate = getEdgeSnapCandidate({
      requestId,
      truckId: scheduleEvent.truckId,
      startMinutes: freeStart,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      primaryDurationMap: eventPrimaryDurationMinutesMap,
      returnTransitByRequestId,
      cycleStateMap: eventCycleStateMap,
      currentLinkedParentId,
      thresholdMinutes: SNAP_EDGE_THRESHOLD_MINUTES * 2,
    });
    const snapCandidate = returnSnapState.candidate || genericSnapCandidate;
    if (!snapCandidate) {
      if (debugMode) {
        setSnapDebugInfo({
          ...returnSnapState,
          source: 'drop',
          dragRequestId: requestId,
          targetOrderId: scheduleEvent.orderId,
          genericSide: null,
          genericSegment: null,
          genericMinutes: null,
          chosenSource: 'none',
          chosenSide: null,
          chosenMinutes: null,
          linkToRequestId: '',
          linkSegment: null,
          blocked: false,
        });
      }
      return;
    }
    const collision = getScheduleCollision({
      requestId,
      truckId: scheduleEvent.truckId,
      startMinutes: snapCandidate.minutes,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
    });
    const linkedSnapSegment = returnSnapState.candidate?.linkSegment || dropPreview?.snapSegment || snapCandidate?.linkSegment || null;
    if (debugMode) {
      setSnapDebugInfo({
        ...returnSnapState,
        source: 'drop',
        dragRequestId: requestId,
        targetOrderId: scheduleEvent.orderId,
        genericSide: genericSnapCandidate?.side || null,
        genericSegment: genericSnapCandidate?.linkSegment || null,
        genericMinutes: genericSnapCandidate?.minutes ?? null,
        chosenSource: returnSnapState.candidate ? 'return-segment' : 'generic',
        chosenSide: snapCandidate.side,
        chosenMinutes: snapCandidate.minutes,
        linkToRequestId: snapCandidate.side === 'after' ? snapCandidate.event.orderId : '',
        linkSegment: snapCandidate.side === 'after' ? linkedSnapSegment || 'primary' : null,
        blocked: Boolean(collision),
      });
    }
    console.log('[snap-drop]', {
      hasReturnCandidate: Boolean(returnSnapState.candidate),
      returnCandidateLinkSegment: returnSnapState.candidate?.linkSegment ?? null,
      dropPreviewSnapSegment: dropPreview?.snapSegment ?? null,
      genericCandidateLinkSegment: snapCandidate?.linkSegment ?? null,
      linkedSnapSegment,
      linkToRequestId: snapCandidate.side === 'after' ? snapCandidate.event.orderId : '',
      linkToSegment: snapCandidate.side === 'after' ? linkedSnapSegment || 'primary' : null,
      snapMinutes: snapCandidate.minutes,
      probeMinutes,
      directlyOnReturnCard: returnSnapState.directlyOnReturnCard,
      pointerOverReturnTime: returnSnapState.pointerOverReturnTime,
    });
    scheduleRequestAt(requestId, scheduleEvent.truckId, snapCandidate.minutes, dragPreviewDurationMinutes, {
      exact: true,
      breakRunLinks: Boolean(draggedScheduledOrderId),
      linkToRequestId: snapCandidate.side === 'after' ? snapCandidate.event.orderId : '',
      linkToSegment: snapCandidate.side === 'after' ? linkedSnapSegment || 'primary' : null,
    });
  }, [dayEvents, debugMode, dragPreviewDurationMinutes, draggedRequestId, draggedScheduledOrderId, dropPreview, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, getCurrentLinkedParentIdForDrag, returnTransitByRequestId, scheduleRequestAt, timelineSnapStep]);

  const handleUnscheduleOrder = useCallback((requestIds, options = {}) => {
    const ids = Array.isArray(requestIds) ? requestIds.filter(Boolean) : [requestIds].filter(Boolean);
    if (!ids.length) {
      return;
    }
    if ((options.segment || selectedScheduleSegment) === 'return' && ids.length === 1) {
      setReturnTransitForRequest(ids[0], false);
      return;
    }
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;
    const previousReturnTransitByRequestId = returnTransitByRequestId;
    const sourceRequests = ids
      .map(requestId => allRequests.find(item => item.id === requestId) || requestMetaMap[requestId] || null)
      .filter(Boolean);
    const completedMaterialOrder = sourceRequests.find(sourceRequest =>
      isCompletedMaterialOrderRequest(sourceRequest, eventCycleStateMap[sourceRequest.id] || null),
    );
    if (completedMaterialOrder && !debugMode) {
      setTileMenu(null);
      setError('Completed material orders can only be removed from the schedule.');
      return;
    }
    const invalidSecondaryRoute = sourceRequests.find(sourceRequest =>
      isSecondaryRouteRequest(sourceRequest) && !isLinkedSecondaryMaterialOrderRequest(sourceRequest),
    );
    if (invalidSecondaryRoute) {
      setTileMenu(null);
      setError('Secondary routes can only be deleted, not unscheduled.');
      return;
    }
    const updatesById = new Map(
      sourceRequests.map(sourceRequest => {
        const shouldRestoreAsMaterialOrder = isLinkedSecondaryMaterialOrderRequest(sourceRequest);
        return [
          sourceRequest.id,
          applyReturnTransitToRequest({
            ...sourceRequest,
            sourceOrderId: null,
            connectedParentStartMinutes: null,
            connectedParentSegment: null,
            routeType: shouldRestoreAsMaterialOrder ? null : sourceRequest.routeType,
            scheduledDate: null,
            scheduledHour: null,
            scheduledMinute: null,
            scheduledAtIso: null,
            scheduledTruckId: null,
            scheduledTruckLabel: null,
            truckId: null,
            truckLabel: null,
            deliveryStatus: 'pending',
            deliveryStartedAt: null,
            deliveryUnloadingAt: null,
            deliveryConfirmedAt: null,
            archivedAt: debugMode ? null : sourceRequest.archivedAt,
            scheduleRemovedAt: null,
            secondaryRoute: shouldRestoreAsMaterialOrder ? null : sourceRequest.secondaryRoute,
          }, false),
        ];
      }),
    );

    setTileMenu(null);
    const nextRequests = previousRequests.map(item => updatesById.get(item.id) || item);
    setAllRequests(nextRequests);
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
    setReturnTransitByRequestId(current => {
      if (!ids.some(requestId => current?.[requestId]) && !current?.__legacy) {
        return current;
      }
      const next = { ...(current || {}) };
      ids.forEach(requestId => delete next[requestId]);
      delete next.__legacy;
      return next;
    });
    setSelectedScheduleEventId(current => ids.includes(current) ? '' : current);
    setSelectedScheduleEventIds(current => current.filter(id => !ids.includes(id)));
    sourceRequests.forEach(updatedRequest => {
      optimisticRequestOverridesRef.current.set(updatedRequest.id, {
        request: updatesById.get(updatedRequest.id),
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
    });

    (async () => {
      try {
        for (const requestId of ids) {
          await materialOrderRequestsAPI.clearSchedule(requestId, { allowCompletedReset: debugMode });
        }
        setError('');
      } catch (err) {
        ids.forEach(requestId => optimisticRequestOverridesRef.current.delete(requestId));
        boardProjectionSignatureRef.current = '';
        requestMetaSignatureRef.current = '';
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setEventCycleStateMap(previousCycleStateMap);
        setReturnTransitByRequestId(previousReturnTransitByRequestId);
        setError(err?.message || 'Failed to unschedule order selection.');
      }
    })();
  }, [allRequests, dayEvents, debugMode, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, projectRequestsToBoard, requestMetaMap, returnTransitByRequestId, selectedDate, selectedScheduleSegment, setReturnTransitForRequest]);

  const handleDeleteScheduledOrder = useCallback((requestIds) => {
    const ids = Array.isArray(requestIds) ? requestIds.filter(Boolean) : [requestIds].filter(Boolean);
    if (!ids.length) {
      return;
    }
    const sourceRequests = ids
      .map(requestId => allRequests.find(item => item.id === requestId) || requestMetaMap[requestId] || null)
      .filter(Boolean);
    const completedMaterialIds = sourceRequests
      .filter(sourceRequest => isCompletedMaterialOrderRequest(sourceRequest, eventCycleStateMap[sourceRequest.id] || null))
      .map(sourceRequest => sourceRequest.id);
    const removeOnlyCompleted = completedMaterialIds.length > 0 && completedMaterialIds.length === ids.length;
    if (completedMaterialIds.length > 0 && !removeOnlyCompleted) {
      setTileMenu(null);
      setError('Completed material orders must be removed from the schedule separately.');
      return;
    }
    if (!window.confirm(removeOnlyCompleted
      ? ids.length > 1
        ? `Remove ${ids.length} completed material orders from the schedule? They will remain in archives.`
        : 'Remove this completed material order from the schedule? It will remain in archives.'
      : ids.length > 1
      ? `Delete ${ids.length} transport orders? This removes them from the active schedule and request list.`
      : 'Delete this transport order? This removes it from the active schedule and request list.')) {
      return;
    }
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;

    setTileMenu(null);
    const nextRequests = removeOnlyCompleted
      ? previousRequests.map(item => completedMaterialIds.includes(item.id)
        ? {
            ...item,
            archivedAt: item.archivedAt || new Date().toISOString(),
            scheduleRemovedAt: new Date().toISOString(),
          }
        : item)
      : previousRequests.filter(item => !ids.includes(item.id));
    setAllRequests(nextRequests);
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
    setSelectedScheduleEventId(current => ids.includes(current) ? '' : current);
    setSelectedScheduleEventIds(current => current.filter(id => !ids.includes(id)));
    ids.forEach(requestId => {
      const updatedCompletedRequest = nextRequests.find(item => item.id === requestId);
      optimisticRequestOverridesRef.current.set(requestId, removeOnlyCompleted && updatedCompletedRequest
        ? {
            request: updatedCompletedRequest,
            expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
          }
        : {
            deleted: true,
            expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
          });
    });

    (async () => {
      try {
        for (const requestId of ids) {
          if (removeOnlyCompleted) {
            await materialOrderRequestsAPI.removeCompletedFromSchedule(requestId);
          } else {
            await materialOrderRequestsAPI.deleteRequest(requestId);
          }
        }
        setError('');
      } catch (err) {
        ids.forEach(requestId => optimisticRequestOverridesRef.current.delete(requestId));
        boardProjectionSignatureRef.current = '';
        requestMetaSignatureRef.current = '';
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setEventCycleStateMap(previousCycleStateMap);
        setError(err?.message || 'Failed to delete order selection.');
      }
    })();
  }, [allRequests, dayEvents, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, projectRequestsToBoard, requestMetaMap, selectedDate]);

  const handleOpenPdf = useCallback(async request => {
    if (!request?.pdfPath) {
      return;
    }
    const pdfUrl = await materialOrderRequestsAPI.getPdfUrl(request);
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const timeOptions = useMemo(() => {
    const options = [];
    for (let hour = SCREEN_START_HOUR; hour <= SCREEN_END_HOUR; hour += 1) {
      for (let minute = 0; minute < 60; minute += TIME_PICKER_MINUTE_STEP) {
        if (hour === SCREEN_END_HOUR && minute > 0) {
          continue;
        }
        const iso = buildScheduleIso(formatDateKey(selectedDate), hour, minute);
        options.push({
          hour,
          minute,
          label: formatTimeChip(hour, minute),
          isPast: iso ? new Date(iso).getTime() <= Date.now() : false,
        });
      }
    }
    return options;
  }, [selectedDate]);

  const handleToolbarDateChange = useCallback((event) => {
    const nextValue = event.target.value;
    if (!nextValue) {
      return;
    }
    const nextDate = startOfDay(new Date(`${nextValue}T00:00:00`));
    if (!Number.isNaN(nextDate.getTime())) {
      setSelectedDate(nextDate);
    }
  }, []);

  const openToolbarDatePicker = useCallback(() => {
    const input = toolbarDateInputRef.current;
    if (!input) {
      return;
    }
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }, []);

  return (
    <div className="ts2-page transport-dynamic-reference">
      <div className="transport-reference-toolbar">
        <div className="transport-toolbar-date-group">
          <button type="button" className="transport-toolbar-icon" onClick={() => setSelectedDate(date => new Date(date.getTime() - 86400000))} aria-label="Previous day"><ToolbarIcon type="chevron-left" /></button>
          <label className="transport-toolbar-date" aria-label="Select schedule date">
            <input
              ref={toolbarDateInputRef}
              type="date"
              value={formatNativeDateValue(selectedDate)}
              onChange={handleToolbarDateChange}
            />
            <button type="button" className="transport-toolbar-date-trigger" onClick={openToolbarDatePicker}>
              <span>{selectedDate.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              <ToolbarIcon type="calendar" />
            </button>
          </label>
          <button type="button" className="transport-toolbar-icon" onClick={() => setSelectedDate(date => new Date(date.getTime() + 86400000))} aria-label="Next day"><ToolbarIcon type="chevron-right" /></button>
        </div>
        <span className="transport-live-refresh"><i /> Last refreshed: {formatLastRefreshTime()} <b>Live</b></span>
        <button type="button" className="transport-toolbar-button" onClick={() => loadBoard().catch(() => {})}><ToolbarIcon type="refresh" />Refresh</button>
      </div>

      {error ? <div className="ts2-error">{error}</div> : null}

      {!isTruckRole && showPendingPanel ? (
        <div className="ts2-pending-panel">
          <div className="ts2-pending-head">
            <strong>Scheduled Orders</strong>
            <span>{pendingRequests.length}</span>
          </div>
          {pendingRequests.length > 0 ? (
            <div className="ts2-pending-list">
              {pendingRequests.map(request => (
                <div
                  key={request.id}
                  className={`ts2-pending-item${draggedRequestId === request.id ? ' dragging' : ''}`}
                  draggable={!dragSchedulingId}
                  onDragStart={(event) => handlePendingDragStart(event, request)}
                  onDragEnd={handlePendingDragEnd}
                >
                  <div>
                    <strong>{request.builderName || 'Material Order'}</strong>
                    <span>{request.projectName || 'Awaiting site assignment'}</span>
                  </div>
                  <button type="button" onClick={() => openRequestModal(request.id)}>Schedule</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`transport-schedule-redesign-grid${scheduleInspectorOpen ? '' : ' transport-schedule-redesign-grid--inspector-closed'}`}>
      <div className="ts2-board-card transport-schedule-board-card">
        <div className="ts2-board-card-head">
          <div>
            <strong className="ts2-board-card-title">Schedule Board</strong>
            <span className="ts2-board-card-subtitle">{formatBoardDay(selectedDate)}</span>
          </div>
          <div className="ts2-board-card-controls">
            <button
              type="button"
              className={`transport-debug-toggle${debugMode ? ' active' : ''}`}
              onClick={() => {
                setDebugMode(current => !current);
                if (!debugMode) {
                  resetDebugClock();
                }
              }}
            >
              Debug
            </button>
            <label className={`transport-snap-toggle${snapToTimeMarks ? ' active' : ''}`}>
              <input
                type="checkbox"
                checked={snapToTimeMarks}
                onChange={(event) => setSnapToTimeMarks(event.target.checked)}
              />
              <span>Snap</span>
            </label>
            <label className={`transport-snap-toggle${showScheduleTimestamps ? ' active' : ''}`}>
              <input
                type="checkbox"
                checked={showScheduleTimestamps}
                onChange={(event) => setShowScheduleTimestamps(event.target.checked)}
              />
              <span>Time stamps</span>
            </label>
            <div className="transport-scale-control">
              <span>Scale</span>
              <input
                type="range"
                min="0"
                max={SCALE_ORDER.length - 1}
                step="1"
                value={timelineScaleIndex}
                onChange={(event) => setTimelineScaleWithAnchor(SCALE_ORDER[Number(event.target.value)] || 'standard')}
                aria-label="Timeline scale"
              />
            </div>
          </div>
        </div>

        {debugMode ? (
          <div className="transport-debug-panel">
            <div className="transport-debug-clock">
              <label>
                <span>Current time marker</span>
                <input
                  type="time"
                  value={debugTimeValue}
                  min={formatManualTimeInput(SCREEN_START_HOUR * 60)}
                  max={formatManualTimeInput(SCREEN_END_HOUR * 60)}
                  step="60"
                  onChange={handleDebugTimeChange}
                />
              </label>
              <label>
                <span>Speed</span>
                <select value={debugSpeed} onChange={(event) => setDebugSpeed(Number(event.target.value))}>
                  {DEBUG_SPEED_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={resetDebugClock}>Reset clock</button>
            </div>
            <div className="transport-debug-status">
              <span>{selectedScheduleRequest ? `Tile status: ${selectedScheduleRequest.builderName || selectedScheduleEvent?.builderName || 'Material Order'}` : 'Select a tile to change its debug status'}</span>
              <div>
                {DEBUG_STATUS_OPTIONS.map(option => {
                  const appearance = scheduleStatusAppearance(option.value, transportStatusColors);
                  const active = selectedDebugStatus === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={active ? 'active' : ''}
                      style={{
                        borderColor: appearance.accent,
                        backgroundColor: active ? appearance.accent : appearance.background,
                        color: active ? '#ffffff' : appearance.text,
                      }}
                      disabled={!selectedScheduleRequest || debugStatusSavingId === selectedScheduleRequest.id}
                      onClick={() => updateDebugDeliveryStatus(option.value)}
                    >
                      {scheduleStatusLabel(option.value)}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedScheduleRequest ? (
              <div className="transport-debug-chain">
                <span>Chain debug</span>
                <code>
                  {[
                    `id=${selectedScheduleRequest.id}`,
                    `source=${selectedScheduleRequest.sourceOrderId || 'none'}`,
                    `status=${selectedScheduleRequest.deliveryStatus || 'scheduled'}`,
                    `effective=${selectedScheduleEffectiveStatus}`,
                    `follows=${selectedScheduleCycleState?.followsPreviousRun ? 'yes' : 'no'}`,
                    `reason=${selectedScheduleCycleState?.runLinkReason || 'none'}`,
                    `segment=${getConnectedParentSegment(selectedScheduleRequest) || 'none'}`,
                    `presumeTransit=${selectedScheduleCycleState?.presumedInTransitFromParent ? 'yes' : 'no'}`,
                    `returnBreak=${selectedScheduleCycleState?.effectiveReturnBreak ? 'yes' : 'no'}`,
                    `returnLink=${selectedScheduleCycleState?.hasReturnTransitContinuation ? 'yes' : 'no'}`,
                    `handoff=${typeof selectedScheduleCycleState?.runHandoffMinutes === 'number' ? formatTimeChip(Math.floor(selectedScheduleCycleState.runHandoffMinutes / 60), Math.floor(selectedScheduleCycleState.runHandoffMinutes % 60)) : 'n/a'}`,
                    `connectedStart=${typeof selectedScheduleRequest.connectedParentStartMinutes === 'number' ? formatTimeChip(Math.floor(selectedScheduleRequest.connectedParentStartMinutes / 60), Math.floor(selectedScheduleRequest.connectedParentStartMinutes % 60)) : 'n/a'}`,
                  ].join(' | ')}
                </code>
              </div>
            ) : null}
            <div className="transport-debug-chain">
              <span>Snap debug</span>
              <code>{snapDebugLines.join(' | ')}</code>
            </div>
          </div>
        ) : null}

        <div className="ts2-board-scroll" ref={boardScrollRef}>
        <div className="ts2-board" style={{ width: timelineWidth + TRACK_OFFSET }}>
          <div className="ts2-board-head" style={{ gridTemplateColumns: `${LANE_META_WIDTH}px minmax(0, 1fr)` }}>
            <div className="ts2-lane-head" />
            <div className="ts2-axis-shell">
              <div className="ts2-axis" style={{ width: timelineWidth }}>
                {timelineMarkers.map(marker => (
                  <div key={`${timelineScaleMode}-${marker.minutes}`} className={`ts2-axis-tick${marker.isHour ? ' major' : ''}${marker.showLabel ? ' labeled' : ''}`} style={{ left: `${((marker.minutes - SCREEN_START_HOUR * 60) / ((SCREEN_END_HOUR - SCREEN_START_HOUR) * 60)) * 100}%` }}>
                    {marker.showLabel ? <span>{marker.label}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="ts2-board-body" ref={boardBodyRef}>
            <CurrentTimeMarker
              selectedDate={selectedDate}
              timelineWidth={timelineWidth}
              laneOffset={TRACK_OFFSET}
              nowOverride={debugMode ? debugNow : null}
              debugActive={debugMode}
            />
            {selectionBox ? (
              <div
                className="ts2-selection-box"
                style={{
                  left: selectionBox.left,
                  top: selectionBox.top,
                  width: selectionBox.width,
                  height: selectionBox.height,
                }}
              />
            ) : null}
            {visibleTruckLanes.map((lane, laneIndex) => {
              const laneEvents = groupedEventsByTruck[laneIndex] || [];
              return (
                <div key={lane.id} className="ts2-lane-row" style={{ gridTemplateColumns: `${LANE_META_WIDTH}px minmax(0, 1fr)` }}>
                  <div className="ts2-lane-meta">
                    <div className="ts2-truck-pill">
                      <span className="ts2-truck-pill-icon">
                        <TruckLaneIcon />
                      </span>
                      <strong>{lane.rego}</strong>
                    </div>
                  </div>
                  <div className="ts2-lane-track-shell">
                    <div
                      className={`ts2-lane-track${dropPreview?.truckId === lane.id ? ' is-drop-target' : ''}`}
                      style={{ width: timelineWidth }}
                      onPointerDown={handleLanePointerDown}
                      onDragOver={(event) => handleLaneDragOver(event, lane.id)}
                      onDragLeave={(event) => handleLaneDragLeave(event, lane.id)}
                      onDrop={(event) => handleLaneDrop(event, lane.id)}
                    >
                      {timelineMarkers.map(marker => (
                        <div key={`${lane.id}-${marker.minutes}`} className={`ts2-grid-line${marker.isHour ? ' major' : ''}`} style={{ left: `${((marker.minutes - SCREEN_START_HOUR * 60) / ((SCREEN_END_HOUR - SCREEN_START_HOUR) * 60)) * 100}%` }} />
                      ))}
                      {loadingBoard && laneIndex === 0 ? <div className="ts2-loading">Loading live schedule…</div> : null}
                      {dropPreview?.truckId === lane.id ? (
                        <div
                          className={`transport-drop-preview${dropPreview.blocked ? ' blocked' : ''}`}
                          style={{
                            left: `${getEventOffset(dropPreview.minutes) * 100}%`,
                            width: `${getEventFlex(dropPreview.durationMinutes || 90) * 100}%`,
                          }}
                        >
                          <span>{formatTimeChip(Math.floor(dropPreview.minutes / 60), dropPreview.minutes % 60)}</span>
                          <strong>{dropPreview.blocked ? 'Slot unavailable' : 'Drop to schedule'}</strong>
                        </div>
                      ) : null}
                      {dropPreviewGroup
                        .filter(item => item.truckId === lane.id)
                        .map(item => (
                          <div
                            key={`group-preview-${item.orderId}`}
                            className={`transport-drop-preview group${item.blocked ? ' blocked' : ''}`}
                            style={{
                              left: `${getEventOffset(item.minutes) * 100}%`,
                              width: `${getEventFlex(item.durationMinutes || 90) * 100}%`,
                            }}
                          >
                            <span>{formatTimeChip(Math.floor(item.minutes / 60), item.minutes % 60)}</span>
                            <strong>{item.blocked ? 'Slot unavailable' : 'Move selection'}</strong>
                          </div>
                        ))}
                      {selectedScheduleChainOutlines
                        .filter(item => item.truckId === lane.id)
                        .map(item => (
                          <div
                            key={`chain-outline-${lane.id}-${item.startMinutes}-${item.durationMinutes}`}
                            className="transport-chain-selection-outline"
                            style={{
                              left: `${getEventOffset(item.startMinutes) * 100}%`,
                              width: `${getEventFlex(item.durationMinutes) * 100}%`,
                            }}
                            aria-hidden="true"
                          />
                        ))}
                      {laneEvents.map(event => {
                      const request = requestMetaMap[event.orderId];
                      const cycleState = eventCycleStateMap[event.orderId] || null;
                      const isSecondaryRequest = isSecondaryRouteRequest(request);
                      const isCompletedMaterialTile = isCompletedMaterialOrderRequest(request, cycleState);
                      const status = getEffectiveDeliveryStatus(request, cycleState);
                      const durationMinutes = eventDurationMinutesMap[event.orderId] ?? 90;
                      const primaryDurationMinutes = eventPrimaryDurationMinutesMap[event.orderId] ?? durationMinutes;
                      const offset = getEventOffset(eventStartMinutesMap[event.orderId] ?? event.hour * 60 + event.minute) * 100;
                      const width = getEventFlex(durationMinutes) * 100;
                      const isCompleteTile = status === 'return_transit';
                      const palette = scheduleStatusAppearance(isCompleteTile ? 'return_transit' : status, transportStatusColors);
                      const startMinutes = eventStartMinutesMap[event.orderId] ?? event.hour * 60 + event.minute;
                      const siteLocation = requestSiteLocationMap[event.orderId] || '';
                      const routeContext = getBoardRouteContextForRequest(request, requestMetaMap, requestSiteLocationMap, selectedDate, getTollsEnabled, returnTransitByRequestId);
                      const eventReturnTransitEnabled = getReturnTransitEnabled(event.orderId) && !cycleState?.hasSecondaryContinuation;
                      const cachedRouteEstimate = getCachedBoardRouteEstimate(routeContext);
                      const stableRouteEstimate = stableRouteEstimateMapRef.current[event.orderId] ?? null;
                      let routeEstimate = cachedRouteEstimate === undefined
                        ? stableRouteEstimate
                        : cachedRouteEstimate ?? stableRouteEstimate;
                      const timing = isSecondaryRequest
                        ? getSecondaryRouteTiming(request.secondaryRoute, eventReturnTransitEnabled, routeEstimate)
                        : eventReturnTransitEnabled
                          ? getTimingProfile(routeEstimate, request?.secondaryRoute || null, getRequestServiceMinutes(request))
                          : removeReturnLegFromTiming(getTimingProfile(routeEstimate, request?.secondaryRoute || null, getRequestServiceMinutes(request)));
                      const completedReturnSegmentMinutes = isCompleteTile && eventReturnTransitEnabled
                        ? Math.max(0, durationMinutes - primaryDurationMinutes)
                        : 0;
                      const plannedReturnSegmentMinutes = !isCompleteTile && eventReturnTransitEnabled
                        ? Math.max(0, durationMinutes - primaryDurationMinutes)
                        : 0;
                      const returnSegmentDurationMinutes = completedReturnSegmentMinutes || plannedReturnSegmentMinutes;
                      const returnSegmentRatio = Math.max(0, Math.min(1, returnSegmentDurationMinutes / Math.max(1, durationMinutes)));
                      const returnSegmentWidth = returnSegmentRatio * 100;
                      const hasReturnTransitSegment = returnSegmentWidth > 0;
                      const nonReturnDurationMinutes = Math.max(1, durationMinutes - returnSegmentDurationMinutes);
                      const nonReturnWidth = Math.max(0, 100 - returnSegmentWidth);
                      const plannedPrimaryDurationMinutes = !isSecondaryRequest && request?.secondaryRoute
                        ? getPrimaryPhaseMinutes(
                          routeEstimate,
                          request?.secondaryRoute || null,
                          getRequestServiceMinutes(request),
                        )
                        : primaryDurationMinutes;
                      const displayPrimaryDurationMinutes = !isSecondaryRequest && request?.secondaryRoute && status !== 'return_transit'
                        ? Math.min(nonReturnDurationMinutes, plannedPrimaryDurationMinutes)
                        : nonReturnDurationMinutes;
                      const displayPrimaryRatio = Math.max(0, Math.min(1, displayPrimaryDurationMinutes / Math.max(1, durationMinutes)));
                      const displayPrimaryWidth = Math.min(nonReturnWidth, displayPrimaryRatio * 100);
                      const displaySecondaryWidth = Math.max(0, nonReturnWidth - displayPrimaryWidth);
                      const hasSecondaryRouteTile = !isSecondaryRequest && Boolean(request?.secondaryRoute) && status !== 'return_transit' && displaySecondaryWidth > 0;
                      const primaryEnd = startMinutes + displayPrimaryDurationMinutes;
                      const secondaryStartMinutes = startMinutes + displayPrimaryDurationMinutes;
                      const secondaryEndMinutes = startMinutes + nonReturnDurationMinutes;
                      const secondaryArrivalMinutes = secondaryStartMinutes + Math.round((request?.secondaryRoute?.travelDurationSeconds || 0) / 60);
                      const returnStartMinutes = startMinutes + nonReturnDurationMinutes;
                      const returnEndMinutes = startMinutes + durationMinutes;
                      const siteArrivalMinutes = startMinutes + timing.transitMinutes;
                      const actualMarkers = [
                        { key: 'started', label: 'Started', iso: request?.deliveryStartedAt },
                        { key: 'arrived', label: 'Arrived', iso: request?.deliveryUnloadingAt },
                        { key: 'completed', label: 'Completed', iso: request?.deliveryConfirmedAt },
                      ]
                        .map(marker => {
                          const minutes = getActualMarkerMinutes(marker.iso, selectedDateKey);
                          if (typeof minutes !== 'number') {
                            return null;
                          }
                          const ratio = (minutes - startMinutes) / Math.max(1, durationMinutes);
                          return {
                            ...marker,
                            minutes,
                            left: Math.max(0, Math.min(100, ratio * 100)),
                            timeLabel: formatTimeChip(Math.floor(minutes / 60), Math.floor(minutes % 60)),
                          };
                        })
                        .filter(Boolean);
                      const siteArrivalLabel = siteLocation
                        ? formatTimeChip(Math.floor(siteArrivalMinutes / 60), Math.floor(siteArrivalMinutes % 60))
                        : 'pending';
                      const scaffoldDetailText = getScaffoldDetailText(request, event);
                      const eventTitle = isSecondaryRequest ? request.secondaryRoute.destination : event.builderName || 'Material Order';
                      const eventSubtitle = isSecondaryRequest ? getSecondaryRouteReasonLabel(request.secondaryRoute.reason) : scaffoldDetailText;
                      const eventArrival = isSecondaryRequest ? `ETA stop ${siteArrivalLabel}` : `ETA site ${siteArrivalLabel}`;
                      const primaryDeliveryType = getDeliveryTypePill(request);
                      const secondaryDeliveryType = getDeliveryTypePill(request, 'secondary');
                      const isEventSelected = selectedScheduleEventIdSet.has(event.orderId);
                      const isMultiSelectedEvent = selectedScheduleEventIds.length > 1 && isEventSelected;
                      const isActiveSelectedEvent = selectedScheduleEventId === event.orderId && isEventSelected;
                      const selectedSegmentForEvent = isActiveSelectedEvent ? selectedScheduleSegment : '';
                      const isPrimarySegmentSelected = isMultiSelectedEvent || (
                        isActiveSelectedEvent
                        && (selectedSegmentForEvent === 'primary' || (isSecondaryRequest && selectedSegmentForEvent === 'secondary'))
                      );
                      const isSecondarySegmentSelected = isMultiSelectedEvent || (
                        isActiveSelectedEvent && selectedSegmentForEvent === 'secondary'
                      );
                      const isReturnSegmentSelected = isMultiSelectedEvent || (
                        isActiveSelectedEvent && selectedSegmentForEvent === 'return'
                      );
                      const isPrimaryRouteLoading = routeLoadingKeys.has(getRouteLoadingKey(event.orderId, 'primary'));
                      const isReturnRouteLoading = routeLoadingKeys.has(getRouteLoadingKey(event.orderId, 'return')) || returnTransitReprojectingId === event.orderId;
                      return (
                        <div
                          key={event.id}
                          data-order-id={event.orderId}
                          className={`ts2-event-wrap${draggedRequestId ? ' drag-active' : ''}${draggedScheduledOrderId === event.orderId ? ' dragging' : ''}${isEventSelected ? ' segment-selected' : ''}${isMultiSelectedEvent ? ' chain-member' : ''}${isCompleteTile ? ' complete' : ''}`}
                          style={{ left: `${offset}%`, width: `${width}%` }}
                          draggable={!dragSchedulingId && !isCompletedMaterialTile}
                          onDragStart={(dragEvent) => handleScheduledDragStart(dragEvent, event, request, durationMinutes, palette)}
                          onDragEnd={handleScheduledDragEnd}
                          onDragOver={(dragEvent) => handleEventSnapDragOver(dragEvent, event)}
                          onDrop={(dragEvent) => handleEventSnapDrop(dragEvent, event)}
                          onDoubleClick={(doubleClickEvent) => {
                            doubleClickEvent.preventDefault();
                            doubleClickEvent.stopPropagation();
                            const clickedSegment = doubleClickEvent.target.closest('.ts2-return-card')
                              ? 'return'
                              : doubleClickEvent.target.closest('.ts2-secondary-route-card') && !doubleClickEvent.target.closest('.ts2-event-card')
                                ? 'secondary'
                                : 'primary';
                            handleSelectScheduleChain(event.orderId, clickedSegment);
                          }}
                          onContextMenu={(menuEvent) => {
                            menuEvent.preventDefault();
                            const menuSegment = menuEvent.target.closest('.ts2-return-card')
                              ? 'return'
                              : menuEvent.target.closest('.ts2-secondary-route-card') && !menuEvent.target.closest('.ts2-event-card')
                                ? 'secondary'
                                : 'primary';
                            if (!selectedScheduleEventIdSet.has(event.orderId) || selectedScheduleEventIds.length <= 1) {
                              handleSelectScheduleEvent(event.orderId, menuSegment);
                            }
                            setManualTimeModal(null);
                            setServiceTimeModal(null);
                            setTileMenu({
                              orderId: event.orderId,
                              segment: menuSegment,
                              mode: '',
                              x: Math.max(8, Math.min(menuEvent.clientX, window.innerWidth - 296)),
                              y: Math.max(8, Math.min(menuEvent.clientY, window.innerHeight - 144)),
                            });
                          }}
                        >
                          {draggedRequestId && draggedRequestId !== event.orderId ? (
                            <div
                              className={`transport-snap-hover${dropPreview?.snapOrderId === event.orderId ? ` ${dropPreview.snapSide}` : ''}${dropPreview?.snapOrderId === event.orderId && dropPreview.blocked ? ' blocked' : ''}`}
                              aria-hidden="true"
                            />
                          ) : null}
                          {showScheduleTimestamps && actualMarkers.length > 0 ? (
                            <div className="ts2-actual-marker-layer" aria-hidden="true">
                              {actualMarkers.map(marker => (
                                <span
                                  key={`${event.orderId}-${marker.key}`}
                                  className={`ts2-actual-marker ${marker.key}`}
                                  style={{ left: `${marker.left}%` }}
                                >
                                  <span className="ts2-actual-marker-line" />
                                  <span className="ts2-actual-marker-label">{marker.label} {marker.timeLabel}</span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className={`ts2-event-card${isSecondaryRequest ? ' ts2-secondary-route-card' : ''}${isPrimarySegmentSelected ? ' selected' : ''}`}
                            style={{ backgroundColor: palette.background, color: palette.text, width: hasSecondaryRouteTile || hasReturnTransitSegment ? `${displayPrimaryWidth}%` : '100%' }}
                            aria-pressed={isPrimarySegmentSelected}
                            onClick={(clickEvent) => {
                              handleSelectScheduleEvent(event.orderId, 'primary', { additive: clickEvent.shiftKey });
                            }}
                          >
                            <span className={`ts2-delivery-type-pill ${primaryDeliveryType.tone}`}>{primaryDeliveryType.label}</span>
                            <span className="ts2-event-time">{formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} – {formatTimeChip(Math.floor(primaryEnd / 60), Math.floor(primaryEnd % 60))}</span>
                            <strong className="ts2-event-title">{eventTitle}</strong>
                            <span className="ts2-event-subtitle">{eventSubtitle}</span>
                            <span className="ts2-event-arrival">{eventArrival}</span>
                            <div className="ts2-event-status-row">
                              <span className="ts2-event-status-dot" style={{ backgroundColor: palette.accent }} />
                              <span>{isSecondaryRequest && status !== 'in_transit' ? 'Secondary transit' : isCompleteTile ? 'Complete' : scheduleStatusLabel(status)}</span>
                            </div>
                            {isPrimaryRouteLoading ? <i className="transport-route-loading-bar" aria-hidden="true" /> : null}
                          </button>
                          {hasSecondaryRouteTile ? (
                            <button
                              type="button"
                              className={`ts2-secondary-route-card${isSecondarySegmentSelected ? ' selected' : ''}`}
                              style={{ left: `${displayPrimaryWidth}%`, width: `${displaySecondaryWidth}%` }}
                              aria-pressed={isSecondarySegmentSelected}
                              onClick={(clickEvent) => {
                                handleSelectScheduleEvent(event.orderId, 'secondary', { additive: clickEvent.shiftKey });
                              }}
                            >
                              <span className={`ts2-delivery-type-pill ${secondaryDeliveryType.tone}`}>{secondaryDeliveryType.label}</span>
                              <span className="ts2-event-time">{formatTimeChip(Math.floor(secondaryStartMinutes / 60), Math.floor(secondaryStartMinutes % 60))} – {formatTimeChip(Math.floor(secondaryEndMinutes / 60), Math.floor(secondaryEndMinutes % 60))}</span>
                              <strong className="ts2-event-title">{request.secondaryRoute.destination}</strong>
                              <span className="ts2-event-subtitle">{getSecondaryRouteReasonLabel(request.secondaryRoute.reason)}</span>
                              <span className="ts2-event-arrival">ETA stop {formatTimeChip(Math.floor(secondaryArrivalMinutes / 60), Math.floor(secondaryArrivalMinutes % 60))}</span>
                              <div className="ts2-event-status-row">
                                <span className="ts2-event-status-dot" />
                                <span>Secondary transit</span>
                              </div>
                            </button>
                          ) : null}
                          {hasReturnTransitSegment ? (
                            <button
                              type="button"
                              className={`ts2-return-card${isReturnSegmentSelected ? ' selected' : ''}`}
                              style={{ left: `${nonReturnWidth}%`, width: `${returnSegmentWidth}%` }}
                              aria-pressed={isReturnSegmentSelected}
                              onClick={(clickEvent) => {
                                handleSelectScheduleEvent(event.orderId, 'return', { additive: clickEvent.shiftKey });
                              }}
                            >
                              <span className="ts2-delivery-type-pill return">Return</span>
                              <span className="ts2-event-time">{formatTimeChip(Math.floor(returnStartMinutes / 60), Math.floor(returnStartMinutes % 60))} - {formatTimeChip(Math.floor(returnEndMinutes / 60), Math.floor(returnEndMinutes % 60))}</span>
                              <strong className="ts2-event-title">Return to yard</strong>
                              <span className="ts2-event-subtitle">Yard transit</span>
                              <div className="ts2-event-status-row">
                                <span className="ts2-event-status-dot" />
                                <span>Returning</span>
                              </div>
                              {isReturnRouteLoading ? <i className="transport-route-loading-bar" aria-hidden="true" /> : null}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                      {!loadingBoard && laneEvents.length === 0 ? <div className="ts2-empty-lane" /> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!isTruckRole ? (
        <section className="transport-reference-pending">
          <ScheduleLegend statusColors={transportStatusColors} />
          <div className="transport-reference-pending-head">
            <strong>Pending Requests ({pendingRequests.length})</strong>
          </div>
          <div className="transport-reference-pending-tools">
            <label><span>Search pending requests...</span><input type="text" aria-label="Search pending requests" readOnly /></label>
          </div>
          <div className="transport-reference-pending-list">
            {pendingRequests.length > 0 ? pendingRequests.map(request => {
              return (
                <article
                  key={request.id}
                  className={`transport-reference-pending-card${draggedRequestId === request.id ? ' dragging' : ''}`}
                  draggable={!dragSchedulingId}
                  onDragStart={(event) => handlePendingDragStart(event, request)}
                  onDragEnd={handlePendingDragEnd}
                >
                  <div><b>{getScaffoldDetailText(request)}</b></div>
                  <strong>{request.builderName || 'Material Order'}</strong>
                  <span>{request.projectName || 'Awaiting site assignment'}</span>
                  <small>Requested by {request.requestedByName || 'Transport'}</small>
                  <small>Submitted {request.submittedAt ? new Date(request.submittedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pending'}</small>
                  <button type="button" onClick={() => openRequestModal(request.id)}>Schedule</button>
                </article>
              );
            }) : null}
          </div>
        </section>
      ) : null}
      {isTruckRole ? <ScheduleLegend statusColors={transportStatusColors} /> : null}
      </div>
      {scheduleInspectorOpen ? (
      <aside className="transport-schedule-inspector">
        <div className="transport-schedule-inspector-head">
          <div>
            <span>{selectedScheduleIsSecondarySegment ? 'Selected Secondary Route' : 'Selected Delivery'}</span>
            <h2>{selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute ? getSecondaryRouteReasonLabel(selectedScheduleSecondaryRoute.reason) : selectedScheduleWindowLabel}</h2>
          </div>
          {selectedScheduleRequest ? (
            <span
              className={`transport-status-pill status-${selectedScheduleEffectiveStatus}`}
              style={{
                backgroundColor: scheduleStatusAppearance(selectedScheduleEffectiveStatus, transportStatusColors).background,
                color: scheduleStatusAppearance(selectedScheduleEffectiveStatus, transportStatusColors).text,
              }}
            >
              {scheduleStatusLabel(selectedScheduleEffectiveStatus)}
            </span>
          ) : null}
          <button type="button" className="transport-inspector-close" onClick={() => setScheduleInspectorOpen(false)} aria-label="Close selected delivery panel">×</button>
        </div>
        <label className={`transport-snap-toggle transport-inspector-toggle${selectedScheduleTollsEnabled ? ' active' : ''}`}>
          <input
            type="checkbox"
            checked={selectedScheduleTollsEnabled}
            onChange={handleTollsToggle}
          />
          <span>Enable tolls</span>
        </label>
        {selectedScheduleEvent ? (
          <>
            <dl className="transport-schedule-detail-list">
              {selectedScheduleIsReturnSegment ? (
                <>
                  <div><dt>Starting Location</dt><dd>{selectedScheduleRouteContext.fromLocation || 'Site location pending'}</dd></div>
                  <div><dt>Destination</dt><dd>{YARD_LOCATION}</dd></div>
                  <div><dt>Route</dt><dd>Return to yard</dd></div>
                </>
              ) : selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute ? (
                <>
                  <div><dt>Starting Location</dt><dd>{selectedScheduleRouteContext.fromLocation || selectedScheduleSecondaryRoute.startingLocation || selectedScheduleSiteLocation || 'Site location pending'}</dd></div>
                  <div><dt>Destination</dt><dd>{selectedScheduleSecondaryRoute.destination || 'Secondary destination pending'}</dd></div>
                  <div><dt>Reason</dt><dd>{getSecondaryRouteReasonLabel(selectedScheduleSecondaryRoute.reason)}</dd></div>
                </>
              ) : (
                <>
                  {selectedScheduleRouteContext.segment === 'secondary' ? (
                    <div><dt>Starting Location</dt><dd>{selectedScheduleRouteContext.fromLocation || 'Previous site location pending'}</dd></div>
                  ) : null}
                  <div><dt>Builder</dt><dd>{selectedScheduleEvent.builderName || 'Material Order'}</dd></div>
                  <div><dt>Project</dt><dd>{selectedScheduleEvent.projectName || 'Scheduled delivery'}</dd></div>
                  <div><dt>Destination</dt><dd>{selectedScheduleRouteContext.siteLocation || 'Site location pending'}</dd></div>
                  <div><dt>Scaffold System</dt><dd>{selectedScheduleEvent.scaffoldingSystem || selectedScheduleRequest?.scaffoldingSystem || '-'}</dd></div>
                </>
              )}
            </dl>
            <div className="transport-schedule-estimate-card">
              {selectedScheduleIsReturnSegment ? (
                <>
                  <div><span><InspectorIcon type="return" /> Return travel <TrafficDelayBadge minutes={selectedScheduleTravelTrafficDelayMinutes} /></span><strong>{selectedScheduleContextRouteEstimate ? `${Math.max(1, Math.round(selectedScheduleContextRouteEstimate.durationMinutes || 0))} min` : selectedScheduleTiming?.returnMinutes ? `${selectedScheduleTiming.returnMinutes} min` : 'Pending'}</strong></div>
                  <div><span><InspectorIcon type="clock" /> Return Total</span><strong>{selectedScheduleContextRouteEstimate ? `${Math.max(1, Math.round(selectedScheduleContextRouteEstimate.durationMinutes || 0))} min` : selectedScheduleTiming?.returnMinutes ? `${selectedScheduleTiming.returnMinutes} min` : 'Calculating'}</strong></div>
                </>
              ) : selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute ? (
                <>
                  <div><span><InspectorIcon type="truck" /> Travel to stop <TrafficDelayBadge minutes={selectedScheduleTravelTrafficDelayMinutes} /></span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.transitMinutes} min` : `${Math.round((selectedScheduleSecondaryRoute.travelDurationSeconds || 0) / 60)} min`}</strong></div>
                  <div><span><InspectorIcon type="map" /> Stop service</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.loadingMinutes} min` : `${Math.max(0, Number(selectedScheduleSecondaryRoute.serviceMinutes) || 0)} min`}</strong></div>
                  {selectedScheduleEffectiveReturnTransit ? (
                    <div><span><InspectorIcon type="return" /> Return to yard</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.returnMinutes} min` : `${Math.round((selectedScheduleSecondaryRoute.returnDurationSeconds || 0) / 60)} min`}</strong></div>
                  ) : null}
                  <div><span><InspectorIcon type="clock" /> Secondary Total</span><strong>{selectedScheduleTiming ? `${Math.floor(selectedScheduleTiming.totalMinutes / 60)} h ${selectedScheduleTiming.totalMinutes % 60} m` : `${Math.round((selectedScheduleSecondaryRoute.travelDurationSeconds || 0) / 60) + Math.max(0, Number(selectedScheduleSecondaryRoute.serviceMinutes) || 0)} min`}</strong></div>
                </>
              ) : (
                <>
                  <div><span><InspectorIcon type="truck" /> Travel <TrafficDelayBadge minutes={selectedScheduleTravelTrafficDelayMinutes} /></span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.transitMinutes} min` : 'Pending'}</strong></div>
                  <div><span><InspectorIcon type="unload" /> Unload</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.loadingMinutes} min` : '30 min'}</strong></div>
                  {selectedScheduleRequest?.secondaryRoute ? (
                <div><span><InspectorIcon type="map" /> {getSecondaryRouteReasonLabel(selectedScheduleRequest.secondaryRoute.reason)}</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.secondaryTravelMinutes + selectedScheduleTiming.secondaryServiceMinutes} min` : 'Pending'}</strong></div>
                  ) : null}
                  {selectedScheduleEffectiveReturnTransit ? (
                    <div><span><InspectorIcon type="return" /> Return</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.returnMinutes} min` : 'Pending'}</strong></div>
                  ) : null}
                  <div><span><InspectorIcon type="clock" /> Total Duration</span><strong>{selectedScheduleTiming ? `${Math.floor(selectedScheduleTiming.totalMinutes / 60)} h ${selectedScheduleTiming.totalMinutes % 60} m` : 'Calculating'}</strong></div>
                </>
              )}
            </div>
            {selectedScheduleActualTiming ? (
              <div className="transport-schedule-actual-card">
                <div>
                  <span><InspectorIcon type="truck" /> Actual Travel</span>
                  <strong>{formatActualDuration(selectedScheduleActualTiming.travelMinutes)}</strong>
                  <small>{selectedScheduleActualTiming.startedAt ? `Started ${selectedScheduleActualTiming.startedAt}` : 'Start pending'}</small>
                  <small>{selectedScheduleActualTiming.unloadingAt ? `Arrived ${selectedScheduleActualTiming.unloadingAt}` : 'Arrival pending'}</small>
                </div>
                <div>
                  <span><InspectorIcon type="unload" /> Actual Unload</span>
                  <strong>{formatActualDuration(selectedScheduleActualTiming.unloadMinutes)}</strong>
                  <small>{selectedScheduleActualTiming.unloadingAt ? `Offloading ${selectedScheduleActualTiming.unloadingAt}` : 'Offload pending'}</small>
                  <small>{selectedScheduleActualTiming.confirmedAt ? `Completed ${selectedScheduleActualTiming.confirmedAt}` : 'Completion pending'}</small>
                </div>
              </div>
            ) : null}
            <label className={`transport-snap-toggle transport-inspector-toggle${selectedScheduleReturnTransitToggleActive ? ' active' : ''}`}>
              <input
                type="checkbox"
                checked={selectedScheduleReturnTransitToggleActive}
                disabled={!selectedScheduleCanToggleReturnTransit}
                onChange={handleReturnTransitToggle}
              />
              <span>Return transit to yard</span>
            </label>
            <h3 className="transport-panel-section-title">Route Preview</h3>
            <RouteMapCanvas
              className="transport-schedule-inspector-map"
              routeData={selectedScheduleRouteData}
              loading={selectedScheduleRouteLoading}
              siteLocation={selectedScheduleRouteContext.siteLocation}
              expandable
              viewerTitle={selectedScheduleRouteContext.title}
              originLabel={selectedScheduleRouteContext.segment === 'return' ? 'Site' : selectedScheduleRouteContext.segment === 'secondary' ? 'Previous site' : 'Yard'}
              destinationLabel={selectedScheduleRouteContext.segment === 'return' ? 'Yard' : 'Site'}
            />
            <h3 className="transport-panel-section-title">Weather & Traffic</h3>
            <div className="transport-weather-grid">
              <div><span className="transport-weather-icon weather"><InspectorIcon type="sun" /></span><strong>18C</strong><span>Sunny</span></div>
              <div><span className="transport-weather-icon traffic"><InspectorIcon type="traffic" /></span><strong>{selectedScheduleTrafficCopy.title}</strong><span>{selectedScheduleTrafficCopy.detail}</span></div>
            </div>
            <h3 className="transport-panel-section-title">Recommended Time Slot</h3>
            <div className="transport-schedule-recommendation">
              <div>
                <strong>{selectedScheduleWindowLabel}</strong>
                <small>{selectedScheduleTiming ? `Allow ${selectedScheduleTiming.totalMinutes} min total cycle` : 'Add a project site location to improve recommendations.'}</small>
              </div>
              <InspectorIcon type="spark" />
            </div>
            <button type="button" className="transport-management-save transport-inspector-action transport-inspector-pdf-action" disabled={!selectedScheduleRequest?.pdfPath} onClick={() => handleOpenPdf(selectedScheduleRequest)}><InspectorIcon type="file" /> PDF Picking Card</button>
            <div className="transport-schedule-timeline">
              <strong>Driver Status Timeline</strong>
              {selectedScheduleActionRows.length > 0 ? selectedScheduleActionRows.map(row => <div key={row.key} className="transport-timeline-row"><i /><span>{row.label}</span><b>{row.value}</b></div>) : <p>No driver status updates yet.</p>}
            </div>
          </>
        ) : (
          <p className="transport-schedule-empty-inspector">Select a block on the schedule board to review route, status, and PDF details.</p>
        )}
      </aside>
      ) : null}
      </div>

      {tileMenu ? (
        <div
          className={`transport-tile-menu${manualTimeModal || serviceTimeModal ? ' set-time-open' : ''}`}
          style={{ left: tileMenu.x, top: tileMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          {tileMenuCanEditService ? (
            <button type="button" role="menuitem" onClick={() => openServiceTimeEditor(tileMenu.orderId, tileMenu.segment || 'primary')} disabled={Boolean(dragSchedulingId)}>
              <span>{tileMenuServiceLabel}</span>
            </button>
          ) : null}
          {serviceTimeModal && tileMenuCanEditService ? (
            <form className="transport-tile-time-editor" onSubmit={handleServiceTimeSave}>
              <div className="transport-tile-time-editor-head">
                <span>{serviceTimeModal.segment === 'secondary' ? 'Service time' : 'Unload time'}</span>
                <strong>{serviceTimeRequest?.builderName || serviceTimeRequest?.secondaryRoute?.destination || serviceTimeEvent?.builderName || 'Selected tile'}</strong>
              </div>
              <div className="transport-tile-time-row transport-tile-service-row">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="240"
                  step="5"
                  value={serviceTimeModal.value}
                  onChange={(inputEvent) => setServiceTimeModal(current => current ? { ...current, value: inputEvent.target.value, error: '' } : current)}
                  autoFocus
                />
                <b>min</b>
              </div>
              {serviceTimeModal.error ? <p className="transport-tile-time-error">{serviceTimeModal.error}</p> : null}
              <div className="transport-tile-time-actions">
                <button type="button" onClick={closeServiceTimeEditor}>Cancel</button>
                <button type="submit">Apply</button>
              </div>
            </form>
          ) : null}
          {!tileMenuIsDeleteOnly ? (
            <>
              {!tileMenuIsReturnSegment ? (
                <button type="button" role="menuitem" onClick={() => openManualScheduleTime(tileMenu.orderId, tileMenuSelectionIds)} disabled={Boolean(dragSchedulingId)}>
                  <span>Set start time</span>
                </button>
              ) : null}
              {manualTimeModal && !tileMenuIsReturnSegment ? (
                <form className="transport-tile-time-editor" onSubmit={handleManualScheduleTime}>
                  <div className="transport-tile-time-editor-head">
                    <span>Start time</span>
                    <strong>{manualTimeModal.requestIds?.length > 1 ? `${manualTimeModal.requestIds.length} selected tiles` : manualTimeRequest?.builderName || manualTimeEvent?.builderName || 'Selected tile'}</strong>
                  </div>
                  <div className="transport-tile-time-row">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualTimeModal.value}
                      placeholder="8:30"
                      onChange={(inputEvent) => setManualTimeModal(current => current ? { ...current, value: inputEvent.target.value, error: '' } : current)}
                      autoFocus
                    />
                    <div className="transport-tile-ampm-toggle" aria-label="Start time period">
                      {['AM', 'PM'].map(period => (
                        <button
                          key={period}
                          type="button"
                          className={manualTimeModal.meridiem === period ? 'active' : ''}
                          onClick={() => setManualTimeModal(current => current ? { ...current, meridiem: period, error: '' } : current)}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>
                  {manualTimeModal.error ? <p className="transport-tile-time-error">{manualTimeModal.error}</p> : null}
                  <div className="transport-tile-time-actions">
                    <button type="button" onClick={closeManualScheduleTime}>Cancel</button>
                    <button type="submit">Apply</button>
                  </div>
                </form>
              ) : null}
              <button type="button" role="menuitem" onClick={() => openSecondaryRouteModal(tileMenu.orderId, tileMenu.segment || 'primary')} disabled={Boolean(dragSchedulingId)}>
                <span>Add external route</span>
              </button>
              <button type="button" role="menuitem" onClick={() => handleUnscheduleOrder(tileMenuSelectionIds, { segment: tileMenu.segment })} disabled={Boolean(dragSchedulingId)}>
                <span>{tileMenuIsReturnSegment ? 'Remove return to yard' : tileMenuSelectionIds.length > 1 ? `Unschedule ${tileMenuSelectionIds.length} orders` : 'Unschedule order'}</span>
              </button>
            </>
          ) : null}
          {!tileMenuIsReturnSegment ? (
            <button type="button" role="menuitem" className="danger" onClick={() => handleDeleteScheduledOrder(tileMenuSelectionIds)} disabled={Boolean(dragSchedulingId)}>
              <span>{tileMenuIsCompletedMaterialOrder && !debugMode ? 'Remove from schedule' : tileMenuSelectionIds.length > 1 ? `Delete ${tileMenuSelectionIds.length} orders` : 'Delete order'}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {secondaryRouteModal ? (
        <div className="ts2-modal-root">
          <div className="ts2-modal-backdrop" onClick={closeSecondaryRouteModal} />
          <form className="transport-secondary-route-card" onSubmit={handleSecondaryRouteSave}>
            <div className="transport-secondary-route-head">
              <div>
                <span>Secondary Route</span>
                <h2>Add another stop</h2>
                <p>Extend this scheduled delivery with a second route leg and return timing.</p>
              </div>
              <button type="button" className="transport-manual-time-close" onClick={closeSecondaryRouteModal} aria-label="Close secondary route panel">×</button>
            </div>
            <label className="transport-manual-time-field">
              <span>Reason</span>
              <select
                value={secondaryRouteModal.reason}
                onChange={(inputEvent) => {
                  const nextReason = inputEvent.target.value;
                  setSecondaryRouteModal(current => current ? {
                    ...current,
                    reason: nextReason,
                    linkedRequestId: nextReason === 'material_pick_up' ? current.linkedRequestId : '',
                    linkedRequestLabel: nextReason === 'material_pick_up' ? current.linkedRequestLabel : '',
                    linkedRequestSiteLocation: nextReason === 'material_pick_up' ? current.linkedRequestSiteLocation : '',
                    error: '',
                  } : current);
                }}
              >
                {SECONDARY_ROUTE_REASON_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {secondaryRouteModal.reason === 'material_pick_up' ? (
              <label className="transport-manual-time-field">
                <span>Material order (optional)</span>
                <select
                  value={secondaryRouteModal.linkedRequestId || ''}
                  onChange={(inputEvent) => {
                    const selectedOrder = (secondaryRouteModal.pendingOptions || []).find(option => option.id === inputEvent.target.value) || null;
                    setSecondaryRouteModal(current => current ? {
                      ...current,
                      ...getLinkedSecondaryRequestFields(selectedOrder),
                      destination: selectedOrder?.siteLocation || current.destination,
                      selectedAddressSourceId: selectedOrder ? `pending-${selectedOrder.id}` : '',
                      error: '',
                    } : current);
                    if (selectedOrder) {
                      setSecondaryAddressSuggestions([]);
                    }
                  }}
                >
                  <option value="">Select an unscheduled material order...</option>
                  {(secondaryRouteModal.pendingOptions || []).map(option => (
                    <option key={option.id} value={option.id}>{option.displayLabel || option.label}</option>
                  ))}
                </select>
                {(secondaryRouteModal.pendingOptions || []).length === 0 ? (
                  <small className="transport-linked-order-note">No unscheduled material orders are available.</small>
                ) : null}
                {secondaryRouteModal.linkedRequestId ? (
                  <small className="transport-linked-order-note">Selected order will be added as this secondary stop.</small>
                ) : null}
              </label>
            ) : null}
            <label className="transport-manual-time-field">
              <span>Service time</span>
              <div className="transport-service-time-input">
                <input
                  type="number"
                  min="0"
                  max="240"
                  step="5"
                  value={secondaryRouteModal.serviceMinutes}
                  onChange={(inputEvent) => setSecondaryRouteModal(current => current ? { ...current, serviceMinutes: inputEvent.target.value, error: '' } : current)}
                />
                <b>min</b>
              </div>
            </label>
            <label className="transport-manual-time-field">
              <span>Secondary destination</span>
              <div className="transport-address-autocomplete">
                <input
                  type="text"
                  value={secondaryRouteModal.destination}
                  onChange={(inputEvent) => setSecondaryRouteModal(current => current ? {
                    ...current,
                    destination: inputEvent.target.value,
                    selectedAddressSourceId: '',
                    linkedRequestId: '',
                    linkedRequestLabel: '',
                    linkedRequestSiteLocation: '',
                    error: '',
                  } : current)}
                  placeholder="Start typing the second stop address"
                  autoComplete="off"
                />
                {(secondaryAddressLoading || secondaryAddressSuggestions.length > 0) ? (
                  <div className="transport-address-suggestions" role="listbox">
                    {secondaryAddressSuggestions.map(suggestion => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className="transport-address-suggestion"
                        onClick={() => {
                          setSecondaryRouteModal(current => {
                            if (!current) return current;
                            const shouldLinkOrder = current.reason === 'material_pick_up' && suggestion.linkedRequestId;
                            return {
                              ...current,
                              destination: suggestion.address,
                              selectedAddressSourceId: suggestion.id,
                              linkedRequestId: shouldLinkOrder ? suggestion.linkedRequestId : '',
                              linkedRequestLabel: shouldLinkOrder ? suggestion.linkedRequestLabel : '',
                              linkedRequestSiteLocation: shouldLinkOrder ? suggestion.linkedRequestSiteLocation : '',
                              error: '',
                            };
                          });
                          setSecondaryAddressSuggestions([]);
                        }}
                        role="option"
                      >
                        <strong>{suggestion.address}</strong>
                        <span>{suggestion.source}{suggestion.label && suggestion.label !== suggestion.address ? ` - ${suggestion.label}` : ''}</span>
                      </button>
                    ))}
                    {secondaryAddressLoading ? <div className="transport-address-suggestion loading">Searching addresses...</div> : null}
                  </div>
                ) : null}
              </div>
            </label>
            {secondaryRouteModal.error ? <p className="transport-manual-time-error">{secondaryRouteModal.error}</p> : null}
            <div className="transport-manual-time-actions">
              <button type="button" className="transport-manual-time-secondary" onClick={closeSecondaryRouteModal} disabled={secondaryRouteSaving}>Cancel</button>
              <button type="submit" className="transport-manual-time-primary" disabled={secondaryRouteSaving}>{secondaryRouteSaving ? 'Saving…' : 'Save Secondary Route'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {(requestModal || requestModalLoading) ? (
        <div className="ts2-modal-root">
          <div className="ts2-modal-backdrop" onClick={closeRequestModal} />
          <div className="ts2-modal-card">
            {requestModalLoading ? (
              <div className="ts2-modal-loading">Loading request details…</div>
            ) : requestModal ? (
              <>
                <div className="ts2-modal-head">
                  <div>
                    <span className="ts2-eyebrow">Schedule Delivery</span>
                    <h2>{requestModal.request.builderName || 'Material Order'}</h2>
                    <p>{requestModal.request.projectName || 'Scheduled delivery'}</p>
                  </div>
                  <button type="button" className="ts2-close-btn" onClick={closeRequestModal}>×</button>
                </div>
                <RouteMapCanvas
                  className="ts2-compact-map"
                  routeData={requestModalRouteData}
                  loading={requestModalRouteLoading}
                  siteLocation={requestModal.siteLocation}
                  expandable
                  viewerTitle="Request Route"
                  originLabel={requestModal.routeContext?.segment === 'return' ? 'Site' : requestModal.routeContext?.segment === 'secondary' ? 'Previous site' : 'Yard'}
                  destinationLabel={requestModal.routeContext?.segment === 'return' ? 'Yard' : 'Site'}
                />
                <div className="ts2-estimate-grid">
                  <div><span>{requestModal.routeContext?.segment === 'secondary' ? 'Transit from parent site' : 'Transit from yard'}</span><strong>{requestModalSummary.deliveryFromYard}</strong></div>
                  <div><span>Site loading</span><strong>{requestModalSummary.siteLoading}</strong></div>
                  {requestModalSummary.secondaryRoute ? <div><span>Secondary route</span><strong>{requestModalSummary.secondaryRoute}</strong></div> : null}
                  {requestModalSummary.returnTransit ? <div><span>Return transit</span><strong>{requestModalSummary.returnTransit}</strong></div> : null}
                  <div><span>Overall</span><strong>{requestModalSummary.overall}</strong></div>
                </div>
                <MiniScheduleStrip
                  laneEvents={groupedEventsByTruck}
                  lanes={TRUCK_LANES}
                  selectedTruckId={selectedTruckId}
                  selectedHour={selectedHour}
                  selectedMinute={selectedMinute}
                  dayEvents={dayEvents}
                  startMap={eventStartMinutesMap}
                  durationMap={eventDurationMinutesMap}
                  currentDurationMinutes={selectedRouteDurationMinutes}
                  selectedDate={selectedDate}
                  onSelectSlot={(truckId, hour, minute) => {
                    setSelectedTruckId(truckId);
                    setSelectedHour(hour);
                    setSelectedMinute(minute);
                  }}
                />
                <div className="ts2-modal-controls">
                  <button type="button" className="ts2-time-btn" onClick={() => setTimePickerVisible(true)}>
                    <strong>{formatTimeChip(selectedHour, selectedMinute)}</strong>
                    <span>Manual time selection</span>
                  </button>
                  <div className="ts2-truck-pills">
                    {TRUCK_LANES.map(lane => (
                      <button
                        key={lane.id}
                        type="button"
                        className={`ts2-truck-select${selectedTruckId === lane.id ? ' active' : ''}`}
                        onClick={() => setSelectedTruckId(lane.id)}
                      >
                        {lane.rego}
                      </button>
                    ))}
                  </div>
                </div>
                {requestModalActionRows.length > 0 ? (
                  <div className="ts2-action-rows">
                    {requestModalActionRows.map(row => (
                      <div key={row.key}><span>{row.label}</span><strong>{row.value}</strong></div>
                    ))}
                  </div>
                ) : null}
                <div className="ts2-modal-actions">
                  <button type="button" className="ts2-secondary-btn" onClick={closeRequestModal}>Close</button>
                  <button type="button" className="ts2-primary-btn solid" disabled={scheduleSaving} onClick={handleSchedule}>{scheduleSaving ? 'Saving…' : 'Schedule Order'}</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {timePickerVisible ? (
        <div className="ts2-modal-root">
          <div className="ts2-modal-backdrop" onClick={() => setTimePickerVisible(false)} />
          <div className="ts2-time-picker-card">
            <div className="ts2-time-picker-head">
              <strong>Select Delivery Time</strong>
              <button type="button" className="ts2-close-btn" onClick={() => setTimePickerVisible(false)}>×</button>
            </div>
            <div className="ts2-time-picker-list">
              {timeOptions.map(option => (
                <button
                  key={`${option.hour}-${option.minute}`}
                  type="button"
                  disabled={option.isPast}
                  className={`ts2-time-option${selectedHour === option.hour && selectedMinute === option.minute ? ' active' : ''}${option.isPast ? ' disabled' : ''}`}
                  onClick={() => {
                    setSelectedHour(option.hour);
                    setSelectedMinute(option.minute);
                    setTimePickerVisible(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {(eventOverviewModal || eventOverviewLoading) ? (
        <div className="transport-route-modal-root">
          <div className="transport-route-modal-backdrop" onClick={closeEventOverview} />
          <div className="transport-route-modal-shell management">
            {eventOverviewLoading ? (
              <div className="ts2-modal-loading">Loading delivery overview…</div>
            ) : eventOverviewModal ? (
              <>
                <RouteMapCanvas
                  className="transport-route-modal-map"
                  routeData={eventOverviewRouteData}
                  loading={eventOverviewRouteLoading}
                  siteLocation={eventOverviewModal.siteLocation}
                  interactive
                  originLabel={eventOverviewModal.routeContext?.segment === 'return' ? 'Site' : eventOverviewModal.routeContext?.segment === 'secondary' ? 'Previous site' : 'Yard'}
                  destinationLabel={eventOverviewModal.routeContext?.segment === 'return' ? 'Yard' : 'Site'}
                />
                <div className="transport-route-modal-top">
                  <div>
                    <h2>Delivery Route</h2>
                    <p>{eventOverviewModal.event.builderName || 'Material Order'} · {eventOverviewModal.event.projectName || 'Scheduled delivery'}</p>
                  </div>
                  <button type="button" className="transport-route-close" onClick={closeEventOverview}>×</button>
                </div>
                {eventOverviewRouteData ? (
                  <div className="transport-route-hero-pill">
                    <strong>{formatDuration(eventOverviewRouteData.durationSeconds)} · {formatDistance(eventOverviewRouteData.distanceMeters)}</strong>
                    <span>{eventOverviewModal.cycleState?.groupedCompletedCycle ? 'Completed delivery cycle' : scheduleStatusLabel(getEffectiveDeliveryStatus(eventOverviewModal.request, eventOverviewModal.cycleState))}</span>
                  </div>
                ) : null}
                <div className="transport-route-modal-bottom">
                  <div className="transport-route-info-card">
                    <div className="transport-route-info-row"><span>Destination</span><strong>{eventOverviewModal.siteLocation || 'No site location saved for this project yet.'}</strong></div>
                    <div className="transport-route-info-row"><span>Truck</span><strong>{eventOverviewModal.event.truckLabel || 'ESS Transport'}</strong></div>
                    <div className="transport-route-info-row"><span>Status</span><strong>{eventOverviewModal.cycleState?.groupedCompletedCycle ? 'Completed delivery cycle' : scheduleStatusLabel(getEffectiveDeliveryStatus(eventOverviewModal.request, eventOverviewModal.cycleState))}</strong></div>
                  </div>
                  {overviewSummary ? (
                    <div className="transport-route-info-card">
                      <div className="transport-route-info-row"><span>Scheduled</span><strong>{formatBoardDay(eventOverviewModal.event.date)} · {formatTimeChip(eventOverviewModal.event.hour, eventOverviewModal.event.minute)}</strong></div>
                    <div className="transport-route-info-row"><span>Transit from yard</span><strong>{overviewSummary.deliveryFromYard}</strong></div>
                    <div className="transport-route-info-row"><span>Site loading</span><strong>{overviewSummary.siteLoading}</strong></div>
                    {overviewSummary.secondaryRoute ? <div className="transport-route-info-row"><span>Secondary route</span><strong>{overviewSummary.secondaryRoute}</strong></div> : null}
                    {overviewSummary.returnTransit ? <div className="transport-route-info-row"><span>Return transit</span><strong>{overviewSummary.returnTransit}</strong></div> : null}
                    <div className="transport-route-info-row"><span>Overall planned</span><strong>{overviewSummary.overall}</strong></div>
                    </div>
                  ) : null}
                  {overviewActionRows.length > 0 ? (
                    <div className="transport-route-info-card">
                      {overviewActionRows.map(row => (
                        <div key={row.key} className="transport-route-info-row"><span>{row.label}</span><strong>{row.value}</strong></div>
                      ))}
                    </div>
                  ) : null}
                  <div className="transport-route-actions">
                    {eventOverviewModal.siteLocation ? (
                      <a className="transport-inline-btn link" href={`https://maps.google.com/?q=${encodeURIComponent(eventOverviewModal.siteLocation)}`} target="_blank" rel="noreferrer">Open in Maps</a>
                    ) : null}
                    <button type="button" className="transport-inline-btn primary" disabled={!eventOverviewModal.request?.pdfPath} onClick={() => handleOpenPdf(eventOverviewModal.request)}>Open Materials PDF</button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
