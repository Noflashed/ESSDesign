// Derived from ESSApp/src/utils/inspectionReportTitle.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export function inspectionReportTitle(value: string, includeDate = true): string {
  const date = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!date) return 'Inspection Report';
  return `${months[Number(date[2]) - 1] || ''} ${includeDate ? `${date[1]}/${date[2]}/${date[3]} ` : ''}Inspection Report`.trim();
}
