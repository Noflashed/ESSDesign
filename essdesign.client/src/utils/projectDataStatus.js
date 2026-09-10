export const getProjectDataStatus = form => form.isDeleted ? 'Deleted' : form.completedAt ? 'Completed' : 'Active';
