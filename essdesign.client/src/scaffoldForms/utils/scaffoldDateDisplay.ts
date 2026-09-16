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

/** Due one calendar month after the latest recorded inspection, or erection if none. */
export function nextScaffoldInspectionDueDate(initialDate: string, records: Array<{date?: string}> = []): string {
  let latestDate = '';
  let latestDay = -Infinity;
  for (const row of records) {
    const date = row.date?.trim() || '';
    // Reuse the calendar validation so malformed legacy dates cannot extend the timer.
    if (!scaffoldInspectionDueDate(date, 0)) { continue; }
    const [day, month, year] = formatScaffoldDate(date).split('/').map(Number);
    const calendarDay = Date.UTC(year, month - 1, day);
    if (calendarDay > latestDay) {
      latestDay = calendarDay;
      latestDate = date;
    }
  }
  return scaffoldInspectionDueDate(latestDate || initialDate, 0);
}

/** Compare Sydney calendar days so daylight saving cannot change the day count. */
export function scaffoldInspectionCountdown(dueDate: string, nowMs = Date.now()): {label: string; overdue: boolean} | null {
  const parts = formatScaffoldDate(dueDate).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts) { return null; }
  const today = new Intl.DateTimeFormat('en-AU', {timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(nowMs));
  const part = (type: string) => Number(today.find(value => value.type === type)?.value);
  const dueDay = Date.UTC(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]));
  const todayDay = Date.UTC(part('year'), part('month') - 1, part('day'));
  const days = Math.round((dueDay - todayDay) / 86400000);
  if (!Number.isFinite(days)) { return null; }
  const count = Math.abs(days);
  const duration = `${count} ${count === 1 ? 'day' : 'days'}`;
  return {label: days < 0 ? `Inspection overdue by ${duration}` : days === 0 ? 'Inspection due today' : `Inspection in ${duration}`, overdue: days < 0};
}
