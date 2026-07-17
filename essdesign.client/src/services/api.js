import axios from 'axios';
import {
    PICKING_CARD_ROWS,
    formatDayLabel,
    getMaterialDisplayLabel,
    isSectionHeaderEntry,
    normalizeMaterialSpec,
    quantityKey,
    shouldSkipMaterialEntry,
} from './materialOrderSchema';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:7001/api';
const API_ORIGIN_URL = API_BASE_URL.replace(/\/api\/?$/i, '');
const SUPABASE_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_3oESnoF2yG5rix4SSQj8cQ_1aoavcCw';
const PROFILE_IMAGES_BUCKET = 'profile-images';

const optimizeProfileImageUrl = (url) => {
    if (!url || !url.includes('/storage/v1/object/public/')) return url || null;
    const separator = url.includes('?') ? '&' : '?';
    return `${url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}${separator}width=256&height=256&resize=cover&quality=75`;
};
const getPublicStorageUrl = (bucket, objectPath) => optimizeProfileImageUrl(`${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`);

const AVATAR_EXT_CACHE_KEY = 'ess-avatar-ext-v2';
const AVATAR_MISSING_CACHE_TTL_MS = 30 * 60 * 1000;
const avatarLookupInflight = new Map();
const signedStorageUrlCache = new Map();
const signedStorageUrlInflight = new Map();

const profileImageStorageHeaders = (contentType = false) => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {})
});

const getCachedAvatarEntry = (userId) => {
    try {
        const raw = localStorage.getItem(AVATAR_EXT_CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        return cache[userId] ?? null;
    } catch { return null; }
};

const setCachedAvatarEntry = (userId, entry) => {
    try {
        const raw = localStorage.getItem(AVATAR_EXT_CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        cache[userId] = entry;
        localStorage.setItem(AVATAR_EXT_CACHE_KEY, JSON.stringify(cache));
    } catch { /* ignore */ }
};

const resolveProfileImageUrlUncached = async (userId) => {
    const cached = getCachedAvatarEntry(userId);
    const cachedExt = typeof cached === 'string' ? cached : cached?.ext;
    const cachedMissingAt = typeof cached === 'object' ? cached?.missingAt : null;

    if (cachedExt) {
        return getPublicStorageUrl(PROFILE_IMAGES_BUCKET, `${userId}/avatar.${cachedExt}`);
    }

    if (cachedMissingAt && Date.now() - cachedMissingAt < AVATAR_MISSING_CACHE_TTL_MS) {
        return null;
    }

    try {
        const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${PROFILE_IMAGES_BUCKET}`, {
            method: 'POST',
            headers: profileImageStorageHeaders(true),
            body: JSON.stringify({
                prefix: userId,
                limit: 20,
                offset: 0,
                sortBy: { column: 'updated_at', order: 'desc' }
            })
        });

        if (response.ok) {
            const payload = await response.json();
            const rows = Array.isArray(payload) ? payload : payload?.value || [];
            const avatar = rows.find(row => /^avatar\.(jpe?g|png|webp|heic)$/i.test(row?.name || ''));
            const ext = avatar?.name?.split('.').pop()?.toLowerCase();
            if (ext) {
                setCachedAvatarEntry(userId, { ext, missingAt: null });
                return getPublicStorageUrl(PROFILE_IMAGES_BUCKET, `${userId}/avatar.${ext}`);
            }
        }
    } catch {
        // Treat lookup failures as temporarily missing and retry after the short TTL.
    }

    setCachedAvatarEntry(userId, { ext: null, missingAt: Date.now() });
    return null;
};

export const resolveProfileImageUrl = async (userId) => {
    if (!userId) return null;

    if (!avatarLookupInflight.has(userId)) {
        avatarLookupInflight.set(
            userId,
            resolveProfileImageUrlUncached(userId).finally(() => {
                avatarLookupInflight.delete(userId);
            })
        );
    }

    return avatarLookupInflight.get(userId);
};

export const resolveProfileImageUrls = async (userIds = []) => {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    const entries = await Promise.all(uniqueUserIds.map(async (userId) => [userId, await resolveProfileImageUrl(userId)]));
    return Object.fromEntries(entries.filter(([, url]) => Boolean(url)));
};

const hydrateProfileImageUrl = async (user) => {
    const existing = user?.profileImageUrl || user?.profile_image_url || user?.avatarUrl || user?.avatar_url || user?.picture;
    return optimizeProfileImageUrl(existing) || resolveProfileImageUrl(user?.id);
};

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

const clearStoredAuth = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
};

const getJwtExpiryMs = (token) => {
    if (!token) return null;
    try {
        const payloadSegment = token.split('.')[1];
        if (!payloadSegment) return null;
        const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const payload = JSON.parse(window.atob(padded));
        return Number.isFinite(payload?.exp) ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
};

const isAccessTokenFresh = () => {
    const expiresAt = getJwtExpiryMs(localStorage.getItem('access_token'));
    return expiresAt !== null && expiresAt > Date.now() + 2 * 60 * 1000;
};

const storeAuthSession = (authResponse) => {
    if (!authResponse?.accessToken) {
        return;
    }

    if (authResponse.accessToken) {
        localStorage.setItem('access_token', authResponse.accessToken);
    }

    if (authResponse.refreshToken) {
        localStorage.setItem('refresh_token', authResponse.refreshToken);
    }

    if (authResponse.user) {
        localStorage.setItem('user', JSON.stringify(authResponse.user));
    }
};

const consumeAuthCallbackFromUrl = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    const hash = window.location.hash?.replace(/^#/, '');
    if (!hash) {
        return null;
    }

    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const tokenType = hashParams.get('token_type');
    const expiresIn = hashParams.get('expires_in');
    const verificationType = hashParams.get('type');

    if (!accessToken) {
        return null;
    }

    storeAuthSession({
        accessToken,
        refreshToken: refreshToken || '',
        tokenType: tokenType || '',
        expiresIn: expiresIn ? Number(expiresIn) : 0
    });

    const url = new URL(window.location.href);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);

    return {
        hasSession: true,
        verificationType
    };
};

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

let refreshSessionPromise = null;

const refreshAuthSession = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
        clearStoredAuth();
        throw new Error('No refresh token available');
    }

    if (!refreshSessionPromise) {
        refreshSessionPromise = apiClient
            .post('/auth/refresh', { refreshToken })
            .then(async (response) => {
                const resolvedProfileImageUrl = await hydrateProfileImageUrl(response.data.user);
                const hydratedUser = { ...response.data.user, profileImageUrl: resolvedProfileImageUrl };
                const refreshedSession = { ...response.data, user: hydratedUser };
                storeAuthSession(refreshedSession);
                return refreshedSession;
            })
            .catch((error) => {
                clearStoredAuth();
                throw error;
            })
            .finally(() => {
                refreshSessionPromise = null;
            });
    }

    return refreshSessionPromise;
};

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;
        const requestUrl = originalRequest?.url ?? '';

        if (!originalRequest || status !== 401 || originalRequest._retry) {
            return Promise.reject(error);
        }

        const isRefreshRequest = requestUrl.includes('/auth/refresh');
        const isSignInRequest = requestUrl.includes('/auth/signin');
        const isSignUpRequest = requestUrl.includes('/auth/signup');
        const isSignOutRequest = requestUrl.includes('/auth/signout');

        if (isRefreshRequest || isSignInRequest || isSignUpRequest || isSignOutRequest) {
            return Promise.reject(error);
        }

        if (!localStorage.getItem('refresh_token')) {
            clearStoredAuth();
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
            const refreshedSession = await refreshAuthSession();
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers.Authorization = `Bearer ${refreshedSession.accessToken}`;
            return apiClient(originalRequest);
        } catch (refreshError) {
            return Promise.reject(refreshError);
        }
    }
);

export const authAPI = {
    signUp: async (email, password, fullName, employeeId = null) => {
        const response = await apiClient.post('/auth/signup', { email, password, fullName, employeeId });
        const resolvedProfileImageUrl = await hydrateProfileImageUrl(response.data.user);
        const hydratedUser = { ...response.data.user, profileImageUrl: resolvedProfileImageUrl };
        return { ...response.data, user: hydratedUser };
    },

    signIn: async (identifier, password) => {
        const response = await apiClient.post('/auth/signin', { email: identifier, identifier, password });
        const resolvedProfileImageUrl = await hydrateProfileImageUrl(response.data.user);
        const hydratedUser = { ...response.data.user, profileImageUrl: resolvedProfileImageUrl };
        const signedInSession = { ...response.data, user: hydratedUser };
        storeAuthSession(signedInSession);
        return signedInSession;
    },

    signOut: async () => {
        try {
            await apiClient.post('/auth/signout');
        } finally {
            clearStoredAuth();
        }
    },

    getCurrentUser: () => {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },


    refreshCurrentUser: async () => {
        try {
            const response = await apiClient.get('/auth/user');
            const resolvedProfileImageUrl = await hydrateProfileImageUrl(response.data);
            const hydratedUser = { ...response.data, profileImageUrl: resolvedProfileImageUrl };
            if (response.data) {
                localStorage.setItem('user', JSON.stringify(hydratedUser));
            }
            return hydratedUser;
        } catch (error) {
            if (error.response?.status === 401) {
                clearStoredAuth();
            }
            throw error;
        }
    },

    restoreSession: async () => {
        const refreshToken = localStorage.getItem('refresh_token');
        const currentUser = authAPI.getCurrentUser();
        if (isAccessTokenFresh()) {
            if (currentUser) {
                return currentUser;
            }

            return authAPI.refreshCurrentUser();
        }

        if (!refreshToken) {
            clearStoredAuth();
            throw new Error('No refresh token available');
        }

        const refreshedSession = await refreshAuthSession();
        return refreshedSession.user ?? currentUser;
    },
    consumeAuthCallbackFromUrl,
    isAuthenticated: () => {
        return !!localStorage.getItem('access_token');
    },

    isAdmin: () => {
        const user = authAPI.getCurrentUser();
        return user?.role === 'admin';
    },

    inviteUser: async (email) => {
        const response = await apiClient.post('/auth/invite', { email });
        return response.data;
    },

    createTruckDeviceUser: async ({ deviceId, fullName, password, role }) => {
        const response = await apiClient.post('/auth/create-device-user', { deviceId, fullName, password, role });
        return response.data;
    },

    inviteEmployee: async ({ employeeId, email, firstName, lastName }) => {
        const response = await apiClient.post('/auth/invite-employee', { employeeId, email, firstName, lastName });
        return response.data;
    },

    linkEmployee: async (employeeId) => {
        const response = await apiClient.post('/auth/link-employee', { employeeId });
        return response.data;
    },

    syncEmployeeLinks: async () => {
        const response = await apiClient.post('/auth/sync-employee-links');
        return response.data;
    }
};

const SUPABASE_REST_BASE = `${SUPABASE_URL}/rest/v1`;
const SAFETY_BUCKET = 'project-information';
const ESS_NEWS_BUCKET = 'ess-news';
const SAFETY_PROJECTS_PATH = 'projects.json';
const DEFAULT_SCAFFOLD_ENTITY = 'Erect Safe Scaffolding';
const SCAFFOLD_ENTITIES = new Set(['Erect Safe Scaffolding', 'Maloo Access Group', 'Scaff-Technic']);
const BUILDER_LOGOS_PREFIX = 'builder-logos';

const currentSupabaseBearer = () => localStorage.getItem('access_token') || SUPABASE_ANON_KEY;

const supabaseRestHeaders = (contentType = false, upsert = false) => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${currentSupabaseBearer()}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    ...(upsert ? { Prefer: 'resolution=merge-duplicates,return=representation' } : {})
});

const storageHeaders = (contentType = false) => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${currentSupabaseBearer()}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {})
});

const anonStorageHeaders = (contentType = false) => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {})
});

const nowIso = () => new Date().toISOString();
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const safetyProjectsObjectUrl = () => `${SUPABASE_URL}/storage/v1/object/${SAFETY_BUCKET}/${SAFETY_PROJECTS_PATH}`;
const safetyProjectsObjectUpsertUrl = () => `${safetyProjectsObjectUrl()}?upsert=true`;
const safetyBucketListUrl = () => `${SUPABASE_URL}/storage/v1/object/list/${SAFETY_BUCKET}`;
const builderLogoUrlCache = new Map();
const BUILDER_LOGO_URL_CACHE_KEY = 'ess-builder-logo-url-cache-v1';

export const MATERIAL_ORDER_REQUESTS_CHANGED_EVENT = 'ess-material-order-requests-changed';
export const SAFETY_PROJECTS_CHANGED_EVENT = 'ess-safety-projects-changed';

let verifiedSafetyBucket = false;
const storageJsonCache = new Map();
const MATERIAL_REQUEST_INDEX_PATH = 'material-order-requests/index.json';
const MATERIAL_ORDER_REQUESTS_TABLE = 'ess_material_order_requests';
const TRUCK_LIVE_LOCATIONS_TABLE = 'ess_truck_live_locations';
const TRUCK_LOCATION_HISTORY_TABLE = 'ess_truck_location_history';
const MATERIAL_REQUEST_CACHE_TTL_MS = 60 * 1000;
const SAFETY_PROJECTS_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_STORAGE_JSON_CACHE_TTL_MS = 60 * 1000;
const MISSING_STORAGE_JSON_CACHE_TTL_MS = 15 * 60 * 1000;
const STORAGE_JSON_REQUEST_TIMEOUT_MS = 15 * 1000;
const STORAGE_JSON_CACHE_SYNC_CHANNEL = 'ess-storage-json-cache-sync';
const STORAGE_JSON_CACHE_SYNC_KEY = 'ess-storage-json-cache-sync-message';
const MATERIAL_REQUEST_INDEX_WRITE_LOCK_NAME = 'ess-material-request-index-write';
const storageJsonCacheTabId = makeId();
const seenStorageJsonSyncMessages = new Set();
let storageJsonBroadcastChannel = null;
let materialRequestIndexWriteQueue = Promise.resolve();
let safetyProjectsWriteQueue = Promise.resolve();
let materialOrderRequestsTableAvailable = null;
let materialOrderRequestsTableSeedPromise = null;

function getStorageJsonCacheTtl(path) {
    if (path === MATERIAL_REQUEST_INDEX_PATH) {
        return MATERIAL_REQUEST_CACHE_TTL_MS;
    }
    if (path === SAFETY_PROJECTS_PATH) {
        return SAFETY_PROJECTS_CACHE_TTL_MS;
    }
    if (String(path || '').startsWith('material-order-requests/requests/')) {
        return MATERIAL_REQUEST_CACHE_TTL_MS;
    }
    return DEFAULT_STORAGE_JSON_CACHE_TTL_MS;
}

function cloneJsonValue(value) {
    if (value == null) {
        return value;
    }
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            // Fall back to JSON cloning below.
        }
    }
    return JSON.parse(JSON.stringify(value));
}

function setStorageJsonCache(path, value, ttlMs = getStorageJsonCacheTtl(path)) {
    if (!path || ttlMs <= 0) {
        return;
    }
    storageJsonCache.set(path, {
        value: cloneJsonValue(value),
        expiresAt: Date.now() + ttlMs,
        promise: null
    });
}

function invalidateStorageJsonCache(path) {
    if (path) {
        storageJsonCache.delete(path);
    }
}

function dispatchBrowserEvent(name, detail = {}) {
    if (typeof window === 'undefined') {
        return;
    }
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function getJitteredPollingDelay(baseMs, jitterMinMs = 1000, jitterMaxMs = 3000) {
    const min = Math.max(0, jitterMinMs);
    const max = Math.max(min, jitterMaxMs);
    const offset = min + Math.random() * (max - min);
    const direction = Math.random() < 0.5 ? -1 : 1;
    return Math.max(1000, Math.round(baseMs + (direction * offset)));
}

function isMaterialOrderStoragePath(path) {
    return String(path || '').startsWith('material-order-requests/');
}

function emitStorageJsonLocalChange(path) {
    if (path === MATERIAL_REQUEST_INDEX_PATH || isMaterialOrderStoragePath(path)) {
        dispatchBrowserEvent(MATERIAL_ORDER_REQUESTS_CHANGED_EVENT, { path });
    }
    if (path === SAFETY_PROJECTS_PATH) {
        dispatchBrowserEvent(SAFETY_PROJECTS_CHANGED_EVENT, { path });
    }
}

function noteStorageJsonSyncMessage(messageId) {
    if (!messageId) {
        return false;
    }
    if (seenStorageJsonSyncMessages.has(messageId)) {
        return true;
    }
    seenStorageJsonSyncMessages.add(messageId);
    if (seenStorageJsonSyncMessages.size > 100) {
        const [oldest] = seenStorageJsonSyncMessages;
        seenStorageJsonSyncMessages.delete(oldest);
    }
    return false;
}

function getStorageJsonBroadcastChannel() {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') {
        return null;
    }
    if (!storageJsonBroadcastChannel) {
        storageJsonBroadcastChannel = new window.BroadcastChannel(STORAGE_JSON_CACHE_SYNC_CHANNEL);
        storageJsonBroadcastChannel.addEventListener('message', (event) => {
            handleExternalStorageJsonSyncMessage(event.data);
        });
    }
    return storageJsonBroadcastChannel;
}

function handleExternalStorageJsonSyncMessage(message) {
    if (!message || message.type !== 'storage-json-changed' || message.tabId === storageJsonCacheTabId) {
        return;
    }
    if (noteStorageJsonSyncMessage(message.id)) {
        return;
    }
    invalidateStorageJsonCache(message.path);
    emitStorageJsonLocalChange(message.path);
}

function broadcastStorageJsonChanged(path) {
    if (typeof window === 'undefined' || !path) {
        return;
    }
    const message = {
        type: 'storage-json-changed',
        id: makeId(),
        tabId: storageJsonCacheTabId,
        path,
        at: Date.now()
    };
    noteStorageJsonSyncMessage(message.id);
    try {
        getStorageJsonBroadcastChannel()?.postMessage(message);
    } catch {
        // BroadcastChannel is optional; localStorage is the fallback below.
    }
    try {
        window.localStorage.setItem(STORAGE_JSON_CACHE_SYNC_KEY, JSON.stringify(message));
    } catch {
        // Best-effort cross-tab notification.
    }
}

function emitStorageJsonChanged(path, { broadcast = true } = {}) {
    emitStorageJsonLocalChange(path);
    if (broadcast) {
        broadcastStorageJsonChanged(path);
    }
}

function setupStorageJsonCrossTabSync() {
    if (typeof window === 'undefined') {
        return;
    }
    getStorageJsonBroadcastChannel();
    window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_JSON_CACHE_SYNC_KEY || !event.newValue) {
            return;
        }
        try {
            handleExternalStorageJsonSyncMessage(JSON.parse(event.newValue));
        } catch {
            // Ignore malformed cache sync messages.
        }
    });
}

setupStorageJsonCrossTabSync();

async function withMaterialRequestIndexWriteLock(callback) {
    const runLocked = async () => {
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
            return navigator.locks.request(
                MATERIAL_REQUEST_INDEX_WRITE_LOCK_NAME,
                { mode: 'exclusive' },
                callback
            );
        }
        return callback();
    };

    const queued = materialRequestIndexWriteQueue.then(runLocked, runLocked);
    materialRequestIndexWriteQueue = queued.catch(() => {});
    return queued;
}

function cacheUploadedStorageJson(path, body, contentType) {
    if (!String(contentType || '').includes('application/json')) {
        return;
    }
    if (typeof body !== 'string') {
        invalidateStorageJsonCache(path);
        emitStorageJsonChanged(path);
        return;
    }
    try {
        setStorageJsonCache(path, JSON.parse(body));
    } catch {
        invalidateStorageJsonCache(path);
    }
    emitStorageJsonChanged(path);
}

async function ensureSafetyBucketAccess() {
    if (verifiedSafetyBucket) {
        return;
    }

    const response = await fetch(safetyBucketListUrl(), {
        method: 'POST',
        headers: storageHeaders(true),
        body: JSON.stringify({ prefix: '', limit: 1, offset: 0 })
    });

    if (response.ok) {
        verifiedSafetyBucket = true;
        return;
    }

    const details = await response.text();
    throw new Error(details || `Unable to access bucket "${SAFETY_BUCKET}"`);
}

function parseSafetyProjects(raw) {
    if (Array.isArray(raw)) {
        return {
            builders: raw
                .filter(item => item && typeof item.name === 'string')
                .map(item => ({
                    id: item.id || makeId(),
                    name: item.name.trim(),
                    logoUrl: item.logoUrl || item.logo_url || '',
                    logoPath: item.logoPath || item.logo_path || '',
                    designFolderId: item.designFolderId || item.design_folder_id || '',
                    designFolderPath: item.designFolderPath || item.design_folder_path || '',
                    projects: [],
                    createdAt: item.createdAt || nowIso(),
                    updatedAt: item.updatedAt || nowIso()
                })),
            drawingRegisterEntries: [],
            updatedAt: nowIso()
        };
    }

    if (raw && typeof raw === 'object' && Array.isArray(raw.builders)) {
        return {
            builders: raw.builders
                .filter(builder => builder && typeof builder.name === 'string')
                .map(builder => ({
                    id: builder.id || makeId(),
                    name: builder.name.trim(),
                    logoUrl: builder.logoUrl || builder.logo_url || '',
                    logoPath: builder.logoPath || builder.logo_path || '',
                    designFolderId: builder.designFolderId || builder.design_folder_id || '',
                    designFolderPath: builder.designFolderPath || builder.design_folder_path || '',
                    projects: Array.isArray(builder.projects)
                        ? builder.projects
                            .filter(project => project && typeof project.name === 'string')
                            .map(project => ({
                                id: project.id || makeId(),
                                name: project.name.trim(),
                                archived: Boolean(project.archived),
                                archivedAt: project.archivedAt || null,
                                siteLocation: (project.siteLocation || '').trim(),
                                designFolderId: project.designFolderId || project.design_folder_id || '',
                                designFolderPath: project.designFolderPath || project.design_folder_path || '',
                                scaffoldEntity: normalizeScaffoldEntity(project.scaffoldEntity || project.scaffold_entity),
                                projectManagerUserId: project.projectManagerUserId || project.project_manager_user_id || '',
                                siteSupervisorUserId: project.siteSupervisorUserId || project.site_supervisor_user_id || '',
                                leadingHandUserId: project.leadingHandUserId || project.leading_hand_user_id || '',
                                projectManagerEmployeeId: project.projectManagerEmployeeId || project.project_manager_employee_id || '',
                                siteSupervisorEmployeeId: project.siteSupervisorEmployeeId || project.site_supervisor_employee_id || '',
                                leadingHandEmployeeId: project.leadingHandEmployeeId || project.leading_hand_employee_id || '',
                                inductedEmployeeIds: Array.isArray(project.inductedEmployeeIds)
                                    ? project.inductedEmployeeIds.filter(Boolean)
                                    : Array.isArray(project.inducted_employee_ids)
                                        ? project.inducted_employee_ids.filter(Boolean)
                                        : null,
                                drawingNumbers: Array.from(new Set(
                                    (Array.isArray(project.drawingNumbers)
                                        ? project.drawingNumbers
                                        : Array.isArray(project.drawing_numbers)
                                            ? project.drawing_numbers
                                            : [])
                                        .map(value => String(value || '').trim().toUpperCase())
                                        .filter(Boolean)
                                )),
                                createdAt: project.createdAt || nowIso(),
                                updatedAt: project.updatedAt || nowIso()
                            }))
                            .sort((a, b) => a.name.localeCompare(b.name))
                        : [],
                    createdAt: builder.createdAt || nowIso(),
                    updatedAt: builder.updatedAt || nowIso()
                }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            drawingRegisterEntries: Array.isArray(raw.drawingRegisterEntries)
                ? raw.drawingRegisterEntries.map((entry, index) => ({
                    id: String(entry?.id || `drawing-${index}`),
                    builderId: String(entry?.builderId || entry?.builder_id || ''),
                    projectId: String(entry?.projectId || entry?.project_id || ''),
                    client: String(entry?.client || '').trim(),
                    project: String(entry?.project || '').trim(),
                    design: String(entry?.design || '').trim(),
                    drawingNo: String(entry?.drawingNo || entry?.drawing_no || '').trim(),
                    dateIssued: String(entry?.dateIssued || entry?.date_issued || '').trim(),
                    revisionNo: String(entry?.revisionNo || entry?.revision_no || '').trim(),
                    designUse: String(entry?.designUse || entry?.design_use || '').trim()
                }))
                : [],
            updatedAt: raw.updatedAt || nowIso()
        };
    }

    return { builders: [], drawingRegisterEntries: [], updatedAt: nowIso() };
}

function resolveDrawingRegisterEntries(doc) {
    return (doc.drawingRegisterEntries || []).map(entry => {
        const builder = doc.builders.find(item => item.id === entry.builderId);
        const project = builder?.projects.find(item => item.id === entry.projectId);
        return {
            ...entry,
            client: builder?.name || entry.client || '',
            project: project?.name || entry.project || ''
        };
    });
}

function cloneSafetyBuilders(builders, { includeArchived = true } = {}) {
    return builders.map(builder => ({
        ...builder,
        projects: builder.projects
            .filter(project => includeArchived || !project.archived)
            .map(project => ({ ...project }))
    }));
}

function normalizeScaffoldEntity(value) {
    const clean = String(value || '').trim();
    if (!clean) {
        return DEFAULT_SCAFFOLD_ENTITY;
    }
    const matched = Array.from(SCAFFOLD_ENTITIES).find(entity => entity.toLowerCase() === clean.toLowerCase());
    return matched || DEFAULT_SCAFFOLD_ENTITY;
}

function normalizeDesignFolderMatchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(nsw|australia|project|development|developments|site|the|pty|ltd)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function matchTokens(value) {
    return normalizeDesignFolderMatchText(value)
        .split(' ')
        .filter(token => token.length > 2);
}

function scoreDesignFolderNameMatch(source, candidate) {
    const cleanSource = normalizeDesignFolderMatchText(source);
    const cleanCandidate = normalizeDesignFolderMatchText(candidate);
    if (!cleanSource || !cleanCandidate) return 0;
    if (cleanSource === cleanCandidate) return 1;
    if (cleanCandidate.includes(cleanSource) || cleanSource.includes(cleanCandidate)) {
        return 0.92;
    }

    const sourceTokens = new Set(matchTokens(cleanSource));
    const candidateTokens = new Set(matchTokens(cleanCandidate));
    if (!sourceTokens.size || !candidateTokens.size) return 0;
    const overlap = [...sourceTokens].filter(token => candidateTokens.has(token)).length;
    const precision = overlap / candidateTokens.size;
    const recall = overlap / sourceTokens.size;
    return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
}

function optionPath(option) {
    return option?.path || option?.name || '';
}

function uppercaseDesignFolderName(value, fallback = 'UNTITLED') {
    return (String(value || '').trim() || fallback).toUpperCase();
}

function findBestDesignFolderMatch(name, folders, getCandidateText, minimumScore) {
    return folders
        .map(folder => ({
            folder,
            score: scoreDesignFolderNameMatch(name, getCandidateText(folder))
        }))
        .filter(item => item.score >= minimumScore)
        .sort((left, right) => right.score - left.score || optionPath(left.folder).length - optionPath(right.folder).length)
        [0]?.folder || null;
}

function folderLinkPayload(folder) {
    return {
        designFolderId: folder?.id || '',
        designFolderPath: optionPath(folder)
    };
}

function isProjectDesignFolder(folder) {
    return Number(folder?.depth || 0) === 2;
}

function buildDesignFolderOption(folder, parent = null) {
    const depth = parent ? Number(parent.depth || 1) + 1 : 1;
    const path = parent ? `${optionPath(parent)} / ${folder.name}` : folder.name;
    return {
        id: folder.id,
        name: folder.name,
        parentFolderId: folder.parentFolderId || folder.parent_folder_id || parent?.id || null,
        path,
        depth,
        builderName: depth >= 1 ? path.split(' / ')[0] : '',
        projectName: depth >= 2 ? path.split(' / ')[1] : '',
        scaffoldName: depth >= 3 ? path.split(' / ')[2] : '',
        updatedAt: folder.updatedAt || folder.updated_at || nowIso()
    };
}

async function createDesignFolderOption(name, parent = null) {
    const response = await apiClient.post('/folders', {
        name: uppercaseDesignFolderName(name),
        parentFolderId: parent?.id || null,
        userId: authAPI.getCurrentUser()?.id
    });
    return buildDesignFolderOption(response.data, parent);
}

const sanitizeStorageFileName = (value, fallback = 'logo') => {
    const clean = String(value || '')
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return clean || fallback;
};

async function uploadBuilderLogoFile(builderId, file) {
    if (!builderId || !file) {
        return '';
    }

    const fileName = sanitizeStorageFileName(file.name || 'logo');
    const objectPath = `${BUILDER_LOGOS_PREFIX}/${builderId}/${Date.now()}-${fileName}`;
    await uploadStorageObject(objectPath, file, file.type || 'application/octet-stream');
    builderLogoUrlCache.delete(objectPath);
    forgetPersistedBuilderLogoUrl(objectPath);
    return objectPath;
}

function readPersistedBuilderLogoUrl(logoPath) {
    if (typeof window === 'undefined' || !logoPath) {
        return '';
    }
    try {
        const cache = JSON.parse(window.localStorage.getItem(BUILDER_LOGO_URL_CACHE_KEY) || '{}');
        const cached = cache?.[logoPath];
        if (!cached?.url || !cached?.expiresAt || cached.expiresAt <= Date.now()) {
            return '';
        }
        builderLogoUrlCache.set(logoPath, cached);
        return cached.url;
    } catch {
        return '';
    }
}

function persistBuilderLogoUrl(logoPath, value) {
    if (typeof window === 'undefined' || !logoPath || !value?.url) {
        return;
    }
    try {
        const cache = JSON.parse(window.localStorage.getItem(BUILDER_LOGO_URL_CACHE_KEY) || '{}');
        cache[logoPath] = value;
        window.localStorage.setItem(BUILDER_LOGO_URL_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // In-memory cache still applies for this session.
    }
}

function forgetPersistedBuilderLogoUrl(logoPath) {
    if (typeof window === 'undefined' || !logoPath) {
        return;
    }
    try {
        const cache = JSON.parse(window.localStorage.getItem(BUILDER_LOGO_URL_CACHE_KEY) || '{}');
        delete cache[logoPath];
        window.localStorage.setItem(BUILDER_LOGO_URL_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // Best effort only.
    }
}

async function resolveBuilderLogoUrl(builder, { expiresIn = 86400 } = {}) {
    if (!builder) {
        return '';
    }

    const legacyLogoUrl = builder.logoUrl || builder.logo_url || '';
    const logoPath = builder.logoPath || builder.logo_path || '';
    if (!logoPath) {
        return legacyLogoUrl;
    }

    const cached = builderLogoUrlCache.get(logoPath);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }

    const persistedUrl = readPersistedBuilderLogoUrl(logoPath);
    if (persistedUrl) {
        return persistedUrl;
    }

    const url = await signedStorageUrl(logoPath, expiresIn);
    const cacheEntry = {
        url,
        expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1000
    };
    builderLogoUrlCache.set(logoPath, cacheEntry);
    persistBuilderLogoUrl(logoPath, cacheEntry);
    return url;
}

async function saveSafetyProjectsDocument(doc) {
    await ensureSafetyBucketAccess();
    let nextDocument = doc;
    if (!Object.prototype.hasOwnProperty.call(doc, 'drawingRegisterEntries')) {
        const current = parseSafetyProjects(await readStorageJson(SAFETY_PROJECTS_PATH, { force: true, ttlMs: SAFETY_PROJECTS_CACHE_TTL_MS }));
        nextDocument = { ...doc, drawingRegisterEntries: current.drawingRegisterEntries };
    }
    const payload = JSON.stringify(nextDocument);
    const attempts = [
        { method: 'POST', url: safetyProjectsObjectUrl(), headers: { ...storageHeaders(true), 'x-upsert': 'true' } },
        { method: 'POST', url: safetyProjectsObjectUpsertUrl(), headers: storageHeaders(true) },
        { method: 'PUT', url: safetyProjectsObjectUrl(), headers: { ...storageHeaders(true), 'x-upsert': 'true' } }
    ];

    let lastError = '';
    for (const attempt of attempts) {
        const response = await fetch(attempt.url, {
            method: attempt.method,
            headers: attempt.headers,
            body: payload
        });

        if (response.ok) {
            setStorageJsonCache(SAFETY_PROJECTS_PATH, nextDocument, SAFETY_PROJECTS_CACHE_TTL_MS);
            emitStorageJsonChanged(SAFETY_PROJECTS_PATH);
            return;
        }

        lastError = await response.text();
    }

    throw new Error(lastError || 'Failed to save safety projects');
}

async function withSafetyProjectsWriteLock(callback) {
    const runLocked = async () => {
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
            return navigator.locks.request('ess-safety-projects-write', { mode: 'exclusive' }, callback);
        }
        return callback();
    };
    const queued = safetyProjectsWriteQueue.then(runLocked, runLocked);
    safetyProjectsWriteQueue = queued.catch(() => {});
    return queued;
}

const restEndpoint = (table, query = '') => `${SUPABASE_REST_BASE}/${table}${query}`;

async function readRestRows(table, query = '', options = {}) {
    const { force = false } = options;
    const response = await fetch(restEndpoint(table, query), {
        method: 'GET',
        headers: supabaseRestHeaders(),
        cache: force ? 'no-store' : 'default'
    });
    if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Failed to read ${table}`);
    }
    return response.json();
}

async function postRestRows(table, rows, onConflict) {
    const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    const response = await fetch(restEndpoint(table, query), {
        method: 'POST',
        headers: supabaseRestHeaders(true, true),
        body: JSON.stringify(rows)
    });
    if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Failed to write ${table}`);
    }
    return response.json();
}

async function patchRestRows(table, query, payload) {
    const response = await fetch(restEndpoint(table, query), {
        method: 'PATCH',
        headers: { ...supabaseRestHeaders(true), Prefer: 'return=representation' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Failed to update ${table}`);
    }
    return response.json();
}

