import React, { useState, useEffect, useCallback, useRef } from 'react';
import { foldersAPI, authAPI } from '../services/api';
import UploadDocumentModal from './UploadDocumentModal';
import PDFViewer from './PDFViewer';
import { useToast } from './Toast';
import './FolderBrowser.css';

// Professional SVG Icons (Google Drive style)
const FolderIcon = ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" fill="#5F6368" stroke="#5F6368" strokeWidth="0.5"/>
    </svg>
);

const DocumentIcon = ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#EA4335" fillOpacity="0.9"/>
        <path d="M14 2V8H20" fill="#EA4335" fillOpacity="0.7"/>
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="#B71C1C" strokeWidth="0.5"/>
    </svg>
);

const UploadIcon = ({ size = 16, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
);

const FileTextIcon = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
);

const FolderPlusIcon = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        <line x1="12" y1="11" x2="12" y2="17"></line>
        <line x1="9" y1="14" x2="15" y2="14"></line>
    </svg>
);

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

// Helper function to format revision number
const formatRevisionNumber = (revisionNumber) => {
    if (!revisionNumber) return 'Revision 00';
    return `Revision ${String(revisionNumber).padStart(2, '0')}`;
};

// Default column widths as fractions (must match grid-template-columns order after icon)
const DEFAULT_COL_WIDTHS = { name: 1.5, revision: 0.9, owner: 1, modified: 1.2, size: 0.8 };
const MIN_COL_WIDTH_PX = 60;

