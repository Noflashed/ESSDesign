export const API_BASE_URL = import.meta.env.PROD
    ? '/api'
    : import.meta.env.VITE_API_URL || 'https://localhost:7001/api';

export const API_ORIGIN_URL = API_BASE_URL.replace(/\/api\/?$/i, '');
