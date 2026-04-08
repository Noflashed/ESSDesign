import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:7001/api';
const SUPABASE_URL = 'https://jyjsbbugskbbhibhlyks.supabase.co';
const PROFILE_IMAGES_BUCKET = 'profile-images';

const getPublicStorageUrl = (bucket, objectPath) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;

const resolveProfileImageUrl = async (userId) => {
    if (!userId) return null;

    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

    for (const ext of extensions) {
        const objectPath = `${userId}/avatar.${ext}`;
        const testUrl = `${getPublicStorageUrl(PROFILE_IMAGES_BUCKET, objectPath)}?t=${Date.now()}`;
        try {
            const response = await fetch(testUrl, { method: 'HEAD' });
            if (response.ok) {
                return testUrl;
            }
        } catch {
            // Try next possible extension.
        }
    }

    return null;
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
                const resolvedProfileImageUrl = await resolveProfileImageUrl(response.data.user?.id);
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
    signUp: async (email, password, fullName) => {
        const response = await apiClient.post('/auth/signup', { email, password, fullName });
        const resolvedProfileImageUrl = await resolveProfileImageUrl(response.data.user?.id);
        const hydratedUser = { ...response.data.user, profileImageUrl: resolvedProfileImageUrl };
        return { ...response.data, user: hydratedUser };
    },

    signIn: async (email, password) => {
        const response = await apiClient.post('/auth/signin', { email, password });
        const resolvedProfileImageUrl = await resolveProfileImageUrl(response.data.user?.id);
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
            const resolvedProfileImageUrl = await resolveProfileImageUrl(response.data?.id);
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
        if (!refreshToken) {
            clearStoredAuth();
            throw new Error('No refresh token available');
        }

        const refreshedSession = await refreshAuthSession();
        return refreshedSession.user ?? authAPI.getCurrentUser();
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
    }
};

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_3oESnoF2yG5rix4SSQj8cQ_1aoavcCw';
const SUPABASE_REST_BASE = `${SUPABASE_URL}/rest/v1`;
const SAFETY_BUCKET = 'project-information';
const SAFETY_PROJECTS_PATH = 'projects.json';

const supabaseRestHeaders = (contentType = false, upsert = false) => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    ...(upsert ? { Prefer: 'resolution=merge-duplicates,return=representation' } : {})
});

const storageHeaders = (contentType = false) => ({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {})
});

const nowIso = () => new Date().toISOString();
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const safetyProjectsObjectUrl = () => `${SUPABASE_URL}/storage/v1/object/${SAFETY_BUCKET}/${SAFETY_PROJECTS_PATH}`;
const safetyProjectsObjectUpsertUrl = () => `${safetyProjectsObjectUrl()}?upsert=true`;
const safetyBucketListUrl = () => `${SUPABASE_URL}/storage/v1/object/list/${SAFETY_BUCKET}`;

let verifiedSafetyBucket = false;

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
                    projects: [],
                    createdAt: item.createdAt || nowIso(),
                    updatedAt: item.updatedAt || nowIso()
                })),
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
                    projects: Array.isArray(builder.projects)
                        ? builder.projects
                            .filter(project => project && typeof project.name === 'string')
                            .map(project => ({
                                id: project.id || makeId(),
                                name: project.name.trim(),
                                createdAt: project.createdAt || nowIso(),
                                updatedAt: project.updatedAt || nowIso()
                            }))
                            .sort((a, b) => a.name.localeCompare(b.name))
                        : [],
                    createdAt: builder.createdAt || nowIso(),
                    updatedAt: builder.updatedAt || nowIso()
                }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            updatedAt: raw.updatedAt || nowIso()
        };
    }

    return { builders: [], updatedAt: nowIso() };
}

async function saveSafetyProjectsDocument(doc) {
    await ensureSafetyBucketAccess();
    const payload = JSON.stringify(doc);
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
            return;
        }

        lastError = await response.text();
    }

    throw new Error(lastError || 'Failed to save safety projects');
}

const restEndpoint = (table, query = '') => `${SUPABASE_REST_BASE}/${table}${query}`;

