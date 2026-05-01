import React, { useEffect, useMemo, useState } from 'react';
import { materialOrdersAPI, materialOrderRequestsAPI, safetyProjectsAPI } from '../services/api';
import { formatTimeChip } from './transport/transportUtils';

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

function isSecondaryRouteRequest(request) {
    return request?.routeType === 'secondary_route' && Boolean(request?.secondaryRoute);
}

function getSecondaryRouteReasonLabel(reason) {
    if (reason === 'secondary_drop_off') return 'Secondary material drop off';
    if (reason === 'material_pick_up') return 'Material pick-up';
    if (reason === 'yard_collection') return 'Yard collection';
    if (reason === 'other') return 'Other route task';
    return 'Secondary route';
}

function getSecondaryRouteMinutes(route) {
    const travelMinutes = Math.max(0, Math.round((route?.travelDurationSeconds || 0) / 60));
    const serviceMinutes = Math.max(0, Number(route?.serviceMinutes) || 0);
    const returnMinutes = Math.max(0, Math.round((route?.returnDurationSeconds || 0) / 60));
    return {
        travelMinutes,
        serviceMinutes,
        returnMinutes,
        totalMinutes: travelMinutes + serviceMinutes + returnMinutes,
    };
}

function getRequestFilterDate(request) {
    const value = request?.scheduledDate || request?.scheduledAtIso || request?.submittedAt || request?.orderDate || '';
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
        return String(value).slice(0, 10);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function getRequestTruckKey(request) {
    return request?.scheduledTruckId || request?.truckId || request?.scheduledTruckLabel || request?.truckLabel || '';
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

function getProjectLocation(builders, request) {
    if (isSecondaryRouteRequest(request)) {
        return request.secondaryRoute?.destination || '';
    }
    const builder = (builders || []).find(item => item.id === request?.builderId || item.name === request?.builderName);
    const project = (builder?.projects || []).find(item => item.id === request?.projectId || item.name === request?.projectName);
    return project?.siteLocation || request?.projectName || '';
}

function appendSummaryItem(grouped, description, qty, uom = 'ea') {
    const numericQty = Number(qty || 0);
    const cleanDescription = String(description || '').trim();
    if (!cleanDescription || !Number.isFinite(numericQty) || numericQty <= 0) {
        return;
    }
    const cleanUom = String(uom || 'ea').trim() || 'ea';
    const existing = grouped.get(cleanDescription) || { description: cleanDescription, qty: 0, uom: cleanUom };
    existing.qty += numericQty;
    existing.uom = existing.uom || cleanUom;
    grouped.set(cleanDescription, existing);
}

function summarizeItems(request) {
    const grouped = new Map();
    const itemValues = request?.itemValues && typeof request.itemValues === 'object'
        ? request.itemValues
        : request?.item_values && typeof request.item_values === 'object'
            ? request.item_values
            : {};

    PICKING_CARD_ROWS.forEach((row) => {
        [['left', row.left], ['middle', row.middle], ['right', row.right]].forEach(([side, entry]) => {
            const quantity = Number(itemValues?.[quantityKey(row.id, side)] || 0);
            if (!quantity) return;

            const [label, spec] = entry;
            const description = [label, spec].map(value => String(value || '').trim()).filter(Boolean).join(' ');
            appendSummaryItem(grouped, description, quantity, 'ea');
        });
    });

    const arraySources = [
        request?.items,
        request?.materials,
        request?.materialsList,
        request?.materialItems,
        request?.lineItems,
        request?.pickingItems,
        itemValues?.items,
        itemValues?.materials,
        itemValues?.lineItems,
        itemValues?.pickingItems,
    ];

    arraySources.forEach((source) => {
        if (!Array.isArray(source)) return;
        source.forEach((item) => {
            if (!item || typeof item !== 'object') return;
            const description = item.description || item.name || item.label || item.itemName || item.title || item.material;
            const qty = item.qty ?? item.quantity ?? item.count ?? item.amount ?? item.value;
            const uom = item.uom || item.unit || item.units;
            appendSummaryItem(grouped, description, qty, uom);
        });
    });

    return Array.from(grouped.values());
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

function PdfTableIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6.75 3.5h7.1l3.4 3.4v13.6H6.75z" />
            <path d="M13.75 3.75v3.4h3.4" />
            <path d="M8.65 16.55v-4.1h1.4c.95 0 1.55.52 1.55 1.35 0 .85-.6 1.38-1.55 1.38h-.45v1.37" />
            <path d="M12.65 16.55v-4.1h1.28c1.18 0 1.95.78 1.95 2.05s-.77 2.05-1.95 2.05z" />
            <path d="M17.1 16.55v-4.1h2.3" />
            <path d="M17.1 14.35h1.85" />
        </svg>
    );
}

function MoreVerticalIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
        </svg>
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
    const [requestSystemFilter, setRequestSystemFilter] = useState('all');
    const [requestSortOrder, setRequestSortOrder] = useState('newest');
    const [requestFiltersOpen, setRequestFiltersOpen] = useState(false);
    const [requestDateFilter, setRequestDateFilter] = useState('');
    const [requestTruckFilter, setRequestTruckFilter] = useState('all');
    const [requestUpdatedAt, setRequestUpdatedAt] = useState(() => new Date().toISOString());
    const [selectedRequestId, setSelectedRequestId] = useState('');
    const [selectedQueueIds, setSelectedQueueIds] = useState([]);
    const [selectedRequestDetail, setSelectedRequestDetail] = useState(null);

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

    const queueRows = useMemo(() => {
        const baseRows = isActiveQueueView ? visibleOrders : archivedRequests;
        return [...baseRows]
            .filter((request) => {
                const query = requestSearch.trim().toLowerCase();
                const matchesQuery = !query || [
                    request.builderName,
                    request.projectName,
                    request.requestedByName,
                    request.scaffoldingSystem,
                    request.details,
                    request.secondaryRoute?.startingLocation,
                    request.secondaryRoute?.destination,
                    getSecondaryRouteReasonLabel(request.secondaryRoute?.reason),
                    getProjectLocation(builders, request),
                ].some(value => String(value || '').toLowerCase().includes(query));
                if (!matchesQuery) return false;
                if (requestDateFilter && getRequestFilterDate(request) !== requestDateFilter) {
                    return false;
                }
                if (requestSystemFilter !== 'all' && String(request.scaffoldingSystem || '').toLowerCase() !== requestSystemFilter) {
                    return false;
                }
                if (requestTruckFilter !== 'all' && getRequestTruckKey(request) !== requestTruckFilter) {
                    return false;
                }
                if (requestStatusFilter === 'scheduled') {
                    return Boolean(request.scheduledAtIso || (request.scheduledDate && typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number'));
                }
                if (requestStatusFilter === 'pending') {
                    return !request.scheduledAtIso && !(request.scheduledDate && typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number');
                }
                if (requestStatusFilter !== 'all') {
                    return (request.deliveryStatus || 'pending') === requestStatusFilter;
                }
                return true;
            })
            .sort((left, right) => {
                const leftValue = requestSortOrder === 'oldest' ? String(left.submittedAt || '') : String(right.submittedAt || '');
                const rightValue = requestSortOrder === 'oldest' ? String(right.submittedAt || '') : String(left.submittedAt || '');
                return leftValue.localeCompare(rightValue);
            });
    }, [archivedRequests, builders, isActiveQueueView, requestDateFilter, requestSearch, requestSortOrder, requestStatusFilter, requestSystemFilter, requestTruckFilter, visibleOrders]);

    const requestTruckOptions = useMemo(() => {
        const rows = isActiveQueueView ? visibleOrders : archivedRequests;
        const map = new Map();
        rows.forEach((request) => {
            const key = getRequestTruckKey(request);
            if (!key) return;
            const label = request.scheduledTruckLabel || request.truckLabel || request.scheduledTruckId || request.truckId || key;
            map.set(key, label);
        });
        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [archivedRequests, isActiveQueueView, visibleOrders]);

    const requestSystemOptions = useMemo(() => {
        const rows = isActiveQueueView ? visibleOrders : archivedRequests;
        return Array.from(new Set(rows.map(request => request.scaffoldingSystem).filter(Boolean)))
            .sort((left, right) => String(left).localeCompare(String(right)));
    }, [archivedRequests, isActiveQueueView, visibleOrders]);

    const selectedRequestListItem = useMemo(
        () => (selectedRequestId ? queueRows.find((request) => request.id === selectedRequestId) || null : null),
        [queueRows, selectedRequestId]
    );

    const selectedRequest = selectedRequestDetail || selectedRequestListItem;
    const materialQueueRows = useMemo(
        () => queueRows.filter((request) => !isSecondaryRouteRequest(request)),
        [queueRows]
    );
    const secondaryRouteQueueRows = useMemo(
        () => queueRows.filter((request) => isSecondaryRouteRequest(request)),
        [queueRows]
    );

    useEffect(() => {
        if (!isActiveQueueView && !isArchivedQueueView) return;
        if (queueRows.length === 0) {
            if (selectedRequestId !== '') {
                setSelectedRequestId('');
            }
            return;
        }
        if (selectedRequestId === null) return;
        if (selectedRequestId === '' || !queueRows.some((request) => request.id === selectedRequestId)) {
            setSelectedRequestId(queueRows[0].id);
        }
    }, [isActiveQueueView, isArchivedQueueView, queueRows, selectedRequestId]);

    useEffect(() => {
        const rowIds = new Set(queueRows.map((request) => request.id));
        setSelectedQueueIds((current) => {
            const next = current.filter((id) => rowIds.has(id));
            return next.length === current.length ? current : next;
        });
    }, [queueRows]);

    useEffect(() => {
        let active = true;

        if (!selectedRequestListItem?.id) {
            setSelectedRequestDetail(null);
            return () => {
                active = false;
            };
        }

        setSelectedRequestDetail(current => current?.id === selectedRequestListItem.id ? current : selectedRequestListItem);

        materialOrderRequestsAPI.getRequest(selectedRequestListItem.id)
            .then((fullRequest) => {
                if (!active) return;
                setSelectedRequestDetail(fullRequest || selectedRequestListItem);
            })
            .catch(() => {
                if (!active) return;
                setSelectedRequestDetail(selectedRequestListItem);
            });

        return () => {
            active = false;
        };
    }, [selectedRequestListItem]);

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

    const handleDeleteRequest = async (request) => {
        if (!request?.id) return;
        const confirmed = window.confirm(`Delete this ${isSecondaryRouteRequest(request) ? 'secondary route' : 'material order'}? This will remove it from the ESS Transport schedule.`);
        if (!confirmed) return;
        setSaving(true);
        setError('');
        try {
            await materialOrderRequestsAPI.deleteRequest(request.id);
            setSelectedQueueIds((current) => current.filter((id) => id !== request.id));
            if (selectedRequestId === request.id) {
                setSelectedRequestId('');
                setSelectedRequestDetail(null);
            }
            await loadPageData();
        } catch (err) {
            setError(err.message || 'Failed to delete delivery');
        } finally {
            setSaving(false);
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
        const activeCount = visibleOrders.length;
        const pendingCount = visibleOrders.filter(request => !request.scheduledAtIso && !request.scheduledDate).length;
        const selectedSiteLocation = selectedRequest ? getProjectLocation(builders, selectedRequest) : '';
        const selectedItems = summarizeItems(selectedRequest);
        const selectedRequestIsScheduled = Boolean(selectedRequest?.scheduledAtIso || (selectedRequest?.scheduledDate && typeof selectedRequest?.scheduledHour === 'number' && typeof selectedRequest?.scheduledMinute === 'number'));
        const activeFilterCount = [requestStatusFilter !== 'all', requestSystemFilter !== 'all', Boolean(requestDateFilter), requestTruckFilter !== 'all'].filter(Boolean).length;
        const selectedRequestIsSecondaryRoute = isSecondaryRouteRequest(selectedRequest);
        const selectedRouteMinutes = getSecondaryRouteMinutes(selectedRequest?.secondaryRoute);
        const selectedScheduledDateTime = selectedRequest?.scheduledDate && typeof selectedRequest?.scheduledHour === 'number' && typeof selectedRequest?.scheduledMinute === 'number'
            ? new Date(`${selectedRequest.scheduledDate}T${String(selectedRequest.scheduledHour).padStart(2, '0')}:${String(selectedRequest.scheduledMinute).padStart(2, '0')}:00`)
            : null;
        const selectedScheduleDateLabel = selectedScheduledDateTime && !Number.isNaN(selectedScheduledDateTime.getTime())
            ? selectedScheduledDateTime.toLocaleDateString('en-AU')
            : 'Not scheduled';
        const selectedScheduleTimeLabel = selectedScheduledDateTime && !Number.isNaN(selectedScheduledDateTime.getTime())
            ? formatTimeChip(selectedScheduledDateTime.getHours(), selectedScheduledDateTime.getMinutes())
            : 'Not scheduled';
        const addMinutesLabel = (date, minutes) => {
            if (!date || Number.isNaN(date.getTime())) return 'Pending';
            const next = new Date(date.getTime() + minutes * 60000);
            return `${next.toLocaleDateString('en-AU')} ${formatTimeChip(next.getHours(), next.getMinutes())}`;
        };
        const subtractMinutesLabel = (date, minutes) => {
            if (!date || Number.isNaN(date.getTime()) || !minutes) return 'Pending';
            const next = new Date(date.getTime() - minutes * 60000);
            return `${next.toLocaleDateString('en-AU')} ${formatTimeChip(next.getHours(), next.getMinutes())}`;
        };
        const formatMinutesLabel = (minutes) => minutes > 0 ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60}m`.trim() : 'Pending';
        const renderScheduledTimeCell = (request) => {
            if (!request?.scheduledDate || typeof request?.scheduledHour !== 'number' || typeof request?.scheduledMinute !== 'number') {
                return 'Not scheduled';
            }
            return (
                <>
                    <strong>{getSubmittedDateLabel(request.scheduledDate)}</strong>
                    <span>{formatTimeChip(request.scheduledHour, request.scheduledMinute)}</span>
                </>
            );
        };
        const isQueueRowChecked = (requestId) => selectedQueueIds.includes(requestId);
        const activateQueueRow = (request) => {
            setSelectedRequestId(request.id);
        };
        const toggleQueueRow = (request, checked) => {
            setSelectedQueueIds((current) => {
                if (checked) {
                    return current.includes(request.id) ? current : [...current, request.id];
                }
                return current.filter((id) => id !== request.id);
            });
            if (checked) {
                setSelectedRequestId(request.id);
            }
        };
        const toggleQueueGroup = (rows, checked) => {
            const ids = rows.map((request) => request.id);
            setSelectedQueueIds((current) => {
                if (checked) {
                    return Array.from(new Set([...current, ...ids]));
                }
                const rowIds = new Set(ids);
                return current.filter((id) => !rowIds.has(id));
            });
        };
        const renderSelectAllCell = (rows, label) => {
            const allSelected = rows.length > 0 && rows.every((request) => isQueueRowChecked(request.id));
            return (
                <th className="transport-management-check-cell">
                    <input
                        type="checkbox"
                        aria-label={label}
                        checked={allSelected}
                        onChange={(event) => toggleQueueGroup(rows, event.target.checked)}
                    />
                </th>
            );
        };
        const renderRowSelectCell = (request, label) => (
            <td className="transport-management-check-cell">
                <input
                    type="checkbox"
                    aria-label={label}
                    checked={isQueueRowChecked(request.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => toggleQueueRow(request, event.target.checked)}
                />
            </td>
        );
        const renderTablePager = (rows, totalCount) => (
            <div className="transport-management-table-pager">
                <span>Showing 1 to {rows.length} of {totalCount} entries</span>
                <div className="transport-management-page-buttons" aria-hidden="true">
                    <button type="button">‹</button>
                    <button type="button" className="active">1</button>
                    <button type="button">2</button>
                    <button type="button">›</button>
                </div>
                <label>
                    <span>Rows per page:</span>
                    <select value="25" onChange={() => {}}>
                        <option value="25">25</option>
                    </select>
                </label>
            </div>
        );
        const renderMaterialOrdersTable = (rows) => (
            <>
                <div className="transport-management-table-wrap">
                    <table className="transport-management-table">
                        <colgroup>
                            <col className="transport-management-col-check" />
                            <col className="transport-management-col-details" />
                            <col className="transport-management-col-builder" />
                            <col className="transport-management-col-requested" />
                            <col className="transport-management-col-system" />
                            <col className="transport-management-col-submitted" />
                            <col className="transport-management-col-truck" />
                            <col className="transport-management-col-time" />
                            <col className="transport-management-col-status" />
                            <col className="transport-management-col-pdf" />
                            {isActive ? <col className="transport-management-col-action" /> : null}
                        </colgroup>
                        <thead>
                            <tr>
                                {renderSelectAllCell(rows, 'Select all material orders')}
                                <th>Scaffold Details</th>
                                <th>Builder / Project</th>
                                <th>Requested By</th>
                                <th>System</th>
                                <th>Submitted</th>
                                <th>Truck</th>
                                <th>Scheduled Time <span aria-hidden="true">&uarr;</span></th>
                                <th>Status</th>
                                <th>PDF</th>
                                {isActive ? <th>Actions</th> : null}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((request) => {
                                const isSelected = isQueueRowChecked(request.id);
                                return (
                                    <tr key={request.id} className={isSelected ? 'selected' : ''} onClick={() => activateQueueRow(request)}>
                                        {renderRowSelectCell(request, `Select material order ${request.id}`)}
                                        <td><strong>{request.details || 'No scaffold details supplied'}</strong><span>{request.scaffoldingSystem || 'Kwikstage'}</span></td>
                                        <td><strong>{request.builderName || 'Material Order'}</strong><span>{request.projectName || getProjectLocation(builders, request) || 'Awaiting project'}</span></td>
                                        <td>{request.requestedByName || 'Unassigned'}</td>
                                        <td>{request.scaffoldingSystem || 'Kwikstage'}</td>
                                        <td><strong>{getSubmittedDateLabel(request.submittedAt)}</strong><span>{getSubmittedTimeLabel(request.submittedAt)}</span></td>
                                        <td>{request.scheduledTruckLabel || request.truckLabel || '-'}</td>
                                        <td>{renderScheduledTimeCell(request)}</td>
                                        <td><span className={`transport-status-pill status-${request.deliveryStatus || 'pending'}`}>{getDeliveryStatusLabel(request.deliveryStatus)}</span></td>
                                        <td>
                                            <button
                                                type="button"
                                                className="transport-management-pdf-btn"
                                                aria-label="Open picking card PDF"
                                                title="Open picking card PDF"
                                                disabled={!request.pdfPath}
                                                onClick={(event) => openArchivedPdf(request, event)}
                                            >
                                                <PdfTableIcon />
                                            </button>
                                        </td>
                                        {isActive ? (
                                            <td className="transport-management-row-action-cell">
                                                <button
                                                    type="button"
                                                    className="transport-management-row-delete"
                                                    aria-label="Delete material order"
                                                    title="Delete material order"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleDeleteRequest(request);
                                                    }}
                                                    disabled={saving}
                                                >
                                                    <MoreVerticalIcon />
                                                </button>
                                            </td>
                                        ) : null}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {renderTablePager(rows, materialQueueRows.length)}
            </>
        );
        const renderSecondaryRoutesTable = (rows) => (
            <>
                <div className="transport-management-table-wrap secondary-routes">
                    <table className="transport-management-table transport-management-secondary-table">
                        <colgroup>
                            <col className="transport-management-col-check" />
                            <col className="transport-management-col-secondary-destination" />
                            <col className="transport-management-col-secondary-start" />
                            <col className="transport-management-col-secondary-reason" />
                            <col className="transport-management-col-truck" />
                            <col className="transport-management-col-time" />
                            <col className="transport-management-col-status" />
                            {isActive ? <col className="transport-management-col-action" /> : null}
                        </colgroup>
                        <thead>
                            <tr>
                                {renderSelectAllCell(rows, 'Select all secondary routes')}
                                <th>Destination</th>
                                <th>Starting Location</th>
                                <th>Reason</th>
                                <th>Truck</th>
                                <th>Scheduled Time <span aria-hidden="true">&uarr;</span></th>
                                <th>Status</th>
                                {isActive ? <th>Actions</th> : null}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((request) => {
                                const route = request.secondaryRoute || {};
                                const isSelected = isQueueRowChecked(request.id);
                                return (
                                    <tr key={request.id} className={isSelected ? 'selected secondary-route-row' : 'secondary-route-row'} onClick={() => activateQueueRow(request)}>
                                        {renderRowSelectCell(request, `Select secondary route ${request.id}`)}
                                        <td><strong>{route.destination || request.details || 'Secondary route'}</strong></td>
                                        <td>{route.startingLocation || 'Starting location pending'}</td>
                                        <td>{getSecondaryRouteReasonLabel(route.reason)}</td>
                                        <td>{request.scheduledTruckLabel || request.truckLabel || '-'}</td>
                                        <td>{renderScheduledTimeCell(request)}</td>
                                        <td><span className={`transport-status-pill status-${request.deliveryStatus || 'pending'}`}>{getDeliveryStatusLabel(request.deliveryStatus)}</span></td>
                                        {isActive ? (
                                            <td className="transport-management-row-action-cell">
                                                <button
                                                    type="button"
                                                    className="transport-management-row-delete"
                                                    aria-label="Delete secondary route"
                                                    title="Delete secondary route"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleDeleteRequest(request);
                                                    }}
                                                    disabled={saving}
                                                >
                                                    <MoreVerticalIcon />
                                                </button>
                                            </td>
                                        ) : null}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {renderTablePager(rows, secondaryRouteQueueRows.length)}
            </>
        );
        const renderQueueSection = (title, rows, kind) => (
            <section className={`transport-management-category ${kind}`}>
                <div className={`transport-management-category-head${kind === 'material' ? ' transport-management-category-head-tabs' : ''}`}>
                    {kind === 'material' ? (
                        <>
                            <button type="button" className="active">Material Orders <small>{materialQueueRows.length}</small></button>
                            <button type="button">Secondary Routes <small>{secondaryRouteQueueRows.length}</small></button>
                        </>
                    ) : (
                        <>
                            <strong>{title}</strong>
                            <small>{rows.length}</small>
                        </>
                    )}
                </div>
                {rows.length > 0 ? (
                    kind === 'secondary' ? renderSecondaryRoutesTable(rows) : renderMaterialOrdersTable(rows)
                ) : (
                    <div className="transport-management-category-empty">
                        {kind === 'secondary' ? 'No secondary routes match the current filters.' : 'No material orders match the current filters.'}
                    </div>
                )}
            </section>
        );

        return (
            <div className="ts2-page material-ordering-transport-page transport-management-redesign">
                <div className="ts2-header material-ordering-transport-header material-ordering-transport-header-queue">
                    <div className="ts2-header-left material-ordering-transport-header-copy material-ordering-transport-header-copy-row">
                        <div>
                            <h1>{isActive ? 'Schedule Management' : 'Archived Orders'}</h1>
                        </div>
                    </div>
                    <div className="transport-management-header-actions">
                        <span>
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
                                <path d="M4 4v4h4" />
                                <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
                                <path d="M20 20v-4h-4" />
                            </svg>
                            Last updated: {formatLastUpdated(requestUpdatedAt)}
                        </span>
                        <button type="button" onClick={() => { setLoading(true); loadPageData(); }}>
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
                                <path d="M4 4v4h4" />
                                <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
                                <path d="M20 20v-4h-4" />
                            </svg>
                            Refresh
                        </button>
                    </div>
                </div>

                <div className={`transport-management-layout${selectedRequest ? '' : ' detail-closed'}`}>
                    <section className="transport-management-main">
                        <div className="transport-management-reference-tools">
                            <label className="transport-management-control date">
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M7 3v3M17 3v3M4.5 9h15M6 5.5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V7A1.5 1.5 0 0 1 6 5.5Z" />
                                </svg>
                                <input type="date" value={requestDateFilter} onChange={(event) => setRequestDateFilter(event.target.value)} aria-label="Filter date" />
                            </label>
                            <label className="transport-management-control">
                                <select value={requestSystemFilter} onChange={(event) => setRequestSystemFilter(event.target.value)} aria-label="Filter system">
                                    <option value="all">All Systems</option>
                                    {requestSystemOptions.map(system => <option key={system} value={String(system).toLowerCase()}>{system}</option>)}
                                </select>
                            </label>
                            <label className="transport-management-control">
                                <select value={requestStatusFilter} onChange={(event) => setRequestStatusFilter(event.target.value)} aria-label="Filter status">
                                    <option value="all">All Statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="scheduled">Scheduled</option>
                                    <option value="in_transit">In transit</option>
                                    <option value="unloading">Unloading</option>
                                    <option value="return_transit">Return transit</option>
                                </select>
                            </label>
                            <label className="transport-management-search">
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="m21 21-4.35-4.35" />
                                    <circle cx="11" cy="11" r="6.5" />
                                </svg>
                                <input
                                    type="text"
                                    value={requestSearch}
                                    onChange={(event) => setRequestSearch(event.target.value)}
                                    placeholder="Search by order, builder, project, truck, route..."
                                />
                            </label>
                        </div>

                        <div className="material-ordering-queue-tools transport-management-tools legacy">
                            <label className="material-ordering-queue-search">
                                <span className="material-ordering-queue-search-icon" aria-hidden="true">⌕</span>
                                <input
                                    type="text"
                                    value={requestSearch}
                                    onChange={(event) => setRequestSearch(event.target.value)}
                                    placeholder="Search builders, projects, scaffold details..."
                                />
                            </label>
                            <div className="transport-management-filter-wrap">
                                <button
                                    type="button"
                                    className={`transport-management-filter-button${requestFiltersOpen ? ' active' : ''}`}
                                    onClick={() => setRequestFiltersOpen(open => !open)}
                                    aria-expanded={requestFiltersOpen}
                                >
                                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                        <path d="M2.25 4.25h11.5M4.5 8h7M6.75 11.75h2.5" />
                                    </svg>
                                    <span>Filters</span>
                                    {activeFilterCount > 0 ? <b>{activeFilterCount}</b> : null}
                                </button>
                                {requestFiltersOpen ? (
                                    <div className="transport-management-filter-menu">
                                        <label>
                                            <span>Status</span>
                                            <select value={requestStatusFilter} onChange={(event) => setRequestStatusFilter(event.target.value)}>
                                                <option value="all">All statuses</option>
                                                <option value="pending">Pending</option>
                                                <option value="scheduled">Scheduled</option>
                                                <option value="in_transit">In transit</option>
                                                <option value="unloading">Unloading</option>
                                                <option value="return_transit">Return transit</option>
                                            </select>
                                        </label>
                                        <label>
                                            <span>Date</span>
                                            <input type="date" value={requestDateFilter} onChange={(event) => setRequestDateFilter(event.target.value)} />
                                        </label>
                                        <label>
                                            <span>Truck</span>
                                            <select value={requestTruckFilter} onChange={(event) => setRequestTruckFilter(event.target.value)}>
                                                <option value="all">All trucks</option>
                                                {requestTruckOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                        </label>
                                        <label>
                                            <span>Sort</span>
                                            <select value={requestSortOrder} onChange={(event) => setRequestSortOrder(event.target.value)}>
                                                <option value="newest">Newest first</option>
                                                <option value="oldest">Oldest first</option>
                                            </select>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRequestStatusFilter('all');
                                                setRequestDateFilter('');
                                                setRequestTruckFilter('all');
                                                setRequestSortOrder('newest');
                                            }}
                                        >
                                            Clear filters
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {error ? <div className="module-error material-ordering-inline-error">{error}</div> : null}

                        {queueRows.length === 0 ? (
                            <div className="transport-placeholder-card material-ordering-transport-empty">
                                <span className="transport-placeholder-eyebrow">ESS Transport</span>
                                <h2>{isActive ? 'No active orders' : 'No archived orders'}</h2>
                                <p>{isActive ? 'Submitted transport requests will appear here as soon as they enter the active queue.' : 'Completed transport requests will appear here once they have rolled out of the active queue.'}</p>
                            </div>
                        ) : (
                            <div className="transport-management-category-stack">
                                {renderQueueSection('Material Orders', materialQueueRows, 'material')}
                                {renderQueueSection('Secondary Routes', secondaryRouteQueueRows, 'secondary')}
                            </div>
                        )}
                    </section>
                    {selectedRequest ? (
                        <aside className="transport-management-detail">
                            <div className="transport-management-detail-head no-title">
                                <button type="button" aria-label="Close summary" onClick={() => setSelectedRequestId(null)}>×</button>
                            </div>

                            <section className="transport-management-panel">
                                <div className="transport-management-panel-title">
                                    <strong>{selectedRequestIsSecondaryRoute ? 'Secondary Route Summary' : 'Picking Card Summary'}</strong>
                                    {!selectedRequestIsSecondaryRoute ? (
                                        <button type="button" className="transport-management-panel-action" disabled={!selectedRequest.pdfPath} onClick={(event) => openArchivedPdf(selectedRequest, event)}>
                                            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                                <path d="M8 2.5a.75.75 0 0 1 .75.75v5.19l1.72-1.72a.75.75 0 1 1 1.06 1.06L8.53 10.81a.75.75 0 0 1-1.06 0L4.47 7.78a.75.75 0 0 1 1.06-1.06l1.72 1.72V3.25A.75.75 0 0 1 8 2.5ZM3.25 12a.75.75 0 0 1 .75.75v.5h8v-.5a.75.75 0 0 1 1.5 0V14a.75.75 0 0 1-.75.75h-9.5A.75.75 0 0 1 2.5 14v-1.25A.75.75 0 0 1 3.25 12Z" fill="currentColor" />
                                            </svg>
                                            <span>Download PDF</span>
                                        </button>
                                    ) : null}
                                    <button type="button" className="transport-management-panel-close" aria-label="Close summary" onClick={() => setSelectedRequestId(null)}>×</button>
                                </div>

                                <div className="transport-management-reference-detail-body">
                                    <div className="transport-management-detail-order">Order: <b>{selectedRequest.id || 'Pending'}</b></div>

                                    <section className="transport-management-detail-section">
                                        <h3>General Information</h3>
                                        {selectedRequestIsSecondaryRoute ? (
                                            <>
                                                <div className="transport-management-detail-row"><span>Starting Location</span><strong>{selectedRequest.secondaryRoute?.startingLocation || 'Starting location pending'}</strong></div>
                                                <div className="transport-management-detail-row"><span>Destination</span><strong>{selectedRequest.secondaryRoute?.destination || 'Destination pending'}</strong></div>
                                                <div className="transport-management-detail-row"><span>Reason</span><strong>{getSecondaryRouteReasonLabel(selectedRequest.secondaryRoute?.reason)}</strong></div>
                                                <div className="transport-management-detail-row"><span>Status</span><strong><span className={`transport-status-pill status-${selectedRequest.deliveryStatus || 'pending'}`}>{getDeliveryStatusLabel(selectedRequest.deliveryStatus)}</span></strong></div>
                                                <div className="transport-management-detail-row"><span>Truck</span><strong>{selectedRequest.scheduledTruckLabel || selectedRequest.truckLabel || '-'}</strong></div>
                                                <div className="transport-management-detail-row"><span>Scheduled Time</span><strong>{selectedScheduleDateLabel} {selectedScheduleTimeLabel !== 'Not scheduled' ? selectedScheduleTimeLabel : ''}</strong></div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="transport-management-detail-row"><span>Builder</span><strong>{selectedRequest.builderName || 'Material Order'}</strong></div>
                                                <div className="transport-management-detail-row"><span>Project</span><strong>{selectedRequest.projectName || 'Awaiting project'}</strong></div>
                                                <div className="transport-management-detail-row"><span>Requested By</span><strong>{selectedRequest.requestedByName || 'Unassigned'}</strong></div>
                                                <div className="transport-management-detail-row"><span>System</span><strong>{selectedRequest.scaffoldingSystem || 'Kwikstage'}</strong></div>
                                                <div className="transport-management-detail-row"><span>Scaffold Size</span><strong>{selectedRequest.details || 'No scaffold details supplied'}</strong></div>
                                                <div className="transport-management-detail-row"><span>Submitted</span><strong>{formatDateTime(selectedRequest.submittedAt)}</strong></div>
                                                <div className="transport-management-detail-row"><span>Status</span><strong><span className={`transport-status-pill status-${selectedRequest.deliveryStatus || 'pending'}`}>{getDeliveryStatusLabel(selectedRequest.deliveryStatus)}</span></strong></div>
                                                <div className="transport-management-detail-row"><span>Truck</span><strong>{selectedRequest.scheduledTruckLabel || selectedRequest.truckLabel || '-'}</strong></div>
                                                <div className="transport-management-detail-row"><span>Scheduled Time</span><strong>{selectedScheduleDateLabel} {selectedScheduleTimeLabel !== 'Not scheduled' ? selectedScheduleTimeLabel : ''}</strong></div>
                                            </>
                                        )}
                                    </section>

                                    <section className="transport-management-detail-section">
                                        <h3>Route Timing</h3>
                                        {selectedRequestIsSecondaryRoute ? (
                                            <>
                                                <div className="transport-management-detail-row"><span>Travel Time</span><strong>{formatMinutesLabel(selectedRouteMinutes.travelMinutes)}</strong></div>
                                                <div className="transport-management-detail-row"><span>Service Time</span><strong>{formatMinutesLabel(selectedRouteMinutes.serviceMinutes)}</strong></div>
                                                <div className="transport-management-detail-row"><span>Return Time</span><strong>{formatMinutesLabel(selectedRouteMinutes.returnMinutes)}</strong></div>
                                                <div className="transport-management-detail-row"><span>Total Route</span><strong>{formatMinutesLabel(selectedRouteMinutes.totalMinutes)}</strong></div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="transport-management-detail-row"><span>Yard Departure (ETA)</span><strong>{subtractMinutesLabel(selectedScheduledDateTime, 0)}</strong></div>
                                                <div className="transport-management-detail-row"><span>Transit Time</span><strong>Pending</strong></div>
                                                <div className="transport-management-detail-row"><span>Jobsite Arrival (ETA)</span><strong>{selectedScheduleDateLabel} {selectedScheduleTimeLabel !== 'Not scheduled' ? selectedScheduleTimeLabel : ''}</strong></div>
                                                <div className="transport-management-detail-row"><span>Unload Time (Est.)</span><strong>45m</strong></div>
                                                <div className="transport-management-detail-row"><span>Onsite Complete (ETA)</span><strong>{addMinutesLabel(selectedScheduledDateTime, 45)}</strong></div>
                                            </>
                                        )}
                                    </section>

                                    <section className="transport-management-detail-section">
                                        <h3>Notes</h3>
                                        <p>{selectedRequest.notes || 'No notes supplied.'}</p>
                                    </section>

                                    <section className="transport-management-detail-section">
                                        <h3>Documents</h3>
                                        {!selectedRequestIsSecondaryRoute && selectedRequest.pdfPath ? (
                                            <button type="button" className="transport-management-document-link" onClick={(event) => openArchivedPdf(selectedRequest, event)}>
                                                <PdfTableIcon />
                                                Picking Card {selectedRequest.id}.pdf
                                            </button>
                                        ) : (
                                            <p>No document attached.</p>
                                        )}
                                    </section>

                                    <div className="transport-management-reference-actions">
                                        {!selectedRequestIsSecondaryRoute ? (
                                            <button type="button" className="transport-management-print" disabled={!selectedRequest.pdfPath} onClick={(event) => openArchivedPdf(selectedRequest, event)}>
                                                View / Print Picking Card
                                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                    <path d="M6 9V3h12v6" />
                                                    <path d="M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
                                                    <path d="M6 14h12v7H6z" />
                                                </svg>
                                            </button>
                                        ) : null}
                                        <button type="button" className="transport-management-reschedule" onClick={() => onNavigate?.('truck-schedule')}>
                                            {selectedRequestIsSecondaryRoute ? 'Reschedule Route' : 'Reschedule Order'}
                                        </button>
                                        {isActive ? (
                                            <button type="button" className="transport-management-cancel" onClick={() => handleDeleteRequest(selectedRequest)} disabled={saving}>
                                                {selectedRequestIsSecondaryRoute ? 'Cancel Route' : 'Cancel Order'}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>

                                <dl className="transport-management-summary-grid">
                                    {selectedRequestIsSecondaryRoute ? (
                                        <>
                                            <div>
                                                <dt>Starting Location</dt>
                                                <dd>{selectedRequest.secondaryRoute?.startingLocation || 'Starting location pending'}</dd>
                                            </div>
                                            <div>
                                                <dt>Destination</dt>
                                                <dd>{selectedRequest.secondaryRoute?.destination || 'Destination pending'}</dd>
                                            </div>
                                            <div>
                                                <dt>Reason</dt>
                                                <dd>{getSecondaryRouteReasonLabel(selectedRequest.secondaryRoute?.reason)}</dd>
                                            </div>
                                            <div>
                                                <dt>Travel</dt>
                                                <dd>{getSecondaryRouteMinutes(selectedRequest.secondaryRoute).travelMinutes} min</dd>
                                            </div>
                                            <div>
                                                <dt>Service</dt>
                                                <dd>{getSecondaryRouteMinutes(selectedRequest.secondaryRoute).serviceMinutes} min</dd>
                                            </div>
                                            <div>
                                                <dt>Return</dt>
                                                <dd>{getSecondaryRouteMinutes(selectedRequest.secondaryRoute).returnMinutes} min</dd>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <dt>Builder</dt>
                                                <dd>{selectedRequest.builderName || 'Material Order'}</dd>
                                            </div>
                                            <div>
                                                <dt>Project</dt>
                                                <dd>{selectedRequest.projectName || 'Awaiting project'}</dd>
                                            </div>
                                            <div>
                                                <dt>Delivery Address</dt>
                                                <dd>{selectedSiteLocation || 'Awaiting site address'}</dd>
                                            </div>
                                            <div>
                                                <dt>Requested By</dt>
                                                <dd>{selectedRequest.requestedByName || 'Unassigned'}</dd>
                                            </div>
                                            <div>
                                                <dt>Scaffold System</dt>
                                                <dd>{selectedRequest.scaffoldingSystem || 'Kwikstage'}</dd>
                                            </div>
                                            <div>
                                                <dt>Submitted</dt>
                                                <dd>{formatDateTime(selectedRequest.submittedAt)}</dd>
                                            </div>
                                        </>
                                    )}
                                </dl>

                                {selectedRequestIsSecondaryRoute ? (
                                    <div className="transport-management-items">
                                        <div>
                                            <strong>Total route time</strong>
                                            <span>{getSecondaryRouteMinutes(selectedRequest.secondaryRoute).totalMinutes} min</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="transport-management-items">
                                        <div className="transport-management-items-head">
                                            <strong>Items</strong>
                                            <span>Qty</span>
                                        </div>
                                        {selectedItems.length > 0 ? selectedItems.map((item) => (
                                            <div key={item.description}>
                                                <strong>{item.description}</strong>
                                                <span>{item.qty}</span>
                                            </div>
                                        )) : (
                                            <div className="transport-management-items-empty">
                                                <strong>No picking items added</strong>
                                                <span>0</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <label className="transport-management-notes">
                                    <strong>Notes</strong>
                                    <textarea value={selectedRequest.notes || ''} readOnly placeholder="No notes supplied." />
                                </label>
                            </section>

                            <div className="transport-management-detail-actions">
                                {!selectedRequestIsScheduled && isActive ? (
                                    <button type="button" className="transport-management-save" onClick={() => onNavigate?.('truck-schedule')}>
                                        Schedule order
                                    </button>
                                ) : null}
                            </div>
                        </aside>
                    ) : null}
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
                        <button type="button" className="material-ordering-queue-chip" onClick={() => setRequestStatusFilter(current => current === 'all' ? 'pending' : 'all')}>
                            Filters: {requestStatusFilter === 'all' ? 'All' : 'Pending'}
                        </button>
                        <button type="button" className="material-ordering-queue-chip" onClick={() => setRequestSortOrder(current => current === 'newest' ? 'oldest' : 'newest')}>
                            {requestSortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                        </button>
                    </div>
                    <div className="material-ordering-queue-meta">
                        <span>Total {queueRows.length} {queueRows.length === 1 ? 'picking card' : 'picking cards'}</span>
                        <span>Last updated: {formatLastUpdated(requestUpdatedAt)}</span>
                    </div>
                </div>

                {error ? <div className="module-error material-ordering-inline-error">{error}</div> : null}

                {queueRows.length === 0 ? (
                    <div className="transport-placeholder-card material-ordering-transport-empty">
                        <span className="transport-placeholder-eyebrow">ESS Transport</span>
                        <h2>{isActive ? 'No active orders' : 'No archived orders'}</h2>
                        <p>{isActive ? 'Submitted transport requests will appear here as soon as they enter the active queue.' : 'Completed transport requests will appear here once they have rolled out of the active queue.'}</p>
                    </div>
                ) : (
                    <div className="material-ordering-request-stack material-ordering-request-stack-ios">
                        {queueRows.map((request) => {
                            const isScheduled = Boolean(request.scheduledAtIso || (request.scheduledDate && typeof request.scheduledHour === 'number' && typeof request.scheduledMinute === 'number'));
                            const siteLocation = getProjectLocation(builders, request);
                            return (
                                <article key={request.id} className="material-ordering-request-card material-ordering-request-card-ios material-ordering-request-card-ios-stacked">
                                    <div className="material-ordering-request-ios-top">
                                        <div className="material-ordering-request-ios-badges">
                                            <span className={"material-ordering-request-chip material-ordering-request-chip-scheduled" + (isScheduled ? ' active' : '')}>{isScheduled ? formatSchedulePill(request) : 'Not Scheduled'}</span>
                                            {request.scaffoldingSystem ? <span className="material-ordering-request-chip material-ordering-request-chip-scaffold">{request.scaffoldingSystem}</span> : null}
                                        </div>
                                        <button type="button" className="material-ordering-request-delete" onClick={() => handleDeleteRequest(request)}>🗑</button>
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
                                        {!isScheduled ? (
                                            <>
                                                <button type="button" className="material-ordering-request-ios-action" onClick={() => onNavigate?.('truck-schedule')}>
                                                    <span>Schedule Order</span>
                                                </button>
                                                <span className="material-ordering-request-ios-chevron">›</span>
                                            </>
                                        ) : null}
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
