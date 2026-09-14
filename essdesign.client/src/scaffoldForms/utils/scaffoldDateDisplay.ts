/** Display calendar dates without changing their stored value or timezone. */
export function formatScaffoldDate(value: string): string {
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : text;
}

/** Each row stays anchored to the initial date; shorter months use their last day. */
export function scaffoldInspectionDueDate(initialDate: string, rowIndex: number): string {
  const parts = formatScaffoldDate(initialDate).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts || !Number.isInteger(rowIndex) || rowIndex < 0) { return ''; }
  const [, dayText, monthText, yearText] = parts;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const initial = new Date(Date.UTC(year, month, day));
  if (initial.getUTCFullYear() !== year || initial.getUTCMonth() !== month || initial.getUTCDate() !== day) { return ''; }
  const target = new Date(Date.UTC(year, month + rowIndex + 1, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${String(Math.min(day, lastDay)).padStart(2, '0')}/${String(target.getUTCMonth() + 1).padStart(2, '0')}/${target.getUTCFullYear()}`;
}
