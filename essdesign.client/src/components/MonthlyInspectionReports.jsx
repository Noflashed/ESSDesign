import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ClipboardList, FileText, ExternalLink, RefreshCw, Search} from 'lucide-react';
import {listHandoverCertificateForms, getHandoverCertificateForm, buildHandoverCertificatePdfBody} from '../scaffoldForms/services/supabaseHandoverCertificates';
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
    const [openingPdf, setOpeningPdf] = useState(null);
    const [pdfError, setPdfError] = useState('');
    const pdfUrls = useRef([]);
    useEffect(() => () => pdfUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
    const openPdf = async report => {
        const tab = window.open('about:blank', '_blank');
        if (!tab) { setPdfError('Allow pop-ups to open the report PDF.'); return; }
        tab.opener = null;
        setOpeningPdf(report.id);
        setPdfError('');
        try {
            const form = await getHandoverCertificateForm(item.builderId, item.projectId, report.id, true);
            if (!form) throw new Error('This inspection report is no longer available.');
            const body = await buildHandoverCertificatePdfBody(form);
            const url = URL.createObjectURL(new Blob([Uint8Array.from(body, character => character.charCodeAt(0))], {type:'application/pdf'}));
            pdfUrls.current.push(url);
            tab.location.replace(url);
        } catch (failure) {
            tab.close();
            setPdfError(failure.message || 'Unable to open the report PDF.');
        } finally { setOpeningPdf(null); }
    };
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
        <div className="monthly-reports-toolbar">
            <label className="monthly-reports-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search inspection reports" placeholder="Search reports…" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="monthly-reports-tools">
                <select aria-label="Sort inspection reports" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
                <button type="button" className="scaffold-register-refresh" aria-label="Refresh inspection reports" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} className={loading ? 'is-spinning' : ''} /></button>
            </div>
        </div>
        {pdfError && <p className="monthly-reports-pdf-error" role="alert">{pdfError}</p>}
        <div className="monthly-reports-panel" aria-busy={loading}>
            {loading ? <div className="monthly-reports-empty" role="status">Loading inspection reports…</div> : error ? <div className="monthly-reports-empty" role="alert">{error}<button type="button" onClick={() => setReload(value => value + 1)}>Try again</button></div> : visibleReports.length ? <>
                <ul className="monthly-reports-list">{visibleReports.map(report => {
                    const [date, ...time] = report.inspectionDateTime.split(' ');
                    return <li key={report.id} className="monthly-report-row">
                        <span className="monthly-report-identity"><span className="monthly-report-icon"><ClipboardList size={20} strokeWidth={1.6} /></span><span><strong>{inspectionReportTitle(report.inspectionDateTime, false)}</strong><small>Report {report.inspectionNumber ? `#${report.inspectionNumber}` : '—'}</small></span></span>
                        <span className="monthly-report-date"><small>Inspection date</small><span>{date || '—'}</span></span>
                        <span className="monthly-report-time"><small>Inspection time</small><span>{time.join(' ') || '—'}</span></span>
                        <span className="monthly-report-actions">
                            <button type="button" onClick={() => onOpen(report)} aria-label={`View form for ${inspectionReportTitle(report.inspectionDateTime, false)}`}><FileText size={15} />View form</button>
                            <button type="button" disabled={openingPdf !== null} onClick={() => openPdf(report)} aria-label={`Open PDF for ${inspectionReportTitle(report.inspectionDateTime, false)}`}><ExternalLink size={15} />{openingPdf === report.id ? 'Opening…' : 'Open PDF'}</button>
                        </span>
                    </li>;
                })}</ul>
                <div className="monthly-reports-footer">{query.trim() ? `${visibleReports.length} of ${reports.length} reports` : `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`}</div>
            </> : <div className="monthly-reports-empty"><ClipboardList size={28} strokeWidth={1.5} /><strong>{query.trim() ? 'No matching reports' : 'No inspection reports yet'}</strong><p>{query.trim() ? 'Try a different month, date or report number.' : 'Reports appear here when a completed Scaff-Tag inspection is saved with a linked handover.'}</p>{query.trim() && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div>}
        </div>
    </section>;
}
