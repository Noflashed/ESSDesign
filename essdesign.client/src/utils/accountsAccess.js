// Keep sidebar navigation and all route entry points on the same Accounts scope.
export const ACCOUNTS_NAV_ITEMS = [
    { key: 'scaffold-dashboard', label: 'Scaffold Dashboard' },
    { key: 'site-information', label: 'Site Registry' },
    { key: 'safety', label: 'Project data', children: [
        { key: 'safety-handover-register', label: 'Handover Register' },
        { key: 'safety-day-labour-register', label: 'Day Labour Register' },
        { key: 'safety-scaff-tag-register', label: 'Scaff-Tag Register' },
        { key: 'safety-qr-code-register', label: 'QR Code Register' },
    ] },
    { key: 'design', label: 'ESS Design', children: [{ key: 'drawing-register', label: 'Drawing Register' }] },
    { key: 'ess-ai', label: 'ESS AI' },
];

const ACCOUNTS_ALLOWED_PAGES = new Set([
    ...ACCOUNTS_NAV_ITEMS.flatMap(item => [item.key, ...(item.children || []).map(child => child.key)]),
    'landing', 'profile', 'settings', 'safety-scaff-tags', 'safety-swms',
]);

export function resolveAccountsPage(page) {
    return ACCOUNTS_ALLOWED_PAGES.has(page) ? page : 'scaffold-dashboard';
}
