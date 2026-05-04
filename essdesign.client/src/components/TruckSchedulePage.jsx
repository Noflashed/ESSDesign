import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analysisAPI, materialOrderRequestsAPI, safetyProjectsAPI } from '../services/api';
import RouteMapCanvas from './transport/RouteMapCanvas';
import {
  ESS_NAVY,
  ESS_ORANGE,
  SCREEN_END_HOUR,
  SCREEN_START_HOUR,
  TRUCK_LANES,
  YARD_LOCATION,
  buildScheduleIso,
  deliveredTileAppearance,
  eventTruckIndex,
  findProjectLocation,
  formatActionTimestamp,
  formatBoardDay,
  formatDistance,
  formatDuration,
  formatTimeChip,
  getCachedRouteData,
  getCachedRouteDataBetween,
  getCachedRouteEstimate,
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
  minutesFromIsoOnDate,
  projectRequestWindow,
  requestToCalendarEvent,
  scheduleStatusAppearance,
  scheduleStatusLabel,
  startOfDay,
  formatDateKey,
} from './transport/transportUtils';

const SCALE_MODES = {
  standard: { label: 'Hourly', pxPerHour: 150, tickMinutes: 60, labelEveryMinutes: 60 },
  detailed: { label: '10 min', pxPerHour: 260, tickMinutes: 10, labelEveryMinutes: 30 },
  fine: { label: '5 min', pxPerHour: 360, tickMinutes: 5, labelEveryMinutes: 30 },
  ultraFine: { label: '1 min', pxPerHour: 720, tickMinutes: 1, labelEveryMinutes: 30 },
};
const SCALE_ORDER = ['standard', 'detailed', 'fine', 'ultraFine'];
const LIVE_REFRESH_MS = 3000;
const LANE_META_WIDTH = 154;
const TRACK_GUTTER = 14;
const TRACK_OFFSET = LANE_META_WIDTH + TRACK_GUTTER;
const TIME_PICKER_MINUTE_STEP = 15;
const DRAG_SCHEDULE_MINUTE_STEP = 1;
const SNAP_EDGE_THRESHOLD_MINUTES = 10;
const OPTIMISTIC_OVERRIDE_TTL_MS = 60000;
const SCALE_PREF_KEY = 'transport_web_schedule_scale_v1';
const SNAP_PREF_KEY = 'transport_web_schedule_snap_v1';
const TOLLS_PREF_KEY = 'transport_web_schedule_tolls_v1';
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

