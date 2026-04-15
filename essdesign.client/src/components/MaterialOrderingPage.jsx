import React, { useEffect, useMemo, useState } from 'react';
import { materialOrdersAPI, safetyProjectsAPI } from '../services/api';

const MATERIAL_SECTIONS = [
    {
        key: 'modular_scaffold',
        title: 'Modular Scaffold',
        items: [
            { key: 'sole_boards', label: 'Sole Boards' },
            { key: 'standards_3_0m', label: 'Standards 3.0m' },
            { key: 'standards_2_5m', label: 'Standards 2.5m' },
            { key: 'standards_2_0m', label: 'Standards 2.0m' },
            { key: 'standards_1_5m', label: 'Standards 1.5m' },
            { key: 'standards_1_0m', label: 'Standards 1.0m' },
            { key: 'standards_0_5m', label: 'Standards 0.5m' },
            { key: 'screwjacks', label: 'Screwjacks' },
            { key: 'u_head_jack', label: 'U Head Jack' },
            { key: 'swivel_jack', label: 'Swivel Jack' },
            { key: 'open_end', label: 'Open / End' }
        ]
    },
    {
        key: 'timber_boards',
        title: 'Timber Boards',
        items: [
            { key: 'timber_boards_3_6m', label: '3.6m' },
            { key: 'timber_boards_2_4m', label: '2.4m' },
            { key: 'timber_boards_1_8m', label: '1.8m' }
        ]
    },
    {
        key: 'sundry_items',
        title: 'Sundry Items',
        items: [
            { key: 'corner_bracket', label: 'Corner Bracket' },
            { key: 'counter_weights', label: 'Counter Weights' }
        ]
    }
];

function todayDate() {
    return new Date().toISOString().slice(0, 10);
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
        itemValues: {}
    };
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

        Promise.all([
            safetyProjectsAPI.getBuilders(),
            materialOrdersAPI.getOrders()
        ])
            .then(([nextBuilders, nextOrders]) => {
                if (!active) {
                    return;
                }

                setBuilders(nextBuilders);
                setOrders(nextOrders);
                if (nextOrders[0]) {
                    setSelectedOrderId(nextOrders[0].id);
                    setForm(nextOrders[0]);
                } else {
                    setSelectedOrderId('new');
                    setForm(createBlankOrder(user));
                }
            })
            .catch((err) => {
                if (active) {
                    setError(err.message || 'Failed to load material orders');
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [user]);

    const selectedBuilder = useMemo(
        () => builders.find((builder) => builder.id === form.builderId) || null,
        [builders, form.builderId]
    );

    const availableProjects = selectedBuilder?.projects || [];

    const totalQuantity = useMemo(
        () => Object.values(form.itemValues || {}).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0),
        [form.itemValues]
    );

    const selectOrder = (order) => {
        setSelectedOrderId(order.id);
        setForm(order);
        setError('');
    };

    const startNewOrder = () => {
        setSelectedOrderId('new');
        setForm(createBlankOrder(user));
        setError('');
    };

    const handleBuilderChange = (builderId) => {
        const builder = builders.find((item) => item.id === builderId) || null;
        const nextProject = builder?.projects?.[0] || null;
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

    const handleItemChange = (itemKey, value) => {
        setForm((prev) => ({
            ...prev,
            itemValues: {
                ...prev.itemValues,
                [itemKey]: value
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
                (
                    order.builderId === form.builderId &&
                    order.projectId === form.projectId &&
                    order.orderDate === form.orderDate &&
                    order.requestedByName === form.requestedByName
                )
            ) || nextOrders[0];

            if (saved) {
                setSelectedOrderId(saved.id);
                setForm(saved);
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
                setForm(nextOrders[0]);
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
                        <div className="material-ordering-toolbar">
                            <div className="material-ordering-toolbar-group">
                                <div className="module-field">
                                    <label>Builder</label>
                                    <select value={form.builderId} onChange={(e) => handleBuilderChange(e.target.value)}>
                                        <option value="">Select builder</option>
                                        {builders.map((builder) => (
                                            <option key={builder.id} value={builder.id}>{builder.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="module-field">
                                    <label>Jobsite</label>
                                    <select value={form.projectId} onChange={(e) => handleProjectChange(e.target.value)} disabled={!selectedBuilder}>
                                        <option value="">{selectedBuilder ? 'Select jobsite' : 'Select builder first'}</option>
                                        {availableProjects.map((project) => (
                                            <option key={project.id} value={project.id}>{project.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="material-ordering-toolbar-group">
                                <div className="module-field">
                                    <label>Requested By</label>
                                    <input
                                        value={form.requestedByName}
                                        onChange={(e) => setForm((prev) => ({ ...prev, requestedByName: e.target.value }))}
                                    />
                                </div>
                                <div className="module-field">
                                    <label>Date</label>
                                    <input
                                        type="date"
                                        value={form.orderDate}
                                        onChange={(e) => setForm((prev) => ({ ...prev, orderDate: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="material-order-card">
                            <div className="material-order-card-head">
                                <div>
                                    <div className="material-order-card-eyebrow">Picking Card</div>
                                    <div className="material-order-card-title">{form.projectName || 'Select a jobsite'}</div>
                                    <div className="material-order-card-subtitle">{form.builderName || 'Builder will appear here'}</div>
                                </div>
                                <div className="material-order-card-meta">
                                    <span>{form.requestedByName || 'Requester'}</span>
                                    <span>{form.orderDate || todayDate()}</span>
                                </div>
                            </div>

                            <div className="material-order-sections">
                                {MATERIAL_SECTIONS.map((section) => (
                                    <div key={section.key} className="material-order-section">
                                        <div className="material-order-section-title">{section.title}</div>
                                        <div className="material-order-table">
                                            <div className="material-order-table-head">
                                                <span>Item</span>
                                                <span>Qty</span>
                                            </div>
                                            {section.items.map((item) => (
                                                <div key={item.key} className="material-order-row">
                                                    <span>{item.label}</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={form.itemValues[item.key] ?? ''}
                                                        onChange={(e) => handleItemChange(item.key, e.target.value)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="material-order-notes">
                                <label>Notes</label>
                                <textarea
                                    rows={4}
                                    value={form.notes}
                                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Site notes, delivery timing, or extra material instructions..."
                                />
                            </div>
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