async function deleteRestRows(table, query) {
    const response = await fetch(restEndpoint(table, query), {
        method: 'DELETE',
        headers: supabaseRestHeaders()
    });
    if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Failed to delete from ${table}`);
    }
}

function parseOptionalJson(value, fallback = null) {
    if (value == null) {
        return fallback;
    }
    if (typeof value === 'object') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function normalizeNumberOrNull(value) {
    if (value == null || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function mapTruckLiveLocationRow(row) {
    if (!row) {
        return null;
    }
    const latitude = normalizeNumberOrNull(row.latitude);
    const longitude = normalizeNumberOrNull(row.longitude);
    if (latitude === null || longitude === null) {
        return null;
    }
    return {
        truckId: row.truck_id || row.truckId || '',
        truckLabel: row.truck_label || row.truckLabel || '',
        roleName: row.role_name || row.roleName || '',
        driverUserId: row.driver_user_id || row.driverUserId || null,
        deliveryRequestId: row.delivery_request_id || row.deliveryRequestId || null,
        latitude,
        longitude,
        accuracyM: normalizeNumberOrNull(row.accuracy_m ?? row.accuracyM),
        headingDeg: normalizeNumberOrNull(row.heading_deg ?? row.headingDeg ?? row.heading),
        speedMps: normalizeNumberOrNull(row.speed_mps ?? row.speedMps ?? row.speed),
        batteryPercent: normalizeNumberOrNull(row.battery_percent ?? row.batteryPercent ?? row.battery_level),
        status: row.status || '',
        routePath: parseOptionalJson(row.route_path ?? row.routePath, []),
        recordedAt: row.recorded_at || row.recordedAt || row.updated_at || row.updatedAt || null,
        updatedAt: row.updated_at || row.updatedAt || null,
    };
}

function mapTruckLocationHistoryRow(row) {
    if (!row) {
        return null;
    }
    const latitude = normalizeNumberOrNull(row.latitude);
    const longitude = normalizeNumberOrNull(row.longitude);
    if (latitude === null || longitude === null) {
        return null;
    }
    return {
        id: row.id || row.client_point_id || '',
        clientPointId: row.client_point_id || row.clientPointId || null,
        truckId: row.truck_id || row.truckId || '',
        truckLabel: row.truck_label || row.truckLabel || '',
        roleName: row.role_name || row.roleName || '',
        driverUserId: row.driver_user_id || row.driverUserId || null,
        deliveryRequestId: row.delivery_request_id || row.deliveryRequestId || null,
        latitude,
        longitude,
        accuracyM: normalizeNumberOrNull(row.accuracy_m ?? row.accuracyM),
        headingDeg: normalizeNumberOrNull(row.heading_deg ?? row.headingDeg ?? row.heading),
        speedMps: normalizeNumberOrNull(row.speed_mps ?? row.speedMps ?? row.speed),
        batteryPercent: normalizeNumberOrNull(row.battery_percent ?? row.batteryPercent ?? row.battery_level),
        status: row.status || '',
        trackingState: row.tracking_state || row.trackingState || '',
        motionState: row.motion_state || row.motionState || '',
        recordedAt: row.recorded_at || row.recordedAt || null,
        uploadedAt: row.uploaded_at || row.uploadedAt || null,
    };
}

function mapTruckLiveLocationToRow(location) {
    return {
        truck_id: location.truckId,
        truck_label: location.truckLabel || '',
        role_name: location.roleName || '',
        driver_user_id: location.driverUserId || null,
        delivery_request_id: location.deliveryRequestId || null,
        latitude: normalizeNumberOrNull(location.latitude),
        longitude: normalizeNumberOrNull(location.longitude),
        accuracy_m: normalizeNumberOrNull(location.accuracyM),
        heading_deg: normalizeNumberOrNull(location.headingDeg),
        speed_mps: normalizeNumberOrNull(location.speedMps),
        battery_percent: normalizeNumberOrNull(location.batteryPercent),
        status: location.status || '',
        recorded_at: location.recordedAt || nowIso(),
    };
}

function isMissingTruckLiveLocationsTableError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes(TRUCK_LIVE_LOCATIONS_TABLE)
        && (
            message.includes('pgrst205')
            || message.includes('schema cache')
            || message.includes('could not find')
            || message.includes('does not exist')
            || message.includes('not found')
        );
}

function isMissingTruckLocationHistoryTableError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes(TRUCK_LOCATION_HISTORY_TABLE)
        && (
            message.includes('pgrst205')
            || message.includes('schema cache')
            || message.includes('could not find')
            || message.includes('does not exist')
            || message.includes('not found')
        );
}

export const truckLiveLocationsAPI = {
    getLatest: async ({ force = true } = {}) => {
        const select = [
            'truck_id',
            'truck_label',
            'role_name',
            'driver_user_id',
            'delivery_request_id',
            'latitude',
            'longitude',
            'accuracy_m',
            'heading_deg',
            'speed_mps',
            'battery_percent',
            'status',
            'route_path',
            'recorded_at',
            'updated_at',
        ].join(',');
        let rows = [];
        try {
            rows = await readRestRows(TRUCK_LIVE_LOCATIONS_TABLE, `?select=${select}&order=recorded_at.desc&limit=24`, { force });
        } catch (error) {
            if (isMissingTruckLiveLocationsTableError(error)) {
                throw new Error('Live truck tracking table is not deployed yet. Run database/migrations/022_add_truck_live_locations.sql in Supabase, then refresh this page.');
            }
            throw error;
        }
        const latestByTruck = new Map();
        (Array.isArray(rows) ? rows : [])
            .map(mapTruckLiveLocationRow)
            .filter(Boolean)
            .forEach(location => {
                const key = location.truckId || location.truckLabel;
                if (key && !latestByTruck.has(key)) {
                    latestByTruck.set(key, location);
                }
            });
        return Array.from(latestByTruck.values());
    },

    upsertLocation: async (location) => {
        if (!location?.truckId) {
            throw new Error('Truck id is required to publish live location.');
        }
        const row = mapTruckLiveLocationToRow(location);
        if (row.latitude === null || row.longitude === null) {
            throw new Error('Latitude and longitude are required to publish live location.');
        }
        let rows = [];
        try {
            rows = await postRestRows(TRUCK_LIVE_LOCATIONS_TABLE, [row], 'truck_id');
        } catch (error) {
            if (isMissingTruckLiveLocationsTableError(error)) {
                throw new Error('Live truck tracking table is not deployed yet. Run database/migrations/022_add_truck_live_locations.sql in Supabase.');
            }
            throw error;
        }
        return mapTruckLiveLocationRow(Array.isArray(rows) ? rows[0] : rows) || mapTruckLiveLocationRow(row);
    },

    getHistory: async ({ truckId, truckLabel, fromIso, toIso, limit = 5000, order = 'recorded_at.asc', force = true } = {}) => {
        const cleanTruckId = String(truckId || '').trim();
        const cleanTruckLabel = String(truckLabel || '').trim();
        if (!cleanTruckId && !cleanTruckLabel) {
            throw new Error('Truck id or truck label is required to load GPS breadcrumbs.');
        }
        if (!fromIso || !toIso) {
            throw new Error('A start and end time are required to load GPS breadcrumbs.');
        }

        const select = [
            'id',
            'client_point_id',
            'truck_id',
            'truck_label',
            'role_name',
            'driver_user_id',
            'delivery_request_id',
            'latitude',
            'longitude',
            'accuracy_m',
            'heading_deg',
            'speed_mps',
            'battery_percent',
            'status',
            'tracking_state',
            'motion_state',
            'recorded_at',
            'uploaded_at',
        ].join(',');
        const params = new URLSearchParams();
        params.set('select', select);
        if (cleanTruckId) {
            params.set('truck_id', `eq.${cleanTruckId}`);
        } else {
            params.set('truck_label', `eq.${cleanTruckLabel}`);
        }
        params.append('recorded_at', `gte.${fromIso}`);
        params.append('recorded_at', `lte.${toIso}`);
        params.set('order', order);
        params.set('limit', String(Math.max(1, Math.min(Number(limit) || 5000, 10000))));

        try {
            const rows = await readRestRows(TRUCK_LOCATION_HISTORY_TABLE, `?${params.toString()}`, { force });
            return (Array.isArray(rows) ? rows : [])
                .map(mapTruckLocationHistoryRow)
                .filter(Boolean);
        } catch (error) {
            if (isMissingTruckLocationHistoryTableError(error)) {
                throw new Error('Truck GPS history table is not deployed yet. Run database/migrations/024_add_truck_location_history.sql in Supabase, then refresh this page.');
            }
            throw error;
        }
    },
};

function mapEmployeeRow(row) {
    return {
        id: row.id,
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phoneNumber: row.phone_number || '',
        email: row.email || '',
        leadingHand: Boolean(row.leading_hand),
        linkedAuthUserId: row.linked_auth_user_id || null,
        inviteSentAt: row.invite_sent_at || null,
        verifiedAt: row.verified_at || null,
        verified: Boolean(row.verified_at),
        preferredSiteIds: [row.preferred_site_1, row.preferred_site_2, row.preferred_site_3].filter(Boolean),
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso()
    };
}

export const safetyProjectsAPI = {
    getBuilders: async ({ includeArchived = false, force = false } = {}) => {
        await ensureSafetyBucketAccess();
        const json = await readStorageJson(SAFETY_PROJECTS_PATH, { force, ttlMs: SAFETY_PROJECTS_CACHE_TTL_MS });
        if (!json) return [];
        return cloneSafetyBuilders(parseSafetyProjects(json).builders, { includeArchived });
    },

    getDrawingRegisterEntries: async ({ force = false } = {}) => {
        await ensureSafetyBucketAccess();
        const json = await readStorageJson(SAFETY_PROJECTS_PATH, { force, ttlMs: SAFETY_PROJECTS_CACHE_TTL_MS });
        if (!json) return [];
        return resolveDrawingRegisterEntries(parseSafetyProjects(json));
    },

    saveDrawingRegisterEntries: async (entries = []) => withSafetyProjectsWriteLock(async () => {
        await ensureSafetyBucketAccess();
        const json = await readStorageJson(SAFETY_PROJECTS_PATH, { force: true, ttlMs: SAFETY_PROJECTS_CACHE_TTL_MS });
        const doc = parseSafetyProjects(json);
        const timestamp = nowIso();
        const normalizedEntries = entries.map((entry, index) => {
            const exactBuilder = doc.builders.find(builder => builder.id === entry?.builderId)
                || doc.builders.find(builder => builder.name.toLowerCase() === String(entry?.client || '').trim().toLowerCase());
            const exactProject = exactBuilder?.projects.find(project => project.id === entry?.projectId)
                || exactBuilder?.projects.find(project => project.name.toLowerCase() === String(entry?.project || '').trim().toLowerCase());
            return {
                id: String(entry?.id || `drawing-${index}`),
                builderId: exactBuilder?.id || '',
                projectId: exactProject?.id || '',
                client: exactBuilder?.name || String(entry?.client || '').trim(),
                project: exactProject?.name || String(entry?.project || '').trim(),
                design: String(entry?.design || '').trim(),
                drawingNo: String(entry?.drawingNo || '').trim(),
                dateIssued: String(entry?.dateIssued || '').trim(),
                revisionNo: String(entry?.revisionNo || '').trim(),
                designUse: String(entry?.designUse || '').trim()
            };
        });

        doc.builders.forEach(builder => builder.projects.forEach(project => {
            project.drawingNumbers = [];
        }));
        normalizedEntries.forEach(entry => {
            const drawingNumber = String(entry.drawingNo || '').trim().match(/^[A-Z0-9]+-[A-Z0-9]+-ESD\d+/i)?.[0]?.toUpperCase();
            const builder = doc.builders.find(item => item.id === entry.builderId);
            const project = builder?.projects.find(item => item.id === entry.projectId);
            if (!drawingNumber || !project) return;
            project.drawingNumbers = Array.from(new Set([...(project.drawingNumbers || []), drawingNumber]));
            project.updatedAt = timestamp;
            builder.updatedAt = timestamp;
        });

        doc.drawingRegisterEntries = normalizedEntries;
        doc.updatedAt = timestamp;
        await saveSafetyProjectsDocument(doc);
        return resolveDrawingRegisterEntries(doc);
    }),

    autoLinkDesignFolders: async (designFolders = [], { createMissing = false, createMissingBuilderId = '', createMissingProjectId = '' } = {}) => withSafetyProjectsWriteLock(async () => {
        const folderOptions = Array.isArray(designFolders) ? [...designFolders] : [];

        await ensureSafetyBucketAccess();
        const json = await readStorageJson(SAFETY_PROJECTS_PATH, { force: true, ttlMs: SAFETY_PROJECTS_CACHE_TTL_MS });
        const doc = parseSafetyProjects(json);
        const timestamp = nowIso();
        let changed = false;

        const getBuilderFolders = () => folderOptions.filter(folder => Number(folder.depth || 0) <= 1);
        const getSiteFolders = () => folderOptions.filter(folder => Number(folder.depth || 0) === 2);

        for (const builder of doc.builders) {
            let builderFolder = builder.designFolderId
                ? folderOptions.find(folder => folder.id === builder.designFolderId) || null
                : null;

            if (!builderFolder) {
                builderFolder = findBestDesignFolderMatch(
                    builder.name,
                    getBuilderFolders(),
                    folder => folder.builderName || folder.name || folder.path,
                    0.78);
            }

            const canCreateBuilderFolder = createMissing
                && (builder.id === createMissingBuilderId
                    || builder.projects.some(project => project.id === createMissingProjectId));
            if (!builderFolder) {
                if (!canCreateBuilderFolder) {
                    continue;
                }
                builderFolder = await createDesignFolderOption(builder.name);
                folderOptions.push(builderFolder);
            }

            if (!builder.designFolderId) {
                Object.assign(builder, folderLinkPayload(builderFolder));
                builder.updatedAt = timestamp;
                changed = true;
            }

            for (const project of builder.projects) {
                if (project.designFolderId) {
                    const existingProjectFolder = folderOptions.find(folder => folder.id === project.designFolderId) || null;
                    if (isProjectDesignFolder(existingProjectFolder)) {
                        continue;
                    }
                    project.designFolderId = '';
                    project.designFolderPath = '';
                    project.updatedAt = timestamp;
                    builder.updatedAt = timestamp;
                    changed = true;
                }

                if (project.designFolderId) {
                    continue;
                }

                const siteFolders = getSiteFolders();
                const scopedSiteFolders = builderFolder
                    ? siteFolders.filter(folder => folder.path?.startsWith(`${optionPath(builderFolder)} /`))
                    : siteFolders.filter(folder => scoreDesignFolderNameMatch(builder.name, folder.builderName || folder.path) >= 0.78);
                const candidates = scopedSiteFolders.length ? scopedSiteFolders : siteFolders;
                let projectFolder = findBestDesignFolderMatch(
                    project.name,
                    candidates,
                    folder => [folder.projectName, folder.path].filter(Boolean).join(' '),
                    0.78);

                if (!projectFolder) {
                    if (!createMissing || project.id !== createMissingProjectId) {
                        continue;
                    }
                    projectFolder = await createDesignFolderOption(project.name, builderFolder);
                    folderOptions.push(projectFolder);
                }

                Object.assign(project, folderLinkPayload(projectFolder));
                project.updatedAt = timestamp;
                builder.updatedAt = timestamp;
                changed = true;
            }
        }

        if (changed) {
            doc.updatedAt = timestamp;
            await saveSafetyProjectsDocument(doc);
        }

        return cloneSafetyBuilders(doc.builders, { includeArchived: true });
    }),

    createBuilderAndProject: async (builderName, projectName) => {
        const cleanBuilder = builderName.trim();
        const cleanProject = projectName.trim();
        if (!cleanBuilder || !cleanProject) {
            throw new Error('Builder and project names are required');
        }

        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const existingBuilder = builders.find(builder => builder.name.toLowerCase() === cleanBuilder.toLowerCase());
        const timestamp = nowIso();

        if (existingBuilder) {
            const duplicateProject = existingBuilder.projects.some(project => project.name.toLowerCase() === cleanProject.toLowerCase());
            if (duplicateProject) {
                throw new Error('This project already exists under that builder');
            }
            existingBuilder.projects.push({
                id: makeId(),
                name: cleanProject,
                drawingNumbers: [],
                archived: false,
                archivedAt: null,
                designFolderId: '',
                designFolderPath: '',
                createdAt: timestamp,
                updatedAt: timestamp
            });
            existingBuilder.projects.sort((a, b) => a.name.localeCompare(b.name));
            existingBuilder.updatedAt = timestamp;
        } else {
            builders.push({
                id: makeId(),
                name: cleanBuilder,
                logoUrl: '',
                logoPath: '',
                designFolderId: '',
                designFolderPath: '',
                projects: [{
                    id: makeId(),
                    name: cleanProject,
                    drawingNumbers: [],
                    archived: false,
                    archivedAt: null,
                    designFolderId: '',
                    designFolderPath: '',
                    createdAt: timestamp,
                    updatedAt: timestamp
                }],
                createdAt: timestamp,
                updatedAt: timestamp
            });
            builders.sort((a, b) => a.name.localeCompare(b.name));
        }

        await saveSafetyProjectsDocument({ builders, updatedAt: timestamp });
        return builders;
    },

    createBuilder: async (builderName, options = {}) => {
        const cleanBuilder = builderName.trim();
        if (!cleanBuilder) {
            throw new Error('Builder name is required');
        }

        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const duplicate = builders.some(builder => builder.name.toLowerCase() === cleanBuilder.toLowerCase());
        if (duplicate) {
            throw new Error('A builder with that name already exists');
        }

        const timestamp = nowIso();
        const builderId = makeId();
        const logoPath = options.logoFile ? await uploadBuilderLogoFile(builderId, options.logoFile) : '';
        builders.push({
            id: builderId,
            name: cleanBuilder,
            logoUrl: '',
            logoPath,
            designFolderId: options.designFolderId || '',
            designFolderPath: options.designFolderPath || '',
            projects: [],
            createdAt: timestamp,
            updatedAt: timestamp
        });
        builders.sort((a, b) => a.name.localeCompare(b.name));
        await saveSafetyProjectsDocument({ builders, updatedAt: timestamp });
        return builders;
    },

    createProject: async (builderId, projectName, siteLocation = '', options = {}) => {
        const cleanProject = projectName.trim();
        const cleanLocation = siteLocation.trim();
        if (!builderId) {
            throw new Error('Builder is required');
        }
        if (!cleanProject) {
            throw new Error('Project site name is required');
        }

        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const builder = builders.find(item => item.id === builderId);
        if (!builder) {
            throw new Error('Builder not found');
        }

        const duplicate = builder.projects.some(project => project.name.toLowerCase() === cleanProject.toLowerCase());
        if (duplicate) {
            throw new Error('A project with that name already exists under this builder');
        }

        const timestamp = nowIso();
        builder.projects.push({
            id: makeId(),
            name: cleanProject,
            drawingNumbers: [],
            archived: false,
            archivedAt: null,
            siteLocation: cleanLocation,
            designFolderId: options.designFolderId || '',
            designFolderPath: options.designFolderPath || '',
            scaffoldEntity: normalizeScaffoldEntity(options.scaffoldEntity),
            projectManagerUserId: options.projectManagerUserId || '',
            siteSupervisorUserId: options.siteSupervisorUserId || '',
            leadingHandUserId: options.leadingHandUserId || '',
            projectManagerEmployeeId: options.projectManagerEmployeeId || '',
            siteSupervisorEmployeeId: options.siteSupervisorEmployeeId || '',
            leadingHandEmployeeId: options.leadingHandEmployeeId || '',
            inductedEmployeeIds: Array.isArray(options.inductedEmployeeIds)
                ? Array.from(new Set(options.inductedEmployeeIds.filter(Boolean)))
                : [],
            createdAt: timestamp,
            updatedAt: timestamp
        });
        builder.projects.sort((a, b) => a.name.localeCompare(b.name));
        builder.updatedAt = timestamp;
        await saveSafetyProjectsDocument({ builders, updatedAt: timestamp });
        return builders;
    },

    renameBuilder: async (builderId, nextName, options = {}) => {
        const clean = nextName.trim();
        if (!clean) {
            throw new Error('Builder name is required');
        }
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const target = builders.find(builder => builder.id === builderId);
        if (!target) {
            throw new Error('Builder not found');
        }
        const duplicate = builders.some(builder => builder.id !== builderId && builder.name.toLowerCase() === clean.toLowerCase());
        if (duplicate) {
            throw new Error('A builder with that name already exists');
        }
        target.name = clean;
        if (Object.prototype.hasOwnProperty.call(options, 'designFolderId')) {
            target.designFolderId = options.designFolderId || '';
            target.designFolderPath = options.designFolderPath || '';
        } else if (!target.designFolderId) {
            target.designFolderId = '';
            target.designFolderPath = target.designFolderPath || '';
        }
        if (options.removeLogo) {
            target.logoUrl = '';
            target.logoPath = '';
        } else if (options.logoFile) {
            target.logoUrl = '';
            target.logoPath = await uploadBuilderLogoFile(builderId, options.logoFile);
        } else if (Object.prototype.hasOwnProperty.call(options, 'logoUrl')) {
            target.logoUrl = typeof options.logoUrl === 'string' ? options.logoUrl : '';
            target.logoPath = '';
        } else if (Object.prototype.hasOwnProperty.call(options, 'logoPath')) {
            target.logoUrl = '';
            target.logoPath = typeof options.logoPath === 'string' ? options.logoPath : '';
        }
        target.updatedAt = nowIso();
        builders.sort((a, b) => a.name.localeCompare(b.name));
        await saveSafetyProjectsDocument({ builders, updatedAt: nowIso() });
        return builders;
    },

    resolveBuilderLogoUrl,

    renameProject: async (builderId, projectId, nextName, siteLocation = '', options = {}) => {
        const clean = nextName.trim();
        const cleanLocation = siteLocation.trim();
        if (!clean) {
            throw new Error('Project name is required');
        }
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const builder = builders.find(item => item.id === builderId);
        if (!builder) {
            throw new Error('Builder not found');
        }
        const project = builder.projects.find(item => item.id === projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        const duplicate = builder.projects.some(item => item.id !== projectId && item.name.toLowerCase() === clean.toLowerCase());
        if (duplicate) {
            throw new Error('A project with that name already exists under this builder');
        }
        project.name = clean;
        project.siteLocation = cleanLocation;
        if (Object.prototype.hasOwnProperty.call(options, 'designFolderId')) {
            project.designFolderId = options.designFolderId || '';
            project.designFolderPath = options.designFolderPath || '';
        } else if (!project.designFolderId) {
            project.designFolderId = '';
            project.designFolderPath = project.designFolderPath || '';
        }
        if (Object.prototype.hasOwnProperty.call(options, 'scaffoldEntity')) {
            project.scaffoldEntity = normalizeScaffoldEntity(options.scaffoldEntity);
        } else if (!project.scaffoldEntity) {
            project.scaffoldEntity = DEFAULT_SCAFFOLD_ENTITY;
        }
        if (Object.prototype.hasOwnProperty.call(options, 'projectManagerUserId')) {
            project.projectManagerUserId = options.projectManagerUserId || '';
        }
        if (Object.prototype.hasOwnProperty.call(options, 'siteSupervisorUserId')) {
            project.siteSupervisorUserId = options.siteSupervisorUserId || '';
        }
        if (Object.prototype.hasOwnProperty.call(options, 'leadingHandUserId')) {
            project.leadingHandUserId = options.leadingHandUserId || '';
        }
        if (Object.prototype.hasOwnProperty.call(options, 'projectManagerEmployeeId')) {
            project.projectManagerEmployeeId = options.projectManagerEmployeeId || '';
        }
        if (Object.prototype.hasOwnProperty.call(options, 'siteSupervisorEmployeeId')) {
            project.siteSupervisorEmployeeId = options.siteSupervisorEmployeeId || '';
        }
        if (Object.prototype.hasOwnProperty.call(options, 'leadingHandEmployeeId')) {
            project.leadingHandEmployeeId = options.leadingHandEmployeeId || '';
        }
        if (Object.prototype.hasOwnProperty.call(options, 'inductedEmployeeIds')) {
            project.inductedEmployeeIds = Array.isArray(options.inductedEmployeeIds)
                ? Array.from(new Set(options.inductedEmployeeIds.filter(Boolean)))
                : [];
        }
        project.updatedAt = nowIso();
        builder.projects.sort((a, b) => a.name.localeCompare(b.name));
        builder.updatedAt = nowIso();
        await saveSafetyProjectsDocument({ builders, updatedAt: nowIso() });
        return builders;
    },

    deleteBuilder: async (builderId) => {
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const target = builders.find(builder => builder.id === builderId);
        if (!target) {
            throw new Error('Builder not found');
        }
        if (target.projects.length > 0) {
            throw new Error('This builder still has projects attached. Remove those first.');
        }
        const nextBuilders = builders.filter(builder => builder.id !== builderId);
        await saveSafetyProjectsDocument({ builders: nextBuilders, updatedAt: nowIso() });
        return nextBuilders;
    },

    deleteProject: async (builderId, projectId) => {
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const target = builders.find(builder => builder.id === builderId);
        if (!target) {
            throw new Error('Builder not found');
        }
        target.projects = target.projects.filter(project => project.id !== projectId);
        target.updatedAt = nowIso();
        await saveSafetyProjectsDocument({ builders, updatedAt: nowIso() });
        return builders;
    },

    archiveProject: async (builderId, projectId) => {
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const builder = builders.find(item => item.id === builderId);
        if (!builder) {
            throw new Error('Builder not found');
        }
        const project = builder.projects.find(item => item.id === projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        project.archived = true;
        project.archivedAt = nowIso();
        project.updatedAt = nowIso();
        builder.updatedAt = nowIso();
        await saveSafetyProjectsDocument({ builders, updatedAt: nowIso() });
        return builders;
    },

    unarchiveProject: async (builderId, projectId) => {
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true, force: true });
        const builder = builders.find(item => item.id === builderId);
        if (!builder) {
            throw new Error('Builder not found');
        }
        const project = builder.projects.find(item => item.id === projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        project.archived = false;
        project.archivedAt = null;
        project.updatedAt = nowIso();
        builder.updatedAt = nowIso();
        await saveSafetyProjectsDocument({ builders, updatedAt: nowIso() });
        return builders;
    }
};

function mapMaterialOrderRow(row) {
    return {
        id: row.id,
        builderId: row.builder_id || '',
        builderName: row.builder_name || '',
        projectId: row.project_id || '',
        projectName: row.project_name || '',
        requestedByUserId: row.requested_by_user_id || null,
        requestedByName: row.requested_by_name || '',
        orderDate: row.order_date || new Date().toISOString().slice(0, 10),
        notes: row.notes || '',
        itemValues: row.item_values && typeof row.item_values === 'object' ? row.item_values : {},
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso()
    };
}

export const materialOrdersAPI = {
    getOrders: async () => {
        const rows = await readRestRows('ess_material_orders', '?select=*&order=updated_at.desc');
        return rows.map(mapMaterialOrderRow);
    },

    saveOrder: async ({
        id,
        builderId,
        builderName,
        projectId,
        projectName,
        requestedByUserId,
        requestedByName,
        orderDate,
        notes,
        itemValues
    }) => {
        const payload = {
            builder_id: builderId || null,
            builder_name: (builderName || '').trim(),
            project_id: projectId || null,
            project_name: (projectName || '').trim(),
            requested_by_user_id: requestedByUserId || null,
            requested_by_name: (requestedByName || '').trim(),
            order_date: orderDate,
            notes: (notes || '').trim() || null,
            item_values: itemValues || {},
            updated_at: nowIso()
        };

        if (id) {
            await patchRestRows('ess_material_orders', `?id=eq.${encodeURIComponent(id)}`, payload);
        } else {
            await postRestRows('ess_material_orders', [{
                ...payload,
                created_at: nowIso()
            }]);
        }

        return materialOrdersAPI.getOrders();
    },

    deleteOrder: async (orderId) => {
        await deleteRestRows('ess_material_orders', `?id=eq.${encodeURIComponent(orderId)}`);
        return materialOrdersAPI.getOrders();
    }
};


function buildMaterialOrderRequestScheduleIso(item) {
    if (!item?.scheduledDate || typeof item.scheduledHour !== 'number' || typeof item.scheduledMinute !== 'number') {
        return item?.scheduledAtIso || null;
    }

    return `${item.scheduledDate}T${String(item.scheduledHour).padStart(2, '0')}:${String(item.scheduledMinute).padStart(2, '0')}:00`;
}

const materialOrderRequestPdfPath = (requestId) => `material-order-requests/pdf/${requestId}.pdf`;

function pdfEsc(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function truncatePdfText(value, max) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function drawPdfText(x, y, size, value, font = 'F1') {
    return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEsc(String(value || ''))}) Tj ET`;
}

