import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scaffoldAiTrainingAPI } from '../services/api';
import './ScaffoldAiLabelerPage.css';

const CLASS_LABELS = Object.fromEntries(scaffoldAiTrainingAPI.classes.map(item => [item.key, item.label]));
const CLASS_COLORS = Object.fromEntries(scaffoldAiTrainingAPI.classes.map(item => [item.key, item.color]));
const MIN_BOX_SIZE = 0.006;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function clampZoom(value) {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value) || MIN_ZOOM));
  return Math.round(next / ZOOM_STEP) * ZOOM_STEP;
}

function formatDate(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function statusLabel(status) {
  if (status === 'boxed') return 'Boxed';
  if (status === 'boxed-empty') return 'No target objects';
  if (status === 'class-labelled') return 'Needs boxes';
  return status || 'Needs boxes';
}

function makeLocalBox(componentClass, start, end) {
  const x1 = clamp01(Math.min(start.x, end.x));
  const y1 = clamp01(Math.min(start.y, end.y));
  const x2 = clamp01(Math.max(start.x, end.x));
  const y2 = clamp01(Math.max(start.y, end.y));
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    componentClass,
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function getPointerPosition(event, stageEl) {
  const rect = stageEl.getBoundingClientRect();
  return {
    x: clamp01((event.clientX - rect.left) / rect.width),
    y: clamp01((event.clientY - rect.top) / rect.height),
  };
}

function normalizeAnnotation(row) {
  return {
    id: row.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    componentClass: row.componentClass || 'ledger',
    x: clamp01(row.x),
    y: clamp01(row.y),
    width: clamp01(row.width),
    height: clamp01(row.height),
  };
}

function classSummary(annotations) {
  return scaffoldAiTrainingAPI.classes.map(item => ({
    ...item,
    count: annotations.filter(annotation => annotation.componentClass === item.key).length,
  }));
}

export default function ScaffoldAiLabelerPage({ user }) {
  const stageRef = useRef(null);
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [annotations, setAnnotations] = useState([]);
  const [activeClass, setActiveClass] = useState('ledger');
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [statusFilter, setStatusFilter] = useState('needs-boxes');
  const [classFilter, setClassFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingImage, setLoadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);

  const selectedImage = useMemo(
    () => images.find(image => image.id === selectedImageId) || null,
    [images, selectedImageId]
  );
  const summary = useMemo(() => classSummary(annotations), [annotations]);

  const loadImages = useCallback(async ({ keepSelection = true } = {}) => {
    setLoading(true);
    setError('');
    try {
      const rows = await scaffoldAiTrainingAPI.listImages({
        componentClass: classFilter,
        status: statusFilter,
        limit: 420,
        force: true,
      });
      setImages(rows);
      setSelectedImageId(current => {
        if (keepSelection && current && rows.some(row => row.id === current)) return current;
        return rows[0]?.id || null;
      });
    } catch (err) {
      setError(err.message || 'Could not load Scaffold AI training images.');
      setImages([]);
      setSelectedImageId(null);
    } finally {
      setLoading(false);
    }
  }, [classFilter, statusFilter]);

  useEffect(() => {
    loadImages({ keepSelection: false });
  }, [loadImages]);

  useEffect(() => {
    let cancelled = false;
    async function loadSelectedImage() {
      if (!selectedImage) {
        setSelectedImageUrl('');
        setAnnotations([]);
        return;
      }
      setLoadingImage(true);
      setSelectedBoxId(null);
      setDraft(null);
      setError('');
      try {
        const [url, savedAnnotations] = await Promise.all([
          scaffoldAiTrainingAPI.getImageUrl(selectedImage.objectPath),
          scaffoldAiTrainingAPI.listAnnotations(selectedImage.id),
        ]);
        if (cancelled) return;
        setSelectedImageUrl(url);
        setAnnotations(savedAnnotations.map(normalizeAnnotation));
        setActiveClass(selectedImage.componentClass || 'ledger');
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load this training image.');
          setSelectedImageUrl('');
          setAnnotations([]);
        }
      } finally {
        if (!cancelled) setLoadingImage(false);
      }
    }
    loadSelectedImage();
    return () => {
      cancelled = true;
    };
  }, [selectedImage]);

  const beginDraw = (event) => {
    if (!selectedImage || !stageRef.current || event.button !== 0) return;
    if (event.target.closest?.('[data-box-id]')) return;
    const start = getPointerPosition(event, stageRef.current);
    setSelectedBoxId(null);
    setDraft({ start, current: start, componentClass: activeClass });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDraw = (event) => {
    if (!draft || !stageRef.current) return;
    setDraft(current => current ? { ...current, current: getPointerPosition(event, stageRef.current) } : null);
  };

  const endDraw = () => {
    if (!draft) return;
    const box = makeLocalBox(draft.componentClass, draft.start, draft.current);
    setDraft(null);
    if (box.width < MIN_BOX_SIZE || box.height < MIN_BOX_SIZE) return;
    setAnnotations(current => [...current, box]);
    setSelectedBoxId(box.id);
  };

  const updateBoxClass = (boxId, componentClass) => {
    setAnnotations(current => current.map(box => box.id === boxId ? { ...box, componentClass } : box));
  };

  const deleteBox = (boxId) => {
    setAnnotations(current => current.filter(box => box.id !== boxId));
    setSelectedBoxId(current => current === boxId ? null : current);
  };

  const clearBoxes = () => {
    setAnnotations([]);
    setSelectedBoxId(null);
  };

  const updateZoom = (nextZoom) => {
    setZoom(clampZoom(nextZoom));
  };

  const save = async ({ markEmpty = false } = {}) => {
    if (!selectedImage) return;
    if (!markEmpty && annotations.length === 0) {
      setError('Draw at least one box, or use “Save as no target objects” for negative images.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updatedImage = await scaffoldAiTrainingAPI.saveAnnotations({
        imageId: selectedImage.id,
        annotations: markEmpty ? [] : annotations,
        user,
        markEmpty,
      });
      setImages(current => current.map(image => image.id === selectedImage.id ? { ...image, ...updatedImage } : image));
      if (markEmpty) setAnnotations([]);
      await loadImages({ keepSelection: false });
    } catch (err) {
      setError(err.message || 'Could not save annotations.');
    } finally {
      setSaving(false);
    }
  };

  const selectedIndex = selectedImage ? images.findIndex(image => image.id === selectedImage.id) : -1;
  const goRelative = (offset) => {
    if (!images.length) return;
    const nextIndex = Math.max(0, Math.min(images.length - 1, selectedIndex + offset));
    setSelectedImageId(images[nextIndex]?.id || null);
  };

  const draftBox = draft ? makeLocalBox(draft.componentClass, draft.start, draft.current) : null;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="scaffold-ai-labeler-page">
      <header className="scaffold-ai-header">
        <div>
          <p className="scaffold-ai-kicker">Scaffold AI Training</p>
          <h1>Image Labeller</h1>
          <p>Draw one box around every visible Ledger, Transom, or Standard. These annotations become the training data for the detector.</p>
        </div>
        <div className="scaffold-ai-header-actions">
          <button type="button" onClick={() => loadImages()} disabled={loading || saving}>Refresh</button>
          <button type="button" className="primary" onClick={() => save()} disabled={!selectedImage || saving || loadingImage}>{saving ? 'Saving...' : 'Save boxes'}</button>
        </div>
      </header>

      {error ? <div className="scaffold-ai-error">{error}</div> : null}

      <div className="scaffold-ai-workbench">
        <aside className="scaffold-ai-queue">
          <div className="scaffold-ai-panel-head">
            <div>
              <h2>Training queue</h2>
              <span>{loading ? 'Loading...' : `${images.length} images`}</span>
            </div>
          </div>

          <div className="scaffold-ai-filters">
            <label>
              Status
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                <option value="needs-boxes">Needs boxes</option>
                <option value="boxed">Boxed</option>
                <option value="empty">No target objects</option>
                <option value="all">All images</option>
              </select>
            </label>
            <label>
              Component
              <select value={classFilter} onChange={event => setClassFilter(event.target.value)}>
                <option value="all">All classes</option>
                {scaffoldAiTrainingAPI.classes.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <div className="scaffold-ai-image-list">
            {loading ? (
              <div className="scaffold-ai-empty">Loading uploaded samples...</div>
            ) : images.length ? images.map(image => (
              <button
                type="button"
                key={image.id}
                className={`scaffold-ai-image-row${image.id === selectedImageId ? ' active' : ''}`}
                onClick={() => setSelectedImageId(image.id)}
              >
                <span className={`status-dot status-${image.labelStatus || 'class-labelled'}`} />
                <strong>{CLASS_LABELS[image.componentClass] || image.componentClass}</strong>
                <small>{image.fileName}</small>
                <em>{statusLabel(image.labelStatus)} · {formatDate(image.createdAt)}</em>
              </button>
            )) : (
              <div className="scaffold-ai-empty">No images match this filter. Upload samples from iOS first.</div>
            )}
          </div>
        </aside>

        <main className="scaffold-ai-canvas-panel">
          <div className="scaffold-ai-toolbar">
            <div className="scaffold-ai-class-picker" role="group" aria-label="Box class">
              {scaffoldAiTrainingAPI.classes.map(item => (
                <button
                  type="button"
                  key={item.key}
                  className={activeClass === item.key ? 'active' : ''}
                  style={{ '--class-color': item.color }}
                  onClick={() => setActiveClass(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="scaffold-ai-nav-actions">
              <button type="button" onClick={() => goRelative(-1)} disabled={selectedIndex <= 0}>Previous</button>
              <button type="button" onClick={() => goRelative(1)} disabled={selectedIndex < 0 || selectedIndex >= images.length - 1}>Next</button>
            </div>
          </div>

          <div className="scaffold-ai-zoom-bar">
            <div className="scaffold-ai-zoom-copy">
              <strong>{zoomPercent}%</strong>
              <span>Zoom in for tighter boxes. Scroll inside the image area when zoomed.</span>
            </div>
            <div className="scaffold-ai-zoom-controls">
              <button type="button" onClick={() => updateZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}>-</button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                onChange={event => updateZoom(event.target.value)}
                aria-label="Image zoom"
              />
              <button type="button" onClick={() => updateZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>+</button>
              <button type="button" onClick={() => updateZoom(1)} disabled={zoom === 1}>Fit</button>
            </div>
          </div>

          <div className={`scaffold-ai-stage${selectedImageUrl ? '' : ' empty'}`}>
            {selectedImageUrl ? (
              <div
                ref={stageRef}
                className="scaffold-ai-image-frame"
                style={{ width: `${zoom * 100}%` }}
                onPointerDown={beginDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerCancel={() => setDraft(null)}
              >
                <img src={selectedImageUrl} alt={selectedImage?.fileName || 'Scaffold training sample'} draggable="false" />

                {annotations.map(box => (
                  <button
                    type="button"
                    key={box.id}
                    data-box-id={box.id}
                    className={`scaffold-ai-box${selectedBoxId === box.id ? ' selected' : ''}`}
                    style={{
                      '--box-color': CLASS_COLORS[box.componentClass] || '#2563EB',
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedBoxId(box.id);
                    }}
                    title={`${CLASS_LABELS[box.componentClass]} box`}
                  >
                    <span>{CLASS_LABELS[box.componentClass]}</span>
                  </button>
                ))}

                {draftBox && draftBox.width >= MIN_BOX_SIZE && draftBox.height >= MIN_BOX_SIZE ? (
                  <div
                    className="scaffold-ai-box draft"
                    style={{
                      '--box-color': CLASS_COLORS[draftBox.componentClass] || '#2563EB',
                      left: `${draftBox.x * 100}%`,
                      top: `${draftBox.y * 100}%`,
                      width: `${draftBox.width * 100}%`,
                      height: `${draftBox.height * 100}%`,
                    }}
                  >
                    <span>{CLASS_LABELS[draftBox.componentClass]}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {loadingImage ? <div className="scaffold-ai-stage-loading">Loading image...</div> : null}
            {!selectedImage && !loading ? <div className="scaffold-ai-stage-loading">Select an uploaded image to begin.</div> : null}
          </div>
        </main>

        <aside className="scaffold-ai-details">
          <div className="scaffold-ai-panel-head">
            <div>
              <h2>Labels</h2>
              <span>{annotations.length} boxes on this image</span>
            </div>
          </div>

          {selectedImage ? (
            <div className="scaffold-ai-image-meta">
              <strong>{selectedImage.fileName}</strong>
              <span>{CLASS_LABELS[selectedImage.componentClass]} upload · {statusLabel(selectedImage.labelStatus)}</span>
              {selectedImage.notes ? <p>{selectedImage.notes}</p> : null}
            </div>
          ) : null}

          <div className="scaffold-ai-summary-grid">
            {summary.map(item => (
              <div key={item.key} style={{ '--class-color': item.color }}>
                <b>{item.count}</b>
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          <div className="scaffold-ai-box-list">
            {annotations.length ? annotations.map((box, index) => (
              <div key={box.id} className={`scaffold-ai-box-row${selectedBoxId === box.id ? ' active' : ''}`}>
                <button type="button" onClick={() => setSelectedBoxId(box.id)}>{index + 1}</button>
                <select value={box.componentClass} onChange={event => updateBoxClass(box.id, event.target.value)}>
                  {scaffoldAiTrainingAPI.classes.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
                <button type="button" className="danger" onClick={() => deleteBox(box.id)}>Delete</button>
              </div>
            )) : (
              <div className="scaffold-ai-empty small">Draw boxes by click-dragging over the image.</div>
            )}
          </div>

          <div className="scaffold-ai-save-stack">
            <button type="button" className="primary" onClick={() => save()} disabled={!selectedImage || saving || loadingImage}>{saving ? 'Saving...' : 'Save boxes'}</button>
            <button type="button" onClick={() => save({ markEmpty: true })} disabled={!selectedImage || saving || loadingImage}>Save as no target objects</button>
            <button type="button" onClick={clearBoxes} disabled={!annotations.length || saving}>Clear boxes</button>
          </div>

          <div className="scaffold-ai-help">
            <strong>Labelling rule</strong>
            <p>Box every countable visible end. If 30 ledger ends are visible, draw 30 Ledger boxes. Mixed images can contain Ledger, Transom, and Standard boxes together.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
