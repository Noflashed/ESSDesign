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

const MIN_ZOOM = 1;
const MAX_ZOOM = 3.25;
const ZOOM_STEP = 0.2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function Placeholder({ label }) {
  return (
    <div className="transport-map-placeholder">
      <div className="transport-map-placeholder-icon">MAP</div>
      <span>{label}</span>
    </div>
  );
}

function RouteMapSurface({
  routeData,
  loading,
  siteLocation,
  showUserPoint,
  userPoint,
  className,
  interactive,
  openViewer,
}) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

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

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, [routeData, interactive]);

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

  const hasRoute = Boolean(routeData && viewport);

  const updateZoomAtPoint = (nextZoom, clientX, clientY) => {
    if (!containerRef.current) {
      setZoom(nextZoom);
      return;
    }
    const boundedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const rect = containerRef.current.getBoundingClientRect();
    const anchorX = clientX - rect.left;
    const anchorY = clientY - rect.top;
    const ratio = boundedZoom / zoom;

    setOffset(current => ({
      x: anchorX - (anchorX - current.x) * ratio,
      y: anchorY - (anchorY - current.y) * ratio,
    }));
    setZoom(boundedZoom);
  };

  const handleWheel = event => {
    if (!interactive || !hasRoute) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    updateZoomAtPoint(zoom + direction * ZOOM_STEP, event.clientX, event.clientY);
  };

  const handlePointerDown = event => {
    if (!interactive || !hasRoute) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = event => {
    if (!interactive || !dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragRef.current.moved = true;
    }
    setOffset({
      x: dragRef.current.originX + deltaX,
      y: dragRef.current.originY + deltaY,
    });
  };

  const finishPointer = event => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  const handleReset = event => {
    event?.stopPropagation?.();
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const sceneStyle = {
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
  };

  const rootClassName = [
    'transport-route-canvas',
    className,
    interactive ? 'is-interactive' : '',
    dragging ? 'dragging' : '',
    openViewer ? 'is-viewer-launcher' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={rootClassName}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onPointerLeave={event => {
        if (dragRef.current?.pointerId === event.pointerId) {
          finishPointer(event);
        }
      }}
      onDoubleClick={event => {
        if (!interactive || !hasRoute) {
          return;
        }
        updateZoomAtPoint(zoom >= 1.8 ? 1 : zoom + 0.6, event.clientX, event.clientY);
      }}
      onClick={() => {
        if (!openViewer || dragging || dragRef.current?.moved) {
          return;
        }
        openViewer();
      }}
    >
      {hasRoute ? (
        <>
          <div className="transport-route-scene" style={sceneStyle}>
            <div className="transport-route-canvas-tiles">
              {tiles.map(tile => (
                <img
                  key={`${tile.tileX}-${tile.tileY}`}
                  src={cartoTileUrl(viewport.zoom, tile.tileX, tile.tileY)}
                  alt=""
                  className="transport-route-tile"
                  style={{ left: tile.left, top: tile.top }}
                  draggable="false"
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
          </div>
          {interactive ? (
            <>
              <div className="transport-route-control-cluster">
                <button type="button" onClick={event => {
                  event.stopPropagation();
                  setZoom(current => clamp(current + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
                }}>+</button>
                <button type="button" onClick={event => {
                  event.stopPropagation();
                  setZoom(current => clamp(current - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
                }}>-</button>
                <button type="button" onClick={handleReset}>Reset</button>
              </div>
              <div className="transport-route-map-hint">Drag to pan. Scroll to zoom.</div>
            </>
          ) : null}
          {openViewer ? (
            <button type="button" className="transport-route-open-button" onClick={event => {
              event.stopPropagation();
              openViewer();
            }}>
              Open interactive map
            </button>
          ) : null}
        </>
      ) : loading ? (
        <Placeholder label="Loading live route..." />
      ) : (
        <Placeholder
          label={siteLocation ? 'Route unavailable right now.' : 'No site location saved for this project yet.'}
        />
      )}
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

  return (
    <>
      <RouteMapSurface
        routeData={routeData}
        loading={loading}
        siteLocation={siteLocation}
        showUserPoint={showUserPoint}
        userPoint={userPoint}
        className={className}
        interactive={interactive}
        openViewer={expandable && routeData ? () => setViewerOpen(true) : null}
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
            <RouteMapSurface
              routeData={routeData}
              loading={loading}
              siteLocation={siteLocation}
              showUserPoint={showUserPoint}
              userPoint={userPoint}
              className="transport-route-viewer-canvas"
              interactive
              openViewer={null}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
