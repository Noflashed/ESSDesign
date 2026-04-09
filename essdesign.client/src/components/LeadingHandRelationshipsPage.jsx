import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rosteringAPI } from '../services/api';

const CANVAS_WIDTH = 1500;
const CANVAS_HEIGHT = 920;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function makeDefaultPositions() {
    return {
        leadingHand: { x: 610, y: 280 },
        badAnchor: { x: 570, y: 390 },
        goodAnchor: { x: 880, y: 390 }
    };
}

function EmployeeCard({ employee, selected, style, onPointerDown, onRemove }) {
    return (
        <div
            className={`lh-free-card ${selected ? 'selected' : ''}`}
            style={style}
            onPointerDown={onPointerDown}
        >
            <button className="lh-free-card-remove" onClick={(event) => { event.stopPropagation(); onRemove(employee.id); }}>×</button>
            <div className="lh-free-card-name">{employee.firstName} {employee.lastName}</div>
            <div className="lh-free-card-sub">{employee.phoneNumber || 'No phone number'}</div>
        </div>
    );
}

export default function LeadingHandRelationshipsPage({ leadingHand, onBack }) {
    const canvasRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [allEmployees, setAllEmployees] = useState([]);
    const [relationships, setRelationships] = useState([]);
    const [positions, setPositions] = useState(makeDefaultPositions());
    const [activeDrag, setActiveDrag] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [search, setSearch] = useState('');

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
                            next[relationship.employeeId] = relationship.relationshipType === 'bad'
                                ? { x: 160, y: 120 + index * 120 }
                                : relationship.relationshipType === 'good'
                                    ? { x: 1100, y: 120 + index * 120 }
                                    : { x: 620 + (index % 2) * 220, y: 620 + Math.floor(index / 2) * 120 };
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
            if (!activeDrag || !canvasRef.current) {
                return;
            }
            const rect = canvasRef.current.getBoundingClientRect();
            const x = clamp(event.clientX - rect.left - activeDrag.offsetX, 24, CANVAS_WIDTH - 236);
            const y = clamp(event.clientY - rect.top - activeDrag.offsetY, 24, CANVAS_HEIGHT - 116);
            setPositions(prev => ({
                ...prev,
                [activeDrag.id]: { x, y }
            }));
        };

        const handleUp = () => {
            setActiveDrag(null);
        };

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [activeDrag]);

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

    const getAnchorPoint = (relationshipType) => {
        if (relationshipType === 'bad') {
            const bad = positions.badAnchor;
            return { x: bad.x + 28, y: bad.y + 28 };
        }
        if (relationshipType === 'good') {
            const good = positions.goodAnchor;
            return { x: good.x + 28, y: good.y + 28 };
        }
        const center = positions.leadingHand;
        return { x: center.x + 130, y: center.y + 180 };
    };

    const connectorPaths = relatedEmployees.map(item => {
        const card = positions[item.employeeId];
        if (!card) {
            return null;
        }
        const source = getAnchorPoint(item.relationshipType);
        const target = { x: card.x + 110, y: card.y + 44 };
        const c1x = source.x + (target.x - source.x) * 0.35;
        const c2x = source.x + (target.x - source.x) * 0.7;
        return {
            id: item.employeeId,
            tone: item.relationshipType,
            d: `M ${source.x} ${source.y} C ${c1x} ${source.y}, ${c2x} ${target.y}, ${target.x} ${target.y}`
        };
    }).filter(Boolean);

    const saveRelationship = async (employeeId, relationshipType) => {
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
            [employeeId]: contextMenu ? {
                x: clamp(contextMenu.x - 110, 24, CANVAS_WIDTH - 236),
                y: clamp(contextMenu.y - 44, 24, CANVAS_HEIGHT - 116)
            } : { x: 640, y: 640 }
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

    const startDrag = (id) => (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setActiveDrag({
            id,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        });
    };

    const openContextMenu = (event) => {
        event.preventDefault();
        if (!canvasRef.current) {
            return;
        }
        const rect = canvasRef.current.getBoundingClientRect();
        setContextMenu({
            x: clamp(event.clientX - rect.left, 40, CANVAS_WIDTH - 320),
            y: clamp(event.clientY - rect.top, 40, CANVAS_HEIGHT - 220)
        });
    };

    return (
        <div className="module-page lh-free-page">
            <div className="module-shell lh-free-shell">
                <div className="module-header lh-free-header">
                    <div>
                        <h2>Leading Hand Relationships</h2>
                        <p>Right click on the board to add an employee. Drag cards freely and connect them to good or bad.</p>
                    </div>
                    <button className="module-secondary-btn" onClick={onBack}>Back</button>
                </div>

                {error ? <div className="module-error">{error}</div> : null}

                <div
                    ref={canvasRef}
                    className="lh-free-canvas"
                    onContextMenu={openContextMenu}
                    onClick={() => setContextMenu(null)}
                >
                    <div className="lh-free-grid" />

                    <svg className="lh-free-lines" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} preserveAspectRatio="none">
                        {connectorPaths.map(path => (
                            <path
                                key={path.id}
                                d={path.d}
                                className={`lh-free-path lh-free-path-${path.tone}`}
                            />
                        ))}
                    </svg>

                    <div
                        className="lh-free-leading-card"
                        style={{ left: positions.leadingHand.x, top: positions.leadingHand.y }}
                        onPointerDown={startDrag('leadingHand')}
                    >
                        <div className="lh-free-leading-name">{resolvedLeadingHand.firstName || ''} {resolvedLeadingHand.lastName || ''}</div>
                        <div className="lh-free-leading-sub">{resolvedLeadingHand.phoneNumber || 'No phone number'}</div>

                        <div
                            className="lh-free-anchor lh-free-anchor-bad"
                            style={{ left: positions.badAnchor.x - positions.leadingHand.x, top: positions.badAnchor.y - positions.leadingHand.y }}
                            onPointerDown={startDrag('badAnchor')}
                            onDoubleClick={() => saveRelationship(relatedEmployees.find(item => item.relationshipType === 'neutral')?.employeeId || '', 'bad')}
                        >
                            Bad
                        </div>
                        <div
                            className="lh-free-anchor lh-free-anchor-good"
                            style={{ left: positions.goodAnchor.x - positions.leadingHand.x, top: positions.goodAnchor.y - positions.leadingHand.y }}
                            onPointerDown={startDrag('goodAnchor')}
                            onDoubleClick={() => saveRelationship(relatedEmployees.find(item => item.relationshipType === 'neutral')?.employeeId || '', 'good')}
                        >
                            Good
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
                                style={{ left: position.x, top: position.y }}
                                onPointerDown={startDrag(item.employeeId)}
                                onRemove={removeRelationship}
                            />
                        );
                    })}

                    {contextMenu ? (
                        <div
                            className="lh-free-context-menu"
                            style={{ left: contextMenu.x, top: contextMenu.y }}
                            onClick={event => event.stopPropagation()}
                        >
                            <div className="module-field">
                                <label>Add Employee</label>
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Search ESS employees"
                                />
                            </div>
                            <div className="lh-free-context-results">
                                {searchResults.length === 0 ? (
                                    <div className="lh-free-empty">No available employees</div>
                                ) : searchResults.map(employee => (
                                    <button
                                        key={employee.id}
                                        className="lh-free-context-item"
                                        onClick={() => addEmployee(employee.id)}
                                    >
                                        <span>{employee.firstName} {employee.lastName}</span>
                                        <span>{employee.phoneNumber || 'N/A'}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {loading ? <div className="lh-free-loading">Loading relationships...</div> : null}
                    {saving ? <div className="lh-free-saving">Saving...</div> : null}
                </div>
            </div>
        </div>
    );
}
