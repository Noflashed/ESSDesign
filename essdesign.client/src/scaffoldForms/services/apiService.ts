import {scaffoldFormBridge, foldersAPI, authAPI} from '../../services/api';
export default {
 get authToken() { return localStorage.getItem('access_token'); },
 get currentUser() { return authAPI.getCurrentUser(); },
 fetchSupabase: scaffoldFormBridge.fetchSupabase,
 getRootFolders: foldersAPI.getRootFolders,
 getFolder: foldersAPI.getFolder,
 getBreadcrumbs: foldersAPI.getBreadcrumbs,
 getDownloadUrl: foldersAPI.getDownloadUrl,
 shareProjectDataForm: scaffoldFormBridge.shareProjectDataForm,
};