function buildMaterialOrderRequestPdfBlob(request) {
    const pageW = 595;
    const pageH = 842;
    const margin = 24;
    const bottomMargin = 28;
    const headerBlue = '0.043 0.369 0.557 rg';
    const lineGrey = '0.82 0.85 0.89 RG';
    const textDark = '0.11 0.15 0.20 rg';
    const textMuted = '0.29 0.38 0.46 rg';
    const white = '1 1 1 rg';
    const sectionBlue = '0.102 0.431 0.627 rg';
    const paleYellow = '1 0.972 0.918 rg';
    const itemValues = request?.itemValues && typeof request.itemValues === 'object' ? request.itemValues : {};

    const rect = (x, y, w, h) => `${x} ${y} ${w} ${h} re`;
    const fillRect = (x, y, w, h) => `${rect(x, y, w, h)} f`;
    const strokeRect = (x, y, w, h) => `${rect(x, y, w, h)} S`;

    const sections = [
        { side: 'left', title: 'MODULAR SCAFFOLD' },
        { side: 'middle', title: 'SOLE BOARDS' },
        { side: 'right', title: 'SCAFFOLD LADDER' },
    ];
    const tableWidth = pageW - margin * 2;
    const qtyWidth = 58;
    const specWidth = 100;
    const labelWidth = tableWidth - specWidth - qtyWidth;
    const rowHeight = 17;
    const sectionHeight = 18;

    const pageStreams = [];
    let content = [];
    let currentY = 0;

    const startPage = () => {
        content = ['1 w'];
    };

    const finishPage = () => {
        pageStreams.push(content.join('\n'));
    };

    const drawHeader = (withMeta) => {
        content.push(headerBlue);
        content.push(fillRect(margin, pageH - margin - 34, pageW - margin * 2, 34));
        content.push(white);
        content.push(drawPdfText(margin + 12, pageH - margin - 22, 18, 'PICKING CARD', 'F2'));
        content.push(
            drawPdfText(
                pageW - margin - 152,
                pageH - margin - 21,
                8,
                `Submitted ${truncatePdfText(String(request?.submittedAt || '').replace('T', ' ').slice(0, 16), 24)}`,
                'F2'
            )
        );

        if (!withMeta) {
            return pageH - margin - 54;
        }

        const metaRows = [
            ['BUILDER', truncatePdfText(request?.builderName || '', 38), 'DAY', truncatePdfText(formatDayLabel(request?.orderDate), 16)],
            ['PROJECT', truncatePdfText(request?.projectName || '', 38), 'TIME', truncatePdfText(itemValues.__time || '', 16)],
            [
                'SCAFFOLD TYPE',
                truncatePdfText(request?.scaffoldingSystem || itemValues.__scaffoldingSystem || '', 24),
                'REQUESTED BY',
                truncatePdfText(request?.requestedByName || '', 22),
            ],
            ['DETAILS', truncatePdfText(request?.details || itemValues.__details || request?.notes || '', 84), '', ''],
        ];

        let y = pageH - margin - 52;
        for (const row of metaRows) {
            const [leftLabel, leftValue, rightLabel, rightValue] = row;
            const fullWidth = !rightLabel;
            const rowH = fullWidth ? 28 : 24;
            const leftBlockWidth = fullWidth ? pageW - margin * 2 : 322;
            content.push(lineGrey);
            content.push(strokeRect(margin, y - rowH, leftBlockWidth, rowH));
            content.push('0.914 0.933 0.961 rg');
            content.push(fillRect(margin, y - rowH, 96, rowH));
            content.push(textMuted);
            content.push(drawPdfText(margin + 8, y - 16, 8, leftLabel, 'F2'));
            content.push(textDark);
            content.push(drawPdfText(margin + 102, y - 16, 9, leftValue, 'F2'));

            if (!fullWidth) {
                const secondX = margin + leftBlockWidth;
                content.push(lineGrey);
                content.push(strokeRect(secondX, y - rowH, pageW - margin - secondX, rowH));
                content.push('0.914 0.933 0.961 rg');
                content.push(fillRect(secondX, y - rowH, 96, rowH));
                content.push(textMuted);
                content.push(drawPdfText(secondX + 8, y - 16, 8, rightLabel, 'F2'));
                content.push(textDark);
                content.push(drawPdfText(secondX + 102, y - 16, 9, rightValue, 'F2'));
            }
            y -= rowH;
        }

        return y - 12;
    };

    const ensureSpace = (neededHeight) => {
        if (currentY - neededHeight >= bottomMargin) {
            return;
        }
        finishPage();
        startPage();
        currentY = drawHeader(false);
    };

    const drawSectionHeader = (title) => {
        ensureSpace(20);
        content.push(sectionBlue);
        content.push(fillRect(margin, currentY - 20, tableWidth, 20));
        content.push(white);
        content.push(drawPdfText(margin + 7, currentY - 13, 8, title, 'F2'));
        content.push(drawPdfText(pageW - margin - qtyWidth + 16, currentY - 13, 8, 'QTY', 'F2'));
        currentY -= 20;
    };

    const drawGroupedHeader = (label) => {
        ensureSpace(sectionHeight);
        content.push(sectionBlue);
        content.push(fillRect(margin, currentY - sectionHeight, tableWidth, sectionHeight));
        content.push(white);
        content.push(drawPdfText(margin + 6, currentY - 12, 7, truncatePdfText(label, 40), 'F2'));
        content.push(drawPdfText(pageW - margin - qtyWidth + 16, currentY - 12, 7, "QTY'S", 'F2'));
        currentY -= sectionHeight;
    };

    const drawItem = (label, spec, qty) => {
        ensureSpace(rowHeight);
        content.push(lineGrey);
        content.push(strokeRect(margin, currentY - rowHeight, labelWidth, rowHeight));
        content.push(strokeRect(margin + labelWidth, currentY - rowHeight, specWidth, rowHeight));
        content.push(strokeRect(margin + labelWidth + specWidth, currentY - rowHeight, qtyWidth, rowHeight));
        content.push(textDark);
        content.push(drawPdfText(margin + 6, currentY - 12, 6.5, truncatePdfText(label, 42), 'F2'));
        if (spec) {
            content.push(textMuted);
            content.push(drawPdfText(margin + labelWidth + 6, currentY - 12, 6.5, truncatePdfText(spec, 16), 'F1'));
        }
        if (qty) {
            content.push(paleYellow);
            content.push(fillRect(margin + labelWidth + specWidth + 2, currentY - rowHeight + 2, qtyWidth - 4, rowHeight - 4));
            content.push(textDark);
            content.push(drawPdfText(margin + labelWidth + specWidth + 20, currentY - 12, 7, qty, 'F2'));
        }
        currentY -= rowHeight;
    };

    startPage();
    currentY = drawHeader(true);

    for (const section of sections) {
        drawSectionHeader(section.title);
        const entries = PICKING_CARD_ROWS
            .filter(row => row[section.side][0] || row[section.side][1])
            .map(row => ({
                row,
                entry: row[section.side],
            }));

        for (const { entry, row } of entries) {
            const [label, spec] = entry;
            if (isSectionHeaderEntry(entry)) {
                drawGroupedHeader(getMaterialDisplayLabel(label));
                continue;
            }
            if (shouldSkipMaterialEntry(label, spec)) {
                continue;
            }

            const displayLabel = getMaterialDisplayLabel(label);
            const displaySpec = displayLabel.toUpperCase().includes('HOP-UP') ? '' : normalizeMaterialSpec(spec);
            const qty = truncatePdfText(itemValues[quantityKey(row.id, section.side)] || '', 5);
            drawItem(displayLabel, displaySpec, qty);
        }

        currentY -= 10;
    }

    finishPage();

    const objects = [];
    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    objects.push('');

    const pageObjectNumbers = [];
    const streamObjectNumbers = [];
    let nextObjectNumber = 3;

    for (const stream of pageStreams) {
        const pageObjectNumber = nextObjectNumber;
        const streamObjectNumber = nextObjectNumber + 1;
        pageObjectNumbers.push(pageObjectNumber);
        streamObjectNumbers.push(streamObjectNumber);
        objects.push('');
        const streamLength = new TextEncoder().encode(stream).length;
        objects.push(`${streamObjectNumber} 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`);
        nextObjectNumber += 2;
    }

    const font1ObjectNumber = nextObjectNumber;
    const font2ObjectNumber = nextObjectNumber + 1;

    objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map(num => `${num} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>\nendobj\n`;

    for (let index = 0; index < pageObjectNumbers.length; index += 1) {
        const pageObjectNumber = pageObjectNumbers[index];
        const streamObjectNumber = streamObjectNumbers[index];
        objects[2 + index * 2] = `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${streamObjectNumber} 0 R /Resources << /Font << /F1 ${font1ObjectNumber} 0 R /F2 ${font2ObjectNumber} 0 R >> >> >>\nendobj\n`;
    }

    objects.push(`${font1ObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
    objects.push(`${font2ObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const obj of objects) {
        offsets.push(new TextEncoder().encode(pdf).length);
        pdf += obj;
    }
    const xrefOffset = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index <= objects.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
}

function normalizeSecondaryRoute(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const serviceMinutes = Number(raw.serviceMinutes);
    const normalized = {
        reason: typeof raw.reason === 'string' ? raw.reason : '',
        startingLocation: typeof raw.startingLocation === 'string' ? raw.startingLocation : '',
        destination: typeof raw.destination === 'string' ? raw.destination : '',
        label: typeof raw.label === 'string' ? raw.label : '',
        linkedRequestId: typeof raw.linkedRequestId === 'string' ? raw.linkedRequestId : null,
        linkedRequestLabel: typeof raw.linkedRequestLabel === 'string' ? raw.linkedRequestLabel : '',
        linkedRequestSiteLocation: typeof raw.linkedRequestSiteLocation === 'string' ? raw.linkedRequestSiteLocation : '',
        travelDistanceMeters: Number(raw.travelDistanceMeters) || 0,
        travelDurationSeconds: Number(raw.travelDurationSeconds) || 0,
        travelBaseDurationSeconds: Number(raw.travelBaseDurationSeconds) || 0,
        travelTrafficDelaySeconds: Number(raw.travelTrafficDelaySeconds) || 0,
        travelTrafficProvider: typeof raw.travelTrafficProvider === 'string' ? raw.travelTrafficProvider : '',
        travelTrafficNote: typeof raw.travelTrafficNote === 'string' ? raw.travelTrafficNote : '',
        returnDistanceMeters: Number(raw.returnDistanceMeters) || 0,
        returnDurationSeconds: Number(raw.returnDurationSeconds) || 0,
        returnBaseDurationSeconds: Number(raw.returnBaseDurationSeconds) || 0,
        returnTrafficDelaySeconds: Number(raw.returnTrafficDelaySeconds) || 0,
        returnTrafficProvider: typeof raw.returnTrafficProvider === 'string' ? raw.returnTrafficProvider : '',
        returnTrafficNote: typeof raw.returnTrafficNote === 'string' ? raw.returnTrafficNote : '',
        serviceMinutes: Number.isFinite(serviceMinutes) && serviceMinutes >= 0 ? serviceMinutes : 30,
    };

    if (!normalized.reason || !normalized.destination) {
        return null;
    }

    return normalized;
}

function normalizeServiceMinutes(value, fallback = 30) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) {
        return fallback;
    }
    return Math.max(0, Math.min(240, Math.round(minutes)));
}

