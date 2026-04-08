import React, { useEffect, useState } from 'react';
import { safetyFilesAPI } from '../services/api';

export default function WebSafetySwmsPage({ builder, project, onBack }) {
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState([]);
    const [error, setError] = useState('');

    const loadFiles = async () => {
        setLoading(true);
        setError('');
        try {
            const next = await safetyFilesAPI.listModuleFiles(builder.id, project.id, 'swms');
            setFiles(next);
        } catch (err) {
            setError(err.message || 'Failed to load SWMS files');
            setFiles([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFiles().catch(() => {});
    }, [builder.id, project.id]);

    const uploadPdf = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        setUploading(true);
        setError('');
        try {
            await safetyFilesAPI.uploadModulePdf(builder.id, project.id, 'swms', file);
            await loadFiles();
        } catch (err) {
            setError(err.message || 'Failed to upload PDF');
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    const openPdf = async (file) => {
        try {
            const url = await safetyFilesAPI.getSignedModuleFileUrl(file.path);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(err.message || 'Failed to open PDF');
        }
    };

    return (
        <div className="module-page">
            <div className="module-shell">
                <div className="module-header">
                    <div>
                        <h2>SWMS</h2>
                        <p>{builder.name} — {project.name}</p>
                    </div>
                    <button className="module-secondary-btn" onClick={onBack}>Back</button>
                </div>
                <div className="module-card">
                    <div className="module-header compact">
                        <div className="module-card-title">Shared SWMS PDFs</div>
                        <label className={`module-primary-btn compact upload-label ${uploading ? 'disabled' : ''}`}>
                            {uploading ? 'Uploading...' : 'Upload PDF'}
                            <input type="file" accept="application/pdf" onChange={uploadPdf} hidden disabled={uploading} />
                        </label>
                    </div>
                    {error ? <div className="module-error">{error}</div> : null}
                    {loading ? (
                        <div className="module-empty-inline">Loading SWMS files...</div>
                    ) : files.length === 0 ? (
                        <div className="module-empty-inline">No SWMS PDFs uploaded for this site yet.</div>
                    ) : (
                        <div className="module-list">
                            {files.map(file => (
                                <button key={file.path} className="module-file-row" onClick={() => openPdf(file)}>
                                    <div>
                                        <div className="module-item-title">{file.name}</div>
                                        <div className="module-item-sub">{new Date(file.updatedAt).toLocaleDateString()}</div>
                                    </div>
                                    <span className="module-link-arrow">Open</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
