import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { foldersAPI, authAPI, usersAPI, rosteringAPI, resolveProfileImageUrl } from '../services/api';
import UploadDocumentModal, { prefetchNotificationRecipients } from './UploadDocumentModal';
import ReplaceDocumentModal from './ReplaceDocumentModal';
import PDFViewer from './PDFViewer';
import { useToast } from './Toast';
import './FolderBrowser.css';

// Professional SVG Icons (Google Drive style)
const FolderIcon = ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" fill={color} stroke={color} strokeWidth="0.5"/>
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

const SearchIcon = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
);

const MoreIcon = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1"></circle>
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="12" cy="19" r="1"></circle>
    </svg>
);

const GridIcon = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
    </svg>
);

const ListIcon = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"></line>
        <line x1="8" y1="12" x2="21" y2="12"></line>
        <line x1="8" y1="18" x2="21" y2="18"></line>
        <line x1="3" y1="6" x2="3.01" y2="6"></line>
        <line x1="3" y1="12" x2="3.01" y2="12"></line>
        <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
);

const InfoIcon = ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
);

const ShareIcon = ({ size = 16, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <line x1="19" y1="8" x2="19" y2="14"></line>
        <line x1="22" y1="11" x2="16" y2="11"></line>
    </svg>
);

const EditIcon = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
    </svg>
);

const TrashIcon = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
);

const CheckCircleIcon = ({ size = 13, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

const SortArrowIcon = ({ direction }) => (
    <svg className="sort-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {direction === 'asc' ? (
            <path d="M6 2L10 7H2L6 2Z" fill="currentColor" />
        ) : (
            <path d="M6 10L2 5H10L6 10Z" fill="currentColor" />
        )}
    </svg>
);

// Helper function to format file size
const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

// Helper function to format date
const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
};

// Helper function to format revision number
const formatRevisionNumber = (revisionNumber) => {
    if (!revisionNumber) return 'Revision 00';
    return `Revision ${String(revisionNumber).padStart(2, '0')}`;
};

const formatCompactRevisionNumber = (revisionNumber) => {
    if (!revisionNumber) return 'Rev 00';
    return `Rev ${String(revisionNumber).padStart(2, '0')}`;
};

const DRAWING_STATUS_LABELS = new Set(['Construction', 'Preliminary', 'Concept', 'As-Built']);

const inferDrawingStatusFromDocumentName = (item) => {
    const upperName = (item?.essDesignIssueName || item?.thirdPartyDesignName || '').toUpperCase();
    if (upperName.includes('(ASB)')) return 'As-Built';
    if (upperName.includes('(PRE)')) return 'Preliminary';
    if (upperName.includes('(CON)')) return 'Construction';
    if (upperName.includes('(CPT)') || upperName.includes('(CONCEPT)')) return 'Concept';
    return '';
};

const getDrawingStatus = (item) => (
    DRAWING_STATUS_LABELS.has(item?.drawingStatus)
        ? item.drawingStatus
        : (inferDrawingStatusFromDocumentName(item) || 'Construction')
);

const getDrawingStatusClass = (item) => getDrawingStatus(item).toLowerCase().replace(/[^a-z0-9]+/g, '-');

const getItemDisplayName = (item) => (
    item?.isDocument
        ? (item.essDesignIssueName || 'Document')
        : (item?.name || 'Folder')
);

const getOwnerLabel = (item) => (
    item?.ownerName || (item?.userId ? `${item.userId.slice(0, 8)}...` : 'Unknown')
);

const getOwnerInitials = (item) => {
    const label = getOwnerLabel(item);
    const cleanLabel = label.replace('...', '').trim();
    if (!cleanLabel) return 'UN';

    const parts = cleanLabel.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return cleanLabel.slice(0, 2).toUpperCase();
};

const ownerAvatarUrlCache = new Map();
const OWNER_AVATAR_CACHE_KEY = 'ess-owner-avatar-url-cache-v1';
let ownerEmployeeRowsPromise = null;