function getStoredServiceMinutes(item) {
    const direct = Number(item?.serviceMinutes);
    if (Number.isFinite(direct) && direct >= 0) {
        return normalizeServiceMinutes(direct);
    }
    const itemValues = item?.itemValues && typeof item.itemValues === 'object'
        ? item.itemValues
        : item?.item_values && typeof item.item_values === 'object'
            ? item.item_values
            : {};
    const stored = Number(itemValues.__serviceMinutes);
    if (Number.isFinite(stored) && stored >= 0) {
        return normalizeServiceMinutes(stored);
    }
    return 30;
}

function withStoredServiceMinutes(record, serviceMinutes) {
    const normalizedMinutes = normalizeServiceMinutes(serviceMinutes);
    return {
        ...record,
        serviceMinutes: normalizedMinutes,
        itemValues: {
            ...(record?.itemValues || {}),
            __serviceMinutes: normalizedMinutes,
        },
    };
}

function getStoredReturnTransitToYard(item) {
    const direct = item?.returnTransitToYard;
    if (typeof direct === 'boolean') {
        return direct;
    }
    const itemValues = item?.itemValues && typeof item.itemValues === 'object'
        ? item.itemValues
        : item?.item_values && typeof item.item_values === 'object'
            ? item.item_values
            : {};
    const stored = itemValues.__returnTransitToYard;
    if (typeof stored === 'boolean') {
        return stored;
    }
    if (typeof stored === 'string') {
        return stored.toLowerCase() === 'true';
    }
    return stored === 1;
}

function hasStoredReturnTransitToYard(item) {
    if (item?.hasReturnTransitToYardSetting === true) {
        return true;
    }
    const itemValues = item?.itemValues && typeof item.itemValues === 'object'
        ? item.itemValues
        : item?.item_values && typeof item.item_values === 'object'
            ? item.item_values
            : {};
    if (Object.prototype.hasOwnProperty.call(itemValues, '__returnTransitToYard')) {
        return true;
    }
    if (item?.hasReturnTransitToYardSetting === false) {
        return false;
    }
    return typeof item?.returnTransitToYard === 'boolean';
}

function withStoredReturnTransitToYard(record, enabled) {
    const returnTransitToYard = Boolean(enabled);
    return {
        ...record,
        returnTransitToYard,
        hasReturnTransitToYardSetting: true,
        itemValues: {
            ...(record?.itemValues || {}),
            __returnTransitToYard: returnTransitToYard,
        },
    };
}

function getStoredTollsEnabled(item, segment = 'primary') {
    const directKey = segment === 'return' ? 'returnTollsEnabled' : 'tollsEnabled';
    const direct = item?.[directKey];
    if (typeof direct === 'boolean') {
        return direct;
    }
    const itemValues = item?.itemValues && typeof item.itemValues === 'object'
        ? item.itemValues
        : item?.item_values && typeof item.item_values === 'object'
            ? item.item_values
            : {};
    const stored = segment === 'return' ? itemValues.__returnTollsEnabled : itemValues.__tollsEnabled;
    if (typeof stored === 'boolean') {
        return stored;
    }
    if (typeof stored === 'string') {
        return stored.toLowerCase() === 'true';
    }
    return stored === 1;
}

function hasStoredTollsSetting(item, segment = 'primary') {
    const directFlag = segment === 'return' ? 'hasReturnTollsSetting' : 'hasTollsSetting';
    const directKey = segment === 'return' ? 'returnTollsEnabled' : 'tollsEnabled';
    if (item?.[directFlag] === true) {
        return true;
    }
    const itemValues = item?.itemValues && typeof item.itemValues === 'object'
        ? item.itemValues
        : item?.item_values && typeof item.item_values === 'object'
            ? item.item_values
            : {};
    const storageKey = segment === 'return' ? '__returnTollsEnabled' : '__tollsEnabled';
    if (Object.prototype.hasOwnProperty.call(itemValues, storageKey)) {
        return true;
    }
    if (item?.[directFlag] === false) {
        return false;
    }
    return typeof item?.[directKey] === 'boolean';
}

function withStoredTollsEnabled(record, segment = 'primary', enabled = false) {
    const tollsEnabled = Boolean(enabled);
    const itemValues = { ...(record?.itemValues || {}) };
    if (segment === 'return') {
        itemValues.__returnTollsEnabled = tollsEnabled;
        return {
            ...record,
            returnTollsEnabled: tollsEnabled,
            hasReturnTollsSetting: true,
            itemValues,
        };
    }
    itemValues.__tollsEnabled = tollsEnabled;
    return {
        ...record,
        tollsEnabled,
        hasTollsSetting: true,
        itemValues,
    };
}

function normalizeConnectedParentSegment(value) {
    return value === 'return' || value === 'primary' ? value : null;
}

function normalizeBooleanFlag(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return ['true', 'yes', '1', 'on'].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
}

function normalizeMaterialOrderRequestListItem(item) {
    const scheduledAtIso = buildMaterialOrderRequestScheduleIso(item);
    const archivedAt = item?.archivedAt || null;
    const sourceOrderId = item?.sourceOrderId || null;
    const scheduledDate = item?.scheduledDate || null;
    const scheduledTruckId = item?.scheduledTruckId || item?.truckId || null;
    const scheduledTruckLabel = item?.scheduledTruckLabel || item?.truckLabel || null;
    const itemValues = item?.itemValues && typeof item.itemValues === 'object'
        ? item.itemValues
        : item?.item_values && typeof item.item_values === 'object'
            ? item.item_values
            : {};
    const hiabRequired = normalizeBooleanFlag(item?.hiabRequired ?? item?.hiab_required ?? itemValues.__hiabRequired);
    const endOfDay = scheduledDate ? new Date(`${scheduledDate}T23:59:59`).getTime() : null;
    const shouldArchive = !archivedAt && endOfDay !== null && isFinite(endOfDay) && endOfDay <= Date.now();

    return {
        id: item?.id || '',
        builderName: item?.builderName || '',
        projectName: item?.projectName || '',
        requestedByUserId: item?.requestedByUserId || null,
        requestedByName: item?.requestedByName || '',
        submittedAt: item?.submittedAt || nowIso(),
        orderDate: item?.orderDate || new Date().toISOString().slice(0, 10),
        sourceOrderId,
        connectedParentStartMinutes: sourceOrderId && typeof item?.connectedParentStartMinutes === 'number' ? item.connectedParentStartMinutes : null,
        connectedParentSegment: sourceOrderId ? normalizeConnectedParentSegment(item?.connectedParentSegment) : null,
        routeType: item?.routeType || null,
        scheduleRemovedAt: item?.scheduleRemovedAt || null,
        pdfPath: item?.pdfPath || '',
        scaffoldingSystem: item?.scaffoldingSystem || '',
        details: item?.details || '',
        notes: item?.notes || '',
        itemValues,
        hiabRequired,
        serviceMinutes: getStoredServiceMinutes(item),
        returnTransitToYard: getStoredReturnTransitToYard(item),
        hasReturnTransitToYardSetting: hasStoredReturnTransitToYard(item),
        tollsEnabled: getStoredTollsEnabled(item, 'primary'),
        returnTollsEnabled: getStoredTollsEnabled(item, 'return'),
        hasTollsSetting: hasStoredTollsSetting(item, 'primary'),
        hasReturnTollsSetting: hasStoredTollsSetting(item, 'return'),
        scheduledDate,
        scheduledHour: typeof item?.scheduledHour === 'number' ? item.scheduledHour : null,
        scheduledMinute: typeof item?.scheduledMinute === 'number' ? item.scheduledMinute : null,
        scheduledAtIso,
        scheduledTruckId,
        scheduledTruckLabel,
        truckId: scheduledTruckId,
        truckLabel: scheduledTruckLabel,
        deliveryStatus: item?.deliveryStatus || (scheduledDate || scheduledAtIso ? 'scheduled' : null),
        deliveryStartedAt: item?.deliveryStartedAt || null,
        deliveryUnloadingAt: item?.deliveryUnloadingAt || null,
        deliveryConfirmedAt: item?.deliveryConfirmedAt || null,
        archivedAt: archivedAt || (shouldArchive ? nowIso() : null),
        secondaryRoute: normalizeSecondaryRoute(item?.secondaryRoute),
    };
}

function normalizeMaterialOrderRequestRecord(record) {
    if (!record) {
        return null;
    }

    const scheduledAtIso = buildMaterialOrderRequestScheduleIso(record);
    const archivedAt = record.archivedAt || null;
    const sourceOrderId = record.sourceOrderId || null;
    const scheduledDate = record.scheduledDate || null;
    const scheduledTruckId = record.scheduledTruckId || record.truckId || null;
    const scheduledTruckLabel = record.scheduledTruckLabel || record.truckLabel || null;
    const itemValues = record.itemValues && typeof record.itemValues === 'object'
        ? record.itemValues
        : record.item_values && typeof record.item_values === 'object'
            ? record.item_values
            : {};
    const hiabRequired = normalizeBooleanFlag(record.hiabRequired ?? record.hiab_required ?? itemValues.__hiabRequired);
    const endOfDay = scheduledDate ? new Date(`${scheduledDate}T23:59:59`).getTime() : null;
    const shouldArchive = !archivedAt && endOfDay !== null && isFinite(endOfDay) && endOfDay <= Date.now();

    return {
        ...record,
        sourceOrderId,
        requestedByUserId: record.requestedByUserId || null,
        notes: record.notes || '',
        details: record.details || record?.itemValues?.__details || record?.item_values?.__details || '',
        scaffoldingSystem: record.scaffoldingSystem || record?.itemValues?.__scaffoldingSystem || record?.item_values?.__scaffoldingSystem || '',
        itemValues,
        hiabRequired,
        serviceMinutes: getStoredServiceMinutes(record),
        returnTransitToYard: getStoredReturnTransitToYard(record),
        hasReturnTransitToYardSetting: hasStoredReturnTransitToYard(record),
        tollsEnabled: getStoredTollsEnabled(record, 'primary'),
        returnTollsEnabled: getStoredTollsEnabled(record, 'return'),
        hasTollsSetting: hasStoredTollsSetting(record, 'primary'),
        hasReturnTollsSetting: hasStoredTollsSetting(record, 'return'),
        scheduledDate,
        scheduledHour: typeof record.scheduledHour === 'number' ? record.scheduledHour : null,
        scheduledMinute: typeof record.scheduledMinute === 'number' ? record.scheduledMinute : null,
        connectedParentStartMinutes: sourceOrderId && typeof record.connectedParentStartMinutes === 'number' ? record.connectedParentStartMinutes : null,
        connectedParentSegment: sourceOrderId ? normalizeConnectedParentSegment(record.connectedParentSegment) : null,
        scheduleRemovedAt: record.scheduleRemovedAt || null,
        scheduledAtIso,
        scheduledTruckId,
        scheduledTruckLabel,
        truckId: scheduledTruckId,
        truckLabel: scheduledTruckLabel,
        deliveryStatus: record.deliveryStatus || (scheduledDate || scheduledAtIso ? 'scheduled' : null),
        deliveryStartedAt: record.deliveryStartedAt || null,
        deliveryUnloadingAt: record.deliveryUnloadingAt || null,
        deliveryConfirmedAt: record.deliveryConfirmedAt || null,
        archivedAt: archivedAt || (shouldArchive ? nowIso() : null),
        secondaryRoute: normalizeSecondaryRoute(record.secondaryRoute),
    };
}

function isMissingMaterialOrderRequestsTableError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes(MATERIAL_ORDER_REQUESTS_TABLE)
        && (
            message.includes('does not exist')
            || message.includes('could not find')
            || message.includes('not found')
            || message.includes('schema cache')
        );
}

async function tryMaterialOrderRequestsTable(operation) {
    if (materialOrderRequestsTableAvailable === false) {
        return null;
    }
    try {
        const result = await operation();
        materialOrderRequestsTableAvailable = true;
        return result;
    } catch (error) {
        if (isMissingMaterialOrderRequestsTableError(error)) {
            materialOrderRequestsTableAvailable = false;
            return null;
        }
        throw error;
    }
}

function mapMaterialOrderRequestRow(row) {
    if (!row) {
        return null;
    }
    return normalizeMaterialOrderRequestRecord({
        id: row.id,
        sourceOrderId: row.source_order_id || null,
        connectedParentStartMinutes: typeof row.connected_parent_start_minutes === 'number'
            ? row.connected_parent_start_minutes
            : null,
        connectedParentSegment: row.connected_parent_segment || null,
        routeType: row.route_type || null,
        builderId: row.builder_id || '',
        builderName: row.builder_name || '',
        projectId: row.project_id || '',
        projectName: row.project_name || '',
        requestedByUserId: row.requested_by_user_id || null,
        requestedByName: row.requested_by_name || '',
        orderDate: row.order_date || new Date().toISOString().slice(0, 10),
        submittedAt: row.submitted_at || nowIso(),
        updatedAt: row.updated_at || null,
        notes: row.notes || '',
        itemValues: row.item_values && typeof row.item_values === 'object' ? row.item_values : {},
        pdfPath: row.pdf_path || '',
        scaffoldingSystem: row.scaffolding_system || '',
        details: row.details || '',
        scheduledDate: row.scheduled_date || null,
        scheduledHour: typeof row.scheduled_hour === 'number' ? row.scheduled_hour : null,
        scheduledMinute: typeof row.scheduled_minute === 'number' ? row.scheduled_minute : null,
        scheduledAtIso: row.scheduled_at_iso || null,
        scheduledTruckId: row.scheduled_truck_id || row.truck_id || null,
        scheduledTruckLabel: row.scheduled_truck_label || row.truck_label || null,
        truckId: row.truck_id || row.scheduled_truck_id || null,
        truckLabel: row.truck_label || row.scheduled_truck_label || null,
        deliveryStatus: row.delivery_status || null,
        deliveryStartedAt: row.delivery_started_at || null,
        deliveryUnloadingAt: row.delivery_unloading_at || null,
        deliveryConfirmedAt: row.delivery_confirmed_at || null,
        archivedAt: row.archived_at || null,
        scheduleRemovedAt: row.schedule_removed_at || null,
        secondaryRoute: row.secondary_route || null,
    });
}

function mapMaterialOrderRequestRecordToRow(record) {
    const normalized = normalizeMaterialOrderRequestRecord(record);
    const normalizedItemValues = {
        ...(normalized.itemValues || {}),
        __serviceMinutes: getStoredServiceMinutes(normalized),
        __returnTransitToYard: getStoredReturnTransitToYard(normalized),
    };
    if (hasStoredTollsSetting(normalized, 'primary') || getStoredTollsEnabled(normalized, 'primary')) {
        normalizedItemValues.__tollsEnabled = getStoredTollsEnabled(normalized, 'primary');
    }
    if (hasStoredTollsSetting(normalized, 'return') || getStoredTollsEnabled(normalized, 'return')) {
        normalizedItemValues.__returnTollsEnabled = getStoredTollsEnabled(normalized, 'return');
    }
    return {
        id: normalized.id,
        source_order_id: normalized.sourceOrderId || null,
        connected_parent_start_minutes: typeof normalized.connectedParentStartMinutes === 'number'
            ? normalized.connectedParentStartMinutes
            : null,
        connected_parent_segment: normalized.sourceOrderId
            ? normalizeConnectedParentSegment(normalized.connectedParentSegment)
            : null,
        route_type: normalized.routeType || null,
        builder_id: normalized.builderId || null,
        builder_name: normalized.builderName || '',
        project_id: normalized.projectId || null,
        project_name: normalized.projectName || '',
        requested_by_user_id: normalized.requestedByUserId || null,
        requested_by_name: normalized.requestedByName || '',
        order_date: normalized.orderDate || null,
        submitted_at: normalized.submittedAt || nowIso(),
        notes: normalized.notes || '',
        item_values: normalizedItemValues,
        pdf_path: normalized.pdfPath || '',
        scaffolding_system: normalized.scaffoldingSystem || '',
        details: normalized.details || '',
        scheduled_date: normalized.scheduledDate || null,
        scheduled_hour: typeof normalized.scheduledHour === 'number' ? normalized.scheduledHour : null,
        scheduled_minute: typeof normalized.scheduledMinute === 'number' ? normalized.scheduledMinute : null,
        scheduled_at_iso: normalized.scheduledAtIso || null,
        scheduled_truck_id: normalized.scheduledTruckId || null,
        scheduled_truck_label: normalized.scheduledTruckLabel || null,
        truck_id: normalized.truckId || normalized.scheduledTruckId || null,
        truck_label: normalized.truckLabel || normalized.scheduledTruckLabel || null,
        delivery_status: normalized.deliveryStatus || null,
        delivery_started_at: normalized.deliveryStartedAt || null,
        delivery_unloading_at: normalized.deliveryUnloadingAt || null,
        delivery_confirmed_at: normalized.deliveryConfirmedAt || null,
        archived_at: normalized.archivedAt || null,
        schedule_removed_at: normalized.scheduleRemovedAt || null,
        secondary_route: normalizeSecondaryRoute(normalized.secondaryRoute),
        updated_at: nowIso(),
    };
}

function normalizeTransportRouteSnapshots(raw) {
    if (!raw || typeof raw !== 'object') {
        return {};
    }
    return Object.fromEntries(
        Object.entries(raw)
            .filter(([key, snapshot]) => key && snapshot && typeof snapshot === 'object' && snapshot.routeData)
            .map(([key, snapshot]) => [key, snapshot])
    );
}

function mergeTransportRouteSnapshots(record, snapshots) {
    const normalized = normalizeMaterialOrderRequestRecord(record);
    if (!normalized) {
        return null;
    }
    const existingItemValues = normalized.itemValues && typeof normalized.itemValues === 'object'
        ? normalized.itemValues
        : {};
    const existingSnapshots = normalizeTransportRouteSnapshots(existingItemValues.__transportRouteSnapshots);
    const incomingSnapshots = Array.isArray(snapshots)
        ? snapshots
        : Object.values(snapshots || {});
    const mergedSnapshots = { ...existingSnapshots };
    incomingSnapshots
        .filter(snapshot => snapshot?.key && snapshot?.routeData)
        .forEach(snapshot => {
            mergedSnapshots[snapshot.key] = {
                ...snapshot,
                updatedAt: snapshot.updatedAt || nowIso()
            };
        });
    const prunedSnapshots = Object.fromEntries(
        Object.entries(mergedSnapshots)
            .sort(([, left], [, right]) => String(right?.updatedAt || '').localeCompare(String(left?.updatedAt || '')))
            .slice(0, 24)
    );
    return {
        ...normalized,
        itemValues: {
            ...existingItemValues,
            __transportRouteSnapshots: prunedSnapshots,
        },
    };
}

async function seedMaterialOrderRequestsTableFromStorage() {
    if (materialOrderRequestsTableSeedPromise) {
        return materialOrderRequestsTableSeedPromise;
    }

    materialOrderRequestsTableSeedPromise = (async () => {
        const rawIndex = await readStorageJson(MATERIAL_REQUEST_INDEX_PATH, { force: true }).catch(() => null);
        const storageItems = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const records = storageItems
            .map(normalizeMaterialOrderRequestRecord)
            .filter(item => item?.id);
        if (records.length === 0) {
            return [];
        }
        const rows = await postRestRows(
            MATERIAL_ORDER_REQUESTS_TABLE,
            records.map(mapMaterialOrderRequestRecordToRow),
            'id'
        );
        return (Array.isArray(rows) ? rows : []).map(mapMaterialOrderRequestRow).filter(Boolean);
    })().finally(() => {
        materialOrderRequestsTableSeedPromise = null;
    });

    return materialOrderRequestsTableSeedPromise;
}

async function readMaterialOrderRequestTableRecords({ seed = true, force = false } = {}) {
    let rows = await readRestRows(MATERIAL_ORDER_REQUESTS_TABLE, '?select=*&order=submitted_at.desc', { force });
    if (seed && rows.length === 0) {
        const seeded = await seedMaterialOrderRequestsTableFromStorage();
        if (seeded.length > 0) {
            rows = await readRestRows(MATERIAL_ORDER_REQUESTS_TABLE, '?select=*&order=submitted_at.desc', { force });
        }
    }
    return rows.map(mapMaterialOrderRequestRow).filter(Boolean);
}

async function readMaterialOrderRequestTableRecord(requestId, { seed = true } = {}) {
    const query = `?select=*&id=eq.${encodeURIComponent(requestId)}&limit=1`;
    let rows = await readRestRows(MATERIAL_ORDER_REQUESTS_TABLE, query);
    if (seed && rows.length === 0) {
        await seedMaterialOrderRequestsTableFromStorage();
        rows = await readRestRows(MATERIAL_ORDER_REQUESTS_TABLE, query);
    }
    return mapMaterialOrderRequestRow(rows[0]) || null;
}

async function upsertMaterialOrderRequestTableRecords(records) {
    const normalizedRecords = (Array.isArray(records) ? records : [records])
        .map(normalizeMaterialOrderRequestRecord)
        .filter(item => item?.id);
    if (normalizedRecords.length === 0) {
        return [];
    }
    const rows = await postRestRows(
        MATERIAL_ORDER_REQUESTS_TABLE,
        normalizedRecords.map(mapMaterialOrderRequestRecordToRow),
        'id'
    );
    emitStorageJsonChanged(MATERIAL_REQUEST_INDEX_PATH);
    return (Array.isArray(rows) ? rows : []).map(mapMaterialOrderRequestRow).filter(Boolean);
}

async function deleteMaterialOrderRequestTableRecord(requestId) {
    await deleteRestRows(MATERIAL_ORDER_REQUESTS_TABLE, `?id=eq.${encodeURIComponent(requestId)}`);
    emitStorageJsonChanged(MATERIAL_REQUEST_INDEX_PATH);
}

