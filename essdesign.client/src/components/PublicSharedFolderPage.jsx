import React, { useEffect, useMemo, useState } from 'react';
import { foldersAPI, resolveProfileImageUrl } from '../services/api';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

const FolderIcon = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M10 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2Z" fill="currentColor" />
    </svg>
);

const DocumentIcon = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" fill="currentColor" />
        <path d="M14 2v6h6" fill="#f87171" />
    </svg>
);

const DownloadIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
    </svg>
);

const OpenIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
);

const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${sizes[index]}`;
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const formatRevision = (revisionNumber) => `Rev ${String(revisionNumber || '00').padStart(2, '0')}`;

const getDocumentName = (document) => document.displayName || document.essDesignIssueName || document.thirdPartyDesignName || 'Design file';

const getDocumentStatus = (document) => document.drawingStatus || 'Construction';

const getOwnerInitials = (name) => {
    if (!name) return 'ES';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
};

const ownerAvatarCache = new Map();

function OwnerAvatar({ item }) {
    const ownerId = item?.userId || '';
    const [avatarUrl, setAvatarUrl] = useState(() => ownerAvatarCache.get(ownerId) || '');

    useEffect(() => {
        let cancelled = false;

        if (!ownerId) {
            setAvatarUrl('');
            return undefined;
        }

        if (ownerAvatarCache.has(ownerId)) {
            setAvatarUrl(ownerAvatarCache.get(ownerId) || '');
            return undefined;
        }

        resolveProfileImageUrl(ownerId)
            .then((url) => {
                ownerAvatarCache.set(ownerId, url || '');
                if (!cancelled) setAvatarUrl(url || '');
            })
            .catch(() => {
                ownerAvatarCache.set(ownerId, '');
                if (!cancelled) setAvatarUrl('');
            });

        return () => {
            cancelled = true;
        };
    }, [ownerId]);

    return (
        <b className={avatarUrl ? 'has-image' : ''}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : getOwnerInitials(item?.ownerName)}
        </b>
    );
}

const countImmediateItems = (folder) => (folder?.subFolders?.length || 0) + (folder?.documents?.length || 0);

const buildFolderMap = (root) => {
    const map = new Map();

    const visit = (folder, parentId = null, path = []) => {
        if (!folder) return;
        const enriched = {
            ...folder,
            parentId,
            path: [...path, { id: folder.id, name: folder.name }]
        };
        map.set(folder.id, enriched);
        (folder.subFolders || []).forEach(child => visit(child, folder.id, enriched.path));
    };

    visit(root);
    return map;
};

export default function PublicSharedFolderPage({ folderId, token }) {
    const [folder, setFolder] = useState(null);
    const [currentFolderId, setCurrentFolderId] = useState(folderId);
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const folderMap = useMemo(() => buildFolderMap(folder), [folder]);
    const currentFolder = folderMap.get(currentFolderId) || folder;
    const breadcrumbs = currentFolder?.path || [];

    const visibleItems = useMemo(() => {
        const folders = (currentFolder?.subFolders || []).map(item => ({ ...item, isFolder: true }));
        const documents = (currentFolder?.documents || []).map(item => ({ ...item, isDocument: true }));
        return [...folders, ...documents];
    }, [currentFolder]);

    useEffect(() => {
        let cancelled = false;

        const loadFolder = async (showSpinner = false) => {
            if (!folderId || !token) {
                setError('This design file link is incomplete.');
                setLoading(false);
                return;
            }

            if (showSpinner) setLoading(true);
            setError('');

            try {
                const data = await foldersAPI.getPublicSharedFolder(folderId, token);
                if (!cancelled) {
                    setFolder(data);
                    setCurrentFolderId(previous => previous || data.id);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError.response?.data?.error || 'This design file link is invalid or has expired.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadFolder(true);

        return () => {
            cancelled = true;
        };
    }, [folderId, token]);

    useEffect(() => {
        if (folder && !folderMap.has(currentFolderId)) {
            setCurrentFolderId(folder.id);
            setSelectedDocument(null);
        }
    }, [folder, folderMap, currentFolderId]);

    const openDocument = (document) => {
        const url = foldersAPI.resolvePublicFileUrl(document.essDesignUrl || document.thirdPartyDesignUrl || '');
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const navigateToFolder = (targetFolderId) => {
        setCurrentFolderId(targetFolderId);
        setSelectedDocument(null);
    };

    if (loading) {
        return (
            <main className="public-share-page public-share-page-state">
                <div className="loading-screen">
                    <div className="loading-brandmark" aria-label="Loading design files">
                        <div className="loading-ring" />
                        <img className="loading-logo" src={LOGO_URL} alt="ErectSafe Scaffolding" />
                    </div>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="public-share-page public-share-page-state">
                <section className="public-share-panel public-share-error">
                    <img src={LOGO_URL} alt="ErectSafe Scaffolding" />
                    <h1>Unable to open design files</h1>
                    <p>{error}</p>
                </section>
            </main>
        );
    }

    return (
        <main className={`public-share-page ess-public-docs${selectedDocument ? ' has-details' : ''}`}>
            <header className="public-docs-topbar">
                <img src={LOGO_URL} alt="ErectSafe Scaffolding" />
            </header>

            <section className="public-docs-shell">
                <div className="public-docs-main">
                    <div className="public-docs-toolbar">
                        <nav className="public-docs-breadcrumbs" aria-label="Folder path">
                            {breadcrumbs.map((crumb, index) => (
                                <React.Fragment key={crumb.id}>
                                    {index > 0 && <span>/</span>}
                                    <button type="button" onClick={() => navigateToFolder(crumb.id)}>
                                        {index === 0 ? 'Home' : crumb.name}
                                    </button>
                                </React.Fragment>
                            ))}
                        </nav>
                    </div>

                    <div className="public-docs-table" role="table" aria-label="Shared ESS Design files">
                        <div className="public-docs-table-head" role="row">
                            <span>Name</span>
                            <span>Revision</span>
                            <span>Status</span>
                            <span>Owner</span>
                            <span>Modified</span>
                            <span>Size</span>
                            <span>Files</span>
                            <span>Actions</span>
                        </div>
                        <div className="public-docs-table-body">
                            {visibleItems.map(item => (
                                <div
                                    key={`${item.isFolder ? 'folder' : 'document'}-${item.id}`}
                                    tabIndex={0}
                                    className={`public-docs-row${selectedDocument?.id === item.id ? ' selected' : ''}`}
                                    onClick={() => item.isFolder ? navigateToFolder(item.id) : setSelectedDocument(item)}
                                    onDoubleClick={() => item.isDocument && openDocument(item)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            item.isFolder ? navigateToFolder(item.id) : openDocument(item);
                                        }
                                    }}
                                    role="row"
                                >
                                    <span className={`public-docs-name ${item.isFolder ? 'folder' : 'document'}`}>
                                        {item.isFolder ? <FolderIcon /> : <DocumentIcon />}
                                        <span>{item.isFolder ? item.name : getDocumentName(item)}</span>
                                    </span>
                                    <span>{item.isDocument ? formatRevision(item.revisionNumber) : ''}</span>
                                    <span>{item.isDocument ? <em>{getDocumentStatus(item)}</em> : ''}</span>
                                    <span className="public-docs-owner">
                                        <OwnerAvatar item={item} />
                                        {item.ownerName || '-'}
                                    </span>
                                    <span>{formatDate(item.updatedAt)}</span>
                                    <span>{item.isDocument ? formatFileSize(item.totalFileSize) : formatFileSize(item.fileSize)}</span>
                                    <span>{item.isFolder ? `${countImmediateItems(item)} item${countImmediateItems(item) === 1 ? '' : 's'}` : ''}</span>
                                    <span className="public-docs-actions">
                                        {item.isDocument ? (
                                            <a href={foldersAPI.resolvePublicFileUrl(item.essDesignUrl || item.thirdPartyDesignUrl || '')} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
                                                <OpenIcon />
                                                Open
                                            </a>
                                        ) : (
                                            <span>Open folder</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                            {visibleItems.length === 0 && (
                                <div className="public-docs-empty">
                                    <strong>No shared files here</strong>
                                    <span>This folder is currently empty.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {selectedDocument && (
                    <aside className="public-docs-details" aria-label="File details">
                        <div className="public-docs-details-head">
                            <div>
                                <h2>{getDocumentName(selectedDocument)}</h2>
                                <p>{formatRevision(selectedDocument.revisionNumber)} - {getDocumentStatus(selectedDocument)}</p>
                            </div>
                            <button type="button" onClick={() => setSelectedDocument(null)} aria-label="Close details">x</button>
                        </div>
                        <div className="public-docs-preview">
                            <DocumentIcon size={80} />
                            <span>PDF</span>
                        </div>
                        <dl>
                            <div><dt>Revision</dt><dd>{formatRevision(selectedDocument.revisionNumber)}</dd></div>
                            <div><dt>Status</dt><dd>{getDocumentStatus(selectedDocument)}</dd></div>
                            <div><dt>File Size</dt><dd>{formatFileSize(selectedDocument.totalFileSize)}</dd></div>
                            <div><dt>Owner</dt><dd className="public-docs-owner-detail"><OwnerAvatar item={selectedDocument} />{selectedDocument.ownerName || '-'}</dd></div>
                            <div><dt>Modified</dt><dd>{formatDate(selectedDocument.updatedAt)}</dd></div>
                        </dl>
                        {selectedDocument.description && (
                            <section>
                                <h3>Change Notes</h3>
                                <p>{selectedDocument.description}</p>
                            </section>
                        )}
                        <a className="public-docs-primary-action" href={foldersAPI.resolvePublicFileUrl(selectedDocument.essDesignUrl || selectedDocument.thirdPartyDesignUrl || '')} target="_blank" rel="noopener noreferrer">
                            <DownloadIcon />
                            Open PDF
                        </a>
                    </aside>
                )}
            </section>
        </main>
    );
}
