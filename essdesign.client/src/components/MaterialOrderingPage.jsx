import React, { useEffect, useMemo, useState } from 'react';
import { materialOrdersAPI, safetyProjectsAPI } from '../services/api';

const SECTION_HEADER_LABELS = new Set([
    'TIMBER BOARDS',
    'SCAFFOLD CLIPS',
    'SCAFFOLD TUBE',
    'SCAFFOLD STAIRS',
    'LADDER HATCHES',
    'SALE ITEMS'
]);

const PICKING_CARD_ROWS = [
    { id: 'r09', left: ['STANDARDS', '3.0M'], middle: ['HARDWOOD S/BDS', '0.5M'], right: ['6m / 5.4m', ''] },
    { id: 'r10', left: ['STANDARDS', '2.5M'], middle: ['HARDWOOD S/BDS', '1.5M'], right: ['4.8m / 4.2m', ''] },
    { id: 'r11', left: ['STANDARDS', '2.0M'], middle: ['SCREWJACKS', ''], right: ['3.6m', ''] },
    { id: 'r12', left: ['STANDARDS', '1.5M'], middle: ['U HEAD JACK', ''], right: ['3m', ''] },
    { id: 'r13', left: ['STANDARDS', '1.0M'], middle: ['SWIVEL JACK', ''], right: ['2.4m', ''] },
    { id: 'r14', left: ['STANDARDS', '0.5M'], middle: ['TIMBER BOARDS', ''], right: ['LADDER HATCHES', ''] },
    { id: 'r15', left: ['STD INTERMED 2M', 'LOCK'], middle: ['TIMBER BRDS', '3.6M'], right: ['CORNER BRACKET', '1 X 2'] },
    { id: 'r16', left: ['OPEN/END', '3.0M'], middle: ['TIMBER BRDS', '3.0M'], right: ['CORNER BRACKET', '2 X 2'] },
    { id: 'r17', left: ['OPEN/END', '2.5M'], middle: ['TIMBER BRDS', '2.4M'], right: ['CORNER BRACKET', '2 X 3'] },
    { id: 'r18', left: ['OPEN/END', '2.0M'], middle: ['TIMBER BRDS', '1.8M'], right: ['HANDRAIL POST (STD)', '1M'] },
    { id: 'r19', left: ['OPEN/END', '1.5M'], middle: ['TIMBER BRDS', '1.5M'], right: ['H/RAIL TIE POST', '0.75'] },
    { id: 'r20', left: ['OPEN/END', '1.0M'], middle: ['TIMBER BRDS', '1.2M'], right: ['H/RAIL TIE POST', '0.3'] },
    { id: 'r21', left: ['STD 1 STAR O/E', '0.5M'], middle: ['SCAFFOLD CLIPS', ''], right: ['WALL TIE BRKETS', ''] },
    { id: 'r22', left: ['LEDGERS', '2.4M'], middle: ['DOUBLE CLIP 90\'S', ''], right: ['WALL TIE DOUBLE', ''] },
    { id: 'r23', left: ['LEDGERS', '1.8M'], middle: ['DOUBLE SAFETY', ''], right: ['WALL TIE SAFETY', ''] },
    { id: 'r24', left: ['LEDGERS', '1.2M'], middle: ['SWIVEL', ''], right: ['LADDER BEAMS', '6.3'] },
    { id: 'r25', left: ['LEDGERS', '9.5M'], middle: ['SWIVEL SAFETY', ''], right: ['LADDER BEAMS', '5m'] },
    { id: 'r26', left: ['LEDGERS', '0.7M'], middle: ['PUTLOG CLIPS', ''], right: ['LADDER BEAMS', '4.2'] },
    { id: 'r27', left: ['LEDGERS', '1BD'], middle: ['JOINERS INT / EXT', ''], right: ['LADDER BEAMS', '3m'] },
    { id: 'r28', left: ['TRANSOMS', '2.4M'], middle: ['BEAM CLAMPS', ''], right: ['PALLET CAGE', ''] },
    { id: 'r29', left: ['TRANSOMS', '1.8M'], middle: ['TOE BOARD CLIPS', ''], right: ['PALLETS', ''] },
    { id: 'r30', left: ['TRANSOMS', '1.2M'], middle: ['CC CLIPS', ''], right: ['PALLET CASTOR', ''] },
    { id: 'r31', left: ['TRANSOMS', '9.50M'], middle: ['TOE BOARD SPADES', ''], right: ["UB'S", ''] },
    { id: 'r32', left: ['TRANSOMS', '0.7M'], middle: ['V CLIPS', ''], right: ["UB'S", ''] },
    { id: 'r33', left: ['TRANSOMS 2 BRD', '0.51'], middle: ['', ''], right: ["UB'S", ''] },
    { id: 'r34', left: ['TRANSOM 2 BRD', '0.48'], middle: ['', ''], right: ['UNIT BEAMS', '3.6M'] },
    { id: 'r35', left: ['TRANSOM 1 BRD', '1BD'], middle: ['SCAFFOLD TUBE', ''], right: ['TRANSOM TRUSS', '2.4M'] },
    { id: 'r36', left: ['LADDER TRANNYS', ''], middle: ['6', 'M'], right: ['TRANSOM TRUSS', '1.8M'] },
    { id: 'r37', left: ['LADDER TRANNYS', '1.2M'], middle: ['5.4', 'M'], right: ['TRANSOM TRUSS', '1.2M'] },
    { id: 'r38', left: ['DIA/BRACES', '3.6M'], middle: ['4.8', 'M'], right: ['LAP PLATES', '2B'] },
    { id: 'r39', left: ['DIA/BRACES', '3.2M'], middle: ['4.2', 'M'], right: ['LAP PLATES', '3B'] },
    { id: 'r40', left: ['DIA/BRACES', '2.7M'], middle: ['3.6', 'M'], right: ['CASTOR WHEELS', ''] },
    { id: 'r41', left: ['DIA/BRACES', '1.9M'], middle: ['3', 'M'], right: ['SALE ITEMS', ''] },
    { id: 'r42', left: ['STEEL BOARDS', '2.4M'], middle: ['2.4', 'M'], right: ['CHAIN/SHADE BLUE', '15M'] },
    { id: 'r43', left: ['STEEL BOARDS', '1.8M'], middle: ['1.8', 'M'], right: ['CHAIN/SHADE GREEN', '15M'] },
    { id: 'r44', left: ['STEEL BOARDS', '1.2M'], middle: ['1.5', 'M'], right: ['CHAIN/SHADE BLACK', '15M'] },
    { id: 'r45', left: ['STEEL BOARDS', '0.95M'], middle: ['1.2', 'M'], right: ['CHAIN/SHADE', '0.9 mm'] },
    { id: 'r46', left: ['STEEL BOARDS', '0.745'], middle: ['0.9', 'mm'], right: ['CHAIN WIRE 15M / SHADE 50M', ''] },
    { id: 'r47', left: ['INFILL BRDS', '2.4M'], middle: ['0.6', 'mm'], right: ['SCREW BOLTS 100mm', '12 mm'] },
    { id: 'r48', left: ['INFILL BRDS', '1.8M'], middle: ['0.3', 'mm'], right: ['SCREW BOLTS 75mm', '12 mm'] },
    { id: 'r49', left: ['INFILL BRDS', '1.2M'], middle: ['SCAFFOLD STAIRS', ''], right: ['TECH SCREWS', '90 mm'] },
    { id: 'r50', left: ['HOP-UP 3 SPIGETS', ''], middle: ['ALUMINIUM STAIRS', ''], right: ['TECH SCREWS', '45 mm'] },
    { id: 'r51', left: ['HOP-UP 2 SPIGETS', ''], middle: ['ALUMINIUM HANDRAIL', ''], right: ['TECH SCREWS TIMBER', '45 mm'] },
    { id: 'r52', left: ['HOP-UP BRKETS 3', '3BRD'], middle: ['ALUMINIUM TOP RAIL', ''], right: ['PLYWOOD 17mm / 12mm', ''] },
    { id: 'r53', left: ['HOP-UP BRKETS 2', '2BRD'], middle: ['STAIR BOLTS', ''], right: ['3/2 TIMBERS', ''] },
    { id: 'r54', left: ['HOP-UP BRKETS 1', '1BRD'], middle: ['STAIR STRINGER', ''], right: ['TIE WIRE', ''] },
    { id: 'r55', left: ['TIE BARS', '2.4M'], middle: ['1 BRD STEP DOWNS', '1 BRD'], right: ['INCOMPLETES SIGNS', ''] },
    { id: 'r56', left: ['TIE BARS', '1.8M'], middle: ['2 BRD STEP DOWNS', '2BRD'], right: ['SCAFF TAGS', ''] },
    { id: 'r57', left: ['TIE BARS', '1.2M'], middle: ['ALUMIN STAIR RISER', '2.0M'], right: ['M20 TREAD ROD', ''] },
    { id: 'r58', left: ['TIE BARS', '0.745'], middle: ['ALUMIN STAIR RISER', '1.0M'], right: ['UB BRACKETS', ''] },
    { id: 'r59', left: ['LEDGER', '3m'], middle: ['STAIR BOTS', ''], right: ['', ''] },
    { id: 'r60', left: ['STEEL BOARDS', '3M'], middle: ['STAIR DOOR', ''], right: ['', ''] }
];

