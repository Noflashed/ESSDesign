import React, { useMemo, useState } from 'react';
import {
  Bell,
  Code2,
  Edit3,
  Monitor,
  Palette,
  Search,
  Shield,
  SlidersHorizontal,
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
  { key: 'board', label: 'Board Behaviour', description: 'Timeline, snapping and display options', icon: SlidersHorizontal },
  { key: 'notifications', label: 'Notifications', description: 'Delivery and schedule alerts', icon: Bell },
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

export default function TransportSettingsPage({ user }) {
  const [statusColors, setStatusColors] = useState(() => readTransportStatusColors(user));
  const [activeStatusKey, setActiveStatusKey] = useState('scheduled');
  const [activeSectionKey, setActiveSectionKey] = useState('status-colours');
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
                  <label
                    className="transport-colour-wheel"
                    htmlFor="transport-status-colour-input"
                    aria-label={`Choose ${activeStatus.label} colour`}
                  >
                    <span className="transport-colour-triangle" style={{ borderLeftColor: currentDraftAppearance.accent }} />
                    <span className="transport-colour-selection" style={{ backgroundColor: currentDraftAppearance.accent }} />
                    <input
                      id="transport-status-colour-input"
                      className="transport-native-colour-input"
                      type="color"
                      value={effectiveDraftHex}
                      onChange={(event) => updateDraftHex(event.target.value)}
                      aria-label={`${activeStatus.label} colour value`}
                    />
                  </label>
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

          <section className="transport-settings-panel transport-settings-simple-panel">
            <div>
              <h2>Schedule Board Behaviour</h2>
              <p>Timeline, snapping and display controls can be configured here later.</p>
            </div>
            <button type="button" className="transport-settings-outline-btn">Configure</button>
          </section>

          <section className="transport-settings-panel transport-settings-simple-panel">
            <span className="transport-settings-shield"><Shield size={20} aria-hidden="true" /></span>
            <div>
              <h2>Notifications</h2>
              <p>Delivery and schedule notification preferences will be managed here.</p>
            </div>
            <button type="button" className="transport-settings-outline-btn">Configure</button>
          </section>
        </div>
      </main>
    </div>
  );
}
