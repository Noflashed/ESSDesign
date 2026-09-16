// Derived from ESSApp/src/utils/scaffoldFormDates.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {getSydneyDateTimeParts} from './sydneyTime';

/** Calendar dates are Sydney dates, never timestamps used for record ordering. */
export function scaffoldDateIso(value: string): string {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const display = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|,|$)/);
  if (iso || display) {
    const [year, month, day] = iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [Number(display![3]), Number(display![2]), Number(display![1])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
  }
  // Legacy timestamp values must be converted in Sydney, not the device zone.
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? '' : getSydneyDateTimeParts(date).isoDate;
  }
  return '';
}

export function formatScaffoldDate(value: string): string {
  const iso = scaffoldDateIso(value);
  if (!iso) { return value; }
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function handoverDateWithCalendarDate(value: string, calendarDate: string, dateManuallySet = false): string {
  const iso = scaffoldDateIso(calendarDate);
  if (!iso) {
    throw new Error('Select a valid date before saving.');
  }
  const [year, month, day] = iso.split('-');
  const time = dateManuallySet
    ? '7:00 am'
    : value.match(/(?:\s|,)(\d{1,2}:\d{2}\s*[ap]m)\s*$/i)?.[1]
      ?? getSydneyDateTimeParts().displayTime;
  return `${day}/${month}/${year} ${time}`;
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
