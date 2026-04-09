import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rosteringAPI, safetyProjectsAPI } from '../services/api';

const BOARD_SIZE = 20000;
const BOARD_CENTER = BOARD_SIZE / 2;
const SITE_WIDTH = 430;
const SITE_HEIGHT = 240;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function buildInitialPositions(sitePlans) {
    const positions = {};
    const startX = BOARD_CENTER - 460;
    const startY = BOARD_CENTER - 260;
    const columnGap = 460;
    const rowGap = 320;

    sitePlans.forEach((sitePlan, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const baseX = startX + column * columnGap;
        const baseY = startY + row * rowGap;

        positions[`site:${sitePlan.siteId}`] = { x: baseX, y: baseY };
    });

    return positions;
}

function buildSitePlans(sites, employees, plan) {
    if (!plan) {
        return [];
    }

    const employeePool = (employees || []).map((employee) => ({
        id: employee.id,
        firstName: employee.firstName || '',
        lastName: employee.lastName || '',
        phoneNumber: employee.phoneNumber || ''
    }));

    let poolIndex = 0;

    const assignPlaceholderEmployees = (count) => {
        if (employeePool.length === 0 || count <= 0) {
            return [];
        }

        const assigned = [];
        for (let index = 0; index < count; index += 1) {
            const employee = employeePool[poolIndex % employeePool.length];
            poolIndex += 1;
            assigned.push(employee);
        }
        return assigned;
    };

    return (plan.activeSiteIds || [])
        .map((siteId) => {
            const site = sites.find((item) => item.id === siteId);
            if (!site) {
                return null;
            }

            const requiredCrew = Math.max(0, Number(plan.requiredMenBySite?.[siteId] || 0));
            const assignedEmployeesRaw = plan.assignedEmployeesBySite?.[siteId]
                || plan.assigned_employees_by_site?.[siteId]
                || [];
            const assignedEmployees = Array.isArray(assignedEmployeesRaw)
                ? assignedEmployeesRaw
                    .map((employee) => {
                        if (typeof employee === 'string') {
                            return {
                                firstName: employee,
                                lastName: '',
                                phoneNumber: ''
                            };
                        }
                        if (employee && typeof employee === 'object') {
                            return {
                                firstName: employee.firstName || employee.first_name || '',
                                lastName: employee.lastName || employee.last_name || '',
                                phoneNumber: employee.phoneNumber || employee.phone_number || ''
                            };
                        }
                        return null;
                    })
                    .filter(Boolean)
                : [];

            const resolvedEmployees = assignedEmployees.length > 0
                ? assignedEmployees.slice(0, requiredCrew)
                : assignPlaceholderEmployees(requiredCrew);

            return {
                siteId,
                builderName: site.builderName,
                projectName: site.projectName,
                requiredCrew,
                assignedEmployees: resolvedEmployees
            };
        })
        .filter(Boolean);
}

function TreeCard({ className, style, onPointerDown, children }) {
    return (
        <div className={className} style={style} onPointerDown={onPointerDown}>
            {children}
        </div>
    );
}

