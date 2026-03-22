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






