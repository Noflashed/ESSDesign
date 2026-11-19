import React, { useEffect, useRef } from 'react';
import './DrawingUpload.css';

export default function DrawingDialog({ titleId, onClose, children }) {
    const ref = useRef(null);
    useEffect(() => {
        const dialog = ref.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);
    return (
        <dialog ref={ref} className="drawing-upload" aria-labelledby={titleId}
            onCancel={event => { event.preventDefault(); onClose(); }}
            onClick={event => { if (event.target === ref.current) onClose(); }}>
            {children}
        </dialog>
    );
}
