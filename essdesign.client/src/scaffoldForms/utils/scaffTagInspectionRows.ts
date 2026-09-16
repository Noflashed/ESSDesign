import type {InspectionRecordEntry, SignatureStroke} from '../services/supabaseScaffTags';

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


/** Copy only this inspector's signature, keeping each inspection independently editable. */
export function previousInspectionSignature(
  records: InspectionRecordEntry[],
  person: string,
  initialInspector = '',
  initialSignature: SignatureStroke[] = [],
): SignatureStroke[] {
  const name = person.trim().toLowerCase();
  if (!name) { return []; }
  const previous = [...records].reverse().find(row =>
    row.competentPerson.trim().toLowerCase() === name && row.signatureStrokes?.some(stroke => stroke.length > 0),
  );
  const strokes = previous?.signatureStrokes
    ?? (initialInspector.trim().toLowerCase() === name ? initialSignature : []);
  return strokes.map(stroke => stroke.map(point => ({...point})));
}


export function removeInspectionRow(records: InspectionRecordEntry[], index: number): InspectionRecordEntry[] {
  if (index < 0 || index >= records.length) { return records; }
  const remaining = records.filter((_row, rowIndex) => rowIndex !== index);
  while (remaining.length > 10) {
    const last = remaining[remaining.length - 1];
    if (last.date || last.time || last.competentPerson || last.note || last.inspectedAt || last.signatureStrokes?.some(stroke => stroke.length)) { break; }
    remaining.pop();
  }
  return inspectionTableRows(remaining);
}
