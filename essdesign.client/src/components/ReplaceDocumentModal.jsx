import React, { useEffect, useMemo, useState } from 'react';
import { foldersAPI } from '../services/api';
import { DRAWING_STATUS_OPTIONS, loadNotificationRecipients } from './UploadDocumentModal';
import { useToast } from './Toast';

function ReplaceDocumentModal({ document, onClose, onSuccess }) {
    const { showToast, updateToast } = useToast();
    const [essDesignFile, setEssDesignFile] = useState(null);
    const [drawingStatus, setDrawingStatus] = useState(document?.drawingStatus || 'Construction');
    const [description, setDescription] = useState(document?.description || '');
    const [recipientSearch, setRecipientSearch] = useState('');
    const [selectedRecipients, setSelectedRecipients] = useState([]);
    const [users, setUsers] = useState([]);
    const [recipientsLoading, setRecipientsLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    const documentLabel = useMemo(
        () => document?.essDesignIssueName || `Revision ${document?.revisionNumber || '00'}`,
        [document]
    );

    const visibleUsers = users.filter((user) => {
        const query = recipientSearch.trim().toLowerCase();
        if (!query) return true;
        return [user.fullName, user.email]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(query));
    });

    const getUserInitials = (user) => {
        const label = user.fullName || user.email || '';
        const parts = label.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return label.slice(0, 2).toUpperCase() || 'U';
    };

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const userList = await loadNotificationRecipients();
                setUsers(userList);
            } catch (error) {
                console.error('Failed to fetch users:', error);
            } finally {
                setRecipientsLoading(false);
            }
        };

        fetchUsers();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!essDesignFile) {
            alert('Please select a replacement PDF');
            return;
        }

        setUploading(true);

        const uploadLabel = essDesignFile.name;
        const progressToastId = showToast({
            type: 'info',
            variant: 'upload-progress',
            title: uploadLabel,
            message: 'Replacing PDF revision...',
            progress: 0,
            closable: false
        }, 'info', 0);

        onClose();

        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await foldersAPI.replaceDocumentFiles(
                    document.id,
                    essDesignFile,
                    null,
                    description,
                    selectedRecipients,
                    {
                        drawingStatus,
                        onUploadProgress: (event) => {
                            if (!event.total) {
                                return;
                            }

                            const progress = Math.max(0, Math.min(100, (event.loaded / event.total) * 100));
                            updateToast(progressToastId, {
                                type: 'info',
                                variant: 'upload-progress',
                                title: uploadLabel,
                                message: progress >= 100 ? 'Finishing replacement...' : 'Replacing PDF revision...',
                                progress,
                                closable: false
                            }, 'info', 0);
                        }
                    }
                );

                updateToast(progressToastId, {
                    type: 'success',
                    variant: 'upload-progress',
                    title: uploadLabel,
                    message: 'Revision files replaced',
                    progress: 100,
                    closable: true
                }, 'success');

                onSuccess();
                return;
            } catch (error) {
                const errorMsg = error.message || error.response?.data?.error || 'Unknown error';

                if (error.response && error.response.status >= 400 && error.response.status < 500) {
                    updateToast(progressToastId, {
                        type: 'error',
                        variant: 'upload-progress',
                        title: uploadLabel,
                        message: `Replacement failed: ${errorMsg}`,
                        progress: 0,
                        closable: true
                    }, 'error');
                    return;
                }

                if (attempt < maxRetries) {
                    updateToast(progressToastId, {
                        type: 'info',
                        variant: 'upload-progress',
                        title: uploadLabel,
                        message: `Retrying replacement (${attempt + 2}/${maxRetries + 1})...`,
                        progress: 0,
                        closable: false
                    }, 'info', 0);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    updateToast(progressToastId, {
                        type: 'error',
                        variant: 'upload-progress',
                        title: uploadLabel,
                        message: `Replacement failed: ${errorMsg}`,
                        progress: 0,
                        closable: true
                    }, 'error');
                }
            }
        }
    };

    return (
        <div className="modal-overlay" onClick={() => !uploading && onClose()}>
            <div className="modal upload-modal document-upload-modal" onClick={(e) => e.stopPropagation()}>
                <div className="document-upload-header">
                    <div>
                        <h3>Replace Revision PDF</h3>
                        <p>Replace {documentLabel} while keeping revision {document?.revisionNumber}.</p>
                    </div>
                    <button type="button" className="document-upload-close" onClick={onClose} disabled={uploading} aria-label="Close">
                        &times;
                    </button>
                </div>
                <form className="document-upload-form" onSubmit={handleSubmit}>
                    <label className={`upload-file-drop replace-upload-drop${essDesignFile ? ' has-file' : ''}`}>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setEssDesignFile(e.target.files[0] || null)}
                        />
                        <span className="upload-file-kicker">Current: {document?.essDesignIssueName || 'No file uploaded'}</span>
                        <strong>{essDesignFile ? essDesignFile.name : 'Choose replacement PDF'}</strong>
                        {essDesignFile && <span className="upload-selected-file">Selected</span>}
                    </label>

                    <div className="upload-meta-grid single">
                        <label className="upload-field">
                            <span>Status</span>
                            <select
                                value={drawingStatus}
                                onChange={(e) => setDrawingStatus(e.target.value)}
                                required
                            >
                                {DRAWING_STATUS_OPTIONS.map(status => (
                                    <option key={status} value={status}>
                                        {status}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <label className="upload-field">
                        <span>Change Notes</span>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="- Updated issue notes&#10;- Replaced stamped drawing"
                            rows={4}
                            className="modal-textarea"
                        />
                    </label>

                    <div className="upload-field">
                        <div className="upload-field-row">
                            <span>Notify Users</span>
                            {selectedRecipients.length > 0 && (
                                <span className="recipients-count">
                                    {selectedRecipients.length} selected
                                </span>
                            )}
                        </div>
                        <div className="upload-user-search">
                            <input
                                type="search"
                                value={recipientSearch}
                                onChange={(e) => setRecipientSearch(e.target.value)}
                                placeholder="Search users"
                            />
                        </div>
                        <div className="recipient-selection upload-recipient-list">
                            {recipientsLoading ? (
                                <div className="recipient-loading">Loading users...</div>
                            ) : visibleUsers.length === 0 ? (
                                <div className="recipient-loading">No users available</div>
                            ) : (
                                visibleUsers.map(user => (
                                    <label key={user.id} className="recipient-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selectedRecipients.includes(user.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedRecipients((prev) => [...prev, user.id]);
                                                } else {
                                                    setSelectedRecipients((prev) => prev.filter(id => id !== user.id));
                                                }
                                            }}
                                        />
                                        <span className="recipient-avatar" aria-hidden="true">{getUserInitials(user)}</span>
                                        <span>
                                            <strong>{user.fullName || user.email}</strong>
                                            <small>{user.email}</small>
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="modal-actions upload-modal-actions">
                        <button type="button" onClick={onClose} disabled={uploading}>
                            Cancel
                        </button>
                        <button type="submit" disabled={uploading}>
                            {uploading ? 'Replacing...' : 'Replace PDF'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ReplaceDocumentModal;
