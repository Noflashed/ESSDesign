import React, { useState, useEffect, useCallback } from 'react';
import { foldersAPI } from '../services/api';
import UploadDocumentModal from './UploadDocumentModal';
import PDFViewer from './PDFViewer';
import './FolderBrowser.css';

function FolderBrowser({ selectedFolderId, onFolderChange }) {
    const [currentFolder, setCurrentFolder] = useState(null);
    const [folders, setFolders] = useState([]);
    const [breadcrumbs, setBreadcrumbs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renameTarget, setRenameTarget] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [cache, setCache] = useState(new Map());
    
    // PDF Viewer state
    const [pdfViewer, setPdfViewer] = useState(null);

    useEffect(() => {
        if (selectedFolderId !== undefined) {
            setCurrentFolder(selectedFolderId);
        }
    }, [selectedFolderId]);

    useEffect(() => {
        loadCurrentFolder();
    }, [currentFolder]);

    const loadCurrentFolder = useCallback(async () => {
        const cacheKey = currentFolder === null ? 'root' : currentFolder;
        const cached = cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < 60000)) {
            setFolders(cached.data);
            setBreadcrumbs(cached.breadcrumbs || []);
            return;
        }

        setLoading(true);
        try {
            if (currentFolder === null) {
                const data = await foldersAPI.getRootFolders();
                setFolders(data);
                setBreadcrumbs([]);
                
                setCache(prev => new Map(prev).set('root', {
                    data,
                    breadcrumbs: [],
                    timestamp: Date.now()
                }));
            } else {
                const [data, crumbs] = await Promise.all([
                    foldersAPI.getFolder(currentFolder),
                    foldersAPI.getBreadcrumbs(currentFolder)
                ]);
                
                const folderItems = [...data.subFolders, ...data.documents.map(d => ({ ...d, isDocument: true }))];
                setFolders(folderItems);
                setBreadcrumbs(crumbs);
                
                setCache(prev => new Map(prev).set(currentFolder, {
                    data: folderItems,
                    breadcrumbs: crumbs,
                    timestamp: Date.now()
                }));
            }
        } catch (error) {
            console.error('Error loading folder:', error);
        } finally {
            setLoading(false);
        }
    }, [currentFolder, cache]);

    const clearCache = () => {
        setCache(new Map());
    };

    const handleFolderClick = (folderId) => {
        setCurrentFolder(folderId);
        if (onFolderChange) {
            onFolderChange(folderId);
        }
    };

    const handleBreadcrumbClick = (folderId) => {
        const newFolderId = folderId || null;
        setCurrentFolder(newFolderId);
        if (onFolderChange) {
            onFolderChange(newFolderId);
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            await foldersAPI.createFolder(newFolderName, currentFolder);
            setNewFolderName('');
            setShowNewFolderModal(false);
            clearCache();
            loadCurrentFolder();
        } catch (error) {
            alert('Failed to create folder');
        }
    };

    const handleRenameFolder = async () => {
        if (!newFolderName.trim() || !renameTarget) return;
        try {
            await foldersAPI.renameFolder(renameTarget.id, newFolderName);
            setNewFolderName('');
            setRenameTarget(null);
            setShowRenameModal(false);
            clearCache();
            loadCurrentFolder();
        } catch (error) {
            alert('Failed to rename folder');
        }
    };

    const handleDeleteFolder = async (folderId) => {
        if (!confirm('Delete this folder and all its contents?')) return;
        try {
            await foldersAPI.deleteFolder(folderId);
            clearCache();
            loadCurrentFolder();
        } catch (error) {
            alert('Failed to delete folder');
        }
    };

    const handleDeleteDocument = async (documentId) => {
        if (!confirm('Delete this document?')) return;
        try {
            await foldersAPI.deleteDocument(documentId);
            clearCache();
            loadCurrentFolder();
        } catch (error) {
            alert('Failed to delete document');
        }
    };

    const handleViewPDF = (document, type) => {
        const fileName = type === 'ess' ? document.essDesignIssueName : document.thirdPartyDesignName;
        setPdfViewer({
            documentId: document.id,
            fileName: fileName || 'document.pdf',
            fileType: type
        });
    };

    const handleContextMenu = (e, item) => {
        e.preventDefault();
        setContextMenu({ x: e.pageX, y: e.pageY, item });
    };

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    return (
        <div className="folder-browser">
            <div className="browser-toolbar">
                <button className="btn-new" onClick={() => setShowNewFolderModal(true)}>
                    + New Folder
                </button>
                {currentFolder && (
                    <button className="btn-upload" onClick={() => setShowUploadModal(true)}>
                        📄 Upload Document
                    </button>
                )}
            </div>

            <div className="breadcrumbs">
                <span className="breadcrumb" onClick={() => handleBreadcrumbClick(null)}>
                    Home
                </span>
                {breadcrumbs.map((crumb) => (
                    <React.Fragment key={crumb.id}>
                        <span className="breadcrumb-sep">/</span>
                        <span className="breadcrumb" onClick={() => handleBreadcrumbClick(crumb.id)}>
                            {crumb.name}
                        </span>
                    </React.Fragment>
                ))}
            </div>

            {loading ? (
                <div className="loading">
                    <div className="spinner-small"></div>
                    Loading...
                </div>
            ) : (
                <div className="items-grid">
                    {folders.map(item => (
                        <div
                            key={item.id}
                            className={`item-card ${item.isDocument ? 'document' : 'folder'}`}
                            onDoubleClick={() => !item.isDocument && handleFolderClick(item.id)}
                            onContextMenu={(e) => handleContextMenu(e, item)}
                        >
                            <div className="item-icon">
                                {item.isDocument ? '📄' : '📁'}
                            </div>
                            <div className="item-name">
                                {item.isDocument ? `Rev ${item.revisionNumber}` : item.name}
                            </div>
                            {item.isDocument && (
                                <div className="document-files">
                                    {item.essDesignIssuePath && (
                                        <button 
                                            onClick={() => handleViewPDF(item, 'ess')} 
                                            className="file-btn"
                                        >
                                            📄 ESS Design
                                        </button>
                                    )}
                                    {item.thirdPartyDesignPath && (
                                        <button 
                                            onClick={() => handleViewPDF(item, 'thirdparty')} 
                                            className="file-btn"
                                        >
                                            📄 Third-Party
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {contextMenu && (
                <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    {!contextMenu.item.isDocument && (
                        <>
                            <div onClick={() => {
                                setRenameTarget(contextMenu.item);
                                setNewFolderName(contextMenu.item.name);
                                setShowRenameModal(true);
                            }}>Rename</div>
                            <div onClick={() => handleDeleteFolder(contextMenu.item.id)}>Delete</div>
                        </>
                    )}
                    {contextMenu.item.isDocument && (
                        <div onClick={() => handleDeleteDocument(contextMenu.item.id)}>Delete</div>
                    )}
                </div>
            )}

            {showNewFolderModal && (
                <div className="modal-overlay" onClick={() => setShowNewFolderModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>New Folder</h3>
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Folder name"
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button onClick={() => setShowNewFolderModal(false)}>Cancel</button>
                            <button onClick={handleCreateFolder}>Create</button>
                        </div>
                    </div>
                </div>
            )}

            {showRenameModal && (
                <div className="modal-overlay" onClick={() => setShowRenameModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Rename Folder</h3>
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button onClick={() => setShowRenameModal(false)}>Cancel</button>
                            <button onClick={handleRenameFolder}>Rename</button>
                        </div>
                    </div>
                </div>
            )}

            {showUploadModal && (
                <UploadDocumentModal
                    folderId={currentFolder}
                    onClose={() => setShowUploadModal(false)}
                    onSuccess={() => {
                        setShowUploadModal(false);
                        clearCache();
                        loadCurrentFolder();
                    }}
                />
            )}

            {pdfViewer && (
                <PDFViewer
                    documentId={pdfViewer.documentId}
                    fileName={pdfViewer.fileName}
                    fileType={pdfViewer.fileType}
                    onClose={() => setPdfViewer(null)}
                />
            )}
        </div>
    );
}

export default FolderBrowser;
