import React, { createContext, useContext, useState } from 'react';
import './Toast.css';

const ToastContext = createContext();

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const normalizeToastInput = (input, type = 'info') => {
        if (typeof input === 'object' && input !== null) {
            return {
                type: input.type ?? type,
                title: input.title ?? '',
                message: input.message ?? '',
                progress: typeof input.progress === 'number' ? input.progress : null,
                variant: input.variant ?? null,
                closable: input.closable ?? true
            };
        }

        return {
            type,
            title: '',
            message: input,
            progress: null,
            variant: null,
            closable: true
        };
    };

    const showToast = (message, type = 'info', duration = 3000) => {
        const id = Date.now() + Math.random();
        const toast = { id, ...normalizeToastInput(message, type) };

        setToasts(prev => [...prev, toast]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }

        return id;
    };

    const updateToast = (id, message, type, duration = 3000) => {
        setToasts(prev => prev.map(t =>
            t.id === id ? { ...t, ...normalizeToastInput(message, type ?? t.type) } : t
        ));

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const renderStandardIcon = (type) => {
        if (type === 'success') return '✓';
        if (type === 'error') return '✕';
        return 'i';
    };

    return (
        <ToastContext.Provider value={{ showToast, updateToast, removeToast }}>
            {children}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`toast toast-${toast.type}${toast.variant ? ` toast-${toast.variant}` : ''}`}
                    >
                        {toast.variant === 'upload-progress' ? (
                            <>
                                <div className="toast-upload-content">
                                    <div className="toast-upload-title">{toast.title || 'Uploading file'}</div>
                                    <div className="toast-upload-message">{toast.message}</div>
                                </div>
                                <div
                                    className="toast-progress-ring"
                                    style={{ '--progress': `${toast.progress ?? 0}%` }}
                                    aria-label={`${Math.round(toast.progress ?? 0)}% uploaded`}
                                >
                                    <span>{Math.round(toast.progress ?? 0)}%</span>
                                </div>
                                {toast.closable && (
                                    <button className="toast-close" onClick={() => removeToast(toast.id)}>✕</button>
                                )}
                            </>
                        ) : (
                            <>
                                <span className="toast-icon">{renderStandardIcon(toast.type)}</span>
                                <span className="toast-message">{toast.message}</span>
                                {toast.closable && (
                                    <button className="toast-close" onClick={() => removeToast(toast.id)}>✕</button>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};
