// Dismantling retires linked tags in the database. Inspection dates do not
// determine whether the scaffold is still active.
export const getScaffTagStatus = form => {
    if (form.isDeleted) return 'Deleted';
    return form.status === 'retired' || form.retiredAt
        || form.status === 'dismantled' || form.dismantledAt
        ? 'Expired'
        : 'Active';
};
