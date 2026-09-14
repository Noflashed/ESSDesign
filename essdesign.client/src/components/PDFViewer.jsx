import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config/api';
import './PDFViewer.css';

function PDFViewer({ documentId, fileName, fileType, versionKey = '', onClose }) {
    const [pdfUrl, setPdfUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentFileName, setCurrentFileName] = useState(fileName);
    const requestSequence = useRef(0);

    const loadPDF = useCallback(async () => {
        const request = ++requestSequence.current;
        try {
            setLoading(true);
            setError(null);
            setPdfUrl(null);

            const response = await fetch(
                `${API_BASE_URL}/folders/documents/${documentId}/download/${fileType}`,
                {
                    cache: 'no-store',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                    }
                }
            );

            if (!response.ok) throw new Error('Failed to load PDF');

            const data = await response.json();
            if (request !== requestSequence.current) return null;
            if (!data.url) throw new Error('PDF link unavailable');
            setPdfUrl(data.url);
            setCurrentFileName(data.fileName || fileName);
            return data;
        } catch (err) {
            if (request === requestSequence.current) setError('Failed to load PDF');
            console.error(err);
            return null;
        } finally {
            if (request === requestSequence.current) setLoading(false);
        }
    }, [documentId, fileType, fileName]);

    useEffect(() => {
        loadPDF();
        const replaced = event => {
            if (event.detail?.documentId === documentId) loadPDF();
        };
        // Reopening an old message/search result or returning from another tab
        // must resolve the document again, even when its cached metadata is old.
        window.addEventListener('focus', loadPDF);
        window.addEventListener('ess:document-replaced', replaced);
        return () => {
            requestSequence.current += 1;
            window.removeEventListener('focus', loadPDF);
            window.removeEventListener('ess:document-replaced', replaced);
        };
    }, [documentId, versionKey, loadPDF]);

    const handleDownload = async () => {
        try {
            const current = await loadPDF();
            if (!current) return;
            const response = await fetch(current.url, { cache: 'no-store' });
            if (!response.ok) throw new Error('Download failed');
            const blob = await response.blob();

            // Create a download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = current.fileName || currentFileName;
            document.body.appendChild(link);
            link.click();

            // Cleanup
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            setError('Failed to download PDF. Please try again.');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="pdf-viewer-overlay" onClick={onClose}>
            <div className="pdf-viewer-container" onClick={(e) => e.stopPropagation()}>
                {/* Minimal header - Google Drive style */}
                <div className="pdf-viewer-header">
                    <div className="pdf-header-left">
                        <button
                            className="pdf-close-icon"
                            onClick={onClose}
                            title="Close"
                        >
                            ✕
                        </button>
                        <span className="pdf-filename-small">{currentFileName}</span>
                    </div>
                    <div className="pdf-header-right">
                        <button
                            className="pdf-icon-btn"
                            onClick={handleDownload}
                            disabled={loading || !pdfUrl}
                            title="Download"
                        >
                            ⬇
                        </button>
                        <button
                            className="pdf-icon-btn"
                            onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
                            disabled={loading || !pdfUrl}
                            title="Open in new tab"
                        >
                            ⧉
                        </button>
                        <button className="pdf-icon-btn" title="More">
                            ⋮
                        </button>
                    </div>
                </div>

                {/* PDF Content - fills remaining space */}
                <div className="pdf-viewer-content">
                    {loading && (
                        <div className="pdf-loading">
                            <div className="pdf-spinner"></div>
                            <p>Loading PDF...</p>
                        </div>
                    )}

                    {error && (
                        <div className="pdf-error">
                            <p>{error}</p>
                            <button onClick={loadPDF}>Retry</button>
                        </div>
                    )}

                    {!loading && !error && pdfUrl && (
                        <iframe
                            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                            className="pdf-iframe"
                            title={currentFileName}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default PDFViewer;
