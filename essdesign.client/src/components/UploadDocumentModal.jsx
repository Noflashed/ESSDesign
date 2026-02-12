import React, { useState } from 'react';
import { foldersAPI } from '../services/api';

function UploadDocumentModal({ folderId, onClose, onSuccess }) {
    const [revisionNumber, setRevisionNumber] = useState('01');
    const [essDesignFile, setEssDesignFile] = useState(null);
    const [thirdPartyFile, setThirdPartyFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    // Generate revision options 01 to 15
    const revisionOptions = Array.from({ length: 15 }, (_, i) => {
        const num = i + 1;
        return num < 10 ? `0${num}` : `${num}`;
    });

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
            await foldersAPI.uploadDocument(folderId, revisionNumber, essDesignFile, thirdPartyFile);
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