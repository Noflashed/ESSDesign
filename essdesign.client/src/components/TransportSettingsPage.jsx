import React, { useMemo, useState } from 'react';
import {
  Bell,
  Code2,
  Edit3,
  Monitor,
  Palette,
  Search,
  Shield,
  Truck,
} from 'lucide-react';
import {
  createTransportStatusAppearance,
  readTransportStatusColors,
  saveTransportStatusColors,
  TRANSPORT_STATUS_COLOR_DEFAULTS,
} from './transport/transportUtils';

const STATUS_ROWS = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'unloading', label: 'Unloading' },
  { key: 'return_transit', label: 'Complete' },
];

const SETTINGS_SECTIONS = [
  { key: 'status-colours', label: 'Status Colours', description: 'Schedule board colour preferences', icon: Palette },
  { key: 'driver-app', label: 'Driver App', description: 'Truck device workflow defaults', icon: Truck },
  { key: 'appearance', label: 'Appearance', description: 'Display density and visual options', icon: Monitor },
  { key: 'permissions', label: 'Permissions', description: 'Transport access controls', icon: Shield },
  { key: 'api', label: 'API', description: 'Integrations and webhooks', icon: Code2 },
];

function normalizeHex(value, fallback) {
  const clean = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) {
    return clean.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    return `#${clean.toUpperCase()}`;
  }
  return fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(value, fallback) {
  const hex = normalizeHex(value, fallback || '#F3E8FF').slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function rgbToHsv({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;

  if (delta) {
    if (max === red) {
      h = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      h = 60 * ((blue - red) / delta + 2);
    } else {
      h = 60 * ((red - green) / delta + 4);
    }
  }

  return {
    h: (h + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgb({ h, s, v }) {
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (h < 60) {
    red = chroma;
    green = x;
  } else if (h < 120) {
    red = x;
    green = chroma;
  } else if (h < 180) {
    green = chroma;
    blue = x;
  } else if (h < 240) {
    green = x;
    blue = chroma;
  } else if (h < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: (red + m) * 255,
    g: (green + m) * 255,
    b: (blue + m) * 255,
  };
}

function hexToHsv(value, fallback) {
  return rgbToHsv(hexToRgb(value, fallback));
}

function hsvToHex(value) {
  return rgbToHex(hsvToRgb(value));
}

export default function TransportSettingsPage({ user }) {
  const [statusColors, setStatusColors] = useState(() => readTransportStatusColors(user));
  const [activeStatusKey, setActiveStatusKey] = useState('scheduled');
  const [activeSectionKey, setActiveSectionKey] = useState('status-colours');
  const activeStatus = STATUS_ROWS.find(item => item.key === activeStatusKey) || STATUS_ROWS[0];
  const activeAppearance = statusColors[activeStatus.key] || TRANSPORT_STATUS_COLOR_DEFAULTS[activeStatus.key];
  const [draftHex, setDraftHex] = useState(activeAppearance.accent);
  const effectiveDraftHex = normalizeHex(draftHex, activeAppearance.accent);
  const draftHsv = useMemo(
    () => hexToHsv(effectiveDraftHex, activeAppearance.accent),
    [activeAppearance.accent, effectiveDraftHex],
  );
  const currentDraftAppearance = useMemo(
    () => createTransportStatusAppearance(effectiveDraftHex, activeAppearance),
    [activeAppearance, effectiveDraftHex],
  );
  const currentDraftHex = currentDraftAppearance.accent;
  const hueColour = `hsl(${Math.round(draftHsv.h)}, 100%, 50%)`;
  const hueMarkerStyle = {
    left: `${50 + Math.cos((draftHsv.h * Math.PI) / 180) * 43}%`,
    top: `${50 + Math.sin((draftHsv.h * Math.PI) / 180) * 43}%`,
    backgroundColor: hueColour,
  };
  const triangleMarkerStyle = {
    left: `${clamp(draftHsv.s, 0.05, 0.94) * 100}%`,
    top: `${clamp(1 - draftHsv.v, 0.06, 0.94) * 100}%`,
    backgroundColor: currentDraftHex,
  };
  const sliderMarkerStyle = {
    top: `${clamp(1 - draftHsv.v, 0.04, 0.96) * 100}%`,
    backgroundColor: currentDraftHex,
  };

  const selectStatus = (statusKey) => {
    const nextAppearance = statusColors[statusKey] || TRANSPORT_STATUS_COLOR_DEFAULTS[statusKey];
    setActiveStatusKey(statusKey);
    setDraftHex(nextAppearance.accent);
  };

  const updateDraftHex = (value) => {
    setDraftHex(normalizeHex(value, draftHex));
  };

  const updateHsv = (nextValues) => {
    setDraftHex(hsvToHex({ ...draftHsv, ...nextValues }));
  };

  const updateHueFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    updateHsv({ h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 });
  };

  const updateTriangleFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    updateHsv({
      s: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
    });
  };

  const updateValueFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    updateHsv({ v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1) });
  };

  const handleHuePointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateHueFromPointer(event);
  };

  const handleHuePointerMove = (event) => {
    if (event.buttons === 1) {
      updateHueFromPointer(event);
    }
  };

  const handleTrianglePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateTriangleFromPointer(event);
  };

  const handleTrianglePointerMove = (event) => {
    if (event.buttons === 1) {
      event.stopPropagation();
      updateTriangleFromPointer(event);
    }
  };

  const handleValuePointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateValueFromPointer(event);
  };

  const handleValuePointerMove = (event) => {
    if (event.buttons === 1) {
      updateValueFromPointer(event);
    }
  };

  const applyColour = () => {
    const next = {
      ...statusColors,
      [activeStatus.key]: currentDraftAppearance,
    };
    const saved = saveTransportStatusColors(user, next);
    setStatusColors(saved);
  };

  const cancelColourEdit = () => {
    setDraftHex(activeAppearance.accent);
  };

  const userName = user?.fullName || user?.name || user?.email || 'Transport User';
  const userInitial = userName.trim()?.[0]?.toUpperCase() || 'U';

  return (
    <div className="transport-settings-page">
      <header className="transport-settings-topbar">
        <h1>Settings</h1>
        <div className="transport-settings-top-actions">
          <button type="button" aria-label="Search settings"><Search size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Notification settings"><Bell size={18} aria-hidden="true" /></button>
          <div className="transport-settings-user-chip">
            <span>{userInitial}</span>
            <strong>{userName}</strong>
          </div>
        </div>
      </header>

      <main className="transport-settings-shell">
        <nav className="transport-settings-section-list" aria-label="Transport settings sections">
          {SETTINGS_SECTIONS.map(section => {
            const Icon = section.icon;
            const active = section.key === activeSectionKey;
            return (
              <button
                key={section.key}
                type="button"
                className={active ? 'active' : ''}
                onClick={() => setActiveSectionKey(section.key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="transport-settings-main">
          <section className="transport-settings-panel transport-settings-status-panel">
            <div className="transport-settings-panel-head">
              <div>
                <h2>Schedule Status Colours</h2>
                <p>Choose the colours used on the schedule board for your own account.</p>
              </div>
              <button type="button" className="transport-settings-outline-btn" onClick={cancelColourEdit}>Cancel Edit</button>
            </div>

            <div className="transport-settings-status-body">
              <div className="transport-status-table">
                {STATUS_ROWS.map(row => {
                  const appearance = statusColors[row.key] || TRANSPORT_STATUS_COLOR_DEFAULTS[row.key];
                  const selected = row.key === activeStatus.key;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`transport-status-table-row${selected ? ' selected' : ''}`}
                      onClick={() => selectStatus(row.key)}
                    >
                      <span className="transport-status-colour-dot" style={{ backgroundColor: appearance.accent }} />
                      <strong>{row.label}</strong>
                      <code>{appearance.accent}</code>
                      <span className="transport-status-colour-edit"><Edit3 size={14} aria-hidden="true" /></span>
                    </button>
                  );
                })}
              </div>

              <aside className="transport-colour-popover" aria-label={`${activeStatus.label} colour picker`}>
                <div className="transport-colour-wheel-wrap">
                  <div
                    className="transport-colour-wheel"
                    role="slider"
                    aria-label={`${activeStatus.label} hue`}
                    aria-valuemin={0}
                    aria-valuemax={359}
                    aria-valuenow={Math.round(draftHsv.h)}
                    tabIndex={0}
                    onPointerDown={handleHuePointerDown}
                    onPointerMove={handleHuePointerMove}
                  >
                    <span className="transport-colour-hue-marker" style={hueMarkerStyle} />
                    <span
                      className="transport-colour-triangle"
                      role="slider"
                      aria-label={`${activeStatus.label} saturation and brightness`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(draftHsv.s * 100)}
                      tabIndex={0}
                      style={{ '--transport-picker-hue': hueColour }}
                      onPointerDown={handleTrianglePointerDown}
                      onPointerMove={handleTrianglePointerMove}
                    >
                      <span className="transport-colour-selection" style={triangleMarkerStyle} />
                    </span>
                  </div>
                </div>

                <div
                  className="transport-colour-slider"
                  role="slider"
                  aria-label={`${activeStatus.label} brightness`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(draftHsv.v * 100)}
                  tabIndex={0}
                  style={{ '--transport-picker-hue': hueColour }}
                  onPointerDown={handleValuePointerDown}
                  onPointerMove={handleValuePointerMove}
                >
                  <span style={sliderMarkerStyle} />
                </div>

                <div className="transport-colour-fields">
                  <label>
                    <span>HEX</span>
                    <input
                      type="text"
                      value={draftHex}
                      onChange={(event) => setDraftHex(event.target.value.toUpperCase())}
                      onBlur={(event) => updateDraftHex(event.target.value)}
                      maxLength={7}
                    />
                  </label>
                  <div className="transport-colour-current-row">
                    <span className="transport-status-colour-dot" style={{ backgroundColor: currentDraftAppearance.accent }} />
                    <strong>{activeStatus.label}</strong>
                  </div>
                  <div className="transport-colour-actions">
                    <button type="button" className="transport-settings-secondary-btn" onClick={cancelColourEdit}>Cancel</button>
                    <button type="button" className="transport-settings-primary-btn" onClick={applyColour}>Apply</button>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
