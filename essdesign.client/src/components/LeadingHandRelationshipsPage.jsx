import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rosteringAPI } from '../services/api';

const BOARD_SIZE = 20000;
const BOARD_CENTER = BOARD_SIZE / 2;
const LEADING_HAND_WIDTH = 280;
const LEADING_HAND_HEIGHT = 140;
const EMPLOYEE_WIDTH = 220;
const EMPLOYEE_HEIGHT = 88;
const PORT_SIZE = 12;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function defaultLeadingHandPosition() {
    return {
        x: BOARD_CENTER - LEADING_HAND_WIDTH / 2,
        y: BOARD_CENTER - LEADING_HAND_HEIGHT / 2
    };
}

function cardPortPosition(position, side) {
    return {
        x: position.x + (side === 'left' ? 0 : EMPLOYEE_WIDTH),
        y: position.y + EMPLOYEE_HEIGHT / 2
    };
}

function leadingHandPortPosition(position, type) {
    return {
        x: position.x + (type === 'bad' ? 0 : LEADING_HAND_WIDTH),
        y: position.y + LEADING_HAND_HEIGHT / 2
    };
}

function makeCurve(source, target) {
    const direction = target.x >= source.x ? 1 : -1;
    const delta = Math.abs(target.x - source.x);
    const handle = Math.max(70, delta * 0.42);
    return `M ${source.x} ${source.y} C ${source.x + handle * direction} ${source.y}, ${target.x - handle * direction} ${target.y}, ${target.x} ${target.y}`;
}

