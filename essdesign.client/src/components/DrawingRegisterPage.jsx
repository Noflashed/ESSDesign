import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Filter, MoreVertical, Plus, Search, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { foldersAPI, safetyProjectsAPI } from '../services/api';
import LoadingBrandmark from './LoadingBrandmark';
import './DrawingRegisterPage.css';

const SOURCE_FILE = '/data/ESS Drawing Register.xlsx';
const STORAGE_KEY = 'ess-drawing-register-v1';
const FIELDS = [
    ['client', 'CLIENT'],
    ['project', 'PROJECT'],
    ['design', 'DESIGN'],
    ['drawingNo', 'DRAWING NO.'],
    ['dateIssued', 'DATE ISSUED'],
    ['revisionNo', 'REVISION NO.'],
    ['designUse', 'DESIGN USE'],
];
const EMPTY_ROW = Object.fromEntries(FIELDS.map(([key]) => [key, '']));
const DESIGN_USE_OPTIONS = ['CONSTRUCTION', 'PRELIMINARY', 'CONCEPT', 'AS-BUILT'];
const getTodayInputValue = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const cleanStatus = value => {
    const status = String(value || '').trim().toUpperCase();
    if (['CON', 'CONSTRUCTION', 'CONSTRICTION'].includes(status)) return 'CONSTRUCTION';
    if (['PRE', 'PRELIMINARY'].includes(status)) return 'PRELIMINARY';
    if (['ASB', 'AS-BUILT', 'AS-BULT'].includes(status)) return 'AS-BUILT';
    if (['CONC', 'CONCEPT', 'CONCEPT ONLY', 'CONCEPTUAL'].includes(status)) return 'CONCEPT';
    return status;
};
const getDrawingSequence = drawingNo => {
    const match = String(drawingNo || '').trim().match(/(\d+)$/);
    return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
};

const getBaseDrawingNumber = drawingNo => String(drawingNo || '').trim().match(/^[A-Z0-9]+-[A-Z0-9]+-ESD\d+/i)?.[0]?.toUpperCase() || '';

const getDrawingUseCode = designUse => ({
    CONSTRUCTION: 'CON',
    PRELIMINARY: 'PRE',
    'AS-BUILT': 'ASB',
    CONCEPT: 'CONC',
})[cleanStatus(designUse)] || '';

const formatFullDrawingNumber = row => {
    const baseNumber = getBaseDrawingNumber(row.drawingNo);
    if (!baseNumber) return row.drawingNo;
    const useCode = getDrawingUseCode(row.designUse);
    const revisionMatch = String(row.revisionNo || '').match(/\d+/);
    const revision = revisionMatch ? revisionMatch[0].replace(/^0+(?=\d)/, '') : '';
    return `${baseNumber}${useCode ? `(${useCode})` : ''}${revision ? `(REV${revision})` : ''}`;
};

const getDateSortValue = value => {
    const text = String(value || '').trim();
    const parts = text.split(/[/-]/).map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return Number.NEGATIVE_INFINITY;
    if (parts[0] > 31) return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    const year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
    return new Date(year, parts[1] - 1, parts[0]).getTime();
};

const getRowSortValue = (row, field) => {
    if (field === 'drawingNo') return getDrawingSequence(getBaseDrawingNumber(row.drawingNo));
    if (field === 'dateIssued') return getDateSortValue(row.dateIssued);
    if (field === 'revisionNo') return Number(String(row.revisionNo || '').match(/\d+/)?.[0] || -1);
    if (field === 'designUse') return cleanStatus(row.designUse);
    return String(row[field] || '').trim().toLowerCase();
};

const parseDrawingNumber = drawingNo => {
    const match = String(drawingNo || '').trim().match(/^([A-Z0-9]+)-([A-Z0-9]+)-ESD(\d+)$/i);
    return match ? { builderCode: match[1].toUpperCase(), projectCode: match[2].toUpperCase() } : null;
};

const normalizeName = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');

const normalizeRegistryName = value => {
    const ignored = new Set(['the', 'and', 'pty', 'ltd', 'limited', 'construction', 'constructions', 'consrtuctions', 'group', 'development', 'project', 'projects']);
    return normalizeName(value).split(' ').filter(word => word && !ignored.has(word)).join(' ');
};

const editDistance = (left, right) => {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            current[rightIndex] = Math.min(
                current[rightIndex - 1] + 1,
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
            );
        }
        previous.splice(0, previous.length, ...current);
    }
    return previous[right.length];
};

