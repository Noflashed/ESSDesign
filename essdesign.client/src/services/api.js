import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:7001/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const authAPI = {
    signUp: async (email, password, fullName) => {
        const response = await apiClient.post('/auth/signup', { email, password, fullName });
        if (response.data.accessToken) {
            localStorage.setItem('access_token', response.data.accessToken);
            localStorage.setItem('refresh_token', response.data.refreshToken);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    signIn: async (email, password) => {
        const response = await apiClient.post('/auth/signin', { email, password });
        if (response.data.accessToken) {
            localStorage.setItem('access_token', response.data.accessToken);
            localStorage.setItem('refresh_token', response.data.refreshToken);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    signOut: async () => {
        await apiClient.post('/auth/signout');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
    },

    getCurrentUser: () => {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },

    isAuthenticated: () => {
        return !!localStorage.getItem('access_token');
    }
};

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
        const response = await apiClient.post('/folders', { name, parentFolderId });
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

    uploadDocument: async (folderId, revisionNumber, essDesignFile, thirdPartyFile) => {
        const formData = new FormData();
        formData.append('FolderId', folderId);
        formData.append('RevisionNumber', revisionNumber);
        if (essDesignFile) formData.append('EssDesignIssue', essDesignFile);
        if (thirdPartyFile) formData.append('ThirdPartyDesign', thirdPartyFile);

        const response = await axios.post(`${API_BASE_URL}/folders/documents`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
        });
        return response.data;
    },

    deleteDocument: async (documentId) => {
        const response = await apiClient.delete(`/folders/documents/${documentId}`);
        return response.data;
    },

    getDownloadUrl: async (documentId, type) => {
        const response = await apiClient.get(`/folders/documents/${documentId}/download/${type}`);
        return response.data; // Returns { url, fileName }
    },

    search: async (query) => {
        const response = await apiClient.get(`/folders/search?q=${encodeURIComponent(query)}`);
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

export default { authAPI, foldersAPI, preferencesAPI };