async function archiveMaterialOrderRequestInTable(requestId) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const archivedAt = nowIso();
        const updated = {
            ...record,
            archivedAt,
            secondaryRoute: normalizeSecondaryRoute(record.secondaryRoute),
        };
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function setMaterialOrderRequestScheduleInTable(requestId, { date, hour, minute, truckId, truckLabel, clearRunLink = false, sourceOrderId = null, connectedParentStartMinutes = null, connectedParentSegment = null }) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        if (record.archivedAt || record.deliveryConfirmedAt || record.deliveryStatus === 'return_transit') {
            throw new Error('Completed material orders cannot be rescheduled.');
        }
        const normalizedSecondaryRoute = normalizeSecondaryRoute(record.secondaryRoute);
        const shouldRestoreMaterialOrder = Boolean(
            clearRunLink &&
            record.routeType === 'secondary_route' &&
            normalizedSecondaryRoute?.reason === 'material_pick_up' &&
            normalizedSecondaryRoute?.linkedRequestId
        );
        const scheduledAtIso = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        const nextSourceOrderId = clearRunLink ? sourceOrderId || null : record.sourceOrderId || null;
        const nextConnectedParentStartMinutes = clearRunLink
            ? typeof connectedParentStartMinutes === 'number' ? connectedParentStartMinutes : null
            : typeof record.connectedParentStartMinutes === 'number' ? record.connectedParentStartMinutes : null;
        const nextConnectedParentSegment = nextSourceOrderId
            ? clearRunLink
                ? normalizeConnectedParentSegment(connectedParentSegment) || 'primary'
                : normalizeConnectedParentSegment(record.connectedParentSegment)
            : null;
        const updated = {
            ...record,
            sourceOrderId: nextSourceOrderId,
            connectedParentStartMinutes: nextConnectedParentStartMinutes,
            connectedParentSegment: nextConnectedParentSegment,
            routeType: shouldRestoreMaterialOrder ? null : record.routeType || null,
            scheduledDate: date,
            scheduledHour: hour,
            scheduledMinute: minute,
            scheduledAtIso,
            scheduledTruckId: truckId,
            scheduledTruckLabel: truckLabel,
            truckId,
            truckLabel,
            deliveryStatus: 'scheduled',
            deliveryStartedAt: null,
            deliveryUnloadingAt: null,
            deliveryConfirmedAt: null,
            secondaryRoute: shouldRestoreMaterialOrder ? null : normalizedSecondaryRoute,
        };
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function clearMaterialOrderRequestRunLinkInTable(requestId) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const secondaryRoute = normalizeSecondaryRoute(record.secondaryRoute);
        const shouldRestoreMaterialOrder = Boolean(
            record.routeType === 'secondary_route' &&
            secondaryRoute?.reason === 'material_pick_up' &&
            secondaryRoute?.linkedRequestId
        );
        const updated = {
            ...record,
            sourceOrderId: null,
            connectedParentStartMinutes: null,
            connectedParentSegment: null,
            routeType: shouldRestoreMaterialOrder ? null : record.routeType || null,
            secondaryRoute: shouldRestoreMaterialOrder ? null : secondaryRoute,
        };
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function setMaterialOrderRequestRunLinkInTable(requestId, { sourceOrderId = null, connectedParentStartMinutes = null, connectedParentSegment = null, secondaryRoute = undefined } = {}) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const nextSourceOrderId = sourceOrderId || null;
        const nextConnectedParentStartMinutes = nextSourceOrderId && typeof connectedParentStartMinutes === 'number'
            ? connectedParentStartMinutes
            : null;
        const nextConnectedParentSegment = nextSourceOrderId
            ? normalizeConnectedParentSegment(connectedParentSegment) || 'primary'
            : null;
        const nextSecondaryRoute = secondaryRoute === undefined
            ? normalizeSecondaryRoute(record.secondaryRoute)
            : normalizeSecondaryRoute(secondaryRoute);
        const updated = {
            ...record,
            sourceOrderId: nextSourceOrderId,
            connectedParentStartMinutes: nextConnectedParentStartMinutes,
            connectedParentSegment: nextConnectedParentSegment,
            secondaryRoute: nextSecondaryRoute,
        };
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function setMaterialOrderRequestServiceMinutesInTable(requestId, { serviceMinutes, segment = 'primary' } = {}) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const normalizedMinutes = normalizeServiceMinutes(serviceMinutes);
        const shouldUpdateSecondary = segment === 'secondary' || record.routeType === 'secondary_route';
        const normalizedSecondaryRoute = normalizeSecondaryRoute(record.secondaryRoute);
        if (shouldUpdateSecondary && !normalizedSecondaryRoute) {
            throw new Error('Secondary route not found');
        }
        const updated = shouldUpdateSecondary
            ? {
                ...record,
                secondaryRoute: {
                    ...normalizedSecondaryRoute,
                    serviceMinutes: normalizedMinutes,
                },
            }
            : withStoredServiceMinutes(record, normalizedMinutes);
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function setMaterialOrderRequestReturnTransitToYardInTable(requestId, enabled) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const updated = withStoredReturnTransitToYard(record, enabled);
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function setMaterialOrderRequestTollsEnabledInTable(requestId, { segment = 'primary', enabled = false } = {}) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const updated = withStoredTollsEnabled(record, segment, enabled);
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function mergeMaterialOrderRequestRouteSnapshotsInTable(requestId, snapshots = []) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const updated = mergeTransportRouteSnapshots(record, snapshots);
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function clearMaterialOrderRequestScheduleInTable(requestId, options = {}) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const allowCompletedReset = Boolean(options.allowCompletedReset || options.allowCompleted);
        const secondaryRoute = normalizeSecondaryRoute(record.secondaryRoute);
        const shouldRestoreMaterialOrder = record.routeType === 'secondary_route'
            && secondaryRoute?.reason === 'material_pick_up'
            && Boolean(secondaryRoute?.linkedRequestId);
        const shouldResetCompletedMaterialOrder = allowCompletedReset
            && record.routeType !== 'secondary_route'
            && Boolean(record.archivedAt || record.scheduleRemovedAt || record.deliveryConfirmedAt || record.deliveryStatus === 'return_transit');
        const updated = withStoredReturnTransitToYard({
            ...record,
            sourceOrderId: null,
            connectedParentStartMinutes: null,
            connectedParentSegment: null,
            routeType: shouldRestoreMaterialOrder ? null : record.routeType,
            scheduledDate: null,
            scheduledHour: null,
            scheduledMinute: null,
            scheduledAtIso: null,
            scheduledTruckId: null,
            scheduledTruckLabel: null,
            truckId: null,
            truckLabel: null,
            deliveryStatus: 'pending',
            deliveryStartedAt: null,
            deliveryUnloadingAt: null,
            deliveryConfirmedAt: null,
            archivedAt: shouldResetCompletedMaterialOrder ? null : record.archivedAt || null,
            scheduleRemovedAt: shouldResetCompletedMaterialOrder ? null : record.scheduleRemovedAt || null,
            secondaryRoute: shouldRestoreMaterialOrder ? null : secondaryRoute,
        }, false);
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function removeCompletedMaterialOrderRequestFromScheduleInTable(requestId) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        if (record.routeType === 'secondary_route') {
            throw new Error('External routes should be deleted normally.');
        }
        const archivedAt = record.archivedAt || nowIso();
        const scheduleRemovedAt = nowIso();
        const updated = {
            ...record,
            archivedAt,
            scheduleRemovedAt,
            deliveryStatus: record.deliveryStatus || 'return_transit',
            secondaryRoute: normalizeSecondaryRoute(record.secondaryRoute),
        };
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function updateMaterialOrderRequestDeliveryStatusInTable(requestId, { status, startedAt = null, unloadingAt = null, confirmedAt = null }) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const isSecondaryStatusRoute = record.routeType === 'secondary_route';
        const shouldArchiveOnComplete = status === 'return_transit' && !isSecondaryStatusRoute;
        const updated = {
            ...record,
            deliveryStatus: status,
            deliveryStartedAt: startedAt,
            deliveryUnloadingAt: unloadingAt,
            deliveryConfirmedAt: confirmedAt,
            archivedAt: isSecondaryStatusRoute ? null : shouldArchiveOnComplete ? record.archivedAt || nowIso() : record.archivedAt || null,
        };
        const [saved] = await upsertMaterialOrderRequestTableRecords(updated);
        return saved || normalizeMaterialOrderRequestRecord(updated);
    });
}

async function deleteMaterialOrderRequestInTable(requestId) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const existingRecords = await readMaterialOrderRequestTableRecords({ seed: false });
        const pdfPath = record.pdfPath || materialOrderRequestPdfPath(requestId);
        const pdfStillReferenced = Boolean(pdfPath && existingRecords.some(item => item.id !== requestId && item.pdfPath === pdfPath));
        await deleteMaterialOrderRequestTableRecord(requestId);
        if (pdfPath && !pdfStillReferenced) {
            await deleteStorageObject(pdfPath).catch(() => {});
        }
        return true;
    });
}

async function setSecondaryMaterialOrderRouteInTable(requestId, secondaryRoute, schedule = {}) {
    return tryMaterialOrderRequestsTable(async () => {
        const record = await readMaterialOrderRequestTableRecord(requestId);
        if (!record) throw new Error('Request not found');
        const normalizedSecondaryRoute = normalizeSecondaryRoute(secondaryRoute);
        if (!normalizedSecondaryRoute) throw new Error('Secondary route details are invalid');

        const existingRequests = await readMaterialOrderRequestTableRecords();
        const existingSecondaryIndexItem = existingRequests.find(item =>
            item?.routeType === 'secondary_route'
            && item?.sourceOrderId === requestId
            && !item?.archivedAt
        );
        const relinkedContinuation = schedule.relinkedContinuation && typeof schedule.relinkedContinuation === 'object'
            ? schedule.relinkedContinuation
            : null;
        const relinkedContinuationId = relinkedContinuation?.id || null;
        const shouldInsertBeforeExistingSecondary = Boolean(
            relinkedContinuationId &&
            existingSecondaryIndexItem?.id &&
            relinkedContinuationId === existingSecondaryIndexItem.id
        );
        const linkedRequestId = normalizedSecondaryRoute.linkedRequestId && normalizedSecondaryRoute.linkedRequestId !== requestId
            ? normalizedSecondaryRoute.linkedRequestId
            : null;
        const linkedIndexItem = linkedRequestId
            ? existingRequests.find(item => item?.id === linkedRequestId && !item?.archivedAt && item?.routeType !== 'secondary_route')
            : null;
        if (linkedRequestId && (!linkedIndexItem || linkedIndexItem.scheduledDate || linkedIndexItem.scheduledAtIso)) {
            throw new Error('Selected material order is no longer available to add as a secondary route');
        }
        const linkedRecord = linkedIndexItem?.id
            ? await readMaterialOrderRequestTableRecord(linkedIndexItem.id, { seed: false }).catch(() => null)
            : null;
        if (linkedRequestId && (linkedRecord?.scheduledDate || linkedRecord?.scheduledAtIso)) {
            throw new Error('Selected material order is no longer available to add as a secondary route');
        }
        const linkedSourceRecord = linkedRecord || linkedIndexItem || null;
        const secondaryRequestId = linkedSourceRecord?.id
            || (shouldInsertBeforeExistingSecondary ? null : existingSecondaryIndexItem?.id)
            || `secondary-${requestId}-${makeId()}`;
        const existingSecondaryRecord = linkedSourceRecord || (existingSecondaryIndexItem?.id
            && !shouldInsertBeforeExistingSecondary
            ? await readMaterialOrderRequestTableRecord(existingSecondaryIndexItem.id, { seed: false }).catch(() => null)
            : null);
        const scheduledDate = schedule.date || schedule.scheduledDate || record.scheduledDate || null;
        const scheduledHour = typeof schedule.hour === 'number'
            ? schedule.hour
            : typeof schedule.scheduledHour === 'number'
                ? schedule.scheduledHour
                : record.scheduledHour;
        const scheduledMinute = typeof schedule.minute === 'number'
            ? schedule.minute
            : typeof schedule.scheduledMinute === 'number'
                ? schedule.scheduledMinute
                : record.scheduledMinute;
        const scheduledAtIso = scheduledDate && typeof scheduledHour === 'number' && typeof scheduledMinute === 'number'
            ? `${scheduledDate}T${String(scheduledHour).padStart(2, '0')}:${String(scheduledMinute).padStart(2, '0')}:00`
            : null;
        const connectedParentStartMinutes = typeof scheduledHour === 'number' && typeof scheduledMinute === 'number'
            ? scheduledHour * 60 + scheduledMinute
            : null;
        const connectedParentSegment = schedule.connectedParentSegment === 'return' ? 'return' : 'primary';
        const scheduledTruckId = schedule.truckId || schedule.scheduledTruckId || record.scheduledTruckId || record.truckId || null;
        const scheduledTruckLabel = schedule.truckLabel || schedule.scheduledTruckLabel || record.scheduledTruckLabel || record.truckLabel || null;
        const isLinkedMaterialOrder = Boolean(linkedSourceRecord);
        const linkedItemValues = linkedSourceRecord?.itemValues && typeof linkedSourceRecord.itemValues === 'object'
            ? linkedSourceRecord.itemValues
            : linkedSourceRecord?.item_values && typeof linkedSourceRecord.item_values === 'object'
                ? linkedSourceRecord.item_values
                : {};
        const submittedAt = isLinkedMaterialOrder
            ? linkedSourceRecord.submittedAt || nowIso()
            : existingSecondaryRecord?.submittedAt || existingSecondaryIndexItem?.submittedAt || nowIso();
        const parentUpdated = {
            ...record,
            secondaryRoute: record.routeType === 'secondary_route'
                ? normalizeSecondaryRoute(record.secondaryRoute)
                : null,
        };
        const secondaryRecord = {
            ...(existingSecondaryRecord || {}),
            id: secondaryRequestId,
            sourceOrderId: requestId,
            connectedParentStartMinutes,
            connectedParentSegment,
            routeType: 'secondary_route',
            builderId: isLinkedMaterialOrder ? linkedSourceRecord.builderId || '' : '',
            builderName: isLinkedMaterialOrder
                ? linkedSourceRecord.builderName || normalizedSecondaryRoute.destination || 'Material order'
                : normalizedSecondaryRoute.destination || 'Secondary route',
            projectId: isLinkedMaterialOrder ? linkedSourceRecord.projectId || '' : '',
            projectName: isLinkedMaterialOrder
                ? linkedSourceRecord.projectName || normalizedSecondaryRoute.label || 'Material order'
                : normalizedSecondaryRoute.label || 'Secondary route',
            requestedByUserId: isLinkedMaterialOrder
                ? linkedSourceRecord.requestedByUserId || record.requestedByUserId || null
                : record.requestedByUserId || null,
            requestedByName: isLinkedMaterialOrder
                ? linkedSourceRecord.requestedByName || record.requestedByName || ''
                : record.requestedByName || '',
            orderDate: isLinkedMaterialOrder
                ? linkedSourceRecord.orderDate || record.orderDate || new Date().toISOString().slice(0, 10)
                : record.orderDate || new Date().toISOString().slice(0, 10),
            submittedAt,
            notes: isLinkedMaterialOrder
                ? linkedSourceRecord.notes || `Secondary route from ${normalizedSecondaryRoute.startingLocation || 'starting location'} to ${normalizedSecondaryRoute.destination}`
                : `Secondary route from ${normalizedSecondaryRoute.startingLocation || 'starting location'} to ${normalizedSecondaryRoute.destination}`,
            itemValues: isLinkedMaterialOrder ? linkedItemValues : {
                __scaffoldingSystem: normalizedSecondaryRoute.label || 'Secondary route',
                __details: normalizedSecondaryRoute.destination || '',
            },
            scaffoldingSystem: isLinkedMaterialOrder
                ? linkedSourceRecord.scaffoldingSystem || linkedItemValues.__scaffoldingSystem || normalizedSecondaryRoute.label || 'Material order'
                : normalizedSecondaryRoute.label || 'Secondary route',
            details: isLinkedMaterialOrder
                ? linkedSourceRecord.details || linkedItemValues.__details || normalizedSecondaryRoute.destination || ''
                : normalizedSecondaryRoute.destination || '',
            pdfPath: isLinkedMaterialOrder ? linkedSourceRecord.pdfPath || '' : '',
            scheduledDate,
            scheduledHour,
            scheduledMinute,
            scheduledAtIso,
            scheduledTruckId,
            scheduledTruckLabel,
            truckId: scheduledTruckId,
            truckLabel: scheduledTruckLabel,
            deliveryStatus: scheduledAtIso ? 'scheduled' : 'pending',
            deliveryStartedAt: null,
            deliveryUnloadingAt: null,
            deliveryConfirmedAt: null,
            archivedAt: null,
            secondaryRoute: normalizedSecondaryRoute,
        };
        const normalizedRelinkedSecondaryRoute = relinkedContinuation?.secondaryRoute
            ? normalizeSecondaryRoute(relinkedContinuation.secondaryRoute)
            : null;
        const relinkedScheduledDate = relinkedContinuation?.scheduledDate || scheduledDate;
        const relinkedScheduledHour = typeof relinkedContinuation?.scheduledHour === 'number'
            ? relinkedContinuation.scheduledHour
            : null;
        const relinkedScheduledMinute = typeof relinkedContinuation?.scheduledMinute === 'number'
            ? relinkedContinuation.scheduledMinute
            : null;
        const relinkedScheduledAtIso = relinkedScheduledDate && typeof relinkedScheduledHour === 'number' && typeof relinkedScheduledMinute === 'number'
            ? `${relinkedScheduledDate}T${String(relinkedScheduledHour).padStart(2, '0')}:${String(relinkedScheduledMinute).padStart(2, '0')}:00`
            : null;
        const relinkedConnectedParentSegment = normalizeConnectedParentSegment(relinkedContinuation?.connectedParentSegment) || 'primary';
        const relinkedContinuationRecord = relinkedContinuationId
            ? {
                ...(relinkedContinuation || {}),
                id: relinkedContinuationId,
                sourceOrderId: secondaryRequestId,
                connectedParentStartMinutes: typeof relinkedScheduledHour === 'number' && typeof relinkedScheduledMinute === 'number'
                    ? relinkedScheduledHour * 60 + relinkedScheduledMinute
                    : relinkedContinuation.connectedParentStartMinutes ?? null,
                connectedParentSegment: relinkedConnectedParentSegment,
                routeType: relinkedContinuation.routeType || null,
                scheduledDate: relinkedScheduledDate,
                scheduledHour: relinkedScheduledHour,
                scheduledMinute: relinkedScheduledMinute,
                scheduledAtIso: relinkedScheduledAtIso,
                scheduledTruckId,
                scheduledTruckLabel,
                truckId: scheduledTruckId,
                truckLabel: scheduledTruckLabel,
                secondaryRoute: normalizedRelinkedSecondaryRoute,
            }
            : null;
        const recordsToSave = [parentUpdated, secondaryRecord];
        if (relinkedContinuationRecord) {
            recordsToSave.push(relinkedContinuationRecord);
        }
        const savedRecords = await upsertMaterialOrderRequestTableRecords(recordsToSave);
        if (existingSecondaryIndexItem?.id && existingSecondaryIndexItem.id !== secondaryRequestId && !shouldInsertBeforeExistingSecondary) {
            await deleteMaterialOrderRequestTableRecord(existingSecondaryIndexItem.id).catch(() => {});
        }
        return savedRecords.find(item => item.id === secondaryRequestId)
            || normalizeMaterialOrderRequestRecord(secondaryRecord);
    });
}

