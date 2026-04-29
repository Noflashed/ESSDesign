import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function Placeholder({ label }) {
  return (
    <div className="transport-map-placeholder">
      <div className="transport-map-placeholder-icon">MAP</div>
      <span>{label}</span>
    </div>
  );
}

function FitBounds({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds.length) {
      return;
    }
    map.fitBounds(bounds, {
      padding: [28, 28],
      maxZoom: 15,
    });
  }, [bounds, map]);

  return null;
}

function RouteMapInstance({
  routeData,
  className,
  interactive,
  showUserPoint,
  userPoint,
  launchViewer,
}) {
  const routePoints = useMemo(
    () => (routeData?.pathPoints || [])
      .map(point => [point.lat, point.lon])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)),
    [routeData],
  );

  const bounds = useMemo(() => {
    const points = [routeData?.yard, routeData?.site, ...(routeData?.pathPoints || [])]
      .filter(Boolean)
      .map(point => [point.lat, point.lon])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
    return points;
  }, [routeData]);

  const livePoint = useMemo(() => {
    if (!showUserPoint || !userPoint) {
      return null;
    }
    const lat = Number(userPoint.latitude);
    const lon = Number(userPoint.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }, [showUserPoint, userPoint]);

  const rootClassName = [
    'transport-route-canvas',
    className,
    interactive ? 'is-interactive' : '',
    launchViewer ? 'is-viewer-launcher' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      <MapContainer
        className="transport-leaflet-map"
        center={bounds[0] || [-33.8122, 150.9354]}
        zoom={12}
        zoomControl={interactive}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        attributionControl={interactive}
      >
        <FitBounds bounds={bounds} />
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {routePoints.length > 0 ? (
          <Polyline positions={routePoints} pathOptions={{ color: '#2FA6FF', weight: 5, opacity: 0.95 }} />
        ) : null}
        {routeData?.yard ? (
          <CircleMarker center={[routeData.yard.lat, routeData.yard.lon]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#102B5C', fillOpacity: 1 }}>
            <Tooltip permanent direction="top" offset={[0, -10]} className="transport-route-tooltip transport-route-tooltip-yard">Yard</Tooltip>
          </CircleMarker>
        ) : null}
        {routeData?.site ? (
          <CircleMarker center={[routeData.site.lat, routeData.site.lon]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#F47C20', fillOpacity: 1 }}>
            <Tooltip permanent direction="top" offset={[0, -10]} className="transport-route-tooltip transport-route-tooltip-site">Site</Tooltip>
          </CircleMarker>
        ) : null}
        {livePoint ? (
          <CircleMarker center={livePoint} radius={7} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }}>
            <Tooltip permanent direction="top" offset={[0, -10]} className="transport-route-tooltip transport-route-tooltip-live">Live</Tooltip>
          </CircleMarker>
        ) : null}
      </MapContainer>
      {interactive ? (
        <div className="transport-route-map-hint">Use mouse or touch to move around the map.</div>
      ) : null}
      {launchViewer ? (
        <button type="button" className="transport-route-open-button" onClick={launchViewer}>
          Open interactive map
        </button>
      ) : null}
    </div>
  );
}

export default function RouteMapCanvas({
  routeData,
  loading = false,
  siteLocation = null,
  showUserPoint = false,
  userPoint = null,
  className = '',
  interactive = false,
  expandable = false,
  viewerTitle = 'Route Preview',
}) {
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!viewerOpen) {
      return undefined;
    }
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setViewerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerOpen]);

  useEffect(() => {
    if (!routeData) {
      setViewerOpen(false);
    }
  }, [routeData]);

  if (!routeData) {
    return loading ? (
      <div className={`transport-route-canvas ${className}`.trim()}>
        <Placeholder label="Loading live route..." />
      </div>
    ) : (
      <div className={`transport-route-canvas ${className}`.trim()}>
        <Placeholder label={siteLocation ? 'Route unavailable right now.' : 'No site location saved for this project yet.'} />
      </div>
    );
  }

  return (
    <>
      <RouteMapInstance
        routeData={routeData}
        className={className}
        interactive={interactive}
        showUserPoint={showUserPoint}
        userPoint={userPoint}
        launchViewer={expandable ? () => setViewerOpen(true) : null}
      />
      {viewerOpen ? (
        <div className="transport-route-viewer-root">
          <div className="transport-route-viewer-backdrop" onClick={() => setViewerOpen(false)} />
          <div className="transport-route-viewer-shell" onClick={event => event.stopPropagation()}>
            <div className="transport-route-viewer-head">
              <div>
                <strong>{viewerTitle}</strong>
                <span>{siteLocation || 'Interactive route map'}</span>
              </div>
              <button type="button" className="transport-route-viewer-close" onClick={() => setViewerOpen(false)}>×</button>
            </div>
            <RouteMapInstance
              routeData={routeData}
              className="transport-route-viewer-canvas"
              interactive
              showUserPoint={showUserPoint}
              userPoint={userPoint}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
