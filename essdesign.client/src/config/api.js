export const API_BASE_URL = import.meta.env.PROD
    ? '/api'
    : import.meta.env.VITE_API_URL || 'https://localhost:7001/api';

export const API_ORIGIN_URL = API_BASE_URL.replace(/\/api\/?$/i, '');

// Large multipart uploads must bypass Vercel's external rewrite proxy.
export const UPLOAD_API_BASE_URL = (import.meta.env.VITE_UPLOAD_API_URL ||
    (import.meta.env.PROD ? 'https://essdesign-production.up.railway.app/api' : API_BASE_URL)).replace(/\/$/, '');
