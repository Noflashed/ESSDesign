import React, { useState, useEffect } from 'react';
import { foldersAPI } from '../services/api';
import './Sidebar.css';

function Sidebar({ onFolderSelect, currentFolderId }) {
    const [folders, setFolders] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadFolders();
    }, []);

    const loadFolders = async () => {
        try {
            const data = await foldersAPI.getRootFolders();
            // Recursively load all subfolders
            const foldersWithChildren = await Promise.all(
                data.map(folder => loadFolderRecursive(folder))
            );
            setFolders(foldersWithChildren);
        } catch (error) {
            console.error('Error loading folders:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadFolderRecursive = async (folder) => {
        if (!folder.subFolders || folder.subFolders.length === 0) {
            return folder;
        }

        // Load full data for each subfolder
        const subFoldersWithChildren = await Promise.all(
            folder.subFolders.map(async (subfolder) => {
                const fullSubFolder = await foldersAPI.getFolder(subfolder.id);
                return loadFolderRecursive(fullSubFolder);
            })
        );

        return {
            ...folder,
            subFolders: subFoldersWithChildren
        };
    };

    const toggleFolder = (folderId) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(folderId)) {
            newExpanded.delete(folderId);
        } else {
            newExpanded.add(folderId);
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
                                toggleFolder(folder.id);
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
