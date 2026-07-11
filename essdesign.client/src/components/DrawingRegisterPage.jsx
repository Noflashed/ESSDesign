import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileSpreadsheet, Filter, MoreVertical, Plus, Search, Trash2, Upload, X } from 'lucide-react';
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

const cleanStatus = value => String(value || '').trim().toUpperCase();
const statusClass = value => {
    const status = cleanStatus(value);
    if (status.includes('AS-BU')) return 'as-built';
    if (status.includes('PRELIMINARY')) return 'preliminary';
    if (status.includes('CONCEPT')) return 'concept';
    return 'construction';
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
    const importRef = useRef(null);

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

    const statuses = useMemo(() => [...new Set(rows.map(row => cleanStatus(row.designUse)).filter(Boolean))].sort(), [rows]);
    const filteredRows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return rows.filter(row => (!statusFilter || cleanStatus(row.designUse) === statusFilter)
            && (!needle || FIELDS.some(([key]) => String(row[key]).toLowerCase().includes(needle))));
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

    const importWorkbook = async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        setRows(await readWorkbook(file));
        event.target.value = '';
    };

    const exportWorkbook = () => {
        const data = rows.map(row => Object.fromEntries(FIELDS.map(([key, label]) => [label, row[key]])));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Drawing Register');
        XLSX.writeFile(workbook, 'ESS Drawing Register.xlsx');
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
                <input ref={importRef} hidden type="file" accept=".xlsx,.xls" onChange={importWorkbook} />
                <button type="button" className="register-secondary-button" onClick={() => importRef.current?.click()}><Upload size={17} /> Import XLSX</button>
                <button type="button" className="register-secondary-button" onClick={exportWorkbook}><Download size={17} /> Export XLSX</button>
                <button type="button" className="register-primary-button" onClick={() => setShowAddRow(true)}><Plus size={18} /> Add Row</button>
            </div>

            {showAddRow && (
                <form className="drawing-register-add" onSubmit={addRow}>
                    <div className="register-add-title"><strong>Add new drawing</strong><button type="button" className="register-icon-button" onClick={() => setShowAddRow(false)} title="Close"><X size={18} /></button></div>
                    <div className="register-add-grid">
                        {FIELDS.map(([key, label]) => <label key={key}><span>{label}</span><input type={key === 'dateIssued' ? 'date' : 'text'} value={draft[key]} onChange={event => updateDraft(key, event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} /></label>)}
                        <button type="button" className="register-secondary-button" onClick={() => setShowAddRow(false)}>Cancel</button>
                        <button type="submit" className="register-primary-button">Save</button>
                    </div>
                </form>
            )}

            <section className="drawing-register-table-wrap">
                {loading ? <div className="register-empty"><FileSpreadsheet size={28} />Loading drawing register...</div> : (
                    <table className="drawing-register-table">
                        <thead><tr><th className="row-number">#</th>{FIELDS.map(([, label]) => <th key={label}>{label}</th>)}<th className="row-actions" /></tr></thead>
                        <tbody>
                            {filteredRows.map((row, index) => (
                                <tr key={row.id}>
                                    <td className="row-number">{index + 1}</td>
                                    {FIELDS.map(([key]) => <td key={key} onDoubleClick={() => setEditingId(row.id)}>{editingId === row.id ? <input value={row[key]} onChange={event => updateRow(row.id, key, event.target.value)} onBlur={() => setEditingId(null)} autoFocus={key === 'client'} /> : key === 'designUse' ? <span className={`register-status ${statusClass(row[key])}`}>{row[key] || 'CONSTRUCTION'}</span> : row[key]}</td>)}
                                    <td className="row-actions"><button type="button" className="register-row-menu" title="Delete row" onClick={() => deleteRow(row.id)}><Trash2 size={16} /></button></td>
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