function FolderBrowser({ selectedFolderId, onFolderChange, viewMode: initialViewMode, onViewModeChange, onRefreshNeeded }) {
    const { showToast, updateToast } = useToast();
    const [currentFolder, setCurrentFolder] = useState(null);
    const [folders, setFolders] = useState([]);
    const [breadcrumbs, setBreadcrumbs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [showEditDocumentModal, setShowEditDocumentModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParent, setNewFolderParent] = useState(null); // Track parent for subfolder creation
    const [renameTarget, setRenameTarget] = useState(null);
    const [editDocumentTarget, setEditDocumentTarget] = useState(null);
    const [newRevisionNumber, setNewRevisionNumber] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const cacheRef = useRef(new Map());
    const [viewMode, setViewMode] = useState(() => {
        return initialViewMode || localStorage.getItem('viewMode') || 'grid';
    }); // 'grid' or 'list'
    const [sortField, setSortField] = useState(() => {
        return localStorage.getItem('sortField') || 'name';
    });
    const [sortDirection, setSortDirection] = useState(() => {
        return localStorage.getItem('sortDirection') || 'asc';
    });

    // Column resize state
    const [colWidths, setColWidths] = useState(() => {
        try {
            const saved = localStorage.getItem('listColWidths');
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        return { ...DEFAULT_COL_WIDTHS };
    });
    const resizingRef = useRef(null);
    const headerRef = useRef(null);

    // Persist column widths
    useEffect(() => {
        localStorage.setItem('listColWidths', JSON.stringify(colWidths));
    }, [colWidths]);

    // Build the grid-template-columns string from widths
    const gridTemplateColumns = `40px ${colWidths.name}fr ${colWidths.revision}fr ${colWidths.owner}fr ${colWidths.modified}fr ${colWidths.size}fr auto`;

    // Column resize handlers
    const colKeys = ['name', 'revision', 'owner', 'modified', 'size'];

    const handleResizeStart = useCallback((e, colIndex) => {
        e.preventDefault();
        e.stopPropagation();

        const headerEl = headerRef.current;
        if (!headerEl) return;

        // Get the pixel widths of all resizable columns from the DOM
        const cells = headerEl.children;
        // cells[0] = icon, cells[1..5] = resizable cols (with resize handles interspersed)
        // We use a data attribute to identify column cells
        const colElements = Array.from(headerEl.querySelectorAll('[data-col-key]'));
        const pixelWidths = {};
        colElements.forEach(el => {
            pixelWidths[el.dataset.colKey] = el.getBoundingClientRect().width;
        });

        const leftKey = colKeys[colIndex];
        const rightKey = colKeys[colIndex + 1];
        const startX = e.clientX;
        const startLeftPx = pixelWidths[leftKey];
        const startRightPx = pixelWidths[rightKey];
        const totalPx = startLeftPx + startRightPx;
        const startLeftFr = colWidths[leftKey];
        const startRightFr = colWidths[rightKey];
        const totalFr = startLeftFr + startRightFr;

        resizingRef.current = { leftKey, rightKey, startX, startLeftPx, startRightPx, totalPx, totalFr };

        const handleMouseMove = (moveEvent) => {
            const { startX, startLeftPx, totalPx, totalFr, leftKey, rightKey } = resizingRef.current;
            const dx = moveEvent.clientX - startX;
            let newLeftPx = startLeftPx + dx;
            let newRightPx = totalPx - newLeftPx;

            // Enforce minimums
            if (newLeftPx < MIN_COL_WIDTH_PX) {
                newLeftPx = MIN_COL_WIDTH_PX;
                newRightPx = totalPx - MIN_COL_WIDTH_PX;
            }
            if (newRightPx < MIN_COL_WIDTH_PX) {
                newRightPx = MIN_COL_WIDTH_PX;
                newLeftPx = totalPx - MIN_COL_WIDTH_PX;
            }

            const leftRatio = newLeftPx / totalPx;
            setColWidths(prev => ({
                ...prev,
                [leftKey]: +(totalFr * leftRatio).toFixed(4),
                [rightKey]: +(totalFr * (1 - leftRatio)).toFixed(4),
            }));
        };

        const handleMouseUp = () => {
            resizingRef.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [colWidths]);

    const handleResetColWidths = useCallback(() => {
        setColWidths({ ...DEFAULT_COL_WIDTHS });
    }, []);

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

    // Save sort preferences
    useEffect(() => {
        localStorage.setItem('sortField', sortField);
        localStorage.setItem('sortDirection', sortDirection);
    }, [sortField, sortDirection]);

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

        const parentId = newFolderParent !== null ? newFolderParent : currentFolder;
        const user = authAPI.getCurrentUser();

        // 1. Create optimistic folder object
        const optimisticFolder = {
            id: crypto.randomUUID(), // Temporary ID
            name: newFolderName,
            parentFolderId: parentId,
            userId: user?.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            subFolders: [],
            documents: [],
            _optimistic: true // Flag for styling
        };

        // 2. Update UI IMMEDIATELY
        setNewFolderName('');
        setNewFolderParent(null);
        setShowNewFolderModal(false);

        if (parentId === currentFolder) {
            setFolders(prev => [optimisticFolder, ...prev]);
        }

        // 3. Show toast
        const toastId = showToast('Creating folder...', 'info', 0);

        // 4. Send to server in background
        try {
            const serverFolder = await foldersAPI.createFolder(newFolderName, parentId);

            // 5. Replace optimistic with real data
            setFolders(prev => prev.map(f =>
                f.id === optimisticFolder.id ? serverFolder : f
            ));

            clearCache();
            if (onRefreshNeeded) onRefreshNeeded();
            updateToast(toastId, 'Folder created!', 'success');
        } catch (error) {
            // 6. Rollback on error
            setFolders(prev => prev.filter(f => f.id !== optimisticFolder.id));
            updateToast(toastId, 'Failed to create folder', 'error');
            console.error('Create folder error:', error);
        }
    };

    const handleRenameFolder = async () => {
        if (!newFolderName.trim() || !renameTarget) return;

        const oldName = renameTarget.name;
        const folderId = renameTarget.id;

        // 1. Update UI IMMEDIATELY
        setFolders(prev => prev.map(f =>
            f.id === folderId ? { ...f, name: newFolderName, _optimistic: true } : f
        ));

        setNewFolderName('');
        setRenameTarget(null);
        setShowRenameModal(false);

        // 2. Show toast
        const toastId = showToast('Renaming folder...', 'info', 0);

        // 3. Send to server in background
        try {
            await foldersAPI.renameFolder(folderId, newFolderName);

            // Remove optimistic flag
            setFolders(prev => prev.map(f =>
                f.id === folderId ? { ...f, _optimistic: false } : f
            ));

            clearCache();
            if (onRefreshNeeded) onRefreshNeeded();
            updateToast(toastId, 'Folder renamed!', 'success');
        } catch (error) {
            // 4. Rollback on error
            setFolders(prev => prev.map(f =>
                f.id === folderId ? { ...f, name: oldName, _optimistic: false } : f
            ));
            updateToast(toastId, 'Failed to rename folder', 'error');
            console.error('Rename folder error:', error);
        }
    };

    const handleDeleteFolder = async (folderId) => {
        if (!confirm('Delete this folder and all its contents?')) return;

        // 1. Save current state for rollback
        const currentFolders = [...folders];

        // 2. Remove from UI IMMEDIATELY
        setFolders(prev => prev.filter(f => f.id !== folderId));

        // 3. Show toast notification
        const toastId = showToast('Deleting folder...', 'info', 0);

        // 4. Send to server in background
        try {
            await foldersAPI.deleteFolder(folderId);

            clearCache();
            if (onRefreshNeeded) onRefreshNeeded();
            updateToast(toastId, 'Folder deleted', 'success');
        } catch (error) {
            // 5. Rollback on error
            setFolders(currentFolders);
            updateToast(toastId, 'Failed to delete folder', 'error');
            console.error('Delete folder error:', error);
        }
    };

    const handleDeleteDocument = async (documentId) => {
        if (!confirm('Delete this document?')) return;

        // 1. Save current state for rollback
        const currentFolders = [...folders];

        // 2. Remove from UI IMMEDIATELY
        setFolders(prev => prev.filter(f => f.id !== documentId));

        // 3. Show toast notification
        const toastId = showToast('Deleting document...', 'info', 0);

        // 4. Send to server in background
        try {
            await foldersAPI.deleteDocument(documentId);

            clearCache();
            if (onRefreshNeeded) onRefreshNeeded();
            updateToast(toastId, 'Document deleted', 'success');
        } catch (error) {
            // 5. Rollback on error
            setFolders(currentFolders);
            updateToast(toastId, 'Failed to delete document', 'error');
            console.error('Delete document error:', error);
        }
    };

    const handleUpdateDocumentRevision = async () => {
        if (!newRevisionNumber.trim()) {
            alert('Revision number cannot be empty');
            return;
        }

        const documentId = editDocumentTarget.id;
        const oldRevisionNumber = editDocumentTarget.revisionNumber;

        // 1. Update UI IMMEDIATELY
        setFolders(prev => prev.map(f =>
            f.id === documentId ? { ...f, revisionNumber: newRevisionNumber, _optimistic: true } : f
        ));

        setNewRevisionNumber('');
        setEditDocumentTarget(null);
        setShowEditDocumentModal(false);

        // 2. Show toast
        const toastId = showToast('Updating revision...', 'info', 0);

        // 3. Send to server in background
        try {
            await foldersAPI.updateDocumentRevision(documentId, newRevisionNumber);

            // Remove optimistic flag
            setFolders(prev => prev.map(f =>
                f.id === documentId ? { ...f, _optimistic: false } : f
            ));

            clearCache();
            if (onRefreshNeeded) onRefreshNeeded();
            updateToast(toastId, 'Revision updated!', 'success');
        } catch (error) {
            // 4. Rollback on error
            setFolders(prev => prev.map(f =>
                f.id === documentId ? { ...f, revisionNumber: oldRevisionNumber, _optimistic: false } : f
            ));
            updateToast(toastId, 'Failed to update revision', 'error');
            console.error('Update revision error:', error);
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
        setContextMenu({ x: e.clientX, y: e.clientY, item });
    };

    const handleEmptySpaceContextMenu = (e) => {
        // Only trigger if clicking on the grid/list container itself, not on items
        if (e.target.classList.contains('items-grid') || e.target.classList.contains('items-list')) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, item: null, isEmptySpace: true });
        }
    };

    const handleSort = (field) => {
        if (sortField === field) {
            // Toggle direction if clicking the same field
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // New field, default to ascending
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const getSortedFolders = useCallback(() => {
        const sorted = [...folders].sort((a, b) => {
            // Always show folders before documents
            if (!a.isDocument && b.isDocument) return -1;
            if (a.isDocument && !b.isDocument) return 1;

            let aValue, bValue;

            switch (sortField) {
                case 'name':
                    aValue = a.isDocument ? formatRevisionNumber(a.revisionNumber) : a.name;
                    bValue = b.isDocument ? formatRevisionNumber(b.revisionNumber) : b.name;
                    break;
                case 'revision':
                    // Numeric sort for revision numbers
                    aValue = a.isDocument ? (a.revisionNumber || 0) : 0;
                    bValue = b.isDocument ? (b.revisionNumber || 0) : 0;
                    break;
                case 'owner':
                    aValue = a.ownerName || (a.userId ? a.userId.slice(0, 8) : 'Unknown');
                    bValue = b.ownerName || (b.userId ? b.userId.slice(0, 8) : 'Unknown');
                    break;
                case 'modified':
                    aValue = new Date(a.updatedAt || a.createdAt).getTime();
                    bValue = new Date(b.updatedAt || b.createdAt).getTime();
                    break;
                case 'size':
                    aValue = a.isDocument ? (a.totalFileSize || 0) : 0;
                    bValue = b.isDocument ? (b.totalFileSize || 0) : 0;
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return sorted;
    }, [folders, sortField, sortDirection]);

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
                        <UploadIcon size={16} /> Upload Document
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
                        <div className="list-header" ref={headerRef} style={{ gridTemplateColumns }}>
                            <div className="list-header-icon"></div>
                            <div
                                className={`list-header-cell sortable ${sortField === 'name' ? 'active' : ''}`}
                                onClick={() => handleSort('name')}
                                data-col-key="name"
                            >
                                <span>Name</span>
                                {sortField === 'name' && (
                                    <span className="sort-arrow">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                )}
                                <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, 0)} onDoubleClick={handleResetColWidths} />
                            </div>
                            <div
                                className={`list-header-cell sortable ${sortField === 'revision' ? 'active' : ''}`}
                                onClick={() => handleSort('revision')}
                                data-col-key="revision"
                            >
                                <span>Revision</span>
                                {sortField === 'revision' && (
                                    <span className="sort-arrow">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                )}
                                <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, 1)} onDoubleClick={handleResetColWidths} />
                            </div>
                            <div
                                className={`list-header-cell sortable ${sortField === 'owner' ? 'active' : ''}`}
                                onClick={() => handleSort('owner')}
                                data-col-key="owner"
                            >
                                <span>Owner</span>
                                {sortField === 'owner' && (
                                    <span className="sort-arrow">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                )}
                                <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, 2)} onDoubleClick={handleResetColWidths} />
                            </div>
                            <div
                                className={`list-header-cell sortable ${sortField === 'modified' ? 'active' : ''}`}
                                onClick={() => handleSort('modified')}
                                data-col-key="modified"
                            >
                                <span>Date Modified</span>
                                {sortField === 'modified' && (
                                    <span className="sort-arrow">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                )}
                                <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, 3)} onDoubleClick={handleResetColWidths} />
                            </div>
                            <div
                                className={`list-header-cell sortable ${sortField === 'size' ? 'active' : ''}`}
                                onClick={() => handleSort('size')}
                                data-col-key="size"
                            >
                                <span>File Size</span>
                                {sortField === 'size' && (
                                    <span className="sort-arrow">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                                )}
                            </div>
                            <div className="list-header-actions"></div>
                        </div>
                    )}
                    <div
                        className={viewMode === 'grid' ? 'items-grid' : 'items-list'}
                        onContextMenu={handleEmptySpaceContextMenu}
                    >
                        {getSortedFolders().map(item => (
                        viewMode === 'grid' ? (
                            <div
                                key={item.id}
                                className={`item-card ${item.isDocument ? 'document' : 'folder'}`}
                                onDoubleClick={() => !item.isDocument && handleFolderClick(item.id)}
                                onContextMenu={(e) => handleContextMenu(e, item)}
                            >
                                <div className="item-icon">
                                    {item.isDocument ? <DocumentIcon size={32} /> : <FolderIcon size={32} />}
                                </div>
                                <div className="item-name">
                                    {item.isDocument
                                        ? (item.essDesignIssueName || item.thirdPartyDesignName || formatRevisionNumber(item.revisionNumber))
                                        : item.name
                                    }
                                </div>
                                {item.isDocument && (
                                    <div className="document-files">
                                        {item.essDesignIssuePath && (
                                            <button
                                                onClick={() => handleViewPDF(item, 'ess')}
                                                className="file-btn"
                                                title="View in ESS design"
                                            >
                                                ESS
                                            </button>
                                        )}
                                        {item.thirdPartyDesignPath && (
                                            <button
                                                onClick={() => handleViewPDF(item, 'thirdparty')}
                                                className="file-btn"
                                                title="Download Third-Party version"
                                            >
                                                3rd
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div
                                key={item.id}
                                className={`list-item ${item.isDocument ? 'document' : 'folder'}`}
                                style={{ gridTemplateColumns }}
                                onDoubleClick={() => !item.isDocument && handleFolderClick(item.id)}
                                onContextMenu={(e) => handleContextMenu(e, item)}
                            >
                                <div className="list-item-icon">
                                    {item.isDocument ? <DocumentIcon size={20} /> : <FolderIcon size={20} />}
                                </div>
                                <div className="list-item-name">
                                    {item.isDocument
                                        ? (item.essDesignIssueName || item.thirdPartyDesignName || 'Document')
                                        : (item.name || 'Folder')
                                    }
                                </div>
                                <div className="list-item-revision">
                                    {item.isDocument ? formatRevisionNumber(item.revisionNumber) : ''}
                                </div>
                                <div className="list-item-owner">
                                    {item.ownerName || (item.userId ? item.userId.slice(0, 8) + '...' : 'Unknown')}
                                </div>
                                <div className="list-item-modified">
                                    {formatDate(item.updatedAt || item.createdAt)}
                                </div>
                                <div className="list-item-size">
                                    {item.isDocument ? formatFileSize(item.totalFileSize) : '—'}
                                </div>
                                <div className="list-item-actions">
                                    {item.isDocument ? (
                                        <>
                                            {item.essDesignIssuePath ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleViewPDF(item, 'ess');
                                                    }}
                                                    className="file-btn-small"
                                                    title="View in ESS design"
                                                >
                                                    ESS
                                                </button>
                                            ) : (
                                                <div className="file-btn-placeholder"></div>
                                            )}
                                            {item.thirdPartyDesignPath ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleViewPDF(item, 'thirdparty');
                                                    }}
                                                    className="file-btn-small"
                                                    title="Download Third-Party version"
                                                >
                                                    3rd
                                                </button>
                                            ) : (
                                                <div className="file-btn-placeholder"></div>
                                            )}
                                        </>
                                    ) : null}
                                </div>
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
                            <FolderPlusIcon size={14} /> New Folder
                        </div>
                    )}
                    {contextMenu.item && !contextMenu.item.isDocument && (
                        <>
                            <div onClick={() => {
                                setNewFolderParent(contextMenu.item.id);
                                setShowNewFolderModal(true);
                                setContextMenu(null);
                            }}>
                                <FolderPlusIcon size={14} /> New Subfolder
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
                        <>
                            <div onClick={() => {
                                setEditDocumentTarget(contextMenu.item);
                                setNewRevisionNumber(contextMenu.item.revisionNumber);
                                setShowEditDocumentModal(true);
                                setContextMenu(null);
                            }}>
                                ✏️ Edit Revision
                            </div>
                            <div className="context-menu-divider"></div>
                            <div onClick={() => {
                                handleDeleteDocument(contextMenu.item.id);
                                setContextMenu(null);
                            }}>
                                🗑️ Delete
                            </div>
                        </>
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

            {showEditDocumentModal && (
                <div className="modal-overlay" onClick={() => setShowEditDocumentModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Edit Document Revision</h3>
                        <input
                            type="text"
                            value={newRevisionNumber}
                            onChange={(e) => setNewRevisionNumber(e.target.value)}
                            placeholder="Enter revision number"
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button onClick={() => setShowEditDocumentModal(false)}>Cancel</button>
                            <button onClick={handleUpdateDocumentRevision}>Update</button>
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
                        if (onRefreshNeeded) onRefreshNeeded();
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
