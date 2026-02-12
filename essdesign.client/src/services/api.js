import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:7001/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' }
});

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
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    deleteDocument: async (documentId) => {
        const response = await apiClient.delete(`/folders/documents/${documentId}`);
        return response.data;
    },

    getDownloadUrl: async (documentId, type) => {
        const response = await apiClient.get(`/folders/documents/${documentId}/download/${type}`);
        return response.data.url;
    }
};

export default foldersAPI;
