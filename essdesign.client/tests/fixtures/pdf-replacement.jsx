import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import PDFViewer from '../../src/components/PDFViewer';
function Fixture() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open old message</button>{open && <PDFViewer documentId="drawing-test" fileType="ess" fileName="Old message title.pdf" versionKey="unchanged-old-message" onClose={() => setOpen(false)} />}</>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
