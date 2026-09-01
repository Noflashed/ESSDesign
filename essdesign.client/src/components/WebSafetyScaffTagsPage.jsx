import React, { useEffect, useState } from 'react';
import { scaffTagQrLabelsAPI, scaffTagsAPI } from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';
import { downloadScaffTagLabelPdf } from '../services/scaffTagLabelPdf';

export default function WebSafetyScaffTagsPage({ builder, project, onBack }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [items, setItems] = useState([]);
    const [selectedForm, setSelectedForm] = useState(null);
    const [photoUrls, setPhotoUrls] = useState([]);
    const [labels, setLabels] = useState([]);
    const [showGenerator, setShowGenerator] = useState(false);
    const [labelQuantity, setLabelQuantity] = useState('10');
    const [labelCompany, setLabelCompany] = useState('ess');
    const [generating, setGenerating] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [selectedLabelIds, setSelectedLabelIds] = useState(() => new Set());
    const [selectionAnchorId, setSelectionAnchorId] = useState(null);

    const loadForms = async () => {
        setLoading(true);
        setError('');
        try {
            const [next, nextLabels] = await Promise.all([
                scaffTagsAPI.listForms(builder.id, project.id),
                scaffTagQrLabelsAPI.list(),
            ]);
            setItems(next);
            setLabels(nextLabels);
            const availableLabelIds = new Set(nextLabels.map(label => label.id));
            setSelectedLabelIds(current => new Set([...current].filter(id => availableLabelIds.has(id))));
            setSelectionAnchorId(current => availableLabelIds.has(current) ? current : null);
        } catch (err) {
            setError(err.message || 'Failed to load scaff-tags');
            setItems([]);
            setLabels([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadForms().catch(() => {});
    }, [builder.id, project.id]);

    const openForm = async (item) => {
        setError('');
        try {
            const form = await scaffTagsAPI.getForm(builder.id, project.id, item.id);
            if (!form) {
                throw new Error('Scaff-tag form not found');
            }
            setSelectedForm(form);
            const urls = await Promise.all((form.photoPaths || []).map(path => scaffTagsAPI.getPhotoUrl(path).catch(() => null)));
            setPhotoUrls(urls.filter(Boolean));
        } catch (err) {
            setError(err.message || 'Failed to open scaff-tag');
        }
    };

    const openPdf = async (item) => {
        try {
            const form = await scaffTagsAPI.getForm(builder.id, project.id, item.id);
            if (!form) {
                throw new Error('Scaff-tag form not found');
            }
            const url = await scaffTagsAPI.getPdfUrl(form);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(err.message || 'Failed to open PDF');
        }
    };

    const openQrTarget = async (item) => {
        try {
            if (item.qrTargetUrl) {
                window.open(item.qrTargetUrl, '_blank', 'noopener,noreferrer');
                return;
            }
            const form = await scaffTagsAPI.getForm(builder.id, project.id, item.id);
            if (!form) {
                throw new Error('Scaff-tag form not found');
            }
            const url = form.qrTargetUrl || await scaffTagsAPI.getShareUrl(form);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(err.message || 'Failed to open QR target');
        }
    };

    const deleteForm = async (item) => {
        try {
            await scaffTagsAPI.deleteForm(builder.id, project.id, item.id);
            if (selectedForm?.id === item.id) {
                setSelectedForm(null);
                setPhotoUrls([]);
            }
            await loadForms();
        } catch (err) {
            setError(err.message || 'Failed to delete scaff-tag');
        }
    };

    const generateLabels = async (event) => {
        event.preventDefault();
        const quantity = Number(labelQuantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
            setError('Choose a whole number between 1 and 500.');
            return;
        }
        setGenerating(true);
        setError('');
        try {
            const created = await scaffTagQrLabelsAPI.generate(quantity, labelCompany);
            const printBatch = [...created].sort((left, right) => left.labelNumber - right.labelNumber);
            setLabels(current => [...created, ...current].sort((left, right) => right.labelNumber - left.labelNumber));
            setShowGenerator(false);
            setPrinting(true);
            await downloadScaffTagLabelPdf(printBatch);
        } catch (err) {
            setError(err.message || 'Failed to generate QR labels');
        } finally {
            setGenerating(false);
            setPrinting(false);
        }
    };

    const printLabels = async (selectedLabels) => {
        setPrinting(true);
        setError('');
        try {
            await downloadScaffTagLabelPdf(selectedLabels);
        } catch (err) {
            setError(err.message || 'Failed to create the label PDF');
        } finally {
            setPrinting(false);
        }
    };

    const toggleLabelSelection = (event, label, labelIndex) => {
        const shouldSelect = event.target.checked;
        const anchorIndex = labels.findIndex(item => item.id === selectionAnchorId);
        const isRangeSelection = Boolean(event.nativeEvent?.shiftKey) && anchorIndex >= 0;

        setSelectedLabelIds(current => {
            const next = new Set(current);
            const affectedLabels = isRangeSelection
                ? labels.slice(Math.min(anchorIndex, labelIndex), Math.max(anchorIndex, labelIndex) + 1)
                : [label];

            affectedLabels.forEach(item => {
                if (shouldSelect) next.add(item.id);
                else next.delete(item.id);
            });
            return next;
        });
        setSelectionAnchorId(label.id);
    };

    const selectedLabels = labels
        .filter(label => selectedLabelIds.has(label.id))
        .sort((left, right) => left.labelNumber - right.labelNumber);

    const assignedHere = (label) => label.status === 'assigned' &&
        label.assignedBuilderId === builder.id && label.assignedProjectId === project.id;

    const labelStatusText = (label) => {
        if (label.status === 'unassigned') return 'Unassigned';
        if (label.status === 'retired') return 'Retired';
        if (assignedHere(label)) {
            return items.find(item => item.id === label.assignedFormId)?.scaffoldNo || 'Assigned to this site';
        }
        return 'Assigned to another site';
    };

    return (
        <div className="module-page">
            <div className="module-shell">
                <div className="module-header">
                    <div>
                        <h2>Scaff-Tags</h2>
                        <p>{builder.name} — {project.name}</p>
                    </div>
                    <div className="module-list-actions">
                        <button className="module-primary-btn" onClick={() => setShowGenerator(true)}>Generate QR Labels</button>
                        <button className="module-secondary-btn" onClick={onBack}>Back</button>
                    </div>
                </div>
                {error ? <div className="module-error">{error}</div> : null}
                <section className="module-card scaff-qr-register-card">
                    <div className="scaff-qr-register-heading">
                        <div>
                            <div className="module-card-title">Pre-Printed QR Label Register</div>
                            <div className="module-item-sub">Permanent 63 × 100 mm labels ready to print, assign, or retire.</div>
                        </div>
                        <div className="scaff-qr-register-actions">
                            <div className="scaff-qr-summary">
                                <span><strong>{labels.filter(label => label.status === 'unassigned').length}</strong> unassigned</span>
                                <span><strong>{labels.filter(label => label.status === 'assigned').length}</strong> assigned</span>
                                <span><strong>{labels.filter(label => label.status === 'retired').length}</strong> retired</span>
                            </div>
                            {labels.some(label => label.status === 'unassigned') ? (
                                <button
                                    className="module-secondary-btn compact"
                                    disabled={printing}
                                    onClick={() => printLabels(labels.filter(label => label.status === 'unassigned').reverse())}>
                                    {printing ? 'Preparing PDF…' : 'Print All Unassigned'}
                                </button>
                            ) : null}
                        </div>
                    </div>
                    {loading ? (
                        <div className="page-loading-brandmark compact"><LoadingBrandmark label="Loading QR labels" /></div>
                    ) : labels.length === 0 ? (
                        <div className="module-empty-inline">No pre-printed QR labels exist yet. Generate the first batch to begin.</div>
                    ) : (
                        <>
                            <div className="scaff-qr-selection-toolbar" aria-live="polite">
                                <span>
                                    <strong>{selectedLabels.length}</strong> selected
                                    <small>Shift-click another checkbox to select a range.</small>
                                </span>
                                <div className="module-list-actions">
                                    <button
                                        type="button"
                                        className="module-secondary-btn compact"
                                        disabled={selectedLabelIds.size === labels.length}
                                        onClick={() => setSelectedLabelIds(new Set(labels.map(label => label.id)))}>
                                        Select All
                                    </button>
                                    <button
                                        type="button"
                                        className="module-secondary-btn compact"
                                        disabled={selectedLabelIds.size === 0}
                                        onClick={() => {
                                            setSelectedLabelIds(new Set());
                                            setSelectionAnchorId(null);
                                        }}>
                                        Clear
                                    </button>
                                    <button
                                        type="button"
                                        className="module-primary-btn compact"
                                        disabled={printing || selectedLabels.length === 0}
                                        onClick={() => printLabels(selectedLabels)}>
                                        {printing ? 'Preparing PDF…' : `Print Selected (${selectedLabels.length})`}
                                    </button>
                                </div>
                            </div>
                            <div className="scaff-qr-label-grid">
                                {labels.map((label, labelIndex) => (
                                    <article
                                        key={label.id}
                                        className={`scaff-qr-label-row status-${label.status}${selectedLabelIds.has(label.id) ? ' is-selected' : ''}`}>
                                        <input
                                            className="scaff-qr-label-checkbox"
                                            type="checkbox"
                                            checked={selectedLabelIds.has(label.id)}
                                            onChange={event => toggleLabelSelection(event, label, labelIndex)}
                                            aria-label={`Select ${label.displayNumber}`}
                                        />
                                        <div className="scaff-qr-label-mark" aria-hidden="true">QR</div>
                                        <div className="scaff-qr-label-copy">
                                            <strong>{label.displayNumber}</strong>
                                            <span>{label.companyEntityId === 'maloo' ? 'Maloo Access Group' : 'Erect Safe Scaffolding'}</span>
                                        </div>
                                        <span className={`scaff-qr-status status-${label.status}`}>{labelStatusText(label)}</span>
                                        <button
                                            className="module-secondary-btn compact"
                                            disabled={printing}
                                            onClick={() => printLabels([label])}>
                                            Print
                                        </button>
                                    </article>
                                ))}
                            </div>
                        </>
                    )}
                </section>
                <div className="module-grid module-grid-two">
                    <section className="module-card">
                        <div className="module-card-title">Shared Scaffold Inspection Forms</div>
                        {loading ? (
                            <div className="page-loading-brandmark compact"><LoadingBrandmark label="Loading scaff-tags" /></div>
                        ) : items.length === 0 ? (
                            <div className="module-empty-inline">No scaffold tags created for this site yet.</div>
                        ) : (
                            <div className="module-list">
                                {items.map(item => (
                                    <div key={item.id} className="module-list-card">
                                        <div className="module-list-header">
                                            <div>
                                                <div className="module-item-title">{item.scaffoldNo || 'Untitled Scaffold'}</div>
                                                <div className="module-item-sub">{item.jobLocation || project.name}</div>
                                            </div>
                                            <div className="module-list-actions">
                                                <button className="module-secondary-btn" onClick={() => openForm(item)}>View</button>
                                                <button className="module-secondary-btn" onClick={() => openPdf(item)}>PDF</button>
                                                {item.qrLabelStatus === 'assigned' ? (
                                                    <button className="module-secondary-btn" onClick={() => openQrTarget(item)}>{item.qrLabelNumber || 'QR'}</button>
                                                ) : (
                                                    <span className="scaff-qr-status status-unassigned">Awaiting QR link</span>
                                                )}
                                                <button className="module-danger-btn" onClick={() => deleteForm(item)}>Delete</button>
                                            </div>
                                        </div>
                                        <div className="module-item-sub">Last inspection: {item.latestInspectionDate || 'None recorded'}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="module-card">
                        <div className="module-card-title">Scaff-Tag Details</div>
                        {!selectedForm ? (
                            <div className="module-empty-inline">Select a scaff-tag to inspect its shared form details.</div>
                        ) : (
                            <div className="module-details-grid">
                                <div className="module-detail-block">
                                    <span className="module-pill-label">Scaffold Name</span>
                                    <span className="module-pill-value">{selectedForm.scaffoldNo || '-'}</span>
                                </div>
                                <div className="module-detail-block">
                                    <span className="module-pill-label">Job Location</span>
                                    <span className="module-pill-value">{selectedForm.jobLocation || '-'}</span>
                                </div>
                                <div className="module-detail-block">
                                    <span className="module-pill-label">Date Erected</span>
                                    <span className="module-pill-value">{selectedForm.dateErected || '-'}</span>
                                </div>
                                <div className="module-detail-block">
                                    <span className="module-pill-label">Erected By</span>
                                    <span className="module-pill-value">{selectedForm.erectedBy || '-'}</span>
                                </div>
                                <div className="module-detail-block">
                                    <span className="module-pill-label">Load Rating</span>
                                    <span className="module-pill-value">{selectedForm.loadRating || '-'}</span>
                                </div>
                                <div className="module-detail-block">
                                    <span className="module-pill-label">Proximity Alert</span>
                                    <span className="module-pill-value">{selectedForm.proximityAlertEnabled ? 'Enabled' : 'Disabled'}</span>
                                </div>
                                <div className="module-detail-block wide">
                                    <span className="module-pill-label">Inspection Records</span>
                                    <div className="module-records">
                                        {(selectedForm.inspectionRecords || []).filter(row => row.date || row.competentPerson).length === 0 ? (
                                            <div className="module-item-sub">No inspections recorded.</div>
                                        ) : (
                                            selectedForm.inspectionRecords
                                                .filter(row => row.date || row.competentPerson)
                                                .map((row, index) => (
                                                    <div key={`${row.date}-${index}`} className="module-record-row">
                                                        <span>{row.date || '-'}</span>
                                                        <span>{row.competentPerson || '-'}</span>
                                                    </div>
                                                ))
                                        )}
                                    </div>
                                </div>
                                <div className="module-detail-block wide">
                                    <span className="module-pill-label">Photos</span>
                                    {photoUrls.length === 0 ? (
                                        <div className="module-item-sub">No photos attached.</div>
                                    ) : (
                                        <div className="module-photo-grid">
                                            {photoUrls.map(url => <img key={url} src={url} alt="Scaff-tag" className="module-photo" loading="lazy" />)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
            {showGenerator ? (
                <div className="module-modal-backdrop" onClick={() => !generating && setShowGenerator(false)}>
                    <form className="module-modal compact scaff-qr-generator" onSubmit={generateLabels} onClick={event => event.stopPropagation()}>
                        <div>
                            <h3>Generate Scaff-Tag QR Labels</h3>
                            <p>Each generated label receives a permanent identity and one exact-size 63 × 100 mm PDF page.</p>
                        </div>
                        <label className="module-field">
                            <span>Number of labels</span>
                            <input
                                type="number"
                                min="1"
                                max="500"
                                step="1"
                                value={labelQuantity}
                                onChange={event => setLabelQuantity(event.target.value)}
                                autoFocus
                            />
                        </label>
                        <label className="module-field">
                            <span>Label branding</span>
                            <select value={labelCompany} onChange={event => setLabelCompany(event.target.value)}>
                                <option value="ess">Erect Safe Scaffolding</option>
                                <option value="maloo">Maloo Access Group</option>
                            </select>
                        </label>
                        <div className="scaff-qr-size-note">
                            <strong>Print specification</strong>
                            <span>63 mm wide × 100 mm high · one label per PDF page · print at 100% scale.</span>
                        </div>
                        <div className="module-list-actions scaff-qr-generator-actions">
                            <button type="button" className="module-secondary-btn" disabled={generating} onClick={() => setShowGenerator(false)}>Cancel</button>
                            <button type="submit" className="module-primary-btn" disabled={generating || printing}>
                                {generating ? 'Generating…' : `Generate ${labelQuantity || 0} Labels`}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}
        </div>
    );
}