function todayDate() {
    return new Date().toISOString().slice(0, 10);
}

function formatDayLabel(dateValue) {
    if (!dateValue) return '';
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-AU', { weekday: 'long' });
}

function createBlankOrder(user) {
    return {
        id: null,
        builderId: '',
        builderName: '',
        projectId: '',
        projectName: '',
        requestedByUserId: user?.id || null,
        requestedByName: user?.fullName || user?.email || '',
        orderDate: todayDate(),
        notes: '',
        itemValues: {
            __time: '',
            __scaffoldingSystem: 'Kwikstage'
        }
    };
}

function normalizeOrder(order, user) {
    const fallback = createBlankOrder(user);
    return {
        ...fallback,
        ...order,
        requestedByUserId: order?.requestedByUserId || fallback.requestedByUserId,
        requestedByName: order?.requestedByName || fallback.requestedByName,
        orderDate: order?.orderDate || fallback.orderDate,
        itemValues: {
            __time: order?.itemValues?.__time || '',
            __scaffoldingSystem: order?.itemValues?.__scaffoldingSystem || 'Kwikstage',
            ...(order?.itemValues || {})
        }
    };
}

function quantityKey(rowId, side) {
    return `${rowId}_${side}_qty`;
}

function MetadataRow({ label, control, sideLabel, sideValue }) {
    return (
        <tr>
            <th className="picking-meta-label">{label}</th>
            <td className="picking-meta-value" colSpan={5}>{control}</td>
            <th className="picking-meta-label picking-meta-label-right">{sideLabel}</th>
            <td className="picking-meta-value picking-meta-value-right" colSpan={2}>{sideValue}</td>
        </tr>
    );
}

