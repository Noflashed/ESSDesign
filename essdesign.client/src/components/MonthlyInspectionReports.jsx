import React, {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, ClipboardList, ChevronRight, RefreshCw, Search} from 'lucide-react';
import {listHandoverCertificateForms} from '../scaffoldForms/services/supabaseHandoverCertificates';
import {inspectionReportTitle} from '../scaffoldForms/utils/inspectionReportTitle';

function inspectionTimestamp(value = '') {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
    if (!match) return 0;
    let hour = Number(match[4] || 0);
    if (match[6]) hour = hour % 12 + (match[6].toLowerCase() === 'pm' ? 12 : 0);
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), hour, Number(match[5] || 0)).getTime();
}

export default function MonthlyInspectionReports({item, onBack, onOpen, revision}) {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('newest');
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
    const visibleReports = useMemo(() => reports.filter(report =>
        [inspectionReportTitle(report.inspectionDateTime, false), `#${report.inspectionNumber}`, report.inspectionDateTime, report.companyEntityId]
            .join(' ').toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => (inspectionTimestamp(b.inspectionDateTime) - inspectionTimestamp(a.inspectionDateTime)) * (sort === 'newest' ? 1 : -1)), [reports, query, sort]);
    return <section className="monthly-inspection-reports" aria-label="Monthly Inspection Reports">
        <button type="button" onClick={onBack} className="monthly-reports-back"><ArrowLeft size={16} />Scaffold register</button>
        <header className="monthly-reports-heading">
            <div><p className="monthly-reports-context">{item.scaffoldName} <span> / </span> {item.projectName}</p>
                <h2>Monthly inspection reports</h2>
                <p className="monthly-reports-description">Inspection history and reports for this scaffold.</p></div>
            {!loading && !error && <span className="monthly-reports-count">{reports.length} {reports.length === 1 ? 'report' : 'reports'}</span>}
        </header>
        <div className="monthly-reports-toolbar">
            <label className="monthly-reports-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search inspection reports" placeholder="Search reports…" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="monthly-reports-tools">
                <select aria-label="Sort inspection reports" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
                <button type="button" className="scaffold-register-refresh" aria-label="Refresh inspection reports" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} className={loading ? 'is-spinning' : ''} /></button>
            </div>
        </div>
        <div className="monthly-reports-panel" aria-busy={loading}>
            {loading ? <div className="monthly-reports-empty" role="status">Loading inspection reports…</div> : error ? <div className="monthly-reports-empty" role="alert">{error}<button type="button" onClick={() => setReload(value => value + 1)}>Try again</button></div> : visibleReports.length ? <>
                <div className="monthly-reports-columns" aria-hidden="true"><span>Report</span><span>Company</span><span>Inspection date</span><span /></div>
                <ul className="monthly-reports-list">{visibleReports.map(report => {
                    const [date, ...time] = report.inspectionDateTime.split(' ');
                    return <li key={report.id}><button type="button" className="monthly-report-row" onClick={() => onOpen(report)}>
                        <span className="monthly-report-identity"><span className="monthly-report-icon"><ClipboardList size={20} strokeWidth={1.6} /></span><span><strong>{inspectionReportTitle(report.inspectionDateTime, false)}</strong><small>Report {report.inspectionNumber ? `#${report.inspectionNumber}` : '—'}</small></span></span>
                        <span className="monthly-report-company">{report.companyEntityId === 'maloo' ? 'Maloo' : 'ESS'}</span>
                        <span className="monthly-report-date"><span>{date || '—'}</span><small>{time.join(' ')}</small></span>
                        <span className="monthly-report-open">Open<ChevronRight size={16} /></span>
                    </button></li>;
                })}</ul>
                <div className="monthly-reports-footer">{query.trim() ? `${visibleReports.length} of ${reports.length} reports` : `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`}<span>Select a report to view or edit</span></div>
            </> : <div className="monthly-reports-empty"><ClipboardList size={28} strokeWidth={1.5} /><strong>{query.trim() ? 'No matching reports' : 'No inspection reports yet'}</strong><p>{query.trim() ? 'Try a different month, date or report number.' : 'Reports appear here when a completed Scaff-Tag inspection is saved with a linked handover.'}</p>{query.trim() && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div>}
        </div>
    </section>;
}
