import React, { useState, useEffect, useCallback } from 'react';
import { foldersAPI } from '../services/api';
import './Sidebar.css';

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

const FolderPlusIcon = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        <line x1="12" y1="11" x2="12" y2="17"></line>
        <line x1="9" y1="14" x2="15" y2="14"></line>
    </svg>
);

function Sidebar({ onFolderSelect, currentFolderId, refreshTrigger, width = 280, onResize, onDocumentClick }) {
    const [folders, setFolders] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [loadedFolders, setLoadedFolders] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [contextMenu, setContextMenu] = useState(null);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParent, setNewFolderParent] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);
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

    const handleRenameFolder = async () => {
        if (!newFolderName.trim() || !renameTarget) return;

        try {
            await foldersAPI.renameFolder(renameTarget.id, newFolderName);

            // Update folder in tree
            setFolders(prev => renameFolderInTree(prev, renameTarget.id, newFolderName));

            // Close modal
            setNewFolderName('');
            setRenameTarget(null);
            setShowRenameModal(false);

            // Clear cache
            setLoadedFolders(prev => {
                const newMap = new Map(prev);
                newMap.delete(renameTarget.id);
                return newMap;
            });

        } catch (error) {
            console.error('Rename folder error:', error);
            alert('Failed to rename folder');
            loadRootFolders(); // Reload on error
        }
    };

    const handleDeleteFolder = async (folderId) => {
        if (!confirm('Delete this folder and all its contents?')) return;

        try {
            await foldersAPI.deleteFolder(folderId);

            // Remove folder from tree
            setFolders(prev => removeFolderFromTree(prev, folderId));

            // Clear cache
            setLoadedFolders(prev => {
                const newMap = new Map(prev);
                newMap.delete(folderId);
                return newMap;
            });

            // If we're currently viewing the deleted folder, go to home
            if (currentFolderId === folderId) {
                onFolderSelect(null);
            }

        } catch (error) {
            console.error('Delete folder error:', error);
            alert('Failed to delete folder');
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

    const renameFolderInTree = (items, folderId, newName) => {
        return items.map(item => {
            if (item.id === folderId) {
                return { ...item, name: newName };
            }
            if (item.subFolders && item.subFolders.length > 0) {
                return { ...item, subFolders: renameFolderInTree(item.subFolders, folderId, newName) };
            }
            return item;
        });
    };

    const removeFolderFromTree = (items, folderId) => {
        return items
            .filter(item => item.id !== folderId)
            .map(item => {
                if (item.subFolders && item.subFolders.length > 0) {
                    return { ...item, subFolders: removeFolderFromTree(item.subFolders, folderId) };
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
                    <span className="folder-icon"><FolderIcon size={16} /></span>
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
                                title={`Revision ${doc.revisionNumber} - Click to view PDF`}
                            >
                                <span className="document-spacer"></span>
                                <span className="document-icon"><DocumentIcon size={14} /></span>
                                <span className="document-name">Revision {doc.revisionNumber}</span>
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
                        <FolderPlusIcon size={14} /> New Subfolder
                    </div>
                    <div className="context-menu-divider"></div>
                    <div onClick={() => {
                        setRenameTarget(contextMenu.folder);
                        setNewFolderName(contextMenu.folder.name);
                        setShowRenameModal(true);
                        setContextMenu(null);
                    }}>
                        ✏️ Rename
                    </div>
                    <div onClick={() => {
                        handleDeleteFolder(contextMenu.folder.id);
                        setContextMenu(null);
                    }}>
                        🗑️ Delete
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

            {showRenameModal && (
                <div className="modal-overlay" onClick={() => {
                    setShowRenameModal(false);
                    setRenameTarget(null);
                    setNewFolderName('');
                }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Rename Folder</h3>
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Folder name"
                            autoFocus
                            onKeyPress={(e) => e.key === 'Enter' && handleRenameFolder()}
                        />
                        <div className="modal-actions">
                            <button onClick={() => {
                                setShowRenameModal(false);
                                setRenameTarget(null);
                                setNewFolderName('');
                            }}>Cancel</button>
                            <button onClick={handleRenameFolder}>Rename</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Sidebar;
