import React, { useEffect, useState } from 'react';
import { scaffTagsAPI } from '../services/api';

export default function WebSafetyScaffTagsPage({ builder, project, onBack }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [items, setItems] = useState([]);
    const [selectedForm, setSelectedForm] = useState(null);
    const [photoUrls, setPhotoUrls] = useState([]);

    const loadForms = async () => {
        setLoading(true);
        setError('');
        try {
            const next = await scaffTagsAPI.listForms(builder.id, project.id);
            setItems(next);
        } catch (err) {
            setError(err.message || 'Failed to load scaff-tags');
            setItems([]);
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

    return (
        <div className="module-page">
            <div className="module-shell">
                <div className="module-header">
                    <div>
                        <h2>Scaff-Tags</h2>
                        <p>{builder.name} — {project.name}</p>
                    </div>
                    <button className="module-secondary-btn" onClick={onBack}>Back</button>
                </div>
                {error ? <div className="module-error">{error}</div> : null}
                <div className="module-grid module-grid-two">
                    <section className="module-card">
                        <div className="module-card-title">Shared Scaffold Inspection Forms</div>
                        {loading ? (
                            <div className="module-empty-inline">Loading scaff-tags...</div>
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
                                                <button className="module-secondary-btn" onClick={() => openQrTarget(item)}>QR</button>
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
                                            {photoUrls.map(url => <img key={url} src={url} alt="Scaff-tag" className="module-photo" />)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