function EmployeeCard({ employee, position, selected, onPointerDown, onContextMenu, onStartConnection }) {
    return (
        <div
            className={`lh-card ${selected ? 'selected' : ''}`}
            style={{ left: position.x, top: position.y, width: EMPLOYEE_WIDTH, minHeight: EMPLOYEE_HEIGHT }}
            onPointerDown={onPointerDown}
            onContextMenu={onContextMenu}
        >
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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [allEmployees, setAllEmployees] = useState([]);
    const [relationships, setRelationships] = useState([]);
    const [visibleEmployeeIds, setVisibleEmployeeIds] = useState([]);
    const [positions, setPositions] = useState({ leadingHand: defaultLeadingHandPosition() });
    const [activeDrag, setActiveDrag] = useState(null);
    const [connectionDraft, setConnectionDraft] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [search, setSearch] = useState('');
    const [scale, setScale] = useState(1);
    const [hoveredLineId, setHoveredLineId] = useState(null);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const clientToWorld = (clientX, clientY, currentPan = pan, currentScale = scale) => {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) {
            return { x: 0, y: 0 };
        }
        return {
            x: (clientX - rect.left - currentPan.x) / currentScale,
            y: (clientY - rect.top - currentPan.y) / currentScale
        };
    };

    const clientToViewport = (clientX, clientY) => {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) {
            return { x: 0, y: 0 };
        }
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

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
                setVisibleEmployeeIds(relationshipRows.map((relationship) => relationship.employeeId));
                setPositions((prev) => {
                    const next = { ...prev, leadingHand: prev.leadingHand || defaultLeadingHandPosition() };
                    relationshipRows.forEach((relationship, index) => {
                        if (!next[relationship.employeeId]) {
                            next[relationship.employeeId] = relationship.relationshipType === 'good'
                                ? { x: BOARD_CENTER + 430, y: BOARD_CENTER - 180 + index * 108 }
                                : relationship.relationshipType === 'bad'
                                    ? { x: BOARD_CENTER - 650, y: BOARD_CENTER - 180 + index * 108 }
                                    : { x: BOARD_CENTER - 110 + (index % 3) * 250, y: BOARD_CENTER + 290 + Math.floor(index / 3) * 108 };
                        }
                    });
                    return next;
                });
            })
            .catch((err) => {
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
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }
        const leadingPosition = defaultLeadingHandPosition();
        const centerX = leadingPosition.x + LEADING_HAND_WIDTH / 2;
        const centerY = leadingPosition.y + LEADING_HAND_HEIGHT / 2;
        setPan({
            x: viewport.clientWidth / 2 - centerX * scale,
            y: viewport.clientHeight / 2 - centerY * scale
        });
    }, []);

    const employeeById = useMemo(
        () => Object.fromEntries(allEmployees.map((employee) => [employee.id, employee])),
        [allEmployees]
    );

    const resolvedLeadingHand = employeeById[leadingHand.id] || leadingHand;

    const visibleEmployees = useMemo(
        () => visibleEmployeeIds
            .map((employeeId) => ({
                employeeId,
                employee: employeeById[employeeId],
                relationship: relationships.find((item) => item.employeeId === employeeId) || null
            }))
            .filter((item) => item.employee),
        [employeeById, relationships, visibleEmployeeIds]
    );

    const usedEmployeeIds = useMemo(
        () => new Set(visibleEmployeeIds),
        [visibleEmployeeIds]
    );

    const searchResults = useMemo(() => {
        const candidates = allEmployees.filter((employee) => employee.id !== leadingHand.id && !usedEmployeeIds.has(employee.id));
        const query = search.trim().toLowerCase();
        if (!query) {
            return candidates.slice(0, 10);
        }
        return candidates
            .filter((employee) => {
                const name = `${employee.firstName} ${employee.lastName}`.toLowerCase();
                const phone = (employee.phoneNumber || '').toLowerCase();
                return name.includes(query) || phone.includes(query);
            })
            .slice(0, 10);
    }, [allEmployees, leadingHand.id, search, usedEmployeeIds]);

    const renderedLines = useMemo(() => {
        const leadingPosition = positions.leadingHand || defaultLeadingHandPosition();
        const savedLines = relationships
            .filter((item) => item.relationshipType === 'good' || item.relationshipType === 'bad')
            .map((item) => {
                const employeePosition = positions[item.employeeId];
                if (!employeePosition) {
                    return null;
                }
                const sourceSide = item.relationshipType === 'bad' ? 'right' : 'left';
                return {
                    id: item.employeeId,
                    employeeId: item.employeeId,
                    tone: item.relationshipType,
                    d: makeCurve(
                        cardPortPosition(employeePosition, sourceSide),
                        leadingHandPortPosition(leadingPosition, item.relationshipType)
                    )
                };
            })
            .filter(Boolean);

        if (!connectionDraft) {
            return savedLines;
        }

        if (connectionDraft.sourceKind === 'employee') {
            const employeePosition = positions[connectionDraft.employeeId];
            if (employeePosition) {
                savedLines.push({
                    id: 'draft',
                    employeeId: null,
                    tone: 'draft',
                    d: makeCurve(
                        cardPortPosition(employeePosition, connectionDraft.side),
                        connectionDraft.target
                    )
                });
            }
        }

        if (connectionDraft.sourceKind === 'leadingHand' && connectionDraft.origin) {
            savedLines.push({
                id: 'draft',
                employeeId: null,
                tone: 'draft',
                d: makeCurve(connectionDraft.origin, connectionDraft.target)
            });
        }

        return savedLines;
    }, [connectionDraft, positions, relationships]);

    useEffect(() => {
        const handleMove = (event) => {
            if (!activeDrag && !connectionDraft) {
                return;
            }

            if (activeDrag?.kind === 'pan') {
                setPan({
                    x: activeDrag.originX + (event.clientX - activeDrag.startX),
                    y: activeDrag.originY + (event.clientY - activeDrag.startY)
                });
                return;
            }

            const world = clientToWorld(event.clientX, event.clientY);

            if (activeDrag?.kind === 'card') {
                setPositions((prev) => ({
                    ...prev,
                    [activeDrag.id]: {
                        x: world.x - activeDrag.offsetX,
                        y: world.y - activeDrag.offsetY
                    }
                }));
            }

            if (connectionDraft) {
                setConnectionDraft((prev) => (prev ? { ...prev, target: world } : null));
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
    }, [activeDrag, connectionDraft, pan, scale]);

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
            setVisibleEmployeeIds((prev) => (prev.includes(employeeId) ? prev : [...prev, employeeId]));
        } catch (err) {
            setError(err.message || 'Could not save relationship');
        } finally {
            setSaving(false);
        }
    };

    const addEmployee = async (employeeId) => {
        await saveRelationship(employeeId, 'neutral');
        setPositions((prev) => ({
            ...prev,
            [employeeId]: contextMenu?.world
                ? {
                    x: contextMenu.world.x - EMPLOYEE_WIDTH / 2,
                    y: contextMenu.world.y - EMPLOYEE_HEIGHT / 2
                }
                : { x: BOARD_CENTER - EMPLOYEE_WIDTH / 2, y: BOARD_CENTER + 300 }
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

    const removeEmployeeTile = async (employeeId) => {
        const existingRelationship = relationships.find((item) => item.employeeId === employeeId);
        if (existingRelationship) {
            await removeRelationship(employeeId);
        }
        setVisibleEmployeeIds((prev) => prev.filter((id) => id !== employeeId));
        setContextMenu(null);
    };

    const handleSaveExit = async () => {
        const connectedIds = new Set(
            relationships
                .filter((relationship) => relationship.relationshipType === 'good' || relationship.relationshipType === 'bad')
                .map((relationship) => relationship.employeeId)
        );
        const neutralIds = relationships
            .filter((relationship) => visibleEmployeeIds.includes(relationship.employeeId) && !connectedIds.has(relationship.employeeId))
            .map((relationship) => relationship.employeeId);

        if (neutralIds.length > 0) {
            setSaving(true);
            setError('');
            try {
                await Promise.all(neutralIds.map((employeeId) => rosteringAPI.deleteLeadingHandRelationship(leadingHand.id, employeeId)));
            } catch (err) {
                setError(err.message || 'Could not save relationships');
                setSaving(false);
                return;
            }
            setSaving(false);
        }

        onBack();
    };

    const startCardDrag = (id) => (event) => {
        if (event.button !== 0) {
            return;
        }
        event.stopPropagation();
        const currentPosition = positions[id] || (id === 'leadingHand' ? defaultLeadingHandPosition() : { x: BOARD_CENTER, y: BOARD_CENTER });
        const world = clientToWorld(event.clientX, event.clientY);
        setContextMenu(null);
        setActiveDrag({
            kind: 'card',
            id,
            offsetX: world.x - currentPosition.x,
            offsetY: world.y - currentPosition.y
        });
    };

    const startConnection = (event, employeeId, side) => {
        event.preventDefault();
        const world = clientToWorld(event.clientX, event.clientY);
        setConnectionDraft({
            sourceKind: 'employee',
            employeeId,
            side,
            target: world
        });
    };

    const startLeadingHandConnection = (event, relationshipType) => {
        event.preventDefault();
        const leadingPosition = positions.leadingHand || defaultLeadingHandPosition();
        setConnectionDraft({
            sourceKind: 'leadingHand',
            relationshipType,
            origin: leadingHandPortPosition(leadingPosition, relationshipType),
            target: clientToWorld(event.clientX, event.clientY)
        });
    };

    const openCanvasContextMenu = (event) => {
        event.preventDefault();
        const viewport = clientToViewport(event.clientX, event.clientY);
        setContextMenu({
            mode: 'add',
            viewport,
            world: clientToWorld(event.clientX, event.clientY)
        });
    };

    const openEmployeeContextMenu = (event, employeeId) => {
        event.preventDefault();
        event.stopPropagation();
        const viewport = clientToViewport(event.clientX, event.clientY);
        setContextMenu({
            mode: 'employee',
            employeeId,
            viewport
        });
    };

    const handleWheel = (event) => {
        if (event.target?.closest?.('.lh-board-context-menu')) {
            return;
        }
        event.preventDefault();
        const viewport = clientToViewport(event.clientX, event.clientY);
        const nextScale = clamp(scale + (event.deltaY > 0 ? -0.08 : 0.08), 0.55, 1.7);
        const worldX = (viewport.x - pan.x) / scale;
        const worldY = (viewport.y - pan.y) / scale;
        setScale(nextScale);
        setPan({
            x: viewport.x - worldX * nextScale,
            y: viewport.y - worldY * nextScale
        });
    };

    const handleViewportPointerDown = (event) => {
        const interactiveTarget = event.target?.closest?.(
            '.lh-leading-card, .lh-card, .lh-port, .lh-leading-port, .lh-board-context-menu, .lh-board-save-exit'
        );
        const backgroundTarget = event.target === viewportRef.current || event.target?.classList?.contains('lh-board-stage') || event.target?.classList?.contains('lh-board-lines');
        const canPanFromHere = !interactiveTarget && backgroundTarget;

        if (!canPanFromHere) {
            return;
        }

        if (event.button !== 0 && event.button !== 1) {
            return;
        }

        event.preventDefault();
        setContextMenu(null);
        setActiveDrag({
            kind: 'pan',
            startX: event.clientX,
            startY: event.clientY,
            originX: pan.x,
            originY: pan.y
        });
    };

    const gridSize = 32 * scale;
    const gridStyle = {
        backgroundImage: `
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)
        `,
        backgroundSize: `${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px, ${pan.x}px ${pan.y}px`
    };

    return (
        <div className="lh-board-page">
            {error ? <div className="lh-board-error">{error}</div> : null}
            <div
                ref={viewportRef}
                className={`lh-board-viewport ${activeDrag?.kind === 'pan' ? 'is-panning' : ''} ${connectionDraft ? 'is-connecting' : ''}`}
                style={gridStyle}
                onContextMenu={openCanvasContextMenu}
                onClick={() => setContextMenu(null)}
                onWheel={handleWheel}
                onPointerDown={handleViewportPointerDown}
            >
                <button className="lh-board-save-exit" onClick={handleSaveExit}>
                    Save
                </button>

                {saving ? <div className="lh-board-saving">Saving...</div> : null}

                <div
                    className="lh-board-stage"
                    style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`, width: BOARD_SIZE, height: BOARD_SIZE }}
                >
                    <svg className="lh-board-lines" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} preserveAspectRatio="none">
                        {renderedLines.map((line) => (
                            <g key={line.id}>
                                <path
                                    d={line.d}
                                    className={`lh-board-line-hit ${line.tone === 'draft' ? 'draft' : ''}`}
                                    onPointerEnter={() => line.tone !== 'draft' && setHoveredLineId(line.id)}
                                    onPointerLeave={() => line.tone !== 'draft' && setHoveredLineId((prev) => (prev === line.id ? null : prev))}
                                    onClick={() => line.tone !== 'draft' && removeRelationship(line.employeeId)}
                                />
                                <path
                                    d={line.d}
                                    className={`lh-board-line lh-board-line-${line.tone} ${hoveredLineId === line.id ? 'is-hovered' : ''}`}
                                />
                            </g>
                        ))}
                    </svg>

                    <div
                        className="lh-leading-card"
                        style={{ left: positions.leadingHand?.x ?? defaultLeadingHandPosition().x, top: positions.leadingHand?.y ?? defaultLeadingHandPosition().y }}
                        onPointerDown={startCardDrag('leadingHand')}
                    >
                        <div className="lh-leading-name">{resolvedLeadingHand.firstName || ''} {resolvedLeadingHand.lastName || ''}</div>
                        <div className="lh-leading-sub">{resolvedLeadingHand.phoneNumber || 'No phone number'}</div>

                        <button
                            className="lh-leading-port lh-leading-port-left"
                            data-leading-hand-anchor="bad"
                            onPointerDown={(event) => {
                                event.stopPropagation();
                                startLeadingHandConnection(event, 'bad');
                            }}
                        />
                        <button
                            className="lh-leading-port lh-leading-port-right"
                            data-leading-hand-anchor="good"
                            onPointerDown={(event) => {
                                event.stopPropagation();
                                startLeadingHandConnection(event, 'good');
                            }}
                        />
                    </div>

                    {!loading && visibleEmployees.map((item) => {
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
                                onContextMenu={(event) => openEmployeeContextMenu(event, item.employeeId)}
                                onStartConnection={startConnection}
                            />
                        );
                    })}
                </div>

                {contextMenu ? (
                    <div
                        className="lh-board-context-menu"
                        style={{ left: contextMenu.viewport.x, top: contextMenu.viewport.y }}
                        onClick={(event) => event.stopPropagation()}
                        onWheelCapture={(event) => event.stopPropagation()}
                    >
                        {contextMenu.mode === 'employee' ? (
                            <>
                                <div className="lh-board-context-title">Employee</div>
                                <button
                                    className="lh-board-context-item danger"
                                    onClick={() => removeEmployeeTile(contextMenu.employeeId)}
                                >
                                    <span>Delete</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="lh-board-context-title">Add Employee</div>
                                <input
                                    autoFocus
                                    className="lh-board-context-input"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search ESS employees"
                                />
                                <div className="lh-board-context-results">
                                    {searchResults.length === 0 ? (
                                        <div className="lh-board-empty">No available employees</div>
                                    ) : searchResults.map((employee) => (
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
                            </>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
