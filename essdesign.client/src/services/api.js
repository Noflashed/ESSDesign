import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:7001/api';
const API_ORIGIN_URL = API_BASE_URL.replace(/\/api\/?$/i, '');
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
    signUp: async (email, password, fullName, employeeId = null) => {
        const response = await apiClient.post('/auth/signup', { email, password, fullName, employeeId });
        const resolvedProfileImageUrl = await resolveProfileImageUrl(response.data.user?.id);
        const hydratedUser = { ...response.data.user, profileImageUrl: resolvedProfileImageUrl };
        return { ...response.data, user: hydratedUser };
    },

    signIn: async (identifier, password) => {
        const response = await apiClient.post('/auth/signin', { email: identifier, identifier, password });
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

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_3oESnoF2yG5rix4SSQj8cQ_1aoavcCw';
const SUPABASE_REST_BASE = `${SUPABASE_URL}/rest/v1`;
const SAFETY_BUCKET = 'project-information';
const ESS_NEWS_BUCKET = 'ess-news';
const SAFETY_PROJECTS_PATH = 'projects.json';

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
                                archived: Boolean(project.archived),
                                archivedAt: project.archivedAt || null,
                                siteLocation: (project.siteLocation || '').trim(),
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

function cloneSafetyBuilders(builders, { includeArchived = true } = {}) {
    return builders.map(builder => ({
        ...builder,
        projects: builder.projects
            .filter(project => includeArchived || !project.archived)
            .map(project => ({ ...project }))
    }));
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
    getBuilders: async ({ includeArchived = false } = {}) => {
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
        return cloneSafetyBuilders(parseSafetyProjects(json).builders, { includeArchived });
    },

    createBuilderAndProject: async (builderName, projectName) => {
        const cleanBuilder = builderName.trim();
        const cleanProject = projectName.trim();
        if (!cleanBuilder || !cleanProject) {
            throw new Error('Builder and project names are required');
        }

        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
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
                archived: false,
                archivedAt: null,
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
                    archived: false,
                    archivedAt: null,
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

    createBuilder: async (builderName) => {
        const cleanBuilder = builderName.trim();
        if (!cleanBuilder) {
            throw new Error('Builder name is required');
        }

        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
        const duplicate = builders.some(builder => builder.name.toLowerCase() === cleanBuilder.toLowerCase());
        if (duplicate) {
            throw new Error('A builder with that name already exists');
        }

        const timestamp = nowIso();
        builders.push({
            id: makeId(),
            name: cleanBuilder,
            projects: [],
            createdAt: timestamp,
            updatedAt: timestamp
        });
        builders.sort((a, b) => a.name.localeCompare(b.name));
        await saveSafetyProjectsDocument({ builders, updatedAt: timestamp });
        return builders;
    },

    createProject: async (builderId, projectName, siteLocation = '') => {
        const cleanProject = projectName.trim();
        const cleanLocation = siteLocation.trim();
        if (!builderId) {
            throw new Error('Builder is required');
        }
        if (!cleanProject) {
            throw new Error('Project site name is required');
        }

        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
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
            archived: false,
            archivedAt: null,
            siteLocation: cleanLocation,
            createdAt: timestamp,
            updatedAt: timestamp
        });
        builder.projects.sort((a, b) => a.name.localeCompare(b.name));
        builder.updatedAt = timestamp;
        await saveSafetyProjectsDocument({ builders, updatedAt: timestamp });
        return builders;
    },

    renameBuilder: async (builderId, nextName) => {
        const clean = nextName.trim();
        if (!clean) {
            throw new Error('Builder name is required');
        }
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
        const target = builders.find(builder => builder.id === builderId);
        if (!target) {
            throw new Error('Builder not found');
        }
        const duplicate = builders.some(builder => builder.id !== builderId && builder.name.toLowerCase() === clean.toLowerCase());
        if (duplicate) {
            throw new Error('A builder with that name already exists');
        }
        target.name = clean;
        target.updatedAt = nowIso();
        builders.sort((a, b) => a.name.localeCompare(b.name));
        await saveSafetyProjectsDocument({ builders, updatedAt: nowIso() });
        return builders;
    },

    renameProject: async (builderId, projectId, nextName, siteLocation = '') => {
        const clean = nextName.trim();
        const cleanLocation = siteLocation.trim();
        if (!clean) {
            throw new Error('Project name is required');
        }
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
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
        project.updatedAt = nowIso();
        builder.projects.sort((a, b) => a.name.localeCompare(b.name));
        builder.updatedAt = nowIso();
        await saveSafetyProjectsDocument({ builders, updatedAt: nowIso() });
        return builders;
    },

    deleteBuilder: async (builderId) => {
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
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
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
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
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
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
        const builders = await safetyProjectsAPI.getBuilders({ includeArchived: true });
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

function normalizeMaterialOrderRequestListItem(item) {
    const scheduledAtIso = buildMaterialOrderRequestScheduleIso(item);
    const archivedAt = item?.archivedAt || null;
    const scheduledDate = item?.scheduledDate || null;
    const scheduledTruckId = item?.scheduledTruckId || item?.truckId || null;
    const scheduledTruckLabel = item?.scheduledTruckLabel || item?.truckLabel || null;
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
        sourceOrderId: item?.sourceOrderId || null,
        connectedParentStartMinutes: typeof item?.connectedParentStartMinutes === 'number' ? item.connectedParentStartMinutes : null,
        routeType: item?.routeType || null,
        scheduleRemovedAt: item?.scheduleRemovedAt || null,
        pdfPath: item?.pdfPath || '',
        scaffoldingSystem: item?.scaffoldingSystem || '',
        details: item?.details || '',
        notes: item?.notes || '',
        itemValues: item?.itemValues && typeof item.itemValues === 'object'
            ? item.itemValues
            : item?.item_values && typeof item.item_values === 'object'
                ? item.item_values
                : {},
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
    const scheduledDate = record.scheduledDate || null;
    const scheduledTruckId = record.scheduledTruckId || record.truckId || null;
    const scheduledTruckLabel = record.scheduledTruckLabel || record.truckLabel || null;
    const endOfDay = scheduledDate ? new Date(`${scheduledDate}T23:59:59`).getTime() : null;
    const shouldArchive = !archivedAt && endOfDay !== null && isFinite(endOfDay) && endOfDay <= Date.now();

    return {
        ...record,
        requestedByUserId: record.requestedByUserId || null,
        notes: record.notes || '',
        details: record.details || record?.itemValues?.__details || record?.item_values?.__details || '',
        scaffoldingSystem: record.scaffoldingSystem || record?.itemValues?.__scaffoldingSystem || record?.item_values?.__scaffoldingSystem || '',
        itemValues: record.itemValues && typeof record.itemValues === 'object'
            ? record.itemValues
            : record.item_values && typeof record.item_values === 'object'
                ? record.item_values
                : {},
        scheduledDate,
        scheduledHour: typeof record.scheduledHour === 'number' ? record.scheduledHour : null,
        scheduledMinute: typeof record.scheduledMinute === 'number' ? record.scheduledMinute : null,
        connectedParentStartMinutes: typeof record.connectedParentStartMinutes === 'number' ? record.connectedParentStartMinutes : null,
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
    listActiveRequests: async ({ includeArchived = false } = {}) => {
        const raw = await readStorageJson('material-order-requests/index.json');
        const items = Array.isArray(raw?.requests) ? raw.requests : [];
        return items
            .map(normalizeMaterialOrderRequestListItem)
            .filter(item => item.id && (includeArchived || !item.archivedAt))
            .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    },

    submitRequest: async (form) => {
        const requestId = makeId();
        const submittedAt = nowIso();
        const scaffoldingSystem = form?.itemValues?.__scaffoldingSystem || '';
        const details = form?.itemValues?.__details || '';
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
            itemValues: form?.itemValues || {},
            pdfPath: '',
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
            `material-order-requests/requests/${requestId}.json`,
            JSON.stringify(record),
            'application/json'
        );

        const indexPath = 'material-order-requests/index.json';
        const rawIndex = await readStorageJson(indexPath);
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
                    pdfPath: '',
                    scaffoldingSystem,
                    details,
                    notes: record.notes || '',
                    itemValues: record.itemValues || {},
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
    },

    listArchivedRequests: async () => {
        const raw = await readStorageJson('material-order-requests/index.json');
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
        const request = await readStorageJson(`material-order-requests/requests/${requestId}.json`);
        return normalizeMaterialOrderRequestRecord(request);
    },

    getPdfUrl: async (request) => signedStorageUrl(request.pdfPath, 60 * 60 * 24 * 14),

    archiveRequest: async (requestId) => {
        const indexPath = 'material-order-requests/index.json';
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`),
            readStorageJson(indexPath),
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
    },

    setSchedule: async (requestId, { date, hour, minute, truckId, truckLabel }) => {
        const indexPath = 'material-order-requests/index.json';
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`),
            readStorageJson(indexPath),
        ]);
        if (!record) throw new Error('Request not found');
        if (record.archivedAt || record.deliveryConfirmedAt || record.deliveryStatus === 'return_transit') {
            throw new Error('Completed material orders cannot be rescheduled.');
        }
        const scheduledAtIso = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        const updated = {
            ...record,
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
            secondaryRoute: normalizeSecondaryRoute(record.secondaryRoute),
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
                    secondaryRoute: normalizeSecondaryRoute(item.secondaryRoute),
                }
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    },

    clearSchedule: async (requestId, options = {}) => {
        const indexPath = 'material-order-requests/index.json';
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`),
            readStorageJson(indexPath),
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
        const updated = {
            ...record,
            sourceOrderId: shouldRestoreMaterialOrder ? null : record.sourceOrderId,
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
        };
        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.map(item => item.id === requestId
                ? {
                    ...item,
                    sourceOrderId: shouldRestoreMaterialOrder ? null : item.sourceOrderId,
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
                }
                : item),
            updatedAt: nowIso(),
        };
        await Promise.all([
            uploadStorageObject(`material-order-requests/requests/${requestId}.json`, JSON.stringify(updated), 'application/json'),
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
        ]);
        return normalizeMaterialOrderRequestRecord(updated);
    },

    removeCompletedFromSchedule: async (requestId) => {
        const indexPath = 'material-order-requests/index.json';
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`),
            readStorageJson(indexPath),
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
    },

    updateDeliveryStatus: async (requestId, { status, startedAt = null, unloadingAt = null, confirmedAt = null }) => {
        const indexPath = 'material-order-requests/index.json';
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`),
            readStorageJson(indexPath),
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
    },

    setSecondaryRoute: async (requestId, secondaryRoute, schedule = {}) => {
        const indexPath = 'material-order-requests/index.json';
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`),
            readStorageJson(indexPath),
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
            ? await readStorageJson(`material-order-requests/requests/${linkedIndexItem.id}.json`).catch(() => null)
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
            ? await readStorageJson(`material-order-requests/requests/${existingSecondaryIndexItem.id}.json`).catch(() => null)
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
        const relinkedContinuationRecord = relinkedContinuationId
            ? {
                ...(relinkedContinuation || {}),
                id: relinkedContinuationId,
                sourceOrderId: secondaryRequestId,
                connectedParentStartMinutes: typeof relinkedScheduledHour === 'number' && typeof relinkedScheduledMinute === 'number'
                    ? relinkedScheduledHour * 60 + relinkedScheduledMinute
                    : relinkedContinuation.connectedParentStartMinutes ?? null,
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
    },

    deleteRequest: async (requestId) => {
        const indexPath = 'material-order-requests/index.json';
        const [record, rawIndex] = await Promise.all([
            readStorageJson(`material-order-requests/requests/${requestId}.json`),
            readStorageJson(indexPath),
        ]);
        if (!record) throw new Error('Request not found');

        const existingIndex = Array.isArray(rawIndex?.requests) ? rawIndex.requests : [];
        const nextIndex = {
            requests: existingIndex.filter(item => item.id !== requestId),
            updatedAt: nowIso(),
        };

        await Promise.all([
            uploadStorageObject(indexPath, JSON.stringify(nextIndex), 'application/json'),
            deleteStorageObject(`material-order-requests/requests/${requestId}.json`).catch(() => {}),
        ]);
    },
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

    delete: async (id) => {
        await deleteRestRows('ess_news', `?id=eq.${id}`);
    },

    uploadMedia: async (file) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${ESS_NEWS_BUCKET}/${path}`, {
            method: 'POST',
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': file.type },
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

    deleteUser: async (userId) => {
        const response = await apiClient.delete('/users/' + userId);
        return response.data;
    }
};

export const adminAssistantAPI = {
    chat: async (message, history = []) => {
        const response = await apiClient.post('/admin-assistant/chat', { message, history });
        return response.data;
    }
};
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
};

export default { authAPI, foldersAPI, preferencesAPI, usersAPI, essNewsAPI };
