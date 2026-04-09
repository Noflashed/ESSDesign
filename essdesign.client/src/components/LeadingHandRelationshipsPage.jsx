import React, { useEffect, useMemo, useState } from 'react';
import { rosteringAPI } from '../services/api';

function EmployeeNode({ employee, tone = 'neutral', draggable = false, onDragStart, onRemove }) {
    return (
        <div
            className={`lh-schema-node lh-schema-node-${tone}`}
            draggable={draggable}
            onDragStart={onDragStart}
        >
            <div className="lh-schema-node-row"><span className="lh-schema-key">id</span><span className="lh-schema-value">{employee.id?.slice(0, 8)}</span></div>
            <div className="lh-schema-node-row"><span className="lh-schema-key">name</span><span className="lh-schema-value">"{employee.firstName} {employee.lastName}"</span></div>
            <div className="lh-schema-node-row"><span className="lh-schema-key">phone</span><span className="lh-schema-value">"{employee.phoneNumber || 'N/A'}"</span></div>
            {onRemove ? (
                <button className="lh-schema-remove" onClick={() => onRemove(employee.id)}>×</button>
            ) : null}
        </div>
    );
}

export default function LeadingHandRelationshipsPage({ leadingHand, onBack }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [allEmployees, setAllEmployees] = useState([]);
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

    const relationshipGroups = useMemo(() => {
        const mapRelationship = (relationshipType) =>
            relationships
                .filter(item => item.relationshipType === relationshipType)
                .map(item => employeeById[item.employeeId])
                .filter(Boolean);

        return {
            bad: mapRelationship('bad'),
            neutral: mapRelationship('neutral'),
            good: mapRelationship('good')
        };
    }, [employeeById, relationships]);

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

    const renderNode = (employee, tone, relationType) => (
        <div key={employee.id} className={`lh-schema-node-wrap lh-schema-node-wrap-${tone}`}>
            <div className={`lh-schema-connector lh-schema-connector-${tone}`} />
            <EmployeeNode
                employee={employee}
                tone={tone}
                draggable
                onDragStart={event => event.dataTransfer.setData('text/plain', employee.id)}
                onRemove={() => removeRelationship(employee.id)}
            />
            {relationType ? <div className={`lh-schema-tag lh-schema-tag-${tone}`}>{relationType}</div> : null}
        </div>
    );

    return (
        <div className="module-page lh-schema-page">
            <div className="module-shell lh-schema-shell">
                <div className="module-header lh-schema-header">
                    <div>
                        <h2>Leading Hand Relationships</h2>
                        <p>Schema map for {resolvedLeadingHand.firstName || ''} {resolvedLeadingHand.lastName || ''}</p>
                    </div>
                    <button className="module-secondary-btn" onClick={onBack}>Back</button>
                </div>

                <div className="lh-schema-toolbar">
                    <div className="module-field lh-schema-search-field">
                        <label>Search ESS Employees</label>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search and add to the schema"
                        />
                    </div>
                    <div className="lh-schema-search-results">
                        {searchResults.map(employee => (
                            <button
                                key={employee.id}
                                className="lh-schema-search-chip"
                                onClick={() => addEmployee(employee.id)}
                            >
                                {employee.firstName} {employee.lastName}
                            </button>
                        ))}
                    </div>
                </div>

                {error ? <div className="module-error">{error}</div> : null}

                <div className="lh-schema-canvas">
                    <div className="lh-schema-dot-grid" />
                    {loading ? (
                        <div className="module-empty-inline">Loading relationships...</div>
                    ) : (
                        <div className="lh-schema-board">
                            <div
                                className="lh-schema-column lh-schema-column-left"
                                onDragOver={allowDrop}
                                onDrop={event => handleDrop(event, 'bad')}
                            >
                                {relationshipGroups.bad.map(employee => renderNode(employee, 'bad', 'Bad'))}
                            </div>

                            <div className="lh-schema-center">
                                <div
                                    className="lh-schema-core-card"
                                    onDragOver={allowDrop}
                                    onDrop={event => handleDrop(event, 'neutral')}
                                >
                                    <div className="lh-schema-core-line"><span className="lh-schema-key">id</span><span className="lh-schema-value">{resolvedLeadingHand.id?.slice(0, 8)}</span></div>
                                    <div className="lh-schema-core-line"><span className="lh-schema-key">name</span><span className="lh-schema-value">"{resolvedLeadingHand.firstName || ''} {resolvedLeadingHand.lastName || ''}"</span></div>
                                    <div className="lh-schema-core-line"><span className="lh-schema-key">phone</span><span className="lh-schema-value">"{resolvedLeadingHand.phoneNumber || 'N/A'}"</span></div>
                                    <div className="lh-schema-core-line"><span className="lh-schema-key">leading_hand</span><span className="lh-schema-value">true</span></div>
                                    <div className="lh-schema-core-line"><span className="lh-schema-key">good_relationships</span><span className="lh-schema-value">[{relationshipGroups.good.length}]</span></div>
                                    <div className="lh-schema-core-line"><span className="lh-schema-key">bad_relationships</span><span className="lh-schema-value">[{relationshipGroups.bad.length}]</span></div>
                                    <div className="lh-schema-core-line"><span className="lh-schema-key">staging</span><span className="lh-schema-value">[{relationshipGroups.neutral.length}]</span></div>
                                </div>

                                <div className="lh-schema-neutral-strip" onDragOver={allowDrop} onDrop={event => handleDrop(event, 'neutral')}>
                                    {relationshipGroups.neutral.length === 0 ? (
                                        <div className="lh-schema-neutral-empty">Add an employee, then drag them left or right.</div>
                                    ) : relationshipGroups.neutral.map(employee => renderNode(employee, 'neutral', null))}
                                </div>
                            </div>

                            <div
                                className="lh-schema-column lh-schema-column-right"
                                onDragOver={allowDrop}
                                onDrop={event => handleDrop(event, 'good')}
                            >
                                {relationshipGroups.good.map(employee => renderNode(employee, 'good', 'Good'))}
                            </div>
                        </div>
                    )}
                    {saving ? <div className="lh-schema-saving">Saving relationship changes...</div> : null}
                </div>
            </div>
        </div>
    );
}
