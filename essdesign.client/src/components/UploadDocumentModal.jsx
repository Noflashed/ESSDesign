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
        } catch (error) {
            alert('Upload failed: ' + (error.response?.data?.error || error.message));
        } finally {
            setUploading(false);
        }
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
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the changes in this revision..."
                            rows={3}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
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