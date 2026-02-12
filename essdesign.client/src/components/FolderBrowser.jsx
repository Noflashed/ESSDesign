import React, { useState, useEffect } from 'react';
import { foldersAPI } from '../services/api';
import UploadDocumentModal from './UploadDocumentModal';
import './FolderBrowser.css';

function FolderBrowser() {
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

    useEffect(() => {
        loadCurrentFolder();
    }, [currentFolder]);

    const loadCurrentFolder = async () => {
        setLoading(true);
        try {
            if (currentFolder === null) {
                const data = await foldersAPI.getRootFolders();
                setFolders(data);
                setBreadcrumbs([]);
            } else {
                const data = await foldersAPI.getFolder(currentFolder);
                setFolders([...data.subFolders, ...data.documents.map(d => ({ ...d, isDocument: true }))]);
                const crumbs = await foldersAPI.getBreadcrumbs(currentFolder);
                setBreadcrumbs(crumbs);
            }
        } catch (error) {
            console.error('Error loading folder:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folderId) => {
        setCurrentFolder(folderId);
    };

    const handleBreadcrumbClick = (folderId) => {
        setCurrentFolder(folderId || null);
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            await foldersAPI.createFolder(newFolderName, currentFolder);
            setNewFolderName('');
            setShowNewFolderModal(false);
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
            loadCurrentFolder();
        } catch (error) {
            alert('Failed to rename folder');
        }
    };

    const handleDeleteFolder = async (folderId) => {
        if (!confirm('Delete this folder and all its contents?')) return;
        try {
            await foldersAPI.deleteFolder(folderId);
            loadCurrentFolder();
        } catch (error) {
            alert('Failed to delete folder');
        }
    };

    const handleDeleteDocument = async (documentId) => {
        if (!confirm('Delete this document?')) return;
        try {
            await foldersAPI.deleteDocument(documentId);
            loadCurrentFolder();
        } catch (error) {
            alert('Failed to delete document');
        }
    };

    const handleDownload = async (documentId, type) => {
        try {
            const url = await foldersAPI.getDownloadUrl(documentId, type);
            window.open(url, '_blank');
        } catch (error) {
            alert('Failed to download file');
        }
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
                {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.id}>
                        <span className="breadcrumb-sep">/</span>
                        <span className="breadcrumb" onClick={() => handleBreadcrumbClick(crumb.id)}>
                            {crumb.name}
                        </span>
                    </React.Fragment>
                ))}
            </div>

            {loading ? (
                <div className="loading">Loading...</div>
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
                                        <button onClick={() => handleDownload(item.id, 'ess')} className="file-btn">
                                            ESS Design
                                        </button>
                                    )}
                                    {item.thirdPartyDesignPath && (
                                        <button onClick={() => handleDownload(item.id, 'thirdparty')} className="file-btn">
                                            Third-Party
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
                        loadCurrentFolder();
                    }}
                />
            )}
        </div>
    );
}

export default FolderBrowser;
