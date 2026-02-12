import React, { useState, useEffect } from 'react';
import './PDFViewer.css';

function PDFViewer({ documentId, fileName, fileType, onClose }) {
    const [pdfUrl, setPdfUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadPDF();
    }, [documentId, fileType]);

    const loadPDF = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL || 'https://localhost:7001/api'}/folders/documents/${documentId}/download/${fileType}`,
                {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                    }
                }
            );

            if (!response.ok) throw new Error('Failed to load PDF');

            const data = await response.json();
            setPdfUrl(data.url);
        } catch (err) {
            setError('Failed to load PDF');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        try {
            // Fetch the PDF as a blob
            const response = await fetch(pdfUrl);
            const blob = await response.blob();

            // Create a download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName; // Use exact original filename
            document.body.appendChild(link);
            link.click();

            // Cleanup
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback to opening in new tab if download fails
            window.open(pdfUrl, '_blank');
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
                        <span className="pdf-filename-small">{fileName}</span>
                    </div>
                    <div className="pdf-header-right">
                        <button
                            className="pdf-icon-btn"
                            onClick={handleDownload}
                            title="Download"
                        >
                            ⬇
                        </button>
                        <button
                            className="pdf-icon-btn"
                            onClick={() => window.open(pdfUrl, '_blank')}
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
                            title={fileName}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default PDFViewer;
