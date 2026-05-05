import React, { useMemo, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Edit3,
  Palette,
  SlidersHorizontal,
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

export default function TransportSettingsPage({ user }) {
  const [statusColors, setStatusColors] = useState(() => readTransportStatusColors(user));
  const [activeStatusKey, setActiveStatusKey] = useState('scheduled');
  const activeStatus = STATUS_ROWS.find(item => item.key === activeStatusKey) || STATUS_ROWS[0];
  const activeAppearance = statusColors[activeStatus.key] || TRANSPORT_STATUS_COLOR_DEFAULTS[activeStatus.key];
  const [draftHex, setDraftHex] = useState(activeAppearance.accent);
  const effectiveDraftHex = normalizeHex(draftHex, activeAppearance.accent);

  const currentDraftAppearance = useMemo(
    () => createTransportStatusAppearance(effectiveDraftHex, activeAppearance),
    [activeAppearance, effectiveDraftHex],
  );

  const selectStatus = (statusKey) => {
    const nextAppearance = statusColors[statusKey] || TRANSPORT_STATUS_COLOR_DEFAULTS[statusKey];
    setActiveStatusKey(statusKey);
    setDraftHex(nextAppearance.accent);
  };

  const updateDraftHex = (value) => {
    setDraftHex(normalizeHex(value, draftHex));
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

  return (
    <div className="transport-settings-page">
      <header className="transport-settings-header">
        <span>ESS Transport</span>
        <h1>Transport Settings</h1>
      </header>

      <div className="transport-settings-stack">
        <section className="transport-settings-card">
          <div className="transport-settings-card-head">
            <span className="transport-settings-card-icon"><Palette size={18} aria-hidden="true" /></span>
            <h2>Schedule status colours</h2>
          </div>

          <div className="transport-status-colour-layout">
            <div className="transport-status-colour-list">
              {STATUS_ROWS.map(row => {
                const appearance = statusColors[row.key] || TRANSPORT_STATUS_COLOR_DEFAULTS[row.key];
                const selected = row.key === activeStatus.key;
                return (
                  <button
                    key={row.key}
                    type="button"
                    className={`transport-status-colour-row${selected ? ' selected' : ''}`}
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
                <button
                  type="button"
                  className="transport-colour-wheel"
                  aria-label={`Choose ${activeStatus.label} colour`}
                  onClick={() => document.getElementById('transport-status-colour-input')?.click()}
                >
                  <span className="transport-colour-triangle" style={{ borderLeftColor: currentDraftAppearance.accent }} />
                  <span className="transport-colour-selection" style={{ backgroundColor: currentDraftAppearance.accent }} />
                </button>
                <input
                  id="transport-status-colour-input"
                  className="transport-native-colour-input"
                  type="color"
                  value={effectiveDraftHex}
                  onChange={(event) => updateDraftHex(event.target.value)}
                  aria-label={`${activeStatus.label} colour value`}
                />
              </div>

              <div className="transport-colour-slider" aria-hidden="true">
                <span style={{ backgroundColor: currentDraftAppearance.accent }} />
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

        <section className="transport-settings-card collapsed">
          <div className="transport-settings-card-head">
            <span className="transport-settings-card-icon"><SlidersHorizontal size={18} aria-hidden="true" /></span>
            <h2>Schedule board behaviour</h2>
          </div>
          <ChevronDown size={18} aria-hidden="true" />
        </section>

        <section className="transport-settings-card collapsed">
          <div className="transport-settings-card-head">
            <span className="transport-settings-card-icon"><Bell size={18} aria-hidden="true" /></span>
            <h2>Notifications</h2>
          </div>
          <ChevronDown size={18} aria-hidden="true" />
        </section>
      </div>
    </div>
  );
}
