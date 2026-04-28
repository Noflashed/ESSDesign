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
  fetchRouteData,
  findProjectLocation,
  formatActionTimestamp,
  formatBoardDay,
  formatDistance,
  formatDuration,
  formatTimeChip,
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
  standard: { label: 'Scale', pxPerHour: 160, tickMinutes: 30, labelEveryMinutes: 60 },
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
const SCALE_PREF_KEY = 'transport_web_schedule_scale_v1';

function dedupeRequests(items) {
  const map = new Map();
  (items || []).forEach(item => {
    if (item?.id) {
      map.set(item.id, item);
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

function buildEstimateSummary(selectedDate, hour, minute, routeEstimate, hasSiteLocation) {
  const transitMinutes = routeEstimate?.durationMinutes ?? 0;
  const loadingMinutes = 30;
  const returnMinutes = routeEstimate?.durationMinutes ?? 0;
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

function LegendDot({ color, label }) {
  return (
    <span className="ts2-legend-item">
      <span className="ts2-legend-dot" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
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
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [timelineScaleMode, setTimelineScaleMode] = useState(() => {
    const saved = localStorage.getItem(`${SCALE_PREF_KEY}:${user?.id || user?.role || 'anon'}`);
    return saved && SCALE_MODES[saved] ? saved : 'standard';
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
  const boardScrollRef = useRef(null);
  const scaleAnchorRef = useRef(null);
  const loadPromiseRef = useRef(null);

  const visibleTruckLanes = useMemo(() => {
    if (isTruckRole && assignedTruck) {
      return TRUCK_LANES.filter(lane => lane.id === assignedTruck.id);
    }
    return TRUCK_LANES;
  }, [assignedTruck, isTruckRole]);

  const loadBoard = useCallback(async () => {
    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
    }
    const task = (async () => {
      const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
      const [active, archived] = await Promise.all([
        materialOrderRequestsAPI.listActiveRequests({ includeArchived: true }).catch(() => []),
        materialOrderRequestsAPI.listArchivedRequests().catch(() => []),
      ]);
      const merged = dedupeRequests([...active, ...archived]);
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
          return [request.id, siteLocation ? getCachedRouteEstimateValue(siteLocation) ?? null : null];
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
          return [request.id, siteLocation ? await getCachedRouteEstimate(siteLocation) : null];
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

  const timelineMarkers = useMemo(() => buildTimelineMarkers(timelineScaleMode), [timelineScaleMode]);
  const timelineWidth = useMemo(() => getTimelineWidth(timelineScaleMode), [timelineScaleMode]);
  const pendingRequests = useMemo(
    () => allRequests.filter(request => !request.scheduledDate && !request.archivedAt),
    [allRequests],
  );
  const groupedEventsByTruck = useMemo(
    () => visibleTruckLanes.map(lane => dayEvents.filter(event => event.truckId === lane.id)),
    [dayEvents, visibleTruckLanes],
  );
  const selectedRouteDurationMinutes = useMemo(
    () => Math.max(30, selectedRouteEstimate?.durationMinutes ? selectedRouteEstimate.durationMinutes * 2 + 30 : 90),
    [selectedRouteEstimate],
  );
  const requestModalSummary = useMemo(
    () => buildEstimateSummary(selectedDate, selectedHour, selectedMinute, selectedRouteEstimate, Boolean(requestModal?.siteLocation)),
    [requestModal?.siteLocation, selectedDate, selectedHour, selectedMinute, selectedRouteEstimate],
  );
  const requestModalActionRows = useMemo(() => getDeliveryActionRows(requestModal?.request), [requestModal]);
  const timelineScaleLabel = useMemo(() => SCALE_MODES[timelineScaleMode]?.label || 'Scale', [timelineScaleMode]);
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
    const nextRouteEstimate = siteLocation ? await getCachedRouteEstimate(siteLocation) : null;
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
      fetchRouteData(siteLocation)
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
    const routeEstimate = siteLocation ? await getCachedRouteEstimate(siteLocation) : null;
    const cycleState = eventCycleStateMap[event.orderId] ?? null;
    const modalState = { event, request, siteLocation, routeEstimate, cycleState };
    setEventOverviewModal(modalState);
    setEventOverviewLoading(false);
    if (siteLocation) {
      setEventOverviewRouteLoading(true);
      fetchRouteData(siteLocation)
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

  const handleSchedule = useCallback(async () => {
    if (!requestModal?.request || !selectedTruckId) {
      return;
    }
    const scheduleDateIso = buildScheduleIso(formatDateKey(selectedDate), selectedHour, selectedMinute);
    if (!scheduleDateIso || new Date(scheduleDateIso).getTime() <= Date.now()) {
      window.alert('Please choose a future time for this delivery.');
      return;
    }
    setScheduleSaving(true);
    try {
      const truck = TRUCK_LANES.find(lane => lane.id === selectedTruckId);
      await materialOrderRequestsAPI.setSchedule(requestModal.request.id, {
        date: formatDateKey(selectedDate),
        hour: selectedHour,
        minute: selectedMinute,
        truckId: truck?.id ?? selectedTruckId,
        truckLabel: truck?.rego ?? requestModal.request.scheduledTruckLabel ?? null,
      });
      setAllRequests(current => current.map(item => item.id === requestModal.request.id ? {
        ...item,
        scheduledDate: formatDateKey(selectedDate),
        scheduledHour: selectedHour,
        scheduledMinute: selectedMinute,
        scheduledTruckId: truck?.id ?? selectedTruckId,
        scheduledTruckLabel: truck?.rego ?? null,
        truckId: truck?.id ?? selectedTruckId,
        truckLabel: truck?.rego ?? null,
        deliveryStatus: 'scheduled',
        deliveryStartedAt: null,
        deliveryUnloadingAt: null,
        deliveryConfirmedAt: null,
      } : item));
      closeRequestModal();
      await loadBoard();
    } finally {
      setScheduleSaving(false);
    }
  }, [closeRequestModal, loadBoard, requestModal, selectedDate, selectedHour, selectedMinute, selectedTruckId]);

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

  return (
    <div className="ts2-page">
      <div className="ts2-header">
        <div className="ts2-header-left">
          {!isTruckRole ? (
            <button type="button" className="ts2-header-icon-btn" aria-label="Transport menu">☰</button>
          ) : null}
          <h1>{isTruckRole ? (assignedTruck?.rego || 'Truck') + ' Schedule' : 'Truck Schedule'}</h1>
        </div>
        <div className="ts2-header-actions">
          {!isTruckRole ? (
            <button type="button" className="ts2-secondary-btn" onClick={() => onNavigate?.('transport-dashboard')}>Home</button>
          ) : null}
          <div className="ts2-header-date-pill">{selectedDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</div>
          <button type="button" className="ts2-secondary-btn" onClick={() => setSelectedDate(startOfDay(new Date()))}>Today</button>
          {!isTruckRole ? <button type="button" className="ts2-secondary-btn">Filter</button> : null}
          {!isTruckRole ? <button type="button" className="ts2-secondary-btn" onClick={() => window.alert('Debug controls will be surfaced here in the web transport suite.')}>Debug</button> : null}
          {!isTruckRole ? (
            <button type="button" className="ts2-primary-btn solid" onClick={() => setShowPendingPanel(open => !open)}>
              Scheduled Orders <span>{pendingRequests.length}</span>
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="ts2-error">{error}</div> : null}

      {!isTruckRole && showPendingPanel ? (
        <div className="ts2-pending-panel">
          <div className="ts2-pending-head">
            <strong>Scheduled Orders</strong>
            <span>{pendingRequests.length}</span>
          </div>
          {pendingRequests.length === 0 ? (
            <p>All material requests are scheduled.</p>
          ) : (
            <div className="ts2-pending-list">
              {pendingRequests.map(request => (
                <div key={request.id} className="ts2-pending-item">
                  <div>
                    <strong>{request.builderName || 'Material Order'}</strong>
                    <span>{request.projectName || 'Awaiting site assignment'}</span>
                  </div>
                  <button type="button" onClick={() => openRequestModal(request.id)}>Schedule</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="ts2-board-card">
        <div className="ts2-board-card-head">
          <div>
            <strong className="ts2-board-card-title">Live Schedule</strong>
            <span className="ts2-board-card-subtitle">{formatBoardDay(selectedDate)}</span>
          </div>
          <div className="ts2-board-card-controls">
            <button
              type="button"
              className={'ts2-chip-btn' + (timelineScaleMode !== 'standard' ? ' active' : '')}
              onClick={() => {
                if (boardScrollRef.current) {
                  const node = boardScrollRef.current;
                  const maxScroll = Math.max(1, node.scrollWidth - node.clientWidth);
                  scaleAnchorRef.current = node.scrollLeft / maxScroll;
                }
                setTimelineScaleMode(current => cycleScaleMode(current));
              }}
            >
              {timelineScaleLabel}
            </button>
            <button type="button" className="ts2-nav-btn" onClick={() => setSelectedDate(date => new Date(date.getTime() - 86400000))}>‹</button>
            <button type="button" className="ts2-nav-btn" onClick={() => setSelectedDate(date => new Date(date.getTime() + 86400000))}>›</button>
          </div>
        </div>

        <div className="ts2-legend-row ts2-legend-row-inline">
          <LegendDot color="#16A34A" label="Scheduled" />
          <LegendDot color="#2563EB" label="In transit" />
          <LegendDot color="#F47C20" label="Offloading" />
          <LegendDot color="#7C3AED" label="Delivered" />
          <LegendDot color="#6B7280" label="Return transit" />
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
                    <div className="ts2-lane-track" style={{ width: timelineWidth }}>
                      {timelineMarkers.slice(1, -1).map(marker => (
                        <div key={`${lane.id}-${marker.minutes}`} className={`ts2-grid-line${marker.isHour ? ' major' : ''}`} style={{ left: `${((marker.minutes - SCREEN_START_HOUR * 60) / ((SCREEN_END_HOUR - SCREEN_START_HOUR) * 60)) * 100}%` }} />
                      ))}
                      {loadingBoard && laneIndex === 0 ? <div className="ts2-loading">Loading live schedule…</div> : null}
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
                      return (
                        <div key={event.id} className="ts2-event-wrap" style={{ left: `${offset}%`, width: `${width}%` }}>
                          <button
                            type="button"
                            className="ts2-event-card"
                            style={{ backgroundColor: palette.background, color: palette.text, width: hasReturnTransitTile ? `${primaryWidth}%` : '100%' }}
                            onClick={() => openEventOverview(event)}
                          >
                            <span className="ts2-event-time">{formatTimeChip(Math.floor(startMinutes / 60), Math.floor(startMinutes % 60))} – {formatTimeChip(Math.floor(primaryEnd / 60), Math.floor(primaryEnd % 60))}</span>
                            <strong className="ts2-event-title">{event.builderName || 'Material Order'}</strong>
                            <span className="ts2-event-subtitle">{event.projectName || 'Scheduled delivery'}</span>
                            <div className="ts2-event-status-row">
                              <span className="ts2-event-status-dot" style={{ backgroundColor: palette.accent }} />
                              <span>{groupedCompletedCycle ? 'Completed delivery cycle' : status === 'return_transit' ? 'Delivered' : scheduleStatusLabel(status)}</span>
                            </div>
                          </button>
                          {hasReturnTransitTile ? (
                            <button type="button" className="ts2-return-card" style={{ left: `${primaryWidth}%`, width: `${returnWidth}%` }} onClick={() => openEventOverview(event)}>
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
      </div>

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
                <RouteMapCanvas className="ts2-compact-map" routeData={requestModalRouteData} loading={requestModalRouteLoading} siteLocation={requestModal.siteLocation} />
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
                <RouteMapCanvas className="transport-route-modal-map" routeData={eventOverviewRouteData} loading={eventOverviewRouteLoading} siteLocation={eventOverviewModal.siteLocation} />
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
