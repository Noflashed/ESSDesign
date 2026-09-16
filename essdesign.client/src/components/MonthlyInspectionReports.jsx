import React, {useEffect, useState} from 'react';
import {ArrowLeft, ClipboardList, ChevronRight, RefreshCw} from 'lucide-react';
import {listHandoverCertificateForms} from '../scaffoldForms/services/supabaseHandoverCertificates';
import {inspectionReportTitle} from '../scaffoldForms/utils/inspectionReportTitle';

export default function MonthlyInspectionReports({item, onBack, onOpen, revision}) {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        listHandoverCertificateForms(item.builderId, item.projectId, true).then(forms => {
            if (active) setReports(forms.filter(form =>
                (item.registerRecord?.id && form.scaffoldRegisterId === item.registerRecord.id) ||
                (item.tag?.id && form.sourceScaffTagId === item.tag.id)));
        }).catch(failure => { if (active) setError(failure.message || 'Unable to load inspection reports.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [item, revision, reload]);
    return <section className="monthly-inspection-reports" aria-label="Monthly Inspection Reports">
        <div className="monthly-reports-heading">
            <button type="button" onClick={onBack} className="monthly-reports-back"><ArrowLeft size={17} />Back to scaffolds</button>
            <button type="button" className="scaffold-register-refresh" aria-label="Refresh inspection reports" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} /></button>
        </div>
        <h2>Monthly Inspection Reports</h2><p>{item.scaffoldName} · {item.projectName}</p>
        {loading ? <p role="status">Loading inspection reports…</p> : error ? <p role="alert">{error}</p> : reports.length ?
            <div className="monthly-reports-grid">{reports.map(report => <button key={report.id} type="button" className="monthly-report-card" onClick={() => onOpen(report)}>
                <ClipboardList size={28} /><span><strong>{inspectionReportTitle(report.inspectionDateTime, false)}</strong>
                <small>{report.companyEntityId === 'maloo' ? 'Maloo' : 'ESS'} Inspection Report</small>
                <small>{report.inspectionDateTime}</small></span><ChevronRight size={18} />
            </button>)}</div> : <p>No inspection reports yet. Save a completed Scaff-Tag inspection row with a linked handover to create one.</p>}
    </section>;
}
