import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analysisAPI, materialOrderRequestsAPI, safetyProjectsAPI } from '../services/api';

const ESS_NAVY = '#102B5C';
const ESS_ORANGE = '#F47C20';
const BOOKED_BG = '#193A72';
const SCREEN_START_HOUR = 6;
const SCREEN_END_HOUR = 16;
const TIME_MARKERS = ['6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM'];
const SCHEDULE_BLOCK_MINUTES = 90;
const BLOCK_TRANSIT_MINUTES = 45;
const BLOCK_LOADING_MINUTES = 30;
const BLOCK_RETURN_MINUTES = 45;
const START_HOUR_OPTIONS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const START_MINUTE_OPTIONS = [0, 15, 30, 45];
const TRUCK_LANES = [
  { id: 'truck-1', rego: 'ESS01' },
  { id: 'truck-2', rego: 'ESS02' },
  { id: 'truck-3', rego: 'ESS03' },
];
const BOARD_HOURS = [6, 8, 10, 12, 14, 16];
const BOARD_HOUR_LINES = [7, 8, 9, 10, 11, 12, 13, 14, 15];

// ─── Utilities ───────────────────────────────────────────────────────────────

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatScheduleHeadline(date) {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const prefix = isSameDay(today, target) ? 'Today' : target.toLocaleDateString('en-AU', { weekday: 'short' });
  return `${prefix}, ${target.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTimeChip(hour, minute = 0) {
  const h = hour % 12 || 12;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${h}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function eventTruckIndex(event) {
  if (event.truckId) {
    const idx = TRUCK_LANES.findIndex(l => l.id === event.truckId);
    if (idx >= 0) return idx;
  }
  const source = event.id || event.builderName || event.projectName || '';
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  return hash % TRUCK_LANES.length;
}

function blockLeftPct(hour, minute) {
  const total = (SCREEN_END_HOUR - SCREEN_START_HOUR) * 60;
  return `${Math.max(0, ((hour * 60 + minute) - SCREEN_START_HOUR * 60) / total * 100)}%`;
}

const BLOCK_WIDTH_PCT = `${SCHEDULE_BLOCK_MINUTES / ((SCREEN_END_HOUR - SCREEN_START_HOUR) * 60) * 100}%`;

function findProjectLocation(builders, request) {
  const byIds = builders
    .find(b => b.id === request.builderId)
    ?.projects.find(p => p.id === request.projectId)?.siteLocation;
  if (byIds) return byIds;
  const nb = (request.builderName || '').trim().toLowerCase();
  const np = (request.projectName || '').trim().toLowerCase();
  return builders
    .find(b => (b.name || '').trim().toLowerCase() === nb)
    ?.projects.find(p => (p.name || '').trim().toLowerCase() === np)?.siteLocation || null;
}

async function geocodeAddress(address) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'ESSDesignApp/1.0 (nathanb@erectsafe.com.au)' } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const first = data[0];
  if (!first?.lat || !first?.lon) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  return (isFinite(lat) && isFinite(lon)) ? { lat, lon } : null;
}

function buildMapTileData(lat, lon, zoom = 15) {
  const z = Math.pow(2, zoom);
  const xFrac = ((lon + 180) / 360) * z;
  const latRad = (lat * Math.PI) / 180;
  const yFrac = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * z;
  const tileX = Math.floor(xFrac);
  const tileY = Math.floor(yFrac);
  return { zoom, tileX, tileY, pinX: xFrac - tileX, pinY: yFrac - tileY };
}

function cartoTileUrl(zoom, x, y) {
  return `https://a.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${x}/${y}.png`;
}

