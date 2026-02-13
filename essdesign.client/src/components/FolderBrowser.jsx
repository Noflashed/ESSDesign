import React, { useState, useEffect, useCallback, useRef } from 'react';
import { foldersAPI } from '../services/api';
import UploadDocumentModal from './UploadDocumentModal';
import PDFViewer from './PDFViewer';
import './FolderBrowser.css';

// Helper function to format file size
const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '—';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

// Helper function to format date
const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
};

function FolderBrowser({ selectedFolderId, onFolderChange, viewMode: initialViewMode, onViewModeChange }) {
    const [currentFolder, setCurrentFolder] = useState(null);
    const [folders, setFolders] = useState([]);
    const [breadcrumbs, setBreadcrumbs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParent, setNewFolderParent] = useState(null); // Track parent for subfolder creation
    const [renameTarget, setRenameTarget] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const cacheRef = useRef(new Map());
    const [viewMode, setViewMode] = useState(() => {
        return initialViewMode || localStorage.getItem('viewMode') || 'grid';
    }); // 'grid' or 'list'

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

    // Save view mode preference
    useEffect(() => {
        localStorage.setItem('viewMode', viewMode);
        if (onViewModeChange) {
            onViewModeChange(viewMode);
        }
    }, [viewMode, onViewModeChange]);

    const loadCurrentFolder = useCallback(async () => {
        const cacheKey = currentFolder === null ? 'root' : currentFolder;
        const cached = cacheRef.current.get(cacheKey);

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

                cacheRef.current.set('root', {
                    data,
                    breadcrumbs: [],
                    timestamp: Date.now()
                });
            } else {
                const [data, crumbs] = await Promise.all([
                    foldersAPI.getFolder(currentFolder),
                    foldersAPI.getBreadcrumbs(currentFolder)
                ]);

                const folderItems = [...data.subFolders, ...data.documents.map(d => ({ ...d, isDocument: true }))];
                setFolders(folderItems);
                setBreadcrumbs(crumbs);

                cacheRef.current.set(currentFolder, {
                    data: folderItems,
                    breadcrumbs: crumbs,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('Error loading folder:', error);
        } finally {
            setLoading(false);
        }
    }, [currentFolder]);

    const clearCache = () => {
        cacheRef.current = new Map();
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
            // Use newFolderParent if set, otherwise use currentFolder
            const parentId = newFolderParent !== null ? newFolderParent : currentFolder;

            // Call API to create folder
            const newFolder = await foldersAPI.createFolder(newFolderName, parentId);

            // Validate response
            if (!newFolder || !newFolder.id || !newFolder.name) {
                throw new Error('Invalid folder response from server');
            }

            // Close modal and clear input immediately
            setNewFolderName('');
            setNewFolderParent(null);
            setShowNewFolderModal(false);

            // Only update UI if creating in current view
            if (parentId === currentFolder) {
                // Optimistically add the new folder to the UI
                setFolders(prev => [newFolder, ...prev]);
            }

            // Clear cache to prevent stale data on next load
            clearCache();

        } catch (error) {
            console.error('Create folder error:', error);
            alert('Failed to create folder. Please try again.');

            // On error, clear cache and reload to ensure consistency
            setNewFolderParent(null);
            clearCache();
            loadCurrentFolder();
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

    const handleEmptySpaceContextMenu = (e) => {
        // Only trigger if clicking on the grid/list container itself, not on items
        if (e.target.classList.contains('items-grid') || e.target.classList.contains('items-list')) {
            e.preventDefault();
            setContextMenu({ x: e.pageX, y: e.pageY, item: null, isEmptySpace: true });
        }
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
                <div className="view-toggle">
                    <button
                        className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                        onClick={() => setViewMode('grid')}
                        title="Grid view"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                        </svg>
                    </button>
                    <button
                        className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                        onClick={() => setViewMode('list')}
                        title="List view"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    </button>
                </div>
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
                <>
                    {viewMode === 'list' && (
                        <div className="list-header">
                            <div className="list-header-icon"></div>
                            <div className="list-header-name">Name</div>
                            <div className="list-header-owner">Owner</div>
                            <div className="list-header-modified">Date Modified</div>
                            <div className="list-header-size">File Size</div>
                            <div className="list-header-actions"></div>
                        </div>
                    )}
                    <div
                        className={viewMode === 'grid' ? 'items-grid' : 'items-list'}
                        onContextMenu={handleEmptySpaceContextMenu}
                    >
                        {folders.map(item => (
                        viewMode === 'grid' ? (
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
                        ) : (
                            <div
                                key={item.id}
                                className={`list-item ${item.isDocument ? 'document' : 'folder'}`}
                                onDoubleClick={() => !item.isDocument && handleFolderClick(item.id)}
                                onContextMenu={(e) => handleContextMenu(e, item)}
                            >
                                <div className="list-item-icon">
                                    {item.isDocument ? '📄' : '📁'}
                                </div>
                                <div className="list-item-info">
                                    <div className="list-item-name">
                                        {item.isDocument ? `Rev ${item.revisionNumber}` : item.name}
                                    </div>
                                    {item.isDocument && (
                                        <div className="list-item-meta">
                                            {item.essDesignIssuePath && <span>ESS Design</span>}
                                            {item.essDesignIssuePath && item.thirdPartyDesignPath && <span> • </span>}
                                            {item.thirdPartyDesignPath && <span>Third-Party</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="list-item-owner">
                                    {item.ownerName || 'Unknown'}
                                </div>
                                <div className="list-item-modified">
                                    {formatDate(item.updatedAt || item.createdAt)}
                                </div>
                                <div className="list-item-size">
                                    {item.isDocument ? formatFileSize(item.totalFileSize) : '—'}
                                </div>
                                {item.isDocument && (
                                    <div className="list-item-actions">
                                        {item.essDesignIssuePath && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleViewPDF(item, 'ess');
                                                }}
                                                className="file-btn-small"
                                            >
                                                ESS Design
                                            </button>
                                        )}
                                        {item.thirdPartyDesignPath && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleViewPDF(item, 'thirdparty');
                                                }}
                                                className="file-btn-small"
                                            >
                                                Third-Party Design
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                        ))}
                    </div>
                </>
            )}

            {contextMenu && (
                <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    {contextMenu.isEmptySpace && (
                        <div onClick={() => {
                            setNewFolderParent(currentFolder);
                            setShowNewFolderModal(true);
                            setContextMenu(null);
                        }}>
                            📁 New Folder
                        </div>
                    )}
                    {contextMenu.item && !contextMenu.item.isDocument && (
                        <>
                            <div onClick={() => {
                                setNewFolderParent(contextMenu.item.id);
                                setShowNewFolderModal(true);
                                setContextMenu(null);
                            }}>
                                📁 New Subfolder
                            </div>
                            <div className="context-menu-divider"></div>
                            <div onClick={() => {
                                setRenameTarget(contextMenu.item);
                                setNewFolderName(contextMenu.item.name);
                                setShowRenameModal(true);
                                setContextMenu(null);
                            }}>
                                ✏️ Rename
                            </div>
                            <div onClick={() => {
                                handleDeleteFolder(contextMenu.item.id);
                                setContextMenu(null);
                            }}>
                                🗑️ Delete
                            </div>
                        </>
                    )}
                    {contextMenu.item && contextMenu.item.isDocument && (
                        <div onClick={() => {
                            handleDeleteDocument(contextMenu.item.id);
                            setContextMenu(null);
                        }}>
                            🗑️ Delete
                        </div>
                    )}
                </div>
            )}

            {showNewFolderModal && (
                <div className="modal-overlay" onClick={() => {
                    setShowNewFolderModal(false);
                    setNewFolderParent(null);
                }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>{newFolderParent !== null && newFolderParent !== currentFolder ? 'New Subfolder' : 'New Folder'}</h3>
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Folder name"
                            autoFocus
                            onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                        />
                        <div className="modal-actions">
                            <button onClick={() => {
                                setShowNewFolderModal(false);
                                setNewFolderParent(null);
                            }}>Cancel</button>
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
