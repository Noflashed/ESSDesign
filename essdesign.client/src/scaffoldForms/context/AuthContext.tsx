import React from 'react';
import {authAPI, usersAPI} from '../../services/api';
export const useAuth = () => {
 const [notificationRecipients, setRecipients] = React.useState([]);
 const loadNotificationRecipients = React.useCallback(async () => {
  const users = await usersAPI.getNotificationRecipients(); setRecipients(users); return users;
 }, []);
 return {user: authAPI.getCurrentUser(), notificationRecipients, loadNotificationRecipients};
};