function estimateSummary(siteLocation, startHour, startMinute) {
  const travelMins = siteLocation ? 45 : 0;
  const loadMins = 30;
  const returnMins = siteLocation ? 45 : 0;
  const addM = (h, m, add) => { const t = h * 60 + m + add; return { h: Math.floor(t / 60), m: t % 60 }; };
  const arr = addM(startHour, startMinute, travelMins);
  const done = addM(arr.h, arr.m, loadMins);
  const ret = addM(done.h, done.m, returnMins);
  return {
    deliveryFromYard: siteLocation ? `${travelMins} min` : 'Pending site location',
    siteLoading: `${loadMins} min`,
    returnTransit: siteLocation ? `${returnMins} min` : 'Pending site location',
    aestTime: formatTimeChip(startHour, startMinute),
    arrivalTime: siteLocation ? formatTimeChip(arr.h, arr.m) : 'Pending',
    loadingCompleteTime: formatTimeChip(done.h, done.m),
    returnTime: siteLocation ? formatTimeChip(ret.h, ret.m) : 'Pending',
  };
}

function getSuggestedStartTime(truckId, selectedDate, dayRequests) {
  const now = new Date();
  const sameDay = isSameDay(now, selectedDate);
  const curMins = sameDay ? now.getHours() * 60 + now.getMinutes() : SCREEN_START_HOUR * 60;
  let latestEnd = SCREEN_START_HOUR * 60;
  if (truckId) {
    const idx = TRUCK_LANES.findIndex(l => l.id === truckId);
    if (idx >= 0) {
      dayRequests.filter(r => eventTruckIndex(r) === idx).forEach(r => {
        if (typeof r.scheduledHour === 'number') {
          latestEnd = Math.max(latestEnd, r.scheduledHour * 60 + r.scheduledMinute + SCHEDULE_BLOCK_MINUTES);
        }
      });
    }
  }
  const base = Math.max(curMins, latestEnd, SCREEN_START_HOUR * 60);
  const rounded = Math.ceil(base / 15) * 15;
  const clamped = Math.min(rounded, SCREEN_END_HOUR * 60);
  return { hour: Math.min(Math.max(Math.floor(clamped / 60), SCREEN_START_HOUR), SCREEN_END_HOUR), minute: clamped % 60 };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LegendDot({ color, label, small }) {
  return (
    <span className={`ts-legend-item${small ? ' small' : ''}`}>
      <span className="ts-legend-dot" style={{ background: color }} />
      {label}
    </span>
  );
}

function DeliveryStep({ label, time, color }) {
  return (
    <div className="ts-dt-step">
      <span className="ts-dt-dot" style={{ background: color }} />
      <div className="ts-dt-step-body">
        <span className="ts-dt-step-label">{label}</span>
        <span className="ts-dt-step-time">{time}</span>
      </div>
    </div>
  );
}

function DurationConnector({ icon, label }) {
  const icons = {
    truck: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 5v4h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    clock: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    return: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 14 4 19 9 24" /><path d="M20 4v7a4 4 0 0 1-4 4H4" />
      </svg>
    ),
  };
  return (
    <div className="ts-dt-connector">
      <div className="ts-dt-line" />
      <div className="ts-dt-pill">
        {icons[icon]}
        <span>{label}</span>
      </div>
      <div className="ts-dt-line" />
    </div>
  );
}

function MapTilePreview({ mapTileData, containerSize }) {
  if (!mapTileData || !containerSize) return null;
  const { width: cw, height: ch } = containerSize;
  const tileSize = cw / 3;
  const pinGridX = (1 + mapTileData.pinX) * tileSize;
  const pinGridY = (1 + mapTileData.pinY) * tileSize;
  const gridTop = ch / 2 - pinGridY;
  return (
    <>
      <div style={{ position: 'absolute', top: gridTop, left: 0, width: cw, height: cw, overflow: 'hidden' }}>
        {([-1, 0, 1]).flatMap(dy => ([-1, 0, 1]).map(dx => (
          <img
            key={`${dx}-${dy}`}
            src={cartoTileUrl(mapTileData.zoom, mapTileData.tileX + dx, mapTileData.tileY + dy)}
            alt=""
            style={{ position: 'absolute', left: (dx + 1) * tileSize, top: (dy + 1) * tileSize, width: tileSize, height: tileSize, display: 'block' }}
          />
        )))}
      </div>
      <div style={{ position: 'absolute', left: pinGridX - 13, top: ch / 2 - 28, pointerEvents: 'none', zIndex: 2 }}>
        <svg width="26" height="32" viewBox="0 0 24 32" fill={ESS_ORANGE}>
          <path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 21 9 21s9-14.25 9-21c0-4.97-4.03-9-9-9zm0 13a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
        </svg>
      </div>
    </>
  );
}

