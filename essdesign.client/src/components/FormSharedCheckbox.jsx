import {Check} from 'lucide-react';
import {isFormShared} from '../utils/projectDataStatus';
import './FormSharedCheckbox.css';

export default function FormSharedCheckbox({form}) {
    const shared = isFormShared(form);
    return <span className={`form-shared-checkbox${shared ? ' is-checked' : ''}`}
        role="checkbox" aria-label="Form Shared" aria-checked={shared} aria-disabled="true"
        title={shared ? 'Form Shared' : 'Not Shared'}>
        {shared && <Check size={13} strokeWidth={2.25} aria-hidden="true" />}
    </span>;
}
