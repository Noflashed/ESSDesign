export const ALL_SCOPE = '__all__';
export const ALL_BUILDERS = {id: ALL_SCOPE, name: 'All Builders', isAll: true};
export const ALL_PROJECTS = {id: ALL_SCOPE, name: 'All Projects', isAll: true};

export function projectScopeOptions(builders, builderId) {
    const selected = builderId === ALL_SCOPE ? builders : builders.filter(builder => builder.id === builderId);
    return [ALL_PROJECTS, ...selected.flatMap(builder => (builder.projects || []).map(project => ({
        ...project,
        id: builderId === ALL_SCOPE ? JSON.stringify([builder.id, project.id]) : project.id,
        projectId: project.id,
        builderId: builder.id,
        name: builderId === ALL_SCOPE ? `${project.name} — ${builder.name}` : project.name,
    })))];
}

export function resolveProjectScope(builders, selection = {}) {
    const builderId = selection.builderId === ALL_SCOPE || builders.some(builder => builder.id === selection.builderId)
        ? selection.builderId : builders[0]?.id || ALL_SCOPE;
    const options = projectScopeOptions(builders, builderId);
    const projectId = options.some(project => project.id === selection.projectId)
        ? selection.projectId : builderId === ALL_SCOPE ? ALL_SCOPE : options[1]?.id || ALL_SCOPE;
    return {builderId, projectId};
}

export function matchesProjectScope(row, builderId, selectedProject) {
    return (builderId === ALL_SCOPE || row.builderId === builderId)
        && Boolean(selectedProject)
        && (selectedProject.isAll || (row.builderId === selectedProject.builderId && row.projectId === selectedProject.projectId));
}
