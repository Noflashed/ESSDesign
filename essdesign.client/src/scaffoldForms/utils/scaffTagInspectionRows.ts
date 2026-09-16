import type {InspectionRecordEntry} from '../services/supabaseScaffTags';

export function inspectionTableRows(records: InspectionRecordEntry[]): InspectionRecordEntry[] {
  const required = Math.max(10, records.length + (records.length > 0 && records[records.length - 1].date.trim() ? 1 : 0));
  if (records.length >= required) { return records; }
  return [...records, ...Array.from({length: required - records.length}, () => ({
    date: '', time: '', competentPerson: '', note: '', inspectedAt: '',
    timeZone: 'Australia/Sydney', signatureStrokes: [],
  }))];
}

export function complianceTableRows(records: InspectionRecordEntry[]): InspectionRecordEntry[] {
  let used = 0;
  records.forEach((row, index) => {
    if (row.date || row.note || row.competentPerson || row.time || row.signatureStrokes?.length) { used = index + 1; }
  });
  return records.slice(0, Math.max(8, used + 1));
}
