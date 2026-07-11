import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, Filter, MoreVertical, Plus, Search, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
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
const DESIGN_USE_OPTIONS = ['CONSTRUCTION', 'PRELIMINARY', 'CONCEPT', 'CONCEPT ONLY', 'AS-BUILT'];

const cleanStatus = value => String(value || '').trim().toUpperCase();
const statusClass = value => {
    const status = cleanStatus(value);
    if (status.includes('AS-BU')) return 'as-built';
    if (status.includes('PRELIMINARY')) return 'preliminary';
    if (status.includes('CONCEPT')) return 'concept';
    return 'construction';
};

const getDrawingSequence = drawingNo => {
    const match = String(drawingNo || '').trim().match(/(\d+)$/);
    return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
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

export default function DrawingRegisterPage({ onBack }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showAddRow, setShowAddRow] = useState(false);
    const [draft, setDraft] = useState(EMPTY_ROW);
    const [editingId, setEditingId] = useState(null);
    const [openMenuId, setOpenMenuId] = useState(null);

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

    const statuses = useMemo(() => [...new Set(rows.map(row => cleanStatus(row.designUse)).filter(Boolean))].sort(), [rows]);
    const filteredRows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return rows
            .map((row, sourceIndex) => ({ row, sourceIndex }))
            .filter(({ row }) => (!statusFilter || cleanStatus(row.designUse) === statusFilter)
                && (!needle || FIELDS.some(([key]) => String(row[key]).toLowerCase().includes(needle))))
            .sort((left, right) => getDrawingSequence(right.row.drawingNo) - getDrawingSequence(left.row.drawingNo)
                || left.sourceIndex - right.sourceIndex)
            .map(({ row }) => row);
    }, [rows, query, statusFilter]);

    const updateDraft = (key, value) => setDraft(current => ({ ...current, [key]: value }));
    const addRow = event => {
        event.preventDefault();
        if (!draft.client && !draft.drawingNo) return;
        setRows(current => [{ ...draft, id: `manual-${Date.now()}`, designUse: cleanStatus(draft.designUse) }, ...current]);
        setDraft(EMPTY_ROW);
        setShowAddRow(false);
    };
    const updateRow = (id, key, value) => setRows(current => current.map(row => row.id === id ? { ...row, [key]: value } : row));
    const deleteRow = id => setRows(current => current.filter(row => row.id !== id));
    const openAddRow = () => {
        setDraft(EMPTY_ROW);
        setShowAddRow(true);
        setOpenMenuId(null);
    };

    return (
        <main className="drawing-register-page">
            <header className="drawing-register-heading">
                <button type="button" className="register-icon-button" onClick={onBack} title="Back to ESS Design"><ArrowLeft size={19} /></button>
                <div><h1>Drawing Register</h1><p>{rows.length} drawings</p></div>
            </header>

            <div className="drawing-register-toolbar">
                <label className="register-search"><Search size={18} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search drawings..." /></label>
                <label className="register-filter"><Filter size={17} /><span>Filter</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All uses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
                <span className="register-toolbar-spacer" />
                <button type="button" className="register-primary-button" onClick={openAddRow}><Plus size={18} /> Add Row</button>
            </div>

            {showAddRow && (
                <div className="register-modal-backdrop" role="presentation" onMouseDown={() => setShowAddRow(false)}>
                    <form className="drawing-register-modal" onSubmit={addRow} onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-drawing-title">
                        <div className="register-modal-header"><div><h2 id="add-drawing-title">Add new drawing</h2><p>Enter the drawing register details below.</p></div><button type="button" className="register-icon-button" onClick={() => setShowAddRow(false)} title="Close"><X size={18} /></button></div>
                        <div className="register-modal-grid">
                            {FIELDS.map(([key, label]) => <label key={key}><span>{label}</span>{key === 'designUse' ? <select value={draft[key]} onChange={event => updateDraft(key, event.target.value)}><option value="">Select design use</option>{DESIGN_USE_OPTIONS.map(option => <option key={option}>{option}</option>)}</select> : <input type={key === 'dateIssued' ? 'date' : 'text'} value={draft[key]} onChange={event => updateDraft(key, event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} autoFocus={key === 'client'} />}</label>)}
                        </div>
                        <div className="register-modal-actions"><button type="button" className="register-secondary-button" onClick={() => setShowAddRow(false)}>Cancel</button><button type="submit" className="register-primary-button">Add drawing</button></div>
                    </form>
                </div>
            )}

            <section className="drawing-register-table-wrap">
                {loading ? <div className="register-empty"><FileSpreadsheet size={28} />Loading drawing register...</div> : (
                    <table className="drawing-register-table">
                        <thead><tr>{FIELDS.map(([, label]) => <th key={label}>{label}</th>)}<th className="row-actions" /></tr></thead>
                        <tbody>
                            {filteredRows.map(row => (
                                <tr key={row.id}>
                                    {FIELDS.map(([key]) => <td key={key} onDoubleClick={key === 'designUse' ? undefined : () => setEditingId(row.id)}>{key === 'designUse' ? <select className={`register-status-select ${statusClass(row[key])}`} value={cleanStatus(row[key]) || 'CONSTRUCTION'} onChange={event => updateRow(row.id, key, event.target.value)}>{[...new Set([...DESIGN_USE_OPTIONS, cleanStatus(row[key])].filter(Boolean))].map(option => <option key={option}>{option}</option>)}</select> : editingId === row.id ? <input value={row[key]} onChange={event => updateRow(row.id, key, event.target.value)} onBlur={() => setEditingId(null)} autoFocus={key === 'client'} /> : row[key]}</td>)}
                                    <td className="row-actions">
                                        <div className="register-row-actions-wrap">
                                            <button type="button" className="register-row-menu" title="Drawing actions" aria-label={`Actions for ${row.drawingNo || 'drawing'}`} aria-expanded={openMenuId === row.id} onClick={event => { event.stopPropagation(); setOpenMenuId(current => current === row.id ? null : row.id); }}><MoreVertical size={17} /></button>
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
