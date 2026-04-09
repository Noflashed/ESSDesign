import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rosteringAPI } from '../services/api';

const BOARD_WIDTH = 5000;
const BOARD_HEIGHT = 5000;
const LEADING_HAND_WIDTH = 280;
const LEADING_HAND_HEIGHT = 140;
const EMPLOYEE_WIDTH = 220;
const EMPLOYEE_HEIGHT = 88;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function defaultLeadingHandPosition() {
    return { x: 610, y: 270 };
}

function cardPortPosition(position, side) {
    return {
        x: position.x + (side === 'left' ? 0 : EMPLOYEE_WIDTH),
        y: position.y + EMPLOYEE_HEIGHT / 2
    };
}

function leadingHandPortPosition(position, type) {
    return {
        x: position.x + (type === 'bad' ? 18 : LEADING_HAND_WIDTH - 18),
        y: position.y + LEADING_HAND_HEIGHT / 2
    };
}

function makeCurve(source, target) {
    const delta = Math.abs(target.x - source.x);
    const handle = Math.max(60, delta * 0.45);
    return `M ${source.x} ${source.y} C ${source.x + handle} ${source.y}, ${target.x - handle} ${target.y}, ${target.x} ${target.y}`;
}

function EmployeeCard({ employee, position, selected, onPointerDown, onRemove, onStartConnection }) {
    return (
        <div
            className={`lh-card ${selected ? 'selected' : ''}`}
            style={{ left: position.x, top: position.y, width: EMPLOYEE_WIDTH, minHeight: EMPLOYEE_HEIGHT }}
            onPointerDown={onPointerDown}
        >
            <button className="lh-card-remove" onClick={(event) => { event.stopPropagation(); onRemove(employee.id); }}>×</button>
            <button
                className="lh-port lh-port-left"
                data-employee-port="left"
                data-employee-id={employee.id}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    onStartConnection(event, employee.id, 'left');
                }}
            />
            <button
                className="lh-port lh-port-right"
                data-employee-port="right"
                data-employee-id={employee.id}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    onStartConnection(event, employee.id, 'right');
                }}
            />
            <div className="lh-card-name">{employee.firstName} {employee.lastName}</div>
            <div className="lh-card-sub">{employee.phoneNumber || 'No phone number'}</div>
        </div>
    );
}