const readOwnerAvatarStorageCache = () => {
    try {
        const raw = localStorage.getItem(OWNER_AVATAR_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const writeOwnerAvatarStorageCache = (cache) => {
    try {
        localStorage.setItem(OWNER_AVATAR_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // Ignore private browsing/quota failures.
    }
};

const getStoredOwnerAvatarUrl = (ownerId) => {
    if (!ownerId) return '';
    const cache = readOwnerAvatarStorageCache();
    return typeof cache[ownerId] === 'string' ? cache[ownerId] : '';
};

const setStoredOwnerAvatarUrl = (ownerId, url) => {
    if (!ownerId || !url) return;
    const cache = readOwnerAvatarStorageCache();
    cache[ownerId] = url;
    writeOwnerAvatarStorageCache(cache);
};

const clearStoredOwnerAvatarUrl = (ownerId) => {
    if (!ownerId) return;
    const cache = readOwnerAvatarStorageCache();
    if (cache[ownerId] === undefined) return;
    delete cache[ownerId];
    writeOwnerAvatarStorageCache(cache);
};

const getOwnerEmployeeRows = () => {
    if (!ownerEmployeeRowsPromise) {
        ownerEmployeeRowsPromise = rosteringAPI.getEmployees().catch(() => []);
    }
    return ownerEmployeeRowsPromise;
};

const normalizeOwnerName = (value) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const resolveOwnerAvatarUrl = async (item) => {
    const ownerId = item?.userId || item?.UserId || item?.ownerId || item?.OwnerId || '';
    const storedUrl = getStoredOwnerAvatarUrl(ownerId);
    if (storedUrl) return storedUrl;

    const ownerName = normalizeOwnerName(item?.ownerName || item?.OwnerName);
    const employees = await getOwnerEmployeeRows();
    const linkedEmployee = employees.find((employee) => (
        (ownerId && String(employee.linkedAuthUserId || employee.linked_auth_user_id || '').toLowerCase() === String(ownerId).toLowerCase())
        || (ownerName && normalizeOwnerName(`${employee.firstName || ''} ${employee.lastName || ''}`) === ownerName)
    ));
    const employeeUrl = linkedEmployee?.id ? await resolveProfileImageUrl(linkedEmployee.id) : null;
    if (employeeUrl) {
        setStoredOwnerAvatarUrl(ownerId, employeeUrl);
        return employeeUrl;
    }

    const directUrl = await resolveProfileImageUrl(ownerId);
    if (directUrl) {
        setStoredOwnerAvatarUrl(ownerId, directUrl);
    }
    return directUrl;
};

function OwnerAvatar({ item }) {
    const ownerId = item?.userId || item?.UserId || item?.ownerId || item?.OwnerId || '';
    const initials = getOwnerInitials(item);
    const [avatarUrl, setAvatarUrl] = useState(() => ownerAvatarUrlCache.get(ownerId) || getStoredOwnerAvatarUrl(ownerId) || '');

    useEffect(() => {
        let active = true;

        if (!ownerId) {
            setAvatarUrl('');
            return undefined;
        }

        const cachedUrl = ownerAvatarUrlCache.get(ownerId);
        if (cachedUrl !== undefined) {
            setAvatarUrl(cachedUrl);
            return undefined;
        }

        resolveOwnerAvatarUrl(item)
            .then((url) => {
                if (!active) return;
                ownerAvatarUrlCache.set(ownerId, url || '');
                setAvatarUrl(url || '');
            })
            .catch(() => {
                if (!active) return;
                ownerAvatarUrlCache.set(ownerId, '');
                setAvatarUrl('');
            });

        return () => {
            active = false;
        };
    }, [item, ownerId]);

    return (
        <span className={`owner-avatar${avatarUrl ? ' has-image' : ''}`}>
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt=""
                    onError={() => {
                        ownerAvatarUrlCache.set(ownerId, '');
                        clearStoredOwnerAvatarUrl(ownerId);
                        setAvatarUrl('');
                    }}
                />
            ) : initials}
        </span>
    );
}

const getFolderItemCount = (item) => {
    const subFolderCount = Array.isArray(item?.subFolders)
        ? item.subFolders.length
        : (item?.subFolderCount || item?.SubFolderCount || 0);
    const documentCount = Array.isArray(item?.documents)
        ? item.documents.length
        : (item?.documentCount || item?.DocumentCount || 0);
    const totalCount = subFolderCount + documentCount;

    if (totalCount === 0) return 'No items';
    const parts = [];
    if (subFolderCount > 0) {
        parts.push(`${subFolderCount} folder${subFolderCount === 1 ? '' : 's'}`);
    }
    if (documentCount > 0) {
        parts.push(`${documentCount} PDF${documentCount === 1 ? '' : 's'}`);
    }

    return parts.join(' / ');
};

const getSearchResultName = (result) => (
    result?.name
    || result?.displayName
    || result?.essDesignIssueName
    || 'Untitled'
);

const getSearchResultMeta = (result) => {
    const path = result?.path ? ` - ${result.path}` : '';
    return `Folder${path}`;
};

const REVISION_OPTIONS = Array.from({ length: 20 }, (_, index) => {
    const revision = index + 1;
    return revision < 10 ? `0${revision}` : `${revision}`;
});

// Default column widths as fractions (must match grid-template-columns order after icon)
const DEFAULT_COL_WIDTHS = { name: 1.5, revision: 0.75, status: 0.95, owner: 1, modified: 1.2, size: 0.8 };
const MIN_COL_WIDTH_PX = 60;
const LIST_ACTIONS_WIDTH_PX = 176;
const MIN_COL_WIDTH_FR = 0.2;
const CONTEXT_MENU_WIDTH = 224;
const CONTEXT_MENU_MARGIN = 12;

const sanitizeColWidths = (value) => {
    const next = { ...DEFAULT_COL_WIDTHS };

    if (!value || typeof value !== 'object') {
        return next;
    }

    Object.keys(DEFAULT_COL_WIDTHS).forEach((key) => {
        const parsed = Number(value[key]);
        if (Number.isFinite(parsed) && parsed >= MIN_COL_WIDTH_FR) {
            next[key] = parsed;
        }
    });

    return next;
};

const buildGridTemplateColumns = (widths, includeRevision) => {
    const normalized = sanitizeColWidths(widths);
    const dynamicColumns = includeRevision
        ? [
            `minmax(0, ${normalized.name}fr)`,
            `minmax(0, ${normalized.revision}fr)`,
            `minmax(0, ${normalized.status}fr)`,
            `minmax(0, ${normalized.owner}fr)`,
            `minmax(0, ${normalized.modified}fr)`,
            `minmax(0, ${normalized.size}fr)`
        ]
        : [
            `minmax(0, ${normalized.name}fr)`,
            `minmax(0, ${normalized.owner}fr)`,
            `minmax(0, ${normalized.modified}fr)`,
            `minmax(0, ${normalized.size}fr)`
        ];

    return ['40px', ...dynamicColumns, `${LIST_ACTIONS_WIDTH_PX}px`].join(' ');
};

const pdfThumbnailCache = new Map();

function PdfPageThumbnail({ documentItem }) {
    const [thumbnailUrl, setThumbnailUrl] = useState('');
    const [thumbnailStatus, setThumbnailStatus] = useState('loading');

    useEffect(() => {
        let cancelled = false;
        let loadedPdf = null;

        const renderThumbnail = async () => {
            if (!documentItem?.isDocument) {
                setThumbnailUrl('');
                setThumbnailStatus('idle');
                return;
            }

            const preferredType = 'ess';
            if (!documentItem.essDesignIssuePath) {
                setThumbnailUrl('');
                setThumbnailStatus('unavailable');
                return;
            }

            const cacheKey = `${documentItem.id}-${preferredType}-${documentItem.updatedAt || documentItem.createdAt || ''}`;
            const cachedThumbnail = pdfThumbnailCache.get(cacheKey);
            if (cachedThumbnail) {
                setThumbnailUrl(cachedThumbnail);
                setThumbnailStatus('ready');
                return;
            }

            setThumbnailStatus('loading');
            setThumbnailUrl('');

            try {
                const [pdfjsLib, downloadData] = await Promise.all([
                    import('pdfjs-dist/build/pdf.mjs'),
                    foldersAPI.getDownloadUrl(documentItem.id, preferredType)
                ]);

                if (cancelled) return;

                pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
                    'pdfjs-dist/build/pdf.worker.min.mjs',
                    import.meta.url
                ).toString();

                const resolvedUrl = foldersAPI.resolvePublicFileUrl(downloadData?.url || '');
                if (!resolvedUrl) {
                    throw new Error('No PDF URL returned for preview');
                }

                loadedPdf = await pdfjsLib.getDocument({
                    url: resolvedUrl,
                    disableAutoFetch: true,
                    disableFontFace: true,
                    useSystemFonts: false,
                    isEvalSupported: false
                }).promise;
                const pageNumber = Math.min(2, loadedPdf.numPages || 1);
                const page = await loadedPdf.getPage(pageNumber);
                const initialViewport = page.getViewport({ scale: 1 });
                const targetWidth = 280;
                const scale = targetWidth / initialViewport.width;
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d', { alpha: false });

                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);

                await page.render({ canvasContext: context, viewport }).promise;

                if (!cancelled) {
                    const previewDataUrl = canvas.toDataURL('image/jpeg', 0.58);
                    pdfThumbnailCache.set(cacheKey, previewDataUrl);
                    setThumbnailUrl(previewDataUrl);
                    setThumbnailStatus('ready');
                }
            } catch (error) {
                console.error('Failed to render PDF thumbnail:', error);
                if (!cancelled) {
                    setThumbnailUrl('');
                    setThumbnailStatus('unavailable');
                }
            } finally {
                if (loadedPdf) {
                    loadedPdf.destroy();
                    loadedPdf = null;
                }
            }
        };

        renderThumbnail();

        return () => {
            cancelled = true;
            if (loadedPdf) {
                loadedPdf.destroy();
                loadedPdf = null;
            }
        };
    }, [documentItem]);

    return (
        <div className="pdf-page-thumbnail" aria-label="Low quality preview of PDF page 2">
            {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="PDF page 2 preview" />
            ) : (
                <div className="pdf-thumbnail-state">
                    {thumbnailStatus === 'loading' ? 'Rendering preview...' : 'Preview unavailable'}
                </div>
            )}
            <span className="pdf-badge">PDF</span>
        </div>
    );
}

