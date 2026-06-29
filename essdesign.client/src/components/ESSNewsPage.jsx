import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Image as ImageIcon, Pencil, PlayCircle, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { essNewsAPI } from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';

function formatNewsDate(value) {
    if (!value) return 'Not set';
    return new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function emptyComposer() {
    return {
        id: null,
        title: '',
        subtitle: '',
        mediaUrl: null,
        mediaType: 'image',
        thumbnailUrl: null,
    };
}

function optimizedNewsImageUrl(url, quality = 72) {
    if (!url || !url.includes('/storage/v1/object/public/')) {
        return url;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}${separator}quality=${quality}`;
}

function newsThumbnailUrl(item) {
    if (!item?.mediaUrl) {
        return '';
    }
    if (item.mediaType === 'video') {
        return item.thumbnailUrl ? optimizedNewsImageUrl(item.thumbnailUrl) : '';
    }
    return optimizedNewsImageUrl(item.mediaUrl);
}

export default function ESSNewsPage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [composer, setComposer] = useState(emptyComposer());
    const [composerOpen, setComposerOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [mediaFile, setMediaFile] = useState(null);
    const [mediaPreview, setMediaPreview] = useState(null);
    const [thumbFile, setThumbFile] = useState(null);
    const [thumbPreview, setThumbPreview] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    const [dragOverMedia, setDragOverMedia] = useState(false);
    const [dragOverCover, setDragOverCover] = useState(false);
    const [previewItem, setPreviewItem] = useState(null);
    const fileInputRef = useRef(null);
    const thumbInputRef = useRef(null);

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

    const resetComposer = () => {
        setComposer(emptyComposer());
        setMediaFile(null);
        setMediaPreview(null);
        setThumbFile(null);
        setThumbPreview(null);
        setSaveError('');
        setDragOverMedia(false);
        setDragOverCover(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (thumbInputRef.current) thumbInputRef.current.value = '';
    };

    const openNewComposer = () => {
        resetComposer();
        setComposerOpen(true);
    };

    const closeComposer = () => {
        resetComposer();
        setComposerOpen(false);
    };

    const beginEdit = (item) => {
        setComposer({
            id: item.id,
            title: item.title || '',
            subtitle: item.subtitle || '',
            mediaUrl: item.mediaUrl || null,
            mediaType: item.mediaType || 'image',
            thumbnailUrl: item.thumbnailUrl || null,
        });
        setMediaFile(null);
        setMediaPreview(item.mediaUrl ? { url: item.mediaUrl, type: item.mediaType || 'image', existing: true } : null);
        setThumbFile(null);
        setThumbPreview(item.thumbnailUrl || null);
        setSaveError('');
        setComposerOpen(true);
    };

    const handleFileChange = (file) => {
        if (!file) return;
        setSaveError('');
        const isVideo = file.type.startsWith('video/');
        if (!file.type.startsWith('image/') && !isVideo) {
            setSaveError('Only image and video files are supported.');
            return;
        }
        setMediaFile(file);
        setComposer(prev => ({
            ...prev,
            mediaType: isVideo ? 'video' : 'image',
        }));
        setMediaPreview({ url: URL.createObjectURL(file), type: isVideo ? 'video' : 'image' });
    };

    const handleCoverChange = (file) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setSaveError('Cover image must be an image file.');
            return;
        }
        setThumbFile(file);
        setThumbPreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!composer.title.trim()) {
            setSaveError('Title is required.');
            return;
        }

        const nextMediaType = mediaFile?.type.startsWith('video/')
            ? 'video'
            : mediaFile?.type.startsWith('image/')
                ? 'image'
                : composer.mediaType || 'image';
        const needsCover = nextMediaType === 'video' && !thumbFile && !composer.thumbnailUrl;
        if (needsCover) {
            setSaveError('A cover image is required for video items.');
            return;
        }

        setSaving(true);
        setSaveError('');
        try {
            let mediaUrl = composer.mediaUrl;
            let thumbnailUrl = composer.thumbnailUrl;

            if (mediaFile) {
                mediaUrl = await essNewsAPI.uploadMedia(mediaFile);
            }
            if (thumbFile) {
                thumbnailUrl = await essNewsAPI.uploadMedia(thumbFile);
            }

            const payload = {
                title: composer.title.trim(),
                subtitle: composer.subtitle.trim(),
                mediaUrl,
                mediaType: nextMediaType,
                thumbnailUrl,
            };

            if (composer.id) {
                const updated = await essNewsAPI.update(composer.id, payload);
                setItems(prev => prev.map(item => item.id === updated.id ? updated : item));
            } else {
                const created = await essNewsAPI.create(payload);
                setItems(prev => [created, ...prev]);
            }
            closeComposer();
        } catch (err) {
            setSaveError(err.message || 'Failed to save news item.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (item) => {
        if (!confirm(`Delete "${item.title}"?`)) return;
        setDeletingId(item.id);
        try {
            await essNewsAPI.delete(item.id);
            if (item.mediaUrl) essNewsAPI.deleteMedia(item.mediaUrl).catch(() => {});
            if (item.thumbnailUrl) essNewsAPI.deleteMedia(item.thumbnailUrl).catch(() => {});
            setItems(prev => prev.filter(newsItem => newsItem.id !== item.id));
            if (composer.id === item.id) closeComposer();
        } catch (err) {
            alert(err.message || 'Failed to delete news item.');
        } finally {
            setDeletingId(null);
        }
    };

    const filteredItems = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return items.filter(item => {
            if (!query) return true;
            return [item.title, item.subtitle, item.mediaType, formatNewsDate(item.createdAt)]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query);
        });
    }, [items, searchTerm]);
    const isEditing = Boolean(composer.id);

    if (loading) {
        return <div className="module-page"><div className="page-loading-brandmark"><LoadingBrandmark label="Loading news" /></div></div>;
    }

    return (
        <div className="module-page">
            <div className="module-shell ess-news-shell">
                {error ? (
                    <div className="module-card">
                        <p className="ess-news-error-text">{error}</p>
                        <button className="module-primary-btn compact" onClick={load}>Retry</button>
                    </div>
                ) : null}

                <div className={`ess-news-workspace ${composerOpen ? 'drawer-open' : ''}`}>
                    <aside className="ess-news-composer-drawer" aria-hidden={!composerOpen}>
                        <div className="ess-news-drawer-header">
                            <span>Add new item</span>
                            <button type="button" className="ess-news-clear-edit" onClick={closeComposer} aria-label="Close news editor">
                                <X size={16} strokeWidth={2.4} />
                            </button>
                        </div>
                        <form className="ess-news-form" onSubmit={handleSubmit}>
                            <label className="ess-news-field">
                                <span>Title <b>*</b></span>
                                <input
                                    type="text"
                                    value={composer.title}
                                    onChange={event => setComposer(prev => ({ ...prev, title: event.target.value }))}
                                    placeholder="Enter a title"
                                    maxLength={120}
                                />
                            </label>
                            <label className="ess-news-field">
                                <span>Subtitle</span>
                                <input
                                    type="text"
                                    value={composer.subtitle}
                                    onChange={event => setComposer(prev => ({ ...prev, subtitle: event.target.value }))}
                                    placeholder="Enter a subtitle (optional)"
                                    maxLength={200}
                                />
                            </label>

                            <div className="ess-news-field">
                                <span>Media <b>*</b></span>
                                <button
                                    type="button"
                                    className={`ess-news-dropzone${mediaPreview ? ' has-preview' : ''}${dragOverMedia ? ' drag-over' : ''}`}
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={event => {
                                        event.preventDefault();
                                        setDragOverMedia(false);
                                        handleFileChange(event.dataTransfer.files[0]);
                                    }}
                                    onDragOver={event => {
                                        event.preventDefault();
                                        setDragOverMedia(true);
                                    }}
                                    onDragLeave={() => setDragOverMedia(false)}
                                >
                                    {mediaPreview ? (
                                        mediaPreview.type === 'video' ? (
                                            <video src={mediaPreview.url} className="ess-news-dropzone-preview" controls />
                                        ) : (
                                            <img src={mediaPreview.url} className="ess-news-dropzone-preview" alt="Media preview" />
                                        )
                                    ) : (
                                        <span className="ess-news-dropzone-placeholder">
                                            <UploadCloud size={34} strokeWidth={1.8} />
                                            <strong>Drag and drop media here</strong>
                                            <em>or click to browse</em>
                                            <small>Supports: JPG, PNG, GIF, MP4, MOV</small>
                                        </span>
                                    )}
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={event => handleFileChange(event.target.files[0])} />
                            </div>

                            <div className="ess-news-field">
                                <span>Cover Image {composer.mediaType === 'video' ? <b>*</b> : <small>(Optional)</small>}</span>
                                <button
                                    type="button"
                                    className={`ess-news-dropzone ess-news-cover-dropzone${thumbPreview ? ' has-preview' : ''}${dragOverCover ? ' drag-over' : ''}`}
                                    onClick={() => thumbInputRef.current?.click()}
                                    onDrop={event => {
                                        event.preventDefault();
                                        setDragOverCover(false);
                                        handleCoverChange(event.dataTransfer.files[0]);
                                    }}
                                    onDragOver={event => {
                                        event.preventDefault();
                                        setDragOverCover(true);
                                    }}
                                    onDragLeave={() => setDragOverCover(false)}
                                >
                                    {thumbPreview ? (
                                        <img src={thumbPreview} className="ess-news-dropzone-preview" alt="Cover preview" />
                                    ) : (
                                        <span className="ess-news-dropzone-placeholder">
                                            <ImageIcon size={31} strokeWidth={1.8} />
                                            <strong>Drag and drop cover image</strong>
                                            <em>or click to browse</em>
                                            <small>Supports: JPG, PNG. Recommended 16:9</small>
                                        </span>
                                    )}
                                </button>
                                <input ref={thumbInputRef} type="file" accept="image/*" hidden onChange={event => handleCoverChange(event.target.files[0])} />
                            </div>

                            {saveError ? <p className="ess-news-save-error">{saveError}</p> : null}
                            <div className="ess-news-composer-actions">
                                <button type="button" className="module-secondary-btn compact" onClick={closeComposer} disabled={saving}>Cancel</button>
                                <button type="submit" className="module-primary-btn compact" disabled={saving}>
                                    {saving ? (isEditing ? 'Saving...' : 'Publishing...') : (isEditing ? 'Save Changes' : 'Publish')}
                                </button>
                            </div>
                        </form>
                    </aside>

                    <section className="ess-news-panel ess-news-list-panel">
                        <div className="ess-news-panel-header ess-news-table-header">
                            <label className="ess-news-search">
                                <Search size={17} strokeWidth={2.2} aria-hidden="true" />
                                <input
                                    type="search"
                                    value={searchTerm}
                                    onChange={event => setSearchTerm(event.target.value)}
                                    placeholder="Search news by title or subtitle..."
                                    aria-label="Search ESS News"
                                />
                            </label>
                            <button type="button" className="module-primary-btn compact ess-news-add-new" onClick={openNewComposer}>
                                <Plus size={16} strokeWidth={2.4} />
                                <span>Add New</span>
                            </button>
                        </div>
                        <div className="ess-news-table-wrap">
                            <table className="ess-news-table">
                                <thead>
                                    <tr>
                                        <th>Media</th>
                                        <th>Title</th>
                                        <th>Subtitle</th>
                                        <th>Type</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="ess-news-empty-cell">
                                                {items.length === 0 ? 'No news items yet.' : 'No news items match this view.'}
                                            </td>
                                        </tr>
                                    ) : filteredItems.map(item => {
                                        const thumbUrl = newsThumbnailUrl(item);
                                        return (
                                            <tr key={item.id}>
                                                <td>
                                                    <button type="button" className="ess-news-media-thumb" onClick={() => setPreviewItem(item)} aria-label={`Preview ${item.title}`}>
                                                        {thumbUrl ? (
                                                            <>
                                                                <img
                                                                    src={thumbUrl}
                                                                    alt=""
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                    onError={event => {
                                                                        if (item.mediaType === 'image' && item.mediaUrl && event.currentTarget.src !== item.mediaUrl) {
                                                                            event.currentTarget.src = item.mediaUrl;
                                                                        }
                                                                    }}
                                                                />
                                                                {item.mediaType === 'video' ? <PlayCircle size={24} strokeWidth={2.1} className="ess-news-play-mark" /> : null}
                                                            </>
                                                        ) : (
                                                            item.mediaType === 'video' ? (
                                                                <>
                                                                    <PlayCircle size={24} strokeWidth={2.1} className="ess-news-play-mark" />
                                                                    <span>Video</span>
                                                                </>
                                                            ) : (
                                                                <span>No media</span>
                                                            )
                                                        )}
                                                    </button>
                                                </td>
                                                <td><strong>{item.title}</strong></td>
                                                <td><span className="ess-news-subtitle-cell">{item.subtitle || 'No subtitle'}</span></td>
                                                <td>
                                                    <span className={`ess-news-type-pill ${item.mediaType === 'video' ? 'video' : 'image'}`}>
                                                        {item.mediaType === 'video' ? 'Video' : 'Image'}
                                                    </span>
                                                </td>
                                                <td>{formatNewsDate(item.createdAt)}</td>
                                                <td>
                                                    <div className="ess-news-table-actions">
                                                        <button type="button" className="ess-news-action-btn view" onClick={() => setPreviewItem(item)}>
                                                            <Eye size={14} strokeWidth={2.3} />
                                                            <span>View</span>
                                                        </button>
                                                        <button type="button" className="ess-news-action-btn edit" onClick={() => beginEdit(item)}>
                                                            <Pencil size={14} strokeWidth={2.3} />
                                                            <span>Edit</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="ess-news-icon-danger"
                                                            disabled={deletingId === item.id}
                                                            onClick={() => handleDelete(item)}
                                                            aria-label={`Delete ${item.title}`}
                                                        >
                                                            <Trash2 size={15} strokeWidth={2.4} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="ess-news-table-footer">
                            <span>Showing {filteredItems.length} of {items.length} items</span>
                        </div>
                    </section>
                </div>
            </div>

            {previewItem ? (
                <div className="module-modal-backdrop" onClick={() => setPreviewItem(null)}>
                    <div className="module-modal compact ess-news-preview-modal" onClick={event => event.stopPropagation()}>
                        <div className="module-modal-header">
                            <h3>{previewItem.title}</h3>
                            <button className="nav-drawer-close" onClick={() => setPreviewItem(null)}>x</button>
                        </div>
                        <div className="ess-news-preview-media">
                            {previewItem.mediaUrl ? (
                                previewItem.mediaType === 'video' ? (
                                    <video src={previewItem.mediaUrl} controls />
                                ) : (
                                    <img src={previewItem.mediaUrl} alt={previewItem.title} />
                                )
                            ) : (
                                <div>No media</div>
                            )}
                        </div>
                        {previewItem.subtitle ? <p className="ess-news-preview-subtitle">{previewItem.subtitle}</p> : null}
                        <div className="ess-news-preview-meta">{formatNewsDate(previewItem.createdAt)}</div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