async function listStorageObjects(prefix) {
    const response = await fetch(safetyBucketListUrl(), {
        method: 'POST',
        headers: storageHeaders(true),
        body: JSON.stringify({ prefix, limit: 500, offset: 0 })
    });

    if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Failed to list ${prefix}`);
    }

    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
}

export const materialOrderRequestsAPI = {
    listActiveRequests: async ({ includeArchived = false, force = false } = {}) => {
        const tableRecords = await tryMaterialOrderRequestsTable(() => readMaterialOrderRequestTableRecords({ force }));
        if (tableRecords) {
            return tableRecords
                .map(normalizeMaterialOrderRequestListItem)
                .filter(item => item.id && (includeArchived || !item.archivedAt))
                .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
        }

        const raw = await readStorageJson(MATERIAL_REQUEST_INDEX_PATH, { force });
        const items = Array.isArray(raw?.requests) ? raw.requests : [];
        return items
            .map(normalizeMaterialOrderRequestListItem)
            .filter(item => item.id && (includeArchived || !item.archivedAt))
            .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    },

    submitRequest: async (form) => withMaterialRequestIndexWriteLock(async () => {
        const requestId = makeId();
        const submittedAt = nowIso();
        const pdfPath = materialOrderRequestPdfPath(requestId);
        const scaffoldingSystem = form?.itemValues?.__scaffoldingSystem || '';
        const details = form?.itemValues?.__details || '';
        const hiabRequired = normalizeBooleanFlag(form?.itemValues?.__hiabRequired ?? form?.hiabRequired);
        const record = {
            id: requestId,
            sourceOrderId: form?.id || null,
            routeType: null,
            builderId: form?.builderId || '',
            builderName: form?.builderName || '',
            projectId: form?.projectId || '',
            projectName: form?.projectName || '',
            requestedByUserId: form?.requestedByUserId || null,
            requestedByName: form?.requestedByName || '',
            orderDate: form?.orderDate || new Date().toISOString().slice(0, 10),
            submittedAt,
            notes: form?.notes || '',
            itemValues: {
                ...(form?.itemValues || {}),
                __hiabRequired: hiabRequired,
                __serviceMinutes: normalizeServiceMinutes(form?.serviceMinutes, 30),
                __returnTransitToYard: Boolean(form?.returnTransitToYard),
            },
            hiabRequired,
            serviceMinutes: normalizeServiceMinutes(form?.serviceMinutes, 30),
            returnTransitToYard: Boolean(form?.returnTransitToYard),
            hasReturnTransitToYardSetting: true,
            pdfPath,
            scaffoldingSystem,
            details,
            scheduledDate: null,
            scheduledHour: null,
            scheduledMinute: null,
            scheduledAtIso: null,
            scheduledTruckId: null,
            scheduledTruckLabel: null,
            truckId: null,
            truckLabel: null,
            deliveryStatus: null,
            deliveryStartedAt: null,
            deliveryUnloadingAt: null,
            deliveryConfirmedAt: null,
            archivedAt: null,
            secondaryRoute: null,
        };

        await uploadStorageObject(
            pdfPath,
            buildMaterialOrderRequestPdfBlob(record),
            'application/pdf'
        );

        const tableRecord = await tryMaterialOrderRequestsTable(async () => {
            const [saved] = await upsertMaterialOrderRequestTableRecords(record);
            return saved || normalizeMaterialOrderRequestRecord(record);
        });
        if (tableRecord) {
            return tableRecord;
        }

        await uploadStorageObject(
            `material-order-requests/requests/${requestId}.json`,
            JSON.stringify(record),
            'application/json'
        );

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const rawIndex = await readStorageJson(indexPath, { force: true });
        const existingItems = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: [
                {
                    id: requestId,
                    builderName: record.builderName,
                    projectName: record.projectName,
                    requestedByUserId: record.requestedByUserId,
                    requestedByName: record.requestedByName,
                    submittedAt,
                    orderDate: record.orderDate,
                    sourceOrderId: record.sourceOrderId,
                    routeType: null,
                    pdfPath: record.pdfPath,
                    scaffoldingSystem,
                    details,
                    notes: record.notes || '',
                    itemValues: record.itemValues || {},
                    hiabRequired,
                    serviceMinutes: record.serviceMinutes,
                    returnTransitToYard: record.returnTransitToYard,
                    hasReturnTransitToYardSetting: true,
                    scheduledDate: null,
                    scheduledHour: null,
                    scheduledMinute: null,
                    scheduledAtIso: null,
                    scheduledTruckId: null,
                    scheduledTruckLabel: null,
                    truckId: null,
                    truckLabel: null,
                    deliveryStatus: null,
                    deliveryStartedAt: null,
                    deliveryUnloadingAt: null,
                    deliveryConfirmedAt: null,
                    archivedAt: null,
                    secondaryRoute: null,
                },
                ...existingItems.filter(item => item.id !== requestId)
            ].sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))),
            updatedAt: submittedAt,
        };
        await uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json');
        return record;
    }),

    listArchivedRequests: async ({ force = false } = {}) => {
        const tableRecords = await tryMaterialOrderRequestsTable(() => readMaterialOrderRequestTableRecords({ force }));
        if (tableRecords) {
            return tableRecords
                .map(normalizeMaterialOrderRequestListItem)
                .filter(item => item.id && item.archivedAt)
                .sort((a, b) => String(b.archivedAt || b.submittedAt).localeCompare(String(a.archivedAt || a.submittedAt)));
        }

        const raw = await readStorageJson(MATERIAL_REQUEST_INDEX_PATH, { force });
        const items = Array.isArray(raw?.requests) ? raw.requests : [];
        const fromIndex = items
            .map(normalizeMaterialOrderRequestListItem)
            .filter(item => item.id && item.archivedAt);

        if (fromIndex.length > 0) {
            return fromIndex.sort((a, b) => String(b.archivedAt || b.submittedAt).localeCompare(String(a.archivedAt || a.submittedAt)));
        }

        const rows = await listStorageObjects('material-order-requests/requests');
        const requestPaths = rows
            .map(row => row?.name)
            .filter(name => typeof name === 'string' && name.toLowerCase().endsWith('.json'))
            .map(name => `material-order-requests/requests/${name}`);

        const records = await Promise.all(requestPaths.map(readStorageJson));
        return records
            .map(normalizeMaterialOrderRequestRecord)
            .filter(item => item?.id && item?.archivedAt)
            .sort((a, b) => String(b.archivedAt || b.submittedAt).localeCompare(String(a.archivedAt || a.submittedAt)));
    },

    getRequest: async (requestId) => {
        const tableRecord = await tryMaterialOrderRequestsTable(() => readMaterialOrderRequestTableRecord(requestId));
        if (tableRecord) {
            return tableRecord;
        }

        const request = await readStorageJson(`material-order-requests/requests/${requestId}.json`);
        return normalizeMaterialOrderRequestRecord(request);
    },

    getPdfUrl: async (request) => signedStorageUrl(request.pdfPath, 60 * 60 * 24 * 14),

    archiveRequest: async (requestId) => withMaterialRequestIndexWriteLock(async () => {
        const tableRecord = await archiveMaterialOrderRequestInTable(requestId);
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');
        const archivedAt = nowIso();
        const updated = {
            ...record,
            archivedAt,
            secondaryRoute: normalizeSecondaryRoute(record.secondaryRoute),
        };
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? {
                    ...item,
                    archivedAt,
                    secondaryRoute: normalizeSecondaryRoute(item.secondaryRoute),
                }
                : item),
            updatedAt: archivedAt,
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    setSchedule: async (requestId, { date, hour, minute, truckId, truckLabel, clearRunLink = false, sourceOrderId = null, connectedParentStartMinutes = null, connectedParentSegment = null }) => withMaterialRequestIndexWriteLock(async () => {
        const tableRecord = await setMaterialOrderRequestScheduleInTable(requestId, { date, hour, minute, truckId, truckLabel, clearRunLink, sourceOrderId, connectedParentStartMinutes, connectedParentSegment });
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');
        if (record.archivedAt || record.deliveryConfirmedAt || record.deliveryStatus === 'return_transit') {
            throw new Error('Completed material orders cannot be rescheduled.');
        }
        const normalizedSecondaryRoute = normalizeSecondaryRoute(record.secondaryRoute);
        const shouldRestoreMaterialOrder = Boolean(
            clearRunLink &&
            record.routeType === 'secondary_route' &&
            normalizedSecondaryRoute?.reason === 'material_pick_up' &&
            normalizedSecondaryRoute?.linkedRequestId
        );
        const scheduledAtIso = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        const nextSourceOrderId = clearRunLink ? sourceOrderId || null : record.sourceOrderId || null;
        const nextConnectedParentStartMinutes = clearRunLink
            ? typeof connectedParentStartMinutes === 'number' ? connectedParentStartMinutes : null
            : typeof record.connectedParentStartMinutes === 'number' ? record.connectedParentStartMinutes : null;
        const nextConnectedParentSegment = nextSourceOrderId
            ? clearRunLink
                ? normalizeConnectedParentSegment(connectedParentSegment) || 'primary'
                : normalizeConnectedParentSegment(record.connectedParentSegment)
            : null;
        const updated = {
            ...record,
            sourceOrderId: nextSourceOrderId,
            connectedParentStartMinutes: nextConnectedParentStartMinutes,
            connectedParentSegment: nextConnectedParentSegment,
            routeType: shouldRestoreMaterialOrder ? null : record.routeType || null,
            scheduledDate: date,
            scheduledHour: hour,
            scheduledMinute: minute,
            scheduledAtIso,
            scheduledTruckId: truckId,
            scheduledTruckLabel: truckLabel,
            truckId,
            truckLabel,
            deliveryStatus: 'scheduled',
            deliveryStartedAt: null,
            deliveryUnloadingAt: null,
            deliveryConfirmedAt: null,
            secondaryRoute: shouldRestoreMaterialOrder ? null : normalizedSecondaryRoute,
        };
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? {
                    ...item,
                    sourceOrderId: nextSourceOrderId,
                    connectedParentStartMinutes: nextConnectedParentStartMinutes,
                    connectedParentSegment: nextConnectedParentSegment,
                    routeType: shouldRestoreMaterialOrder ? null : item.routeType || null,
                    notes: updated.notes || item.notes || '',
                    itemValues: updated.itemValues || item.itemValues || {},
                    scaffoldingSystem: updated.scaffoldingSystem || updated?.itemValues?.__scaffoldingSystem || item.scaffoldingSystem || '',
                    details: updated.details || updated?.itemValues?.__details || item.details || '',
                    scheduledDate: date,
                    scheduledHour: hour,
                    scheduledMinute: minute,
                    scheduledAtIso,
                    scheduledTruckId: truckId,
                    scheduledTruckLabel: truckLabel,
                    truckId,
                    truckLabel,
                    deliveryStatus: 'scheduled',
                    deliveryStartedAt: null,
                    deliveryUnloadingAt: null,
                    deliveryConfirmedAt: null,
                    secondaryRoute: shouldRestoreMaterialOrder ? null : normalizeSecondaryRoute(item.secondaryRoute),
                }
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    clearRunLink: async (requestId) => withMaterialRequestIndexWriteLock(async () => {
        const tableRecord = await clearMaterialOrderRequestRunLinkInTable(requestId);
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');
        const secondaryRoute = normalizeSecondaryRoute(record.secondaryRoute);
        const shouldRestoreMaterialOrder = Boolean(
            record.routeType === 'secondary_route' &&
            secondaryRoute?.reason === 'material_pick_up' &&
            secondaryRoute?.linkedRequestId
        );
        const updated = {
            ...record,
            sourceOrderId: null,
            connectedParentStartMinutes: null,
            connectedParentSegment: null,
            routeType: shouldRestoreMaterialOrder ? null : record.routeType || null,
            secondaryRoute: shouldRestoreMaterialOrder ? null : secondaryRoute,
        };
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? {
                    ...item,
                    sourceOrderId: null,
                    connectedParentStartMinutes: null,
                    connectedParentSegment: null,
                    routeType: shouldRestoreMaterialOrder ? null : item.routeType || null,
                    secondaryRoute: shouldRestoreMaterialOrder ? null : normalizeSecondaryRoute(item.secondaryRoute),
                }
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    setRunLink: async (requestId, { sourceOrderId = null, connectedParentStartMinutes = null, connectedParentSegment = null, secondaryRoute = undefined } = {}) => withMaterialRequestIndexWriteLock(async () => {
        const tableRecord = await setMaterialOrderRequestRunLinkInTable(requestId, { sourceOrderId, connectedParentStartMinutes, connectedParentSegment, secondaryRoute });
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');
        const nextSourceOrderId = sourceOrderId || null;
        const nextConnectedParentStartMinutes = nextSourceOrderId && typeof connectedParentStartMinutes === 'number'
            ? connectedParentStartMinutes
            : null;
        const nextConnectedParentSegment = nextSourceOrderId
            ? normalizeConnectedParentSegment(connectedParentSegment) || 'primary'
            : null;
        const nextSecondaryRoute = secondaryRoute === undefined
            ? normalizeSecondaryRoute(record.secondaryRoute)
            : normalizeSecondaryRoute(secondaryRoute);
        const updated = {
            ...record,
            sourceOrderId: nextSourceOrderId,
            connectedParentStartMinutes: nextConnectedParentStartMinutes,
            connectedParentSegment: nextConnectedParentSegment,
            secondaryRoute: nextSecondaryRoute,
        };
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? {
                    ...item,
                    sourceOrderId: nextSourceOrderId,
                    connectedParentStartMinutes: nextConnectedParentStartMinutes,
                    connectedParentSegment: nextConnectedParentSegment,
                    secondaryRoute: secondaryRoute === undefined
                        ? normalizeSecondaryRoute(item.secondaryRoute)
                        : nextSecondaryRoute,
                }
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    setServiceMinutes: async (requestId, { serviceMinutes, segment = 'primary' } = {}) => withMaterialRequestIndexWriteLock(async () => {
        const normalizedMinutes = normalizeServiceMinutes(serviceMinutes);
        const tableRecord = await setMaterialOrderRequestServiceMinutesInTable(requestId, { serviceMinutes: normalizedMinutes, segment });
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');

        const shouldUpdateSecondary = segment === 'secondary' || record.routeType === 'secondary_route';
        const normalizedSecondaryRoute = normalizeSecondaryRoute(record.secondaryRoute);
        if (shouldUpdateSecondary && !normalizedSecondaryRoute) {
            throw new Error('Secondary route not found');
        }
        const nextSecondaryRoute = shouldUpdateSecondary
            ? {
                ...normalizedSecondaryRoute,
                serviceMinutes: normalizedMinutes,
            }
            : normalizedSecondaryRoute;
        const updated = shouldUpdateSecondary
            ? {
                ...record,
                secondaryRoute: nextSecondaryRoute,
            }
            : withStoredServiceMinutes(record, normalizedMinutes);
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => {
                if (item.id !== requestId) {
                    return item;
                }
                if (shouldUpdateSecondary) {
                    return {
                        ...item,
                        secondaryRoute: nextSecondaryRoute,
                    };
                }
                const itemValues = {
                    ...(item.itemValues || {}),
                    __serviceMinutes: normalizedMinutes,
                };
                return {
                    ...item,
                    serviceMinutes: normalizedMinutes,
                    itemValues,
                };
            }),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    setReturnTransitToYard: async (requestId, enabled) => withMaterialRequestIndexWriteLock(async () => {
        const returnTransitToYard = Boolean(enabled);
        const tableRecord = await setMaterialOrderRequestReturnTransitToYardInTable(requestId, returnTransitToYard);
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');

        const updated = withStoredReturnTransitToYard(record, returnTransitToYard);
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? withStoredReturnTransitToYard(item, returnTransitToYard)
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    setTollsEnabled: async (requestId, { segment = 'primary', enabled = false } = {}) => withMaterialRequestIndexWriteLock(async () => {
        const normalizedSegment = segment === 'return' ? 'return' : 'primary';
        const tollsEnabled = Boolean(enabled);
        const tableRecord = await setMaterialOrderRequestTollsEnabledInTable(requestId, {
            segment: normalizedSegment,
            enabled: tollsEnabled,
        });
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');

        const updated = withStoredTollsEnabled(record, normalizedSegment, tollsEnabled);
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? withStoredTollsEnabled(item, normalizedSegment, tollsEnabled)
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    mergeRouteSnapshots: async (requestId, snapshots = []) => withMaterialRequestIndexWriteLock(async () => {
        const safeSnapshots = Array.isArray(snapshots) ? snapshots.filter(snapshot => snapshot?.key && snapshot?.routeData) : [];
        if (!requestId || safeSnapshots.length === 0) {
            return null;
        }

        const tableRecord = await mergeMaterialOrderRequestRouteSnapshotsInTable(requestId, safeSnapshots);
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');

        const updated = mergeTransportRouteSnapshots(record, safeSnapshots);
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? mergeTransportRouteSnapshots(item, safeSnapshots)
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    clearSchedule: async (requestId, options = {}) => withMaterialRequestIndexWriteLock(async () => {
        const tableRecord = await clearMaterialOrderRequestScheduleInTable(requestId, options);
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');
        const allowCompletedReset = Boolean(options.allowCompletedReset || options.allowCompleted);
        const secondaryRoute = normalizeSecondaryRoute(record.secondaryRoute);
        const shouldRestoreMaterialOrder = record.routeType === 'secondary_route'
            && secondaryRoute?.reason === 'material_pick_up'
            && Boolean(secondaryRoute?.linkedRequestId);
        const shouldResetCompletedMaterialOrder = allowCompletedReset
            && record.routeType !== 'secondary_route'
            && Boolean(record.archivedAt || record.scheduleRemovedAt || record.deliveryConfirmedAt || record.deliveryStatus === 'return_transit');
        const updated = withStoredReturnTransitToYard({
            ...record,
            sourceOrderId: null,
            connectedParentStartMinutes: null,
            connectedParentSegment: null,
            routeType: shouldRestoreMaterialOrder ? null : record.routeType,
            scheduledDate: null,
            scheduledHour: null,
            scheduledMinute: null,
            scheduledAtIso: null,
            scheduledTruckId: null,
            scheduledTruckLabel: null,
            truckId: null,
            truckLabel: null,
            deliveryStatus: 'pending',
            deliveryStartedAt: null,
            deliveryUnloadingAt: null,
            deliveryConfirmedAt: null,
            archivedAt: shouldResetCompletedMaterialOrder ? null : record.archivedAt || null,
            scheduleRemovedAt: shouldResetCompletedMaterialOrder ? null : record.scheduleRemovedAt || null,
            secondaryRoute: shouldRestoreMaterialOrder ? null : secondaryRoute,
        }, false);
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? withStoredReturnTransitToYard({
                    ...item,
                    sourceOrderId: null,
                    connectedParentStartMinutes: null,
                    connectedParentSegment: null,
                    routeType: shouldRestoreMaterialOrder ? null : item.routeType,
                    scheduledDate: null,
                    scheduledHour: null,
                    scheduledMinute: null,
                    scheduledAtIso: null,
                    scheduledTruckId: null,
                    scheduledTruckLabel: null,
                    truckId: null,
                    truckLabel: null,
                    deliveryStatus: 'pending',
                    deliveryStartedAt: null,
                    deliveryUnloadingAt: null,
                    deliveryConfirmedAt: null,
                    archivedAt: shouldResetCompletedMaterialOrder ? null : item.archivedAt || null,
                    scheduleRemovedAt: shouldResetCompletedMaterialOrder ? null : item.scheduleRemovedAt || null,
                    secondaryRoute: shouldRestoreMaterialOrder ? null : normalizeSecondaryRoute(item.secondaryRoute),
                }, false)
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    removeCompletedFromSchedule: async (requestId) => withMaterialRequestIndexWriteLock(async () => {
        const tableRecord = await removeCompletedMaterialOrderRequestFromScheduleInTable(requestId);
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');
        if (record.routeType === 'secondary_route') {
            throw new Error('External routes should be deleted normally.');
        }
        const archivedAt = record.archivedAt || nowIso();
        const scheduleRemovedAt = nowIso();
        const updated = {
            ...record,
            archivedAt,
            scheduleRemovedAt,
            deliveryStatus: record.deliveryStatus || 'return_transit',
            secondaryRoute: normalizeSecondaryRoute(record.secondaryRoute),
        };
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? {
                    ...item,
                    archivedAt,
                    scheduleRemovedAt,
                    deliveryStatus: item.deliveryStatus || updated.deliveryStatus,
                    deliveryStartedAt: updated.deliveryStartedAt || item.deliveryStartedAt || null,
                    deliveryUnloadingAt: updated.deliveryUnloadingAt || item.deliveryUnloadingAt || null,
                    deliveryConfirmedAt: updated.deliveryConfirmedAt || item.deliveryConfirmedAt || null,
                    secondaryRoute: normalizeSecondaryRoute(item.secondaryRoute),
                }
                : item),
            updatedAt: scheduleRemovedAt,
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    updateDeliveryStatus: async (requestId, { status, startedAt = null, unloadingAt = null, confirmedAt = null }) => withMaterialRequestIndexWriteLock(async () => {
        const tableRecord = await updateMaterialOrderRequestDeliveryStatusInTable(requestId, { status, startedAt, unloadingAt, confirmedAt });
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');
        const isSecondaryStatusRoute = record.routeType === 'secondary_route';
        const shouldArchiveOnComplete = status === 'return_transit' && !isSecondaryStatusRoute;
        const updated = {
            ...record,
            deliveryStatus: status,
            deliveryStartedAt: startedAt,
            deliveryUnloadingAt: unloadingAt,
            deliveryConfirmedAt: confirmedAt,
            archivedAt: isSecondaryStatusRoute ? null : shouldArchiveOnComplete ? record.archivedAt || nowIso() : record.archivedAt || null,
        };
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? {
                    ...item,
                    notes: updated.notes || item.notes || '',
                    itemValues: updated.itemValues || item.itemValues || {},
                    scaffoldingSystem: updated.scaffoldingSystem || updated?.itemValues?.__scaffoldingSystem || item.scaffoldingSystem || '',
                    details: updated.details || updated?.itemValues?.__details || item.details || '',
                    deliveryStatus: status,
                    deliveryStartedAt: startedAt,
                    deliveryUnloadingAt: unloadingAt,
                    deliveryConfirmedAt: confirmedAt,
                    archivedAt: isSecondaryStatusRoute ? null : shouldArchiveOnComplete ? item.archivedAt || updated.archivedAt : item.archivedAt || null,
                }
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    }),

    setSecondaryRoute: async (requestId, secondaryRoute, schedule = {}) => withMaterialRequestIndexWriteLock(async () => {
        const tableRecord = await setSecondaryMaterialOrderRouteInTable(requestId, secondaryRoute, schedule);
        if (tableRecord) {
            return tableRecord;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');
        const normalizedSecondaryRoute = normalizeSecondaryRoute(secondaryRoute);
        if (!normalizedSecondaryRoute) throw new Error('Secondary route details are invalid');
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const existingSecondaryIndexItem = existingIndex.find(item =>
            item?.routeType === 'secondary_route'
            && item?.sourceOrderId === requestId
            && !item?.archivedAt
        );
        const relinkedContinuation = schedule.relinkedContinuation && typeof schedule.relinkedContinuation === 'object'
            ? schedule.relinkedContinuation
            : null;
        const relinkedContinuationId = relinkedContinuation?.id || null;
        const shouldInsertBeforeExistingSecondary = Boolean(
            relinkedContinuationId &&
            existingSecondaryIndexItem?.id &&
            relinkedContinuationId === existingSecondaryIndexItem.id
        );
        const linkedRequestId = normalizedSecondaryRoute.linkedRequestId && normalizedSecondaryRoute.linkedRequestId !== requestId
            ? normalizedSecondaryRoute.linkedRequestId
            : null;
        const linkedIndexItem = linkedRequestId
            ? existingIndex.find(item => item?.id === linkedRequestId && !item?.archivedAt && item?.routeType !== 'secondary_route')
            : null;
        if (linkedRequestId && (!linkedIndexItem || linkedIndexItem.scheduledDate || linkedIndexItem.scheduledAtIso)) {
            throw new Error('Selected material order is no longer available to add as a secondary route');
        }
        const linkedRecord = linkedIndexItem?.id
            ? await readStorageJson(`material-order-requests/requests/${linkedIndexItem.id}.json`, { force: true }).catch(() => null)
            : null;
        if (linkedRequestId && (linkedRecord?.scheduledDate || linkedRecord?.scheduledAtIso)) {
            throw new Error('Selected material order is no longer available to add as a secondary route');
        }
        const linkedSourceRecord = linkedRecord || linkedIndexItem || null;
        const secondaryRequestId = linkedSourceRecord?.id
            || (shouldInsertBeforeExistingSecondary ? null : existingSecondaryIndexItem?.id)
            || `secondary-${requestId}-${makeId()}`;
        const existingSecondaryRecord = linkedSourceRecord || (existingSecondaryIndexItem?.id
            && !shouldInsertBeforeExistingSecondary
            ? await readStorageJson(`material-order-requests/requests/${existingSecondaryIndexItem.id}.json`, { force: true }).catch(() => null)
            : null);
        const scheduledDate = schedule.date || schedule.scheduledDate || record.scheduledDate || null;
        const scheduledHour = typeof schedule.hour === 'number'
            ? schedule.hour
            : typeof schedule.scheduledHour === 'number'
                ? schedule.scheduledHour
                : record.scheduledHour;
        const scheduledMinute = typeof schedule.minute === 'number'
            ? schedule.minute
            : typeof schedule.scheduledMinute === 'number'
                ? schedule.scheduledMinute
                : record.scheduledMinute;
        const scheduledAtIso = scheduledDate && typeof scheduledHour === 'number' && typeof scheduledMinute === 'number'
            ? `${scheduledDate}T${String(scheduledHour).padStart(2, '0')}:${String(scheduledMinute).padStart(2, '0')}:00`
            : null;
        const connectedParentStartMinutes = typeof scheduledHour === 'number' && typeof scheduledMinute === 'number'
            ? scheduledHour * 60 + scheduledMinute
            : null;
        const connectedParentSegment = schedule.connectedParentSegment === 'return' ? 'return' : 'primary';
        const scheduledTruckId = schedule.truckId || schedule.scheduledTruckId || record.scheduledTruckId || record.truckId || null;
        const scheduledTruckLabel = schedule.truckLabel || schedule.scheduledTruckLabel || record.scheduledTruckLabel || record.truckLabel || null;
        const isLinkedMaterialOrder = Boolean(linkedSourceRecord);
        const linkedItemValues = linkedSourceRecord?.itemValues && typeof linkedSourceRecord.itemValues === 'object'
            ? linkedSourceRecord.itemValues
            : linkedSourceRecord?.item_values && typeof linkedSourceRecord.item_values === 'object'
                ? linkedSourceRecord.item_values
                : {};
        const submittedAt = isLinkedMaterialOrder
            ? linkedSourceRecord.submittedAt || nowIso()
            : existingSecondaryRecord?.submittedAt || existingSecondaryIndexItem?.submittedAt || nowIso();
        const parentUpdated = {
            ...record,
            secondaryRoute: record.routeType === 'secondary_route'
                ? normalizeSecondaryRoute(record.secondaryRoute)
                : null,
        };
        const secondaryRecord = {
            ...(existingSecondaryRecord || {}),
            id: secondaryRequestId,
            sourceOrderId: requestId,
            connectedParentStartMinutes,
            connectedParentSegment,
            routeType: 'secondary_route',
            builderId: isLinkedMaterialOrder ? linkedSourceRecord.builderId || '' : '',
            builderName: isLinkedMaterialOrder
                ? linkedSourceRecord.builderName || normalizedSecondaryRoute.destination || 'Material order'
                : normalizedSecondaryRoute.destination || 'Secondary route',
            projectId: isLinkedMaterialOrder ? linkedSourceRecord.projectId || '' : '',
            projectName: isLinkedMaterialOrder
                ? linkedSourceRecord.projectName || normalizedSecondaryRoute.label || 'Material order'
                : normalizedSecondaryRoute.label || 'Secondary route',
            requestedByUserId: isLinkedMaterialOrder
                ? linkedSourceRecord.requestedByUserId || record.requestedByUserId || null
                : record.requestedByUserId || null,
            requestedByName: isLinkedMaterialOrder
                ? linkedSourceRecord.requestedByName || record.requestedByName || ''
                : record.requestedByName || '',
            orderDate: isLinkedMaterialOrder
                ? linkedSourceRecord.orderDate || record.orderDate || new Date().toISOString().slice(0, 10)
                : record.orderDate || new Date().toISOString().slice(0, 10),
            submittedAt,
            notes: isLinkedMaterialOrder
                ? linkedSourceRecord.notes || `Secondary route from ${normalizedSecondaryRoute.startingLocation || 'starting location'} to ${normalizedSecondaryRoute.destination}`
                : `Secondary route from ${normalizedSecondaryRoute.startingLocation || 'starting location'} to ${normalizedSecondaryRoute.destination}`,
            itemValues: isLinkedMaterialOrder ? linkedItemValues : {
                __scaffoldingSystem: normalizedSecondaryRoute.label || 'Secondary route',
                __details: normalizedSecondaryRoute.destination || '',
            },
            scaffoldingSystem: isLinkedMaterialOrder
                ? linkedSourceRecord.scaffoldingSystem || linkedItemValues.__scaffoldingSystem || normalizedSecondaryRoute.label || 'Material order'
                : normalizedSecondaryRoute.label || 'Secondary route',
            details: isLinkedMaterialOrder
                ? linkedSourceRecord.details || linkedItemValues.__details || normalizedSecondaryRoute.destination || ''
                : normalizedSecondaryRoute.destination || '',
            pdfPath: isLinkedMaterialOrder ? linkedSourceRecord.pdfPath || '' : '',
            scheduledDate,
            scheduledHour,
            scheduledMinute,
            scheduledAtIso,
            scheduledTruckId,
            scheduledTruckLabel,
            truckId: scheduledTruckId,
            truckLabel: scheduledTruckLabel,
            deliveryStatus: scheduledAtIso ? 'scheduled' : 'pending',
            deliveryStartedAt: null,
            deliveryUnloadingAt: null,
            deliveryConfirmedAt: null,
            archivedAt: null,
            secondaryRoute: normalizedSecondaryRoute,
        };
        const secondaryIndexItem = {
            ...secondaryRecord,
            secondaryRoute: normalizedSecondaryRoute,
        };
        const normalizedRelinkedSecondaryRoute = relinkedContinuation?.secondaryRoute
            ? normalizeSecondaryRoute(relinkedContinuation.secondaryRoute)
            : null;
        const relinkedScheduledDate = relinkedContinuation?.scheduledDate || scheduledDate;
        const relinkedScheduledHour = typeof relinkedContinuation?.scheduledHour === 'number'
            ? relinkedContinuation.scheduledHour
            : null;
        const relinkedScheduledMinute = typeof relinkedContinuation?.scheduledMinute === 'number'
            ? relinkedContinuation.scheduledMinute
            : null;
        const relinkedScheduledAtIso = relinkedScheduledDate && typeof relinkedScheduledHour === 'number' && typeof relinkedScheduledMinute === 'number'
            ? `${relinkedScheduledDate}T${String(relinkedScheduledHour).padStart(2, '0')}:${String(relinkedScheduledMinute).padStart(2, '0')}:00`
            : null;
        const relinkedConnectedParentSegment = normalizeConnectedParentSegment(relinkedContinuation?.connectedParentSegment) || 'primary';
        const relinkedContinuationRecord = relinkedContinuationId
            ? {
                ...(relinkedContinuation || {}),
                id: relinkedContinuationId,
                sourceOrderId: secondaryRequestId,
                connectedParentStartMinutes: typeof relinkedScheduledHour === 'number' && typeof relinkedScheduledMinute === 'number'
                    ? relinkedScheduledHour * 60 + relinkedScheduledMinute
                    : relinkedContinuation.connectedParentStartMinutes ?? null,
                connectedParentSegment: relinkedConnectedParentSegment,
                routeType: relinkedContinuation.routeType || null,
                scheduledDate: relinkedScheduledDate,
                scheduledHour: relinkedScheduledHour,
                scheduledMinute: relinkedScheduledMinute,
                scheduledAtIso: relinkedScheduledAtIso,
                scheduledTruckId,
                scheduledTruckLabel,
                truckId: scheduledTruckId,
                truckLabel: scheduledTruckLabel,
                secondaryRoute: normalizedRelinkedSecondaryRoute,
            }
            : null;
        const replacedSecondaryIds = new Set([secondaryRequestId]);
        if (existingSecondaryIndexItem?.id && !shouldInsertBeforeExistingSecondary) {
            replacedSecondaryIds.add(existingSecondaryIndexItem.id);
        }
        const nextIndex = {
            requests: [
                ...existingIndex.map(item => item.id === requestId
                ? {
                    ...item,
                    secondaryRoute: item.routeType === 'secondary_route'
                        ? normalizeSecondaryRoute(item.secondaryRoute)
                        : null,
                }
                : relinkedContinuationRecord && item.id === relinkedContinuationRecord.id
                    ? {
                        ...item,
                        ...relinkedContinuationRecord,
                    }
                : item).filter(item => !replacedSecondaryIds.has(item.id)),
                secondaryIndexItem,
            ],
            updatedAt: nowIso(),
        };
        const writes = [
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(parentUpdated), 'application/json'),
            uploadStorageObject(`material-order-requests/requests/${secondaryRequestId}.json`, JSON.stringify(secondaryRecord), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ];
        if (relinkedContinuationRecord) {
            writes.push(uploadStorageObject(`material-order-requests/requests/${relinkedContinuationRecord.id}.json`, JSON.stringify(relinkedContinuationRecord), 'application/json'));
        }
        if (existingSecondaryIndexItem?.id && existingSecondaryIndexItem.id !== secondaryRequestId && !shouldInsertBeforeExistingSecondary) {
            writes.push(deleteStorageObject(`material-order-requests/requests/${existingSecondaryIndexItem.id}.json`).catch(() => {}));
        }
        await Promise.all(writes);
        return normalizeMaterialOrderRequestRecord(secondaryRecord);
    }),

    deleteRequest: async (requestId) => withMaterialRequestIndexWriteLock(async () => {
        const tableDeleted = await deleteMaterialOrderRequestInTable(requestId);
        if (tableDeleted) {
            return;
        }

        const indexPath = MATERIAL_REQUEST_INDEX_PATH;
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`, { force: true }),
            readStorageJson(indexPath, { force: true }),
        ]);
        if (!record) throw new Error('Request not found');

        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.filter(item => item.id !== requestId),
            updatedAt: nowIso(),
        };
        const pdfPath = record.pdfPath || materialOrderRequestPdfPath(requestId);
        const pdfStillReferenced = Boolean(pdfPath && existingIndex.some(item => item.id !== requestId && item.pdfPath === pdfPath));

        await Promise.all([
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
            deleteStorageObject(`material-order-requests/requests/${requestId}.json`).catch(() => {}),
            ...(pdfPath && !pdfStillReferenced ? [deleteStorageObject(pdfPath).catch(() => {})] : []),
        ]);
    }),
};

