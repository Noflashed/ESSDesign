import React from 'react';

const MENU_ITEMS = [
    { key: 'design', label: 'ESS Design' },
    { key: 'site-information', label: 'Site Registry' },
    { key: 'safety', label: 'ESS Safety' },
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
    const isActive = (itemKey) => {
        if (itemKey === 'safety') {
            return currentPage === 'safety' || currentPage === 'safety-scaff-tags' || currentPage === 'safety-swms';
        }
        if (itemKey === 'rostering') {
            return currentPage === 'rostering' || currentPage === 'rostering-tree';
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
                    {items.map(item => (
                        <button
                            key={item.key}
                            className={`nav-drawer-item ${isActive(item.key) ? 'active' : ''}`}
                            onClick={() => onSelect(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </aside>
        </>
    );
}
