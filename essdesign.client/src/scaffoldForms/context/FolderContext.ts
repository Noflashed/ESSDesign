import {useAuth} from './AuthContext';
const folders = {rootFolders: [], goToRoot() {}, clearSearch() {}, async loadRootFolders() {}};
export const useFolders = () => {
 const {notificationRecipients, loadNotificationRecipients} = useAuth();
 return {...folders, notificationRecipients, loadNotificationRecipients};
};
