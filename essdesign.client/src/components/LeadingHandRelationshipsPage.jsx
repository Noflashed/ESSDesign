import React, { useEffect, useMemo, useState } from 'react';
import { rosteringAPI } from '../services/api';

const REL_COLUMNS = [
    { key: 'bad', title: 'Bad', copy: 'Difficult on-site pairing' },
    { key: 'neutral', title: 'Neutral', copy: 'Tracked but not classified yet' },
    { key: 'good', title: 'Good', copy: 'Strong on-site pairing' }
];

export default function LeadingHandRelationshipsPage({ leadingHand, onBack }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [allEmployees, setAllEmployees] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [relationships, setRelationships] = useState([]);
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
                setEmployees(employeeRows.filter(employee => employee.id !== leadingHand.id));
                setRelationships(relationshipRows);
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

    const employeeById = useMemo(
        () => Object.fromEntries(allEmployees.map(employee => [employee.id, employee])),
        [allEmployees]
    );

    const resolvedLeadingHand = employeeById[leadingHand.id] || leadingHand;

    const relatedEmployeeIds = useMemo(
        () => new Set(relationships.map(relationship => relationship.employeeId)),
        [relationships]
    );

    const searchResults = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) {
            return employees.filter(employee => !relatedEmployeeIds.has(employee.id)).slice(0, 12);
        }
        return employees.filter(employee => {
            if (relatedEmployeeIds.has(employee.id)) {
                return false;
            }
            const name = `${employee.firstName} ${employee.lastName}`.toLowerCase();
            const phone = (employee.phoneNumber || '').toLowerCase();
            return name.includes(q) || phone.includes(q);
        }).slice(0, 12);
    }, [employees, relatedEmployeeIds, search]);

    const relationshipsByType = useMemo(
        () => ({
            bad: relationships.filter(item => item.relationshipType === 'bad'),
            neutral: relationships.filter(item => item.relationshipType === 'neutral'),
            good: relationships.filter(item => item.relationshipType === 'good')
        }),
        [relationships]
    );

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
        setSearch('');
    };

    const handleDrop = async (event, relationshipType) => {
        event.preventDefault();
        const employeeId = event.dataTransfer.getData('text/plain');
        if (!employeeId) {
            return;
        }
        await saveRelationship(employeeId, relationshipType);
    };

    const allowDrop = (event) => {
        event.preventDefault();
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

    const renderEmployeeCard = (relationship) => {
        const employee = employeeById[relationship.employeeId];
        if (!employee) {
            return null;
        }

        return (
            <div
                key={relationship.employeeId}
                className={`relationship-node-card relationship-node-card-${relationship.relationshipType}`}
                draggable
                onDragStart={event => event.dataTransfer.setData('text/plain', relationship.employeeId)}
            >
                <div className="relationship-node-line" />
                <div>
                    <div className="module-item-title">{employee.firstName} {employee.lastName}</div>
                    <div className="module-item-sub">{employee.phoneNumber || 'No phone number'}</div>
                </div>
                <button className="module-secondary-btn compact" onClick={() => removeRelationship(employee.id)}>
                    Remove
                </button>
            </div>
        );
    };

    return (
        <div className="module-page">
            <div className="module-shell leading-hand-shell">
                <div className="module-header">
                    <div>
                        <h2>Leading Hand Relationships</h2>
                        <p>Schema-style relationship mapping for {resolvedLeadingHand.firstName || ''} {resolvedLeadingHand.lastName || ''}.</p>
                    </div>
                    <button className="module-secondary-btn" onClick={onBack}>Back</button>
                </div>

                <div className="module-card leading-hand-graph-card">
                    <div className="leading-hand-toolbar">
                        <div className="module-field">
                            <label>Search ESS Employees</label>
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Find an employee to add to the diagram"
                            />
                        </div>
                        <div className="leading-hand-search-results">
                            {searchResults.map(employee => (
                                <button
                                    key={employee.id}
                                    className="leading-hand-search-chip"
                                    onClick={() => addEmployee(employee.id)}
                                >
                                    {employee.firstName} {employee.lastName}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error ? <div className="module-error">{error}</div> : null}
                    {loading ? (
                        <div className="module-empty-inline">Loading relationships...</div>
                    ) : (
                        <div className="leading-hand-schema-grid">
                            <section
                                className="leading-hand-lane leading-hand-lane-bad"
                                onDragOver={allowDrop}
                                onDrop={event => handleDrop(event, 'bad')}
                            >
                                <div className="leading-hand-lane-header">
                                    <div className="module-card-title">Bad</div>
                                    <div className="module-item-sub">Left side</div>
                                </div>
                                <div className="leading-hand-lane-copy">Employees who clash with this leading hand.</div>
                                <div className="leading-hand-lane-list">
                                    {relationshipsByType.bad.map(renderEmployeeCard)}
                                </div>
                            </section>

                            <section
                                className="leading-hand-center-panel"
                                onDragOver={allowDrop}
                                onDrop={event => handleDrop(event, 'neutral')}
                            >
                                <div className="leading-hand-core-node">
                                    <div className="leading-hand-core-label">Leading Hand</div>
                                    <div className="leading-hand-core-name">{resolvedLeadingHand.firstName || 'Leading Hand'} {resolvedLeadingHand.lastName || ''}</div>
                                    <div className="leading-hand-core-sub">{resolvedLeadingHand.phoneNumber || 'No phone number'}</div>
                                </div>
                                <div className="leading-hand-neutral-list">
                                    {relationshipsByType.neutral.length === 0 ? (
                                        <div className="module-empty-inline">Add an employee, then drag them left or right.</div>
                                    ) : relationshipsByType.neutral.map(renderEmployeeCard)}
                                </div>
                            </section>

                            <section
                                className="leading-hand-lane leading-hand-lane-good"
                                onDragOver={allowDrop}
                                onDrop={event => handleDrop(event, 'good')}
                            >
                                <div className="leading-hand-lane-header">
                                    <div className="module-card-title">Good</div>
                                    <div className="module-item-sub">Right side</div>
                                </div>
                                <div className="leading-hand-lane-copy">Employees who work well with this leading hand.</div>
                                <div className="leading-hand-lane-list">
                                    {relationshipsByType.good.map(renderEmployeeCard)}
                                </div>
                            </section>
                        </div>
                    )}
                    {saving ? <div className="module-item-sub">Saving relationship changes...</div> : null}
                </div>
            </div>
        </div>
    );
}