async function readRestRows(table, query = '') {
    const response = await fetch(restEndpoint(table, query), {
        method: 'GET',
        headers: supabaseRestHeaders()
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

function mapEmployeeRow(row) {
    return {
        id: row.id,
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phoneNumber: row.phone_number || '',
        preferredSiteIds: [row.preferred_site_1, row.preferred_site_2, row.preferred_site_3].filter(Boolean),
        createdAt: row.created_at || nowIso(),
        updatedAt: row.updated_at || nowIso()
    };
}

export const safetyProjectsAPI = {
    getBuilders: async () => {
        await ensureSafetyBucketAccess();
        const response = await fetch(`${safetyProjectsObjectUrl()}?t=${Date.now()}`, {
            method: 'GET',
            headers: storageHeaders()
        });

        if (response.status === 404) {
            return [];
        }

        if (!response.ok) {
            const details = await response.text();
            if ((details || '').toLowerCase().includes('object not found')) {
                return [];
            }
            throw new Error(details || 'Failed to load projects');
        }

        const json = await response.json();
        return parseSafetyProjects(json).builders;
    },

    createBuilderAndProject: async (builderName, projectName) => {
        const cleanBuilder = builderName.trim();
        const cleanProject = projectName.trim();
        if (!cleanBuilder || !cleanProject) {
            throw new Error('Builder and project names are required');
        }

        const builders = await safetyProjectsAPI.getBuilders();
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
                createdAt: timestamp,
                updatedAt: timestamp
            });
            existingBuilder.projects.sort((a, b) => a.name.localeCompare(b.name));
            existingBuilder.updatedAt = timestamp;
        } else {
            builders.push({
                id: makeId(),
                name: cleanBuilder,
                projects: [{
                    id: makeId(),
                    name: cleanProject,
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
    }
};

export const rosteringAPI = {
    getEmployees: async () => {
        const rows = await readRestRows('ess_rostering_employees', '?select=*&order=last_name.asc,first_name.asc');
        return rows.map(mapEmployeeRow);
    },

    saveEmployee: async ({ id, firstName, lastName, phoneNumber, preferredSiteIds }) => {
        const cleanPreferred = preferredSiteIds.filter(Boolean).slice(0, 3);
        const payload = {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone_number: phoneNumber.trim() || null,
            preferred_site_1: cleanPreferred[0] || null,
            preferred_site_2: cleanPreferred[1] || null,
            preferred_site_3: cleanPreferred[2] || null,
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
        await deleteRestRows('ess_rostering_employees', `?id=eq.${encodeURIComponent(employeeId)}`);
        return rosteringAPI.getEmployees();
    },

    getPlan: async () => {
        const rows = await readRestRows('ess_rostering_plans', '?select=*&order=plan_date.desc&limit=1');
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
    }
};

const safetyModulePrefix = (builderId, projectId, kind) => `site-data/${builderId}/${projectId}/${kind}`;
const safetyModuleObjectUrl = (path) => `${SUPABASE_URL}/storage/v1/object/${SAFETY_BUCKET}/${path}`;
const safetyModuleSignUrl = (path) => `${SUPABASE_URL}/storage/v1/object/sign/${SAFETY_BUCKET}/${path}`;

async function uploadStorageObject(path, body, contentType) {
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
                'Content-Type': contentType
            },
            body
        });
        if (response.ok) {
            return;
        }
        lastError = await response.text();
    }

    throw new Error(lastError || 'Upload failed');
}

async function signedStorageUrl(path, expiresIn = 3600) {
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
    return `${SUPABASE_URL}/storage/v1${payload.signedURL}`;
}

async function readStorageJson(path) {
    const response = await fetch(`${safetyModuleObjectUrl(path)}?t=${Date.now()}`, {
        method: 'GET',
        headers: storageHeaders()
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const details = await response.text();
        if ((details || '').toLowerCase().includes('object not found')) {
            return null;
        }
        throw new Error(details || `Failed to load ${path}`);
    }

    return response.json();
}

async function deleteStorageObject(path) {
    const response = await fetch(safetyModuleObjectUrl(path), {
        method: 'DELETE',
        headers: storageHeaders()
    });

    if (response.status === 404) {
        return;
    }

    if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Failed to delete ${path}`);
    }
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

    getSignedModuleFileUrl: async (path) => signedStorageUrl(path, 3600)
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

export const usersAPI = {
    getAllUsers: async () => {
        const response = await apiClient.get('/users');
        return response.data;
    },

    updateUserRole: async (userId, role) => {
        const response = await apiClient.put('/users/' + userId + '/role', { role });
        return response.data;
    }
};
export default { authAPI, foldersAPI, preferencesAPI, usersAPI };



