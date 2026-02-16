import React, { useState, useEffect } from 'react';
import { foldersAPI, usersAPI } from '../services/api';

function UploadDocumentModal({ folderId, onClose, onSuccess }) {
    const [revisionNumber, setRevisionNumber] = useState('01');
    const [essDesignFile, setEssDesignFile] = useState(null);
    const [thirdPartyFile, setThirdPartyFile] = useState(null);
    const [description, setDescription] = useState('');
    const [selectedRecipients, setSelectedRecipients] = useState([]);
    const [users, setUsers] = useState([]);
    const [uploading, setUploading] = useState(false);

    // Generate revision options 01 to 15
    const revisionOptions = Array.from({ length: 15 }, (_, i) => {
        const num = i + 1;
        return num < 10 ? `0${num}` : `${num}`;
    });

    // Fetch users for recipient selection
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const userList = await usersAPI.getAllUsers();
                setUsers(userList);
            } catch (error) {
                console.error('Failed to fetch users:', error);
            }
        };
        fetchUsers();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!revisionNumber) {
            alert('Please select a revision number');
            return;
        }
        if (!essDesignFile && !thirdPartyFile) {
            alert('Please select at least one file');
            return;
        }

        setUploading(true);

        // Retry logic for transient failures
        const maxRetries = 2;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await foldersAPI.uploadDocument(
                    folderId,
                    revisionNumber,
                    essDesignFile,
                    thirdPartyFile,
                    description,
                    selectedRecipients
                );
                onSuccess();
                return; // Success, exit
            } catch (error) {
                lastError = error;
                const errorMsg = error.message || error.response?.data?.error || 'Unknown error';

                // Don't retry on validation errors (4xx)
                if (error.response && error.response.status >= 400 && error.response.status < 500) {
                    alert('Upload failed: ' + errorMsg);
                    setUploading(false);
                    return;
                }

                // If not last attempt and it's a server error, retry
                if (attempt < maxRetries) {
                    console.log(`Upload attempt ${attempt + 1} failed, retrying...`, errorMsg);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                } else {
                    // Last attempt failed
                    alert('Upload failed after ' + (maxRetries + 1) + ' attempts: ' + errorMsg);
                }
            }
        }

        setUploading(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal upload-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Upload Document</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Revision Number</label>
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
                    </div>

                    <div className="file-uploads">
                        <div className="file-upload-box">
                            <label>
                                ESS Design Issue
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => setEssDesignFile(e.target.files[0])}
                                />
                            </label>
                            {essDesignFile && <div className="file-selected">✓ {essDesignFile.name}</div>}
                        </div>

                        <div className="file-upload-box">
                            <label>
                                Third-Party Engineer Design
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => setThirdPartyFile(e.target.files[0])}
                                />
                            </label>
                            {thirdPartyFile && <div className="file-selected">✓ {thirdPartyFile.name}</div>}
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
                            placeholder="- First change&#10;- Second change&#10;- Third change"
                            rows={4}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontFamily: 'monospace' }}
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
                                                setSelectedRecipients([...selectedRecipients, user.id]);
                                            } else {
                                                setSelectedRecipients(selectedRecipients.filter(id => id !== user.id));
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
                            {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default UploadDocumentModal;