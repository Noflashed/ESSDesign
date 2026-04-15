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
    { id: 'r09', left: ['STANDARDS', '3.0M'], middle: ['HARDWOOD SOLE BOARDS', '0.5M'], right: ['SCAFFOLD LADDER', '6.0M / 5.4M'] },
    { id: 'r10', left: ['STANDARDS', '2.5M'], middle: ['HARDWOOD SOLE BOARDS', '1.5M'], right: ['SCAFFOLD LADDER', '4.8M / 4.2M'] },
    { id: 'r11', left: ['STANDARDS', '2.0M'], middle: ['SCREWJACKS', ''], right: ['3.6m', ''] },
    { id: 'r12', left: ['STANDARDS', '1.5M'], middle: ['U HEAD JACK', ''], right: ['3m', ''] },
    { id: 'r13', left: ['STANDARDS', '1.0M'], middle: ['SWIVEL JACK', ''], right: ['2.4m', ''] },
    { id: 'r14', left: ['STANDARDS', '0.5M'], middle: ['TIMBER BOARDS', ''], right: ['LADDER HATCHES', ''] },
    { id: 'r15', left: ['STANDARD INTERMEDIATE', '2M LOCK'], middle: ['TIMBER BOARDS', '3.6M'], right: ['CORNER BRACKET', '1 X 2'] },
    { id: 'r16', left: ['OPEN END', '3.0M'], middle: ['TIMBER BOARDS', '3.0M'], right: ['CORNER BRACKET', '2 X 2'] },
    { id: 'r17', left: ['OPEN END', '2.5M'], middle: ['TIMBER BOARDS', '2.4M'], right: ['CORNER BRACKET', '2 X 3'] },
    { id: 'r18', left: ['OPEN END', '2.0M'], middle: ['TIMBER BOARDS', '1.8M'], right: ['HANDRAIL POST (STANDARD)', '1M'] },
    { id: 'r19', left: ['OPEN END', '1.5M'], middle: ['TIMBER BOARDS', '1.5M'], right: ['HANDRAIL TIE POST', '0.75'] },
    { id: 'r20', left: ['OPEN END', '1.0M'], middle: ['TIMBER BOARDS', '1.2M'], right: ['HANDRAIL TIE POST', '0.3'] },
    { id: 'r21', left: ['STANDARD 1 STAR OPEN END', '0.5M'], middle: ['SCAFFOLD CLIPS', ''], right: ['WALL TIE BRACKETS', ''] },
    { id: 'r22', left: ['LEDGERS', '2.4M'], middle: ['DOUBLE CLIP 90 DEGREES', ''], right: ['WALL TIE DOUBLE', ''] },
    { id: 'r23', left: ['LEDGERS', '1.8M'], middle: ['DOUBLE SAFETY', ''], right: ['WALL TIE SAFETY', ''] },
    { id: 'r24', left: ['LEDGERS', '1.2M'], middle: ['SWIVEL', ''], right: ['LADDER BEAMS', '6.3'] },
    { id: 'r25', left: ['LEDGERS', '9.5M'], middle: ['SWIVEL SAFETY', ''], right: ['LADDER BEAMS', '5m'] },
    { id: 'r26', left: ['LEDGERS', '0.7M'], middle: ['PUTLOG CLIPS', ''], right: ['LADDER BEAMS', '4.2'] },
    { id: 'r27', left: ['LEDGERS', '1 BOARD'], middle: ['JOINERS INTERNAL / EXTERNAL', ''], right: ['LADDER BEAMS', '3.0M'] },
    { id: 'r28', left: ['TRANSOMS', '2.4M'], middle: ['BEAM CLAMPS', ''], right: ['PALLET CAGE', ''] },
    { id: 'r29', left: ['TRANSOMS', '1.8M'], middle: ['TOE BOARD CLIPS', ''], right: ['PALLETS', ''] },
    { id: 'r30', left: ['TRANSOMS', '1.2M'], middle: ['COUPLER CLIPS', ''], right: ['PALLET CASTOR', ''] },
    { id: 'r31', left: ['TRANSOMS', '9.50M'], middle: ['TOE BOARD SPADES', ''], right: ['UNIT BEAMS', ''] },
    { id: 'r32', left: ['TRANSOMS', '0.7M'], middle: ['V CLIPS', ''], right: ['UNIT BEAMS', ''] },
    { id: 'r33', left: ['TRANSOMS 2 BOARD', '0.51M'], middle: ['', ''], right: ['UNIT BEAMS', ''] },
    { id: 'r34', left: ['TRANSOMS 2 BOARD', '0.48M'], middle: ['', ''], right: ['UNIT BEAMS', '3.6M'] },
    { id: 'r35', left: ['TRANSOMS 1 BOARD', '1 BOARD'], middle: ['SCAFFOLD TUBE', ''], right: ['TRANSOM TRUSS', '2.4M'] },
    { id: 'r36', left: ['LADDER TRANSOMS', ''], middle: ['SCAFFOLD TUBE', '6.0M'], right: ['TRANSOM TRUSS', '1.8M'] },
    { id: 'r37', left: ['LADDER TRANSOMS', '1.2M'], middle: ['SCAFFOLD TUBE', '5.4M'], right: ['TRANSOM TRUSS', '1.2M'] },
    { id: 'r38', left: ['DIAGONAL BRACES', '3.6M'], middle: ['SCAFFOLD TUBE', '4.8M'], right: ['LAP PLATES', '2 BOARD'] },
    { id: 'r39', left: ['DIAGONAL BRACES', '3.2M'], middle: ['SCAFFOLD TUBE', '4.2M'], right: ['LAP PLATES', '3 BOARD'] },
    { id: 'r40', left: ['DIAGONAL BRACES', '2.7M'], middle: ['SCAFFOLD TUBE', '3.6M'], right: ['CASTOR WHEELS', ''] },
    { id: 'r41', left: ['DIAGONAL BRACES', '1.9M'], middle: ['SCAFFOLD TUBE', '3.0M'], right: ['SALE ITEMS', ''] },
    { id: 'r42', left: ['STEEL BOARDS', '2.4M'], middle: ['2.4', 'M'], right: ['CHAIN/SHADE BLUE', '15M'] },
    { id: 'r43', left: ['STEEL BOARDS', '1.8M'], middle: ['1.8', 'M'], right: ['CHAIN/SHADE GREEN', '15M'] },
    { id: 'r44', left: ['STEEL BOARDS', '1.2M'], middle: ['1.5', 'M'], right: ['CHAIN/SHADE BLACK', '15M'] },
    { id: 'r45', left: ['STEEL BOARDS', '0.95M'], middle: ['1.2', 'M'], right: ['CHAIN/SHADE', '0.9 mm'] },
    { id: 'r46', left: ['STEEL BOARDS', '0.745'], middle: ['0.9', 'mm'], right: ['CHAIN WIRE 15M / SHADE 50M', ''] },
    { id: 'r47', left: ['INFILL BOARDS', '2.4M'], middle: ['SCAFFOLD TUBE', '0.6MM'], right: ['SCREW BOLTS 100MM', '12MM'] },
    { id: 'r48', left: ['INFILL BOARDS', '1.8M'], middle: ['SCAFFOLD TUBE', '0.3MM'], right: ['SCREW BOLTS 75MM', '12MM'] },
    { id: 'r49', left: ['INFILL BOARDS', '1.2M'], middle: ['SCAFFOLD STAIRS', ''], right: ['TECH SCREWS', '90MM'] },
    { id: 'r50', left: ['HOP-UP 3 SPIGOTS', ''], middle: ['ALUMINIUM STAIRS', ''], right: ['TECH SCREWS', '45MM'] },
    { id: 'r51', left: ['HOP-UP 2 SPIGOTS', ''], middle: ['ALUMINIUM HANDRAIL', ''], right: ['TECH SCREWS TIMBER', '45MM'] },
    { id: 'r52', left: ['HOP-UP BRACKETS 3', '3 BOARD'], middle: ['ALUMINIUM TOP RAIL', ''], right: ['PLYWOOD 17MM / 12MM', ''] },
    { id: 'r53', left: ['HOP-UP BRACKETS 2', '2 BOARD'], middle: ['STAIR BOLTS', ''], right: ['3/2 TIMBERS', ''] },
    { id: 'r54', left: ['HOP-UP BRACKETS 1', '1 BOARD'], middle: ['STAIR STRINGER', ''], right: ['TIE WIRE', ''] },
    { id: 'r55', left: ['TIE BARS', '2.4M'], middle: ['1 BOARD STEP DOWNS', '1 BOARD'], right: ['INCOMPLETE SIGNS', ''] },
    { id: 'r56', left: ['TIE BARS', '1.8M'], middle: ['2 BOARD STEP DOWNS', '2 BOARD'], right: ['SCAFF TAGS', ''] },
    { id: 'r57', left: ['TIE BARS', '1.2M'], middle: ['ALUMINIUM STAIR RISER', '2.0M'], right: ['M20 TREAD ROD', ''] },
    { id: 'r58', left: ['TIE BARS', '0.745'], middle: ['ALUMINIUM STAIR RISER', '1.0M'], right: ['UNIT BEAM BRACKETS', ''] },
    { id: 'r59', left: ['LEDGER', '3.0M'], middle: ['STAIR BOLTS', ''], right: ['', ''] },
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
            __details: '',
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
            __details: order?.itemValues?.__details || '',
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

    const deleteOrderById = async (orderId) => {
        if (!orderId) {
            return;
        }

        setSaving(true);
        setError('');

        try {
            const nextOrders = await materialOrdersAPI.deleteOrder(orderId);
            setOrders(nextOrders);

            if (form.id === orderId) {
                if (nextOrders[0]) {
                    setSelectedOrderId(nextOrders[0].id);
                    setForm(normalizeOrder(nextOrders[0], user));
                } else {
                    startNewOrder();
                }
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
                                    <div
                                        key={order.id}
                                        className={`material-ordering-order-item ${selectedOrderId === order.id ? 'active' : ''}`}
                                    >
                                        <button
                                            type="button"
                                            className="material-ordering-order-main"
                                            onClick={() => selectOrder(order)}
                                        >
                                        <span className="material-ordering-order-builder">{order.builderName}</span>
                                        <span className="material-ordering-order-project">{order.projectName}</span>
                                        <span className="material-ordering-order-details">
                                            {order.itemValues?.__details || 'No details entered'}
                                        </span>
                                        <span className="material-ordering-order-meta">{order.orderDate}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="material-ordering-order-delete"
                                            aria-label={`Delete ${order.projectName}`}
                                            onClick={() => deleteOrderById(order.id)}
                                            disabled={saving}
                                        >
                                            ×
                                        </button>
                                    </div>
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
                                        label="SCAFFOLD TYPE :"
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
                                        sideLabel="ESS REP"
                                        sideValue={<span className="picking-static-value">{form.requestedByName}</span>}
                                    />
                                    <MetadataRow
                                        label="DETAILS"
                                        control={(
                                            <input
                                                value={form.itemValues.__details || ''}
                                                onChange={(e) => handleQuantityChange('__details', e.target.value)}
                                                placeholder="Enter picking card details"
                                            />
                                        )}
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
