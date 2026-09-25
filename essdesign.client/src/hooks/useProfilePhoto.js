import { useEffect, useState } from 'react';
import { AVATAR_EXT_CACHE_KEY, PROFILE_PHOTO_CHANGED_EVENT, resolveProfileImageUrl } from '../services/api';

export default function useProfilePhoto(userId, resolve = resolveProfileImageUrl) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        let active = true;
        let revision = 0;
        setUrl('');
        if (!userId) return undefined;
        const refresh = (forceRefresh = false) => {
            const requestRevision = ++revision;
            resolve(userId, { forceRefresh }).then(value => {
                if (active && requestRevision === revision) setUrl(value || '');
            }).catch(() => {});
        };
        const onChange = (event) => {
            if (event.detail?.userId !== userId) return;
            revision++;
            setUrl(event.detail.url || '');
        };
        const onFocus = () => refresh();
        const onStorage = (event) => {
            if (event.key === AVATAR_EXT_CACHE_KEY) refresh();
        };
        refresh();
        window.addEventListener(PROFILE_PHOTO_CHANGED_EVENT, onChange);
        window.addEventListener('focus', onFocus);
        window.addEventListener('storage', onStorage);
        return () => {
            active = false;
            window.removeEventListener(PROFILE_PHOTO_CHANGED_EVENT, onChange);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('storage', onStorage);
        };
    }, [userId, resolve]);
    return url;
}
