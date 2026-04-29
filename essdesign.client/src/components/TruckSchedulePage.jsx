import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { materialOrderRequestsAPI, safetyProjectsAPI } from '../services/api';
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
  getCachedRouteEstimate,
  getCachedRouteEstimateValue,
  getDeliveryActionRows,
  getEventFlex,
  getEventOffset,
  getPlannedDurationMinutes,
  getSafetyBuildersCached,
  getTimingProfile,
  getTruckAssignment,
  isSameDay,
  isTruckDeviceRole,
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
const OPTIMISTIC_BOARD_LOCK_MS = 12000;
const OPTIMISTIC_BOARD_SUCCESS_LOCK_MS = 8000;
const OPTIMISTIC_OVERRIDE_TTL_MS = 60000;
const SCALE_PREF_KEY = 'transport_web_schedule_scale_v1';
const SNAP_PREF_KEY = 'transport_web_schedule_snap_v1';

function dedupeRequests(items) {
  const map = new Map();
  (items || []).forEach(item => {
    if (item?.id) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
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

function buildBoardState(requestsForDay, routeMap) {
  const dateKey = requestsForDay[0]?.scheduledDate || formatDateKey(new Date());
  const groupedByTruck = new Map();
  const now = new Date();
  const dayEvents = [];
  const durationMap = {};
  const startMap = {};
  const primaryDurationMap = {};
  const cycleStateMap = {};

  requestsForDay.forEach(request => {
    const event = requestToCalendarEvent(request);
    const truckId = request.scheduledTruckId ?? request.truckId ?? event?.truckId ?? TRUCK_LANES[0].id;
    const list = groupedByTruck.get(truckId) ?? [];
    list.push(request);
    groupedByTruck.set(truckId, list);
  });

  groupedByTruck.forEach((truckRequests, truckId) => {
    let cumulativeShiftMinutes = 0;
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
        const timing = getTimingProfile(routeMap[request.id] ?? null);
        const scheduledStart = (request.scheduledHour ?? SCREEN_START_HOUR) * 60 + (request.scheduledMinute ?? 0);
        const shiftedScheduledStart = Math.max(SCREEN_START_HOUR * 60, scheduledStart + cumulativeShiftMinutes);
        const laterRequests = ordered.slice(index + 1);
        const nextStartedRequest = laterRequests.find(nextRequest => {
          const iso = nextRequest.deliveryStartedAt;
          if (!iso) return false;
          const parsed = new Date(iso);
          return !Number.isNaN(parsed.getTime()) && formatDateKey(parsed) === dateKey;
        }) || null;
        const nextActualStartMinutes = nextStartedRequest?.deliveryStartedAt
          ? (() => {
              const parsed = new Date(nextStartedRequest.deliveryStartedAt);
              return parsed.getHours() * 60 + parsed.getMinutes() + parsed.getSeconds() / 60;
            })()
          : null;
        const projected = projectRequestWindow(
          request,
          timing,
          dateKey,
          now,
          shiftedScheduledStart,
          nextActualStartMinutes,
          laterRequests.length > 0,
        );
        const startMinutes = projected.startMinutes;
        const durationMinutes = projected.durationMinutes;
        const primaryDurationMinutesValue = projected.primaryDurationMinutes;
        cumulativeShiftMinutes = projected.projectedEndMinutes - projected.plannedEndMinutes;
        startMap[request.id] = startMinutes;
        durationMap[request.id] = durationMinutes;
        primaryDurationMap[request.id] = primaryDurationMinutesValue;
        cycleStateMap[request.id] = {
          groupedCompletedCycle: projected.groupedCompletedCycle,
          showReturnTransitTile: projected.showReturnTransitTile,
          returnTransitEndMinutes: projected.returnTransitEndMinutes,
          isLastScheduledForDay: laterRequests.length === 0,
        };
        dayEvents.push({
          id: `remote-${request.id}`,
          date: dateKey,
          hour: Math.floor(startMinutes / 60),
          minute: Math.floor(startMinutes % 60),
          builderName: request.builderName,
          projectName: request.projectName,
          scaffoldingSystem: request.scaffoldingSystem,
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

function buildEstimateSummary(selectedDate, hour, minute, routeEstimate, hasSiteLocation) {
  const transitMinutes = routeEstimate?.durationMinutes ? Math.round(routeEstimate.durationMinutes) : 0;
  const loadingMinutes = 30;
  const returnMinutes = routeEstimate?.durationMinutes ? Math.round(routeEstimate.durationMinutes) : 0;
  const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hour, minute, 0, 0);
  const arrival = new Date(start.getTime() + transitMinutes * 60 * 1000);
  const loadingComplete = new Date(arrival.getTime() + loadingMinutes * 60 * 1000);
  const returned = new Date(loadingComplete.getTime() + returnMinutes * 60 * 1000);
  if (!hasSiteLocation) {
    return {
      deliveryFromYard: 'Pending site location',
      siteLoading: `${loadingMinutes} min`,
      returnTransit: 'Pending site location',
      overall: `${loadingMinutes} min onsite`,
      aestTime: formatTimeChip(hour, minute),
      arrivalTime: 'Pending',
      loadingCompleteTime: formatTimeChip(loadingComplete.getHours(), loadingComplete.getMinutes()),
      returnTime: 'Pending',
    };
  }
  if (!routeEstimate) {
    return {
      deliveryFromYard: 'Calculating route',
      siteLoading: `${loadingMinutes} min`,
      returnTransit: 'Calculating route',
      overall: `${loadingMinutes} min onsite`,
      aestTime: formatTimeChip(hour, minute),
      arrivalTime: 'Calculating',
      loadingCompleteTime: formatTimeChip(loadingComplete.getHours(), loadingComplete.getMinutes()),
      returnTime: 'Calculating',
    };
  }
  return {
    deliveryFromYard: `${transitMinutes} min`,
    siteLoading: `${loadingMinutes} min`,
    returnTransit: `${returnMinutes} min`,
    overall: `${transitMinutes + loadingMinutes + returnMinutes} min`,
    aestTime: formatTimeChip(hour, minute),
    arrivalTime: formatTimeChip(arrival.getHours(), arrival.getMinutes()),
    loadingCompleteTime: formatTimeChip(loadingComplete.getHours(), loadingComplete.getMinutes()),
    returnTime: formatTimeChip(returned.getHours(), returned.getMinutes()),
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
      <span className="transport-reference-legend-pill return-transit">Return Transit</span>
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

function CurrentTimeMarker({ selectedDate, timelineWidth, laneOffset = 0 }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!isSameDay(now, selectedDate)) {
    return null;
  }
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const totalMinutes = (SCREEN_END_HOUR - SCREEN_START_HOUR) * 60;
  const left = laneOffset + ((currentMinutes - SCREEN_START_HOUR * 60) / totalMinutes) * timelineWidth;
  if (left < laneOffset || left > laneOffset + timelineWidth) {
    return null;
  }
  return (
    <div className="ts2-now-marker" style={{ left }}>
      <span>{now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}</span>
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
  const [scheduleInspectorOpen, setScheduleInspectorOpen] = useState(true);
  const [draggedRequestId, setDraggedRequestId] = useState('');
  const [draggedScheduledOrderId, setDraggedScheduledOrderId] = useState('');
  const [dragPreviewDurationMinutes, setDragPreviewDurationMinutes] = useState(90);
  const [dropPreview, setDropPreview] = useState(null);
  const [dragSchedulingId, setDragSchedulingId] = useState('');
  const [tileMenu, setTileMenu] = useState(null);
  const [manualTimeModal, setManualTimeModal] = useState(null);
  const boardScrollRef = useRef(null);
  const scaleAnchorRef = useRef(null);
  const loadPromiseRef = useRef(null);
  const optimisticBoardLockUntilRef = useRef(0);
  const optimisticRequestOverridesRef = useRef(new Map());
  const dragPointerOffsetMinutesRef = useRef(0);

  const visibleTruckLanes = useMemo(() => {
    if (isTruckRole && assignedTruck) {
      return TRUCK_LANES.filter(lane => lane.id === assignedTruck.id);
    }
    return TRUCK_LANES;
  }, [assignedTruck, isTruckRole]);

  const loadBoard = useCallback(async () => {
    if (Date.now() < optimisticBoardLockUntilRef.current) {
      return Promise.resolve();
    }
    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
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
      setAllRequests(merged);
      const dateKey = formatDateKey(selectedDate);
      const requestsForDay = merged.filter(request => request.scheduledDate === dateKey);
      const siteLocationMap = Object.fromEntries(
        requestsForDay.map(request => [request.id, requestSiteLocationMap[request.id] ?? findProjectLocation(builders, request)]),
      );
      setRequestSiteLocationMap(current => ({ ...current, ...siteLocationMap }));
      const cachedRouteMap = Object.fromEntries(
        requestsForDay.map(request => {
          const siteLocation = siteLocationMap[request.id];
          return [request.id, siteLocation ? getCachedRouteEstimateValue(siteLocation, buildRouteScheduleFromRequest(request, selectedDate)) ?? null : null];
        }),
      );
      const initialBoard = buildBoardState(requestsForDay, cachedRouteMap);
      setDayEvents(initialBoard.dayEvents);
      setEventDurationMinutesMap(initialBoard.durationMap);
      setEventStartMinutesMap(initialBoard.startMap);
      setEventPrimaryDurationMinutesMap(initialBoard.primaryDurationMap);
      setEventCycleStateMap(initialBoard.cycleStateMap);
      setRequestMetaMap(Object.fromEntries(requestsForDay.map(request => [request.id, request])));
      setLoadingBoard(false);
      const resolvedRouteEntries = await Promise.all(
        requestsForDay.map(async request => {
          const siteLocation = siteLocationMap[request.id];
          return [request.id, siteLocation ? await getCachedRouteEstimate(siteLocation, buildRouteScheduleFromRequest(request, selectedDate)) : null];
        }),
      );
      const resolvedRouteMap = Object.fromEntries(resolvedRouteEntries);
      const nextBoard = buildBoardState(requestsForDay, resolvedRouteMap);
      setDayEvents(nextBoard.dayEvents);
      setEventDurationMinutesMap(nextBoard.durationMap);
      setEventStartMinutesMap(nextBoard.startMap);
      setEventPrimaryDurationMinutesMap(nextBoard.primaryDurationMap);
      setEventCycleStateMap(nextBoard.cycleStateMap);
      setError('');
    })().catch(err => {
      setError(err?.message || 'Failed to load truck schedule.');
      setLoadingBoard(false);
    }).finally(() => {
      loadPromiseRef.current = null;
    });
    loadPromiseRef.current = task;
    return task;
  }, [requestSiteLocationMap, selectedDate]);

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
    localStorage.setItem(`${SCALE_PREF_KEY}:${user?.id || user?.role || 'anon'}`, timelineScaleMode);
  }, [timelineScaleMode, user?.id, user?.role]);

  useEffect(() => {
    localStorage.setItem(`${SNAP_PREF_KEY}:${user?.id || user?.role || 'anon'}`, String(snapToTimeMarks));
  }, [snapToTimeMarks, user?.id, user?.role]);

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

  const timelineMarkers = useMemo(() => buildTimelineMarkers(timelineScaleMode), [timelineScaleMode]);
  const timelineWidth = useMemo(() => getTimelineWidth(timelineScaleMode), [timelineScaleMode]);
  const timelineScaleIndex = Math.max(0, SCALE_ORDER.indexOf(timelineScaleMode));
  const timelineSnapStep = snapToTimeMarks
    ? SCALE_MODES[timelineScaleMode]?.tickMinutes || DRAG_SCHEDULE_MINUTE_STEP
    : DRAG_SCHEDULE_MINUTE_STEP;
  const pendingRequests = useMemo(
    () => allRequests.filter(request => !request.scheduledDate && !request.archivedAt),
    [allRequests],
  );
  const groupedEventsByTruck = useMemo(
    () => visibleTruckLanes.map(lane => dayEvents.filter(event => event.truckId === lane.id)),
    [dayEvents, visibleTruckLanes],
  );
  useEffect(() => {
    if (selectedScheduleEventId && dayEvents.some(event => event.orderId === selectedScheduleEventId)) {
      return;
    }
    setSelectedScheduleEventId(dayEvents[0]?.orderId || '');
  }, [dayEvents, selectedScheduleEventId]);
  const handleSelectScheduleEvent = useCallback((orderId) => {
    setSelectedScheduleEventId(orderId);
    setScheduleInspectorOpen(true);
  }, []);
  const selectedScheduleEvent = useMemo(
    () => dayEvents.find(event => event.orderId === selectedScheduleEventId) || dayEvents[0] || null,
    [dayEvents, selectedScheduleEventId],
  );
  const selectedScheduleRequest = selectedScheduleEvent ? requestMetaMap[selectedScheduleEvent.orderId] : null;
  const selectedScheduleSiteLocation = selectedScheduleRequest ? requestSiteLocationMap[selectedScheduleRequest.id] : '';
  const selectedScheduleRouteSchedule = useMemo(() => buildRouteScheduleFromEvent(selectedScheduleEvent), [selectedScheduleEvent]);
  const selectedScheduleTiming = selectedScheduleRequest ? getTimingProfile(getCachedRouteEstimateValue(selectedScheduleSiteLocation, selectedScheduleRouteSchedule) ?? null) : null;
  const selectedScheduleActionRows = getDeliveryActionRows(selectedScheduleRequest);
  const selectedScheduleWindowLabel = useMemo(() => {
    if (!selectedScheduleEvent) return 'No delivery selected';
    const startMinutes = (eventStartMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleEvent.hour * 60 + selectedScheduleEvent.minute);
    const durationMinutes = eventPrimaryDurationMinutesMap[selectedScheduleEvent.orderId] ?? eventDurationMinutesMap[selectedScheduleEvent.orderId] ?? selectedScheduleTiming?.totalMinutes ?? 90;
    const endMinutes = startMinutes + durationMinutes;
    return `${formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} - ${formatTimeChip(Math.floor(endMinutes / 60), Math.floor(endMinutes % 60))}`;
  }, [eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, selectedScheduleEvent, selectedScheduleTiming?.totalMinutes]);
  useEffect(() => {
    if (!scheduleInspectorOpen || !selectedScheduleEventId || !selectedScheduleSiteLocation) {
      setSelectedScheduleRouteData(null);
      setSelectedScheduleRouteLoading(false);
      return undefined;
    }

    let active = true;
    setSelectedScheduleRouteLoading(true);
    setSelectedScheduleRouteData(null);

    getCachedRouteData(selectedScheduleSiteLocation, selectedScheduleRouteSchedule)
      .then(data => {
        if (active) {
          setSelectedScheduleRouteData(data);
        }
      })
      .catch(() => {
        if (active) {
          setSelectedScheduleRouteData(null);
        }
      })
      .finally(() => {
        if (active) {
          setSelectedScheduleRouteLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [scheduleInspectorOpen, selectedScheduleEventId, selectedScheduleRouteSchedule, selectedScheduleSiteLocation]);
  const selectedRouteDurationMinutes = useMemo(
    () => Math.max(30, selectedRouteEstimate?.durationMinutes ? Math.round(selectedRouteEstimate.durationMinutes) * 2 + 30 : 90),
    [selectedRouteEstimate],
  );
  const selectedScheduleTrafficCopy = useMemo(
    () => getTrafficPanelCopy(selectedScheduleRouteData, selectedScheduleRouteLoading),
    [selectedScheduleRouteData, selectedScheduleRouteLoading],
  );
  const requestModalSummary = useMemo(
    () => buildEstimateSummary(selectedDate, selectedHour, selectedMinute, selectedRouteEstimate, Boolean(requestModal?.siteLocation)),
    [requestModal?.siteLocation, selectedDate, selectedHour, selectedMinute, selectedRouteEstimate],
  );
  const requestModalActionRows = useMemo(() => getDeliveryActionRows(requestModal?.request), [requestModal]);
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
    const request = eventOverviewModal.request;
    return buildEstimateSummary(
      eventOverviewModal.siteLocation,
      new Date(`${eventOverviewModal.event.date}T00:00:00`),
      eventOverviewModal.event.hour,
      eventOverviewModal.event.minute,
      eventOverviewModal.routeEstimate,
      Boolean(eventOverviewModal.siteLocation),
    );
  }, [eventOverviewModal]);
  const manualTimeEvent = useMemo(
    () => manualTimeModal ? dayEvents.find(event => event.orderId === manualTimeModal.requestId) || null : null,
    [dayEvents, manualTimeModal],
  );
  const manualTimeRequest = manualTimeEvent ? requestMetaMap[manualTimeEvent.orderId] : null;
  const manualTimeDurationMinutes = manualTimeModal ? eventDurationMinutesMap[manualTimeModal.requestId] ?? 90 : 90;

  const openRequestModal = useCallback(async requestId => {
    setRequestModalLoading(true);
    setRequestModal(null);
    setRequestModalRouteData(null);
    setRequestModalRouteLoading(false);
    const request = allRequests.find(item => item.id === requestId) ?? await materialOrderRequestsAPI.getRequest(requestId);
    if (!request) {
      setRequestModalLoading(false);
      return;
    }
    const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
    const siteLocation = requestSiteLocationMap[request.id] ?? findProjectLocation(builders, request);
    const nextTruckId = request.scheduledTruckId ?? request.truckId ?? selectedTruckId ?? TRUCK_LANES[0].id;
    const nextRouteEstimate = siteLocation ? await getCachedRouteEstimate(siteLocation, buildRouteScheduleFromRequest(request, selectedDate)) : null;
    setSelectedRouteEstimate(nextRouteEstimate);
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
    if (siteLocation) {
      setRequestModalRouteLoading(true);
      getCachedRouteData(siteLocation, buildRouteScheduleFromRequest(request, selectedDate))
        .then(data => setRequestModalRouteData(data))
        .finally(() => setRequestModalRouteLoading(false));
    }
  }, [allRequests, dayEvents, eventDurationMinutesMap, eventStartMinutesMap, requestSiteLocationMap, selectedDate, selectedTruckId]);

  const closeRequestModal = useCallback(() => {
    setRequestModal(null);
    setRequestModalLoading(false);
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
    const routeEstimate = siteLocation ? await getCachedRouteEstimate(siteLocation, buildRouteScheduleFromEvent(event)) : null;
    const cycleState = eventCycleStateMap[event.orderId] ?? null;
    const modalState = { event, request, siteLocation, routeEstimate, cycleState };
    setEventOverviewModal(modalState);
    setEventOverviewLoading(false);
    if (siteLocation) {
      setEventOverviewRouteLoading(true);
      getCachedRouteData(siteLocation, buildRouteScheduleFromEvent(event))
        .then(data => setEventOverviewRouteData(data))
        .finally(() => setEventOverviewRouteLoading(false));
    }
  }, [eventCycleStateMap, requestMetaMap, requestSiteLocationMap]);

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
    setAllRequests(current => current.map(item => item.id === requestId ? updatedRequest : item));
    setRequestMetaMap(current => ({ ...current, [requestId]: updatedRequest }));
    setDayEvents(current => {
      const nextEvent = {
        id: current.find(event => event.orderId === requestId)?.id || `remote-${requestId}`,
        date: dateKey,
        hour: selectedHour,
        minute: selectedMinute,
        builderName: updatedRequest.builderName,
        projectName: updatedRequest.projectName,
        scaffoldingSystem: updatedRequest.scaffoldingSystem,
        orderId: requestId,
        truckId: truck?.id ?? selectedTruckId,
        truckLabel: truck?.rego ?? updatedRequest.scheduledTruckLabel ?? updatedRequest.truckLabel ?? null,
      };
      return [...current.filter(event => event.orderId !== requestId), nextEvent]
        .sort((left, right) => (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute));
    });
    setEventStartMinutesMap(current => ({ ...current, [requestId]: selectedHour * 60 + selectedMinute }));
    setEventDurationMinutesMap(current => ({ ...current, [requestId]: current[requestId] ?? selectedRouteDurationMinutes }));
    setEventPrimaryDurationMinutesMap(current => ({ ...current, [requestId]: current[requestId] ?? Math.min(selectedRouteDurationMinutes, 90) }));
    setSelectedScheduleEventId(requestId);
    setScheduleInspectorOpen(true);
    closeRequestModal();
    optimisticRequestOverridesRef.current.set(requestId, {
      request: updatedRequest,
      expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
    });
    optimisticBoardLockUntilRef.current = Date.now() + OPTIMISTIC_BOARD_LOCK_MS;

    materialOrderRequestsAPI.setSchedule(requestId, {
        date: formatDateKey(selectedDate),
        hour: selectedHour,
        minute: selectedMinute,
        truckId: truck?.id ?? selectedTruckId,
        truckLabel: truck?.rego ?? requestModal.request.scheduledTruckLabel ?? null,
      })
      .then(() => {
        optimisticBoardLockUntilRef.current = Date.now() + OPTIMISTIC_BOARD_SUCCESS_LOCK_MS;
        setError('');
      })
      .catch(err => {
        optimisticBoardLockUntilRef.current = 0;
        optimisticRequestOverridesRef.current.delete(requestId);
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setError(err?.message || 'Failed to schedule request.');
      })
      .finally(() => {
        setScheduleSaving(false);
      });
  }, [allRequests, closeRequestModal, dayEvents, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, requestMetaMap, requestModal, selectedDate, selectedHour, selectedMinute, selectedRouteDurationMinutes, selectedTruckId]);

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
      setAllRequests(current => current.map(item => item.id === requestId ? updatedRequest : item));
      setRequestMetaMap(current => ({ ...current, [requestId]: updatedRequest }));
      setDayEvents(current => {
        const nextEvent = {
          id: current.find(event => event.orderId === requestId)?.id || `remote-${requestId}`,
          date: dateKey,
          hour,
          minute,
          builderName: updatedRequest.builderName,
          projectName: updatedRequest.projectName,
          scaffoldingSystem: updatedRequest.scaffoldingSystem,
          orderId: requestId,
          truckId: truck?.id ?? truckId,
          truckLabel: truck?.rego ?? updatedRequest.scheduledTruckLabel ?? updatedRequest.truckLabel ?? null,
        };
        return [...current.filter(event => event.orderId !== requestId), nextEvent]
          .sort((left, right) => (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute));
      });
      setEventStartMinutesMap(current => ({ ...current, [requestId]: safeMinutes }));
      setEventDurationMinutesMap(current => ({ ...current, [requestId]: current[requestId] ?? durationMinutes }));
      setEventPrimaryDurationMinutesMap(current => ({ ...current, [requestId]: current[requestId] ?? Math.min(durationMinutes, 90) }));
    }

    setSelectedScheduleEventId(requestId);
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
    optimisticBoardLockUntilRef.current = Date.now() + OPTIMISTIC_BOARD_LOCK_MS;

    materialOrderRequestsAPI.setSchedule(requestId, {
        date: formatDateKey(selectedDate),
        hour,
        minute,
        truckId: truck?.id ?? truckId,
        truckLabel: truck?.rego ?? null,
      })
      .then(() => {
        optimisticBoardLockUntilRef.current = Date.now() + OPTIMISTIC_BOARD_SUCCESS_LOCK_MS;
        setError('');
      })
      .catch(err => {
        optimisticBoardLockUntilRef.current = 0;
        optimisticRequestOverridesRef.current.delete(requestId);
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setError(err?.message || 'Failed to schedule request.');
      });
  }, [allRequests, dayEvents, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, requestMetaMap, selectedDate]);

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

  const handlePendingDragStart = useCallback((event, request) => {
    const requestId = request?.id;
    if (!requestId) {
      return;
    }
    setDraggedRequestId(requestId);
    setDraggedScheduledOrderId('');
    setDragPreviewDurationMinutes(90);
    dragPointerOffsetMinutesRef.current = 0;
    setDropPreview(null);
    setManualTimeModal(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', requestId);
    setScheduleDragImage(event, request, {
      width: getEventFlex(90) * timelineWidth,
      height: 78,
    });
  }, [timelineWidth]);

  const handlePendingDragEnd = useCallback(() => {
    setDraggedRequestId('');
    setDraggedScheduledOrderId('');
    setDragPreviewDurationMinutes(90);
    dragPointerOffsetMinutesRef.current = 0;
    setDropPreview(null);
  }, []);

  const handleScheduledDragStart = useCallback((event, scheduleEvent, request, durationMinutes, palette) => {
    if (!scheduleEvent?.orderId) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    setDraggedRequestId(scheduleEvent.orderId);
    setDraggedScheduledOrderId(scheduleEvent.orderId);
    setDragPreviewDurationMinutes(durationMinutes || 90);
    dragPointerOffsetMinutesRef.current = pointerRatio * (durationMinutes || 90);
    setDropPreview(null);
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
  }, []);

  const handleScheduledDragEnd = useCallback(() => {
    setDraggedRequestId('');
    setDraggedScheduledOrderId('');
    setDragPreviewDurationMinutes(90);
    dragPointerOffsetMinutesRef.current = 0;
    setDropPreview(null);
  }, []);

  const handleLaneDragOver = useCallback((event, truckId) => {
    if (!draggedRequestId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const minutes = getDropMinutesFromPointer(event.clientX, event.currentTarget, {
      durationMinutes: dragPreviewDurationMinutes,
      pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
      step: timelineSnapStep,
    });
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
  }, [dayEvents, dragPreviewDurationMinutes, draggedRequestId, eventDurationMinutesMap, eventStartMinutesMap, timelineSnapStep]);

  const handleLaneDragLeave = useCallback((event, truckId) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDropPreview(current => current?.truckId === truckId ? null : current);
  }, []);

  const handleLaneDrop = useCallback((event, truckId) => {
    const requestId = event.dataTransfer.getData('text/plain') || draggedRequestId;
    if (!requestId) {
      return;
    }
    event.preventDefault();
    const minutes = getDropMinutesFromPointer(event.clientX, event.currentTarget, {
      durationMinutes: dragPreviewDurationMinutes,
      pointerOffsetMinutes: dragPointerOffsetMinutesRef.current,
      step: timelineSnapStep,
    });
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
  }, [dayEvents, dragPreviewDurationMinutes, draggedRequestId, eventDurationMinutesMap, eventStartMinutesMap, scheduleRequestAt, timelineSnapStep]);

  const handleEventSnapDragOver = useCallback((event, scheduleEvent) => {
    const requestId = event.dataTransfer.getData('text/plain') || draggedRequestId;
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

  const handleUnscheduleOrder = useCallback((requestId) => {
    if (!requestId) {
      return;
    }
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;
    const sourceRequest = allRequests.find(item => item.id === requestId) || requestMetaMap[requestId] || null;
    const updatedRequest = sourceRequest ? {
      ...sourceRequest,
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
    } : null;

    setTileMenu(null);
    if (updatedRequest) {
      setAllRequests(current => current.map(item => item.id === requestId ? updatedRequest : item));
      setRequestMetaMap(current => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      setDayEvents(current => current.filter(event => event.orderId !== requestId));
      setEventStartMinutesMap(current => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      setEventDurationMinutesMap(current => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      setEventPrimaryDurationMinutesMap(current => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
    }
    setSelectedScheduleEventId(current => current === requestId ? '' : current);
    if (updatedRequest) {
      optimisticRequestOverridesRef.current.set(requestId, {
        request: updatedRequest,
        expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
      });
    }
    optimisticBoardLockUntilRef.current = Date.now() + OPTIMISTIC_BOARD_LOCK_MS;

    materialOrderRequestsAPI.clearSchedule(requestId)
      .then(() => {
        optimisticBoardLockUntilRef.current = Date.now() + OPTIMISTIC_BOARD_SUCCESS_LOCK_MS;
        setError('');
      })
      .catch(err => {
        optimisticBoardLockUntilRef.current = 0;
        optimisticRequestOverridesRef.current.delete(requestId);
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setError(err?.message || 'Failed to unschedule order.');
      });
  }, [allRequests, dayEvents, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, requestMetaMap]);

  const handleDeleteScheduledOrder = useCallback((requestId) => {
    if (!requestId) {
      return;
    }
    if (!window.confirm('Delete this transport order? This removes it from the active schedule and request list.')) {
      return;
    }
    const previousRequests = allRequests;
    const previousEvents = dayEvents;
    const previousMetaMap = requestMetaMap;
    const previousStartMap = eventStartMinutesMap;
    const previousDurationMap = eventDurationMinutesMap;
    const previousPrimaryDurationMap = eventPrimaryDurationMinutesMap;

    setTileMenu(null);
    setAllRequests(current => current.filter(item => item.id !== requestId));
    setRequestMetaMap(current => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });
    setDayEvents(current => current.filter(event => event.orderId !== requestId));
    setEventStartMinutesMap(current => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });
    setEventDurationMinutesMap(current => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });
    setEventPrimaryDurationMinutesMap(current => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });
    setSelectedScheduleEventId(current => current === requestId ? '' : current);
    optimisticRequestOverridesRef.current.set(requestId, {
      deleted: true,
      expiresAt: Date.now() + OPTIMISTIC_OVERRIDE_TTL_MS,
    });
    optimisticBoardLockUntilRef.current = Date.now() + OPTIMISTIC_BOARD_LOCK_MS;

    materialOrderRequestsAPI.deleteRequest(requestId)
      .then(() => {
        optimisticBoardLockUntilRef.current = Date.now() + OPTIMISTIC_BOARD_SUCCESS_LOCK_MS;
        setError('');
      })
      .catch(err => {
        optimisticBoardLockUntilRef.current = 0;
        optimisticRequestOverridesRef.current.delete(requestId);
        setAllRequests(previousRequests);
        setDayEvents(previousEvents);
        setRequestMetaMap(previousMetaMap);
        setEventStartMinutesMap(previousStartMap);
        setEventDurationMinutesMap(previousDurationMap);
        setEventPrimaryDurationMinutesMap(previousPrimaryDurationMap);
        setError(err?.message || 'Failed to delete order.');
      });
  }, [allRequests, dayEvents, eventDurationMinutesMap, eventPrimaryDurationMinutesMap, eventStartMinutesMap, requestMetaMap]);

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
          <div className="ts2-board-body">
            <CurrentTimeMarker selectedDate={selectedDate} timelineWidth={timelineWidth} laneOffset={TRACK_OFFSET} />
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
                      {laneEvents.map(event => {
                      const cycleState = eventCycleStateMap[event.orderId] || {};
                      const request = requestMetaMap[event.orderId];
                      const status = request?.deliveryStatus || 'scheduled';
                      const durationMinutes = eventDurationMinutesMap[event.orderId] ?? 90;
                      const primaryDurationMinutes = eventPrimaryDurationMinutesMap[event.orderId] ?? durationMinutes;
                      const offset = getEventOffset(eventStartMinutesMap[event.orderId] ?? event.hour * 60 + event.minute) * 100;
                      const width = getEventFlex(durationMinutes) * 100;
                      const primaryRatio = Math.max(0, Math.min(1, primaryDurationMinutes / Math.max(1, durationMinutes)));
                      const primaryWidth = primaryRatio * 100;
                      const returnWidth = Math.max(0, 100 - primaryWidth);
                      const hasReturnTransitTile = status === 'return_transit' && cycleState.showReturnTransitTile && returnWidth > 0;
                      const groupedCompletedCycle = status === 'return_transit' && cycleState.groupedCompletedCycle;
                      const palette = status === 'return_transit' && (hasReturnTransitTile || groupedCompletedCycle)
                        ? deliveredTileAppearance()
                        : scheduleStatusAppearance(status);
                      const startMinutes = eventStartMinutesMap[event.orderId] ?? event.hour * 60 + event.minute;
                      const primaryEnd = startMinutes + primaryDurationMinutes;
                      const siteLocation = requestSiteLocationMap[event.orderId] || '';
                      const timing = getTimingProfile(getCachedRouteEstimateValue(siteLocation, buildRouteScheduleFromEvent(event)) ?? null);
                      const siteArrivalMinutes = startMinutes + timing.transitMinutes;
                      const siteArrivalLabel = siteLocation
                        ? formatTimeChip(Math.floor(siteArrivalMinutes / 60), Math.floor(siteArrivalMinutes % 60))
                        : 'pending';
                      const scaffoldDetailText = getScaffoldDetailText(request, event);
                      return (
                        <div
                          key={event.id}
                          className={`ts2-event-wrap${draggedRequestId ? ' drag-active' : ''}${draggedScheduledOrderId === event.orderId ? ' dragging' : ''}`}
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
                            className="ts2-event-card"
                            style={{ backgroundColor: palette.background, color: palette.text, width: hasReturnTransitTile ? `${primaryWidth}%` : '100%' }}
                            onClick={() => {
                              handleSelectScheduleEvent(event.orderId);
                            }}
                          >
                            <span className="ts2-event-time">{formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} – {formatTimeChip(Math.floor(primaryEnd / 60), Math.floor(primaryEnd % 60))}</span>
                            <strong className="ts2-event-title">{event.builderName || 'Material Order'}</strong>
                            <span className="ts2-event-subtitle">{scaffoldDetailText}</span>
                            <span className="ts2-event-arrival">ETA site {siteArrivalLabel}</span>
                            <div className="ts2-event-status-row">
                              <span className="ts2-event-status-dot" style={{ backgroundColor: palette.accent }} />
                              <span>{groupedCompletedCycle ? 'Completed delivery cycle' : status === 'return_transit' ? 'Delivered' : scheduleStatusLabel(status)}</span>
                            </div>
                          </button>
                          {hasReturnTransitTile ? (
                            <button type="button" className="ts2-return-card" style={{ left: `${primaryWidth}%`, width: `${returnWidth}%` }} onClick={() => {
                              handleSelectScheduleEvent(event.orderId);
                            }}>
                              <span>Return transit</span>
                              <strong>Back to yard</strong>
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
            <span>Selected Delivery</span>
            <h2>{selectedScheduleWindowLabel}</h2>
          </div>
          {selectedScheduleRequest ? <span className={`transport-status-pill status-${selectedScheduleRequest.deliveryStatus || 'scheduled'}`}>{scheduleStatusLabel(selectedScheduleRequest.deliveryStatus || 'scheduled')}</span> : null}
          <button type="button" className="transport-inspector-close" onClick={() => setScheduleInspectorOpen(false)} aria-label="Close selected delivery panel">×</button>
        </div>
        {selectedScheduleEvent ? (
          <>
            <dl className="transport-schedule-detail-list">
              <div><dt>Builder</dt><dd>{selectedScheduleEvent.builderName || 'Material Order'}</dd></div>
              <div><dt>Project</dt><dd>{selectedScheduleEvent.projectName || 'Scheduled delivery'}</dd></div>
              <div><dt>Destination</dt><dd>{selectedScheduleSiteLocation || 'Site location pending'}</dd></div>
              <div><dt>Scaffold System</dt><dd>{selectedScheduleEvent.scaffoldingSystem || selectedScheduleRequest?.scaffoldingSystem || '-'}</dd></div>
            </dl>
            <div className="transport-schedule-estimate-card">
              <div><span><InspectorIcon type="truck" /> Travel</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.transitMinutes} min` : 'Pending'}</strong></div>
              <div><span><InspectorIcon type="unload" /> Unload</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.loadingMinutes} min` : '30 min'}</strong></div>
              <div><span><InspectorIcon type="return" /> Return</span><strong>{selectedScheduleTiming ? `${selectedScheduleTiming.returnMinutes} min` : 'Pending'}</strong></div>
              <div><span><InspectorIcon type="clock" /> Total Duration</span><strong>{selectedScheduleTiming ? `${Math.floor(selectedScheduleTiming.totalMinutes / 60)} h ${selectedScheduleTiming.totalMinutes % 60} m` : 'Calculating'}</strong></div>
            </div>
            <h3 className="transport-panel-section-title">Route Preview</h3>
            <RouteMapCanvas className="transport-schedule-inspector-map" routeData={selectedScheduleRouteData} loading={selectedScheduleRouteLoading} siteLocation={selectedScheduleSiteLocation} expandable viewerTitle="Selected Delivery Route" />
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
          <button type="button" role="menuitem" onClick={() => openManualScheduleTime(tileMenu.orderId)} disabled={Boolean(dragSchedulingId)}>
            <span>Set time manually</span>
            <small>Enter exact start time</small>
          </button>
          <button type="button" role="menuitem" onClick={() => handleUnscheduleOrder(tileMenu.orderId)} disabled={Boolean(dragSchedulingId)}>
            <span>Unschedule order</span>
            <small>Return to pending requests</small>
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => handleDeleteScheduledOrder(tileMenu.orderId)} disabled={Boolean(dragSchedulingId)}>
            <span>Delete order</span>
            <small>Remove this request</small>
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
                  <div><span>Return transit</span><strong>{requestModalSummary.returnTransit}</strong></div>
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
                      <div className="transport-route-info-row"><span>Return transit</span><strong>{overviewSummary.returnTransit}</strong></div>
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
