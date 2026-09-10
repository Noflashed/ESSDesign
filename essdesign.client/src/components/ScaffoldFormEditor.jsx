import React, {useMemo, useState} from 'react';
import HandoverCertificateFormScreen from '../scaffoldForms/screens/HandoverCertificateFormScreen';
import DayLabourVariationFormScreen from '../scaffoldForms/screens/DayLabourVariationFormScreen';
import PreStartFormScreen from '../scaffoldForms/screens/PreStartFormScreen';
import ScaffTagFormScreen from '../scaffoldForms/screens/ScaffTagFormScreen';

export default function ScaffoldFormEditor({screen, params, onClose, onSaved}) {
    const [stack, setStack] = useState([{screen, params}]);
    const current = stack[stack.length - 1];
    const navigation = useMemo(() => ({
        goBack() {
            onSaved();
            if (stack.length > 1) setStack(previous => previous.slice(0, -1));
            else onClose();
        },
        navigate(nextScreen, nextParams) {
            if (nextScreen === 'PDFViewer') {
                window.open(nextParams.url, '_blank', 'noopener,noreferrer');
            } else if (['PreStartForm', 'HandoverCertificateForm', 'ScaffTagForm', 'DayLabourVariationForm'].includes(nextScreen)) {
                setStack(previous => [...previous, {screen: nextScreen, params: nextParams}]);
            } else onClose();
        },
        reset: onClose,
    }), [stack.length, onClose, onSaved]);
    return <div className="scaffold-form-editor" role="dialog" aria-modal="true" aria-label={current.screen === 'PreStartForm' ? 'Pre-Start form' : current.screen === 'DayLabourVariationForm' ? 'Day Labour form' : current.screen === 'ScaffTagForm' ? 'Scaff-Tag form' : 'Handover Certificate form'}>
        {stack.map((entry, index) => {
            const EntryScreen = entry.screen === 'PreStartForm' ? PreStartFormScreen : entry.screen === 'DayLabourVariationForm' ? DayLabourVariationFormScreen : entry.screen === 'HandoverCertificateForm' ? HandoverCertificateFormScreen : ScaffTagFormScreen;
            return <div className="scaffold-form-editor-screen" key={index} style={{display: index === stack.length - 1 ? 'flex' : 'none'}}>
                <EntryScreen navigation={navigation} route={{params: entry.params}} />
            </div>;
        })}
    </div>;
}
