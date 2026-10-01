export function canAccessEssMarkup(user) {
    return user?.role === 'admin';
}
export function resolveMarkupPage(page, user) {
    return page === 'ess-markup' && !canAccessEssMarkup(user) ? 'landing' : page;
}
export function designNavigationFor(user) {
    return {
        key: 'design', label: 'ESS Design',
        children: [
            { key: 'drawing-register', label: 'Drawing Register' },
            ...(canAccessEssMarkup(user) ? [{ key: 'ess-markup', label: 'ESS Markup' }] : []),
        ],
    };
}