const registryMatchScore = (source, candidate) => {
    const left = normalizeRegistryName(source);
    const right = normalizeRegistryName(candidate);
    if (!left || !right) return 0;
    if (left === right) return 1;
    const similarity = 1 - (editDistance(left, right) / Math.max(left.length, right.length));
    const leftTokens = new Set(left.split(' '));
    const rightTokens = new Set(right.split(' '));
    const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return Math.max(similarity, union ? intersection / union : 0);
};

const findConfidentRegistryMatch = (source, candidates, minimumScore) => {
    if (!source) return null;
    const ranked = candidates
        .map(candidate => ({ candidate, score: registryMatchScore(source, candidate.name) }))
        .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best || best.score < minimumScore) return null;
    if (runnerUp && best.score < 0.95 && best.score - runnerUp.score < 0.08) return null;
    return best.candidate;
};

const mostCommonCode = codes => {
    const counts = new Map();
    codes.filter(Boolean).forEach(code => counts.set(code, (counts.get(code) || 0) + 1));
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || '';
};

const deriveCode = name => {
    const ignoredWords = new Set(['the', 'and', 'pty', 'ltd', 'limited', 'construction', 'constructions', 'group', 'development', 'project', 'projects']);
    const words = normalizeName(name).split(' ').filter(word => word && !ignoredWords.has(word) && /[a-z]/.test(word));
    if (words.length >= 3) return words.slice(0, 3).map(word => word[0]).join('').toUpperCase();
    const source = words[0] || normalizeName(name).replace(/\s/g, '');
    return source.slice(0, 3).toUpperCase().padEnd(3, 'X');
};

const readWorkbook = async file => {
    const bytes = file instanceof File ? await file.arrayBuffer() : await (await fetch(file)).arrayBuffer();
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false });
    return rows.map((row, index) => ({
        id: `${Date.now()}-${index}`,
        client: String(row.CLIENT || '').trim(),
        project: String(row.PROJECT || '').trim(),
        design: String(row.DESIGN || '').trim(),
        drawingNo: String(row['DRAWING NO.'] || '').trim(),
        dateIssued: String(row['DATE ISSUED'] || '').trim(),
        revisionNo: String(row['REVISION NO.'] || '').trim(),
        designUse: cleanStatus(row['DESIGN USE']),
    })).filter(row => FIELDS.some(([key]) => row[key]));
};