export default function LeadingHandRelationshipsPage({ leadingHand, onBack }) {
    const viewportRef = useRef(null);
    const boardRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [allEmployees, setAllEmployees] = useState([]);
    const [relationships, setRelationships] = useState([]);
    const [positions, setPositions] = useState({ leadingHand: defaultLeadingHandPosition() });
    const [activeDrag, setActiveDrag] = useState(null);
    const [connectionDraft, setConnectionDraft] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [search, setSearch] = useState('');
    const [scale, setScale] = useState(1);
    const [hoveredLineId, setHoveredLineId] = useState(null);
    const [pan, setPan] = useState({ x: -1750, y: -2060 });

    useEffect(() => {
        let active = true;
        Promise.all([
            rosteringAPI.getEmployees(),
            rosteringAPI.getLeadingHandRelationships(leadingHand.id)
        ])
            .then(([employeeRows, relationshipRows]) => {
                if (!active) {
                    return;
                }
                setAllEmployees(employeeRows);
                setRelationships(relationshipRows);
                setPositions(prev => {
                    const next = { ...prev };
                    relationshipRows.forEach((relationship, index) => {
                        if (!next[relationship.employeeId]) {
                            next[relationship.employeeId] = relationship.relationshipType === 'good'
                                ? { x: 1080, y: 120 + index * 108 }
                                : relationship.relationshipType === 'bad'
                                    ? { x: 200, y: 120 + index * 108 }
                                    : { x: 450 + (index % 3) * 250, y: 560 + Math.floor(index / 3) * 108 };
                        }
                    });
                    return next;
                });
            })
            .catch(err => {
                if (active) {
                    setError(err.message || 'Failed to load leading hand relationships');
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
    }, [leadingHand.id]);

    useEffect(() => {
        const handleMove = (event) => {
            if (!boardRef.current) {
                return;
            }
            const rect = boardRef.current.getBoundingClientRect();
            const boardX = (event.clientX - rect.left) / scale;
            const boardY = (event.clientY - rect.top) / scale;

            if (activeDrag) {
                const width = activeDrag.id === 'leadingHand' ? LEADING_HAND_WIDTH : EMPLOYEE_WIDTH;
                const height = activeDrag.id === 'leadingHand' ? LEADING_HAND_HEIGHT : EMPLOYEE_HEIGHT;
                setPositions(prev => ({
                    ...prev,
                    [activeDrag.id]: {
                        x: boardX - activeDrag.offsetX,
                        y: boardY - activeDrag.offsetY
                    }
                }));
            }

            if (activeDrag?.id === 'pan') {
                setPan({
                    x: activeDrag.originX + (event.clientX - activeDrag.startX),
                    y: activeDrag.originY + (event.clientY - activeDrag.startY)
                });
            }

            if (connectionDraft) {
                setConnectionDraft(prev => prev ? { ...prev, target: { x: boardX, y: boardY } } : null);
            }
        };

        const handleUp = async (event) => {
            if (connectionDraft) {
                const anchor = event.target?.closest?.('[data-leading-hand-anchor]');
                const relationshipType = anchor?.getAttribute('data-leading-hand-anchor');
                const employeePort = event.target?.closest?.('[data-employee-port]');
                const targetEmployeeId = employeePort?.getAttribute('data-employee-id');

                if (connectionDraft.sourceKind === 'employee' && (relationshipType === 'good' || relationshipType === 'bad')) {
                    await saveRelationship(connectionDraft.employeeId, relationshipType);
                }

                if (connectionDraft.sourceKind === 'leadingHand' && targetEmployeeId && connectionDraft.relationshipType) {
                    await saveRelationship(targetEmployeeId, connectionDraft.relationshipType);
                }
            }
            setActiveDrag(null);
            setConnectionDraft(null);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [activeDrag, connectionDraft, scale]);

    const employeeById = useMemo(
        () => Object.fromEntries(allEmployees.map(employee => [employee.id, employee])),
        [allEmployees]
    );

    const resolvedLeadingHand = employeeById[leadingHand.id] || leadingHand;

    const relatedEmployees = useMemo(
        () => relationships
            .map(relationship => ({
                ...relationship,
                employee: employeeById[relationship.employeeId]
            }))
            .filter(item => item.employee),
        [employeeById, relationships]
    );

    const usedEmployeeIds = useMemo(
        () => new Set(relationships.map(item => item.employeeId)),
        [relationships]
    );

    const searchResults = useMemo(() => {
        const candidates = allEmployees.filter(employee => employee.id !== leadingHand.id && !usedEmployeeIds.has(employee.id));
        const q = search.trim().toLowerCase();
        if (!q) {
            return candidates.slice(0, 10);
        }
        return candidates.filter(employee => {
            const name = `${employee.firstName} ${employee.lastName}`.toLowerCase();
            const phone = (employee.phoneNumber || '').toLowerCase();
            return name.includes(q) || phone.includes(q);
        }).slice(0, 10);
    }, [allEmployees, leadingHand.id, search, usedEmployeeIds]);

    const renderedLines = useMemo(() => {
        const leadingPosition = positions.leadingHand || defaultLeadingHandPosition();
        const lines = relatedEmployees
            .filter(item => item.relationshipType === 'good' || item.relationshipType === 'bad')
            .map(item => {
                const employeePosition = positions[item.employeeId];
                if (!employeePosition) {
                    return null;
                }
                const sourceSide = item.relationshipType === 'bad' ? 'right' : 'left';
                const source = cardPortPosition(employeePosition, sourceSide);
                const target = leadingHandPortPosition(leadingPosition, item.relationshipType);
                return {
                    id: item.employeeId,
                    employeeId: item.employeeId,
                    tone: item.relationshipType,
                    hitTone: item.relationshipType,
                    d: makeCurve(source, target)
                };
            })
            .filter(Boolean);

        if (connectionDraft) {
            if (connectionDraft.sourceKind === 'employee') {
                const employeePosition = positions[connectionDraft.employeeId];
                if (employeePosition) {
                    lines.push({
                        id: 'draft',
                        employeeId: connectionDraft.employeeId,
                        tone: 'draft',
                        hitTone: 'draft',
                        d: makeCurve(cardPortPosition(employeePosition, connectionDraft.side), connectionDraft.target)
                    });
                }
            }
            if (connectionDraft.sourceKind === 'leadingHand' && connectionDraft.origin) {
                lines.push({
                    id: 'draft',
                    employeeId: null,
                    tone: 'draft',
                    hitTone: 'draft',
                    d: makeCurve(connectionDraft.origin, connectionDraft.target)
                });
            }
        }

        return lines;
    }, [connectionDraft, positions, relatedEmployees]);

    const saveRelationship = async (employeeId, relationshipType) => {
        if (!employeeId) {
            return;
        }
        setSaving(true);
        setError('');
        try {
            const nextRelationships = await rosteringAPI.saveLeadingHandRelationship({
                leadingHandEmployeeId: leadingHand.id,
                employeeId,
                relationshipType
            });
            setRelationships(nextRelationships);
        } catch (err) {
            setError(err.message || 'Could not save relationship');
        } finally {
            setSaving(false);
        }
    };

    const addEmployee = async (employeeId) => {
        await saveRelationship(employeeId, 'neutral');
        setPositions(prev => ({
            ...prev,
            [employeeId]: contextMenu
                ? {
                    x: contextMenu.x - EMPLOYEE_WIDTH / 2,
                    y: contextMenu.y - EMPLOYEE_HEIGHT / 2
                }
                : { x: 430, y: 620 }
        }));
        setContextMenu(null);
        setSearch('');
    };

    const removeRelationship = async (employeeId) => {
        setSaving(true);
        setError('');
        try {
            const nextRelationships = await rosteringAPI.deleteLeadingHandRelationship(leadingHand.id, employeeId);
            setRelationships(nextRelationships);
        } catch (err) {
            setError(err.message || 'Could not remove relationship');
        } finally {
            setSaving(false);
        }
    };

    const startCardDrag = (id) => (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setActiveDrag({
            id,
            offsetX: (event.clientX - rect.left) / scale,
            offsetY: (event.clientY - rect.top) / scale
        });
    };

    const startConnection = (event, employeeId, side) => {
        if (!boardRef.current) {
            return;
        }
        const rect = boardRef.current.getBoundingClientRect();
        setConnectionDraft({
            sourceKind: 'employee',
            employeeId,
            side,
            target: {
                x: (event.clientX - rect.left) / scale,
                y: (event.clientY - rect.top) / scale
            }
        });
    };

    const startLeadingHandConnection = (event, relationshipType) => {
        if (!boardRef.current) {
            return;
        }
        const rect = boardRef.current.getBoundingClientRect();
        const leadingPosition = positions.leadingHand || defaultLeadingHandPosition();
        setConnectionDraft({
            sourceKind: 'leadingHand',
            relationshipType,
            employeeId: null,
            side: null,
            origin: leadingHandPortPosition(leadingPosition, relationshipType),
            target: {
                x: (event.clientX - rect.left) / scale,
                y: (event.clientY - rect.top) / scale
            }
        });
    };

    const openContextMenu = (event) => {
        event.preventDefault();
        if (!boardRef.current) {
            return;
        }
        const rect = boardRef.current.getBoundingClientRect();
        setContextMenu({
            x: (event.clientX - rect.left) / scale,
            y: (event.clientY - rect.top) / scale
        });
    };

    const handleWheel = (event) => {
        event.preventDefault();
        setScale(prev => clamp(prev + (event.deltaY > 0 ? -0.08 : 0.08), 0.65, 1.6));
    };

    const handleViewportPointerDown = (event) => {
        if (event.button !== 1) {
            return;
        }
        event.preventDefault();
        setActiveDrag({
            id: 'pan',
            startX: event.clientX,
            startY: event.clientY,
            originX: pan.x,
            originY: pan.y
        });
    };

    return (
        <div className="lh-board-page">
            {error ? <div className="lh-board-error">{error}</div> : null}
            <div
                ref={viewportRef}
                className="lh-board-viewport"
                onContextMenu={openContextMenu}
                onClick={() => setContextMenu(null)}
                onWheel={handleWheel}
                onPointerDown={handleViewportPointerDown}
            >
                <div
                    ref={boardRef}
                    className="lh-board-stage"
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, width: BOARD_WIDTH, height: BOARD_HEIGHT }}
                >
                    <div className="lh-board-grid" />

                    <svg className="lh-board-lines" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none">
                        {renderedLines.map(line => (
                            <g key={line.id}>
                                <path
                                    d={line.d}
                                    className={`lh-board-line-hit ${line.tone === 'draft' ? 'draft' : ''}`}
                                    onMouseEnter={() => line.tone !== 'draft' && setHoveredLineId(line.id)}
                                    onMouseLeave={() => line.tone !== 'draft' && setHoveredLineId(prev => prev === line.id ? null : prev)}
                                    onClick={() => line.tone !== 'draft' && removeRelationship(line.employeeId)}
                                    style={{ pointerEvents: line.tone === 'draft' ? 'none' : 'stroke' }}
                                />
                                <path
                                    d={line.d}
                                    className={`lh-board-line lh-board-line-${line.tone} ${hoveredLineId === line.id ? 'is-hovered' : ''}`}
                                    style={{ pointerEvents: 'none' }}
                                />
                            </g>
                        ))}
                    </svg>

                    <div
                        className="lh-leading-card"
                        style={{ left: positions.leadingHand?.x ?? 0, top: positions.leadingHand?.y ?? 0 }}
                        onPointerDown={startCardDrag('leadingHand')}
                    >
                        <div className="lh-leading-name">{resolvedLeadingHand.firstName || ''} {resolvedLeadingHand.lastName || ''}</div>
                        <div className="lh-leading-sub">{resolvedLeadingHand.phoneNumber || 'No phone number'}</div>

                        <div className="lh-leading-port-group lh-leading-port-group-left">
                            <button
                                className="lh-leading-port"
                                data-leading-hand-anchor="bad"
                                onPointerDown={(event) => {
                                    event.stopPropagation();
                                    startLeadingHandConnection(event, 'bad');
                                }}
                            />
                            <span className="lh-leading-port-label">Bad</span>
                        </div>
                        <div className="lh-leading-port-group lh-leading-port-group-right">
                            <span className="lh-leading-port-label">Good</span>
                            <button
                                className="lh-leading-port"
                                data-leading-hand-anchor="good"
                                onPointerDown={(event) => {
                                    event.stopPropagation();
                                    startLeadingHandConnection(event, 'good');
                                }}
                            />
                        </div>
                    </div>

                    {!loading && relatedEmployees.map(item => {
                        const position = positions[item.employeeId];
                        if (!position) {
                            return null;
                        }
                        return (
                            <EmployeeCard
                                key={item.employeeId}
                                employee={item.employee}
                                selected={activeDrag?.id === item.employeeId}
                                position={position}
                                onPointerDown={startCardDrag(item.employeeId)}
                                onRemove={removeRelationship}
                                onStartConnection={startConnection}
                            />
                        );
                    })}

                    {contextMenu ? (
                        <div
                            className="lh-board-context-menu"
                            style={{ left: contextMenu.x, top: contextMenu.y }}
                            onClick={event => event.stopPropagation()}
                        >
                            <div className="lh-board-context-title">Add Employee</div>
                            <input
                                autoFocus
                                className="lh-board-context-input"
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                placeholder="Search ESS employees"
                            />
                            <div className="lh-board-context-results">
                                {searchResults.length === 0 ? (
                                    <div className="lh-board-empty">No available employees</div>
                                ) : searchResults.map(employee => (
                                    <button
                                        key={employee.id}
                                        className="lh-board-context-item"
                                        onClick={() => addEmployee(employee.id)}
                                    >
                                        <span>{employee.firstName} {employee.lastName}</span>
                                        <span>{employee.phoneNumber || 'N/A'}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <button className="lh-board-save-exit" onClick={onBack}>
                        Save
                    </button>

                    {saving ? <div className="lh-board-saving">Saving...</div> : null}
                </div>
            </div>
        </div>
    );
}
