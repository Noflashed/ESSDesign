import React, { useEffect, useMemo, useState } from 'react';
import { materialOrdersAPI, materialOrderRequestsAPI, safetyProjectsAPI } from '../services/api';
import { TRUCK_LANES, formatTimeChip } from './transport/transportUtils';

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

function formatDateTime(value) {
    if (!value) return 'Not scheduled';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatLastUpdated(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    const time = date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    return isToday ? `Today, ${time}` : formatDateTime(value);
}

function formatSchedulePill(request) {
    if (!request?.scheduledDate || typeof request?.scheduledHour !== 'number' || typeof request?.scheduledMinute !== 'number') {
        return 'Pending schedule';
    }
    const scheduled = new Date(`${request.scheduledDate}T${String(request.scheduledHour).padStart(2, '0')}:${String(request.scheduledMinute).padStart(2, '0')}:00`);
    const dateLabel = scheduled.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const timeLabel = scheduled.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    return `Scheduled · ${dateLabel} ${timeLabel}`;
}

function getDeliveryStatusLabel(status) {
    if (status === 'in_transit') return 'In Transit';
    if (status === 'unloading') return 'Unloading';
    if (status === 'return_transit') return 'Return Transit';
    if (status === 'scheduled') return 'Scheduled';
    return 'Pending';
}

function getSubmittedDateLabel(value) {
    if (!value) return 'Pending';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getSubmittedTimeLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function getScheduledTimeRange(request) {
    if (!request?.scheduledDate || typeof request?.scheduledHour !== 'number' || typeof request?.scheduledMinute !== 'number') {
        return 'Not scheduled';
    }
    return `${getSubmittedDateLabel(request.scheduledDate)} ${formatTimeChip(request.scheduledHour, request.scheduledMinute)}`;
}

function getRequestPriority(request) {
    const submitted = request?.submittedAt ? new Date(request.submittedAt).getTime() : Date.now();
    const ageHours = Math.max(0, (Date.now() - submitted) / 3600000);
    if (!request?.scheduledAtIso && ageHours > 24) return 'High';
    if (!request?.scheduledAtIso) return 'Medium';
    return 'Low';
}

function summarizeItems(itemValues) {
    const entries = Object.entries(itemValues || {})
        .filter(([key, value]) => key.endsWith('_qty') && value !== '' && value !== null && value !== undefined && Number(value) > 0)
        .slice(0, 5);
    return entries.map(([key, value]) => {
        const row = PICKING_CARD_ROWS.find(item => key.startsWith(`${item.id}_`));
        const side = key.includes('_left_') ? 'left' : key.includes('_middle_') ? 'middle' : 'right';
        const label = row?.[side]?.filter(Boolean).join(' ') || 'Material item';
        return { key, label, qty: value };
    });
}

function getProjectLocation(builders, request) {
    const builder = (builders || []).find(item => item.id === request?.builderId || item.name === request?.builderName);
    const project = (builder?.projects || []).find(item => item.id === request?.projectId || item.name === request?.projectName);
    return project?.siteLocation || request?.projectName || '';
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

function mapArchivedRequestToOrder(request) {
    return {
        id: null,
        builderId: request?.builderId || '',
        builderName: request?.builderName || '',
        projectId: request?.projectId || '',
        projectName: request?.projectName || '',
        requestedByUserId: request?.requestedByUserId || null,
        requestedByName: request?.requestedByName || '',
        orderDate: request?.orderDate || todayDate(),
        notes: request?.notes || '',
        itemValues: request?.itemValues || {}
    };
}


function archivedRequestMatchesOrder(request, order) {
    if (!request || !order) return false;
    if (request.sourceOrderId && request.sourceOrderId === order.id) return true;

    const sameBuilder = (request.builderName || '').trim().toLowerCase() === (order.builderName || '').trim().toLowerCase();
    const sameProject = (request.projectName || '').trim().toLowerCase() === (order.projectName || '').trim().toLowerCase();
    const sameDate = (request.orderDate || '') === (order.orderDate || '');
    const sameDetails = (request.details || '').trim().toLowerCase() === ((order.itemValues?.__details) || '').trim().toLowerCase();
    return sameBuilder && sameProject && sameDate && sameDetails;
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

function ItemCell({ entry, value, onChange, readOnly = false }) {
    const [label, spec] = entry;
    const empty = !label && !spec;
    const normalizedLabel = (label || '').trim().toUpperCase();
    const isSectionHeader = SECTION_HEADER_LABELS.has(normalizedLabel) && !spec;

    return (
        <>
            <td className={`picking-item-label ${empty ? 'is-empty' : ''} ${isSectionHeader ? 'is-section-header' : ''}`}>{label || ''}</td>
            <td className={`picking-item-spec ${empty ? 'is-empty' : ''} ${isSectionHeader ? 'is-section-header' : ''}`}>{spec || ''}</td>
            <td className={`picking-item-qty ${empty ? 'is-empty' : ''} ${isSectionHeader ? 'is-section-header' : ''}`}>
                {isSectionHeader ? (
                    <span className="picking-inline-qty-label">QTY'S</span>
                ) : !empty ? (
                    readOnly ? (
                        <span className="picking-item-qty-static">{value ?? ''}</span>
                    ) : (
                        <input
                            type="number"
                            min="0"
                            value={value ?? ''}
                            onChange={(e) => onChange(e.target.value)}
                        />
                    )
                ) : null}
            </td>
        </>
    );
}

export default function MaterialOrderingPage({ user, view = 'form', onNavigate }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [builders, setBuilders] = useState([]);
    const [orders, setOrders] = useState([]);
    const [archivedRequests, setArchivedRequests] = useState([]);
    const [selectedOrderId, setSelectedOrderId] = useState('new');
    const [selectedArchivedRequest, setSelectedArchivedRequest] = useState(null);
    const [openingArchivedPdfId, setOpeningArchivedPdfId] = useState(null);
    const [form, setForm] = useState(() => createBlankOrder(user));
    const [requestSearch, setRequestSearch] = useState('');
    const [requestStatusFilter, setRequestStatusFilter] = useState('all');
    const [requestSortOrder, setRequestSortOrder] = useState('newest');
    const [requestUpdatedAt, setRequestUpdatedAt] = useState(() => new Date().toISOString());
    const [selectedRequestId, setSelectedRequestId] = useState('');
    const [managementScheduleDate, setManagementScheduleDate] = useState(todayDate());
    const [managementScheduleHour, setManagementScheduleHour] = useState(9);
    const [managementScheduleMinute, setManagementScheduleMinute] = useState(30);
    const [managementScheduleTruckId, setManagementScheduleTruckId] = useState(TRUCK_LANES[0]?.id || 'truck-1');
    const [managementScheduleSaving, setManagementScheduleSaving] = useState(false);

    const selectedBuilder = useMemo(
        () => builders.find((builder) => builder.id === form.builderId) || null,
        [builders, form.builderId]
    );

    const availableProjects = useMemo(
        () => (selectedBuilder?.projects || []).filter((project) => !project.archived),
        [selectedBuilder]
    );

    const dayLabel = useMemo(() => formatDayLabel(form.orderDate), [form.orderDate]);

    const visibleOrders = useMemo(
        () => orders.filter((order) => !archivedRequests.some((request) => archivedRequestMatchesOrder(request, order))),
        [orders, archivedRequests]
    );

    useEffect(() => {
        if (selectedRequestId && [...visibleOrders, ...archivedRequests].some(request => request.id === selectedRequestId)) {
            return;
        }
        setSelectedRequestId(visibleOrders[0]?.id || archivedRequests[0]?.id || '');
    }, [archivedRequests, selectedRequestId, visibleOrders]);

    useEffect(() => {
        const selected = [...visibleOrders, ...archivedRequests].find(request => request.id === selectedRequestId);
        if (!selected) return;
        setManagementScheduleDate(selected.scheduledDate || todayDate());
        setManagementScheduleHour(typeof selected.scheduledHour === 'number' ? selected.scheduledHour : 9);
        setManagementScheduleMinute(typeof selected.scheduledMinute === 'number' ? selected.scheduledMinute : 30);
        setManagementScheduleTruckId(selected.scheduledTruckId || selected.truckId || TRUCK_LANES[0]?.id || 'truck-1');
    }, [archivedRequests, selectedRequestId, visibleOrders]);

    const isFormOnlyView = view === 'form';
    const isActiveQueueView = view === 'active';
    const isArchivedQueueView = view === 'archived';
    const isArchivedView = isArchivedQueueView && Boolean(selectedArchivedRequest);

    const totalQuantity = useMemo(
        () => Object.entries(form.itemValues || {}).reduce((sum, [key, value]) => {
            if (String(key).startsWith('__')) return sum;
            return sum + Math.max(0, Number(value || 0));
        }, 0),
        [form.itemValues]
    );

    const loadPageData = React.useCallback(() => {
        let active = true;

        Promise.allSettled([
            safetyProjectsAPI.getBuilders({ includeArchived: true }),
            materialOrderRequestsAPI.listActiveRequests(),
            materialOrderRequestsAPI.listArchivedRequests()
        ])
            .then(([buildersResult, activeResult, archivedResult]) => {
                if (!active) return;

                setBuilders(buildersResult.status === 'fulfilled' ? buildersResult.value : []);
                setOrders(activeResult.status === 'fulfilled' ? activeResult.value : []);
                setArchivedRequests(archivedResult.status === 'fulfilled' ? archivedResult.value : []);

                if (buildersResult.status === 'rejected') {
                    setError(buildersResult.reason?.message || 'Failed to load builders');
                    return;
                }
                if (activeResult.status === 'rejected') {
                    setError(activeResult.reason?.message || 'Failed to load scheduled orders.');
                    return;
                }
                if (archivedResult.status === 'rejected') {
                    setError(archivedResult.reason?.message || 'Failed to load archived orders.');
                } else {
                    setError('');
                }
                setRequestUpdatedAt(new Date().toISOString());
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [user]);

    useEffect(() => {
        setLoading(true);
        const dispose = loadPageData();

        const intervalId = window.setInterval(() => loadPageData(), 30000);
        const handleFocus = () => loadPageData();
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadPageData();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            dispose?.();
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [loadPageData]);

    const setStartState = () => {
        setSelectedOrderId('new');
        setSelectedArchivedRequest(null);
        setForm(createBlankOrder(user));
    };

    const selectOrder = (order) => {
        setSelectedArchivedRequest(null);
        setSelectedOrderId(order.id);
        setForm(normalizeOrder(order, user));
        setError('');
    };

    const selectArchivedRequest = async (request) => {
        setSaving(true);
        setError('');
        try {
            const fullRequest = await materialOrderRequestsAPI.getRequest(request.id);
            const resolvedRequest = fullRequest || request;
            setSelectedArchivedRequest(resolvedRequest);
            setSelectedOrderId(`archived:${request.id}`);
            setForm(normalizeOrder(mapArchivedRequestToOrder(resolvedRequest), user));
        } catch (err) {
            setError(err.message || 'Failed to load archived material request');
        } finally {
            setSaving(false);
        }
    };

    const startNewOrder = () => {
        setStartState();
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

    const submitOrder = async () => {
        if (!form.builderName || !form.projectName || !form.requestedByName || !form.orderDate) {
            setError('Builder, jobsite, requester, and date are required.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await materialOrderRequestsAPI.submitRequest(form);
            setForm(createBlankOrder(user));
        } catch (err) {
            setError(err.message || 'Failed to submit order request');
        } finally {
            setSaving(false);
        }
    };

    const openArchivedPdf = async (request, event) => {
        if (event) {
            event.stopPropagation();
        }
        if (!request?.pdfPath) return;
        setOpeningArchivedPdfId(request.id);
        setError('');
        try {
            const url = await materialOrderRequestsAPI.getPdfUrl(request);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(err.message || 'Failed to open archived PDF');
        } finally {
            setOpeningArchivedPdfId(null);
        }
    };

    const saveManagementSchedule = async (request) => {
        if (!request?.id) return;
        const truck = TRUCK_LANES.find(lane => lane.id === managementScheduleTruckId) || TRUCK_LANES[0];
        setManagementScheduleSaving(true);
        setError('');
        try {
            await materialOrderRequestsAPI.setSchedule(request.id, {
                date: managementScheduleDate,
                hour: Number(managementScheduleHour),
                minute: Number(managementScheduleMinute),
                truckId: truck?.id || managementScheduleTruckId,
                truckLabel: truck?.rego || truck?.label || managementScheduleTruckId,
            });
            await loadPageData();
            setRequestUpdatedAt(new Date().toISOString());
        } catch (err) {
            setError(err.message || 'Failed to save schedule.');
        } finally {
            setManagementScheduleSaving(false);
        }
    };

    const renderPickingSheet = () => (
        <>
            {isArchivedView ? (
                <div className="material-ordering-archive-banner">
                    <div>
                        <strong>Viewing archived transport request</strong>
                        <span>
                            Scheduled for {formatDateTime(selectedArchivedRequest?.scheduledAtIso || selectedArchivedRequest?.archivedAt || selectedArchivedRequest?.submittedAt)}
                        </span>
                    </div>
                    {selectedArchivedRequest?.pdfPath ? (
                        <button
                            type="button"
                            className="module-secondary-btn"
                            onClick={(event) => openArchivedPdf(selectedArchivedRequest, event)}
                            disabled={openingArchivedPdfId === selectedArchivedRequest.id}
                        >
                            {openingArchivedPdfId === selectedArchivedRequest.id ? 'Opening PDF...' : 'Open PDF'}
                        </button>
                    ) : null}
                </div>
            ) : null}

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
                            control={isArchivedView ? (
                                <span className="picking-static-value">{form.builderName}</span>
                            ) : (
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
                            control={isArchivedView ? (
                                <span className="picking-static-value">{form.projectName}</span>
                            ) : (
                                <select value={form.projectId} onChange={(e) => handleProjectChange(e.target.value)} disabled={!selectedBuilder}>
                                    <option value="">{selectedBuilder ? 'Select jobsite' : 'Select builder first'}</option>
                                    {availableProjects.map((project) => (
                                        <option key={project.id} value={project.id}>{project.name}</option>
                                    ))}
                                </select>
                            )}
                            sideLabel="TIME"
                            sideValue={isArchivedView ? (
                                <span className="picking-static-value">{form.itemValues.__time || ''}</span>
                            ) : (
                                <input
                                    value={form.itemValues.__time || ''}
                                    onChange={(e) => handleQuantityChange('__time', e.target.value)}
                                    placeholder="7am"
                                />
                            )}
                        />
                        <MetadataRow
                            label="SCAFFOLD TYPE :"
                            control={isArchivedView ? (
                                <span className="picking-static-value">{form.itemValues.__scaffoldingSystem || ''}</span>
                            ) : (
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
                            control={isArchivedView ? (
                                <span className="picking-static-value">{form.itemValues.__details || ''}</span>
                            ) : (
                                <input
                                    value={form.itemValues.__details || ''}
                                    onChange={(e) => handleQuantityChange('__details', e.target.value)}
                                    placeholder="Enter picking card details"
                                />
                            )}
                            sideLabel="DATE"
                            sideValue={isArchivedView ? (
                                <span className="picking-static-value">{form.orderDate}</span>
                            ) : (
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
                                    readOnly={isArchivedView}
                                />
                                <ItemCell
                                    entry={row.middle}
                                    value={form.itemValues[quantityKey(row.id, 'middle')]}
                                    onChange={(value) => handleQuantityChange(quantityKey(row.id, 'middle'), value)}
                                    readOnly={isArchivedView}
                                />
                                <ItemCell
                                    entry={row.right}
                                    value={form.itemValues[quantityKey(row.id, 'right')]}
                                    onChange={(value) => handleQuantityChange(quantityKey(row.id, 'right'), value)}
                                    readOnly={isArchivedView}
                                />
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {error ? <div className="module-error">{error}</div> : null}

            <div className="material-order-footer material-order-footer-ios">
                <div className="material-order-summary">
                    <span>Total Quantity</span>
                    <strong>{totalQuantity}</strong>
                </div>
                <div className="material-order-footer-actions">
                    <button type="button" className="ts2-secondary-btn" onClick={startNewOrder}>
                        + New
                    </button>
                    <button type="button" className="ts2-primary-btn solid" onClick={submitOrder} disabled={saving}>
                        {saving ? 'Submitting...' : 'Submit to ESS Transport'}
                    </button>
                </div>
            </div>
        </>
    );

    const renderListTable = () => {
        const isActive = isActiveQueueView;
        const baseRows = isActive ? visibleOrders : archivedRequests;
        const filteredRows = [...baseRows]
            .filter((request) => {
                const query = requestSearch.trim().toLowerCase();
                const matchesQuery = !query || [
                    request.builderName,
                    request.projectName,
                    request.requestedByName,
                    request.scaffoldingSystem,
                    request.details,
                    getProjectLocation(builders, request),
                ].some(value => String(value || '').toLowerCase().includes(query));
                if (!matchesQuery) return false;
                if (requestStatusFilter === 'scheduled') {
                    return Boolean(request.scheduledAtIso || (request.scheduledDate && typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number'));
                }
                if (requestStatusFilter === 'pending') {
                    return !request.scheduledAtIso && !(request.scheduledDate && typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number');
                }
                return true;
            })
            .sort((left, right) => {
                const leftValue = requestSortOrder === 'oldest' ? String(left.submittedAt || '') : String(right.submittedAt || '');
                const rightValue = requestSortOrder === 'oldest' ? String(right.submittedAt || '') : String(left.submittedAt || '');
                return leftValue.localeCompare(rightValue);
            });

        const selectedRequest = filteredRows.find(request => request.id === selectedRequestId) || filteredRows[0] || null;
        const selectedSiteLocation = selectedRequest ? getProjectLocation(builders, selectedRequest) : '';
        const selectedItems = summarizeItems(selectedRequest?.itemValues);
        const activeCount = visibleOrders.length;
        const scheduledCount = visibleOrders.filter(request => request.scheduledAtIso || request.scheduledDate).length;
        const pendingCount = visibleOrders.filter(request => !request.scheduledAtIso && !request.scheduledDate).length;

        return (
            <div className="ts2-page material-ordering-transport-page transport-management-redesign">
                <div className="ts2-header material-ordering-transport-header material-ordering-transport-header-queue">
                    <div className="ts2-header-left material-ordering-transport-header-copy material-ordering-transport-header-copy-row">
                        <div>
                            <h1>{isActive ? 'Schedule Management' : 'Archived Orders'}</h1>
                        </div>
                    </div>
                    <div className="ts2-header-actions">
                        <button type="button" className="ts2-secondary-btn" onClick={() => onNavigate?.('transport-dashboard')}>Home</button>
                        <button type="button" className="ts2-secondary-btn" onClick={() => { setLoading(true); loadPageData(); }}>Refresh</button>
                    </div>
                </div>

                <div className="transport-management-layout">
                    <section className="transport-management-main">
                        <div className="transport-management-tabs">
                            <button type="button" className={isActive && requestStatusFilter === 'all' ? 'active' : ''} onClick={() => { setRequestStatusFilter('all'); onNavigate?.('material-ordering-active'); }}>Active <span>{activeCount}</span></button>
                            <button type="button" className={isActive && requestStatusFilter === 'scheduled' ? 'active' : ''} onClick={() => { setRequestStatusFilter('scheduled'); onNavigate?.('material-ordering-active'); }}>Scheduled <span>{scheduledCount}</span></button>
                            <button type="button" className={!isActive ? 'active' : ''} onClick={() => onNavigate?.('material-ordering-archived')}>Archived <span>{archivedRequests.length}</span></button>
                        </div>

                        <div className="material-ordering-queue-tools transport-management-tools">
                            <label className="material-ordering-queue-search">
                                <span>Search</span>
                                <input
                                    type="text"
                                    value={requestSearch}
                                    onChange={(event) => setRequestSearch(event.target.value)}
                                    placeholder="Search orders, builders, projects..."
                                />
                            </label>
                            <div className="material-ordering-queue-chip-row">
                                <button type="button" className="material-ordering-queue-chip" onClick={() => setRequestStatusFilter(current => current === 'all' ? 'scheduled' : current === 'scheduled' ? 'pending' : 'all')}>
                                    {requestStatusFilter === 'all' ? `All Statuses (${activeCount})` : requestStatusFilter === 'scheduled' ? `Scheduled (${scheduledCount})` : `Pending (${pendingCount})`}
                                </button>
                                <button type="button" className="material-ordering-queue-chip" onClick={() => setRequestSortOrder(current => current === 'newest' ? 'oldest' : 'newest')}>
                                    {requestSortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                                </button>
                            </div>
                        </div>

                        {error ? <div className="module-error material-ordering-inline-error">{error}</div> : null}

                        {filteredRows.length === 0 ? (
                            <div className="transport-placeholder-card material-ordering-transport-empty">
                                <span className="transport-placeholder-eyebrow">ESS Transport</span>
                                <h2>{isActive ? 'No active orders' : 'No archived orders'}</h2>
                                <p>{isActive ? 'Submitted transport requests will appear here as soon as they enter the active queue.' : 'Completed transport requests will appear here once they have rolled out of the active queue.'}</p>
                            </div>
                        ) : (
                            <div className="transport-management-table-wrap">
                                <table className="transport-management-table">
                                    <thead>
                                        <tr>
                                            <th>Order ID</th>
                                            <th>Builder / Project</th>
                                            <th>Requested By</th>
                                            <th>System</th>
                                            <th>Submitted</th>
                                            <th>Truck</th>
                                            <th>Scheduled Time</th>
                                            <th>Status</th>
                                            <th>PDF</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRows.map((request) => {
                                            const isSelected = selectedRequest?.id === request.id;
                                            const priority = getRequestPriority(request);
                                            return (
                                                <tr key={request.id} className={isSelected ? 'selected' : ''} onClick={() => setSelectedRequestId(request.id)}>
                                                    <td><strong>{request.id}</strong><span className={`transport-priority priority-${priority.toLowerCase()}`}>Priority: {priority}</span></td>
                                                    <td><strong>{request.builderName || 'Material Order'}</strong><span>{request.projectName || getProjectLocation(builders, request) || 'Awaiting project'}</span></td>
                                                    <td>{request.requestedByName || 'Unassigned'}</td>
                                                    <td>{request.scaffoldingSystem || 'Kwikstage'}</td>
                                                    <td><strong>{getSubmittedDateLabel(request.submittedAt)}</strong><span>{getSubmittedTimeLabel(request.submittedAt)}</span></td>
                                                    <td>{request.scheduledTruckLabel || request.truckLabel || '-'}</td>
                                                    <td>{getScheduledTimeRange(request)}</td>
                                                    <td><span className={`transport-status-pill status-${request.deliveryStatus || 'pending'}`}>{getDeliveryStatusLabel(request.deliveryStatus)}</span></td>
                                                    <td><button type="button" className="transport-management-pdf-btn" disabled={!request.pdfPath} onClick={(event) => openArchivedPdf(request, event)}>PDF</button></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <div className="transport-management-table-foot">
                                    <span>Last updated: {formatLastUpdated(requestUpdatedAt)}</span>
                                    <span>1 - {filteredRows.length} of {filteredRows.length}</span>
                                </div>
                            </div>
                        )}
                    </section>

                    <aside className="transport-management-detail">
                        {selectedRequest ? (
                            <>
                                <div className="transport-management-detail-head">
                                    <div><span>Order</span><h2>{selectedRequest.id}</h2></div>
                                    <button type="button" onClick={() => setSelectedRequestId('')} aria-label="Close detail">x</button>
                                </div>
                                <section className="transport-management-panel">
                                    <div className="transport-management-panel-title">
                                        <strong>Picking Card Summary</strong>
                                        <button type="button" disabled={!selectedRequest.pdfPath} onClick={(event) => openArchivedPdf(selectedRequest, event)}>Download PDF</button>
                                    </div>
                                    <dl className="transport-management-summary-grid">
                                        <div><dt>Builder</dt><dd>{selectedRequest.builderName || '-'}</dd></div>
                                        <div><dt>Project</dt><dd>{selectedRequest.projectName || '-'}</dd></div>
                                        <div><dt>Delivery Address</dt><dd>{selectedSiteLocation || 'No site location saved'}</dd></div>
                                        <div><dt>Requested By</dt><dd>{selectedRequest.requestedByName || '-'}</dd></div>
                                        <div><dt>Scaffold System</dt><dd>{selectedRequest.scaffoldingSystem || 'Kwikstage'}</dd></div>
                                        <div><dt>Submitted</dt><dd>{formatDateTime(selectedRequest.submittedAt)}</dd></div>
                                    </dl>
                                    <div className="transport-management-items">
                                        <div className="transport-management-items-head"><span>Item Description</span><span>Qty</span></div>
                                        {selectedItems.length > 0 ? selectedItems.map(item => <div key={item.key}><span>{item.label}</span><strong>{item.qty}</strong></div>) : <p>No quantity lines were entered on this request.</p>}
                                    </div>
                                    <label className="transport-management-notes"><span>Notes</span><textarea readOnly value={selectedRequest.notes || selectedRequest.details || 'No notes supplied.'} /></label>
                                </section>

                                <section className="transport-management-panel">
                                    <strong>Assign Truck</strong>
                                    <div className="transport-management-truck-tabs">
                                        {TRUCK_LANES.map(lane => <button key={lane.id} type="button" className={managementScheduleTruckId === lane.id ? 'active' : ''} onClick={() => setManagementScheduleTruckId(lane.id)}>{lane.rego}</button>)}
                                    </div>
                                    <div className="transport-management-schedule-grid">
                                        <label><span>Date</span><input type="date" value={managementScheduleDate} onChange={(event) => setManagementScheduleDate(event.target.value)} /></label>
                                        <label><span>Hour</span><select value={managementScheduleHour} onChange={(event) => setManagementScheduleHour(Number(event.target.value))}>{Array.from({ length: 12 }).map((_, index) => <option key={index} value={6 + index}>{formatTimeChip(6 + index, 0)}</option>)}</select></label>
                                        <label><span>Minute</span><select value={managementScheduleMinute} onChange={(event) => setManagementScheduleMinute(Number(event.target.value))}>{[0, 15, 30, 45].map(minute => <option key={minute} value={minute}>{String(minute).padStart(2, '0')}</option>)}</select></label>
                                    </div>
                                    <div className="transport-management-route-card">
                                        <div><span>From</span><strong>Ingleburn Yard</strong></div>
                                        <div><span>To</span><strong>{selectedRequest.projectName || 'Selected project'}</strong></div>
                                        <div><span>Planned Window</span><strong>{formatTimeChip(Number(managementScheduleHour), Number(managementScheduleMinute))}</strong></div>
                                    </div>
                                    <div className="transport-management-validation">
                                        {!selectedSiteLocation ? <span>Site location is missing, route estimate may be limited.</span> : null}
                                        {!selectedRequest.scheduledAtIso ? <span>Delivery has not been placed on the schedule yet.</span> : null}
                                    </div>
                                    <button type="button" className="transport-management-save" disabled={managementScheduleSaving || !isActive} onClick={() => saveManagementSchedule(selectedRequest)}>{managementScheduleSaving ? 'Saving...' : 'Save Schedule'}</button>
                                    <button type="button" className="transport-management-secondary-action" onClick={() => onNavigate?.('truck-schedule')}>View Dynamic Schedule</button>
                                </section>
                            </>
                        ) : <div className="transport-management-empty-detail">Select an order to review schedule details.</div>}
                    </aside>
                </div>
            </div>
        );

        return (
            <div className="ts2-page material-ordering-transport-page">
                <div className="ts2-header material-ordering-transport-header material-ordering-transport-header-queue">
                    <div className="ts2-header-left material-ordering-transport-header-copy material-ordering-transport-header-copy-row">
                        <button type="button" className="ts2-header-icon-btn" onClick={() => onNavigate?.('truck-schedule')} aria-label="Back to Truck Schedule">‹</button>
                        <div>
                            <h1>{isActive ? 'Schedule Management' : 'Archived Orders'}</h1>
                        </div>
                    </div>
                    <div className="ts2-header-actions">
                        <button type="button" className="ts2-secondary-btn" onClick={() => onNavigate?.('transport-dashboard')}>Home</button>
                        <button type="button" className="ts2-secondary-btn" onClick={() => { setLoading(true); loadPageData(); }}>Refresh</button>
                    </div>
                </div>

                <div className="material-ordering-queue-tools">
                    <label className="material-ordering-queue-search">
                        <span>⌕</span>
                        <input
                            type="text"
                            value={requestSearch}
                            onChange={(event) => setRequestSearch(event.target.value)}
                            placeholder="Search by PC No., Client, Project..."
                        />
                    </label>
                    <div className="material-ordering-queue-chip-row">
                        <button type="button" className="material-ordering-queue-chip" onClick={() => setRequestStatusFilter(current => current === 'all' ? 'scheduled' : current === 'scheduled' ? 'pending' : 'all')}>
                            Filters: {requestStatusFilter === 'all' ? 'All' : requestStatusFilter === 'scheduled' ? 'Scheduled' : 'Pending'}
                        </button>
                        <button type="button" className="material-ordering-queue-chip" onClick={() => setRequestSortOrder(current => current === 'newest' ? 'oldest' : 'newest')}>
                            {requestSortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                        </button>
                    </div>
                    <div className="material-ordering-queue-meta">
                        <span>Total {filteredRows.length} {filteredRows.length === 1 ? 'picking card' : 'picking cards'}</span>
                        <span>Last updated: {formatLastUpdated(requestUpdatedAt)}</span>
                    </div>
                </div>

                {error ? <div className="module-error material-ordering-inline-error">{error}</div> : null}

                {filteredRows.length === 0 ? (
                    <div className="transport-placeholder-card material-ordering-transport-empty">
                        <span className="transport-placeholder-eyebrow">ESS Transport</span>
                        <h2>{isActive ? 'No scheduled orders' : 'No archived orders'}</h2>
                        <p>{isActive ? 'Submitted transport requests will appear here as soon as they enter the active queue.' : 'Completed transport requests will appear here once they have rolled out of the active queue.'}</p>
                    </div>
                ) : (
                    <div className="material-ordering-request-stack material-ordering-request-stack-ios">
                        {filteredRows.map((request) => {
                            const isScheduled = Boolean(request.scheduledAtIso || (request.scheduledDate && typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number'));
                            const siteLocation = getProjectLocation(builders, request);
                            return (
                                <article key={request.id} className="material-ordering-request-card material-ordering-request-card-ios material-ordering-request-card-ios-stacked">
                                    <div className="material-ordering-request-ios-top">
                                        <div className="material-ordering-request-ios-badges">
                                            <span className={"material-ordering-request-chip material-ordering-request-chip-scheduled" + (isScheduled ? ' active' : '')}>{isScheduled ? formatSchedulePill(request) : 'Not Scheduled'}</span>
                                            {request.scaffoldingSystem ? <span className="material-ordering-request-chip material-ordering-request-chip-scaffold">{request.scaffoldingSystem}</span> : null}
                                        </div>
                                        <button type="button" className="material-ordering-request-delete" onClick={() => window.alert('Delete request support will be added here in the web transport suite.')}>🗑</button>
                                    </div>

                                    <div className="material-ordering-request-ios-brief">
                                        <span className="material-ordering-request-ios-brief-icon">🧰</span>
                                        <strong>{request.builderName}</strong>
                                    </div>

                                    <div className="material-ordering-request-ios-project">
                                        {siteLocation || request.projectName}
                                    </div>

                                    <div className="material-ordering-request-ios-meta-row">
                                        <span className="material-ordering-request-ios-meta-icon">🗓</span>
                                        <span className="material-ordering-request-ios-meta-text">{formatDateTime(request.submittedAt)}</span>
                                    </div>
                                    <div className="material-ordering-request-ios-meta-row">
                                        <span className="material-ordering-request-ios-meta-icon">👤</span>
                                        <span className="material-ordering-request-ios-meta-text">Requested by: {request.requestedByName || '—'}</span>
                                    </div>
                                    <div className="material-ordering-request-ios-meta-row">
                                        <span className="material-ordering-request-ios-meta-icon">ⓘ</span>
                                        <span className="material-ordering-request-ios-meta-text">{request.details || request.scaffoldingSystem || '—'}</span>
                                    </div>

                                    <div className="material-ordering-request-ios-footer">
                                        <button type="button" className="material-ordering-request-ios-action" onClick={() => onNavigate?.('truck-schedule')}>
                                            <span>{isScheduled ? 'Edit Schedule' : 'Schedule Order'}</span>
                                        </button>
                                        <span className="material-ordering-request-ios-chevron">›</span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="ts2-page material-ordering-transport-page">
                <div className="transport-placeholder-card material-ordering-transport-empty">
                    <span className="transport-placeholder-eyebrow">ESS Transport</span>
                    <h2>Loading material ordering…</h2>
                    <p>The transport workspace is loading the current picking card data.</p>
                </div>
            </div>
        );
    }

    if (isActiveQueueView || isArchivedQueueView) {
        return renderListTable();
    }

    return (
        <div className="ts2-page material-ordering-transport-page">
            <div className="ts2-header material-ordering-transport-header">
                <div className="ts2-header-left material-ordering-transport-header-copy material-ordering-transport-header-copy-row">
                    <button type="button" className="ts2-header-icon-btn" onClick={() => onNavigate?.('truck-schedule')} aria-label="Back to Truck Schedule">‹</button>
                    <div>
                        <h1>Material Ordering</h1>
                    </div>
                </div>
                <div className="ts2-header-actions">
                    <button type="button" className="ts2-secondary-btn" onClick={() => onNavigate?.('transport-dashboard')}>Home</button>
                    <button type="button" className="ts2-secondary-btn" onClick={() => onNavigate?.('material-ordering-active')}>Order Requests</button>
                </div>
            </div>

            <section className="material-ordering-transport-canvas material-ordering-transport-canvas-ios">
                {renderPickingSheet()}
            </section>
        </div>
    );
}