export const rosteringAPI = {
    getEmployees: async () => {
        const rows = await readRestRows('ess_rostering_employees', '?select=*&order=last_name.asc,first_name.asc');
        return rows.map(mapEmployeeRow);
    },

    saveEmployee: async ({ id, firstName, lastName, phoneNumber, email, preferredSiteIds, leadingHand, linkedAuthUserId, verifiedAt, inviteSentAt, currentEmail }) => {
        const cleanPreferred = preferredSiteIds.filter(Boolean).slice(0, 3);
        const cleanEmail = (email || '').trim().toLowerCase();
        const preservedLink = cleanEmail && cleanEmail === (currentEmail || '').trim().toLowerCase();
        const payload = {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone_number: phoneNumber.trim() || null,
            email: cleanEmail || null,
            leading_hand: Boolean(leadingHand),
            preferred_site_1: cleanPreferred[0] || null,
            preferred_site_2: cleanPreferred[1] || null,
            preferred_site_3: cleanPreferred[2] || null,
            linked_auth_user_id: preservedLink ? (linkedAuthUserId || null) : null,
            invite_sent_at: preservedLink ? (inviteSentAt || null) : null,
            verified_at: preservedLink ? (verifiedAt || null) : null,
            updated_at: nowIso()
        };

        if (id) {
            await patchRestRows('ess_rostering_employees', `?id=eq.${encodeURIComponent(id)}`, payload);
        } else {
            await postRestRows('ess_rostering_employees', [{
                ...payload,
                created_at: nowIso()
            }]);
        }

        return rosteringAPI.getEmployees();
    },

    deleteEmployee: async (employeeId) => {
        await apiClient.delete(`/users/employees/${encodeURIComponent(employeeId)}`);
        return rosteringAPI.getEmployees();
    },

    getPlan: async (planDate = null) => {
        const query = planDate
            ? `?select=*&plan_date=eq.${encodeURIComponent(planDate)}&limit=1`
            : '?select=*&order=plan_date.desc&limit=1';
        const rows = await readRestRows('ess_rostering_plans', query);
        if (!rows.length) {
            return null;
        }
        const row = rows[0];
        return {
            date: row.plan_date,
            activeSiteIds: Array.isArray(row.active_site_ids) ? row.active_site_ids.filter(Boolean) : [],
            requiredMenBySite: row.required_men_by_site && typeof row.required_men_by_site === 'object' ? row.required_men_by_site : {},
            updatedAt: row.updated_at || nowIso(),
            updatedByUserId: row.updated_by_user_id || undefined
        };
    },

    savePlan: async ({ date, activeSiteIds, requiredMenBySite, updatedByUserId }) => {
        await postRestRows('ess_rostering_plans', [{
            plan_date: date,
            active_site_ids: activeSiteIds.filter(Boolean),
            required_men_by_site: requiredMenBySite,
            updated_at: nowIso(),
            updated_by_user_id: updatedByUserId || null
        }], 'plan_date');
    },

    isUserSiteSupervisor: async (userId, email) => {
        const rows = await readRestRows('ess_rostering_roles', '?select=role_name,user_id,email&role_name=eq.Site%20Supervisor');
        const lowerUserId = (userId || '').toLowerCase();
        const lowerEmail = (email || '').toLowerCase();
        return rows.some(row =>
            (!!lowerUserId && (row.user_id || '').toLowerCase() === lowerUserId) ||
            (!!lowerEmail && (row.email || '').toLowerCase() === lowerEmail)
        );
    },

    getLeadingHandRelationships: async (leadingHandEmployeeId) => {
        const rows = await readRestRows(
            'ess_leading_hand_relationships',
            `?select=*&leading_hand_employee_id=eq.${encodeURIComponent(leadingHandEmployeeId)}&order=updated_at.desc`
        );
        return rows.map(row => ({
            id: row.id,
            leadingHandEmployeeId: row.leading_hand_employee_id,
            employeeId: row.employee_id,
            relationshipType: row.relationship_type || 'neutral',
            createdAt: row.created_at || nowIso(),
            updatedAt: row.updated_at || nowIso()
        }));
    },

    saveLeadingHandRelationship: async ({ leadingHandEmployeeId, employeeId, relationshipType }) => {
        const existing = await readRestRows(
            'ess_leading_hand_relationships',
            `?select=id&leading_hand_employee_id=eq.${encodeURIComponent(leadingHandEmployeeId)}&employee_id=eq.${encodeURIComponent(employeeId)}&limit=1`
        );

        const payload = {
            leading_hand_employee_id: leadingHandEmployeeId,
            employee_id: employeeId,
            relationship_type: relationshipType,
            updated_at: nowIso()
        };

        if (existing.length > 0) {
            await patchRestRows('ess_leading_hand_relationships', `?id=eq.${encodeURIComponent(existing[0].id)}`, payload);
        } else {
            await postRestRows('ess_leading_hand_relationships', [{
                ...payload,
                created_at: nowIso()
            }]);
        }

        return rosteringAPI.getLeadingHandRelationships(leadingHandEmployeeId);
    },

    deleteLeadingHandRelationship: async (leadingHandEmployeeId, employeeId) => {
        await deleteRestRows(
            'ess_leading_hand_relationships',
            `?leading_hand_employee_id=eq.${encodeURIComponent(leadingHandEmployeeId)}&employee_id=eq.${encodeURIComponent(employeeId)}`
        );
        return rosteringAPI.getLeadingHandRelationships(leadingHandEmployeeId);
    }
};

const safetyModulePrefix = (builderId, projectId, kind) => `site-data/${builderId}/${projectId}/${kind}`;
const safetyModuleObjectUrl = (path) => `${SUPABASE_URL}/storage/v1/object/${SAFETY_BUCKET}/${path}`;
const safetyModuleSignUrl = (path) => `${SUPABASE_URL}/storage/v1/object/sign/${SAFETY_BUCKET}/${path}`;

async function uploadStorageObject(path, body, contentType) {
    const isJsonUpload = String(contentType || '').includes('application/json');
    const shouldRevalidateJsonUpload = isJsonUpload
        && (path === MATERIAL_REQUEST_INDEX_PATH || isMaterialOrderStoragePath(path));
    const cacheControlHeaders = shouldRevalidateJsonUpload
        ? { 'cache-control': 'no-cache, max-age=0, must-revalidate' }
        : {};
    const attempts = [
        { method: 'POST', url: safetyModuleObjectUrl(path), headers: { ...storageHeaders(true), 'x-upsert': 'true' } },
        { method: 'POST', url: `${safetyModuleObjectUrl(path)}?upsert=true`, headers: storageHeaders(true) },
        { method: 'PUT', url: safetyModuleObjectUrl(path), headers: { ...storageHeaders(true), 'x-upsert': 'true' } }
    ];

    let lastError = '';
    for (const attempt of attempts) {
        const response = await fetch(attempt.url, {
            method: attempt.method,
            headers: {
                ...attempt.headers,
                ...cacheControlHeaders,
                'Content-Type': contentType
            },
            body
        });
        if (response.ok) {
            cacheUploadedStorageJson(path, body, contentType);
            return;
        }
        lastError = await response.text();
    }

    throw new Error(lastError || 'Upload failed');
}

async function signedStorageUrl(path, expiresIn = 3600) {
    const cacheKey = `${path}:${expiresIn}`;
    const cached = signedStorageUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60 * 1000) {
        return cached.url;
    }
    if (signedStorageUrlInflight.has(cacheKey)) {
        return signedStorageUrlInflight.get(cacheKey);
    }

    const request = (async () => {
        const response = await fetch(safetyModuleSignUrl(path), {
            method: 'POST',
            headers: storageHeaders(true),
            body: JSON.stringify({ expiresIn })
        });
        if (!response.ok) {
            const details = await response.text();
            throw new Error(details || 'Failed to generate signed URL');
        }
        const payload = await response.json();
        const url = `${SUPABASE_URL}/storage/v1${payload.signedURL}`;
        signedStorageUrlCache.set(cacheKey, {
            url,
            expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1000
        });
        return url;
    })().finally(() => signedStorageUrlInflight.delete(cacheKey));

    signedStorageUrlInflight.set(cacheKey, request);
    return request;
}

function createStorageJsonAbortSignal(path) {
    if (typeof AbortController === 'undefined') {
        return {
            signal: undefined,
            cancel: () => {}
        };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort(new Error(`Timed out loading ${path}`));
    }, STORAGE_JSON_REQUEST_TIMEOUT_MS);
    return {
        signal: controller.signal,
        cancel: () => clearTimeout(timeoutId)
    };
}

function withStorageJsonLockTimeout(promise, path) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timed out waiting for ${path}`));
        }, STORAGE_JSON_REQUEST_TIMEOUT_MS);
        promise.then(
            (value) => {
                clearTimeout(timeoutId);
                resolve(value);
            },
            (error) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
}

async function readStorageJson(path, options = {}) {
    const { force = false, ttlMs = getStorageJsonCacheTtl(path) } = options;
    const now = Date.now();
    const cached = storageJsonCache.get(path);

    if (!force && cached) {
        if (cached.promise) {
            try {
                return cloneJsonValue(await withStorageJsonLockTimeout(cached.promise, path));
            } catch (error) {
                const latest = storageJsonCache.get(path);
                if (latest?.promise === cached.promise) {
                    storageJsonCache.delete(path);
                }
                throw error;
            }
        }
        if (cached.expiresAt > now) {
            return cloneJsonValue(cached.value);
        }
    }

    let fetchPromise;
    fetchPromise = (async () => {
        const timeout = createStorageJsonAbortSignal(path);
        let responseText = '';
        try {
            const response = await fetch(safetyModuleObjectUrl(path), {
                method: 'GET',
                headers: storageHeaders(),
                signal: timeout.signal,
                cache: force ? 'no-store' : 'default'
            });
            responseText = await response.text();

            if (response.status === 404) {
                setStorageJsonCache(path, null, Math.max(ttlMs, MISSING_STORAGE_JSON_CACHE_TTL_MS));
                return null;
            }

            if (!response.ok) {
                const details = responseText;
                if ((details || '').toLowerCase().includes('object not found')) {
                    setStorageJsonCache(path, null, Math.max(ttlMs, MISSING_STORAGE_JSON_CACHE_TTL_MS));
                    return null;
                }
                throw new Error(details || `Failed to load ${path}`);
            }

            const json = responseText ? JSON.parse(responseText) : null;
            setStorageJsonCache(path, json, ttlMs);
            return json;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error(`Timed out loading ${path}`);
            }
            throw error;
        } finally {
            timeout.cancel();
        }
    })();

    if (ttlMs > 0) {
        storageJsonCache.set(path, {
            value: cached?.value,
            expiresAt: now + ttlMs,
            promise: fetchPromise
        });
    }

    try {
        return cloneJsonValue(await fetchPromise);
    } catch (error) {
        const latest = storageJsonCache.get(path);
        if (latest?.promise === fetchPromise) {
            storageJsonCache.delete(path);
        }
        throw error;
    }
}

async function deleteStorageObject(path) {
    const response = await fetch(safetyModuleObjectUrl(path), {
        method: 'DELETE',
        headers: storageHeaders()
    });

    if (response.status === 404) {
        Array.from(signedStorageUrlCache.keys()).filter(key => key.startsWith(`${path}:`)).forEach(key => signedStorageUrlCache.delete(key));
        invalidateStorageJsonCache(path);
        emitStorageJsonChanged(path);
        return;
    }

    if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Failed to delete ${path}`);
    }
    invalidateStorageJsonCache(path);
    Array.from(signedStorageUrlCache.keys()).filter(key => key.startsWith(`${path}:`)).forEach(key => signedStorageUrlCache.delete(key));
    emitStorageJsonChanged(path);
}

export const safetyFilesAPI = {
    listModuleFiles: async (builderId, projectId, kind) => {
        const prefix = safetyModulePrefix(builderId, projectId, kind);
        const response = await fetch(safetyBucketListUrl(), {
            method: 'POST',
            headers: storageHeaders(true),
            body: JSON.stringify({ prefix, limit: 200, offset: 0 })
        });

        if (!response.ok) {
            const details = await response.text();
            throw new Error(details || 'Failed to list files');
        }

        const rows = await response.json();
        return rows
            .filter(row => typeof row.name === 'string' && row.name.toLowerCase().endsWith('.pdf'))
            .map(row => ({
                name: row.name,
                path: `${prefix}/${row.name}`,
                updatedAt: row.updated_at || nowIso(),
                size: row.metadata?.size ?? null
            }))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    uploadModulePdf: async (builderId, projectId, kind, file) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const objectPath = `${safetyModulePrefix(builderId, projectId, kind)}/${Date.now()}-${safeName}`;
        await uploadStorageObject(objectPath, file, 'application/pdf');
    },

    getSignedModuleFileUrl: async (path) => signedStorageUrl(path, 3600),

    deleteModuleFile: async (path) => {
        await deleteStorageObject(path);
    }
};

const handoverPrefix = (builderId, projectId) => `${safetyModulePrefix(builderId, projectId, 'handover-certificates')}`;
const handoverIndexPath = (builderId, projectId) => `${handoverPrefix(builderId, projectId)}/index.json`;
const handoverFormPath = (builderId, projectId, formId) => `${handoverPrefix(builderId, projectId)}/forms/${formId}.json`;
const handoverPdfPath = (builderId, projectId, formId) => `${handoverPrefix(builderId, projectId)}/pdf/${formId}.pdf`;

function parseHandoverIndex(raw) {
    if (!raw || !Array.isArray(raw.forms)) {
        return { forms: [], updatedAt: nowIso() };
    }

    return {
        forms: raw.forms
            .filter(item => item && typeof item.id === 'string')
            .map(item => ({
                id: item.id,
                formReferenceName: item.formReferenceName || '',
                inspectionNumber: item.inspectionNumber || '',
                essRepresentativeName: item.essRepresentativeName || '',
                projectNumberClient: item.projectNumberClient || '',
                inspectionDateTime: item.inspectionDateTime || '',
                updatedAt: item.updatedAt || nowIso()
            }))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        updatedAt: raw.updatedAt || nowIso()
    };
}

export const handoverCertificatesAPI = {
    listForms: async (builderId, projectId) => {
        const index = await readStorageJson(handoverIndexPath(builderId, projectId));
        return parseHandoverIndex(index).forms;
    },

    getForm: async (builderId, projectId, formId) => {
        const form = await readStorageJson(handoverFormPath(builderId, projectId, formId));
        if (!form) {
            return null;
        }
        return {
            ...form,
            id: form.id || formId,
            inspectionNumber: form.inspectionNumber || '',
            formReferenceName: form.formReferenceName || '',
            inspectionDateTime: form.inspectionDateTime || '',
            projectNumberClient: form.projectNumberClient || '',
            sectionLocation: form.sectionLocation || '',
            intendedUse: form.intendedUse || '',
            drawingNumber: form.drawingNumber || '',
            scaffoldIdNo: form.scaffoldIdNo || '',
            scaffoldDuty: form.scaffoldDuty || '',
            essRepresentativeName: form.essRepresentativeName || '',
            clientName: form.clientName || '',
            comments: form.comments || '',
            photoSlots: Array.isArray(form.photoSlots) ? form.photoSlots : [],
            correctiveActions: Array.isArray(form.correctiveActions) ? form.correctiveActions : [],
            pdfPath: form.pdfPath || handoverPdfPath(builderId, projectId, formId),
            updatedAt: form.updatedAt || nowIso()
        };
    },

    getPdfUrl: async (form) => signedStorageUrl(form.pdfPath, 60 * 60 * 24 * 14),

    deleteForm: async (builderId, projectId, formId) => {
        const existing = await handoverCertificatesAPI.getForm(builderId, projectId, formId);
        const indexRaw = await readStorageJson(handoverIndexPath(builderId, projectId), { force: true });
        const nextIndex = {
            forms: parseHandoverIndex(indexRaw).forms.filter(item => item.id !== formId),
            updatedAt: nowIso()
        };

        await uploadStorageObject(handoverIndexPath(builderId, projectId), JSON.stringify(nextIndex), 'application/json');

        const cleanupPaths = [
            handoverFormPath(builderId, projectId, formId),
            existing?.pdfPath || handoverPdfPath(builderId, projectId, formId),
            ...((existing?.photoSlots || []).map(item => item.path).filter(Boolean))
        ];

        await Promise.all(cleanupPaths.map(path => deleteStorageObject(path).catch(() => {})));
    }
};

const dayLabourVariationPrefix = (builderId, projectId) => `${safetyModulePrefix(builderId, projectId, 'day-labour-variations')}`;
const dayLabourVariationIndexPath = (builderId, projectId) => `${dayLabourVariationPrefix(builderId, projectId)}/index.json`;
const dayLabourVariationFormPath = (builderId, projectId, formId) => `${dayLabourVariationPrefix(builderId, projectId)}/forms/${formId}.json`;
const dayLabourVariationPdfPath = (builderId, projectId, formId) => `${dayLabourVariationPrefix(builderId, projectId)}/pdf/${formId}.pdf`;

async function readDayLabourVariationJson(path) {
    return readStorageJson(path);
}

async function signedDayLabourVariationUrl(path, expiresIn = 60 * 60 * 24 * 14) {
    return signedStorageUrl(path, expiresIn);
}

async function listDayLabourVariationPdfFiles(builderId, projectId) {
    const prefix = `${dayLabourVariationPrefix(builderId, projectId)}/pdf`;
    const cacheKey = `storage-list:${prefix}`;
    const cached = storageJsonCache.get(cacheKey);
    if (cached?.expiresAt > Date.now() && Array.isArray(cached.value)) {
        return cloneJsonValue(cached.value);
    }
    const response = await fetch(safetyBucketListUrl(), {
        method: 'POST',
        headers: anonStorageHeaders(true),
        body: JSON.stringify({ prefix, limit: 200, offset: 0 })
    });

    if (!response.ok) {
        return [];
    }

    const rows = await response.json();
    const entries = Array.isArray(rows) ? rows : rows?.value || [];
    const files = entries
        .filter(row => typeof row.name === 'string' && row.name.toLowerCase().endsWith('.pdf'))
        .map(row => {
            const formId = row.name.replace(/\.pdf$/i, '');
            return {
                id: formId,
                name: row.name,
                pdfPath: `${prefix}/${row.name}`,
                updatedAt: row.updated_at || row.created_at || nowIso(),
                size: row.metadata?.size ?? null
            };
        });
    setStorageJsonCache(cacheKey, files, 5 * 60 * 1000);
    return files;
}

