import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpRight, Building2, ChevronDown, Clock3, FileText, HardHat, RefreshCw, Search, X } from 'lucide-react';
import { dayLabourVariationsAPI, handoverCertificatesAPI, scaffTagsAPI, safetyProjectsAPI, SAFETY_PROJECTS_CHANGED_EVENT } from '../services/api';
import { loadScaffoldDashboard } from '../services/scaffoldDashboard';
import { AGE_BUCKETS, STATUS_LABELS, ageBucket, elapsedDays, filterDashboardRows, filterSiteForms } from '../utils/scaffoldDashboard';
import { formatElapsedTime } from '../utils/scaffoldRegister';
import './ScaffoldDashboardPage.css';

const DEFAULT_FILTERS = { builder: '', site: '', query: '', status: 'current', age: '' };
const STATUS_COLORS = { active: '#0d9488', 'awaiting-qr': '#e6a23c', dismantled: '#94a3b8' };
const dateLabel = value => {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`).toLocaleDateString('en-AU', { dateStyle: 'medium' });
    return new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
};
const formLabel = form => form.variationNumber || form.inspectionNumber || form.tagNumber || form.scaffoldNo || form.formReferenceName || 'Open document';
const timeLabel = (row, now) => !row.lifecycle.startedAt ? 'Start not recorded'
    : row.lifecycle.status === 'dismantled' && !row.lifecycle.stoppedAt ? 'End not recorded'
        : formatElapsedTime(row.lifecycle.startedAt, row.lifecycle.stoppedAt, now);

function ClientLogo({ src, name }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    return <span className="sd-client-logo" aria-hidden="true">
        {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} />
            : name ? <span>{name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>
                : <Building2 size={17} />}
    </span>;
}

function LogoSelect({ label, value, options, onChange }) {
    const id = useId();
    const root = useRef(null);
    const menu = useRef(null);
    const typed = useRef({ text: '', time: 0 });
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const selected = options.find(option => option.value === value) || options[0];
    const openMenu = () => { setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true); };
    const choose = option => { onChange(option.value); setOpen(false); };
    useEffect(() => {
        if (!open) return undefined;
        const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    useEffect(() => { if (open) menu.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
    const onKeyDown = event => {
        if (event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            if (!open) { openMenu(); return; }
            if (event.key === 'Enter' || event.key === ' ') { choose(options[Math.min(active, options.length - 1)]); return; }
            setActive(current => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
                : Math.max(0, Math.min(options.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const time = Date.now();
            typed.current = { text: (time - typed.current.time < 700 ? typed.current.text : '') + event.key.toLowerCase(), time };
            const index = options.findIndex(option => option.label.toLowerCase().startsWith(typed.current.text));
            if (index >= 0) { setOpen(true); setActive(index); }
        }
    };
    return <div className="sd-filter-field sd-logo-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <label id={`${id}-label`} htmlFor={id}>{label}</label>
        <button id={id} type="button" role="combobox" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-haspopup="listbox"
            aria-controls={`${id}-options`} aria-activedescendant={open ? `${id}-option-${Math.min(active, options.length - 1)}` : undefined}
            className="sd-select-trigger" onClick={() => open ? setOpen(false) : openMenu()} onKeyDown={onKeyDown}>
            <ClientLogo src={selected.logoUrl} name={selected.logoName} />
            <span id={`${id}-value`} className="sd-select-text">{selected.label}{selected.description && <small>{selected.description}</small>}</span><ChevronDown size={15} aria-hidden="true" />
        </button>
        {open && <div id={`${id}-options`} className="sd-select-menu" role="listbox" aria-labelledby={`${id}-label`} ref={menu}>
            {options.map((option, index) => <div id={`${id}-option-${index}`} key={option.value} role="option" aria-selected={option.value === value}
                className={index === active ? 'is-active' : ''} onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
                <ClientLogo src={option.logoUrl} name={option.logoName} /><span className="sd-select-text">{option.label}{option.description && <small>{option.description}</small>}</span>
            </div>)}
        </div>}
    </div>;
}

function StatusChart({ rows, selected, onSelect }) {
    const entries = Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label, count: rows.filter(row => row.lifecycle.status === id).length }));
    const total = rows.length;
    let offset = 0;
    return <div className="sd-status-chart">
        <svg viewBox="0 0 160 160" role="group" aria-label="Scaffold status chart">
            <circle cx="80" cy="80" r="60" fill="none" stroke="var(--border-color)" strokeWidth="19" />
            {entries.filter(entry => entry.count).map(entry => {
                const length = entry.count / total * 100;
                const start = offset;
                offset += length;
                return <circle key={entry.id} cx="80" cy="80" r="60" pathLength="100" fill="none"
                    stroke={STATUS_COLORS[entry.id]} strokeWidth={selected === entry.id ? 24 : 19}
                    strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} transform="rotate(-90 80 80)"
                    role="button" tabIndex="0" aria-label={`${entry.label}: ${entry.count} scaffolds. Filter list.`}
                    aria-pressed={selected === entry.id} onClick={() => onSelect(entry.id)}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(entry.id); } }}>
                    <title>{entry.label}: {entry.count}</title>
                </circle>;
            })}
            <text x="80" y="79" textAnchor="middle" className="sd-donut-number">{total}</text>
            <text x="80" y="98" textAnchor="middle" className="sd-donut-label">scaffolds</text>
        </svg>
        <div className="sd-legend">{entries.map(entry => <button key={entry.id} aria-pressed={selected === entry.id} onClick={() => onSelect(entry.id)}>
            <i style={{ background: STATUS_COLORS[entry.id] }} /><span>{entry.label}</span><strong>{entry.count}</strong>
        </button>)}</div>
    </div>;
}

function DocumentButton({ form, kind, onOpen, pending }) {
    return <button className="sd-document" disabled={!form.pdfPath || pending} onClick={() => onOpen(kind, form)}>
        <FileText size={17} /><span><strong>{formLabel(form)}</strong><small>{form.formReferenceName || form.jobLocation || kind}{!form.pdfPath ? ' · PDF unavailable' : ''}</small></span><ArrowUpRight size={15} />
    </button>;
}

export default function ScaffoldDashboardPage({ onOpenDrawing, loadData = loadScaffoldDashboard }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showInsights, setShowInsights] = useState(() => {
        try { return localStorage.getItem('ess-scaffold-dashboard-insights') !== 'hidden'; }
        catch { return true; }
    });
    const [logoUrls, setLogoUrls] = useState({});
    const [now, setNow] = useState(Date.now());
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [sort, setSort] = useState('oldest');
    const [page, setPage] = useState(0);
    const [selectedId, setSelectedId] = useState('');
    const [formSort, setFormSort] = useState('newest');
    const [formPage, setFormPage] = useState(0);
    const [formError, setFormError] = useState('');
    const [formQuery, setFormQuery] = useState('');
    const [pending, setPending] = useState(false);
    const [documentError, setDocumentError] = useState('');
    const request = useRef(0);
    const inFlight = useRef(false);
    const detailsRef = useRef(null);
    const selectedTrigger = useRef(null);
    const refresh = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        const id = ++request.current;
        setLoading(true);
        try {
            const next = await loadData();
            if (id !== request.current) return;
            setData(next); setError('');
        } catch (failure) {
            if (id === request.current) setError(failure.message || 'Could not load the dashboard. Please retry.');
        } finally {
            if (id === request.current) { setLoading(false); inFlight.current = false; }
        }
    }, [loadData]);
    useEffect(() => {
        refresh();
        const timer = window.setInterval(() => { setNow(Date.now()); if (document.visibilityState === 'visible') refresh(); }, 60000);
        const onFocus = () => { setNow(Date.now()); refresh(); };
        window.addEventListener('focus', onFocus);
        window.addEventListener(SAFETY_PROJECTS_CHANGED_EVENT, refresh);
        return () => { request.current += 1; inFlight.current = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener(SAFETY_PROJECTS_CHANGED_EVENT, refresh); };
    }, [refresh]);
    useEffect(() => {
        try { localStorage.setItem('ess-scaffold-dashboard-insights', showInsights ? 'visible' : 'hidden'); }
        catch { /* Display preferences are optional. */ }
    }, [showInsights]);
    useEffect(() => {
        let cancelled = false;
        (data?.builders || []).forEach(builder => {
            safetyProjectsAPI.resolveBuilderLogoUrl(builder).then(url => {
                if (!cancelled) setLogoUrls(current => current[builder.id] === url ? current : { ...current, [builder.id]: url });
            }).catch(() => {
                if (!cancelled) setLogoUrls(current => ({ ...current, [builder.id]: builder.logoUrl || '' }));
            });
        });
        return () => { cancelled = true; };
    }, [data?.builders]);
    const updateFilters = patch => { setFilters(current => ({ ...current, ...patch })); setSelectedId(''); setPage(0); if ('builder' in patch || 'site' in patch) setFormPage(0); };
    const sites = data?.sites || [];
    const builderOptions = [...new Map(sites.map(site => [site.builderId, { value: site.builderId, label: site.builderName, logoName: site.builderName, logoUrl: logoUrls[site.builderId] || '' }])).values()].sort((a, b) => a.label.localeCompare(b.label));
    const siteOptions = sites.filter(site => !filters.builder || site.builderId === filters.builder).sort((a, b) => a.projectName.localeCompare(b.projectName));
    const scope = useMemo(() => filterDashboardRows(data?.rows || [], { ...filters, status: 'all', age: '' }, now), [data, filters, now]);
    const filtered = useMemo(() => {
        const result = filterDashboardRows(data?.rows || [], filters, now);
        return result.sort((left, right) => {
            if (sort === 'name') return left.scaffoldName.localeCompare(right.scaffoldName);
            if (sort === 'site') return left.projectName.localeCompare(right.projectName) || left.scaffoldName.localeCompare(right.scaffoldName);
            const a = elapsedDays(left, now), b = elapsedDays(right, now);
            if (a === null) return b === null ? 0 : 1;
            if (b === null) return -1;
            return sort === 'newest' ? a - b : b - a;
        });
    }, [data, filters, now, sort]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
    const visiblePage = Math.min(page, pageCount - 1);
    const active = scope.filter(row => row.lifecycle.status === 'active');
    const ageEntries = [...AGE_BUCKETS, { id: 'unknown', label: 'Start not recorded' }].map(bucket => ({ ...bucket, count: active.filter(row => ageBucket(row, now) === bucket.id).length }));
    const maxAge = Math.max(1, ...ageEntries.map(entry => entry.count));
    const siteEntries = sites.map(site => ({ ...site, count: active.filter(row => row.siteKey === site.key).length })).filter(site => site.count).sort((a, b) => b.count - a.count).slice(0, 6);
    const maxSite = Math.max(1, ...siteEntries.map(site => site.count));
    const selected = filtered.find(row => row.id === selectedId);
    const forms = useMemo(() => filterSiteForms(data?.sites || [], { builder: filters.builder, site: filters.site, query: formQuery, sort: formSort }), [data, filters.builder, filters.site, formQuery, formSort]);
    const formPageCount = Math.max(1, Math.ceil(forms.length / 25));
    const visibleFormPage = Math.min(formPage, formPageCount - 1);
    const chooseRow = (row, trigger) => { selectedTrigger.current = trigger; setSelectedId(row.id); setDocumentError(''); };
    const closeDetails = () => {
        const trigger = selectedTrigger.current;
        setSelectedId('');
        requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
    };
    useEffect(() => {
        if (selectedId) {
            detailsRef.current?.focus({ preventScroll: true });
            if (detailsRef.current) detailsRef.current.scrollTop = 0;
        }
    }, [selectedId]);
    const openPdf = async (kind, form) => {
        if (pending) return;
        const setOpenError = kind === 'Day labour / variation' ? setFormError : setDocumentError;
        setPending(true); setOpenError('');
        // Open during the click so browsers do not block the signed PDF after the request.
        const popup = window.open('about:blank', '_blank');
        if (popup) popup.opener = null;
        try {
            if (!popup) throw new Error('Your browser blocked the document tab. Allow pop-ups for this site and try again.');
            const api = kind === 'Handover' ? handoverCertificatesAPI : kind === 'Scaff-Tag' ? scaffTagsAPI : dayLabourVariationsAPI;
            popup.location.href = await api.getPdfUrl(form);
        } catch (failure) { popup?.close(); setOpenError(failure.message || 'Could not open the document.'); }
        finally { setPending(false); }
    };
    const selectStatus = status => updateFilters({ status: filters.status === status ? 'all' : status, age: '' });
    const reset = () => { setFilters(DEFAULT_FILTERS); setSelectedId(''); setPage(0); setFormQuery(''); setFormPage(0); };

    return <main className={`scaffold-dashboard${selected ? ' has-selection' : ''}`} >
        <div className="sd-main">
        {error && <div className="sd-error" role="alert">{error} {data ? 'Showing the last complete snapshot.' : 'Scaffolds are unavailable until all sources load.'} <button onClick={refresh} disabled={loading}>Retry</button></div>}
        <section className="sd-filters" aria-label="Dashboard filters">
            <LogoSelect label="Builder" value={filters.builder} options={[{ value: '', label: 'All builders' }, ...builderOptions]} onChange={value => updateFilters({ builder: value, site: '' })} />
            <LogoSelect label="Site / project" value={filters.site} options={[{ value: '', label: 'All sites', logoName: builderOptions.find(option => option.value === filters.builder)?.label, logoUrl: logoUrls[filters.builder] || '' }, ...siteOptions.map(site => ({ value: site.key, label: site.projectName, description: filters.builder ? '' : site.builderName, logoName: site.builderName, logoUrl: logoUrls[site.builderId] || '' }))]} onChange={value => updateFilters({ site: value })} />
            <label className="sd-search">Search scaffolds<div><Search size={16} /><input type="search" placeholder="Scaffold, location or document…" value={filters.query} onChange={event => updateFilters({ query: event.target.value })} /></div></label>
            <button className="sd-reset" onClick={reset}>Reset filters</button>
            <button className="sd-icon" onClick={refresh} disabled={loading} aria-label="Refresh dashboard" title="Refresh dashboard"><RefreshCw size={17} className={loading ? 'sd-spin' : ''} /></button>
        </section>
        {!data ? <div className="sd-empty" role="status">{loading ? 'Loading scaffolds and site documents…' : 'The dashboard could not be loaded.'}</div> : <>
            <div className="sd-chart-caption"><h2>Portfolio insights</h2><button className="sd-insights-toggle" aria-expanded={showInsights} aria-controls="scaffold-portfolio-insights" onClick={() => setShowInsights(current => !current)}>{showInsights ? 'Hide' : 'Show'} portfolio insights<ChevronDown size={15} className={showInsights ? 'is-expanded' : ''} /></button></div>
            <section id="scaffold-portfolio-insights" className="sd-charts" aria-label="Interactive scaffold charts" hidden={!showInsights}>
                <article className="sd-card"><h2>Scaffold status</h2><StatusChart rows={scope} selected={filters.status} onSelect={selectStatus} /></article>
                <article className="sd-card"><h2>How long have they been up?</h2><div className="sd-bars">{ageEntries.map(entry => <button key={entry.id} aria-label={`${entry.label}: ${entry.count} active scaffolds`} aria-pressed={filters.age === entry.id} onClick={() => updateFilters({ status: 'active', age: filters.age === entry.id ? '' : entry.id })}>
                    <span>{entry.label}</span><div className="sd-bar-track"><i style={{ width: `${entry.count / maxAge * 100}%` }} /></div><strong>{entry.count}</strong>
                </button>)}</div></article>
                <article className="sd-card"><h2>Sites with the most scaffolds</h2><div className="sd-site-bars">{siteEntries.length ? siteEntries.map(site => <button key={site.key} onClick={() => updateFilters({ builder: site.builderId, site: site.key, status: 'active', age: '' })} aria-label={`${site.projectName}, ${site.builderName}: ${site.count} active scaffolds`}><span>{site.projectName}<small>{site.builderName}</small></span><strong>{site.count}</strong><div className="sd-bar-track"><i style={{ width: `${site.count / maxSite * 100}%` }} /></div></button>) : <p className="sd-chart-empty">No active scaffolds in this selection.</p>}</div></article>
            </section>
            <section className="sd-register" aria-label="Scaffold explorer">
                <div className="sd-list-heading"><div><h2>Scaffold explorer <span>{filtered.length}</span></h2></div><label className="sd-sort"><ArrowDownWideNarrow size={16} /><select aria-label="Sort scaffolds" value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}><option value="oldest">Longest time up</option><option value="newest">Shortest time up</option><option value="name">Scaffold name</option><option value="site">Site name</option></select></label></div>
                <div className="sd-list-filters"><div className="sd-status-tabs" aria-label="Filter scaffold status">{Object.entries({ current: 'Current', all: 'All history', ...STATUS_LABELS }).map(([id, label]) => <button key={id} aria-pressed={filters.status === id} onClick={() => updateFilters({ status: id, age: '' })}>{label}</button>)}</div>{filters.age && <button className="sd-age-chip" onClick={() => updateFilters({ age: '' })}>{ageEntries.find(entry => entry.id === filters.age)?.label}<X size={13} /></button>}</div>
                <div className="sd-explorer">
                    <div className="sd-table-wrap"><table><thead><tr><th>Scaffold / site</th><th>Status</th><th>Time up</th><th>Documents</th></tr></thead><tbody>{filtered.slice(visiblePage * 50, (visiblePage + 1) * 50).map(row => <tr key={row.id} className={`sd-scaffold-row${selectedId === row.id ? ' is-selected' : ''}`} onClick={event => { if (!event.target.closest('button')) chooseRow(row, event.currentTarget.querySelector('.sd-row-name')); }}>
                        <td><button className="sd-row-name" onClick={event => chooseRow(row, event.currentTarget)} aria-expanded={selectedId === row.id} aria-controls={selectedId === row.id ? 'scaffold-detail-sidebar' : undefined}>{row.scaffoldName || 'Untitled scaffold'}<ArrowUpRight size={13} /></button><small>{row.builderName} · {row.projectName}</small>{row.location && <small>{row.location}</small>}</td>
                        <td><span className={`sd-status is-${row.lifecycle.status}`}>{STATUS_LABELS[row.lifecycle.status]}</span></td>
                        <td className="sd-time">{timeLabel(row, now)}<small>{row.lifecycle.status === 'dismantled' ? 'Timer stopped' : row.lifecycle.startedAt ? `Since ${new Date(row.lifecycle.startedAt).toLocaleDateString('en-AU')}` : 'Awaiting recorded activation'}</small></td>
                        <td><button className="sd-text-button" onClick={event => chooseRow(row, event.currentTarget)}>{row.drawings.length + row.tags.length + row.handovers.length} linked</button></td>
                    </tr>)}</tbody></table>{!filtered.length && <div className="sd-empty"><HardHat size={30} /><h3>No scaffolds match this view</h3><p>Try another builder, site or status.</p><button onClick={reset}>Reset filters</button></div>}<div className="sd-pagination"><span>{filtered.length ? `${visiblePage * 50 + 1}–${Math.min((visiblePage + 1) * 50, filtered.length)} of ${filtered.length} scaffolds` : '0 scaffolds'}</span><button disabled={visiblePage === 0} onClick={() => { setPage(visiblePage - 1); setSelectedId(''); }}>Previous</button><span>Page {visiblePage + 1} of {pageCount}</span><button disabled={visiblePage + 1 >= pageCount} onClick={() => { setPage(visiblePage + 1); setSelectedId(''); }}>Next</button></div></div>

                </div>
            </section>

            <section className="sd-register sd-site-forms" aria-label="Site forms explorer">
                <div className="sd-list-heading"><h2>Site forms explorer <span>{forms.length}</span></h2><label className="sd-sort"><ArrowDownWideNarrow size={16} /><select aria-label="Sort site forms" value={formSort} onChange={event => { setFormSort(event.target.value); setFormPage(0); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="site">Site name</option></select></label></div>
                <div className="sd-form-toolbar"><span>Day labour & variations</span><label className="sd-search"><div><Search size={16} /><input type="search" aria-label="Search site forms" placeholder="Search site forms…" value={formQuery} onChange={event => { setFormQuery(event.target.value); setFormPage(0); }} /></div></label></div>
                {formError && <p className="sd-error" role="alert">{formError}</p>}
                <div className="sd-table-wrap"><table><thead><tr><th>Form / reference</th><th>Site / builder</th><th>Date</th><th>Requested by</th><th>Document</th></tr></thead><tbody>
                    {forms.slice(visibleFormPage * 25, (visibleFormPage + 1) * 25).map(item => <tr key={item.id}>
                        <td><button className="sd-row-name" disabled={!item.form.pdfPath || pending} onClick={() => openPdf('Day labour / variation', item.form)}>{item.form.variationNumber || item.form.formReferenceName || 'Day labour / variation'}<ArrowUpRight size={13} /></button>{item.form.variationNumber && item.form.formReferenceName && <small>{item.form.formReferenceName}</small>}{item.form.descriptionOfWork && <small className="sd-work-description" title={item.form.descriptionOfWork}>{item.form.descriptionOfWork}</small>}</td>
                        <td><span>{item.projectName}</span><small>{item.builderName}</small></td>
                        <td>{dateLabel(item.form.date || item.form.updatedAt)}</td><td>{item.form.requestedBy || 'Not recorded'}</td>
                        <td><button className="sd-text-button" disabled={!item.form.pdfPath || pending} onClick={() => openPdf('Day labour / variation', item.form)}>{item.form.pdfPath ? 'View PDF' : 'PDF unavailable'}</button></td>
                    </tr>)}
                </tbody></table>{!forms.length && <div className="sd-empty"><FileText size={26} /><h3>No site forms match this view</h3></div>}
                <div className="sd-pagination"><span>{forms.length ? `${visibleFormPage * 25 + 1}–${Math.min((visibleFormPage + 1) * 25, forms.length)} of ${forms.length} forms` : '0 forms'}</span><button disabled={visibleFormPage === 0} onClick={() => setFormPage(visibleFormPage - 1)}>Previous forms</button><span>Page {visibleFormPage + 1} of {formPageCount}</span><button disabled={visibleFormPage + 1 >= formPageCount} onClick={() => setFormPage(visibleFormPage + 1)}>Next forms</button></div></div>
            </section>
        </>}
        </div>
                    {selected && <aside id="scaffold-detail-sidebar" className="sd-details" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeDetails(); } }} ref={detailsRef} tabIndex="-1" aria-label={`Details for ${selected.scaffoldName}`}>
                        <div className="sd-detail-heading"><div><span className={`sd-status is-${selected.lifecycle.status}`}>{STATUS_LABELS[selected.lifecycle.status]}</span><h2>{selected.scaffoldName}</h2><p>{selected.builderName} · {selected.projectName}</p></div><button className="sd-icon" aria-label="Close scaffold details" onClick={closeDetails}><X size={18} /></button></div>
                        <div className="sd-detail-timer"><Clock3 size={20} /><div><strong>{timeLabel(selected, now)}</strong><small>{selected.lifecycle.status === 'dismantled' ? 'Total recorded time up' : 'Current time up'}</small></div></div>
                        <dl><div><dt>Activated</dt><dd>{dateLabel(selected.lifecycle.startedAt)}</dd></div>{selected.lifecycle.status === 'dismantled' && <div><dt>Dismantled</dt><dd>{dateLabel(selected.lifecycle.stoppedAt)}</dd></div>}<div><dt>Location</dt><dd>{selected.location || 'Not recorded'}</dd></div></dl>
                        {documentError && <p role="alert" className="sd-error">{documentError}</p>}
                        {pending && <p role="status">Opening document…</p>}
                        <div className="sd-documents">
                            <h3>Design drawings</h3>{selected.drawings.length ? selected.drawings.map((form, index) => <button key={index} className="sd-document" onClick={() => onOpenDrawing?.(form)} disabled={!onOpenDrawing}><FileText size={17} /><span><strong>{form.drawingNumber || form.drawingDocumentName || 'Design drawing'}</strong><small>{form.drawingRevisionNumber ? `Revision ${form.drawingRevisionNumber}` : 'Linked drawing'}</small></span><ArrowUpRight size={15} /></button>) : <p>No design drawing linked.</p>}
                            <h3>Handover certificates</h3>{selected.handovers.length ? selected.handovers.map(form => <DocumentButton key={form.id} form={form} kind="Handover" onOpen={openPdf} pending={pending} />) : <p>No handover linked.</p>}
                            <h3>Scaff-Tags</h3>{selected.tags.length ? selected.tags.map(form => <DocumentButton key={form.id} form={form} kind="Scaff-Tag" onOpen={openPdf} pending={pending} />) : <p>No Scaff-Tag linked.</p>}
                        </div>
                    </aside>}
    </main>;
}
