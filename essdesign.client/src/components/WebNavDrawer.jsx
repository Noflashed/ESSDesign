import React, { useState } from 'react';

const MENU_ITEMS = [
    { key: 'design', label: 'ESS Design' },
    { key: 'site-information', label: 'Site Registry' },
    { key: 'safety', label: 'ESS Safety' },
    { key: 'material-ordering', label: 'ESS Material Ordering', children: [
        { key: 'material-ordering-new', label: 'New Material Order' },
        { key: 'material-ordering-active', label: 'Scheduled Orders' },
        { key: 'material-ordering-archived', label: 'Archived Orders' }
    ]},
    { key: 'rostering', label: 'ESS Rostering' },
    { key: 'employees', label: 'Employees' }
];

const HamburgerIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 7H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4 12H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
);

export default function WebNavDrawer({
    open,
    currentPage,
    onToggle,
    onClose,
    onSelect,
    items = MENU_ITEMS
}) {
    const [expandedKeys, setExpandedKeys] = useState(() => ({ 'material-ordering': false }));

    const toggleGroup = (key) => {
        setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const isActive = (itemKey) => {
        if (itemKey === 'safety') {
            return currentPage === 'safety' || currentPage === 'safety-scaff-tags' || currentPage === 'safety-swms';
        }
        if (itemKey === 'rostering') {
            return currentPage === 'rostering' || currentPage === 'rostering-tree';
        }
        if (itemKey === 'material-ordering') {
            return currentPage === 'material-ordering-new' || currentPage === 'material-ordering-active' || currentPage === 'material-ordering-archived';
        }
        return currentPage === itemKey;
    };

    return (
        <>
            <button
                className="icon-action-button"
                onClick={onToggle}
                title="Open navigation"
                aria-label="Open navigation"
                aria-expanded={open}
            >
                <HamburgerIcon size={18} />
            </button>
            {open && <div className="nav-drawer-backdrop" onClick={onClose} />}
            <aside className={`nav-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
                <div className="nav-drawer-header">
                    <div className="nav-drawer-title">Navigation</div>
                    <button className="nav-drawer-close" onClick={onClose} aria-label="Close navigation">×</button>
                </div>
                <div className="nav-drawer-list">
                    {items.map(item => {
                        const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                        const expanded = expandedKeys[item.key];
                        return (
                            <div key={item.key} className="nav-drawer-group">
                                <button
                                    className={`nav-drawer-item ${hasChildren ? 'nav-drawer-item-expandable' : ''} ${isActive(item.key) ? 'active' : ''}`}
                                    onClick={() => hasChildren ? toggleGroup(item.key) : onSelect(item.key)}
                                >
                                    <span className="nav-drawer-item-label">{item.label}</span>
                                    {hasChildren ? (
                                        <span className={`nav-drawer-caret ${expanded ? 'open' : ''}`}>▾</span>
                                    ) : null}
                                </button>
                                {hasChildren && expanded ? (
                                    <div className="nav-drawer-sublist">
                                        {item.children.map((child) => (
                                            <button
                                                key={child.key}
                                                className={`nav-drawer-subitem ${currentPage === child.key ? 'active' : ''}`}
                                                onClick={() => onSelect(child.key)}
                                            >
                                                {child.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </aside>
        </>
    );
}