function ItemCell({ entry, value, onChange }) {
    const [label, spec] = entry;
    const empty = !label && !spec;
    const normalizedLabel = (label || '').trim().toUpperCase();
    const isSectionHeader = SECTION_HEADER_LABELS.has(normalizedLabel) && !spec;

    return (
        <>
            <td className={`picking-item-label ${empty ? 'is-empty' : ''} ${isSectionHeader ? 'is-section-header' : ''}`}>{label || ''}</td>
            <td className={`picking-item-spec ${empty ? 'is-empty' : ''} ${isSectionHeader ? 'is-section-header' : ''}`}>{spec || ''}</td>
            <td className={`picking-item-qty ${empty ? 'is-empty' : ''} ${isSectionHeader ? 'is-section-header' : ''}`}>
                {!empty && !isSectionHeader ? (
                    <input
                        type="number"
                        min="0"
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                    />
                ) : null}
            </td>
        </>
    );
}

export default function MaterialOrderingPage({ user }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [builders, setBuilders] = useState([]);
    const [orders, setOrders] = useState([]);
    const [selectedOrderId, setSelectedOrderId] = useState('new');
    const [form, setForm] = useState(() => createBlankOrder(user));

    useEffect(() => {
        let active = true;

        Promise.allSettled([
            safetyProjectsAPI.getBuilders({ includeArchived: true }),
            materialOrdersAPI.getOrders()
        ])
            .then(([buildersResult, ordersResult]) => {
                if (!active) return;

                const nextBuilders = buildersResult.status === 'fulfilled' ? buildersResult.value : [];
                const nextOrders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];

                setBuilders(nextBuilders);
                setOrders(nextOrders);

                if (nextOrders[0]) {
                    setSelectedOrderId(nextOrders[0].id);
                    setForm(normalizeOrder(nextOrders[0], user));
                } else {
                    setSelectedOrderId('new');
                    setForm(createBlankOrder(user));
                }

                if (buildersResult.status === 'rejected') {
                    setError(buildersResult.reason?.message || 'Failed to load builders');
                    return;
                }

                if (ordersResult.status === 'rejected') {
                    setError(`${ordersResult.reason?.message || 'Failed to load material orders'}. Run migration 015 to create public.ess_material_orders.`);
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [user]);

    const selectedBuilder = useMemo(
        () => builders.find((builder) => builder.id === form.builderId) || null,
        [builders, form.builderId]
    );

    const availableProjects = useMemo(
        () => (selectedBuilder?.projects || []).filter((project) => !project.archived),
        [selectedBuilder]
    );

    const dayLabel = useMemo(() => formatDayLabel(form.orderDate), [form.orderDate]);

    const totalQuantity = useMemo(
        () => Object.entries(form.itemValues || {}).reduce((sum, [key, value]) => {
            if (String(key).startsWith('__')) return sum;
            return sum + Math.max(0, Number(value || 0));
        }, 0),
        [form.itemValues]
    );

    const selectOrder = (order) => {
        setSelectedOrderId(order.id);
        setForm(normalizeOrder(order, user));
        setError('');
    };

    const startNewOrder = () => {
        setSelectedOrderId('new');
        setForm(createBlankOrder(user));
        setError('');
    };

    const handleBuilderChange = (builderId) => {
        const builder = builders.find((item) => item.id === builderId) || null;
        const nextProject = (builder?.projects || []).find((project) => !project.archived) || null;
        setForm((prev) => ({
            ...prev,
            builderId: builder?.id || '',
            builderName: builder?.name || '',
            projectId: nextProject?.id || '',
            projectName: nextProject?.name || ''
        }));
    };

    const handleProjectChange = (projectId) => {
        const project = availableProjects.find((item) => item.id === projectId) || null;
        setForm((prev) => ({
            ...prev,
            projectId: project?.id || '',
            projectName: project?.name || ''
        }));
    };

    const handleQuantityChange = (key, value) => {
        setForm((prev) => ({
            ...prev,
            itemValues: {
                ...prev.itemValues,
                [key]: value
            }
        }));
    };

    const saveOrder = async () => {
        if (!form.builderName || !form.projectName || !form.requestedByName || !form.orderDate) {
            setError('Builder, jobsite, requester, and date are required.');
            return;
        }

        setSaving(true);
        setError('');

        try {
            const nextOrders = await materialOrdersAPI.saveOrder(form);
            setOrders(nextOrders);
            const saved = nextOrders.find((order) =>
                order.id === form.id ||
                (order.builderId === form.builderId &&
                    order.projectId === form.projectId &&
                    order.orderDate === form.orderDate &&
                    order.requestedByName === form.requestedByName)
            ) || nextOrders[0];

            if (saved) {
                setSelectedOrderId(saved.id);
                setForm(normalizeOrder(saved, user));
            }
        } catch (err) {
            setError(err.message || 'Failed to save material order');
        } finally {
            setSaving(false);
        }
    };

    const deleteOrder = async () => {
        if (!form.id) {
            startNewOrder();
            return;
        }

        setSaving(true);
        setError('');

        try {
            const nextOrders = await materialOrdersAPI.deleteOrder(form.id);
            setOrders(nextOrders);
            if (nextOrders[0]) {
                setSelectedOrderId(nextOrders[0].id);
                setForm(normalizeOrder(nextOrders[0], user));
            } else {
                startNewOrder();
            }
        } catch (err) {
            setError(err.message || 'Failed to delete material order');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="module-page"><div className="module-empty">Loading material ordering...</div></div>;
    }

    return (
        <div className="module-page">
            <div className="module-shell material-ordering-shell">
                <div className="material-ordering-layout">
                    <aside className="material-ordering-sidebar">
                        <div className="material-ordering-sidebar-head">
                            <div>
                                <h2>ESS Material Ordering</h2>
                                <p>Saved picking cards linked to your site registry.</p>
                            </div>
                            <button type="button" className="module-primary-btn" onClick={startNewOrder}>
                                New Card
                            </button>
                        </div>

                        <div className="material-ordering-order-list">
                            {orders.length === 0 ? (
                                <div className="module-empty-inline">No saved picking cards yet.</div>
                            ) : (
                                orders.map((order) => (
                                    <button
                                        key={order.id}
                                        type="button"
                                        className={`material-ordering-order-item ${selectedOrderId === order.id ? 'active' : ''}`}
                                        onClick={() => selectOrder(order)}
                                    >
                                        <span className="material-ordering-order-builder">{order.builderName}</span>
                                        <span className="material-ordering-order-project">{order.projectName}</span>
                                        <span className="material-ordering-order-meta">{order.orderDate}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </aside>

                    <section className="material-ordering-canvas">
                        <div className="picking-sheet-card">
                            <table className="picking-sheet-table">
                                <colgroup>
                                    <col className="w-label" />
                                    <col className="w-spec" />
                                    <col className="w-qty" />
                                    <col className="w-label" />
                                    <col className="w-spec" />
                                    <col className="w-qty" />
                                    <col className="w-label" />
                                    <col className="w-spec" />
                                    <col className="w-qty" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th className="picking-title" colSpan={9}>PICKING CARD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <MetadataRow
                                        label="BUILDER :"
                                        control={(
                                            <select value={form.builderId} onChange={(e) => handleBuilderChange(e.target.value)}>
                                                <option value="">Select builder</option>
                                                {builders.map((builder) => (
                                                    <option key={builder.id} value={builder.id}>{builder.name}</option>
                                                ))}
                                            </select>
                                        )}
                                        sideLabel="DAY"
                                        sideValue={dayLabel}
                                    />
                                    <MetadataRow
                                        label="PROJECT :"
                                        control={(
                                            <select value={form.projectId} onChange={(e) => handleProjectChange(e.target.value)} disabled={!selectedBuilder}>
                                                <option value="">{selectedBuilder ? 'Select jobsite' : 'Select builder first'}</option>
                                                {availableProjects.map((project) => (
                                                    <option key={project.id} value={project.id}>{project.name}</option>
                                                ))}
                                            </select>
                                        )}
                                        sideLabel="TIME"
                                        sideValue={(
                                            <input
                                                value={form.itemValues.__time || ''}
                                                onChange={(e) => handleQuantityChange('__time', e.target.value)}
                                                placeholder="7am"
                                            />
                                        )}
                                    />
                                    <MetadataRow
                                        label="SCAFFOLDING SYSTEM :"
                                        control={(
                                            <select
                                                value={form.itemValues.__scaffoldingSystem || 'Kwikstage'}
                                                onChange={(e) => handleQuantityChange('__scaffoldingSystem', e.target.value)}
                                            >
                                                <option value="Kwikstage">Kwikstage</option>
                                                <option value="AT-PAC">AT-PAC</option>
                                                <option value="Layher">Layher</option>
                                            </select>
                                        )}
                                        sideLabel="TOTAL QTY"
                                        sideValue={<span className="picking-static-value">{totalQuantity}</span>}
                                    />
                                    <MetadataRow
                                        label="DETAILS"
                                        control={<span className="picking-static-value">{form.requestedByName}</span>}
                                        sideLabel="DATE"
                                        sideValue={(
                                            <input
                                                type="date"
                                                value={form.orderDate}
                                                onChange={(e) => setForm((prev) => ({ ...prev, orderDate: e.target.value }))}
                                            />
                                        )}
                                    />

                                    <tr className="picking-section-row">
                                        <th className="picking-section-title" colSpan={2}>MODULAR SCAFFOLD</th>
                                        <th className="picking-qty-head">QTY'S</th>
                                        <th className="picking-section-item" colSpan={2}>SOLE BOARDS</th>
                                        <th className="picking-qty-head">QTY'S</th>
                                        <th className="picking-section-item" colSpan={2}>SCAFFOLD LADDER</th>
                                        <th className="picking-qty-head">QTY'S</th>
                                    </tr>

                                    {PICKING_CARD_ROWS.map((row) => (
                                        <tr key={row.id}>
                                            <ItemCell
                                                entry={row.left}
                                                value={form.itemValues[quantityKey(row.id, 'left')]}
                                                onChange={(value) => handleQuantityChange(quantityKey(row.id, 'left'), value)}
                                            />
                                            <ItemCell
                                                entry={row.middle}
                                                value={form.itemValues[quantityKey(row.id, 'middle')]}
                                                onChange={(value) => handleQuantityChange(quantityKey(row.id, 'middle'), value)}
                                            />
                                            <ItemCell
                                                entry={row.right}
                                                value={form.itemValues[quantityKey(row.id, 'right')]}
                                                onChange={(value) => handleQuantityChange(quantityKey(row.id, 'right'), value)}
                                            />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {error ? <div className="module-error">{error}</div> : null}

                        <div className="material-order-footer">
                            <div className="material-order-summary">
                                <span>Total Quantity</span>
                                <strong>{totalQuantity}</strong>
                            </div>
                            <div className="module-form-actions">
                                {form.id ? (
                                    <button type="button" className="module-danger-btn" onClick={deleteOrder} disabled={saving}>
                                        Delete
                                    </button>
                                ) : null}
                                <button type="button" className="module-primary-btn" onClick={saveOrder} disabled={saving}>
                                    {saving ? 'Saving...' : 'Save Picking Card'}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