function getSecondaryRouteReasonLabel(reason) {
  return SECONDARY_ROUTE_REASON_OPTIONS.find(option => option.value === reason)?.label || 'Secondary route';
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

function getSecondaryRouteTiming(secondaryRoute, includeReturnTransitToYard = true) {
  const transitMinutes = Math.max(1, Math.round((secondaryRoute?.travelDurationSeconds || 0) / 60));
  const loadingMinutes = Math.max(0, Number(secondaryRoute?.serviceMinutes) || 0);
  const returnMinutes = Math.max(1, Math.round((secondaryRoute?.returnDurationSeconds || 0) / 60));
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

function buildBoardState(requestsForDay, routeMap, nowOverride = null, includeReturnTransitToYard = false) {
  const dateKey = requestsForDay[0]?.scheduledDate || formatDateKey(new Date());
  const groupedByTruck = new Map();
  const now = nowOverride instanceof Date && !Number.isNaN(nowOverride.getTime()) ? nowOverride : new Date();
  const dayEvents = [];
  const durationMap = {};
  const startMap = {};
  const primaryDurationMap = {};
  const cycleStateMap = {};
  const secondaryContinuationBySourceId = new Map();

  requestsForDay.forEach(request => {
    if (isSecondaryRouteRequest(request) && request.sourceOrderId && request.scheduledDate === dateKey && !request.archivedAt) {
      secondaryContinuationBySourceId.set(request.sourceOrderId, request);
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
    let cumulativeShiftMinutes = 0;
    let laneCursorMinutes = SCREEN_START_HOUR * 60;
    truckRequests
      .sort((left, right) => {
        const leftStart = (left.scheduledHour ?? SCREEN_START_HOUR) * 60 + (left.scheduledMinute ?? 0);
        const rightStart = (right.scheduledHour ?? SCREEN_START_HOUR) * 60 + (right.scheduledMinute ?? 0);
        if (leftStart !== rightStart) {
          return leftStart - rightStart;
        }
        return String(left.submittedAt || '').localeCompare(String(right.submittedAt || ''));
      })
      .forEach((request, index, ordered) => {
        const continuation = secondaryContinuationBySourceId.get(request.id);
        const continuationTruckId = continuation?.scheduledTruckId ?? continuation?.truckId ?? null;
        const hasSecondaryContinuation = !isSecondaryRouteRequest(request) && continuationTruckId === truckId;
        const baseTiming = isSecondaryRouteRequest(request)
          ? getSecondaryRouteTiming(request.secondaryRoute, includeReturnTransitToYard)
          : getTimingProfile(routeMap[request.id] ?? null, null);
        const timing = hasSecondaryContinuation || !includeReturnTransitToYard
          ? removeReturnLegFromTiming(baseTiming)
          : baseTiming;
        const scheduledStart = (request.scheduledHour ?? SCREEN_START_HOUR) * 60 + (request.scheduledMinute ?? 0);
        const shiftedScheduledStart = Math.max(
          SCREEN_START_HOUR * 60,
          scheduledStart + Math.max(0, cumulativeShiftMinutes),
          laneCursorMinutes,
        );
        const projected = projectRequestWindow(
          request,
          timing,
          dateKey,
          now,
          shiftedScheduledStart,
        );
        const startMinutes = projected.startMinutes;
        const durationMinutes = projected.durationMinutes;
        const primaryDurationMinutesValue = projected.primaryDurationMinutes;
        laneCursorMinutes = Math.max(laneCursorMinutes, projected.projectedEndMinutes, projected.plannedEndMinutes);
        cumulativeShiftMinutes = Math.max(0, projected.projectedEndMinutes - projected.plannedEndMinutes);
        startMap[request.id] = startMinutes;
        durationMap[request.id] = durationMinutes;
        primaryDurationMap[request.id] = primaryDurationMinutesValue;
        cycleStateMap[request.id] = {
          groupedCompletedCycle: projected.groupedCompletedCycle,
          showReturnTransitTile: projected.showReturnTransitTile,
          returnTransitEndMinutes: projected.returnTransitEndMinutes,
          isLastScheduledForDay: index === ordered.length - 1,
          hasSecondaryContinuation,
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

function buildCachedRouteMapForRequests(requestsForDay, siteLocationMap, fallbackDate, enableTolls = false) {
  return Object.fromEntries(
    requestsForDay.map(request => {
      if (isSecondaryRouteRequest(request)) {
        return [request.id, null];
      }

      const siteLocation = siteLocationMap[request.id] || '';
      return [
        request.id,
        siteLocation
          ? getCachedRouteEstimateValue(
            siteLocation,
            applyRouteMode(buildRouteScheduleFromRequest(request, fallbackDate), enableTolls),
          ) ?? null
          : null,
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
    request?.routeType,
    request?.sourceOrderId,
    request?.builderName,
    request?.projectName,
    request?.scaffoldingSystem,
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

function getEdgeSnapCandidate({ requestId, truckId, startMinutes, durationMinutes, dayEvents, startMap, durationMap, thresholdMinutes = SNAP_EDGE_THRESHOLD_MINUTES }) {
  const endMinutes = startMinutes + durationMinutes;
  let best = null;
  dayEvents.forEach(event => {
    if (event.truckId !== truckId || event.orderId === requestId) {
      return;
    }
    const existingStart = startMap[event.orderId] ?? event.hour * 60 + event.minute;
    const existingEnd = existingStart + (durationMap[event.orderId] ?? 90);
    const beforeDistance = Math.abs(endMinutes - existingStart);
    const afterDistance = Math.abs(startMinutes - existingEnd);
    if (beforeDistance <= thresholdMinutes && (!best || beforeDistance < best.distance)) {
      best = {
        event,
        side: 'before',
        minutes: clampScheduleMinutes(existingStart - durationMinutes, durationMinutes),
        distance: beforeDistance,
      };
    }
    if (afterDistance <= thresholdMinutes && (!best || afterDistance < best.distance)) {
      best = {
        event,
        side: 'after',
        minutes: clampScheduleMinutes(existingEnd, durationMinutes),
        distance: afterDistance,
      };
    }
  });
  return best;
}

function sameDropPreview(left, right) {
  return Boolean(left)
    && left.truckId === right.truckId
    && left.minutes === right.minutes
    && left.durationMinutes === right.durationMinutes
    && Boolean(left.blocked) === Boolean(right.blocked)
    && left.snapOrderId === right.snapOrderId
    && left.snapSide === right.snapSide;
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

function buildEstimateSummary(selectedDate, hour, minute, routeEstimate, hasSiteLocation, secondaryRoute = null, includeReturnTransitToYard = true) {
  const transitMinutes = routeEstimate?.durationMinutes ? Math.round(routeEstimate.durationMinutes) : 0;
  const loadingMinutes = 30;
  const secondaryTravelMinutes = secondaryRoute?.travelDurationSeconds ? Math.round(secondaryRoute.travelDurationSeconds / 60) : 0;
  const secondaryServiceMinutes = secondaryRoute ? Math.max(0, Number(secondaryRoute.serviceMinutes) || 0) : 0;
  const returnMinutes = secondaryRoute?.returnDurationSeconds
    ? Math.round(secondaryRoute.returnDurationSeconds / 60)
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

function applyRouteMode(schedule = {}, enableTolls = false) {
  return {
    ...schedule,
    enableTolls,
  };
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

function ReturnMovementTruckIcon() {
  return (
    <svg width="22" height="16" viewBox="0 0 28 20" fill="none" aria-hidden="true">
      <path d="M2 6.5h15.5v8H2z" fill="#F47C20" />
      <path d="M17.5 9h4.7l3.3 3.2v2.3h-8z" fill="#102B5C" />
      <path d="M4 5h10" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity=".9" />
      <circle cx="7" cy="16" r="2.2" fill="#111827" />
      <circle cx="21" cy="16" r="2.2" fill="#111827" />
      <circle cx="7" cy="16" r=".9" fill="#fff" />
      <circle cx="21" cy="16" r=".9" fill="#fff" />
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

function ScheduleLegend() {
  return (
    <div className="transport-reference-legend">
      <span className="transport-reference-legend-label">Legend:</span>
      <span className="transport-reference-legend-icon-item"><InspectorIcon type="truck" />Travel</span>
      <span className="transport-reference-legend-icon-item"><InspectorIcon type="unload" />Unload</span>
      <span className="transport-reference-legend-icon-item"><InspectorIcon type="return" />Return</span>
      <span className="transport-reference-legend-pill scheduled">Scheduled</span>
      <span className="transport-reference-legend-pill in-transit">In Transit</span>
      <span className="transport-reference-legend-pill unloading">Unloading</span>
      <span className="transport-reference-legend-pill complete">Complete</span>
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
  const [enableTolls, setEnableTolls] = useState(() => {
    const saved = localStorage.getItem(`${TOLLS_PREF_KEY}:${user?.id || user?.role || 'anon'}`);
    return saved === 'true';
  });
  const [includeReturnTransitToYard, setIncludeReturnTransitToYard] = useState(() => {
    const saved = localStorage.getItem(`${RETURN_TRANSIT_PREF_KEY}:${user?.id || user?.role || 'anon'}`);
    return saved === 'true';
  });
  const [requestModal, setRequestModal] = useState(null);
  const [requestModalLoading, setRequestModalLoading] = useState(false);
  const [requestModalRouteData, setRequestModalRouteData] = useState(null);
  const [requestModalRouteLoading, setRequestModalRouteLoading] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState(assignedTruck?.id || TRUCK_LANES[0].id);
  const [selectedHour, setSelectedHour] = useState(SCREEN_START_HOUR);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedRouteEstimate, setSelectedRouteEstimate] = useState(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [eventOverviewModal, setEventOverviewModal] = useState(null);
  const [eventOverviewLoading, setEventOverviewLoading] = useState(false);
  const [eventOverviewRouteLoading, setEventOverviewRouteLoading] = useState(false);
  const [eventOverviewRouteData, setEventOverviewRouteData] = useState(null);
  const [selectedScheduleRouteLoading, setSelectedScheduleRouteLoading] = useState(false);
  const [selectedScheduleRouteData, setSelectedScheduleRouteData] = useState(null);
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
  const [routeLoadingRequestIds, setRouteLoadingRequestIds] = useState(() => new Set());
  const [tileMenu, setTileMenu] = useState(null);
  const [manualTimeModal, setManualTimeModal] = useState(null);
  const [secondaryRouteModal, setSecondaryRouteModal] = useState(null);
  const [secondaryRouteSaving, setSecondaryRouteSaving] = useState(false);
  const [secondaryAddressSuggestions, setSecondaryAddressSuggestions] = useState([]);
  const [secondaryAddressLoading, setSecondaryAddressLoading] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugNowMs, setDebugNowMs] = useState(() => Date.now());
  const [debugSpeed, setDebugSpeed] = useState(1);
  const [debugStatusSavingId, setDebugStatusSavingId] = useState('');
  const [returnTransitReprojecting, setReturnTransitReprojecting] = useState(false);
  const boardScrollRef = useRef(null);
  const boardBodyRef = useRef(null);
  const scaleAnchorRef = useRef(null);
  const loadPromiseRef = useRef(null);
  const optimisticRequestOverridesRef = useRef(new Map());
  const requestSiteLocationMapRef = useRef({});
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

  const setRouteLoading = useCallback((requestId, loading) => {
    if (!requestId) {
      return;
    }
    setRouteLoadingRequestIds(current => {
      const hasRequest = current.has(requestId);
      if (loading === hasRequest) {
        return current;
      }
      const next = new Set(current);
      if (loading) {
        next.add(requestId);
      } else {
        next.delete(requestId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    requestSiteLocationMapRef.current = requestSiteLocationMap;
  }, [requestSiteLocationMap]);

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
    const requestsForDay = (requests || []).filter(request => request.scheduledDate === dateKey);
    const routeMap = buildCachedRouteMapForRequests(
      requestsForDay,
      siteLocationMap,
      fallbackDate || selectedDate,
      enableTolls,
    );
    const board = buildBoardState(requestsForDay, routeMap, debugMode ? debugNowRef.current : null, includeReturnTransitToYard);
    applyBoardProjection(requestsForDay, board, options);
    return { requestsForDay, board };
  }, [applyBoardProjection, debugMode, enableTolls, includeReturnTransitToYard, selectedDate]);

  const visibleTruckLanes = useMemo(() => {
    if (isTruckRole && assignedTruck) {
      return TRUCK_LANES.filter(lane => lane.id === assignedTruck.id);
    }
    return TRUCK_LANES;
  }, [assignedTruck, isTruckRole]);

  const loadBoard = useCallback(async () => {
    const dateKey = formatDateKey(selectedDate);
    const loadKey = `${dateKey}:${enableTolls ? 'tolls' : 'no-tolls'}:${includeReturnTransitToYard ? 'return' : 'no-return'}`;
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
      setAllRequests(current => getRequestListSignature(current) === getRequestListSignature(merged) ? current : merged);
      const requestsForDay = merged.filter(request => request.scheduledDate === dateKey);
      const siteLocationMap = Object.fromEntries(
        requestsForDay.map(request => [
          request.id,
          isSecondaryRouteRequest(request)
            ? request.secondaryRoute.startingLocation || requestSiteLocationMapRef.current[request.id] || ''
            : requestSiteLocationMapRef.current[request.id] ?? findProjectLocation(builders, request),
        ]),
      );
      const nextSiteLocationMap = mergeRequestSiteLocationMap(siteLocationMap);
      const cachedRouteMap = buildCachedRouteMapForRequests(requestsForDay, nextSiteLocationMap, selectedDate, enableTolls);
      const initialBoard = buildBoardState(requestsForDay, cachedRouteMap, debugMode ? debugNowRef.current : null, includeReturnTransitToYard);
      applyBoardProjection(requestsForDay, initialBoard);
      setLoadingBoard(false);
      const resolvedRouteEntries = await Promise.all(
        requestsForDay.map(async request => {
          if (isSecondaryRouteRequest(request)) {
            return [request.id, null];
          }
          const siteLocation = siteLocationMap[request.id];
          if (!siteLocation) {
            return [request.id, null];
          }
          const routeSchedule = applyRouteMode(buildRouteScheduleFromRequest(request, selectedDate), enableTolls);
          const cachedEstimate = getCachedRouteEstimateValue(siteLocation, routeSchedule);
          const shouldShowLoading = cachedEstimate === undefined;
          if (shouldShowLoading) {
            setRouteLoading(request.id, true);
          }
          try {
            return [
              request.id,
              cachedEstimate !== undefined
                ? cachedEstimate
                : await getCachedRouteEstimate(siteLocation, routeSchedule),
            ];
          } finally {
            if (shouldShowLoading) {
              setRouteLoading(request.id, false);
            }
          }
        }),
      );
      const resolvedRouteMap = Object.fromEntries(resolvedRouteEntries);
      const nextBoard = buildBoardState(requestsForDay, resolvedRouteMap, debugMode ? debugNowRef.current : null, includeReturnTransitToYard);
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
  }, [applyBoardProjection, debugMode, enableTolls, includeReturnTransitToYard, mergeRequestSiteLocationMap, selectedDate, setRouteLoading]);

  useEffect(() => {
    loadBoard().catch(() => {});
  }, [loadBoard]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadBoard().catch(() => {});
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(interval);
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
  }, [allRequests, debugMode, debugNowMs, includeReturnTransitToYard, projectRequestsToBoard, selectedDate]);

  useEffect(() => {
    localStorage.setItem(`${SCALE_PREF_KEY}:${user?.id || user?.role || 'anon'}`, timelineScaleMode);
  }, [timelineScaleMode, user?.id, user?.role]);

  useEffect(() => {
    localStorage.setItem(`${SNAP_PREF_KEY}:${user?.id || user?.role || 'anon'}`, String(snapToTimeMarks));
  }, [snapToTimeMarks, user?.id, user?.role]);
  useEffect(() => {
    localStorage.setItem(`${TOLLS_PREF_KEY}:${user?.id || user?.role || 'anon'}`, String(enableTolls));
  }, [enableTolls, user?.id, user?.role]);
  useEffect(() => {
    localStorage.setItem(`${RETURN_TRANSIT_PREF_KEY}:${user?.id || user?.role || 'anon'}`, String(includeReturnTransitToYard));
  }, [includeReturnTransitToYard, user?.id, user?.role]);

  useEffect(() => {
    if (!returnTransitReprojecting) {
      return undefined;
    }
    const timeout = window.setTimeout(() => setReturnTransitReprojecting(false), 650);
    return () => window.clearTimeout(timeout);
  }, [returnTransitReprojecting, includeReturnTransitToYard]);

  const handleReturnTransitToggle = useCallback((event) => {
    setReturnTransitReprojecting(true);
    setIncludeReturnTransitToYard(event.target.checked);
  }, []);

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
    const close = () => setTileMenu(null);
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
  const scheduleNowMinutes = scheduleNow.getHours() * 60 + scheduleNow.getMinutes() + scheduleNow.getSeconds() / 60;
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
    if (selectedScheduleEventIdSet.has(tileMenu.orderId) && selectedScheduleEventIds.length > 1) {
      return selectedScheduleEventIds;
    }
    return [tileMenu.orderId];
  }, [selectedScheduleEventIdSet, selectedScheduleEventIds, tileMenu]);
  const tileMenuIsDeleteOnlySecondaryRoute = isSecondaryRouteRequest(tileMenuRequest)
    && !isLinkedSecondaryMaterialOrderRequest(tileMenuRequest);
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
  const selectedDebugStatus = selectedScheduleRequest?.deliveryStatus || 'scheduled';
  const selectedScheduleSiteLocation = selectedScheduleRequest ? requestSiteLocationMap[selectedScheduleRequest.id] : '';
  const selectedScheduleRouteSchedule = useMemo(
    () => applyRouteMode(buildRouteScheduleFromEvent(selectedScheduleEvent), enableTolls),
    [enableTolls, selectedScheduleEvent?.date, selectedScheduleEvent?.hour, selectedScheduleEvent?.minute],
  );
  const selectedSchedulePrimaryRouteEstimate = selectedScheduleRequest
    ? isSecondaryRouteRequest(selectedScheduleRequest)
      ? null
      : getCachedRouteEstimateValue(selectedScheduleSiteLocation, selectedScheduleRouteSchedule) ?? null
    : null;
  const selectedScheduleSecondaryRoute = selectedScheduleRequest?.secondaryRoute || null;
  const selectedScheduleIsStandaloneSecondary = isSecondaryRouteRequest(selectedScheduleRequest);
  const selectedScheduleIsSecondarySegment = selectedScheduleIsStandaloneSecondary || (selectedScheduleSegment === 'secondary' && Boolean(selectedScheduleSecondaryRoute));
  const selectedScheduleHasSecondaryContinuation = Boolean(
    selectedScheduleEvent ? eventCycleStateMap[selectedScheduleEvent.orderId]?.hasSecondaryContinuation : false,
  );
  const selectedScheduleSecondaryRouteSchedule = useMemo(() => {
    if (!selectedScheduleEvent || !selectedScheduleSecondaryRoute) {
      return {};
    }

    if (selectedScheduleIsStandaloneSecondary) {
      return selectedScheduleRouteSchedule;
    }

    const start = eventStartMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleEvent.hour * 60 + selectedScheduleEvent.minute;
    const primaryMinutes = getPrimaryPhaseMinutes(selectedSchedulePrimaryRouteEstimate, selectedScheduleSecondaryRoute);
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
    selectedScheduleRouteSchedule,
    selectedScheduleSecondaryRoute,
  ]);
  const selectedScheduleRouteContext = useMemo(() => {
    if (selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute) {
      return {
        segment: 'secondary',
        fromLocation: selectedScheduleSecondaryRoute.startingLocation || selectedScheduleSiteLocation || '',
        toLocation: selectedScheduleSecondaryRoute.destination || '',
        siteLocation: selectedScheduleSecondaryRoute.destination || '',
        schedule: applyRouteMode(selectedScheduleSecondaryRouteSchedule, enableTolls),
        title: 'Selected Secondary Route',
      };
    }

    return {
      segment: 'primary',
      fromLocation: '',
      toLocation: selectedScheduleSiteLocation || '',
      siteLocation: selectedScheduleSiteLocation || '',
      schedule: selectedScheduleRouteSchedule,
      title: 'Selected Delivery Route',
    };
  }, [
    enableTolls,
    selectedScheduleIsSecondarySegment,
    selectedScheduleRouteSchedule,
    selectedScheduleSecondaryRoute,
    selectedScheduleSecondaryRouteSchedule,
    selectedScheduleSiteLocation,
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
  const selectedScheduleTiming = selectedScheduleRequest
    ? isSecondaryRouteRequest(selectedScheduleRequest)
      ? getSecondaryRouteTiming(selectedScheduleRequest.secondaryRoute, includeReturnTransitToYard)
      : selectedScheduleHasSecondaryContinuation || !includeReturnTransitToYard
        ? removeReturnLegFromTiming(getTimingProfile(selectedSchedulePrimaryRouteEstimate, null))
        : getTimingProfile(selectedSchedulePrimaryRouteEstimate, null)
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
  const selectedScheduleActionRows = getDeliveryActionRows(selectedScheduleRequest);
  const selectedScheduleWindowLabel = useMemo(() => {
    if (!selectedScheduleEvent) return 'No delivery selected';
    const startMinutes = (eventStartMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleEvent.hour * 60 + selectedScheduleEvent.minute);
    if (selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute) {
      if (selectedScheduleIsStandaloneSecondary) {
        const secondaryEnd = startMinutes + (selectedScheduleTiming?.transitMinutes || 0) + (selectedScheduleTiming?.loadingMinutes || 0);
        return `${formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} - ${formatTimeChip(Math.floor(secondaryEnd / 60), Math.floor(secondaryEnd % 60))}`;
      }
      const secondaryStart = startMinutes + getPrimaryPhaseMinutes(selectedSchedulePrimaryRouteEstimate, selectedScheduleSecondaryRoute);
      const secondaryDuration = Math.max(
        1,
        Math.round((selectedScheduleSecondaryRoute.travelDurationSeconds || 0) / 60)
        + Math.max(0, Number(selectedScheduleSecondaryRoute.serviceMinutes) || 0),
      );
      const secondaryEnd = secondaryStart + secondaryDuration;
      return `${formatTimeChip(Math.floor(secondaryStart / 60), Math.floor(secondaryStart % 60))} - ${formatTimeChip(Math.floor(secondaryEnd / 60), Math.floor(secondaryEnd % 60))}`;
    }
    const durationMinutes = eventPrimaryDurationMinutesMap[selectedScheduleEvent.orderId] ?? eventDurationMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleTiming?.totalMinutes ?? 90;
    const endMinutes = startMinutes + durationMinutes;
    return `${formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} - ${formatTimeChip(Math.floor(endMinutes / 60), Math.floor(endMinutes % 60))}`;
  }, [
    eventDurationMinutesMap,
    eventPrimaryDurationMinutesMap,
    eventStartMinutesMap,
    selectedScheduleEvent,
    selectedScheduleIsStandaloneSecondary,
    selectedScheduleIsSecondarySegment,
    selectedSchedulePrimaryRouteEstimate,
    selectedScheduleSecondaryRoute,
    selectedScheduleTiming?.totalMinutes,
  ]);
  useEffect(() => {
    if (
      !scheduleInspectorOpen ||
      !selectedScheduleEventId ||
      !selectedScheduleRouteContext.toLocation ||
      (selectedScheduleRouteContext.segment === 'secondary' && !selectedScheduleRouteContext.fromLocation)
    ) {
      selectedScheduleRouteRequestKeyRef.current = '';
      selectedScheduleRouteDataKeyRef.current = '';
      setSelectedScheduleRouteData(null);
      setSelectedScheduleRouteLoading(false);
      return undefined;
    }

    let active = true;
    const routeKey = selectedScheduleRouteKey;
    if (selectedScheduleRouteDataKeyRef.current === routeKey) {
      setSelectedScheduleRouteLoading(false);
      return undefined;
    }

    selectedScheduleRouteRequestKeyRef.current = routeKey;
    setSelectedScheduleRouteLoading(true);

    const routeRequest = selectedScheduleRouteContext.segment === 'secondary'
      ? getCachedRouteDataBetween(
        selectedScheduleRouteContext.fromLocation,
        selectedScheduleRouteContext.toLocation,
        selectedScheduleRouteContext.schedule,
      )
      : getCachedRouteData(
        selectedScheduleRouteContext.toLocation,
        selectedScheduleRouteContext.schedule,
      );

    routeRequest
      .then(data => {
        if (active && selectedScheduleRouteRequestKeyRef.current === routeKey) {
          selectedScheduleRouteDataKeyRef.current = data ? routeKey : '';
          setSelectedScheduleRouteData(data);
        }
      })
      .catch(() => {
        if (active && selectedScheduleRouteRequestKeyRef.current === routeKey) {
          selectedScheduleRouteDataKeyRef.current = '';
          setSelectedScheduleRouteData(null);
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
  }, [scheduleInspectorOpen, selectedScheduleEventId, selectedScheduleRouteContext, selectedScheduleRouteKey]);
  const selectedRouteDurationMinutes = useMemo(() => {
    if (isSecondaryRouteRequest(requestModal?.request)) {
      return Math.max(30, getSecondaryRouteTiming(requestModal.request.secondaryRoute, includeReturnTransitToYard).totalMinutes || 90);
    }
    const timing = getTimingProfile(selectedRouteEstimate, requestModal?.request?.secondaryRoute || null);
    const preferredTiming = includeReturnTransitToYard ? timing : removeReturnLegFromTiming(timing);
    return Math.max(30, preferredTiming.totalMinutes || 90);
  }, [includeReturnTransitToYard, requestModal?.request, selectedRouteEstimate]);
  const selectedScheduleTrafficCopy = useMemo(
    () => getTrafficPanelCopy(selectedScheduleRouteData, selectedScheduleRouteLoading),
    [selectedScheduleRouteData, selectedScheduleRouteLoading],
  );
  const requestModalSummary = useMemo(
    () => buildEstimateSummary(
      selectedDate,
      selectedHour,
      selectedMinute,
      selectedRouteEstimate,
      Boolean(requestModal?.siteLocation),
      requestModal?.request?.secondaryRoute || null,
      includeReturnTransitToYard,
    ),
    [includeReturnTransitToYard, requestModal?.request?.secondaryRoute, requestModal?.siteLocation, selectedDate, selectedHour, selectedMinute, selectedRouteEstimate],
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
    const updatedRequest = {
      ...selectedScheduleRequest,
      deliveryStatus: status,
      deliveryStartedAt: startedAt,
      deliveryUnloadingAt: unloadingAt,
      deliveryConfirmedAt: confirmedAt,
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
    if (!requestModal?.siteLocation) {
      setSelectedRouteEstimate(null);
      setRequestModalRouteData(null);
      setRequestModalRouteLoading(false);
      return undefined;
    }

    let active = true;
    const schedule = {
      scheduledDate: formatDateKey(selectedDate),
      scheduledHour: selectedHour,
      scheduledMinute: selectedMinute,
      enableTolls,
    };

    setRequestModalRouteLoading(true);
    Promise.all([
      getCachedRouteEstimate(requestModal.siteLocation, schedule),
      getCachedRouteData(requestModal.siteLocation, schedule),
    ])
      .then(([estimate, routeData]) => {
        if (!active) {
          return;
        }
        setSelectedRouteEstimate(estimate);
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
  }, [enableTolls, requestModal?.siteLocation, selectedDate, selectedHour, selectedMinute]);
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
      includeReturnTransitToYard,
    );
  }, [eventOverviewModal, includeReturnTransitToYard]);
  const manualTimeEvent = useMemo(
    () => manualTimeModal ? dayEvents.find(event => event.orderId === manualTimeModal.requestId) || null : null,
    [dayEvents, manualTimeModal],
  );
  const manualTimeRequest = manualTimeEvent ? requestMetaMap[manualTimeEvent.orderId] : null;
  const manualTimeDurationMinutes = manualTimeModal ? eventDurationMinutesMap[manualTimeModal.requestId] ?? 90 : 90;

  const openRequestModal = useCallback(async requestId => {
    setRequestModalLoading(true);
    setRequestModal(null);
    setSelectedRouteEstimate(null);
    setRequestModalRouteData(null);
    setRequestModalRouteLoading(false);
    const request = allRequests.find(item => item.id === requestId) ?? await materialOrderRequestsAPI.getRequest(requestId);
    if (!request) {
      setRequestModalLoading(false);
      return;
    }
    const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
    const siteLocation = isSecondaryRouteRequest(request)
      ? request.secondaryRoute.startingLocation || requestSiteLocationMap[request.id] || ''
      : requestSiteLocationMap[request.id] ?? findProjectLocation(builders, request);
    const nextTruckId = request.scheduledTruckId ?? request.truckId ?? selectedTruckId ?? TRUCK_LANES[0].id;
    setSelectedTruckId(nextTruckId);
    if (typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number') {
      setSelectedHour(request.scheduledHour);
      setSelectedMinute(request.scheduledMinute);
    } else {
      const suggested = getSuggestedStartTime({
        truckId: nextTruckId,
        selectedDate,
        dayEvents,
        startMap: eventStartMinutesMap,
        durationMap: eventDurationMinutesMap,
      });
      setSelectedHour(suggested.hour);
      setSelectedMinute(suggested.minute);
    }
    setRequestModal({ request, siteLocation });
    setRequestModalLoading(false);
  }, [allRequests, dayEvents, eventDurationMinutesMap, eventStartMinutesMap, requestSiteLocationMap, selectedDate, selectedTruckId]);

  const closeRequestModal = useCallback(() => {
    setRequestModal(null);
    setRequestModalLoading(false);
    setSelectedRouteEstimate(null);
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
    const siteLocation = requestSiteLocationMap[request.id] ?? findProjectLocation(builders, request);
    const routeEstimate = siteLocation ? await getCachedRouteEstimate(siteLocation, applyRouteMode(buildRouteScheduleFromEvent(event), enableTolls)) : null;
    const cycleState = eventCycleStateMap[event.orderId] ?? null;
    const modalState = { event, request, siteLocation, routeEstimate, cycleState };
    setEventOverviewModal(modalState);
    setEventOverviewLoading(false);
    if (siteLocation) {
      setEventOverviewRouteLoading(true);
      getCachedRouteData(siteLocation, applyRouteMode(buildRouteScheduleFromEvent(event), enableTolls))
        .then(data => setEventOverviewRouteData(data))
        .finally(() => setEventOverviewRouteLoading(false));
    }
  }, [enableTolls, eventCycleStateMap, requestMetaMap, requestSiteLocationMap]);

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
    const updatedRequest = sourceRequest ? {
      ...sourceRequest,
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
        ? previousRequests.map(item => item.id === requestId ? updatedRequest : item)
        : dedupeRequests([...previousRequests, updatedRequest]);
      setAllRequests(nextRequests);
      projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
      if (!isSecondaryRouteRequest(updatedRequest)) {
        setRouteLoading(requestId, true);
        (async () => {
          let siteLocation = requestSiteLocationMapRef.current[requestId] || '';
          if (!siteLocation) {
            const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
            siteLocation = findProjectLocation(builders, updatedRequest);
            if (siteLocation) {
              mergeRequestSiteLocationMap({ [requestId]: siteLocation });
            }
          }
          if (!siteLocation) {
            return;
          }
          const routeSchedule = applyRouteMode(buildRouteScheduleFromRequest(updatedRequest, selectedDate), enableTolls);
          if (getCachedRouteEstimateValue(siteLocation, routeSchedule) === undefined) {
            await getCachedRouteEstimate(siteLocation, routeSchedule);
          }
          projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
        })()
          .catch(() => {})
          .finally(() => {
            setRouteLoading(requestId, false);
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
    }

    materialOrderRequestsAPI.setSchedule(requestId, {
        date: formatDateKey(selectedDate),
        hour,
        minute,
        truckId: truck?.id ?? truckId,
        truckLabel: truck?.rego ?? null,
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
      });
  }, [allRequests, clearSelectedScheduleEvents, dayEvents, enableTolls, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, mergeRequestSiteLocationMap, projectRequestsToBoard, requestMetaMap, selectedDate, setRouteLoading]);

  const getProjectedDurationForGroupMove = useCallback((request, startMinutes, dateKey, fallbackDurationMinutes = 90) => {
    if (!request) {
      return fallbackDurationMinutes;
    }
    if (isSecondaryRouteRequest(request)) {
      return getSecondaryRouteTiming(request.secondaryRoute, includeReturnTransitToYard).totalMinutes;
    }

    const siteLocation = requestSiteLocationMapRef.current[request.id] || '';
    const schedule = {
      scheduledDate: dateKey,
      scheduledHour: Math.floor(startMinutes / 60),
      scheduledMinute: Math.round(startMinutes % 60),
      enableTolls,
    };
    const estimate = siteLocation ? getCachedRouteEstimateValue(siteLocation, schedule) : null;
    if (estimate === undefined) {
      return Math.max(30, Math.round(fallbackDurationMinutes || eventDurationMinutesMap[request.id] || 90));
    }
    const timing = getTimingProfile(estimate, null);
    return (includeReturnTransitToYard ? timing : removeReturnLegFromTiming(timing)).totalMinutes;
  }, [enableTolls, eventDurationMinutesMap, includeReturnTransitToYard]);

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
      await Promise.all(
        updates.map(async update => {
          const request = nextRequests.find(item => item.id === update.requestId);
          if (!request || isSecondaryRouteRequest(request)) {
            return;
          }
          let siteLocation = requestSiteLocationMapRef.current[update.requestId] || '';
          if (!siteLocation) {
            siteLocation = findProjectLocation(builders, request);
            if (siteLocation) {
              mergeRequestSiteLocationMap({ [update.requestId]: siteLocation });
            }
          }
          if (!siteLocation) {
            return;
          }
          const routeSchedule = applyRouteMode(buildRouteScheduleFromRequest(request, selectedDate), enableTolls);
          if (getCachedRouteEstimateValue(siteLocation, routeSchedule) === undefined) {
            await getCachedRouteEstimate(siteLocation, routeSchedule);
          }
        }),
      );
      projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
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
  }, [allRequests, clearSelectedScheduleEvents, dayEvents, enableTolls, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, getProjectedDurationForGroupMove, mergeRequestSiteLocationMap, projectRequestsToBoard, requestMetaMap, selectedDate]);

  const openManualScheduleTime = useCallback((requestId) => {
    const scheduleEvent = dayEvents.find(event => event.orderId === requestId);
    if (!scheduleEvent) {
      setTileMenu(null);
      return;
    }
    const currentStart = eventStartMinutesMap[requestId] ?? scheduleEvent.hour * 60 + scheduleEvent.minute;
    setTileMenu(null);
    setManualTimeModal({
      requestId,
      value: formatManualTimeInput(currentStart),
      error: '',
    });
  }, [dayEvents, eventStartMinutesMap]);

  const closeManualScheduleTime = useCallback(() => {
    setManualTimeModal(null);
  }, []);

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
    const durationMinutes = eventDurationMinutesMap[requestId] ?? 90;
    const parsedMinutes = parseManualScheduleTime(manualTimeModal.value);
    if (parsedMinutes === null) {
      setManualTimeModal(current => current ? { ...current, error: 'Enter a valid time, for example 09:30 or 2:15 PM.' } : current);
      return;
    }
    const earliest = SCREEN_START_HOUR * 60;
    const latest = SCREEN_END_HOUR * 60 - durationMinutes;
    if (parsedMinutes < earliest || parsedMinutes > latest) {
      setManualTimeModal(current => current ? {
        ...current,
        error: `Choose a time between ${formatTimeChip(SCREEN_START_HOUR, 0)} and ${formatTimeChip(Math.floor(latest / 60), latest % 60)}.`,
      } : current);
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
    scheduleRequestAt(requestId, scheduleEvent.truckId, parsedMinutes, durationMinutes, { exact: true });
  }, [dayEvents, eventDurationMinutesMap, eventStartMinutesMap, manualTimeModal, scheduleRequestAt]);

  const openSecondaryRouteModal = useCallback(async (requestId) => {
    const scheduleEvent = dayEvents.find(event => event.orderId === requestId);
    const request = requestMetaMap[requestId] || allRequests.find(item => item.id === requestId) || null;
    if (!scheduleEvent || !request) {
      setTileMenu(null);
      return;
    }

    const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
    const primarySiteLocation = requestSiteLocationMap[requestId] ?? findProjectLocation(builders, request);
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
          label: `${item.builderName || 'Material Order'} · ${item.projectName || 'Pending request'}`,
          displayLabel: `${item.builderName || 'Material Order'} - ${item.projectName || 'Pending request'}`,
          siteLocation: siteLocation || '',
        };
      })
      .filter(item => item.siteLocation);

    const existingSecondaryRoute = request.secondaryRoute || null;
    setTileMenu(null);
    setSecondaryRouteModal({
      requestId,
      primarySiteLocation: primarySiteLocation || '',
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
  }, [allRequests, dayEvents, pendingRequests, requestMetaMap, requestSiteLocationMap]);

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

    const primaryRouteEstimate = getCachedRouteEstimateValue(
      secondaryRouteModal.primarySiteLocation,
      applyRouteMode(buildRouteScheduleFromEvent(scheduleEvent), enableTolls),
    ) ?? null;
    const primaryPhaseMinutes = getPrimaryPhaseMinutes(primaryRouteEstimate);
    const visibleParentStartMinutes = eventStartMinutesMap[request.id] ?? (scheduleEvent.hour * 60 + scheduleEvent.minute);
    const plannedParentStartMinutes = getRequestScheduledStartMinutes(request, scheduleEvent.hour * 60 + scheduleEvent.minute);
    const visibleBaseStart = getDateAtScheduleMinutes(scheduleEvent.date, visibleParentStartMinutes);
    const plannedBaseStart = getDateAtScheduleMinutes(request.scheduledDate || scheduleEvent.date, plannedParentStartMinutes);
    const outboundDeparture = new Date(visibleBaseStart.getTime() + primaryPhaseMinutes * 60 * 1000);
    const persistedSecondaryDeparture = new Date(plannedBaseStart.getTime() + primaryPhaseMinutes * 60 * 1000);
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

    setSecondaryRouteSaving(true);
    try {
      const outbound = await getCachedRouteDataBetween(
        secondaryRouteModal.primarySiteLocation,
        destination,
        { ...outboundRouteSchedule, enableTolls },
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
      const returnRoute = await getCachedRouteDataBetween(destination, YARD_LOCATION, { ...returnSchedule, enableTolls });
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
        startingLocation: secondaryRouteModal.primarySiteLocation,
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

      const updatedRequest = await materialOrderRequestsAPI.setSecondaryRoute(secondaryRouteModal.requestId, secondaryRoute, {
        ...persistedSecondarySchedule,
        truckId: scheduleEvent.truckId,
        truckLabel: scheduleEvent.truckLabel,
      });
      const parentRequest = { ...request, secondaryRoute: null };
      const nextRequests = dedupeRequests([
        ...allRequests
          .map(item => item.id === parentRequest.id ? parentRequest : item)
          .filter(item =>
            item.id !== updatedRequest.id
            && !(isSecondaryRouteRequest(item) && item.sourceOrderId === parentRequest.id && item.id !== updatedRequest.id)
          ),
        updatedRequest,
      ]);
      const nextSiteLocationMap = {
        ...requestSiteLocationMapRef.current,
        [parentRequest.id]: secondaryRouteModal.primarySiteLocation,
        [updatedRequest.id]: secondaryRoute.startingLocation,
      };
      const dateKey = scheduleEvent.date || formatDateKey(selectedDate);
      mergeRequestSiteLocationMap(nextSiteLocationMap);
      setAllRequests(nextRequests);
      optimisticRequestOverridesRef.current.set(parentRequest.id, {
        request: parentRequest,
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
      optimisticRequestOverridesRef.current.set(updatedRequest.id, {
        request: updatedRequest,
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
      projectRequestsToBoard(nextRequests, nextSiteLocationMap, dateKey, { force: true });
      setSelectedScheduleEventId(updatedRequest.id);
      setSelectedScheduleSegment('primary');
      setScheduleInspectorOpen(true);
      setSecondaryRouteModal(null);
      setError('');
    } catch (err) {
      setSecondaryRouteModal(current => current ? { ...current, error: err?.message || 'Failed to save secondary route.' } : current);
    } finally {
      setSecondaryRouteSaving(false);
    }
  }, [allRequests, dayEvents, enableTolls, eventStartMinutesMap, mergeRequestSiteLocationMap, projectRequestsToBoard, requestMetaMap, secondaryRouteModal, selectedDate]);

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
        ? getSecondaryRouteTiming(request.secondaryRoute, includeReturnTransitToYard).totalMinutes
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
  }, [includeReturnTransitToYard, timelineWidth]);

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
    const selectedIds = selectedScheduleEventIdSet.has(scheduleEvent.orderId) && selectedScheduleEventIds.length > 1
      ? selectedScheduleEventIds
      : [scheduleEvent.orderId];
    const anchorTruckIndex = TRUCK_LANES.findIndex(lane => lane.id === scheduleEvent.truckId);
    const anchorStartMinutes = eventStartMinutesMap[scheduleEvent.orderId] ?? scheduleEvent.hour * 60 + scheduleEvent.minute;
    selectionDragContextRef.current = {
      anchorOrderId: scheduleEvent.orderId,
      anchorTruckId: scheduleEvent.truckId,
      anchorTruckIndex,
      anchorStartMinutes,
      items: selectedIds
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
  }, [dayEvents, eventDurationMinutesMap, eventStartMinutesMap, selectedScheduleEventIdSet, selectedScheduleEventIds]);

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
    const snapCandidate = getEdgeSnapCandidate({
      requestId: draggedRequestId,
      truckId,
      startMinutes: minutes,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
    });
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
    };
    setDropPreview(current => sameDropPreview(current, nextPreview) ? current : nextPreview);
    setDropPreviewGroup([]);
  }, [dayEvents, dragPreviewDurationMinutes, draggedRequestId, eventDurationMinutesMap, eventStartMinutesMap, timelineSnapStep]);

  const handleLaneDragLeave = useCallback((event, truckId) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDropPreview(current => current?.truckId === truckId ? null : current);
    setDropPreviewGroup(current => current.some(item => item.truckId === truckId) ? [] : current);
  }, []);

  const handleLaneDrop = useCallback((event, truckId) => {
    const requestId = event.dataTransfer.getData('text/plain') || draggedRequestId;
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
    const snapCandidate = getEdgeSnapCandidate({
      requestId,
      truckId,
      startMinutes: minutes,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
    });
    scheduleRequestAt(requestId, truckId, snapCandidate?.minutes ?? minutes, dragPreviewDurationMinutes, snapCandidate ? { exact: true } : { step: timelineSnapStep });
  }, [dayEvents, dragPreviewDurationMinutes, draggedRequestId, eventDurationMinutesMap, eventStartMinutesMap, scheduleRequestAt, scheduleRequestGroupAt, timelineSnapStep]);

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
    const freeStart = getDropMinutesFromPointer(event.clientX, laneTrack, {
      durationMinutes: dragPreviewDurationMinutes,
      pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
      step: timelineSnapStep,
    });
    const snapCandidate = getEdgeSnapCandidate({
      requestId,
      truckId: scheduleEvent.truckId,
      startMinutes: freeStart,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      thresholdMinutes: SNAP_EDGE_THRESHOLD_MINUTES * 2,
    });
    if (!snapCandidate) {
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
    const nextPreview = {
      truckId: scheduleEvent.truckId,
      minutes: snapCandidate.minutes,
      durationMinutes: dragPreviewDurationMinutes,
      blocked: Boolean(collision),
      snapOrderId: snapCandidate.event.orderId,
      snapSide: snapCandidate.side,
    };
    setDropPreview(current => sameDropPreview(current, nextPreview) ? current : nextPreview);
  }, [dayEvents, dragPreviewDurationMinutes, draggedRequestId, eventDurationMinutesMap, eventStartMinutesMap, timelineSnapStep]);

  const handleEventSnapDrop = useCallback((event, scheduleEvent) => {
    const requestId = event.dataTransfer.getData('text/plain') || draggedRequestId;
    if (selectionDragContextRef.current?.items?.length > 1) {
      return;
    }
    if (!requestId || !scheduleEvent?.truckId || requestId === scheduleEvent.orderId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const laneTrack = event.currentTarget.closest('.ts2-lane-track');
    if (!laneTrack) {
      return;
    }
    const freeStart = getDropMinutesFromPointer(event.clientX, laneTrack, {
      durationMinutes: dragPreviewDurationMinutes,
      pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
      step: timelineSnapStep,
    });
    const snapCandidate = getEdgeSnapCandidate({
      requestId,
      truckId: scheduleEvent.truckId,
      startMinutes: freeStart,
      durationMinutes: dragPreviewDurationMinutes,
      dayEvents,
      startMap: eventStartMinutesMap,
      durationMap: eventDurationMinutesMap,
      thresholdMinutes: SNAP_EDGE_THRESHOLD_MINUTES * 2,
    });
    if (!snapCandidate) {
      return;
    }
    scheduleRequestAt(requestId, scheduleEvent.truckId, snapCandidate.minutes, dragPreviewDurationMinutes, { exact: true });
  }, [dayEvents, dragPreviewDurationMinutes, draggedRequestId, eventDurationMinutesMap, eventStartMinutesMap, scheduleRequestAt, timelineSnapStep]);

  const handleUnscheduleOrder = useCallback((requestIds) => {
    const ids = Array.isArray(requestIds) ? requestIds.filter(Boolean) : [requestIds].filter(Boolean);
    if (!ids.length) {
      return;
    }
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const previousCycleStateMap = eventCycleStateMap;
    const sourceRequests = ids
      .map(requestId => allRequests.find(item => item.id === requestId) || requestMetaMap[requestId] || null)
      .filter(Boolean);
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
          {
            ...sourceRequest,
            sourceOrderId: shouldRestoreAsMaterialOrder ? null : sourceRequest.sourceOrderId,
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
            secondaryRoute: shouldRestoreAsMaterialOrder ? null : sourceRequest.secondaryRoute,
          },
        ];
      }),
    );

    setTileMenu(null);
    const nextRequests = previousRequests.map(item => updatesById.get(item.id) || item);
    setAllRequests(nextRequests);
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
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
          await materialOrderRequestsAPI.clearSchedule(requestId);
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
        setError(err?.message || 'Failed to unschedule order selection.');
      }
    })();
  }, [allRequests, dayEvents, eventCycleStateMap, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, projectRequestsToBoard, requestMetaMap, selectedDate]);

  const handleDeleteScheduledOrder = useCallback((requestIds) => {
    const ids = Array.isArray(requestIds) ? requestIds.filter(Boolean) : [requestIds].filter(Boolean);
    if (!ids.length) {
      return;
    }
    if (!window.confirm(ids.length > 1
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
    const nextRequests = previousRequests.filter(item => !ids.includes(item.id));
    setAllRequests(nextRequests);
    projectRequestsToBoard(nextRequests, requestSiteLocationMapRef.current, selectedDate, { force: true });
    setSelectedScheduleEventId(current => ids.includes(current) ? '' : current);
    setSelectedScheduleEventIds(current => current.filter(id => !ids.includes(id)));
    ids.forEach(requestId => {
      optimisticRequestOverridesRef.current.set(requestId, {
        deleted: true,
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
    });

    (async () => {
      try {
        for (const requestId of ids) {
          await materialOrderRequestsAPI.deleteRequest(requestId);
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
                {DEBUG_STATUS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={selectedDebugStatus === option.value ? 'active' : ''}
                    disabled={!selectedScheduleRequest || debugStatusSavingId === selectedScheduleRequest.id}
                    onClick={() => updateDebugDeliveryStatus(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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
                  <div key={`${timelineScaleMode}-${marker.minutes}`} className={`ts2-axis-tick${marker.isHour ? ' major' : ''}`} style={{ left: `${((marker.minutes - SCREEN_START_HOUR * 60) / ((SCREEN_END_HOUR - SCREEN_START_HOUR) * 60)) * 100}%` }}>
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
              const returnMovements = isSameDay(scheduleNow, selectedDate)
                ? laneEvents.flatMap((event, eventIndex) => {
                    const request = requestMetaMap[event.orderId];
                    const nextEvent = laneEvents[eventIndex + 1];
                    if (request?.deliveryStatus !== 'return_transit' || !nextEvent) {
                      return [];
                    }
                    const completedMinutes = minutesFromIsoOnDate(request.deliveryConfirmedAt, event.date);
                    const nextStartMinutes = eventStartMinutesMap[nextEvent.orderId] ?? nextEvent.hour * 60 + nextEvent.minute;
                    if (typeof completedMinutes !== 'number' || nextStartMinutes <= completedMinutes) {
                      return [];
                    }
                    if (scheduleNowMinutes < completedMinutes || scheduleNowMinutes >= nextStartMinutes) {
                      return [];
                    }
                    const progress = Math.max(0, Math.min(1, (scheduleNowMinutes - completedMinutes) / (nextStartMinutes - completedMinutes)));
                    const startOffset = getEventOffset(completedMinutes) * 100;
                    const endOffset = getEventOffset(nextStartMinutes) * 100;
                    return [{
                      orderId: event.orderId,
                      nextOrderId: nextEvent.orderId,
                      startOffset,
                      endOffset,
                      progress,
                      label: `Returning for ${nextEvent.builderName || 'next delivery'}`,
                    }];
                  })
                : [];
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
                      {returnMovements.map(movement => (
                        <div
                          key={`return-movement-${movement.orderId}-${movement.nextOrderId}`}
                          className="transport-return-movement"
                          style={{
                            left: `${movement.startOffset}%`,
                            width: `${Math.max(0.5, movement.endOffset - movement.startOffset)}%`,
                          }}
                          aria-label={movement.label}
                        >
                          <span style={{ left: `${movement.progress * 100}%` }}>
                            <ReturnMovementTruckIcon />
                          </span>
                        </div>
                      ))}
                      {laneEvents.map(event => {
                      const request = requestMetaMap[event.orderId];
                      const isSecondaryRequest = isSecondaryRouteRequest(request);
                      const status = request?.deliveryStatus || 'scheduled';
                      const durationMinutes = eventDurationMinutesMap[event.orderId] ?? 90;
                      const primaryDurationMinutes = eventPrimaryDurationMinutesMap[event.orderId] ?? durationMinutes;
                      const offset = getEventOffset(eventStartMinutesMap[event.orderId] ?? event.hour * 60 + event.minute) * 100;
                      const width = getEventFlex(durationMinutes) * 100;
                      const isCompleteTile = status === 'return_transit';
                      const palette = isCompleteTile
                        ? deliveredTileAppearance()
                        : scheduleStatusAppearance(status);
                      const startMinutes = eventStartMinutesMap[event.orderId] ?? event.hour * 60 + event.minute;
                      const primaryEnd = startMinutes + primaryDurationMinutes;
                      const siteLocation = requestSiteLocationMap[event.orderId] || '';
                      const routeEstimate = getCachedRouteEstimateValue(siteLocation, applyRouteMode(buildRouteScheduleFromEvent(event), enableTolls)) ?? null;
                      const timing = isSecondaryRequest
                        ? getSecondaryRouteTiming(request.secondaryRoute, includeReturnTransitToYard)
                        : includeReturnTransitToYard
                          ? getTimingProfile(routeEstimate, request?.secondaryRoute || null)
                          : removeReturnLegFromTiming(getTimingProfile(routeEstimate, request?.secondaryRoute || null));
                      const plannedPrimaryDurationMinutes = !isSecondaryRequest && request?.secondaryRoute
                        ? getPrimaryPhaseMinutes(
                          routeEstimate,
                          request?.secondaryRoute || null,
                        )
                        : primaryDurationMinutes;
                      const displayPrimaryDurationMinutes = !isSecondaryRequest && request?.secondaryRoute && status !== 'return_transit'
                        ? Math.min(durationMinutes, plannedPrimaryDurationMinutes)
                        : primaryDurationMinutes;
                      const displayPrimaryRatio = Math.max(0, Math.min(1, displayPrimaryDurationMinutes / Math.max(1, durationMinutes)));
                      const displayPrimaryWidth = displayPrimaryRatio * 100;
                      const displaySecondaryWidth = Math.max(0, 100 - displayPrimaryWidth);
                      const hasSecondaryRouteTile = !isSecondaryRequest && Boolean(request?.secondaryRoute) && status !== 'return_transit' && displaySecondaryWidth > 0;
                      const secondaryStartMinutes = startMinutes + displayPrimaryDurationMinutes;
                      const secondaryEndMinutes = startMinutes + durationMinutes;
                      const secondaryArrivalMinutes = secondaryStartMinutes + Math.round((request?.secondaryRoute?.travelDurationSeconds || 0) / 60);
                      const siteArrivalMinutes = startMinutes + timing.transitMinutes;
                      const siteArrivalLabel = siteLocation
                        ? formatTimeChip(Math.floor(siteArrivalMinutes / 60), Math.floor(siteArrivalMinutes % 60))
                        : 'pending';
                      const scaffoldDetailText = getScaffoldDetailText(request, event);
                      const eventTitle = isSecondaryRequest ? request.secondaryRoute.destination : event.builderName || 'Material Order';
                      const eventSubtitle = isSecondaryRequest ? getSecondaryRouteReasonLabel(request.secondaryRoute.reason) : scaffoldDetailText;
                      const eventArrival = isSecondaryRequest ? `ETA stop ${siteArrivalLabel}` : `ETA site ${siteArrivalLabel}`;
                      const primaryDeliveryType = getDeliveryTypePill(request);
                      const secondaryDeliveryType = getDeliveryTypePill(request, 'secondary');
                      const isRouteLoading = routeLoadingRequestIds.has(event.orderId) || returnTransitReprojecting;
                      return (
                        <div
                          key={event.id}
                          data-order-id={event.orderId}
                          className={`ts2-event-wrap${draggedRequestId ? ' drag-active' : ''}${draggedScheduledOrderId === event.orderId ? ' dragging' : ''}${selectedScheduleEventIdSet.has(event.orderId) ? ' selected' : ''}${isCompleteTile ? ' complete' : ''}`}
                          style={{ left: `${offset}%`, width: `${width}%` }}
                          draggable={!dragSchedulingId}
                          onDragStart={(dragEvent) => handleScheduledDragStart(dragEvent, event, request, durationMinutes, palette)}
                          onDragEnd={handleScheduledDragEnd}
                          onDragOver={(dragEvent) => handleEventSnapDragOver(dragEvent, event)}
                          onDrop={(dragEvent) => handleEventSnapDrop(dragEvent, event)}
                          onContextMenu={(menuEvent) => {
                            menuEvent.preventDefault();
                            setTileMenu({
                              orderId: event.orderId,
                              x: Math.max(8, Math.min(menuEvent.clientX, window.innerWidth - 224)),
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
                          <button
                            type="button"
                            className={`ts2-event-card${isSecondaryRequest ? ' ts2-secondary-route-card' : ''}`}
                            style={{ backgroundColor: palette.background, color: palette.text, width: hasSecondaryRouteTile ? `${displayPrimaryWidth}%` : '100%' }}
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
                              <span>{isSecondaryRequest ? 'Secondary transit' : isCompleteTile ? 'Complete' : scheduleStatusLabel(status)}</span>
                            </div>
                            {isRouteLoading ? <i className="transport-route-loading-bar" aria-hidden="true" /> : null}
                          </button>
                          {hasSecondaryRouteTile ? (
                            <button
                              type="button"
                              className="ts2-secondary-route-card"
                              style={{ left: `${displayPrimaryWidth}%`, width: `${displaySecondaryWidth}%` }}
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
          <ScheduleLegend />
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
      {isTruckRole ? <ScheduleLegend /> : null}
      </div>
      {scheduleInspectorOpen ? (
      <aside className="transport-schedule-inspector">
        <div className="transport-schedule-inspector-head">
          <div>
            <span>{selectedScheduleIsSecondarySegment ? 'Selected Secondary Route' : 'Selected Delivery'}</span>
            <h2>{selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute ? getSecondaryRouteReasonLabel(selectedScheduleSecondaryRoute.reason) : selectedScheduleWindowLabel}</h2>
          </div>
          {selectedScheduleRequest ? <span className={`transport-status-pill status-${selectedScheduleRequest.deliveryStatus || 'scheduled'}`}>{scheduleStatusLabel(selectedScheduleRequest.deliveryStatus || 'scheduled')}</span> : null}
          <button type="button" className="transport-inspector-close" onClick={() => setScheduleInspectorOpen(false)} aria-label="Close selected delivery panel">×</button>
        </div>
        <label className={`transport-snap-toggle transport-inspector-toggle${enableTolls ? ' active' : ''}`}>
          <input
            type="checkbox"
            checked={enableTolls}
            onChange={(event) => setEnableTolls(event.target.checked)}
          />
          <span>Enable tolls</span>
        </label>
        {selectedScheduleEvent ? (
          <>
            <dl className="transport-schedule-detail-list">
              {selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute ? (
                <>
                  <div><dt>Starting Location</dt><dd>{selectedScheduleSecondaryRoute.startingLocation || selectedScheduleSiteLocation || 'Site location pending'}</dd></div>
                  <div><dt>Destination</dt><dd>{selectedScheduleSecondaryRoute.destination || 'Secondary destination pending'}</dd></div>
                  <div><dt>Reason</dt><dd>{getSecondaryRouteReasonLabel(selectedScheduleSecondaryRoute.reason)}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Builder</dt><dd>{selectedScheduleEvent.builderName || 'Material Order'}</dd></div>
                  <div><dt>Project</dt><dd>{selectedScheduleEvent.projectName || 'Scheduled delivery'}</dd></div>
                  <div><dt>Destination</dt><dd>{selectedScheduleRouteContext.siteLocation || 'Site location pending'}</dd></div>
                  <div><dt>Scaffold System</dt><dd>{selectedScheduleEvent.scaffoldingSystem || selectedScheduleRequest?.scaffoldingSystem || '-'}</dd></div>
                </>
              )}
            </dl>
            <div className="transport-schedule-estimate-card">
              {selectedScheduleIsSecondarySegment && selectedScheduleSecondaryRoute ? (
                <>
                  <div><span><InspectorIcon type="truck" /> Travel to stop</span><strong>{Math.round((selectedScheduleSecondaryRoute.travelDurationSeconds || 0) / 60)} min</strong></div>
                  <div><span><InspectorIcon type="map" /> Stop service</span><strong>{Math.max(0, Number(selectedScheduleSecondaryRoute.serviceMinutes) || 0)} min</strong></div>
                  <div><span><InspectorIcon type="return" /> Return to yard</span><strong>{Math.round((selectedScheduleSecondaryRoute.returnDurationSeconds || 0) / 60)} min</strong></div>
                  <div><span><InspectorIcon type="clock" /> Secondary Total</span><strong>{Math.round((selectedScheduleSecondaryRoute.travelDurationSeconds || 0) / 60) + Math.max(0, Number(selectedScheduleSecondaryRoute.serviceMinutes) || 0)} min</strong></div>
                </>
              ) : (
                <>
                  <div><span><InspectorIcon type="truck" /> Travel</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.transitMinutes} min` : 'Pending'}</strong></div>
                  <div><span><InspectorIcon type="unload" /> Unload</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.loadingMinutes} min` : '30 min'}</strong></div>
                  {selectedScheduleRequest?.secondaryRoute ? (
                <div><span><InspectorIcon type="map" /> {getSecondaryRouteReasonLabel(selectedScheduleRequest.secondaryRoute.reason)}</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.secondaryTravelMinutes + selectedScheduleTiming.secondaryServiceMinutes} min` : 'Pending'}</strong></div>
                  ) : null}
                  {includeReturnTransitToYard && !selectedScheduleHasSecondaryContinuation ? (
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
            <label className={`transport-snap-toggle transport-inspector-toggle${includeReturnTransitToYard ? ' active' : ''}`}>
              <input
                type="checkbox"
                checked={includeReturnTransitToYard}
                onChange={handleReturnTransitToggle}
              />
              <span>Return transit to yard</span>
            </label>
            <h3 className="transport-panel-section-title">Route Preview</h3>
            <RouteMapCanvas className="transport-schedule-inspector-map" routeData={selectedScheduleRouteData} loading={selectedScheduleRouteLoading} siteLocation={selectedScheduleRouteContext.siteLocation} expandable viewerTitle={selectedScheduleRouteContext.title} />
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
          className="transport-tile-menu"
          style={{ left: tileMenu.x, top: tileMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          {!tileMenuIsDeleteOnlySecondaryRoute ? (
            <>
              <button type="button" role="menuitem" onClick={() => openManualScheduleTime(tileMenu.orderId)} disabled={Boolean(dragSchedulingId)}>
                <span>Set time manually</span>
                <small>Enter exact start time</small>
              </button>
              <button type="button" role="menuitem" onClick={() => openSecondaryRouteModal(tileMenu.orderId)} disabled={Boolean(dragSchedulingId)}>
                <span>Add secondary route</span>
                <small>Extend this delivery with another stop</small>
              </button>
              <button type="button" role="menuitem" onClick={() => handleUnscheduleOrder(tileMenuSelectionIds)} disabled={Boolean(dragSchedulingId)}>
                <span>{tileMenuSelectionIds.length > 1 ? `Unschedule ${tileMenuSelectionIds.length} orders` : 'Unschedule order'}</span>
                <small>{tileMenuSelectionIds.length > 1 ? 'Return selected orders to pending requests' : 'Return to pending requests'}</small>
              </button>
            </>
          ) : null}
          <button type="button" role="menuitem" className="danger" onClick={() => handleDeleteScheduledOrder(tileMenuSelectionIds)} disabled={Boolean(dragSchedulingId)}>
            <span>{tileMenuSelectionIds.length > 1 ? `Delete ${tileMenuSelectionIds.length} orders` : 'Delete order'}</span>
            <small>{tileMenuSelectionIds.length > 1 ? 'Remove all selected requests' : tileMenuIsDeleteOnlySecondaryRoute ? 'Remove secondary route' : 'Remove this request'}</small>
          </button>
        </div>
      ) : null}

      {manualTimeModal ? (
        <div className="ts2-modal-root transport-manual-time-root">
          <div className="ts2-modal-backdrop" onClick={closeManualScheduleTime} />
          <form className="transport-manual-time-card" onSubmit={handleManualScheduleTime}>
            <div className="transport-manual-time-head">
              <div>
                <span>Manual Schedule Time</span>
                <h2>{manualTimeRequest?.builderName || manualTimeEvent?.builderName || 'Material Order'}</h2>
                <p>{getScaffoldDetailText(manualTimeRequest, manualTimeEvent)}</p>
              </div>
              <button type="button" className="transport-manual-time-close" onClick={closeManualScheduleTime} aria-label="Close manual time panel">x</button>
            </div>
            <div className="transport-manual-time-summary">
              <div><span>Truck</span><strong>{manualTimeEvent?.truckLabel || TRUCK_LANES.find(lane => lane.id === manualTimeEvent?.truckId)?.rego || 'ESS Transport'}</strong></div>
              <div><span>Duration</span><strong>{manualTimeDurationMinutes} min</strong></div>
            </div>
            <label className="transport-manual-time-field">
              <span>Start time</span>
              <input
                type="time"
                value={manualTimeModal.value}
                min={formatManualTimeInput(SCREEN_START_HOUR * 60)}
                max={formatManualTimeInput(SCREEN_END_HOUR * 60 - manualTimeDurationMinutes)}
                step="60"
                onChange={(inputEvent) => setManualTimeModal(current => current ? { ...current, value: inputEvent.target.value, error: '' } : current)}
                autoFocus
              />
            </label>
            {manualTimeModal.error ? <p className="transport-manual-time-error">{manualTimeModal.error}</p> : null}
            <div className="transport-manual-time-actions">
              <button type="button" className="transport-manual-time-secondary" onClick={closeManualScheduleTime}>Cancel</button>
              <button type="submit" className="transport-manual-time-primary">Move Tile</button>
            </div>
          </form>
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
                <RouteMapCanvas className="ts2-compact-map" routeData={requestModalRouteData} loading={requestModalRouteLoading} siteLocation={requestModal.siteLocation} expandable viewerTitle="Request Route" />
                <div className="ts2-estimate-grid">
                  <div><span>Transit from yard</span><strong>{requestModalSummary.deliveryFromYard}</strong></div>
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
                <RouteMapCanvas className="transport-route-modal-map" routeData={eventOverviewRouteData} loading={eventOverviewRouteLoading} siteLocation={eventOverviewModal.siteLocation} interactive />
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
                    <span>{eventOverviewModal.cycleState?.groupedCompletedCycle ? 'Completed delivery cycle' : scheduleStatusLabel(eventOverviewModal.request?.deliveryStatus ?? 'scheduled')}</span>
                  </div>
                ) : null}
                <div className="transport-route-modal-bottom">
                  <div className="transport-route-info-card">
                    <div className="transport-route-info-row"><span>Destination</span><strong>{eventOverviewModal.siteLocation || 'No site location saved for this project yet.'}</strong></div>
                    <div className="transport-route-info-row"><span>Truck</span><strong>{eventOverviewModal.event.truckLabel || 'ESS Transport'}</strong></div>
                    <div className="transport-route-info-row"><span>Status</span><strong>{eventOverviewModal.cycleState?.groupedCompletedCycle ? 'Completed delivery cycle' : scheduleStatusLabel(eventOverviewModal.request?.deliveryStatus ?? 'scheduled')}</strong></div>
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
