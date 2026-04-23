import React, { useState, useEffect, useRef } from 'react';
import { essNewsAPI } from '../services/api';

export default function ESSNewsPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [formTitle, setFormTitle] = useState('');
    const [formSubtitle, setFormSubtitle] = useState('');
    const [mediaFile, setMediaFile] = useState(null);
    const [mediaPreview, setMediaPreview] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        load();
    }, []);

    const load = () => {
        setLoading(true);
        setError('');
        essNewsAPI.getAll()
            .then(setItems)
            .catch(err => setError(err.message || 'Failed to load news'))
            .finally(() => setLoading(false));
    };

    const handleFileChange = (file) => {
        if (!file) return;
        setSaveError('');
        const isVideo = file.type.startsWith('video/');
        if (!file.type.startsWith('image/') && !isVideo) {
            setSaveError('Only image and video files are supported');
            return;
        }
        setMediaFile(file);
        if (isVideo) {
            setMediaPreview({ url: URL.createObjectURL(file), type: 'video' });
        } else {
            const reader = new FileReader();
            reader.onload = (e) => setMediaPreview({ url: e.target.result, type: 'image' });
            reader.readAsDataURL(file);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileChange(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formTitle.trim()) { setSaveError('Title is required'); return; }
        setSaving(true);
        setSaveError('');
        try {
            let mediaUrl = null;
            let mediaType = 'image';
            if (mediaFile) {
                mediaUrl = await essNewsAPI.uploadMedia(mediaFile);
                mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
            }
            const created = await essNewsAPI.create({
                title: formTitle.trim(),
                subtitle: formSubtitle.trim(),
                mediaUrl,
                mediaType
            });
            setItems(prev => [created, ...prev]);
            resetForm();
        } catch (err) {
            setSaveError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        setFormTitle('');
        setFormSubtitle('');
        setMediaFile(null);
        setMediaPreview(null);
        setSaveError('');
        setShowForm(false);
    };

    const handleDelete = async (item) => {
        if (!confirm(`Delete "${item.title}"?`)) return;
        setDeletingId(item.id);
        try {
            await essNewsAPI.delete(item.id);
            if (item.mediaUrl) essNewsAPI.deleteMedia(item.mediaUrl).catch(() => {});
            setItems(prev => prev.filter(n => n.id !== item.id));
        } catch (err) {
            alert(err.message || 'Failed to delete');
        } finally {
            setDeletingId(null);
        }
    };

    if (loading) {
        return <div className="module-page"><div className="module-empty">Loading news...</div></div>;
    }

    return (
        <div className="module-page">
            <div className="module-shell">
                <div className="module-header">
                    <div>
                        <h2>ESS News</h2>
                        <p>News items displayed on the mobile app home screen carousel.</p>
                    </div>
                    {!showForm && (
                        <button className="module-primary-btn compact" onClick={() => setShowForm(true)}>
                            + Add news item
                        </button>
                    )}
                </div>

                {error && (
                    <div className="module-card">
                        <p style={{ color: '#b91c1c', fontSize: 14 }}>{error}</p>
                        <button className="module-primary-btn compact" onClick={load} style={{ marginTop: 8 }}>Retry</button>
                    </div>
                )}

                {showForm && (
                    <div className="module-card">
                        <div className="module-card-title">New news item</div>
                        <form className="module-form" onSubmit={handleSubmit}>
                            <div className="module-field">
                                <label>Title *</label>
                                <input
                                    type="text"
                                    value={formTitle}
                                    onChange={e => setFormTitle(e.target.value)}
                                    placeholder="Enter title"
                                    maxLength={120}
                                    autoFocus
                                />
                            </div>
                            <div className="module-field">
                                <label>Subtitle</label>
                                <input
                                    type="text"
                                    value={formSubtitle}
                                    onChange={e => setFormSubtitle(e.target.value)}
                                    placeholder="Enter subtitle (optional)"
                                    maxLength={200}
                                />
                            </div>
                            <div className="module-field">
                                <label>Media (image or video)</label>
                                <div
                                    className={`ess-news-upload-zone${mediaPreview ? ' has-preview' : ''}${dragOver ? ' drag-over' : ''}`}
                                    onClick={() => !mediaPreview && fileInputRef.current?.click()}
                                    onDrop={handleDrop}
                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                >
                                    {mediaPreview ? (
                                        mediaPreview.type === 'video' ? (
                                            <video src={mediaPreview.url} className="ess-news-upload-preview" controls />
                                        ) : (
                                            <img src={mediaPreview.url} className="ess-news-upload-preview" alt="Preview" />
                                        )
                                    ) : (
                                        <div className="ess-news-upload-placeholder">
                                            <div className="ess-news-upload-icon">
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                    <polyline points="17 8 12 3 7 8" />
                                                    <line x1="12" y1="3" x2="12" y2="15" />
                                                </svg>
                                            </div>
                                            <div>Click or drag to upload image or video</div>
                                            <div className="ess-news-upload-hint">JPG, PNG, GIF, MP4, MOV</div>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,video/*"
                                    style={{ display: 'none' }}
                                    onChange={e => handleFileChange(e.target.files[0])}
                                />
                                {mediaPreview && (
                                    <button
                                        type="button"
                                        className="module-secondary-btn compact"
                                        style={{ marginTop: 8 }}
                                        onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                                    >
                                        Remove media
                                    </button>
                                )}
                            </div>
                            {saveError && <p style={{ color: '#b91c1c', fontSize: 13 }}>{saveError}</p>}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="submit" className="module-primary-btn compact" disabled={saving}>
                                    {saving ? 'Publishing...' : 'Publish'}
                                </button>
                                <button type="button" className="module-secondary-btn compact" onClick={resetForm} disabled={saving}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {!error && items.length === 0 && (
                    <div className="module-card">
                        <div className="module-empty-inline">No news items yet. Add your first item above.</div>
                    </div>
                )}

                {items.length > 0 && (
                    <div className="ess-news-grid">
                        {items.map(item => (
                            <div key={item.id} className="ess-news-card">
                                <div className="ess-news-card-media">
                                    {item.mediaUrl ? (
                                        item.mediaType === 'video' ? (
                                            <video src={item.mediaUrl} className="ess-news-card-media-content" controls />
                                        ) : (
                                            <img src={item.mediaUrl} className="ess-news-card-media-content" alt={item.title} />
                                        )
                                    ) : (
                                        <div className="ess-news-card-no-media">No media</div>
                                    )}
                                </div>
                                <div className="ess-news-card-body">
                                    <div className="ess-news-card-title">{item.title}</div>
                                    {item.subtitle && <div className="ess-news-card-subtitle">{item.subtitle}</div>}
                                    <div className="ess-news-card-meta">{new Date(item.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                    <button
                                        className="module-danger-btn compact"
                                        style={{ marginTop: 12 }}
                                        disabled={deletingId === item.id}
                                        onClick={() => handleDelete(item)}
                                    >
                                        {deletingId === item.id ? 'Deleting…' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
