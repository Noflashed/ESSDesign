export const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

function errorText(value) {
    if (typeof value === 'string') return value.trim() === '[object Object]' ? '' : value.trim();
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) return value.map(errorText).filter(Boolean).join('; ');
    for (const key of ['message', 'detail', 'error', 'errors', 'title', 'code']) {
        const text = errorText(value[key]);
        if (text) return text;
    }
    return Object.values(value).map(errorText).filter(Boolean).join('; ');
}

export function normalizeUploadError(error) {
    const response = error.response;
    const status = response?.status;
    let message;
    if (response) {
        const body = response.data;
        const isHtml = String(response.headers?.['content-type'] || '').includes('text/html') ||
            (typeof body === 'string' && /^\s*</.test(body));
        message = isHtml ? '' : errorText(body);
        if (!message) {
            message = status === 413 ? 'The upload exceeds the server file-size limit.' :
                status === 401 ? 'Your session has expired. Sign in again before uploading.' :
                status === 403 ? 'You do not have permission to upload this document.' :
                status === 502 || status === 504 ? 'The upload gateway could not complete the request.' :
                'The server rejected the upload.';
        }
        message = `${message} (HTTP ${status})`;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        message = 'The upload timed out. Check whether the document was saved before retrying.';
    } else if (error.request) {
        message = 'The upload connection failed before a response was received. Check your connection and whether the document was saved before retrying.';
    } else {
        message = errorText(error.message) || 'The upload failed before it could be sent.';
    }
    const result = new Error(message, { cause: error });
    result.response = response;
    result.code = error.code;
    return result;
}