export default function DrawingRegisterPage({ onBack, onOpenFolder }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sortField, setSortField] = useState('drawingNo');
    const [sortDirection, setSortDirection] = useState('desc');
    const [showAddRow, setShowAddRow] = useState(false);
    const [draft, setDraft] = useState(EMPTY_ROW);
    const [editingId, setEditingId] = useState(null);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [builders, setBuilders] = useState([]);
    const [buildersLoading, setBuildersLoading] = useState(true);
    const [buildersError, setBuildersError] = useState('');
    const [openingDrawingId, setOpeningDrawingId] = useState(null);
    const [folderNavigationError, setFolderNavigationError] = useState('');
    const [drawingFolders, setDrawingFolders] = useState({});
    const [drawingFoldersLoading, setDrawingFoldersLoading] = useState(true);
    const [registryReconciled, setRegistryReconciled] = useState(false);
    const registryReconciledRef = useRef(false);

    useEffect(() => {
        const load = async () => {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                setRows(saved ? JSON.parse(saved) : await readWorkbook(SOURCE_FILE));
            } catch (error) {
                console.error('Drawing register load failed', error);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (!loading) localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    }, [rows, loading]);

    useEffect(() => {
        const closeMenu = () => setOpenMenuId(null);
        document.addEventListener('click', closeMenu);
        return () => document.removeEventListener('click', closeMenu);
    }, []);

    useEffect(() => {
        safetyProjectsAPI.getBuilders()
            .then(setBuilders)
            .catch(error => {
                console.error('Builder directory load failed', error);
                setBuildersError('Builder directory could not be loaded.');
            })
            .finally(() => setBuildersLoading(false));
    }, []);

    useEffect(() => {
        if (loading || buildersLoading || registryReconciledRef.current) return;
        registryReconciledRef.current = true;
        if (buildersError || builders.length === 0) {
            setRegistryReconciled(true);
            return;
        }

        setRows(current => current.map(row => {
            const builder = findConfidentRegistryMatch(row.client, builders, 0.82);
            if (!builder) return { ...row, client: '', project: '' };
            const activeProjects = (builder.projects || []).filter(project => !project.archived);
            const project = findConfidentRegistryMatch(row.project, activeProjects, 0.78);
            return {
                ...row,
                client: builder.name,
                project: project?.name || ''
            };
        }));
        setRegistryReconciled(true);
    }, [builders, buildersError, buildersLoading, loading]);

    const statuses = useMemo(() => [...new Set(rows.map(row => cleanStatus(row.designUse)).filter(Boolean))].sort(), [rows]);
    const drawingNumberKey = useMemo(() => [...new Set(rows.map(row => getBaseDrawingNumber(row.drawingNo)).filter(Boolean))].sort().join('|'), [rows]);
    const selectedBuilder = useMemo(() => builders.find(builder => builder.name === draft.client) || null, [builders, draft.client]);
    const availableProjects = useMemo(() => (selectedBuilder?.projects || []).filter(project => !project.archived), [selectedBuilder]);
    const generatedDrawingNo = useMemo(() => {
        if (!draft.client || !draft.project) return '';
        const clientKey = normalizeName(draft.client);
        const projectKey = normalizeName(draft.project);
        const matchingClientRows = rows.filter(row => normalizeName(row.client) === clientKey);
        const builderCode = mostCommonCode(matchingClientRows.map(row => parseDrawingNumber(row.drawingNo)?.builderCode)) || deriveCode(draft.client);
        const projectCode = mostCommonCode(matchingClientRows
            .filter(row => normalizeName(row.project) === projectKey)
            .map(row => parseDrawingNumber(row.drawingNo)?.projectCode)) || deriveCode(draft.project);
        const highestSequence = rows.reduce((highest, row) => Math.max(highest, getDrawingSequence(row.drawingNo)), 0);
        return `${builderCode}-${projectCode}-ESD${String(highestSequence + 1).padStart(4, '0')}`;
    }, [draft.client, draft.project, rows]);
    const filteredRows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return rows
            .map((row, sourceIndex) => ({ row, sourceIndex }))
            .filter(({ row }) => (!statusFilter || cleanStatus(row.designUse) === statusFilter)
                && (!needle || FIELDS.some(([key]) => String(row[key]).toLowerCase().includes(needle))))
            .sort((left, right) => {
                const leftValue = getRowSortValue(left.row, sortField);
                const rightValue = getRowSortValue(right.row, sortField);
                const comparison = typeof leftValue === 'number'
                    ? leftValue - rightValue
                    : leftValue.localeCompare(rightValue);
                return (sortDirection === 'asc' ? comparison : -comparison) || left.sourceIndex - right.sourceIndex;
            })
            .map(({ row }) => row);
    }, [rows, query, sortDirection, sortField, statusFilter]);

    useEffect(() => {
        if (loading) return;
        if (!drawingNumberKey) {
            setDrawingFoldersLoading(false);
            return;
        }
        let cancelled = false;
        setDrawingFoldersLoading(true);
        foldersAPI.resolveDrawingFolders(drawingNumberKey.split('|'))
            .then(resolutions => {
                if (cancelled) return;
                setDrawingFolders(Object.fromEntries(Object.entries(resolutions).map(([drawingNumber, resolution]) => [drawingNumber, resolution.folderId])));
                setRows(current => current.map(row => {
                    const resolution = resolutions[getBaseDrawingNumber(row.drawingNo)];
                    if (!resolution) return { ...row, designUse: cleanStatus(row.designUse) };
                    return {
                        ...row,
                        revisionNo: resolution.revisionNo || row.revisionNo,
                        designUse: cleanStatus(resolution.designUse || row.designUse)
                    };
                }));
            })
            .catch(error => {
                console.error('Drawing folder availability lookup failed', error);
                if (!cancelled) setDrawingFolders({});
            })
            .finally(() => {
                if (!cancelled) setDrawingFoldersLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [drawingNumberKey, loading]);

    const updateDraft = (key, value) => setDraft(current => ({ ...current, [key]: value }));
    const addRow = event => {
        event.preventDefault();
        if (!draft.client || !draft.project || !draft.design || !generatedDrawingNo) return;
        setRows(current => [{ ...draft, drawingNo: generatedDrawingNo, id: `manual-${Date.now()}`, designUse: cleanStatus(draft.designUse) }, ...current]);
        setDraft(EMPTY_ROW);
        setShowAddRow(false);
    };
    const updateRow = (id, key, value) => setRows(current => current.map(row => row.id === id ? { ...row, [key]: value } : row));
    const updateRowClient = (id, client) => setRows(current => current.map(row => row.id === id ? { ...row, client, project: '' } : row));
    const deleteRow = id => setRows(current => current.filter(row => row.id !== id));
    const openAddRow = () => {
        setDraft({ ...EMPTY_ROW, dateIssued: getTodayInputValue() });
        setShowAddRow(true);
        setOpenMenuId(null);
    };
    const openDrawingFolder = async row => {
        const drawingNumber = getBaseDrawingNumber(row.drawingNo);
        if (!drawingNumber || openingDrawingId) return;
        setOpeningDrawingId(row.id);
        setFolderNavigationError('');
        try {
            const folderId = drawingFolders[drawingNumber];
            if (!folderId) throw new Error(`No ESS Design folder was found for ${drawingNumber}.`);
            onOpenFolder(folderId);
        } catch (error) {
            setFolderNavigationError(error?.response?.data?.error || error.message || `No ESS Design folder was found for ${drawingNumber}.`);
        } finally {
            setOpeningDrawingId(null);
        }
    };
    const getBuilderProjects = client => (builders.find(builder => builder.name === client)?.projects || []).filter(project => !project.archived);
    const handleColumnSort = field => {
        if (sortField === field) {
            setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
            return;
        }
        setSortField(field);
        setSortDirection(field === 'drawingNo' || field === 'dateIssued' || field === 'revisionNo' ? 'desc' : 'asc');
    };

    const renderCell = (row, key) => {
        if (key === 'client') {
            return <select className="register-table-select" value={row.client} title={row.client || 'Select client'} onChange={event => updateRowClient(row.id, event.target.value)}><option value="">Select client</option>{builders.map(builder => <option key={builder.id} value={builder.name}>{builder.name}</option>)}</select>;
        }
        if (key === 'project') {
            const projects = getBuilderProjects(row.client);
            return <select className="register-table-select" value={row.project} title={row.project || (row.client ? 'Select project' : 'Select client first')} onChange={event => updateRow(row.id, 'project', event.target.value)} disabled={!row.client}><option value="">{row.client ? 'Select project' : 'Select client first'}</option>{projects.map(project => <option key={project.id} value={project.name}>{project.name}</option>)}</select>;
        }
        if (key === 'drawingNo') {
            return drawingFolders[getBaseDrawingNumber(row[key])]
                ? <button type="button" className="register-drawing-link" onClick={() => openDrawingFolder(row)} disabled={openingDrawingId === row.id} title={`Open all revisions for ${getBaseDrawingNumber(row[key])}`}>{openingDrawingId === row.id ? 'Opening...' : formatFullDrawingNumber(row)}</button>
                : <span className="register-drawing-unavailable">{formatFullDrawingNumber(row)}</span>;
        }
        if (key === 'designUse') {
            return <select className="register-status-select" value={cleanStatus(row[key]) || 'CONSTRUCTION'} onChange={event => updateRow(row.id, key, event.target.value)}>{[...new Set([...DESIGN_USE_OPTIONS, cleanStatus(row[key])].filter(Boolean))].map(option => <option key={option}>{option}</option>)}</select>;
        }
        return editingId === row.id
            ? <input value={row[key]} onChange={event => updateRow(row.id, key, event.target.value)} onBlur={() => setEditingId(null)} />
            : row[key];
    };

    return (
        <main className="drawing-register-page">
            <header className="drawing-register-heading">
                <button type="button" className="register-icon-button register-back-button" onClick={onBack} title="Back to ESS Design" aria-label="Back to ESS Design"><ArrowLeft size={20} aria-hidden="true" /></button>
                <h1>Drawing Register</h1>
            </header>

            <div className="drawing-register-toolbar">
                <label className="register-search"><Search size={18} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search drawings..." /></label>
                <label className="register-filter"><Filter size={17} /><span>Filter</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All uses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
                <span className="register-toolbar-spacer" />
                <button type="button" className="register-primary-button" onClick={openAddRow}><Plus size={18} /> Add Row</button>
            </div>
            {folderNavigationError && <div className="register-navigation-error" role="alert">{folderNavigationError}</div>}

            {showAddRow && (
                <div className="register-modal-backdrop" role="presentation" onMouseDown={() => setShowAddRow(false)}>
                    <form className="drawing-register-modal" onSubmit={addRow} onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-drawing-title">
                        <div className="register-modal-header"><div><h2 id="add-drawing-title">Add new drawing</h2><p>Enter the drawing register details below.</p></div><button type="button" className="register-icon-button" onClick={() => setShowAddRow(false)} title="Close"><X size={18} /></button></div>
                        <div className="register-modal-grid">
                            <label><span>CLIENT</span><select value={draft.client} onChange={event => setDraft(current => ({ ...current, client: event.target.value, project: '' }))} autoFocus disabled={buildersLoading}><option value="">{buildersLoading ? 'Loading builders...' : 'Select client'}</option>{builders.map(builder => <option key={builder.id} value={builder.name}>{builder.name}</option>)}</select>{buildersError && <small className="register-field-error">{buildersError}</small>}</label>
                            <label><span>PROJECT</span><select value={draft.project} onChange={event => updateDraft('project', event.target.value)} disabled={!selectedBuilder}><option value="">{selectedBuilder ? 'Select project' : 'Select a client first'}</option>{availableProjects.map(project => <option key={project.id} value={project.name}>{project.name}</option>)}</select></label>
                            <label><span>DESIGN</span><input value={draft.design} onChange={event => updateDraft('design', event.target.value)} placeholder="Enter design description" /></label>
                            <label><span>DRAWING NO.</span><input className="register-generated-number" value={generatedDrawingNo} readOnly placeholder="Generated after client and project selection" /><small className="register-field-hint">Automatically uses the next available ESD number.</small></label>
                            <label><span>DATE ISSUED</span><input type="date" value={draft.dateIssued} onChange={event => updateDraft('dateIssued', event.target.value)} /></label>
                            <label><span>REVISION NO.</span><input value={draft.revisionNo} onChange={event => updateDraft('revisionNo', event.target.value)} placeholder="Enter revision" /></label>
                            <label><span>DESIGN USE</span><select value={draft.designUse} onChange={event => updateDraft('designUse', event.target.value)}><option value="">Select design use</option>{DESIGN_USE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></label>
                        </div>
                        <div className="register-modal-actions"><button type="button" className="register-secondary-button" onClick={() => setShowAddRow(false)}>Cancel</button><button type="submit" className="register-primary-button" disabled={!draft.client || !draft.project || !draft.design || !generatedDrawingNo}>Add drawing</button></div>
                    </form>
                </div>
            )}

            <section className="drawing-register-table-wrap">
                {loading || buildersLoading || !registryReconciled || drawingFoldersLoading ? <div className="register-loading page-loading-brandmark"><LoadingBrandmark label="Loading drawing register" /></div> : (
                    <table className="drawing-register-table">
                        <thead><tr>{FIELDS.map(([key, label]) => <th key={label}><button type="button" className={`register-column-sort${sortField === key ? ' active' : ''}`} onClick={() => handleColumnSort(key)} title={`Sort by ${label.toLowerCase()}`}><span>{label}</span><ChevronDown aria-hidden="true" /></button></th>)}<th className="row-actions" /></tr></thead>
                        <tbody>
                            {filteredRows.map(row => (
                                <tr key={row.id}>
                                    {FIELDS.map(([key]) => <td key={key} onDoubleClick={['client', 'project', 'designUse', 'drawingNo'].includes(key) ? undefined : () => setEditingId(row.id)}>{renderCell(row, key)}</td>)}
                                    <td className="row-actions">
                                        <div className="register-row-actions-wrap">
                                            <button type="button" className="register-row-menu" title="Drawing actions" aria-label={`Actions for ${row.drawingNo || 'drawing'}`} aria-expanded={openMenuId === row.id} onClick={event => { event.stopPropagation(); setOpenMenuId(current => current === row.id ? null : row.id); }}><MoreVertical size={20} aria-hidden="true" /></button>
                                            {openMenuId === row.id && <div className="register-context-menu" onClick={event => event.stopPropagation()}>
                                                <button type="button" onClick={openAddRow}><Plus size={16} /> Add drawing</button>
                                                <button type="button" className="danger" onClick={() => { deleteRow(row.id); setOpenMenuId(null); }}><Trash2 size={16} /> Delete drawing</button>
                                            </div>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && filteredRows.length === 0 && <div className="register-empty"><MoreVertical size={24} />No drawings match the current search.</div>}
            </section>
        </main>
    );
}
