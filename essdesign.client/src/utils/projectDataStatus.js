// completedAt is the existing persisted sharing marker, retained for older clients.
export const isFormShared = form => Boolean(form?.completedAt);
export const getFormSharingStatus = form => isFormShared(form) ? 'Form Shared' : 'Not Shared';
export const getProjectDataStatus = form => form.isDeleted ? 'Deleted' : form.scaffoldStatus || getFormSharingStatus(form);