export default function RosteringTreePage({ planDate, onBack }) {
    const viewportRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [activeDrag, setActiveDrag] = useState(null);
    const [sites, setSites] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [plan, setPlan] = useState(null);
    const [positions, setPositions] = useState({});

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
            safetyProjectsAPI.getBuilders(),
            rosteringAPI.getEmployees(),
            rosteringAPI.getPlan(planDate)
        ])
            .then(([builders, employeeRows, savedPlan]) => {
                if (!active) {
                    return;
                }

                const flattenedSites = builders.flatMap((builder) =>
                    builder.projects.map((project) => ({
                        id: `${builder.id}:${project.id}`,
                        builderId: builder.id,
                        builderName: builder.name,
                        projectId: project.id,
                        projectName: project.name
                    }))
                );

                setSites(flattenedSites);
                setEmployees(employeeRows);
                setPlan(savedPlan);

                const nextPlans = buildSitePlans(flattenedSites, employeeRows, savedPlan);
                setPositions(buildInitialPositions(nextPlans));
            })
            .catch((err) => {
                if (active) {
                    setError(err.message || 'Failed to load rostering tree');
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
    }, [planDate]);

    const sitePlans = useMemo(() => buildSitePlans(sites, employees, plan), [sites, employees, plan]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || sitePlans.length === 0) {
            return;
        }

        const focusX = positions[`site:${sitePlans[0].siteId}`]?.x ?? BOARD_CENTER;
        const focusY = positions[`site:${sitePlans[0].siteId}`]?.y ?? BOARD_CENTER;
        setPan({
            x: viewport.clientWidth / 2 - (focusX + SITE_WIDTH / 2) * scale,
            y: viewport.clientHeight / 2 - (focusY + SITE_HEIGHT / 2) * scale
        });
    }, [sitePlans.length]);

    useEffect(() => {
        const handleMove = (event) => {
            if (!activeDrag) {
                return;
            }

            if (activeDrag.kind === 'pan') {
                setPan({
                    x: activeDrag.originX + (event.clientX - activeDrag.startX),
                    y: activeDrag.originY + (event.clientY - activeDrag.startY)
                });
                return;
            }

            const world = clientToWorld(event.clientX, event.clientY);
            setPositions((prev) => ({
                ...prev,
                [activeDrag.id]: {
                    x: world.x - activeDrag.offsetX,
                    y: world.y - activeDrag.offsetY
                }
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
    }, [activeDrag, pan, scale]);

    const handleWheel = (event) => {
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

    const handleViewportPointerDownCapture = (event) => {
        if (event.button !== 1) {
            return;
        }

        event.preventDefault();
        setActiveDrag({
            kind: 'pan',
            startX: event.clientX,
            startY: event.clientY,
            originX: pan.x,
            originY: pan.y
        });
    };

    const handleViewportPointerDown = (event) => {
        const interactiveTarget = event.target?.closest?.('.rostering-tree-card, .rostering-tree-back');
        const backgroundTarget = event.target === viewportRef.current || event.target?.classList?.contains('lh-board-stage');
        if (interactiveTarget || !backgroundTarget || (event.button !== 0 && event.button !== 1)) {
            return;
        }

        event.preventDefault();
        setActiveDrag({
            kind: 'pan',
            startX: event.clientX,
            startY: event.clientY,
            originX: pan.x,
            originY: pan.y
        });
    };

    const startCardDrag = (id) => (event) => {
        if (event.button !== 0) {
            return;
        }
        event.stopPropagation();
        const currentPosition = positions[id] || { x: BOARD_CENTER, y: BOARD_CENTER };
        const world = clientToWorld(event.clientX, event.clientY);
        setActiveDrag({
            kind: 'card',
            id,
            offsetX: world.x - currentPosition.x,
            offsetY: world.y - currentPosition.y
        });
    };

    if (loading) {
        return <div className="lh-board-page"><div className="lh-board-empty">Loading rostering tree...</div></div>;
    }

    return (
        <div className="lh-board-page">
            {error ? <div className="lh-board-error">{error}</div> : null}
            <div
                ref={viewportRef}
                className={`lh-board-viewport ${activeDrag?.kind === 'pan' ? 'is-panning' : ''}`}
                onWheel={handleWheel}
                onPointerDownCapture={handleViewportPointerDownCapture}
                onPointerDown={handleViewportPointerDown}
            >
                <button type="button" className="lh-board-save-exit rostering-tree-back" onClick={onBack}>
                    Back to Planner
                </button>
                <div
                    className="lh-board-stage"
                    style={{
                        width: BOARD_SIZE,
                        height: BOARD_SIZE,
                        transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
                        backgroundImage: `
                            radial-gradient(circle at center, rgba(255,255,255,0.10) 0, rgba(255,255,255,0.10) 1px, transparent 1.5px),
                            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
                        `,
                        backgroundSize: '24px 24px, 120px 120px, 120px 120px',
                        backgroundPosition: '0 0, 0 0, 0 0'
                    }}
                >
                    {sitePlans.length === 0 ? <div className="lh-board-empty">No saved jobs found for this plan date.</div> : null}

                    {sitePlans.map((sitePlan) => {
                        const sitePosition = positions[`site:${sitePlan.siteId}`] || { x: BOARD_CENTER, y: BOARD_CENTER };

                        return (
                            <TreeCard
                                key={sitePlan.siteId}
                                className="lh-leading-card rostering-tree-card rostering-tree-table-card"
                                style={{ left: sitePosition.x, top: sitePosition.y, width: SITE_WIDTH, minHeight: SITE_HEIGHT }}
                                onPointerDown={startCardDrag(`site:${sitePlan.siteId}`)}
                            >
                                <div className="rostering-tree-table-head">
                                    <table className="rostering-tree-table-header-grid">
                                        <tbody>
                                            <tr>
                                                <td className="rostering-tree-header-title" colSpan="2">{sitePlan.builderName} - {sitePlan.projectName}</td>
                                                <td className="rostering-tree-header-code">REQ</td>
                                                <td className="rostering-tree-header-mini">HRS</td>
                                                <td className="rostering-tree-header-mini">OT</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="rostering-tree-employee-table">
                                    {sitePlan.assignedEmployees.length > 0 ? (
                                        <table className="rostering-tree-table-grid">
                                            <tbody>
                                                {sitePlan.assignedEmployees.map((employee, index) => (
                                                    <tr key={`${sitePlan.siteId}:employee:${index}`} className="rostering-tree-employee-row">
                                                        <td className="rostering-tree-name-cell">
                                                            {[employee.firstName, employee.lastName].filter(Boolean).join(' ')}
                                                        </td>
                                                        <td className="rostering-tree-role-cell"></td>
                                                        <td className="rostering-tree-phone-cell"></td>
                                                        <td className="rostering-tree-mini-cell"></td>
                                                        <td className="rostering-tree-mini-cell"></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="rostering-tree-empty-row">No designated employees yet</div>
                                    )}
                                </div>
                            </TreeCard>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
