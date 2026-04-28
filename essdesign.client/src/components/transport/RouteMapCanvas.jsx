import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ESS_NAVY,
  ESS_ORANGE,
  buildRouteSvgPath,
  buildRouteViewport,
  cartoTileUrl,
  getTileCoordinatesForViewport,
  projectRoutePoint,
} from './transportUtils';

function Placeholder({ label }) {
  return (
    <div className="transport-map-placeholder">
      <div className="transport-map-placeholder-icon">🗺️</div>
      <span>{label}</span>
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
}) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const viewport = useMemo(() => {
    if (!routeData || !size.width || !size.height) {
      return null;
    }
    return buildRouteViewport(routeData, size.width, size.height, 36);
  }, [routeData, size.height, size.width]);

  const tiles = useMemo(() => {
    if (!viewport || !size.width || !size.height) {
      return [];
    }
    return getTileCoordinatesForViewport(viewport, size.width, size.height);
  }, [viewport, size.height, size.width]);

  const routePath = useMemo(() => buildRouteSvgPath(routeData, viewport), [routeData, viewport]);

  const yardPoint = useMemo(() => {
    if (!routeData || !viewport) return null;
    return projectRoutePoint(routeData.yard, viewport);
  }, [routeData, viewport]);

  const sitePoint = useMemo(() => {
    if (!routeData || !viewport) return null;
    return projectRoutePoint(routeData.site, viewport);
  }, [routeData, viewport]);

  const livePoint = useMemo(() => {
    if (!showUserPoint || !userPoint || !viewport) return null;
    return projectRoutePoint({ lat: userPoint.latitude, lon: userPoint.longitude }, viewport);
  }, [showUserPoint, userPoint, viewport]);

  return (
    <div ref={containerRef} className={`transport-route-canvas ${className}`.trim()}>
      {routeData && viewport ? (
        <>
          <div className="transport-route-canvas-tiles">
            {tiles.map(tile => (
              <img
                key={`${tile.tileX}-${tile.tileY}`}
                src={cartoTileUrl(viewport.zoom, tile.tileX, tile.tileY)}
                alt=""
                className="transport-route-tile"
                style={{ left: tile.left, top: tile.top }}
              />
            ))}
          </div>
          <svg className="transport-route-svg" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
            <path d={routePath} fill="none" stroke="#2FA6FF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            {yardPoint ? <circle cx={yardPoint.x} cy={yardPoint.y} r="10" fill={ESS_NAVY} stroke="#FFFFFF" strokeWidth="4" /> : null}
            {sitePoint ? <circle cx={sitePoint.x} cy={sitePoint.y} r="10" fill={ESS_ORANGE} stroke="#FFFFFF" strokeWidth="4" /> : null}
            {livePoint ? <circle cx={livePoint.x} cy={livePoint.y} r="10" fill="#2563EB" stroke="#FFFFFF" strokeWidth="4" /> : null}
          </svg>
          <div className="transport-route-pin transport-route-pin-yard" style={yardPoint ? { left: yardPoint.x, top: yardPoint.y } : undefined}>
            <span>Yard</span>
          </div>
          <div className="transport-route-pin transport-route-pin-site" style={sitePoint ? { left: sitePoint.x, top: sitePoint.y } : undefined}>
            <span>Site</span>
          </div>
          {livePoint ? (
            <div className="transport-route-pin transport-route-pin-live" style={{ left: livePoint.x, top: livePoint.y }}>
              <span>Live</span>
            </div>
          ) : null}
        </>
      ) : loading ? (
        <Placeholder label="Loading live route…" />
      ) : (
        <Placeholder
          label={siteLocation ? 'Route unavailable right now.' : 'No site location saved for this project yet.'}
        />
      )}
    </div>
  );
}
