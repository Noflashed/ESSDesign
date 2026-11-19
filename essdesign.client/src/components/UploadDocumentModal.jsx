import React, { useState, useEffect, useRef } from 'react';
import { foldersAPI, resolveProfileImageUrl, usersAPI } from '../services/api';
import { Check, FileText, Upload, X } from 'lucide-react';
import DrawingRecipientPicker from './DrawingRecipientPicker';
import DrawingDialog from './DrawingDialog';
export { RecipientAvatar } from './DrawingRecipientPicker';
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

function DrawingPreview({ file }) {
    const canvasRef = useRef(null);
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        let active = true;
        let loadingTask;
        setStatus('loading');
        const url = URL.createObjectURL(file);
        async function render() {
            try {
                const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
                if (!active) return;
                pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
                loadingTask = pdfjs.getDocument({ url, isEvalSupported: false });
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                if (!active) return;
                const size = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: 1400 / Math.max(size.width, size.height) });
                const canvas = canvasRef.current;
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                if (active) setStatus('ready');
            } catch {
                if (active) setStatus('unavailable');
            }
        }
        render();
        return () => {
            active = false;
            loadingTask?.destroy();
            URL.revokeObjectURL(url);
        };
    }, [file]);

    return (
        <div className="drawing-sheet">
            <canvas ref={canvasRef} hidden={status !== 'ready'} role="img" aria-label={`First page of ${file.name}`} />
            {status !== 'ready' && <span role="status" className={status === 'loading' ? 'drawing-loading' : undefined}>{status === 'loading' ? 'Loading preview�' : 'Preview unavailable for this PDF'}</span>}
        </div>
    );
}

export const isTruckDeviceUser = (user) => String(user?.role || '').toLowerCase().startsWith('truck_ess');

const getUserAvatarLookupId = (user) => user.employeeId || user.EmployeeId || user.id;

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

export const hydrateNotificationRecipients = async (userList) => {
    const users = Array.isArray(userList) ? userList.filter(user => !isTruckDeviceUser(user)) : [];
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
    const [revisionOverride, setRevisionOverride] = useState(null);
    const [drawingStatus, setDrawingStatus] = useState('Construction');
    const [essDesignFile, setEssDesignFile] = useState(null);
    const [description, setDescription] = useState('');
    const [selectedRecipients, setSelectedRecipients] = useState([]);
    const [users, setUsers] = useState(() => notificationRecipientsCache || []);
    const [avatarUrls, setAvatarUrls] = useState({});
    const [recipientsLoading, setRecipientsLoading] = useState(() => !notificationRecipientsCache);
    const fileInput = useRef(null);
    const [uploading, setUploading] = useState(false);

    const revisionDigits = essDesignFile?.name.match(/\(rev(\d+)\)(?:\.pdf)?$/i)?.[1];
    const detectedRevision = revisionDigits?.replace(/^0+(?=\d)/, '').padStart(2, '0');
    const revisionNumber = revisionOverride ?? detectedRevision ?? '01';
    const revisionOptions = Array.from({ length: 20 }, (_, i) => {
        const num = i + 1;
        return num < 10 ? `0${num}` : `${num}`;
    });

    if (detectedRevision && !revisionOptions.includes(detectedRevision)) {
        revisionOptions.push(detectedRevision);
    }

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
        <DrawingDialog titleId="drawing-upload-title" onClose={onClose}>
            <form onSubmit={handleSubmit}>
                <header className="drawing-header">
                    <div><small>ESS Design</small><h2 id="drawing-upload-title">Upload drawing</h2></div>
                    <button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
                </header>
                <div className="drawing-body">
                    <section className="drawing-file" aria-label="Drawing PDF">
                        <input ref={fileInput} type="file" accept=".pdf,application/pdf" hidden
                            onChange={(event) => {
                                const file = event.target.files[0];
                                if (!file) return;
                                setEssDesignFile(file);
                                setRevisionOverride(null);
                                event.target.value = '';
                            }} />
                        {essDesignFile ? (
                            <>
                                <DrawingPreview file={essDesignFile} />
                                <div className="drawing-file-row">
                                    <FileText size={19} aria-hidden="true" />
                                    <span title={essDesignFile.name}>{essDesignFile.name}</span>
                                    <button type="button" onClick={() => fileInput.current.click()}>Change file</button>
                                </div>
                            </>
                        ) : (
                            <button type="button" className="drawing-choose" onClick={() => fileInput.current.click()}>
                                <Upload size={28} />Choose PDF
                            </button>
                        )}
                    </section>
                    <div className="drawing-fields">
                        <div className="upload-meta-grid">
                            <label className="upload-field">
                                <span>Revision</span>
                                <select
                                    value={revisionNumber}
                                    onChange={(e) => setRevisionOverride(e.target.value)}
                                    required
                                >
                                    {revisionOptions.map(rev => (
                                        <option key={rev} value={rev}>
                                            Revision {rev}
                                        </option>
                                    ))}
                                </select>
                                {detectedRevision && !revisionOverride && (
                                    <small className="drawing-detected"><Check size={15} />Detected from filename</small>
                                )}
                            </label>

                            <label className="upload-field">
                                <span>Drawing status</span>
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
                            <span>Change notes</span>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What changed in this revision?"
                                rows={4}
                                className="modal-textarea"
                            />
                        </label>

                        <DrawingRecipientPicker label="Notify users" users={users} selected={selectedRecipients}
                            loading={recipientsLoading} avatarUrls={avatarUrls}
                            onToggle={id => setSelectedRecipients(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])} />
                    </div>
                </div>
                <footer className="drawing-actions">
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="submit" disabled={uploading || !essDesignFile}><Upload size={17} />Upload PDF</button>
                </footer>
            </form>
        </DrawingDialog>
    );
}

export default UploadDocumentModal;