function MiniScheduleStrip({ eventsByTruck, truckLanes, selectedTruckId, selectedHour, selectedMinute, aiSuggestion, onSelectSlot }) {
  const barRef = useRef(null);
  const [barWidth, setBarWidth] = useState(0);
  const totalMins = (SCREEN_END_HOUR - SCREEN_START_HOUR) * 60;

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setBarWidth(entries[0].contentRect.width));
    obs.observe(el);
    setBarWidth(el.getBoundingClientRect().width);
    return () => obs.disconnect();
  }, []);

  const minsToX = mins => barWidth > 0 ? Math.max(0, ((mins - SCREEN_START_HOUR * 60) / totalMins) * barWidth) : 0;
  const minsToW = dur => barWidth > 0 ? Math.max(6, (dur / totalMins) * barWidth) : 0;
  const ghostStart = selectedHour * 60 + selectedMinute;

  const handleRowClick = (lane, e) => {
    const bar = e.currentTarget.querySelector('[data-bar]');
    if (!bar || barWidth <= 0) { onSelectSlot(lane.id, selectedHour, selectedMinute); return; }
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 0) { onSelectSlot(lane.id, selectedHour, selectedMinute); return; }
    const frac = Math.max(0, Math.min(1, x / barWidth));
    const raw = SCREEN_START_HOUR * 60 + frac * totalMins;
    const rounded = Math.round(raw / 15) * 15;
    const clamped = Math.min((SCREEN_END_HOUR - 2) * 60, Math.max(SCREEN_START_HOUR * 60, rounded));
    onSelectSlot(lane.id, Math.floor(clamped / 60), clamped % 60);
  };

  return (
    <div className="ts-mini">
      <div className="ts-mini-axis">
        <div className="ts-mini-axis-pad" />
        <div className="ts-mini-ticks">
          {TIME_MARKERS.map(m => <span key={m}>{m}</span>)}
        </div>
      </div>
      <div className="ts-mini-table">
        {truckLanes.map((lane, idx) => {
          const isSelected = lane.id === selectedTruckId;
          const isAi = aiSuggestion?.recommendedTruckId === lane.id;
          const laneEvents = eventsByTruck[idx] || [];
          const hasConflict = isSelected && laneEvents.some(ev => {
            const eStart = ev.scheduledHour * 60 + ev.scheduledMinute;
            return ghostStart < eStart + SCHEDULE_BLOCK_MINUTES && ghostStart + 90 > eStart;
          });
          return (
            <div
              key={lane.id}
              className={`ts-mini-row${isSelected ? ' selected' : ''}${idx < truckLanes.length - 1 ? ' bordered' : ''}`}
              onClick={e => handleRowClick(lane, e)}
            >
              <div className="ts-mini-label">
                <span className={isSelected ? 'active' : ''}>{lane.rego}</span>
              </div>
              <div className="ts-mini-bar" data-bar ref={idx === 0 ? barRef : null}>
                {barWidth > 0 && laneEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="ts-mini-block booked"
                    style={{ left: minsToX(ev.scheduledHour * 60 + ev.scheduledMinute), width: minsToW(SCHEDULE_BLOCK_MINUTES) }}
                  >
                    <span>{formatTimeChip(ev.scheduledHour, ev.scheduledMinute)}</span>
                    <span>{ev.builderName}</span>
                  </div>
                ))}
                {isSelected && barWidth > 0 && (
                  <div
                    className="ts-mini-block ghost"
                    style={{
                      left: minsToX(ghostStart), width: minsToW(90),
                      background: hasConflict ? '#E74C3C' : ESS_ORANGE,
                      border: hasConflict ? '1.5px solid #C0392B' : 'none',
                    }}
                  >
                    <span>{formatTimeChip(selectedHour, selectedMinute)}</span>
                  </div>
                )}
                {isAi && !isSelected && aiSuggestion && barWidth > 0 && (
                  <div
                    className="ts-mini-block ai"
                    style={{ left: minsToX(aiSuggestion.recommendedHour * 60 + aiSuggestion.recommendedMinute), width: minsToW(90) }}
                  >
                    <span>{formatTimeChip(aiSuggestion.recommendedHour, aiSuggestion.recommendedMinute)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TruckSchedulePage({ initialRequestId } = {}) {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [error, setError] = useState('');
  const [requestModal, setRequestModal] = useState(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState(null);
  const [selectedHour, setSelectedHour] = useState(6);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [mapTileData, setMapTileData] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapContainerSize, setMapContainerSize] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const openedInitialRef = useRef(false);
  const goToday = useCallback(() => setSelectedDate(startOfDay(new Date())), []);
  const isToday = isSameDay(selectedDate, new Date());

  // Load all active requests once
  useEffect(() => {
    let active = true;
    setLoadingRequests(true);
    materialOrderRequestsAPI.listActiveRequests()
      .then(items => { if (active) setRequests(items || []); })
      .catch(err => { if (active) setError(err?.message || 'Failed to load schedule.'); })
      .finally(() => { if (active) setLoadingRequests(false); });
    return () => { active = false; };
  }, []);

  const dateStr = toDateStr(selectedDate);

  const dayRequests = useMemo(() =>
    requests.filter(r => r.scheduledDate === dateStr && typeof r.scheduledHour === 'number'),
    [requests, dateStr]
  );

  const pendingRequests = useMemo(() =>
    requests.filter(r => !r.scheduledDate),
    [requests]
  );

  const eventsByTruck = useMemo(() => {
    const groups = TRUCK_LANES.map(() => []);
    dayRequests.forEach(r => groups[eventTruckIndex(r)].push(r));
    groups.forEach(g => g.sort((a, b) => (a.scheduledHour * 60 + a.scheduledMinute) - (b.scheduledHour * 60 + b.scheduledMinute)));
    return groups;
  }, [dayRequests]);

  // Open initial request if provided as prop
  useEffect(() => {
    if (!initialRequestId || openedInitialRef.current || loadingRequests) return;
    openedInitialRef.current = true;
    openRequestModal(initialRequestId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRequestId, loadingRequests]);

  const openRequestModal = useCallback(async (requestId) => {
    setRequestLoading(true);
    try {
      const [request, builders] = await Promise.all([
        materialOrderRequestsAPI.getRequest(requestId),
        safetyProjectsAPI.getBuilders({ includeArchived: false }),
      ]);
      if (!request) throw new Error('Request not found.');
      const siteLocation = findProjectLocation(builders, request);
      setRequestModal({ request, siteLocation });
      const nextTruck = request.truckId || TRUCK_LANES[0].id;
      setSelectedTruckId(nextTruck);
      if (typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number') {
        setSelectedHour(request.scheduledHour);
        setSelectedMinute(request.scheduledMinute);
      } else {
        const s = getSuggestedStartTime(nextTruck, selectedDate, dayRequests);
        setSelectedHour(s.hour);
        setSelectedMinute(s.minute);
      }
      setAiSuggestion(null);
    } catch (err) {
      alert(err?.message || 'Failed to load request details.');
    } finally {
      setRequestLoading(false);
    }
  }, [selectedDate, dayRequests]);

  const closeModal = useCallback(() => {
    setRequestModal(null);
    setAiSuggestion(null);
    setAiSuggestLoading(false);
  }, []);

  // Geocode site for map
  useEffect(() => {
    const loc = requestModal?.siteLocation?.trim();
    if (!loc) { setMapTileData(null); return; }
    let active = true;
    setMapLoading(true);
    geocodeAddress(loc)
      .then(pt => { if (active) setMapTileData(pt ? buildMapTileData(pt.lat, pt.lon) : null); })
      .catch(() => { if (active) setMapTileData(null); })
      .finally(() => { if (active) setMapLoading(false); });
    return () => { active = false; };
  }, [requestModal?.siteLocation]);

  const fetchAiSuggestion = useCallback(async () => {
    if (!requestModal) return;
    setAiSuggestLoading(true);
    setAiSuggestion(null);
    try {
      const existingDeliveries = dayRequests.map(r => ({
        truckId: TRUCK_LANES[eventTruckIndex(r)].id,
        truckLabel: TRUCK_LANES[eventTruckIndex(r)].rego,
        hour: r.scheduledHour,
        minute: r.scheduledMinute,
      }));
      const result = await analysisAPI.recommendTimeSlot({
        siteLocation: requestModal.siteLocation || '',
        scaffoldingSystem: requestModal.request.itemValues?.__scaffoldingSystem || '',
        scheduledDate: dateStr,
        existingDeliveries,
      });
      setAiSuggestion(result);
    } catch {
      // silent fail — user can retry
    } finally {
      setAiSuggestLoading(false);
    }
  }, [requestModal, dayRequests, dateStr]);

  const handleSchedule = useCallback(async () => {
    if (!requestModal || !selectedTruckId) return;
    const truck = TRUCK_LANES.find(l => l.id === selectedTruckId);
    if (!truck) { alert('Please select a truck.'); return; }
    setScheduleSaving(true);
    try {
      await materialOrderRequestsAPI.setSchedule(requestModal.request.id, {
        date: dateStr,
        hour: selectedHour,
        minute: selectedMinute,
        truckId: truck.id,
        truckLabel: truck.rego,
      });
      const updated = await materialOrderRequestsAPI.listActiveRequests();
      setRequests(updated || []);
      closeModal();
    } catch (err) {
      alert(err?.message || 'Scheduling failed. Please try again.');
    } finally {
      setScheduleSaving(false);
    }
  }, [requestModal, selectedTruckId, selectedHour, selectedMinute, dateStr, closeModal]);

  const estimates = estimateSummary(requestModal?.siteLocation || null, selectedHour, selectedMinute);
  const timeOptions = START_HOUR_OPTIONS.flatMap(h => START_MINUTE_OPTIONS.map(m => ({ hour: h, minute: m, label: formatTimeChip(h, m) })));

  const navPrev = () => setSelectedDate(d => startOfDay(new Date(d.getTime() - 86400000)));
  const navNext = () => setSelectedDate(d => startOfDay(new Date(d.getTime() + 86400000)));

  return (
    <div className="ts-page">

      {/* ── Header Bar ──────────────────────────────────────────────────── */}
      <div className="ts-hbar">
        <div className="ts-hbar-left">
          <TruckSvg />
          <h1 className="ts-hbar-title">Truck Schedule</h1>
        </div>
        <div className="ts-hbar-mid">
          <button className="ts-hbar-nav" onClick={navPrev}><ChevronLeft /></button>
          <span className="ts-hbar-date">
            {selectedDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <button className="ts-hbar-nav" onClick={navNext}><ChevronRight /></button>
          <button className={`ts-today-btn${isToday ? ' ts-today-active' : ''}`} onClick={goToday}>Today</button>
        </div>
        <div className="ts-hbar-right">
          <span className="ts-view-chip">Day View</span>
          <button
            className={`ts-new-order-btn${showPending ? ' ts-new-order-open' : ''}`}
            onClick={() => setShowPending(p => !p)}
          >+ New Order</button>
        </div>
      </div>

      {error ? <div className="ts-error" style={{ padding: '8px 24px 0' }}>{error}</div> : null}

      {/* ── Pending Orders ───────────────────────────────────────────────── */}
      {showPending ? (
        <div className="ts-pending-section">
          <div className="ts-pending-header">
            <span className="ts-eyebrow">UNSCHEDULED ORDERS</span>
            {pendingRequests.length > 0 ? <span className="ts-pending-count">{pendingRequests.length}</span> : null}
          </div>
          {pendingRequests.length === 0 ? (
            <p style={{ margin: 0, color: '#7181a0', fontSize: '0.9rem' }}>All orders have been scheduled.</p>
          ) : (
            <div className="ts-pending-list">
              {pendingRequests.map(r => (
                <div key={r.id} className="ts-pending-card">
                  <div className="ts-pending-card-body">
                    <span className="ts-pending-builder">{r.builderName}</span>
                    <span className="ts-pending-project">{r.projectName}</span>
                  </div>
                  <button className="ts-pending-schedule-btn" onClick={() => { setShowPending(false); openRequestModal(r.id); }}>
                    Schedule →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Schedule Board ───────────────────────────────────────────────── */}
      <div className="ts-board-wrap">
        <div className="ts-board">

          {/* Time axis header */}
          <div className="ts-board-head">
            <div className="ts-lane-col ts-lane-col-head">Truck</div>
            <div className="ts-board-axis">
              {BOARD_HOURS.map(h => (
                <span key={h} className="ts-axis-label" style={{ left: blockLeftPct(h, 0) }}>
                  {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </span>
              ))}
            </div>
          </div>

          {/* Truck lanes */}
          {TRUCK_LANES.map((lane, laneIdx) => (
            <div key={lane.id} className="ts-board-lane">
              <div className="ts-lane-col">
                <div className="ts-truck-chip">
                  <TruckSvg />
                  <span className="ts-truck-rego">{lane.rego}</span>
                </div>
              </div>
              <div className="ts-lane-cells">
                {BOARD_HOUR_LINES.map(h => (
                  <div key={h} className="ts-vline" style={{ left: blockLeftPct(h, 0) }} />
                ))}
                {loadingRequests && laneIdx === 0 ? (
                  <div className="ts-slots-loading">Loading schedule…</div>
                ) : (eventsByTruck[laneIdx] || []).map(ev => {
                  const endMins = ev.scheduledHour * 60 + ev.scheduledMinute + SCHEDULE_BLOCK_MINUTES;
                  return (
                    <button
                      key={ev.id}
                      className="ts-block"
                      style={{ left: blockLeftPct(ev.scheduledHour, ev.scheduledMinute), width: BLOCK_WIDTH_PCT }}
                      onClick={() => openRequestModal(ev.id)}
                    >
                      <div className="ts-block-header">
                        <span className="ts-block-time">
                          {formatTimeChip(ev.scheduledHour, ev.scheduledMinute)} – {formatTimeChip(Math.floor(endMins / 60), endMins % 60)}
                        </span>
                        <span className="ts-block-title">{ev.builderName}</span>
                        {ev.projectName ? <span className="ts-block-subtitle">{ev.projectName}</span> : null}
                      </div>
                      <div className="ts-block-phases">
                        <div className="ts-block-phase" style={{ flex: BLOCK_TRANSIT_MINUTES, background: '#F47C20' }}>
                          <span>To site</span><strong>{BLOCK_TRANSIT_MINUTES}m</strong>
                        </div>
                        <div className="ts-block-phase" style={{ flex: BLOCK_LOADING_MINUTES, background: '#3B82F6' }}>
                          <span>Unload</span><strong>{BLOCK_LOADING_MINUTES}m</strong>
                        </div>
                        <div className="ts-block-phase" style={{ flex: BLOCK_RETURN_MINUTES, background: '#22C55E' }}>
                          <span>Return</span><strong>{BLOCK_RETURN_MINUTES}m</strong>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="ts-board-legend">
        <LegendDot color={BOOKED_BG} label="Delivery" />
        <LegendDot color="#F47C20" label="Transit to Site" small />
        <LegendDot color="#3B82F6" label="Unload" small />
        <LegendDot color="#22C55E" label="Return" small />
      </div>

      {/* ── Scheduling Modal ─────────────────────────────────────────────── */}
      {(requestModal || requestLoading) ? (
        <div className="ts-backdrop" onClick={closeModal}>
          <div className="ts-modal" onClick={e => e.stopPropagation()}>
            {requestLoading ? (
              <div className="ts-modal-loading">
                <div className="ts-spinner" />
                <span>Loading request details…</span>
              </div>
            ) : requestModal ? (
              <>
                <div className="ts-modal-head">
                  <div />
                  <button className="ts-modal-close" onClick={closeModal}>✕</button>
                </div>

                <div className="ts-modal-body">
                  {/* Map */}
                  <div className="ts-map-card">
                    <div
                      className="ts-map-img"
                      ref={el => {
                        if (el && !mapContainerSize) {
                          const r = el.getBoundingClientRect();
                          setMapContainerSize({ width: r.width, height: r.height });
                        }
                      }}
                    >
                      {mapTileData && mapContainerSize ? (
                        <MapTilePreview mapTileData={mapTileData} containerSize={mapContainerSize} />
                      ) : mapLoading ? (
                        <div className="ts-map-placeholder"><div className="ts-spinner" /><span>Loading map…</span></div>
                      ) : (
                        <div className="ts-map-placeholder">
                          <MapSvg />
                          <span>{requestModal.siteLocation ? 'Map unavailable' : 'No site location saved'}</span>
                        </div>
                      )}
                    </div>
                    <div className="ts-map-footer">
                      <PinSvg />
                      <span>{requestModal.siteLocation || 'Add a site address in the ESS Design Site Registry to enable map preview.'}</span>
                      {requestModal.siteLocation ? (
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(requestModal.siteLocation)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="ts-open-maps"
                        >Open in Maps ↗</a>
                      ) : null}
                    </div>
                  </div>

                  {/* Mini schedule strip with date nav */}
                  <div className="ts-mini-section">
                    <div className="ts-modal-date-nav">
                      <button className="ts-date-nav-btn" onClick={navPrev}><ChevronLeft /></button>
                      <span className="ts-mini-date-label">{formatScheduleHeadline(selectedDate)} — click a row</span>
                      <button className="ts-date-nav-btn" onClick={navNext}><ChevronRight /></button>
                    </div>
                    <MiniScheduleStrip
                      eventsByTruck={eventsByTruck}
                      truckLanes={TRUCK_LANES}
                      selectedTruckId={selectedTruckId}
                      selectedHour={selectedHour}
                      selectedMinute={selectedMinute}
                      aiSuggestion={aiSuggestion}
                      onSelectSlot={(truckId, hour, minute) => {
                        setSelectedTruckId(truckId);
                        setSelectedHour(hour);
                        setSelectedMinute(minute);
                      }}
                    />
                  </div>

                  {/* Mini legend */}
                  <div className="ts-mini-legend">
                    <LegendDot color={BOOKED_BG} label="Booked" small />
                    <LegendDot color={ESS_ORANGE} label="New order" small />
                    {aiSuggestion ? <LegendDot color="#22C55E" label="AI suggestion" small /> : null}
                  </div>

                  {/* AI suggestion banner */}
                  {aiSuggestion ? (
                    <div className="ts-ai-banner">
                      <ZapSvg />
                      <span>
                        {aiSuggestion.recommendedTruckLabel} at {formatTimeChip(aiSuggestion.recommendedHour, aiSuggestion.recommendedMinute)} — {aiSuggestion.reason}
                      </span>
                      <button className="ts-ai-apply" onClick={() => {
                        setSelectedTruckId(aiSuggestion.recommendedTruckId);
                        setSelectedHour(aiSuggestion.recommendedHour);
                        setSelectedMinute(aiSuggestion.recommendedMinute);
                      }}>Apply</button>
                    </div>
                  ) : null}

                  {/* Time + AI suggest row */}
                  <div className="ts-time-ai-row">
                    <button className="ts-time-select" onClick={() => setTimePickerVisible(true)}>
                      <div>
                        <strong>{formatTimeChip(selectedHour, selectedMinute)}</strong>
                        <span>Click to change time</span>
                      </div>
                      <ChevronRight />
                    </button>
                    <button
                      className={`ts-ai-btn${aiSuggestLoading ? ' loading' : ''}${aiSuggestion ? ' active' : ''}`}
                      disabled={aiSuggestLoading}
                      onClick={() => fetchAiSuggestion()}
                    >
                      {aiSuggestLoading ? <div className="ts-spinner-sm" /> : <ZapSvg />}
                      <span>{aiSuggestLoading ? 'Finding…' : aiSuggestion ? 'Re-suggest' : 'AI Suggest'}</span>
                    </button>
                  </div>

                  {/* Delivery timeline */}
                  <div className="ts-delivery-timeline">
                    <DeliveryStep label="DEPARTS YARD" time={estimates.aestTime} color={ESS_NAVY} />
                    <DurationConnector icon="truck" label={`Transit · ${estimates.deliveryFromYard}`} />
                    <DeliveryStep label="ARRIVES SITE" time={estimates.arrivalTime} color={ESS_ORANGE} />
                    <DurationConnector icon="clock" label={`Site loading · ${estimates.siteLoading}`} />
                    <DeliveryStep label="LOADING COMPLETE" time={estimates.loadingCompleteTime} color="#22C55E" />
                    <DurationConnector icon="return" label={`Return transit · ${estimates.returnTransit}`} />
                    <DeliveryStep label="RETURNS YARD" time={estimates.returnTime} color={ESS_NAVY} />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="ts-modal-actions">
                  <button className="ts-btn-secondary" onClick={closeModal}>Close</button>
                  <button className="ts-btn-primary" disabled={scheduleSaving} onClick={handleSchedule}>
                    {scheduleSaving ? <div className="ts-spinner-sm" /> : null}
                    {scheduleSaving ? 'Saving…' : 'Schedule Order ✓'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Time picker overlay */}
      {timePickerVisible ? (
        <div className="ts-backdrop" onClick={() => setTimePickerVisible(false)}>
          <div className="ts-time-picker" onClick={e => e.stopPropagation()}>
            <div className="ts-time-picker-head">
              <span>Select Delivery Time</span>
              <button onClick={() => setTimePickerVisible(false)}>✕</button>
            </div>
            <div className="ts-time-picker-list">
              {timeOptions.map(opt => (
                <button
                  key={`${opt.hour}-${opt.minute}`}
                  className={`ts-time-opt${opt.hour === selectedHour && opt.minute === selectedMinute ? ' selected' : ''}`}
                  onClick={() => { setSelectedHour(opt.hour); setSelectedMinute(opt.minute); setTimePickerVisible(false); }}
                >
                  <span>{opt.label}</span>
                  {opt.hour === selectedHour && opt.minute === selectedMinute
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ESS_ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function TruckSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 5v4h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}
function MapSvg() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7181A0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
function PinSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={ESS_ORANGE} stroke="none">
      <path d="M12 0C8.13 0 5 3.13 5 7c0 5.25 7 17 7 17s7-11.75 7-17c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 4.5 12 4.5s2.5 1.12 2.5 2.5S13.38 9.5 12 9.5z" />
    </svg>
  );
}
function ZapSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
