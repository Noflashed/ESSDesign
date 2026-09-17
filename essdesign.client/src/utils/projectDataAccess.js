const REGISTER_PAGES = new Set([
    'safety-handover-register',
    'safety-day-labour-register',
    'safety-pre-start-register',
    'safety-scaff-tag-register',
    'safety-qr-code-register',
    'safety-scaff-tags',
    'safety-swms',
]);

export function resolveProjectDataPage(page, role) {
    return role !== 'admin' && REGISTER_PAGES.has(page) ? 'safety' : page;
}

export function projectDataNavForRole(items, role) {
    return items.map(item => item.key === 'safety' && role !== 'admin'
        ? { ...item, children: [] }
        : item);
}