function FolderBrowser({ selectedFolderId, onFolderChange, viewMode: initialViewMode, onViewModeChange, onRefreshNeeded, canManage = false }) {
    const { showToast, updateToast } = useToast();
    const [currentFolder, setCurrentFolder] = useState(null);
    const [folders, setFolders] = useState([]);
    const [breadcrumbs, setBreadcrumbs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [showReplaceDocumentModal, setShowReplaceDocumentModal] = useState(false);
    const [showEditDocumentModal, setShowEditDocumentModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareTarget, setShareTarget] = useState(null);
    const [shareUsers, setShareUsers] = useState([]);
    const [selectedShareRecipients, setSelectedShareRecipients] = useState([]);
    const [externalShareRecipients, setExternalShareRecipients] = useState([]);
    const [externalShareInput, setExternalShareInput] = useState('');
    const [externalShareMessage, setExternalShareMessage] = useState('');
    const [loadingShareUsers, setLoadingShareUsers] = useState(false);
    const [sharingDocument, setSharingDocument] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderParent, setNewFolderParent] = useState(null); // Track parent for subfolder creation
    const [renameTarget, setRenameTarget] = useState(null);
    const [replaceDocumentTarget, setReplaceDocumentTarget] = useState(null);
    const [editDocumentTarget, setEditDocumentTarget] = useState(null);
    const [newRevisionNumber, setNewRevisionNumber] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false);
    const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState(null);
    const [detailsPanelDismissed, setDetailsPanelDismissed] = useState(false);
    const cacheRef = useRef(new Map());
    const searchSelectionRef = useRef(false);

    // Drag-and-drop state
    const draggedItemRef = useRef(null);
    const [dragOverFolderId, setDragOverFolderId] = useState(null);
    const [viewMode, setViewMode] = useState(() => {
        if (initialViewMode) return initialViewMode;
        return localStorage.getItem('viewModeUserSelected') === 'true'
            ? (localStorage.getItem('viewMode') || 'list')
            : 'list';
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
            if (saved) return sanitizeColWidths(JSON.parse(saved));
        } catch { /* ignore */ }
        return { ...DEFAULT_COL_WIDTHS };
    });
    const resizingRef = useRef(null);
    const headerRef = useRef(null);

    // Persist column widths
    useEffect(() => {
        localStorage.setItem('listColWidths', JSON.stringify(colWidths));
    }, [colWidths]);

    useEffect(() => {
        setColWidths(prev => {
            const normalized = sanitizeColWidths(prev);
            const changed = Object.keys(DEFAULT_COL_WIDTHS).some(key => normalized[key] !== prev[key]);
            return changed ? normalized : prev;
        });
    }, []);

    const showRevisionColumn = folders.some(item => item.isDocument);

    // Build a defensive grid-template-columns string so stale localStorage values cannot break the layout
    const gridTemplateColumns = buildGridTemplateColumns(colWidths, showRevisionColumn);

    // Column resize handlers
    const colKeys = showRevisionColumn
        ? ['name', 'revision', 'status', 'owner', 'modified', 'size']
        : ['name', 'owner', 'modified', 'size'];

    const handleResizeStart = useCallback((e, colIndex) => {
        e.preventDefault();
        e.stopPropagation();

        const headerEl = headerRef.current;
        if (!headerEl) return;
        // We use a data attribute to identify resizable column cells
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

    const handleViewModeSelect = useCallback((nextViewMode) => {
        setViewMode(nextViewMode);
        if (onViewModeChange) {
            onViewModeChange(nextViewMode);
        }
    }, [onViewModeChange]);

    // PDF Viewer state
    const [pdfViewer, setPdfViewer] = useState(null);

    useEffect(() => {
        if (selectedFolderId !== undefined) {
            setCurrentFolder(selectedFolderId);
        }
    }, [selectedFolderId]);

    useEffect(() => {
        if (canManage) {
            prefetchNotificationRecipients();
        }
    }, [canManage]);

    useEffect(() => {
        setSearchQuery('');
        setSearchSuggestions([]);
        setShowSearchSuggestions(false);
        setSelectedItemId(null);
        setDetailsPanelDismissed(false);
    }, [currentFolder]);

    useEffect(() => {
        const query = searchQuery.trim();

        if (query.length < 2) {
            setSearchSuggestions([]);
            setSearchSuggestionsLoading(false);
            setShowSearchSuggestions(false);
            return;
        }

        if (searchSelectionRef.current) {
            searchSelectionRef.current = false;
            setSearchSuggestionsLoading(false);
            setShowSearchSuggestions(false);
            return;
        }

        setShowSearchSuggestions(true);
        setSearchSuggestionsLoading(true);

        const timeoutId = window.setTimeout(async () => {
            try {
                const results = await foldersAPI.search(query);
                setSearchSuggestions(Array.isArray(results) ? results.slice(0, 8) : []);
            } catch (error) {
                if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') {
                    console.error('Search suggestions error:', error);
                }
                setSearchSuggestions([]);
            } finally {
                setSearchSuggestionsLoading(false);
            }
        }, 240);

        return () => window.clearTimeout(timeoutId);
    }, [searchQuery]);

    useEffect(() => {
        loadCurrentFolder();
    }, [currentFolder]);

    // Save view mode preference
    useEffect(() => {
        if (!initialViewMode || initialViewMode === viewMode) return;
        setViewMode(initialViewMode);
    }, [initialViewMode, viewMode]);

    useEffect(() => {
        localStorage.setItem('viewMode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        if (!showRevisionColumn && sortField === 'revision') {
            setSortField('name');
        }
    }, [showRevisionColumn, sortField]);

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
        const nextFolderId = folderId || null;
        setCurrentFolder(nextFolderId);
        if (onFolderChange) {
            onFolderChange(nextFolderId);
        }
    };

    const handleSearchSuggestionSelect = (result) => {
        searchSelectionRef.current = true;
        setSearchQuery(getSearchResultName(result));
        setShowSearchSuggestions(false);

        const resultId = result?.id;

        if (resultId) {
            handleFolderClick(resultId);
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

    const handleDocumentReplacementSuccess = async () => {
        setReplaceDocumentTarget(null);
        setShowReplaceDocumentModal(false);
        clearCache();
        await loadCurrentFolder();
        if (onRefreshNeeded) onRefreshNeeded();
    };

    const handleOpenShareModal = async (item) => {
        setShareTarget(item);
        setSelectedShareRecipients([]);
        setExternalShareRecipients([]);
        setExternalShareInput('');
        setExternalShareMessage('');
        setShowShareModal(true);

        if (shareUsers.length > 0) {
            return;
        }

        setLoadingShareUsers(true);
        try {
            const userList = await usersAPI.getAllUsers();
            setShareUsers(userList);
        } catch (error) {
            console.error('Failed to fetch users for sharing:', error);
            showToast('Failed to load users', 'error');
        } finally {
            setLoadingShareUsers(false);
        }
    };

    const handleToggleShareRecipient = (userId) => {
        setSelectedShareRecipients(prev => (
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        ));
    };

    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const pendingExternalEmails = externalShareInput
        .split(/[\n,;]+/)
        .map(email => email.trim())
        .filter(Boolean);
    const invalidExternalInput = externalShareInput.trim().length > 0 && /[\s,;]+/.test(externalShareInput.trim())
        ? pendingExternalEmails.some(email => !isValidEmail(email))
        : externalShareInput.trim().length > 0 && !isValidEmail(externalShareInput.trim());
    const totalShareRecipients = selectedShareRecipients.length + externalShareRecipients.length + pendingExternalEmails.filter(isValidEmail).length;

    const addExternalRecipient = (email) => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
            return false;
        }

        setExternalShareRecipients(prev => (
            prev.some(existing => existing.toLowerCase() === trimmedEmail.toLowerCase())
                ? prev
                : [...prev, trimmedEmail]
        ));
        return true;
    };

    const commitExternalRecipients = (value) => {
        const parts = value
            .split(/[\n,;]+/)
            .map(email => email.trim())
            .filter(Boolean);

        if (parts.length === 0) {
            setExternalShareInput('');
            return;
        }

        const invalidParts = [];
        parts.forEach(part => {
            if (!addExternalRecipient(part)) {
                invalidParts.push(part);
            }
        });

        setExternalShareInput(invalidParts.join(', '));
    };

    const handleExternalInputKeyDown = (e) => {
        if (['Enter', 'Tab', ',', ';'].includes(e.key)) {
            e.preventDefault();
            commitExternalRecipients(externalShareInput);
        }

        if (e.key === 'Backspace' && !externalShareInput && externalShareRecipients.length > 0) {
            e.preventDefault();
            setExternalShareRecipients(prev => prev.slice(0, -1));
        }
    };

    const handleRemoveExternalRecipient = (emailToRemove) => {
        setExternalShareRecipients(prev => prev.filter(email => email !== emailToRemove));
    };

    const handleShareItem = async () => {
        if (!shareTarget || totalShareRecipients === 0) {
            showToast('Select at least one recipient to share with', 'error');
            return;
        }

        if (invalidExternalInput) {
            showToast('Fix invalid external email addresses before sharing', 'error');
            return;
        }

        setSharingDocument(true);
        const isFolderShare = !shareTarget.isDocument;
        const shareLabel = isFolderShare ? 'folder' : 'PDF';
        const toastId = showToast(`Sharing ${shareLabel}...`, 'info', 0);
        const allExternalRecipients = [...externalShareRecipients, ...pendingExternalEmails.filter(isValidEmail)]
            .filter((email, index, allEmails) =>
                allEmails.findIndex(candidate => candidate.toLowerCase() === email.toLowerCase()) === index
            );

        try {
            if (isFolderShare) {
                await foldersAPI.shareFolder(shareTarget.id, selectedShareRecipients, allExternalRecipients, externalShareMessage.trim());
            } else {
                await foldersAPI.shareDocument(shareTarget.id, selectedShareRecipients, allExternalRecipients, externalShareMessage.trim());
            }
            updateToast(toastId, `${isFolderShare ? 'Folder' : 'PDF'} shared successfully`, 'success');
            setShowShareModal(false);
            setShareTarget(null);
            setSelectedShareRecipients([]);
            setExternalShareRecipients([]);
            setExternalShareInput('');
            setExternalShareMessage('');
        } catch (error) {
            updateToast(toastId, `Failed to share ${shareLabel}`, 'error');
            console.error('Share item error:', error);
        } finally {
            setSharingDocument(false);
        }
    };
    const handleMoveDocument = async (document, targetFolder) => {
        if (document.id === targetFolder.id) return;

        // 1. Save current state for rollback
        const currentFolders = [...folders];

        // 2. Remove document from current view immediately
        setFolders(prev => prev.filter(f => f.id !== document.id));

        // 3. Show toast
        const toastId = showToast(`Moving to "${targetFolder.name}"...`, 'info', 0);

        // 4. Call API in background
        try {
            await foldersAPI.moveDocument(document.id, targetFolder.id);

            clearCache();
            if (onRefreshNeeded) onRefreshNeeded();
            updateToast(toastId, `Moved to "${targetFolder.name}"`, 'success');
        } catch (error) {
            // 5. Rollback on error
            setFolders(currentFolders);
            updateToast(toastId, 'Failed to move document', 'error');
            console.error('Move document error:', error);
        }
    };

    const handleDragStart = (e, item) => {
        if (!canManage) return;
        draggedItemRef.current = item;
        e.dataTransfer.effectAllowed = 'move';
        // Use a tiny delay so the drag image renders before the element fades
        setTimeout(() => {
            e.target.classList.add('dragging');
        }, 0);
    };

    const handleDragEnd = (e) => {
        e.target.classList.remove('dragging');
        draggedItemRef.current = null;
        setDragOverFolderId(null);
    };

    const handleDragOver = (e, folder) => {
        if (!canManage) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedItemRef.current && draggedItemRef.current.isDocument) {
            setDragOverFolderId(folder.id);
        }
    };

    const handleDragLeave = (e) => {
        // Only clear if leaving the element entirely (not entering a child)
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverFolderId(null);
        }
    };

    const handleDrop = (e, targetFolder) => {
        if (!canManage) return;
        e.preventDefault();
        setDragOverFolderId(null);
        const dragged = draggedItemRef.current;
        if (!dragged || !dragged.isDocument) return;
        handleMoveDocument(dragged, targetFolder);
    };

    const handleViewPDF = (document, type = 'ess') => {
        const fileName = document.essDesignIssueName;
        setPdfViewer({
            documentId: document.id,
            fileName: fileName || 'document.pdf',
            fileType: type || 'ess'
        });
    };

    const openContextMenu = useCallback((anchor, item = null, options = {}) => {
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const menuHeight = item?.isDocument ? 244 : item ? 244 : 76;
        const rawX = options.preferLeft
            ? anchor.left - CONTEXT_MENU_WIDTH + (options.offsetX ?? 0)
            : anchor.x ?? anchor.left ?? 0;
        const rawY = anchor.y ?? anchor.bottom ?? anchor.top ?? 0;
        const maxX = Math.max(CONTEXT_MENU_MARGIN, viewportWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN);
        const maxY = Math.max(CONTEXT_MENU_MARGIN, viewportHeight - menuHeight - CONTEXT_MENU_MARGIN);
        const x = Math.min(Math.max(rawX, CONTEXT_MENU_MARGIN), maxX);
        const y = Math.min(Math.max(rawY, CONTEXT_MENU_MARGIN), maxY);

        setContextMenu({
            x,
            y,
            item,
            isEmptySpace: options.isEmptySpace || false
        });
    }, []);

    const handleContextMenu = (e, item) => {
        if (!canManage) return;
        e.preventDefault();
        openContextMenu({ x: e.clientX, y: e.clientY }, item);
    };

    const handleEmptySpaceContextMenu = (e) => {
        if (!canManage) return;
        // Only trigger if clicking on the grid/list container itself, not on items
        if (e.target.classList.contains('items-grid') || e.target.classList.contains('items-list')) {
            e.preventDefault();
            openContextMenu({ x: e.clientX, y: e.clientY }, null, { isEmptySpace: true });
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
                case 'status':
                    aValue = a.isDocument ? getDrawingStatus(a) : '';
                    bValue = b.isDocument ? getDrawingStatus(b) : '';
                    break;
                case 'owner':
                    aValue = getOwnerLabel(a);
                    bValue = getOwnerLabel(b);
                    break;
                case 'modified':
                    aValue = new Date(a.updatedAt || a.createdAt).getTime();
                    bValue = new Date(b.updatedAt || b.createdAt).getTime();
                    break;
                case 'size':
                    aValue = a.isDocument ? (a.totalFileSize || 0) : (a.fileSize || 0);
                    bValue = b.isDocument ? (b.totalFileSize || 0) : (b.fileSize || 0);
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

    const visibleItems = useMemo(() => {
        return getSortedFolders();
    }, [getSortedFolders]);

    useEffect(() => {
        const uniqueOwnerItems = [];
        const seenOwnerIds = new Set();

        for (const item of visibleItems) {
            const ownerId = item?.userId || item?.UserId || item?.ownerId || item?.OwnerId || '';
            if (!ownerId || seenOwnerIds.has(ownerId) || ownerAvatarUrlCache.get(ownerId) !== undefined) {
                continue;
            }
            seenOwnerIds.add(ownerId);
            uniqueOwnerItems.push(item);
        }

        uniqueOwnerItems.forEach((item) => {
            const ownerId = item?.userId || item?.UserId || item?.ownerId || item?.OwnerId || '';
            resolveOwnerAvatarUrl(item)
                .then((url) => ownerAvatarUrlCache.set(ownerId, url || ''))
                .catch(() => ownerAvatarUrlCache.set(ownerId, ''));
        });
    }, [visibleItems]);

    const selectedPreviewItem = useMemo(() => {
        if (detailsPanelDismissed || !selectedItemId || visibleItems.length === 0) {
            return null;
        }

        const selectedItem = visibleItems.find(item => item.id === selectedItemId);
        return selectedItem?.isDocument ? selectedItem : null;
    }, [detailsPanelDismissed, selectedItemId, visibleItems]);

    const latestRevisionNumber = useMemo(() => (
        visibleItems.reduce((latest, item) => {
            if (!item.isDocument) return latest;
            const revision = Number(item.revisionNumber);
            return Number.isFinite(revision) ? Math.max(latest, revision) : latest;
        }, 0)
    ), [visibleItems]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    return (
        <div className="folder-browser">
            <section className="document-page">
                <div className={`document-content ${selectedPreviewItem ? 'has-details' : ''}`}>
                    <div className="document-items-panel">
                        <div className="document-table-toolbar">
                            <div className="document-path-row" aria-label="Folder path">
                                <button
                                    type="button"
                                    className="breadcrumb-home"
                                    onClick={() => handleBreadcrumbClick(null)}
                                    title="Home"
                                >
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" />
                                        <path d="M9 21V12h6v9" />
                                    </svg>
                                </button>
                                <button type="button" className="path-crumb" onClick={() => handleBreadcrumbClick(null)}>
                                    Home
                                </button>
                                {breadcrumbs.map((crumb) => (
                                    <React.Fragment key={crumb.id}>
                                        <span className="path-separator">/</span>
                                        <button type="button" className="path-crumb" onClick={() => handleBreadcrumbClick(crumb.id)}>
                                            {crumb.name}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </div>
                            <div className="browser-toolbar document-toolbar">
                                <label className="document-search">
                                    <span className="sr-only">Search documents</span>
                                    <input
                                        type="search"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onFocus={() => {
                                            if (searchQuery.trim().length >= 2) {
                                                setShowSearchSuggestions(true);
                                            }
                                        }}
                                        onBlur={() => window.setTimeout(() => setShowSearchSuggestions(false), 140)}
                                        placeholder="Search folders"
                                    />
                                    <SearchIcon size={18} />
                                    {showSearchSuggestions && (
                                        <div className="document-search-suggestions">
                                            {searchSuggestionsLoading ? (
                                                <div className="search-suggestion-empty">Searching...</div>
                                            ) : searchSuggestions.length > 0 ? (
                                                searchSuggestions.map(result => (
                                                    <button
                                                        key={`folder-${result.id}`}
                                                        type="button"
                                                        className="search-suggestion"
                                                        onMouseDown={(event) => {
                                                            event.preventDefault();
                                                            handleSearchSuggestionSelect(result);
                                                        }}
                                                    >
                                                        <span className="search-suggestion-icon folder">
                                                            <FolderIcon size={18} />
                                                        </span>
                                                        <span className="search-suggestion-copy">
                                                            <strong>{getSearchResultName(result)}</strong>
                                                            <small>{getSearchResultMeta(result)}</small>
                                                        </span>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="search-suggestion-empty">No matching folders</div>
                                            )}
                                        </div>
                                    )}
                                </label>
                                <div className="document-toolbar-spacer"></div>
                                {canManage && (
                                    <button className="btn-new" onClick={() => setShowNewFolderModal(true)}>
                                        <FolderPlusIcon size={16} /> New Folder
                                    </button>
                                )}
                                {canManage && (
                                    <div className={`upload-split${!currentFolder ? ' disabled' : ''}`}>
                                        <button
                                            className="btn-upload"
                                            onClick={() => currentFolder && setShowUploadModal(true)}
                                            disabled={!currentFolder}
                                            title={currentFolder ? 'Upload Document' : 'Open a folder to upload documents'}
                                        >
                                            <UploadIcon size={16} /> Upload Document
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-upload-menu"
                                            onClick={() => currentFolder && setShowUploadModal(true)}
                                            disabled={!currentFolder}
                                            title={currentFolder ? 'Upload options' : 'Open a folder to upload documents'}
                                        >
                                            <SortArrowIcon direction="desc" />
                                        </button>
                                    </div>
                                )}
                                <div className="view-toggle">
                                    <button
                                        className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                                        onClick={() => handleViewModeSelect('list')}
                                        title="List view"
                                    >
                                        <ListIcon size={18} />
                                    </button>
                                    <button
                                        className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                        onClick={() => handleViewModeSelect('grid')}
                                        title="Grid view"
                                    >
                                        <GridIcon size={18} />
                                    </button>
                                </div>
                                <button type="button" className="toolbar-icon-btn" title="Details">
                                    <InfoIcon size={18} />
                                </button>
                            </div>
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
                                                <SortArrowIcon direction={sortDirection} />
                                            )}
                                            <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, 0)} onDoubleClick={handleResetColWidths} />
                                        </div>
                                        {showRevisionColumn && (
                                            <div
                                                className={`list-header-cell sortable ${sortField === 'revision' ? 'active' : ''}`}
                                                onClick={() => handleSort('revision')}
                                                data-col-key="revision"
                                            >
                                                <span>Revision</span>
                                                {sortField === 'revision' && (
                                                    <SortArrowIcon direction={sortDirection} />
                                                )}
                                                <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, 1)} onDoubleClick={handleResetColWidths} />
                                            </div>
                                        )}
                                        {showRevisionColumn && (
                                            <div
                                                className={`list-header-cell sortable ${sortField === 'status' ? 'active' : ''}`}
                                                onClick={() => handleSort('status')}
                                                data-col-key="status"
                                            >
                                                <span>Status</span>
                                                {sortField === 'status' && (
                                                    <SortArrowIcon direction={sortDirection} />
                                                )}
                                                <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, 2)} onDoubleClick={handleResetColWidths} />
                                            </div>
                                        )}
                                        <div
                                            className={`list-header-cell sortable ${sortField === 'owner' ? 'active' : ''}`}
                                            onClick={() => handleSort('owner')}
                                            data-col-key="owner"
                                        >
                                            <span>Owner</span>
                                            {sortField === 'owner' && (
                                                <SortArrowIcon direction={sortDirection} />
                                            )}
                                            <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, showRevisionColumn ? 3 : 1)} onDoubleClick={handleResetColWidths} />
                                        </div>
                                        <div
                                            className={`list-header-cell sortable ${sortField === 'modified' ? 'active' : ''}`}
                                            onClick={() => handleSort('modified')}
                                            data-col-key="modified"
                                        >
                                            <span>Modified</span>
                                            {sortField === 'modified' && (
                                                <SortArrowIcon direction={sortDirection} />
                                            )}
                                            <div className="col-resize-handle" onMouseDown={(e) => handleResizeStart(e, showRevisionColumn ? 4 : 2)} onDoubleClick={handleResetColWidths} />
                                        </div>
                                        <div
                                            className={`list-header-cell sortable ${sortField === 'size' ? 'active' : ''}`}
                                            onClick={() => handleSort('size')}
                                            data-col-key="size"
                                        >
                                            <span>Size</span>
                                            {sortField === 'size' && (
                                                <SortArrowIcon direction={sortDirection} />
                                            )}
                                        </div>
                                        <div className="list-header-actions">File</div>
                                    </div>
                                )}

                                <div
                                    className={viewMode === 'grid' ? 'items-grid' : 'items-list'}
                                    onContextMenu={canManage ? handleEmptySpaceContextMenu : undefined}
                                >
                                    {visibleItems.length === 0 ? (
                                        <div className="documents-empty-state">
                                            <SearchIcon size={24} />
                                            <strong>No documents found</strong>
                                            <span>Try a different search term or open another folder.</span>
                                        </div>
                                    ) : (
                                        visibleItems.map(item => {
                                            const isSelected = selectedPreviewItem?.id === item.id;
                                            const isLatest = item.isDocument && Number(item.revisionNumber) === latestRevisionNumber && latestRevisionNumber > 0;

                                            return viewMode === 'grid' ? (
                                                <div
                                                    key={item.id}
                                                    className={`item-card ${item.isDocument ? 'document' : 'folder'}${isSelected ? ' selected' : ''}${!item.isDocument && dragOverFolderId === item.id ? ' drag-over' : ''}`}
                                                    draggable={canManage && !!item.isDocument}
                                                    onClick={() => {
                                                        setSelectedItemId(item.isDocument ? item.id : null);
                                                        setDetailsPanelDismissed(!item.isDocument);
                                                    }}
                                                    onDragStart={item.isDocument ? (e) => handleDragStart(e, item) : undefined}
                                                    onDragEnd={item.isDocument ? handleDragEnd : undefined}
                                                    onDragOver={canManage && !item.isDocument ? (e) => handleDragOver(e, item) : undefined}
                                                    onDragLeave={!item.isDocument ? handleDragLeave : undefined}
                                                    onDrop={canManage && !item.isDocument ? (e) => handleDrop(e, item) : undefined}
                                                    onDoubleClick={() => !item.isDocument && handleFolderClick(item.id)}
                                                    onContextMenu={canManage ? (e) => handleContextMenu(e, item) : undefined}
                                                >
                                                    {isSelected && <span className="card-selected-mark"><CheckCircleIcon size={12} /></span>}
                                                    {canManage && (
                                                        <button
                                                            type="button"
                                                            className="card-menu-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                openContextMenu({ left: rect.left, bottom: rect.bottom + 6 }, item, { preferLeft: true, offsetX: -8 });
                                                            }}
                                                            title="More actions"
                                                        >
                                                            <MoreIcon size={16} />
                                                        </button>
                                                    )}

                                                    {item.isDocument ? (
                                                        <div className="pdf-preview-card" aria-hidden="true">
                                                            <div className="pdf-sheet-lines">
                                                                <span></span>
                                                                <span></span>
                                                                <span></span>
                                                                <span></span>
                                                            </div>
                                                            <span className="pdf-badge">PDF</span>
                                                        </div>
                                                    ) : (
                                                        <div className="folder-preview-card" aria-hidden="true">
                                                            <FolderIcon size={86} />
                                                        </div>
                                                    )}

                                                    <div className="item-card-body">
                                                        <div className="item-name">
                                                            {getItemDisplayName(item)}
                                                        </div>
                                                        {item.isDocument ? (
                                                            <>
                                                                <div className="document-card-badges">
                                                                    <span className="revision-chip">{formatCompactRevisionNumber(item.revisionNumber)}</span>
                                                                    <span className={`drawing-status-chip ${getDrawingStatusClass(item)}`}>{getDrawingStatus(item)}</span>
                                                                    {isLatest && <span className="status-chip latest">Latest</span>}
                                                                </div>
                                                                <div className="document-card-meta">
                                                                    <OwnerAvatar item={item} />
                                                                    <span>{getOwnerLabel(item)}</span>
                                                                    <span>{formatDate(item.updatedAt || item.createdAt)}</span>
                                                                </div>
                                                                <div className="document-card-size">
                                                                    {formatFileSize(item.totalFileSize)}
                                                                </div>
                                                                <div className="document-files">
                                                                    {item.essDesignIssuePath && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleViewPDF(item, 'ess');
                                                                            }}
                                                                            className="file-btn"
                                                                        >
                                                                            <FileTextIcon size={13} /> ESS Design
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="folder-card-meta">
                                                                <span>{getFolderItemCount(item)}</span>
                                                                <span>Modified {formatDate(item.updatedAt || item.createdAt)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    key={item.id}
                                                    className={`list-item ${item.isDocument ? 'document' : 'folder'}${isSelected ? ' selected' : ''}${!item.isDocument && dragOverFolderId === item.id ? ' drag-over' : ''}`}
                                                    style={{ gridTemplateColumns }}
                                                    draggable={canManage && !!item.isDocument}
                                                    onClick={() => {
                                                        setSelectedItemId(item.isDocument ? item.id : null);
                                                        setDetailsPanelDismissed(!item.isDocument);
                                                    }}
                                                    onDragStart={item.isDocument ? (e) => handleDragStart(e, item) : undefined}
                                                    onDragEnd={item.isDocument ? handleDragEnd : undefined}
                                                    onDragOver={canManage && !item.isDocument ? (e) => handleDragOver(e, item) : undefined}
                                                    onDragLeave={!item.isDocument ? handleDragLeave : undefined}
                                                    onDrop={canManage && !item.isDocument ? (e) => handleDrop(e, item) : undefined}
                                                    onDoubleClick={() => !item.isDocument && handleFolderClick(item.id)}
                                                    onContextMenu={canManage ? (e) => handleContextMenu(e, item) : undefined}
                                                >
                                                    <div className="list-item-icon">
                                                        <span className={`row-select-mark${isSelected ? ' selected' : ''}`}>
                                                            {isSelected && <CheckCircleIcon size={11} />}
                                                        </span>
                                                    </div>
                                                    <div className="list-item-name">
                                                        {item.isDocument ? <DocumentIcon size={20} /> : <FolderIcon size={20} />}
                                                        <span>{getItemDisplayName(item)}</span>
                                                    </div>
                                                    {showRevisionColumn && (
                                                        <div className="list-item-revision">
                                                            {item.isDocument ? (
                                                                <>
                                                                    <span className="revision-chip">{formatCompactRevisionNumber(item.revisionNumber)}</span>
                                                                    {isLatest && <span className="status-chip latest">Latest</span>}
                                                                </>
                                                            ) : '-'}
                                                        </div>
                                                    )}
                                                    {showRevisionColumn && (
                                                        <div className="list-item-status">
                                                            {item.isDocument ? (
                                                                <span className={`drawing-status-chip ${getDrawingStatusClass(item)}`}>{getDrawingStatus(item)}</span>
                                                            ) : '-'}
                                                        </div>
                                                    )}
                                                    <div className="list-item-owner">
                                                        <OwnerAvatar item={item} />
                                                        <span className="owner-name-text">{getOwnerLabel(item)}</span>
                                                    </div>
                                                    <div className="list-item-modified">
                                                        {formatDate(item.updatedAt || item.createdAt)}
                                                    </div>
                                                    <div className="list-item-size">
                                                        {formatFileSize(item.isDocument ? item.totalFileSize : item.fileSize)}
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
                                                                    >
                                                                        ESS Design <CheckCircleIcon />
                                                                    </button>
                                                                ) : (
                                                                    <div className="file-btn-placeholder"></div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="folder-file-count">{getFolderItemCount(item)}</span>
                                                        )}
                                                        {canManage && (
                                                            <button
                                                                type="button"
                                                                className="row-menu-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    openContextMenu({ left: rect.left, bottom: rect.bottom + 6 }, item, { preferLeft: true, offsetX: -8 });
                                                                }}
                                                                title="More actions"
                                                            >
                                                                <MoreIcon size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {selectedPreviewItem && (
                        <aside className="document-details-panel" aria-label="Selected item details">
                            <div className="details-panel-header">
                                <div>
                                    <h3>{getItemDisplayName(selectedPreviewItem)}</h3>
                                    <p>
                                        {selectedPreviewItem.isDocument
                                            ? `${formatCompactRevisionNumber(selectedPreviewItem.revisionNumber)} - Modified ${formatDate(selectedPreviewItem.updatedAt || selectedPreviewItem.createdAt)}`
                                            : `${getFolderItemCount(selectedPreviewItem)} - Modified ${formatDate(selectedPreviewItem.updatedAt || selectedPreviewItem.createdAt)}`}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="details-close-btn"
                                    onClick={() => setDetailsPanelDismissed(true)}
                                    title="Close details"
                                >
                                    &times;
                                </button>
                            </div>

                            {selectedPreviewItem.isDocument ? (
                                <div className="details-preview pdf-preview-card large">
                                    <PdfPageThumbnail documentItem={selectedPreviewItem} />
                                </div>
                            ) : (
                                <div className="details-preview folder-preview-card large" aria-hidden="true">
                                    <FolderIcon size={110} />
                                </div>
                            )}

                            <div className="details-tabs">
                                <button type="button" className="active">Details</button>
                                <button type="button">Activity</button>
                            </div>

                            <dl className="details-list">
                                {selectedPreviewItem.isDocument && (
                                    <>
                                        <div>
                                            <dt>Revision</dt>
                                            <dd>
                                                <span className="revision-chip">{formatCompactRevisionNumber(selectedPreviewItem.revisionNumber)}</span>
                                                {Number(selectedPreviewItem.revisionNumber) === latestRevisionNumber && latestRevisionNumber > 0 && (
                                                    <span className="status-chip latest">Latest</span>
                                                )}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Status</dt>
                                            <dd>
                                                <span className={`drawing-status-chip ${getDrawingStatusClass(selectedPreviewItem)}`}>{getDrawingStatus(selectedPreviewItem)}</span>
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>File Size</dt>
                                            <dd>{formatFileSize(selectedPreviewItem.totalFileSize)}</dd>
                                        </div>
                                    </>
                                )}
                                <div>
                                    <dt>Owner</dt>
                                    <dd><OwnerAvatar item={selectedPreviewItem} />{getOwnerLabel(selectedPreviewItem)}</dd>
                                </div>
                                <div>
                                    <dt>Modified</dt>
                                    <dd>{formatDate(selectedPreviewItem.updatedAt || selectedPreviewItem.createdAt)}</dd>
                                </div>
                            </dl>

                            {selectedPreviewItem.isDocument && (
                                <>
                                    <div className="details-section">
                                        <h4>Files</h4>
                                        <div className="details-file-list">
                                            {selectedPreviewItem.essDesignIssuePath && (
                                                <button type="button" onClick={() => handleViewPDF(selectedPreviewItem, 'ess')}>
                                                    <FileTextIcon size={14} /> ESS Design <CheckCircleIcon />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="details-section">
                                        <h4>Change Notes</h4>
                                        <p className="change-notes">
                                            {selectedPreviewItem.description || 'No change notes have been added for this revision.'}
                                        </p>
                                    </div>
                                </>
                            )}

                            {canManage && (
                                <div className="details-actions">
                                    <button type="button" className="details-primary-action" onClick={() => handleOpenShareModal(selectedPreviewItem)}>
                                        <ShareIcon size={16} /> Share
                                    </button>
                                    {selectedPreviewItem.isDocument && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setReplaceDocumentTarget(selectedPreviewItem);
                                                    setShowReplaceDocumentModal(true);
                                                }}
                                            >
                                                <UploadIcon size={16} /> Replace PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditDocumentTarget(selectedPreviewItem);
                                                    setNewRevisionNumber(selectedPreviewItem.revisionNumber);
                                                    setShowEditDocumentModal(true);
                                                }}
                                            >
                                                <FileTextIcon size={16} /> Change Revision
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </aside>
                    )}
                </div>
            </section>

            {canManage && contextMenu && (
                <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    {contextMenu.isEmptySpace && (
                        <button type="button" className="context-menu-item" onClick={() => {
                            setNewFolderParent(currentFolder);
                            setShowNewFolderModal(true);
                            setContextMenu(null);
                        }}>
                            <FolderPlusIcon size={15} /> <span>New Folder</span>
                        </button>
                    )}
                    {contextMenu.item && !contextMenu.item.isDocument && (
                        <>
                            <button type="button" className="context-menu-item" onClick={() => {
                                handleOpenShareModal(contextMenu.item);
                                setContextMenu(null);
                            }}>
                                <ShareIcon size={15} /> <span>Share Folder</span>
                            </button>
                            <div className="context-menu-divider" role="separator"></div>
                            <button type="button" className="context-menu-item" onClick={() => {
                                setNewFolderParent(contextMenu.item.id);
                                setShowNewFolderModal(true);
                                setContextMenu(null);
                            }}>
                                <FolderPlusIcon size={15} /> <span>New Subfolder</span>
                            </button>
                            <div className="context-menu-divider" role="separator"></div>
                            <button type="button" className="context-menu-item" onClick={() => {
                                setRenameTarget(contextMenu.item);
                                setNewFolderName(contextMenu.item.name);
                                setShowRenameModal(true);
                                setContextMenu(null);
                            }}>
                                <EditIcon size={15} /> <span>Rename</span>
                            </button>
                            <button type="button" className="context-menu-item danger" onClick={() => {
                                handleDeleteFolder(contextMenu.item.id);
                                setContextMenu(null);
                            }}>
                                <TrashIcon size={15} /> <span>Delete</span>
                            </button>
                        </>
                    )}
                    {contextMenu.item && contextMenu.item.isDocument && (
                        <>
                            <button type="button" className="context-menu-item" onClick={() => {
                                handleOpenShareModal(contextMenu.item);
                                setContextMenu(null);
                            }}>
                                <ShareIcon size={15} /> <span>Share PDF</span>
                            </button>
                            <button type="button" className="context-menu-item" onClick={() => {
                                setReplaceDocumentTarget(contextMenu.item);
                                setShowReplaceDocumentModal(true);
                                setContextMenu(null);
                            }}>
                                <UploadIcon size={15} /> <span>Replace PDF</span>
                            </button>
                            <button type="button" className="context-menu-item" onClick={() => {
                                setEditDocumentTarget(contextMenu.item);
                                setNewRevisionNumber(contextMenu.item.revisionNumber);
                                setShowEditDocumentModal(true);
                                setContextMenu(null);
                            }}>
                                <EditIcon size={15} /> <span>Change Revision</span>
                            </button>
                            <div className="context-menu-divider" role="separator"></div>
                            <button type="button" className="context-menu-item danger" onClick={() => {
                                handleDeleteDocument(contextMenu.item.id);
                                setContextMenu(null);
                            }}>
                                <TrashIcon size={15} /> <span>Delete PDF</span>
                            </button>
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
                        <h3>Change Revision Number</h3>
                        <select
                            value={newRevisionNumber}
                            onChange={(e) => setNewRevisionNumber(e.target.value)}
                            autoFocus
                        >
                            {REVISION_OPTIONS.map((revision) => (
                                <option key={revision} value={revision}>
                                    Revision {revision}
                                </option>
                            ))}
                        </select>
                        <div className="modal-actions">
                            <button onClick={() => setShowEditDocumentModal(false)}>Cancel</button>
                            <button onClick={handleUpdateDocumentRevision}>Update</button>
                        </div>
                    </div>
                </div>
            )}

            {showReplaceDocumentModal && replaceDocumentTarget && (
                <ReplaceDocumentModal
                    document={replaceDocumentTarget}
                    onClose={() => {
                        setShowReplaceDocumentModal(false);
                        setReplaceDocumentTarget(null);
                    }}
                    onSuccess={handleDocumentReplacementSuccess}
                />
            )}

            {showShareModal && shareTarget && (
                <div className="modal-overlay" onClick={() => {
                    if (sharingDocument) return;
                    setShowShareModal(false);
                    setShareTarget(null);
                    setSelectedShareRecipients([]);
                    setExternalShareRecipients([]);
                    setExternalShareInput('');
                    setExternalShareMessage('');
                }}>
                    <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>{shareTarget.isDocument ? 'Share PDF' : 'Share Folder'}</h3>
                        <p className="share-modal-subtitle">
                            Send <strong>{shareTarget.isDocument
                                ? (shareTarget.essDesignIssueName || formatRevisionNumber(shareTarget.revisionNumber))
                                : shareTarget.name}</strong> by email.
                        </p>
                        <div className="share-section">
                            <div className="share-section-title">ESS Design users</div>
                            <div className="share-user-list">
                                {loadingShareUsers ? (
                                    <div className="share-empty-state">Loading users...</div>
                                ) : shareUsers.length === 0 ? (
                                    <div className="share-empty-state">No users available to share with.</div>
                                ) : (
                                    shareUsers.map(user => (
                                        <label key={user.id} className="share-user-row">
                                            <input
                                                type="checkbox"
                                                checked={selectedShareRecipients.includes(user.id)}
                                                onChange={() => handleToggleShareRecipient(user.id)}
                                                disabled={sharingDocument}
                                            />
                                            <span className="share-user-name">{user.fullName || user.email}</span>
                                            <span className="share-user-email">{user.email}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="share-section">
                            <label className="share-section-title" htmlFor="external-share-emails">External users</label>
                            <div className={`share-recipient-box${invalidExternalInput ? ' invalid' : ''}`}>
                                {externalShareRecipients.map(email => (
                                    <span key={email} className="share-recipient-chip">
                                        <span className="share-recipient-chip-text">{email}</span>
                                        <button
                                            type="button"
                                            className="share-recipient-chip-remove"
                                            onClick={() => handleRemoveExternalRecipient(email)}
                                            disabled={sharingDocument}
                                            aria-label={`Remove ${email}`}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                                <input
                                    id="external-share-emails"
                                    className="share-recipient-input"
                                    value={externalShareInput}
                                    onChange={(e) => setExternalShareInput(e.target.value)}
                                    onKeyDown={handleExternalInputKeyDown}
                                    onBlur={() => commitExternalRecipients(externalShareInput)}
                                    placeholder={externalShareRecipients.length === 0 ? 'Type an email and press Enter' : 'Add another email'}
                                    disabled={sharingDocument}
                                />
                            </div>
                            <div className="share-helper-text">
                                {shareTarget.isDocument
                                    ? 'External recipients will receive direct PDF links and do not need an ESS Design account.'
                                    : 'External recipients will receive a direct folder link and do not need an ESS Design account.'}
                            </div>
                            {invalidExternalInput && (
                                <div className="share-error-text">
                                    Finish or correct the invalid email address before sharing.
                                </div>
                            )}
                        </div>
                        <div className="share-section">
                            <label className="share-section-title" htmlFor="external-share-message">Optional message for external users</label>
                            <textarea
                                id="external-share-message"
                                className="share-external-input"
                                value={externalShareMessage}
                                onChange={(e) => setExternalShareMessage(e.target.value)}
                                placeholder="Add a brief greeting or context for external recipients"
                                rows={4}
                                disabled={sharingDocument}
                            />
                            <div className="share-helper-text">
                                This note appears above the usual ESS Design share email and is only sent to external recipients.
                            </div>
                        </div>
                        <div className="share-selection-summary">
                            {selectedShareRecipients.length} internal user{selectedShareRecipients.length === 1 ? '' : 's'} selected, {externalShareRecipients.length + pendingExternalEmails.filter(isValidEmail).length} external recipient{externalShareRecipients.length + pendingExternalEmails.filter(isValidEmail).length === 1 ? '' : 's'} added
                        </div>
                        <div className="modal-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowShareModal(false);
                                    setShareTarget(null);
                                    setSelectedShareRecipients([]);
                                    setExternalShareRecipients([]);
                                    setExternalShareInput('');
                                    setExternalShareMessage('');
                                }}
                                disabled={sharingDocument}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleShareItem}
                                disabled={sharingDocument || loadingShareUsers || (totalShareRecipients === 0 && !externalShareInput.trim()) || invalidExternalInput}
                            >
                                {sharingDocument ? 'Sharing...' : (shareTarget.isDocument ? 'Share PDF' : 'Share Folder')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showUploadModal && (
                <UploadDocumentModal
                    folderId={currentFolder}
                    onClose={() => setShowUploadModal(false)}
                    onSuccess={() => {
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




