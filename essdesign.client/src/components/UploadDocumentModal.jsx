import React, { useState, useEffect } from 'react';
import { foldersAPI, resolveProfileImageUrl, usersAPI } from '../services/api';
import { useToast } from './Toast';

export const DRAWING_STATUS_OPTIONS = ['Construction', 'Preliminary', 'Concept', 'As-Built'];

export const inferDrawingStatusFromFileName = (fileName) => {
    const upperName = (fileName || '').toUpperCase();
    if (upperName.includes('(ASB)')) return 'As-Built';
    if (upperName.includes('(PRE)')) return 'Preliminary';
    if (upperName.includes('(CON)')) return 'Construction';
    if (upperName.includes('(CPT)') || upperName.includes('(CONCEPT)')) return 'Concept';
    return '';
};

const UploadDocumentIcon = () => (
    <span className="upload-document-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
            <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9A2.5 2.5 0 0 0 19 18.5V8l-5-5Z" stroke="currentColor" strokeWidth="1.8" />
            <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 16V9.5m0 0-3 3m3-3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    </span>
);

const getUserInitials = (user) => {
    const label = user.fullName || user.email || '';
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return label.slice(0, 2).toUpperCase() || 'U';
};

const getUserAvatarLookupId = (user) => user.employeeId || user.EmployeeId || user.id;

const getUserRoleLabel = (user) => (
    user.employeeTitle
    || user.EmployeeTitle
    || (user.role ? user.role.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '')
);

export function RecipientAvatar({ user, avatarUrls }) {
    const lookupId = getUserAvatarLookupId(user);
    const avatarUrl = user.resolvedAvatarUrl || user.profileImageUrl || user.avatarUrl || user.AvatarUrl || avatarUrls?.[lookupId] || '';
    return (
        <span className={`recipient-avatar${avatarUrl ? ' has-image' : ''}`} aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : getUserInitials(user)}
        </span>
    );
}

let notificationRecipientsCache = null;
let notificationRecipientsPromise = null;
const notificationRecipientAvatarCache = new Map();

const resolveNotificationRecipientAvatar = async (user) => {
    const lookupId = getUserAvatarLookupId(user);
    const existingUrl = user.resolvedAvatarUrl || user.profileImageUrl || user.avatarUrl || user.AvatarUrl;
    if (existingUrl || !lookupId) {
        return existingUrl || '';
    }

    if (notificationRecipientAvatarCache.has(lookupId)) {
        return notificationRecipientAvatarCache.get(lookupId);
    }

    const avatarUrl = await resolveProfileImageUrl(lookupId).catch(() => null);
    notificationRecipientAvatarCache.set(lookupId, avatarUrl || '');
    return avatarUrl || '';
};

const hydrateNotificationRecipients = async (userList) => {
    const users = Array.isArray(userList) ? userList : [];
    return Promise.all(users.map(async (user) => ({
        ...user,
        resolvedAvatarUrl: await resolveNotificationRecipientAvatar(user)
    })));
};

export const loadNotificationRecipients = async () => {
    if (notificationRecipientsCache) {
        return notificationRecipientsCache;
    }

    if (!notificationRecipientsPromise) {
        notificationRecipientsPromise = usersAPI.getNotificationRecipients()
            .then(async (userList) => {
                notificationRecipientsCache = await hydrateNotificationRecipients(userList);
                return notificationRecipientsCache;
            })
            .finally(() => {
                notificationRecipientsPromise = null;
            });
    }

    return notificationRecipientsPromise;
};

export const prefetchNotificationRecipients = () => {
    loadNotificationRecipients().catch(() => []);
};

