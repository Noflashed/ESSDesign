import React, { useEffect, useMemo, useState } from 'react';
import { foldersAPI, usersAPI } from '../services/api';
import { useToast } from './Toast';

function ReplaceDocumentModal({ document, onClose, onSuccess }) {
    const { showToast, updateToast } = useToast();
    const [essDesignFile, setEssDesignFile] = useState(null);
    const [thirdPartyFile, setThirdPartyFile] = useState(null);
    const [description, setDescription] = useState(document?.description || '');
    const [selectedRecipients, setSelectedRecipients] = useState([]);
    const [users, setUsers] = useState([]);
    const [uploading, setUploading] = useState(false);

    const documentLabel = useMemo(
        () => document?.essDesignIssueName || document?.thirdPartyDesignName || `Revision ${document?.revisionNumber || '00'}`,
        [document]
    );

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const userList = await usersAPI.getNotificationRecipients();
                setUsers(userList);
            } catch (error) {
                console.error('Failed to fetch users:', error);
            }
        };

        fetchUsers();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!essDesignFile && !thirdPartyFile) {
            alert('Please select at least one replacement PDF');
            return;
        }

        setUploading(true);

        const replacementFiles = [essDesignFile, thirdPartyFile].filter(Boolean);
        const uploadLabel = replacementFiles.length === 1 ? replacementFiles[0].name : `${replacementFiles.length} replacement files`;
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
                    thirdPartyFile,
                    description,
                    selectedRecipients,
                    {
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
            <div className="modal upload-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Replace Revision PDF</h3>
                <p className="share-modal-subtitle">
                    Replace the files for <strong>{documentLabel}</strong> while keeping revision {document?.revisionNumber}.
                </p>
                <form onSubmit={handleSubmit}>
                    <div className="file-uploads">
                        <div className="file-upload-box">
                            <label>
                                ESS Design Issue
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => setEssDesignFile(e.target.files[0] || null)}
                                />
                            </label>
                            <div className="replace-file-hint">
                                Current: {document?.essDesignIssueName || 'No file uploaded'}
                            </div>
                            {essDesignFile && <div className="file-selected">Selected: {essDesignFile.name}</div>}
                        </div>

                        <div className="file-upload-box">
                            <label>
                                Third-Party Engineer Design
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => setThirdPartyFile(e.target.files[0] || null)}
                                />
                            </label>
                            <div className="replace-file-hint">
                                Current: {document?.thirdPartyDesignName || 'No file uploaded'}
                            </div>
                            {thirdPartyFile && <div className="file-selected">Selected: {thirdPartyFile.name}</div>}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Change Description (Optional)</label>
                        <small style={{ display: 'block', color: '#666', marginBottom: '4px', fontSize: '12px' }}>
                            Start each line with a dash (-) or asterisk (*) for bullet points
                        </small>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="- Updated issue notes&#10;- Replaced stamped drawing"
                            rows={4}
                            className="modal-textarea"
                        />
                    </div>

                    <div className="form-group">
                        <label>Notify Users (Optional)</label>
                        <div className="recipient-selection">
                            {users.map(user => (
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
                                    {user.fullName} ({user.email})
                                </label>
                            ))}
                        </div>
                        {selectedRecipients.length > 0 && (
                            <div className="recipients-count">
                                {selectedRecipients.length} user{selectedRecipients.length > 1 ? 's' : ''} will be notified
                            </div>
                        )}
                    </div>

                    <div className="modal-actions">
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
