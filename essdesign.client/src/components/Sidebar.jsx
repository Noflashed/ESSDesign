import React, { useState, useEffect, useCallback } from 'react';
import { foldersAPI } from '../services/api';
import './Sidebar.css';

function Sidebar({ onFolderSelect, currentFolderId, refreshTrigger, width = 280, onResize, onDocumentClick }) {
    const [folders, setFolders] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [loadedFolders, setLoadedFolders] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [contextMenu, setContextMenu] = useState(null);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParent, setNewFolderParent] = useState(null);
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        loadRootFolders();
    }, [refreshTrigger]);

    const loadRootFolders = async () => {
        try {
            setLoading(true);
            const data = await foldersAPI.getRootFolders();

            // Initialize folders with subFolders arrays (even if empty)
            const initializedFolders = data.map(folder => ({
                ...folder,
                subFolders: folder.subFolders || [],
                documents: folder.documents || []
            }));

            setFolders(initializedFolders);

            // Mark root folders as loaded (but not their children)
            const folderMap = new Map();
            initializedFolders.forEach(folder => {
                // Don't mark as fully loaded - we haven't loaded subfolders' children yet
                folderMap.set(folder.id, { loaded: false });
            });
            setLoadedFolders(folderMap);
        } catch (error) {
            console.error('Error loading folders:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadSubFolders = useCallback(async (folderId) => {
        try {
            const folderData = await foldersAPI.getFolder(folderId);

            // Update the folder's subfolders AND documents in the tree
            setFolders(prev => updateFolderInTree(prev, folderId, folderData.subFolders || [], folderData.documents || []));

            // Mark as loaded in cache with the actual data
            setLoadedFolders(prev => {
                const newMap = new Map(prev);
                newMap.set(folderId, {
                    loaded: true,
                    hasChildren: (folderData.subFolders && folderData.subFolders.length > 0) ||
                        (folderData.documents && folderData.documents.length > 0)
                });
                return newMap;
            });
        } catch (error) {
            console.error('Error loading subfolders:', error);
            // Mark as loaded even on error to prevent infinite retry
            setLoadedFolders(prev => {
                const newMap = new Map(prev);
                newMap.set(folderId, { loaded: true, hasChildren: false });
                return newMap;
            });
        }
    }, []);

    const updateFolderInTree = (items, folderId, subFolders, documents) => {
        return items.map(item => {
            if (item.id === folderId) {
                return { ...item, subFolders, documents };
            }
            if (item.subFolders && item.subFolders.length > 0) {
                return { ...item, subFolders: updateFolderInTree(item.subFolders, folderId, subFolders, documents) };
            }
            return item;
        });
    };

    const toggleFolder = async (folderId) => {
        const newExpanded = new Set(expandedFolders);

        if (newExpanded.has(folderId)) {
            // Collapse
            newExpanded.delete(folderId);
        } else {
            // Expand
            newExpanded.add(folderId);

            // Load subfolders if not already loaded
            const cached = loadedFolders.get(folderId);
            if (!cached?.loaded) {
                await loadSubFolders(folderId);
            }
        }

        setExpandedFolders(newExpanded);
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;

        try {
            const newFolder = await foldersAPI.createFolder(newFolderName, newFolderParent);

            if (!newFolder || !newFolder.id) {
                throw new Error('Invalid folder response');
            }

            // Close modal
            setNewFolderName('');
            setNewFolderParent(null);
            setShowNewFolderModal(false);

            // Add folder to tree
            if (newFolderParent === null) {
                // Add to root
                setFolders(prev => [newFolder, ...prev]);
            } else {
                // Add to parent's subfolders
                setFolders(prev => addFolderToTree(prev, newFolderParent, newFolder));
                // Expand parent to show new folder
                setExpandedFolders(prev => new Set([...prev, newFolderParent]));
            }

            // Clear cache for parent
            setLoadedFolders(prev => {
                const newMap = new Map(prev);
                newMap.delete(newFolderParent);
                return newMap;
            });

        } catch (error) {
            console.error('Create folder error:', error);
            alert('Failed to create folder');
            loadRootFolders(); // Reload on error
        }
    };

    const addFolderToTree = (items, parentId, newFolder) => {
        return items.map(item => {
            if (item.id === parentId) {
                const subFolders = item.subFolders || [];
                return { ...item, subFolders: [newFolder, ...subFolders] };
            }
            if (item.subFolders && item.subFolders.length > 0) {
                return { ...item, subFolders: addFolderToTree(item.subFolders, parentId, newFolder) };
            }
            return item;
        });
    };

    const handleContextMenu = (e, folder) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.pageX, y: e.pageY, folder });
    };

    // Close context menu on click anywhere
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    // Handle sidebar resize
    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;

            const newWidth = e.clientX;
            if (newWidth >= 200 && newWidth <= 600) {
                onResize && onResize(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, onResize]);

    const renderFolder = (folder, level = 0) => {
        const isExpanded = expandedFolders.has(folder.id);
        const hasSubFolders = folder.subFolders && folder.subFolders.length > 0;
        const hasDocuments = folder.documents && folder.documents.length > 0;
        const hasChildren = hasSubFolders || hasDocuments;
        const isSelected = currentFolderId === folder.id;

        // Check if this folder has been loaded from server
        const isLoaded = loadedFolders.get(folder.id)?.loaded;

        return (
            <div key={folder.id} className="folder-item">
                <div
                    className={`folder-row ${isSelected ? 'selected' : ''}`}
                    style={{ paddingLeft: `${level * 20 + 12}px` }}
                    onClick={() => onFolderSelect(folder.id)}
                    onContextMenu={(e) => handleContextMenu(e, folder)}
                >
                    <span
                        className={`folder-arrow ${isExpanded ? 'expanded' : ''} ${isLoaded && !hasChildren ? 'empty' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFolder(folder.id);
                        }}
                    >
                        ▶
                    </span>
                    <span className="folder-icon">📁</span>
                    <span className="folder-name">{folder.name}</span>
                </div>
                {isExpanded && hasChildren && (
                    <div className="folder-children">
                        {/* Render subfolders first */}
                        {hasSubFolders && folder.subFolders.map(subfolder => renderFolder(subfolder, level + 1))}

                        {/* Render documents */}
                        {hasDocuments && folder.documents.map(doc => (
                            <div
                                key={doc.id}
                                className="document-row"
                                style={{ paddingLeft: `${(level + 1) * 20 + 12}px` }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onDocumentClick) {
                                        onDocumentClick(doc);
                                    }
                                }}
                                title={`Rev ${doc.revisionNumber} - Click to view PDF`}
                            >
                                <span className="document-spacer"></span>
                                <span className="document-icon">📄</span>
                                <span className="document-name">Rev {doc.revisionNumber}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="sidebar" style={{ width: `${width}px` }}>
            <div className="sidebar-header">
                <button
                    className="home-button"
                    onClick={() => onFolderSelect(null)}
                >
                    🏠 Home
                </button>
                <button
                    className="new-folder-button"
                    onClick={() => {
                        setNewFolderParent(null);
                        setShowNewFolderModal(true);
                    }}
                    title="New root folder"
                >
                    ➕
                </button>
            </div>

            <div className="sidebar-content">
                {loading ? (
                    <div className="sidebar-loading">Loading...</div>
                ) : folders.length === 0 ? (
                    <div className="sidebar-empty">No folders yet</div>
                ) : (
                    folders.map(folder => renderFolder(folder))
                )}
            </div>

            {/* Resize handle */}
            <div
                className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''}`}
                onMouseDown={handleMouseDown}
            />

            {contextMenu && (
                <div
                    className="sidebar-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div onClick={() => {
                        setNewFolderParent(contextMenu.folder.id);
                        setShowNewFolderModal(true);
                        setContextMenu(null);
                    }}>
                        📁 New Subfolder
                    </div>
                </div>
            )}

            {showNewFolderModal && (
                <div className="modal-overlay" onClick={() => {
                    setShowNewFolderModal(false);
                    setNewFolderParent(null);
                    setNewFolderName('');
                }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>{newFolderParent ? 'New Subfolder' : 'New Folder'}</h3>
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
                                setNewFolderName('');
                            }}>Cancel</button>
                            <button onClick={handleCreateFolder}>Create</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Sidebar;