function UploadDocumentModal({ folderId, onClose, onSuccess }) {
    const { showToast, updateToast } = useToast();
    const [revisionNumber, setRevisionNumber] = useState('01');
    const [drawingStatus, setDrawingStatus] = useState('Construction');
    const [essDesignFile, setEssDesignFile] = useState(null);
    const [description, setDescription] = useState('');
    const [recipientSearch, setRecipientSearch] = useState('');
    const [selectedRecipients, setSelectedRecipients] = useState([]);
    const [users, setUsers] = useState(() => notificationRecipientsCache || []);
    const [avatarUrls, setAvatarUrls] = useState({});
    const [recipientsLoading, setRecipientsLoading] = useState(() => !notificationRecipientsCache);
    const [uploading, setUploading] = useState(false);

    const revisionOptions = Array.from({ length: 20 }, (_, i) => {
        const num = i + 1;
        return num < 10 ? `0${num}` : `${num}`;
    });

    const visibleUsers = users.filter((user) => {
        const query = recipientSearch.trim().toLowerCase();
        if (!query) return true;
        return [user.fullName, user.email]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(query));
    });

    useEffect(() => {
        let active = true;

        const fetchUsers = async () => {
            try {
                const userList = await loadNotificationRecipients();
                if (!active) return;
                setUsers(userList);
            } catch (error) {
                console.error('Failed to fetch users:', error);
            } finally {
                if (active) {
                    setRecipientsLoading(false);
                }
            }
        };

        fetchUsers();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        const missingUsers = users.filter((user) => {
            const lookupId = getUserAvatarLookupId(user);
            return lookupId && !(lookupId in avatarUrls) && !(user.resolvedAvatarUrl || user.profileImageUrl || user.avatarUrl || user.AvatarUrl);
        });

        if (missingUsers.length === 0) {
            return undefined;
        }

        Promise.all(missingUsers.map(async (user) => {
            const lookupId = getUserAvatarLookupId(user);
            const avatarUrl = await resolveProfileImageUrl(lookupId).catch(() => null);
            return [lookupId, avatarUrl || ''];
        })).then((entries) => {
            if (!active) return;
            setAvatarUrls((current) => {
                const next = { ...current };
                entries.forEach(([lookupId, avatarUrl]) => {
                    if (lookupId) next[lookupId] = avatarUrl;
                });
                return next;
            });
        });

        return () => {
            active = false;
        };
    }, [avatarUrls, users]);

    useEffect(() => {
        const inferredStatus = inferDrawingStatusFromFileName(essDesignFile?.name);
        if (inferredStatus) {
            setDrawingStatus(inferredStatus);
        }
    }, [essDesignFile]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!revisionNumber) {
            alert('Please select a revision number');
            return;
        }
        if (!essDesignFile) {
            alert('Please select a PDF file');
            return;
        }

        setUploading(true);

        const uploadLabel = essDesignFile.name;
        const progressToastId = showToast({
            type: 'info',
            variant: 'upload-progress',
            title: uploadLabel,
            message: 'Uploading to ESS Design...',
            progress: 0,
            closable: false
        }, 'info', 0);

        onClose();

        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await foldersAPI.uploadDocument(
                    folderId,
                    revisionNumber,
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
                                message: progress >= 100 ? 'Finishing upload...' : 'Uploading to ESS Design...',
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
                    message: 'Upload complete',
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
                        message: `Upload failed: ${errorMsg}`,
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
                        message: `Retrying upload (${attempt + 2}/${maxRetries + 1})...`,
                        progress: 0,
                        closable: false
                    }, 'info', 0);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    updateToast(progressToastId, {
                        type: 'error',
                        variant: 'upload-progress',
                        title: uploadLabel,
                        message: `Upload failed: ${errorMsg}`,
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
                        <h3>Upload Document</h3>
                        <p>Add a new ESS Design PDF revision</p>
                    </div>
                    <button type="button" className="document-upload-close" onClick={onClose} disabled={uploading} aria-label="Close">
                        &times;
                    </button>
                </div>
                <form className="document-upload-form" onSubmit={handleSubmit}>
                    <label className={`upload-file-drop${essDesignFile ? ' has-file' : ''}`}>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setEssDesignFile(e.target.files[0] || null)}
                        />
                        <span className="upload-file-drop-content">
                            <UploadDocumentIcon />
                            <span>
                                <strong>{essDesignFile ? essDesignFile.name : 'Choose ESS Design PDF'}</strong>
                                <span className="upload-file-kicker">PDF file</span>
                            </span>
                        </span>
                    </label>

                    <div className="upload-meta-grid">
                        <label className="upload-field">
                            <span>Revision</span>
                            <select
                                value={revisionNumber}
                                onChange={(e) => setRevisionNumber(e.target.value)}
                                required
                            >
                                {revisionOptions.map(rev => (
                                    <option key={rev} value={rev}>
                                        Revision {rev}
                                    </option>
                                ))}
                            </select>
                        </label>

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
                            placeholder="- First change&#10;- Second change&#10;- Third change"
                            rows={4}
                            className="modal-textarea"
                        />
                    </label>

                    <div className="upload-field upload-notify-field">
                        <div className="upload-field-row">
                            <span>Notify Users</span>
                            {selectedRecipients.length > 0 && (
                                <span className="recipients-count">
                                    {selectedRecipients.length} selected
                                </span>
                            )}
                        </div>
                        <div className="upload-user-search">
                            <span aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none">
                                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                                    <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </span>
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
                                        <RecipientAvatar user={user} avatarUrls={avatarUrls} />
                                        <span>
                                            <strong>{user.fullName || user.email}</strong>
                                            <small>{user.email}</small>
                                        </span>
                                        <span className="recipient-role">{getUserRoleLabel(user)}</span>
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
                            {uploading ? 'Uploading...' : 'Upload Document'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default UploadDocumentModal;
