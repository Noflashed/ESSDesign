import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { materialOrderRequestsAPI, safetyProjectsAPI } from '../services/api';
import RouteMapCanvas from './transport/RouteMapCanvas';
import {
  ESS_NAVY,
  ROUTE_FOLLOW_THRESHOLD_METERS,
  SITE_RADIUS_METERS,
  YARD_LOCATION,
  distanceBetweenMeters,
  fetchRouteData,
  findProjectLocation,
  formatActionTimestamp,
  formatBoardDay,
  formatDistance,
  formatDuration,
  formatTimeChip,
  getDeliveryActionRows,
  getSafetyBuildersCached,
  getTruckAssignment,
  isTruckDeviceRole,
  minDistanceToRouteMeters,
  readTransportStatusColors,
  requestToCalendarEvent,
  scheduleStatusAppearance,
  scheduleStatusLabel,
  TRANSPORT_STATUS_COLOR_PREF_EVENT,
} from './transport/transportUtils';

const LIVE_REFRESH_MS = 3000;

function dedupeRequests(items) {
  const map = new Map();
  (items || []).forEach(item => {
    if (item?.id) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

function matchesTruck(request, assignedTruck) {
  if (!request || !assignedTruck) {
    return false;
  }
  return (
    request.scheduledTruckId === assignedTruck.id ||
    request.scheduledTruckLabel === assignedTruck.rego ||
    request.truckId === assignedTruck.id ||
    request.truckLabel === assignedTruck.rego
  );
}

export default function TruckDeliverySchedulePage({ user }) {
  const assignedTruck = getTruckAssignment(user?.role);
  const hasAccess = isTruckDeviceRole(user?.role) && assignedTruck;
  const [transportStatusColors, setTransportStatusColors] = useState(() => readTransportStatusColors(user));
  const [events, setEvents] = useState([]);
  const [requestMetaMap, setRequestMetaMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTargetOrderId, setDebugTargetOrderId] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [deliveryStarted, setDeliveryStarted] = useState(false);
  const [locationOutOfRoute, setLocationOutOfRoute] = useState(false);
  const loadPromiseRef = useRef(null);
  const watchIdRef = useRef(null);

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

  const loadEvents = useCallback(async () => {
    if (!assignedTruck) {
      return;
    }
    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
    }
    const task = (async () => {
      const [active, archived] = await Promise.all([
        materialOrderRequestsAPI.listActiveRequests({ includeArchived: true }).catch(() => []),
        materialOrderRequestsAPI.listArchivedRequests().catch(() => []),
      ]);
      const merged = dedupeRequests([...active, ...archived]);
      const assignedRequests = merged.filter(request => matchesTruck(request, assignedTruck) && request.scheduledDate);
      const nextEvents = assignedRequests
        .map(requestToCalendarEvent)
        .filter(Boolean)
        .sort((left, right) => {
          if (left.date !== right.date) {
            return String(left.date).localeCompare(String(right.date));
          }
          return left.hour * 60 + left.minute - (right.hour * 60 + right.minute);
        });
      setEvents(nextEvents);
      setRequestMetaMap(Object.fromEntries(assignedRequests.map(request => [request.id, request])));
    })()
      .finally(() => {
        loadPromiseRef.current = null;
        setLoading(false);
        setRefreshing(false);
      });
    loadPromiseRef.current = task;
    return task;
  }, [assignedTruck]);

  useEffect(() => {
    if (!hasAccess) {
      return undefined;
    }
    loadEvents().catch(() => {
      setLoading(false);
      setRefreshing(false);
    });
    const interval = window.setInterval(() => {
      loadEvents().catch(() => {});
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [hasAccess, loadEvents]);

  useEffect(() => {
    if (!deliveryModal || !deliveryStarted || !routeData || !navigator.geolocation) {
      return undefined;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserLocation(point);
        const closeToRoute = minDistanceToRouteMeters(
          { lat: point.latitude, lon: point.longitude },
          routeData,
        ) <= ROUTE_FOLLOW_THRESHOLD_METERS;
        setLocationOutOfRoute(!closeToRoute);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 },
    );
    return () => {
      if (watchIdRef.current != null && navigator.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [deliveryModal, deliveryStarted, routeData]);

  const openDelivery = useCallback(async event => {
    const existing = requestMetaMap[event.orderId] ?? (await materialOrderRequestsAPI.getRequest(event.orderId));
    if (!existing) {
      return;
    }
    const builders = await getSafetyBuildersCached(safetyProjectsAPI.getBuilders);
    const siteLocation = findProjectLocation(builders, existing);
    setDeliveryModal({ event, request: existing, siteLocation });
    setDeliveryStarted(existing.deliveryStatus === 'in_transit' || existing.deliveryStatus === 'unloading');
    setLocationOutOfRoute(false);
    setRouteLoading(true);
    setRouteData(null);
    setDeliveryLoading(false);
    fetchRouteData(siteLocation)
      .then(nextRoute => setRouteData(nextRoute))
      .finally(() => setRouteLoading(false));
  }, [requestMetaMap]);

  const updateRequestStatus = useCallback(async (targetRequest, status, overrides = {}) => {
    const startedAt = status === 'scheduled' ? null : overrides.startedAt ?? targetRequest.deliveryStartedAt ?? new Date().toISOString();
    const unloadingAt =
      status === 'unloading' || status === 'return_transit'
        ? overrides.unloadingAt ?? targetRequest.deliveryUnloadingAt ?? new Date().toISOString()
        : null;
    const confirmedAt = status === 'return_transit'
      ? overrides.confirmedAt ?? targetRequest.deliveryConfirmedAt ?? new Date().toISOString()
      : null;

    const nextRequest = {
      ...targetRequest,
      deliveryStatus: status,
      deliveryStartedAt: startedAt,
      deliveryUnloadingAt: unloadingAt,
      deliveryConfirmedAt: confirmedAt,
    };

    setRequestMetaMap(current => ({ ...current, [targetRequest.id]: nextRequest }));
    setDeliveryModal(current => (current?.request?.id === targetRequest.id ? { ...current, request: nextRequest } : current));
    await materialOrderRequestsAPI.updateDeliveryStatus(targetRequest.id, {
      status,
      startedAt,
      unloadingAt,
      confirmedAt,
    });
    await loadEvents();
    return nextRequest;
  }, [loadEvents]);

  const startDelivery = useCallback(async () => {
    if (!deliveryModal?.request) {
      return;
    }
    const nextRequest = await updateRequestStatus(deliveryModal.request, 'in_transit');
    setDeliveryStarted(true);
    setDeliveryModal(current => (current ? { ...current, request: nextRequest } : current));
  }, [deliveryModal, updateRequestStatus]);

  const confirmDelivery = useCallback(async () => {
    if (!deliveryModal?.request) {
      return;
    }
    const nextRequest = await updateRequestStatus(deliveryModal.request, 'return_transit');
    setDeliveryModal(current => (current ? { ...current, request: nextRequest } : current));
  }, [deliveryModal, updateRequestStatus]);

  useEffect(() => {
    if (!deliveryModal?.request || !routeData || !userLocation) {
      return;
    }
    if (deliveryModal.request.deliveryStatus !== 'in_transit') {
      return;
    }
    const currentDistanceToSite = distanceBetweenMeters(
      { lat: userLocation.latitude, lon: userLocation.longitude },
      routeData.site,
    );
    if (currentDistanceToSite > SITE_RADIUS_METERS) {
      return;
    }
    updateRequestStatus(deliveryModal.request, 'unloading').catch(() => {});
  }, [deliveryModal, routeData, updateRequestStatus, userLocation]);

  const groupedEvents = useMemo(() => {
    const groups = new Map();
    events.forEach(event => {
      const list = groups.get(event.date) ?? [];
      list.push(event);
      groups.set(event.date, list);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => String(left).localeCompare(String(right)));
  }, [events]);

  const deliveryButtonState = useMemo(() => {
    const status = deliveryModal?.request?.deliveryStatus ?? 'scheduled';
    const appearance = scheduleStatusAppearance(status, transportStatusColors);
    if (status === 'return_transit') {
      return { label: 'In return transit to yard', disabled: true, appearance, onPress: null };
    }
    if (status === 'unloading') {
      return { label: 'Offloading material, press to confirm delivery', disabled: false, appearance, onPress: confirmDelivery };
    }
    if (status === 'in_transit') {
      return { label: 'In transit to site', disabled: true, appearance, onPress: null };
    }
    return { label: 'Start Delivery', disabled: !routeData, appearance, onPress: startDelivery };
  }, [confirmDelivery, deliveryModal, routeData, startDelivery, transportStatusColors]);

  const applyDebugState = useCallback(async status => {
    const targetId = deliveryModal?.request?.id ?? debugTargetOrderId;
    if (!targetId) {
      return;
    }
    const targetRequest = requestMetaMap[targetId] ?? (await materialOrderRequestsAPI.getRequest(targetId));
    if (!targetRequest) {
      return;
    }
    await updateRequestStatus(targetRequest, status, {
      startedAt: status === 'scheduled' ? null : targetRequest.deliveryStartedAt ?? new Date().toISOString(),
      unloadingAt: status === 'unloading' || status === 'return_transit' ? targetRequest.deliveryUnloadingAt ?? new Date().toISOString() : null,
      confirmedAt: status === 'return_transit' ? targetRequest.deliveryConfirmedAt ?? new Date().toISOString() : null,
    });
  }, [debugTargetOrderId, deliveryModal, requestMetaMap, updateRequestStatus]);

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="delivery-schedule-page">
      <div className="delivery-schedule-toolbar">
        <button
          type="button"
          className="transport-inline-btn"
          onClick={() => {
            setRefreshing(true);
            loadEvents().catch(() => setRefreshing(false));
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" className="transport-inline-btn" onClick={() => setDebugOpen(open => !open)}>
          {debugOpen ? 'Hide Debug' : 'Debug'}
        </button>
      </div>

      {debugOpen ? (
        <div className="delivery-debug-card">
          <div className="delivery-debug-list">
            {events.map(event => (
              <button
                key={event.id}
                type="button"
                className={`delivery-debug-chip${debugTargetOrderId === event.orderId ? ' active' : ''}`}
                onClick={() => setDebugTargetOrderId(event.orderId)}
              >
                {event.builderName || 'Material Order'} · {formatTimeChip(event.hour, event.minute)}
              </button>
            ))}
          </div>
          <div className="delivery-debug-actions">
            <button type="button" className="transport-inline-btn" onClick={() => applyDebugState('scheduled')}>Scheduled</button>
            <button type="button" className="transport-inline-btn" onClick={() => applyDebugState('in_transit')}>In Transit</button>
            <button type="button" className="transport-inline-btn" onClick={() => applyDebugState('unloading')}>Offloading</button>
            <button type="button" className="transport-inline-btn" onClick={() => applyDebugState('return_transit')}>Delivered</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="transport-placeholder-card">
          <span className="transport-placeholder-eyebrow">Delivery Schedule</span>
          <h2>Loading assigned deliveries…</h2>
        </div>
      ) : groupedEvents.length === 0 ? (
        <div className="transport-placeholder-card">
          <span className="transport-placeholder-eyebrow">Delivery Schedule</span>
          <h2>No deliveries scheduled</h2>
          <p>Assigned deliveries for this truck will appear here as soon as transport schedules them.</p>
        </div>
      ) : (
        <div className="delivery-schedule-groups">
          {groupedEvents.map(([date, dayEvents]) => (
            <section key={date} className="delivery-day-section">
              <h3>{formatBoardDay(date)}</h3>
              <div className="delivery-day-list">
                {dayEvents.map((event, index) => {
                  const request = requestMetaMap[event.orderId] ?? null;
                  const appearance = scheduleStatusAppearance(request?.deliveryStatus ?? 'scheduled', transportStatusColors);
                  const actionRows = getDeliveryActionRows(request);
                  const isCompleted = request?.deliveryStatus === 'return_transit';
                  return (
                    <React.Fragment key={event.id}>
                      <button type="button" className={`delivery-card${isCompleted ? ' completed' : ''}`} onClick={() => openDelivery(event)}>
                        <div className="delivery-card-time">
                          <strong>{formatTimeChip(event.hour, event.minute)}</strong>
                          <span>{event.truckLabel || assignedTruck.rego}</span>
                        </div>
                        <div className="delivery-card-body">
                          <strong>{event.builderName || 'Material Order'}</strong>
                          <span>{event.projectName || 'Scheduled delivery'}</span>
                          {event.scaffoldingSystem ? <small>{event.scaffoldingSystem}</small> : null}
                          <div className="delivery-card-status" style={{ backgroundColor: appearance.background, color: appearance.text }}>
                            <span className="delivery-card-status-dot" style={{ backgroundColor: appearance.accent }} />
                            {scheduleStatusLabel(request?.deliveryStatus ?? 'scheduled')}
                          </div>
                          {actionRows.length > 0 ? (
                            <div className="delivery-card-actions-list">
                              {actionRows.map(row => (
                                <small key={row.key}><strong>{row.label}:</strong> {row.value}</small>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="delivery-card-chevron">›</div>
                      </button>
                      {isCompleted && index < dayEvents.length - 1 ? (
                        <div className="delivery-return-strip">In return transit to yard</div>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {deliveryModal ? (
        <div className="transport-route-modal-root">
          <div className="transport-route-modal-backdrop" onClick={() => { setDeliveryModal(null); setDeliveryStarted(false); }} />
          <div className="transport-route-modal-shell">
            <RouteMapCanvas
              className="transport-route-modal-map"
              routeData={routeData}
              loading={routeLoading}
              siteLocation={deliveryModal.siteLocation}
              showUserPoint={deliveryStarted && Boolean(userLocation)}
              userPoint={userLocation}
              interactive
            />
            <div className="transport-route-modal-top">
              <div>
                <h2>Delivery Route</h2>
                <p>{deliveryModal.event.builderName || 'Material Order'} · {deliveryModal.event.projectName || 'Scheduled delivery'}</p>
              </div>
              <button type="button" className="transport-route-close" onClick={() => { setDeliveryModal(null); setDeliveryStarted(false); }}>×</button>
            </div>
            {routeData ? (
              <div className="transport-route-hero-pill">
                <strong>{formatDuration(routeData.durationSeconds)} · {formatDistance(routeData.distanceMeters)}</strong>
                <span>{deliveryStarted ? 'Live delivery in progress' : 'Route ready from ESS Yard'}</span>
              </div>
            ) : null}
            <div className="transport-route-modal-bottom">
              <div className="transport-route-info-card">
                <div className="transport-route-info-row">
                  <span>Origin</span>
                  <strong>{YARD_LOCATION}</strong>
                </div>
                <div className="transport-route-info-row">
                  <span>Destination</span>
                  <strong>{deliveryModal.siteLocation || 'No site location saved for this project yet.'}</strong>
                </div>
                <div className="transport-route-info-row">
                  <span>Status</span>
                  <strong>{scheduleStatusLabel(deliveryModal.request?.deliveryStatus ?? 'scheduled')}</strong>
                </div>
              </div>
              {getDeliveryActionRows(deliveryModal.request).length > 0 ? (
                <div className="transport-route-info-card">
                  {getDeliveryActionRows(deliveryModal.request).map(row => (
                    <div key={row.key} className="transport-route-info-row">
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              {locationOutOfRoute ? (
                <div className="transport-route-warning">
                  Current device location is outside the delivery area, so the map is staying on route overview until the truck is closer.
                </div>
              ) : null}
              <button
                type="button"
                className={`transport-route-action ${deliveryButtonState.disabled ? 'disabled' : ''}`}
                style={{ backgroundColor: deliveryButtonState.appearance.accent }}
                disabled={deliveryButtonState.disabled}
                onClick={() => deliveryButtonState.onPress?.()}
              >
                {deliveryButtonState.label}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
