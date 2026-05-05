import React, { useMemo, useState } from 'react';
import {
  Bell,
  CircleHelp,
  Edit3,
  Palette,
  Shield,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react';
import {
  createTransportStatusAppearance,
  normalizeTransportStatusColors,
  readTransportStatusColors,
  saveTransportStatusColors,
  TRANSPORT_STATUS_COLOR_DEFAULTS,
} from './transport/transportUtils';
import TransportUserMenu from './transport/TransportUserMenu';

const STATUS_ROWS = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'unloading', label: 'Unloading' },
  { key: 'return_transit', label: 'Complete' },
];

const SETTINGS_SECTIONS = [
  { key: 'schedule-appearance', label: 'Schedule Appearance', icon: Palette },
  { key: 'board-defaults', label: 'Board Defaults', icon: SlidersHorizontal },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'driver-app', label: 'Driver App', icon: Smartphone },
  { key: 'permissions', label: 'Permissions', icon: Shield },
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
  const hex = normalizeHex(value, fallback || '#9333EA').slice(1);
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
  const normalizedHue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const m = v - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (normalizedHue < 60) {
    red = chroma;
    green = x;
  } else if (normalizedHue < 120) {
    red = x;
    green = chroma;
  } else if (normalizedHue < 180) {
    green = chroma;
    blue = x;
  } else if (normalizedHue < 240) {
    green = x;
    blue = chroma;
  } else if (normalizedHue < 300) {
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

export default function TransportSettingsPage({ user, onLogout }) {
  const initialColors = useMemo(() => readTransportStatusColors(user), [user]);
  const [statusColors, setStatusColors] = useState(initialColors);
  const [activeStatusKey, setActiveStatusKey] = useState('scheduled');
  const [activeSectionKey, setActiveSectionKey] = useState('schedule-appearance');
  const activeStatus = STATUS_ROWS.find(item => item.key === activeStatusKey) || STATUS_ROWS[0];
  const activeAppearance = statusColors[activeStatus.key] || TRANSPORT_STATUS_COLOR_DEFAULTS[activeStatus.key];
  const [draftHex, setDraftHex] = useState(activeAppearance.accent);
  const effectiveDraftHex = normalizeHex(draftHex, activeAppearance.accent);
  const draftRgb = useMemo(
    () => hexToRgb(effectiveDraftHex, activeAppearance.accent),
    [activeAppearance.accent, effectiveDraftHex],
  );
  const draftHsv = useMemo(
    () => hexToHsv(effectiveDraftHex, activeAppearance.accent),
    [activeAppearance.accent, effectiveDraftHex],
  );
  const currentDraftAppearance = useMemo(
    () => createTransportStatusAppearance(effectiveDraftHex, activeAppearance),
    [activeAppearance, effectiveDraftHex],
  );
  const pendingStatusColors = useMemo(
    () => normalizeTransportStatusColors({ ...statusColors, [activeStatus.key]: currentDraftAppearance }),
    [activeStatus.key, currentDraftAppearance, statusColors],
  );
  const displayStatusColors = pendingStatusColors;
  const hueColour = `hsl(${Math.round(draftHsv.h)}, 100%, 50%)`;
  const squareMarkerStyle = {
    left: `${clamp(draftHsv.s, 0.02, 0.98) * 100}%`,
    top: `${clamp(1 - draftHsv.v, 0.02, 0.98) * 100}%`,
    backgroundColor: effectiveDraftHex,
  };
  const hueMarkerStyle = {
    left: `${clamp(draftHsv.h / 360, 0.015, 0.985) * 100}%`,
    backgroundColor: hueColour,
  };
  const brightnessMarkerStyle = {
    top: `${clamp(1 - draftHsv.v, 0.03, 0.97) * 100}%`,
    backgroundColor: effectiveDraftHex,
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

  const updateRgbChannel = (channel, value) => {
    const nextValue = clamp(Number(value) || 0, 0, 255);
    setDraftHex(rgbToHex({ ...draftRgb, [channel]: nextValue }));
  };

  const updateSquareFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    updateHsv({
      s: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
    });
  };

  const updateHueFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    updateHsv({ h: clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360 });
  };

  const updateBrightnessFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    updateHsv({ v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1) });
  };

  const handleSquarePointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSquareFromPointer(event);
  };

  const handleSquarePointerMove = (event) => {
    if (event.buttons === 1) {
      updateSquareFromPointer(event);
    }
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

  const handleBrightnessPointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateBrightnessFromPointer(event);
  };

  const handleBrightnessPointerMove = (event) => {
    if (event.buttons === 1) {
      updateBrightnessFromPointer(event);
    }
  };

  const applyColour = () => {
    const saved = saveTransportStatusColors(user, pendingStatusColors);
    setStatusColors(saved);
    setDraftHex((saved[activeStatus.key] || TRANSPORT_STATUS_COLOR_DEFAULTS[activeStatus.key]).accent);
  };

  const cancelColourEdit = () => {
    setDraftHex(activeAppearance.accent);
  };

  const resetDefaultSettings = () => {
    const saved = saveTransportStatusColors(user, normalizeTransportStatusColors());
    setStatusColors(saved);
    setDraftHex((saved[activeStatus.key] || TRANSPORT_STATUS_COLOR_DEFAULTS[activeStatus.key]).accent);
  };

  return (
    <div className="transport-settings-page">
      <header className="transport-settings-topbar">
        <div className="transport-settings-title-block">
          <h1>Transport Settings</h1>
          <div className="transport-settings-breadcrumb">
            <span>ESS Transport</span>
            <span>/</span>
            <span>Settings</span>
          </div>
        </div>
        <div className="transport-settings-top-actions">
          <button type="button" aria-label="Notification settings"><Bell size={19} aria-hidden="true" /></button>
          <button type="button" aria-label="Help"><CircleHelp size={20} aria-hidden="true" /></button>
          <TransportUserMenu user={user} onLogout={onLogout} variant="topbar" />
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
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="transport-settings-main">
          <section className="transport-settings-content-grid">
            <div className="transport-status-table-card">
              <div className="transport-status-table-header">
                <span>Status</span>
                <span>Board Colour</span>
                <span>Tile Preview</span>
                <span>Last Saved</span>
                <span>Action</span>
              </div>
              <div className="transport-status-table">
                {STATUS_ROWS.map(row => {
                  const appearance = displayStatusColors[row.key] || TRANSPORT_STATUS_COLOR_DEFAULTS[row.key];
                  const selected = row.key === activeStatus.key;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`transport-status-table-row${selected ? ' selected' : ''}`}
                      onClick={() => selectStatus(row.key)}
                    >
                      <span className="transport-status-name-cell">
                        <span className="transport-status-colour-dot" style={{ backgroundColor: appearance.accent }} />
                        <strong>{row.label}</strong>
                      </span>
                      <span className="transport-status-colour-cell">
                        <span className="transport-status-colour-swatch" style={{ backgroundColor: appearance.accent }} />
                        <code>{appearance.accent}</code>
                      </span>
                      <span
                        className="transport-status-preview-chip"
                        style={{
                          backgroundColor: appearance.background,
                          borderColor: appearance.accent,
                          color: appearance.text,
                        }}
                      >
                        {row.label}
                      </span>
                      <span className="transport-status-saved-cell">2 mins ago</span>
                      <span className="transport-status-colour-edit"><Edit3 size={15} aria-hidden="true" /></span>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="transport-colour-editor-card" aria-label={`${activeStatus.label} colour editor`}>
              <div className="transport-colour-editor-head">
                <h3>Edit {activeStatus.label}</h3>
                <button type="button" className="transport-settings-default-btn" onClick={resetDefaultSettings}>
                  Default settings
                </button>
              </div>
              <label className="transport-colour-label">Colour</label>
              <div className="transport-colour-editor-controls">
                <div
                  className="transport-colour-square"
                  role="slider"
                  aria-label={`${activeStatus.label} saturation and brightness`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(draftHsv.s * 100)}
                  tabIndex={0}
                  style={{ '--transport-picker-hue': hueColour }}
                  onPointerDown={handleSquarePointerDown}
                  onPointerMove={handleSquarePointerMove}
                >
                  <span className="transport-colour-square-marker" style={squareMarkerStyle} />
                </div>
                <div
                  className="transport-colour-brightness"
                  role="slider"
                  aria-label={`${activeStatus.label} brightness`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(draftHsv.v * 100)}
                  tabIndex={0}
                  style={{ '--transport-picker-hue': hueColour }}
                  onPointerDown={handleBrightnessPointerDown}
                  onPointerMove={handleBrightnessPointerMove}
                >
                  <span style={brightnessMarkerStyle} />
                </div>
              </div>
              <div
                className="transport-colour-hue"
                role="slider"
                aria-label={`${activeStatus.label} hue`}
                aria-valuemin={0}
                aria-valuemax={359}
                aria-valuenow={Math.round(draftHsv.h)}
                tabIndex={0}
                onPointerDown={handleHuePointerDown}
                onPointerMove={handleHuePointerMove}
              >
                <span style={hueMarkerStyle} />
              </div>

              <div className="transport-colour-form">
                <label className="transport-colour-hex-field">
                  <span>HEX</span>
                  <input
                    type="text"
                    value={draftHex}
                    onChange={(event) => setDraftHex(event.target.value.toUpperCase())}
                    onBlur={(event) => updateDraftHex(event.target.value)}
                    maxLength={7}
                  />
                </label>
                <div className="transport-colour-rgb-grid">
                  {[
                    ['r', 'R'],
                    ['g', 'G'],
                    ['b', 'B'],
                  ].map(([channel, label]) => (
                    <label key={channel}>
                      <input
                        type="number"
                        min="0"
                        max="255"
                        value={draftRgb[channel]}
                        onChange={(event) => updateRgbChannel(channel, event.target.value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="transport-colour-actions">
                <button type="button" className="transport-settings-secondary-btn" onClick={cancelColourEdit}>Cancel</button>
                <button type="button" className="transport-settings-primary-btn" onClick={applyColour}>Apply</button>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}