function parseDayLabourVariationIndex(raw) {
    if (!raw || !Array.isArray(raw.forms)) {
        return { forms: [], updatedAt: nowIso() };
    }

    return {
        forms: raw.forms
            .filter(item => item && typeof item.id === 'string')
            .map(item => ({
                id: item.id,
                variationNumber: item.variationNumber || '',
                formReferenceName: item.formReferenceName || '',
                requestedBy: item.requestedBy || '',
                clientProjectName: item.clientProjectName || '',
                date: item.date || '',
                handoverDocumentNumber: item.handoverDocumentNumber || '',
                handoverDocumentId: item.handoverDocumentId || '',
                handoverDocumentTitle: item.handoverDocumentTitle || '',
                pdfPath: item.pdfPath || '',
                updatedAt: item.updatedAt || nowIso()
            }))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        updatedAt: raw.updatedAt || nowIso()
    };
}

export const dayLabourVariationsAPI = {
    listForms: async (builderId, projectId) => {
        const [index, pdfFiles] = await Promise.all([
            readDayLabourVariationJson(dayLabourVariationIndexPath(builderId, projectId)).catch(() => null),
            listDayLabourVariationPdfFiles(builderId, projectId)
        ]);
        const formsById = new Map(
            parseDayLabourVariationIndex(index).forms.map(form => [
                form.id,
                {
                    ...form,
                    pdfPath: form.pdfPath || dayLabourVariationPdfPath(builderId, projectId, form.id)
                }
            ])
        );

        pdfFiles.forEach(file => {
            const existing = formsById.get(file.id);
            if (existing) {
                formsById.set(file.id, {
                    ...existing,
                    pdfPath: existing.pdfPath || file.pdfPath,
                    size: file.size ?? existing.size ?? null
                });
                return;
            }

            formsById.set(file.id, {
                id: file.id,
                variationNumber: '',
                formReferenceName: file.name.replace(/\.pdf$/i, ''),
                requestedBy: 'Site team',
                clientProjectName: '',
                date: '',
                handoverDocumentNumber: '',
                handoverDocumentId: '',
                handoverDocumentTitle: '',
                pdfPath: file.pdfPath,
                size: file.size,
                updatedAt: file.updatedAt
            });
        });

        return Array.from(formsById.values()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },

    getForm: async (builderId, projectId, formId) => {
        const form = await readDayLabourVariationJson(dayLabourVariationFormPath(builderId, projectId, formId));
        if (!form) {
            return null;
        }
        return {
            ...form,
            id: form.id || formId,
            variationNumber: form.variationNumber || '',
            formReferenceName: form.formReferenceName || '',
            clientProjectName: form.clientProjectName || '',
            date: form.date || '',
            requestedBy: form.requestedBy || '',
            siteInstructionNumber: form.siteInstructionNumber || '',
            handoverDocumentNumber: form.handoverDocumentNumber || '',
            handoverDocumentId: form.handoverDocumentId || '',
            handoverDocumentTitle: form.handoverDocumentTitle || '',
            locationLevelGridLine: form.locationLevelGridLine || '',
            descriptionOfWork: form.descriptionOfWork || '',
            labourRows: Array.isArray(form.labourRows) ? form.labourRows : [],
            photoSlots: Array.isArray(form.photoSlots) ? form.photoSlots : [],
            essRepresentativeName: form.essRepresentativeName || '',
            clientName: form.clientName || '',
            pdfPath: form.pdfPath || dayLabourVariationPdfPath(builderId, projectId, formId),
            updatedAt: form.updatedAt || nowIso()
        };
    },

    getPdfUrl: async (form) => signedDayLabourVariationUrl(form.pdfPath, 60 * 60 * 24 * 14),
    getPhotoUrl: async (path) => signedDayLabourVariationUrl(path, 60 * 60 * 24 * 14),

    deleteForm: async (builderId, projectId, formId) => {
        const existing = await dayLabourVariationsAPI.getForm(builderId, projectId, formId);
        const indexRaw = await readDayLabourVariationJson(dayLabourVariationIndexPath(builderId, projectId)).catch(() => null);
        const nextIndex = {
            forms: parseDayLabourVariationIndex(indexRaw).forms.filter(item => item.id !== formId),
            updatedAt: nowIso()
        };

        await uploadStorageObject(dayLabourVariationIndexPath(builderId, projectId), JSON.stringify(nextIndex), 'application/json');

        const cleanupPaths = [
            dayLabourVariationFormPath(builderId, projectId, formId),
            existing?.pdfPath || dayLabourVariationPdfPath(builderId, projectId, formId),
            ...((existing?.photoSlots || []).map(item => item.path).filter(Boolean))
        ];

        await Promise.all(cleanupPaths.map(path => deleteStorageObject(path).catch(() => {})));
    }
};

function parseScaffIndex(raw) {
    if (!raw || !Array.isArray(raw.forms)) {
        return { forms: [], updatedAt: nowIso() };
    }

    return {
        forms: raw.forms
            .filter(item => item && typeof item.id === 'string')
            .map(item => ({
                ...item,
                scaffoldNo: item.scaffoldNo || item.tagNumber || '',
                jobLocation: item.jobLocation || '',
                latestInspectionDate: item.latestInspectionDate || '',
                qrTargetUrl: item.qrTargetUrl || '',
                updatedAt: item.updatedAt || nowIso()
            }))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        updatedAt: raw.updatedAt || nowIso()
    };
}

export const scaffTagsAPI = {
    listForms: async (builderId, projectId) => {
        const index = await readStorageJson(`site-data/${builderId}/${projectId}/scaff-tags/index.json`);
        return parseScaffIndex(index).forms;
    },

    getForm: async (builderId, projectId, formId) => {
        const form = await readStorageJson(`site-data/${builderId}/${projectId}/scaff-tags/forms/${formId}.json`);
        if (!form) {
            return null;
        }
        return {
            ...form,
            scaffoldNo: form.scaffoldNo || form.tagNumber || '',
            inspectionRecords: Array.isArray(form.inspectionRecords) ? form.inspectionRecords : [],
            photoPaths: Array.isArray(form.photoPaths) ? form.photoPaths : []
        };
    },

    getPhotoUrl: async (path) => signedStorageUrl(path, 60 * 60 * 24 * 14),
    getPdfUrl: async (form) => signedStorageUrl(form.pdfPath, 60 * 60 * 24 * 14),
    getShareUrl: async (form) => signedStorageUrl(form.sharePath, 60 * 60 * 24 * 365),

    deleteForm: async (builderId, projectId, formId) => {
        const existing = await scaffTagsAPI.getForm(builderId, projectId, formId);
        const indexPath = `site-data/${builderId}/${projectId}/scaff-tags/index.json`;
        const indexRaw = await readStorageJson(indexPath);
        const nextIndex = {
            forms: parseScaffIndex(indexRaw).forms.filter(item => item.id !== formId),
            updatedAt: nowIso()
        };
        await uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json');

        const cleanupPaths = [
            `site-data/${builderId}/${projectId}/scaff-tags/forms/${formId}.json`,
            existing?.sharePath || `site-data/${builderId}/${projectId}/scaff-tags/share/${formId}.html`,
            existing?.pdfPath || `site-data/${builderId}/${projectId}/scaff-tags/pdf/${formId}.pdf`,
            ...(existing?.photoPaths || [])
        ];

        await Promise.all(cleanupPaths.map(path => deleteStorageObject(path).catch(() => {})));
    }
};

let searchAbortController = null;

export const foldersAPI = {
    getRootFolders: async () => {
        const response = await apiClient.get('/folders');
        return response.data;
    },

    getFolder: async (folderId) => {
        const response = await apiClient.get(`/folders/${folderId}`);
        return response.data;
    },

    getBreadcrumbs: async (folderId) => {
        const response = await apiClient.get(`/folders/${folderId}/breadcrumbs`);
        return response.data;
    },

    getDesignFolderOptions: async () => {
        const response = await apiClient.get('/folders/design-folder-options');
        return response.data || [];
    },

    createFolder: async (name, parentFolderId = null) => {
        const user = authAPI.getCurrentUser();
        const response = await apiClient.post('/folders', {
            name,
            parentFolderId,
            userId: user?.id
        });
        return response.data;
    },

    renameFolder: async (folderId, newName) => {
        const response = await apiClient.put(`/folders/${folderId}/rename`, { newName });
        return response.data;
    },

    deleteFolder: async (folderId) => {
        const response = await apiClient.delete(`/folders/${folderId}`);
        return response.data;
    },

    uploadDocument: async (folderId, revisionNumber, essDesignFile, thirdPartyFile, description = '', recipients = [], options = {}) => {
        const user = authAPI.getCurrentUser();
        const formData = new FormData();
        formData.append('FolderId', folderId);
        formData.append('RevisionNumber', revisionNumber);
        if (user?.id) formData.append('UserId', user.id);
        if (options.drawingStatus) formData.append('DrawingStatus', options.drawingStatus);
        if (essDesignFile) formData.append('EssDesignIssue', essDesignFile);
        if (thirdPartyFile) formData.append('ThirdPartyDesign', thirdPartyFile);
        if (description) formData.append('Description', description);
        if (recipients.length > 0) {
            recipients.forEach(recipientId => {
                formData.append('RecipientIds', recipientId);
            });
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/folders/documents`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                onUploadProgress: options.onUploadProgress,
                timeout: 120000, // 2 minutes timeout for large files
                validateStatus: (status) => status < 500 // Don't throw on 4xx errors
            });

            if (response.status >= 400) {
                throw new Error(response.data?.error || `Upload failed with status ${response.status}`);
            }

            return response.data;
        } catch (error) {
            // Better error handling for common issues
            if (error.code === 'ECONNABORTED') {
                throw new Error('Upload timeout - file may be too large. Please try again.');
            }
            if (error.response) {
                // Server responded with error
                const contentType = error.response.headers['content-type'];
                if (contentType && contentType.includes('text/html')) {
                    // Server returned HTML error page instead of JSON
                    throw new Error('Server error occurred. Please try again in a moment.');
                }
                throw new Error(error.response.data?.error || error.message);
            }
            if (error.request) {
                // Request made but no response
                throw new Error('No response from server. Please check your connection and try again.');
            }
            // Other errors
            throw new Error(error.message || 'Upload failed. Please try again.');
        }
    },

    deleteDocument: async (documentId) => {
        const response = await apiClient.delete(`/folders/documents/${documentId}`);
        return response.data;
    },

    updateDocumentRevision: async (documentId, newRevisionNumber) => {
        const response = await apiClient.put(`/folders/documents/${documentId}/revision`, {
            newRevisionNumber
        });
        return response.data;
    },

    replaceDocumentFiles: async (documentId, essDesignFile, thirdPartyFile, description = '', recipients = [], options = {}) => {
        const user = authAPI.getCurrentUser();
        const formData = new FormData();
        if (user?.id) formData.append('UserId', user.id);
        if (options.drawingStatus) formData.append('DrawingStatus', options.drawingStatus);
        if (essDesignFile) formData.append('EssDesignIssue', essDesignFile);
        if (thirdPartyFile) formData.append('ThirdPartyDesign', thirdPartyFile);
        if (description) formData.append('Description', description);
        if (recipients.length > 0) {
            recipients.forEach(recipientId => {
                formData.append('RecipientIds', recipientId);
            });
        }

        try {
            const response = await axios.put(`${API_BASE_URL}/folders/documents/${documentId}/replace`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                onUploadProgress: options.onUploadProgress,
                timeout: 120000,
                validateStatus: (status) => status < 500
            });

            if (response.status >= 400) {
                throw new Error(response.data?.error || `Replacement failed with status ${response.status}`);
            }

            return response.data;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error('Upload timeout while replacing PDF. Please try again.');
            }
            if (error.response) {
                const contentType = error.response.headers['content-type'];
                if (contentType && contentType.includes('text/html')) {
                    throw new Error('Server error occurred. Please try again in a moment.');
                }
                throw new Error(error.response.data?.error || error.message);
            }
            if (error.request) {
                throw new Error('No response from server. Please check your connection and try again.');
            }
            throw new Error(error.message || 'Failed to replace PDF. Please try again.');
        }
    },

    shareDocument: async (documentId, recipientIds = [], externalEmails = [], externalMessage = '') => {
        const user = authAPI.getCurrentUser();
        const response = await apiClient.post(`/folders/documents/${documentId}/share`, {
            recipientIds,
            externalEmails,
            externalMessage,
            userId: user?.id
        });
        return response.data;
    },

    shareFolder: async (folderId, recipientIds = [], externalEmails = [], externalMessage = '') => {
        const response = await apiClient.post(`/folders/${folderId}/share`, {
            recipientIds,
            externalEmails,
            externalMessage
        });
        return response.data;
    },

    getPublicSharedFolder: async (folderId, token) => {
        const response = await apiClient.get(`/folders/${folderId}/public-share-data`, {
            params: { token }
        });
        return response.data;
    },

    resolvePublicFileUrl: (url) => {
        if (!url || /^https?:\/\//i.test(url)) {
            return url;
        }

        return `${API_ORIGIN_URL}${url}`;
    },

    moveDocument: async (documentId, targetFolderId) => {
        const response = await apiClient.put(`/folders/documents/${documentId}/move`, {
            targetFolderId
        });
        return response.data;
    },

    getDownloadUrl: async (documentId, type) => {
        const response = await apiClient.get(`/folders/documents/${documentId}/download/${type}`);
        return response.data; // Returns { url, fileName }
    },

    search: async (query) => {
        if (searchAbortController) searchAbortController.abort();
        searchAbortController = new AbortController();

        const response = await apiClient.get(
            `/folders/search?q=${encodeURIComponent(query)}`,
            { signal: searchAbortController.signal }
        );
        return response.data;
    },

    findDrawingFolder: async (drawingNumber) => {
        const response = await apiClient.get('/folders/drawing-folder', {
            params: { drawingNumber }
        });
        return response.data;
    },

    resolveDrawingFolders: async (drawingNumbers) => {
        const response = await apiClient.post('/folders/drawing-folders/resolve', {
            drawingNumbers
        });
        return response.data?.folders || {};
    }
};

export const preferencesAPI = {
    getPreferences: async () => {
        const response = await apiClient.get('/userpreferences');
        return response.data;
    },

    updatePreferences: async (preferences) => {
        const response = await apiClient.put('/userpreferences', preferences);
        return response.data;
    }
};

export const essNewsAPI = {
    getLandingImages: async (limit = 6) => {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 6, 8));
        const query = `?select=id,title,subtitle,media_url,media_type,created_at&media_type=eq.image&media_url=not.is.null&order=created_at.desc&limit=${safeLimit}`;
        const rows = await readRestRows('ess_news', query);
        return rows.map(row => ({
            id: row.id,
            title: row.title,
            subtitle: row.subtitle || '',
            mediaUrl: row.media_url,
            mediaType: 'image',
            createdAt: row.created_at
        }));
    },

    getAll: async () => {
        const rows = await readRestRows('ess_news', '?order=created_at.desc');
        return rows.map(row => ({
            id: row.id,
            title: row.title,
            subtitle: row.subtitle || '',
            mediaUrl: row.media_url || null,
            mediaType: row.media_type || 'image',
            thumbnailUrl: row.thumbnail_url || null,
            createdAt: row.created_at
        }));
    },

    create: async ({ title, subtitle, mediaUrl, mediaType, thumbnailUrl }) => {
        const rows = await postRestRows('ess_news', [{ title, subtitle: subtitle || '', media_url: mediaUrl || null, media_type: mediaType || 'image', thumbnail_url: thumbnailUrl || null }]);
        const row = Array.isArray(rows) ? rows[0] : rows;
        return {
            id: row.id,
            title: row.title,
            subtitle: row.subtitle || '',
            mediaUrl: row.media_url || null,
            mediaType: row.media_type || 'image',
            thumbnailUrl: row.thumbnail_url || null,
            createdAt: row.created_at
        };
    },

    update: async (id, { title, subtitle, mediaUrl, mediaType, thumbnailUrl }) => {
        const payload = {
            title,
            subtitle: subtitle || '',
            media_url: mediaUrl || null,
            media_type: mediaType || 'image',
            thumbnail_url: thumbnailUrl || null,
        };
        const rows = await patchRestRows('ess_news', `?id=eq.${encodeURIComponent(id)}`, payload);
        const row = Array.isArray(rows) ? rows[0] : rows;
        return {
            id: row.id,
            title: row.title,
            subtitle: row.subtitle || '',
            mediaUrl: row.media_url || null,
            mediaType: row.media_type || 'image',
            thumbnailUrl: row.thumbnail_url || null,
            createdAt: row.created_at
        };
    },

    delete: async (id) => {
        await deleteRestRows('ess_news', `?id=eq.${id}`);
    },

    uploadMedia: async (file) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${ESS_NEWS_BUCKET}/${path}`, {
            method: 'POST',
            headers: {
                ...storageHeaders(),
                'Content-Type': file.type || 'application/octet-stream',
                'Cache-Control': 'max-age=31536000, immutable',
            },
            body: file
        });
        if (!response.ok) {
            const details = await response.text();
            throw new Error(details || 'Failed to upload media');
        }
        return `${SUPABASE_URL}/storage/v1/object/public/${ESS_NEWS_BUCKET}/${path}`;
    },

    deleteMedia: async (mediaUrl) => {
        const marker = `/${ESS_NEWS_BUCKET}/`;
        const idx = mediaUrl.indexOf(marker);
        if (idx < 0) return;
        const path = mediaUrl.slice(idx + marker.length);
        await fetch(`${SUPABASE_URL}/storage/v1/object/${ESS_NEWS_BUCKET}/${path}`, {
            method: 'DELETE',
            headers: storageHeaders()
        });
    }
};

export const usersAPI = {
    getAllUsers: async () => {
        const response = await apiClient.get('/users');
        return response.data;
    },

    getNotificationRecipients: async () => {
        const response = await apiClient.get('/users/notification-recipients');
        return response.data;
    },

    updateUserRole: async (userId, role) => {
        const response = await apiClient.put('/users/' + userId + '/role', { role });
        return response.data;
    },

    updateUser: async (userId, { fullName, role, phoneNumber } = {}) => {
        const response = await apiClient.put('/users/' + userId, { fullName, role, phoneNumber });
        return response.data;
    },

    updateMyProfile: async (profile) => {
        const response = await apiClient.put('/users/me', profile);
        const resolvedProfileImageUrl = await hydrateProfileImageUrl(response.data);
        const hydratedUser = { ...response.data, profileImageUrl: resolvedProfileImageUrl };
        localStorage.setItem('user', JSON.stringify(hydratedUser));
        return hydratedUser;
    },

    uploadProfileImage: async (userId, file) => {
        if (!userId || !file) {
            throw new Error('User and image file are required');
        }
        const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post('/users/me/profile-image', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        setCachedAvatarEntry(userId, { ext: extension, missingAt: null });
        return optimizeProfileImageUrl(response.data?.profileImageUrl) || getPublicStorageUrl(PROFILE_IMAGES_BUCKET, `${userId}/avatar.${extension}`);
    },

    getMyCredentials: async () => {
        const response = await apiClient.get('/users/me/credentials');
        return response.data || [];
    },

    getUserCredentials: async (userId) => {
        if (!userId) return [];
        const response = await apiClient.get(`/users/${encodeURIComponent(userId)}/credentials`);
        return response.data || [];
    },

    saveMyCredential: async (credentialType, credential, frontImage = null) => {
        const formData = new FormData();
        formData.append('credentialNumber', credential?.credentialNumber || '');
        formData.append('licenceClasses', credential?.licenceClasses || '');
        formData.append('issuingState', credential?.issuingState || 'NSW');
        if (credential?.issueDate) formData.append('issueDate', credential.issueDate);
        if (credential?.expiryDate) formData.append('expiryDate', credential.expiryDate);
        if (frontImage) formData.append('frontImage', frontImage);

        const response = await apiClient.put(
            `/users/me/credentials/${encodeURIComponent(credentialType)}`,
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        return response.data;
    },

    deleteUser: async (userId) => {
        const response = await apiClient.delete('/users/' + userId);
        return response.data;
    }
};

export const assistantAPI = {
    listConversations: async (limit = 100) => {
        const response = await apiClient.get('/assistant/conversations', { params: { limit } });
        return response.data || [];
    },
    getConversation: async (conversationId) => {
        const response = await apiClient.get(`/assistant/conversations/${encodeURIComponent(conversationId)}`);
        return response.data;
    },
    renameConversation: async (conversationId, title) => {
        const response = await apiClient.patch(`/assistant/conversations/${encodeURIComponent(conversationId)}`, { title });
        return response.data;
    },
    deleteConversation: async (conversationId) => {
        await apiClient.delete(`/assistant/conversations/${encodeURIComponent(conversationId)}`);
    },
    chat: async (message, options = {}) => {
        const response = await apiClient.post('/assistant/chat', {
            message,
            conversationId: options.conversationId || null,
            history: options.history || [],
            pageContext: options.pageContext || null,
        });
        return response.data;
    },
    chatStream: async (message, options = {}, onEvent = () => {}) => {
        if (!isAccessTokenFresh() && localStorage.getItem('refresh_token')) {
            await refreshAuthSession();
        }

        const send = () => fetch(`${API_BASE_URL}/assistant/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
            },
            body: JSON.stringify({
                message,
                conversationId: options.conversationId || null,
                history: options.history || [],
                pageContext: options.pageContext || null,
            }),
            signal: options.signal,
        });

        let response = await send();
        if (response.status === 401 && localStorage.getItem('refresh_token')) {
            await refreshAuthSession();
            response = await send();
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Assistant request failed (${response.status})`);
        }
        if (!response.body) {
            throw new Error('Streaming is unavailable in this browser.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() || '';
            for (const block of blocks) {
                const data = block
                    .split(/\r?\n/)
                    .filter(line => line.startsWith('data:'))
                    .map(line => line.slice(5).trim())
                    .join('\n');
                if (!data) continue;
                const event = JSON.parse(data);
                onEvent(event);
                if (event.type === 'error') {
                    throw new Error(event.message || 'ESS Assistant could not complete that request.');
                }
            }
            if (done) break;
        }
        if (buffer.trim()) {
            const data = buffer
                .split(/\r?\n/)
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trim())
                .join('\n');
            if (data) {
                const event = JSON.parse(data);
                onEvent(event);
                if (event.type === 'error') {
                    throw new Error(event.message || 'ESS Assistant could not complete that request.');
                }
            }
        }
    },
    feedback: async (payload) => {
        const response = await apiClient.post('/assistant/feedback', payload);
        return response.data;
    },
    listFeedback: async (limit = 250) => {
        const response = await apiClient.get('/assistant/feedback/logs', { params: { limit } });
        return response.data;
    },
    clearFeedback: async () => {
        await apiClient.delete('/assistant/feedback/logs');
    }
};

export const adminAssistantAPI = assistantAPI;
export const analysisAPI = {
    recommendTimeSlot: async (payload) => {
        const response = await apiClient.post('/analysis/recommend-time-slot', payload);
        return response.data;
    },
    routePreview: async (siteLocation, schedule = {}) => {
        const response = await apiClient.post('/analysis/route-preview', { siteLocation, ...schedule });
        return response.data;
    },
    routePreviewBetween: async (fromLocation, toLocation, schedule = {}) => {
        const response = await apiClient.post('/analysis/route-preview-between', { fromLocation, toLocation, ...schedule });
        return response.data;
    },
    addressSuggestions: async (query, options = {}) => {
        const response = await apiClient.post('/analysis/address-suggestions', { query, limit: 6 }, { signal: options.signal });
        return response.data;
    },
    reverseGeocode: async ({ lat, lon }, options = {}) => {
        const response = await apiClient.post('/analysis/reverse-geocode', { lat, lon }, { signal: options.signal });
        return response.data;
    },
};

export default { authAPI, foldersAPI, preferencesAPI, usersAPI, essNewsAPI };
