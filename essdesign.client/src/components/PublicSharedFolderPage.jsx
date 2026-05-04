import React, { useEffect, useMemo, useState } from 'react';
import { foldersAPI } from '../services/api';

const LOGO_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co/storage/v1/object/public/public-assets/logo.png';

function countFiles(folder) {
    if (!folder) return 0;
    return (folder.documents?.length || 0) + (folder.subFolders || []).reduce((total, child) => total + countFiles(child), 0);
}

function SharedDocumentRow({ document }) {
    const title = document.displayName || document.essDesignIssueName || document.thirdPartyDesignName || 'Design file';
    const revision = document.revisionNumber ? `Revision ${document.revisionNumber}` : 'Revision not specified';

    return (
        <article className="public-share-file">
            <div className="public-share-file-main">
                <div className="public-share-file-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                        <path d="M14 2v6h6" />
                    </svg>
                </div>
                <div>
                    <strong>{title}</strong>
                    <span>{revision}</span>
                    {document.description ? <p>{document.description}</p> : null}
                </div>
            </div>
            <div className="public-share-file-actions">
                {document.essDesignUrl ? (
                    <a href={foldersAPI.resolvePublicFileUrl(document.essDesignUrl)} target="_blank" rel="noopener noreferrer">
                        ESS PDF
                    </a>
                ) : null}
                {document.thirdPartyDesignUrl ? (
                    <a className="alt" href={foldersAPI.resolvePublicFileUrl(document.thirdPartyDesignUrl)} target="_blank" rel="noopener noreferrer">
                        Third-Party PDF
                    </a>
                ) : null}
            </div>
        </article>
    );
}

function SharedFolderTree({ folder, depth = 0 }) {
    return (
        <section className="public-share-folder" style={{ '--depth': depth }}>
            <div className="public-share-folder-title">
                <span aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z" />
                    </svg>
                </span>
                <strong>{folder.name}</strong>
            </div>
            <div className="public-share-folder-body">
                {(folder.documents || []).map((document) => (
                    <SharedDocumentRow key={document.id} document={document} />
                ))}
                {(folder.subFolders || []).map((subfolder) => (
                    <SharedFolderTree key={subfolder.id} folder={subfolder} depth={depth + 1} />
                ))}
            </div>
        </section>
    );
}

export default function PublicSharedFolderPage({ folderId, token }) {
    const [folder, setFolder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const fileCount = useMemo(() => countFiles(folder), [folder]);

    useEffect(() => {
        let cancelled = false;

        const loadFolder = async () => {
            if (!folderId || !token) {
                setError('This design file link is incomplete.');
                setLoading(false);
                return;
            }

            setLoading(true);
            setError('');

            try {
                const data = await foldersAPI.getPublicSharedFolder(folderId, token);
                if (!cancelled) {
                    setFolder(data);
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

        loadFolder();

        return () => {
            cancelled = true;
        };
    }, [folderId, token]);

    if (loading) {
        return (
            <main className="public-share-page">
                <div className="public-share-loading">Loading design files...</div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="public-share-page">
                <section className="public-share-panel public-share-error">
                    <img src={LOGO_URL} alt="ErectSafe Scaffolding" />
                    <h1>Unable to open design files</h1>
                    <p>{error}</p>
                </section>
            </main>
        );
    }

    return (
        <main className="public-share-page">
            <section className="public-share-header">
                <img src={LOGO_URL} alt="ErectSafe Scaffolding" />
                <div>
                    <h1>{folder?.name || 'Shared design files'}</h1>
                    <p>{fileCount === 1 ? '1 file available' : `${fileCount} files available`}</p>
                </div>
            </section>
            {fileCount > 0 ? (
                <SharedFolderTree folder={folder} />
            ) : (
                <section className="public-share-panel">
                    <h2>No files available</h2>
                    <p>This shared folder does not currently contain any design files.</p>
                </section>
            )}
        </main>
    );
}
