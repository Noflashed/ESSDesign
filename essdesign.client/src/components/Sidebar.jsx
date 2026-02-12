import React, { useState, useEffect, useCallback } from 'react';
import { foldersAPI } from '../services/api';
import './Sidebar.css';

function Sidebar({ onFolderSelect, currentFolderId, refreshTrigger }) {
    const [folders, setFolders] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [loadedFolders, setLoadedFolders] = useState(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRootFolders();
    }, [refreshTrigger]);

    const loadRootFolders = async () => {
        try {
            setLoading(true);
            const data = await foldersAPI.getRootFolders();
            setFolders(data);
            
            // Cache root folders
            const folderMap = new Map();
            data.forEach(folder => {
                folderMap.set(folder.id, { ...folder, loaded: true });
            });
            setLoadedFolders(folderMap);
        } catch (error) {
            console.error('Error loading folders:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadSubFolders = useCallback(async (folderId) => {
        // Check if already loaded
        const cached = loadedFolders.get(folderId);
        if (cached?.loaded) {
            return;
        }

        try {
            const folderData = await foldersAPI.getFolder(folderId);
            
            // Update cache
            const newLoadedFolders = new Map(loadedFolders);
            newLoadedFolders.set(folderId, { ...folderData, loaded: true });
            setLoadedFolders(newLoadedFolders);

            // Update tree
            updateFolderInTree(folderId, folderData);
        } catch (error) {
            console.error('Error loading subfolders:', error);
        }
    }, [loadedFolders]);

    const updateFolderInTree = (folderId, folderData) => {
        setFolders(prev => {
            const updateRecursive = (items) => {
                return items.map(item => {
                    if (item.id === folderId) {
                        return { ...item, subFolders: folderData.subFolders || [] };
                    }
                    if (item.subFolders && item.subFolders.length > 0) {
                        return { ...item, subFolders: updateRecursive(item.subFolders) };
                    }
                    return item;
                });
            };
            return updateRecursive(prev);
        });
    };

    const toggleFolder = async (folderId, hasSubFolders) => {
        const newExpanded = new Set(expandedFolders);
        
        if (newExpanded.has(folderId)) {
            newExpanded.delete(folderId);
        } else {
            newExpanded.add(folderId);
            if (hasSubFolders) {
                await loadSubFolders(folderId);
            }
        }
        
        setExpandedFolders(newExpanded);
    };

    const renderFolder = (folder, level = 0) => {
        const isExpanded = expandedFolders.has(folder.id);
        const hasSubFolders = folder.subFolders && folder.subFolders.length > 0;
        const isSelected = currentFolderId === folder.id;

        return (
            <div key={folder.id} className="folder-item">
                <div
                    className={`folder-row ${isSelected ? 'selected' : ''}`}
                    style={{ paddingLeft: `${level * 20 + 12}px` }}
                    onClick={() => onFolderSelect(folder.id)}
                >
                    {hasSubFolders && (
                        <span
                            className={`folder-arrow ${isExpanded ? 'expanded' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleFolder(folder.id, hasSubFolders);
                            }}
                        >
                            ▶
                        </span>
                    )}
                    {!hasSubFolders && <span className="folder-spacer"></span>}
                    <span className="folder-icon">📁</span>
                    <span className="folder-name">{folder.name}</span>
                </div>
                {hasSubFolders && isExpanded && (
                    <div className="folder-children">
                        {folder.subFolders.map(subfolder => renderFolder(subfolder, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <button
                    className="home-button"
                    onClick={() => onFolderSelect(null)}
                >
                    🏠 Home
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
        </div>
    );
}

export default Sidebar;
